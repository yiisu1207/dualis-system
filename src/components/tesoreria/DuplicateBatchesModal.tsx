import React, { useMemo, useState } from 'react';
import { X, AlertTriangle, Loader2, Merge } from 'lucide-react';
import type { Firestore } from 'firebase/firestore';
import type { ReconciliationBatch } from '../../../types';
import { findDuplicateBatchGroups, mergeBatchGroup } from '../../utils/processReceiptBatch';

interface Props {
  db: Firestore;
  businessId: string;
  batches: ReconciliationBatch[];
  onClose: () => void;
  onDone: (merged: { groups: number; movedAbonos: number; movedRefs: number; deletedBatches: number }) => void;
}

export default function DuplicateBatchesModal({ db, businessId, batches, onClose, onDone }: Props) {
  const groups = useMemo(() => findDuplicateBatchGroups(batches), [batches]);

  const defaultKeepers = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of groups) {
      const ranked = [...g.batches].sort((a, b) => {
        const ta = a.stats?.total ?? 0;
        const tb = b.stats?.total ?? 0;
        if (ta !== tb) return tb - ta;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      m[g.normalized] = ranked[0].id;
    }
    return m;
  }, [groups]);

  const [keepers, setKeepers] = useState<Record<string, string>>(defaultKeepers);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ groupIdx: number; total: number } | null>(null);

  const toggleExclude = (key: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleMergeAll = async () => {
    if (busy) return;
    const active = groups.filter(g => !excluded.has(g.normalized));
    if (!active.length) return;
    setBusy(true);
    let movedAbonos = 0, movedRefs = 0, deletedBatches = 0;
    try {
      for (let i = 0; i < active.length; i++) {
        const g = active[i];
        setProgress({ groupIdx: i + 1, total: active.length });
        const keeperId = keepers[g.normalized] || g.batches[0].id;
        const sourceIds = g.batches.filter(b => b.id !== keeperId).map(b => b.id);
        const res = await mergeBatchGroup(db, businessId, keeperId, sourceIds);
        movedAbonos += res.movedAbonos;
        movedRefs += res.movedRefs;
        deletedBatches += sourceIds.length;
      }
      onDone({ groups: active.length, movedAbonos, movedRefs, deletedBatches });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (!groups.length) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
              <Merge size={16} className="text-indigo-500" /> Unificar duplicados
            </h3>
            <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
          </div>
          <div className="px-5 py-6 text-sm text-slate-600 dark:text-slate-300 text-center">
            No se encontraron lotes con nombres duplicados. 🎉
          </div>
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <button onClick={onClose} className="px-4 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeCount = groups.filter(g => !excluded.has(g.normalized)).length;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
              <Merge size={16} className="text-indigo-500" /> Unificar duplicados
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {groups.length} grupo{groups.length === 1 ? '' : 's'} con nombre repetido. Elige qué lote se queda; los demás aportan sus abonos y se borran.
            </div>
          </div>
          <button onClick={onClose} disabled={busy}><X size={18} className="text-slate-400 disabled:opacity-30" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Los claims en <span className="font-mono">usedReferences</span> se re-apuntan al keeper. Si dos abonos duplicados reclaman la misma fila del EdeC, los duplicados quedan con <span className="font-mono">status: duplicado</span> para revisión manual tras la fusión.</span>
          </div>

          {groups.map(g => {
            const excl = excluded.has(g.normalized);
            const keeperId = keepers[g.normalized];
            const totalAbonos = g.batches.reduce((s, b) => s + (b.stats?.total ?? 0), 0);
            return (
              <div key={g.normalized} className={`border rounded-lg ${excl ? 'border-slate-200 dark:border-slate-700 opacity-50' : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10'}`}>
                <div className="px-3 py-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {g.batches[0].name}
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                      {g.batches.length} lotes · {totalAbonos} abono{totalAbonos === 1 ? '' : 's'} total
                    </span>
                  </div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={excl}
                      onChange={() => toggleExclude(g.normalized)}
                      disabled={busy}
                    />
                    Omitir
                  </label>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {g.batches.map(b => {
                    const isKeeper = keeperId === b.id;
                    return (
                      <label
                        key={b.id}
                        className={`flex items-start gap-3 px-3 py-2 text-xs cursor-pointer ${excl ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'} ${isKeeper ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`keeper_${g.normalized}`}
                          checked={isKeeper}
                          onChange={() => setKeepers(prev => ({ ...prev, [g.normalized]: b.id }))}
                          disabled={busy || excl}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${isKeeper ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                              {isKeeper ? 'KEEPER' : 'FUENTE'}
                            </span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {new Date(b.createdAt).toLocaleString()}
                            </span>
                            {b.createdByName && <span className="text-slate-400">· {b.createdByName}</span>}
                            {b.periodFrom && b.periodTo && (
                              <span className="text-slate-400">· {b.periodFrom} → {b.periodTo}</span>
                            )}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {b.stats?.total ?? 0} total · {b.stats?.confirmed ?? 0} auto · {b.stats?.review ?? 0} revisar · {b.stats?.notFound ?? 0} sin match · {b.stats?.duplicates ?? 0} dup
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">{b.id}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {progress ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Fusionando grupo {progress.groupIdx} de {progress.total}…
              </span>
            ) : (
              <>Se fusionarán {activeCount} grupo{activeCount === 1 ? '' : 's'} · {groups.reduce((s, g) => !excluded.has(g.normalized) ? s + g.batches.length - 1 : s, 0)} lote{groups.reduce((s, g) => !excluded.has(g.normalized) ? s + g.batches.length - 1 : s, 0) === 1 ? '' : 's'} serán borrados</>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={handleMergeAll}
              disabled={busy || !activeCount}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Fusionar {activeCount || ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
