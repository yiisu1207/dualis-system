import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, X, Loader2, Search, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { collection, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

/**
 * Transfer stock between almacenes (Fase 9.1).
 * Atomic: decrements source, increments destination, logs two stock_movements
 * (SALIDA_TRANSFERENCIA at origen, ENTRADA_TRANSFERENCIA at destino) in a single batch.
 *
 * Supports the dual stock model:
 *   - If product has stockByAlmacen, mutates map[origen]/map[destino] and syncs total.
 *   - If not, seeds stockByAlmacen from legacy `stock` into origen first, then transfers.
 */

interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  stock: number;
  stockByAlmacen?: Record<string, number>;
}

interface Almacen {
  id: string;
  nombre: string;
  activo?: boolean;
  isPrimary?: boolean;
}

interface Line {
  productId: string;
  qty: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  businessId: string;
  operatorName: string;
  products: Product[];
  almacenes: Almacen[];
  onDone?: () => void;
}

const getStockAt = (p: Product, almacenId: string): number => {
  const map = p.stockByAlmacen || {};
  if (Object.prototype.hasOwnProperty.call(map, almacenId)) return Number(map[almacenId] || 0);
  // Fallback: legacy products without map — all stock is at "principal"
  if (almacenId === 'principal') return Number(p.stock || 0);
  return 0;
};

export default function TransferStockModal({
  open, onClose, businessId, operatorName, products, almacenes, onDone,
}: Props) {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activos = useMemo(() => almacenes.filter(a => a.activo !== false), [almacenes]);

  // Auto-select defaults when opened
  React.useEffect(() => {
    if (!open) return;
    setSearch('');
    setLines([]);
    setNote('');
    setError(null);
    if (activos.length >= 2) {
      setOrigen(activos[0].id);
      setDestino(activos[1].id);
    } else if (activos.length === 1) {
      setOrigen(activos[0].id);
      setDestino('');
    }
  }, [open, activos]);

  const filteredProducts = useMemo(() => {
    if (!origen) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter(p => {
        const stockOrigen = getStockAt(p, origen);
        if (stockOrigen <= 0) return false;
        if (!q) return true;
        return (
          (p.nombre || '').toLowerCase().includes(q) ||
          String(p.codigo || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [products, origen, search]);

  const addLine = (productId: string) => {
    if (lines.some(l => l.productId === productId)) return;
    setLines(ls => [...ls, { productId, qty: 1 }]);
  };

  const updateLineQty = (productId: string, qty: number) => {
    setLines(ls => ls.map(l => l.productId === productId ? { ...l, qty: Math.max(0, qty) } : l));
  };

  const removeLine = (productId: string) => {
    setLines(ls => ls.filter(l => l.productId !== productId));
  };

  const handleTransfer = async () => {
    setError(null);
    if (!businessId) { setError('Falta businessId'); return; }
    if (!origen || !destino) { setError('Selecciona almacén origen y destino'); return; }
    if (origen === destino) { setError('El origen y destino deben ser distintos'); return; }
    if (lines.length === 0) { setError('Agrega al menos un producto'); return; }

    // Validate each line against current stock
    for (const l of lines) {
      if (l.qty <= 0) { setError('Las cantidades deben ser mayores a cero'); return; }
      const p = products.find(x => x.id === l.productId);
      if (!p) { setError('Producto no encontrado'); return; }
      const disponible = getStockAt(p, origen);
      if (l.qty > disponible) {
        setError(`${p.nombre}: solo hay ${disponible} en origen`);
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const origenNombre = almacenes.find(a => a.id === origen)?.nombre || origen;
      const destinoNombre = almacenes.find(a => a.id === destino)?.nombre || destino;
      const transferId = `TR-${Date.now()}`;

      for (const l of lines) {
        const p = products.find(x => x.id === l.productId)!;
        // Seed stockByAlmacen from legacy `stock` when absent
        const existingMap = p.stockByAlmacen || {};
        const hasMap = Object.keys(existingMap).length > 0;
        let baseMap: Record<string, number>;
        if (hasMap) {
          baseMap = { ...existingMap };
        } else {
          // Legacy product: pretend all stock is at "principal"
          baseMap = { principal: Number(p.stock || 0) };
        }
        const stockOrigen = Number(baseMap[origen] || 0);
        const stockDestino = Number(baseMap[destino] || 0);
        baseMap[origen] = stockOrigen - l.qty;
        baseMap[destino] = stockDestino + l.qty;
        const total = Object.values(baseMap).reduce((s, v) => s + Number(v || 0), 0);

        const ref = doc(db, `businesses/${businessId}/products`, p.id);
        batch.update(ref, {
          stockByAlmacen: baseMap,
          stock: total,
        });
      }

      await batch.commit();

      // Log stock movements (two per line: salida + entrada) outside the batch
      // so subcollection adds succeed even if batch gets full
      for (const l of lines) {
        const p = products.find(x => x.id === l.productId)!;
        await addDoc(collection(db, `businesses/${businessId}/stock_movements`), {
          productId: p.id,
          productName: p.nombre,
          type: 'TRANSFERENCIA_SALIDA',
          quantity: -l.qty,
          almacenId: origen,
          almacenNombre: origenNombre,
          destinoAlmacenId: destino,
          destinoAlmacenNombre: destinoNombre,
          transferId,
          reason: `Transferencia → ${destinoNombre}${note ? ` · ${note}` : ''}`,
          userName: operatorName,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, `businesses/${businessId}/stock_movements`), {
          productId: p.id,
          productName: p.nombre,
          type: 'TRANSFERENCIA_ENTRADA',
          quantity: l.qty,
          almacenId: destino,
          almacenNombre: destinoNombre,
          origenAlmacenId: origen,
          origenAlmacenNombre: origenNombre,
          transferId,
          reason: `Transferencia ← ${origenNombre}${note ? ` · ${note}` : ''}`,
          userName: operatorName,
          createdAt: serverTimestamp(),
        });
      }

      // Session history doc for audit
      await addDoc(collection(db, `businesses/${businessId}/inventory_transfers`), {
        transferId,
        origenAlmacenId: origen,
        origenAlmacenNombre: origenNombre,
        destinoAlmacenId: destino,
        destinoAlmacenNombre: destinoNombre,
        operatorName,
        note,
        lines: lines.map(l => {
          const p = products.find(x => x.id === l.productId)!;
          return {
            productId: p.id,
            productName: p.nombre,
            codigo: p.codigo || '',
            quantity: l.qty,
          };
        }),
        totalItems: lines.reduce((s, l) => s + l.qty, 0),
        totalLines: lines.length,
        createdAt: new Date().toISOString(),
        createdAtServer: serverTimestamp(),
      });

      onDone?.();
      onClose();
    } catch (err) {
      console.error('[TransferStock] error:', err);
      setError('Error al ejecutar la transferencia. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const totalItems = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[94vh] bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <ArrowRightLeft size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Transferir Stock</h2>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-white/40">Entre almacenes · trazabilidad completa</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/40">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {activos.length < 2 ? (
            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">Se necesitan al menos 2 almacenes</p>
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300/80 mt-1">Configura almacenes adicionales en la pestaña "Almacenes" para poder transferir stock entre ellos.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Origen y destino */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5">Origen</label>
                  <select
                    value={origen}
                    onChange={e => { setOrigen(e.target.value); setLines([]); }}
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    {activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5">Destino</label>
                  <select
                    value={destino}
                    onChange={e => setDestino(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    <option value="">Seleccionar...</option>
                    {activos.filter(a => a.id !== origen).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Buscador de productos */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5">Agregar producto</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-semibold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </div>
                {search.trim() && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-white/[0.08] rounded-xl divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {filteredProducts.length === 0 ? (
                      <p className="px-3 py-3 text-[11px] font-bold text-slate-400 dark:text-white/40 text-center">Sin resultados con stock en origen</p>
                    ) : filteredProducts.map(p => {
                      const st = getStockAt(p, origen);
                      const already = lines.some(l => l.productId === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={already}
                          onClick={() => { addLine(p.id); setSearch(''); }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sky-50 dark:hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Package size={12} className="text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">{p.nombre}</p>
                              <p className="text-[9px] font-bold text-slate-400 dark:text-white/40 truncate">{p.codigo || '—'}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-sky-600 dark:text-sky-400 shrink-0">{st}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Líneas */}
              {lines.length > 0 && (
                <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-white/[0.03] text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 grid grid-cols-[1fr_80px_80px_28px] gap-3 items-center">
                    <span>Producto</span>
                    <span className="text-right">Disponible</span>
                    <span className="text-right">Cantidad</span>
                    <span></span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {lines.map(l => {
                      const p = products.find(x => x.id === l.productId);
                      if (!p) return null;
                      const disponible = getStockAt(p, origen);
                      const over = l.qty > disponible;
                      return (
                        <div key={l.productId} className="px-3 py-2.5 grid grid-cols-[1fr_80px_80px_28px] gap-3 items-center">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">{p.nombre}</p>
                            <p className="text-[9px] font-bold text-slate-400 dark:text-white/40 truncate">{p.codigo || '—'}</p>
                          </div>
                          <span className="text-[11px] font-black text-slate-500 dark:text-white/40 text-right">{disponible}</span>
                          <input
                            type="number"
                            min="0"
                            max={disponible}
                            value={l.qty}
                            onChange={e => updateLineQty(l.productId, parseInt(e.target.value) || 0)}
                            className={`w-full px-2 py-1.5 bg-white dark:bg-slate-900 border rounded-lg text-[11px] font-black text-right outline-none ${
                              over
                                ? 'border-rose-400 text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-300'
                                : 'border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-white focus:ring-2 focus:ring-sky-300'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => removeLine(l.productId)}
                            className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nota */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5">Nota (opcional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Ej: reposición sucursal centro..."
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-semibold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-300"
                />
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
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="text-[10px] font-bold text-slate-500 dark:text-white/40">
            {lines.length > 0 && (
              <span>
                <span className="text-slate-900 dark:text-white font-black">{lines.length}</span> productos · <span className="text-slate-900 dark:text-white font-black">{totalItems}</span> unidades
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              onClick={handleTransfer}
              disabled={saving || lines.length === 0 || activos.length < 2 || !destino}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {saving ? 'Transfiriendo...' : 'Ejecutar transferencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
