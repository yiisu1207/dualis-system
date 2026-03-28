import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithEmailAndPassword, signInWithCustomToken, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Mail, Lock, Loader2, Building2, Eye, EyeOff, Fingerprint,
  ArrowRight, X, CheckCircle2,
  ShoppingCart, BarChart3, Package, Users, Brain, Shield, Receipt, Globe,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubdomain } from '../context/SubdomainContext';
import ModeToggle from './ModeToggle';

/* ── Carousel slides ──────────────────────────────────── */
const SLIDES = [
  {
    gradient: 'from-indigo-600 via-indigo-700 to-violet-800',
    icon: ShoppingCart,
    title: 'POS en la Nube',
    subtitle: 'Vende desde cualquier dispositivo',
    features: ['Facturación instantánea', 'Escáner de código de barras', 'Ticket digital y térmico', 'Modo offline disponible'],
    accent: 'text-indigo-300',
    featureBg: 'bg-indigo-500/20 border-indigo-400/30',
  },
  {
    gradient: 'from-violet-600 via-purple-700 to-fuchsia-800',
    icon: BarChart3,
    title: 'Dashboard Inteligente',
    subtitle: 'KPIs y métricas en tiempo real',
    features: ['Producto estrella', 'Flujo de caja diario', 'Alertas predictivas', 'Estado de Resultados (P&L)'],
    accent: 'text-violet-300',
    featureBg: 'bg-violet-500/20 border-violet-400/30',
  },
  {
    gradient: 'from-emerald-600 via-teal-700 to-cyan-800',
    icon: Package,
    title: 'Inventario Pro',
    subtitle: 'Control total de tu stock',
    features: ['Kardex automático', 'Alertas de stock bajo', 'Márgenes y costos', 'Smart Advisor con IA'],
    accent: 'text-emerald-300',
    featureBg: 'bg-emerald-500/20 border-emerald-400/30',
  },
  {
    gradient: 'from-sky-600 via-blue-700 to-indigo-800',
    icon: Users,
    title: 'RRHH y Nómina',
    subtitle: 'Gestiona tu equipo completo',
    features: ['Empleados y cargos', 'Cálculo de nómina', 'Adelantos y préstamos', 'Recibos digitales'],
    accent: 'text-sky-300',
    featureBg: 'bg-sky-500/20 border-sky-400/30',
  },
  {
    gradient: 'from-amber-600 via-orange-700 to-red-800',
    icon: Brain,
    title: 'VisionLab IA',
    subtitle: 'Inteligencia artificial para tu negocio',
    features: ['Análisis con Gemini', 'Predicciones de venta', 'Recomendaciones de stock', 'Insights en lenguaje natural'],
    accent: 'text-amber-300',
    featureBg: 'bg-amber-500/20 border-amber-400/30',
  },
  {
    gradient: 'from-rose-600 via-pink-700 to-fuchsia-800',
    icon: Shield,
    title: 'Seguridad Total',
    subtitle: 'Tus datos protegidos 24/7',
    features: ['Cifrado en tránsito y reposo', 'Roles y permisos granulares', 'Auditoría inmutable', 'Datos aislados por empresa'],
    accent: 'text-rose-300',
    featureBg: 'bg-rose-500/20 border-rose-400/30',
  },
  {
    gradient: 'from-teal-600 via-emerald-700 to-green-800',
    icon: Receipt,
    title: 'Contabilidad y Fiscal',
    subtitle: 'IVA, IGTF, BCV y más',
    features: ['Libro de ventas fiscal', 'Tasas BCV en vivo', 'CxC y CxP dual currency', 'Conciliación bancaria'],
    accent: 'text-teal-300',
    featureBg: 'bg-teal-500/20 border-teal-400/30',
  },
  {
    gradient: 'from-blue-600 via-indigo-700 to-violet-800',
    icon: Globe,
    title: 'Portal de Clientes',
    subtitle: 'Tus clientes conectados contigo',
    features: ['Estado de cuenta online', 'Registro de pagos', 'Facturas pendientes', 'Acceso con PIN seguro'],
    accent: 'text-blue-300',
    featureBg: 'bg-blue-500/20 border-blue-400/30',
  },
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

  // Carousel
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  const nextSlide = useCallback(() => setSlide(s => (s + 1) % SLIDES.length), []);
  const prevSlide = useCallback(() => setSlide(s => (s - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(nextSlide, 5000);
    return () => clearInterval(t);
  }, [paused, nextSlide]);

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
  const inp = 'w-full pl-11 pr-4 py-3.5 bg-white/[0.04] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40 text-sm font-medium transition-all';

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

  const cur = SLIDES[slide];
  const SlideIcon = cur.icon;

  return (
    <div className="min-h-screen flex bg-[#07091a]">

      {/* ── LEFT: LOGIN FORM ───────────────────────────────── */}
      <div className="w-full lg:w-[42%] flex flex-col items-center justify-center px-6 sm:px-10 py-10 relative">
        {/* Top controls */}
        <div className="absolute top-5 right-5 z-10"><ModeToggle /></div>

        <div className="w-full max-w-[380px]">

          {/* Logo + company name */}
          <div className="flex items-center gap-3 mb-10">
            {subdomain.logoUrl ? (
              <img src={subdomain.logoUrl} alt={subdomain.businessName || ''} className="h-12 w-auto rounded-xl" />
            ) : (
              <img src="/logo.png" alt="Dualis" className="h-11 w-auto" />
            )}
            <div>
              <p className="text-white font-black text-lg tracking-tight leading-tight">{subdomain.businessName}</p>
              <p className="text-white/20 text-[9px] font-bold uppercase tracking-widest">{subdomain.slug}.dualis.online</p>
            </div>
          </div>

          {/* ── RESET SENT ── */}
          {resetSent ? (
            <div className="text-center space-y-6 animate-in fade-in-0 duration-500">
              <div className="h-20 w-20 mx-auto rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Correo enviado</h2>
                <p className="text-white/35 text-sm mt-2">Revisa <span className="text-white/70 font-bold">{email}</span> y sigue las instrucciones.</p>
              </div>
              <button onClick={() => { setResetMode(false); setResetSent(false); setError(''); }} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest">
                Volver al inicio de sesión
              </button>
            </div>

          /* ── RESET FORM ── */
          ) : resetMode ? (
            <div className="space-y-5 animate-in fade-in-0 slide-in-from-right-4 duration-400">
              <button onClick={() => { setResetMode(false); setError(''); }} className="flex items-center gap-2 text-white/25 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-colors">
                <ArrowRight size={12} className="rotate-180" /> Volver
              </button>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Recuperar acceso</h1>
                <p className="text-white/35 text-sm mt-1">Te enviaremos un enlace de recuperación.</p>
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
                <h1 className="text-2xl font-black text-white tracking-tight">Iniciar sesión</h1>
                <p className="text-white/30 text-sm mt-1">Ingresa con tu cuenta para acceder al sistema.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email */}
                <div>
                  <div className="flex items-center justify-between ml-1 mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30">Correo</label>
                    {recents.length > 0 && (
                      <button type="button" onClick={() => setPicker(true)} className="text-[9px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">
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
                    <span>!</span> {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 mt-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <>Entrar al sistema <ArrowRight size={15} /></>}
                </button>

                {/* Captcha */}
                {captchaKey ? (
                  <div className="flex justify-center">
                    <ReCAPTCHA sitekey={captchaKey} onChange={v => setCaptcha(v)} theme="dark" />
                  </div>
                ) : (
                  <p className="text-center text-[9px] font-mono text-white/10 uppercase tracking-widest">MODO_DEV</p>
                )}

                {/* Passkey */}
                <button
                  type="button" onClick={handlePasskey} disabled={pkLoading}
                  className="w-full py-3 bg-white/[0.03] border border-white/[0.08] text-white/40 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.06] hover:text-white/60 flex items-center justify-center gap-2 transition-all"
                >
                  <Fingerprint size={14} className="text-indigo-400" />
                  {pkLoading ? 'Validando...' : 'Usar Passkey'}
                </button>
              </form>

              {/* Invite-only notice */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
                <p className="text-[10px] text-white/20">
                  ¿No tienes cuenta? Contacta al administrador de tu empresa para recibir una invitación.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: FEATURE CAROUSEL ────────────────────────── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Slide background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${cur.gradient} transition-all duration-700`} />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Floating decorative elements */}
        <div className="absolute top-[18%] right-[12%] w-32 h-32 rounded-full bg-white/[0.06] blur-xl" />
        <div className="absolute bottom-[22%] left-[8%] w-24 h-24 rounded-full bg-white/[0.04] blur-lg" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">

          {/* Top: Dualis branding */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Dualis" className="h-8 w-auto brightness-0 invert opacity-80" />
              <span className="text-white/60 text-xs font-black uppercase tracking-widest">Dualis ERP</span>
            </div>
            <div className="text-white/30 text-[9px] font-bold uppercase tracking-widest">
              Sistema Empresarial
            </div>
          </div>

          {/* Center: slide content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg" key={slide}>
            <div className="animate-in fade-in-0 slide-in-from-right-8 duration-500">
              {/* Icon */}
              <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-6 backdrop-blur-sm">
                <SlideIcon size={28} className="text-white" />
              </div>

              {/* Title */}
              <h2 className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-[1.1] mb-3">
                {cur.title}
              </h2>
              <p className="text-white/50 text-lg font-medium mb-8">{cur.subtitle}</p>

              {/* Features */}
              <div className="space-y-3">
                {cur.features.map(f => (
                  <div key={f} className={`inline-flex items-center gap-3 px-5 py-3 rounded-xl border ${cur.featureBg} backdrop-blur-sm mr-2`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />
                    <span className="text-white/90 text-sm font-bold">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom: navigation + dots */}
          <div className="flex items-center justify-between">
            {/* Dots */}
            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === slide ? 'w-8 bg-white' : 'w-1.5 bg-white/25 hover:bg-white/40'}`}
                />
              ))}
            </div>

            {/* Arrows */}
            <div className="flex items-center gap-2">
              <button onClick={prevSlide} className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
                <ChevronLeft size={18} />
              </button>
              <button onClick={nextSlide} className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
                <ChevronRightIcon size={18} />
              </button>
            </div>
          </div>
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
    </div>
  );
}
