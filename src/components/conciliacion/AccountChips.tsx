import React from 'react';
import { Download, Landmark, Plus, Trash2 } from 'lucide-react';

export interface AccountChipData {
  accountAlias: string;
  accountLabel: string;
  bankName?: string;
  rowCount: number;
  totalCredit: number;
  fileUrl?: string;
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
              title={acc.bankName || ''}
            >
              <Landmark size={14} />
              <span className="font-medium">{acc.accountLabel}</span>
              <span className="text-xs opacity-70">· {acc.rowCount}</span>
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
