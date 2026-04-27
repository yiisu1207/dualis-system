// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CONTEO FÍSICO — Sesiones de conteo cíclico + ajuste por varianza        ║
// ║                                                                          ║
// ║  Flujo Cin7-style:                                                       ║
// ║   1. Generar hoja de conteo (snapshot del stock teórico actual)          ║
// ║   2. Operario cuenta físicamente y rellena cada línea                    ║
// ║   3. Al aplicar, se generan automáticamente:                             ║
// ║       - StockEntry CONTEO_VARIANZA (positivas) por las que sobran        ║
// ║       - StockExit CONTEO_VARIANZA (negativas) por las que faltan         ║
// ║   4. El conteo queda como APPLIED, inmutable, con auditoría completa     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardList, Plus, Loader2, AlertTriangle, CheckCircle2, X,
  Search, Package, Play,
} from 'lucide-react';
import { type PhysicalCount, type PhysicalCountLine } from './types';
import { applyPhysicalCount, buildCountSheet, genId } from './helpers';

interface ProductOpt { id: string; codigo?: string; nombre: string; categoria?: string; stock?: number; stockByAlmacen?: Record<string, number>; costoUSD?: number; }
interface WarehouseOpt { id: string; nombre: string; }

export default function ConteoFisicoPage() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingCount, setEditingCount] = useState<PhysicalCount | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    const q = query(collection(db, `businesses/${businessId}/physicalCounts`), orderBy('startedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const arr: PhysicalCount[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
      setCounts(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/products`), snap => {
      const arr: ProductOpt[] = [];
      snap.forEach(d => {
        const p = d.data() as any;
        arr.push({ id: d.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, stock: p.stock, stockByAlmacen: p.stockByAlmacen, costoUSD: p.costoUSD });
      });
      setProducts(arr);
    });
    return () => unsub();
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/almacenes`), snap => {
      const arr: WarehouseOpt[] = [];
      snap.forEach(d => {
        const a = d.data() as any;
        if (a.activo !== false) arr.push({ id: d.id, nombre: a.nombre || d.id });
      });
      // Fallback: si no hay almacenes configurados, usar "Principal" virtual
      // para que las operaciones de inventario funcionen sin requerir setup
      // explícito de almacenes (cuentas legacy con solo `stock` plano).
      if (arr.length === 0) arr.push({ id: 'principal', nombre: 'Principal' });
      setWarehouses(arr);
    });
    return () => unsub();
  }, [businessId]);

  const kpis = useMemo(() => {
    const inProgress = counts.filter(c => c.status === 'IN_PROGRESS' || c.status === 'DRAFT').length;
    const applied = counts.filter(c => c.status === 'APPLIED').length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayApplied = counts.filter(c => c.status === 'APPLIED' && c.appliedAt && new Date(c.appliedAt).getTime() >= today.getTime()).length;
    return { inProgress, applied, todayApplied };
  }, [counts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCell label="En progreso" value={kpis.inProgress} sub="por terminar" tone="amber" />
        <KpiCell label="Aplicados" value={kpis.applied} sub="histórico" tone="emerald" />
        <KpiCell label="Hoy" value={kpis.todayApplied} sub="ajustes del día" tone="indigo" />
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-violet-500/5 hover:from-violet-500/20 hover:to-violet-500/10 p-3 flex flex-col items-start justify-center text-left transition-all hover:shadow-md group"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400 mb-1">
            <Plus size={11} /> Acción
          </div>
          <p className="text-sm font-bold text-violet-700 dark:text-violet-300 group-hover:translate-x-0.5 transition-transform">Iniciar conteo</p>
          <p className="text-[10px] text-violet-600/60 dark:text-violet-400/60 mt-0.5">Genera hoja con stock teórico</p>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        {loading ? <div className="px-6 py-16 text-center text-sm text-slate-400">Cargando…</div>
         : counts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
            <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin conteos físicos</p>
            <p className="text-xs text-slate-400 dark:text-white/25 mt-1">
              Click en "Iniciar conteo" para generar una hoja con el stock teórico actual y empezar a contar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Inicio</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Almacén</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Líneas</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Contadas</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Estado</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Iniciado por</th>
                  <th className="text-right px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {counts.map(c => {
                  const counted = c.lines.filter(l => l.countedQty !== null).length;
                  const pct = c.lines.length > 0 ? Math.round((counted / c.lines.length) * 100) : 0;
                  return (
                    <tr key={c.id} className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 whitespace-nowrap">
                        {new Date(c.startedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60">{c.warehouseName || '—'}</td>
                      <td className="px-3 py-2 text-center text-xs tabular-nums">{c.lines.length}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        <span className={`tabular-nums font-semibold ${pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {counted}/{c.lines.length} · {pct}%
                        </span>
                      </td>
                      <td className="px-3 py-2"><CountStatusBadge status={c.status} /></td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[120px]">{c.startedByName || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {c.status !== 'APPLIED' && c.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setEditingCount(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                          >
                            <Play size={11} /> Contar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewModal && businessId && (
        <NuevoConteoModal
          businessId={businessId}
          products={products}
          warehouses={warehouses}
          actorUid={userProfile?.uid || ''}
          actorName={userProfile?.fullName || userProfile?.displayName || userProfile?.email}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {editingCount && businessId && (
        <ContarHojaModal
          businessId={businessId}
          count={editingCount}
          actorUid={userProfile?.uid || ''}
          actorName={userProfile?.fullName || userProfile?.displayName || userProfile?.email}
          onClose={() => setEditingCount(null)}
        />
      )}
    </div>
  );
}

// ─── Modal: Iniciar conteo (genera hoja desde stock actual) ──────────────

function NuevoConteoModal({ businessId, products, warehouses, actorUid, actorName, onClose }: { businessId: string; products: ProductOpt[]; warehouses: WarehouseOpt[]; actorUid: string; actorName?: string; onClose: () => void; }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [filterCategory, setFilterCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (warehouses.length === 1 && !warehouseId) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  const showWarehouseSelector = warehouses.length >= 2;

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.categoria) set.add(p.categoria); });
    return Array.from(set).sort();
  }, [products]);

  const previewCount = useMemo(() => {
    return products.filter(p => !filterCategory || p.categoria === filterCategory).length;
  }, [products, filterCategory]);

  const handleStart = async () => {
    if (!warehouseId) { setError('Seleccioná un almacén.'); return; }
    setBusy(true);
    setError(null);

    const wh = warehouses.find(w => w.id === warehouseId);
    const lines = buildCountSheet(products, warehouseId, wh?.nombre || '', { category: filterCategory || undefined });

    if (lines.length === 0) {
      setError('No hay productos para contar con ese filtro.');
      setBusy(false);
      return;
    }

    const count: PhysicalCount = {
      id: genId('count_'),
      businessId,
      status: 'IN_PROGRESS',
      warehouseId,
      warehouseName: wh?.nombre,
      filterCategory: filterCategory || undefined,
      lines,
      startedAt: new Date().toISOString(),
      startedBy: actorUid,
      startedByName: actorName,
    };

    try {
      await setDoc(doc(db, `businesses/${businessId}/physicalCounts/${count.id}`), count);
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><ClipboardList size={15} className="text-indigo-500" /></div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Iniciar conteo físico</h3>
              <p className="text-xs text-slate-500 dark:text-white/40">Genera una hoja con el stock teórico actual</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {showWarehouseSelector && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Almacén a contar</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm font-medium focus:border-indigo-400 outline-none">
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
              </select>
            </div>
          )}

          {categories.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Categoría (opcional, conteo cíclico parcial)</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm font-medium focus:border-indigo-400 outline-none">
                <option value="">Todas (conteo completo)</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-3 text-xs text-indigo-700 dark:text-indigo-300">
            <p className="font-semibold mb-1">Preview</p>
            <p>Se generará una hoja con <span className="font-bold tabular-nums">{previewCount}</span> producto{previewCount === 1 ? '' : 's'} listos para contar.</p>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={handleStart} disabled={busy || previewCount === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Iniciar conteo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Contar hoja (rellenar countedQty + aplicar varianzas) ────────

function ContarHojaModal({ businessId, count, actorUid, actorName, onClose }: { businessId: string; count: PhysicalCount; actorUid: string; actorName?: string; onClose: () => void; }) {
  const [lines, setLines] = useState<PhysicalCountLine[]>(count.lines);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyVariance, setShowOnlyVariance] = useState(false);

  const filtered = useMemo(() => {
    let l = lines;
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter(x => x.productName.toLowerCase().includes(q) || (x.productCode || '').toLowerCase().includes(q));
    }
    if (showOnlyVariance) {
      l = l.filter(x => x.countedQty !== null && x.countedQty !== x.theoreticalQty);
    }
    return l;
  }, [lines, search, showOnlyVariance]);

  const stats = useMemo(() => {
    const counted = lines.filter(l => l.countedQty !== null);
    const variance = counted.filter(l => l.countedQty !== l.theoreticalQty);
    const positives = counted.filter(l => (l.countedQty as number) > l.theoreticalQty);
    const negatives = counted.filter(l => (l.countedQty as number) < l.theoreticalQty);
    return {
      totalLines: lines.length,
      countedLines: counted.length,
      varianceLines: variance.length,
      positives: positives.length,
      negatives: negatives.length,
    };
  }, [lines]);

  const updateLine = (productId: string, countedQty: number | null) => {
    setLines(prev => prev.map(l => l.productId === productId ? { ...l, countedQty } : l));
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await setDoc(doc(db, `businesses/${businessId}/physicalCounts/${count.id}`), {
        ...count,
        lines,
        status: 'IN_PROGRESS',
      }, { merge: true });
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!confirm(`¿Aplicar el conteo? Se generarán automáticamente:\n· ${stats.positives} entrada(s) por sobrantes\n· ${stats.negatives} salida(s) por faltantes\n\nEsto NO se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    const updated: PhysicalCount = { ...count, lines };
    const res = await applyPhysicalCount(db, businessId, updated, { actorUid, actorName });
    setBusy(false);
    if (res.ok === false) { setError(res.error); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><ClipboardList size={15} className="text-indigo-500" /></div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Contar — {count.warehouseName}</h3>
                <p className="text-xs text-slate-500 dark:text-white/40">
                  Iniciado {new Date(count.startedAt).toLocaleString('es-VE')}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="rounded-md bg-slate-50 dark:bg-white/[0.02] py-1.5 px-2">
              <p className="text-[10px] text-slate-500">Total</p>
              <p className="text-sm font-semibold tabular-nums">{stats.totalLines}</p>
            </div>
            <div className="rounded-md bg-indigo-50 dark:bg-indigo-500/10 py-1.5 px-2">
              <p className="text-[10px] text-indigo-600 dark:text-indigo-400">Contadas</p>
              <p className="text-sm font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{stats.countedLines}</p>
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 py-1.5 px-2">
              <p className="text-[10px] text-amber-600 dark:text-amber-400">Con varianza</p>
              <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">{stats.varianceLines}</p>
            </div>
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 py-1.5 px-2">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Sobran (+)</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{stats.positives}</p>
            </div>
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 py-1.5 px-2">
              <p className="text-[10px] text-rose-600 dark:text-rose-400">Faltan (−)</p>
              <p className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">{stats.negatives}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs outline-none focus:border-indigo-400" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/60">
            <input type="checkbox" checked={showOnlyVariance} onChange={e => setShowOnlyVariance(e.target.checked)} className="rounded" />
            Solo con varianza
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/[0.02] sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-24">Teórico</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-28">Contado</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-20">Varianza</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const variance = l.countedQty !== null ? (l.countedQty as number) - l.theoreticalQty : null;
                return (
                  <tr key={l.productId} className="border-t border-slate-100 dark:border-white/[0.04]">
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-white/80 truncate max-w-[280px]">{l.productName}</p>
                      {l.productCode && <p className="text-[10px] text-slate-400 font-mono">{l.productCode}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm text-slate-500 dark:text-white/40">
                      {l.theoreticalQty.toLocaleString('es-VE')}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={l.countedQty ?? ''}
                        onChange={e => updateLine(l.productId, e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                        placeholder="—"
                        className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-right tabular-nums text-sm focus:border-indigo-400"
                      />
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums text-sm font-semibold ${
                      variance === null ? 'text-slate-300'
                      : variance === 0 ? 'text-emerald-600 dark:text-emerald-400'
                      : variance > 0 ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]">Cerrar</button>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-white/[0.08] text-sm font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Guardar avance
            </button>
            <button
              onClick={handleApply}
              disabled={busy || stats.countedLines === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 shadow-sm"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Aplicar varianzas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountStatusBadge({ status }: { status: string }) {
  const cfg = status === 'APPLIED' ? { bg: 'bg-emerald-500/15', tx: 'text-emerald-700 dark:text-emerald-400', label: 'Aplicado' }
    : status === 'IN_PROGRESS' ? { bg: 'bg-amber-500/15', tx: 'text-amber-700 dark:text-amber-400', label: 'En progreso' }
    : status === 'DRAFT' ? { bg: 'bg-slate-500/15', tx: 'text-slate-500', label: 'Borrador' }
    : { bg: 'bg-slate-500/15', tx: 'text-slate-500', label: 'Cancelado' };
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.tx}`}>{cfg.label}</span>;
}

function KpiCell({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone: 'indigo' | 'emerald' | 'amber' | 'slate' }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-white/40">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white mt-1">{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>
    </div>
  );
}
