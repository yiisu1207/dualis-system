import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Download, Landmark, ArrowDownUp, Lock, ExternalLink } from 'lucide-react';
import type { BankRow } from '../../utils/bankReconciliation';
import type { UsedReference } from '../../../types';

interface AccountRowsModalProps {
  accountLabel: string;
  bankName?: string;
  rowCount: number;
  totalCredit: number;
  totalDebit: number;
  fileUrl?: string;
  periodFrom?: string;
  periodTo?: string;
  rows: BankRow[];
  usedRowsMap?: Map<string, UsedReference>;
  highlightRowId?: string;
  onOpenAbono?: (batchId: string, abonoId: string) => void;
  onClose: () => void;
}

type SortKey = 'date' | 'amount' | 'reference';
type UsageFilter = 'all' | 'used' | 'free';

function fmtMoney(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountRowsModal({
  accountLabel, bankName, rowCount, totalCredit, totalDebit, fileUrl,
  periodFrom, periodTo, rows, usedRowsMap, highlightRowId, onOpenAbono, onClose,
}: AccountRowsModalProps) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all');

  const usedCount = usedRowsMap?.size || 0;
  const creditRowCount = useMemo(() => rows.filter(r => r.amount > 0).length, [rows]);
  const highlightedRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightRowId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightRowId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows.filter(r => {
      if (filter === 'credit' && !(r.amount > 0)) return false;
      if (filter === 'debit' && !(r.amount < 0)) return false;
      if (usageFilter !== 'all' && usedRowsMap) {
        const isUsed = !!r.rowId && usedRowsMap.has(r.rowId);
        if (usageFilter === 'used' && !isUsed) return false;
        if (usageFilter === 'free' && isUsed) return false;
      }
      if (!needle) return true;
      const hay = `${r.date} ${r.reference || ''} ${r.description || ''} ${r.amount}`.toLowerCase();
      return hay.includes(needle);
    });
    const sorted = [...base].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return (a.amount - b.amount) * dir;
      if (sortKey === 'reference') return ((a.reference || '').localeCompare(b.reference || '')) * dir;
      return (a.date || '').localeCompare(b.date || '') * dir;
    });
    return sorted;
  }, [rows, q, sortKey, sortDir, filter, usageFilter, usedRowsMap]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'amount' ? 'desc' : 'asc'); }
  };

  const credit = useMemo(() => filtered.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0), [filtered]);
  const debit = useMemo(() => filtered.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0), [filtered]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Landmark size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{accountLabel}</h2>
              {bankName && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
                  {bankName}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{rowCount} filas</span>
              {(periodFrom || periodTo) && (
                <span>
                  Período: {periodFrom || '?'} → {periodTo || '?'}
                </span>
              )}
              <span className="text-emerald-600 dark:text-emerald-400">Créditos: {fmtMoney(totalCredit)}</span>
              {totalDebit !== 0 && (
                <span className="text-rose-600 dark:text-rose-400">Débitos: {fmtMoney(totalDebit)}</span>
              )}
              {usedRowsMap && (
                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300">
                  <Lock size={11} /> {usedCount}{creditRowCount > 0 ? `/${creditRowCount}` : ''} conciliada{usedCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                title="Descargar archivo original"
              >
                <Download size={13} /> Archivo
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/40">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por referencia, descripción, monto o fecha…"
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>
          <div className="inline-flex rounded-lg bg-slate-200 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">
            {([
              { k: 'all', label: 'Todos' },
              { k: 'credit', label: 'Créditos' },
              { k: 'debit', label: 'Débitos' },
            ] as const).map(opt => (
              <button
                key={opt.k}
                onClick={() => setFilter(opt.k)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  filter === opt.k
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {usedRowsMap && usedCount > 0 && (
            <div className="inline-flex rounded-lg bg-slate-200 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">
              {([
                { k: 'all', label: 'Todas' },
                { k: 'free', label: 'Libres' },
                { k: 'used', label: 'Usadas' },
              ] as const).map(opt => (
                <button
                  key={opt.k}
                  onClick={() => setUsageFilter(opt.k)}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    usageFilter === opt.k
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span> de {rows.length}
            {filtered.length > 0 && (
              <> · <span className="text-emerald-600">+{fmtMoney(credit)}</span>
                {debit !== 0 && <> · <span className="text-rose-600">{fmtMoney(debit)}</span></>}
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              {rows.length === 0 ? 'Este EdeC no tiene filas cargadas.' : 'Sin resultados para ese filtro.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[11px] uppercase text-slate-500 dark:text-slate-400 z-10">
                <tr>
                  <th className="text-left px-4 py-2 whitespace-nowrap">
                    <button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-white">
                      Fecha <ArrowDownUp size={10} className={sortKey === 'date' ? 'opacity-100' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">
                    <button onClick={() => toggleSort('reference')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-white">
                      Referencia <ArrowDownUp size={10} className={sortKey === 'reference' ? 'opacity-100' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2">Descripción</th>
                  <th className="text-right px-4 py-2 whitespace-nowrap">
                    <button onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-white">
                      Monto <ArrowDownUp size={10} className={sortKey === 'amount' ? 'opacity-100' : 'opacity-30'} />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2 whitespace-nowrap">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const used = !!r.rowId && usedRowsMap ? usedRowsMap.get(r.rowId) : undefined;
                  const usedTitle = used
                    ? `Conciliada el ${new Date(used.claimedAt).toLocaleString('es-VE')}${
                        used.claimedByName ? ` por ${used.claimedByName}` : ''
                      }${used.batchId ? ` · ver lote` : ''}`
                    : '';
                  const isHighlighted = !!highlightRowId && r.rowId === highlightRowId;
                  return (
                    <tr
                      key={r.rowId || idx}
                      ref={isHighlighted ? highlightedRef : undefined}
                      className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        isHighlighted
                          ? 'bg-amber-100 dark:bg-amber-900/30 ring-2 ring-amber-400 dark:ring-amber-500/60'
                          : used
                            ? 'bg-indigo-50/40 dark:bg-indigo-900/10'
                            : r.matched
                              ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                              : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {used && (
                            used.batchId && onOpenAbono ? (
                              <button
                                type="button"
                                onClick={() => onOpenAbono(used.batchId!, used.abonoId)}
                                className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 px-1.5 py-0.5 rounded cursor-pointer"
                                title={usedTitle}
                              >
                                <Lock size={9} /> Usada <ExternalLink size={8} />
                              </button>
                            ) : (
                              <span
                                className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded"
                                title={usedTitle}
                              >
                                <Lock size={9} /> Usada
                              </span>
                            )
                          )}
                          {r.date}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {r.reference || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 max-w-md truncate" title={r.description || ''}>
                        {r.description || <span className="text-slate-400">—</span>}
                      </td>
                      <td className={`px-4 py-2 font-mono text-right whitespace-nowrap ${
                        r.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {r.amount > 0 ? '+' : ''}{fmtMoney(r.amount)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {typeof r.balance === 'number' ? fmtMoney(r.balance) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
