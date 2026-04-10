import React from 'react';
import { Plus } from 'lucide-react';
import { daysSince } from './cxcHelpers';

interface AccountCardProps {
  accountType: string;
  label: string;
  color: string;
  balanceUSD: number;
  overdueUSD: number;
  lastMovementDate?: string;
  onClick?: () => void;
  onRegisterAbono?: () => void;
  compact?: boolean;
}

const COLOR_MAP: Record<string, { bg: string; border: string; dot: string; text: string; hoverBg: string }> = {
  indigo:  { bg: 'bg-indigo-500/[0.06]', border: 'border-indigo-500/20', dot: 'bg-indigo-500', text: 'text-indigo-400', hoverBg: 'hover:bg-indigo-500/[0.1]' },
  violet:  { bg: 'bg-violet-500/[0.06]', border: 'border-violet-500/20', dot: 'bg-violet-500', text: 'text-violet-400', hoverBg: 'hover:bg-violet-500/[0.1]' },
  emerald: { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', dot: 'bg-emerald-500', text: 'text-emerald-400', hoverBg: 'hover:bg-emerald-500/[0.1]' },
  amber:   { bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', dot: 'bg-amber-500', text: 'text-amber-400', hoverBg: 'hover:bg-amber-500/[0.1]' },
  rose:    { bg: 'bg-rose-500/[0.06]', border: 'border-rose-500/20', dot: 'bg-rose-500', text: 'text-rose-400', hoverBg: 'hover:bg-rose-500/[0.1]' },
  cyan:    { bg: 'bg-cyan-500/[0.06]', border: 'border-cyan-500/20', dot: 'bg-cyan-500', text: 'text-cyan-400', hoverBg: 'hover:bg-cyan-500/[0.1]' },
  fuchsia: { bg: 'bg-fuchsia-500/[0.06]', border: 'border-fuchsia-500/20', dot: 'bg-fuchsia-500', text: 'text-fuchsia-400', hoverBg: 'hover:bg-fuchsia-500/[0.1]' },
};

export const AccountCard: React.FC<AccountCardProps> = ({
  label,
  color,
  balanceUSD,
  overdueUSD,
  lastMovementDate,
  onClick,
  onRegisterAbono,
  compact,
}) => {
  const c = COLOR_MAP[color] ?? COLOR_MAP.indigo;
  const days = daysSince(lastMovementDate);
  const isZero = Math.abs(balanceUSD) < 0.01;
  const isCredit = balanceUSD < -0.01;
  const hasOverdue = overdueUSD > 0.01;

  const borderOverride = hasOverdue
    ? 'border-rose-500/40 ring-1 ring-rose-500/20'
    : isCredit
    ? 'border-emerald-500/40'
    : c.border;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${c.bg} ${borderOverride} border transition-all ${c.hoverBg} ${isZero ? 'opacity-50' : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-[10px] font-black text-slate-600 dark:text-white/70 uppercase">{label}</span>
        <span className={`text-xs font-black ${isCredit ? 'text-emerald-400' : balanceUSD > 0 ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-white/30'}`}>
          ${Math.abs(balanceUSD).toFixed(2)}
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${borderOverride} ${c.bg} p-4 transition-all ${onClick ? `cursor-pointer ${c.hoverBg}` : ''} ${isZero ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>{label}</span>
        </div>
        {onRegisterAbono && balanceUSD > 0.01 && (
          <button
            onClick={e => { e.stopPropagation(); onRegisterAbono(); }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${c.text} ${c.bg} border ${c.border} hover:scale-105 transition-all`}
          >
            <Plus size={10} /> Abono
          </button>
        )}
      </div>

      <p className={`text-xl font-black mb-1 ${isCredit ? 'text-emerald-400' : balanceUSD > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-white/20'}`}>
        {isCredit ? '-' : ''}${Math.abs(balanceUSD).toFixed(2)}
      </p>

      {hasOverdue && (
        <p className="text-[10px] font-bold text-rose-400 mb-1">
          Vencido: ${overdueUSD.toFixed(2)}
        </p>
      )}
      {isCredit && (
        <p className="text-[10px] font-bold text-emerald-400 mb-1">
          Saldo a favor
        </p>
      )}

      {days !== null && (
        <p className="text-[9px] font-medium text-slate-400 dark:text-white/25">
          {days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days} dias`}
        </p>
      )}
    </div>
  );
};
