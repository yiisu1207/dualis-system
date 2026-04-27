// DuplicatesModal — detección y fusión segura de productos duplicados.
//
// Features:
//   - Detección automática (barcode exacto + nombre fuzzy)
//   - Histórico de ventas por producto (lazy load al expandir el grupo)
//   - Selección del canonical con auto-sugerencia (mayor stock + más histórico)
//   - Stock final EDITABLE (override de la suma automática)
//   - Renombrar el canonical inline (1-click para usar el nombre del duplicado)
//   - Heredar campos faltantes (foto, categoría, marca, descripción) del duplicado
//   - Editar barcode in-place (cuando son productos distintos con mismo barcode)
//   - "Ignorar este grupo" (NO son duplicados, ej: 1L vs 2L)
//   - Nota de auditoría opcional al fusionar
//
// Seguridad de la fusión:
//   - Los duplicados se ARCHIVAN (archived=true, mergedInto=canonicalId,
//     stockBeforeMerge, mergedAt, mergeNote). Nunca se eliminan.
//   - Movimientos históricos NO se modifican: las facturas viejas siguen
//     apuntando a sus IDs originales y siguen funcionando.
//   - Reversible: el dueño puede des-archivar manualmente si se equivoca.

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, query, where, writeBatch, setDoc, deleteDoc, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  X, Search, AlertTriangle, CheckCircle2, Merge, Archive,
  Package, Barcode, Loader2, Sparkles, ChevronRight, ChevronDown,
  Shield, EyeOff, Edit3, ImageIcon, Tag, BarChart3, RotateCcw,
} from 'lucide-react';
import {
  findDuplicates, previewMerge,
  type DuplicateGroup, type DuplicateProduct,
} from '../../utils/duplicateDetection';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ProductSalesStats {
  count: number;
  lastSaleAt: string | null;
}

interface InheritFlags {
  imagen?: boolean;
  categoria?: boolean;
  marca?: boolean;
  descripcion?: boolean;
}

interface GroupOverrides {
  /** Stock final manual (override de la suma automática). null = usar suma. */
  stockOverride: number | null;
  /** Nuevo nombre para el canonical (si no es null, se renombra al fusionar). */
  newName: string | null;
  /** Nota opcional que se guarda en cada archivado como mergeNote. */
  note: string;
  /** Campos del duplicado a copiar al canonical si éste los tiene vacíos. */
  inherit: InheritFlags;
  /** Edits a barcodes de productos individuales (productId → nuevo barcode). */
  barcodeEdits: Record<string, string>;
}

const emptyOverrides = (): GroupOverrides => ({
  stockOverride: null,
  newName: null,
  note: '',
  inherit: {},
  barcodeEdits: {},
});

export default function DuplicatesModal({ open, onClose }: Props) {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [products, setProducts] = useState<DuplicateProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, string>>({});
  const [overridesByGroup, setOverridesByGroup] = useState<Record<string, GroupOverrides>>({});
  const [salesStats, setSalesStats] = useState<Record<string, ProductSalesStats>>({});
  const [statsLoading, setStatsLoading] = useState<Record<string, boolean>>({});
  const [merging, setMerging] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);

  // Carga el catálogo + lista de grupos ignorados.
  // IMPORTANTE: cargamos TODO y filtramos en memoria. NO usamos
  // where('archived', '!=', true) porque Firestore excluye documentos
  // donde el campo `archived` no existe.
  useEffect(() => {
    if (!open || !businessId) return;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const snap = await getDocs(collection(db, `businesses/${businessId}/products`));
        const arr: DuplicateProduct[] = [];
        snap.forEach(d => {
          const data = d.data() as any;
          if (data.archived === true) return;
          arr.push({ id: d.id, ...data });
        });
        setProducts(arr);
      } catch (err: any) {
        console.error('[DuplicatesModal] load products error', err);
        setError(err?.message || 'No se pudo cargar el catálogo');
      } finally {
        setLoading(false);
      }
    })();

    // Suscripción a grupos ignorados (para que cualquier usuario los vea).
    const unsubIgnored = onSnapshot(
      collection(db, `businesses/${businessId}/duplicatesIgnored`),
      (snap) => {
        const ks = new Set<string>();
        snap.forEach(d => ks.add(d.id));
        setIgnoredKeys(ks);
      },
      (err) => {
        // Silencioso — la colección puede no existir aún
        console.warn('[DuplicatesModal] ignored watch warn', err);
      }
    );
    return () => unsubIgnored();
  }, [open, businessId]);

  const allGroups = useMemo(() => findDuplicates(products), [products]);

  // Separamos grupos visibles vs ignorados según el toggle.
  const groups = useMemo(() => {
    if (showIgnored) return allGroups.filter(g => ignoredKeys.has(g.key));
    return allGroups.filter(g => !ignoredKeys.has(g.key));
  }, [allGroups, ignoredKeys, showIgnored]);

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

  // Auto-seleccionar canonical: el de mayor stock (sugerencia inicial).
  // El usuario puede cambiarlo. Cuando carguen las stats, podemos refinar
  // para sugerir el de mayor histórico de ventas.
  useEffect(() => {
    setCanonicalByGroup(prev => {
      const next = { ...prev };
      for (const g of allGroups) {
        if (next[g.key]) continue;
        const best = [...g.items].sort((a, b) =>
          Number(b.stock || 0) - Number(a.stock || 0)
        )[0];
        if (best) next[g.key] = best.id;
      }
      return next;
    });
  }, [allGroups]);

  const ensureOverrides = (key: string): GroupOverrides => {
    return overridesByGroup[key] || emptyOverrides();
  };

  const updateOverrides = (key: string, patch: Partial<GroupOverrides>) => {
    setOverridesByGroup(prev => ({
      ...prev,
      [key]: { ...ensureOverrides(key), ...patch },
    }));
  };

  const toggleExpand = async (key: string, group: DuplicateGroup) => {
    const next = new Set(expandedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      // Lazy load stats de ventas para los productos del grupo
      loadSalesStats(group);
    }
    setExpandedKeys(next);
  };

  /** Cuenta cuántas ventas históricas tiene cada producto del grupo + última fecha.
   *  Lee `inventoryMovements` filtrado por productId con tipo VENTA. Best-effort. */
  const loadSalesStats = async (group: DuplicateGroup) => {
    if (!businessId) return;
    const pending = group.items.filter(it => salesStats[it.id] === undefined && !statsLoading[it.id]);
    if (pending.length === 0) return;
    setStatsLoading(prev => {
      const next = { ...prev };
      pending.forEach(it => { next[it.id] = true; });
      return next;
    });
    try {
      const results: Record<string, ProductSalesStats> = {};
      await Promise.all(pending.map(async (it) => {
        try {
          const q1 = query(
            collection(db, `businesses/${businessId}/inventoryMovements`),
            where('productId', '==', it.id),
          );
          const snap = await getDocs(q1);
          let count = 0;
          let lastSaleAt: string | null = null;
          snap.forEach(d => {
            const data = d.data() as any;
            if (data.type === 'VENTA') {
              count++;
              const ca = data.createdAt;
              const iso = typeof ca === 'string' ? ca : (ca?.toDate?.()?.toISOString?.() ?? null);
              if (iso && (!lastSaleAt || iso > lastSaleAt)) lastSaleAt = iso;
            }
          });
          results[it.id] = { count, lastSaleAt };
        } catch (e) {
          results[it.id] = { count: 0, lastSaleAt: null };
        }
      }));
      setSalesStats(prev => ({ ...prev, ...results }));
    } finally {
      setStatsLoading(prev => {
        const next = { ...prev };
        pending.forEach(it => { delete next[it.id]; });
        return next;
      });
    }
  };

  /** Guardar barcode editado de un producto (escribe a Firestore inmediato). */
  const handleSaveBarcode = async (productId: string, newBarcode: string) => {
    if (!businessId) return;
    try {
      await setDoc(
        doc(db, `businesses/${businessId}/products`, productId),
        { barcode: newBarcode, codigo: newBarcode, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      // Actualizar el state local para que el grupo se recalcule
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, barcode: newBarcode, codigo: newBarcode } : p));
    } catch (e: any) {
      console.error('[DuplicatesModal] save barcode error', e);
      alert(`No se pudo guardar el barcode: ${e?.message || 'error'}`);
    }
  };

  /** Marcar un grupo como ignorado (no son duplicados reales). */
  const handleIgnoreGroup = async (group: DuplicateGroup) => {
    if (!businessId) return;
    const reason = prompt(
      'Razón para ignorar este grupo (opcional):\n\n'
      + 'Por ejemplo: "Coca Cola 1L y 2L son tamaños diferentes" o "Son productos distintos".'
    );
    if (reason === null) return; // canceló
    try {
      await setDoc(doc(db, `businesses/${businessId}/duplicatesIgnored`, group.key), {
        key: group.key,
        reason: group.reason,
        ignoredReason: reason || '',
        productIds: group.items.map(i => i.id),
        productNames: group.items.map(i => i.nombre),
        ignoredAt: new Date().toISOString(),
        ignoredBy: userProfile?.uid || 'sistema',
      });
    } catch (e: any) {
      console.error('[DuplicatesModal] ignore error', e);
      alert(`No se pudo marcar como ignorado: ${e?.message || 'error'}`);
    }
  };

  /** Quitar de la lista de ignorados. */
  const handleUnignoreGroup = async (groupKey: string) => {
    if (!businessId) return;
    try {
      await deleteDoc(doc(db, `businesses/${businessId}/duplicatesIgnored`, groupKey));
    } catch (e: any) {
      console.error('[DuplicatesModal] unignore error', e);
    }
  };

  const handleMerge = async (group: DuplicateGroup) => {
    if (!businessId) return;
    const canonicalId = canonicalByGroup[group.key];
    if (!canonicalId) return;
    const overrides = ensureOverrides(group.key);
    const previewBase = previewMerge(group, canonicalId);
    const finalStock = overrides.stockOverride != null ? overrides.stockOverride : previewBase.totalStock;
    const finalName = overrides.newName ?? previewBase.canonicalName;

    const ok = window.confirm(
      `¿Confirmas fusionar ${group.items.length} productos en uno solo?\n\n`
      + `Producto principal: "${finalName}"\n`
      + `Stock final: ${finalStock} unidades${overrides.stockOverride != null ? ' (manual)' : ' (suma)'}\n`
      + `Productos a archivar: ${previewBase.toArchiveIds.length}\n\n`
      + `Los movimientos históricos NO se modifican (las facturas viejas siguen funcionando). `
      + `Los duplicados quedan archivados — se pueden recuperar después si te equivocas.`
    );
    if (!ok) return;

    setMerging(group.key);
    setError('');
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      const canonical = group.items.find(p => p.id === canonicalId)!;
      const otherItems = group.items.filter(p => p.id !== canonicalId);

      // Ajustar stockByAlmacen al stock final si hay override.
      // Estrategia: si el override es != suma, escalamos proporcionalmente.
      // Si el override == 0, vaciamos stockByAlmacen.
      let finalStockByAlmacen = previewBase.combinedStockByAlmacen;
      if (overrides.stockOverride != null) {
        const sumAlm = Object.values(previewBase.combinedStockByAlmacen).reduce((s, v) => s + v, 0);
        if (sumAlm > 0 && finalStock !== previewBase.totalStock) {
          const factor = finalStock / sumAlm;
          finalStockByAlmacen = Object.fromEntries(
            Object.entries(previewBase.combinedStockByAlmacen).map(([k, v]) => [k, Math.round(v * factor)])
          );
        } else if (finalStock === 0) {
          finalStockByAlmacen = Object.fromEntries(
            Object.keys(previewBase.combinedStockByAlmacen).map(k => [k, 0])
          );
        }
      }

      // 1) Construir update del canonical
      const canonicalUpdate: any = {
        stock: finalStock,
        stockByAlmacen: finalStockByAlmacen,
        updatedAt: nowIso,
      };
      if (overrides.newName && overrides.newName.trim() && overrides.newName.trim() !== canonical.nombre) {
        canonicalUpdate.nombre = overrides.newName.trim();
      }
      // Heredar campos faltantes del PRIMER duplicado que los tenga, según flags
      if (overrides.inherit.imagen && !canonical.imagen && !canonical.imageUrl) {
        const src = otherItems.find(p => p.imagen || p.imageUrl);
        if (src) {
          if (src.imagen) canonicalUpdate.imagen = src.imagen;
          if (src.imageUrl) canonicalUpdate.imageUrl = src.imageUrl;
        }
      }
      if (overrides.inherit.categoria && !canonical.categoria) {
        const src = otherItems.find(p => p.categoria);
        if (src) canonicalUpdate.categoria = src.categoria;
      }
      if (overrides.inherit.marca && !canonical.marca) {
        const src = otherItems.find(p => p.marca);
        if (src) canonicalUpdate.marca = src.marca;
      }
      if (overrides.inherit.descripcion && !canonical.descripcion) {
        const src = otherItems.find(p => p.descripcion);
        if (src) canonicalUpdate.descripcion = src.descripcion;
      }

      const canonicalRef = doc(db, `businesses/${businessId}/products`, canonicalId);
      batch.update(canonicalRef, canonicalUpdate);

      // 2) Archivar los duplicados con metadata para auditoría/reversión
      for (const it of otherItems) {
        const ref = doc(db, `businesses/${businessId}/products`, it.id);
        batch.update(ref, {
          archived: true,
          mergedInto: canonicalId,
          mergedAt: nowIso,
          mergedBy: userProfile?.uid || 'sistema',
          mergeNote: overrides.note || null,
          stockBeforeMerge: it.stock || 0,
          updatedAt: nowIso,
        });
      }

      await batch.commit();

      setDone(prev => ({ ...prev, [group.key]: true }));
      setProducts(prev => prev
        .filter(p => !otherItems.find(o => o.id === p.id))
        .map(p =>
          p.id === canonicalId ? { ...p, ...canonicalUpdate } : p
        )
      );
    } catch (e: any) {
      console.error('[DuplicatesModal] merge error', e);
      setError(`Error al fusionar: ${e?.message || 'desconocido'}. Algunos cambios pueden haberse aplicado.`);
    } finally {
      setMerging(null);
    }
  };

  if (!open) return null;

  const ignoredCount = ignoredKeys.size;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col"
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
                  : showIgnored
                    ? `${groups.length} grupo${groups.length !== 1 ? 's' : ''} ignorado${groups.length !== 1 ? 's' : ''}`
                    : groups.length === 0
                      ? '¡Sin duplicados detectados!'
                      : `${groups.length} grupo${groups.length !== 1 ? 's' : ''} encontrado${groups.length !== 1 ? 's' : ''}`}
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

        {/* Toolbar: búsqueda + toggle ignorados */}
        {!loading && (
          <div className="shrink-0 px-6 mt-3 mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar por nombre o código…"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-400"
              />
            </div>
            {ignoredCount > 0 && (
              <button
                onClick={() => setShowIgnored(s => !s)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  showIgnored
                    ? 'bg-slate-200 dark:bg-white/[0.08] border-slate-300 dark:border-white/[0.12] text-slate-700 dark:text-white'
                    : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-500 hover:text-slate-700'
                }`}
                title="Mostrar/ocultar grupos marcados como 'no son duplicados'"
              >
                <EyeOff size={12} />
                {showIgnored ? 'Ver duplicados activos' : `Ver ignorados (${ignoredCount})`}
              </button>
            )}
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
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                {showIgnored ? 'No tienes grupos ignorados' : '¡Catálogo limpio!'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-white/50 max-w-sm mx-auto">
                {showIgnored
                  ? 'Cuando marques grupos como "no son duplicados", aparecerán aquí.'
                  : 'No detectamos productos duplicados. Si sospechas que alguno se nos pasó, verifica que tengan el mismo barcode o nombre muy similar.'}
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
                const canonicalId = canonicalByGroup[group.key];
                const isDone = done[group.key];
                const isMerging = merging === group.key;
                const overrides = ensureOverrides(group.key);
                const isIgnored = ignoredKeys.has(group.key);
                const previewBase = canonicalId ? previewMerge(group, canonicalId) : null;
                const canonical = group.items.find(p => p.id === canonicalId);
                const otherItems = group.items.filter(p => p.id !== canonicalId);
                const finalStock = overrides.stockOverride != null
                  ? overrides.stockOverride
                  : (previewBase?.totalStock || 0);

                // Determinar qué campos podrían heredarse del duplicado
                const inheritOptions: Array<{ key: keyof InheritFlags; label: string; icon: React.ReactNode; available: boolean }> = canonical ? [
                  {
                    key: 'imagen',
                    label: 'Foto',
                    icon: <ImageIcon size={11} />,
                    available: !canonical.imagen && !canonical.imageUrl && otherItems.some(p => p.imagen || p.imageUrl),
                  },
                  {
                    key: 'categoria',
                    label: 'Categoría',
                    icon: <Tag size={11} />,
                    available: !canonical.categoria && otherItems.some(p => p.categoria),
                  },
                  {
                    key: 'marca',
                    label: 'Marca',
                    icon: <Tag size={11} />,
                    available: !canonical.marca && otherItems.some(p => p.marca),
                  },
                  {
                    key: 'descripcion',
                    label: 'Descripción',
                    icon: <Edit3 size={11} />,
                    available: !canonical.descripcion && otherItems.some(p => p.descripcion),
                  },
                ] : [];

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
                      onClick={() => toggleExpand(group.key, group)}
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
                          {isIgnored && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-400 inline-flex items-center gap-1">
                              <EyeOff size={10} /> Ignorado
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
                      <div className="border-t border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.01] p-3 space-y-3">
                        {/* Banner si está ignorado */}
                        {isIgnored && (
                          <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
                            <p className="text-[12px] text-slate-600 dark:text-white/60">Este grupo está marcado como "no son duplicados".</p>
                            <button
                              onClick={() => handleUnignoreGroup(group.key)}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                            >
                              <RotateCcw size={10} /> Reactivar
                            </button>
                          </div>
                        )}

                        <p className="text-[12px] font-semibold text-slate-700 dark:text-white/70">
                          Elige cuál se queda como producto principal — los demás se archivan y su stock se suma.
                        </p>

                        {/* Lista de items del grupo */}
                        <div className="space-y-1.5">
                          {group.items.map(it => {
                            const isCanonical = canonicalId === it.id;
                            const stats = salesStats[it.id];
                            const isLoadingStats = statsLoading[it.id];
                            const editedBarcode = overrides.barcodeEdits[it.id];
                            const currentBarcode = editedBarcode != null ? editedBarcode : (it.barcode || it.codigo || '');
                            return (
                              <div
                                key={it.id}
                                className={`p-2.5 rounded-lg border transition-all ${
                                  isCanonical
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/40'
                                    : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06]'
                                }`}
                              >
                                <label className="flex items-start gap-3 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`canonical_${group.key}`}
                                    checked={isCanonical}
                                    onChange={() => setCanonicalByGroup(prev => ({ ...prev, [group.key]: it.id }))}
                                    className="accent-indigo-500 mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{it.nombre}</p>
                                      {isCanonical && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500 text-white">
                                          Se queda
                                        </span>
                                      )}
                                      {/* Sugerencia: si el canonical tiene typo y este es similar pero distinto, ofrecer "usar este nombre" */}
                                      {isCanonical && otherItems.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const candidate = otherItems[0].nombre;
                                            updateOverrides(group.key, { newName: candidate });
                                          }}
                                          className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                                          title={`Usar "${otherItems[0].nombre}" como nombre`}
                                        >
                                          <Edit3 size={9} /> usar otro nombre
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 dark:text-white/40 flex-wrap">
                                      <span className="tabular-nums">Stock: <strong className="text-slate-700 dark:text-white/70">{it.stock || 0}</strong></span>
                                      {it.costoUSD != null && it.costoUSD > 0 && (
                                        <span className="tabular-nums">Costo: ${Number(it.costoUSD).toFixed(2)}</span>
                                      )}
                                      {it.precioDetal != null && it.precioDetal > 0 && (
                                        <span className="tabular-nums">Detal: ${Number(it.precioDetal).toFixed(2)}</span>
                                      )}
                                      {/* Histórico de ventas (lazy) */}
                                      {isLoadingStats ? (
                                        <span className="inline-flex items-center gap-1 text-slate-400">
                                          <Loader2 size={10} className="animate-spin" /> ventas…
                                        </span>
                                      ) : stats ? (
                                        <span className="inline-flex items-center gap-1">
                                          <BarChart3 size={10} className="text-violet-500" />
                                          <strong className={stats.count > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500'}>
                                            {stats.count} venta{stats.count !== 1 ? 's' : ''}
                                          </strong>
                                          {stats.lastSaleAt && (
                                            <span className="text-slate-400">
                                              · última {new Date(stats.lastSaleAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                            </span>
                                          )}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </label>

                                {/* Editor de barcode in-place — solo si es grupo de mismo barcode */}
                                {group.reason === 'EXACT_BARCODE' && (
                                  <div className="mt-2 pl-6 flex items-center gap-2">
                                    <Barcode size={11} className="text-slate-400 shrink-0" />
                                    <input
                                      type="text"
                                      value={currentBarcode}
                                      onChange={e => updateOverrides(group.key, {
                                        barcodeEdits: { ...overrides.barcodeEdits, [it.id]: e.target.value },
                                      })}
                                      className="flex-1 px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400"
                                      placeholder="Barcode"
                                    />
                                    {editedBarcode != null && editedBarcode !== (it.barcode || it.codigo || '') && (
                                      <>
                                        <button
                                          onClick={() => handleSaveBarcode(it.id, editedBarcode.trim())}
                                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                                          title="Guardar nuevo barcode (si son productos distintos, dejarán de aparecer como duplicados)"
                                        >
                                          Guardar
                                        </button>
                                        <button
                                          onClick={() => {
                                            const next = { ...overrides.barcodeEdits };
                                            delete next[it.id];
                                            updateOverrides(group.key, { barcodeEdits: next });
                                          }}
                                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                                        >
                                          Cancelar
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Si está ignorado, no mostrar las opciones de fusión */}
                        {isIgnored ? null : (
                          <>
                            {/* Renombrar canonical (input) */}
                            {canonical && (
                              <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1 flex items-center gap-1">
                                  <Edit3 size={10} /> Nombre final del producto principal
                                </label>
                                <input
                                  type="text"
                                  value={overrides.newName ?? canonical.nombre}
                                  onChange={e => updateOverrides(group.key, { newName: e.target.value })}
                                  className="w-full px-2 py-1.5 rounded bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
                                />
                                {overrides.newName != null && overrides.newName !== canonical.nombre && (
                                  <button
                                    onClick={() => updateOverrides(group.key, { newName: null })}
                                    className="mt-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-white/40"
                                  >
                                    Usar nombre original ("{canonical.nombre}")
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Stock final editable */}
                            {previewBase && (
                              <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1 flex items-center gap-1">
                                  <Package size={10} /> Stock final {overrides.stockOverride != null && '(manual)'}
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={overrides.stockOverride != null ? overrides.stockOverride : previewBase.totalStock}
                                    onChange={e => {
                                      const v = parseInt(e.target.value, 10);
                                      updateOverrides(group.key, { stockOverride: isNaN(v) ? 0 : v });
                                    }}
                                    className="w-24 px-2 py-1.5 rounded bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm font-bold tabular-nums text-slate-900 dark:text-white outline-none focus:border-indigo-400"
                                  />
                                  <span className="text-[11px] text-slate-500 dark:text-white/40">
                                    Suma automática: <strong className="tabular-nums text-slate-700 dark:text-white/70">{previewBase.totalStock}</strong>
                                  </span>
                                  {overrides.stockOverride != null && (
                                    <button
                                      onClick={() => updateOverrides(group.key, { stockOverride: null })}
                                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-white/40"
                                    >
                                      Volver a suma
                                    </button>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">
                                  Tip: si vas a hacer conteo físico, escribe acá la cantidad real.
                                </p>
                              </div>
                            )}

                            {/* Heredar campos faltantes */}
                            {inheritOptions.some(o => o.available) && (
                              <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
                                  Heredar del duplicado (campos vacíos del principal)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {inheritOptions.filter(o => o.available).map(opt => (
                                    <label
                                      key={opt.key}
                                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold cursor-pointer transition-all ${
                                        overrides.inherit[opt.key]
                                          ? 'bg-indigo-100 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/50 hover:border-indigo-300'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!overrides.inherit[opt.key]}
                                        onChange={e => updateOverrides(group.key, {
                                          inherit: { ...overrides.inherit, [opt.key]: e.target.checked },
                                        })}
                                        className="accent-indigo-500"
                                      />
                                      {opt.icon}
                                      {opt.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Nota de auditoría */}
                            <div>
                              <input
                                type="text"
                                value={overrides.note}
                                onChange={e => updateOverrides(group.key, { note: e.target.value })}
                                placeholder="Nota opcional (ej: 'Typo en nombre', 'Carga duplicada del proveedor')…"
                                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] text-[12px] text-slate-700 dark:text-white/70 placeholder:text-slate-400 outline-none focus:border-indigo-400"
                              />
                            </div>

                            {/* Resumen + acciones */}
                            {previewBase && canonical && (
                              <div className="px-3 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <Sparkles size={12} className="text-indigo-500" />
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Resultado de la fusión</p>
                                </div>
                                <p className="text-[12px] text-slate-700 dark:text-white/70 leading-relaxed">
                                  "<strong>{overrides.newName?.trim() || canonical.nombre}</strong>" tendrá <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{finalStock} unidades</strong>{overrides.stockOverride != null ? ' (manual)' : ' (suma)'}.
                                  {' '}Los otros <strong>{previewBase.toArchiveIds.length}</strong> producto{previewBase.toArchiveIds.length !== 1 ? 's' : ''} pasan a archivados.
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <button
                                onClick={() => handleIgnoreGroup(group)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-600 dark:text-white/60 text-[11px] font-bold uppercase tracking-wider transition-all"
                                title="Marcar este grupo como 'no son duplicados' — no volverá a aparecer en la lista"
                              >
                                <EyeOff size={11} /> No son duplicados
                              </button>
                              <button
                                onClick={() => handleMerge(group)}
                                disabled={isMerging || !canonicalId}
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
                          </>
                        )}
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
