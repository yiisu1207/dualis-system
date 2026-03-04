import React, { useState, useEffect, useMemo } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useRates } from '../../context/RatesContext';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Movement, InventoryItem } from '../../../types';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ShoppingCart,
  AlertTriangle,
  ArrowUpRight,
  Users,
  Building2,
  Zap,
  BarChart3,
  Star,
  Activity,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type Period = 'today' | '7d' | '30d';

// ── Helpers ─────────────────────────────────────────────────────────────────
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysArray(period: Period): string[] {
  const count = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (count - 1 - i));
    return d.toISOString().split('T')[0];
  });
}

function getPrevRange(period: Period): { start: string; end: string } {
  const count = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const end = new Date();
  end.setDate(end.getDate() - count);
  const start = new Date(end);
  start.setDate(start.getDate() - count + 1);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDayLabel(dateStr: string, period: Period): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (period === '7d') return d.toLocaleDateString('es-ES', { weekday: 'short' });
  if (period === '30d') return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────
const AreaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-black/40 p-3 text-xs">
      <p className="font-black text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-widest text-[10px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
          <span className="font-bold text-slate-900 dark:text-white">{fmtUSD(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  trend?: number;
  badge?: React.ReactNode;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon, iconBg, label, value, sub, trend, badge, onClick,
}) => (
  <div
    onClick={onClick}
    className={`bg-white/90 dark:bg-white/[0.04] backdrop-blur-sm border border-slate-100/80 dark:border-white/[0.07] rounded-3xl p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-50/60 dark:hover:shadow-black/30 hover:border-indigo-100/60 dark:hover:border-white/[0.14] ${onClick ? 'cursor-pointer' : ''}`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className={`w-10 h-10 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="flex flex-col items-end gap-1.5 min-w-0">
        {badge}
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-[9px] font-black px-2 py-0.5 rounded-xl shrink-0 ${
            trend >= 0
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}>
            {trend >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
    <div>
      <div className="font-syne font-bold text-[22px] text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-1.5">{label}</div>
      <div className="font-mono text-[10px] text-slate-300 dark:text-slate-600 mt-1 uppercase tracking-wide truncate">{sub}</div>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminDashboard({
  onTabChange,
}: {
  onTabChange?: (tab: string) => void;
}) {
  const { tenantId } = useTenant();
  const { rates } = useRates();
  const { userProfile } = useAuth();

  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('7d');
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, 'movements'),
      where('businessId', '==', tenantId),
      orderBy('date', 'desc'),
      limit(500),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
      setLoading(false);
    });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `businesses/${tenantId}/products`)
    );
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    });
    return () => unsub();
  }, [tenantId]);

  // ── Period helpers ────────────────────────────────────────────────────────
  const today = getToday();
  const days = useMemo(() => getDaysArray(period), [period]);
  const periodStart = days[0];
  const prevRange = useMemo(() => getPrevRange(period), [period]);

  const periodMvs = useMemo(
    () => movements.filter(m => (m.date ?? '') >= periodStart && (m.date ?? '') <= today),
    [movements, periodStart, today],
  );

  const prevMvs = useMemo(
    () => movements.filter(m => (m.date ?? '') >= prevRange.start && (m.date ?? '') <= prevRange.end),
    [movements, prevRange],
  );

  // ── KPI calculations ──────────────────────────────────────────────────────
  const calcKpis = (mvs: Movement[]) => {
    let facturado = 0, cobrado = 0, invoiceCount = 0;
    mvs.forEach(m => {
      const amt = (m as any).amountInUSD || m.amount || 0;
      if (!m.isSupplierMovement) {
        if (m.movementType === 'FACTURA') {
          facturado += amt;
          invoiceCount++;
          // Ventas POS de contado (pagado:true) son cobradas inmediatamente
          if ((m as any).pagado) cobrado += amt;
        }
        if (m.movementType === 'ABONO') cobrado += amt;
      }
    });
    return { facturado, cobrado, invoiceCount };
  };

  const current = useMemo(() => calcKpis(periodMvs), [periodMvs]);
  const prev = useMemo(() => calcKpis(prevMvs), [prevMvs]);

  const trendFact = prev.facturado > 0
    ? ((current.facturado - prev.facturado) / prev.facturado) * 100
    : undefined;
  const trendCob = prev.cobrado > 0
    ? ((current.cobrado - prev.cobrado) / prev.cobrado) * 100
    : undefined;
  const cobRate = current.facturado > 0
    ? Math.round((current.cobrado / current.facturado) * 100)
    : 0;

  // CxC / CxP acumulado (todo el historial)
  // Excluye ventas POS contado (pagado:true) y Consumidor Final — no generan deuda pendiente
  const cxcTotal = useMemo(() => {
    let t = 0;
    movements
      .filter(m => !m.isSupplierMovement && !(m as any).pagado && m.entityId !== 'CONSUMIDOR_FINAL')
      .forEach(m => {
        const amt = (m as any).amountInUSD || m.amount || 0;
        if (m.movementType === 'FACTURA') t += amt;
        if (m.movementType === 'ABONO') t -= amt;
      });
    return Math.max(0, t);
  }, [movements]);

  const cxpTotal = useMemo(() => {
    let t = 0;
    movements.filter(m => m.isSupplierMovement).forEach(m => {
      const amt = (m as any).amountInUSD || m.amount || 0;
      if (m.movementType === 'FACTURA') t += amt;
      if (m.movementType === 'ABONO') t -= amt;
    });
    return Math.max(0, t);
  }, [movements]);

  // Inventario
  const LOW = 10;
  const stockTotal = useMemo(
    () => products.reduce((s, p) => s + ((p as any).stock || (p as any).quantity || 0), 0),
    [products],
  );
  const lowStockItems = useMemo(
    () => products
      .filter(p => ((p as any).stock || (p as any).quantity || 0) < LOW)
      .sort((a, b) => ((a as any).stock || 0) - ((b as any).stock || 0))
      .slice(0, 6),
    [products],
  );

  // ── Chart data ────────────────────────────────────────────────────────────
  const areaData = useMemo(() =>
    days.map(day => {
      const dayMvs = movements.filter(
        m => m.date?.startsWith(day) && !m.isSupplierMovement,
      );
      const facturado = dayMvs
        .filter(m => m.movementType === 'FACTURA')
        .reduce((s, m) => s + ((m as any).amountInUSD || m.amount || 0), 0);
      const cobrado = dayMvs
        .filter(m => m.movementType === 'ABONO')
        .reduce((s, m) => s + ((m as any).amountInUSD || m.amount || 0), 0);
      return {
        label: fmtDayLabel(day, period),
        Facturado: parseFloat(facturado.toFixed(2)),
        Cobrado: parseFloat(cobrado.toFixed(2)),
      };
    }),
    [days, movements, period],
  );

  const pieData = useMemo(() => {
    const cxcF = periodMvs.filter(m => !m.isSupplierMovement && m.movementType === 'FACTURA').length;
    const cxcA = periodMvs.filter(m => !m.isSupplierMovement && m.movementType === 'ABONO').length;
    const cxpF = periodMvs.filter(m => m.isSupplierMovement && m.movementType === 'FACTURA').length;
    const cxpA = periodMvs.filter(m => m.isSupplierMovement && m.movementType === 'ABONO').length;
    return [
      { name: 'Facturas CxC', value: cxcF, color: '#4f6ef7' },
      { name: 'Cobros CxC',   value: cxcA, color: '#22c55e' },
      { name: 'Facturas CxP', value: cxpF, color: '#f59e0b' },
      { name: 'Pagos CxP',    value: cxpA, color: '#8b5cf6' },
    ].filter(d => d.value > 0);
  }, [periodMvs]);

  const recentMvs = useMemo(() => movements.slice(0, 12), [movements]);

  // ── Business Intelligence ──────────────────────────────────────────────────
  const CHART_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  // Inversión por categoría: agrupado por categoria, suma stock × costoUSD
  const inversionPorCategoria = useMemo(() => {
    const grouped: Record<string, number> = {};
    products.forEach(p => {
      const cat = (p as any).categoria || (p as any).category || 'Sin Categoría';
      const costo = (p as any).costoUSD || (p as any).costPrice || (p as any).costo || 0;
      const stock = (p as any).stock || (p as any).quantity || 0;
      grouped[cat] = (grouped[cat] || 0) + (costo * stock);
    });
    return Object.entries(grouped)
      .map(([name, value], i) => ({
        name: name.slice(0, 18),
        value: parseFloat(value.toFixed(2)),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [products]);

  const totalInversion = useMemo(
    () => inversionPorCategoria.reduce((s, c) => s + c.value, 0),
    [inversionPorCategoria],
  );

  // Producto estrella del período (más vendido por cantidad)
  const productoEstrella = useMemo(() => {
    const itemCounts: Record<string, { nombre: string; qty: number; revenue: number }> = {};
    periodMvs.forEach(m => {
      const items = (m as any).items;
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (!itemCounts[item.id]) itemCounts[item.id] = { nombre: item.nombre || 'Producto', qty: 0, revenue: 0 };
          itemCounts[item.id].qty += Number(item.qty || 0);
          itemCounts[item.id].revenue += Number(item.subtotal || 0);
        });
      }
    });
    const sorted = Object.values(itemCounts).sort((a, b) => b.qty - a.qty);
    return sorted.length > 0 ? sorted[0] : null;
  }, [periodMvs]);

  // Salud del inventario (normal / crítico / agotado)
  const saludInventario = useMemo(() => {
    const agotado = products.filter(p => ((p as any).stock || 0) === 0).length;
    const critico = products.filter(p => {
      const stock = (p as any).stock || 0;
      const min = (p as any).stockMinimo || (p as any).minStock || 10;
      return stock > 0 && stock < min;
    }).length;
    const normal = products.length - critico - agotado;
    return { agotado, critico, normal, total: products.length };
  }, [products]);

  // Alerta predictiva de reposición: días restantes = stock / (ventas/día en período)
  const rotacionRiesgo = useMemo(() => {
    const diasPeriodo = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    const itemVentas: Record<string, number> = {};
    periodMvs.forEach(m => {
      const items = (m as any).items;
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          itemVentas[item.id] = (itemVentas[item.id] || 0) + Number(item.qty || 0);
        });
      }
    });
    return products
      .filter(p => {
        const stock = (p as any).stock || 0;
        const vendidos = itemVentas[p.id] || 0;
        return stock > 0 && vendidos > 0;
      })
      .map(p => {
        const stock = (p as any).stock || 0;
        const vendidos = itemVentas[p.id] || 0;
        const ventaDiaria = vendidos / diasPeriodo;
        const diasRestantes = Math.floor(stock / ventaDiaria);
        return {
          nombre: (p as any).nombre || (p as any).name || 'Producto',
          stock,
          diasRestantes,
          urgente: diasRestantes <= 7,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 5);
  }, [products, periodMvs, period]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const periodLabel = period === 'today' ? 'Hoy' : period === '7d' ? '7 Días' : '30 Días';

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#4f6ef7]" size={32} />
          </div>
          <p className="text-slate-400 dark:text-slate-500 text-[13px] font-medium">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-syne font-bold text-[24px] text-slate-900 dark:text-white leading-tight">
            {greeting}, {userProfile?.displayName || 'Admin'}
          </h1>
          <p className="text-slate-400 dark:text-slate-500 text-[13px] font-medium mt-0.5">
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center bg-slate-100 dark:bg-white/[0.06] rounded-2xl p-1 gap-0.5">
            {(['today', '7d', '30d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                  period === p
                    ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {p === 'today' ? 'Hoy' : p === '7d' ? '7 Días' : '30 Días'}
              </button>
            ))}
          </div>

          <button
            onClick={() => onTabChange?.('reportes')}
            className="px-4 py-2 bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 rounded-xl text-slate-600 dark:text-slate-300 text-[12px] font-black hover:bg-slate-50 dark:hover:bg-white/10 transition-all shadow-sm flex items-center gap-2"
          >
            <BarChart3 size={13} /> Reportes
          </button>
          <button
            onClick={() => window.location.href = `/${tenantId}/pos/detal`}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl text-[12px] font-black hover:from-indigo-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-200/60 dark:shadow-blue-500/20 flex items-center gap-2 hover:scale-[1.02]"
          >
            <Zap size={13} /> Nueva Venta
          </button>
        </div>
      </div>

      {/* ── SECTION LABEL ── */}
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 -mb-4">
        Métricas · {periodLabel}
      </div>

      {/* ── KPI GRID (6 tarjetas) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={<DollarSign size={18} className="text-[#4f6ef7]" />}
          iconBg="bg-blue-50 dark:bg-blue-500/10"
          label={`Facturado — ${periodLabel}`}
          value={fmtUSD(current.facturado)}
          sub={`Bs. ${(current.facturado * rates.tasaBCV).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}
          trend={trendFact}
          onClick={() => onTabChange?.('contabilidad')}
        />
        <KpiCard
          icon={<TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-500/10"
          label={`Cobrado — ${periodLabel}`}
          value={fmtUSD(current.cobrado)}
          sub={`Eficiencia: ${cobRate}%`}
          trend={trendCob}
          onClick={() => onTabChange?.('clientes')}
        />
        <KpiCard
          icon={<Users size={18} className="text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-50 dark:bg-violet-500/10"
          label="CxC Pendiente"
          value={fmtUSD(cxcTotal)}
          sub="Saldo total clientes"
          onClick={() => onTabChange?.('clientes')}
          badge={cxcTotal > 0 ? (
            <div className="text-[9px] font-black bg-violet-50 dark:bg-violet-500/10 text-violet-500 dark:text-violet-400 px-2 py-0.5 rounded-xl uppercase tracking-widest">
              Activo
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<Building2 size={18} className="text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-50 dark:bg-amber-500/10"
          label="CxP Pendiente"
          value={fmtUSD(cxpTotal)}
          sub="Deuda con proveedores"
          onClick={() => onTabChange?.('proveedores')}
          badge={cxpTotal > 0 ? (
            <div className="text-[9px] font-black bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 px-2 py-0.5 rounded-xl uppercase tracking-widest">
              Pendiente
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<Package size={18} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-white/10"
          label="Unidades en Stock"
          value={stockTotal.toLocaleString()}
          sub={`${products.length} SKUs · ${lowStockItems.length} críticos`}
          onClick={() => onTabChange?.('inventario')}
          badge={lowStockItems.length > 0 ? (
            <div className="flex items-center gap-1 text-[9px] font-black bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 px-2 py-0.5 rounded-xl">
              <AlertTriangle size={8} /> {lowStockItems.length}
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<ShoppingCart size={18} className="text-rose-600 dark:text-rose-400" />}
          iconBg="bg-rose-50 dark:bg-rose-500/10"
          label={`Facturas — ${periodLabel}`}
          value={current.invoiceCount.toString()}
          sub={current.invoiceCount > 0
            ? `Promedio: ${fmtUSD(current.facturado / current.invoiceCount)}`
            : 'Sin facturas'
          }
          onClick={() => onTabChange?.('contabilidad')}
        />
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Area Chart */}
        <div className="lg:col-span-8 bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-white/[0.05] flex items-center justify-between">
            <div>
              <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[15px]">Facturado vs Cobrado</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{periodLabel} · En USD</p>
            </div>
            <button
              onClick={() => onTabChange?.('reportes')}
              className="text-[11px] font-black text-[#4f6ef7] hover:underline flex items-center gap-1 transition-colors"
            >
              Ver reportes <ArrowUpRight size={11} />
            </button>
          </div>

          <div className="p-6 flex-1 min-h-[260px]">
            {areaData.every(d => d.Facturado === 0 && d.Cobrado === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 gap-3">
                <div className="text-5xl">📭</div>
                <p className="text-[13px] font-semibold">Sin movimientos en este período</p>
                <p className="text-[11px]">Registra ventas o cobros para ver la gráfica</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={areaData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gFact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f6ef7" stopOpacity={isDark ? 0.25 : 0.18} />
                      <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCob" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={isDark ? 0.25 : 0.18} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: isDark ? '#475569' : '#94a3b8', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: isDark ? '#475569' : '#94a3b8', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                    width={50}
                  />
                  <Tooltip content={<AreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="Facturado"
                    stroke="#4f6ef7"
                    strokeWidth={2.5}
                    fill="url(#gFact)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#4f6ef7', strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Cobrado"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    fill="url(#gCob)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#22c55e', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="px-6 pb-5 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#4f6ef7]" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Facturado</span>
              <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{fmtUSD(current.facturado)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Cobrado</span>
              <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{fmtUSD(current.cobrado)}</span>
            </div>
          </div>
        </div>

        {/* Right panel: Pie + Rates */}
        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* Pie chart */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.05]">
              <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[14px]">Distribución</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{periodLabel} · Por tipo</p>
            </div>
            <div className="p-5">
              {pieData.length === 0 ? (
                <div className="py-6 flex flex-col items-center text-slate-300 dark:text-slate-600 gap-2">
                  <div className="text-4xl">📊</div>
                  <p className="text-[11px] font-semibold">Sin operaciones</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={62}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: any, n: any) => [v, n]}
                        contentStyle={{
                          borderRadius: '12px',
                          border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                          background: isDark ? '#1e293b' : '#fff',
                          color: isDark ? '#e2e8f0' : '#0f172a',
                          fontSize: 11,
                          boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-slate-600 dark:text-slate-400">{d.name}</span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Exchange rates */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[13px]">Tasas de Cambio</h3>
              <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/[0.04] rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-base">🇺🇸</span>
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">BCV</span>
                </div>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-[13px]">
                  Bs. {rates.tasaBCV.toFixed(2)}
                </span>
              </div>
              {rates.tasaGrupo > 0 && (
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/[0.04] rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💹</span>
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Grupo</span>
                  </div>
                  <span className="font-mono font-bold text-violet-600 dark:text-violet-400 text-[13px]">
                    Bs. {rates.tasaGrupo.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => onTabChange?.('tasas')}
              className="w-full mt-3 py-2 text-[10px] font-black text-slate-400 dark:text-slate-600 hover:text-[#4f6ef7] uppercase tracking-widest transition-colors"
            >
              Ver historial →
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-4">

        {/* Recent transactions */}
        <div className="lg:col-span-7 bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-white/[0.05] flex items-center justify-between">
            <div>
              <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[14px]">Últimas Transacciones</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Movimientos en tiempo real</p>
            </div>
            <button
              onClick={() => onTabChange?.('contabilidad')}
              className="text-[11px] font-black text-[#4f6ef7] hover:underline flex items-center gap-1"
            >
              Ver todo <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[320px] custom-scroll">
            {recentMvs.length === 0 ? (
              <div className="p-8 text-center text-slate-300 dark:text-slate-600">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-[12px] font-semibold">Sin transacciones aún</p>
              </div>
            ) : (
              recentMvs.map(m => {
                const isAbono = m.movementType === 'ABONO';
                const isSupplier = m.isSupplierMovement;
                const amt = (m as any).amountInUSD || m.amount || 0;
                const name = (m as any).customerName
                  || (m as any).supplierName
                  || (isSupplier ? 'Proveedor' : 'Cliente');
                const initials = name.slice(0, 2).toUpperCase();
                return (
                  <div
                    key={m.id}
                    className="px-5 py-3 flex items-center gap-4 border-b border-slate-50 dark:border-white/[0.04] last:border-0 hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-[11px] shrink-0 ${
                      isSupplier
                        ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-blue-100 dark:bg-blue-500/10 text-[#4f6ef7]'
                    }`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</div>
                      <div className="text-[10px] font-mono text-slate-400 dark:text-slate-600">
                        {m.date} · {m.movementType} · {isSupplier ? 'CxP' : 'CxC'}
                      </div>
                    </div>
                    <div className={`text-[13px] font-bold shrink-0 ${
                      isAbono ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {isAbono ? '+' : ''}{fmtUSD(amt)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Quick access + Low stock */}
        <div className="lg:col-span-5 flex flex-col gap-5">

          {/* Quick access grid */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-4">
              Acceso Rápido
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: '🛒', label: 'POS Detal',   tab: 'cajas',         hover: 'hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/30' },
                { icon: '👥', label: 'Clientes',    tab: 'clientes',      hover: 'hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-200 dark:hover:border-violet-500/30' },
                { icon: '📦', label: 'Inventario',  tab: 'inventario',    hover: 'hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:border-amber-200 dark:hover:border-amber-500/30' },
                { icon: '📚', label: 'Contabil.',   tab: 'contabilidad',  hover: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:border-emerald-200 dark:hover:border-emerald-500/30' },
                { icon: '🏭', label: 'Proveedores', tab: 'proveedores',   hover: 'hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:border-orange-200 dark:hover:border-orange-500/30' },
                { icon: '📊', label: 'Reportes',    tab: 'reportes',      hover: 'hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-200 dark:hover:border-rose-500/30' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => onTabChange?.(item.tab)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-sm ${item.hover}`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stock crítico */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[13px]">Stock Crítico</h3>
                {lowStockItems.length > 0 && (
                  <div className="bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 text-[9px] font-black px-2 py-0.5 rounded-xl">
                    {lowStockItems.length}
                  </div>
                )}
              </div>
              <button
                onClick={() => onTabChange?.('inventario')}
                className="text-[11px] font-black text-[#4f6ef7] hover:underline"
              >
                Inventario →
              </button>
            </div>
            <div className="p-4">
              {lowStockItems.length === 0 ? (
                <div className="py-6 flex flex-col items-center text-slate-300 dark:text-slate-600 gap-2">
                  <div className="text-3xl">✅</div>
                  <p className="text-[11px] font-semibold">Stock en niveles normales</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map((item, i) => {
                    const qty = (item as any).stock || (item as any).quantity || 0;
                    const pct = Math.min(100, (qty / LOW) * 100);
                    const barColor = qty === 0
                      ? 'bg-rose-500'
                      : qty < 5
                        ? 'bg-rose-400'
                        : 'bg-amber-400';
                    return (
                      <div key={item.id || i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                            {(item as any).name || (item as any).nombre || 'Producto'}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-rose-500 dark:text-rose-400 ml-2">
                            {qty} un.
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    {/* ── INTELIGENCIA DE NEGOCIO ── */}
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-4 flex items-center gap-2">
        <Activity size={11} /> Inteligencia de Negocio · {periodLabel}
        <span className="ml-2 px-2 py-0.5 bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg text-[9px] font-black">BI</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-8">

        {/* Inversión por Categoría */}
        <div className="lg:col-span-5 bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50 dark:border-white/[0.05] flex items-center justify-between">
            <div>
              <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[14px]">Inversión por Categoría</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Capital en stock · {fmtUSD(totalInversion)}</p>
            </div>
            <button
              onClick={() => onTabChange?.('inventario')}
              className="text-[11px] font-black text-[#4f6ef7] hover:underline flex items-center gap-1"
            >
              Inventario <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="p-5">
            {inversionPorCategoria.length === 0 ? (
              <div className="py-8 flex flex-col items-center text-slate-300 dark:text-slate-600 gap-2">
                <Package size={28} />
                <p className="text-[11px] font-semibold">Sin productos con costo registrado</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={inversionPorCategoria}
                      cx="50%" cy="50%"
                      innerRadius={42} outerRadius={72}
                      paddingAngle={3} dataKey="value"
                    >
                      {inversionPorCategoria.map((_, i) => (
                        <Cell key={i} fill={inversionPorCategoria[i].color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => [fmtUSD(v), 'Capital']}
                      contentStyle={{
                        borderRadius: '12px',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
                        background: isDark ? '#1e293b' : '#fff',
                        color: isDark ? '#e2e8f0' : '#0f172a',
                        fontSize: 11,
                        boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {inversionPorCategoria.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-slate-600 dark:text-slate-400 truncate max-w-[130px]">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{fmtUSD(d.value)}</span>
                        <span className="text-[10px] text-slate-300 dark:text-slate-600">
                          {totalInversion > 0 ? `${((d.value / totalInversion) * 100).toFixed(0)}%` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right column: Estrella + Salud + Reposición */}
        <div className="lg:col-span-7 flex flex-col gap-5">

          {/* Top row: Producto Estrella + Salud del Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Producto Estrella */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-100 dark:border-amber-500/20 rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm">
                  <Star size={14} fill="currentColor" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">Producto Estrella</p>
                  <p className="text-[9px] text-amber-500 dark:text-amber-600 font-medium">{periodLabel}</p>
                </div>
              </div>
              {productoEstrella ? (
                <>
                  <p className="text-[15px] font-black text-slate-900 dark:text-white leading-tight truncate">{productoEstrella.nombre}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{productoEstrella.qty} unidades vendidas</p>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-2">{fmtUSD(productoEstrella.revenue)}</p>
                </>
              ) : (
                <p className="text-[12px] text-amber-600/60 dark:text-amber-500/50 mt-3 font-medium">
                  Registra ventas por POS para activar este indicador
                </p>
              )}
            </div>

            {/* Salud del Inventario */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Activity size={14} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Salud del Stock</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-600 font-medium">{saludInventario.total} SKUs totales</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Normal', val: saludInventario.normal, color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Crítico', val: saludInventario.critico, color: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Agotado', val: saludInventario.agotado, color: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${row.color}`} />
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">{row.label}</span>
                    </div>
                    <span className={`text-[11px] font-black ${row.text}`}>{row.val}</span>
                  </div>
                ))}
              </div>
              {saludInventario.total > 0 && (
                <div className="mt-3 h-2 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden flex">
                  <div className="bg-emerald-400 h-full transition-all duration-700" style={{ width: `${(saludInventario.normal / saludInventario.total) * 100}%` }} />
                  <div className="bg-amber-400 h-full transition-all duration-700" style={{ width: `${(saludInventario.critico / saludInventario.total) * 100}%` }} />
                  <div className="bg-rose-500 h-full transition-all duration-700" style={{ width: `${(saludInventario.agotado / saludInventario.total) * 100}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Alerta Predictiva de Reposición */}
          <div className="bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.07] rounded-3xl overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                  <Clock size={14} />
                </div>
                <div>
                  <h3 className="font-syne font-bold text-slate-900 dark:text-white text-[13px]">Alerta de Reposición</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Días de stock restantes · basado en ventas del período</p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 px-2.5 py-1 rounded-xl">
                Predictivo
              </span>
            </div>
            <div className="p-4">
              {rotacionRiesgo.length === 0 ? (
                <div className="py-5 flex flex-col items-center text-slate-300 dark:text-slate-600 gap-2">
                  <div className="text-3xl">🎯</div>
                  <p className="text-[12px] font-semibold">Sin ventas POS en el período</p>
                  <p className="text-[11px]">Las alertas se activan automáticamente al vender por POS</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rotacionRiesgo.map((item, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${
                      item.urgente
                        ? 'bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20'
                        : 'bg-slate-50 dark:bg-white/[0.03]'
                    }`}>
                      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                        item.urgente
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                      }`}>
                        <span className="text-[14px] font-black leading-none">{item.diasRestantes}</span>
                        <span className="text-[8px] font-black uppercase">días</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200 truncate">{item.nombre}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{item.stock} unidades en stock</p>
                      </div>
                      {item.urgente && (
                        <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-2.5 py-1 rounded-xl uppercase shrink-0">
                          ¡Reponer!
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
  );
}
