import React, { useMemo, useState } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { AccountType, MovementType } from '../../types';

export default function PortalStatement() {
  const { businessId, customerId, customerName } = usePortal();
  const { movements, loading, balances } = usePortalData(businessId, customerId);
  const [accountFilter, setAccountFilter] = useState<'ALL' | AccountType>('ALL');

  const statementData = useMemo(() => {
    let movs = movements.filter((m) => !(m as any).anulada);
    if (accountFilter !== 'ALL') {
      movs = movs.filter((m) => m.accountType === accountFilter);
    }

    const sorted = [...movs].sort(
      (a, b) =>
        new Date(a.createdAt || a.date).getTime() -
        new Date(b.createdAt || b.date).getTime()
    );

    let running = 0;
    return sorted.map((m) => {
      const amt = m.amountInUSD || m.amount;
      const isDebit = m.movementType === MovementType.FACTURA;
      running += isDebit ? amt : -amt;
      return { ...m, debe: isDebit ? amt : 0, haber: isDebit ? 0 : amt, saldo: running };
    });
  }, [movements, accountFilter]);

  const totalDebe = statementData.reduce((s, m) => s + m.debe, 0);
  const totalHaber = statementData.reduce((s, m) => s + m.haber, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Estado de Cuenta</h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">{customerName}</p>
      </div>

      {/* Balance summary */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
          Saldo por Cuenta
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {([
            { label: 'BCV', value: balances.bcv, color: 'sky', acct: AccountType.BCV },
            { label: 'Grupo', value: balances.grupo, color: 'violet', acct: AccountType.GRUPO },
            { label: 'Divisa', value: balances.divisa, color: 'emerald', acct: AccountType.DIVISA },
            { label: 'Total', value: balances.total, color: 'indigo', acct: 'ALL' as any },
          ] as const).map((item) => (
            <button
              key={item.label}
              onClick={() => setAccountFilter(item.acct)}
              className={`rounded-xl p-3 sm:p-4 text-center border transition-all active:scale-[0.97] ${
                accountFilter === item.acct
                  ? `border-${item.color}-500/40 bg-${item.color}-500/10`
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full bg-${item.color}-500`} />
                <span className="text-[8px] sm:text-[9px] font-black uppercase text-white/40">{item.label}</span>
              </div>
              <p className={`text-base sm:text-lg font-black font-mono ${
                item.value > 0.01 ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {formatCurrency(Math.abs(item.value), '$')}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono min-w-[600px]">
            <thead className="border-b border-white/[0.07]">
              <tr className="text-[9px] font-black uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Concepto</th>
                <th className="px-4 py-3 text-center">Cuenta</th>
                <th className="px-4 py-3 text-right">Debe</th>
                <th className="px-4 py-3 text-right">Haber</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {statementData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-white/20 text-xs font-sans italic">
                    Sin movimientos para esta cuenta
                  </td>
                </tr>
              ) : (
                statementData.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 text-white/40">{row.date}</td>
                    <td className="px-4 py-2.5 text-white/60 font-sans text-xs truncate max-w-[200px]">
                      {row.concept}
                    </td>
                    <td className="px-4 py-2.5 text-center text-white/30 text-[9px]">
                      {row.accountType}
                    </td>
                    <td className="px-4 py-2.5 text-right text-rose-400 font-bold">
                      {row.debe > 0 ? row.debe.toFixed(2) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">
                      {row.haber > 0 ? row.haber.toFixed(2) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${
                      row.saldo > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {row.saldo.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {statementData.length > 0 && (
              <tfoot className="border-t border-white/[0.1]">
                <tr className="text-xs font-black">
                  <td colSpan={3} className="px-4 py-3 text-white/40 uppercase">Totales</td>
                  <td className="px-4 py-3 text-right text-rose-400">{totalDebe.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">{totalHaber.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right ${
                    (totalDebe - totalHaber) > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {(totalDebe - totalHaber).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {statementData.length === 0 ? (
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] py-14 text-center shadow-lg">
            <p className="text-xs font-bold text-white/20">Sin movimientos</p>
          </div>
        ) : (
          <>
            {statementData.map((row) => (
              <div
                key={row.id}
                className="bg-[#0d1424] rounded-xl border border-white/[0.07] p-3.5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold text-white/30">{row.date}</span>
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-white/[0.05] rounded text-white/30">
                    {row.accountType}
                  </span>
                </div>
                <p className="text-xs font-bold text-white/70 truncate mb-2">{row.concept}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    {row.debe > 0 && (
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/20">Debe</p>
                        <p className="text-sm font-black text-rose-400 font-mono">${row.debe.toFixed(2)}</p>
                      </div>
                    )}
                    {row.haber > 0 && (
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/20">Haber</p>
                        <p className="text-sm font-black text-emerald-400 font-mono">${row.haber.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase text-white/20">Saldo</p>
                    <p className={`text-sm font-black font-mono ${
                      row.saldo > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      ${row.saldo.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Mobile totals */}
            <div className="bg-[#0d1424] rounded-xl border border-indigo-500/20 p-3.5 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Totales</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <div>
                    <p className="text-[8px] font-black uppercase text-white/20">Debe</p>
                    <p className="text-sm font-black text-rose-400 font-mono">${totalDebe.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase text-white/20">Haber</p>
                    <p className="text-sm font-black text-emerald-400 font-mono">${totalHaber.toFixed(2)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase text-white/20">Balance</p>
                  <p className={`text-base font-black font-mono ${
                    (totalDebe - totalHaber) > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    ${(totalDebe - totalHaber).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
