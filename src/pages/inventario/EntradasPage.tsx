// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ENTRADAS DE INVENTARIO — Lista + modal Nueva Entrada                    ║
// ║                                                                          ║
// ║  Versión Odoo-killer:                                                    ║
// ║   · Tabla de entradas (DRAFT, CONFIRMED, DONE) con filtros               ║
// ║   · Modal Nueva Entrada con:                                             ║
// ║       - Selector de tipo (Compra, Ajuste+, Devolución cliente, etc.)    ║
// ║       - Almacén destino (autohide si solo hay 1)                        ║
// ║       - Vinculación opcional a compra existente                          ║
// ║       - Líneas de productos con: cantidad esperada, cantidad recibida,  ║
// ║         lote, vencimiento, costo unitario                                ║
// ║       - Detección automática de diferencias (warning + motivo)          ║
// ║       - Backorder automático si recepción parcial                        ║
// ║       - Procesamiento atómico al stock + kardex                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy, limit as fbLimit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowDownToLine, Plus, Search, X, Loader2, AlertTriangle, Package,
  CheckCircle2, FileText, Clock, Trash2, ChevronDown,
} from 'lucide-react';
import {
  type StockEntry, type StockEntryType, type StockOpLine,
  STOCK_ENTRY_TYPE_LABELS, STOCK_STATUS_LABELS,
} from './types';
import { processStockEntry, detectLineDiffs, calcTotalUSD, genId, hasShortReceipt } from './helpers';

// Tipos canónicos de entrada en el kardex legacy y nuevo.
const ENTRY_LEGACY_TYPES = new Set([
  'COMPRA', 'RECEPCION', 'AJUSTE+', 'AJUSTE_POSITIVO', 'AJUSTE',
  'DEVOLUCION_CLIENTE', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO_INICIAL',
  'CONTEO_VARIANZA_POS',
]);
function isLegacyEntrada(type: string, qty: number): boolean {
  if (ENTRY_LEGACY_TYPES.has(type)) {
    if (type === 'AJUSTE') return qty >= 0; // ajuste puede ir en ambas direcciones
    return true;
  }
  return false;
}
function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t === 'string') return new Date(t).getTime();
  if (typeof t?.toMillis === 'function') return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000;
  return 0;
}
function tsToISO(t: any): string {
  const ms = tsMillis(t);
  return ms ? new Date(ms).toISOString() : new Date().toISOString();
}

const TYPE_LEGACY_LABEL: Record<string, string> = {
  COMPRA: 'Compra',
  RECEPCION: 'Recepción',
  AJUSTE: 'Ajuste',
  'AJUSTE+': 'Ajuste +',
  AJUSTE_POSITIVO: 'Ajuste +',
  DEVOLUCION_CLIENTE: 'Devolución cliente',
  TRANSFERENCIA_ENTRADA: 'Transferencia (in)',
  INVENTARIO_INICIAL: 'Inventario inicial',
  CONTEO_VARIANZA_POS: 'Conteo +',
};

interface ProductOpt {
  id: string;
  codigo?: string;
  nombre: string;
  costoUSD?: number;
}

interface WarehouseOpt {
  id: string;
  nombre: string;
}

export default function EntradasPage() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'CONFIRMED' | 'DONE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockEntryType>('ALL');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // Suscripción real-time a entries — combina:
  //   1. `stockEntries` (nueva colección, generada por la pantalla nueva)
  //   2. `stock_movements` (kardex legacy) → sintetiza StockEntry "histórico"
  //      por cada movimiento entrante, para que la pantalla muestre la data
  //      que los usuarios ya tenían cargada antes del rediseño.
  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    let nuevo: StockEntry[] = [];
    let legacy: StockEntry[] = [];
    const merge = () => {
      const combined = [...nuevo, ...legacy];
      combined.sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      });
      setEntries(combined);
      setLoading(false);
    };

    const qNew = query(
      collection(db, `businesses/${businessId}/stockEntries`),
      orderBy('createdAt', 'desc'),
    );
    const unsubNew = onSnapshot(qNew, (snap) => {
      nuevo = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as StockEntry));
      merge();
    }, (err) => { console.error('[Entradas/new]', err); });

    const qLeg = query(
      collection(db, `businesses/${businessId}/stock_movements`),
      orderBy('createdAt', 'desc'),
      fbLimit(800),
    );
    const unsubLeg = onSnapshot(qLeg, (snap) => {
      const arr: StockEntry[] = [];
      snap.forEach(d => {
        const m: any = { id: d.id, ...d.data() };
        const qty = Number(m.quantity || 0);
        if (!isLegacyEntrada(m.type, qty)) return;
        const absQ = Math.abs(qty);
        if (absQ === 0) return;
        const cost = Number(m.unitCostUSD || 0);
        const tipoMap: StockEntryType =
          m.type === 'COMPRA' || m.type === 'RECEPCION' ? 'COMPRA' :
          m.type === 'DEVOLUCION_CLIENTE' ? 'DEVOLUCION_CLIENTE' :
          m.type === 'INVENTARIO_INICIAL' ? 'INVENTARIO_INICIAL' :
          m.type === 'TRANSFERENCIA_ENTRADA' ? 'TRANSFERENCIA' :
          'AJUSTE_POSITIVO';
        arr.push({
          id: 'leg_' + d.id,
          businessId,
          type: tipoMap,
          status: 'DONE',
          operationDate: tsToISO(m.createdAt),
          warehouseId: m.warehouseId || '__principal__',
          warehouseName: m.warehouseName || (m.warehouseId ? undefined : 'Principal'),
          lines: [{
            id: 'l_' + d.id,
            productId: m.productId,
            productCode: m.productCode,
            productName: m.productName || '—',
            expectedQty: absQ,
            doneQty: absQ,
            unitCostUSD: cost,
          }],
          motivo: m.reason || TYPE_LEGACY_LABEL[m.type] || m.type,
          totalUSD: absQ * cost,
          processedAt: tsToISO(m.createdAt),
          createdAt: tsToISO(m.createdAt),
          createdBy: m.createdBy || '',
          createdByName: m.userName || m.createdByName,
        } as StockEntry);
      });
      legacy = arr;
      merge();
    }, (err) => { console.error('[Entradas/legacy]', err); });

    return () => { unsubNew(); unsubLeg(); };
  }, [businessId]);

  // Productos para el modal
  useEffect(() => {
    if (!businessId) return;
    const q = collection(db, `businesses/${businessId}/products`);
    const unsub = onSnapshot(q, (snap) => {
      const arr: ProductOpt[] = [];
      snap.forEach(d => {
        const p = d.data() as any;
        arr.push({ id: d.id, codigo: p.codigo, nombre: p.nombre, costoUSD: p.costoUSD });
      });
      setProducts(arr);
    });
    return () => unsub();
  }, [businessId]);

  // Almacenes
  useEffect(() => {
    if (!businessId) return;
    const q = collection(db, `businesses/${businessId}/almacenes`);
    const unsub = onSnapshot(q, (snap) => {
      const arr: WarehouseOpt[] = [];
      snap.forEach(d => {
        const a = d.data() as any;
        if (a.activo !== false) arr.push({ id: d.id, nombre: a.nombre || d.id });
      });
      // Fallback "Principal" virtual cuando no hay almacenes configurados.
      if (arr.length === 0) arr.push({ id: 'principal', nombre: 'Principal' });
      setWarehouses(arr);
    });
    return () => unsub();
  }, [businessId]);

  // Filtrado
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && e.type !== typeFilter) return false;
      if (search.trim()) {
        const norm = (s?: string) => (s || '').toLowerCase();
        const q = norm(search);
        const hay = norm(`${e.id} ${e.sourceDocLabel || ''} ${e.motivo || ''} ${e.lines.map(l => l.productName).join(' ')}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, statusFilter, typeFilter, search]);

  const kpis = useMemo(() => {
    const draft = entries.filter(e => e.status === 'DRAFT').length;
    const confirmed = entries.filter(e => e.status === 'CONFIRMED').length;
    const totalDone = entries.filter(e => e.status === 'DONE').length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayDone = entries.filter(e =>
      e.status === 'DONE' && new Date(e.processedAt || e.operationDate).getTime() >= today.getTime()
    );
    const totalValue = entries.filter(e => e.status === 'DONE').reduce((s, e) => s + e.totalUSD, 0);
    return { draft, confirmed, totalDone, todayCount: todayDone.length, totalValue };
  }, [entries]);

  return (
    <div className="space-y-4">
      {/* KPIs + acción primaria (sin header redundante, lo pinta el orquestador) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCell label="Borradores" value={kpis.draft} sub="por procesar" tone="amber" />
        <KpiCell label="Confirmadas" value={kpis.confirmed} sub="esperando recepción" tone="indigo" />
        <KpiCell label="Histórico" value={kpis.totalDone} sub={`${kpis.todayCount} hoy`} tone="emerald" />
        <KpiCell label="Valor acumulado" value={`$${kpis.totalValue.toFixed(2)}`} sub="costo recibido" tone="slate" />
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover:from-emerald-500/20 hover:to-emerald-500/10 p-3 flex flex-col items-start justify-center text-left transition-all hover:shadow-md group"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
            <Plus size={11} /> Acción
          </div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 group-hover:translate-x-0.5 transition-transform">Nueva entrada</p>
          <p className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60 mt-0.5">Recepción · ajuste +</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400"
          >
            <option value="ALL">Todos los estados</option>
            <option value="DRAFT">Borradores</option>
            <option value="CONFIRMED">Confirmadas</option>
            <option value="DONE">Procesadas</option>
          </select>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400"
          >
            <option value="ALL">Todos los tipos</option>
            {Object.entries(STOCK_ENTRY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por ID, doc origen, producto…"
              className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 placeholder:text-slate-300 outline-none focus:border-indigo-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">Cargando entradas…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ArrowDownToLine size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
            <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin entradas registradas</p>
            <p className="text-xs text-slate-400 dark:text-white/25 mt-1">
              Click en "Nueva entrada" para registrar una recepción, ajuste o devolución.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Fecha</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Tipo</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Documento</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Líneas</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Total USD</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Almacén</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Estado</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 whitespace-nowrap">
                      {new Date(e.operationDate).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        {STOCK_ENTRY_TYPE_LABELS[e.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 max-w-[220px] truncate" title={e.sourceDocLabel || e.motivo}>
                      {e.sourceDocLabel || e.motivo || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums text-slate-600 dark:text-white/60">
                      {e.lines.length}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm font-semibold text-slate-800 dark:text-white">
                      ${e.totalUSD.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[120px]">
                      {e.warehouseName || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[120px]">
                      {e.createdByName || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewModal && businessId && (
        <NuevaEntradaModal
          businessId={businessId}
          products={products}
          warehouses={warehouses}
          actorUid={userProfile?.uid || ''}
          actorName={userProfile?.fullName || userProfile?.displayName || userProfile?.email}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}

// ─── Modal: Nueva Entrada ────────────────────────────────────────────────

function NuevaEntradaModal({
  businessId, products, warehouses, actorUid, actorName, onClose,
}: {
  businessId: string;
  products: ProductOpt[];
  warehouses: WarehouseOpt[];
  actorUid: string;
  actorName?: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<StockEntryType>('AJUSTE_POSITIVO');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [lines, setLines] = useState<StockOpLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createBackorder, setCreateBackorder] = useState(true);

  // Auto-set almacén si solo hay 1
  useEffect(() => {
    if (warehouses.length === 1 && !warehouseId) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const showWarehouseSelector = warehouses.length >= 2;

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [products, productSearch]);

  const addLine = (p: ProductOpt) => {
    setLines(prev => [...prev, {
      id: genId('line_'),
      productId: p.id,
      productCode: p.codigo,
      productName: p.nombre,
      expectedQty: 1,
      doneQty: 1,
      unitCostUSD: p.costoUSD || 0,
    }]);
    setProductSearch('');
    setShowProductPicker(false);
  };

  const updateLine = (id: string, patch: Partial<StockOpLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const removeLine = (id: string) => {
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const diffs = useMemo(() => detectLineDiffs(lines), [lines]);
  const total = useMemo(() => calcTotalUSD(lines), [lines]);
  const showsDifferences = diffs.some(d => d.severity !== 'ok');
  const hasShort = hasShortReceipt(lines);

  const motivoRequired = ['AJUSTE_POSITIVO', 'INVENTARIO_INICIAL', 'CONTEO_VARIANZA', 'PRODUCCION'].includes(type);
  const canSubmit = lines.length > 0 && warehouseId && (!motivoRequired || motivo.trim().length >= 3);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Faltan datos: agregá al menos una línea, elegí almacén y completá motivo si aplica.');
      return;
    }
    setBusy(true);
    setError(null);

    const wh = warehouses.find(w => w.id === warehouseId);
    const entry: StockEntry = {
      id: genId('entry_'),
      businessId,
      type,
      status: 'DRAFT',
      operationDate: new Date().toISOString(),
      warehouseId,
      warehouseName: wh?.nombre,
      lines,
      motivo: motivo.trim() || undefined,
      nota: nota.trim() || undefined,
      totalUSD: total,
      createdAt: new Date().toISOString(),
      createdBy: actorUid,
      createdByName: actorName,
    };

    const res = await processStockEntry(db, businessId, entry, {
      createBackorder: createBackorder && hasShort,
      actorUid,
      actorName,
    });

    setBusy(false);

    if (res.ok === false) {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ArrowDownToLine size={15} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Nueva entrada de inventario</h3>
              <p className="text-xs text-slate-500 dark:text-white/40">Registrá una recepción, ajuste positivo, devolución o transferencia</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Tipo + Almacén */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Tipo de entrada</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as StockEntryType)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm font-medium text-slate-700 dark:text-white/80 focus:border-indigo-400 outline-none"
              >
                {Object.entries(STOCK_ENTRY_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {showWarehouseSelector && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Almacén destino</label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm font-medium text-slate-700 dark:text-white/80 focus:border-indigo-400 outline-none"
                >
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Motivo (obligatorio para algunos tipos) */}
          {(motivoRequired || type === 'DEVOLUCION_CLIENTE' || type === 'TRANSFERENCIA') && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">
                Motivo {motivoRequired && <span className="text-rose-500">*</span>}
              </label>
              <input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder={
                  type === 'AJUSTE_POSITIVO' ? 'Ej: Stock encontrado en bodega 2'
                  : type === 'INVENTARIO_INICIAL' ? 'Ej: Carga de saldos al iniciar el sistema'
                  : type === 'DEVOLUCION_CLIENTE' ? 'Ej: Cliente Salazar devolvió por garantía'
                  : type === 'TRANSFERENCIA' ? 'Ej: Recepción de transferencia desde Sucursal Centro'
                  : 'Motivo de la entrada'
                }
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-white/80 focus:border-indigo-400 outline-none"
              />
            </div>
          )}

          {/* Líneas de productos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                Productos ({lines.length})
              </label>
              <button
                onClick={() => setShowProductPicker(v => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
              >
                <Plus size={12} /> Agregar producto
              </button>
            </div>

            {showProductPicker && (
              <div className="mb-2 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] p-2">
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="Buscar producto por nombre o código…"
                    className="w-full pl-7 pr-3 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04] rounded-md bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">Sin resultados</div>
                  ) : (
                    filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addLine(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      >
                        <Package size={12} className="text-slate-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700 dark:text-white/80 truncate">{p.nombre}</p>
                          <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono">{p.codigo || p.id.slice(0, 8)}</p>
                        </div>
                        {p.costoUSD != null && (
                          <span className="text-xs text-slate-400 tabular-nums">${p.costoUSD.toFixed(2)}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-white/[0.06] p-6 text-center">
                <Package size={22} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
                <p className="text-xs text-slate-400 dark:text-white/30">Aún no hay productos. Click en "Agregar producto" para empezar.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-white/[0.02]">
                    <tr>
                      <th className="text-left px-2 py-2 font-semibold text-slate-500 dark:text-white/40">Producto</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-20">Esperado</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-20">Recibido</th>
                      <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">Costo $</th>
                      <th className="text-left px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">Lote</th>
                      <th className="px-2 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const diff = l.doneQty - l.expectedQty;
                      const hasIssue = diff !== 0;
                      return (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-white/[0.04]">
                          <td className="px-2 py-1.5">
                            <p className="font-medium text-slate-700 dark:text-white/80 truncate max-w-[200px]">{l.productName}</p>
                            {l.productCode && <p className="text-[10px] text-slate-400 font-mono">{l.productCode}</p>}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              value={l.expectedQty}
                              onChange={e => updateLine(l.id, { expectedQty: parseFloat(e.target.value) || 0 })}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-right tabular-nums text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              value={l.doneQty}
                              onChange={e => updateLine(l.id, { doneQty: parseFloat(e.target.value) || 0 })}
                              className={`w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border text-right tabular-nums text-xs font-semibold ${
                                hasIssue
                                  ? diff < 0 ? 'border-rose-300 text-rose-600' : 'border-amber-300 text-amber-600'
                                  : 'border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-white/80'
                              }`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.unitCostUSD || 0}
                              onChange={e => updateLine(l.id, { unitCostUSD: parseFloat(e.target.value) || 0 })}
                              className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-right tabular-nums text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={l.lote || ''}
                              onChange={e => updateLine(l.id, { lote: e.target.value })}
                              placeholder="—"
                              className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button onClick={() => removeLine(l.id)} className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded">
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/[0.06]">
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-right text-xs font-semibold text-slate-500 dark:text-white/40">Total</td>
                      <td className="px-2 py-2 text-right tabular-nums text-sm font-semibold text-slate-900 dark:text-white">${total.toFixed(2)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Detección de diferencias */}
          {showsDifferences && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Hay diferencias entre lo esperado y lo recibido
                  </p>
                  {diffs.filter(d => d.severity !== 'ok').slice(0, 3).map((d, i) => (
                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300">
                      <span className="font-mono">{d.productName}</span>: esperado {d.expectedQty}, recibido {d.doneQty}
                      <span className={d.diff < 0 ? 'text-rose-600 dark:text-rose-400 ml-1' : 'text-amber-700 dark:text-amber-400 ml-1'}>
                        ({d.diff > 0 ? '+' : ''}{d.diff})
                      </span>
                    </p>
                  ))}
                  {hasShort && (
                    <label className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <input
                        type="checkbox"
                        checked={createBackorder}
                        onChange={e => setCreateBackorder(e.target.checked)}
                        className="rounded"
                      />
                      Crear backorder con las cantidades faltantes
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Nota interna */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Nota interna (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              placeholder="Observaciones, comentarios para el equipo…"
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-700 dark:text-white/80 outline-none focus:border-indigo-400 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
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
            disabled={!canSubmit || busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Procesar entrada
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = status === 'DONE' ? { bg: 'bg-emerald-500/15', tx: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle2 size={10} /> }
    : status === 'CONFIRMED' ? { bg: 'bg-indigo-500/15', tx: 'text-indigo-700 dark:text-indigo-400', icon: <Clock size={10} /> }
    : status === 'DRAFT' ? { bg: 'bg-amber-500/15', tx: 'text-amber-700 dark:text-amber-400', icon: <FileText size={10} /> }
    : { bg: 'bg-slate-500/15', tx: 'text-slate-500', icon: <X size={10} /> };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.tx}`}>
      {cfg.icon}
      {STOCK_STATUS_LABELS[status as keyof typeof STOCK_STATUS_LABELS] || status}
    </span>
  );
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
