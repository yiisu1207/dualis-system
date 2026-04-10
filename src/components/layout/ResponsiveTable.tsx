import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface RTColumn<T = any> {
  key: string;
  label: string;
  /** Always visible in mobile card view */
  primary?: boolean;
  /** Shown in expandable section on mobile */
  secondary?: boolean;
  /** Right-align (for numbers/amounts) */
  align?: 'left' | 'right' | 'center';
  /** Custom render function */
  render?: (row: T) => React.ReactNode;
  /** Column type — 'actions' renders without label on mobile */
  type?: 'actions';
  /** CSS class for td/cell */
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: RTColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  keyExtractor?: (row: T) => string;
  emptyMessage?: string;
  className?: string;
}

export default function ResponsiveTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  keyExtractor,
  emptyMessage = 'Sin datos',
  className = '',
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  const getKey = (row: T, idx: number) => keyExtractor?.(row) ?? row.id ?? String(idx);
  const getValue = (row: T, col: RTColumn<T>) => col.render ? col.render(row) : row[col.key];

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-400 dark:text-white/30">
        {emptyMessage}
      </div>
    );
  }

  // Mobile: card list
  if (isMobile) {
    const primaryCols = columns.filter(c => c.primary);
    const secondaryCols = columns.filter(c => c.secondary);
    const actionCols = columns.filter(c => c.type === 'actions');

    return (
      <div className={`space-y-2 ${className}`}>
        {data.map((row, idx) => (
          <div
            key={getKey(row, idx)}
            onClick={() => onRowClick?.(row)}
            className={`p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 ${
              onRowClick ? 'cursor-pointer active:bg-slate-50 dark:active:bg-white/5' : ''
            }`}
          >
            {/* Primary fields */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                {primaryCols.map(col => (
                  <div key={col.key} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-wider shrink-0">
                      {col.label}
                    </span>
                    <span className={`text-xs font-semibold text-slate-800 dark:text-white truncate ${
                      col.align === 'right' ? 'ml-auto' : ''
                    }`}>
                      {getValue(row, col)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Actions */}
              {actionCols.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  {actionCols.map(col => (
                    <span key={col.key}>{getValue(row, col)}</span>
                  ))}
                </div>
              )}
            </div>
            {/* Secondary fields */}
            {secondaryCols.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-x-4 gap-y-1">
                {secondaryCols.map(col => (
                  <div key={col.key} className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-white/25 uppercase tracking-wider">
                      {col.label}
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-white/60 truncate">
                      {getValue(row, col)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Desktop: traditional table
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/10">
            {columns.map(col => (
              <th
                key={col.key}
                className={`py-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                } ${col.className || ''}`}
              >
                {col.type === 'actions' ? '' : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={getKey(row, idx)}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-slate-100 dark:border-white/5 ${
                onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]' : ''
              }`}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`py-2.5 px-3 text-xs text-slate-700 dark:text-white/70 ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                  } ${col.className || ''}`}
                >
                  {getValue(row, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
