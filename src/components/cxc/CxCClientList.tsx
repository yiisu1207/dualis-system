import React, { useMemo, useState } from 'react';
import { Search, Plus, Users, AlertTriangle, CheckCircle, Clock, ShieldCheck, Wallet } from 'lucide-react';
import type { Customer, Movement, CustomRate, ExchangeRates, PendingMovement } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import {
  calcCreditScore,
  daysSince,
  getInitials,
  resolveAccountColor,
} from './cxcHelpers';

interface CxCClientListProps {
  customers: Customer[];
  movements: Movement[];
  rates: ExchangeRates;
  customRates: CustomRate[];
  selectedId?: string;
  onSelect: (customer: Customer) => void;
  onCreateNew?: () => void;
  pendingMovements?: PendingMovement[];
  currentUserId?: string;
}

type QuickFilter = 'ALL' | 'OVERDUE' | 'AT_LIMIT' | 'ZERO' | 'PENDING';

interface AccountBalance {
  account: string;
  label: string;
  color: string;
  usd: number;
}

interface ClientSummary {
  customer: Customer;
  totalBalance: number;
  overdueBalance: number;
  accountBalances: AccountBalance[];
  daysSinceLastPayment: number | null;
  daysSinceLastMov: number | null;
  score: ReturnType<typeof calcCreditScore>;
  pendingCount: number;
  myPendingCount: number;
}

function buildSummaries(
  customers: Customer[],
  movements: Movement[],
  rates: ExchangeRates,
  customRates: CustomRate[],
  pendingMovements: PendingMovement[],
  currentUserId?: string
): ClientSummary[] {
  const labelFor = (id: string) => {
    if (id === 'BCV') return 'BCV';
    const cr = customRates.find(r => r.id === id);
    return cr?.name || id;
  };

  return customers.map(customer => {
    const custMovs = movements.filter(m => m.entityId === customer.id && !m.isSupplierMovement);
    const now = Date.now();

    // Saldo por cuenta
    const balByAcc = new Map<string, number>();
    for (const m of custMovs) {
      if ((m as any).anulada) continue;
      const acc = (m.accountType as string) || 'BCV';
      const usd = getMovementUsdAmount(m, rates);
      const delta = m.movementType === 'FACTURA' ? usd : (m.movementType === 'ABONO' ? -usd : 0);
      balByAcc.set(acc, (balByAcc.get(acc) || 0) + delta);
    }
    const accountBalances: AccountBalance[] = Array.from(balByAcc.entries())
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([account, usd], idx) => ({
        account,
        label: labelFor(account),
        color: account === 'BCV' ? 'indigo' : resolveAccountColor(account, customRates, idx),
        usd,
      }))
      .sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));

    const totalBalance = accountBalances.reduce((s, b) => s + b.usd, 0);

    // Vencidos (>30d sin pagar)
    const overdueBalance = custMovs
      .filter(m => m.movementType === 'FACTURA' && !m.pagado && !m.anulada)
      .filter(m => Math.floor((now - new Date(m.date).getTime()) / 86_400_000) > 30)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

    // Días desde último abono
    const lastAbono = custMovs
      .filter(m => m.movementType === 'ABONO')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const daysSinceLastPayment = lastAbono ? daysSince(lastAbono.date) : null;

    // Días desde último movimiento (cualquiera)
    const lastMov = custMovs
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const daysSinceLastMov = lastMov ? daysSince(lastMov.date) : null;

    // Pendientes de aprobación de esta entidad
    const entPending = pendingMovements.filter(p =>
      p.status === 'pending' &&
      (p.movementDraft as any)?.entityId === customer.id &&
      !(p.movementDraft as any)?.isSupplierMovement
    );
    const pendingCount = entPending.length;
    const myPendingCount = currentUserId
      ? entPending.filter(p => p.createdBy !== currentUserId && !p.approvals?.some((a: any) => a.userId === currentUserId)).length
      : 0;

    const score = calcCreditScore(custMovs);

    return {
      customer,
      totalBalance,
      overdueBalance,
      accountBalances,
      daysSinceLastPayment,
      daysSinceLastMov,
      score,
      pendingCount,
      myPendingCount,
    };
  });
}

const SCORE_COLORS: Record<string, string> = {
  EXCELENTE: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  BUENO: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  REGULAR: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  RIESGO: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

const ACCOUNT_PILL_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  sky: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  violet: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  pink: 'bg-pink-500/10 text-pink-300 border-pink-500/25',
};

const fmtUSD = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtUSDc = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function CxCClientList({
  customers,
  movements,
  rates,
  customRates,
  selectedId,
  onSelect,
  onCreateNew,
  pendingMovements = [],
  currentUserId,
}: CxCClientListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('ALL');
  const [tagFilter, setTagFilter] = useState('');

  const summaries = useMemo(
    () => buildSummaries(customers, movements, rates, customRates, pendingMovements, currentUserId),
    [customers, movements, rates, customRates, pendingMovements, currentUserId]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach(s => (s.customer.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [summaries]);

  const filtered = useMemo(() => {
    let result = summaries;
    if (filter === 'OVERDUE') result = result.filter(s => s.overdueBalance > 0.01);
    if (filter === 'AT_LIMIT') result = result.filter(s => s.customer.creditLimit && s.totalBalance >= s.customer.creditLimit * 0.9);
    if (filter === 'ZERO') result = result.filter(s => Math.abs(s.totalBalance) < 0.01);
    if (filter === 'PENDING') result = result.filter(s => s.pendingCount > 0);

    if (tagFilter) result = result.filter(s => (s.customer.tags ?? []).includes(tagFilter));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => {
        const name = s.customer.fullName || s.customer.nombre || s.customer.id || '';
        const doc = s.customer.cedula || s.customer.rif || '';
        const tags = (s.customer.tags ?? []).join(' ');
        return name.toLowerCase().includes(q) || doc.toLowerCase().includes(q) || tags.includes(q);
      });
    }

    // Orden: pendientes que requieren mi firma → vencidos → mayor deuda → alfabético
    return result.sort((a, b) => {
      if (a.myPendingCount > 0 && b.myPendingCount === 0) return -1;
      if (b.myPendingCount > 0 && a.myPendingCount === 0) return 1;
      if (a.overdueBalance > 0 && b.overdueBalance <= 0) return -1;
      if (b.overdueBalance > 0 && a.overdueBalance <= 0) return 1;
      if (a.totalBalance !== b.totalBalance) return b.totalBalance - a.totalBalance;
      const nameA = (a.customer.fullName || a.customer.nombre || a.customer.id || '').toLowerCase();
      const nameB = (b.customer.fullName || b.customer.nombre || b.customer.id || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [summaries, search, filter, tagFilter]);

  const counts = useMemo(() => ({
    all: summaries.length,
    overdue: summaries.filter(s => s.overdueBalance > 0.01).length,
    atLimit: summaries.filter(s => s.customer.creditLimit && s.totalBalance >= s.customer.creditLimit! * 0.9).length,
    zero: summaries.filter(s => Math.abs(s.totalBalance) < 0.01).length,
    pending: summaries.filter(s => s.pendingCount > 0).length,
  }), [summaries]);

  const filterPill = (key: QuickFilter, label: string, count: number, Icon: any, accent: string) => (
    <button
      onClick={() => setFilter(filter === key ? 'ALL' : key)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border whitespace-nowrap ${
        filter === key
          ? `${accent} border-current`
          : 'border-transparent text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
      }`}
    >
      <Icon size={10} /> {label} {count > 0 && <span className="opacity-70">{count}</span>}
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
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/20 transition-all"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cedula, RIF..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs font-bold text-slate-700 dark:text-white/70 placeholder:text-slate-300 dark:placeholder:text-white/15 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {filterPill('PENDING', 'Pendientes', counts.pending, ShieldCheck, 'bg-amber-500/15 text-amber-400')}
          {filterPill('OVERDUE', 'Vencidos', counts.overdue, AlertTriangle, 'bg-rose-500/15 text-rose-400')}
          {filterPill('AT_LIMIT', 'Al limite', counts.atLimit, Clock, 'bg-indigo-500/15 text-indigo-400')}
          {filterPill('ZERO', 'Sin deuda', counts.zero, CheckCircle, 'bg-emerald-500/15 text-emerald-400')}
        </div>

        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-[10px] font-bold text-slate-600 dark:text-white/50 outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">Todas las etiquetas</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-300 dark:text-white/15">
              {filter === 'OVERDUE' ? 'Sin clientes vencidos'
                : filter === 'AT_LIMIT' ? 'Sin clientes al límite'
                : filter === 'ZERO' ? 'Todos los clientes con deuda'
                : filter === 'PENDING' ? 'Sin aprobaciones pendientes'
                : 'Sin resultados'}
            </p>
            <p className="text-[10px] font-bold text-slate-300 dark:text-white/10 mt-1">
              {search ? 'Prueba con otro término' : 'Cambia el filtro o crea un cliente'}
            </p>
          </div>
        ) : filtered.map(s => {
          const name = s.customer.fullName || s.customer.nombre || s.customer.id || 'Cliente';
          const doc = s.customer.cedula || s.customer.rif || '';
          const isSelected = selectedId === s.customer.id;
          const hasOverdue = s.overdueBalance > 0.01;
          const hasPositive = s.totalBalance > 0.01;
          const hasNegative = s.totalBalance < -0.01;
          const isZero = !hasPositive && !hasNegative;

          const balanceColor = hasOverdue
            ? 'text-rose-500 dark:text-rose-400'
            : hasPositive
              ? 'text-slate-900 dark:text-white'
              : hasNegative
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-slate-300 dark:text-white/20';

          const avatarColor = hasOverdue
            ? 'bg-rose-500/15 text-rose-400 ring-rose-500/30'
            : isZero
              ? 'bg-slate-100 dark:bg-white/[0.04] text-slate-300 dark:text-white/20 ring-slate-200 dark:ring-white/[0.06]'
              : hasNegative
                ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                : 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/30';

          return (
            <button
              key={s.customer.id}
              onClick={() => onSelect(s.customer)}
              className={`w-full px-3 py-3 text-left border-b border-slate-50 dark:border-white/[0.03] transition-all relative ${
                isSelected
                  ? 'bg-indigo-500/[0.08] border-l-[3px] border-l-indigo-500'
                  : 'hover:bg-slate-50 dark:hover:bg-white/[0.02] border-l-[3px] border-l-transparent'
              } ${s.myPendingCount > 0 ? 'border-l-amber-500' : ''}`}
            >
              {/* Header: avatar + nombre + total */}
              <div className="flex items-start gap-2.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ring-1 ${avatarColor}`}>
                  {getInitials(name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-slate-800 dark:text-white truncate leading-tight">{name}</p>
                      {doc && (
                        <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 truncate mt-0.5">{doc}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black tabular-nums leading-tight ${balanceColor}`}>
                        {fmtUSD(Math.abs(s.totalBalance))}
                      </p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25 mt-0.5">
                        {hasPositive ? 'TE DEBE' : hasNegative ? 'A FAVOR' : 'AL DÍA'}
                      </p>
                    </div>
                  </div>

                  {/* Pills por cuenta */}
                  {s.accountBalances.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.accountBalances.slice(0, 4).map(b => {
                        const pillColor = ACCOUNT_PILL_COLORS[b.color] || ACCOUNT_PILL_COLORS.indigo;
                        return (
                          <span
                            key={b.account}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-black tabular-nums ${pillColor}`}
                          >
                            <Wallet size={8} />
                            {b.label} {fmtUSDc(Math.abs(b.usd))}
                          </span>
                        );
                      })}
                      {s.accountBalances.length > 4 && (
                        <span className="text-[9px] font-bold text-slate-400 dark:text-white/30 self-center">
                          +{s.accountBalances.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer: badges */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {s.myPendingCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-wider">
                        <ShieldCheck size={9} /> {s.myPendingCount} firmar
                      </span>
                    )}
                    {s.pendingCount > s.myPendingCount && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 text-[9px] font-black uppercase tracking-wider">
                        <ShieldCheck size={9} /> {s.pendingCount - s.myPendingCount} en cola
                      </span>
                    )}
                    {hasOverdue && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-black uppercase tracking-wider">
                        <AlertTriangle size={9} /> {fmtUSDc(s.overdueBalance)} vencido
                      </span>
                    )}
                    {s.score && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black border ${SCORE_COLORS[s.score] || ''}`}>
                        {s.score}
                      </span>
                    )}
                    {(s.customer.tags ?? []).slice(0, 2).map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{t}</span>
                    ))}
                    {s.daysSinceLastMov !== null && (
                      <span className="ml-auto text-[9px] font-bold text-slate-400 dark:text-white/25 tabular-nums">
                        {s.daysSinceLastMov === 0 ? 'hoy' : `hace ${s.daysSinceLastMov}d`}
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
