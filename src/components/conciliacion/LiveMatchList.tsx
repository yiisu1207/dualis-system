import React from 'react';
import { CheckCircle2, Landmark } from 'lucide-react';
import type { RankedMatch, Confidence } from '../../utils/bankReconciliation';

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  exact:  { label: 'Exacta', className: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50' },
  high:   { label: 'Alta',   className: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-700/50' },
  medium: { label: 'Media',  className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/50' },
  low:    { label: 'Baja',   className: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600' },
};

const OP_LABEL: Record<string, string> = {
  pago_movil: 'PM',
  transferencia: 'Transf',
  deposito: 'Depósito',
  punto_venta: 'POS',
  otro: 'Otro',
};

interface LiveMatchListProps {
  matches: RankedMatch[];
  selectedRowId?: string | null;
  onSelect: (rowId: string | null) => void;
  emptyMessage?: string;
}

export default function LiveMatchList({ matches, selectedRowId, onSelect, emptyMessage }: LiveMatchListProps) {
  if (!matches.length) {
    return (
      <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        {emptyMessage || 'Sin coincidencias en el estado de cuenta — el abono quedará como "No encontrado".'}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
      {matches.map((m) => {
        const isSelected = selectedRowId === m.row.rowId;
        const conf = CONFIDENCE_STYLE[m.confidence];
        return (
          <button
            key={m.row.rowId}
            type="button"
            onClick={() => onSelect(isSelected ? null : m.row.rowId)}
            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
              isSelected
                ? 'border-emerald-500 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 shadow-sm'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600'
            } ${m.row.matched ? 'opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md">
                    <Landmark size={11} /> {m.row.accountLabel || m.row.accountAlias}
                  </span>
                  {m.row.operationType && m.row.operationType !== 'otro' && (
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md">
                      {OP_LABEL[m.row.operationType]}
                    </span>
                  )}
                  {m.row.isIntrabank === true && (
                    <span className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md">Intrabanco</span>
                  )}
                  {m.row.isIntrabank === false && (
                    <span className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md">Interbanco</span>
                  )}
                  {m.row.matched && (
                    <span className="text-xs bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-md">Ya conciliada</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-white">${m.row.amount.toFixed(2)}</span>
                  <span className="text-slate-500 dark:text-slate-400">{m.row.date}</span>
                  {m.row.reference && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">ref {m.row.reference}</span>
                  )}
                </div>
                {m.row.description && (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate" title={m.row.description}>
                    {m.row.description}
                  </div>
                )}
                {m.reasons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.reasons.slice(0, 4).map((r, i) => (
                      <span key={i} className="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${conf.className}`}>
                  {conf.label}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{m.score} pts</span>
                {isSelected && <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
