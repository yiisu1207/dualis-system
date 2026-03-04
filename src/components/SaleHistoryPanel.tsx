import React, { useEffect, useState, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, updateDoc, addDoc, increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { X, RotateCcw, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

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
  entityId: string;
  concept: string;
  amountInUSD: number;
  metodoPago?: string;
  referencia?: string;
  anulada?: boolean;
  items?: SaleItem[];
  ivaAmount?: number;
  igtfAmount?: number;
  discountAmount?: number;
  cajaId?: string;
}

interface SaleHistoryPanelProps {
  tenantId: string;
  cajaId: string | null;
  vendedorId?: string;
  accentColor?: string;  // 'slate' | 'violet'
  onClose: () => void;
}

const SaleHistoryPanel: React.FC<SaleHistoryPanelProps> = ({
  tenantId, cajaId, vendedorId, accentColor = 'slate', onClose,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const accent = accentColor === 'violet'
    ? { btn: 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 shadow-md shadow-violet-500/25', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' }
    : { btn: 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 shadow-md shadow-indigo-500/25', badge: 'bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300' };

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
      // 1. Marcar movimiento como anulado
      await updateDoc(doc(db, 'movements', sale.id), { anulada: true });

      // 2. Crear movimiento de reverso (ABONO negativo)
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

      // 3. Restaurar stock si hay líneas de productos
      if (sale.items && sale.items.length > 0) {
        await Promise.all(
          sale.items.map(item =>
            updateDoc(doc(db, `businesses/${tenantId}/products`, item.id), {
              stock: increment(item.qty),
            }).catch(() => null) // ignorar si el producto ya no existe
          )
        );
      }

      setMsg({ type: 'ok', text: 'Venta anulada y stock restaurado.' });
      // Actualizar lista local
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
      {/* Overlay */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-white dark:bg-[#0d1424] h-full flex flex-col shadow-2xl shadow-black/30 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-white/[0.07]">
          <div>
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <Clock size={16} /> Historial de Ventas
            </h2>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">Últimas 30 transacciones</p>
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
            sales.map(sale => (
              <div
                key={sale.id}
                className={`p-4 rounded-2xl border transition-all ${sale.anulada ? 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/[0.05] opacity-60' : 'bg-white dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07] hover:border-slate-200 dark:hover:border-white/[0.15] shadow-sm'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">
                        {sale.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : sale.entityId}
                      </p>
                      {sale.anulada && (
                        <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase rounded">
                          Anulada
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold mt-0.5">
                      {sale.metodoPago || 'N/A'} · {sale.date}
                    </p>
                    {sale.items && sale.items.length > 0 && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5">
                        {sale.items.length} producto{sale.items.length > 1 ? 's' : ''}
                        {' · '}{sale.items.map(i => i.nombre).slice(0, 2).join(', ')}
                        {sale.items.length > 2 ? '...' : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white">${sale.amountInUSD?.toFixed(2)}</p>
                    {!sale.anulada && (
                      <button
                        disabled={anulando === sale.id}
                        onClick={() => handleAnular(sale)}
                        className="mt-1.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-[9px] font-black uppercase transition-all disabled:opacity-50"
                      >
                        {anulando === sale.id
                          ? <Loader2 size={10} className="animate-spin" />
                          : <RotateCcw size={10} />}
                        Anular
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
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
