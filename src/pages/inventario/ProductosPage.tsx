// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PRODUCTOS — Catálogo rediseñado (Odoo/Cin7-killer)                      ║
// ║                                                                          ║
// ║  Reemplaza completamente el legacy `Inventario.tsx embedded`. Diseño:   ║
// ║                                                                          ║
// ║   · Toolbar slim única: buscador grande + filtros + view toggle + accion ║
// ║   · Vistas: TABLA (densa, power user) | GALERÍA (cards con imagen)       ║
// ║   · Inline edit en precio detal/mayor + stock + costo                    ║
// ║   · Drawer lateral al click: imagen + datos + mini-kardex + acciones     ║
// ║   · Selección masiva con barra flotante bottom (acciones contextuales)   ║
// ║   · Filtros activos como chips removibles arriba de la tabla             ║
// ║   · Densidad: compact / normal / comfortable (persiste en localStorage)  ║
// ║   · Columnas configurables (futuro inmediato)                            ║
// ║                                                                          ║
// ║  Lee `businesses/{bid}/products` directo. Mantiene compatibilidad con    ║
// ║  el shape que usan POS y Despacho (no rompe el esquema).                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy,
  limit as fbLimit, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  Package, Search, Plus, X, Filter, LayoutGrid, List, Settings2,
  ChevronDown, AlertTriangle, Tag, DollarSign, Edit3, Trash2, Copy,
  ArrowDownToLine, ArrowUpFromLine, Activity, Eye, EyeOff,
  CheckSquare, Square, MoreHorizontal, Boxes, TrendingUp, TrendingDown,
  Clock, ChevronRight, Loader2, ImageIcon, BarChart3, RotateCcw,
  CheckCircle2, Sparkles, Percent, Star,
} from 'lucide-react';
import ProductoEditPage from './ProductoEditPage';

// ─── TYPES ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  codigo?: string;
  nombre: string;
  marca?: string;
  proveedor?: string;
  categoria?: string;
  subcategoria?: string;
  ubicacion?: string;
  costoUSD?: number;
  precioDetal?: number;
  precioMayor?: number;
  precioBCV?: number;
  precioGrupo?: number;
  precioDivisa?: number;
  preciosCuenta?: Record<string, number>;
  stock?: number;
  stockByAlmacen?: Record<string, number>;
  stockMinimo?: number;
  stockMaximo?: number;
  iva?: number;
  ivaTipo?: 'GENERAL' | 'REDUCIDO' | 'EXENTO';
  unidad?: string;
  unitType?: string;
  imageUrl?: string;
  images?: string[];
  barcode?: string;
  esServicio?: boolean;
  isKit?: boolean;
  hasVariants?: boolean;
  fechaVencimiento?: string;
  lote?: string;
  margenDetal?: number;
  margenMayor?: number;
  favorito?: boolean;
  permitirPrecioCero?: boolean;
  updatedAt?: any;
  status?: 'active' | 'pending_review';
}

interface Movement {
  id: string;
  productId: string;
  productName?: string;
  type: string;
  quantity: number;
  reason?: string;
  userName?: string;
  createdAt: any;
}

type ViewMode = 'table' | 'gallery';
type Density = 'compact' | 'normal' | 'comfortable';
type StockFilter = 'all' | 'with' | 'low' | 'out' | 'favoritos';
type SortKey = 'nombre' | 'codigo' | 'stock' | 'value' | 'updated' | 'margin';

const DENSITY_PADDING: Record<Density, string> = {
  compact: 'py-1.5',
  normal: 'py-2.5',
  comfortable: 'py-3.5',
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────

export default function ProductosPage() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Paginación: items por página + página actual
  const [pageSize, setPageSize] = useState<number>(() => Number(localStorage.getItem('inv.productos.pageSize')) || 50);
  const [page, setPage] = useState(1);
  useEffect(() => { localStorage.setItem('inv.productos.pageSize', String(pageSize)); }, [pageSize]);

  // UI state
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('inv.productos.view') as ViewMode) || 'table');
  const [density, setDensity] = useState<Density>(() => (localStorage.getItem('inv.productos.density') as Density) || 'normal');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('nombre');
  const [sortDesc, setSortDesc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [duplicateFromId, setDuplicateFromId] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'stock' | 'costoUSD' | 'precioDetal' | 'precioMayor' } | null>(null);

  // Persist UI choices
  useEffect(() => { localStorage.setItem('inv.productos.view', view); }, [view]);
  useEffect(() => { localStorage.setItem('inv.productos.density', density); }, [density]);

  // Subscribe products
  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/products`), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });
    return () => unsub();
  }, [businessId]);

  // Filtrado + sort
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const arr = products.filter(p => {
      if (categoryFilter !== 'all' && (p.categoria || 'Sin categoría') !== categoryFilter) return false;
      const stock = Number(p.stock || 0);
      const min = Number(p.stockMinimo || 0);
      if (stockFilter === 'with' && stock <= 0) return false;
      if (stockFilter === 'out' && stock > 0) return false;
      if (stockFilter === 'low' && (stock === 0 || (min > 0 ? stock > min : stock > 5))) return false;
      if (stockFilter === 'favoritos' && !p.favorito) return false;
      if (s) {
        const hay = `${p.nombre} ${p.codigo || ''} ${p.categoria || ''} ${p.marca || ''} ${p.barcode || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case 'codigo': va = a.codigo || ''; vb = b.codigo || ''; break;
        case 'stock': va = Number(a.stock || 0); vb = Number(b.stock || 0); break;
        case 'value': va = Number(a.stock || 0) * Number(a.costoUSD || 0); vb = Number(b.stock || 0) * Number(b.costoUSD || 0); break;
        case 'updated': va = tsMillis(a.updatedAt); vb = tsMillis(b.updatedAt); break;
        case 'margin':
          va = computeMargin(a);
          vb = computeMargin(b);
          break;
        default: va = a.nombre.toLowerCase(); vb = b.nombre.toLowerCase();
      }
      if (va < vb) return sortDesc ? 1 : -1;
      if (va > vb) return sortDesc ? -1 : 1;
      return 0;
    });
    return arr;
  }, [products, search, categoryFilter, stockFilter, sortKey, sortDesc]);

  // Reset a página 1 cuando cambian filtros/búsqueda/ordenamiento
  useEffect(() => { setPage(1); }, [search, categoryFilter, stockFilter, sortKey, sortDesc, pageSize]);

  // Slice paginado para la vista actual
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => set.add(p.categoria || 'Sin categoría'));
    return Array.from(set).sort();
  }, [products]);

  const kpis = useMemo(() => {
    let valueCost = 0, valueRetail = 0, units = 0, low = 0, out = 0;
    for (const p of products) {
      const s = Number(p.stock || 0);
      units += s;
      valueCost += s * Number(p.costoUSD || 0);
      // Valor a precio de venta detal — si el producto no tiene precio detal,
      // usamos costoUSD como fallback (no inflamos el número con productos
      // que no tienen precio configurado).
      const precioDetal = Number((p as any).precioDetal || 0) || Number(p.costoUSD || 0);
      valueRetail += s * precioDetal;
      const min = Number(p.stockMinimo || 0);
      if (s === 0) out++;
      else if (min > 0 ? s <= min : s <= 5) low++;
    }
    const margenPct = valueCost > 0 ? ((valueRetail - valueCost) / valueCost) * 100 : 0;
    return { total: products.length, valueCost, valueRetail, margenPct, units, low, out };
  }, [products]);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (categoryFilter !== 'all') activeFilters.push({ key: 'cat', label: `Categoría: ${categoryFilter}`, clear: () => setCategoryFilter('all') });
  if (stockFilter !== 'all') activeFilters.push({ key: 'stock', label: `Stock: ${STOCK_FILTER_LABELS[stockFilter]}`, clear: () => setStockFilter('all') });
  if (search) activeFilters.push({ key: 'q', label: `Buscar: "${search}"`, clear: () => setSearch('') });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    // Selecciona/deselecciona la PÁGINA actual (no todo el catálogo)
    const idsInPage = paginated.map(p => p.id);
    const allSelectedInPage = idsInPage.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelectedInPage) idsInPage.forEach(id => next.delete(id));
      else idsInPage.forEach(id => next.add(id));
      return next;
    });
  };

  // Toggle favorito
  const toggleFavorito = async (productId: string, current: boolean) => {
    if (!businessId) return;
    await updateDoc(doc(db, `businesses/${businessId}/products`, productId), {
      favorito: !current,
      updatedAt: new Date().toISOString(),
    });
  };

  // Inline edit save
  const saveCell = async (productId: string, field: 'stock' | 'costoUSD' | 'precioDetal' | 'precioMayor', raw: string) => {
    if (!businessId) return;
    const value = parseFloat(raw);
    if (isNaN(value) || value < 0) { setEditingCell(null); return; }
    await updateDoc(doc(db, `businesses/${businessId}/products`, productId), {
      [field]: value,
      updatedAt: new Date().toISOString(),
    });
    setEditingCell(null);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────

  // Si está activa la pantalla dedicada de edición/creación, monta solo eso.
  if (showFullScreen) {
    return (
      <ProductoEditPage
        productId={editPageId}
        duplicateFromId={duplicateFromId}
        onClose={() => { setShowFullScreen(false); setEditPageId(null); setDuplicateFromId(null); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats compactos arriba — valor catálogo expandido (costo + venta + margen) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 auto-rows-fr">
        <StatChip icon={<Package size={12} />} label="Productos" value={kpis.total} />
        <StatChip icon={<Boxes size={12} />} label="Unidades" value={kpis.units.toLocaleString('es-VE')} />
        <ValueChip
          icon={<DollarSign size={12} />}
          costValue={kpis.valueCost}
          retailValue={kpis.valueRetail}
          margenPct={kpis.margenPct}
        />
        <StatChip icon={<AlertTriangle size={12} />} label="Atención" value={kpis.low + kpis.out} sub={`${kpis.out} agotados · ${kpis.low} bajo`} tone={kpis.out > 0 ? 'rose' : 'amber'} />
      </div>

      {/* Toolbar única slim */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5 flex flex-wrap items-center gap-2">
        {/* Buscador grande */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código, marca, barcode…"
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Categoría */}
        <Select value={categoryFilter} onChange={setCategoryFilter} options={[
          { value: 'all', label: 'Todas las categorías' },
          ...categories.map(c => ({ value: c, label: c })),
        ]} />

        {/* Stock filter */}
        <Select value={stockFilter} onChange={(v) => setStockFilter(v as StockFilter)} options={[
          { value: 'all', label: 'Todo el stock' },
          { value: 'with', label: 'Con stock' },
          { value: 'low', label: 'Stock bajo' },
          { value: 'out', label: 'Agotados' },
          { value: 'favoritos', label: '⭐ Favoritos' },
        ]} />

        {/* Sort */}
        <SortPicker sortKey={sortKey} sortDesc={sortDesc} onChange={(k, d) => { setSortKey(k); setSortDesc(d); }} />

        {/* View toggle */}
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-hidden">
          <button onClick={() => setView('table')} className={`px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${view === 'table' ? 'bg-indigo-500 text-white' : 'text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}>
            <List size={13} />
          </button>
          <button onClick={() => setView('gallery')} className={`px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${view === 'gallery' ? 'bg-indigo-500 text-white' : 'text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}>
            <LayoutGrid size={13} />
          </button>
        </div>

        {/* Density (solo en tabla) */}
        {view === 'table' && (
          <Select value={density} onChange={(v) => setDensity(v as Density)} options={[
            { value: 'compact', label: 'Compacto' },
            { value: 'normal', label: 'Normal' },
            { value: 'comfortable', label: 'Cómodo' },
          ]} />
        )}

        {/* Acción primaria */}
        <button
          onClick={() => { setEditPageId(null); setDuplicateFromId(null); setShowFullScreen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm"
        >
          <Plus size={13} /> Nuevo producto
        </button>
      </div>

      {/* Filtros activos como chips */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30">Filtros:</span>
          {activeFilters.map(f => (
            <button
              key={f.key}
              onClick={f.clear}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium hover:bg-indigo-200 dark:hover:bg-indigo-500/25"
            >
              {f.label} <X size={10} />
            </button>
          ))}
          <button
            onClick={() => { setCategoryFilter('all'); setStockFilter('all'); setSearch(''); }}
            className="text-[11px] font-semibold text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70 ml-1"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Resultados header */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-white/40 px-1">
        <span className="tabular-nums">
          <span className="font-semibold text-slate-700 dark:text-white/70">{filtered.length}</span> producto{filtered.length !== 1 && 's'}
          {filtered.length !== products.length && <> de {products.length}</>}
          {filtered.length > pageSize && <> · página {currentPage}/{totalPages}</>}
        </span>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
            Deseleccionar {selected.size}
          </button>
        )}
      </div>

      {/* Contenido principal */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-12 text-center">
          <Loader2 className="mx-auto mb-2 text-slate-400 animate-spin" size={20} />
          <p className="text-xs text-slate-400">Cargando catálogo…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-12 text-center">
          <Package size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
          <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin productos que coincidan</p>
          <p className="text-xs text-slate-400 mt-1">Ajusta los filtros o crea un nuevo producto.</p>
        </div>
      ) : view === 'table' ? (
        <ProductTable
          products={paginated}
          density={density}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleSelectAll}
          onOpenDrawer={setDrawerProduct}
          editingCell={editingCell}
          onStartEdit={setEditingCell}
          onSaveCell={saveCell}
          onToggleFavorito={toggleFavorito}
        />
      ) : (
        <ProductGallery
          products={paginated}
          selected={selected}
          onToggleSelect={toggleSelect}
          onOpenDrawer={setDrawerProduct}
        />
      )}

      {/* Paginación */}
      {filtered.length > 0 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Barra flotante de selección */}
      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          businessId={businessId || ''}
          selectedIds={Array.from(selected)}
        />
      )}

      {/* Drawer lateral */}
      {drawerProduct && businessId && (
        <ProductDrawer
          product={drawerProduct}
          businessId={businessId}
          onClose={() => setDrawerProduct(null)}
          onEdit={() => { setEditPageId(drawerProduct.id); setShowFullScreen(true); setDrawerProduct(null); }}
          onDuplicate={() => { setDuplicateFromId(drawerProduct.id); setShowFullScreen(true); setDrawerProduct(null); }}
        />
      )}

      {/* Modal nuevo producto */}
    </div>
  );
}

// ─── SUB-COMPONENTES ───────────────────────────────────────────────────────

function StatChip({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
  tone?: 'rose' | 'amber';
}) {
  const valColor = tone === 'rose' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2.5 flex flex-col justify-between min-h-[68px]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
        {icon} {label}
      </div>
      <div className="mt-1">
        <p className={`text-lg font-bold tabular-nums leading-tight ${valColor}`}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 dark:text-white/30 truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * ValueChip — variante doble del StatChip que muestra valor a costo (lo
 * que tienes invertido) y valor a precio detal (lo que harías si vendieras
 * todo) + margen porcentual. Útil para que el dueño vea de un vistazo
 * cuánto capital tiene en mercancía y cuánto recuperaría.
 */
function ValueChip({ icon, costValue, retailValue, margenPct }: {
  icon: React.ReactNode;
  costValue: number;
  retailValue: number;
  margenPct: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-2.5 flex flex-col justify-between min-h-[68px]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
          {icon} Valor catálogo
        </div>
        {margenPct > 0 && (
          <span className="text-[9px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            +{margenPct.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-lg font-bold tabular-nums leading-tight text-slate-900 dark:text-white">
          ${costValue.toFixed(0)}
        </p>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/30">costo</span>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-white/40 tabular-nums truncate mt-0.5">
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">${retailValue.toFixed(0)}</span>
        <span className="text-slate-400 dark:text-white/30"> a precio detal</span>
      </p>
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400 cursor-pointer"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SortPicker({ sortKey, sortDesc, onChange }: {
  sortKey: SortKey; sortDesc: boolean; onChange: (k: SortKey, desc: boolean) => void;
}) {
  const labels: Record<SortKey, string> = {
    nombre: 'Nombre', codigo: 'Código', stock: 'Stock', value: 'Valor', updated: 'Actualizado', margin: 'Margen',
  };
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/80 hover:border-indigo-300"
      >
        <Filter size={12} /> {labels[sortKey]} {sortDesc ? '↓' : '↑'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 right-0 w-48 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
            {(Object.keys(labels) as SortKey[]).map(k => (
              <button
                key={k}
                onClick={() => { onChange(k, k === sortKey ? !sortDesc : false); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04] ${k === sortKey ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-white/70'}`}
              >
                {labels[k]} {k === sortKey && (sortDesc ? '↓' : '↑')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TABLA ─────────────────────────────────────────────────────────────────

function ProductTable({
  products, density, selected, onToggleSelect, onToggleAll, onOpenDrawer,
  editingCell, onStartEdit, onSaveCell, onToggleFavorito,
}: {
  products: Product[];
  density: Density;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onOpenDrawer: (p: Product) => void;
  editingCell: { id: string; field: 'stock' | 'costoUSD' | 'precioDetal' | 'precioMayor' } | null;
  onStartEdit: (cell: { id: string; field: 'stock' | 'costoUSD' | 'precioDetal' | 'precioMayor' } | null) => void;
  onSaveCell: (id: string, field: 'stock' | 'costoUSD' | 'precioDetal' | 'precioMayor', raw: string) => Promise<void>;
  onToggleFavorito: (id: string, current: boolean) => void;
}) {
  const padding = DENSITY_PADDING[density];
  const allSelected = products.length > 0 && selected.size === products.length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 w-8 text-center">
                <button onClick={onToggleAll} className="text-slate-400 hover:text-indigo-500">
                  {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
              </th>
              <th className="px-1 py-2 w-7 text-center">
                <Star size={11} className="text-slate-300 dark:text-white/20 mx-auto" />
              </th>
              <Th>Producto</Th>
              <Th>Categoría</Th>
              <Th align="right">Costo</Th>
              <Th align="right">Detal</Th>
              <Th align="right">Mayor</Th>
              <Th align="right">Stock</Th>
              <Th align="center">Estado</Th>
              <Th align="right">Margen</Th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {products.map(p => {
              const isSelected = selected.has(p.id);
              const stock = Number(p.stock || 0);
              const min = Number(p.stockMinimo || 0);
              const stockStatus = p.esServicio ? 'service' : stock === 0 ? 'out' : (min > 0 ? stock <= min : stock <= 5) ? 'low' : 'ok';
              const margin = computeMargin(p);

              return (
                <tr
                  key={p.id}
                  className={`group transition-colors ${
                    isSelected ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                  }`}
                >
                  <td className={`${padding} px-3 text-center`}>
                    <button onClick={() => onToggleSelect(p.id)} className="text-slate-400 hover:text-indigo-500">
                      {isSelected ? <CheckSquare size={14} className="text-indigo-500" /> : <Square size={14} />}
                    </button>
                  </td>
                  <td className={`${padding} px-1 text-center`}>
                    <button
                      onClick={() => onToggleFavorito(p.id, !!p.favorito)}
                      className={`p-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-500/10 ${p.favorito ? 'text-amber-500' : 'text-slate-300 dark:text-white/20 hover:text-amber-400'}`}
                      title={p.favorito ? 'Quitar de favoritos' : 'Marcar favorito'}
                    >
                      <Star size={13} fill={p.favorito ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className={`${padding} px-3 cursor-pointer`} onClick={() => onOpenDrawer(p)}>
                    <div className="flex items-center gap-2.5">
                      <ProductThumb product={p} size={32} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-white truncate flex items-center gap-1.5">
                          {p.nombre}
                          {p.esServicio && <span className="px-1 py-0 rounded bg-slate-200 dark:bg-white/[0.08] text-[9px] text-slate-500">SVC</span>}
                          {p.isKit && <span className="px-1 py-0 rounded bg-purple-100 dark:bg-purple-500/15 text-[9px] text-purple-700 dark:text-purple-400">KIT</span>}
                          {p.hasVariants && <span className="px-1 py-0 rounded bg-blue-100 dark:bg-blue-500/15 text-[9px] text-blue-700 dark:text-blue-400">VAR</span>}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono truncate">
                          {p.codigo || p.id.slice(0, 10)}{p.barcode ? ` · ${p.barcode}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={`${padding} px-3`}>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.04] text-[10px] font-medium text-slate-600 dark:text-white/60">
                      {p.categoria || 'Sin categoría'}
                    </span>
                  </td>
                  <EditableCell value={p.costoUSD} prefix="$" editing={editingCell?.id === p.id && editingCell?.field === 'costoUSD'} onStart={() => onStartEdit({ id: p.id, field: 'costoUSD' })} onSave={(v) => onSaveCell(p.id, 'costoUSD', v)} onCancel={() => onStartEdit(null)} padding={padding} />
                  <EditableCell value={p.precioDetal} prefix="$" editing={editingCell?.id === p.id && editingCell?.field === 'precioDetal'} onStart={() => onStartEdit({ id: p.id, field: 'precioDetal' })} onSave={(v) => onSaveCell(p.id, 'precioDetal', v)} onCancel={() => onStartEdit(null)} padding={padding} />
                  <EditableCell value={p.precioMayor} prefix="$" editing={editingCell?.id === p.id && editingCell?.field === 'precioMayor'} onStart={() => onStartEdit({ id: p.id, field: 'precioMayor' })} onSave={(v) => onSaveCell(p.id, 'precioMayor', v)} onCancel={() => onStartEdit(null)} padding={padding} />
                  <EditableCell
                    value={p.esServicio ? '—' : stock}
                    editing={editingCell?.id === p.id && editingCell?.field === 'stock'}
                    onStart={() => !p.esServicio && onStartEdit({ id: p.id, field: 'stock' })}
                    onSave={(v) => onSaveCell(p.id, 'stock', v)}
                    onCancel={() => onStartEdit(null)}
                    padding={padding}
                    valueClass={stockStatus === 'out' ? 'text-rose-600 dark:text-rose-400 font-bold'
                      : stockStatus === 'low' ? 'text-amber-600 dark:text-amber-400 font-semibold'
                      : 'text-slate-700 dark:text-white/80'}
                  />
                  <td className={`${padding} px-3 text-center`}>
                    {stockStatus === 'out' ? <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold">AGOT</span>
                    : stockStatus === 'low' ? <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">BAJO</span>
                    : stockStatus === 'service' ? <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/[0.06] text-slate-500 text-[10px] font-bold">SVC</span>
                    : <span className="text-emerald-500">●</span>}
                  </td>
                  <td className={`${padding} px-3 text-right tabular-nums text-xs font-semibold ${
                    margin === null ? 'text-slate-300' : margin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 10 ? 'text-slate-700 dark:text-white/70' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {margin === null ? '—' : `${margin.toFixed(0)}%`}
                  </td>
                  <td className={`${padding} px-2 text-center`}>
                    <button
                      onClick={() => onOpenDrawer(p)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-opacity"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 text-${align}`}>
      {children}
    </th>
  );
}

function EditableCell({
  value, prefix, editing, onStart, onSave, onCancel, padding, valueClass,
}: {
  value: number | string | undefined;
  prefix?: string;
  editing: boolean;
  onStart: () => void;
  onSave: (v: string) => void;
  onCancel: () => void;
  padding: string;
  valueClass?: string;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(String(value ?? '')); inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  if (editing) {
    return (
      <td className={`${padding} px-2`}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => onSave(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSave(draft); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          className="w-full px-1.5 py-1 rounded border border-indigo-400 bg-white dark:bg-slate-800 text-right tabular-nums text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </td>
    );
  }
  const display = typeof value === 'number' ? `${prefix || ''}${value.toFixed(2)}` : (value || '—');
  return (
    <td className={`${padding} px-3 text-right`}>
      <button
        onClick={onStart}
        className={`inline-block tabular-nums text-xs hover:bg-slate-100 dark:hover:bg-white/[0.04] rounded px-1 py-0.5 ${valueClass || 'text-slate-700 dark:text-white/80'}`}
        title="Click para editar"
      >
        {display}
      </button>
    </td>
  );
}

// ─── GALERÍA ───────────────────────────────────────────────────────────────

function ProductGallery({ products, selected, onToggleSelect, onOpenDrawer }: {
  products: Product[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpenDrawer: (p: Product) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {products.map(p => {
        const isSelected = selected.has(p.id);
        const stock = Number(p.stock || 0);
        const min = Number(p.stockMinimo || 0);
        const isOut = stock === 0;
        const isLow = !isOut && (min > 0 ? stock <= min : stock <= 5);

        return (
          <div
            key={p.id}
            className={`group relative rounded-xl border ${
              isSelected ? 'border-indigo-400 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-white/[0.06]'
            } bg-white dark:bg-white/[0.02] overflow-hidden hover:shadow-md transition-all cursor-pointer`}
            onClick={() => onOpenDrawer(p)}
          >
            <div className="absolute top-1.5 left-1.5 z-10">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSelect(p.id); }}
                className={`p-1 rounded ${isSelected ? 'bg-indigo-500 text-white' : 'bg-white/80 dark:bg-black/40 text-slate-500 backdrop-blur-sm'} opacity-0 group-hover:opacity-100 transition-opacity`}
              >
                {isSelected ? <CheckSquare size={12} /> : <Square size={12} />}
              </button>
            </div>
            {(isOut || isLow) && (
              <div className="absolute top-1.5 right-1.5 z-10">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isOut ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {isOut ? 'AGOT' : 'BAJO'}
                </span>
              </div>
            )}

            <div className="aspect-square bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
              {p.imageUrl || p.images?.[0] ? (
                <img src={p.imageUrl || p.images?.[0]} alt={p.nombre} className="w-full h-full object-cover" />
              ) : (
                <Package size={28} className="text-slate-300 dark:text-white/15" />
              )}
            </div>
            <div className="p-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-white truncate" title={p.nombre}>{p.nombre}</p>
              <p className="text-[10px] text-slate-400 font-mono truncate">{p.codigo || p.id.slice(0, 8)}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">${(p.precioDetal || 0).toFixed(2)}</span>
                <span className={`text-[11px] tabular-nums font-semibold ${isOut ? 'text-rose-500' : isLow ? 'text-amber-600' : 'text-slate-500 dark:text-white/40'}`}>{p.esServicio ? 'svc' : `${stock} und`}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductThumb({ product, size }: { product: Product; size: number }) {
  const url = product.imageUrl || product.images?.[0];
  if (url) return <img src={url} alt={product.nombre} style={{ width: size, height: size }} className="rounded object-cover shrink-0" />;
  return (
    <div style={{ width: size, height: size }} className="rounded bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center shrink-0">
      <Package size={size * 0.5} className="text-slate-300 dark:text-white/20" />
    </div>
  );
}

// ─── BARRA DE SELECCIÓN ────────────────────────────────────────────────────

function SelectionBar({ count, onClear, businessId, selectedIds }: {
  count: number; onClear: () => void; businessId: string; selectedIds: string[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const handleArchive = async () => {
    if (!confirm(`¿Archivar ${count} productos? Quedarán ocultos pero su histórico se preserva.`)) return;
    setBusy('archive');
    for (const id of selectedIds) {
      await updateDoc(doc(db, `businesses/${businessId}/products`, id), { status: 'archived', updatedAt: new Date().toISOString() });
    }
    setBusy(null);
    onClear();
  };
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xl border border-white/10 dark:border-slate-200">
      <span className="text-xs font-bold pl-2">{count} seleccionado{count !== 1 && 's'}</span>
      <span className="w-px h-5 bg-white/20 dark:bg-slate-300" />
      <button className="px-2.5 py-1 rounded text-[11px] font-semibold hover:bg-white/10 dark:hover:bg-slate-100 inline-flex items-center gap-1">
        <Percent size={11} /> Margen
      </button>
      <button className="px-2.5 py-1 rounded text-[11px] font-semibold hover:bg-white/10 dark:hover:bg-slate-100 inline-flex items-center gap-1">
        <Tag size={11} /> Categoría
      </button>
      <button className="px-2.5 py-1 rounded text-[11px] font-semibold hover:bg-white/10 dark:hover:bg-slate-100 inline-flex items-center gap-1">
        <DollarSign size={11} /> IVA
      </button>
      <button
        onClick={handleArchive}
        disabled={busy !== null}
        className="px-2.5 py-1 rounded text-[11px] font-semibold hover:bg-rose-500/30 inline-flex items-center gap-1 text-rose-300 dark:text-rose-600 disabled:opacity-50"
      >
        {busy === 'archive' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Archivar
      </button>
      <span className="w-px h-5 bg-white/20 dark:bg-slate-300" />
      <button onClick={onClear} className="p-1.5 rounded hover:bg-white/10 dark:hover:bg-slate-100">
        <X size={12} />
      </button>
    </div>
  );
}

// ─── DRAWER LATERAL ────────────────────────────────────────────────────────

function ProductDrawer({ product, businessId, onClose, onEdit, onDuplicate }: {
  product: Product; businessId: string; onClose: () => void;
  onEdit: () => void; onDuplicate: () => void;
}) {
  const [moves, setMoves] = useState<Movement[]>([]);
  useEffect(() => {
    const q = query(
      collection(db, `businesses/${businessId}/stock_movements`),
      orderBy('createdAt', 'desc'),
      fbLimit(50),
    );
    const unsub = onSnapshot(q, snap => {
      setMoves(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(m => m.productId === product.id).slice(0, 10));
    });
    return () => unsub();
  }, [businessId, product.id]);

  const stock = Number(product.stock || 0);
  const min = Number(product.stockMinimo || 0);
  const max = Number(product.stockMaximo || 0);
  const value = stock * Number(product.costoUSD || 0);
  const margin = computeMargin(product);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" />
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-white/10 flex flex-col h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-start gap-3">
          <ProductThumb product={product} size={56} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{product.nombre}</h2>
            <p className="text-[11px] text-slate-400 font-mono">{product.codigo || product.id.slice(0, 12)}</p>
            {product.categoria && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.05] text-[10px] font-medium text-slate-600 dark:text-white/60">
                {product.categoria}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Stock summary */}
          <div className="grid grid-cols-3 gap-2">
            <DrawerStat label="Stock" value={stock} highlight={stock === 0 ? 'rose' : (min > 0 && stock <= min) ? 'amber' : null} />
            <DrawerStat label="Mín / Máx" value={`${min} / ${max || '—'}`} small />
            <DrawerStat label="Valor stock" value={`$${value.toFixed(2)}`} />
          </div>

          {/* Precios */}
          <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
            <DrawerRow label="Costo USD" value={`$${(product.costoUSD || 0).toFixed(4)}`} />
            <DrawerRow label="Precio detal" value={`$${(product.precioDetal || 0).toFixed(2)}`} />
            <DrawerRow label="Precio mayor" value={`$${(product.precioMayor || 0).toFixed(2)}`} />
            {margin !== null && (
              <DrawerRow label="Margen detal" value={`${margin.toFixed(1)}%`} valueClass={margin >= 30 ? 'text-emerald-600' : margin >= 10 ? 'text-slate-700' : 'text-rose-600'} />
            )}
            {product.iva !== undefined && <DrawerRow label="IVA" value={`${product.iva}%`} />}
          </div>

          {/* Otros datos */}
          {(product.marca || product.proveedor || product.ubicacion) && (
            <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
              {product.marca && <DrawerRow label="Marca" value={product.marca} />}
              {product.proveedor && <DrawerRow label="Proveedor" value={product.proveedor} />}
              {product.ubicacion && <DrawerRow label="Ubicación" value={product.ubicacion} />}
              {product.barcode && <DrawerRow label="Barcode" value={product.barcode} mono />}
              {product.lote && <DrawerRow label="Lote" value={product.lote} />}
              {product.fechaVencimiento && <DrawerRow label="Vence" value={product.fechaVencimiento} />}
            </div>
          )}

          {/* Mini-kardex */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 inline-flex items-center gap-1">
                <Activity size={11} /> Últimos movimientos
              </h4>
              <span className="text-[10px] text-slate-400">{moves.length}</span>
            </div>
            {moves.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic px-2 py-3 text-center bg-slate-50 dark:bg-white/[0.02] rounded-lg">Sin movimientos para este producto.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
                {moves.map(m => {
                  const entrada = m.quantity > 0 || ['COMPRA', 'AJUSTE+', 'INVENTARIO_INICIAL'].includes(m.type);
                  const ts = tsMillis(m.createdAt);
                  return (
                    <div key={m.id} className="px-2.5 py-1.5 flex items-center gap-2">
                      {entrada ? <ArrowDownToLine size={11} className="text-emerald-500 shrink-0" /> : <ArrowUpFromLine size={11} className="text-rose-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-700 dark:text-white/70 truncate">{m.reason || m.type}</p>
                        <p className="text-[10px] text-slate-400">{ts ? new Date(ts).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} · {m.userName || '—'}</p>
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${entrada ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {entrada ? '+' : '−'}{Math.abs(Number(m.quantity || 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.08] flex items-center gap-2">
          <button onClick={onEdit} className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 inline-flex items-center justify-center gap-1.5">
            <Edit3 size={12} /> Editar
          </button>
          <button onClick={onDuplicate} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.04] inline-flex items-center gap-1.5">
            <Copy size={12} /> Duplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerStat({ label, value, highlight, small }: { label: string; value: string | number; highlight?: 'rose' | 'amber' | null; small?: boolean }) {
  const color = highlight === 'rose' ? 'text-rose-600 dark:text-rose-400'
    : highlight === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] px-2.5 py-2 border border-slate-200 dark:border-white/[0.06]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">{label}</p>
      <p className={`${small ? 'text-sm' : 'text-lg'} font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function DrawerRow({ label, value, valueClass, mono }: { label: string; value: string | number; valueClass?: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2 flex items-center justify-between">
      <span className="text-[11px] text-slate-500 dark:text-white/50">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${mono ? 'font-mono' : ''} ${valueClass || 'text-slate-800 dark:text-white/90'}`}>{value}</span>
    </div>
  );
}

// ─── MODAL: NUEVO PRODUCTO ─────────────────────────────────────────────────

function NewProductModal({ businessId, onClose, existingCategories }: {
  businessId: string; onClose: () => void; existingCategories: string[];
}) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoria, setCategoria] = useState(existingCategories[0] || 'General');
  const [costoUSD, setCostoUSD] = useState('');
  const [precioDetal, setPrecioDetal] = useState('');
  const [precioMayor, setPrecioMayor] = useState('');
  const [stock, setStock] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('5');
  const [esServicio, setEsServicio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Margen inline
  const [margenPct, setMargenPct] = useState('');
  useEffect(() => {
    const c = parseFloat(costoUSD) || 0;
    const m = parseFloat(margenPct) || 0;
    if (c > 0 && m > 0) setPrecioDetal((c * (1 + m / 100)).toFixed(2));
  }, [costoUSD, margenPct]);

  const canSave = nombre.trim().length > 1 && (parseFloat(costoUSD) || 0) >= 0;

  const handleSave = async () => {
    if (!canSave) { setErr('Nombre y costo son obligatorios'); return; }
    setBusy(true); setErr(null);
    try {
      await addDoc(collection(db, `businesses/${businessId}/products`), {
        nombre: nombre.trim(),
        codigo: codigo.trim() || `SKU-${Date.now().toString(36).toUpperCase()}`,
        categoria: categoria || 'General',
        costoUSD: parseFloat(costoUSD) || 0,
        precioDetal: parseFloat(precioDetal) || 0,
        precioMayor: parseFloat(precioMayor) || parseFloat(precioDetal) || 0,
        stock: esServicio ? 0 : (parseFloat(stock) || 0),
        stockMinimo: parseFloat(stockMinimo) || 0,
        esServicio,
        iva: 16,
        ivaTipo: 'GENERAL',
        unitType: 'unidad',
        unidad: 'UND',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Error al crear');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Plus size={15} className="text-indigo-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nuevo producto</h3>
              <p className="text-[11px] text-slate-500 dark:text-white/40">Datos esenciales — el resto se edita después</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="Nombre *" value={nombre} onChange={setNombre} placeholder="Ej: Coca Cola 2L" autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código / SKU" value={codigo} onChange={setCodigo} placeholder="Auto si vacío" />
            <Field label="Categoría" value={categoria} onChange={setCategoria} list={existingCategories} />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={esServicio} onChange={e => setEsServicio(e.target.checked)} className="rounded" />
            <span className="text-slate-600 dark:text-white/70">Es un servicio (no descuenta stock)</span>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Costo USD" value={costoUSD} onChange={setCostoUSD} type="number" placeholder="0.00" />
            <Field label="Margen %" value={margenPct} onChange={setMargenPct} type="number" placeholder="30" hint="auto-calc detal" />
            <Field label="Precio detal" value={precioDetal} onChange={setPrecioDetal} type="number" placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio mayor" value={precioMayor} onChange={setPrecioMayor} type="number" placeholder="opcional" />
            {!esServicio && <Field label="Stock inicial" value={stock} onChange={setStock} type="number" placeholder="0" />}
            {!esServicio && <Field label="Mínimo" value={stockMinimo} onChange={setStockMinimo} type="number" placeholder="5" />}
          </div>

          {err && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs p-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {err}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/[0.08] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={handleSave} disabled={!canSave || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Crear producto
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, autoFocus, list, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoFocus?: boolean; list?: string[]; hint?: string;
}) {
  const id = `f-${label}`;
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">{label}</label>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={list ? id : undefined}
        className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
      />
      {list && <datalist id={id}>{list.map(o => <option key={o} value={o} />)}</datalist>}
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── PAGINACIÓN ────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, pageSize, totalItems, onPageChange, onPageSizeChange }: {
  page: number; totalPages: number; pageSize: number; totalItems: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Construye el rango de páginas a mostrar (con elipsis si son muchas).
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/50">
        <span>Mostrando <span className="font-bold text-slate-700 dark:text-white/80 tabular-nums">{start}-{end}</span> de <span className="font-bold text-slate-700 dark:text-white/80 tabular-nums">{totalItems}</span></span>
        <span className="text-slate-300 dark:text-white/20">·</span>
        <label className="inline-flex items-center gap-1.5">
          Por página:
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(parseInt(e.target.value, 10))}
            className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[11px] font-semibold tabular-nums outline-none focus:border-indigo-400"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        {pages.map((p, i) => p === '…' ? (
          <span key={`e${i}`} className="px-2 text-slate-400 text-xs">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[28px] px-2 py-1 rounded-md text-[11px] font-bold tabular-nums transition-colors ${
              p === page
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: 'Todos', with: 'Con stock', low: 'Bajo', out: 'Agotados', favoritos: 'Favoritos',
};

function computeMargin(p: Product): number | null {
  const cost = Number(p.costoUSD || 0);
  const price = Number(p.precioDetal || 0);
  if (cost <= 0 || price <= 0) return null;
  return ((price - cost) / cost) * 100;
}

function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t === 'string') return new Date(t).getTime();
  if (typeof t?.toMillis === 'function') return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000;
  return 0;
}
