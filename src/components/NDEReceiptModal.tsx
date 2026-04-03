import React, { useEffect, useState } from 'react';
import { X, Printer, MessageCircle, Truck, Clock, Package } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface NDEReceiptModalProps {
  movement: any;
  businessId: string;
  customerPhone?: string;
  ndeConfig?: Partial<{
    showLogo: boolean;
    showPoweredBy: boolean;
    footerMessage: string;
  }>;
  onClose: () => void;
}

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  pendiente_despacho: { label: 'PENDIENTE DE DESPACHO', color: '#f59e0b' },
  despachado:         { label: 'DESPACHADO',             color: '#10b981' },
  parcial:            { label: 'DESPACHO PARCIAL',       color: '#6366f1' },
  rechazado:          { label: 'RECHAZADO',              color: '#ef4444' },
};

const NDEReceiptModal: React.FC<NDEReceiptModalProps> = ({
  movement,
  businessId,
  customerPhone,
  ndeConfig = { showLogo: true, showPoweredBy: true, footerMessage: undefined as string | undefined },
  onClose,
}) => {
  const [businessInfo, setBusinessInfo] = useState<{ name: string; rif?: string; phone?: string; address?: string; logoUrl?: string } | null>(null);

  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, 'businesses', businessId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setBusinessInfo({
          name: d.name || 'Mi Negocio',
          rif: d.rif,
          phone: d.phone,
          address: d.address,
          logoUrl: d.logoUrl || d.logo,
        });
      }
    });
  }, [businessId]);

  const items: any[] = movement.items || [];
  const estado = movement.estadoNDE || 'pendiente_despacho';
  const estadoInfo = ESTADO_LABELS[estado] || ESTADO_LABELS.pendiente_despacho;
  const nroControl = movement.nroControl || movement.id || 'NDE';
  const dateStr = movement.date || new Date().toISOString().split('T')[0];
  const [y, m, d] = dateStr.split('-');
  const dateFormatted = `${d}/${m}/${y}`;
  const condition = movement.paymentCondition === 'contado' ? 'Contado' : movement.paymentCondition?.replace('credito', 'Crédito ') || 'Contado';
  const businessName = businessInfo?.name || 'Mi Negocio';
  const logoUrl = businessInfo?.logoUrl;

  const printNDE = () => {
    const footerHtml = `
      <div class="footer">
        ${(ndeConfig.showLogo !== false) ? (
          logoUrl
            ? `<img src="${logoUrl}" class="footer-logo" alt="logo"/>`
            : `<div class="footer-icon">${businessName[0] || '?'}</div>`
        ) : ''}
        <span class="footer-biz">${businessName}</span>
        ${businessInfo?.rif ? `<span class="footer-rif">RIF: ${businessInfo.rif}</span>` : ''}
      </div>
      ${ndeConfig.footerMessage ? `<p class="footer-msg">${ndeConfig.footerMessage}</p>` : ''}
      ${ndeConfig.showPoweredBy !== false ? `<p class="footer-sub">Generado con <strong style="color:#6366f1">Dualis ERP</strong> · dualis.app</p>` : ''}
    `;

    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding:3px 4px;border-bottom:1px solid #f1f5f9;">${item.nombre || item.name || 'Producto'}</td>
        <td style="text-align:center;padding:3px 4px;border-bottom:1px solid #f1f5f9;">${item.qty ?? 1}</td>
        <td style="text-align:right;padding:3px 4px;border-bottom:1px solid #f1f5f9;">$${(item.price ?? item.priceUsd ?? 0).toFixed(2)}</td>
        <td style="text-align:right;padding:3px 4px;border-bottom:1px solid #f1f5f9;">$${(item.subtotal ?? ((item.qty ?? 1) * (item.price ?? item.priceUsd ?? 0))).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Nota de Entrega ${nroControl}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; color: #1e293b; width: 302px; padding: 10px; }
  .header { text-align:center; margin-bottom:10px; }
  .biz-logo { max-height:40px; object-fit:contain; margin-bottom:4px; }
  .biz-name { font-size:14px; font-weight:900; color:#1e293b; }
  .biz-sub  { font-size:9px; color:#64748b; margin-top:2px; }
  .title    { font-size:13px; font-weight:900; letter-spacing:0.1em; margin:8px 0 4px; border-top:2px solid #1e293b; border-bottom:2px solid #1e293b; padding:4px 0; }
  .meta     { display:flex; justify-content:space-between; font-size:9px; color:#64748b; margin-bottom:2px; }
  .divider  { border-top:1px dashed #cbd5e1; margin:6px 0; }
  table     { width:100%; border-collapse:collapse; font-size:9px; margin:6px 0; }
  th        { background:#f8fafc; padding:3px 4px; text-align:left; font-weight:900; font-size:8px; text-transform:uppercase; letter-spacing:0.05em; }
  .totals   { margin-top:6px; }
  .total-row{ display:flex; justify-content:space-between; font-size:9px; padding:1px 0; }
  .total-main { font-size:13px; font-weight:900; border-top:1px solid #1e293b; margin-top:4px; padding-top:4px; display:flex; justify-content:space-between; }
  .estado   { text-align:center; margin:8px 0; padding:4px 8px; border-radius:4px; font-weight:900; font-size:10px; letter-spacing:0.05em; }
  .footer   { margin-top:12px; padding-top:8px; border-top:1px solid #e2e8f0; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; }
  .footer-logo { height:20px; object-fit:contain; }
  .footer-icon { width:20px; height:20px; border-radius:4px; background:#4f46e5; color:#fff; font-size:10px; font-weight:900; display:inline-flex; align-items:center; justify-content:center; }
  .footer-biz  { font-size:11px; font-weight:900; color:#1e293b; }
  .footer-rif  { font-size:9px; color:#94a3b8; }
  .footer-msg  { text-align:center; font-size:9px; color:#64748b; margin:4px 0; font-style:italic; }
  .footer-sub  { text-align:center; font-size:9px; color:#94a3b8; margin-top:4px; }
  @media print { body { width:auto; } }
</style>
</head><body>
<div class="header">
  ${(ndeConfig.showLogo !== false) && logoUrl ? `<img src="${logoUrl}" class="biz-logo" alt="logo"/>` : ''}
  <div class="biz-name">${businessName}</div>
  ${businessInfo?.rif ? `<div class="biz-sub">RIF: ${businessInfo.rif}</div>` : ''}
</div>

<div class="title" style="text-align:center">NOTA DE ENTREGA</div>

<div class="meta"><span>Nro:</span><span><strong>${nroControl}</strong></span></div>
<div class="meta"><span>Fecha:</span><span>${dateFormatted}</span></div>
<div class="meta"><span>Cliente:</span><span>${movement.concept?.replace(/Venta POS Mayor — /, '') || 'Cliente'}</span></div>
<div class="meta"><span>Vendedor:</span><span>${movement.vendedorNombre || 'Vendedor'}</span></div>
<div class="meta"><span>Cuenta:</span><span>${movement.accountType || 'BCV'}</span></div>
<div class="meta"><span>Condición:</span><span>${condition}</span></div>
${movement.almacenId && movement.almacenId !== 'principal' ? `<div class="meta"><span>Almacén:</span><span>${movement.almacenId}</span></div>` : ''}

<div class="divider"></div>

<table>
  <thead>
    <tr>
      <th style="text-align:left">Producto</th>
      <th style="text-align:center">Cant.</th>
      <th style="text-align:right">P/U</th>
      <th style="text-align:right">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${itemsHtml}
  </tbody>
</table>

<div class="divider"></div>

<div class="totals">
  ${movement.ivaAmount ? `<div class="total-row"><span>Base:</span><span>$${movement.subtotalUSD?.toFixed(2) || '0.00'}</span></div>` : ''}
  ${movement.ivaAmount ? `<div class="total-row"><span>IVA:</span><span>+$${movement.ivaAmount?.toFixed(2)}</span></div>` : ''}
  ${movement.discountAmount ? `<div class="total-row"><span>Descuento:</span><span>-$${movement.discountAmount?.toFixed(2)}</span></div>` : ''}
  ${(movement as any).earlyPayDiscountPct ? `<div class="total-row" style="color:#10b981"><span>Desc. pronto pago ${(movement as any).earlyPayDiscountPct}%:</span><span>-$${((movement as any).earlyPayDiscountAmt || 0).toFixed(2)}</span></div>` : ''}
  <div class="total-main"><span>TOTAL:</span><span>$${(movement.amountInUSD ?? movement.amount ?? 0).toFixed(2)}</span></div>
  ${(movement as any).realAmountUSD ? `<div class="total-row" style="margin-top:2px;color:#a78bfa"><span>Neto (con desc.):</span><span>$${(movement as any).realAmountUSD.toFixed(2)}</span></div>` : ''}
  ${movement.rateUsed ? `<div class="total-row" style="margin-top:4px"><span>Bs (tasa ${movement.rateUsed?.toFixed(2)}):</span><span>${((movement.amountInUSD ?? 0) * movement.rateUsed).toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs</span></div>` : ''}
</div>

${movement.bultos ? `<div class="divider"></div><div class="meta"><span><strong>Total Bultos:</strong></span><span><strong>${movement.bultos}</strong></span></div>` : ''}

<div class="divider"></div>

<div class="estado" style="background:${estadoInfo.color}1a;color:${estadoInfo.color};border:1px solid ${estadoInfo.color}40">
  ⏳ ${estadoInfo.label}
</div>

${footerHtml}
</body></html>`;

    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const handleWhatsApp = () => {
    if (!customerPhone) return;
    const phone = customerPhone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `📋 *Nota de Entrega ${nroControl}*\n` +
      `Fecha: ${dateFormatted}\n` +
      `Total: $${(movement.amountInUSD ?? movement.amount ?? 0).toFixed(2)}\n` +
      (movement.bultos ? `Bultos: ${movement.bultos}\n` : '') +
      `Estado: ${estadoInfo.label}\n\n` +
      `Emitido por ${businessName}`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] bg-amber-500/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Truck size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Nota de Entrega</h2>
              <p className="text-[10px] font-bold text-amber-500">{nroControl}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-4">

          {/* Status badge */}
          <div className="flex items-center justify-center">
            <span className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest"
              style={{ background: `${estadoInfo.color}1a`, color: estadoInfo.color, border: `1px solid ${estadoInfo.color}40` }}>
              <Clock size={12} />
              {estadoInfo.label}
            </span>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3 border border-slate-100 dark:border-white/[0.07]">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Nro. Control</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{nroControl}</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3 border border-slate-100 dark:border-white/[0.07]">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Fecha</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{dateFormatted}</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3 border border-slate-100 dark:border-white/[0.07]">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Cuenta</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{movement.accountType || 'BCV'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3 border border-slate-100 dark:border-white/[0.07]">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Condición</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{condition}</p>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Productos ({items.length})</p>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 dark:border-white/[0.05]">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Package size={12} className="text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{item.nombre || item.name}</p>
                      <p className="text-[9px] font-bold text-slate-400">x{item.qty ?? 1} · ${(item.price ?? item.priceUsd ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-900 dark:text-white shrink-0">
                    ${(item.subtotal ?? ((item.qty ?? 1) * (item.price ?? item.priceUsd ?? 0))).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 rounded-xl p-4 border border-amber-500/20">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Total USD</p>
              <p className="text-2xl font-black text-white">${(movement.amountInUSD ?? movement.amount ?? 0).toFixed(2)}</p>
            </div>
            {movement.bultos > 0 && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-amber-500/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Total Bultos</p>
                <p className="text-base font-black text-amber-300">{movement.bultos}</p>
              </div>
            )}
          </div>

          {/* Info note */}
          <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 border border-slate-100 dark:border-white/[0.05]">
            <p className="text-[9px] text-slate-400 dark:text-white/30 font-bold">
              El stock ha sido reservado. Si el despacho es rechazado o parcial, el stock se restaurará automáticamente.
            </p>
          </div>

          {/* Branding */}
          {ndeConfig.showPoweredBy !== false && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <div className="flex items-center gap-2">
                {ndeConfig.showLogo !== false && (
                  logoUrl
                    ? <img src={logoUrl} className="h-5 object-contain" alt="logo" />
                    : <div className="h-5 w-5 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-black">{businessName[0]}</div>
                )}
                <span className="text-xs font-black text-slate-700 dark:text-white/70">{businessName}</span>
              </div>
              <p className="text-[9px] text-slate-400 dark:text-white/20">
                Powered by <strong className="text-indigo-400">Dualis ERP</strong>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-slate-100 dark:border-white/[0.07]">
          <button
            onClick={printNDE}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 dark:bg-white/[0.08] text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-white/[0.12] transition-all"
          >
            <Printer size={14} /> Imprimir
          </button>
          {customerPhone && (
            <button
              onClick={handleWhatsApp}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
            >
              <MessageCircle size={14} /> WhatsApp
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default NDEReceiptModal;
