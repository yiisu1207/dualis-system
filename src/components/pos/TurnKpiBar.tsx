import React from 'react';
import { ShoppingCart, DollarSign, Clock } from 'lucide-react';

interface TurnKpiBarProps {
  saleCount: number;
  totalUSD: number;
  startedAt?: Date | null;
}

/**
 * H.27 — Live KPI bar for the current POS Detal turn.
 * Shows: sale count, total USD, and time since turn start.
 */
export default function TurnKpiBar({ saleCount, totalUSD, startedAt }: TurnKpiBarProps) {
  const elapsed = startedAt
    ? `${Math.floor((Date.now() - startedAt.getTime()) / 60000)} min`
    : '--';

  return (
    <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest">
      <span className="flex items-center gap-1 text-slate-400 dark:text-white/30">
        <ShoppingCart size={10} /> {saleCount}
      </span>
      <span className="flex items-center gap-1 text-emerald-500">
        <DollarSign size={10} /> {totalUSD.toFixed(2)}
      </span>
      <span className="flex items-center gap-1 text-slate-400 dark:text-white/30">
        <Clock size={10} /> {elapsed}
      </span>
    </div>
  );
}
