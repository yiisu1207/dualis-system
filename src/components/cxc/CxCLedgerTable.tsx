import React, { useMemo, useState } from 'react';
import { Movement, MovementType, ExchangeRates, AccountType } from '../../../types';
import { formatCurrency, getMovementUsdAmount } from '../../utils/formatters';
import { LayoutGrid, Table2, ArrowUpDown, Filter } from 'lucide-react';
import VerificationBadge from '../VerificationBadge';
import {
  ChronoMovement,
  ViewStyle,
  TabFilter,
  RangeFilter,
  formatDateTime,
  filterMovementsByRange,
  buildChronoData,
} from './cxcHelpers';

type MovTypeFilter = 'ALL' | 'FACTURA' | 'ABONO';
type StatusFilter = 'ALL' | 'PAGADO' | 'PENDIENTE';
type SortField = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

interface Props {
  movements: Movement[];
  rates: ExchangeRates;
  entityId: string;
  accountTab: TabFilter;
  rangeFilter: RangeFilter;
  rangeFrom: string;
  rangeTo: string;
  isPayroll: boolean;
  onEditClick: (mov: Movement) => void;
}

export default function CxCLedgerTable({
  movements,
  rates,
  entityId,
  accountTab,
  rangeFilter,
  rangeFrom,
  rangeTo,
  isPayroll,
  onEditClick,
}: Props) {
  const [viewStyle, setViewStyle] = useState<ViewStyle>('dualis');
  const [movTypeFilter, setMovTypeFilter] = useState<MovTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const entityMovs = useMemo(
    () => movements.filter((m) => m.entityId === entityId),
    [movements, entityId]
  );

  const filteredData = useMemo(() => {
    const scoped = filterMovementsByRange(
      entityMovs,
      accountTab,
      rangeFilter,
      rangeFrom,
      rangeTo,
      rates
    );

    let result = scoped;

    // Movement type filter
    if (movTypeFilter !== 'ALL') {
      result = result.filter((m) => m.movementType === movTypeFilter);
    }

    // Status filter
    if (statusFilter === 'PAGADO') {
      result = result.filter((m) => (m as any).pagado === true);
    } else if (statusFilter === 'PENDIENTE') {
      result = result.filter((m) => !(m as any).pagado);
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      const aDate = new Date(a.createdAt || a.date).getTime();
      const bDate = new Date(b.createdAt || b.date).getTime();
      if (sortField === 'date') {
        return sortDir === 'asc' ? aDate - bDate : bDate - aDate;
      }
      const aAmt = getMovementUsdAmount(a, rates);
      const bAmt = getMovementUsdAmount(b, rates);
      return sortDir === 'asc' ? aAmt - bAmt : bAmt - aAmt;
    });

    return sorted;
  }, [entityMovs, accountTab, rangeFilter, rangeFrom, rangeTo, rates, movTypeFilter, statusFilter, sortField, sortDir]);

  // Build chrono with running balance (always chronological order for balance)
  const chronoForBalance = useMemo(() => {
    const scoped = filterMovementsByRange(
      entityMovs,
      accountTab,
      rangeFilter,
      rangeFrom,
      rangeTo,
      rates
    );
    const sorted = [...scoped].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    return buildChronoData(sorted, rates);
  }, [entityMovs, accountTab, rangeFilter, rangeFrom, rangeTo, rates]);

  // Map balance to each movement by ID for display
  const balanceMap = useMemo(() => {
    const map = new Map<string, ChronoMovement>();
    chronoForBalance.forEach((cm) => map.set(cm.id, cm));
    return map;
  }, [chronoForBalance]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const getContextBorderColor = () => {
    switch (accountTab) {
      case AccountType.BCV: return 'border-blue-800';
      case AccountType.GRUPO: return 'border-orange-600';
      case AccountType.DIVISA: return 'border-emerald-700';
      default: return 'border-slate-800';
    }
  };

  return (
    <div className={`app-panel overflow-hidden flex-1 flex flex-col border-t-[6px] ${getContextBorderColor()}`}>
      {/* Filter Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-white/[0.02]">
        {/* View toggle */}
        <div className="flex bg-slate-100 dark:bg-white/[0.07] rounded-lg p-0.5 border border-slate-200 dark:border-white/[0.08]">
          <button
            onClick={() => setViewStyle('dualis')}
            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
              viewStyle === 'dualis'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <LayoutGrid size={11} /> Dualis
          </button>
          <button
            onClick={() => setViewStyle('excel')}
            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
              viewStyle === 'excel'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <Table2 size={11} /> Excel
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-white/10 hidden sm:block" />

        {/* Movement type filter */}
        <div className="flex items-center gap-1">
          <Filter size={10} className="text-slate-400" />
          {(['ALL', 'FACTURA', 'ABONO'] as MovTypeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setMovTypeFilter(f)}
              className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                movTypeFilter === f
                  ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {f === 'ALL' ? 'Todos' : f === 'FACTURA' ? 'Cargos' : 'Abonos'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(['ALL', 'PENDIENTE', 'PAGADO'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                statusFilter === f
                  ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {f === 'ALL' ? 'Estado: Todos' : f}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort */}
        <button
          onClick={() => toggleSort('date')}
          className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1 transition-all ${
            sortField === 'date' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <ArrowUpDown size={10} /> Fecha {sortField === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
        </button>
        <button
          onClick={() => toggleSort('amount')}
          className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1 transition-all ${
            sortField === 'amount' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <ArrowUpDown size={10} /> Monto {sortField === 'amount' && (sortDir === 'asc' ? '↑' : '↓')}
        </button>
      </div>

      {/* Table Content */}
      <div className="overflow-auto custom-scroll flex-1">
        {viewStyle === 'excel' ? (
          /* VISTA EXCEL — dense spreadsheet */
          <table className="w-full text-[11px] font-mono min-w-[750px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 border-b border-slate-200 dark:border-white/10">
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-2 py-2 text-left">Fecha</th>
                <th className="px-2 py-2 text-left">NroCtrl</th>
                <th className="px-2 py-2 text-left">Concepto</th>
                <th className="px-2 py-2 text-center">Cuenta</th>
                <th className="px-2 py-2 text-center">Tasa</th>
                <th className="px-2 py-2 text-right">Debe</th>
                <th className="px-2 py-2 text-right">Haber</th>
                <th className="px-2 py-2 text-right">Saldo</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 text-xs italic font-sans">
                    Sin movimientos para estos filtros
                  </td>
                </tr>
              ) : (
                filteredData.map((mov) => {
                  const cm = balanceMap.get(mov.id);
                  const debe = cm?.debe ?? 0;
                  const haber = cm?.haber ?? 0;
                  const balance = cm?.runningBalance ?? 0;
                  return (
                    <tr
                      key={mov.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.03] group"
                    >
                      <td className="px-2 py-1 text-slate-500 whitespace-nowrap">
                        {mov.date}
                      </td>
                      <td className="px-2 py-1 text-slate-400">
                        {(mov as any).nroControl || '—'}
                      </td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300 max-w-[240px] font-sans text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{mov.concept}</span>
                          <VerificationBadge movement={mov} size="xs" />
                        </div>
                      </td>
                      <td className="px-2 py-1 text-center text-slate-400 text-[9px]">
                        {mov.accountType}
                      </td>
                      <td className="px-2 py-1 text-center text-slate-400">
                        {mov.rateUsed > 1 ? Number(mov.rateUsed).toFixed(2) : '1:1'}
                      </td>
                      <td className="px-2 py-1 text-right text-rose-600 font-bold">
                        {debe > 0 ? debe.toFixed(2) : ''}
                      </td>
                      <td className="px-2 py-1 text-right text-emerald-600 font-bold">
                        {haber > 0 ? haber.toFixed(2) : ''}
                      </td>
                      <td className={`px-2 py-1 text-right font-bold ${balance > 0.01 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {balance.toFixed(2)}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          onClick={() => onEditClick(mov)}
                          className="w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 bg-slate-100 dark:bg-white/[0.07] hover:bg-indigo-500 hover:text-white text-slate-400 transition-all flex items-center justify-center"
                        >
                          <i className="fa-solid fa-pencil text-[8px]"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          /* VISTA DUALIS — rich card-based */
          <div className="min-w-[700px]">
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10 grid grid-cols-10 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              <div className="col-span-2">Fecha / Hora</div>
              <div className="col-span-2">Concepto</div>
              <div className="col-span-1 text-center">Referencia</div>
              <div className="col-span-1 text-center">Cuenta</div>
              <div className="col-span-1 text-center">Tasa</div>
              <div className="col-span-1 text-right text-rose-600">
                {isPayroll ? 'Devengado (+)' : 'Cargo ($)'}
              </div>
              <div className="col-span-1 text-right text-emerald-600">
                {isPayroll ? 'Deduccion (-)' : 'Abono ($)'}
              </div>
              <div className="col-span-1 text-center">Accion</div>
            </div>

            {filteredData.length === 0 ? (
              <div className="py-16 text-center text-slate-300 font-black uppercase">
                <div className="text-sm">Sin movimientos registrados</div>
                <div className="text-[10px] font-semibold text-slate-400 mt-2">
                  Hoja de vida activa, sin operaciones para estos filtros.
                </div>
              </div>
            ) : (
              filteredData.map((mov) => {
                const cm = balanceMap.get(mov.id);
                const debe = cm?.debe ?? 0;
                const haber = cm?.haber ?? 0;
                const balance = cm?.runningBalance ?? 0;
                const daysSinceLast = cm?.daysSinceLast;

                return (
                  <div
                    key={mov.id}
                    className="px-4 sm:px-8 py-4 border-b border-slate-100 dark:border-white/[0.07] grid grid-cols-10 items-center hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors text-xs group"
                  >
                    <div className="col-span-2 font-bold text-slate-500">
                      {formatDateTime(mov.createdAt || mov.date)}
                    </div>
                    <div
                      className="col-span-2 font-medium text-slate-700 dark:text-slate-300 pr-4 flex items-center gap-1.5 min-w-0"
                      title={mov.concept}
                    >
                      <span className="truncate">{mov.concept}</span>
                      <VerificationBadge movement={mov} size="xs" />
                    </div>
                    <div className="col-span-1 text-center font-mono text-slate-400 text-[10px]">
                      {mov.reference || '-'}
                    </div>
                    <div className="col-span-1 text-center text-[10px] font-black text-slate-500">
                      {mov.accountType}
                    </div>
                    <div className="col-span-1 text-center font-mono text-slate-400 text-[10px]">
                      {mov.rateUsed > 1 ? `Bs ${mov.rateUsed}` : '1:1'}
                    </div>
                    <div className="col-span-1 text-right font-black font-mono text-rose-600">
                      {debe > 0 ? formatCurrency(debe) : '-'}
                    </div>
                    <div className="col-span-1 text-right font-black font-mono text-emerald-600">
                      {haber > 0 ? formatCurrency(haber) : '-'}
                    </div>
                    <div className="col-span-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEditClick(mov)}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.07] hover:bg-indigo-500 hover:text-white text-slate-500 transition-all flex items-center justify-center"
                      >
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                      </button>
                    </div>

                    {/* Row footer */}
                    <div className="col-span-10 mt-2 pt-2 border-t border-dashed border-slate-100 dark:border-white/[0.07] flex flex-wrap justify-between items-center gap-2 opacity-60">
                      <div className="text-[9px] uppercase font-bold text-slate-400 flex flex-wrap gap-3">
                        <span>Cuenta: {mov.accountType}</span>
                        <span>Moneda: {mov.currency}</span>
                        <span>
                          Monto: {mov.currency === 'BS' ? 'Bs' : '$'}
                          {` ${Number(mov.originalAmount ?? mov.amount ?? 0).toFixed(2)}`}
                        </span>
                        <span>Tasa: {mov.rateUsed > 1 ? mov.rateUsed : '1:1'}</span>
                        <span>Dias desde ultimo: {daysSinceLast ?? '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase font-bold text-slate-400">
                          {isPayroll ? 'Saldo Acumulado:' : 'Saldo tras operacion:'}
                        </span>
                        <span
                          className={`font-mono font-black ${
                            isPayroll
                              ? balance >= 0 ? 'text-indigo-500' : 'text-rose-500'
                              : balance > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {formatCurrency(balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
