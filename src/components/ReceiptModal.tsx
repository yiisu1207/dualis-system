import React, { useRef, useState } from 'react';
import { Movement, MovementType, AppConfig } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { MessageCircle, Printer, Download, X as XIcon, FileCheck2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface ReceiptModalProps {
  movement: Movement;
  config: AppConfig;
  customerPhone?: string;
  onClose: () => void;
}

/* ── 80mm thermal ticket ───────────────────────────────────────────────── */
function printTicket(movement: any, companyName: string, ticketFooter?: string) {
  const saleItems: any[] = movement.items || [];
  const itemsHtml = saleItems.map((item: any) => `
    <tr>
      <td style="padding:2px 4px 2px 0">${item.nombre}</td>
      <td style="padding:2px 4px;text-align:center">${item.qty}</td>
      <td style="padding:2px 4px;text-align:right">$${parseFloat(item.price || 0).toFixed(2)}</td>
      <td style="padding:2px 0;text-align:right">$${parseFloat(item.subtotal ?? item.qty * item.price ?? 0).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprobante Interno</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:10px;width:80mm;max-width:80mm;padding:8px}
    h1{font-size:14px;font-weight:bold;text-align:center;margin-bottom:2px}
    .c{text-align:center}.sep{border-top:1px dashed #000;margin:5px 0}
    .row{display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse;font-size:9px}
    th{text-align:left;border-bottom:1px solid #000;padding-bottom:2px;font-size:9px}
    td{vertical-align:top}
    .big{font-size:14px;font-weight:bold}
    .nf{font-size:8px;font-weight:bold;text-align:center;margin:4px 0;letter-spacing:1px}
    .ivaref{font-size:7px;font-style:italic;text-align:right;color:#555}
    .legal{font-size:6px;text-align:center;margin-top:6px;padding:4px;border:1px dashed #000;line-height:1.3}
    .noPrint{margin-top:8px;text-align:center}
    @media print{.noPrint{display:none}}
  </style></head><body>
  <h1>${companyName}</h1>
  <div class="nf">COMPROBANTE DE VENTA - NO FISCAL</div>
  <div class="c" style="font-size:9px">${movement.date || new Date().toLocaleDateString('es-VE')}</div>
  ${movement.nroControl ? `<div class="c" style="font-size:8px;margin-top:2px">N. Interno: ${movement.nroControl}</div>` : ''}
  ${movement.nroFacturaFiscalExterna ? `<div class="c" style="font-size:9px;font-weight:bold;margin-top:2px">Factura Fiscal: ${movement.nroFacturaFiscalExterna}</div>` : ''}
  <div class="sep"></div>
  <div class="row"><span>Cliente:</span><span>${movement.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (movement.entityId || '-')}</span></div>
  <div class="row"><span>Pago:</span><span>${movement.metodoPago || '-'}</span></div>
  ${movement.referencia ? `<div class="row"><span>Ref.:</span><span>${movement.referencia}</span></div>` : ''}
  <div class="sep"></div>
  ${saleItems.length > 0 ? `
  <table>
    <thead><tr><th>Producto</th><th>Cant</th><th>P/U</th><th>Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="sep"></div>` : ''}
  ${movement.subtotalUSD ? `<div class="row"><span>Base</span><span>$${parseFloat(movement.subtotalUSD).toFixed(2)}</span></div>` : ''}
  ${movement.ivaAmount ? `<div class="row"><span>IVA (ref.)</span><span>+$${parseFloat(movement.ivaAmount).toFixed(2)}</span></div><div class="ivaref">IVA referencial &middot; no genera cr&eacute;dito fiscal</div>` : ''}
  ${movement.discountAmount ? `<div class="row"><span>Descuento</span><span>-$${parseFloat(movement.discountAmount).toFixed(2)}</span></div>` : ''}
  ${movement.igtfAmount ? `<div class="row"><span>IGTF</span><span>+$${parseFloat(movement.igtfAmount).toFixed(2)}</span></div>` : ''}
  <div class="sep"></div>
  <div class="row big"><span>TOTAL USD</span><span>$${parseFloat(movement.amountInUSD ?? movement.amount ?? 0).toFixed(2)}</span></div>
  ${movement.rateUsed > 1 ? `<div class="c" style="font-size:8px;margin-top:2px">Tasa Interna: Bs. ${movement.rateUsed}</div>` : ''}
  <div class="sep"></div>
  <div class="nf">DOCUMENTO NO FISCAL</div>
  <div class="legal">
    DOCUMENTO INTERNO &middot; NO ES FACTURA FISCAL &middot; SIN VALOR TRIBUTARIO<br/>
    No sustituye factura, nota de d&eacute;bito/cr&eacute;dito ni guía de despacho<br/>
    conforme a la Providencia SENIAT SNAT/2011/00071. Sistema administrativo no homologado.
  </div>
  <div class="c" style="font-size:8px;margin-top:4px">${(ticketFooter || 'Gracias por su compra').replace(/</g, '&lt;')}</div>
  <div style="margin-top:10px;border-top:1px dashed #ccc;padding-top:7px;text-align:center;">
    <img src="/logo.png" alt="Dualis" style="height:16px;width:auto;display:block;margin:0 auto 3px;" onerror="this.style.display='none'" />
    <p style="font-size:7px;color:#aaa;margin:0;letter-spacing:1px;text-transform:uppercase;">Con tecnolog&#237;a Dualis &middot; dualis.online</p>
  </div>
  <div class="noPrint"><button onclick="window.print()">Imprimir</button></div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=360,height=520,toolbar=0,menubar=0,scrollbars=1');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

/* ── Receipt modal component ───────────────────────────────────────────── */
const ReceiptModal: React.FC<ReceiptModalProps> = ({ movement, config, customerPhone, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const initial = (config.companyName || 'D').charAt(0).toUpperCase();
  const [nroFiscalExterna, setNroFiscalExterna] = useState<string>((movement as any).nroFacturaFiscalExterna || '');
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [fiscalSaved, setFiscalSaved] = useState(false);

  const saveNroFiscalExterna = async () => {
    if (!movement.id) return;
    setSavingFiscal(true);
    try {
      await updateDoc(doc(db, 'movements', movement.id), {
        nroFacturaFiscalExterna: nroFiscalExterna.trim() || null,
      });
      (movement as any).nroFacturaFiscalExterna = nroFiscalExterna.trim() || null;
      setFiscalSaved(true);
      setTimeout(() => setFiscalSaved(false), 2000);
    } catch (err) {
      console.error('Error saving nroFacturaFiscalExterna', err);
    } finally {
      setSavingFiscal(false);
    }
  };

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    const canvas = await (window as any).html2canvas(receiptRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `Comprobante_${movement.entityId}_${movement.date}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  const totalUsd = getMovementUsdAmount(movement);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
      <div className="w-full max-w-sm animate-in zoom-in duration-300">

        {/* ── Capture area ── */}
        <div
          ref={receiptRef}
          className="bg-white dark:bg-[#0d1424] rounded-t-2xl relative overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-indigo-950/80 dark:to-[#0d1424] px-8 pt-8 pb-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 mb-3">
              <span className="text-2xl font-black text-white tracking-tight">{initial}</span>
            </div>
            <h2 className="text-lg font-black text-white uppercase tracking-wide leading-none">
              {config.companyName}
            </h2>
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em]">
                Comprobante de venta — No fiscal
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="px-8 py-6 space-y-3">
            {(movement as any).nroControl && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">N. Interno</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">{(movement as any).nroControl}</span>
              </div>
            )}
            {(movement as any).nroFacturaFiscalExterna && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Factura Fiscal</span>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">{(movement as any).nroFacturaFiscalExterna}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{movement.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {movement.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (movement.entityId || '—')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipo</span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg ${
                  movement.movementType === MovementType.FACTURA
                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {movement.movementType === MovementType.FACTURA ? 'VENTA' : 'ABONO'}
              </span>
            </div>
            {movement.concept && (
              <div className="pt-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Concepto</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{movement.concept}</p>
              </div>
            )}

            {/* Items */}
            {(movement as any).items?.length > 0 && (
              <div className="pt-2">
                <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 space-y-1.5">
                  {(movement as any).items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400 truncate flex-1 mr-3">
                        {item.qty}x {item.nombre}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap">
                        ${parseFloat(item.subtotal ?? item.qty * item.price ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="mx-8 mb-6 bg-slate-50 dark:bg-white/[0.03] rounded-xl p-5 border border-slate-100 dark:border-white/[0.06]">
            {((movement as any).ivaAmount > 0 || (movement as any).igtfAmount > 0 || (movement as any).discountAmount > 0) && (
              <div className="space-y-1.5 mb-3 pb-3 border-b border-slate-200 dark:border-white/[0.08] text-[11px]">
                {(movement as any).ivaAmount > 0 && (
                  <>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span>{formatCurrency((movement as any).subtotalUSD ?? totalUsd)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-sky-600 dark:text-sky-400">
                      <span>IVA (referencial)</span>
                      <span>+{formatCurrency((movement as any).ivaAmount)}</span>
                    </div>
                    <p className="text-[8px] italic text-sky-500/70 dark:text-sky-400/60 text-right">
                      IVA referencial · no genera crédito fiscal
                    </p>
                  </>
                )}
                {(movement as any).discountAmount > 0 && (
                  <div className="flex justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                    <span>Descuento</span>
                    <span>-{formatCurrency((movement as any).discountAmount)}</span>
                  </div>
                )}
                {(movement as any).igtfAmount > 0 && (
                  <div className="flex justify-between font-semibold text-amber-600 dark:text-amber-400">
                    <span>IGTF ({((movement as any).igtfRate ? ((movement as any).igtfRate * 100).toFixed(0) : '3')}%)</span>
                    <span>+{formatCurrency((movement as any).igtfAmount)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="text-center">
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">Total</p>
              <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                {formatCurrency(totalUsd)}
              </p>
              {movement.rateUsed > 1 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Tasa Interna: Bs. {movement.rateUsed}
                </p>
              )}
            </div>
          </div>

          {/* NO FISCAL footer disclaimer */}
          <div className="px-8 pb-4 text-center">
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.15em]">
              Documento no fiscal — Solo para control interno
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-2 opacity-40">
              <img src="/logo.png" className="h-3.5 w-auto" alt="Dualis" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="text-[9px] text-slate-500 dark:text-white/40 uppercase tracking-widest font-bold">Con tecnología Dualis</span>
            </div>
          </div>

          {/* Ticket cut circles */}
          <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-black/60 dark:bg-black rounded-full" />
          <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-black/60 dark:bg-black rounded-full" />
        </div>

        {/* ── Fiscal external invoice number ── */}
        {movement.id && movement.movementType === MovementType.FACTURA && (
          <div className="bg-white dark:bg-[#0d1424] px-8 pt-4 pb-1">
            <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-500/[0.04] p-3">
              <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1.5">
                <FileCheck2 size={11} /> Nº Factura Fiscal Externa (opcional)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={nroFiscalExterna}
                  onChange={(e) => setNroFiscalExterna(e.target.value)}
                  placeholder="Ej: 00-001234"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/40 outline-none"
                />
                <button
                  onClick={saveNroFiscalExterna}
                  disabled={savingFiscal}
                  className="px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 transition-all disabled:opacity-50"
                >
                  {savingFiscal ? '...' : fiscalSaved ? '✓' : 'Guardar'}
                </button>
              </div>
              <p className="text-[8px] text-slate-500 dark:text-white/30 mt-1.5 leading-tight">
                Vincula este comprobante interno con tu factura fiscal externa (máquina fiscal / imprenta autorizada / sistema homologado).
              </p>
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="bg-white dark:bg-[#0d1424] px-8 pb-8 pt-4 rounded-b-2xl flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => printTicket(movement, config.companyName, (config as any).ticketFooter)}
              className="flex items-center justify-center gap-2 py-3.5 bg-slate-900 dark:bg-white/[0.08] text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-700 dark:hover:bg-white/[0.14] transition-all"
            >
              <Printer size={14} /> Imprimir
            </button>
            {customerPhone ? (
              <a
                href={`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Su compra en ${config.companyName} por $${totalUsd.toFixed(2)} fue registrada el ${movement.date}. Gracias!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            ) : (
              <button
                onClick={downloadReceipt}
                className="flex items-center justify-center gap-2 py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all"
              >
                <Download size={14} /> Descargar
              </button>
            )}
          </div>
          {customerPhone && (
            <button
              onClick={downloadReceipt}
              className="w-full py-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all"
            >
              <Download size={14} className="inline mr-1.5 -mt-0.5" /> Descargar Imagen
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
