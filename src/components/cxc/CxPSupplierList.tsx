import React, { useMemo, useState } from 'react';
import { Search, Plus, Building2, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Supplier, Movement, ExchangeRates } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import { getInitials } from './cxcHelpers';

interface CxPSupplierListProps {
  suppliers: Supplier[];
  movements: Movement[];
  rates: ExchangeRates;
  selectedId?: string;
  onSelect: (supplier: Supplier) => void;
  onCreateNew: () => void;
}

type QuickFilter = 'ALL' | 'WITH_DEBT' | 'ZERO';

interface SupplierSummary {
  supplier: Supplier;
  totalBalance: number;
  movementCount: number;
}

function buildSummaries(
  suppliers: Supplier[],
  movements: Movement[],
  rates: ExchangeRates
): SupplierSummary[] {
  return suppliers.map(supplier => {
    const suppMovs = movements.filter(m => m.entityId === supplier.id && m.isSupplierMovement);

    const totalFacturas = suppMovs
      .filter(m => m.movementType === 'FACTURA' && !m.anulada)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalAbonos = suppMovs
      .filter(m => m.movementType === 'ABONO' && !m.anulada)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalBalance = totalFacturas - totalAbonos;

    return { supplier, totalBalance, movementCount: suppMovs.length };
  });
}

export function CxPSupplierList({
  suppliers,
  movements,
  rates,
  selectedId,
  onSelect,
  onCreateNew,
}: CxPSupplierListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QuickFilter>('ALL');

  const summaries = useMemo(
    () => buildSummaries(suppliers, movements, rates),
    [suppliers, movements, rates]
  );

  const filtered = useMemo(() => {
    let result = summaries;

    if (filter === 'WITH_DEBT') result = result.filter(s => s.totalBalance > 0.01);
    if (filter === 'ZERO') result = result.filter(s => Math.abs(s.totalBalance) < 0.01);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => {
        const name = s.supplier.id || '';
        const rif = s.supplier.rif || '';
        const contacto = s.supplier.contacto || '';
        return name.toLowerCase().includes(q) || rif.toLowerCase().includes(q) || contacto.toLowerCase().includes(q);
      });
    }

    return result.sort((a, b) => {
      if (a.totalBalance !== b.totalBalance) return b.totalBalance - a.totalBalance;
      return (a.supplier.id || '').localeCompare(b.supplier.id || '');
    });
  }, [summaries, search, filter]);

  const counts = useMemo(() => ({
    all: summaries.length,
    withDebt: summaries.filter(s => s.totalBalance > 0.01).length,
    zero: summaries.filter(s => Math.abs(s.totalBalance) < 0.01).length,
  }), [summaries]);

  const filterPill = (key: QuickFilter, label: string, count: number, Icon: any) => (
    <button
      onClick={() => setFilter(filter === key ? 'ALL' : key)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
        filter === key
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
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
            <Building2 size={14} className="text-amber-400" />
            <h2 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Proveedores</h2>
            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black text-slate-400 dark:text-white/30">
              {counts.all}
            </span>
          </div>
          <button
            onClick={onCreateNew}
            className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center hover:bg-amber-500/20 transition-all"
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
            placeholder="Buscar por nombre, RIF, contacto..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs font-bold text-slate-700 dark:text-white/70 placeholder:text-slate-300 dark:placeholder:text-white/15 outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
          />
        </div>

        {/* Quick filters */}
        <div className="flex gap-1 overflow-x-auto">
          {filterPill('WITH_DEBT', 'Con deuda', counts.withDebt, AlertTriangle)}
          {filterPill('ZERO', 'Al día', counts.zero, CheckCircle)}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-bold text-slate-300 dark:text-white/15">Sin resultados</p>
          </div>
        ) : filtered.map(s => {
          const name = s.supplier.id || 'Proveedor';
          const isSelected = selectedId === s.supplier.id;
          const hasDebt = s.totalBalance > 0.01;
          const isZero = Math.abs(s.totalBalance) < 0.01;

          return (
            <button
              key={s.supplier.id}
              onClick={() => onSelect(s.supplier)}
              className={`w-full px-4 py-3 text-left border-b border-slate-50 dark:border-white/[0.03] transition-all ${
                isSelected
                  ? 'bg-amber-500/[0.08] border-l-2 border-l-amber-500'
                  : 'hover:bg-slate-50 dark:hover:bg-white/[0.02] border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                  hasDebt ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-300 dark:text-white/20'
                }`}>
                  {getInitials(name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-800 dark:text-white truncate">{name}</p>
                    <p className={`text-xs font-black shrink-0 ${
                      hasDebt ? 'text-amber-500' : isZero ? 'text-slate-300 dark:text-white/20' : 'text-emerald-500'
                    }`}>
                      ${Math.abs(s.totalBalance).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {s.supplier.categoria && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black text-slate-400 dark:text-white/25 bg-slate-100 dark:bg-white/[0.04]">
                        {s.supplier.categoria}
                      </span>
                    )}
                    {s.supplier.rif && (
                      <span className="text-[9px] font-bold text-slate-400 dark:text-white/25">
                        {s.supplier.rif}
                      </span>
                    )}
                    {s.movementCount > 0 && (
                      <span className="text-[9px] font-bold text-slate-400 dark:text-white/25">
                        {s.movementCount} mov.
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
