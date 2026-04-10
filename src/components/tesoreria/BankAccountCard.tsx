import React, { useMemo } from 'react';
import { Landmark, Pencil, ArrowDownToLine, CheckSquare, EyeOff } from 'lucide-react';
import type { BusinessBankAccount, Movement, BankWithdrawal } from '../../../types';
import { getBancoByCode } from '../../data/bancosVE';

interface Props {
  account: BusinessBankAccount;
  movements: Movement[];     // ya filtrados al businessId
  withdrawals: BankWithdrawal[];
  readOnly?: boolean;
  onEdit?: () => void;
  onWithdraw?: () => void;
  onReconcile?: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  corriente: 'Corriente',
  ahorro: 'Ahorro',
  pago_movil: 'Pago Móvil',
  zelle: 'Zelle',
  binance: 'Binance',
  paypal: 'PayPal',
  efectivo: 'Caja Chica',
};

const BankAccountCard: React.FC<Props> = ({ account, movements, withdrawals, readOnly, onEdit, onWithdraw, onReconcile }) => {
  const banco = getBancoByCode(account.bankCode);

  const stats = useMemo(() => {
    // K9: incluir FACTURA con bankAccountId (ventas POS Efectivo USD)
    // además de los ABONO normales
    const accountMovs = movements.filter(m =>
      m.bankAccountId === account.id &&
      (m.movementType === 'ABONO' || m.movementType === 'FACTURA') &&
      !m.anulada
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthIngresos = accountMovs
      .filter(m => new Date(m.date) >= monthStart)
      .reduce((s, m) => s + (Number(m.amountInUSD || 0)), 0);

    const totalIngresos = accountMovs.reduce((s, m) => s + (Number(m.amountInUSD || 0)), 0);
    const totalRetiros = withdrawals.reduce((s, w) => s + Number(w.amount || 0), 0);
    const saldoVirtual = totalIngresos - totalRetiros;
    const txCount = accountMovs.length;

    // Mini sparkline: últimos 7 días
    const days: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const total = accountMovs
        .filter(m => {
          const t = new Date(m.date).getTime();
          return t >= d.getTime() && t < next.getTime();
        })
        .reduce((s, m) => s + Number(m.amountInUSD || 0), 0);
      days.push({ label: d.toLocaleDateString('es-VE', { weekday: 'short' }), total });
    }
    const max = Math.max(...days.map(d => d.total), 1);

    return { monthIngresos, totalIngresos, totalRetiros, saldoVirtual, txCount, days, max };
  }, [movements, withdrawals, account.id]);

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-3xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
      account.enabled
        ? 'border-slate-200 dark:border-white/[0.07]'
        : 'border-slate-200/60 dark:border-white/[0.04] opacity-60'
    }`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${banco?.color || '#4f6ef7'}20`, color: banco?.color || '#4f6ef7' }}
          >
            <Landmark size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 dark:text-white text-[14px] truncate">{banco?.shortName || account.bankName}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              {TYPE_LABEL[account.accountType] || account.accountType}
              {!account.enabled && ' · Archivada'}
            </p>
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all shrink-0"
            title="Editar cuenta"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {/* KPI principal */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ingresos del mes</p>
        <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
          ${stats.monthIngresos.toFixed(2)}
        </p>
        <p className="text-[11px] text-slate-400 font-bold mt-1">
          {stats.txCount} transacción{stats.txCount !== 1 ? 'es' : ''} histórico
        </p>
      </div>

      {/* Sparkline */}
      <div className="px-5 pb-3">
        <div className="flex items-end gap-1 h-12">
          {stats.days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-t bg-gradient-to-t from-indigo-500/80 to-violet-500/60 transition-all"
                style={{ height: `${Math.max((d.total / stats.max) * 100, 6)}%` }}
                title={`${d.label}: $${d.total.toFixed(2)}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Saldo virtual */}
      <div className="px-5 py-3 bg-slate-50/60 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo virtual</p>
          <p className={`text-base font-black ${stats.saldoVirtual >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            ${stats.saldoVirtual.toFixed(2)}
          </p>
        </div>
        {!readOnly && account.enabled && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onReconcile}
              title="Conciliar mes"
              className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500 flex items-center justify-center transition-all border border-slate-200 dark:border-white/[0.05]"
            >
              <CheckSquare size={13} />
            </button>
            <button
              onClick={onWithdraw}
              title="Registrar retiro"
              className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 flex items-center justify-center transition-all border border-slate-200 dark:border-white/[0.05]"
            >
              <ArrowDownToLine size={13} />
            </button>
          </div>
        )}
        {!account.enabled && (
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <EyeOff size={11} /> Archivada
          </span>
        )}
      </div>
    </div>
  );
};

export default BankAccountCard;
