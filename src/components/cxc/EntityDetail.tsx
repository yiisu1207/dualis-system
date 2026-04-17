import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, CreditCard, MessageCircle, ChevronLeft, ArrowLeftRight, Loader2, ShieldCheck, Repeat, Trash2, Globe, Copy, Check, MessageSquare, Mail, ExternalLink, Pencil, User, Phone, MapPin, Hash, Calendar, Shield, Star, Clock, CheckCircle2, XCircle, Ban, AlertCircle, Share2, TrendingUp, TrendingDown, Activity, Tag, Hourglass, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Customer, Supplier, Movement, CustomRate, ExchangeRates, CreditScore, PendingMovement, PortalAccessToken } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import {
  calcAccountBalances,
  calculateAgingBuckets,
  calcCreditScore,
  daysSince,
  getInitials,
  resolveAccountLabel,
  formatDateTime,
} from './cxcHelpers';
import { AccountCard } from './AccountCard';
import VerificationBadge from '../VerificationBadge';
import { LedgerView } from './LedgerView';
import ExportPanel from './ExportPanel';
import type { CompanyInfo } from '../../utils/clientStatementExports';
import { collection, query, where, getDocs, addDoc, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { shareViaWhatsApp, shareViaEmail, messageTemplates } from '../../utils/shareLink';
import { Key } from 'lucide-react';
import NewClientModal from './NewClientModal';

interface EntityDetailProps {
  mode: 'cxc' | 'cxp';
  entity: Customer | Supplier;
  movements: Movement[];
  rates: ExchangeRates;
  bcvRate: number;
  customRates: CustomRate[];
  onRegisterMovement: (type: 'FACTURA' | 'ABONO', accountPreset?: string) => void;
  onEditMovement?: (movement: Movement) => void;
  onDeleteMovement?: (id: string) => void;
  onUpdateEntity?: (id: string, data: Partial<Customer>) => Promise<void>;
  onCompensate?: (fromAccount: string, toAccount: string, amountUSD: number) => Promise<void>;
  /** D.6 — cross-compensate CxC↔CxP when entity is both client and supplier */
  onCrossCompensate?: (amountUSD: number, direction: 'cxc-to-cxp' | 'cxp-to-cxc') => Promise<void>;
  /** Name of the linked counterpart (supplier if mode=cxc, customer if mode=cxp) */
  linkedCounterpartName?: string;
  onDeleteEntity?: (id: string) => Promise<void>;
  onBack?: () => void;
  canEdit: boolean;
  pendingMovements?: PendingMovement[];
  onApprovePending?: (pendingId: string, note?: string) => Promise<void>;
  onRejectPending?: (pendingId: string, reason: string) => Promise<void>;
  onCancelPending?: (pendingId: string) => Promise<void>;
  currentUserId?: string;
  currentUserName?: string;
  /** Fase D.2 — enable inline verify controls on movement rows */
  canVerify?: boolean;
  /** Portal access — needed to create/show portal link */
  businessId?: string;
  userId?: string;
  slug?: string;
  businessName?: string;
  /** All customers — used for duplicate detection in edit modal */
  allCustomers?: Customer[];
}

type Tab = 'resumen' | 'datos' | 'movimientos' | 'pendientes' | 'config';

/* ── Helpers para panel de aprobaciones inline ────────────────────────── */
const fmtDateApproval = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};
const fmtMoney = (n?: number) =>
  typeof n === 'number' ? `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const STATUS_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string; size?: number }> }> = {
  pending:   { label: 'Pendiente',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',       Icon: Clock },
  approved:  { label: 'Aprobado',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2 },
  rejected:  { label: 'Rechazado',  cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',          Icon: XCircle },
  cancelled: { label: 'Cancelado',  cls: 'bg-slate-500/15 text-slate-300 border-slate-500/40',       Icon: Ban },
};

/* ── Card completa de aprobación (portada de AprobacionesPanel) ──────── */
const PendingFullCard: React.FC<{
  p: PendingMovement;
  mode: 'inbox' | 'mine' | 'history';
  currentUserId?: string;
  onApprove?: (id: string, note?: string) => Promise<void>;
  onReject?: (id: string, reason: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
}> = ({ p, mode, currentUserId, onApprove, onReject, onCancel }) => {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [acted, setActed] = useState(false);

  const d = p.movementDraft || {} as any;
  const alreadySigned = p.approvals?.some((a: any) => a.userId === currentUserId);
  const isCreator = p.createdBy === currentUserId;
  const canAct = mode === 'inbox' && !isCreator && !alreadySigned && !acted && p.status === 'pending';
  const meta = STATUS_META[p.status] || STATUS_META.pending;
  const StatusIcon = meta.Icon;
  const pct = Math.min(100, Math.round(((p.approvals?.length || 0) / Math.max(1, p.quorumRequired || 2)) * 100));

  const handleApprove = async () => {
    if (!onApprove || acted) return;
    setBusy(true); setActed(true);
    try { await onApprove(p.id, approveNote.trim() || undefined); }
    catch { setActed(false); }
    finally { setBusy(false); setApproveNote(''); }
  };
  const handleReject = async () => {
    if (!onReject || !rejectReason.trim()) return;
    setBusy(true); setActed(true);
    try { await onReject(p.id, rejectReason.trim()); }
    catch { setActed(false); }
    finally { setBusy(false); setShowRejectForm(false); setRejectReason(''); }
  };
  const handleCancel = async () => {
    if (!onCancel || !window.confirm('¿Cancelar esta solicitud? No se podrá deshacer.')) return;
    setBusy(true); setActed(true);
    try { await onCancel(p.id); }
    catch { setActed(false); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 dark:bg-white/[0.02] p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
              <StatusIcon size={12} /> {meta.label}
            </span>
            <span className="text-sm font-black text-slate-900 dark:text-white truncate">
              {d.concept || 'Movimiento sin concepto'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-white/30 font-bold">
            <span className="inline-flex items-center gap-1"><User size={11} /> {p.createdByName || p.createdBy}</span>
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmtDateApproval(p.createdAt)}</span>
            <span className="font-black text-emerald-400">{fmtMoney(d.amountInUSD)}</span>
          </div>
        </div>
        <div className="w-36 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 dark:bg-white/[0.06]">
              <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-black text-slate-300 dark:text-white/50 tabular-nums">{p.approvals?.length || 0}/{p.quorumRequired}</span>
          </div>
          <p className="text-right text-[9px] text-slate-500 dark:text-white/20 mt-0.5">Validadores: {p.quorumSnapshot?.validatorCount || '—'}</p>
        </div>
      </div>

      {/* Expand toggle */}
      <button onClick={() => setExpanded(v => !v)} className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300">
        <FileText size={12} /> {expanded ? 'Ocultar detalles' : 'Ver detalles del movimiento'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Draft summary — todos los detalles del movimiento pendiente */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 dark:border-white/[0.06] bg-black/20 dark:bg-white/[0.02] p-3 text-[11px] text-slate-300 dark:text-white/50 md:grid-cols-4">
            <div><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Tipo</div><div className="font-bold text-slate-200 dark:text-white/70">{String(d.movementType || '—')}</div></div>
            <div><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Cuenta</div><div className="font-bold text-slate-200 dark:text-white/70">{String(d.accountType || '—')}</div></div>
            <div><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Moneda</div><div className="font-bold text-slate-200 dark:text-white/70">{String(d.currency || '—')}</div></div>
            <div><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Fecha</div><div className="font-bold text-slate-200 dark:text-white/70">{d.date || '—'}</div></div>

            <div>
              <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Monto original</div>
              <div className="font-black text-slate-100 dark:text-white/80 tabular-nums">
                {typeof d.amount === 'number'
                  ? `${d.currency === 'BS' ? 'Bs ' : '$'}${d.amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Tasa usada</div>
              <div className="font-black text-indigo-300 tabular-nums">
                {typeof d.rateUsed === 'number' && d.rateUsed > 0
                  ? `Bs ${d.rateUsed.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Equivalente USD</div>
              <div className="font-black text-emerald-400 tabular-nums">{fmtMoney(d.amountInUSD)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Equivalente Bs</div>
              <div className="font-black text-amber-300 tabular-nums">
                {typeof d.amountInUSD === 'number' && typeof d.rateUsed === 'number' && d.rateUsed > 0
                  ? `Bs ${(d.amountInUSD * d.rateUsed).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </div>
            </div>

            <div className="col-span-2 md:col-span-4"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Concepto</div><div className="font-bold text-slate-200 dark:text-white/70 truncate">{d.concept || '—'}</div></div>
            {d.nroControl && <div className="col-span-2"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Nro Control</div><div className="font-mono text-slate-300 dark:text-white/50">{d.nroControl}</div></div>}
            {(d.reference || d.referencia) && <div className="col-span-2"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Referencia</div><div className="font-mono text-slate-300 dark:text-white/50">{d.reference || d.referencia}</div></div>}
            {d.metodoPago && <div className="col-span-2"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Método</div><div className="font-bold text-slate-200 dark:text-white/70">{String(d.metodoPago)}</div></div>}
            {d.expenseCategory && <div className="col-span-2"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Categoría gasto</div><div className="font-bold text-slate-200 dark:text-white/70">{String(d.expenseCategory)}</div></div>}
            {d.movementType === 'FACTURA' && (
              <>
                <div className="col-span-2">
                  <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Condición</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {(typeof d.paymentDays === 'number' && d.paymentDays > 0) || d.esVentaContado === false ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[9px] font-black uppercase tracking-wider">
                          Crédito
                        </span>
                        <span className="font-bold text-slate-200 dark:text-white/70">
                          {d.paymentDays}d{d.dueDate ? ` · vence ${d.dueDate}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-black uppercase tracking-wider">
                        Contado
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Dscto. pronto pago</div>
                  <div className="font-bold mt-0.5">
                    {typeof d.earlyPayDiscountPct === 'number' && d.earlyPayDiscountPct > 0 ? (
                      <span className="text-emerald-300">
                        {d.earlyPayDiscountPct}%{d.earlyPayDiscountExpiry ? ` hasta ${d.earlyPayDiscountExpiry}` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-white/25">Sin descuento</span>
                    )}
                  </div>
                </div>
              </>
            )}
            {d.entityId && (
              <div className="col-span-2"><div className="text-[9px] uppercase text-slate-500 dark:text-white/20 font-black">Entidad</div><div className="font-mono text-slate-300 dark:text-white/50">{String(d.entityId)}</div></div>
            )}
          </div>

          {/* Signatures */}
          {(p.approvals?.length || 0) > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-[11px]">
              <div className="mb-1.5 font-black text-emerald-400 text-[10px] uppercase tracking-wider">Firmas ({p.approvals.length}/{p.quorumRequired})</div>
              <ul className="space-y-1 text-slate-300 dark:text-white/50">
                {p.approvals.map((a: any, i: number) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span className="font-bold">{a.userName || 'Usuario'}</span>
                    <span className="text-slate-500 dark:text-white/20">— {fmtDateApproval(a.at)}</span>
                    {a.note && <span className="italic text-slate-400 dark:text-white/30">"{a.note}"</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rejections */}
          {(p.rejections?.length || 0) > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3 text-[11px]">
              <div className="mb-1.5 font-black text-rose-400 text-[10px] uppercase tracking-wider">Rechazos</div>
              <ul className="space-y-1 text-slate-300 dark:text-white/50">
                {p.rejections.map((r: any, i: number) => (
                  <li key={i}>
                    <span className="font-bold">{r.userName}</span>
                    <span className="text-slate-500 dark:text-white/20"> — {fmtDateApproval(r.at)}</span>
                    <div className="pl-4 italic text-slate-400 dark:text-white/30">"{r.reason}"</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Committed info */}
          {p.committedMovementId && (
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <CheckCircle2 size={12} />
              Registrado como movimiento <code className="font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">{p.committedMovementId.slice(0, 8)}…</code> el {fmtDateApproval(p.committedAt)}
            </div>
          )}
        </div>
      )}

      {/* Action bar — inbox mode */}
      {canAct && (
        <div className="mt-3 space-y-2 border-t border-white/10 dark:border-white/[0.06] pt-3">
          {!showRejectForm ? (
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="Nota opcional…"
                className="min-w-[140px] flex-1 rounded-lg border border-white/10 dark:border-white/[0.08] bg-black/20 dark:bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white dark:text-white/80 placeholder:text-slate-500 dark:placeholder:text-white/20 focus:border-emerald-500/50 outline-none" />
              <button disabled={busy} onClick={handleApprove}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-500 disabled:opacity-50 transition-all">
                <ShieldCheck size={13} /> Aprobar
              </button>
              <button disabled={busy} onClick={() => setShowRejectForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-[11px] font-black text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition-all">
                <XCircle size={13} /> Rechazar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Razón del rechazo (obligatoria)"
                className="min-w-[160px] flex-1 rounded-lg border border-rose-500/40 bg-black/20 dark:bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white dark:text-white/80 placeholder:text-slate-500 dark:placeholder:text-white/20 focus:border-rose-500 outline-none" autoFocus />
              <button disabled={busy || !rejectReason.trim()} onClick={handleReject}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">Confirmar</button>
              <button onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                className="text-[11px] font-bold text-white/40 hover:text-white/70">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* Info messages */}
      {mode === 'inbox' && !canAct && p.status === 'pending' && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-white/10 dark:border-white/[0.06] pt-3 text-[10px] font-bold text-slate-500 dark:text-white/25">
          <AlertCircle size={12} />
          {isCreator ? 'No puedes aprobar tu propia solicitud.' : alreadySigned ? 'Ya firmaste esta solicitud.' : 'No puedes actuar sobre esta solicitud.'}
        </div>
      )}

      {/* Creator can cancel */}
      {mode === 'mine' && p.status === 'pending' && (
        <div className="mt-3 border-t border-white/10 dark:border-white/[0.06] pt-3">
          <button disabled={busy} onClick={handleCancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-500/40 px-3 py-1.5 text-[10px] font-black text-slate-400 hover:bg-slate-500/10 disabled:opacity-50 transition-all">
            <Ban size={12} /> Cancelar mi solicitud
          </button>
        </div>
      )}
    </div>
  );
};

const SCORE_STYLES: Record<string, { bg: string; text: string }> = {
  EXCELENTE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  BUENO: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
  REGULAR: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  RIESGO: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
};

export function EntityDetail({
  mode,
  entity,
  movements,
  rates,
  bcvRate,
  customRates,
  onRegisterMovement,
  onEditMovement,
  onDeleteMovement,
  onUpdateEntity,
  onCompensate,
  onCrossCompensate,
  linkedCounterpartName,
  onDeleteEntity,
  onBack,
  canEdit,
  pendingMovements = [],
  onApprovePending,
  onRejectPending,
  onCancelPending,
  currentUserId,
  currentUserName,
  canVerify,
  businessId,
  userId,
  slug,
  businessName,
  allCustomers = [],
}: EntityDetailProps) {
  const [tab, setTab] = useState<Tab>('resumen');
  const [compOpen, setCompOpen] = useState(false);
  const [compFrom, setCompFrom] = useState('');
  const [crossCompOpen, setCrossCompOpen] = useState(false);
  const [crossCompAmount, setCrossCompAmount] = useState('');
  const [crossCompDirection, setCrossCompDirection] = useState<'cxc-to-cxp' | 'cxp-to-cxc'>('cxc-to-cxp');
  const [crossCompSaving, setCrossCompSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [compTo, setCompTo] = useState('');
  const [compAmount, setCompAmount] = useState('');
  const [compSaving, setCompSaving] = useState(false);

  const isCxC = mode === 'cxc';
  const customer = isCxC ? (entity as Customer) : null;

  const entityName = (entity as any).fullName || (entity as any).nombre || entity.id || 'Entidad';
  const entityDoc = (entity as Customer).cedula || (entity as Customer).rif || (entity as Supplier).rif || '';

  // ── Portal access state ──
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalPin, setPortalPin] = useState<string | null>(null);
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [portalTokenId, setPortalTokenId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pendingOTP, setPendingOTP] = useState<string | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // ── Company info (for PDF exports) — loaded once from businessConfigs ──
  const [company, setCompany] = useState<CompanyInfo>({});
  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, 'businessConfigs', businessId)).then(snap => {
      if (!snap.exists()) return;
      const d: any = snap.data();
      setCompany({
        name: d.companyName || businessName,
        rif: d.companyRif,
        phone: d.companyPhone,
        address: d.companyAddress,
        email: d.companyEmail,
        logo: d.companyLogo,
      });
    }).catch(() => {});
  }, [businessId, businessName]);


  // Listen for pending OTP code for this customer (real-time)
  useEffect(() => {
    if (!businessId || !entity.id || !isCxC || !portalTokenId) return;
    const otpRef = doc(db, 'businesses', businessId, 'portalOTP', portalTokenId);
    const unsub = onSnapshot(otpRef, (snap) => {
      if (!snap.exists()) { setPendingOTP(null); return; }
      const data = snap.data();
      if (data.expiresAt > Date.now()) {
        setPendingOTP(data.code);
      } else {
        setPendingOTP(null);
      }
    }, () => setPendingOTP(null));
    return () => unsub();
  }, [businessId, entity.id, isCxC, portalTokenId]);

  // Also check by customerId (fallback)
  useEffect(() => {
    if (!businessId || !entity.id || !isCxC || portalTokenId) return;
    const otpRef = doc(db, 'businesses', businessId, 'portalOTP', entity.id);
    const unsub = onSnapshot(otpRef, (snap) => {
      if (!snap.exists()) { setPendingOTP(null); return; }
      const data = snap.data();
      if (data.expiresAt > Date.now()) {
        setPendingOTP(data.code);
      } else {
        setPendingOTP(null);
      }
    }, () => setPendingOTP(null));
    return () => unsub();
  }, [businessId, entity.id, isCxC, portalTokenId]);

  // Query existing portal access for this customer
  useEffect(() => {
    if (!businessId || !entity.id || !isCxC) return;
    let cancelled = false;
    setPortalLoading(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'businesses', businessId, 'portalAccess'),
          where('customerId', '==', entity.id),
          where('active', '==', true),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        if (!snap.empty) {
          const tokenDoc = snap.docs[0];
          const data = tokenDoc.data() as PortalAccessToken;
          const host = window.location.origin;
          const link = slug
            ? `${host}/portal/${slug}?token=${tokenDoc.id}`
            : `${host}/portal?token=${tokenDoc.id}`;
          setPortalLink(link);
          setPortalPin(data.pin || null);
          setPortalTokenId(tokenDoc.id);
        } else {
          setPortalLink(null);
          setPortalPin(null);
          setPortalTokenId(null);
        }
      } catch (err) {
        console.error('[Portal access query]', err);
      } finally {
        if (!cancelled) setPortalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, entity.id, isCxC, slug]);

  const handleCreatePortalAccess = async () => {
    if (!businessId || !userId || portalGenerating) return;
    setPortalGenerating(true);
    try {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const token: Omit<PortalAccessToken, 'id'> = {
        customerId: entity.id,
        customerName: entityName,
        pin,
        createdAt: new Date().toISOString(),
        createdBy: userId,
        active: true,
      };
      const docRef = await addDoc(
        collection(db, 'businesses', businessId, 'portalAccess'),
        token,
      );
      const host = window.location.origin;
      const link = slug
        ? `${host}/portal/${slug}?token=${docRef.id}`
        : `${host}/portal?token=${docRef.id}`;
      setPortalLink(link);
      setPortalPin(pin);
      setPortalTokenId(docRef.id);
    } catch (err) {
      console.error('Error generating portal access:', err);
    } finally {
      setPortalGenerating(false);
    }
  };

  const copyPortalLink = () => {
    if (!portalLink) return;
    const text = portalPin
      ? `Portal de Cliente\nEnlace: ${portalLink}\nPIN: ${portalPin}`
      : `Portal de Cliente\nEnlace: ${portalLink}`;
    navigator.clipboard.writeText(text);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2000);
  };

  const entityMovements = useMemo(
    () => movements.filter(m => m.entityId === entity.id && (isCxC ? !m.isSupplierMovement : m.isSupplierMovement)),
    [movements, entity.id, isCxC]
  );

  // Fase D.0 — ALL pendings para esta entidad (todos los estados para tabs inbox/mine/history)
  const allEntityPendings = useMemo(
    () => pendingMovements.filter(p =>
      p.movementDraft?.entityId === entity.id &&
      (isCxC ? !p.movementDraft?.isSupplierMovement : p.movementDraft?.isSupplierMovement)
    ),
    [pendingMovements, entity.id, isCxC]
  );

  // Dividir en inbox (puedo firmar), mine (yo creé), history (finalizados)
  const { pendingInbox, pendingMine, pendingHistory } = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const inbox: PendingMovement[] = [];
    const mine: PendingMovement[] = [];
    const history: PendingMovement[] = [];
    for (const p of allEntityPendings) {
      if (p.status === 'pending') {
        if (p.createdBy === currentUserId) mine.push(p);
        if (p.createdBy !== currentUserId && !p.approvals?.some((a: any) => a.userId === currentUserId)) inbox.push(p);
      } else {
        const t = new Date(p.createdAt).getTime();
        if (Number.isFinite(t) && t >= thirtyDaysAgo) history.push(p);
      }
    }
    const byDate = (a: PendingMovement, b: PendingMovement) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    inbox.sort(byDate); mine.sort(byDate); history.sort(byDate);
    return { pendingInbox: inbox, pendingMine: mine, pendingHistory: history };
  }, [allEntityPendings, currentUserId]);

  const entityPendings = allEntityPendings.filter(p => p.status === 'pending');
  const [pendingTab, setPendingTab] = useState<'inbox' | 'mine' | 'history'>('inbox');

  const accountBalances = useMemo(
    () => calcAccountBalances(entityMovements, bcvRate, customRates, rates),
    [entityMovements, bcvRate, customRates, rates]
  );

  const totalBalance = useMemo(
    () => accountBalances.reduce((s, a) => s + a.balance, 0),
    [accountBalances]
  );

  const aging = useMemo(
    () => isCxC ? calculateAgingBuckets(entityMovements, rates) : null,
    [entityMovements, rates, isCxC]
  );

  const score = useMemo(() => isCxC ? calcCreditScore(entityMovements) : null, [entityMovements, isCxC]);

  // 6-month trend data
  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; facturas: number; abonos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: d.toLocaleString('es-VE', { month: 'short' }),
        facturas: 0,
        abonos: 0,
      });
    }
    entityMovements.forEach(m => {
      if (m.anulada) return;
      const mKey = m.date?.slice(0, 7);
      const bucket = months.find(mo => mo.key === mKey);
      if (!bucket) return;
      const usd = getMovementUsdAmount(m, rates);
      if (m.movementType === 'FACTURA') bucket.facturas += usd;
      else if (m.movementType === 'ABONO') bucket.abonos += usd;
    });
    return months;
  }, [entityMovements, rates]);

  // Recent 5 movements
  const recentMovements = useMemo(
    () => [...entityMovements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [entityMovements]
  );

  // Header quick stats — last activity, this-month flow, pending invoices count,
  // avg payment days (historical), next due date
  const headerStats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let monthCargos = 0;
    let monthAbonos = 0;
    let pendingInvoices = 0;
    let lastActivity: string | null = null;

    // Avg payment days: para cada FACTURA pagada con dueDate o paymentDays, calcular
    // días entre date de emisión y date de pago (usando pagado/pagadoAt si existe).
    let paySum = 0;
    let payCount = 0;

    // Next due: FACTURAs no pagadas con dueDate futuro más cercano
    let nextDue: string | null = null;
    let overdueCount = 0;

    for (const m of entityMovements) {
      if (m.anulada) continue;
      const usd = getMovementUsdAmount(m, rates);
      if ((m.date || '').startsWith(monthKey)) {
        if (m.movementType === 'FACTURA') monthCargos += usd;
        else if (m.movementType === 'ABONO') monthAbonos += usd;
      }
      if (m.movementType === 'FACTURA' && !m.pagado && !m.anulada) pendingInvoices++;
      const d = m.date || (m as any).createdAt;
      if (d && (!lastActivity || d > lastActivity)) lastActivity = d;

      // Avg pay days
      if (m.movementType === 'FACTURA' && m.pagado && m.date) {
        const issued = new Date(m.date).getTime();
        const paidAt = (m as any).pagadoAt ? new Date((m as any).pagadoAt).getTime() : null;
        if (paidAt && issued > 0 && paidAt >= issued) {
          paySum += Math.floor((paidAt - issued) / 86_400_000);
          payCount++;
        }
      }

      // Next due
      if (m.movementType === 'FACTURA' && !m.pagado && !m.anulada && m.dueDate) {
        if (new Date(m.dueDate).getTime() < now.getTime()) overdueCount++;
        if (!nextDue || m.dueDate < nextDue) nextDue = m.dueDate;
      }
    }

    const daysSinceActivity = lastActivity ? daysSince(lastActivity) : null;
    const avgPayDays = payCount > 0 ? Math.round(paySum / payCount) : null;
    const nextDueDays = nextDue
      ? Math.ceil((new Date(nextDue).getTime() - now.getTime()) / 86_400_000)
      : null;

    return {
      monthCargos, monthAbonos, pendingInvoices, lastActivity, daysSinceActivity,
      avgPayDays, nextDue, nextDueDays, overdueCount,
    };
  }, [entityMovements, rates]);

  // Credit config state (CxC only)
  // `defaultDays` es `number | null` — null significa "sin período predefinido"
  // (el vendedor lo elige al facturar). Antes defaulteaba a 30 aunque el cliente
  // no tuviera nada guardado → causaba "cables sueltos" con NewClientModal que
  // sí usa null. Unificado 2026-04-09.
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit?.toString() || '0');
  const [defaultDays, setDefaultDays] = useState<number | null>(customer?.defaultPaymentDays ?? null);
  const [creditApproved, setCreditApproved] = useState(customer?.creditApproved ?? false);
  const [internalNotes, setInternalNotes] = useState(customer?.internalNotes || '');
  const [savingConfig, setSavingConfig] = useState(false);

  const handleSaveConfig = async () => {
    if (!onUpdateEntity || !customer) return;
    setSavingConfig(true);
    try {
      // Solo escribimos defaultPaymentDays cuando el usuario eligió un período.
      // Si está en null, omitimos el campo para no sobrescribir con un default
      // espurio (mismo patrón que NewClientModal).
      await onUpdateEntity(customer.id, {
        creditLimit: parseFloat(creditLimit) || 0,
        ...(defaultDays !== null ? { defaultPaymentDays: defaultDays } : {}),
        creditApproved,
        internalNotes: internalNotes.trim(),
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
        tab === t
          ? 'border-indigo-500 text-indigo-500'
          : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'
      }`}
    >
      {label}
    </button>
  );

  const inp = "w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all";
  const lbl = "text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start gap-4 mb-4">
          {onBack && (
            <button onClick={onBack} className="mt-1 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all lg:hidden">
              <ChevronLeft size={16} className="text-slate-400" />
            </button>
          )}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
            totalBalance > 0.01 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-300 dark:text-white/20'
          }`}>
            {getInitials(entityName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-slate-900 dark:text-white truncate">{entityName}</h2>
              {score && (
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${SCORE_STYLES[score]?.bg} ${SCORE_STYLES[score]?.text}`}>
                  {score}
                </span>
              )}
              {isCxC && (customer?.tags || []).slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20"
                >
                  <Tag size={8} /> {tag}
                </span>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 mt-0.5">
              {entityDoc}
              {(entity as Customer).telefono && ` · ${(entity as Customer).telefono}`}
              {(entity as Customer).email && ` · ${(entity as Customer).email}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onRegisterMovement('FACTURA')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all"
            >
              <FileText size={12} /> {isCxC ? 'Cargo' : 'Factura'}
            </button>
            <button
              onClick={() => onRegisterMovement('ABONO')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
            >
              <CreditCard size={12} /> Abono
            </button>
            {(entity as Customer).telefono && (
              <a
                href={`https://wa.me/${(entity as Customer).telefono.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
                title={`WhatsApp: ${(entity as Customer).telefono}`}
              >
                <MessageCircle size={12} /> WhatsApp
              </a>
            )}
            <button
              onClick={() => setExportOpen(true)}
              disabled={entityMovements.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar estado de cuenta"
            >
              <Share2 size={12} /> Exportar
            </button>
            {canEdit && onUpdateEntity && isCxC && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="p-2 rounded-xl text-slate-400 dark:text-white/20 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all"
                title="Editar cliente"
              >
                <Pencil size={14} />
              </button>
            )}
            {onDeleteEntity && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-2 rounded-xl text-slate-400 dark:text-white/20 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                title="Eliminar cliente"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="flex flex-wrap items-stretch gap-2 mb-3">
          <div className={`flex-1 min-w-[120px] rounded-xl border px-3 py-2 ${
            totalBalance > 0.01
              ? 'bg-amber-500/[0.06] border-amber-500/20'
              : totalBalance < -0.01
                ? 'bg-emerald-500/[0.06] border-emerald-500/20'
                : 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06]'
          }`}>
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30">
              {totalBalance > 0.01 ? (isCxC ? 'Te debe' : 'Le debes') : totalBalance < -0.01 ? 'A favor' : 'Al día'}
            </p>
            <p className={`text-sm font-black mt-0.5 ${
              totalBalance > 0.01 ? 'text-amber-500' : totalBalance < -0.01 ? 'text-emerald-500' : 'text-slate-500 dark:text-white/40'
            }`}>
              ${Math.abs(totalBalance).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex-1 min-w-[120px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 flex items-center gap-1">
              <TrendingUp size={9} /> Cargos del mes
            </p>
            <p className="text-sm font-black text-rose-500 mt-0.5">
              ${headerStats.monthCargos.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex-1 min-w-[120px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 flex items-center gap-1">
              <TrendingDown size={9} /> Abonos del mes
            </p>
            <p className="text-sm font-black text-emerald-500 mt-0.5">
              ${headerStats.monthAbonos.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex-1 min-w-[120px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 flex items-center gap-1">
              <Activity size={9} /> Última actividad
            </p>
            <p className="text-sm font-black text-slate-700 dark:text-white/70 mt-0.5">
              {headerStats.daysSinceActivity === null
                ? '—'
                : headerStats.daysSinceActivity === 0
                  ? 'Hoy'
                  : headerStats.daysSinceActivity === 1
                    ? 'Ayer'
                    : `${headerStats.daysSinceActivity}d`}
            </p>
          </div>
          {headerStats.pendingInvoices > 0 && (
            <div className="flex-1 min-w-[120px] rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-rose-400">
                {isCxC ? 'Facturas pendientes' : 'Facturas por pagar'}
              </p>
              <p className="text-sm font-black text-rose-500 mt-0.5">
                {headerStats.pendingInvoices}
                {headerStats.overdueCount > 0 && (
                  <span className="ml-1 text-[9px] font-black uppercase text-rose-300">
                    · {headerStats.overdueCount} vencida{headerStats.overdueCount === 1 ? '' : 's'}
                  </span>
                )}
              </p>
            </div>
          )}
          {headerStats.avgPayDays !== null && (
            <div className="flex-1 min-w-[120px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 flex items-center gap-1">
                <Hourglass size={9} /> Paga en promedio
              </p>
              <p className={`text-sm font-black mt-0.5 ${
                headerStats.avgPayDays <= 15 ? 'text-emerald-500'
                  : headerStats.avgPayDays <= 30 ? 'text-amber-500'
                    : 'text-rose-500'
              }`}>
                {headerStats.avgPayDays}d
              </p>
            </div>
          )}
          {headerStats.nextDueDays !== null && headerStats.nextDue && (
            <div className={`flex-1 min-w-[140px] rounded-xl border px-3 py-2 ${
              headerStats.nextDueDays < 0
                ? 'bg-rose-500/[0.08] border-rose-500/30'
                : headerStats.nextDueDays <= 7
                  ? 'bg-amber-500/[0.06] border-amber-500/20'
                  : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06]'
            }`}>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 flex items-center gap-1">
                <CalendarClock size={9} /> Próximo vencimiento
              </p>
              <p className={`text-sm font-black mt-0.5 ${
                headerStats.nextDueDays < 0 ? 'text-rose-500'
                  : headerStats.nextDueDays <= 7 ? 'text-amber-500'
                    : 'text-slate-700 dark:text-white/70'
              }`}>
                {headerStats.nextDueDays < 0
                  ? `Vencido ${Math.abs(headerStats.nextDueDays)}d`
                  : headerStats.nextDueDays === 0
                    ? 'Hoy'
                    : `En ${headerStats.nextDueDays}d`}
              </p>
            </div>
          )}
          <div className="flex-1 min-w-[140px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1">
              Tendencia 6 meses
            </p>
            <div className="flex items-end gap-[2px] h-6">
              {(() => {
                const maxVal = Math.max(1, ...trendData.map(d => Math.max(d.facturas, d.abonos)));
                return trendData.map((d) => {
                  const hF = Math.max(2, Math.round((d.facturas / maxVal) * 22));
                  const hA = Math.max(2, Math.round((d.abonos / maxVal) * 22));
                  return (
                    <div key={d.key} className="flex-1 flex items-end gap-[1px] group relative" title={`${d.label}: Cargos ${d.facturas.toFixed(0)} · Abonos ${d.abonos.toFixed(0)}`}>
                      <div
                        className="flex-1 rounded-sm bg-rose-400/70 group-hover:bg-rose-500 transition-all"
                        style={{ height: `${hF}px` }}
                      />
                      <div
                        className="flex-1 rounded-sm bg-emerald-400/70 group-hover:bg-emerald-500 transition-all"
                        style={{ height: `${hA}px` }}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div className="flex-1 min-w-[120px] rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30">
              Total movs.
            </p>
            <p className="text-sm font-black text-slate-700 dark:text-white/70 mt-0.5">
              {entityMovements.length}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {tabBtn('resumen', 'Resumen')}
          {isCxC && tabBtn('datos', 'Datos')}
          {tabBtn('movimientos', 'Movimientos')}
          {tabBtn('pendientes', `Pendientes${entityPendings.length ? ` (${entityPendings.length})` : ''}`)}
          {isCxC && tabBtn('config', 'Config')}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* ═══ TAB: RESUMEN ═══ */}
        {tab === 'resumen' && (
          <div className="p-5 space-y-5">
            {/* ── Section: Cuentas activas ───────────────────────────── */}
            {accountBalances.length > 0 ? (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                    Cuentas activas
                  </h3>
                  <span className="text-[9px] font-black text-slate-400 dark:text-white/30">· {accountBalances.length}</span>
                </div>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {accountBalances.map(acc => (
                    <AccountCard
                      key={acc.accountType}
                      accountType={acc.accountType}
                      label={acc.label}
                      color={acc.color}
                      balanceUSD={acc.balance}
                      overdueUSD={acc.overdue}
                      lastMovementDate={acc.lastDate}
                      onRegisterAbono={() => onRegisterMovement('ABONO', acc.accountType)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-white/[0.02] dark:to-white/[0.01] border border-dashed border-slate-200 dark:border-white/[0.06] p-10 text-center">
                <Activity size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
                <p className="text-sm font-black text-slate-400 dark:text-white/30">Sin movimientos registrados</p>
                <p className="text-xs text-slate-300 dark:text-white/20 mt-1">Los movimientos aparecerán aquí cuando registres la primera factura o abono</p>
              </div>
            )}

            {/* ═══ Dashboard de 2 columnas (xl) ══════════════════════════ */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* ── COLUMNA IZQUIERDA — Analítica ────────────────────── */}
              <div className="xl:col-span-2 space-y-5">
                {/* Antigüedad de deuda */}
                {isCxC && aging && (aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus) > 0 && (
                  <section className="rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Hourglass size={12} className="text-amber-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                          Antigüedad de deuda
                        </h3>
                      </div>
                      {headerStats.overdueCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {headerStats.overdueCount} vencida{headerStats.overdueCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const total = aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus;
                      const buckets = [
                        { label: '0-30d', value: aging.current, bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20', muted: 'text-emerald-400/70', strong: 'text-emerald-500', bar: 'bg-emerald-500' },
                        { label: '31-60d', value: aging.d31_60, bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20', muted: 'text-amber-400/70', strong: 'text-amber-500', bar: 'bg-amber-500' },
                        { label: '61-90d', value: aging.d61_90, bg: 'bg-orange-500/[0.08]', border: 'border-orange-500/20', muted: 'text-orange-400/70', strong: 'text-orange-500', bar: 'bg-orange-500' },
                        { label: '90+d', value: aging.d90plus, bg: 'bg-rose-500/[0.08]', border: 'border-rose-500/20', muted: 'text-rose-400/70', strong: 'text-rose-500', bar: 'bg-rose-500' },
                      ];
                      return (
                        <>
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {buckets.map(b => {
                              const pct = total > 0 ? (b.value / total) * 100 : 0;
                              return (
                                <div key={b.label} className={`rounded-xl ${b.bg} border ${b.border} px-3 py-2.5 text-center`}>
                                  <p className={`text-[9px] font-black uppercase ${b.muted}`}>{b.label}</p>
                                  <p className={`text-sm font-black ${b.strong} mt-0.5`}>${b.value.toFixed(2)}</p>
                                  <p className={`text-[9px] font-bold ${b.muted} mt-0.5`}>{pct.toFixed(0)}%</p>
                                </div>
                              );
                            })}
                          </div>
                          {/* Stacked progress bar */}
                          <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-white/[0.04]">
                            {buckets.map(b => {
                              const pct = total > 0 ? (b.value / total) * 100 : 0;
                              if (pct === 0) return null;
                              return <div key={b.label} className={b.bar} style={{ width: `${pct}%` }} title={`${b.label}: $${b.value.toFixed(2)}`} />;
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </section>
                )}

                {/* Tendencia 6 meses */}
                {trendData.some(m => m.facturas > 0 || m.abonos > 0) && (
                  <section className="rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={12} className="text-violet-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                          Tendencia 6 meses
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-black">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-rose-400/80" />
                          <span className="text-slate-500 dark:text-white/40 uppercase tracking-wider">{isCxC ? 'Ventas' : 'Facturas'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-emerald-400/80" />
                          <span className="text-slate-500 dark:text-white/40 uppercase tracking-wider">Abonos</span>
                        </span>
                      </div>
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendData} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                            contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}
                            labelStyle={{ color: '#ffffff', fontWeight: 800, marginBottom: 4 }}
                            itemStyle={{ color: '#ffffff', padding: 0 }}
                            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === 'facturas' ? (isCxC ? 'Ventas' : 'Facturas') : 'Abonos']}
                          />
                          <Bar dataKey="facturas" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            {trendData.map((_, i) => <Cell key={i} fill="rgba(244,63,94,0.7)" />)}
                          </Bar>
                          <Bar dataKey="abonos" radius={[4, 4, 0, 0]} maxBarSize={22}>
                            {trendData.map((_, i) => <Cell key={i} fill="rgba(16,185,129,0.7)" />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {/* Últimos movimientos */}
                {recentMovements.length > 0 && (
                  <section className="rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={12} className="text-indigo-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                        Últimos movimientos
                      </h3>
                      <span className="ml-auto text-[9px] font-black text-slate-400 dark:text-white/30">Top {recentMovements.length}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {recentMovements.map(m => {
                        const isFactura = m.movementType === 'FACTURA';
                        const usd = getMovementUsdAmount(m, rates);
                        return (
                          <div key={m.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors rounded-lg -mx-1 px-1">
                            <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${isFactura ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                              {isFactura ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-xs font-bold text-slate-700 dark:text-white/70 truncate">
                                  {isFactura ? (isCxC ? 'Venta' : 'Factura') : 'Abono'} · {resolveAccountLabel(m.accountType as string, customRates)}
                                </p>
                                <VerificationBadge movement={m} size="xs" />
                              </div>
                              <p className="text-[9px] text-slate-400 dark:text-white/25 truncate">{m.concept || '—'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-black ${isFactura ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {isFactura ? '+' : '-'}${usd.toFixed(2)}
                              </p>
                              <p className="text-[9px] text-slate-400 dark:text-white/25">{m.date?.split('T')[0]}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              {/* ── COLUMNA DERECHA — Crédito, portal, notas ─────────── */}
              <div className="space-y-5">
                {/* Crédito (gauge) */}
                {isCxC && customer?.creditLimit && customer.creditLimit > 0 && (() => {
                  const usage = Math.max(0, totalBalance);
                  const ratio = Math.min(1, usage / customer.creditLimit);
                  const available = Math.max(0, customer.creditLimit - usage);
                  const tone = ratio > 0.9 ? { bar: 'bg-rose-500', text: 'text-rose-500', ring: 'stroke-rose-500', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Crítico' }
                             : ratio > 0.7 ? { bar: 'bg-amber-500', text: 'text-amber-500', ring: 'stroke-amber-500', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Alto' }
                             : { bar: 'bg-emerald-500', text: 'text-emerald-500', ring: 'stroke-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Saludable' };
                  const C = 2 * Math.PI * 36;
                  return (
                    <section className="rounded-2xl bg-gradient-to-br from-indigo-500/[0.04] to-violet-500/[0.04] border border-indigo-500/15 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Shield size={12} className="text-indigo-400" />
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                            Línea de crédito
                          </h3>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${tone.badge}`}>{tone.label}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Gauge ring */}
                        <div className="relative w-[86px] h-[86px] shrink-0">
                          <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="36" className="stroke-slate-200 dark:stroke-white/[0.06]" strokeWidth="7" fill="none" />
                            <circle
                              cx="40" cy="40" r="36"
                              className={tone.ring}
                              strokeWidth="7"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={C}
                              strokeDashoffset={C * (1 - ratio)}
                              style={{ transition: 'stroke-dashoffset 0.6s' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-sm font-black ${tone.text}`}>{Math.round(ratio * 100)}%</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">usado</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Límite</p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">${customer.creditLimit.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Disponible</p>
                            <p className={`text-sm font-black ${tone.text}`}>${available.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* Portal del cliente */}
                {isCxC && businessId && (
                  <section className="rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe size={12} className="text-sky-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                        Portal del cliente
                      </h3>
                      {portalLink && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
                        </span>
                      )}
                    </div>
                    {portalLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-white/30 py-4">
                        <Loader2 size={14} className="animate-spin" /> Verificando acceso...
                      </div>
                    ) : portalLink ? (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-sky-50 dark:bg-sky-500/[0.05] border border-sky-200 dark:border-sky-500/20 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-0.5">Enlace</p>
                          <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate">{portalLink}</p>
                          {portalPin && (
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                              PIN <span className="text-sky-600 dark:text-sky-400 tracking-widest font-mono ml-1">{portalPin}</span>
                            </p>
                          )}
                        </div>
                        {pendingOTP && (
                          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2">
                            <Key size={14} className="text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">OTP</p>
                              <p className="text-sm font-black font-mono tracking-[0.25em] text-amber-700 dark:text-amber-300">{pendingOTP}</p>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(pendingOTP);
                                setOtpCopied(true);
                                setTimeout(() => setOtpCopied(false), 2000);
                              }}
                              className="p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all shrink-0"
                            >
                              {otpCopied ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={copyPortalLink}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-sky-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-sky-600 transition-all"
                          >
                            {portalCopied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
                          </button>
                          <a
                            href={portalLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-500/10 text-slate-600 dark:text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-slate-500/20 transition-all"
                          >
                            <ExternalLink size={11} /> Abrir
                          </a>
                          {(entity as Customer).telefono && (
                            <button
                              onClick={() => shareViaWhatsApp(
                                (entity as Customer).telefono!,
                                messageTemplates.portalAccess(
                                  businessName || 'tu negocio',
                                  entityName,
                                  portalLink!,
                                  portalPin || undefined,
                                ),
                              )}
                              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
                            >
                              <MessageSquare size={11} /> WhatsApp
                            </button>
                          )}
                          {(entity as Customer).email && (
                            <button
                              onClick={() => shareViaEmail(
                                (entity as Customer).email!,
                                `Acceso a tu portal — ${businessName || 'tu negocio'}`,
                                messageTemplates.portalAccess(
                                  businessName || 'tu negocio',
                                  entityName,
                                  portalLink!,
                                  portalPin || undefined,
                                ),
                              )}
                              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-violet-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-violet-600 transition-all"
                            >
                              <Mail size={11} /> Email
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-3 py-2">
                        <Globe size={22} className="mx-auto text-slate-300 dark:text-white/15" />
                        <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 leading-relaxed">
                          Crea un portal para que el cliente consulte facturas y haga abonos.
                        </p>
                        <button
                          onClick={handleCreatePortalAccess}
                          disabled={portalGenerating}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:from-sky-400 hover:to-indigo-400 transition-all shadow-lg shadow-sky-500/25 disabled:opacity-40"
                        >
                          {portalGenerating ? <><Loader2 size={11} className="animate-spin" /> Generando...</> : <><Globe size={11} /> Crear Portal</>}
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* Notas internas */}
                {isCxC && customer?.internalNotes && (
                  <section className="rounded-2xl bg-amber-50 dark:bg-amber-500/[0.04] border border-amber-200 dark:border-amber-500/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={12} className="text-amber-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                        Notas internas
                      </h3>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-white/70 whitespace-pre-wrap leading-relaxed">{customer.internalNotes}</p>
                  </section>
                )}
              </div>
            </div>

            {/* ═══ Acciones de compensación ══════════════════════════════ */}
            {((canEdit && onCompensate && accountBalances.length >= 2) || (canEdit && onCrossCompensate && linkedCounterpartName)) && (
              <section className="rounded-2xl bg-gradient-to-br from-slate-50 to-white dark:from-white/[0.03] dark:to-white/[0.01] border border-slate-100 dark:border-white/[0.06] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowLeftRight size={12} className="text-indigo-500" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-white/70">
                    Compensaciones
                  </h3>
                </div>

                {/* Botones de acción */}
                {!compOpen && !crossCompOpen && (
                  <div className="flex flex-wrap gap-2">
                    {canEdit && onCompensate && accountBalances.length >= 2 && (
                      <button
                        onClick={() => {
                          setCompFrom(accountBalances[0]?.accountType || '');
                          setCompTo(accountBalances[1]?.accountType || '');
                          setCompAmount('');
                          setCompOpen(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
                      >
                        <ArrowLeftRight size={12} /> Compensar entre cuentas
                      </button>
                    )}
                    {canEdit && onCrossCompensate && linkedCounterpartName && (
                      <button
                        onClick={() => {
                          setCrossCompAmount('');
                          setCrossCompDirection(isCxC ? 'cxc-to-cxp' : 'cxp-to-cxc');
                          setCrossCompOpen(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 border border-amber-500/20 transition-all"
                      >
                        <Repeat size={12} /> Compensar con {isCxC ? 'CxP' : 'CxC'} · {linkedCounterpartName}
                      </button>
                    )}
                  </div>
                )}

                {/* Form: Compensación entre cuentas */}
                {compOpen && (
                  <div className="rounded-xl bg-indigo-500/[0.04] border border-indigo-500/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Compensación entre cuentas</p>
                      <button onClick={() => setCompOpen(false)} className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60"><ChevronLeft size={14} /></button>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-white/30">
                      Transfiere saldo a favor de una cuenta para cubrir deuda en otra.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block mb-1">Desde (saldo a favor)</label>
                        <select
                          value={compFrom}
                          onChange={(e) => setCompFrom(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs dark:text-white outline-none"
                        >
                          {accountBalances.map((a) => (
                            <option key={a.accountType} value={a.accountType}>
                              {a.label} (${a.balance.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block mb-1">Hacia (deuda)</label>
                        <select
                          value={compTo}
                          onChange={(e) => setCompTo(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs dark:text-white outline-none"
                        >
                          {accountBalances.filter((a) => a.accountType !== compFrom).map((a) => (
                            <option key={a.accountType} value={a.accountType}>
                              {a.label} (${a.balance.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block mb-1">Monto USD</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={compAmount}
                        onChange={(e) => setCompAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs dark:text-white outline-none font-mono"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCompOpen(false)}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/60"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={compSaving || !compFrom || !compTo || compFrom === compTo || !(parseFloat(compAmount) > 0)}
                        onClick={async () => {
                          setCompSaving(true);
                          try {
                            await onCompensate(compFrom, compTo, parseFloat(compAmount));
                            setCompOpen(false);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setCompSaving(false);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-40 transition-all"
                      >
                        {compSaving ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeftRight size={12} />}
                        Compensar
                      </button>
                    </div>
                  </div>
                )}

                {/* Form: Cross-compensación */}
                {crossCompOpen && (
                  <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                        Compensación cruzada {isCxC ? 'CxC → CxP' : 'CxP → CxC'}
                      </p>
                      <button onClick={() => setCrossCompOpen(false)} className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60"><ChevronLeft size={14} /></button>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-white/30">
                      {isCxC
                        ? `Usa saldo a favor del cliente para pagar deuda con el proveedor "${linkedCounterpartName}", o viceversa.`
                        : `Usa crédito del proveedor para cubrir deuda del cliente "${linkedCounterpartName}", o viceversa.`}
                    </p>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block mb-1">Dirección</label>
                      <select
                        value={crossCompDirection}
                        onChange={(e) => setCrossCompDirection(e.target.value as 'cxc-to-cxp' | 'cxp-to-cxc')}
                        className="w-full px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs dark:text-white outline-none"
                      >
                        <option value="cxc-to-cxp">CxC → CxP (reducir deuda del cliente, pagar al proveedor)</option>
                        <option value="cxp-to-cxc">CxP → CxC (usar crédito del proveedor, abonar al cliente)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block mb-1">Monto USD</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={crossCompAmount}
                        onChange={(e) => setCrossCompAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs dark:text-white outline-none font-mono"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCrossCompOpen(false)}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/60"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={crossCompSaving || !(parseFloat(crossCompAmount) > 0)}
                        onClick={async () => {
                          setCrossCompSaving(true);
                          try {
                            await onCrossCompensate(parseFloat(crossCompAmount), crossCompDirection);
                            setCrossCompOpen(false);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setCrossCompSaving(false);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 disabled:opacity-40 transition-all"
                      >
                        {crossCompSaving ? <Loader2 size={12} className="animate-spin" /> : <Repeat size={12} />}
                        Compensar
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ═══ TAB: DATOS ═══ */}
        {tab === 'datos' && isCxC && customer && (
          <div className="p-5 space-y-5">
            {/* ── Identificación ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Identificación</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {[
                  { icon: <User size={13} />, label: 'Nombre completo', value: customer.fullName || customer.nombre || '—' },
                  { icon: <Hash size={13} />, label: 'Cédula', value: customer.cedula || '—' },
                  { icon: <Hash size={13} />, label: 'RIF', value: customer.rif || '—' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-slate-400 dark:text-white/20 shrink-0">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">{row.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white/80 truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Contacto ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Contacto</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {[
                  { icon: <Phone size={13} />, label: 'Teléfono', value: customer.telefono || '—' },
                  { icon: <Mail size={13} />, label: 'Email', value: customer.email || '—' },
                  { icon: <MapPin size={13} />, label: 'Dirección', value: customer.direccion || '—' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-slate-400 dark:text-white/20 shrink-0">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">{row.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white/80 truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Crédito & Fidelidad ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Crédito y fidelidad</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {[
                  { icon: <CreditCard size={13} />, label: 'Límite de crédito', value: customer.creditLimit ? `$${customer.creditLimit.toFixed(2)}` : '—' },
                  { icon: <Shield size={13} />, label: 'Crédito aprobado', value: customer.creditApproved ? 'Sí' : 'No' },
                  { icon: <Calendar size={13} />, label: 'Días de pago por defecto', value: customer.defaultPaymentDays != null ? `${customer.defaultPaymentDays} días` : '—' },
                  { icon: <Star size={13} />, label: 'Tier de fidelidad', value: customer.loyaltyTier || '—' },
                  { icon: <Star size={13} />, label: 'Puntos', value: customer.loyaltyPoints != null ? customer.loyaltyPoints.toLocaleString() : '—' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-slate-400 dark:text-white/20 shrink-0">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">{row.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white/80 truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Portal ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Portal</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {[
                  { icon: <Globe size={13} />, label: 'Portal habilitado', value: customer.portalEnabled ? 'Sí' : 'No' },
                  { icon: <Mail size={13} />, label: 'Email del portal', value: customer.portalEmail || '—' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-slate-400 dark:text-white/20 shrink-0">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">{row.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white/80 truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── KYC ── */}
            {(customer.kycStatus || customer.cedulaFrontalUrl || customer.cedulaTraseraUrl) && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Verificación de identidad (KYC)</p>
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Shield size={13} className="text-slate-400 dark:text-white/20" />
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">Estado</p>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        customer.kycStatus === 'verified'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : customer.kycStatus === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : customer.kycStatus === 'rejected'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-400'
                      }`}>
                        {customer.kycStatus === 'verified' ? 'Verificado' : customer.kycStatus === 'pending' ? 'Pendiente' : customer.kycStatus === 'rejected' ? 'Rechazado' : 'No enviado'}
                      </span>
                    </div>
                  </div>
                  {(customer.cedulaFrontalUrl || customer.cedulaTraseraUrl) && (
                    <div className="grid grid-cols-2 gap-3">
                      {customer.cedulaFrontalUrl && (
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-white/20 mb-1">Frente</p>
                          <a href={customer.cedulaFrontalUrl} target="_blank" rel="noopener noreferrer">
                            <img src={customer.cedulaFrontalUrl} alt="Cédula frente" className="w-full max-h-32 object-cover rounded-lg border border-slate-200 dark:border-white/10 hover:opacity-80 transition-opacity" />
                          </a>
                        </div>
                      )}
                      {customer.cedulaTraseraUrl && (
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-white/20 mb-1">Reverso</p>
                          <a href={customer.cedulaTraseraUrl} target="_blank" rel="noopener noreferrer">
                            <img src={customer.cedulaTraseraUrl} alt="Cédula reverso" className="w-full max-h-32 object-cover rounded-lg border border-slate-200 dark:border-white/10 hover:opacity-80 transition-opacity" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {customer.kycStatus === 'pending' && canEdit && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'customers', entity.id), { kycStatus: 'verified', kycVerifiedAt: new Date().toISOString() });
                        }}
                        className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'customers', entity.id), { kycStatus: 'rejected' });
                        }}
                        className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tags ── */}
            {customer.tags && customer.tags.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Etiquetas</p>
                <div className="flex flex-wrap gap-1.5">
                  {customer.tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Registro ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Registro</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {(() => {
                  let regValue = '—';
                  if (customer.createdAt) {
                    regValue = new Date(customer.createdAt).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
                  } else {
                    const custMovs = movements.filter(m => m.entityId === customer.id && !(m as any).isSupplierMovement);
                    const oldest = custMovs
                      .slice()
                      .sort((a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime())[0];
                    if (oldest) {
                      regValue = `~${new Date(oldest.createdAt || oldest.date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })} (1er mov.)`;
                    }
                  }
                  return [
                    { icon: <Calendar size={13} />, label: 'Fecha de registro', value: regValue },
                    ...(customer.birthday ? [{ icon: <Calendar size={13} />, label: 'Cumpleaños', value: new Date(customer.birthday + 'T12:00:00').toLocaleDateString('es-VE', { month: 'long', day: 'numeric' }) }] : []),
                  ];
                })().map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-slate-400 dark:text-white/20 shrink-0">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">{row.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white/80 truncate">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Consulta de identidad ── */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Verificar identidad</p>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4 space-y-3">
                <p className="text-[10px] text-slate-500 dark:text-white/30">
                  Verifica el nombre completo del cliente consultando su cedula en el portal del CNE. Util para confirmar que los datos registrados coinciden con los oficiales.
                </p>

                {(customer.rif || customer.cedula) ? (
                  <a
                    href="https://www.sistemaspnp.com/cedula/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:from-sky-400 hover:to-indigo-400 transition-all shadow-lg shadow-sky-500/25"
                  >
                    <ExternalLink size={12} /> Consultar en CNE
                  </a>
                ) : (
                  <p className="text-[10px] font-bold text-amber-500">Registra un RIF o cedula para poder consultar.</p>
                )}
              </div>
            </div>

            {/* ── Notas internas ── */}
            {customer.internalNotes && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Notas internas</p>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/[0.04] border border-amber-200 dark:border-amber-500/15 p-4">
                  <p className="text-xs text-slate-600 dark:text-white/60 whitespace-pre-wrap">{customer.internalNotes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: MOVIMIENTOS ═══ */}
        {tab === 'movimientos' && (
          <div className="p-5">
            <LedgerView
              movements={movements}
              entityId={entity.id}
              rates={rates}
              customRates={customRates}
              onEdit={canEdit ? onEditMovement : undefined}
              onDelete={canEdit ? onDeleteMovement : undefined}
              canEdit={canEdit}
              mode={mode}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              canVerify={canVerify ?? canEdit}
            />
          </div>
        )}

        {/* ═══ TAB: PENDIENTES (Fase D.0 — panel completo de aprobaciones) ═══ */}
        {tab === 'pendientes' && (
          <div className="p-5 space-y-4">
            {/* Header */}
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <ShieldCheck size={16} className="text-emerald-400" />
                Aprobaciones de movimientos
              </h3>
              <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 mt-0.5">
                Cola de quórum multi-firma para movimientos de esta entidad.
              </p>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-white/10">
              {([
                { key: 'inbox' as const, label: 'Pendientes de mi firma', count: pendingInbox.length },
                { key: 'mine' as const, label: 'Mis solicitudes', count: pendingMine.length },
                { key: 'history' as const, label: 'Historial', count: pendingHistory.length },
              ]).map(t => (
                <button key={t.key} onClick={() => setPendingTab(t.key)}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    pendingTab === t.key
                      ? 'border-emerald-500 text-emerald-500 dark:text-emerald-400'
                      : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'
                  }`}>
                  {t.label}
                  {t.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                      pendingTab === t.key ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/40'
                    }`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            {(() => {
              const active = pendingTab === 'inbox' ? pendingInbox : pendingTab === 'mine' ? pendingMine : pendingHistory;
              if (active.length === 0) {
                const emptyMap = {
                  inbox: { icon: ShieldCheck, title: 'Sin solicitudes esperando tu firma', hint: 'Cuando un compañero cree un movimiento que requiera quórum, aparecerá aquí.' },
                  mine: { icon: FileText, title: 'Sin solicitudes en curso', hint: 'Los movimientos que crees y necesiten aprobación aparecerán aquí.' },
                  history: { icon: Clock, title: 'Sin historial reciente', hint: 'Aprobados, rechazados y cancelados de los últimos 30 días.' },
                };
                const e = emptyMap[pendingTab];
                const EmptyIcon = e.icon;
                return (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/10 p-8 text-center">
                    <EmptyIcon size={28} className="mx-auto text-slate-300 dark:text-white/15" />
                    <p className="mt-2 text-sm font-black text-slate-400 dark:text-white/20">{e.title}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-300 dark:text-white/15">{e.hint}</p>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  {active.map(p => (
                    <PendingFullCard
                      key={p.id}
                      p={p}
                      mode={pendingTab}
                      currentUserId={currentUserId}
                      onApprove={pendingTab === 'inbox' ? onApprovePending : undefined}
                      onReject={pendingTab === 'inbox' ? onRejectPending : undefined}
                      onCancel={pendingTab === 'mine' ? onCancelPending : undefined}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ TAB: CONFIG (CxC only) ═══ */}
        {tab === 'config' && isCxC && customer && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Limite de credito (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className={lbl}>Dias pago por defecto</label>
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.04]">Opcional</span>
                </div>
                <div className="flex gap-1.5">
                  {[0, 15, 30, 45, 60].map(d => {
                    const selected = defaultDays === d;
                    return (
                      <button
                        key={d}
                        // Click en pill ya seleccionado → toggle-off a null.
                        // Mismo patrón que NewClientModal para coherencia UX.
                        onClick={() => setDefaultDays(selected ? null : d)}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                          selected
                            ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                            : 'border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30'
                        }`}
                      >
                        {d === 0 ? 'Contado' : `${d}d`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[9px] text-slate-400 dark:text-white/25 font-medium">
                  {defaultDays === null
                    ? 'Sin período predefinido. Podrás elegirlo al facturar.'
                    : 'Este período se pre-seleccionará al crear facturas a crédito.'}
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setCreditApproved(!creditApproved)}
                  className={`w-10 h-6 rounded-full transition-all cursor-pointer relative ${
                    creditApproved ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/[0.1]'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${creditApproved ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-xs font-black text-slate-700 dark:text-white/70">Credito aprobado</span>
              </label>
            </div>

            <div>
              <label className={lbl}>Score crediticio</label>
              {score ? (
                <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-black ${SCORE_STYLES[score]?.bg} ${SCORE_STYLES[score]?.text}`}>
                  {score}
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-white/25 font-bold">Sin datos suficientes</span>
              )}
              <p className="text-[9px] text-slate-400 dark:text-white/25 mt-1">Calculado automaticamente a partir del historial de pagos</p>
            </div>

            <div>
              <label className={lbl}>Notas internas</label>
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                rows={4}
                placeholder="Notas visibles solo para el equipo..."
                className={inp + ' resize-none'}
              />
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-black uppercase tracking-wider hover:from-indigo-400 hover:to-violet-400 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-40"
            >
              {savingConfig ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ───────────────────────── */}
      {/* ── Edit Client Modal ── */}
      {isCxC && onUpdateEntity && (
        <NewClientModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSave={async (data) => {
            await onUpdateEntity(entity.id, data);
            setEditModalOpen(false);
          }}
          existingCustomers={allCustomers}
          editCustomer={customer}
        />
      )}

      {deleteConfirm && onDeleteEntity && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 size={18} className="text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Eliminar cliente</h3>
                <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{entityName}</p>
              </div>
            </div>
            {entityMovements.length > 0 ? (
              <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Este cliente tiene <span className="font-bold">{entityMovements.length} movimiento(s)</span>. Al eliminarlo se perderá el vínculo con esos movimientos.
                </p>
              </div>
            ) : null}
            <p className="text-sm text-slate-600 dark:text-white/50 mb-5">
              Esta acción no se puede deshacer. ¿Estás seguro?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await onDeleteEntity(entity.id);
                  setDeleteConfirm(false);
                  onBack?.();
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/25 transition-all"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export panel — triggered from header */}
      <ExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        entity={entity}
        movements={movements}
        rates={rates}
        customRates={customRates}
        company={company}
        mode={mode}
      />
    </div>
  );
}
