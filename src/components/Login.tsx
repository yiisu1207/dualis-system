import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithEmailAndPassword, signInWithCustomToken, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Mail, Lock, Loader2, Building2, Eye, EyeOff, Fingerprint,
  ArrowRight, Zap, BarChart3, Shield, Users, X, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubdomain } from '../context/SubdomainContext';
import ModeToggle from './ModeToggle';

const FEATURES = [
  { icon: Zap,        label: 'POS en tiempo real',     desc: 'Factura en segundos, sin cortes' },
  { icon: BarChart3,  label: 'Dashboard inteligente',  desc: 'KPIs, flujo de caja y métricas en vivo' },
  { icon: Shield,     label: 'Multi-tenant seguro',    desc: 'Datos aislados y cifrados por empresa' },
  { icon: Users,      label: 'Roles granulares',       desc: 'Owner, Admin, Ventas, Auditor y más' },
];

const RATE_KEY  = 'login_rate_limit_v1';
const MAX_ATT   = 5;
const WIN_MS    = 10 * 60 * 1000;
const LOCK_MS   = 10 * 60 * 1000;

const sanitize  = (v: string) => v.replace(/[<>]/g, '').trim();
const readRL    = () => { try { const r = localStorage.getItem(RATE_KEY); return r ? JSON.parse(r) as { count: number; firstAttempt: number; lockedUntil?: number } : null; } catch { return null; } };
const writeRL   = (v: object) => localStorage.setItem(RATE_KEY, JSON.stringify(v));

export default function Login() {
  const [email,     setEmail]     = useState('');
  const [pass,      setPass]      = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [pkLoading, setPkLoading] = useState(false);
  const [error,     setError]     = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [rstLoad,   setRstLoad]   = useState(false);
  const [picker,    setPicker]    = useState(false);
  const [captcha,   setCaptcha]   = useState<string | null>(null);
  const [recents,   setRecents]   = useState<Array<{ email: string; lastUsed: string }>>(() => {
    try { const r = localStorage.getItem('erp_login_users'); return r ? JSON.parse(r) : []; } catch { return []; }
  });

  const nav                     = useNavigate();
  const { user, loading: aLoad } = useAuth();
  const subdomain                = useSubdomain();
  const captchaKey              = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

  const isSubdomain = !!(subdomain.slug && subdomain.businessId);

  React.useEffect(() => { if (user && !aLoad) nav('/'); }, [user, aLoad, nav]);

  /* ── MAIN LOGIN ─────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');

    if (captchaKey && !captcha) { setError('Completa el captcha.'); setLoading(false); return; }

    const now = Date.now(), rl = readRL();
    if (rl?.lockedUntil && now < rl.lockedUntil) {
      setError(`Demasiados intentos. Intenta en ${Math.ceil((rl.lockedUntil - now) / 60000)} min.`);
      setLoading(false); return;
    }

    const safeEmail = sanitize(email);
    try {
      const cred    = await signInWithEmailAndPassword(auth, safeEmail, pass);
      let   userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (!userDoc.exists()) { await new Promise(r => setTimeout(r, 1000)); userDoc = await getDoc(doc(db, 'users', cred.user.uid)); }
      if (!userDoc.exists()) { setError('Tu perfil está siendo procesado. Si persiste, contacta soporte.'); setLoading(false); return; }

      const ud  = userDoc.data();
      const bid = ud.businessId || ud.empresa_id;

      // If on a subdomain, validate user belongs to this business
      if (isSubdomain && subdomain.businessId && bid && bid !== subdomain.businessId) {
        await auth.signOut();
        setError('Esta cuenta no pertenece a esta empresa. Verifica tu URL o correo.');
        setLoading(false); return;
      }

      const next = [{ email: safeEmail.toLowerCase(), lastUsed: new Date().toISOString() }, ...recents.filter(u => u.email.toLowerCase() !== safeEmail.toLowerCase())].slice(0, 8);
      setRecents(next);
      localStorage.setItem('erp_login_users', JSON.stringify(next));
      localStorage.removeItem(RATE_KEY);
      setCaptcha(null);

      if (ud.status === 'PENDING_APPROVAL' && bid) {
        nav(`/${bid}/pending`, { replace: true });
      } else if ((ud.status || 'ACTIVE') === 'ACTIVE' && bid) {
        nav(`/${bid}/admin/dashboard`, { replace: true });
      } else {
        nav('/onboarding', { replace: true });
      }
      setLoading(false);
    } catch (err: any) {
      const nw    = rl && now - rl.firstAttempt <= WIN_MS ? rl : { count: 0, firstAttempt: now };
      const nc    = nw.count + 1;
      const lock  = nc >= MAX_ATT;
      writeRL({ count: nc, firstAttempt: nw.firstAttempt, lockedUntil: lock ? now + LOCK_MS : undefined });
      setError(lock ? 'Demasiados intentos. Intenta en 10 min.' : 'Correo o contraseña incorrectos.');
      setLoading(false);
    }
  };

  /* ── PASSKEY ─────────────────────────────────────────── */
  const handlePasskey = async () => {
    try {
      setPkLoading(true); setError('');
      const or  = await fetch('/api/passkey-auth-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!or.ok) throw new Error('No se pudieron crear opciones de acceso.');
      const { options, challengeId } = await or.json();
      const ar  = await startAuthentication(options);
      const vr  = await fetch('/api/passkey-auth-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assertionResponse: ar, challengeId }) });
      if (!vr.ok) throw new Error('No se pudo verificar la llave.');
      await signInWithCustomToken(auth, (await vr.json()).token);
    } catch { setError('No se pudo iniciar sesión con Passkey.'); }
    finally   { setPkLoading(false); }
  };

  /* ── PASSWORD RESET ──────────────────────────────────── */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const se = sanitize(email);
    if (!se) { setError('Ingresa tu correo primero.'); return; }
    setRstLoad(true); setError('');
    try { await sendPasswordResetEmail(auth, se); setResetSent(true); }
    catch { setError('No se pudo enviar el correo. Verifica la dirección.'); }
    finally { setRstLoad(false); }
  };

  /* ── SHARED INPUT CLASS ──────────────────────────────── */
  const inp = 'w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-900/[0.06] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40 text-sm font-medium transition-all';

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex bg-[#07091a]">

      {/* ── LEFT BRAND PANEL ────────────────────────────── */}
      <div className="hidden lg:flex w-[52%] flex-col justify-between relative overflow-hidden p-16">

        {/* Atmospheric blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%]  w-[70%] h-[70%] rounded-full bg-indigo-600/25  blur-[120px]" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-violet-600/20  blur-[100px]" />
          <div className="absolute top-[38%] left-[28%]    w-[40%] h-[40%] rounded-full bg-blue-600/12    blur-[80px]" />
        </div>

        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Floating dots */}
        <div className="absolute top-[23%] right-[14%] w-3 h-3 rounded-full bg-indigo-400/50  animate-pulse" />
        <div className="absolute top-[58%] left-[6%]   w-2 h-2 rounded-full bg-violet-400/50  animate-pulse [animation-delay:1s]" />
        <div className="absolute bottom-[30%] right-[26%] w-4 h-4 rounded-full bg-blue-400/30 animate-pulse [animation-delay:0.5s]" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="Dualis" className="h-11 w-auto drop-shadow-lg" />
          <div>
            <p className="text-white font-black text-xl tracking-tight">Dualis ERP</p>
            <p className="text-white/25 text-[9px] font-bold uppercase tracking-widest">Sistema Empresarial</p>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-10">
          <div>
            <h2 className="text-[3.5rem] font-black text-white leading-[1.05] tracking-tight">
              Tu empresa.<br />
              Tu ritmo.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-blue-400">
                Tu control.
              </span>
            </h2>
            <p className="text-white/35 mt-5 text-sm leading-relaxed max-w-xs">
              ERP diseñado para PYMEs latinoamericanas. Ventas, inventario, CxC, nómina y más en un solo lugar.
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                  <Icon size={17} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{label}</p>
                  <p className="text-white/35 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-10">
          {[['500+', 'Empresas'], ['99.9%', 'Uptime'], ['4.9★', 'Calificación']].map(([v, l]) => (
            <div key={l}>
              <p className="text-white font-black text-2xl">{v}</p>
              <p className="text-white/25 text-[9px] uppercase tracking-widest font-bold">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 relative">
        <div className="absolute inset-0 lg:hidden pointer-events-none">
          <div className="absolute -top-[15%] -right-[15%] w-[65%] h-[65%] rounded-full bg-indigo-600/10 blur-[80px]" />
        </div>

        {/* Top controls */}
        <div className="absolute top-5 right-5 z-10"><ModeToggle /></div>
        <button onClick={() => nav('/')} className="absolute top-5 left-5 z-10 flex items-center gap-1.5 text-white/25 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-colors">
          <ArrowLeft size={13} /> Inicio
        </button>

        <div className="relative z-10 w-full max-w-[390px]">

          {/* ── RESET SENT ── */}
          {resetSent ? (
            <div className="text-center space-y-6 animate-in fade-in-0 duration-500">
              <div className="h-20 w-20 mx-auto rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">¡Correo enviado!</h2>
                <p className="text-white/35 text-sm mt-2">Revisa <span className="text-white/70 font-bold">{email}</span> y sigue las instrucciones.</p>
              </div>
              <button onClick={() => { setResetMode(false); setResetSent(false); setError(''); }} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest">
                Volver al inicio de sesión
              </button>
            </div>

          /* ── RESET FORM ── */
          ) : resetMode ? (
            <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-400">
              <button onClick={() => { setResetMode(false); setError(''); }} className="flex items-center gap-2 text-white/25 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-colors">
                <ArrowRight size={12} className="rotate-180" /> Volver
              </button>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Recuperar acceso</h1>
                <p className="text-white/35 text-sm mt-2">Te enviaremos un enlace de recuperación.</p>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="relative">
                  <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                  <input type="email" required placeholder="tu@correo.com" value={email} onChange={e => setEmail(sanitize(e.target.value))} className={inp} />
                </div>
                {error && <p className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">⚠ {error}</p>}
                <button type="submit" disabled={rstLoad} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                  {rstLoad ? <Loader2 size={16} className="animate-spin" /> : 'Enviar enlace de recuperación'}
                </button>
              </form>
            </div>

          /* ── MAIN LOGIN ── */
          ) : (
            <div className="animate-in fade-in-0 duration-500">
              {/* Mobile logo */}
              <div className="lg:hidden flex items-center gap-3 mb-8">
                <img src="/logo.png" alt="Dualis" className="h-9 w-auto" />
                <span className="text-white font-black text-lg">Dualis ERP</span>
              </div>

              <div className="mb-9">
                <h1 className="text-4xl font-black text-white tracking-tight leading-tight">
                  {isSubdomain ? <>Bienvenido a<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">{subdomain.businessName}</span></> : <>Bienvenido<br />de vuelta</>}
                </h1>
                <p className="text-white/35 text-sm mt-2">{isSubdomain ? 'Ingresa con tu cuenta para acceder.' : 'Ingresa a tu panel de control empresarial.'}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Subdomain badge — when accessed via custom URL */}
                {isSubdomain && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <Building2 size={16} className="text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-white">{subdomain.businessName}</p>
                      <p className="text-[9px] text-white/30 font-bold">{subdomain.slug}.dualis.app</p>
                    </div>
                  </div>
                )}

                {/* Email */}
                <div>
                  <div className="flex items-center justify-between ml-1 mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30">Correo</label>
                    {recents.length > 0 && (
                      <button type="button" onClick={() => setPicker(true)} className="text-[9px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">
                        Recientes ▾
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                    <input
                      type="email" required placeholder="tu@empresa.com"
                      value={email} onChange={e => setEmail(sanitize(e.target.value))}
                      className={inp}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between ml-1 mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30">Contraseña</label>
                    <button type="button" onClick={() => { setResetMode(true); setError(''); }} className="text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-indigo-400 transition-colors">
                      ¿Olvidaste tu clave?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                    <input
                      type={showPass ? 'text' : 'password'} required placeholder="••••••••"
                      value={pass} onChange={e => setPass(e.target.value)}
                      className={`${inp} pr-12`}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium px-4 py-3 rounded-xl">
                    <span>⚠</span> {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <>Entrar al sistema <ArrowRight size={15} /></>}
                </button>

                {/* Captcha */}
                {captchaKey ? (
                  <div className="flex justify-center">
                    <ReCAPTCHA sitekey={captchaKey} onChange={v => setCaptcha(v)} theme="dark" />
                  </div>
                ) : (
                  <p className="text-center text-[9px] font-mono text-white/10 uppercase tracking-widest">MODO_DEV · CAPTCHA_BYPASS</p>
                )}

                {/* Passkey */}
                <button
                  type="button" onClick={handlePasskey} disabled={pkLoading}
                  className="w-full py-3.5 bg-white dark:bg-slate-900/[0.04] border border-white/[0.08] text-white/45 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white dark:hover:bg-slate-800 dark:bg-slate-900/[0.08] hover:text-white/70 flex items-center justify-center gap-2 transition-all"
                >
                  <Fingerprint size={14} className="text-indigo-400" />
                  {pkLoading ? 'Validando...' : 'Usar Passkey'}
                </button>
              </form>

              {/* Register link — hidden on subdomain (invite-only) */}
              {!isSubdomain && (
              <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
                <p className="text-xs text-white/25">
                  ¿Nuevo en Dualis?{' '}
                  <button onClick={() => nav('/register')} className="font-black text-indigo-400 hover:text-indigo-300 transition-colors">
                    Crear cuenta gratis
                  </button>
                </p>
              </div>
              )}
              {isSubdomain && (
              <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
                <p className="text-[10px] text-white/20">
                  ¿No tienes cuenta? Contacta al administrador de tu empresa para recibir una invitaci&oacute;n.
                </p>
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RECENTS MODAL ──────────────────────────────── */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-[#0f1729] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Usuarios guardados</h3>
              <button onClick={() => setPicker(false)} className="text-white/30 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
              {recents.length === 0 ? (
                <div className="px-6 py-10 text-xs font-bold text-white/20 text-center uppercase tracking-widest">Sin usuarios recientes</div>
              ) : recents.map(u => (
                <div key={u.email} className="flex items-center gap-3 px-6 py-4 hover:bg-white dark:hover:bg-slate-800 dark:bg-slate-900/[0.04] transition-colors">
                  <button type="button" onClick={() => { setEmail(u.email); setPicker(false); }} className="flex-1 text-left">
                    <div className="text-sm font-bold text-white">{u.email}</div>
                    <div className="text-[9px] font-bold text-white/20 mt-0.5">{new Date(u.lastUsed).toLocaleDateString()}</div>
                  </button>
                  <button type="button" onClick={() => { const n = recents.filter(x => x.email !== u.email); setRecents(n); localStorage.setItem('erp_login_users', JSON.stringify(n)); }} className="text-[10px] font-black text-rose-400/60 hover:text-rose-400 transition-colors">✕</button>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06]">
              <button onClick={() => { setRecents([]); localStorage.removeItem('erp_login_users'); setPicker(false); }} className="w-full text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-rose-400 transition-colors">Limpiar todo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
