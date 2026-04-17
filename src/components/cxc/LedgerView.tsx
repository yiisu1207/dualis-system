import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Movement, CustomRate, ExchangeRates } from '../../../types';
import {
  type TabFilter,
  type RangeFilter,
  filterMovementsByRange,
  buildChronoData,
  resolveAccountLabel,
  resolveAccountColor,
  getDistinctAccounts,
  formatDateTime,
  hasActiveDiscount,
} from './cxcHelpers';
import VerificationBadge from '../VerificationBadge';
import InlineVerifyControl from '../InlineVerifyControl';

interface LedgerViewProps {
  movements: Movement[];
  entityId: string;
  rates: ExchangeRates;
  customRates: CustomRate[];
  onEdit?: (movement: Movement) => void;
  onDelete?: (id: string) => void;
  canEdit: boolean;
  mode?: 'cxc' | 'cxp';
  currentUserId?: string;
  currentUserName?: string;
  canVerify?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

type TypeFilter = 'ALL' | 'FACTURA' | 'ABONO';
type StatusFilter = 'ALL' | 'PENDIENTE' | 'PAGADO';

const pill = (active: boolean, color?: string) =>
  `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
    active
      ? `bg-${color ?? 'indigo'}-500/20 border-${color ?? 'indigo'}-500/30 text-${color ?? 'indigo'}-400`
      : 'bg-transparent border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:border-slate-300 dark:hover:border-white/[0.12]'
  }`;

export function LedgerView({
  movements,
  entityId,
  rates,
  customRates,
  onEdit,
  onDelete,
  canEdit,
  currentUserId,
  currentUserName,
  canVerify,
}: LedgerViewProps) {
  const effectiveCanVerify = canVerify ?? canEdit;
  const [accountFilter, setAccountFilter] = useState<TabFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const entityMovements = useMemo(
    () => movements.filter(m => m.entityId === entityId),
    [movements, entityId]
  );

  const accounts = useMemo(() => getDistinctAccounts(entityMovements), [entityMovements]);

  const filtered = useMemo(() => {
    let result = filterMovementsByRange(entityMovements, accountFilter, rangeFilter, fromDate, toDate, rates);
    if (typeFilter !== 'ALL') result = result.filter(m => m.movementType === typeFilter);
    if (statusFilter === 'PENDIENTE') result = result.filter(m => !m.pagado && !m.anulada);
    if (statusFilter === 'PAGADO') result = result.filter(m => m.pagado);
    return result;
  }, [entityMovements, accountFilter, typeFilter, statusFilter, rangeFilter, fromDate, toDate, rates]);

  const chronoData = useMemo(() => buildChronoData(filtered, rates), [filtered, rates]);

  // Pagination: reset to page 0 when filters/data change
  useEffect(() => { setPage(0); }, [accountFilter, typeFilter, statusFilter, rangeFilter, fromDate, toDate, pageSize, entityId]);

  const totalPages = Math.max(1, Math.ceil(chronoData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, chronoData.length);
  const pagedData = useMemo(() => chronoData.slice(pageStart, pageEnd), [chronoData, pageStart, pageEnd]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Account pills */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setAccountFilter('ALL')} className={pill(accountFilter === 'ALL')}>Todas</button>
          <button onClick={() => setAccountFilter('BCV')} className={pill(accountFilter === 'BCV', 'indigo')}>BCV</button>
          {accounts.filter(a => a !== 'BCV').map(acc => {
            const color = resolveAccountColor(acc, customRates);
            return (
              <button key={acc} onClick={() => setAccountFilter(acc)} className={pill(accountFilter === acc, color)}>
                {resolveAccountLabel(acc, customRates)}
              </button>
            );
          })}
        </div>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/[0.06] self-center" />
        {/* Type pills */}
        <div className="flex gap-1.5">
          <button onClick={() => setTypeFilter('ALL')} className={pill(typeFilter === 'ALL')}>Todos</button>
          <button onClick={() => setTypeFilter('FACTURA')} className={pill(typeFilter === 'FACTURA', 'rose')}>Cargos</button>
          <button onClick={() => setTypeFilter('ABONO')} className={pill(typeFilter === 'ABONO', 'emerald')}>Abonos</button>
        </div>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/[0.06] self-center" />
        {/* Status pills */}
        <div className="flex gap-1.5">
          <button onClick={() => setStatusFilter('ALL')} className={pill(statusFilter === 'ALL')}>Todos</button>
          <button onClick={() => setStatusFilter('PENDIENTE')} className={pill(statusFilter === 'PENDIENTE', 'amber')}>Pendiente</button>
          <button onClick={() => setStatusFilter('PAGADO')} className={pill(statusFilter === 'PAGADO', 'emerald')}>Pagado</button>
        </div>
      </div>

      {/* Range & Export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(['ALL', 'SINCE_ZERO', 'SINCE_LAST_DEBT', 'CUSTOM'] as RangeFilter[]).map(r => (
            <button key={r} onClick={() => setRangeFilter(r)} className={pill(rangeFilter === r)}>
              {r === 'ALL' ? 'Todo' : r === 'SINCE_ZERO' ? 'Desde cero' : r === 'SINCE_LAST_DEBT' ? 'Ult. factura' : 'Rango'}
            </button>
          ))}
        </div>
        {rangeFilter === 'CUSTOM' && (
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-700 dark:text-white/70 outline-none" />
            <span className="text-[10px] text-slate-400">a</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-700 dark:text-white/70 outline-none" />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02]">
                <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Fecha</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">NroCtrl</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Concepto</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Cuenta</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 text-right">Tasa</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 text-right">Debe</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 text-right">Haber</th>
                <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 text-right">Saldo</th>
                {canEdit && <th className="px-2 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-4 py-12 text-center text-sm text-slate-300 dark:text-white/15 font-bold">
                    Sin movimientos
                  </td>
                </tr>
              ) : pagedData.map(m => {
                const isPending = m.movementType === 'FACTURA' && !m.pagado && !m.anulada;
                const accColor = resolveAccountColor(m.accountType as string, customRates);
                const discount = hasActiveDiscount(m);
                return (
                  <tr
                    key={m.id}
                    className={`group border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${isPending ? 'bg-rose-500/[0.03]' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-bold text-slate-600 dark:text-white/60 whitespace-nowrap">{formatDateTime(m.displayDate)}</p>
                      {m.dueDate && isPending && (
                        <p className="text-[9px] text-rose-400 font-bold mt-0.5">Vence: {m.dueDate.split('T')[0]}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-slate-400 dark:text-white/30">{m.nroControl || '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0 max-w-[240px]">
                        <p className="text-xs font-bold text-slate-700 dark:text-white/70 line-clamp-1">{m.concept || '-'}</p>
                        {currentUserId ? (
                          <InlineVerifyControl
                            movement={m as Movement}
                            currentUserId={currentUserId}
                            currentUserName={currentUserName || 'Usuario'}
                            canVerify={effectiveCanVerify}
                            size="xs"
                          />
                        ) : (
                          <VerificationBadge movement={m} size="xs" />
                        )}
                      </div>
                      {discount && <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-500 uppercase">Dto. activo</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-${accColor}-500/10 text-${accColor}-400`}>
                        <span className={`w-1.5 h-1.5 rounded-full bg-${accColor}-500`} />
                        {resolveAccountLabel(m.accountType as string, customRates)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono text-slate-400 dark:text-white/30">
                      {m.rateUsed > 0 ? m.rateUsed.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-black text-rose-500">
                      {m.debe > 0 ? `$${m.debe.toFixed(2)}` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-black text-emerald-500">
                      {m.haber > 0 ? `$${m.haber.toFixed(2)}` : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-sm font-black ${m.runningBalance > 0.01 ? 'text-slate-900 dark:text-white' : m.runningBalance < -0.01 ? 'text-emerald-500' : 'text-slate-300 dark:text-white/20'}`}>
                      ${m.runningBalance.toFixed(2)}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2.5">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onEdit && (
                            <button onClick={() => onEdit(m)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-colors">
                              <Pencil size={12} className="text-slate-400" />
                            </button>
                          )}
                          {onDelete && (
                            <button onClick={() => onDelete(m.id)} className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/10 transition-colors">
                              <Trash2 size={12} className="text-rose-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination controls */}
      {chronoData.length > pageSize && (
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30">Por página</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[10px] font-black text-slate-700 dark:text-white/70 outline-none cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/30">
            {pageStart + 1}–{pageEnd} de {chronoData.length}
          </p>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.04] text-[10px] font-black text-slate-700 dark:text-white/70">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      {chronoData.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04]">
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30">Total Debe</p>
            <p className="text-sm font-black text-rose-500">${chronoData.reduce((s, m) => s + m.debe, 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30">Total Haber</p>
            <p className="text-sm font-black text-emerald-500">${chronoData.reduce((s, m) => s + m.haber, 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30">Saldo Final</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              ${chronoData[chronoData.length - 1]?.runningBalance.toFixed(2) ?? '0.00'}
            </p>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-white/25 font-bold ml-auto">
            {chronoData.length} movimientos
          </div>
        </div>
      )}
    </div>
  );
}
