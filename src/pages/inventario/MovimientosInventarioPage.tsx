// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MOVIMIENTOS DE INVENTARIO — Kardex global con filtros + verde/rojo      ║
// ║                                                                          ║
// ║  Inspirado en Plade (la pantalla que mostró el usuario en los videos):   ║
// ║   · 1 fila slim de filtros: tipo · almacén · período · usuario · busca   ║
// ║   · Tabla con coloreo verde (entrada) / rojo (salida)                    ║
// ║   · Drill-down: click en una fila → abre el documento que la generó      ║
// ║   · KPIs arriba: # movimientos del día, valor entrante hoy, saliente     ║
// ║   · Exportable                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy, limit as fbLimit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Search, X, Download,
  ExternalLink, Calendar, Filter,
} from 'lucide-react';

interface Movement {
  id: string;
  productId: string;
  productName: string;
  productCode?: string;
  /** Tipos de movimiento usados en el legacy (`stock_movements` collection):
   *   COMPRA, AJUSTE+, AJUSTE_INICIAL, RECEPCION → entradas
   *   VENTA, MERMA, AJUSTE-, AJUSTE → salidas (AJUSTE puede ser cualquiera, según signo de quantity)
   *  Las pantallas nuevas (StockEntry/StockExit) escriben acá también para
   *  unificar el kardex. */
  type: string;
  /** En el legacy SIEMPRE es positivo y type define la dirección. En las
   *  pantallas nuevas, las salidas guardan negativo. Tratamos ambos casos. */
  quantity: number;
  balanceAfter?: number;
  unitCostUSD?: number;
  warehouseId?: string;
  warehouseName?: string;
  reason?: string;
  /** Schema legacy usa "userName" sin createdByName separado. */
  userName?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  createdAt: any;
  createdBy?: string;
  createdByName?: string;
}

/** Determina si un movimiento es entrada (true) o salida (false) tomando
 *  en cuenta tanto el schema legacy (type define dirección, qty positivo)
 *  como el nuevo (qty puede ser negativo). */
function isEntrada(m: Movement): boolean {
  // Tipos canónicos de entrada
  if (['COMPRA', 'RECEPCION', 'AJUSTE+', 'AJUSTE_POSITIVO', 'DEVOLUCION_CLIENTE', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO_INICIAL', 'CONTEO_VARIANZA_POS'].includes(m.type)) return true;
  // Tipos canónicos de salida
  if (['VENTA', 'MERMA', 'AJUSTE-', 'AJUSTE_NEGATIVO', 'DEVOLUCION_PROVEEDOR', 'TRANSFERENCIA_SALIDA', 'CONSUMO_PRODUCCION', 'CONTEO_VARIANZA_NEG'].includes(m.type)) return false;
  // AJUSTE genérico u otros: usar el signo de quantity
  return m.quantity >= 0;
}

function absQty(m: Movement): number {
  return Math.abs(m.quantity);
}

type DirectionFilter = 'ALL' | 'IN' | 'OUT';
type TypeFilter = 'ALL' | 'COMPRA' | 'VENTA' | 'AJUSTE' | 'MERMA' | 'TRANSFERENCIA';
type RangeFilter = 'TODAY' | '7D' | '30D' | 'ALL' | 'CUSTOM';

const TYPE_LABELS: Record<string, string> = {
  COMPRA: 'Compra',
  VENTA: 'Venta',
  AJUSTE: 'Ajuste',
  MERMA: 'Merma',
  TRANSFERENCIA: 'Transferencia',
};

export default function MovimientosInventarioPage() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const [direction, setDirection] = useState<DirectionFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [range, setRange] = useState<RangeFilter>('30D');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Suscripción real-time. Leemos ambas colecciones (la legacy
  // `stock_movements` y la nueva `inventoryMovements`) y las unificamos para
  // que el Kardex muestre todos los movimientos sin importar quién los generó.
  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    let legacyArr: Movement[] = [];
    let newArr: Movement[] = [];
    const merge = () => {
      const combined = [...legacyArr, ...newArr];
      // Orden desc por createdAt
      combined.sort((a, b) => {
        const ta = tsMillis(a.createdAt);
        const tb = tsMillis(b.createdAt);
        return tb - ta;
      });
      setMovements(combined);
      setLoading(false);
    };
    const qLegacy = query(
      collection(db, `businesses/${businessId}/stock_movements`),
      orderBy('createdAt', 'desc'),
      fbLimit(500),
    );
    const qNew = query(
      collection(db, `businesses/${businessId}/inventoryMovements`),
      orderBy('createdAt', 'desc'),
      fbLimit(500),
    );
    const unsubLegacy = onSnapshot(qLegacy, (snap) => {
      const arr: Movement[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        arr.push({
          id: d.id,
          productId: data.productId,
          productName: data.productName || '—',
          productCode: data.productCode,
          type: data.type || 'AJUSTE',
          quantity: data.quantity ?? 0,
          balanceAfter: data.balanceAfter,
          unitCostUSD: data.unitCostUSD ?? data.weightedAvgCost,
          warehouseId: data.warehouseId || data.almacenId,
          warehouseName: data.warehouseName || data.almacenNombre,
          reason: data.reason,
          userName: data.userName,
          createdAt: data.createdAt,
          createdByName: data.userName,
        });
      });
      legacyArr = arr;
      merge();
    }, (err) => {
      console.error('[Movimientos] stock_movements snapshot error', err);
      legacyArr = [];
      merge();
    });
    const unsubNew = onSnapshot(qNew, (snap) => {
      const arr: Movement[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
      newArr = arr;
      merge();
    }, (err) => {
      // La colección puede no existir aún si aún no se han creado entradas/salidas nuevas
      console.warn('[Movimientos] inventoryMovements snapshot warn', err);
      newArr = [];
      merge();
    });
    return () => { unsubLegacy(); unsubNew(); };
  }, [businessId]);

  function tsMillis(ca: any): number {
    if (!ca) return 0;
    if (typeof ca === 'string') return new Date(ca).getTime();
    if (ca.toMillis) return ca.toMillis();
    if (ca.seconds) return ca.seconds * 1000;
    return 0;
  }

  // Almacenes únicos para el filtro
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of movements) {
      if (m.warehouseId) map.set(m.warehouseId, m.warehouseName || m.warehouseId);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [movements]);

  // Filtrado
  const filtered = useMemo(() => {
    const now = Date.now();
    const ts = (m: Movement) => tsMillis(m.createdAt);

    return movements.filter(m => {
      // Direction (usando isEntrada para soportar legacy + nuevo)
      const entrada = isEntrada(m);
      if (direction === 'IN' && !entrada) return false;
      if (direction === 'OUT' && entrada) return false;

      // Type
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;

      // Warehouse
      if (warehouseFilter !== 'ALL' && m.warehouseId !== warehouseFilter) return false;

      // Range
      const mTime = ts(m);
      if (range === 'TODAY') {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (mTime < today.getTime()) return false;
      } else if (range === '7D') {
        if (mTime < now - 7 * 86_400_000) return false;
      } else if (range === '30D') {
        if (mTime < now - 30 * 86_400_000) return false;
      } else if (range === 'CUSTOM') {
        if (fromDate) {
          const f = new Date(fromDate).getTime();
          if (mTime < f) return false;
        }
        if (toDate) {
          const t = new Date(toDate).getTime() + 86_400_000;
          if (mTime > t) return false;
        }
      }

      // Search (producto, código, motivo)
      if (search.trim()) {
        const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const q = norm(search);
        const hay = norm(`${m.productName} ${m.productCode || ''} ${m.reason || ''}`);
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [movements, direction, typeFilter, warehouseFilter, range, fromDate, toDate, search]);

  // KPIs
  const kpis = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMovs = movements.filter(m => tsMillis(m.createdAt) >= todayStart.getTime());
    const inToday = todayMovs.filter(m => isEntrada(m));
    const outToday = todayMovs.filter(m => !isEntrada(m));
    const valIn = inToday.reduce((s, m) => s + absQty(m) * (m.unitCostUSD || 0), 0);
    const valOut = outToday.reduce((s, m) => s + absQty(m) * (m.unitCostUSD || 0), 0);
    return {
      totalToday: todayMovs.length,
      inToday: inToday.length,
      outToday: outToday.length,
      valIn,
      valOut,
      totalFiltered: filtered.length,
    };
  }, [movements, filtered]);

  const activeFilterCount =
    (direction !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (warehouseFilter !== 'ALL' ? 1 : 0) +
    (range !== '30D' ? 1 : 0);

  const clearFilters = () => {
    setDirection('ALL');
    setTypeFilter('ALL');
    setWarehouseFilter('ALL');
    setRange('30D');
    setFromDate('');
    setToDate('');
    setSearch('');
  };

  const exportCsv = () => {
    const header = 'Fecha,Tipo,Producto,Código,Cantidad,Almacén,Motivo,Usuario\n';
    const rows = filtered.map(m => {
      const fecha = formatTs(m.createdAt);
      return [fecha, m.type, m.productName, m.productCode || '', m.quantity, m.warehouseName || '', m.reason || '', m.createdByName || '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    }).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* KPIs (sin header redundante, lo pinta el orquestador) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCell
          label="Hoy"
          value={kpis.totalToday}
          sub={`${kpis.inToday} entradas · ${kpis.outToday} salidas`}
          tone="indigo"
          icon={<Activity size={13} />}
        />
        <KpiCell
          label="Valor entrante (hoy)"
          value={`$${kpis.valIn.toFixed(2)}`}
          sub="costo recibido"
          tone="emerald"
          icon={<ArrowDownToLine size={13} />}
        />
        <KpiCell
          label="Valor saliente (hoy)"
          value={`$${kpis.valOut.toFixed(2)}`}
          sub="costo despachado"
          tone="rose"
          icon={<ArrowUpFromLine size={13} />}
        />
        <KpiCell
          label="En filtro"
          value={kpis.totalFiltered}
          sub="movimientos visibles"
          tone="slate"
          icon={<Filter size={13} />}
        />
      </div>

      {/* Filtros: 1 fila slim */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Dirección */}
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-white/[0.04] p-0.5">
            {([
              { key: 'ALL', label: 'Todos' },
              { key: 'IN', label: 'Entradas', icon: <ArrowDownToLine size={11} className="text-emerald-500" /> },
              { key: 'OUT', label: 'Salidas', icon: <ArrowUpFromLine size={11} className="text-rose-500" /> },
            ] as const).map(d => (
              <button
                key={d.key}
                onClick={() => setDirection(d.key as DirectionFilter)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  direction === d.key
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-white/40 hover:text-slate-700'
                }`}
              >
                {(d as any).icon}
                {d.label}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400 cursor-pointer"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="COMPRA">Compras</option>
            <option value="VENTA">Ventas</option>
            <option value="AJUSTE">Ajustes</option>
            <option value="MERMA">Mermas</option>
            <option value="TRANSFERENCIA">Transferencias</option>
          </select>

          {/* Almacén — solo si hay 2+ */}
          {warehouses.length >= 2 && (
            <select
              value={warehouseFilter}
              onChange={e => setWarehouseFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="ALL">Todos los almacenes</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}

          {/* Rango */}
          <select
            value={range}
            onChange={e => setRange(e.target.value as RangeFilter)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none focus:border-indigo-400 cursor-pointer"
          >
            <option value="TODAY">Hoy</option>
            <option value="7D">Últimos 7 días</option>
            <option value="30D">Últimos 30 días</option>
            <option value="ALL">Todo el historial</option>
            <option value="CUSTOM">Rango personalizado…</option>
          </select>

          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por producto, código o motivo…"
              className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 placeholder:text-slate-300 outline-none focus:border-indigo-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-white/40 hover:text-rose-600 transition-colors"
            >
              <X size={11} /> Limpiar
            </button>
          )}

          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-40"
          >
            <Download size={11} /> CSV
          </button>
        </div>

        {/* Rango personalizado */}
        {range === 'CUSTOM' && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.04] pl-1">
            <Calendar size={12} className="text-slate-400" />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-2 py-1 rounded-md bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white/70"
            />
            <span className="text-xs text-slate-400">a</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-2 py-1 rounded-md bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white/70"
            />
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">Cargando movimientos…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Activity size={28} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
            <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin movimientos</p>
            <p className="text-xs text-slate-400 dark:text-white/25 mt-1">
              {activeFilterCount > 0 ? 'Probá ajustar o limpiar los filtros.' : 'Aún no hay movimientos registrados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Fecha</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Tipo</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Producto</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Cantidad</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Saldo</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Almacén</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Motivo</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Usuario</th>
                  <th className="text-right px-2 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const isIn = isEntrada(m);
                  const qty = absQty(m);
                  const tone = isIn ? 'emerald' : 'rose';
                  return (
                    <tr key={m.id} className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 whitespace-nowrap">
                        {formatTs(m.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          tone === 'emerald'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                        }`}>
                          {isIn ? <ArrowDownToLine size={10} /> : <ArrowUpFromLine size={10} />}
                          {TYPE_LABELS[m.type] || m.type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-white/80 truncate max-w-[260px]">{m.productName}</p>
                        {m.productCode && <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono">{m.productCode}</p>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {isIn ? '+' : '−'}{qty.toLocaleString('es-VE')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-500 dark:text-white/40">
                        {m.balanceAfter != null ? m.balanceAfter.toLocaleString('es-VE') : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[120px]">
                        {m.warehouseName || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[200px]" title={m.reason}>
                        {m.reason || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 truncate max-w-[120px]">
                        {m.createdByName || m.userName || '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {m.sourceDocId && (
                          <button
                            title={`Ver documento origen (${m.sourceDocType || 'doc'})`}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-400 hover:text-indigo-500"
                          >
                            <ExternalLink size={12} />
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
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────

function KpiCell({ label, value, sub, tone, icon }: {
  label: string;
  value: string | number;
  sub: string;
  tone: 'indigo' | 'emerald' | 'rose' | 'slate';
  icon: React.ReactNode;
}) {
  const iconCls = tone === 'emerald' ? 'text-emerald-500'
    : tone === 'rose' ? 'text-rose-500'
    : tone === 'indigo' ? 'text-indigo-500'
    : 'text-slate-400';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={iconCls}>{icon}</span>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-white/40">{label}</p>
      </div>
      <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>
    </div>
  );
}

function formatTs(ts: any): string {
  if (!ts) return '—';
  let date: Date;
  if (typeof ts === 'string') date = new Date(ts);
  else if (ts.toDate) date = ts.toDate();
  else if (ts.seconds) date = new Date(ts.seconds * 1000);
  else if (ts.toMillis) date = new Date(ts.toMillis());
  else return '—';
  return date.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
