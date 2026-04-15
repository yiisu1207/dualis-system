import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { FallbackPolicy, RateHistoryEntry } from '../../utils/rateLookup';
import { formatRateSourceDate } from '../../utils/rateLookup';
import {
  detectVoucherRateIssues,
  exportIssuesToCSV,
  issueTypeLabel,
  type AuditEmployee,
  type AuditVoucher,
  type VoucherIssueRow,
} from '../../utils/voucherAudit';

interface Props {
  open: boolean;
  onClose: () => void;
  vouchers: AuditVoucher[];
  employees: AuditEmployee[];
  bcvHistory: RateHistoryEntry[];
  voucherRateHistory: RateHistoryEntry[];
  policy: FallbackPolicy;
  businessId: string;
  currentUser: { uid: string; displayName: string };
  /** Abre la fila de corrección asistida en el parent (reutiliza handleCorrectVoucher) */
  onRequestCorrection: (voucher: AuditVoucher, amount: number, date: string) => void;
}

const fmt2 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const VoucherRateAuditPanel: React.FC<Props> = ({
  open, onClose, vouchers, employees, bcvHistory, voucherRateHistory, policy,
  businessId, currentUser, onRequestCorrection,
}) => {
  const [filterEmp, setFilterEmp] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [onlyMissingDate, setOnlyMissingDate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNote, setBulkNote] = useState('Corrección por bug de tasa histórica');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, errors: 0 });

  const allRows = useMemo(() => {
    if (!open) return [];
    return detectVoucherRateIssues(vouchers, bcvHistory, voucherRateHistory, policy, employees);
  }, [open, vouchers, bcvHistory, voucherRateHistory, policy, employees]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (filterEmp && r.voucher.employeeId !== filterEmp) return false;
      if (filterFrom && r.effectiveDate < filterFrom) return false;
      if (filterTo && r.effectiveDate > filterTo) return false;
      if (onlyDivergent && r.issueType !== 'rate-divergent') return false;
      if (onlyMissingDate && r.issueType !== 'no-voucher-date') return false;
      return true;
    });
  }, [allRows, filterEmp, filterFrom, filterTo, onlyDivergent, onlyMissingDate]);

  const kpis = useMemo(() => {
    const k = { total: allRows.length, divergent: 0, noDate: 0, noRate: 0, settled: 0, totalDiff: 0 };
    for (const r of allRows) {
      if (r.issueType === 'rate-divergent') k.divergent++;
      else if (r.issueType === 'no-voucher-date') k.noDate++;
      else if (r.issueType === 'no-rate-used') k.noRate++;
      if (r.alreadySettled) k.settled++;
      k.totalDiff += Math.abs(r.diff);
    }
    return k;
  }, [allRows]);

  if (!open) return null;

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.voucherId)));
  };

  const handleExportCSV = () => {
    const csv = exportIssuesToCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_vales_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkCorrect = async () => {
    const toFix = rows.filter((r) => selected.has(r.voucherId));
    if (!toFix.length) return;
    const settledCount = toFix.filter((r) => r.alreadySettled).length;
    const confirmMsg = settledCount > 0
      ? `Vas a corregir ${toFix.length} vales (${settledCount} ya descontados — la corrección solo afectará reportes). ¿Continuar?`
      : `Vas a corregir ${toFix.length} vales. ¿Continuar?`;
    if (!window.confirm(confirmMsg)) return;
    if (!bulkNote.trim()) {
      window.alert('La nota de corrección es obligatoria.');
      return;
    }

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: toFix.length, errors: 0 });
    let done = 0, errors = 0;

    for (const r of toFix) {
      try {
        const v = r.voucher;
        const newAmount = v.amount;
        const newCurrency = v.currency;
        const newDate = r.effectiveDate;
        const newRate = r.suggestedRate;
        const newAmountUSD = newCurrency === 'USD' ? newAmount : (newRate > 0 ? newAmount / newRate : 0);

        await updateDoc(doc(db, 'businesses', businessId, 'vouchers', v.id), {
          status: 'CORREGIDO',
          correctedAt: serverTimestamp(),
        });

        await addDoc(collection(db, 'businesses', businessId, 'vouchers'), {
          employeeId: v.employeeId,
          employeeName: v.employeeName,
          amount: newAmount,
          currency: newCurrency,
          amountUSD: newAmountUSD,
          rateUsed: newRate,
          reason: v.reason,
          status: 'PENDIENTE',
          voucherDate: newDate,
          createdAt: serverTimestamp(),
          correctedFrom: v.id,
          originalAmount: v.amount,
          correctionNote: bulkNote.trim(),
          registeredBy: currentUser.uid,
          registeredByName: currentUser.displayName,
        });

        await addDoc(collection(db, 'businesses', businessId, 'auditLogs'), {
          action: 'voucher_rate_correction',
          voucherId: v.id,
          before: {
            rate: r.currentRate ?? null,
            amountUSD: r.currentAmountUSD,
          },
          after: {
            rate: newRate,
            amountUSD: newAmountUSD,
            sourceDate: r.suggestedSourceDate ?? null,
          },
          note: bulkNote.trim(),
          userId: currentUser.uid,
          userName: currentUser.displayName,
          source: 'bulk',
          createdAt: serverTimestamp(),
        });

        done++;
      } catch (err) {
        console.error('[VoucherRateAuditPanel] Error corrigiendo vale', r.voucherId, err);
        errors++;
      }
      setBulkProgress({ done: done + errors, total: toFix.length, errors });
      await new Promise((res) => setTimeout(res, 50));
    }

    setBulkRunning(false);
    setSelected(new Set());
    window.alert(`Corrección completada: ${done} OK, ${errors} errores.`);
  };

  const handleSingleCorrect = (r: VoucherIssueRow) => {
    if (r.alreadySettled) {
      if (!window.confirm('Este vale ya fue DESCONTADO en un corte. La corrección solo afectará reportes, no el pago histórico. ¿Continuar?')) return;
    }
    onRequestCorrection(r.voucher, r.voucher.amount, r.effectiveDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Auditoría de tasas en vales</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Política activa: <span className="text-amber-300">{policy === 'prior' ? 'día anterior' : policy === 'posterior' ? 'día posterior' : 'preguntar'}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none px-2">×</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 border-b border-white/5">
          <Kpi label="Con problema" value={kpis.total} color="amber" />
          <Kpi label="Tasa divergente" value={kpis.divergent} color="rose" />
          <Kpi label="Sin fecha" value={kpis.noDate} color="sky" />
          <Kpi label="Sin tasa" value={kpis.noRate} color="violet" />
          <Kpi label="Ya descontados" value={kpis.settled} color="slate" />
        </div>

        <div className="p-4 border-b border-white/5 flex flex-wrap gap-2 items-end">
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400">Empleado</label>
            <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-white min-w-[160px]">
              <option value="">Todos</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400">Desde</label>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-white" />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400">Hasta</label>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-white" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={onlyDivergent} onChange={(e) => setOnlyDivergent(e.target.checked)} />
            Solo divergentes
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={onlyMissingDate} onChange={(e) => setOnlyMissingDate(e.target.checked)} />
            Solo sin fecha
          </label>
          <div className="flex-1" />
          <button onClick={handleExportCSV} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded">
            Exportar CSV
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No hay vales con problemas de tasa con los filtros actuales.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-800/50 sticky top-0 z-10">
                <tr className="text-slate-300">
                  <th className="p-2 text-left w-8">
                    <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="p-2 text-left">Empleado</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Fecha efectiva</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-right">Tasa actual</th>
                  <th className="p-2 text-right">Tasa correcta</th>
                  <th className="p-2 text-right">USD actual</th>
                  <th className="p-2 text-right">USD corregido</th>
                  <th className="p-2 text-right">Δ USD</th>
                  <th className="p-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.voucherId} className="border-t border-white/5 hover:bg-slate-800/40">
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(r.voucherId)} onChange={() => toggle(r.voucherId)} />
                    </td>
                    <td className="p-2 text-white">
                      {r.voucher.employeeName}
                      {r.alreadySettled && <span className="ml-1 px-1 rounded bg-rose-500/20 text-rose-300 text-[9px]">DESC</span>}
                    </td>
                    <td className="p-2 text-slate-300">{issueTypeLabel(r.issueType)}</td>
                    <td className="p-2 text-slate-300">
                      {r.effectiveDate}
                      {r.dateWasInferred && <span className="ml-1 text-amber-400" title="Fecha inferida de createdAt">⚠</span>}
                      {r.suggestedIsFallback && r.suggestedSourceDate && (
                        <span className="ml-1 text-sky-400 text-[10px]" title={`Usando tasa del ${r.suggestedSourceDate}`}>
                          ({formatRateSourceDate(r.suggestedSourceDate)})
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right text-slate-300">{fmt2(r.voucher.amount)} {r.voucher.currency}</td>
                    <td className="p-2 text-right text-slate-400">{r.currentRate ? fmt4(r.currentRate) : '—'}</td>
                    <td className="p-2 text-right text-emerald-300">{fmt4(r.suggestedRate)}</td>
                    <td className="p-2 text-right text-slate-300">${fmt2(r.currentAmountUSD)}</td>
                    <td className="p-2 text-right text-emerald-300">${fmt2(r.correctedAmountUSD)}</td>
                    <td className={`p-2 text-right font-semibold ${r.diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.diff >= 0 ? '+' : ''}{fmt2(r.diff)} ({r.diffPct.toFixed(1)}%)
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => handleSingleCorrect(r)}
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] rounded"
                      >
                        Corregir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected.size > 0 && (
          <div className="p-3 border-t border-white/10 bg-slate-800/50 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-white">{selected.size} seleccionados</span>
            <input
              type="text"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="Nota de corrección (obligatoria)"
              className="flex-1 min-w-[200px] bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white"
              disabled={bulkRunning}
            />
            {bulkRunning ? (
              <div className="text-xs text-amber-300">
                Procesando {bulkProgress.done}/{bulkProgress.total}
                {bulkProgress.errors > 0 && <span className="text-rose-400 ml-1">({bulkProgress.errors} err)</span>}
              </div>
            ) : (
              <button
                onClick={handleBulkCorrect}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded"
              >
                Corregir seleccionados
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const colorMap: Record<string, string> = {
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
    violet: 'text-violet-300',
    slate: 'text-slate-300',
  };
  return (
    <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color] || 'text-white'}`}>{value}</div>
    </div>
  );
};
