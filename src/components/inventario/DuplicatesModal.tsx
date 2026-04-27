// DuplicatesModal — detección y fusión segura de productos duplicados.
//
// Flujo:
//   1. Usuario abre el modal → escanea el catálogo → muestra grupos.
//   2. Por cada grupo: usuario marca cuál es el "canonical" (el que se queda).
//   3. Click en "Fusionar" → confirmación → transacción Firestore:
//      - Canonical recibe la suma de stocks
//      - Canonical recibe la suma de stockByAlmacen
//      - Duplicados se ARCHIVAN (archived=true, mergedInto=canonicalId)
//      - Histórico de movimientos NO se toca (queda apuntando a su id)
//   4. El usuario puede deshacer porque los archivados son visibles
//      desde "Productos archivados" (campo `archived: true`).
//
// Seguridad:
//   - Antes de aplicar, muestra preview con totales finales.
//   - Si solo hay 1 producto seleccionado en el grupo, deshabilita "Fusionar".
//   - Si fallan algunas writes, las exitosas no se revierten — pero
//     marcamos cada operación con timestamp y mergedAt para poder
//     auditar y revertir manualmente.

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, query, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  X, Search, AlertTriangle, CheckCircle2, Merge, Archive,
  Package, Barcode, Loader2, Sparkles, ChevronRight, ChevronDown,
  Shield,
} from 'lucide-react';
import {
  findDuplicates, previewMerge,
  type DuplicateGroup, type DuplicateProduct,
} from '../../utils/duplicateDetection';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DuplicatesModal({ open, onClose }: Props) {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [products, setProducts] = useState<DuplicateProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null); // group key in progress
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  // Carga el catálogo al abrir.
  useEffect(() => {
    if (!open || !businessId) return;
    setLoading(true);
    setError('');
    (async () => {
      try {
        // Solo activos (no archivados)
        const q = query(
          collection(db, `businesses/${businessId}/products`),
          where('archived', '!=', true),
        );
        const snap = await getDocs(q);
        const arr: DuplicateProduct[] = [];
        snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
        setProducts(arr);
      } catch (e: any) {
        // Si el query con != falla (índices), caemos a load full + filter en memoria
        try {
          const snap = await getDocs(collection(db, `businesses/${businessId}/products`));
          const arr: DuplicateProduct[] = [];
          snap.forEach(d => {
            const data = d.data() as any;
            if (!data.archived) arr.push({ id: d.id, ...data });
          });
          setProducts(arr);
        } catch (err: any) {
          setError(err?.message || 'No se pudo cargar el catálogo');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, businessId]);

  const groups = useMemo(() => findDuplicates(products), [products]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g =>
      g.items.some(it =>
        (it.nombre || '').toLowerCase().includes(q)
        || (it.barcode || '').toLowerCase().includes(q)
        || (it.codigo || '').toLowerCase().includes(q)
      )
    );
  }, [groups, search]);

  // Auto-seleccionar canonical: el de mayor stock (más confiable como "real")
  useEffect(() => {
    setCanonicalByGroup(prev => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.key]) continue;
        const best = [...g.items].sort((a, b) =>
          Number(b.stock || 0) - Number(a.stock || 0)
        )[0];
        if (best) next[g.key] = best.id;
      }
      return next;
    });
  }, [groups]);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleMerge = async (group: DuplicateGroup) => {
    if (!businessId) return;
    const canonicalId = canonicalByGroup[group.key];
    if (!canonicalId) return;
    const preview = previewMerge(group, canonicalId);
    const ok = window.confirm(
      `¿Confirmas fusionar ${group.items.length} productos en uno solo?\n\n`
      + `Canonical: "${preview.canonicalName}"\n`
      + `Stock final: ${preview.totalStock} unidades (suma de todos)\n`
      + `Productos a archivar: ${preview.toArchiveIds.length}\n\n`
      + `Los movimientos históricos NO se modifican (las facturas viejas siguen funcionando). `
      + `Los duplicados quedan archivados — se pueden recuperar después si te equivocas.`
    );
    if (!ok) return;

    setMerging(group.key);
    setError('');
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      // 1) Update canonical: stock + stockByAlmacen sumados
      const canonicalRef = doc(db, `businesses/${businessId}/products`, canonicalId);
      batch.update(canonicalRef, {
        stock: preview.totalStock,
        stockByAlmacen: preview.combinedStockByAlmacen,
        updatedAt: nowIso,
      });

      // 2) Archivar los duplicados
      for (const id of preview.toArchiveIds) {
        const ref = doc(db, `businesses/${businessId}/products`, id);
        batch.update(ref, {
          archived: true,
          mergedInto: canonicalId,
          mergedAt: nowIso,
          // Conservamos el stock antiguo en un campo aparte por si hay que revertir
          stockBeforeMerge: group.items.find(p => p.id === id)?.stock || 0,
          updatedAt: nowIso,
        });
      }

      await batch.commit();

      // Actualizar UI: marcar grupo como done y remover items del state
      setDone(prev => ({ ...prev, [group.key]: true }));
      setProducts(prev => prev.filter(p => !preview.toArchiveIds.includes(p.id)).map(p =>
        p.id === canonicalId
          ? { ...p, stock: preview.totalStock, stockByAlmacen: preview.combinedStockByAlmacen }
          : p
      ));
    } catch (e: any) {
      console.error('[DuplicatesModal] merge error', e);
      setError(`Error al fusionar: ${e?.message || 'desconocido'}. Algunos cambios pueden haberse aplicado.`);
    } finally {
      setMerging(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md">
              <Merge size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Detección de duplicados</h2>
              <p className="text-[12px] text-slate-500 dark:text-white/50">
                {loading
                  ? 'Escaneando catálogo…'
                  : groups.length === 0
                    ? '¡Sin duplicados detectados! Tu catálogo está limpio 🎉'
                    : `${groups.length} grupo${groups.length !== 1 ? 's' : ''} de duplicados encontrado${groups.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 hover:text-slate-700 dark:text-white/50 flex items-center justify-center transition-all"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Aviso seguridad */}
        <div className="shrink-0 mx-6 mt-4 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-start gap-2.5">
          <Shield size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
            <strong className="font-bold">Fusión segura.</strong> Los duplicados se archivan, no se eliminan. Tus facturas y movimientos históricos siguen intactos. Si te equivocas, puedes recuperar el producto desde "Productos archivados".
          </div>
        </div>

        {/* Búsqueda */}
        {!loading && groups.length > 0 && (
          <div className="shrink-0 px-6 mt-3 mb-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar grupos por nombre o código…"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-white/50">Analizando {products.length || '…'} productos del catálogo</p>
            </div>
          ) : error ? (
            <div className="py-12 px-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-center">
              <AlertTriangle size={28} className="mx-auto text-rose-500 mb-2" />
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">¡Catálogo limpio!</h3>
              <p className="text-sm text-slate-500 dark:text-white/50 max-w-sm mx-auto">
                No detectamos productos duplicados. Si sospechas que alguno se nos pasó, verifica que tengan el mismo barcode o nombre muy similar.
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-white/40">
              Ningún grupo coincide con "{search}".
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map(group => {
                const isExpanded = expandedKeys.has(group.key);
                const canonical = canonicalByGroup[group.key];
                const isDone = done[group.key];
                const isMerging = merging === group.key;
                const preview = canonical ? previewMerge(group, canonical) : null;

                return (
                  <div
                    key={group.key}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      isDone
                        ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.04]'
                        : 'border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]'
                    }`}
                  >
                    {/* Header del grupo */}
                    <button
                      onClick={() => toggleExpand(group.key)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        group.confidence === 'high'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {group.reason === 'EXACT_BARCODE' ? <Barcode size={15} /> : <Package size={15} />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            group.confidence === 'high'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          }`}>
                            {group.reason === 'EXACT_BARCODE' ? 'Mismo barcode' : 'Nombre similar'}
                          </span>
                          {group.reason === 'EXACT_BARCODE' && (
                            <span className="text-[11px] font-mono text-slate-500 dark:text-white/40">{group.key}</span>
                          )}
                          {isDone && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> Fusionado
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5 truncate">
                          {group.items.length} productos: {group.items.map(it => it.nombre).slice(0, 3).join(' · ')}
                          {group.items.length > 3 && ` …`}
                        </p>
                      </div>
                      {isExpanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                    </button>

                    {/* Detalle expandido */}
                    {isExpanded && !isDone && (
                      <div className="border-t border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.01] p-3">
                        <p className="text-[12px] font-semibold text-slate-700 dark:text-white/70 mb-2">
                          Elige cuál se queda como producto principal — los demás se archivan y su stock se suma.
                        </p>
                        <div className="space-y-1.5">
                          {group.items.map(it => {
                            const isCanonical = canonical === it.id;
                            return (
                              <label
                                key={it.id}
                                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                  isCanonical
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40'
                                    : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.12]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`canonical_${group.key}`}
                                  checked={isCanonical}
                                  onChange={() => setCanonicalByGroup(prev => ({ ...prev, [group.key]: it.id }))}
                                  className="accent-indigo-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{it.nombre}</p>
                                    {isCanonical && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500 text-white">
                                        Se queda
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 dark:text-white/40">
                                    {(it.barcode || it.codigo) && (
                                      <span className="font-mono">{it.barcode || it.codigo}</span>
                                    )}
                                    <span className="tabular-nums">Stock: <strong className="text-slate-700 dark:text-white/70">{it.stock || 0}</strong></span>
                                    {it.costoUSD != null && it.costoUSD > 0 && (
                                      <span className="tabular-nums">Costo: ${Number(it.costoUSD).toFixed(2)}</span>
                                    )}
                                    {it.precioDetal != null && it.precioDetal > 0 && (
                                      <span className="tabular-nums">Detal: ${Number(it.precioDetal).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Preview totales */}
                        {preview && (
                          <div className="mt-3 px-3 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30">
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles size={12} className="text-indigo-500" />
                              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Resultado de la fusión</p>
                            </div>
                            <p className="text-[12px] text-slate-700 dark:text-white/70 leading-relaxed">
                              "<strong>{preview.canonicalName}</strong>" tendrá <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{preview.totalStock} unidades</strong> (suma).
                              Los otros <strong>{preview.toArchiveIds.length}</strong> producto{preview.toArchiveIds.length !== 1 ? 's' : ''} pasan a archivados.
                            </p>
                          </div>
                        )}

                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handleMerge(group)}
                            disabled={isMerging || !canonical}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                          >
                            {isMerging ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Fusionando…
                              </>
                            ) : (
                              <>
                                <Merge size={12} />
                                Fusionar {group.items.length} productos
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {isDone && (
                      <div className="border-t border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/[0.03] px-4 py-2.5 flex items-center gap-2 text-[12px] text-emerald-800 dark:text-emerald-300">
                        <Archive size={12} />
                        Fusión completada — {group.items.length - 1} duplicado{group.items.length - 1 !== 1 ? 's' : ''} archivado{group.items.length - 1 !== 1 ? 's' : ''}.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-3 bg-slate-50 dark:bg-white/[0.01]">
          <p className="text-[11px] text-slate-500 dark:text-white/40">
            {Object.keys(done).length > 0 && (
              <>
                <strong className="text-emerald-600 dark:text-emerald-400">{Object.keys(done).length}</strong> fusion{Object.keys(done).length !== 1 ? 'es' : ''} aplicada{Object.keys(done).length !== 1 ? 's' : ''}.
              </>
            )}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/[0.06] hover:bg-slate-300 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white/80 text-xs font-bold uppercase tracking-wider transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
