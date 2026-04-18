import React from 'react';
import { Download, Landmark, Plus, Trash2 } from 'lucide-react';

export interface AccountChipData {
  accountAlias: string;
  accountLabel: string;
  bankName?: string;
  rowCount: number;
  totalCredit: number;
  fileUrl?: string;
  usedCount?: number;        // referencias ya quemadas para esta cuenta
  creditRowCount?: number;   // total de filas crédito (denominador realista)
}

interface AccountChipsProps {
  accounts: AccountChipData[];
  activeAlias?: string;
  onSelect?: (alias: string) => void;
  onAdd?: () => void;
  onDelete?: (alias: string) => void;
}

export default function AccountChips({ accounts, activeAlias, onSelect, onAdd, onDelete }: AccountChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {accounts.map(acc => {
        const isActive = acc.accountAlias === activeAlias;
        const used = acc.usedCount || 0;
        const denom = acc.creditRowCount || acc.rowCount;
        const pct = denom > 0 ? Math.min(100, Math.round((used / denom) * 100)) : 0;
        const fullyReconciled = denom > 0 && used >= denom;
        return (
          <div
            key={acc.accountAlias}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              isActive
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700/50 text-indigo-900 dark:text-indigo-200'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect?.(acc.accountAlias)}
              className="flex items-center gap-2"
              title={acc.bankName ? `${acc.bankName}${denom > 0 ? ` · ${used}/${denom} conciliadas (${pct}%)` : ''}` : ''}
            >
              <Landmark size={14} />
              <span className="font-medium">{acc.accountLabel}</span>
              <span className="text-xs opacity-70">· {acc.rowCount}</span>
              {denom > 0 && (
                <span className="flex items-center gap-1">
                  <span
                    className={`inline-block w-10 h-1.5 rounded-full overflow-hidden ${
                      isActive ? 'bg-indigo-200 dark:bg-indigo-800' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    aria-label={`${pct}% conciliada`}
                  >
                    <span
                      className={`block h-full transition-all ${
                        fullyReconciled ? 'bg-emerald-500' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className={`text-[10px] font-mono ${
                    fullyReconciled
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'opacity-70'
                  }`}>
                    {used}/{denom}
                  </span>
                </span>
              )}
            </button>
            {acc.fileUrl && (
              <a
                href={acc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400"
                title="Ver/descargar archivo original"
              >
                <Download size={13} />
              </a>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Quitar la cuenta "${acc.accountLabel}" del mes?`)) onDelete(acc.accountAlias);
                }}
                className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400"
                title="Eliminar cuenta del mes"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-sm font-medium"
        >
          <Plus size={14} />
          Agregar cuenta
        </button>
      )}
    </div>
  );
}
