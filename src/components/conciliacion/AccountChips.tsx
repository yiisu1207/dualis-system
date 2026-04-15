import React from 'react';
import { Landmark, Plus, Trash2 } from 'lucide-react';

export interface AccountChipData {
  accountAlias: string;
  accountLabel: string;
  bankName?: string;
  rowCount: number;
  totalCredit: number;
}

interface AccountChipsProps {
  accounts: AccountChipData[];
  activeAlias?: string;
  onSelect?: (alias: string) => void;
  onAdd: () => void;
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
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
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
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Quitar la cuenta "${acc.accountLabel}" del mes?`)) onDelete(acc.accountAlias);
                }}
                className="text-slate-400 hover:text-rose-500"
                title="Eliminar cuenta del mes"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-sm font-medium"
      >
        <Plus size={14} />
        Agregar cuenta
      </button>
    </div>
  );
}
