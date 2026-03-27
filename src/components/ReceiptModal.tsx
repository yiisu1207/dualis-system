import React, { useRef } from 'react';
import { Movement, MovementType, AppConfig } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { MessageCircle, Printer, Download, X as XIcon } from 'lucide-react';

interface ReceiptModalProps {
  movement: Movement;
  config: AppConfig;
  customerPhone?: string;
  onClose: () => void;
}

/* ── 80mm thermal ticket ───────────────────────────────────────────────── */
function printTicket(movement: any, companyName: string) {
  const saleItems: any[] = movement.items || [];
  const itemsHtml = saleItems.map((item: any) => `
    <tr>
      <td style="padding:2px 4px 2px 0">${item.nombre}</td>
      <td style="padding:2px 4px;text-align:center">${item.qty}</td>
      <td style="padding:2px 4px;text-align:right">$${parseFloat(item.price || 0).toFixed(2)}</td>
      <td style="padding:2px 0;text-align:right">$${parseFloat(item.subtotal ?? item.qty * item.price ?? 0).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprobante</title>
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
    .noPrint{margin-top:8px;text-align:center}
    @media print{.noPrint{display:none}}
  </style></head><body>
  <h1>${companyName}</h1>
  <div class="nf">COMPROBANTE DE VENTA - NO FISCAL</div>
  <div class="c" style="font-size:9px">${movement.date || new Date().toLocaleDateString('es-VE')}</div>
  ${movement.nroControl ? `<div class="c" style="font-size:8px;margin-top:2px">N. Control: ${movement.nroControl}</div>` : ''}
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
  ${movement.ivaAmount ? `<div class="row"><span>IVA</span><span>+$${parseFloat(movement.ivaAmount).toFixed(2)}</span></div>` : ''}
  ${movement.discountAmount ? `<div class="row"><span>Descuento</span><span>-$${parseFloat(movement.discountAmount).toFixed(2)}</span></div>` : ''}
  ${movement.igtfAmount ? `<div class="row"><span>IGTF</span><span>+$${parseFloat(movement.igtfAmount).toFixed(2)}</span></div>` : ''}
  <div class="sep"></div>
  <div class="row big"><span>TOTAL USD</span><span>$${parseFloat(movement.amountInUSD ?? movement.amount ?? 0).toFixed(2)}</span></div>
  ${movement.rateUsed > 1 ? `<div class="c" style="font-size:8px;margin-top:2px">Tasa Interna: Bs. ${movement.rateUsed}</div>` : ''}
  <div class="sep"></div>
  <div class="nf">DOCUMENTO NO FISCAL</div>
  <div class="c" style="font-size:8px">Gracias por su compra</div>
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
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">N. Control</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">{(movement as any).nroControl}</span>
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
                {movement.movementType}
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
                      <span>IVA</span>
                      <span>+{formatCurrency((movement as any).ivaAmount)}</span>
                    </div>
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

        {/* ── Action buttons ── */}
        <div className="bg-white dark:bg-[#0d1424] px-8 pb-8 pt-6 rounded-b-2xl flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => printTicket(movement, config.companyName)}
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
