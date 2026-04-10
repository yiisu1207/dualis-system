import React, { useMemo, useState, useEffect } from 'react';
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart,
} from 'recharts';
import {
  DollarSign, CreditCard, Hash, Receipt, TrendingUp, TrendingDown,
  Package, Users, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight,
  RefreshCw, Landmark, Activity, ShoppingCart, Wallet, Banknote,
  CircleDollarSign, BarChart3, PieChart as PieIcon, Star,
} from 'lucide-react';
import { useRates } from '../context/RatesContext';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

interface EstadisticasProps {
  businessId: string;
  movements: any[];
  inventoryItems: any[];
  customers: any[];
}

type Period = 'today' | 'week' | 'month' | '30d' | '90d' | 'year' | 'all';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo' },
];

const CHART_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee',
  '#a78bfa', '#fb7185', '#2dd4bf', '#60a5fa', '#c084fc',
];

const METHOD_COLORS: Record<string, string> = {
  'Efectivo': '#10b981',
  'Efectivo USD': '#059669',
  'Transferencia': '#6366f1',
  'Pago Móvil': '#8b5cf6',
  'Zelle': '#7c3aed',
  'Binance': '#f59e0b',
  'Tarjeta': '#ec4899',
  'PayPal': '#3b82f6',
};

/* ═══════════════════════════════════════════════════════════════════════════
   EXTERNAL RATES — fetched from public VE APIs on mount
   ═══════════════════════════════════════════════════════════════════════════ */

interface ExternalRate {
  name: string;
  value: number;
  change?: number;
  color: string;
  icon: string;
  symbol: string;
}

function useExternalRates() {
  const [extRates, setExtRates] = useState<ExternalRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    const rates: ExternalRate[] = [];
    try {
      // pydolarve — has multiple monitors including Binance, Paralelo, Euro
      const res = await fetch('https://pydolarve.org/api/v1/dollar?page=criptodolar', {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const monitors = data?.monitors || {};
        if (monitors.usd?.price) {
          rates.push({ name: 'Paralelo', value: monitors.usd.price, change: monitors.usd.percent, color: '#f59e0b', icon: 'dollar', symbol: 'Bs' });
        }
        if (monitors.bitcoin?.price) {
          rates.push({ name: 'Bitcoin', value: monitors.bitcoin.price, change: monitors.bitcoin.percent, color: '#f7931a', icon: 'bitcoin', symbol: 'Bs' });
        }
        if (monitors.binance?.price) {
          rates.push({ name: 'Binance', value: monitors.binance.price, change: monitors.binance.percent, color: '#f0b90b', icon: 'binance', symbol: 'Bs' });
        }
      }
    } catch {}

    try {
      // ve.dolarapi.com — clean API for official + parallel + euro
      const res2 = await fetch('https://ve.dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(6000),
      });
      if (res2.ok) {
        const arr = (await res2.json()) as Array<{ fuente: string; promedio: number; cambio?: number }>;
        for (const item of arr) {
          const name = item.fuente === 'oficial' ? 'BCV Oficial'
            : item.fuente === 'paralelo' ? 'Paralelo'
            : item.fuente === 'bitcoin' ? 'Bitcoin'
            : item.fuente === 'binance' ? 'Binance'
            : item.fuente;
          // Skip if we already have it from the other source
          if (rates.some(r => r.name === name)) continue;
          if (!item.promedio || item.promedio <= 0) continue;
          const color = name === 'BCV Oficial' ? '#22c55e'
            : name === 'Paralelo' ? '#f59e0b'
            : name === 'Bitcoin' ? '#f7931a'
            : name === 'Binance' ? '#f0b90b'
            : '#8b5cf6';
          rates.push({ name, value: item.promedio, change: item.cambio, color, icon: 'rate', symbol: 'Bs' });
        }
      }
    } catch {}

    try {
      // Euro rate
      const res3 = await fetch('https://ve.dolarapi.com/v1/euros', {
        signal: AbortSignal.timeout(6000),
      });
      if (res3.ok) {
        const data = await res3.json();
        const oficial = Array.isArray(data) ? data.find((d: any) => d.fuente === 'oficial') : data;
        if (oficial?.promedio > 0) {
          rates.push({ name: 'Euro BCV', value: oficial.promedio, change: oficial.cambio, color: '#3b82f6', icon: 'euro', symbol: 'Bs' });
        }
      }
    } catch {}

    setExtRates(rates);
    setLoading(false);
    setLastFetch(new Date());
  };

  useEffect(() => { fetchRates(); }, []);

  return { extRates, loading, lastFetch, refresh: fetchRates };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function getMovDate(m: any): Date {
  if (m.date?.toDate) return m.date.toDate();
  if (m.createdAt?.toDate) return m.createdAt.toDate();
  if (m.date instanceof Date) return m.date;
  if (typeof m.date === 'string') return new Date(m.date);
  return new Date();
}

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;
  switch (period) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 86400000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 86400000);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2000, 0, 1);
      break;
  }
  return { start, end };
}

function getPrevRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case 'today': {
      const y = new Date(now.getTime() - 86400000);
      return { start: new Date(y.getFullYear(), y.getMonth(), y.getDate()), end: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59) };
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() - 7);
      return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getTime() + 6 * 86400000 + 86399999) };
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: s, end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    }
    case '30d': return { start: new Date(now.getTime() - 60 * 86400000), end: new Date(now.getTime() - 30 * 86400000) };
    case '90d': return { start: new Date(now.getTime() - 180 * 86400000), end: new Date(now.getTime() - 90 * 86400000) };
    case 'year': return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) };
    case 'all': return { start: new Date(1990, 0, 1), end: new Date(2000, 0, 1) };
  }
}

function fmtUSD(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBs(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM TOOLTIP
   ═══════════════════════════════════════════════════════════════════════════ */

const DashTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md">
      <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="font-bold text-white">${fmtUSD(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Estadisticas({ businessId, movements, inventoryItems, customers }: EstadisticasProps) {
  const [period, setPeriod] = useState<Period>('month');
  const { rates, customRates, usingStaleRate, forceRefreshBCV } = useRates();
  const { extRates, loading: ratesLoading, lastFetch, refresh: refreshExtRates } = useExternalRates();

  const { start, end } = useMemo(() => getPeriodRange(period), [period]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getPrevRange(period), [period]);

  const clientMovs = useMemo(() => movements.filter(m => !m.isSupplierMovement), [movements]);

  const inRange = useMemo(
    () => clientMovs.filter(m => { const d = getMovDate(m); return d >= start && d <= end; }),
    [clientMovs, start, end],
  );

  const inPrev = useMemo(
    () => clientMovs.filter(m => { const d = getMovDate(m); return d >= prevStart && d <= prevEnd; }),
    [clientMovs, prevStart, prevEnd],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const facturas = inRange.filter(m => m.movementType === 'FACTURA');
    const abonos = inRange.filter(m => m.movementType === 'ABONO');
    const totalVentas = facturas.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const totalCobrado = abonos.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const txCount = facturas.length;
    const ticket = txCount > 0 ? totalVentas / txCount : 0;
    const margen = totalVentas > 0 ? ((totalCobrado / totalVentas) * 100) : 0;

    const pF = inPrev.filter(m => m.movementType === 'FACTURA');
    const pA = inPrev.filter(m => m.movementType === 'ABONO');
    const pV = pF.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const pC = pA.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const pT = pF.length;
    const pTk = pT > 0 ? pV / pT : 0;
    const pMr = pV > 0 ? ((pC / pV) * 100) : 0;

    return {
      ventas: totalVentas, cobrado: totalCobrado, txCount, ticket, margen,
      prevVentas: pV, prevCobrado: pC, prevTx: pT, prevTicket: pTk, prevMargen: pMr,
      pendiente: totalVentas - totalCobrado,
    };
  }, [inRange, inPrev]);

  // ── Daily chart ───────────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const dayCount = period === 'today' ? 24 : period === 'week' ? 7 : 30;
    const result: { label: string; venta: number; cobro: number }[] = [];
    const refEnd = end < new Date() ? end : new Date();

    if (period === 'today') {
      for (let h = 0; h < 24; h++) {
        result.push({ label: `${String(h).padStart(2, '0')}:00`, venta: 0, cobro: 0 });
      }
      for (const m of inRange) {
        const d = getMovDate(m);
        const h = d.getHours();
        if (m.movementType === 'FACTURA') result[h].venta += m.amountInUSD || 0;
        if (m.movementType === 'ABONO') result[h].cobro += m.amountInUSD || 0;
      }
    } else {
      for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(refEnd.getTime() - i * 86400000);
        const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        result.push({ label: key, venta: 0, cobro: 0 });
      }
      for (const m of inRange) {
        const d = getMovDate(m);
        const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const entry = result.find(r => r.label === key);
        if (!entry) continue;
        if (m.movementType === 'FACTURA') entry.venta += m.amountInUSD || 0;
        if (m.movementType === 'ABONO') entry.cobro += m.amountInUSD || 0;
      }
    }
    return result;
  }, [inRange, end, period]);

  // ── Top 5 Products ────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map: Record<string, { revenue: number; qty: number }> = {};
    for (const m of inRange) {
      if (m.movementType !== 'FACTURA' || !m.items) continue;
      for (const it of m.items) {
        const name = it.name || it.productName || 'Sin nombre';
        if (!map[name]) map[name] = { revenue: 0, qty: 0 };
        map[name].revenue += (it.totalUSD || it.subtotalUSD || (it.priceUSD || 0) * (it.quantity || 1));
        map[name].qty += (it.quantity || 1);
      }
    }
    const total = Object.values(map).reduce((a, b) => a + b.revenue, 0);
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([name, d]) => ({ name, revenue: d.revenue, qty: d.qty, pct: total > 0 ? (d.revenue / total) * 100 : 0 }));
  }, [inRange]);

  // ── Top 5 Clients ─────────────────────────────────────────────────────────
  const topClients = useMemo(() => {
    const map: Record<string, { revenue: number; count: number }> = {};
    for (const m of inRange) {
      if (m.movementType !== 'FACTURA') continue;
      const eid = m.entityId || 'unknown';
      if (!map[eid]) map[eid] = { revenue: 0, count: 0 };
      map[eid].revenue += (m.amountInUSD || 0);
      map[eid].count++;
    }
    const total = Object.values(map).reduce((a, b) => a + b.revenue, 0);
    const custMap: Record<string, string> = {};
    for (const c of customers) custMap[c.id] = c.nombre || c.name || c.id;
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([id, d]) => ({ name: custMap[id] || id.slice(0, 8), revenue: d.revenue, count: d.count, pct: total > 0 ? (d.revenue / total) * 100 : 0 }));
  }, [inRange, customers]);

  // ── Payment distribution ──────────────────────────────────────────────────
  const paymentDist = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of inRange) {
      if (m.movementType !== 'ABONO') continue;
      const method = m.metodoPago || 'Otro';
      map[method] = (map[method] || 0) + (m.amountInUSD || 0);
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [inRange]);

  // ── Inventory health ──────────────────────────────────────────────────────
  const inventoryHealth = useMemo(() => {
    const totalProducts = inventoryItems.length;
    let lowStock = 0, outOfStock = 0, totalValue = 0;
    for (const p of inventoryItems) {
      const stock = Number(p.stock || 0);
      const cost = Number(p.costoUSD || p.cost || 0);
      totalValue += stock * cost;
      if (stock <= 0) outOfStock++;
      else if (stock <= (p.minStock || 5)) lowStock++;
    }
    return { totalProducts, lowStock, outOfStock, totalValue };
  }, [inventoryItems]);

  // ── CxC Aging ─────────────────────────────────────────────────────────────
  const cxcAging = useMemo(() => {
    const now = new Date();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    for (const m of clientMovs) {
      if (m.movementType !== 'FACTURA' || m.estadoPago === 'PAGADO') continue;
      const d = getMovDate(m);
      const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
      const amt = m.amountInUSD || 0;
      if (days <= 0) buckets.current += amt;
      else if (days <= 30) buckets.d30 += amt;
      else if (days <= 60) buckets.d60 += amt;
      else if (days <= 90) buckets.d90 += amt;
      else buckets.over90 += amt;
    }
    return buckets;
  }, [clientMovs]);

  // ── Hourly heatmap (today view) ──────────────────────────────────────────
  const hourlyHeat = useMemo(() => {
    if (period !== 'today') return [];
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, amount: 0 }));
    for (const m of inRange) {
      if (m.movementType !== 'FACTURA') continue;
      const h = getMovDate(m).getHours();
      hours[h].count++;
      hours[h].amount += m.amountInUSD || 0;
    }
    return hours;
  }, [inRange, period]);

  // ── All rates combined ────────────────────────────────────────────────────
  const allRates = useMemo(() => {
    const result: ExternalRate[] = [];
    // BCV from context (always available, most reliable)
    if (rates.tasaBCV > 0) {
      result.push({ name: 'BCV Oficial', value: rates.tasaBCV, color: '#22c55e', icon: 'bcv', symbol: 'Bs', change: undefined });
    }
    // Custom rates from business config
    for (const cr of customRates) {
      if (!cr.enabled || cr.value <= 0) continue;
      if (result.some(r => r.name.toLowerCase() === cr.name.toLowerCase())) continue;
      result.push({ name: cr.name, value: cr.value, color: '#8b5cf6', icon: 'custom', symbol: 'Bs', change: undefined });
    }
    // External rates
    for (const er of extRates) {
      if (result.some(r => r.name === er.name)) continue;
      result.push(er);
    }
    return result;
  }, [rates, customRates, extRates]);

  /* ═════════════════════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════════════════════ */

  const card = 'bg-[#0d1424] border border-white/[0.06] rounded-2xl overflow-hidden';
  const cardInner = `${card} p-5`;

  return (
    <div className="space-y-5 pb-8">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <BarChart3 size={22} className="text-indigo-400" />
            Dashboard
          </h1>
          <p className="text-[11px] text-white/30 mt-0.5">Resumen en tiempo real de tu negocio</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wide transition-all ${
                period === opt.value
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] border border-white/[0.06]'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── EXCHANGE RATES TICKER ──────────────────────────────────────────── */}
      <div className={card}>
        <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={14} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Tasas del día</span>
            {usingStaleRate && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-[8px] font-bold text-amber-400 border border-amber-500/20">
                Usando última tasa conocida
              </span>
            )}
          </div>
          <button
            onClick={() => { refreshExtRates(); forceRefreshBCV(); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/30 hover:text-white/60 transition-all text-[10px]"
          >
            <RefreshCw size={11} className={ratesLoading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 divide-x divide-white/[0.04]">
          {allRates.length === 0 && !ratesLoading ? (
            <div className="col-span-full py-6 text-center text-white/20 text-xs">Sin tasas disponibles</div>
          ) : allRates.map((rate, i) => (
            <div key={rate.name} className="px-4 py-3.5 hover:bg-white/[0.02] transition-colors group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/25 group-hover:text-white/40 transition-colors">
                  {rate.name}
                </span>
                {rate.change !== undefined && rate.change !== 0 && (
                  <span className={`flex items-center gap-0.5 text-[9px] font-bold ${rate.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {rate.change > 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                    {Math.abs(rate.change).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-white tabular-nums">
                  {rate.value.toFixed(2)}
                </span>
                <span className="text-[10px] text-white/25 font-bold">{rate.symbol}</span>
              </div>
              <div className="mt-1 h-0.5 rounded-full overflow-hidden bg-white/[0.04]">
                <div className="h-full rounded-full transition-all" style={{ width: '100%', backgroundColor: rate.color, opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </div>
        {lastFetch && (
          <div className="px-4 py-1.5 border-t border-white/[0.04] text-[9px] text-white/15">
            Actualizado {lastFetch.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* ── MAIN KPI CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Ventas', value: kpis.ventas, prev: kpis.prevVentas, prefix: '$', Icon: DollarSign, gradient: 'from-indigo-600/20 to-violet-600/20', accent: 'text-indigo-400', border: 'border-indigo-500/20' },
          { label: 'Cobrado', value: kpis.cobrado, prev: kpis.prevCobrado, prefix: '$', Icon: Wallet, gradient: 'from-emerald-600/20 to-teal-600/20', accent: 'text-emerald-400', border: 'border-emerald-500/20' },
          { label: 'Pendiente', value: kpis.pendiente, prev: kpis.prevVentas - kpis.prevCobrado, prefix: '$', Icon: Clock, gradient: 'from-amber-600/20 to-orange-600/20', accent: 'text-amber-400', border: 'border-amber-500/20' },
          { label: 'Transacciones', value: kpis.txCount, prev: kpis.prevTx, prefix: '', Icon: ShoppingCart, gradient: 'from-pink-600/20 to-rose-600/20', accent: 'text-pink-400', border: 'border-pink-500/20' },
          { label: 'Ticket promedio', value: kpis.ticket, prev: kpis.prevTicket, prefix: '$', Icon: Receipt, gradient: 'from-cyan-600/20 to-sky-600/20', accent: 'text-cyan-400', border: 'border-cyan-500/20' },
        ].map(kpi => {
          const change = pctChange(kpi.value, kpi.prev);
          const isUp = change >= 0;
          // For "Pendiente", down is good
          const isPendiente = kpi.label === 'Pendiente';
          const isGood = isPendiente ? !isUp : isUp;
          return (
            <div key={kpi.label} className={`${card} border ${kpi.border} relative overflow-hidden group hover:border-white/[0.12] transition-all`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.gradient} opacity-50`} />
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{kpi.label}</span>
                  <kpi.Icon size={16} className={`${kpi.accent} opacity-60`} />
                </div>
                <p className="text-2xl font-black text-white tabular-nums">
                  {kpi.prefix}{fmtUSD(kpi.value)}
                </p>
                {kpi.prev > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isGood ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-white/20">vs anterior</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── VENTAS EN BS (referential) ─────────────────────────────────────── */}
      {rates.tasaBCV > 0 && (
        <div className={`${card} p-4 flex flex-wrap items-center gap-6`}>
          <div className="flex items-center gap-2">
            <Banknote size={15} className="text-emerald-400/60" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/25">Equivalente en Bolívares (BCV)</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-[9px] text-white/20 uppercase tracking-wider">Ventas</span>
              <p className="text-sm font-black text-white/70 tabular-nums">Bs {fmtBs(kpis.ventas * rates.tasaBCV)}</p>
            </div>
            <div>
              <span className="text-[9px] text-white/20 uppercase tracking-wider">Cobrado</span>
              <p className="text-sm font-black text-white/70 tabular-nums">Bs {fmtBs(kpis.cobrado * rates.tasaBCV)}</p>
            </div>
            <div>
              <span className="text-[9px] text-white/20 uppercase tracking-wider">Pendiente</span>
              <p className="text-sm font-black text-amber-400/70 tabular-nums">Bs {fmtBs(kpis.pendiente * rates.tasaBCV)}</p>
            </div>
            <div>
              <span className="text-[9px] text-white/20 uppercase tracking-wider">Inventario</span>
              <p className="text-sm font-black text-white/70 tabular-nums">Bs {fmtBs(inventoryHealth.totalValue * rates.tasaBCV)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CHARTS ROW 1: Sales + Payments ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales chart — spans 2 cols */}
        <div className={`${cardInner} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-indigo-400" />
              <h3 className="text-sm font-black text-white">
                {period === 'today' ? 'Ventas por hora' : 'Ventas diarias'}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Ventas</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Cobros</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={dailyData}>
              <defs>
                <linearGradient id="ventaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} />
              <Tooltip content={<DashTooltip />} />
              <Bar dataKey="venta" name="Ventas" fill="#818cf8" radius={[6, 6, 0, 0]} barSize={period === 'today' ? 12 : 16} />
              <Line dataKey="cobro" name="Cobros" stroke="#34d399" strokeWidth={2.5} dot={false} strokeLinecap="round" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Payment methods */}
        <div className={cardInner}>
          <div className="flex items-center gap-2 mb-4">
            <PieIcon size={14} className="text-pink-400" />
            <h3 className="text-sm font-black text-white">Métodos de pago</h3>
          </div>
          {paymentDist.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-white/15">
              <CreditCard size={32} className="mb-2" />
              <span className="text-xs">Sin cobros</span>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" nameKey="name" paddingAngle={3} strokeWidth={0}>
                    {paymentDist.map((entry, i) => (
                      <Cell key={i} fill={METHOD_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${fmtUSD(v)}`}
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 }}
                    itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {paymentDist.map((p, i) => {
                  const total = paymentDist.reduce((a, b) => a + b.value, 0);
                  const pct = total > 0 ? (p.value / total) * 100 : 0;
                  return (
                    <div key={p.name} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: METHOD_COLORS[p.name] || CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-white/50 truncate flex-1">{p.name}</span>
                      <span className="text-white/70 font-bold tabular-nums">${fmtUSD(p.value)}</span>
                      <span className="text-white/25 tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── CHARTS ROW 2: Tops + Inventory + CxC ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top 5 productos */}
        <div className={cardInner}>
          <div className="flex items-center gap-2 mb-4">
            <Star size={14} className="text-amber-400" />
            <h3 className="text-sm font-black text-white">Top Productos</h3>
          </div>
          {topProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-white/15">
              <Package size={28} className="mb-2" />
              <span className="text-xs">Sin ventas</span>
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="group">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-lg bg-white/[0.06] flex items-center justify-center text-[10px] font-black text-white/40">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-bold text-white/80 truncate flex-1">{p.name}</span>
                    <span className="text-[10px] text-white/30 tabular-nums">{p.qty} uds</span>
                  </div>
                  <div className="flex items-center gap-2 ml-7">
                    <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.pct}%`, backgroundColor: CHART_COLORS[i] }} />
                    </div>
                    <span className="text-[11px] font-bold text-white/50 tabular-nums w-16 text-right">${fmtUSD(p.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 clientes */}
        <div className={cardInner}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-cyan-400" />
            <h3 className="text-sm font-black text-white">Top Clientes</h3>
          </div>
          {topClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-white/15">
              <Users size={28} className="mb-2" />
              <span className="text-xs">Sin clientes</span>
            </div>
          ) : (
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-lg bg-white/[0.06] flex items-center justify-center text-[10px] font-black text-white/40">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-bold text-white/80 truncate flex-1">{c.name}</span>
                    <span className="text-[10px] text-white/30 tabular-nums">{c.count} ops</span>
                  </div>
                  <div className="flex items-center gap-2 ml-7">
                    <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c.pct}%`, backgroundColor: CHART_COLORS[i] }} />
                    </div>
                    <span className="text-[11px] font-bold text-white/50 tabular-nums w-16 text-right">${fmtUSD(c.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inventory + CxC health */}
        <div className="space-y-4">
          {/* Inventory health */}
          <div className={cardInner}>
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-violet-400" />
              <h3 className="text-sm font-black text-white">Inventario</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] rounded-xl p-3">
                <span className="text-[9px] text-white/25 uppercase tracking-wider font-bold">Productos</span>
                <p className="text-lg font-black text-white tabular-nums">{inventoryHealth.totalProducts}</p>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-3">
                <span className="text-[9px] text-white/25 uppercase tracking-wider font-bold">Valor total</span>
                <p className="text-lg font-black text-white tabular-nums">${fmtUSD(inventoryHealth.totalValue)}</p>
              </div>
              {inventoryHealth.lowStock > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                  <span className="text-[9px] text-amber-400/60 uppercase tracking-wider font-bold">Stock bajo</span>
                  <p className="text-lg font-black text-amber-400 tabular-nums">{inventoryHealth.lowStock}</p>
                </div>
              )}
              {inventoryHealth.outOfStock > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3">
                  <span className="text-[9px] text-rose-400/60 uppercase tracking-wider font-bold">Agotados</span>
                  <p className="text-lg font-black text-rose-400 tabular-nums">{inventoryHealth.outOfStock}</p>
                </div>
              )}
            </div>
          </div>

          {/* CxC Aging */}
          <div className={cardInner}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-400" />
              <h3 className="text-sm font-black text-white">Antigüedad CxC</h3>
            </div>
            {(() => {
              const total = cxcAging.current + cxcAging.d30 + cxcAging.d60 + cxcAging.d90 + cxcAging.over90;
              if (total <= 0) return <p className="text-xs text-white/20 text-center py-4">Sin cuentas pendientes</p>;
              const bars = [
                { label: '0-30d', value: cxcAging.d30, color: '#22c55e' },
                { label: '31-60d', value: cxcAging.d60, color: '#f59e0b' },
                { label: '61-90d', value: cxcAging.d90, color: '#f97316' },
                { label: '+90d', value: cxcAging.over90, color: '#ef4444' },
              ].filter(b => b.value > 0);
              return (
                <div className="space-y-2">
                  {bars.map(b => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/30 w-12 font-bold">{b.label}</span>
                      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(b.value / total) * 100}%`, backgroundColor: b.color }} />
                      </div>
                      <span className="text-[10px] text-white/40 font-bold tabular-nums w-14 text-right">${fmtUSD(b.value)}</span>
                    </div>
                  ))}
                  <div className="pt-1.5 mt-1.5 border-t border-white/[0.04] flex justify-between">
                    <span className="text-[10px] text-white/25 font-bold">Total pendiente</span>
                    <span className="text-[11px] text-white/60 font-black tabular-nums">${fmtUSD(total)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── HOURLY HEATMAP (only for "today" period) ──────────────────────── */}
      {period === 'today' && hourlyHeat.length > 0 && (
        <div className={cardInner}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-violet-400" />
            <h3 className="text-sm font-black text-white">Actividad por hora</h3>
          </div>
          <div className="grid grid-cols-12 gap-1">
            {hourlyHeat.map(h => {
              const max = Math.max(...hourlyHeat.map(x => x.count), 1);
              const intensity = h.count / max;
              return (
                <div key={h.hour} className="text-center group" title={`${h.hour}:00 — ${h.count} ventas ($${fmtUSD(h.amount)})`}>
                  <div className="h-12 rounded-lg flex items-end justify-center transition-all"
                    style={{ backgroundColor: `rgba(99, 102, 241, ${Math.max(intensity * 0.6, 0.03)})` }}>
                    {h.count > 0 && (
                      <span className="text-[9px] font-bold text-white/60 pb-1">{h.count}</span>
                    )}
                  </div>
                  <span className="text-[8px] text-white/20 mt-1 block">{h.hour}h</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
