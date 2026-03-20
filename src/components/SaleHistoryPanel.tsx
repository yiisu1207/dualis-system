import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, updateDoc, addDoc, increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  X, RotateCcw, Clock, CheckCircle2, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Monitor, User, CreditCard, Package,
} from 'lucide-react';
import HelpTooltip from './HelpTooltip';

interface SaleItem {
  id: string;
  nombre: string;
  qty: number;
  price: number;
  subtotal: number;
}

interface Sale {
  id: string;
  date: string;
  createdAt: string;
  startedAt?: string;
  entityId: string;
  concept: string;
  amountInUSD: number;
  subtotalUSD?: number;
  ivaAmount?: number;
  igtfAmount?: number;
  discountAmount?: number;
  originalAmount?: number;
  rateUsed?: number;
  metodoPago?: string;
  referencia?: string;
  cashGiven?: number;
  changeUsd?: number;
  mixCash?: number;
  mixTransfer?: number;
  anulada?: boolean;
  items?: SaleItem[];
  cajaId?: string;
  cajaName?: string;
  vendedorNombre?: string;
  nroControl?: string;
}

interface SaleHistoryPanelProps {
  tenantId: string;
  cajaId: string | null;
  vendedorId?: string;
  accentColor?: string;
  readOnly?: boolean;
  onClose: () => void;
}

function fmtTime(iso?: string): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

const SaleHistoryPanel: React.FC<SaleHistoryPanelProps> = ({
  tenantId, cajaId, vendedorId, accentColor = 'slate', readOnly = false, onClose,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const accent = accentColor === 'violet'
    ? { btn: 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-md shadow-violet-500/25' }
    : { btn: 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-md shadow-indigo-500/25' };

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadSales = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'movements'),
        where('businessId', '==', tenantId),
        where('movementType', '==', 'FACTURA'),
        orderBy('createdAt', 'desc'),
        limit(30),
      );
      const snap = await getDocs(q);
      const all = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<Sale, 'id'>) }))
        .filter(s => !(s as any).isSupplierMovement);
      setSales(all as Sale[]);
    } catch {
      setMsg({ type: 'err', text: 'Error al cargar historial.' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleAnular = async (sale: Sale) => {
    if (!confirm(`¿Anular la venta de $${sale.amountInUSD?.toFixed(2)} a ${sale.entityId}? Esta acción genera un abono de reverso.`)) return;
    setAnulando(sale.id);
    try {
      await updateDoc(doc(db, 'movements', sale.id), { anulada: true });
      await addDoc(collection(db, 'movements'), {
        businessId: tenantId,
        entityId: sale.entityId,
        concept: `Anulación: ${sale.concept}`,
        amount: -(sale.amountInUSD || 0),
        amountInUSD: -(sale.amountInUSD || 0),
        currency: 'USD',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        movementType: 'ABONO',
        pagado: true,
        estadoPago: 'PAGADO',
        referenciaAnulacion: sale.id,
        cajaId: sale.cajaId || cajaId || 'principal',
      });
      if (sale.items && sale.items.length > 0) {
        await Promise.all(
          sale.items.map(item =>
            updateDoc(doc(db, `businesses/${tenantId}/products`, item.id), {
              stock: increment(item.qty),
            }).catch(() => null)
          )
        );
      }
      setMsg({ type: 'ok', text: 'Venta anulada y stock restaurado.' });
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, anulada: true } : s));
    } catch {
      setMsg({ type: 'err', text: 'Error al anular la venta.' });
    } finally {
      setAnulando(null);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white dark:bg-[#0d1424] h-full flex flex-col shadow-2xl shadow-black/30 animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-white/[0.07]">
          <div>
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <Clock size={16} /> Historial de Ventas
            </h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Últimas 30 transacciones · click para expandir</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Feedback */}
        {msg && (
          <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 ${msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400'}`}>
            {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {msg.text}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scroll px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-12 font-bold">No hay ventas registradas.</p>
          ) : (
            sales.map(sale => {
              const isExpanded = expanded.has(sale.id);
              const duration = fmtDuration(sale.startedAt, sale.createdAt);
              const bsTotal = sale.originalAmount || (sale.amountInUSD && sale.rateUsed ? sale.amountInUSD * sale.rateUsed : null);

              return (
                <div
                  key={sale.id}
                  className={`rounded-2xl border transition-all ${sale.anulada
                    ? 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/[0.05] opacity-60'
                    : 'bg-white dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07] hover:border-slate-200 dark:hover:border-white/[0.15] shadow-sm'
                  }`}
                >
                  {/* ── Card header — always visible ── */}
                  <button
                    onClick={() => toggleExpanded(sale.id)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Row 1: entity + badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">
                            {sale.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : sale.entityId}
                          </p>
                          {sale.anulada && (
                            <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase rounded">
                              Anulada
                            </span>
                          )}
                          {sale.nroControl && (
                            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/[0.07] text-slate-400 text-[9px] font-mono rounded">
                              #{sale.nroControl}
                            </span>
                          )}
                        </div>

                        {/* Row 2: time + method */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Clock size={9} />
                            {sale.startedAt ? fmtTime(sale.startedAt) : fmtTime(sale.createdAt)}
                            {sale.startedAt && sale.startedAt !== sale.createdAt && (
                              <> → {fmtTime(sale.createdAt)}</>
                            )}
                            {duration && <span className="text-indigo-400">({duration})</span>}
                          </span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <CreditCard size={9} />
                            {sale.metodoPago || 'N/A'}
                          </span>
                        </div>

                        {/* Row 3: terminal + cashier */}
                        {(sale.cajaName || sale.cajaId || sale.vendedorNombre) && (
                          <div className="flex items-center gap-3 mt-1">
                            {(sale.cajaName || sale.cajaId) && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Monitor size={9} />
                                {sale.cajaName || sale.cajaId}
                              </span>
                            )}
                            {sale.vendedorNombre && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <User size={9} />
                                {sale.vendedorNombre}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Row 4: items preview */}
                        {sale.items && sale.items.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Package size={9} />
                            {sale.items.length} prod. ·&nbsp;
                            {sale.items.map(i => i.nombre).slice(0, 2).join(', ')}
                            {sale.items.length > 2 ? '...' : ''}
                          </p>
                        )}
                      </div>

                      {/* Right: amount + expand toggle */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {readOnly ? (
                          <p className="text-sm font-black text-slate-400 dark:text-slate-500">***</p>
                        ) : (
                          <p className="text-sm font-black text-slate-900 dark:text-white">${sale.amountInUSD?.toFixed(2)}</p>
                        )}
                        {bsTotal && !readOnly && (
                          <p className="text-[10px] font-bold text-slate-400">{bsTotal.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs</p>
                        )}
                        <span className="text-slate-300 dark:text-white/20 mt-1">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-50 dark:border-white/[0.05] pt-3 space-y-3">

                      {/* Items table */}
                      {sale.items && sale.items.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Productos</p>
                          <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/[0.07]">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-white/[0.04]">
                                  <th className="px-3 py-2 text-left font-black text-slate-400 uppercase tracking-widest">Producto</th>
                                  <th className="px-3 py-2 text-center font-black text-slate-400 uppercase tracking-widest">Cant.</th>
                                  <th className="px-3 py-2 text-right font-black text-slate-400 uppercase tracking-widest">P/U</th>
                                  <th className="px-3 py-2 text-right font-black text-slate-400 uppercase tracking-widest">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sale.items.map(item => (
                                  <tr key={item.id} className="border-t border-slate-50 dark:border-white/[0.04]">
                                    <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-300 max-w-[140px] truncate">{item.nombre}</td>
                                    <td className="px-3 py-2 text-center font-black text-slate-500">{item.qty}</td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-500">${item.price.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right font-black text-slate-800 dark:text-slate-200">${item.subtotal.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Financial breakdown */}
                      {!readOnly && (
                        <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Desglose</p>
                          {sale.subtotalUSD != null && (
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span className="font-bold">Subtotal</span>
                              <span className="font-black">${sale.subtotalUSD.toFixed(2)}</span>
                            </div>
                          )}
                          {sale.ivaAmount != null && sale.ivaAmount > 0 && (
                            <div className="flex justify-between text-[10px] text-sky-500">
                              <span className="font-bold">IVA</span>
                              <span className="font-black">+${sale.ivaAmount.toFixed(2)}</span>
                            </div>
                          )}
                          {sale.igtfAmount != null && sale.igtfAmount > 0 && (
                            <div className="flex justify-between text-[10px] text-yellow-500">
                              <span className="font-bold">IGTF</span>
                              <span className="font-black">+${sale.igtfAmount.toFixed(2)}</span>
                            </div>
                          )}
                          {sale.discountAmount != null && sale.discountAmount > 0 && (
                            <div className="flex justify-between text-[10px] text-emerald-500">
                              <span className="font-bold">Descuento</span>
                              <span className="font-black">-${sale.discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="border-t border-slate-200 dark:border-white/[0.07] pt-1.5 flex justify-between text-[11px]">
                            <span className="font-black text-slate-700 dark:text-slate-300">Total USD</span>
                            <span className="font-black text-slate-900 dark:text-white">${sale.amountInUSD?.toFixed(2)}</span>
                          </div>
                          {bsTotal && (
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span className="font-bold">Total Bs {sale.rateUsed ? `(@ ${sale.rateUsed.toFixed(2)})` : ''}</span>
                              <span className="font-black">{bsTotal.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Payment detail */}
                      <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl p-3 space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Pago</p>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span className="font-bold">Método</span>
                          <span className="font-black text-slate-700 dark:text-slate-300">{sale.metodoPago || 'N/A'}</span>
                        </div>
                        {sale.referencia && (
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span className="font-bold">Referencia</span>
                            <span className="font-mono font-black text-slate-700 dark:text-slate-300">{sale.referencia}</span>
                          </div>
                        )}
                        {sale.cashGiven != null && sale.cashGiven > 0 && !readOnly && (
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span className="font-bold">Entregado</span>
                            <span className="font-black">${sale.cashGiven.toFixed(2)}</span>
                          </div>
                        )}
                        {sale.changeUsd != null && sale.changeUsd > 0 && !readOnly && (
                          <div className="flex justify-between text-[10px] text-emerald-500">
                            <span className="font-bold">Cambio</span>
                            <span className="font-black">${sale.changeUsd.toFixed(2)}</span>
                          </div>
                        )}
                        {sale.mixCash != null && !readOnly && (
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span className="font-bold">Efectivo</span>
                            <span className="font-black">${sale.mixCash.toFixed(2)}</span>
                          </div>
                        )}
                        {sale.mixTransfer != null && !readOnly && (
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span className="font-bold">Transferencia</span>
                            <span className="font-black">${sale.mixTransfer.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {/* Anular button */}
                      {!readOnly && !sale.anulada && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            disabled={anulando === sale.id}
                            onClick={() => handleAnular(sale)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-[10px] font-black uppercase transition-all disabled:opacity-50"
                          >
                            {anulando === sale.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                            Anular Venta
                          </button>
                          <HelpTooltip
                            title="Anular Venta"
                            text="Cancela esta venta, crea un abono de reverso y restaura el stock. No se puede deshacer."
                            side="right"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-slate-100 dark:border-white/[0.07]">
          <button
            onClick={loadSales}
            className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white transition-all ${accent.btn}`}
          >
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleHistoryPanel;
