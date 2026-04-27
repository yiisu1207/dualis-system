// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ALMACENES — Gestión multi-almacén                                       ║
// ║                                                                          ║
// ║  · CRUD de almacenes (nombre, descripción, activo)                       ║
// ║  · Vista de stock total por almacén (suma de unidades + valor USD)       ║
// ║  · Identificación del almacén "principal" (primero por orden)            ║
// ║  · Soft-disable: marcar inactivo en vez de borrar (preserva histórico)   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, orderBy, query, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  Building2, Plus, Edit3, Trash2, X, Loader2, CheckCircle2,
  Package, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';

interface Almacen {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  orden: number;
  createdAt?: string;
}

interface ProductSnapshot {
  id: string;
  nombre: string;
  stock?: number;
  stockByAlmacen?: Record<string, number>;
  costoUSD?: number;
}

export default function AlmacenesPage() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [products, setProducts] = useState<ProductSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Almacen | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    const q = query(collection(db, `businesses/${businessId}/almacenes`), orderBy('orden', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Almacen[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
      setAlmacenes(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/products`), (snap) => {
      const arr: ProductSnapshot[] = [];
      snap.forEach(d => {
        const p = d.data() as any;
        arr.push({ id: d.id, nombre: p.nombre, stock: p.stock, stockByAlmacen: p.stockByAlmacen, costoUSD: p.costoUSD });
      });
      setProducts(arr);
    });
    return () => unsub();
  }, [businessId]);

  // Stats por almacén — soporta legacy (campo `stock` plano sin stockByAlmacen)
  // Si un producto NO tiene stockByAlmacen pero sí tiene `stock`, atribuimos
  // todo su stock al almacén "principal" (primer almacén activo, o virtual __principal).
  const statsByAlmacen = useMemo(() => {
    const map: Record<string, { totalUnits: number; totalValue: number; productCount: number; lowStockCount: number }> = {};
    for (const a of almacenes) {
      map[a.id] = { totalUnits: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };
    }
    // Almacén principal real (primero activo) o virtual
    const principalRealId = almacenes.find(a => a.activo)?.id;
    const principalKey = principalRealId || '__principal__';
    if (!map[principalKey]) map[principalKey] = { totalUnits: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };

    for (const p of products) {
      const sba = p.stockByAlmacen;
      const hasMultiAlm = sba && Object.keys(sba).length > 0;
      if (hasMultiAlm) {
        for (const [whId, qty] of Object.entries(sba!)) {
          const stat = map[whId];
          if (!stat) continue;
          const q = Number(qty || 0);
          if (q > 0) stat.productCount++;
          stat.totalUnits += q;
          stat.totalValue += q * (p.costoUSD || 0);
          if (q > 0 && q < 5) stat.lowStockCount++;
        }
      } else {
        // Legacy: stock plano → todo va al principal
        const q = Number(p.stock || 0);
        const stat = map[principalKey];
        if (q > 0) stat.productCount++;
        stat.totalUnits += q;
        stat.totalValue += q * (p.costoUSD || 0);
        if (q > 0 && q < 5) stat.lowStockCount++;
      }
    }
    return map;
  }, [almacenes, products]);

  // Si no hay almacenes configurados PERO hay stock legacy, mostramos un
  // "Principal" virtual derivado de los productos para que la pantalla no
  // aparezca vacía en cuentas que vienen del schema viejo.
  const virtualPrincipal: Almacen | null = useMemo(() => {
    if (almacenes.length > 0) return null;
    const stat = statsByAlmacen['__principal__'];
    if (!stat || stat.totalUnits === 0) return null;
    return {
      id: '__principal__',
      nombre: 'Principal',
      descripcion: 'Almacén virtual derivado del stock legacy. Crea uno real para empezar a usar multi-almacén.',
      activo: true,
      orden: 0,
    };
  }, [almacenes, statsByAlmacen]);

  const displayedAlmacenes = useMemo(() => {
    return virtualPrincipal ? [virtualPrincipal, ...almacenes] : almacenes;
  }, [almacenes, virtualPrincipal]);

  const handleSave = async (data: Omit<Almacen, 'id' | 'createdAt'>, id?: string) => {
    if (!businessId) return;
    const docId = id || `wh_${Date.now().toString(36)}`;
    await setDoc(
      doc(db, `businesses/${businessId}/almacenes/${docId}`),
      {
        ...data,
        ...(id ? {} : { createdAt: new Date().toISOString() }),
      },
      { merge: true },
    );
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async (a: Almacen) => {
    if (!businessId) return;
    const stats = statsByAlmacen[a.id];
    if (stats && stats.totalUnits > 0) {
      alert(`No se puede borrar "${a.nombre}" porque tiene ${stats.totalUnits} unidades de stock. Marcalo como inactivo en su lugar.`);
      return;
    }
    if (!confirm(`¿Borrar el almacén "${a.nombre}"? Esta acción no se puede deshacer.`)) return;
    await deleteDoc(doc(db, `businesses/${businessId}/almacenes/${a.id}`));
  };

  const handleToggleActive = async (a: Almacen) => {
    if (!businessId) return;
    await setDoc(
      doc(db, `businesses/${businessId}/almacenes/${a.id}`),
      { activo: !a.activo },
      { merge: true },
    );
  };

  // Totales: si solo hay virtual, usa esos; si hay almacenes reales, suma los reales (evita doble conteo)
  const totals = useMemo(() => {
    let units = 0;
    let value = 0;
    let prodCount = 0;
    if (almacenes.length === 0 && statsByAlmacen['__principal__']) {
      const s = statsByAlmacen['__principal__'];
      units = s.totalUnits;
      value = s.totalValue;
      prodCount = s.productCount;
    } else {
      for (const a of almacenes) {
        const s = statsByAlmacen[a.id];
        if (!s) continue;
        units += s.totalUnits;
        value += s.totalValue;
        prodCount += s.productCount;
      }
    }
    return { units, value, products: prodCount };
  }, [almacenes, statsByAlmacen]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCell label="Almacenes" value={virtualPrincipal ? 1 : almacenes.filter(a => a.activo).length} sub={virtualPrincipal ? 'virtual · legacy' : `${almacenes.length} configurados`} />
        <KpiCell label="Unidades" value={totals.units.toLocaleString('es-VE')} sub="stock global" />
        <KpiCell label="Valor" value={`$${totals.value.toFixed(2)}`} sub="costo total USD" />
        <KpiCell label="Con stock" value={totals.products} sub="productos distribuidos" />
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 hover:from-indigo-500/20 hover:to-indigo-500/10 p-3 flex flex-col items-start justify-center text-left transition-all hover:shadow-md group"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-1">
            <Plus size={11} /> Acción
          </div>
          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 group-hover:translate-x-0.5 transition-transform">Nuevo almacén</p>
          <p className="text-[10px] text-indigo-600/60 dark:text-indigo-400/60 mt-0.5">Configurar ubicación nueva</p>
        </button>
      </div>

      {/* Banner explicativo: solo cuando el único almacén es el virtual.
          Aclara qué significa "Materializar" antes de que el usuario lo
          presione sin entender. */}
      {virtualPrincipal && almacenes.length === 0 && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/[0.06] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0">
            <Building2 size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
              Tienes un solo almacén virtual — todo está bien
            </p>
            <p className="text-[12px] text-indigo-700/80 dark:text-indigo-300/80 mt-1 leading-relaxed">
              Tu inventario actual vive en un almacén virtual llamado <strong>Principal</strong>. Si tienes una sola tienda, <strong>NO necesitas hacer nada</strong> — funciona perfectamente así.
            </p>
            <p className="text-[12px] text-indigo-700/80 dark:text-indigo-300/80 mt-1.5 leading-relaxed">
              <strong>¿Cuándo materializar?</strong> Solo si vas a tener 2 o más almacenes (sucursales, bodegas, etc.). Es 100% seguro, no toca tu stock — solo crea el registro en la base de datos para que puedas crear más almacenes después.
            </p>
          </div>
        </div>
      )}

      {/* Lista de almacenes */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">Cargando almacenes…</div>
        ) : displayedAlmacenes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Building2 size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
            <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin almacenes configurados</p>
            <p className="text-xs text-slate-400 dark:text-white/25 mt-1 mb-4">
              Crea tu primer almacén para empezar a manejar el stock por ubicación.
            </p>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              <Plus size={13} /> Crear primer almacén
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {displayedAlmacenes.map((a, idx) => {
              const isVirtual = a.id === '__principal__';
              const statsKey = isVirtual ? '__principal__' : a.id;
              const stats = statsByAlmacen[statsKey] || { totalUnits: 0, totalValue: 0, productCount: 0, lowStockCount: 0 };
              const isPrimary = idx === 0 && a.activo;
              return (
                <div
                  key={a.id}
                  className={`px-4 py-3 flex items-center gap-3 ${a.activo ? '' : 'opacity-50'}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    a.activo ? 'bg-indigo-500/10 text-indigo-500' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400'
                  }`}>
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{a.nombre}</p>
                      {isPrimary && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400">
                          Principal
                        </span>
                      )}
                      {isVirtual && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          Virtual · legacy
                        </span>
                      )}
                      {!a.activo && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-200 dark:bg-white/[0.06] text-slate-500">
                          Inactivo
                        </span>
                      )}
                      {stats.lowStockCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={9} /> {stats.lowStockCount} stock bajo
                        </span>
                      )}
                    </div>
                    {a.descripcion && (
                      <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5 truncate">{a.descripcion}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-white/40">
                      <span className="inline-flex items-center gap-1">
                        <Package size={11} /> {stats.productCount} productos
                      </span>
                      <span className="tabular-nums">{stats.totalUnits.toLocaleString('es-VE')} unidades</span>
                      <span className="tabular-nums font-semibold text-slate-700 dark:text-white/60">${stats.totalValue.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isVirtual ? (
                      <button
                        onClick={() => { setEditing(null); setShowModal(true); }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold hover:bg-indigo-500/20"
                        title={
                          'Materializar = convertir tu almacén virtual en uno real.\n\n'
                          + '• NO mueve ni toca tu inventario actual.\n'
                          + '• Solo crea un registro de almacén "real" en la base de datos.\n'
                          + '• Te permite empezar a usar multi-almacén (crear sucursales / bodegas).\n\n'
                          + 'Si tienes UN solo punto de venta físico, NO necesitas materializar — '
                          + 'tu almacén virtual ya funciona perfectamente. Solo hazlo si vas a tener '
                          + '2 o más almacenes.\n\n'
                          + 'Es 100% seguro y reversible.'
                        }
                      >
                        Materializar
                      </button>
                    ) : (
                    <button
                      onClick={() => handleToggleActive(a)}
                      title={a.activo ? 'Desactivar' : 'Activar'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                    >
                      {a.activo ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    )}
                    {!isVirtual && (
                    <>
                    <button
                      onClick={() => { setEditing(a); setShowModal(true); }}
                      title="Editar"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(a)}
                      title="Eliminar"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 size={13} />
                    </button>
                    </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <AlmacenModal
          almacen={editing}
          nextOrden={almacenes.length}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function AlmacenModal({ almacen, nextOrden, onClose, onSave }: {
  almacen: Almacen | null;
  nextOrden: number;
  onClose: () => void;
  onSave: (data: Omit<Almacen, 'id' | 'createdAt'>, id?: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(almacen?.nombre || '');
  const [descripcion, setDescripcion] = useState(almacen?.descripcion || '');
  const [activo, setActivo] = useState(almacen?.activo ?? true);
  const [orden, setOrden] = useState(almacen?.orden ?? nextOrden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        activo,
        orden: Number(orden) || 0,
      }, almacen?.id);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Building2 size={15} className="text-indigo-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {almacen ? 'Editar almacén' : 'Nuevo almacén'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-white/40">
                {almacen ? 'Modificá los datos del almacén' : 'Crear una ubicación nueva para manejar stock'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">
              Nombre <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Bodega principal · Sucursal Centro · Vehículo de reparto"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">
              Descripción (opcional)
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Ubicación física, responsable, notas…"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">
                Orden
              </label>
              <input
                type="number"
                value={orden}
                onChange={e => setOrden(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm tabular-nums outline-none focus:border-indigo-400"
              />
              <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">Menor número aparece primero</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">
                Estado
              </label>
              <button
                type="button"
                onClick={() => setActivo(v => !v)}
                className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  activo
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-500'
                }`}
              >
                {activo ? '✓ Activo' : '○ Inactivo'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {almacen ? 'Guardar cambios' : 'Crear almacén'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KpiCell({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-white/40">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white mt-1">{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>
    </div>
  );
}
