import React, { useMemo, useState, useEffect } from 'react';
import { Search, Plus, Building2, AlertTriangle, CheckCircle, ShieldCheck, Wallet, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import type { Supplier, Movement, CustomRate, ExchangeRates, PendingMovement } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import { daysSince, getInitials, resolveAccountColor } from './cxcHelpers';

const LS_SEARCH = 'dualis_cxp_search';
const LS_FILTER = 'dualis_cxp_filter';

interface CxPSupplierListProps {
  suppliers: Supplier[];
  movements: Movement[];
  rates: ExchangeRates;
  customRates?: CustomRate[];
  selectedId?: string;
  onSelect: (supplier: Supplier) => void;
  onCreateNew?: () => void;
  pendingMovements?: PendingMovement[];
  currentUserId?: string;
  onQuickAction?: (supplier: Supplier, type: 'FACTURA' | 'ABONO') => void;
}

type QuickFilter = 'ALL' | 'WITH_DEBT' | 'OVERDUE' | 'ZERO' | 'PENDING';

interface AccountBalance {
  account: string;
  label: string;
  color: string;
  usd: number;
}

interface SupplierSummary {
  supplier: Supplier;
  totalBalance: number;
  overdueBalance: number;
  accountBalances: AccountBalance[];
  movementCount: number;
  daysSinceLastMov: number | null;
  pendingCount: number;
  myPendingCount: number;
}

function buildSummaries(
  suppliers: Supplier[],
  movements: Movement[],
  rates: ExchangeRates,
  customRates: CustomRate[],
  pendingMovements: PendingMovement[],
  currentUserId?: string
): SupplierSummary[] {
  const labelFor = (id: string) => {
    if (id === 'BCV') return 'BCV';
    const cr = customRates.find(r => r.id === id);
    return cr?.name || id;
  };

  return suppliers.map(supplier => {
    const suppMovs = movements.filter(m => m.entityId === supplier.id && (m as any).isSupplierMovement);
    const now = Date.now();

    const balByAcc = new Map<string, number>();
    for (const m of suppMovs) {
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
        color: account === 'BCV' ? 'amber' : resolveAccountColor(account, customRates, idx),
        usd,
      }))
      .sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd));

    const totalBalance = accountBalances.reduce((s, b) => s + b.usd, 0);

    const overdueBalance = suppMovs
      .filter(m => m.movementType === 'FACTURA' && !(m as any).pagado && !(m as any).anulada)
      .filter(m => Math.floor((now - new Date(m.date).getTime()) / 86_400_000) > 30)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

    const lastMov = suppMovs
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const daysSinceLastMov = lastMov ? daysSince(lastMov.date) : null;

    const entPending = pendingMovements.filter(p =>
      p.status === 'pending' &&
      (p.movementDraft as any)?.entityId === supplier.id &&
      (p.movementDraft as any)?.isSupplierMovement === true
    );
    const pendingCount = entPending.length;
    const myPendingCount = currentUserId
      ? entPending.filter(p => p.createdBy !== currentUserId && !p.approvals?.some((a: any) => a.userId === currentUserId)).length
      : 0;

    return {
      supplier,
      totalBalance,
      overdueBalance,
      accountBalances,
      movementCount: suppMovs.length,
      daysSinceLastMov,
      pendingCount,
      myPendingCount,
    };
  });
}

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
const fmtK = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
};

export function CxPSupplierList({
  suppliers,
  movements,
  rates,
  customRates = [],
  selectedId,
  onSelect,
  onCreateNew,
  pendingMovements = [],
  currentUserId,
  onQuickAction,
}: CxPSupplierListProps) {
  const [search, setSearch] = useState<string>(() => {
    try { return localStorage.getItem(LS_SEARCH) || ''; } catch { return ''; }
  });
  const [filter, setFilter] = useState<QuickFilter>(() => {
    try { return (localStorage.getItem(LS_FILTER) as QuickFilter) || 'ALL'; } catch { return 'ALL'; }
  });

  useEffect(() => { try { localStorage.setItem(LS_SEARCH, search); } catch {} }, [search]);
  useEffect(() => { try { localStorage.setItem(LS_FILTER, filter); } catch {} }, [filter]);

  const summaries = useMemo(
    () => buildSummaries(suppliers, movements, rates, customRates, pendingMovements, currentUserId),
    [suppliers, movements, rates, customRates, pendingMovements, currentUserId]
  );

  const filtered = useMemo(() => {
    let result = summaries;

    if (filter === 'WITH_DEBT') result = result.filter(s => s.totalBalance > 0.01);
    if (filter === 'OVERDUE') result = result.filter(s => s.overdueBalance > 0.01);
    if (filter === 'ZERO') result = result.filter(s => Math.abs(s.totalBalance) < 0.01);
    if (filter === 'PENDING') result = result.filter(s => s.pendingCount > 0);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => {
        const name = s.supplier.id || '';
        const rif = s.supplier.rif || '';
        const contacto = s.supplier.contacto || '';
        const cat = s.supplier.categoria || '';
        return name.toLowerCase().includes(q) || rif.toLowerCase().includes(q) || contacto.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
      });
    }

    return result.slice().sort((a, b) => {
      if (a.myPendingCount > 0 && b.myPendingCount === 0) return -1;
      if (b.myPendingCount > 0 && a.myPendingCount === 0) return 1;
      if (a.overdueBalance > 0 && b.overdueBalance <= 0) return -1;
      if (b.overdueBalance > 0 && a.overdueBalance <= 0) return 1;
      if (a.totalBalance !== b.totalBalance) return b.totalBalance - a.totalBalance;
      return (a.supplier.id || '').localeCompare(b.supplier.id || '');
    });
  }, [summaries, search, filter]);

  const counts = useMemo(() => ({
    all: summaries.length,
    withDebt: summaries.filter(s => s.totalBalance > 0.01).length,
    overdue: summaries.filter(s => s.overdueBalance > 0.01).length,
    zero: summaries.filter(s => Math.abs(s.totalBalance) < 0.01).length,
    pending: summaries.filter(s => s.pendingCount > 0).length,
  }), [summaries]);

  const aggregates = useMemo(() => {
    let totalOwed = 0;
    let totalCredit = 0;
    let overdueTotal = 0;
    let creditorCount = 0;
    for (const s of filtered) {
      if (s.totalBalance > 0.01) { totalOwed += s.totalBalance; creditorCount++; }
      else if (s.totalBalance < -0.01) { totalCredit += -s.totalBalance; }
      if (s.overdueBalance > 0.01) overdueTotal += s.overdueBalance;
    }
    return { totalOwed, totalCredit, overdueTotal, creditorCount };
  }, [filtered]);

  const filterPill = (key: QuickFilter, label: string, count: number, Icon: any, accent: string) => {
    const active = filter === key;
    return (
      <button
        onClick={() => setFilter(active ? 'ALL' : key)}
        className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border whitespace-nowrap ${
          active
            ? `${accent} border-current shadow-sm ring-1 ring-current/20`
            : 'border-slate-200/60 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-600 dark:hover:text-white/50'
        }`}
      >
        <Icon size={10} />
        {label}
        {count > 0 && (
          <span className={`min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center text-[9px] font-black tabular-nums ${
            active ? 'bg-current/15' : 'bg-slate-200/80 dark:bg-white/[0.08] text-slate-500 dark:text-white/40 group-hover:bg-slate-300/80'
          }`}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-amber-400" />
            <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Proveedores</h2>
            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black text-slate-400 dark:text-white/30">
              {counts.all}
            </span>
          </div>
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center hover:bg-amber-500/20 transition-all"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RIF, contacto..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs font-bold text-slate-700 dark:text-white/70 placeholder:text-slate-300 dark:placeholder:text-white/15 outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
          />
        </div>

        {/* Stats agregadas */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 px-0.5">
            <div className="rounded-lg bg-amber-500/[0.04] border border-amber-500/15 px-2 py-1.5">
              <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-amber-400">
                <TrendingUp size={8} /> Les debes
              </div>
              <div className="text-[11px] font-black tabular-nums text-slate-800 dark:text-white mt-0.5">
                {fmtK(aggregates.totalOwed)}
              </div>
              <div className="text-[8px] font-bold text-amber-400/70 mt-0.5">
                {aggregates.creditorCount} {aggregates.creditorCount === 1 ? 'acreedor' : 'acreedores'}
              </div>
            </div>
            <div className="rounded-lg bg-rose-500/[0.04] border border-rose-500/15 px-2 py-1.5">
              <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-rose-400">
                <AlertTriangle size={8} /> Vencido
              </div>
              <div className="text-[11px] font-black tabular-nums text-rose-500 dark:text-rose-400 mt-0.5">
                {fmtK(aggregates.overdueTotal)}
              </div>
              <div className="text-[8px] font-bold text-rose-400/70 mt-0.5">
                &gt;30d sin pagar
              </div>
            </div>
            <div className="rounded-lg bg-emerald-500/[0.04] border border-emerald-500/15 px-2 py-1.5">
              <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-400">
                <TrendingDown size={8} /> A favor
              </div>
              <div className="text-[11px] font-black tabular-nums text-emerald-500 dark:text-emerald-400 mt-0.5">
                {fmtK(aggregates.totalCredit)}
              </div>
              <div className="text-[8px] font-bold text-emerald-400/70 mt-0.5">
                saldo acreedor
              </div>
            </div>
          </div>
        )}

        {/* Quick filters */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-0.5">
          {filterPill('PENDING', 'Pendientes', counts.pending, ShieldCheck, 'bg-amber-500/15 text-amber-500 dark:text-amber-400')}
          {filterPill('OVERDUE', 'Vencidos', counts.overdue, AlertTriangle, 'bg-rose-500/15 text-rose-500 dark:text-rose-400')}
          {filterPill('WITH_DEBT', 'Con deuda', counts.withDebt, Clock, 'bg-amber-500/15 text-amber-500 dark:text-amber-400')}
          {filterPill('ZERO', 'Al día', counts.zero, CheckCircle, 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400')}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scroll">
        {filtered.length === 0 ? (
          <div className="px-4 py-16 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05] flex items-center justify-center mb-3">
              {filter === 'OVERDUE' ? <AlertTriangle size={22} className="text-rose-400/60" />
                : filter === 'WITH_DEBT' ? <Clock size={22} className="text-amber-400/60" />
                : filter === 'ZERO' ? <CheckCircle size={22} className="text-emerald-400/60" />
                : filter === 'PENDING' ? <ShieldCheck size={22} className="text-amber-400/60" />
                : search ? <Search size={22} className="text-slate-300 dark:text-white/20" />
                : <Building2 size={22} className="text-slate-300 dark:text-white/20" />}
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40">
              {filter === 'OVERDUE' ? 'Sin proveedores vencidos'
                : filter === 'WITH_DEBT' ? 'Sin deudas pendientes'
                : filter === 'ZERO' ? 'Todos los proveedores con deuda'
                : filter === 'PENDING' ? 'Sin aprobaciones pendientes'
                : search ? 'Sin resultados'
                : 'Aún no hay proveedores'}
            </p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-1.5 max-w-[200px]">
              {search ? `Nada coincide con "${search}". Prueba con otro término.`
                : filter !== 'ALL' ? 'Todo bajo control aquí. Cambia el filtro o vuelve a todos.'
                : 'Crea el primero con el botón + arriba.'}
            </p>
          </div>
        ) : filtered.map(s => {
          const name = s.supplier.id || 'Proveedor';
          const rif = s.supplier.rif || '';
          const isSelected = selectedId === s.supplier.id;
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
                : 'bg-amber-500/15 text-amber-400 ring-amber-500/30';

          return (
            <div
              key={s.supplier.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(s.supplier)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.supplier); } }}
              className={`group w-full px-3 py-3 text-left border-b border-slate-50 dark:border-white/[0.03] transition-all relative cursor-pointer outline-none focus-visible:bg-amber-500/[0.05] ${
                isSelected
                  ? 'bg-amber-500/[0.08] border-l-[3px] border-l-amber-500'
                  : 'hover:bg-slate-50 dark:hover:bg-white/[0.02] border-l-[3px] border-l-transparent'
              } ${s.myPendingCount > 0 ? 'border-l-amber-500' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ring-1 ${avatarColor}`}>
                  {getInitials(name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-slate-800 dark:text-white truncate leading-tight">{name}</p>
                      {rif && (
                        <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 truncate mt-0.5">{rif}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black tabular-nums leading-tight ${balanceColor}`}>
                        {fmtUSD(Math.abs(s.totalBalance))}
                      </p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25 mt-0.5">
                        {hasPositive ? 'LE DEBES' : hasNegative ? 'A FAVOR' : 'AL DÍA'}
                      </p>
                    </div>
                  </div>

                  {/* Pills por cuenta */}
                  {s.accountBalances.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.accountBalances.slice(0, 4).map(b => {
                        const pillColor = ACCOUNT_PILL_COLORS[b.color] || ACCOUNT_PILL_COLORS.amber;
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
                    {s.supplier.categoria && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {s.supplier.categoria}
                      </span>
                    )}
                    {s.daysSinceLastMov !== null && (
                      <span className="ml-auto text-[9px] font-bold text-slate-400 dark:text-white/25 tabular-nums">
                        {s.daysSinceLastMov === 0 ? 'hoy' : `hace ${s.daysSinceLastMov}d`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Acciones rápidas en hover */}
              {onQuickAction && (
                <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onQuickAction(s.supplier, 'ABONO'); }}
                    title="Registrar pago al proveedor"
                    className="h-6 px-2 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500/25 transition-all flex items-center gap-1"
                  >
                    <Plus size={9} /> Pago
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onQuickAction(s.supplier, 'FACTURA'); }}
                    title="Registrar factura de proveedor"
                    className="h-6 px-2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-wider hover:bg-amber-500/25 transition-all flex items-center gap-1"
                  >
                    <Plus size={9} /> Factura
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
