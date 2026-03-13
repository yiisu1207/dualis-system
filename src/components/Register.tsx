import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import {
  ArrowRight, Loader2, ShieldCheck, Building2, Users,
  Eye, EyeOff, Mail, Lock, CheckCircle2, Shield, AlertTriangle,
  RotateCcw, Zap, Star, Crown, Clock, MessageCircle, Copy, Check, Upload, ImageIcon,
} from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logAudit, sendWorkspaceRequest } from '../firebase/api';
import ModeToggle from './ModeToggle';
import { generateOTP, sendOTPEmail, sendWelcomeEmail } from '../utils/emailService';

/* ── Constants ────────────────────────────────────────── */
const COUNTRIES = ['Venezuela', 'Colombia', 'Panama', 'Republica Dominicana', 'USA'];
const WA_NUMBER = '584125343141';

// ⚠ Actualiza estos datos con tu info de pago real
const PAYMENT_INFO = {
  binanceId:   'yisus_xd77@hotmail.com',
  pagoMovil:   { banco: 'Banesco', telefono: '0412-534-3141', cedula: 'V-XXXXXXXX' },
  zinli:       'yisus_xd77@hotmail.com',
  paypal:      'svillarroel154@gmail.com',
};

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 24,
    icon: Zap,
    color: 'indigo',
    gradient: 'from-indigo-500 to-blue-600',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/[0.08]',
    badge: null,
    features: ['3 usuarios', '500 productos', '1 sucursal', 'POS Detal + Mayor', 'Soporte básico'],
  },
  {
    id: 'negocio',
    name: 'Negocio',
    price: 49,
    icon: Star,
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/[0.10]',
    badge: 'MÁS POPULAR',
    features: ['10 usuarios', '2,000 productos', '3 sucursales', 'Todo Starter +', 'CxC / CxP / RRHH', 'Reportes avanzados'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 89,
    icon: Crown,
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.08]',
    badge: null,
    features: ['Usuarios ilimitados', 'Productos ilimitados', 'Sucursales ilimitadas', 'Todo Negocio +', 'VisionLab IA', 'Soporte prioritario'],
  },
] as const;

type PlanId = 'starter' | 'negocio' | 'enterprise';
type Step   = 'form' | 'otp' | 'success';

/* ── Helpers ──────────────────────────────────────────── */
function pwStrength(p: string) {
  let s = 0;
  if (p.length >= 8)           s++;
  if (p.length >= 12)          s++;
  if (/[A-Z]/.test(p))        s++;
  if (/[0-9]/.test(p))        s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
const STR_LABEL = ['', 'Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
const STR_COLOR = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-600'];

function compressImage(file: File, maxPx = 900, quality = 0.65): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function genId() {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!';
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return 'key_' + Array.from(bytes, b => alpha[b % alpha.length]).join('');
}

/* ══════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════ */
export default function Register() {
  const [mode,    setMode]    = useState<'create' | 'join'>('create');
  const [form,    setForm]    = useState({
    workspaceCode: '',
    fullName: '', displayName: '',
    email: '', password: '',
    nationalId: '', country: '',
  });
  const [showPass,  setShowPass]  = useState(false);
  const [terms,     setTerms]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [captcha,   setCaptcha]   = useState<string | null>(null);

  // Steps
  const [step,        setStep]        = useState<Step>('form');
  const [otp,         setOtp]         = useState('');
  const [otpDigits,   setOtpDigits]   = useState(['', '', '', '', '', '']);
  const [otpError,    setOtpError]    = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [cooldown,    setCooldown]    = useState(0);

  // Plan + account creation
  const [selectedPlan,   setSelectedPlan]   = useState<PlanId | 'trial' | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [successBid,     setSuccessBid]     = useState('');
  const [copiedField,    setCopiedField]    = useState<string | null>(null);
  const [proofPreview,   setProofPreview]   = useState<string | null>(null);
  const [proofName,      setProofName]      = useState<string>('');
  const [proofFile,      setProofFile]      = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofUploaded,  setProofUploaded]  = useState(false);
  const [successUid,     setSuccessUid]     = useState('');

  const otpRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null, null]);
  const nav       = useNavigate();
  const { user }  = useAuth();
  const captchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  const strength   = pwStrength(form.password);
  const isCreate   = mode === 'create';

  useEffect(() => { if (user) nav('/'); }, [user, nav]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  /* ── OTP handlers ──────────────────────────────────── */
  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/, '').slice(-1);
    const next = [...otpDigits];
    next[idx] = digit;
    setOtpDigits(next);
    setOtpError('');
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter') handleVerifyOTP();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { setOtpDigits(pasted.split('')); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  /* ── Step 1: Send OTP ──────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms)                 { setError('Acepta los términos para continuar.'); return; }
    if (captchaKey && !captcha) { setError('Completa el captcha.'); return; }
    setLoading(true); setError('');
    try {
      if (!isCreate) {
        if (!form.workspaceCode) throw new Error('Debes ingresar el código del espacio.');
        if (!(await getDoc(doc(db, 'businesses', form.workspaceCode))).exists())
          throw new Error('El código del espacio no es válido.');
      }
      const code = generateOTP();
      setOtp(code);
      await sendOTPEmail(form.email, form.displayName || form.fullName, code);
      setStep('otp');
      setCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Error al enviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setOtpError(''); setOtpDigits(['', '', '', '', '', '']);
    try {
      const code = generateOTP();
      setOtp(code);
      await sendOTPEmail(form.email, form.displayName || form.fullName, code);
      setCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch { setOtpError('Error al reenviar. Intenta de nuevo.'); }
  };

  /* ── Step 2: Verify OTP → create account with trial ── */
  const handleVerifyOTP = () => {
    const entered = otpDigits.join('');
    if (entered.length < 6) { setOtpError('Ingresa los 6 dígitos del código.'); return; }
    if (entered !== otp)    { setOtpError('Código incorrecto. Verifica e intenta de nuevo.'); return; }
    // Always go straight to account creation with trial — plan selection happens in SubscriptionWall
    handleCreateAccount('trial');
  };

  /* ── Step 3: Create account with selected plan ─────── */
  const handleCreateAccount = async (plan: PlanId | 'trial') => {
    setSelectedPlan(plan);
    setCreatingAccount(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid  = cred.user.uid;
      let   bid  = form.workspaceCode;

      if (isCreate) {
        let attempts = 0, gid = genId();
        while (attempts < 3) {
          if (!(await getDoc(doc(db, 'businesses', gid))).exists()) break;
          gid = genId(); attempts++;
        }
        bid = gid;
        const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await setDoc(doc(db, 'businesses', bid), {
          name: form.fullName || 'Mi Negocio', ownerId: uid,
          createdAt: new Date().toISOString(),
          plan: 'trial',
          subscription: {
            plan: 'trial', status: 'trial',
            trialEndsAt,
            addOns: { extraUsers: 0, extraProducts: 0, extraSucursales: 0, visionLab: false, conciliacion: false, rrhhPro: false },
            createdAt: new Date().toISOString(),
          },
        });
        try { await logAudit(uid, 'create_workspace', { businessId: bid, plan }); } catch {}
      }

      const isTrial  = plan === 'trial' || !isCreate;
      const role     = isCreate ? 'owner' : 'pending';
      // join mode siempre PENDING_APPROVAL (esperando que el owner apruebe)
      const status   = !isCreate ? 'PENDING_APPROVAL' : (isTrial ? 'PENDING_SETUP' : 'PENDING_APPROVAL');

      await setDoc(doc(db, 'users', uid), {
        uid, email: form.email, fullName: form.fullName,
        displayName: form.displayName, businessId: bid, role, status,
        nationalId: form.nationalId, country: form.country, uiVersion: 'editorial',
        emailVerified: true, selectedPlan: plan, createdAt: new Date().toISOString(),
      });

      if (isCreate) {
        // Owner: escribir en la subcolección members (tiene permisos de admin sobre su propio negocio)
        try {
          await setDoc(doc(db, 'businesses', bid, 'members', uid), {
            uid, email: form.email, fullName: form.fullName,
            displayName: form.displayName, role: 'owner', status, joinedAt: new Date().toISOString(),
          }, { merge: true });
        } catch {}
      } else {
        // Join mode: crear workspaceRequest para que el owner apruebe
        try {
          await sendWorkspaceRequest({
            senderId:    uid,
            senderEmail: form.email,
            senderName:  form.displayName || form.fullName,
            workspaceId: bid,
          });
        } catch {}
      }

      try { await logAudit(uid, 'create_user', { businessId: bid, email: form.email, plan }); } catch {}

      sendWelcomeEmail(form.email, form.displayName || form.fullName, bid).catch(err => console.error('[WelcomeEmail] Error:', err));

      setSuccessBid(bid);
      setSuccessUid(uid);
      setStep('success');
    } catch (err: any) {
      const msg = err?.code === 'auth/email-already-in-use'
        ? 'Este correo ya está registrado. Usa otro o inicia sesión.'
        : err.message || 'Error al crear la cuenta.';
      setOtpError(msg);
      setStep('otp');
    } finally {
      setCreatingAccount(false);
    }
  };

  /* ══════════════════════════════════════════════════════
     SUCCESS SCREEN
  ══════════════════════════════════════════════════════ */
  if (step === 'success') {
    const isPaid = selectedPlan && selectedPlan !== 'trial';
    const planInfo = isPaid ? PLANS.find(p => p.id === selectedPlan) : null;
    const waText = encodeURIComponent(
      `Hola, acabo de registrarme en Dualis ERP con el plan ${planInfo?.name ?? ''} ($${planInfo?.price}/mes).\nMi correo: ${form.email}\nBusiness ID: ${successBid}\n\nAdjunto comprobante de pago.`
    );

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-[#060b1a]">
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full blur-[120px] ${isPaid ? 'bg-violet-600/20' : 'bg-indigo-600/20'}`} />
          <div className={`absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full blur-[100px] ${isPaid ? 'bg-amber-600/10' : 'bg-violet-600/15'}`} />
        </div>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 w-full max-w-lg animate-in zoom-in-95 fade-in-0 duration-500">
          <div className="bg-white/[0.04] border border-white/10 backdrop-blur-sm rounded-[3rem] p-10 flex flex-col items-center text-center shadow-2xl">

            <div className="relative mb-6">
              <div className={`h-20 w-20 rounded-[1.75rem] bg-gradient-to-br ${isPaid ? 'from-violet-500 to-amber-500' : 'from-indigo-500 to-violet-600'} flex items-center justify-center shadow-2xl`}>
                <ShieldCheck size={38} className="text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-emerald-500 border-2 border-[#060b1a] flex items-center justify-center">
                <CheckCircle2 size={14} className="text-white" />
              </div>
            </div>

            {isPaid ? (
              /* ── Paid plan success ── */
              <>
                <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full mb-4">
                  ✦ Solicitud recibida — Plan {planInfo?.name}
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">¡Cuenta creada!</h2>
                <p className="text-white/40 text-sm leading-relaxed mb-6 max-w-sm">
                  Para activar tu plan <strong className="text-white/70">{planInfo?.name} (${planInfo?.price}/mes)</strong>, envía tu comprobante de pago por WhatsApp. Jesús activará tu cuenta en menos de <strong className="text-white/70">24 horas</strong>.
                </p>

                {/* Payment methods */}
                <div className="w-full space-y-2.5 mb-5 text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Métodos de pago disponibles</p>

                  {/* Binance Pay */}
                  <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Binance Pay</p>
                      <button onClick={() => copyToClipboard(PAYMENT_INFO.binanceId, 'binance')}
                        className="text-amber-400/50 hover:text-amber-400 transition-colors">
                        {copiedField === 'binance' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <p className="text-sm font-mono text-white/70">{PAYMENT_INFO.binanceId}</p>
                  </div>

                  {/* Pago Móvil */}
                  <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Pago Móvil</p>
                      <button onClick={() => copyToClipboard(PAYMENT_INFO.pagoMovil.telefono, 'pagomovil')}
                        className="text-indigo-400/50 hover:text-indigo-400 transition-colors">
                        {copiedField === 'pagomovil' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <p className="text-sm text-white/70">{PAYMENT_INFO.pagoMovil.banco} · {PAYMENT_INFO.pagoMovil.telefono} · {PAYMENT_INFO.pagoMovil.cedula}</p>
                  </div>

                  {/* Zinli */}
                  <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Zinli / Reserve</p>
                      <button onClick={() => copyToClipboard(PAYMENT_INFO.zinli, 'zinli')}
                        className="text-emerald-400/50 hover:text-emerald-400 transition-colors">
                        {copiedField === 'zinli' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <p className="text-sm font-mono text-white/70">{PAYMENT_INFO.zinli}</p>
                    <p className="text-[10px] text-emerald-400/40 mt-1">Pide el QR por WhatsApp</p>
                  </div>

                  {/* PayPal */}
                  <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">PayPal</p>
                      <button onClick={() => copyToClipboard(PAYMENT_INFO.paypal, 'paypal')}
                        className="text-blue-400/50 hover:text-blue-400 transition-colors">
                        {copiedField === 'paypal' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <p className="text-sm font-mono text-white/70">{PAYMENT_INFO.paypal}</p>
                  </div>
                </div>

                {/* Proof upload */}
                <div className="w-full mb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-2">Adjuntar comprobante de pago</p>
                  <label className="flex flex-col items-center justify-center w-full cursor-pointer rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-indigo-500/40 bg-white/[0.02] hover:bg-indigo-500/[0.04] transition-all p-5 gap-3 group">
                    {proofPreview ? (
                      <>
                        <img src={proofPreview} alt="Comprobante" className="max-h-32 rounded-xl object-contain" />
                        <p className="text-[10px] text-white/40 truncate max-w-[200px]">{proofName}</p>
                        {!proofUploaded && <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400/60 group-hover:text-indigo-400 transition-colors">Cambiar imagen</p>}
                      </>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center group-hover:border-indigo-500/30 transition-colors">
                          <Upload size={16} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-white/30 group-hover:text-white/50 transition-colors">Seleccionar foto / captura</p>
                          <p className="text-[9px] text-white/15 mt-0.5">PNG, JPG, WEBP hasta 5 MB</p>
                        </div>
                      </>
                    )}
                    <input
                      type="file" accept="image/*" className="hidden"
                      disabled={proofUploaded}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setProofFile(file);
                        setProofName(file.name);
                        setProofUploaded(false);
                        const reader = new FileReader();
                        reader.onload = ev => setProofPreview(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  {proofFile && !proofUploaded && (
                    <button
                      onClick={async () => {
                        if (!proofFile || !successUid) return;
                        setProofUploading(true);
                        try {
                          const base64 = await compressImage(proofFile);
                          await updateDoc(doc(db, 'users', successUid), {
                            paymentProofImg: base64,
                            paymentProofAt: new Date().toISOString(),
                          });
                          setProofUploaded(true);
                        } catch {
                          /* silent — user can still send via WA */
                        } finally {
                          setProofUploading(false);
                        }
                      }}
                      disabled={proofUploading}
                      className="w-full mt-2.5 py-3 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                    >
                      {proofUploading
                        ? <><Loader2 size={13} className="animate-spin" /> Comprimiendo y guardando...</>
                        : <><Upload size={13} /> Enviar comprobante</>
                      }
                    </button>
                  )}

                  {proofUploaded && (
                    <div className="flex items-center gap-2 mt-2.5 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <p className="text-[11px] font-bold text-emerald-400">Comprobante recibido — Jesús lo revisará pronto</p>
                    </div>
                  )}

                  {proofPreview && !proofUploaded && (
                    <p className="text-[10px] text-white/25 text-center mt-2 leading-relaxed">
                      <ImageIcon size={9} className="inline mr-1" />
                      También puedes adjuntarlo manualmente al WhatsApp
                    </p>
                  )}
                </div>

                {/* Workspace ID */}
                <div className="w-full bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 mb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/20 mb-2">Tu código de espacio</p>
                  <p className="text-xs font-mono font-bold text-white/50 break-all">{successBid}</p>
                  <p className="text-[9px] text-white/15 mt-1">Guárdalo — lo necesitarás al iniciar sesión</p>
                </div>

                {/* WA button */}
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=${waText}`}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl flex items-center justify-center gap-2 transition-all hover:opacity-90 mb-3"
                  style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}
                >
                  <MessageCircle size={16} /> Enviar comprobante por WhatsApp
                </a>
                <button onClick={() => nav('/login')}
                  className="w-full text-xs text-white/20 hover:text-white/40 transition-colors py-2">
                  Ya envié el comprobante — Ir al login
                </button>
              </>
            ) : (
              /* ── Trial success ── */
              <>
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-full mb-4">
                  ✦ 30 días gratis — Acceso inmediato
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-2">¡Guarda tu llave!</h2>
                <p className="text-white/35 text-sm mb-1">Correo de bienvenida enviado a <strong className="text-white/60">{form.email}</strong></p>
                <p className="text-white/40 text-sm leading-relaxed mb-6 max-w-sm">
                  Este código es tu <span className="text-white/70 font-bold">llave privada</span>. Sin él, no podrás entrar. Nadie te lo pedirá jamás.
                </p>

                <div
                  className="w-full bg-white/[0.04] border-2 border-dashed border-indigo-500/40 rounded-3xl p-7 mb-4 cursor-pointer hover:border-indigo-500/70 transition-colors group"
                  onClick={() => copyToClipboard(successBid, 'bid')}
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-3">Código de Espacio Único</p>
                  <div className="text-[1rem] font-mono font-black text-white break-all select-all leading-relaxed">{successBid}</div>
                  <p className="text-[9px] font-bold text-white/20 uppercase mt-2.5 group-hover:text-indigo-400 transition-colors">
                    {copiedField === 'bid' ? '✓ Copiado' : 'Haz clic para copiar'}
                  </p>
                </div>

                <div className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
                  <p className="text-xs font-bold text-red-300 leading-relaxed">
                    ⚠ CUÍDALO CON TU VIDA. Si lo pierdes, no podemos recuperarlo. Nunca lo compartas.
                  </p>
                </div>

                <button
                  onClick={() => nav('/login')}
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all"
                >
                  Entendido — Iniciar sesión <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     OTP VERIFICATION SCREEN
  ══════════════════════════════════════════════════════ */
  if (step === 'otp') {
    const allFilled = otpDigits.every(d => d !== '');
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-[#060b1a]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[20%] left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="absolute -bottom-[15%] right-[5%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[100px]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative z-10 w-full max-w-md animate-in zoom-in-95 fade-in-0 duration-400">
          <div className="bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-4">
                <Shield size={26} className="text-white" />
              </div>
              <h1 className="text-xl font-black text-white tracking-tight">Verifica tu correo</h1>
              <p className="text-white/60 text-sm mt-1.5">
                Enviamos un código a<br />
                <strong className="text-white/90">{form.email}</strong>
              </p>
            </div>

            <div className="p-8">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25 text-center mb-5">
                Ingresa el código de 6 dígitos
              </p>

              <div className="flex gap-2.5 justify-center mb-2" onPaste={handleOtpPaste}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text" inputMode="numeric" maxLength={1} value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className={`w-12 h-14 text-center text-2xl font-black rounded-xl border-2 bg-white/[0.06] text-white outline-none transition-all
                      ${d ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/[0.1]'}
                      ${otpError ? 'border-red-500/60 bg-red-500/[0.06]' : ''}
                      focus:border-indigo-400 focus:bg-indigo-500/10`}
                  />
                ))}
              </div>

              {otpError && (
                <div className="flex items-center gap-2 mt-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium px-4 py-2.5 rounded-xl">
                  <AlertTriangle size={13} className="shrink-0" /> {otpError}
                </div>
              )}

              <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-red-500/[0.06] border border-red-500/20 rounded-2xl">
                <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-400/80 leading-relaxed">
                  <strong className="text-red-400">Cuida este código con tu vida.</strong> Nunca lo compartas. Nuestro equipo jamás te lo pedirá.
                </p>
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={!allFilled || otpVerifying}
                className="w-full mt-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              >
                {otpVerifying
                  ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                  : <><CheckCircle2 size={15} /> Verificar correo</>
                }
              </button>

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => { setStep('form'); setOtpDigits(['','','','','','']); setOtpError(''); }}
                  className="text-[10px] font-bold text-white/20 hover:text-white/40 transition-colors"
                >
                  ← Cambiar correo
                </button>
                <button
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-400/60 hover:text-indigo-400 disabled:text-white/15 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw size={10} />
                  {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
                </button>
              </div>
            </div>
          </div>
          <p className="text-center text-[9px] font-black uppercase tracking-[0.4em] text-white/10 mt-6">Dualis ERP &copy; 2026</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     MAIN REGISTER FORM
  ══════════════════════════════════════════════════════ */
  const gradFrom = isCreate ? 'from-indigo-600' : 'from-emerald-600';
  const gradTo   = isCreate ? 'to-violet-600'   : 'to-teal-600';
  const orb1     = isCreate ? 'bg-indigo-600/20' : 'bg-emerald-600/20';
  const orb2     = isCreate ? 'bg-violet-600/15' : 'bg-teal-600/15';
  const ring     = isCreate ? 'focus:ring-indigo-500/50 focus:border-indigo-500/40' : 'focus:ring-emerald-500/50 focus:border-emerald-500/40';
  const inp      = `w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 ${ring} text-sm transition-all`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-[#060b1a]">
      <div className="absolute inset-0 pointer-events-none transition-all duration-700">
        <div className={`absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full ${orb1} blur-[120px] transition-colors duration-700`} />
        <div className={`absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full ${orb2} blur-[100px] transition-colors duration-700`} />
      </div>
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      <div className="absolute top-5 right-5 z-50"><ModeToggle /></div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm rounded-[2.5rem] overflow-hidden shadow-2xl">

          <div className={`bg-gradient-to-br ${gradFrom} ${gradTo} p-8 transition-all duration-500`}>
            <div className="flex bg-black/20 rounded-2xl p-1 gap-1 mb-6 w-fit">
              <button type="button" onClick={() => { setMode('create'); setError(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isCreate ? 'bg-white text-slate-900 shadow-lg' : 'text-white/50 hover:text-white/80'}`}>
                <Building2 size={12} /> Crear empresa
              </button>
              <button type="button" onClick={() => { setMode('join'); setError(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isCreate ? 'bg-white text-slate-900 shadow-lg' : 'text-white/50 hover:text-white/80'}`}>
                <Users size={12} /> Unirme
              </button>
            </div>
            <div className="animate-in fade-in-0 slide-in-from-left-2 duration-300" key={mode}>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {isCreate ? 'Funda tu empresa digital' : '¡Únete a tu equipo!'}
              </h1>
              <p className="text-white/55 text-sm mt-1.5">
                {isCreate ? 'Crea tu espacio de trabajo privado en minutos.' : 'Pega el código que te compartió tu administrador.'}
              </p>
            </div>
          </div>

          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isCreate && (
                <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.35em] text-amber-400 mb-3">Código del Espacio de Trabajo</p>
                  <input required type="text" placeholder="key_XXXXXXXXX..." autoComplete="off" spellCheck={false}
                    className={`${inp} font-mono text-sm text-amber-200`}
                    value={form.workspaceCode} onChange={e => set('workspaceCode', e.target.value)} />
                </div>
              )}

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

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 mb-2 block">Correo Electrónico</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                  <input required type="email" placeholder="jesus@empresa.com"
                    className={`${inp} pl-10`}
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>

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
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? STR_COLOR[strength] : 'bg-white/10'}`} />
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-white/30 shrink-0">{STR_LABEL[strength]}</span>
                  </div>
                )}
              </div>

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

              <div className="flex items-start gap-3 pt-1">
                <input type="checkbox" id="terms" checked={terms} onChange={e => setTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 accent-indigo-500 cursor-pointer" />
                <label htmlFor="terms" className="text-xs text-white/30 leading-relaxed cursor-pointer">
                  Acepto los{' '}
                  <button type="button" onClick={() => nav('/terms')} className="text-white/55 underline hover:text-white transition-colors">Términos de Servicio</button>
                  {' '}y la{' '}
                  <button type="button" onClick={() => nav('/privacy')} className="text-white/55 underline hover:text-white transition-colors">Política de Privacidad</button>.
                </label>
              </div>

              {captchaKey ? (
                <div className="flex justify-center">
                  <ReCAPTCHA sitekey={captchaKey} onChange={v => setCaptcha(v)} theme="dark" />
                </div>
              ) : (
                <p className="text-center text-[9px] font-mono text-white/10 uppercase tracking-widest">MODO_DEV · CAPTCHA_BYPASS</p>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium px-4 py-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle size={13} className="shrink-0" /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !terms || (captchaKey ? !captcha : false)}
                className={`w-full py-4 bg-gradient-to-r ${gradFrom} ${gradTo} hover:opacity-90 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-all`}
              >
                {loading
                  ? <><Loader2 className="animate-spin" size={18} /> Enviando código...</>
                  : <>{isCreate ? 'Continuar' : 'Unirme al equipo'} <ArrowRight size={15} /></>
                }
              </button>
            </form>

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
        <p className="text-center text-[9px] font-black uppercase tracking-[0.4em] text-white/10 mt-6">Dualis ERP &copy; 2026</p>
      </div>
    </div>
  );
}
