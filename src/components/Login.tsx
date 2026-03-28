import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithEmailAndPassword, signInWithCustomToken, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Mail, Lock, Loader2, Building2, Eye, EyeOff, Fingerprint,
  ArrowRight, X, CheckCircle2,
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubdomain } from '../context/SubdomainContext';
import ModeToggle from './ModeToggle';

/* ── Floating module pills ────────────────────────────── */
const MODULE_PILLS = [
  { label: 'POS Detal',       x: '8%',  y: '12%', delay: '0s',    dur: '7s'  },
  { label: 'Inventario',      x: '78%', y: '8%',  delay: '1.2s',  dur: '8s'  },
  { label: 'Dashboard BI',    x: '85%', y: '35%', delay: '0.5s',  dur: '9s'  },
  { label: 'CxC Clientes',    x: '5%',  y: '45%', delay: '2s',    dur: '7.5s'},
  { label: 'RRHH',            x: '90%', y: '65%', delay: '1.8s',  dur: '8.5s'},
  { label: 'Contabilidad',    x: '3%',  y: '75%', delay: '0.8s',  dur: '7s'  },
  { label: 'VisionLab IA',    x: '75%', y: '88%', delay: '2.5s',  dur: '9s'  },
  { label: 'Libro Ventas',    x: '15%', y: '90%', delay: '1.5s',  dur: '8s'  },
  { label: 'POS Mayor',       x: '70%', y: '15%', delay: '3s',    dur: '7.5s'},
  { label: 'Auditoría',       x: '12%', y: '30%', delay: '0.3s',  dur: '8.5s'},
  { label: 'Tasas BCV',       x: '82%', y: '50%', delay: '1s',    dur: '7s'  },
  { label: 'Portal Clientes', x: '20%', y: '60%', delay: '2.2s',  dur: '9s'  },
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
  const inp = 'w-full pl-11 pr-4 py-3.5 bg-white/[0.06] border border-white/[0.08] text-white rounded-xl placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/30 text-sm font-medium transition-all backdrop-blur-sm';

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  if (!isSubdomain) {
    return (
      <div className="min-h-screen bg-[#07091a] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <Building2 size={28} className="text-indigo-400" />
          </div>
          <h1 className="text-xl font-black text-white mb-2">Accede desde tu empresa</h1>
          <p className="text-white/35 text-sm mb-6">Ingresa a tu sistema desde el link personalizado de tu empresa:</p>
          <div className="px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-6">
            <p className="text-sm font-mono text-indigo-400">tuempresa.dualis.online</p>
          </div>
          <button onClick={() => nav('/')} className="text-xs font-bold text-white/30 hover:text-white/50 transition-colors">
            &larr; Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050816]">

      {/* ── ANIMATED MESH GRADIENT BACKGROUND ──────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Primary orbs — slow movement via CSS animation */}
        <div className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[150px] bg-indigo-600"
          style={{ top: '-10%', left: '-5%', animation: 'loginOrb1 20s ease-in-out infinite' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[130px] bg-violet-600"
          style={{ bottom: '-15%', right: '-5%', animation: 'loginOrb2 25s ease-in-out infinite' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[120px] bg-blue-600"
          style={{ top: '40%', left: '50%', transform: 'translateX(-50%)', animation: 'loginOrb3 18s ease-in-out infinite' }} />

        {/* Subtle noise texture */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* ── FLOATING MODULE PILLS ──────────────────────── */}
      <div className="absolute inset-0 pointer-events-none hidden lg:block">
        {MODULE_PILLS.map((pill) => (
          <div
            key={pill.label}
            className="absolute px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm"
            style={{
              left: pill.x, top: pill.y,
              animation: `loginFloat ${pill.dur} ease-in-out ${pill.delay} infinite`,
            }}
          >
            <span className="text-[10px] font-bold text-white/25 whitespace-nowrap">{pill.label}</span>
          </div>
        ))}
      </div>

      {/* ── TOP BAR ───────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Dualis" className="h-7 w-auto opacity-40" />
          <span className="text-white/20 text-[9px] font-bold uppercase tracking-[0.25em] hidden sm:inline">Dualis ERP</span>
        </div>
        <ModeToggle />
      </div>

      {/* ── CENTER CARD ───────────────────────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-20">

        {/* Company identity */}
        <div className="flex flex-col items-center mb-8">
          {subdomain.logoUrl ? (
            <img src={subdomain.logoUrl} alt={subdomain.businessName || ''} className="h-16 w-auto rounded-2xl mb-4 shadow-2xl shadow-black/30" />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4 shadow-2xl shadow-indigo-500/30">
              <Building2 size={28} className="text-white" />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight text-center">
            {subdomain.businessName}
          </h1>
          <p className="text-white/20 text-xs font-bold mt-1 font-mono">{subdomain.slug}.dualis.online</p>
        </div>

        {/* Glass card */}
        <div className="w-full max-w-[420px] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/20">

          {/* ── RESET SENT ── */}
          {resetSent ? (
            <div className="text-center space-y-6 animate-in fade-in-0 duration-500">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={30} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Correo enviado</h2>
                <p className="text-white/35 text-sm mt-2">Revisa <span className="text-white/70 font-bold">{email}</span> y sigue las instrucciones.</p>
              </div>
              <button onClick={() => { setResetMode(false); setResetSent(false); setError(''); }} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest">
                Volver
              </button>
            </div>

          /* ── RESET FORM ── */
          ) : resetMode ? (
            <div className="space-y-5 animate-in fade-in-0 duration-400">
              <button onClick={() => { setResetMode(false); setError(''); }} className="flex items-center gap-2 text-white/25 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-colors">
                <ArrowRight size={12} className="rotate-180" /> Volver
              </button>
              <div>
                <h2 className="text-xl font-black text-white tracking-tight">Recuperar acceso</h2>
                <p className="text-white/30 text-sm mt-1">Te enviaremos un enlace de recuperación.</p>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="relative">
                  <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                  <input type="email" required placeholder="tu@correo.com" value={email} onChange={e => setEmail(sanitize(e.target.value))} className={inp} />
                </div>
                {error && <p className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">{error}</p>}
                <button type="submit" disabled={rstLoad} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                  {rstLoad ? <Loader2 size={16} className="animate-spin" /> : 'Enviar enlace'}
                </button>
              </form>
            </div>

          /* ── MAIN LOGIN ── */
          ) : (
            <div className="animate-in fade-in-0 duration-500">
              <div className="mb-7">
                <h2 className="text-xl font-black text-white tracking-tight">Iniciar sesión</h2>
                <p className="text-white/25 text-sm mt-1">Ingresa tus credenciales para acceder.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email */}
                <div>
                  <div className="flex items-center justify-between ml-1 mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/25">Correo</label>
                    {recents.length > 0 && (
                      <button type="button" onClick={() => setPicker(true)} className="text-[9px] font-black uppercase tracking-widest text-indigo-400/70 hover:text-indigo-400 transition-colors">
                        Recientes
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
                  <div className="flex items-center justify-between ml-1 mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/25">Contraseña</label>
                    <button type="button" onClick={() => { setResetMode(true); setError(''); }} className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-indigo-400 transition-colors">
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
                    <span>!</span> {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 mt-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <>Entrar al sistema <ArrowRight size={15} /></>}
                </button>

                {/* Captcha */}
                {captchaKey ? (
                  <div className="flex justify-center">
                    <ReCAPTCHA sitekey={captchaKey} onChange={v => setCaptcha(v)} theme="dark" />
                  </div>
                ) : null}

                {/* Passkey */}
                <button
                  type="button" onClick={handlePasskey} disabled={pkLoading}
                  className="w-full py-3 bg-white/[0.03] border border-white/[0.06] text-white/35 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.06] hover:text-white/55 flex items-center justify-center gap-2 transition-all"
                >
                  <Fingerprint size={14} className="text-indigo-400/70" />
                  {pkLoading ? 'Validando...' : 'Usar Passkey'}
                </button>
              </form>

              {/* Invite-only notice */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
                <p className="text-[10px] text-white/15 leading-relaxed">
                  ¿No tienes cuenta? Contacta al administrador de tu empresa.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom tagline */}
        <p className="mt-8 text-[10px] text-white/10 font-bold text-center tracking-wider">
          Powered by Dualis ERP &middot; Sistema Empresarial Cloud
        </p>
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
                <div key={u.email} className="flex items-center gap-3 px-6 py-4 hover:bg-white/[0.03] transition-colors">
                  <button type="button" onClick={() => { setEmail(u.email); setPicker(false); }} className="flex-1 text-left">
                    <div className="text-sm font-bold text-white">{u.email}</div>
                    <div className="text-[9px] font-bold text-white/20 mt-0.5">{new Date(u.lastUsed).toLocaleDateString()}</div>
                  </button>
                  <button type="button" onClick={() => { const n = recents.filter(x => x.email !== u.email); setRecents(n); localStorage.setItem('erp_login_users', JSON.stringify(n)); }} className="text-[10px] font-black text-rose-400/60 hover:text-rose-400 transition-colors">&#x2715;</button>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06]">
              <button onClick={() => { setRecents([]); localStorage.removeItem('erp_login_users'); setPicker(false); }} className="w-full text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-rose-400 transition-colors">Limpiar todo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSS ANIMATIONS (injected) ──────────────────── */}
      <style>{`
        @keyframes loginOrb1 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(80px, 60px); }
          66% { transform: translate(-40px, 30px); }
        }
        @keyframes loginOrb2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-70px, -50px); }
          66% { transform: translate(50px, -30px); }
        }
        @keyframes loginOrb3 {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-40px); }
        }
        @keyframes loginFloat {
          0%, 100% { transform: translateY(0px); opacity: 0.6; }
          50% { transform: translateY(-12px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
