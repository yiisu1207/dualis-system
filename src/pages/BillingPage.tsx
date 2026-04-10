import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantSafe } from '../context/TenantContext';
import {
  Check, Zap, Crown, Building2, ArrowLeft, Copy, CheckCheck,
  AlertTriangle, Clock, Loader2, Send, ChevronRight, Shield,
  ImagePlus, X, Store,
} from 'lucide-react';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../utils/cloudinary';
import {
  PLANS as PLAN_CONFIG, PAYMENT_INFO, type PayMethod,
  getVerticalPrice, getVerticalPlanInfo,
} from '../utils/planConfig';

// ─── Plan data (enriched from planConfig) ─────────────────────────────────────
interface Plan {
  id: string;
  name: string;
  monthlyPrice: number | null;
  Icon: React.FC<{ size?: number; className?: string }>;
  color: string;
  gradient: string;
  shadow: string;
  features: string[];
  popular?: boolean;
  isEnterprise?: boolean;
}

const PLAN_STYLE_MAP: Record<string, { Icon: React.FC<{ size?: number; className?: string }>; color: string; gradient: string; shadow: string }> = {
  gratis:     { Icon: Zap,       color: 'slate',   gradient: 'from-slate-500 to-slate-600',     shadow: 'shadow-slate-500/25'  },
  vertical:   { Icon: Store,     color: 'emerald',  gradient: 'from-emerald-500 to-teal-600',    shadow: 'shadow-emerald-500/25'},
  basico:     { Icon: Zap,       color: 'sky',      gradient: 'from-sky-500 to-blue-600',        shadow: 'shadow-sky-500/25'    },
  negocio:    { Icon: Building2, color: 'indigo',   gradient: 'from-indigo-500 to-violet-600',   shadow: 'shadow-indigo-500/25' },
  pro:        { Icon: Crown,     color: 'violet',   gradient: 'from-violet-500 to-purple-600',   shadow: 'shadow-violet-500/25' },
  enterprise: { Icon: Crown,     color: 'amber',    gradient: 'from-amber-500 to-orange-600',    shadow: 'shadow-amber-500/25'  },
};

const DEFAULT_STYLE = { Icon: Zap, color: 'slate', gradient: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/25' };

function buildPlans(tipoNegocio: string): Plan[] {
  return PLAN_CONFIG.map(p => {
    const style = PLAN_STYLE_MAP[p.id] ?? DEFAULT_STYLE;
    // For vertical plan, resolve dynamic price and features
    if (p.id === 'vertical') {
      const info = getVerticalPlanInfo(tipoNegocio);
      return {
        id: p.id,
        name: info.name,
        monthlyPrice: info.price,
        features: info.features,
        popular: false,
        isEnterprise: false,
        ...style,
      };
    }
    return {
      id: p.id,
      name: p.name,
      monthlyPrice: p.price,
      features: p.features,
      popular: p.popular,
      isEnterprise: p.isEnterprise,
      ...style,
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBadge({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === 'active')
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-black">● Activo</span>;
  if (status === 'trial' && daysLeft !== null && daysLeft > 0)
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 text-xs font-black"><Clock size={11} /> {daysLeft}d restantes</span>;
  return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 text-xs font-black"><AlertTriangle size={11} /> Expirado</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BillingPage() {
  const navigate = useNavigate();
  const { tenantId } = useTenantSafe();
  const { userProfile } = useAuth();
  const businessId = tenantId || userProfile?.businessId || '';

  const { subscription, trialDaysLeft, isExpired } = useSubscription(businessId);

  const [tipoNegocio, setTipoNegocio] = useState('general');
  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, 'businesses', businessId)).then(snap => {
      if (snap.exists() && snap.data()?.tipoNegocio) setTipoNegocio(snap.data().tipoNegocio);
    }).catch(() => {});
  }, [businessId]);

  const PLANS = useMemo(() => buildPlans(tipoNegocio), [tipoNegocio]);

  const [selectedPlan, setSelectedPlan]   = useState<Plan['id'] | null>(null);
  const [annual, setAnnual]               = useState(false);
  const [payMethod, setPayMethod]         = useState<PayMethod>('binance');
  const [months, setMonths]               = useState(1);
  const [reference, setReference]         = useState('');
  const [note, setNote]                   = useState('');
  const [copied, setCopied]               = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [error, setError]                 = useState('');
  const [proofFile, setProofFile]         = useState<File | null>(null);
  const [proofPreview, setProofPreview]   = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const plan = PLANS.find(p => p.id === selectedPlan);
  const effectiveMonths = annual ? 12 : months;
  const discount        = annual ? 0.20 : 0;
  const pricePerMonth   = plan?.monthlyPrice ? plan.monthlyPrice * (1 - discount) : 0;
  const totalUsd        = Math.round(pricePerMonth * effectiveMonths * 100) / 100;

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const clearProof = () => {
    setProofFile(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
  };

  const handleSubmit = async () => {
    if (!selectedPlan || !reference.trim()) {
      setError('Selecciona un plan e ingresa la referencia de pago.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        setUploadingProof(true);
        const result = await uploadToCloudinary(proofFile, 'dualis_payments');
        proofUrl = result.secure_url;
        setUploadingProof(false);
      }

      await updateDoc(doc(db, 'businesses', businessId), {
        'subscription.pendingPayment': {
          plan:        selectedPlan,
          months:      effectiveMonths,
          amountUsd:   totalUsd,
          payMethod,
          reference:   reference.trim(),
          note:        note.trim(),
          proofUrl:    proofUrl ?? null,
          submittedAt: serverTimestamp(),
          submittedBy: userProfile?.email || '',
        },
      });
      setSubmitted(true);
    } catch {
      setUploadingProof(false);
      setError('Error al enviar. Intenta de nuevo o contáctanos directamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
            <CheckCheck size={36} className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">¡Solicitud enviada!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
            Recibimos tu referencia de pago. En menos de 24 horas verificamos y activamos tu plan.<br />
            Te avisaremos por email cuando esté listo.
          </p>
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-sm shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Volver al sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 font-inter transition-colors">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.07] px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-semibold"
        >
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-indigo-500" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Pago seguro</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">

        {/* ── Status ──────────────────────────────────────────────────────── */}
        {subscription && (
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.07] rounded-2xl px-6 py-4 shadow-sm">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Plan actual</p>
              <p className="text-base font-black text-slate-900 dark:text-white capitalize">{subscription.plan}</p>
            </div>
            <StatusBadge status={subscription.status} daysLeft={trialDaysLeft} />
          </div>
        )}

        {/* ── Heading ─────────────────────────────────────────────────────── */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
            {isExpired ? 'Reactiva tu acceso' : 'Elige tu plan'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto">
            Paga una vez y activa tu suscripción en menos de 24 horas. Sin tarjeta de crédito.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={`text-sm font-bold ${!annual ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Mensual</span>
            <button
              onClick={() => setAnnual(p => !p)}
              className={`relative w-12 h-6 rounded-full transition-all ${annual ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${annual ? 'left-6' : 'left-0.5'}`} />
            </button>
            <span className={`text-sm font-bold ${annual ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
              Anual <span className="text-emerald-500 text-xs font-black">−20%</span>
            </span>
          </div>
        </div>

        {/* ── Plan cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map(p => {
            const price = annual ? p.monthlyPrice * 0.8 : p.monthlyPrice;
            const isSelected = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`relative text-left rounded-2xl border p-6 transition-all duration-200 ${
                  isSelected
                    ? `border-transparent ring-2 ring-offset-2 ring-offset-slate-50 dark:ring-offset-[#070b14] ring-indigo-500 bg-white dark:bg-slate-900 shadow-xl ${p.shadow}`
                    : 'border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-500/40 shadow-sm'
                }`}
              >
                {p.popular && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r ${p.gradient}`}>
                    Popular
                  </span>
                )}

                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-4 shadow-lg ${p.shadow}`}>
                  <p.Icon size={18} className="text-white" />
                </div>

                <div className="mb-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{p.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">${price.toFixed(0)}</span>
                    <span className="text-xs text-slate-400 font-medium mb-1">/mes</span>
                  </div>
                  {annual && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      <s className="text-slate-300 dark:text-slate-600">${p.monthlyPrice}</s>
                      {' '}facturado ${(price * 12).toFixed(0)}/año
                    </p>
                  )}
                </div>

                <ul className="space-y-2">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Check size={13} className={`shrink-0 bg-gradient-to-br ${p.gradient} text-white rounded-full p-0.5`} />
                      {f}
                    </li>
                  ))}
                </ul>

                {isSelected && (
                  <div className={`absolute top-4 right-4 w-5 h-5 rounded-full bg-gradient-to-br ${p.gradient} flex items-center justify-center`}>
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Payment section (shows after plan selected) ──────────────── */}
        {selectedPlan && plan && (
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-lg overflow-hidden">
            <div className={`bg-gradient-to-r ${plan.gradient} px-6 py-4`}>
              <h2 className="text-white font-black text-base">Instrucciones de pago — {plan.name}</h2>
              <p className="text-white/70 text-xs mt-0.5">Elige el método y envía tu referencia</p>
            </div>

            <div className="p-6 space-y-6">

              {/* Months selector (only for monthly billing) */}
              {!annual && (
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Meses a pagar</label>
                  <div className="flex gap-2">
                    {[1, 3, 6].map(m => (
                      <button
                        key={m}
                        onClick={() => setMonths(m)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                          months === m
                            ? `bg-gradient-to-r ${plan.gradient} text-white shadow-md ${plan.shadow}`
                            : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                        }`}
                      >
                        {m} {m === 1 ? 'mes' : 'meses'}
                        {m === 3 && <span className="ml-1 text-[10px] opacity-75">−5%</span>}
                        {m === 6 && <span className="ml-1 text-[10px] opacity-75">−10%</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-between py-3 border-y border-slate-100 dark:border-white/[0.07]">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Total a pagar</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">${totalUsd.toFixed(2)} USD</span>
              </div>

              {/* Method selector */}
              <div>
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PAYMENT_INFO) as PayMethod[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setPayMethod(m)}
                      className={`py-2.5 rounded-xl text-xs font-black transition-all ${
                        payMethod === m
                          ? `bg-gradient-to-r ${plan.gradient} text-white shadow-md`
                          : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      {PAYMENT_INFO[m].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment details */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.06] rounded-xl p-4 space-y-3">
                {payMethod === 'binance' && (
                  <>
                    <DetailRow label="Binance Pay ID" value={PAYMENT_INFO.binance.id} onCopy={() => copyText(PAYMENT_INFO.binance.id, 'binance-id')} copied={copied === 'binance-id'} />
                    <p className="text-[11px] text-slate-400">{PAYMENT_INFO.binance.note}</p>
                  </>
                )}
                {payMethod === 'pago_movil' && (
                  <>
                    <DetailRow label="Banco" value={PAYMENT_INFO.pago_movil.banco} />
                    <DetailRow label="Cédula" value={PAYMENT_INFO.pago_movil.cedula} onCopy={() => copyText(PAYMENT_INFO.pago_movil.cedula, 'pm-ced')} copied={copied === 'pm-ced'} />
                    <DetailRow label="Teléfono" value={PAYMENT_INFO.pago_movil.telefono} onCopy={() => copyText(PAYMENT_INFO.pago_movil.telefono, 'pm-tel')} copied={copied === 'pm-tel'} />
                    <p className="text-[11px] text-slate-400">{PAYMENT_INFO.pago_movil.note}</p>
                  </>
                )}
                {payMethod === 'transferencia' && (
                  <>
                    <DetailRow label="Banco" value={PAYMENT_INFO.transferencia.banco} />
                    <DetailRow label="Nombre" value={PAYMENT_INFO.transferencia.nombre} />
                    <DetailRow label="Cédula" value={PAYMENT_INFO.transferencia.cedula} onCopy={() => copyText(PAYMENT_INFO.transferencia.cedula, 'tr-ced')} copied={copied === 'tr-ced'} />
                    <DetailRow label="Cuenta" value={PAYMENT_INFO.transferencia.cuenta} onCopy={() => copyText(PAYMENT_INFO.transferencia.cuenta, 'tr-cuenta')} copied={copied === 'tr-cuenta'} />
                    <DetailRow label="Tipo" value={PAYMENT_INFO.transferencia.tipo} />
                  </>
                )}
                {payMethod === 'paypal' && (
                  <>
                    <DetailRow label="Email PayPal" value={PAYMENT_INFO.paypal.email} onCopy={() => copyText(PAYMENT_INFO.paypal.email, 'pp-email')} copied={copied === 'pp-email'} />
                    <p className="text-[11px] text-slate-400">{PAYMENT_INFO.paypal.note}</p>
                  </>
                )}
              </div>

              {/* Reference input */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    Número de referencia / confirmación *
                  </label>
                  <input
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="Ej. 123456789 o ID de transacción"
                    className="w-full bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    Nota adicional (opcional)
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Cualquier información relevante..."
                    rows={2}
                    className="w-full bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none"
                  />
                </div>

                {/* Comprobante de pago */}
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    Comprobante de pago (opcional)
                  </label>
                  {proofPreview ? (
                    <div className="relative inline-block">
                      <img
                        src={proofPreview}
                        alt="Comprobante"
                        className="h-40 rounded-xl object-cover border border-slate-200 dark:border-white/[0.1] shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={clearProof}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 w-full cursor-pointer bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-white/[0.12] rounded-xl px-4 py-5 hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all group">
                      <ImagePlus size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          Adjuntar captura o foto
                        </p>
                        <p className="text-[11px] text-slate-400">JPG, PNG o WEBP · máx 5 MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleProofChange}
                      />
                    </label>
                  )}
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-2 text-rose-500 text-xs font-bold">
                  <AlertTriangle size={13} /> {error}
                </p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !reference.trim()}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm text-white transition-all ${
                  submitting || !reference.trim()
                    ? 'opacity-50 cursor-not-allowed bg-slate-400 dark:bg-slate-700'
                    : `bg-gradient-to-r ${plan.gradient} shadow-lg ${plan.shadow} hover:-translate-y-0.5`
                }`}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                {uploadingProof ? 'Subiendo comprobante...' : submitting ? 'Enviando...' : 'Enviar solicitud de activación'}
                {!submitting && <ChevronRight size={14} />}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                Verificamos manualmente en menos de 24 horas · Tu acceso no se interrumpe durante la revisión
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail row helper ────────────────────────────────────────────────────────
function DetailRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
      {onCopy && (
        <button
          onClick={onCopy}
          className="shrink-0 w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/[0.08] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
        >
          {copied ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}
