// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD INVENTARIO — Hub principal del módulo                         ║
// ║                                                                          ║
// ║  Una sola pantalla que conecta TODO:                                     ║
// ║   · KPIs vivos: valor inventario, productos, stock bajo, valor 30d       ║
// ║   · Alertas: stock crítico (rojo), bajo (ámbar), agotado, sin movimiento ║
// ║   · Top movimientos: últimos 8 del kardex con click-through              ║
// ║   · Top productos: por valor en stock                                    ║
// ║   · Accesos rápidos: Nueva entrada · Nueva salida · Conteo · Almacenes   ║
// ║                                                                          ║
// ║  Lee de: businesses/{bid}/products + businesses/{bid}/stock_movements    ║
// ║  (las dos fuentes legacy que SÍ tienen data en cuentas existentes)       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  Package, AlertTriangle, TrendingUp, TrendingDown, DollarSign,
  ArrowDownToLine, ArrowUpFromLine, Activity, Building2, ClipboardList,
  Boxes, Plus, ChevronRight, Clock, AlertCircle, Sparkles, Zap,
  ShoppingCart, Timer, MessageCircle,
} from 'lucide-react';
import { predictRupture, sortByUrgency, buildWhatsAppMessage, type RuptureRisk } from '../../utils/stockPrediction';

interface ProductSnap {
  id: string;
  codigo?: string;
  nombre: string;
  stock?: number;
  stockMinimo?: number;
  costoUSD?: number;
  precioUSD?: number;
  precioMayorUSD?: number;
  categoria?: string;
  stockByAlmacen?: Record<string, number>;
  updatedAt?: any;
}

interface MovSnap {
  id: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  type: string;
  quantity: number;
  unitCostUSD?: number;
  reason?: string;
  userName?: string;
  createdByName?: string;
  createdAt: any;
}

const ENTRY_TYPES = new Set(['COMPRA', 'RECEPCION', 'AJUSTE+', 'AJUSTE_POSITIVO', 'DEVOLUCION_CLIENTE', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO_INICIAL', 'CONTEO_VARIANZA_POS']);
const EXIT_TYPES = new Set(['VENTA', 'MERMA', 'AJUSTE-', 'AJUSTE_NEGATIVO', 'DEVOLUCION_PROVEEDOR', 'TRANSFERENCIA_SALIDA', 'CONSUMO_PRODUCCION', 'CONTEO_VARIANZA_NEG']);

function isEntrada(type: string, qty: number): boolean {
  if (ENTRY_TYPES.has(type)) return true;
  if (EXIT_TYPES.has(type)) return false;
  return qty >= 0;
}

function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t === 'string') return new Date(t).getTime();
  if (typeof t?.toMillis === 'function') return t.toMillis();
  if (typeof t?.seconds === 'number') return t.seconds * 1000;
  return 0;
}

type SectionId = 'productos' | 'movimientos' | 'recepcion' | 'entradas' | 'salidas' | 'conteo' | 'almacenes';

interface FocusPayload {
  section: SectionId;
  productId?: string;
  productName?: string;
  movementType?: string;
}

interface DashboardInventarioProps {
  onNavigate: (target: SectionId | FocusPayload) => void;
}

export default function DashboardInventario({ onNavigate }: DashboardInventarioProps) {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [products, setProducts] = useState<ProductSnap[]>([]);
  const [moves, setMoves] = useState<MovSnap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    const u1 = onSnapshot(collection(db, `businesses/${businessId}/products`), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });
    const qMov = query(
      collection(db, `businesses/${businessId}/stock_movements`),
      orderBy('createdAt', 'desc'),
      fbLimit(500),
    );
    const u2 = onSnapshot(qMov, snap => {
      setMoves(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => { u1(); u2(); };
  }, [businessId]);

  const kpis = useMemo(() => {
    let totalUnits = 0;
    let totalValueCost = 0;
    let totalValueRetail = 0;
    let withStock = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let critStock = 0;
    for (const p of products) {
      const s = Number(p.stock || 0);
      const cost = Number(p.costoUSD || 0);
      const price = Number(p.precioUSD || 0);
      const min = Number(p.stockMinimo || 0);
      totalUnits += s;
      totalValueCost += s * cost;
      totalValueRetail += s * price;
      if (s > 0) withStock++;
      if (s === 0) outOfStock++;
      else if (min > 0 && s <= min) critStock++;
      else if (s > 0 && s <= 5) lowStock++;
    }
    const margin = totalValueRetail - totalValueCost;
    const marginPct = totalValueCost > 0 ? (margin / totalValueCost) * 100 : 0;

    const now = Date.now();
    const day30 = now - 30 * 24 * 3600 * 1000;
    let in30Count = 0;
    let in30Value = 0;
    let out30Count = 0;
    let out30Value = 0;
    for (const m of moves) {
      const ts = tsMillis(m.createdAt);
      if (ts < day30) continue;
      const q = Math.abs(Number(m.quantity || 0));
      const v = q * Number(m.unitCostUSD || 0);
      if (isEntrada(m.type, m.quantity)) {
        in30Count++; in30Value += v;
      } else {
        out30Count++; out30Value += v;
      }
    }
    return {
      totalUnits, totalValueCost, totalValueRetail, margin, marginPct,
      withStock, outOfStock, lowStock, critStock,
      in30Count, in30Value, out30Count, out30Value,
      total: products.length,
    };
  }, [products, moves]);

  const criticalProducts = useMemo(() => {
    return products
      .map(p => ({
        ...p,
        _stock: Number(p.stock || 0),
        _min: Number(p.stockMinimo || 0),
      }))
      .filter(p => {
        if (p._stock === 0) return true;
        if (p._min > 0 && p._stock <= p._min) return true;
        return false;
      })
      .sort((a, b) => {
        if (a._stock === 0 && b._stock !== 0) return -1;
        if (b._stock === 0 && a._stock !== 0) return 1;
        return a._stock - b._stock;
      })
      .slice(0, 8);
  }, [products]);

  // Sugerencias de pedido: productos cuyo stock cayó al mínimo Y tienen
  // stockMaximo definido. La cantidad sugerida es (stockMaximo - stockActual).
  const reorderSuggestions = useMemo(() => {
    return products
      .map(p => {
        const stock = Number(p.stock || 0);
        const min = Number(p.stockMinimo || 0);
        const max = Number((p as any).stockMaximo || 0);
        const cost = Number(p.costoUSD || 0);
        if (max <= 0 || max <= min) return null;
        if (min > 0 && stock > min) return null;
        const sugerido = Math.max(1, max - stock);
        return { ...p, _stock: stock, _min: min, _max: max, _sugerido: sugerido, _costoTotal: sugerido * cost };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b._costoTotal - a._costoTotal)
      .slice(0, 8);
  }, [products]);

  const totalReorderUSD = useMemo(() => reorderSuggestions.reduce((s, p) => s + p._costoTotal, 0), [reorderSuggestions]);

  // Predicción de ruptura: cruzamos los moves de salida con los productos
  // para estimar cuándo se agota cada uno al ritmo actual.
  //
  // Requisitos mínimos para mostrar predicción confiable:
  //   - El negocio debe tener >= 7 días de historial de ventas (medido como
  //     spread entre el primer y último movimiento de salida).
  //   - Cada producto necesita >= 3 eventos de venta para que su predicción
  //     individual sea confiable. Con 1-2 ventas la velocidad es ruido.
  // Si no se cumple lo primero, se oculta el panel completo y se muestra
  // un mensaje de "recopilando datos" (ver render). Si no se cumple lo
  // segundo a nivel SKU, ese SKU específico se omite.
  const MIN_HISTORY_DAYS = 7;
  const MIN_EVENTS_PER_SKU = 3;

  const { ruptureRisks, hasEnoughHistory, daysOfHistory } = useMemo(() => {
    if (products.length === 0 || moves.length === 0) {
      return { ruptureRisks: [] as RuptureRisk[], hasEnoughHistory: false, daysOfHistory: 0 };
    }
    // Agrupar movements de salida por productId
    const salesByProduct = new Map<string, Array<{ date: string; quantity: number }>>();
    let firstSaleMs = Infinity;
    let lastSaleMs = 0;
    for (const m of moves) {
      if (!m.productId) continue;
      if (!isEntrada(m.type, m.quantity)) {
        const ms = tsMillis(m.createdAt);
        if (ms > 0) {
          if (ms < firstSaleMs) firstSaleMs = ms;
          if (ms > lastSaleMs) lastSaleMs = ms;
        }
        const date = typeof m.createdAt === 'string'
          ? m.createdAt
          : (m.createdAt?.toDate?.()?.toISOString?.() ?? new Date(ms).toISOString());
        const arr = salesByProduct.get(m.productId) || [];
        arr.push({ date, quantity: Math.abs(Number(m.quantity || 0)) });
        salesByProduct.set(m.productId, arr);
      }
    }
    const days = firstSaleMs === Infinity ? 0 : Math.max(0, (lastSaleMs - firstSaleMs) / 86_400_000);
    const enough = days >= MIN_HISTORY_DAYS;
    if (!enough) {
      return { ruptureRisks: [] as RuptureRisk[], hasEnoughHistory: false, daysOfHistory: days };
    }
    const risks: RuptureRisk[] = [];
    for (const p of products) {
      const events = salesByProduct.get(p.id);
      // Filtro a nivel SKU: necesitamos >=3 eventos para que la velocidad
      // promedio no sea ruido (1 venta no dice nada de la tendencia).
      if (!events || events.length < MIN_EVENTS_PER_SKU) continue;
      const r = predictRupture({
        productId: p.id,
        productName: p.nombre,
        productCode: p.codigo,
        currentStock: Number(p.stock || 0),
        salesEvents: events,
      });
      // Solo nos interesan los que se agotan en <14 días
      if (r && r.daysToRupture <= 14) risks.push(r);
    }
    return {
      ruptureRisks: sortByUrgency(risks).slice(0, 10),
      hasEnoughHistory: true,
      daysOfHistory: days,
    };
  }, [products, moves]);

  const handleSendWhatsApp = () => {
    const msg = buildWhatsAppMessage(ruptureRisks);
    if (!msg) return;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const topByValue = useMemo(() => {
    return products
      .map(p => ({ ...p, _value: Number(p.stock || 0) * Number(p.costoUSD || 0) }))
      .filter(p => p._value > 0)
      .sort((a, b) => b._value - a._value)
      .slice(0, 6);
  }, [products]);

  const recentMoves = useMemo(() => moves.slice(0, 8), [moves]);

  const stockHealthPct = kpis.total > 0 ? Math.round(((kpis.total - kpis.outOfStock - kpis.critStock) / kpis.total) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-64 rounded-xl bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
          <div className="h-64 rounded-xl bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
          <div className="h-64 rounded-xl bg-slate-100 dark:bg-white/[0.02] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* HERO: Valor del inventario + salud + flujo 30d */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-white/[0.03] dark:via-indigo-500/[0.04] dark:to-white/[0.02] p-5 sm:p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Bloque 1: Valor */}
          <div data-tour="inv-kpi-valor">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
              <DollarSign size={12} className="text-emerald-500" />
              Valor del inventario
            </div>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
              ${kpis.totalValueCost.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <span className="text-slate-500 dark:text-white/50">a costo</span>
              <span className="text-slate-300 dark:text-white/20">·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                ${kpis.totalValueRetail.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-slate-500 dark:text-white/50">a precio detal</span>
            </div>
            {kpis.marginPct > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                <TrendingUp size={11} />
                Margen potencial +{kpis.marginPct.toFixed(1)}%
              </div>
            )}
          </div>

          {/* Bloque 2: Salud del catálogo */}
          <div className="md:border-l md:border-slate-200 dark:md:border-white/[0.06] md:pl-5" data-tour="inv-kpi-salud">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
              <Sparkles size={12} className="text-indigo-500" />
              Salud del catálogo
            </div>
            <div className="flex items-end gap-2">
              <p className="text-3xl sm:text-4xl font-bold tabular-nums text-slate-900 dark:text-white">{stockHealthPct}<span className="text-lg text-slate-400">%</span></p>
              <span className="text-[11px] text-slate-500 dark:text-white/40 mb-1.5">productos sanos</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.05] overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${kpis.total > 0 ? ((kpis.total - kpis.outOfStock - kpis.critStock - kpis.lowStock) / kpis.total) * 100 : 0}%` }}
                title={`${kpis.total - kpis.outOfStock - kpis.critStock - kpis.lowStock} sanos`}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${kpis.total > 0 ? (kpis.lowStock / kpis.total) * 100 : 0}%` }}
                title={`${kpis.lowStock} stock bajo`}
              />
              <div
                className="bg-orange-500 transition-all"
                style={{ width: `${kpis.total > 0 ? (kpis.critStock / kpis.total) * 100 : 0}%` }}
                title={`${kpis.critStock} crítico`}
              />
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${kpis.total > 0 ? (kpis.outOfStock / kpis.total) * 100 : 0}%` }}
                title={`${kpis.outOfStock} agotado`}
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[10px]">
              <span className="text-slate-500 dark:text-white/40 tabular-nums">{kpis.total - kpis.outOfStock - kpis.critStock - kpis.lowStock} ok</span>
              <span className="text-amber-600 dark:text-amber-400 tabular-nums">{kpis.lowStock} bajo</span>
              <span className="text-orange-600 dark:text-orange-400 tabular-nums">{kpis.critStock} crit.</span>
              <span className="text-rose-600 dark:text-rose-400 tabular-nums">{kpis.outOfStock} agot.</span>
            </div>
          </div>

          {/* Bloque 3: Flujo 30d */}
          <div className="md:border-l md:border-slate-200 dark:md:border-white/[0.06] md:pl-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">
              <Activity size={12} className="text-violet-500" />
              Flujo últimos 30 días
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mb-0.5">
                  <ArrowDownToLine size={11} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Entradas</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{kpis.in30Count}</p>
                <p className="text-[11px] text-slate-500 dark:text-white/40 tabular-nums">${kpis.in30Value.toFixed(2)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 mb-0.5">
                  <ArrowUpFromLine size={11} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Salidas</span>
                </div>
                <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{kpis.out30Count}</p>
                <p className="text-[11px] text-slate-500 dark:text-white/40 tabular-nums">${kpis.out30Value.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Acciones rápidas — contents en wrappers para no romper el grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 auto-rows-fr">
        <div data-tour="inv-quick-recepcion" className="block w-full">
          <QuickAction
            icon={<ArrowDownToLine size={16} />}
            label="Recepción"
            sub="Ingreso desde proveedor"
            tone="emerald"
            onClick={() => onNavigate('recepcion')}
          />
        </div>
        <div data-tour="inv-quick-salida" className="block w-full">
          <QuickAction
            icon={<ArrowUpFromLine size={16} />}
            label="Nueva salida"
            sub="Despacho · merma"
            tone="rose"
            onClick={() => onNavigate('salidas')}
          />
        </div>
        <div data-tour="inv-quick-conteo" className="block w-full">
          <QuickAction
            icon={<ClipboardList size={16} />}
            label="Iniciar conteo"
            sub="Sesión cíclica"
            tone="violet"
            onClick={() => onNavigate('conteo')}
          />
        </div>
        <div data-tour="inv-quick-kardex" className="block w-full">
          <QuickAction
            icon={<Activity size={16} />}
            label="Ver kardex"
            sub="Historial completo"
            tone="indigo"
            onClick={() => onNavigate('movimientos')}
          />
        </div>
      </div>

      {/* Stats secundarios */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 auto-rows-fr">
        <StatChip
          icon={<Package size={13} />}
          label="Productos"
          value={kpis.total}
          sub={`${kpis.withStock} con stock`}
          onClick={() => onNavigate('productos')}
        />
        <StatChip
          icon={<Boxes size={13} />}
          label="Unidades"
          value={kpis.totalUnits.toLocaleString('es-VE')}
          sub="suma global"
        />
        <StatChip
          icon={<AlertTriangle size={13} />}
          label="Atención"
          value={kpis.outOfStock + kpis.critStock + kpis.lowStock}
          sub={`${kpis.outOfStock} agotados`}
          tone={kpis.outOfStock > 10 ? 'rose' : 'amber'}
        />
        <StatChip
          icon={<Building2 size={13} />}
          label="Almacenes"
          value={1}
          sub="virtual · legacy"
          onClick={() => onNavigate('almacenes')}
        />
      </div>

      {/* Panel "Pedir hoy" — sugerencias de reorden basadas en stockMáx − stockActual */}
      {reorderSuggestions.length > 0 && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/30 dark:from-emerald-500/[0.06] dark:via-white/[0.02] dark:to-emerald-500/[0.04] overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-200/60 dark:border-emerald-500/20 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow">
                <ShoppingCart size={13} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pedir hoy</h3>
                <p className="text-[11px] text-slate-500 dark:text-white/50">
                  {reorderSuggestions.length} producto{reorderSuggestions.length !== 1 && 's'} bajo el mínimo · estimado <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">${totalReorderUSD.toFixed(2)}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('recepcion')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm"
            >
              Ir a Recepción <ChevronRight size={12} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-emerald-100/40 dark:bg-emerald-500/[0.04]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-white/50">Producto</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-white/50 w-16">Stock</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-white/50 w-16">Mín</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-white/50 w-16">Máx</th>
                  <th className="text-right px-2 py-2 font-semibold text-emerald-700 dark:text-emerald-400 w-20">Pedir</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600 dark:text-white/50 w-24">Costo est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100/60 dark:divide-emerald-500/[0.08]">
                {reorderSuggestions.map(p => (
                  <tr key={p.id} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-500/[0.04]">
                    <td className="px-3 py-1.5">
                      <p className="font-semibold text-slate-800 dark:text-white truncate max-w-[260px]">{p.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.codigo || p.id.slice(0, 10)}</p>
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${p._stock === 0 ? 'text-rose-600' : 'text-amber-600'}`}>{p._stock}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p._min || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p._max}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">+{p._sugerido}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-white/70">${p._costoTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panel informativo cuando aún no hay suficiente histórico para
          predecir con precisión (< 7 días de ventas). Evita mostrar números
          alarmistas basados en 1-2 días de operación. */}
      {!hasEnoughHistory && moves.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] p-4 flex items-center gap-3" data-tour="inv-prediccion">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Timer size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recopilando datos para predicción</h3>
            <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5">
              Necesitamos al menos <strong>7 días de ventas</strong> para predecir con precisión cuándo se agota cada producto.
              {daysOfHistory > 0 && (
                <> Llevas <strong className="tabular-nums">{Math.floor(daysOfHistory)} día{Math.floor(daysOfHistory) !== 1 ? 's' : ''}</strong> de historial — sigue vendiendo y la predicción se activará sola.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Panel "Predicción de ruptura" — usa velocidad histórica de venta para
          estimar cuándo se agotan los productos. Botón → mensaje pre-armado WA.
          Solo aparece si hay >=7 días de histórico (ver hasEnoughHistory). */}
      {ruptureRisks.length > 0 && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-gradient-to-br from-rose-50/60 via-white to-rose-50/30 dark:from-rose-500/[0.06] dark:via-white/[0.02] dark:to-rose-500/[0.04] overflow-hidden" data-tour="inv-prediccion">
          <div className="px-4 py-3 border-b border-rose-200/60 dark:border-rose-500/20 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow">
                <Timer size={13} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Predicción de ruptura</h3>
                <p className="text-[11px] text-slate-500 dark:text-white/50">
                  {ruptureRisks.filter(r => r.severity === 'critical' || r.severity === 'high').length} producto(s) urgentes · proyección por velocidad de venta
                </p>
              </div>
            </div>
            <button
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm"
              title="Abre WhatsApp con un mensaje pre-armado para enviarlo a tu proveedor"
            >
              <MessageCircle size={12} /> Avisar al proveedor
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rose-100/40 dark:bg-rose-500/[0.04]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-white/50">Producto</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-white/50 w-16">Stock</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-white/50 w-20">Vel/día</th>
                  <th className="text-left px-2 py-2 font-semibold text-rose-700 dark:text-rose-400 w-44">Proyección</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100/60 dark:divide-rose-500/[0.08]">
                {ruptureRisks.map(r => {
                  const sevColor = r.severity === 'critical' ? 'text-rose-600 dark:text-rose-400'
                    : r.severity === 'high' ? 'text-orange-600 dark:text-orange-400'
                    : r.severity === 'medium' ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-600 dark:text-white/60';
                  return (
                    <tr key={r.productId} className="hover:bg-rose-50/50 dark:hover:bg-rose-500/[0.04]">
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-800 dark:text-white truncate max-w-[260px]">{r.productName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.productCode || r.productId.slice(0, 10)}</p>
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${r.currentStock === 0 ? 'text-rose-600' : 'text-slate-700 dark:text-white/80'}`}>{r.currentStock}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{r.velocityPerDay.toFixed(1)}</td>
                      <td className={`px-2 py-1.5 font-semibold ${sevColor}`}>{r.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grids principales: Alertas + Top productos + Movimientos recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alertas de stock */}
        <Panel
          title="Alertas de stock"
          icon={<AlertCircle size={14} className="text-rose-500" />}
          actionLabel="Ver catálogo"
          onAction={() => onNavigate('productos')}
        >
          {criticalProducts.length === 0 ? (
            <EmptyState text="Todo tu stock está saludable" emoji="🎉" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {criticalProducts.map(p => {
                const isOut = p._stock === 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => onNavigate({ section: 'productos', productId: p.id, productName: p.nombre })}
                    className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] text-left"
                  >
                    <div className={`w-1 h-8 rounded-full ${isOut ? 'bg-rose-500' : 'bg-orange-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-white/80 truncate">{p.nombre}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/30 font-mono">{p.codigo || p.id.slice(0, 8)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {p._stock}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-white/30">{isOut ? 'agotado' : `mín ${p._min}`}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Top productos por valor */}
        <Panel
          title="Top productos en stock"
          icon={<TrendingUp size={14} className="text-emerald-500" />}
          actionLabel="Ver todos"
          onAction={() => onNavigate('productos')}
        >
          {topByValue.length === 0 ? (
            <EmptyState text="Sin productos con valor" emoji="📦" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {topByValue.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate({ section: 'productos', productId: p.id, productName: p.nombre })}
                  className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] text-left"
                >
                  <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                    i === 0 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                    : i === 1 ? 'bg-slate-300/40 text-slate-600 dark:text-white/60'
                    : i === 2 ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
                    : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-white/30'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-white/80 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-slate-400 dark:text-white/30 tabular-nums">
                      {p.stock || 0} und × ${(p.costoUSD || 0).toFixed(2)}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                    ${p._value.toFixed(0)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Movimientos recientes */}
        <Panel
          title="Últimos movimientos"
          icon={<Clock size={14} className="text-indigo-500" />}
          actionLabel="Ver kardex"
          onAction={() => onNavigate('movimientos')}
        >
          {recentMoves.length === 0 ? (
            <EmptyState text="Sin movimientos registrados" emoji="📊" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {recentMoves.map(m => {
                const entrada = isEntrada(m.type, m.quantity);
                const qty = Math.abs(Number(m.quantity || 0));
                const date = new Date(tsMillis(m.createdAt));
                return (
                  <button
                    key={m.id}
                    onClick={() => onNavigate({ section: 'movimientos', productId: m.productId, productName: m.productName })}
                    className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] text-left"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      entrada ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}>
                      {entrada ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-white/80 truncate">{m.productName || '—'}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/30">
                        {date.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        <span className="mx-1">·</span>
                        {m.userName || m.createdByName || '—'}
                      </p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums shrink-0 ${
                      entrada ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {entrada ? '+' : '−'}{qty}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────

function QuickAction({ icon, label, sub, tone, onClick }: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone: 'emerald' | 'rose' | 'violet' | 'indigo';
  onClick: () => void;
}) {
  const toneMap = {
    emerald: 'from-emerald-500/10 to-emerald-500/5 hover:from-emerald-500/20 hover:to-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    rose: 'from-rose-500/10 to-rose-500/5 hover:from-rose-500/20 hover:to-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
    violet: 'from-violet-500/10 to-violet-500/5 hover:from-violet-500/20 hover:to-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
    indigo: 'from-indigo-500/10 to-indigo-500/5 hover:from-indigo-500/20 hover:to-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
  };
  return (
    <button
      onClick={onClick}
      className={`group relative w-full h-full overflow-hidden bg-gradient-to-br ${toneMap[tone]} border rounded-xl p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between min-h-[92px]`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/[0.08] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <Plus size={12} className="opacity-40 ml-auto group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
      <div className="mt-2.5">
        <p className="text-sm font-bold leading-tight">{label}</p>
        <p className="text-[10px] opacity-60 mt-1 leading-snug">{sub}</p>
      </div>
    </button>
  );
}

function StatChip({ icon, label, value, sub, tone, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  tone?: 'amber' | 'rose';
  onClick?: () => void;
}) {
  const valueColor = tone === 'rose' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-900 dark:text-white';
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`text-left w-full h-full rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4 transition-all flex flex-col justify-between min-h-[92px] ${
        onClick ? 'hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:shadow-sm cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
        {icon}
        {label}
      </div>
      <div className="mt-2.5">
        <p className={`text-xl font-bold tabular-nums leading-tight ${valueColor}`}>{value}</p>
        <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1 leading-snug">{sub}</p>
      </div>
    </button>
  );
}

function Panel({ title, icon, actionLabel, onAction, children }: {
  title: string;
  icon: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] flex flex-col">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-xs font-semibold text-slate-700 dark:text-white/80">{title}</h3>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:gap-1 transition-all"
          >
            {actionLabel} <ChevronRight size={11} />
          </button>
        )}
      </div>
      <div className="flex-1 max-h-[420px] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text, emoji }: { text: string; emoji: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-xs text-slate-400 dark:text-white/30">{text}</p>
    </div>
  );
}
