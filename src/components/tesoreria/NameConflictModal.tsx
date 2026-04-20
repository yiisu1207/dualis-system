import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReconciliationBatch } from '../../../types';

interface Props {
  existing: ReconciliationBatch;
  newItemsCount: number;
  replacing: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

export default function NameConflictModal({
  existing, newItemsCount, replacing, onMerge, onReplace, onCancel,
}: Props) {
  const [confirmReplace, setConfirmReplace] = useState(false);
  const total = existing.stats?.total ?? 0;
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Ya existe un lote con ese nombre
          </h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded">
            <div className="font-medium">{existing.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {existing.periodFrom && existing.periodTo ? `${existing.periodFrom} → ${existing.periodTo} · ` : ''}
              creado {new Date(existing.createdAt).toLocaleString()} · {total} item{total === 1 ? '' : 's'}
            </div>
          </div>
          {confirmReplace ? (
            <div className="px-3 py-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded text-rose-800 dark:text-rose-200 text-sm">
              <p className="font-medium">¿Seguro? Esto borra {total} abono{total === 1 ? '' : 's'} del lote viejo y libera sus claims en <span className="font-mono">usedReferences</span>. Las filas del EdeC vuelven a estar disponibles.</p>
              <p className="mt-2 text-xs">Acción irreversible. Si alguien ya auditó el lote viejo, fusiona mejor.</p>
            </div>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">
              Vas a procesar <strong>{newItemsCount} item{newItemsCount === 1 ? '' : 's'}</strong> nuevo{newItemsCount === 1 ? '' : 's'}. ¿Qué quieres hacer?
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2 flex-wrap">
          <button
            onClick={onCancel}
            disabled={replacing}
            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>
          {confirmReplace ? (
            <>
              <button
                onClick={() => setConfirmReplace(false)}
                disabled={replacing}
                className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
              >
                Volver
              </button>
              <button
                onClick={onReplace}
                disabled={replacing}
                className="px-4 py-1.5 bg-rose-600 text-white rounded text-sm hover:bg-rose-700 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {replacing && <Loader2 size={12} className="animate-spin" />}
                Sí, borrar y crear nuevo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmReplace(true)}
                disabled={replacing}
                className="px-4 py-1.5 border border-rose-300 text-rose-700 dark:text-rose-300 dark:border-rose-700 rounded text-sm hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-40"
              >
                Reemplazar
              </button>
              <button
                onClick={onMerge}
                disabled={replacing}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-40"
              >
                Fusionar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
