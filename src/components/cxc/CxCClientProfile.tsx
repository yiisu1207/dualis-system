import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  Movement,
  MovementType,
  ExchangeRates,
  AppConfig,
  Customer,
  AccountType,
  CustomRate,
  PortalAccessToken,
} from '../../../types';
import { formatCurrency, getMovementUsdAmount } from '../../utils/formatters';
import { buildClientStatus } from '../../utils/clientStatus';
import ClientStatusBadge from '../ClientStatusBadge';
import { addDoc, collection, onSnapshot, query, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  AlertTriangle,
  Receipt,
  FileText,
  Share2,
  CreditCard,
  Calendar,
  Globe,
  Copy,
  Check,
  MessageSquare,
  Mail,
  Save,
  Tag,
  Phone,
  MapPin,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Plus,
  Send,
} from 'lucide-react';
import { shareViaWhatsApp, shareViaEmail, messageTemplates } from '../../utils/shareLink';
import {
  getInitials,
  formatPhone,
  getEntityField,
  daysSince,
  sumByAccount,
  calculateAgingBuckets,
  formatDateTime,
  getDistinctAccounts,
  buildAccountLabels,
  calcCreditScore,
  hasActiveDiscount,
  getEffectiveCreditMode,
} from './cxcHelpers';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { useSubdomain } from '../../context/SubdomainContext';
import CommunicationModal from './CommunicationModal';

/* ── Communication helpers ─────────────────────────────────── */

interface Communication {
  id: string;
  type: string;
  content: string;
  date: any;
  outcome?: string;
  userName?: string;
}

const COMM_TYPE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  llamada:  { icon: <Phone size={14} />,          label: 'Llamada' },
  visita:   { icon: <MapPin size={14} />,          label: 'Visita' },
  whatsapp: { icon: <MessageSquare size={14} />,   label: 'WhatsApp' },
  email:    { icon: <Mail size={14} />,            label: 'Email' },
  sms:      { icon: <Send size={14} />,            label: 'SMS' },
  nota:     { icon: <StickyNote size={14} />,      label: 'Nota' },
};

const OUTCOME_COLORS: Record<string, string> = {
  promesa_pago: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
  no_contesto:  'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400',
  rechazo:      'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400',
  acuerdo:      'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  informativo:  'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400',
};

const OUTCOME_LABELS: Record<string, string> = {
  promesa_pago: 'Promesa de pago',
  no_contesto:  'No contestó',
  rechazo:      'Rechazo',
  acuerdo:      'Acuerdo',
  informativo:  'Informativo',
};

interface Props {
  entityId: string;
  businessId: string;
  userId: string;
  customer: Customer | null;
  movements: Movement[];
  rates: ExchangeRates;
  config: AppConfig;
  businessName?: string;
  customRates?: CustomRate[];
  onBack: () => void;
  onViewLedger: () => void;
  onRegisterAbono: () => void;
  onShareWhatsApp: () => void;
  onExportPdf: () => void;
}

export default function CxCClientProfile({
  entityId,
  businessId,
  userId,
  customer,
  movements,
  rates,
  config,
  businessName,
  customRates = [],
  onBack,
  onViewLedger,
  onRegisterAbono,
  onShareWhatsApp,
  onExportPdf,
}: Props) {
  const { slug } = useSubdomain();
  const [portalLink, setPortalLink] = useState('');
  const [portalPin, setPortalPin] = useState('');
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Generate QR code when portal link is created
  useEffect(() => {
    if (!portalLink || !qrCanvasRef.current) return;
    (async () => {
      try {
        const QRCode = await import('qrcode');
        await QRCode.toCanvas(qrCanvasRef.current, portalLink, {
          width: 160,
          margin: 2,
          color: { dark: '#1e1b4b', light: '#ffffff' },
        });
      } catch (err) {
        console.error('QR generation error:', err);
      }
    })();
  }, [portalLink]);

  // Internal notes
  const [showWhatsAppMenu, setShowWhatsAppMenu] = useState(false);
  const [internalNotes, setInternalNotes] = useState(customer?.internalNotes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const handleSaveNotes = async () => {
    if (!businessId || !customer) return;
    setNotesSaving(true);
    try {
      await updateDoc(doc(db, 'businesses', businessId, 'customers', customer.id), {
        internalNotes,
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      console.error('[Notes save]', e);
    } finally {
      setNotesSaving(false);
    }
  };

  // Tags
  const [tags, setTags] = useState<string[]>(customer?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [tagsSaving, setTagsSaving] = useState(false);

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) { setTagInput(''); return; }
    const next = [...tags, t];
    setTags(next);
    setTagInput('');
    void saveTagsToDb(next);
  };

  const handleRemoveTag = (tag: string) => {
    const next = tags.filter(t => t !== tag);
    setTags(next);
    void saveTagsToDb(next);
  };

  const saveTagsToDb = async (newTags: string[]) => {
    if (!businessId || !customer) return;
    setTagsSaving(true);
    try {
      await updateDoc(doc(db, 'businesses', businessId, 'customers', customer.id), { tags: newTags });
    } catch (e) { console.error('[Tags save]', e); }
    finally { setTagsSaving(false); }
  };

  // Birthday
  const [birthday, setBirthday] = useState(customer?.birthday ?? '');
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [birthdaySaved, setBirthdaySaved] = useState(false);

  const handleSaveBirthday = async () => {
    if (!businessId || !customer) return;
    setBirthdaySaving(true);
    try {
      await updateDoc(doc(db, 'businesses', businessId, 'customers', customer.id), { birthday: birthday || null });
      setBirthdaySaved(true);
      setTimeout(() => setBirthdaySaved(false), 2000);
    } catch (e) { console.error('[Birthday save]', e); }
    finally { setBirthdaySaving(false); }
  };

  // Credit score — declaracion abajo, despues de effectiveCreditMode.

  // Communications
  const [commModalOpen, setCommModalOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [communications, setCommunications] = useState<Communication[]>([]);

  useEffect(() => {
    if (!businessId || !entityId) return;
    const customerId = customer?.id || entityId;
    const q = query(
      collection(db, 'businesses', businessId, 'customers', customerId, 'communications'),
      orderBy('date', 'desc'),
      fbLimit(20),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCommunications(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Communication)),
      );
    }, (err) => console.error('[Communications listener]', err));
    return unsub;
  }, [businessId, entityId, customer?.id]);

  const handleGeneratePortalAccess = async () => {
    if (portalGenerating) return;
    setPortalGenerating(true);
    try {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const token: Omit<PortalAccessToken, 'id'> = {
        customerId: entityId,
        customerName: customer?.id || entityId,
        pin,
        createdAt: new Date().toISOString(),
        createdBy: userId,
        active: true,
      };
      const docRef = await addDoc(
        collection(db, 'businesses', businessId, 'portalAccess'),
        token
      );
      const host = window.location.origin;
      const link = slug
        ? `${host}/portal/${slug}?token=${docRef.id}`
        : `${host}/portal?token=${docRef.id}`;
      setPortalLink(link);
      setPortalPin(pin);
    } catch (err) {
      console.error('Error generating portal access:', err);
    } finally {
      setPortalGenerating(false);
    }
  };

  const copyPortalLink = () => {
    const text = `Portal de Cliente\nEnlace: ${portalLink}\nPIN: ${portalPin}`;
    navigator.clipboard.writeText(text);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2000);
  };
  const entityMovs = useMemo(
    () => movements.filter((m) => m.entityId === entityId),
    [movements, entityId]
  );

  const clientStatus = useMemo(
    () =>
      buildClientStatus(entityMovs, rates, new Date(), {
        customerCreatedAt: customer?.createdAt || null,
      }),
    [entityMovs, rates, customer]
  );

  const distinctAccounts = useMemo(() => getDistinctAccounts(entityMovs), [entityMovs]);
  const accountLabels = useMemo(() => buildAccountLabels(distinctAccounts, customRates), [distinctAccounts, customRates]);

  // Modo de saldo (acumulado vs por factura). Override por cliente > global del
  // negocio (businessConfigs/{bid}.creditMode) > 'accumulated'.
  const [businessCreditMode, setBusinessCreditMode] = useState<'accumulated' | 'invoiceLinked' | null>(null);
  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, 'businessConfigs', businessId)).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as any;
      if (d.creditMode === 'invoiceLinked' || d.creditMode === 'accumulated') {
        setBusinessCreditMode(d.creditMode);
      }
    }).catch(() => {});
  }, [businessId]);
  const effectiveCreditMode = useMemo(
    () => getEffectiveCreditMode(customer, { creditMode: businessCreditMode ?? undefined }),
    [customer, businessCreditMode]
  );

  const balances = useMemo(() => {
    const byAccount: Record<string, number> = {};
    distinctAccounts.forEach((acc) => {
      byAccount[acc] = sumByAccount(entityMovs, acc as AccountType, rates, effectiveCreditMode);
    });
    // Keep legacy named fields for backward compat
    const bcv = byAccount[AccountType.BCV] ?? 0;
    const grupo = byAccount[AccountType.GRUPO] ?? 0;
    const divisa = byAccount[AccountType.DIVISA] ?? 0;
    const total = Object.values(byAccount).reduce((s, v) => s + v, 0);
    return { ...byAccount, bcv, grupo, divisa, total };
  }, [entityMovs, rates, distinctAccounts, effectiveCreditMode]);

  const aging = useMemo(
    () => calculateAgingBuckets(entityMovs, rates, effectiveCreditMode),
    [entityMovs, rates, effectiveCreditMode]
  );

  const creditScore = useMemo(
    () => calcCreditScore(entityMovs, effectiveCreditMode),
    [entityMovs, effectiveCreditMode]
  );

  const kpis = useMemo(() => {
    const invoices = entityMovs.filter((m) => m.movementType === MovementType.FACTURA);
    const abonos = entityMovs.filter((m) => m.movementType === MovementType.ABONO);
    const totalHistorical = invoices.reduce(
      (sum, m) => sum + getMovementUsdAmount(m, rates),
      0
    );
    const ticketAverage = invoices.length ? totalHistorical / invoices.length : 0;

    // Average payment days
    const sorted = [...entityMovs].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    let lastDate: Date | null = null;
    const payDeltas: number[] = [];
    sorted.forEach((m) => {
      const d = new Date(m.createdAt || m.date);
      if (m.movementType === MovementType.ABONO && lastDate) {
        payDeltas.push(Math.ceil((d.getTime() - lastDate.getTime()) / 86_400_000));
      }
      lastDate = d;
    });
    const avgPaymentDays = payDeltas.length
      ? Math.max(1, Math.round(payDeltas.reduce((s, v) => s + v, 0) / payDeltas.length))
      : 0;

    const lastMovDate = entityMovs.length
      ? [...entityMovs].sort(
          (a, b) =>
            new Date(b.createdAt || b.date).getTime() -
            new Date(a.createdAt || a.date).getTime()
        )[0]?.date
      : null;
    const daysSinceLastPayment = daysSince(lastMovDate);

    return {
      totalHistorical,
      ticketAverage,
      avgPaymentDays,
      daysSinceLastPayment,
      invoiceCount: invoices.length,
      abonoCount: abonos.length,
    };
  }, [entityMovs, rates]);

  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; cargos: number; abonos: number }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      months.push({
        key,
        label: date.toLocaleString('es-VE', { month: 'short' }),
        cargos: 0,
        abonos: 0,
      });
    }
    const monthMap = new Map(months.map((m) => [m.key, m]));
    entityMovs.forEach((m) => {
      const date = new Date(m.createdAt || m.date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthMap.get(key);
      if (!bucket) return;
      const amount = getMovementUsdAmount(m, rates);
      if (m.movementType === MovementType.FACTURA) bucket.cargos += amount;
      if (m.movementType === MovementType.ABONO) bucket.abonos += amount;
    });
    return months.map((m) => ({
      ...m,
      cargos: Number(m.cargos.toFixed(2)),
      abonos: Number(m.abonos.toFixed(2)),
    }));
  }, [entityMovs, rates]);

  const recentMovements = useMemo(
    () =>
      [...entityMovs]
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.date).getTime() -
            new Date(a.createdAt || a.date).getTime()
        )
        .slice(0, 10),
    [entityMovs]
  );

  const creditLimit = customer?.creditLimit ?? 0;
  const creditUsed = Math.max(0, balances.total);
  const creditAvailable = creditLimit > 0 ? Math.max(0, creditLimit - creditUsed) : 0;
  const creditPct = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0;
  const creditColor =
    creditPct > 90 ? 'rose' : creditPct > 70 ? 'amber' : 'emerald';

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-4">
      {/* HEADER */}
      <div className="app-panel p-6 sm:p-8">
        <div className="flex items-start gap-6">
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-2xl app-btn app-btn-ghost flex items-center justify-center shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-black flex items-center justify-center text-lg shadow-lg shadow-indigo-500/25">
                {getInitials(entityId)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-200 tracking-tight truncate">
                    {entityId}
                  </h2>
                  <ClientStatusBadge tags={clientStatus.tags} maxTags={3} />
                  {creditScore && (
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                      creditScore === 'EXCELENTE' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' :
                      creditScore === 'BUENO'     ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400' :
                      creditScore === 'REGULAR'   ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' :
                      'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400'
                    }`}>
                      Score: {creditScore}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                  Hoja de Vida Financiera
                </p>
              </div>
            </div>

            {customer && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span className="font-black text-slate-600 dark:text-slate-300">CI/RIF:</span>
                  {getEntityField(customer.cedula)}
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span className="font-black text-slate-600 dark:text-slate-300">Tel:</span>
                  {customer.telefono ? (
                    <a
                      href={`tel:${customer.telefono.replace(/\s+/g, '')}`}
                      className="hover:text-indigo-500 transition-colors"
                    >
                      {formatPhone(customer.telefono)}
                    </a>
                  ) : 'N/A'}
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span className="font-black text-slate-600 dark:text-slate-300">Email:</span>
                  {getEntityField(customer.email)}
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span className="font-black text-slate-600 dark:text-slate-300">Dir:</span>
                  <span className="truncate">{getEntityField(customer.direccion)}</span>
                </div>
              </div>
            )}

            {/* WhatsApp quick-contact */}
            {customer?.telefono && (
              <div className="mt-3 relative">
                <button
                  onClick={() => setShowWhatsAppMenu(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <MessageSquare size={13} />
                  Enviar WhatsApp
                </button>
                {showWhatsAppMenu && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setShowWhatsAppMenu(false)} />
                    <div className="absolute left-0 top-full mt-1 z-[61] w-64 bg-slate-800 border border-white/10 rounded-xl shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      {[
                        { label: 'Recordatorio suave', fn: () => messageTemplates.reminderSoft(businessName || 'Nuestro negocio', customer.nombre || entityId, formatCurrency(balances.total, '$'), '') },
                        { label: 'Recordatorio urgente', fn: () => messageTemplates.reminderUrgent(businessName || 'Nuestro negocio', customer.nombre || entityId, formatCurrency(balances.total, '$')) },
                        { label: 'Aviso de vencimiento', fn: () => messageTemplates.reminderOverdue(businessName || 'Nuestro negocio', customer.nombre || entityId, formatCurrency(balances.total, '$'), 15) },
                        { label: 'Aviso final', fn: () => messageTemplates.reminderFinal(businessName || 'Nuestro negocio', customer.nombre || entityId, formatCurrency(balances.total, '$'), 30) },
                      ].map((tpl) => (
                        <button
                          key={tpl.label}
                          onClick={() => {
                            shareViaWhatsApp(customer.telefono!, tpl.fn());
                            setShowWhatsAppMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.07] transition-colors"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREDIT SECTION */}
      {creditLimit > 0 && (
        <div className="app-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={14} className="text-violet-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Limite de Credito
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Limite</p>
              <p className="text-2xl font-black text-violet-600 dark:text-violet-400">
                {formatCurrency(creditLimit, '$')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Usado</p>
              <p className={`text-2xl font-black text-${creditColor}-600 dark:text-${creditColor}-400`}>
                {formatCurrency(creditUsed, '$')}
              </p>
              <div className="mt-2 w-full h-2 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all bg-${creditColor}-500`}
                  style={{ width: `${Math.min(100, creditPct)}%` }}
                />
              </div>
              <p className={`text-[9px] font-black text-${creditColor}-500 mt-1`}>
                {creditPct.toFixed(0)}% utilizado
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Disponible</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(creditAvailable, '$')}
              </p>
            </div>
          </div>

          {/* Per-account balances — dynamic */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 grid gap-3 text-center"
            style={{ gridTemplateColumns: `repeat(${Math.max(3, distinctAccounts.length)}, 1fr)` }}>
            {distinctAccounts.map((acc) => {
              const val = (balances as Record<string, number>)[acc] ?? 0;
              return (
              <div key={acc}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-[9px] font-black uppercase text-slate-400">
                    {accountLabels[acc] ?? acc}
                  </span>
                </div>
                <span
                  className={`text-sm font-black font-mono ${
                    val > 0.01 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatCurrency(Math.abs(val), '$')}
                </span>
              </div>
              );
            })}
            {distinctAccounts.length === 0 && (
              <>
                {[{ label: 'BCV', value: balances.bcv }, { label: 'GRUPO', value: balances.grupo }, { label: 'DIVISA', value: balances.divisa }].map(acct => (
                  <div key={acct.label}>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="text-[9px] font-black uppercase text-slate-400">{acct.label}</span>
                    </div>
                    <span className={`text-sm font-black font-mono ${acct.value > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(Math.abs(acct.value), '$')}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* KPIs + AGING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KPIs */}
        <div className="app-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-indigo-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Analytics
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase text-slate-400">Total Historico</p>
              <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.totalHistorical, '$')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase text-slate-400">Ticket Promedio</p>
              <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.ticketAverage, '$')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase text-slate-400">Dias Prom. Pago</p>
              <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                {kpis.avgPaymentDays > 0 ? `${kpis.avgPaymentDays}d` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase text-slate-400">Dias sin pago</p>
              <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                {kpis.daysSinceLastPayment !== null ? `${kpis.daysSinceLastPayment}d` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* AGING BUCKETS */}
        <div className="app-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={14} className="text-amber-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Antigüedad de Deuda
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: '0-30d', value: aging.current, color: 'emerald' },
              { label: '31-60d', value: aging.d31_60, color: 'amber' },
              { label: '61-90d', value: aging.d61_90, color: 'orange' },
              { label: '90+d', value: aging.d90plus, color: 'rose' },
            ] as const).map((bucket) => (
              <div
                key={bucket.label}
                className={`rounded-xl border px-3 py-3 text-center ${
                  bucket.value > 0
                    ? `border-${bucket.color}-200 dark:border-${bucket.color}-500/20 bg-${bucket.color}-50 dark:bg-${bucket.color}-500/10`
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900'
                }`}
              >
                <p className={`text-[9px] font-black uppercase ${
                  bucket.value > 0 ? `text-${bucket.color}-600 dark:text-${bucket.color}-400` : 'text-slate-400'
                }`}>
                  {bucket.label}
                </p>
                <p className={`text-base font-black font-mono ${
                  bucket.value > 0 ? `text-${bucket.color}-700 dark:text-${bucket.color}-300` : 'text-slate-300 dark:text-slate-600'
                }`}>
                  {formatCurrency(bucket.value, '$')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TREND + DEBT DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="app-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Tendencia 6 meses
            </h3>
            <span className="text-[9px] font-bold uppercase text-slate-400">
              Cargos vs Abonos
            </span>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barSize={14}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value)),
                    name,
                  ]}
                />
                <Bar dataKey="cargos" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="abonos" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DEBT DISTRIBUTION */}
        <div className="app-panel p-6">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
            Distribución de Deuda
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="font-bold text-slate-600 dark:text-slate-400">Divisa</span>
              </div>
              <span className="font-black font-mono text-slate-800 dark:text-slate-200">
                {formatCurrency(Math.abs(balances.divisa), '$')}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="font-bold text-slate-600 dark:text-slate-400">BCV</span>
              </div>
              <span className="font-black font-mono text-slate-800 dark:text-slate-200">
                {formatCurrency(Math.abs(balances.bcv * (rates.bcv || 1)), 'Bs')}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="font-bold text-slate-600 dark:text-slate-400">Grupo</span>
              </div>
              <span className="font-black font-mono text-slate-800 dark:text-slate-200">
                {formatCurrency(Math.abs(balances.grupo * (rates.grupo || 1)), 'Bs')}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400">Total USD</span>
            <span
              className={`text-xl font-black font-mono ${
                balances.total > 0.01 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {formatCurrency(Math.abs(balances.total), '$')}
            </span>
          </div>
        </div>
      </div>

      {/* RECENT MOVEMENTS */}
      <div className="app-panel overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Últimos Movimientos
          </h3>
          <span className="text-[9px] font-bold text-slate-400">{entityMovs.length} total</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.07]">
          {recentMovements.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm italic">
              Sin movimientos registrados
            </div>
          ) : (
            recentMovements.map((mov) => {
              const isInvoice = mov.movementType === MovementType.FACTURA;
              const amount = getMovementUsdAmount(mov, rates);
              return (
                <div
                  key={mov.id}
                  className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isInvoice
                        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500'
                        : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {isInvoice ? <FileText size={14} /> : <Receipt size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                        {mov.concept}
                      </p>
                      {mov.nroControl && (
                        <span className="text-[8px] font-black text-slate-400 dark:text-white/25">#{mov.nroControl}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                      <span>{formatDateTime(mov.createdAt || mov.date)}</span>
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.07]">
                        {mov.accountType}
                      </span>
                      {isInvoice && mov.dueDate && (
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                          new Date(mov.dueDate) < new Date()
                            ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        }`}>
                          Vence: {new Date(mov.dueDate).toLocaleDateString('es-VE')}
                        </span>
                      )}
                      {isInvoice && hasActiveDiscount(mov) && (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          -{mov.earlyPayDiscountPct}% dto. vigente
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-black font-mono ${
                      isInvoice ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {isInvoice ? '+' : '-'}{formatCurrency(amount, '$')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* INTERNAL NOTES */}
      <div className="app-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={14} className="text-slate-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas Internas</h3>
          <span className="text-[9px] text-slate-300 dark:text-slate-600 font-bold">(Solo visible para el equipo)</span>
        </div>
        <textarea
          value={internalNotes}
          onChange={e => setInternalNotes(e.target.value)}
          placeholder="Notas sobre este cliente: preferencias, historial de comunicación, alertas internas..."
          rows={3}
          className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-white/20 font-medium"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleSaveNotes}
            disabled={notesSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-50"
          >
            {notesSaved ? <><Check size={12} /> Guardado</> : <><Save size={12} /> Guardar Notas</>}
          </button>
        </div>
      </div>

      {/* TAGS + BIRTHDAY */}
      <div className="app-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Tag size={14} className="text-slate-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Etiquetas</h3>
          {tagsSaving && <span className="text-[9px] text-amber-500 font-bold">Guardando...</span>}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
              {t}
              <button onClick={() => handleRemoveTag(t)} className="ml-0.5 hover:text-rose-500 transition-colors">&times;</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-xs text-slate-400 italic">Sin etiquetas</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
            placeholder="Ej: VIP, mayorista, referido..."
            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-300 dark:placeholder:text-white/20 font-medium"
          />
          <button onClick={handleAddTag} disabled={!tagInput.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-40">
            Agregar
          </button>
        </div>

        <div className="flex items-center gap-2 mt-6 mb-3">
          <Calendar size={14} className="text-slate-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cumpleaños</h3>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            className="flex-1 max-w-[200px] px-3 py-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
          />
          <button
            onClick={handleSaveBirthday}
            disabled={birthdaySaving || birthday === (customer?.birthday ?? '')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-40"
          >
            {birthdaySaved ? <><Check size={12} /> Guardado</> : <><Save size={12} /> Guardar</>}
          </button>
        </div>
      </div>

      {/* COMUNICACIONES */}
      <div className="app-panel overflow-hidden">
        <button
          onClick={() => setCommsOpen(!commsOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-indigo-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Comunicaciones
            </h3>
            {communications.length > 0 && (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-white/[0.07] px-2 py-0.5 rounded-full">
                {communications.length}
              </span>
            )}
          </div>
          {commsOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {commsOpen && (
          <div className="border-t border-slate-200 dark:border-white/10">
            {/* Registrar contacto button */}
            <div className="px-6 py-3 border-b border-slate-100 dark:border-white/[0.07]">
              <button
                onClick={() => setCommModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-md shadow-indigo-500/25"
              >
                <Plus size={12} /> Registrar Contacto
              </button>
            </div>

            {/* Communications list */}
            <div className="divide-y divide-slate-100 dark:divide-white/[0.07] max-h-[400px] overflow-y-auto">
              {communications.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm italic">
                  Sin comunicaciones registradas
                </div>
              ) : (
                communications.map((comm) => {
                  const meta = COMM_TYPE_META[comm.type] || { icon: <StickyNote size={14} />, label: comm.type };
                  const dateStr = comm.date?.toDate
                    ? comm.date.toDate().toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : comm.date
                    ? new Date(comm.date).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <div
                      key={comm.id}
                      className="px-6 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {meta.label}
                          </span>
                          {comm.outcome && (
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${OUTCOME_COLORS[comm.outcome] || 'bg-slate-100 dark:bg-white/[0.07] text-slate-500'}`}>
                              {OUTCOME_LABELS[comm.outcome] || comm.outcome}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {comm.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                          <span>{dateStr}</span>
                          {comm.userName && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span>{comm.userName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Communication Modal */}
      <CommunicationModal
        open={commModalOpen}
        onClose={() => setCommModalOpen(false)}
        customerId={customer?.id || entityId}
        customerName={entityId}
        businessId={businessId}
        userId={userId}
        userName=""
      />

      {/* ACTIONS */}
      <div className="app-panel p-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onViewLedger}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-indigo-500/25 hover:from-indigo-700 hover:to-violet-700 transition-all"
          >
            <FileText size={14} /> Ver Historial Completo
          </button>
          {balances.total > 0.01 && (
            <button
              onClick={onRegisterAbono}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700 transition-all"
            >
              <Receipt size={14} /> Registrar Abono
            </button>
          )}
          <button
            onClick={onShareWhatsApp}
            className="px-6 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
          >
            <Share2 size={14} /> Compartir Estado
          </button>
          <button
            onClick={onExportPdf}
            className="px-6 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
          >
            <FileText size={14} /> Exportar PDF
          </button>
          <button
            onClick={handleGeneratePortalAccess}
            disabled={portalGenerating}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md shadow-sky-500/25 hover:from-sky-600 hover:to-cyan-700 transition-all disabled:opacity-50"
          >
            <Globe size={14} /> {portalGenerating ? 'Generando...' : 'Generar Acceso Portal'}
          </button>
        </div>

        {/* Portal link display + QR */}
        {portalLink && (
          <div className="bg-sky-50 dark:bg-sky-500/5 border border-sky-200 dark:border-sky-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              {/* QR Code */}
              <div className="shrink-0 bg-white rounded-xl p-1.5 shadow-sm border border-sky-100 dark:border-sky-500/20">
                <canvas ref={qrCanvasRef} className="w-20 h-20 sm:w-24 sm:h-24" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-2">
                  Acceso Portal Generado
                </p>
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate mb-1">
                  {portalLink}
                </p>
                <p className="text-xs font-black text-slate-600 dark:text-slate-400 mb-3">
                  PIN: <span className="text-sky-600 dark:text-sky-400 tracking-widest">{portalPin}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copyPortalLink}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-sky-600 transition-all"
                  >
                    {portalCopied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                  </button>
                  {customer?.telefono && (
                    <button
                      onClick={() => shareViaWhatsApp(
                        customer.telefono!,
                        messageTemplates.portalAccess(
                          businessName || 'tu negocio',
                          customer.nombre || 'Cliente',
                          portalLink,
                          portalPin,
                        ),
                      )}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition-all"
                      title="Enviar por WhatsApp"
                    >
                      <MessageSquare size={12} /> WhatsApp
                    </button>
                  )}
                  {customer?.email && (
                    <button
                      onClick={() => shareViaEmail(
                        customer.email!,
                        `Acceso a tu portal — ${businessName || 'tu negocio'}`,
                        messageTemplates.portalAccess(
                          businessName || 'tu negocio',
                          customer.nombre || 'Cliente',
                          portalLink,
                          portalPin,
                        ),
                      )}
                      className="px-4 py-2.5 rounded-xl bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-violet-600 transition-all"
                      title="Enviar por email"
                    >
                      <Mail size={12} /> Email
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-sky-500/60 dark:text-sky-400/40 mt-3 text-center">
              Escanea el QR o comparte el enlace + PIN con tu cliente
            </p>
          </div>
        )}

        {/* ── Loyalty Tier + Segments ── */}
        {(customer?.loyaltyTier || customer?.segments?.length) && (
          <div className="flex flex-wrap gap-2">
            {customer.loyaltyTier && (
              <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {customer.loyaltyTier === 'bronce' ? '🥉' : customer.loyaltyTier === 'plata' ? '🥈' : customer.loyaltyTier === 'oro' ? '🥇' : customer.loyaltyTier === 'platino' ? '💎' : customer.loyaltyTier === 'diamante' ? '💠' : '👑'} {customer.loyaltyTier}
                {customer.loyaltyPoints ? ` — ${customer.loyaltyPoints.toLocaleString()} pts` : ''}
              </span>
            )}
            {customer.segments?.map(seg => (
              <span key={seg} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {seg}
              </span>
            ))}
          </div>
        )}

        {/* ── KYC Verification Status ── */}
        {customer?.kycStatus && (
          <div className={`rounded-2xl border p-5 ${
            customer.kycStatus === 'verified'
              ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20'
              : customer.kycStatus === 'pending'
              ? 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20'
              : 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/30">
                Verificación KYC
              </p>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                customer.kycStatus === 'verified'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : customer.kycStatus === 'pending'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}>
                {customer.kycStatus === 'verified' ? 'Verificado' : customer.kycStatus === 'pending' ? 'Pendiente' : 'Rechazado'}
              </span>
            </div>

            {/* Cedula images */}
            {(customer.cedulaFrontalUrl || customer.cedulaTraseraUrl) && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                {customer.cedulaFrontalUrl && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-white/20 mb-1">Frente</p>
                    <a href={customer.cedulaFrontalUrl} target="_blank" rel="noopener noreferrer">
                      <img src={customer.cedulaFrontalUrl} alt="Cédula frente" className="w-full rounded-lg border border-white/10 hover:opacity-80 transition-opacity" />
                    </a>
                  </div>
                )}
                {customer.cedulaTraseraUrl && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-white/20 mb-1">Reverso</p>
                    <a href={customer.cedulaTraseraUrl} target="_blank" rel="noopener noreferrer">
                      <img src={customer.cedulaTraseraUrl} alt="Cédula reverso" className="w-full rounded-lg border border-white/10 hover:opacity-80 transition-opacity" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {customer.kycSubmittedAt && (
              <p className="text-[10px] text-slate-400 dark:text-white/20 mb-3">
                Enviado: {new Date(customer.kycSubmittedAt).toLocaleDateString('es-VE')}
              </p>
            )}

            {/* Approve/Reject buttons for pending */}
            {customer.kycStatus === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await updateDoc(doc(db, 'customers', entityId), {
                      kycStatus: 'verified',
                      kycVerifiedAt: new Date().toISOString(),
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
                >
                  Aprobar
                </button>
                <button
                  onClick={async () => {
                    await updateDoc(doc(db, 'customers', entityId), {
                      kycStatus: 'rejected',
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all"
                >
                  Rechazar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
