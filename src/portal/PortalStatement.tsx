import React, { useMemo, useState, useCallback } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { MovementType } from '../../types';
import { Download, Loader2 } from 'lucide-react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

export default function PortalStatement() {
  const { businessId, customerId, customerName, businessName, currencySymbol } = usePortal();
  const { movements, loading, balances, rates } = usePortalData(businessId, customerId);
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [generating, setGenerating] = useState(false);
  const { refreshing } = usePullToRefresh(useCallback(async () => { await new Promise(r => setTimeout(r, 400)); }, []));

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

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      // Header
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(businessName || 'Estado de Cuenta', 14, 20);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Cliente: ${customerName}`, 14, 28);
      pdf.text(`Fecha: ${new Date().toLocaleDateString('es-VE')}`, 14, 34);
      if (accountFilter !== 'ALL') pdf.text(`Cuenta: ${accountFilter}`, 14, 40);

      // Balance summary
      const startY = accountFilter !== 'ALL' ? 48 : 42;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Saldo: ${currencySymbol}${(totalDebe - totalHaber).toFixed(2)}`, 14, startY);

      // Table
      autoTable(pdf, {
        startY: startY + 6,
        head: [['Fecha', 'Concepto', 'Cuenta', `Debe (${currencySymbol})`, `Haber (${currencySymbol})`, `Saldo (${currencySymbol})`]],
        body: statementData.map(row => [
          row.date,
          row.concept,
          row.accountType,
          row.debe > 0 ? row.debe.toFixed(2) : '',
          row.haber > 0 ? row.haber.toFixed(2) : '',
          row.saldo.toFixed(2),
        ]),
        foot: [['', 'TOTALES', '', totalDebe.toFixed(2), totalHaber.toFixed(2), (totalDebe - totalHaber).toFixed(2)]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240, 240, 250], textColor: [30, 30, 30], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 248, 255] },
        columnStyles: {
          0: { cellWidth: 22 },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      });

      // Footer
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(150);
        pdf.text(`Generado desde Portal de Clientes — ${new Date().toLocaleString('es-VE')}`, 14, 272);
        pdf.text(`Página ${i} de ${pageCount}`, 190, 272, { align: 'right' });
      }

      pdf.save(`Estado_Cuenta_${customerName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in">
      {refreshing && (
        <div className="flex justify-center py-2">
          <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Estado de Cuenta</h1>
          <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">{customerName}</p>
        </div>
        {statementData.length > 0 && (
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50 shrink-0"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">Descargar PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        )}
      </div>

      {/* Balance summary — dinámico por cuentas con movimientos */}
      {(() => {
        const accountKeys = Object.keys(balances.byAccount).filter(
          (k) => Math.abs(balances.byAccount[k]) > 0.001
        ).sort();
        if (accountKeys.length === 0) return null;
        const labelFor = (acct: string) => {
          const cr = rates.customRates.find((r) => r.id === acct);
          return cr?.name || acct;
        };
        const cards: { label: string; value: number; acct: string }[] = [
          ...accountKeys.map((k) => ({ label: labelFor(k), value: balances.byAccount[k], acct: k })),
          { label: 'Total', value: balances.total, acct: 'ALL' },
        ];
        // Grid: hasta 4 columnas en sm, ajusta según cantidad
        const gridCols = cards.length <= 2 ? 'grid-cols-2' : cards.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';
        return (
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
              Saldo por Cuenta
            </h3>
            <div className={`grid ${gridCols} gap-2 sm:gap-4`}>
              {cards.map((item) => {
                const isTotal = item.acct === 'ALL';
                const active = accountFilter === item.acct;
                return (
                  <button
                    key={item.acct}
                    onClick={() => setAccountFilter(item.acct)}
                    className={`rounded-xl p-3 sm:p-4 text-center border transition-all active:scale-[0.97] cursor-pointer ${
                      active
                        ? isTotal
                          ? 'border-indigo-500/40 bg-indigo-500/10'
                          : 'border-sky-500/40 bg-sky-500/10'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${isTotal ? 'bg-indigo-500' : 'bg-sky-500'}`} />
                      <span className="text-[8px] sm:text-[9px] font-black uppercase text-white/40 truncate max-w-[80px]">
                        {item.label}
                      </span>
                    </div>
                    <p className={`text-base sm:text-lg font-black font-mono ${
                      item.value > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {formatCurrency(Math.abs(item.value), currencySymbol)}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-[8px] text-white/20 text-center mt-2 font-bold">Toca una cuenta para filtrar el detalle</p>
          </div>
        );
      })()}

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
                        <p className="text-sm font-black text-rose-400 font-mono">{currencySymbol}{row.debe.toFixed(2)}</p>
                      </div>
                    )}
                    {row.haber > 0 && (
                      <div>
                        <p className="text-[8px] font-black uppercase text-white/20">Haber</p>
                        <p className="text-sm font-black text-emerald-400 font-mono">{currencySymbol}{row.haber.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase text-white/20">Saldo</p>
                    <p className={`text-sm font-black font-mono ${
                      row.saldo > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {currencySymbol}{row.saldo.toFixed(2)}
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
                    <p className="text-sm font-black text-rose-400 font-mono">{currencySymbol}{totalDebe.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase text-white/20">Haber</p>
                    <p className="text-sm font-black text-emerald-400 font-mono">{currencySymbol}{totalHaber.toFixed(2)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase text-white/20">Balance</p>
                  <p className={`text-base font-black font-mono ${
                    (totalDebe - totalHaber) > 0.01 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {currencySymbol}{(totalDebe - totalHaber).toFixed(2)}
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
