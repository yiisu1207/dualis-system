import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, X, Save, Loader2, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { collection, addDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

/**
 * Physical inventory count (Fase 9.3).
 * Lets the operator capture real-world counts per product, compare to expected
 * system stock, and apply adjustments in a single atomic batch.
 *
 * Storage:
 *   - businesses/{bid}/inventory_counts/{id} — session history with diffs
 *   - products — stock (and stockByAlmacen[almacenId]) overwritten to counted qty
 *
 * Design:
 *   - No destructive writes until "Aplicar Ajustes" is clicked
 *   - Preserves dual stock model: if product has stockByAlmacen, adjusts only the
 *     selected almacén; otherwise falls back to legacy `stock` field.
 *   - Skips products that were never counted (preserves existing stock).
 */

interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  categoria?: string;
  stock: number;
  stockByAlmacen?: Record<string, number>;
  costoUSD?: number;
  unitType?: string;
}

interface Almacen {
  id: string;
  nombre: string;
  activo?: boolean;
  isPrimary?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  businessId: string;
  operatorName: string;
  products: Product[];
  almacenes: Almacen[];
  categorias: string[];
  onDone?: () => void;
}

type CountRow = {
  productId: string;
  counted: number | null; // null = not yet counted
};

const getExpected = (p: Product, almacenId: string): number => {
  if (almacenId === 'all') return Number(p.stock || 0);
  const map = p.stockByAlmacen || {};
  if (Object.prototype.hasOwnProperty.call(map, almacenId)) {
    return Number(map[almacenId] || 0);
  }
  // Legacy fallback: products without stockByAlmacen map are assumed to live in 'principal'
  if (almacenId === 'principal') return Number(p.stock || 0);
  return 0;
};

export default function PhysicalCountModal({
  open,
  onClose,
  businessId,
  operatorName,
  products,
  almacenes,
  categorias,
  onDone,
}: Props) {
  const activeAlmacenes = useMemo(
    () => almacenes.filter(a => a.activo !== false),
    [almacenes],
  );
  const defaultAlmacen = activeAlmacenes[0]?.id || 'all';

  const [almacenId, setAlmacenId] = useState<string>(defaultAlmacen);
  const [categoria, setCategoria] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const [rows, setRows] = useState<Record<string, CountRow>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setAlmacenId(defaultAlmacen);
      setCategoria('all');
      setSearchQ('');
      setRows({});
      setNote('');
      setSaving(false);
      setShowConfirm(false);
      setError('');
    }
  }, [open, defaultAlmacen]);

  // Products filtered by almacén + categoría + query
  const filteredProducts = useMemo(() => {
    const term = searchQ.trim().toLowerCase();
    return products.filter(p => {
      if (categoria !== 'all' && p.categoria !== categoria) return false;
      if (almacenId !== 'all') {
        // Include products present in this almacén OR legacy products when counting 'principal'
        const map = p.stockByAlmacen || {};
        const present = Object.prototype.hasOwnProperty.call(map, almacenId);
        if (!present && !(almacenId === 'principal')) return false;
      }
      if (term) {
        const hay = `${p.nombre || ''} ${p.codigo || ''} ${p.categoria || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [products, categoria, almacenId, searchQ]);

  // Diffs and stats
  const stats = useMemo(() => {
    let counted = 0;
    let matches = 0;
    let surplus = 0;
    let shortage = 0;
    let deltaUsd = 0;
    for (const p of filteredProducts) {
      const row = rows[p.id];
      if (!row || row.counted === null || row.counted === undefined) continue;
      counted += 1;
      const expected = getExpected(p, almacenId);
      const diff = (row.counted as number) - expected;
      if (diff === 0) matches += 1;
      else if (diff > 0) surplus += diff;
      else shortage += -diff;
      deltaUsd += diff * Number(p.costoUSD || 0);
    }
    return { counted, matches, surplus, shortage, deltaUsd, totalProducts: filteredProducts.length };
  }, [rows, filteredProducts, almacenId]);

  const setCounted = (productId: string, value: number | null) => {
    setRows(prev => ({
      ...prev,
      [productId]: { productId, counted: value },
    }));
  };

  const applyAdjustments = async () => {
    setSaving(true);
    setError('');
    try {
      // Build list of adjustments (only products that were actually counted)
      const adjustments: Array<{
        productId: string;
        name: string;
        expected: number;
        counted: number;
        diff: number;
        costoUSD: number;
        almacen: string;
      }> = [];
      for (const p of filteredProducts) {
        const row = rows[p.id];
        if (!row || row.counted === null || row.counted === undefined) continue;
        const expected = getExpected(p, almacenId);
        const counted = Number(row.counted);
        if (counted === expected) continue; // skip no-op
        adjustments.push({
          productId: p.id,
          name: p.nombre,
          expected,
          counted,
          diff: counted - expected,
          costoUSD: Number(p.costoUSD || 0),
          almacen: almacenId,
        });
      }

      if (adjustments.length === 0) {
        setError('No hay diferencias que aplicar');
        setSaving(false);
        return;
      }

      // Atomic batch: update products + create count session
      const batch = writeBatch(db);
      for (const adj of adjustments) {
        const ref = doc(db, `businesses/${businessId}/products`, adj.productId);
        const prod = products.find(p => p.id === adj.productId);
        if (!prod) continue;
        const hasMap = prod.stockByAlmacen && Object.keys(prod.stockByAlmacen).length > 0;
        if (almacenId === 'all' || !hasMap) {
          // Update legacy stock (single-warehouse or counting whole inventory)
          batch.update(ref, { stock: adj.counted });
        } else {
          // Update only the targeted almacén + recompute total
          const map = { ...(prod.stockByAlmacen || {}) };
          map[almacenId] = adj.counted;
          const total = Object.values(map).reduce((s, v) => s + Number(v || 0), 0);
          batch.update(ref, { stockByAlmacen: map, stock: total });
        }
      }
      await batch.commit();

      // Persist session history (separate write, non-atomic with products is fine)
      await addDoc(collection(db, `businesses/${businessId}/inventory_counts`), {
        operatorName,
        almacenId,
        categoria,
        note: note.trim(),
        adjustments,
        totals: {
          countedProducts: adjustments.length,
          surplus: stats.surplus,
          shortage: stats.shortage,
          deltaUsd: stats.deltaUsd,
        },
        createdAt: new Date().toISOString(),
        createdAtServer: serverTimestamp(),
      });

      onDone?.();
      onClose();
    } catch (err) {
      console.error('[PhysicalCount] error:', err);
      setError('Error al aplicar ajustes. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const countedCount = (Object.values(rows) as CountRow[]).filter(r => r.counted !== null && r.counted !== undefined).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[94vh] bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <ClipboardCheck size={18} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Conteo Físico de Inventario</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest mt-0.5">
                {countedCount} contados · {filteredProducts.length} en lista
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Almacén</label>
            <select
              value={almacenId}
              onChange={e => setAlmacenId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {activeAlmacenes.length > 0
                ? activeAlmacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)
                : <option value="principal">Principal</option>
              }
              <option value="all">Todo el inventario</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Categoría</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Código, nombre o categoría..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-white/25"
              />
            </div>
          </div>
        </div>

        {/* Stats summary */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-white/[0.07] grid grid-cols-2 md:grid-cols-5 gap-2 shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2">
            <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase">Contados</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">{stats.counted}/{stats.totalProducts}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-[9px] font-bold text-emerald-400/70 uppercase">Coinciden</p>
            <p className="text-sm font-black text-emerald-400">{stats.matches}</p>
          </div>
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
            <p className="text-[9px] font-bold text-sky-400/70 uppercase">Sobrante</p>
            <p className="text-sm font-black text-sky-400">+{stats.surplus}</p>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
            <p className="text-[9px] font-bold text-rose-400/70 uppercase">Faltante</p>
            <p className="text-sm font-black text-rose-400">-{stats.shortage}</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 ${stats.deltaUsd < 0 ? 'border-rose-500/20 bg-rose-500/5' : 'border-indigo-500/20 bg-indigo-500/5'}`}>
            <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-white/30">Δ Costo</p>
            <p className={`text-sm font-black ${stats.deltaUsd < 0 ? 'text-rose-400' : 'text-indigo-400'}`}>
              {stats.deltaUsd >= 0 ? '+' : ''}${stats.deltaUsd.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400 dark:text-white/30">
              Sin productos que mostrar
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {filteredProducts.map(p => {
                const expected = getExpected(p, almacenId);
                const row = rows[p.id];
                const counted = row?.counted;
                const hasCount = counted !== null && counted !== undefined;
                const diff = hasCount ? (counted as number) - expected : 0;
                return (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-center px-6 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <div className="col-span-12 sm:col-span-5">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">{p.nombre}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 truncate">
                        {p.codigo && <span className="mr-2">{p.codigo}</span>}
                        {p.categoria && <span className="mr-2">{p.categoria}</span>}
                      </p>
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right">
                      <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase">Sistema</p>
                      <p className="text-sm font-black text-slate-700 dark:text-white/70 tabular-nums">{expected}</p>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={counted === null || counted === undefined ? '' : counted}
                        onChange={e => {
                          const v = e.target.value;
                          setCounted(p.id, v === '' ? null : Math.max(0, Number(v)));
                        }}
                        placeholder="—"
                        className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.08] border border-slate-200 dark:border-white/[0.1] rounded-lg text-sm font-black text-center text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3 text-right">
                      {hasCount ? (
                        diff === 0 ? (
                          <div className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 size={12} />
                            <span className="text-[10px] font-black uppercase">OK</span>
                          </div>
                        ) : (
                          <span className={`text-xs font-black tabular-nums ${diff > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                            {diff > 0 ? '+' : ''}{diff}
                            <span className="text-[9px] font-bold ml-1 opacity-70">
                              (${(diff * Number(p.costoUSD || 0)).toFixed(2)})
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 dark:text-white/20">sin contar</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] shrink-0 space-y-3">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle size={14} className="text-rose-400 shrink-0" />
              <p className="text-xs font-bold text-rose-400">{error}</p>
            </div>
          )}
          {!showConfirm ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Nota del conteo (opcional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Ej: Conteo mensual de fin de mes"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-white/25"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/[0.08] text-xs font-black text-slate-500 dark:text-white/40 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={stats.counted === 0 || (stats.matches === stats.counted && stats.counted > 0)}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 shadow-lg shadow-indigo-500/25 flex items-center gap-2"
                >
                  <Save size={14} /> Revisar y aplicar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-xs font-black uppercase tracking-widest text-amber-400">Confirmar ajuste</p>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-white/60">
                Se ajustará el stock de <b>{stats.counted - stats.matches}</b> producto(s) en el almacén seleccionado.
                Los productos sin contar no serán modificados. Esta acción se registra en el historial de conteos.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.1] text-[10px] font-black text-slate-500 dark:text-white/40 uppercase tracking-widest"
                >
                  Revisar más
                </button>
                <button
                  onClick={applyAdjustments}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 flex items-center gap-2"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Confirmar y aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
