import React, { useMemo, useState } from 'react';
import { Search, Plus, Users, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import type { Customer, Movement, CustomRate, ExchangeRates } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import {
  getDistinctAccounts,
  calcCreditScore,
  daysSince,
  getInitials,
  resolveAccountLabel,
  resolveAccountColor,
} from './cxcHelpers';

interface CxCClientListProps {
  customers: Customer[];
  movements: Movement[];
  rates: ExchangeRates;
  customRates: CustomRate[];
  selectedId?: string;
  onSelect: (customer: Customer) => void;
  onCreateNew: () => void;
}

type QuickFilter = 'ALL' | 'OVERDUE' | 'AT_LIMIT' | 'ZERO';

interface ClientSummary {
  customer: Customer;
  totalBalance: number;
  overdueBalance: number;
  accountCount: number;
  daysSinceLastPayment: number | null;
  score: ReturnType<typeof calcCreditScore>;
}

function buildSummaries(
  customers: Customer[],
  movements: Movement[],
  rates: ExchangeRates
): ClientSummary[] {
  return customers.map(customer => {
    const custMovs = movements.filter(m => m.entityId === customer.id && !m.isSupplierMovement);
    const now = Date.now();

    // Total balance
    const totalFacturas = custMovs
      .filter(m => m.movementType === 'FACTURA' && !m.anulada)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalAbonos = custMovs
      .filter(m => m.movementType === 'ABONO' && !m.anulada)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalBalance = totalFacturas - totalAbonos;

    // Overdue (>30 days unpaid FACTURAs)
    const overdueBalance = custMovs
      .filter(m => m.movementType === 'FACTURA' && !m.pagado && !m.anulada)
      .filter(m => Math.floor((now - new Date(m.date).getTime()) / 86_400_000) > 30)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

    // Distinct accounts used
    const accountCount = getDistinctAccounts(custMovs).length;

    // Days since last payment (ABONO)
    const lastAbono = custMovs
      .filter(m => m.movementType === 'ABONO')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const daysSinceLastPayment = lastAbono ? daysSince(lastAbono.date) : null;

    // Credit score
    const score = calcCreditScore(custMovs);

    return { customer, totalBalance, overdueBalance, accountCount, daysSinceLastPayment, score };
  });
}

const SCORE_COLORS: Record<string, string> = {
  EXCELENTE: 'text-emerald-400 bg-emerald-500/10',
  BUENO: 'text-sky-400 bg-sky-500/10',
  REGULAR: 'text-amber-400 bg-amber-500/10',
  RIESGO: 'text-rose-400 bg-rose-500/10',
};

export function CxCClientList({
  customers,
  movements,
  rates,
  customRates,
  selectedId,
  onSelect,
  onCreateNew,
}: CxCClientListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('ALL');

  const summaries = useMemo(
    () => buildSummaries(customers, movements, rates),
    [customers, movements, rates]
  );

  const filtered = useMemo(() => {
    let result = summaries;

    // Quick filter
    if (filter === 'OVERDUE') result = result.filter(s => s.overdueBalance > 0.01);
    if (filter === 'AT_LIMIT') result = result.filter(s => s.customer.creditLimit && s.totalBalance >= s.customer.creditLimit * 0.9);
    if (filter === 'ZERO') result = result.filter(s => Math.abs(s.totalBalance) < 0.01);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => {
        const name = s.customer.fullName || s.customer.nombre || s.customer.id || '';
        const doc = s.customer.cedula || s.customer.rif || '';
        return name.toLowerCase().includes(q) || doc.toLowerCase().includes(q);
      });
    }

    // Sort: overdue first → highest balance → alphabetical
    return result.sort((a, b) => {
      if (a.overdueBalance > 0 && b.overdueBalance <= 0) return -1;
      if (b.overdueBalance > 0 && a.overdueBalance <= 0) return 1;
      if (a.totalBalance !== b.totalBalance) return b.totalBalance - a.totalBalance;
      const nameA = (a.customer.fullName || a.customer.nombre || a.customer.id || '').toLowerCase();
      const nameB = (b.customer.fullName || b.customer.nombre || b.customer.id || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [summaries, search, filter]);

  const counts = useMemo(() => ({
    all: summaries.length,
    overdue: summaries.filter(s => s.overdueBalance > 0.01).length,
    atLimit: summaries.filter(s => s.customer.creditLimit && s.totalBalance >= s.customer.creditLimit! * 0.9).length,
    zero: summaries.filter(s => Math.abs(s.totalBalance) < 0.01).length,
  }), [summaries]);

  const filterPill = (key: QuickFilter, label: string, count: number, Icon: any) => (
    <button
      onClick={() => setFilter(filter === key ? 'ALL' : key)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
        filter === key
          ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
          : 'border-transparent text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
      }`}
    >
      <Icon size={10} /> {label} {count > 0 && <span className="opacity-60">{count}</span>}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-indigo-400" />
            <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Clientes</h2>
            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black text-slate-400 dark:text-white/30">
              {counts.all}
            </span>
          </div>
          <button
            onClick={onCreateNew}
            className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/20 transition-all"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cedula, RIF..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs font-bold text-slate-700 dark:text-white/70 placeholder:text-slate-300 dark:placeholder:text-white/15 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
          />
        </div>

        {/* Quick filters */}
        <div className="flex gap-1 overflow-x-auto">
          {filterPill('OVERDUE', 'Vencidos', counts.overdue, AlertTriangle)}
          {filterPill('AT_LIMIT', 'Al limite', counts.atLimit, Clock)}
          {filterPill('ZERO', 'Sin deuda', counts.zero, CheckCircle)}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-bold text-slate-300 dark:text-white/15">Sin resultados</p>
          </div>
        ) : filtered.map(s => {
          const name = s.customer.fullName || s.customer.nombre || s.customer.id || 'Cliente';
          const isSelected = selectedId === s.customer.id;
          const hasOverdue = s.overdueBalance > 0.01;
          const isZero = Math.abs(s.totalBalance) < 0.01;

          return (
            <button
              key={s.customer.id}
              onClick={() => onSelect(s.customer)}
              className={`w-full px-4 py-3 text-left border-b border-slate-50 dark:border-white/[0.03] transition-all ${
                isSelected
                  ? 'bg-indigo-500/[0.08] border-l-2 border-l-indigo-500'
                  : 'hover:bg-slate-50 dark:hover:bg-white/[0.02] border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                  hasOverdue ? 'bg-rose-500/10 text-rose-400' : isZero ? 'bg-slate-100 dark:bg-white/[0.04] text-slate-300 dark:text-white/20' : 'bg-indigo-500/10 text-indigo-400'
                }`}>
                  {getInitials(name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">{name}</p>
                    <p className={`text-xs font-black shrink-0 ${
                      s.totalBalance > 0.01 ? 'text-slate-900 dark:text-white' : s.totalBalance < -0.01 ? 'text-emerald-500' : 'text-slate-300 dark:text-white/20'
                    }`}>
                      ${Math.abs(s.totalBalance).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {s.score && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${SCORE_COLORS[s.score] || ''}`}>
                        {s.score}
                      </span>
                    )}
                    {s.accountCount > 0 && (
                      <span className="text-[9px] font-bold text-slate-400 dark:text-white/25">
                        {s.accountCount} {s.accountCount === 1 ? 'cuenta' : 'cuentas'}
                      </span>
                    )}
                    {s.daysSinceLastPayment !== null && (
                      <span className="text-[9px] font-bold text-slate-400 dark:text-white/25">
                        {s.daysSinceLastPayment}d
                      </span>
                    )}
                    {hasOverdue && (
                      <span className="text-[9px] font-bold text-rose-400">
                        ${s.overdueBalance.toFixed(0)} vencido
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
