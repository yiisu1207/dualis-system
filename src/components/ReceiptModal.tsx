import React, { useRef } from 'react';
import { Movement, MovementType, AppConfig } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { MessageCircle, Printer, X as XIcon } from 'lucide-react';

interface ReceiptModalProps {
  movement: Movement;
  config: AppConfig;
  customerPhone?: string;
  onClose: () => void;
}

function printTicket(movement: any, companyName: string) {
  const saleItems: any[] = movement.items || [];
  const itemsHtml = saleItems.map((item: any) => `
    <tr>
      <td style="padding:1px 4px 1px 0">${item.nombre}</td>
      <td style="padding:1px 4px;text-align:center">${item.qty}</td>
      <td style="padding:1px 4px;text-align:right">$${parseFloat(item.price || 0).toFixed(2)}</td>
      <td style="padding:1px 0;text-align:right">$${parseFloat(item.subtotal ?? item.qty * item.price ?? 0).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:10px;width:80mm;max-width:80mm;padding:8px}
    h1{font-size:13px;font-weight:bold;text-align:center;margin-bottom:2px}
    .c{text-align:center}.sep{border-top:1px dashed #000;margin:5px 0}
    .row{display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse;font-size:9px}
    th{text-align:left;border-bottom:1px solid #000;padding-bottom:2px;font-size:9px}
    td{vertical-align:top}
    .big{font-size:14px;font-weight:bold}
    .noPrint{margin-top:8px;text-align:center}
    @media print{.noPrint{display:none}}
  </style></head><body>
  <h1>${companyName}</h1>
  <div class="c">Ticket de Venta</div>
  <div class="c">${movement.date || new Date().toLocaleDateString('es-VE')}</div>
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
  <div class="sep"></div>
  <div class="c">¡Gracias por su compra!</div>
  <div class="noPrint"><button onclick="window.print()">🖨 Imprimir</button></div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=360,height=520,toolbar=0,menubar=0,scrollbars=1');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ movement, config, customerPhone, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    const canvas = await (window as any).html2canvas(receiptRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `Recibo_${movement.entityId}_${movement.date}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[150] p-4">
      <div className="w-full max-w-sm animate-in zoom-in duration-300">
        {/* AREA DE CAPTURA */}
        <div
          ref={receiptRef}
          className="bg-white p-10 rounded-t-[2rem] border-b-2 border-dashed border-slate-100 relative"
        >
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">👗</div>
            <h2 className="text-xl font-black text-slate-800 uppercase italic leading-none">
              {config.companyName}
            </h2>
            <p className="text-[10px] font-black text-indigo-500 tracking-[0.3em] uppercase mt-2">
              Comprobante Digital
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Fecha</span>
              <span className="text-xs font-bold text-slate-800">{movement.date}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Cliente</span>
              <span className="text-xs font-bold text-slate-800 uppercase">
                {movement.entityId}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-[9px] font-black text-slate-400 uppercase">Operación</span>
              {/* Fix: Changed mismatched </p> to </span> to correctly close the opening tag */}
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  movement.movementType === MovementType.FACTURA
                    ? 'bg-rose-50 text-rose-500'
                    : 'bg-emerald-50 text-emerald-500'
                }`}
              >
                {movement.movementType}
              </span>
            </div>
            <div className="pt-2">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Concepto</p>
              <p className="text-sm font-bold text-slate-700 leading-tight">{movement.concept}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl">
            {((movement as any).ivaAmount > 0 || (movement as any).igtfAmount > 0 || (movement as any).discountAmount > 0) && (
              <div className="space-y-1.5 mb-4 text-[11px]">
                {(movement as any).ivaAmount > 0 && (
                  <>
                    <div className="flex justify-between font-bold text-slate-500">
                      <span>Base</span>
                      <span>{formatCurrency((movement as any).subtotalUSD ?? getMovementUsdAmount(movement))}</span>
                    </div>
                    <div className="flex justify-between font-black text-sky-600">
                      <span>IVA</span>
                      <span>+{formatCurrency((movement as any).ivaAmount)}</span>
                    </div>
                  </>
                )}
                {(movement as any).discountAmount > 0 && (
                  <div className="flex justify-between font-black text-emerald-600">
                    <span>Descuento</span>
                    <span>-{formatCurrency((movement as any).discountAmount)}</span>
                  </div>
                )}
                {(movement as any).igtfAmount > 0 && (
                  <>
                    {((movement as any).ivaAmount > 0 || (movement as any).discountAmount > 0) && (
                      <div className="flex justify-between font-bold text-slate-400">
                        <span>Sub-total</span>
                        <span>{formatCurrency(getMovementUsdAmount(movement) - ((movement as any).igtfAmount ?? 0))}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-amber-600">
                      <span>IGTF ({((movement as any).igtfRate ? ((movement as any).igtfRate * 100).toFixed(0) : '3')}%)</span>
                      <span>+{formatCurrency((movement as any).igtfAmount)}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-slate-200 pt-1.5" />
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Total Transacción
              </p>
              <p className="text-3xl font-black text-slate-900">
                {formatCurrency(getMovementUsdAmount(movement))}
              </p>
              {movement.rateUsed > 1 && (
                <p className="text-[8px] font-bold text-slate-400 mt-1 italic">
                  Ref. BCV: Bs. {movement.rateUsed}
                </p>
              )}
            </div>
          </div>

          <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-slate-900 rounded-full"></div>
          <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-slate-900 rounded-full"></div>
        </div>

        <div className="bg-white px-10 pb-10 rounded-b-[2rem] flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => printTicket(movement, config.companyName)}
              className="flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all"
            >
              <Printer size={14} /> Imprimir
            </button>
            {customerPhone ? (
              <a
                href={`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Su compra en ${config.companyName} por $${getMovementUsdAmount(movement).toFixed(2)} fue registrada el ${movement.date}. ¡Gracias!`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            ) : (
              <button
                onClick={downloadReceipt}
                className="flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all"
              >
                <XIcon size={14} /> Descargar
              </button>
            )}
          </div>
          {customerPhone && (
            <button
              onClick={downloadReceipt}
              className="w-full py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all"
            >
              Descargar Imagen
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
