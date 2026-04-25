import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import type { Movement, CustomRate, ExchangeRates, CreditMode } from '../../../types';
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
  invoiceStatusLabel,
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
  /** Si es invoiceLinked, se muestra columna Estado con OPEN/PARTIAL/PAID y allocations. */
  creditMode?: CreditMode;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

type TypeFilter = 'ALL' | 'FACTURA' | 'ABONO';
type StatusFilter = 'ALL' | 'PENDIENTE' | 'PAGADO';

// Estilo unificado de selects/inputs en la fila de filtros — alineado con el
// resto del rediseño (rounded-lg, bordes slate, text-xs semibold).
const selectCls = "px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400 dark:focus:border-indigo-400 transition-colors cursor-pointer";
const dateCls = "px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400 transition-colors";

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
  creditMode = 'accumulated',
}: LedgerViewProps) {
  const effectiveCanVerify = canVerify ?? canEdit;
  const showInvoiceCol = creditMode === 'invoiceLinked';
  const [accountFilter, setAccountFilter] = useState<TabFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Cuántos filtros activos (≠ default) — para mostrar badge en el botón
  // "Filtros avanzados" y un chip "Limpiar todo" cuando hay alguno aplicado.
  const activeFilterCount =
    (accountFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (rangeFilter !== 'ALL' ? 1 : 0);

  const clearAllFilters = () => {
    setAccountFilter('ALL');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setRangeFilter('ALL');
    setFromDate('');
    setToDate('');
  };

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
      {/* ─── Filtros: 1 fila slim + panel avanzado plegable ───────────────
          Antes había 4 filas de pills (~20 botones simultáneos). Ahora 3
          dropdowns compactos + un único botón que abre filtros adicionales.
          La densidad cae ~60% sin perder ninguna capacidad. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tipo de movimiento */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className={selectCls}
          title="Tipo de movimiento"
        >
          <option value="ALL">Todos los tipos</option>
          <option value="FACTURA">Cargos</option>
          <option value="ABONO">Abonos</option>
        </select>

        {/* Cuenta — solo aparece si hay >1 cuenta distinta */}
        {(accounts.length > 1 || accountFilter !== 'ALL') && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className={selectCls}
            title="Cuenta"
          >
            <option value="ALL">Todas las cuentas</option>
            {accounts.map((acc) => (
              <option key={acc} value={acc}>{resolveAccountLabel(acc, customRates)}</option>
            ))}
          </select>
        )}

        {/* Rango temporal */}
        <select
          value={rangeFilter}
          onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}
          className={selectCls}
          title="Rango temporal"
        >
          <option value="ALL">Todo el historial</option>
          <option value="SINCE_ZERO">Desde último saldo cero</option>
          <option value="SINCE_LAST_DEBT">Desde la última factura</option>
          <option value="CUSTOM">Rango personalizado…</option>
        </select>

        {/* Botón filtros avanzados — abre/cierra panel inline */}
        <button
          onClick={() => setAdvancedOpen(v => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            advancedOpen || statusFilter !== 'ALL' || rangeFilter === 'CUSTOM'
              ? 'border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/[0.08] text-indigo-700 dark:text-indigo-300'
              : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-slate-600 dark:text-white/50 hover:border-slate-300 dark:hover:border-white/[0.16]'
          }`}
        >
          <SlidersHorizontal size={12} />
          Filtros
          {(statusFilter !== 'ALL' || rangeFilter === 'CUSTOM') && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500 text-white">
              {(statusFilter !== 'ALL' ? 1 : 0) + (rangeFilter === 'CUSTOM' ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Limpiar todo — solo si hay filtros activos */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-white/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            title="Limpiar todos los filtros"
          >
            <X size={12} /> Limpiar
          </button>
        )}

        <div className="flex-1" />

        {/* Contador de resultados */}
        <p className="text-[11px] text-slate-400 dark:text-white/30">
          {chronoData.length === entityMovements.length
            ? `${chronoData.length} ${chronoData.length === 1 ? 'movimiento' : 'movimientos'}`
            : `${chronoData.length} de ${entityMovements.length}`}
        </p>
      </div>

      {/* Panel avanzado: estado pago + rango personalizado */}
      {advancedOpen && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02] p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Estado de pago */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Estado de pago</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectCls + ' w-full'}
            >
              <option value="ALL">Todos</option>
              <option value="PENDIENTE">Pendientes (no pagados)</option>
              <option value="PAGADO">Pagados</option>
            </select>
          </div>

          {/* Rango personalizado */}
          {rangeFilter === 'CUSTOM' && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Rango personalizado</label>
              <div className="flex items-center gap-2">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={dateCls + ' flex-1'} />
                <span className="text-[10px] text-slate-400">a</span>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={dateCls + ' flex-1'} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-white/[0.02]">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Fecha</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">NroCtrl</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Concepto</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Cuenta</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 text-right">Tasa</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 text-right">Debe</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 text-right">Haber</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 text-right">Saldo</th>
                {showInvoiceCol && <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Estado</th>}
                {canEdit && <th className="px-2 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={(canEdit ? 9 : 8) + (showInvoiceCol ? 1 : 0)} className="px-4 py-12 text-center text-sm text-slate-300 dark:text-white/15 font-bold">
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
                    {showInvoiceCol && (
                      <td className="px-3 py-2.5">
                        {m.movementType === 'FACTURA' ? (() => {
                          const status = m.invoiceStatus
                            ?? (m.pagado ? 'PAID' : 'OPEN');
                          const amount = m.amountInUSD ?? 0;
                          const allocated = m.allocatedTotal ?? (m.pagado ? amount : 0);
                          const pct = amount > 0 ? Math.round((allocated / amount) * 100) : 0;
                          const style =
                            status === 'PAID' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : status === 'PARTIAL' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-500/15 text-slate-500 dark:text-white/40';
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${style}`}
                              title={`$${allocated.toFixed(2)} de $${amount.toFixed(2)} pagado`}
                            >
                              {invoiceStatusLabel(status)}
                              {status === 'PARTIAL' && <span className="opacity-70">· {pct}%</span>}
                            </span>
                          );
                        })() : m.movementType === 'ABONO' && Array.isArray(m.allocations) && m.allocations.length > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                            title={m.allocations.map(a => `${a.invoiceRef || a.invoiceId.slice(0,6)}: $${a.amount.toFixed(2)}`).join(' · ')}
                          >
                            → {m.allocations.length} fact.
                            {m.overpaymentUSD && m.overpaymentUSD > 0.009 && (
                              <span className="opacity-70">· +${m.overpaymentUSD.toFixed(2)}</span>
                            )}
                          </span>
                        ) : m.movementType === 'ABONO' ? (
                          <span className="text-[10px] text-slate-300 dark:text-white/20">—</span>
                        ) : null}
                      </td>
                    )}
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

      {/* Resumen del set filtrado */}
      {chronoData.length > 0 && (
        <div className="flex items-center gap-5 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Total cargos</p>
            <p className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">${chronoData.reduce((s, m) => s + m.debe, 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Total abonos</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">${chronoData.reduce((s, m) => s + m.haber, 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Saldo final</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
              ${chronoData[chronoData.length - 1]?.runningBalance.toFixed(2) ?? '0.00'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
