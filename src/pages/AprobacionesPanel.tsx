/**
 * Fase D.0 — Panel de aprobaciones de movimientos pendientes.
 *
 * Tres tabs:
 *  - "Pendientes de mi aprobación": pendings donde el current user puede firmar
 *    (status pending, no es el creador, no ha firmado todavía).
 *  - "Mis solicitudes": pendings creados por el current user, con progreso
 *    X/N y botón Cancelar mientras estén pending.
 *  - "Historial": últimos 30 días de approved/rejected/cancelled.
 *
 * Gate por capability `aprobarMovimientos` se hace en el padre (MainSystem).
 * Si el usuario no tiene la capability, igual puede ver "Mis solicitudes"
 * para seguir el estado de lo que él mismo sometió.
 */

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, Ban, User,
  FileText, Calendar, AlertCircle, ArrowRight,
} from 'lucide-react';
import type { PendingMovement } from '../../types';

interface Props {
  pendings: PendingMovement[];
  currentUserId: string;
  hasCapability: boolean;
  onApprove: (pendingId: string, note?: string) => Promise<void>;
  onReject: (pendingId: string, reason: string) => Promise<void>;
  onCancel: (pendingId: string) => Promise<void>;
}

type TabKey = 'inbox' | 'mine' | 'history';

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const fmtMoney = (n?: number) =>
  typeof n === 'number'
    ? `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const STATUS_META: Record<PendingMovement['status'], { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: 'Pendiente',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',       Icon: Clock },
  approved:  { label: 'Aprobado',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', Icon: CheckCircle2 },
  rejected:  { label: 'Rechazado',  cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',          Icon: XCircle },
  cancelled: { label: 'Cancelado',  cls: 'bg-slate-500/15 text-slate-300 border-slate-500/40',       Icon: Ban },
};

const StatusChip: React.FC<{ status: PendingMovement['status'] }> = ({ status }) => {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {m.label}
    </span>
  );
};

const ProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const pct = Math.min(100, Math.round((current / Math.max(1, total)) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-300 tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
};

const DraftSummary: React.FC<{ p: PendingMovement }> = ({ p }) => {
  const d = p.movementDraft;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300 md:grid-cols-4">
      <div>
        <div className="text-[10px] uppercase text-slate-500">Tipo</div>
        <div className="font-medium text-slate-200">{String(d.movementType || '—')}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-slate-500">Cuenta</div>
        <div className="font-medium text-slate-200">{String(d.accountType || '—')}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-slate-500">Monto USD</div>
        <div className="font-semibold text-emerald-300">{fmtMoney(d.amountInUSD)}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-slate-500">Fecha</div>
        <div className="font-medium text-slate-200">{d.date || '—'}</div>
      </div>
      <div className="col-span-2 md:col-span-4">
        <div className="text-[10px] uppercase text-slate-500">Concepto</div>
        <div className="font-medium text-slate-200 truncate" title={d.concept}>
          {d.concept || '—'}
        </div>
      </div>
      {d.reference && (
        <div className="col-span-2">
          <div className="text-[10px] uppercase text-slate-500">Referencia</div>
          <div className="font-mono text-slate-300">{d.reference}</div>
        </div>
      )}
      {d.metodoPago && (
        <div className="col-span-2">
          <div className="text-[10px] uppercase text-slate-500">Método</div>
          <div className="font-medium text-slate-200">{String(d.metodoPago)}</div>
        </div>
      )}
    </div>
  );
};

const PendingCard: React.FC<{
  p: PendingMovement;
  mode: 'inbox' | 'mine' | 'history';
  currentUserId: string;
  onApprove?: (id: string, note?: string) => Promise<void>;
  onReject?: (id: string, reason: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
}> = ({ p, mode, currentUserId, onApprove, onReject, onCancel }) => {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNote, setApproveNote] = useState('');

  const alreadySigned = p.approvals.some(a => a.userId === currentUserId);
  const isCreator = p.createdBy === currentUserId;
  const [acted, setActed] = useState(false);
  const canAct = mode === 'inbox' && !isCreator && !alreadySigned && !acted && p.status === 'pending';

  const handleApprove = async () => {
    if (!onApprove) return;
    setBusy(true);
    setActed(true);
    try { await onApprove(p.id, approveNote.trim() || undefined); }
    catch { setActed(false); }
    finally { setBusy(false); setApproveNote(''); }
  };
  const handleReject = async () => {
    if (!onReject) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setBusy(true);
    try { await onReject(p.id, reason); }
    finally { setBusy(false); setShowRejectForm(false); setRejectReason(''); }
  };
  const handleCancel = async () => {
    if (!onCancel) return;
    if (!window.confirm('¿Cancelar esta solicitud? No se podrá deshacer.')) return;
    setBusy(true);
    try { await onCancel(p.id); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusChip status={p.status} />
            <span className="truncate text-sm font-semibold text-slate-100">
              {p.movementDraft.concept || 'Movimiento sin concepto'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" /> {p.createdByName || p.createdBy}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {fmtDate(p.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
              {fmtMoney(p.movementDraft.amountInUSD)}
            </span>
          </div>
        </div>

        <div className="w-full min-w-[160px] md:w-44">
          <ProgressBar current={p.approvals.length} total={p.quorumRequired} />
          <div className="mt-1 text-right text-[10px] text-slate-500">
            Validadores: {p.quorumSnapshot.validatorCount}
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
      >
        <FileText className="h-3.5 w-3.5" />
        {expanded ? 'Ocultar detalles' : 'Ver detalles del movimiento'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <DraftSummary p={p} />

          {p.approvals.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
              <div className="mb-1 font-semibold text-emerald-300">Firmas ({p.approvals.length}/{p.quorumRequired})</div>
              <ul className="space-y-0.5 text-slate-300">
                {p.approvals.map((a, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span className="font-medium">{a.userName}</span>
                    <span className="text-slate-500">— {fmtDate(a.at)}</span>
                    {a.note && <span className="italic text-slate-400">"{a.note}"</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.rejections.length > 0 && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs">
              <div className="mb-1 font-semibold text-rose-300">Rechazos</div>
              <ul className="space-y-0.5 text-slate-300">
                {p.rejections.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.userName}</span>
                    <span className="text-slate-500"> — {fmtDate(r.at)}</span>
                    <div className="pl-2 italic text-slate-400">"{r.reason}"</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.committedMovementId && (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <ArrowRight className="h-3.5 w-3.5" />
              Commiteado como Movement <code className="font-mono">{p.committedMovementId.slice(0, 8)}…</code> el {fmtDate(p.committedAt)}
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {canAct && (
        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
          {!showRejectForm ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder="Nota opcional…"
                className="min-w-[160px] flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleApprove}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Aprobar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowRejectForm(true)}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Razón del rechazo (obligatoria)"
                className="min-w-[200px] flex-1 rounded-md border border-rose-500/40 bg-black/20 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                disabled={busy || !rejectReason.trim()}
                onClick={handleReject}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                Confirmar rechazo
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'inbox' && !canAct && p.status === 'pending' && (
        <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-3 text-xs text-slate-500">
          <AlertCircle className="h-3.5 w-3.5" />
          {isCreator
            ? 'No puedes aprobar tu propia solicitud.'
            : alreadySigned
              ? 'Ya firmaste esta solicitud.'
              : 'No puedes actuar sobre esta solicitud.'}
        </div>
      )}

      {mode === 'mine' && p.status === 'pending' && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleCancel}
            className="inline-flex items-center gap-1 rounded-md border border-slate-500/40 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-500/10 disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Cancelar mi solicitud
          </button>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; hint?: string }> = ({ icon: Icon, title, hint }) => (
  <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
    <Icon className="mx-auto h-8 w-8 text-slate-500" />
    <div className="mt-2 text-sm font-semibold text-slate-300">{title}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>
);

const AprobacionesPanel: React.FC<Props> = ({
  pendings,
  currentUserId,
  hasCapability,
  onApprove,
  onReject,
  onCancel,
}) => {
  const [tab, setTab] = useState<TabKey>(hasCapability ? 'inbox' : 'mine');

  const { inbox, mine, history } = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const inbox: PendingMovement[] = [];
    const mine: PendingMovement[] = [];
    const history: PendingMovement[] = [];

    for (const p of pendings) {
      if (p.status === 'pending') {
        if (p.createdBy === currentUserId) {
          mine.push(p);
        }
        if (
          hasCapability &&
          p.createdBy !== currentUserId &&
          !p.approvals.some(a => a.userId === currentUserId)
        ) {
          inbox.push(p);
        }
      } else {
        const t = new Date(p.createdAt).getTime();
        if (Number.isFinite(t) && t >= thirtyDaysAgo) {
          history.push(p);
        }
      }
    }

    const byDateDesc = (a: PendingMovement, b: PendingMovement) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    inbox.sort(byDateDesc);
    mine.sort(byDateDesc);
    history.sort(byDateDesc);

    return { inbox, mine, history };
  }, [pendings, currentUserId, hasCapability]);

  const tabs: Array<{ key: TabKey; label: string; count: number; disabled?: boolean }> = [
    { key: 'inbox',   label: 'Pendientes de mi aprobación', count: inbox.length,   disabled: !hasCapability },
    { key: 'mine',    label: 'Mis solicitudes',             count: mine.length },
    { key: 'history', label: 'Historial (30 días)',         count: history.length },
  ];

  const active =
    tab === 'inbox' ? inbox :
    tab === 'mine'  ? mine  :
    history;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Aprobaciones de movimientos
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Cola de quórum multi-firma para movimientos manuales de CxC y CxP.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/10">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.key)}
            className={`relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            } ${t.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-300'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {active.length === 0 ? (
        tab === 'inbox' ? (
          <EmptyState
            icon={ShieldCheck}
            title="No tienes solicitudes esperando tu firma"
            hint={hasCapability ? 'Cuando un compañero cree un movimiento manual que requiera quórum, aparecerá aquí.' : 'No tienes permiso para aprobar movimientos.'}
          />
        ) : tab === 'mine' ? (
          <EmptyState
            icon={FileText}
            title="No tienes solicitudes en curso"
            hint="Los movimientos manuales que crees y necesiten aprobación aparecerán aquí."
          />
        ) : (
          <EmptyState
            icon={Clock}
            title="Sin movimientos en el historial reciente"
            hint="Aprobados, rechazados y cancelados de los últimos 30 días aparecerán aquí."
          />
        )
      ) : (
        <div className="space-y-3">
          {active.map(p => (
            <PendingCard
              key={p.id}
              p={p}
              mode={tab}
              currentUserId={currentUserId}
              onApprove={tab === 'inbox' ? onApprove : undefined}
              onReject={tab === 'inbox' ? onReject : undefined}
              onCancel={tab === 'mine' ? onCancel : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AprobacionesPanel;
