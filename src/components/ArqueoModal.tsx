import React, { useState, useMemo } from 'react';
import {
  X, Printer, CheckCircle2, Loader2, DollarSign,
  TrendingUp, AlertTriangle, FileText, Hash, Banknote,
} from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Terminal {
  id: string;
  nombre: string;
  tipo: 'detal' | 'mayor';
  cajeroNombre?: string;
  apertura?: string;
  totalFacturado?: number;
  movimientos?: number;
}

interface ArqueoModalProps {
  terminal: Terminal;
  movements: any[];
  businessId: string;
  currentUser: string;
  onClose: () => void;
  onDone: () => void;
}

// ─── Venezuela denominations ──────────────────────────────────────────────────
const USD_BILLS = [100, 50, 20, 10, 5, 1];
const BS_BILLS  = [500, 200, 100, 50, 20, 10];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isCashUsd = (k: string) => {
  const low = k.toLowerCase();
  return (low.includes('efectivo') && !low.includes('bs')) || low.includes('cash') || low === 'contado';
};
const isCashBs = (k: string) => k.toLowerCase().includes('efectivo bs');
const isDigital = (k: string) => {
  const low = k.toLowerCase();
  return ['transferencia', 'pago móvil', 'pago movil', 'punto', 'zelle'].some(d => low.includes(d));
};

// ─── Print Z Report ───────────────────────────────────────────────────────────
function printZReport(data: {
  terminalName: string;
  cajero: string;
  apertura: string;
  cierre: string;
  summary: { total: number; count: number; byMethod: Record<string, number> };
  totalCountedUsd: number;
  totalCountedBs: number;
  expectedCashUsd: number;
  expectedCashBs: number;
  varianceUsd: number;
  varianceBs: number;
  usdCounts: Record<number, number>;
  bsCounts: Record<number, number>;
  note: string;
}) {
  const methodRows = Object.entries(data.summary.byMethod)
    .map(([m, v]) => `<tr><td>${m}</td><td align="right">$${v.toFixed(2)}</td></tr>`)
    .join('');
  const usdRows = USD_BILLS
    .filter(b => (data.usdCounts[b] || 0) > 0)
    .map(b => `<tr><td>$${b}</td><td align="center">× ${data.usdCounts[b]}</td><td align="right">$${(b * data.usdCounts[b]).toFixed(2)}</td></tr>`)
    .join('');
  const bsRows = BS_BILLS
    .filter(b => (data.bsCounts[b] || 0) > 0)
    .map(b => `<tr><td>Bs.${b}</td><td align="center">× ${data.bsCounts[b]}</td><td align="right">Bs.${(b * data.bsCounts[b]).toFixed(2)}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Arqueo Interno</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:10px;width:80mm;padding:10px}
    h1{font-size:13px;font-weight:bold;text-align:center}
    h2{font-size:10px;text-align:center;margin:2px 0 6px}
    .sep{border-top:1px dashed #000;margin:5px 0}
    .c{text-align:center}
    .row{display:flex;justify-content:space-between;margin:1px 0}
    table{width:100%;border-collapse:collapse;font-size:9px;margin:3px 0}
    td{padding:1px 2px}
    .big{font-size:12px;font-weight:bold}
    .ok{font-weight:bold}
    .warn{font-weight:bold}
    .legal{font-size:6px;text-align:center;margin-top:6px;padding:4px;border:1px dashed #000;line-height:1.3}
    @media print{button{display:none}}
  </style></head><body>
  <div class="c" style="font-size:8px;font-weight:bold;margin-bottom:4px">ARQUEO INTERNO DE CAJA &middot; NO FISCAL</div>
  <h1>ARQUEO DE CAJA</h1>
  <h2>${data.terminalName}</h2>
  <div class="sep"></div>
  <div class="row"><span>Apertura:</span><span>${data.apertura}</span></div>
  <div class="row"><span>Cierre:</span><span>${data.cierre}</span></div>
  <div class="row"><span>Cajero:</span><span>${data.cajero}</span></div>
  <div class="sep"></div>
  <div class="row big"><span>TOTAL VENTAS</span><span>$${data.summary.total.toFixed(2)}</span></div>
  <div class="row"><span>N° operaciones:</span><span>${data.summary.count}</span></div>
  <div class="sep"></div>
  <b>POR MÉTODO DE PAGO</b>
  <table>${methodRows}</table>
  <div class="sep"></div>
  <b>CONTEO USD</b>
  <table>${usdRows || '<tr><td colspan="3" align="center">Sin conteo</td></tr>'}</table>
  <div class="row"><span>Total USD contado:</span><span>$${data.totalCountedUsd.toFixed(2)}</span></div>
  <div class="sep"></div>
  <b>CUADRE USD</b>
  <div class="row"><span>Efectivo USD esperado:</span><span>$${data.expectedCashUsd.toFixed(2)}</span></div>
  <div class="row"><span>Efectivo USD contado:</span><span>$${data.totalCountedUsd.toFixed(2)}</span></div>
  <div class="row ${Math.abs(data.varianceUsd) < 0.5 ? 'ok' : 'warn'}">
    <span>Diferencia USD:</span>
    <span>${data.varianceUsd >= 0 ? '+' : ''}$${data.varianceUsd.toFixed(2)}</span>
  </div>
  ${bsRows ? `
  <div class="sep"></div>
  <b>CONTEO BS</b>
  <table>${bsRows}</table>
  <div class="row"><span>Total Bs contado:</span><span>Bs.${data.totalCountedBs.toFixed(2)}</span></div>
  <div class="sep"></div>
  <b>CUADRE BS</b>
  <div class="row"><span>Efectivo Bs esperado:</span><span>Bs.${data.expectedCashBs.toFixed(2)}</span></div>
  <div class="row"><span>Efectivo Bs contado:</span><span>Bs.${data.totalCountedBs.toFixed(2)}</span></div>
  <div class="row ${Math.abs(data.varianceBs) < 0.5 ? 'ok' : 'warn'}">
    <span>Diferencia Bs:</span>
    <span>${data.varianceBs >= 0 ? '+' : ''}Bs.${data.varianceBs.toFixed(2)}</span>
  </div>` : ''}
  ${data.note ? `<div class="sep"></div><div>Nota: ${data.note}</div>` : ''}
  <div class="sep"></div>
  <div class="c">Firma del cajero: ___________________</div>
  <div class="c" style="margin-top:8px">Firma supervisor: ___________________</div>
  <div class="legal">
    DOCUMENTO INTERNO &middot; NO ES REPORTE Z FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
    No sustituye el cierre Z de máquina fiscal regulado por la Providencia SENIAT SNAT/2011/00071.<br/>
    Sistema administrativo no homologado.
  </div>
  <div style="margin-top:8px;text-align:center">
    <button onclick="window.print()">🖨 Imprimir</button>
  </div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=620,toolbar=0,menubar=0');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ArqueoModal({ terminal, movements, businessId, currentUser, onClose, onDone }: ArqueoModalProps) {
  const [usdCounts, setUsdCounts] = useState<Record<number, number>>({});
  const [bsCounts,  setBsCounts]  = useState<Record<number, number>>({});
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  // ── Sales summary from movements ─────────────────────────────────────────
  const summary = useMemo(() => {
    const valid = movements.filter(m => !m.anulada && m.movementType === 'FACTURA');
    const total = valid.reduce((a, m) => a + (m.amountInUSD ?? m.amount ?? 0), 0);

    // Use the structured `pagos` object when available, fallback to `metodoPago` string
    const byMethod: Record<string, number> = {};
    for (const m of valid) {
      if (m.pagos && typeof m.pagos === 'object' && Object.keys(m.pagos).length > 0) {
        for (const [method, amount] of Object.entries(m.pagos)) {
          byMethod[method] = (byMethod[method] ?? 0) + (amount as number);
        }
      } else {
        const met = m.metodoPago || 'Sin método';
        byMethod[met] = (byMethod[met] ?? 0) + (m.amountInUSD ?? m.amount ?? 0);
      }
    }

    // Expected USD cash — only methods that are "Efectivo USD" / "Efectivo" / "Cash" (NOT "Efectivo Bs")
    const expectedCashUsd = Object.entries(byMethod)
      .filter(([k]) => isCashUsd(k))
      .reduce((a, [, v]) => a + v, 0);

    // Expected Bs cash — calculate from movements that paid with "Efectivo Bs"
    // We need to convert USD amounts back to Bs using the rate that was used at sale time
    let expectedCashBs = 0;
    for (const m of valid) {
      if (m.pagos && typeof m.pagos === 'object') {
        const bsKey = Object.keys(m.pagos).find(k => isCashBs(k));
        if (bsKey) {
          // pagos[bsKey] is the USD equivalent — multiply by rateUsed to get actual Bs
          const usdAmount = m.pagos[bsKey] as number;
          const rate = m.rateUsed || 1;
          expectedCashBs += usdAmount * rate;
        }
      } else if (m.metodoPago && isCashBs(m.metodoPago)) {
        const usd = m.amountInUSD ?? m.amount ?? 0;
        const rate = m.rateUsed || 1;
        expectedCashBs += usd * rate;
      }
    }

    // Digital/electronic totals (informational)
    const digitalTotalUsd = Object.entries(byMethod)
      .filter(([k]) => isDigital(k))
      .reduce((a, [, v]) => a + v, 0);

    return { total, count: valid.length, byMethod, expectedCashUsd, expectedCashBs, digitalTotalUsd };
  }, [movements]);

  // ── Denomination totals ───────────────────────────────────────────────────
  const totalCountedUsd = USD_BILLS.reduce((acc, b) => acc + b * (usdCounts[b] || 0), 0);
  const totalCountedBs  = BS_BILLS.reduce( (acc, b) => acc + b * (bsCounts[b]  || 0), 0);
  const varianceUsd     = totalCountedUsd - summary.expectedCashUsd;
  const varianceBs      = totalCountedBs  - summary.expectedCashBs;

  const setCount = (
    setter: React.Dispatch<React.SetStateAction<Record<number, number>>>,
    bill: number,
    delta: number,
  ) => setter(prev => ({ ...prev, [bill]: Math.max(0, (prev[bill] || 0) + delta) }));

  // ── Confirm & save ────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setSaving(true);
    try {
      const cierre = new Date().toISOString();
      const arqueoId = `${terminal.id}_${cierre.replace(/[:.]/g, '-')}`;

      await setDoc(doc(db, 'businesses', businessId, 'arqueos', arqueoId), {
        terminalId:       terminal.id,
        terminalName:     terminal.nombre,
        terminalType:     terminal.tipo,
        cajero:           terminal.cajeroNombre || currentUser,
        closedBy:         currentUser,
        apertura:         terminal.apertura || '',
        cierreAt:         cierre,
        salesTotal:       summary.total,
        salesCount:       summary.count,
        paymentBreakdown: summary.byMethod,
        denominationsUsd: usdCounts,
        denominationsBs:  bsCounts,
        totalCountedUsd,
        totalCountedBs,
        expectedCashUsd:  summary.expectedCashUsd,
        expectedCashBs:   summary.expectedCashBs,
        varianceUsd,
        varianceBs,
        note:             note.trim(),
        createdAt:        serverTimestamp(),
      });

      await updateDoc(doc(db, 'businesses', businessId, 'terminals', terminal.id), {
        estado:        'cerrada',
        cajeroNombre:  'Sin asignar',
        apertura:      null,
        cierreAt:      cierre,
        totalFacturado: 0,
        movimientos:    0,
        sessionToken:   null,
      });

      printZReport({
        terminalName:     terminal.nombre,
        cajero:           terminal.cajeroNombre || currentUser,
        apertura:         terminal.apertura ? new Date(terminal.apertura).toLocaleString('es-VE') : '—',
        cierre:           new Date(cierre).toLocaleString('es-VE'),
        summary,
        totalCountedUsd,
        totalCountedBs,
        expectedCashUsd:  summary.expectedCashUsd,
        expectedCashBs:   summary.expectedCashBs,
        varianceUsd,
        varianceBs,
        usdCounts,
        bsCounts,
        note:             note.trim(),
      });

      onDone();
    } catch (e) {
      console.error('[ArqueoModal] Error:', e);
    } finally {
      setSaving(false);
    }
  };

  const varColorUsd = Math.abs(varianceUsd) < 0.5
    ? 'text-emerald-400' : varianceUsd > 0 ? 'text-sky-400' : 'text-rose-400';
  const varColorBs = Math.abs(varianceBs) < 0.5
    ? 'text-emerald-400' : varianceBs > 0 ? 'text-sky-400' : 'text-rose-400';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[94vh] overflow-y-auto bg-[#0d1424] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/50 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0d1424]/95 backdrop-blur-sm border-b border-white/[0.07] px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <FileText size={18} className="text-indigo-400" />
            </div>
            <div>
              <p className="font-black text-white text-lg">Arqueo de Caja</p>
              <p className="text-xs text-white/30 mt-0.5">{terminal.nombre} · {terminal.cajeroNombre}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:bg-white/[0.08] transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── KPIs + Payment Methods ─────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-center">
              <TrendingUp size={16} className="text-emerald-400 mx-auto mb-1.5" />
              <p className="text-xl font-black text-emerald-400">${summary.total.toFixed(2)}</p>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mt-1">Total ventas</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.07] p-4 text-center">
              <Hash size={16} className="text-sky-400 mx-auto mb-1.5" />
              <p className="text-xl font-black text-sky-400">{summary.count}</p>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mt-1">Operaciones</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-center">
              <DollarSign size={16} className="text-amber-400 mx-auto mb-1.5" />
              <p className="text-xl font-black text-amber-400">${summary.expectedCashUsd.toFixed(2)}</p>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mt-1">Esperado USD</p>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.07] p-4 text-center">
              <Banknote size={16} className="text-violet-400 mx-auto mb-1.5" />
              <p className="text-xl font-black text-violet-400">Bs.{summary.expectedCashBs.toFixed(2)}</p>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mt-1">Esperado Bs</p>
            </div>
          </div>

          {/* By method — compact horizontal */}
          {Object.keys(summary.byMethod).length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Desglose por método de pago</p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                {Object.entries(summary.byMethod).map(([m, v]) => {
                  const color = isCashUsd(m) ? 'text-emerald-400' : isCashBs(m) ? 'text-violet-400' : isDigital(m) ? 'text-sky-400' : 'text-white/60';
                  return (
                    <div key={m} className="flex justify-between items-center py-1">
                      <span className="text-xs text-white/40 font-medium truncate mr-2">{m}</span>
                      <span className={`text-xs font-black ${color} tabular-nums`}>${(v as number).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Denomination Counts — Side by Side ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* USD Bills */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/40 mb-2.5 flex items-center gap-2">
                <DollarSign size={12} /> Conteo USD
              </p>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                {USD_BILLS.map(bill => (
                  <div key={bill} className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] last:border-0">
                    <span className="w-12 text-sm font-black text-emerald-400">${bill}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button onClick={() => setCount(setUsdCounts, bill, -1)}
                        className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.12] flex items-center justify-center font-black transition-all">−</button>
                      <span className="w-8 text-center text-sm font-black text-white tabular-nums">{usdCounts[bill] || 0}</span>
                      <button onClick={() => setCount(setUsdCounts, bill, 1)}
                        className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center font-black transition-all">+</button>
                    </div>
                    <span className="w-16 text-right text-xs text-white/30 font-mono tabular-nums">
                      {((usdCounts[bill] || 0) * bill) > 0 ? `$${((usdCounts[bill] || 0) * bill).toFixed(0)}` : ''}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-emerald-500/[0.06] border-t border-emerald-500/10">
                  <span className="text-xs font-black text-emerald-400/60 uppercase tracking-widest">Total USD</span>
                  <span className="text-lg font-black text-emerald-400">${totalCountedUsd.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Bs Bills */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400/40 mb-2.5 flex items-center gap-2">
                <Banknote size={12} /> Conteo Bolívares
              </p>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                {BS_BILLS.map(bill => (
                  <div key={bill} className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] last:border-0">
                    <span className="w-14 text-sm font-black text-violet-400">Bs.{bill}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button onClick={() => setCount(setBsCounts, bill, -1)}
                        className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.12] flex items-center justify-center font-black transition-all">−</button>
                      <span className="w-8 text-center text-sm font-black text-white tabular-nums">{bsCounts[bill] || 0}</span>
                      <button onClick={() => setCount(setBsCounts, bill, 1)}
                        className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 flex items-center justify-center font-black transition-all">+</button>
                    </div>
                    <span className="w-20 text-right text-xs text-white/30 font-mono tabular-nums">
                      {((bsCounts[bill] || 0) * bill) > 0 ? `Bs.${((bsCounts[bill] || 0) * bill).toFixed(0)}` : ''}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-violet-500/[0.06] border-t border-violet-500/10">
                  <span className="text-xs font-black text-violet-400/60 uppercase tracking-widest">Total Bs</span>
                  <span className="text-lg font-black text-violet-400">Bs.{totalCountedBs.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Cuadre Dual Currency — Side by Side ────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cuadre USD */}
            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/50 mb-1">Cuadre USD</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/40">Esperado</span>
                <span className="text-base font-black text-white">${summary.expectedCashUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/40">Contado</span>
                <span className="text-base font-black text-white">${totalCountedUsd.toFixed(2)}</span>
              </div>
              <div className="border-t border-white/[0.06] pt-3 flex justify-between items-center">
                <span className="text-sm font-bold text-white/60">Diferencia</span>
                <span className={`text-xl font-black ${varColorUsd}`}>
                  {varianceUsd >= 0 ? '+' : ''}${varianceUsd.toFixed(2)}
                </span>
              </div>
              {Math.abs(varianceUsd) >= 1 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20">
                  <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                  <p className="text-[11px] text-rose-400">Diferencia significativa</p>
                </div>
              )}
            </div>

            {/* Cuadre Bs */}
            <div className="rounded-2xl border border-violet-500/10 bg-violet-500/[0.03] p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400/50 mb-1">Cuadre Bs</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/40">Esperado</span>
                <span className="text-base font-black text-white">Bs.{summary.expectedCashBs.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/40">Contado</span>
                <span className="text-base font-black text-white">Bs.{totalCountedBs.toFixed(2)}</span>
              </div>
              <div className="border-t border-white/[0.06] pt-3 flex justify-between items-center">
                <span className="text-sm font-bold text-white/60">Diferencia</span>
                <span className={`text-xl font-black ${varColorBs}`}>
                  {varianceBs >= 0 ? '+' : ''}Bs.{varianceBs.toFixed(2)}
                </span>
              </div>
              {Math.abs(varianceBs) >= 1 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20">
                  <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                  <p className="text-[11px] text-rose-400">Diferencia significativa</p>
                </div>
              )}
            </div>
          </div>

          {/* Digital info */}
          {summary.digitalTotalUsd > 0 && (
            <div className="rounded-xl border border-sky-500/10 bg-sky-500/[0.04] p-3 flex justify-between items-center">
              <span className="text-xs text-sky-400/60">Total digital (informativo)</span>
              <span className="text-sm font-black text-sky-400">${summary.digitalTotalUsd.toFixed(2)}</span>
            </div>
          )}

          {/* ── Note + Actions ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/25 mb-2">Nota del cierre (opcional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ej: Diferencia por billete de $5 falso"
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/[0.08] text-sm font-bold text-white/30 hover:bg-white/[0.05] transition-all">
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                Cerrar turno y generar Z
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
