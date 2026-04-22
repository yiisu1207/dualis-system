import React, { useEffect, useMemo, useState } from 'react';
import { X, Lock, Unlock, AlertTriangle, Loader2, Calendar, CheckCircle2, Info } from 'lucide-react';
import { db } from '../../firebase/config';
import { useToast } from '../../context/ToastContext';
import {
  precheckMonthClosure,
  closeMonth,
  reopenMonth,
  batchMonthKey,
  type ClosurePrecheck,
  type MonthKey,
} from '../../utils/monthlyClosure';
import type { ReconciliationBatch } from '../../../types';

interface Props {
  businessId: string;
  batches: ReconciliationBatch[];
  currentUserId: string;
  currentUserName?: string;
  canEdit: boolean;
  onClose: () => void;
  onDone?: () => void;
}

/** Meses disponibles para cerrar/reabrir: los YYYY-MM que tocan al menos un lote. */
function monthsFromBatches(batches: ReconciliationBatch[]): MonthKey[] {
  const set = new Set<MonthKey>();
  for (const b of batches) {
    const mk = batchMonthKey(b);
    if (mk) set.add(mk);
  }
  return Array.from(set).sort().reverse();
}

function fmtMonth(mk: MonthKey): string {
  const [y, m] = mk.split('-').map(Number);
  if (!y || !m) return mk;
  return new Date(y, m - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MonthClosureModal({
  businessId, batches, currentUserId, currentUserName, canEdit, onClose, onDone,
}: Props) {
  const toast = useToast();
  const availableMonths = useMemo(() => monthsFromBatches(batches), [batches]);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(availableMonths[0] || '');
  const [precheck, setPrecheck] = useState<ClosurePrecheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOrphans, setConfirmOrphans] = useState(false);

  useEffect(() => {
    if (!selectedMonth) { setPrecheck(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const pc = await precheckMonthClosure(db, businessId, selectedMonth, batches);
        if (!cancelled) setPrecheck(pc);
      } catch (err: any) {
        console.error('[MonthClosure] precheck failed', err);
        if (!cancelled) toast.error('Error calculando pre-check: ' + (err?.message || String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, selectedMonth, batches, toast]);

  const isClosed = !!precheck?.alreadyClosed;
  const hasOrphans = (precheck?.orphans.total ?? 0) > 0;
  const canConfirm = canEdit && precheck && !busy && (isClosed
    ? reopenReason.trim().length >= 3
    : (!hasOrphans || confirmOrphans));

  const handleClose = async () => {
    if (!precheck || !canEdit) return;
    setBusy(true);
    try {
      const res = await closeMonth(db, businessId, precheck, {
        uid: currentUserId,
        name: currentUserName,
        note: note.trim() || undefined,
      });
      toast.success(`Mes ${fmtMonth(selectedMonth)} cerrado · ${res.batchesClosed} lote${res.batchesClosed === 1 ? '' : 's'} bloqueado${res.batchesClosed === 1 ? '' : 's'}`);
      onDone?.();
      onClose();
    } catch (err: any) {
      console.error('[MonthClosure] close failed', err);
      toast.error('Error cerrando mes: ' + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!precheck || !canEdit) return;
    if (reopenReason.trim().length < 3) {
      toast.error('Escribe una razón (mínimo 3 caracteres) para re-abrir');
      return;
    }
    if (!confirm(`¿Re-abrir ${fmtMonth(selectedMonth)}? Los lotes volverán a ser editables. Esta acción queda registrada.`)) return;
    setBusy(true);
    try {
      const res = await reopenMonth(db, businessId, selectedMonth, batches, {
        uid: currentUserId,
        name: currentUserName,
        reason: reopenReason.trim(),
      });
      if (res.ok === false) {
        toast.error(res.error);
        return;
      }
      toast.success(`Mes ${fmtMonth(selectedMonth)} re-abierto · ${res.batchesReopened} lote${res.batchesReopened === 1 ? '' : 's'} desbloqueado${res.batchesReopened === 1 ? '' : 's'}`);
      onDone?.();
      onClose();
    } catch (err: any) {
      console.error('[MonthClosure] reopen failed', err);
      toast.error('Error re-abriendo mes: ' + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Calendar size={16} className="text-indigo-700 dark:text-indigo-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cierre mensual</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Bloquea los lotes del mes contra ediciones accidentales</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {availableMonths.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              No hay lotes con período detectado. Crea o procesa un lote primero.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Mes a cerrar / re-abrir
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => { setSelectedMonth(e.target.value); setConfirmOrphans(false); setReopenReason(''); setNote(''); }}
                  className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
                >
                  {availableMonths.map(mk => (
                    <option key={mk} value={mk}>{fmtMonth(mk)}</option>
                  ))}
                </select>
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> Calculando pre-check...
                </div>
              )}

              {precheck && !loading && (
                <>
                  {isClosed ? (
                    <div className="rounded-lg border border-emerald-300 dark:border-emerald-600/50 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
                        <CheckCircle2 size={14} /> Mes ya cerrado
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5">
                        <div><strong>Cerrado por:</strong> {precheck.alreadyClosed!.closedByName || precheck.alreadyClosed!.closedBy}</div>
                        <div><strong>Fecha:</strong> {fmtDateTime(precheck.alreadyClosed!.closedAt)}</div>
                        {precheck.alreadyClosed!.note && <div><strong>Nota:</strong> {precheck.alreadyClosed!.note}</div>}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Stat label="EdeC del mes" value={precheck.snapshot.accountCount} />
                    <Stat label="Lotes" value={precheck.snapshot.batchCount} />
                    <Stat label="Confirmados" value={precheck.snapshot.confirmed} tone="ok" />
                    <Stat label="Refs quemadas" value={precheck.snapshot.usedReferenceCount} tone="ok" />
                    <Stat label="Por revisar" value={precheck.orphans.review} tone={precheck.orphans.review > 0 ? 'warn' : 'neutral'} />
                    <Stat label="Sin match" value={precheck.orphans.notFound} tone={precheck.orphans.notFound > 0 ? 'warn' : 'neutral'} />
                  </div>

                  {!isClosed && hasOrphans && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold mb-1">
                        <AlertTriangle size={14} /> Hay {precheck.orphans.total} abono{precheck.orphans.total === 1 ? '' : 's'} sin resolver
                      </div>
                      <div className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                        {precheck.orphans.review} por revisar · {precheck.orphans.notFound} sin match · {precheck.orphans.duplicates} duplicados.
                        Si cierras ahora, quedan como <strong>no reclamados permanentes</strong>. Podés re-abrir después con razón, pero te pedirá justificación.
                      </div>
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmOrphans}
                          onChange={(e) => setConfirmOrphans(e.target.checked)}
                          className="mt-0.5 rounded"
                        />
                        <span className="text-amber-900 dark:text-amber-200">
                          Entiendo. Cerrar de todos modos — los {precheck.orphans.total} huérfanos quedan sin conciliar.
                        </span>
                      </label>
                    </div>
                  )}

                  {!isClosed && !hasOrphans && precheck.snapshot.batchCount > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                      <Info size={14} className="mt-0.5 flex-shrink-0 text-indigo-500" />
                      <span>Todos los abonos del mes están resueltos. Al cerrar, los {precheck.snapshot.batchCount} lote{precheck.snapshot.batchCount === 1 ? '' : 's'} quedan read-only. Puedes re-abrir con justificación si aparece un rezagado.</span>
                    </div>
                  )}

                  {!isClosed && precheck.snapshot.batchCount === 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 text-xs text-slate-600 dark:text-slate-400">
                      No hay lotes con período 100% dentro de {fmtMonth(selectedMonth)}. Cerrar este mes no afectará ningún lote — sólo queda el sello del cierre.
                    </div>
                  )}

                  {!isClosed && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Nota opcional
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ej: Cierre con 3 pagos sin investigar — ver correo del 15"
                        className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  )}

                  {isClosed && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Razón para re-abrir (obligatoria)
                      </label>
                      <input
                        type="text"
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        placeholder="Ej: Llegó EdeC rezagado del 31-ene"
                        className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
                      />
                      <div className="text-[10px] text-slate-400 mt-1 italic">
                        Queda en el historial de cierres (auditoría).
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          {precheck && !isClosed && (
            <button
              onClick={handleClose}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Cerrar {fmtMonth(selectedMonth)}
            </button>
          )}
          {precheck && isClosed && (
            <button
              onClick={handleReopen}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
              Re-abrir {fmtMonth(selectedMonth)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'ok' | 'warn' | 'neutral' }) {
  const color =
    tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-700 dark:text-amber-400'
    : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
