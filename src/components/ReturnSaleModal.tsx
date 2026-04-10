import React, { useMemo, useState } from 'react';
import { RotateCcw, X, Loader2, AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import {
  collection, addDoc, doc, updateDoc, getDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Return modal (Fase 2.4) — documento administrativo interno.
 * Permite devolver ítems de una venta existente, parcial o total.
 * - Crea un movimiento interno de devolución vinculado al original.
 * - Restaura stock en modelo dual (legacy `stock` + `stockByAlmacen` cuando está presente).
 * - Si la venta original tenía balance a crédito: reduce saldo CxC.
 * - Si la venta estaba pagada: la devolución queda como saldo a favor del cliente.
 *
 * NOTA LEGAL: este documento es registro interno administrativo. No sustituye
 * a la Nota de Crédito fiscal regulada por el Art. 22 de la Providencia SENIAT
 * SNAT/2011/00071, la cual debe emitirse por medio autorizado (imprenta
 * autorizada, máquina fiscal o proveedor homologado). El campo interno
 * `movementType: 'NOTA_CREDITO'` se mantiene por compatibilidad retroactiva.
 */

interface SaleItem {
  id: string;
  nombre: string;
  qty: number;
  price: number;
  subtotal: number;
}

interface Sale {
  id: string;
  entityId: string;
  concept: string;
  amountInUSD: number;
  rateUsed?: number;
  metodoPago?: string;
  items?: SaleItem[];
  cajaId?: string;
  nroControl?: string;
  estadoPago?: string;
  pagado?: boolean;
  anulada?: boolean;
  almacenId?: string;
  vendedorNombre?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sale: Sale | null;
  tenantId: string;
  operatorName: string;
  onDone?: () => void;
}

type LineReturn = {
  itemId: string;
  nombre: string;
  originalQty: number;
  price: number;
  returnQty: number;
};

export default function ReturnSaleModal({
  open, onClose, sale, tenantId, operatorName, onDone,
}: Props) {
  const initialLines = useMemo<LineReturn[]>(() => {
    if (!sale?.items) return [];
    return sale.items.map(it => ({
      itemId: it.id,
      nombre: it.nombre,
      originalQty: it.qty,
      price: it.price,
      returnQty: 0,
    }));
  }, [sale]);

  const [lines, setLines] = useState<LineReturn[]>(initialLines);
  const [reason, setReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset lines when sale changes
  React.useEffect(() => { setLines(initialLines); setReason(''); setError(null); }, [initialLines]);

  if (!open || !sale) return null;

  const totalReturn = lines.reduce((s, l) => s + (l.returnQty * l.price), 0);
  const totalItems = lines.reduce((s, l) => s + l.returnQty, 0);
  const isFullReturn = lines.every(l => l.returnQty === l.originalQty) && lines.length > 0;
  const ivaPct = sale.concept?.includes('IVA') ? 0.16 : 0; // conservative: only if original mentions IVA
  const ivaReturn = totalReturn * ivaPct;
  const grandReturn = totalReturn + ivaReturn;

  const updateLine = (itemId: string, qty: number) => {
    setLines(ls => ls.map(l => l.itemId === itemId ? { ...l, returnQty: Math.max(0, Math.min(l.originalQty, qty)) } : l));
  };

  const setAllFull = () => setLines(ls => ls.map(l => ({ ...l, returnQty: l.originalQty })));
  const setAllZero = () => setLines(ls => ls.map(l => ({ ...l, returnQty: 0 })));

  const handleSubmit = async () => {
    setError(null);
    if (totalItems === 0) { setError('Selecciona al menos 1 ítem para devolver'); return; }
    if (!reason.trim()) { setError('Ingresa el motivo de la devolución'); return; }

    setSaving(true);
    try {
      const returnedItems = lines
        .filter(l => l.returnQty > 0)
        .map(l => ({
          id: l.itemId,
          nombre: l.nombre,
          qty: l.returnQty,
          price: l.price,
          subtotal: l.returnQty * l.price,
        }));

      // 1) Create NOTA_CREDITO movement linked to original
      const ncRef = await addDoc(collection(db, 'movements'), {
        businessId: tenantId,
        entityId: sale.entityId,
        concept: `NC: ${sale.concept} — ${reason.trim()}`,
        amount: -grandReturn,
        amountInUSD: -grandReturn,
        currency: 'USD',
        subtotalUSD: -totalReturn,
        ivaAmount: -ivaReturn,
        rateUsed: sale.rateUsed || 0,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        createdAtServer: serverTimestamp(),
        movementType: 'NOTA_CREDITO',
        referenceFacturaId: sale.id,
        referenceNroControl: sale.nroControl || '',
        pagado: true,
        estadoPago: 'PAGADO',
        cajaId: sale.cajaId || 'principal',
        items: returnedItems,
        isFullReturn,
        returnReason: reason.trim(),
        operatorName,
      });

      // 2) Restore stock (dual-model) — only when requested
      if (restoreStock && returnedItems.length > 0) {
        const batch = writeBatch(db);
        const targetAlmacen = sale.almacenId || 'principal';
        for (const it of returnedItems) {
          const prodRef = doc(db, `businesses/${tenantId}/products`, it.id);
          try {
            const snap = await getDoc(prodRef);
            if (!snap.exists()) continue;
            const data: any = snap.data();
            const currentStock = Number(data.stock || 0);
            const existingMap = data.stockByAlmacen || {};
            const hasMap = Object.keys(existingMap).length > 0;

            if (!hasMap) {
              // Legacy — just bump `stock`
              batch.update(prodRef, { stock: currentStock + it.qty });
            } else {
              // Dual model — bump the specific almacén
              const baseMap = { ...existingMap };
              const prev = Number(baseMap[targetAlmacen] || 0);
              baseMap[targetAlmacen] = prev + it.qty;
              const total = Object.values(baseMap).reduce<number>((s, v) => s + Number(v || 0), 0);
              batch.update(prodRef, { stockByAlmacen: baseMap, stock: total });
            }
          } catch {
            // silent — product may have been deleted
          }
        }
        await batch.commit();
      }

      // 3) Mark original as fully anulada if it's a full return
      if (isFullReturn) {
        await updateDoc(doc(db, 'movements', sale.id), {
          anulada: true,
          anuladaAt: new Date().toISOString(),
          anuladaBy: operatorName,
          notaCreditoId: ncRef.id,
        });
      } else {
        // Partial — mark with pointer only
        await updateDoc(doc(db, 'movements', sale.id), {
          partiallyReturned: true,
          lastNotaCreditoId: ncRef.id,
        });
      }

      onDone?.();
      onClose();
    } catch (err) {
      console.error('[ReturnSale] error:', err);
      setError('Error al procesar la devolución. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[94vh] bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <RotateCcw size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Devolución de Venta</h2>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-white/40">
                {sale.nroControl ? `#${sale.nroControl} · ` : ''}{sale.entityId} · Total ${sale.amountInUSD?.toFixed(2)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/40">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {lines.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">Esta venta no tiene detalle de items</p>
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300/80 mt-1">No es posible registrar una devolución detallada. Usa el botón "Anular Venta" si deseas revertirla completamente.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={setAllFull}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                >
                  Devolver todo
                </button>
                <button
                  type="button"
                  onClick={setAllZero}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors"
                >
                  Limpiar
                </button>
                <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-white/40">
                  {totalItems} unidades seleccionadas
                </span>
              </div>

              {/* Lines table */}
              <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-white/[0.03] text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 grid grid-cols-[1fr_60px_80px_90px_90px] gap-3 items-center">
                  <span>Producto</span>
                  <span className="text-right">Vendido</span>
                  <span className="text-right">Precio</span>
                  <span className="text-right">Devolver</span>
                  <span className="text-right">Subtotal</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {lines.map(l => (
                    <div key={l.itemId} className="px-3 py-2.5 grid grid-cols-[1fr_60px_80px_90px_90px] gap-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={12} className="text-slate-400 shrink-0" />
                        <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">{l.nombre}</p>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-white/40 text-right">{l.originalQty}</span>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-white/40 text-right">${l.price.toFixed(2)}</span>
                      <input
                        type="number"
                        min="0"
                        max={l.originalQty}
                        value={l.returnQty}
                        onChange={e => updateLine(l.itemId, parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-lg text-[11px] font-black text-right text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-rose-300"
                      />
                      <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 text-right">
                        ${(l.returnQty * l.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5">Motivo de la devolución *</label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Ej: producto defectuoso, cliente cambió de opinión..."
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-semibold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              {/* Restore stock toggle */}
              <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreStock}
                  onChange={e => setRestoreStock(e.target.checked)}
                  className="w-4 h-4 accent-rose-600"
                />
                <div className="flex-1">
                  <p className="text-[11px] font-black text-slate-700 dark:text-white">Restaurar stock al inventario</p>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/40">Desmarca si los productos ya no están en condición de reventa</p>
                </div>
              </label>

              {/* Summary */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10 border border-rose-200 dark:border-rose-500/30 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-white/70">
                  <span>Subtotal a devolver</span>
                  <span>${totalReturn.toFixed(2)}</span>
                </div>
                {ivaReturn > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-white/70">
                    <span>IVA (ref.)</span>
                    <span>${ivaReturn.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-black text-rose-600 dark:text-rose-400 pt-1 border-t border-rose-200 dark:border-rose-500/30">
                  <span>Total Devolución</span>
                  <span>${grandReturn.toFixed(2)}</span>
                </div>
                {isFullReturn && (
                  <p className="text-[10px] font-bold text-rose-500 dark:text-rose-300 pt-1">La venta quedará marcada como ANULADA (devolución total).</p>
                )}
                <p className="text-[9px] text-rose-500/70 dark:text-rose-300/60 pt-1 italic leading-tight">
                  Registro interno administrativo. No sustituye nota de crédito fiscal (Prov. SENIAT SNAT/2011/00071 Art. 22).
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center gap-2">
                  <AlertTriangle size={12} className="text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || lines.length === 0 || totalItems === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {saving ? 'Procesando...' : 'Registrar Devolución'}
          </button>
        </div>
      </div>
    </div>
  );
}
