import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import {
  ArrowRight, Loader2, ShieldCheck, Building2, Users,
  Eye, EyeOff, Mail, Lock, CheckCircle2,
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../firebase/api';
import ModeToggle from './ModeToggle';

/* ── Helpers ──────────────────────────────────────────── */
const COUNTRIES = ['Venezuela', 'Colombia', 'Panama', 'Republica Dominicana', 'USA'];

function pwStrength(p: string) {
  let s = 0;
  if (p.length >= 8)       s++;
  if (p.length >= 12)      s++;
  if (/[A-Z]/.test(p))    s++;
  if (/[0-9]/.test(p))    s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s; // 0-5
}
const STR_LABEL = ['', 'Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
const STR_COLOR = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-600'];

function genId() {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!';
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return 'key_' + Array.from(bytes, b => alpha[b % alpha.length]).join('');
}

/* ── Component ────────────────────────────────────────── */
export default function Register() {
  const [mode,    setMode]    = useState<'create' | 'join'>('create');
  const [form,    setForm]    = useState({
    businessName: '', workspaceCode: '',
    fullName: '', displayName: '',
    email: '', password: '',
    nationalId: '', country: '',
  });
  const [showPass,  setShowPass]  = useState(false);
  const [terms,     setTerms]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [captcha,   setCaptcha]   = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);

  const nav       = useNavigate();
  const { user }  = useAuth();
  const captchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  const strength   = pwStrength(form.password);
  const isCreate   = mode === 'create';

  React.useEffect(() => { if (user) nav('/'); }, [user, nav]);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── Submit ─────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms)               { setError('Acepta los términos para continuar.'); return; }
    if (captchaKey && !captcha) { setError('Completa el captcha.'); return; }
    setLoading(true); setError('');

    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid  = cred.user.uid;
      let   bid  = form.workspaceCode;

      if (!isCreate && !bid) throw new Error('Debes ingresar el código del espacio.');

      if (isCreate) {
        let attempts = 0, gid = genId();
        while (attempts < 3) {
          if (!(await getDoc(doc(db, 'businesses', gid))).exists()) break;
          gid = genId(); attempts++;
        }
        bid = gid;
        await setDoc(doc(db, 'businesses', bid), {
          name: form.businessName, ownerId: uid,
          createdAt: new Date().toISOString(), plan: 'free_tier',
        });
        try { await logAudit(uid, 'create_workspace', { businessId: bid, name: form.businessName }); } catch {}
      } else {
        if (!(await getDoc(doc(db, 'businesses', bid))).exists())
          throw new Error('El código del espacio no es válido.');
      }

      const role   = isCreate ? 'owner'        : 'employee';
      const status = isCreate ? 'PENDING_SETUP' : 'PENDING';

      await setDoc(doc(db, 'users', uid), {
        uid, email: form.email, fullName: form.fullName,
        displayName: form.displayName, businessId: bid, role, status,
        nationalId: form.nationalId, country: form.country, uiVersion: 'editorial',
      });

      try {
        await setDoc(doc(db, 'businesses', bid, 'members', uid), {
          uid, email: form.email, fullName: form.fullName,
          displayName: form.displayName, role, status, joinedAt: new Date().toISOString(),
        }, { merge: true });
      } catch {}

      try { await logAudit(uid, 'create_user', { businessId: bid, email: form.email }); } catch {}

      setCaptcha(null);
      if (isCreate) setSuccess(bid); else nav('/login');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al registrar. Intenta de nuevo.');
      setLoading(false);
    }
  };

  /* ══════════════════════════════════════════════════════
     SUCCESS SCREEN
  ══════════════════════════════════════════════════════ */
  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-[#060b1a]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-violet-600/15 blur-[100px]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 w-full max-w-lg animate-in zoom-in-95 fade-in-0 duration-500">
          <div className="bg-white/[0.04] border border-white/10 backdrop-blur-sm rounded-[3rem] p-12 flex flex-col items-center text-center shadow-2xl">

            {/* Shield icon */}
            <div className="relative mb-8">
              <div className="h-24 w-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-600/40">
                <ShieldCheck size={44} className="text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-500 border-2 border-[#060b1a] flex items-center justify-center">
                <CheckCircle2 size={16} className="text-white" />
              </div>
            </div>

            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full mb-5">
              ✦ Empresa creada exitosamente
            </div>

            <h2 className="text-3xl font-black text-white tracking-tight mb-3">¡Guarda tu llave ahora!</h2>
            <p className="text-white/40 text-sm leading-relaxed mb-8 max-w-sm">
              Este código es tu <span className="text-white/70 font-bold">llave privada de acceso</span>. Sin él, no podrás volver a entrar. Nadie de nuestro equipo te lo pedirá nunca.
            </p>

            {/* Code box */}
            <div
              className="w-full bg-white/[0.04] border-2 border-dashed border-indigo-500/40 rounded-3xl p-8 mb-6 cursor-pointer hover:border-indigo-500/70 transition-colors group"
              onClick={() => navigator.clipboard?.writeText(success)}
            >
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-4">
                Código de Espacio Único
              </p>
              <div className="text-[1.1rem] font-mono font-black text-white break-all select-all leading-relaxed tracking-wide">
                {success}
              </div>
              <p className="text-[9px] font-bold text-white/20 uppercase mt-3 group-hover:text-indigo-400 transition-colors">
                Haz clic para copiar
              </p>
            </div>

            <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 mb-8">
              <p className="text-xs font-bold text-amber-300 leading-relaxed">
                ⚠ Guárdalo en un lugar seguro. Si lo pierdes, no podemos recuperarlo.
              </p>
            </div>

            <button
              onClick={() => nav('/login')}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all"
            >
              Entendido — Ir al Login <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     MAIN REGISTER
  ══════════════════════════════════════════════════════ */
  const gradFrom = isCreate ? 'from-indigo-600' : 'from-emerald-600';
  const gradTo   = isCreate ? 'to-violet-600'   : 'to-teal-600';
  const orb1     = isCreate ? 'bg-indigo-600/20' : 'bg-emerald-600/20';
  const orb2     = isCreate ? 'bg-violet-600/15' : 'bg-teal-600/15';
  const ring     = isCreate ? 'focus:ring-indigo-500/50 focus:border-indigo-500/40' : 'focus:ring-emerald-500/50 focus:border-emerald-500/40';
  const inp      = `w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 ${ring} text-sm transition-all`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-[#060b1a]">

      {/* Atmospheric bg */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-700">
        <div className={`absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full ${orb1} blur-[120px] transition-colors duration-700`} />
        <div className={`absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full ${orb2} blur-[100px] transition-colors duration-700`} />
      </div>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

      {/* Controls */}
      <div className="absolute top-5 right-5 z-50"><ModeToggle /></div>

      <div className="relative z-10 w-full max-w-lg">

        {/* Glass card */}
        <div className="bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm rounded-[2.5rem] overflow-hidden shadow-2xl">

          {/* ── Animated Header ── */}
          <div className={`bg-gradient-to-br ${gradFrom} ${gradTo} p-8 transition-all duration-500`}>
            {/* Mode selector */}
            <div className="flex bg-black/20 rounded-2xl p-1 gap-1 mb-6 w-fit">
              <button
                type="button"
                onClick={() => { setMode('create'); setError(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isCreate ? 'bg-white text-slate-900 shadow-lg' : 'text-white/50 hover:text-white/80'}`}
              >
                <Building2 size={12} /> Crear empresa
              </button>
              <button
                type="button"
                onClick={() => { setMode('join'); setError(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isCreate ? 'bg-white text-slate-900 shadow-lg' : 'text-white/50 hover:text-white/80'}`}
              >
                <Users size={12} /> Unirme
              </button>
            </div>

            {/* Title */}
            <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300" key={mode}>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {isCreate ? 'Funda tu empresa digital' : '¡Únete a tu equipo!'}
              </h1>
              <p className="text-white/55 text-sm mt-1.5">
                {isCreate
                  ? 'Crea tu espacio de trabajo privado en minutos.'
                  : 'Pega el código que te compartió tu administrador.'}
              </p>
            </div>
          </div>

          {/* ── Form Body ── */}
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Mode-specific top field */}
              {isCreate ? (
                <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">
                    Nombre de la Empresa
                  </label>
                  <div className="relative">
                    <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                    <input
                      required type="text" placeholder="Mi Negocio Dualis C.A."
                      className={`${inp} pl-10`}
                      value={form.businessName} onChange={e => set('businessName', e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-amber-400 mb-3">
                    Código del Espacio de Trabajo
                  </p>
                  <input
                    required type="text" placeholder="key_XXXXXXXXX..." autoComplete="off" spellCheck={false}
                    className={`${inp} font-mono text-sm text-amber-200`}
                    value={form.workspaceCode} onChange={e => set('workspaceCode', e.target.value)}
                  />
                </div>
              )}

              {/* Nombre + Nombre Público */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Nombre Completo</label>
                  <input required type="text" placeholder="Jesús Salazar" className={inp}
                    value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Nombre Público</label>
                  <input required type="text" placeholder="Jesús" className={inp}
                    value={form.displayName} onChange={e => set('displayName', e.target.value)} />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Correo Electrónico</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                  <input required type="email" placeholder="jesus@empresa.com"
                    className={`${inp} pl-10`}
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>

              {/* Password + Strength */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Contraseña</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                  <input required type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    className={`${inp} pl-10 pr-11`}
                    value={form.password} onChange={e => set('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? STR_COLOR[strength] : 'bg-white/10'}`} />
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-white/30 shrink-0">{STR_LABEL[strength]}</span>
                  </div>
                )}
              </div>

              {/* Cédula + País */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Cédula / RIF</label>
                  <input required type="text" placeholder="V-12345678" className={inp}
                    value={form.nationalId} onChange={e => set('nationalId', e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">País</label>
                  <select required className={inp} value={form.country} onChange={e => set('country', e.target.value)}>
                    <option value="" className="bg-slate-900">Seleccionar</option>
                    {COUNTRIES.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3 pt-1">
                <input
                  type="checkbox" id="terms" checked={terms} onChange={e => setTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 accent-indigo-500 cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs text-white/30 leading-relaxed cursor-pointer">
                  Acepto los{' '}
                  <button type="button" onClick={() => nav('/terms')} className="text-white/55 underline hover:text-white transition-colors">Términos de Servicio</button>
                  {' '}y la{' '}
                  <button type="button" onClick={() => nav('/privacy')} className="text-white/55 underline hover:text-white transition-colors">Política de Privacidad</button>.
                </label>
              </div>

              {/* Captcha */}
              {captchaKey ? (
                <div className="flex justify-center">
                  <ReCAPTCHA sitekey={captchaKey} onChange={v => setCaptcha(v)} theme="dark" />
                </div>
              ) : (
                <p className="text-center text-[9px] font-mono text-white/10 uppercase tracking-widest">MODO_DEV · CAPTCHA_BYPASS</p>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium px-4 py-3 rounded-xl">
                  ⚠ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !terms || (captchaKey ? !captcha : false)}
                className={`w-full py-4 bg-gradient-to-r ${gradFrom} ${gradTo} hover:opacity-90 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-all`}
              >
                {loading
                  ? <Loader2 className="animate-spin" size={18} />
                  : <>{isCreate ? 'Crear mi empresa' : 'Unirme al equipo'} <ArrowRight size={15} /></>
                }
              </button>
            </form>

            {/* Login link */}
            <div className="mt-6 pt-6 border-t border-white/[0.06] text-center">
              <p className="text-xs text-white/20">
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => nav('/login')} className="font-black text-indigo-400 hover:text-indigo-300 transition-colors">
                  Iniciar sesión
                </button>
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[9px] font-black uppercase tracking-[0.4em] text-white/10 mt-6">
          Dualis ERP &copy; 2026
        </p>
      </div>
    </div>
  );
}
