import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Zap, Building2, Crown, Check, ArrowRight, Copy, CheckCheck,
  Shield, Sparkles, Clock, Loader2, Send, AlertTriangle,
} from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { PLAN_BASE_PRICE, useSubscription } from '../hooks/useSubscription';

// ─── Payment info ─────────────────────────────────────────────────────────────
const PAYMENT_INFO = {
  binance:       { label: 'Binance Pay',   id: '1110745526', note: 'Envía USDT (BEP20 o Binance Pay directo)' },
  pago_movil:    { label: 'Pago Móvil',    banco: 'Bancamiga (0172)', cedula: 'V-32477241', telefono: '04125343141', note: 'Concepto: Dualis + nombre de tu empresa' },
  transferencia: { label: 'Transferencia', banco: 'Bancamiga (0172)', nombre: 'Jesús Miguel Alexander Salazar Álvarez', cedula: 'V-32477241', cuenta: '01720702427025760104', tipo: 'Cuenta Corriente Amiga' },
  paypal:        { label: 'PayPal',        email: 'svillarroel154@gmail.com', note: 'Enviar como "Amigos y familiares"' },
} as const;
type PayMethod = keyof typeof PAYMENT_INFO;

// ─── Plans ────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'starter' as const, name: 'Starter', price: PLAN_BASE_PRICE.starter,
    Icon: Zap, gradient: 'from-sky-500 to-blue-600', shadow: 'shadow-sky-500/30',
    ring: 'ring-sky-500/40',
    features: ['2 usuarios', '500 productos', 'POS Detal', 'Inventario', 'Clientes / CxC', 'Cajas'],
  },
  {
    id: 'negocio' as const, name: 'Negocio', price: PLAN_BASE_PRICE.negocio,
    Icon: Building2, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/30',
    ring: 'ring-indigo-500/40', popular: true,
    features: ['5 usuarios', '2 000 productos', 'POS Mayor (crédito)', 'Proveedores / CxP', 'RRHH', '1 Sucursal'],
  },
  {
    id: 'enterprise' as const, name: 'Enterprise', price: PLAN_BASE_PRICE.enterprise,
    Icon: Crown, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/30',
    ring: 'ring-violet-500/40',
    features: ['Usuarios ilimitados', 'Productos ilimitados', '3 Sucursales', 'VisionLab IA', 'Conciliación', 'Soporte prioritario'],
  },
];

// ─── Copy helper ──────────────────────────────────────────────────────────────
function CopyRow({ label, value, id, copied, onCopy }: { label: string; value: string; id: string; copied: string | null; onCopy: (v: string, id: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <p className="text-[9px] font-black text-white/25 uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className="text-sm font-mono font-bold text-white/80">{value}</p>
      </div>
      <button
        onClick={() => onCopy(value, id)}
        className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/30 hover:bg-indigo-500/20 hover:text-indigo-400 transition-all shrink-0"
      >
        {copied === id ? <CheckCheck size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SubscriptionWall() {
  const { empresa_id } = useParams<{ empresa_id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const businessId  = userProfile?.businessId || empresa_id || '';

  // If subscription already exists, redirect to dashboard
  const { subscription, loading: subLoading } = useSubscription(businessId);
  useEffect(() => {
    if (!subLoading && subscription) {
      navigate(`/${empresa_id}/admin/dashboard`, { replace: true });
    }
  }, [subLoading, subscription, empresa_id]);

  // UI state
  const [mode, setMode]               = useState<'choose' | 'pay'>('choose');
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null);
  const [payMethod, setPayMethod]     = useState<PayMethod>('binance');
  const [reference, setReference]     = useState('');
  const [note, setNote]               = useState('');
  const [copied, setCopied]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Start free trial ────────────────────────────────────────────────────────
  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'businesses', businessId), {
        subscription: {
          plan: 'trial', status: 'trial',
          trialEndsAt,
          addOns: { extraUsers:0, extraProducts:0, extraSucursales:0, visionLab:false, conciliacion:false, rrhhPro:false },
          createdAt: serverTimestamp(),
        }
      }, { merge: true });
      navigate(`/${empresa_id}/admin/dashboard`, { replace: true });
    } catch {
      setError('Error al iniciar el trial. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  // ── Submit payment request ──────────────────────────────────────────────────
  const handlePaySubmit = async () => {
    if (!selectedPlan || !reference.trim()) {
      setError('Ingresa la referencia de pago.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Create trial subscription + pending payment
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'businesses', businessId), {
        subscription: {
          plan: 'trial', status: 'trial',
          trialEndsAt,
          addOns: { extraUsers:0, extraProducts:0, extraSucursales:0, visionLab:false, conciliacion:false, rrhhPro:false },
          pendingPayment: {
            plan: selectedPlan.id,
            months: 1,
            amountUsd: selectedPlan.price,
            payMethod,
            reference: reference.trim(),
            note: note.trim(),
            submittedAt: serverTimestamp(),
            submittedBy: userProfile?.email || '',
          },
          createdAt: serverTimestamp(),
        }
      }, { merge: true });
      navigate(`/${empresa_id}/admin/dashboard`, { replace: true });
    } catch {
      setError('Error al enviar. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  const plan = selectedPlan;

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col overflow-hidden relative font-inter">

      {/* ── Background orbs ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-500/[0.03] blur-[80px]" />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="font-black text-white text-base tracking-tight">Dualis System</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/20 font-medium">
          <Shield size={12} className="text-indigo-400/60" />
          Pago seguro · Soporte 24/7
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">

        {mode === 'choose' && (
          <div className="w-full max-w-5xl">

            {/* Hero */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-black uppercase tracking-widest mb-5">
                <Sparkles size={11} /> Bienvenido a Dualis
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-3">
                Tu espacio de trabajo<br />
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  está listo
                </span>
              </h1>
              <p className="text-white/30 text-base max-w-md mx-auto leading-relaxed">
                Elige cómo empezar. Sin contratos, sin sorpresas.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-5">

              {/* ── Free trial card (spans full or 1 col on lg) ── */}
              <div className="lg:col-span-3">
                <button
                  onClick={handleStartTrial}
                  disabled={loading}
                  className="group w-full relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/60 to-teal-950/40 p-7 text-left transition-all duration-300 hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-0.5"
                >
                  {/* Glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/30 shrink-0">
                        <Clock size={24} className="text-white" />
                      </div>
                      <div>
                        <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1">Sin tarjeta de crédito</p>
                        <h2 className="text-white font-black text-2xl tracking-tight">Prueba gratuita — 30 días</h2>
                        <p className="text-white/35 text-sm mt-1">Acceso completo · Sin compromiso · Cancela cuando quieras</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-500/30 group-hover:-translate-y-0.5 transition-all">
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Comenzar ahora</span><ArrowRight size={16} /></>}
                    </div>
                  </div>

                  <div className="relative mt-5 flex flex-wrap gap-3">
                    {['POS Detal y Mayor', 'Inventario completo', 'CxC / CxP', 'Reportes', 'RRHH', 'Sucursales'].map(f => (
                      <span key={f} className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                        <Check size={11} className="text-emerald-500" /> {f}
                      </span>
                    ))}
                  </div>
                </button>
              </div>

              {/* ── Separator ── */}
              <div className="lg:col-span-3 flex items-center gap-4">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">O elige un plan de pago</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              {/* ── Plan cards ── */}
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlan(p); setMode('pay'); }}
                  className={`group relative text-left rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-200 hover:border-white/[0.18] hover:-translate-y-1 hover:shadow-2xl ${p.shadow}`}
                >
                  {p.popular && (
                    <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white bg-gradient-to-r ${p.gradient}`}>
                      Más popular
                    </span>
                  )}

                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-4 shadow-lg ${p.shadow}`}>
                    <p.Icon size={18} className="text-white" />
                  </div>

                  <p className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-1">{p.name}</p>
                  <div className="flex items-end gap-1 mb-4">
                    <span className="text-3xl font-black text-white">${p.price}</span>
                    <span className="text-xs text-white/25 mb-1">/mes</span>
                  </div>

                  <ul className="space-y-1.5 mb-5">
                    {p.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-white/40">
                        <Check size={11} className={`shrink-0 bg-gradient-to-br ${p.gradient} text-white rounded-full p-0.5`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className={`w-full py-2.5 rounded-xl bg-gradient-to-r ${p.gradient} text-white text-xs font-black text-center shadow-md ${p.shadow} group-hover:-translate-y-0.5 transition-all`}>
                    Activar {p.name} <ArrowRight size={12} className="inline ml-1" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Payment mode ─────────────────────────────────────────────────── */}
        {mode === 'pay' && plan && (
          <div className="w-full max-w-lg">

            {/* Back */}
            <button
              onClick={() => { setMode('choose'); setError(''); }}
              className="flex items-center gap-2 text-sm text-white/30 hover:text-white/60 transition-colors mb-8 font-semibold"
            >
              ← Cambiar opción
            </button>

            {/* Plan badge */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-lg ${plan.shadow}`}>
                <plan.Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Activando</p>
                <p className="text-white font-black text-lg">Plan {plan.name} — ${plan.price}/mes</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              {/* Header */}
              <div className={`bg-gradient-to-r ${plan.gradient} px-6 py-4`}>
                <p className="text-white font-black text-sm">Instrucciones de pago</p>
                <p className="text-white/60 text-xs mt-0.5">Elige el método y envía tu comprobante</p>
              </div>

              <div className="p-6 space-y-5">
                {/* Method selector */}
                <div>
                  <p className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-2">Método de pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(PAYMENT_INFO) as PayMethod[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setPayMethod(m)}
                        className={`py-2.5 rounded-xl text-[11px] font-black transition-all ${
                          payMethod === m
                            ? `bg-gradient-to-r ${plan.gradient} text-white shadow-md`
                            : 'bg-white/[0.04] border border-white/[0.07] text-white/30 hover:border-white/[0.16]'
                        }`}
                      >
                        {PAYMENT_INFO[m].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment details */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
                  {payMethod === 'binance' && (
                    <>
                      <CopyRow label="Binance Pay ID" value={PAYMENT_INFO.binance.id} id="b-id" copied={copied} onCopy={copyText} />
                      <p className="text-[10px] text-white/25">{PAYMENT_INFO.binance.note}</p>
                    </>
                  )}
                  {payMethod === 'pago_movil' && (
                    <>
                      <CopyRow label="Banco" value={PAYMENT_INFO.pago_movil.banco} id="pm-b" copied={copied} onCopy={copyText} />
                      <CopyRow label="Cédula" value={PAYMENT_INFO.pago_movil.cedula} id="pm-c" copied={copied} onCopy={copyText} />
                      <CopyRow label="Teléfono" value={PAYMENT_INFO.pago_movil.telefono} id="pm-t" copied={copied} onCopy={copyText} />
                      <p className="text-[10px] text-white/25">{PAYMENT_INFO.pago_movil.note}</p>
                    </>
                  )}
                  {payMethod === 'transferencia' && (
                    <>
                      <CopyRow label="Banco" value={PAYMENT_INFO.transferencia.banco} id="tr-b" copied={copied} onCopy={copyText} />
                      <CopyRow label="Nombre" value={PAYMENT_INFO.transferencia.nombre} id="tr-n" copied={copied} onCopy={copyText} />
                      <CopyRow label="Cédula" value={PAYMENT_INFO.transferencia.cedula} id="tr-c" copied={copied} onCopy={copyText} />
                      <CopyRow label="Cuenta" value={PAYMENT_INFO.transferencia.cuenta} id="tr-ct" copied={copied} onCopy={copyText} />
                      <CopyRow label="Tipo" value={PAYMENT_INFO.transferencia.tipo} id="tr-tp" copied={copied} onCopy={copyText} />
                    </>
                  )}
                  {payMethod === 'paypal' && (
                    <>
                      <CopyRow label="Email PayPal" value={PAYMENT_INFO.paypal.email} id="pp-e" copied={copied} onCopy={copyText} />
                      <p className="text-[10px] text-white/25">{PAYMENT_INFO.paypal.note}</p>
                    </>
                  )}
                </div>

                {/* Reference + note */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-white/25 uppercase tracking-widest mb-1.5">
                      Referencia / Confirmación *
                    </label>
                    <input
                      value={reference}
                      onChange={e => setReference(e.target.value)}
                      placeholder="Nº de transacción o ID de pago"
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/25 uppercase tracking-widest mb-1.5">
                      Nota (opcional)
                    </label>
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Cualquier info adicional..."
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                    <AlertTriangle size={12} /> {error}
                  </p>
                )}

                <button
                  onClick={handlePaySubmit}
                  disabled={loading || !reference.trim()}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm text-white transition-all ${
                    loading || !reference.trim()
                      ? 'opacity-40 cursor-not-allowed bg-white/10'
                      : `bg-gradient-to-r ${plan.gradient} shadow-lg ${plan.shadow} hover:-translate-y-0.5`
                  }`}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                  {loading ? 'Enviando...' : 'Enviar comprobante y entrar'}
                  {!loading && <ArrowRight size={14} />}
                </button>

                <p className="text-center text-[10px] text-white/20 leading-relaxed">
                  Entrarás con acceso de prueba mientras verificamos tu pago.<br />
                  La activación completa se da en menos de 24 horas.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
