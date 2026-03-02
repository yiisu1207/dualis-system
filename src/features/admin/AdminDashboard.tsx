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
    <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-3 text-xs">
      <p className="font-black text-slate-400 mb-2 uppercase tracking-widest text-[10px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-900">{fmtUSD(p.value ?? 0)}</span>
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
    className={`bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-100/80 ${onClick ? 'cursor-pointer' : ''}`}
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
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-rose-50 text-rose-600'
          }`}>
            {trend >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
    <div>
      <div className="font-syne font-bold text-[22px] text-slate-900 leading-none">{value}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-1.5">{label}</div>
      <div className="font-mono text-[10px] text-slate-300 mt-1 uppercase tracking-wide truncate">{sub}</div>
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
        if (m.movementType === 'FACTURA') { facturado += amt; invoiceCount++; }
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
  const cxcTotal = useMemo(() => {
    let t = 0;
    movements.filter(m => !m.isSupplierMovement).forEach(m => {
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
          <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#4f6ef7]" size={32} />
          </div>
          <p className="text-slate-400 text-[13px] font-medium">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-syne font-bold text-[24px] text-slate-900 leading-tight">
            {greeting}, {userProfile?.displayName || 'Admin'}
          </h1>
          <p className="text-slate-400 text-[13px] font-medium mt-0.5">
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center bg-slate-100 rounded-2xl p-1 gap-0.5">
            {(['today', '7d', '30d'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                  period === p
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {p === 'today' ? 'Hoy' : p === '7d' ? '7 Días' : '30 Días'}
              </button>
            ))}
          </div>

          <button
            onClick={() => onTabChange?.('reportes')}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 text-[12px] font-black hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
          >
            <BarChart3 size={13} /> Reportes
          </button>
          <button
            onClick={() => window.location.href = `/${tenantId}/pos/detal`}
            className="px-4 py-2 bg-[#4f6ef7] text-white rounded-xl text-[12px] font-black hover:bg-blue-600 transition-all shadow-lg shadow-blue-200/50 flex items-center gap-2"
          >
            <Zap size={13} /> Nueva Venta
          </button>
        </div>
      </div>

      {/* ── SECTION LABEL ── */}
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 -mb-4">
        Métricas · {periodLabel}
      </div>

      {/* ── KPI GRID (6 tarjetas) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={<DollarSign size={18} className="text-[#4f6ef7]" />}
          iconBg="bg-blue-50"
          label={`Facturado — ${periodLabel}`}
          value={fmtUSD(current.facturado)}
          sub={`Bs. ${(current.facturado * rates.tasaBCV).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}
          trend={trendFact}
          onClick={() => onTabChange?.('contabilidad')}
        />
        <KpiCard
          icon={<TrendingUp size={18} className="text-emerald-600" />}
          iconBg="bg-emerald-50"
          label={`Cobrado — ${periodLabel}`}
          value={fmtUSD(current.cobrado)}
          sub={`Eficiencia: ${cobRate}%`}
          trend={trendCob}
          onClick={() => onTabChange?.('clientes')}
        />
        <KpiCard
          icon={<Users size={18} className="text-violet-600" />}
          iconBg="bg-violet-50"
          label="CxC Pendiente"
          value={fmtUSD(cxcTotal)}
          sub="Saldo total clientes"
          onClick={() => onTabChange?.('clientes')}
          badge={cxcTotal > 0 ? (
            <div className="text-[9px] font-black bg-violet-50 text-violet-500 px-2 py-0.5 rounded-xl uppercase tracking-widest">
              Activo
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<Building2 size={18} className="text-amber-600" />}
          iconBg="bg-amber-50"
          label="CxP Pendiente"
          value={fmtUSD(cxpTotal)}
          sub="Deuda con proveedores"
          onClick={() => onTabChange?.('proveedores')}
          badge={cxpTotal > 0 ? (
            <div className="text-[9px] font-black bg-amber-50 text-amber-500 px-2 py-0.5 rounded-xl uppercase tracking-widest">
              Pendiente
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<Package size={18} className="text-slate-600" />}
          iconBg="bg-slate-100"
          label="Unidades en Stock"
          value={stockTotal.toLocaleString()}
          sub={`${products.length} SKUs · ${lowStockItems.length} críticos`}
          onClick={() => onTabChange?.('inventario')}
          badge={lowStockItems.length > 0 ? (
            <div className="flex items-center gap-1 text-[9px] font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-xl">
              <AlertTriangle size={8} /> {lowStockItems.length}
            </div>
          ) : undefined}
        />
        <KpiCard
          icon={<ShoppingCart size={18} className="text-rose-600" />}
          iconBg="bg-rose-50"
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
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-3xl overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-syne font-bold text-slate-900 text-[15px]">Facturado vs Cobrado</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{periodLabel} · En USD</p>
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
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                <div className="text-5xl">📭</div>
                <p className="text-[13px] font-semibold">Sin movimientos en este período</p>
                <p className="text-[11px]">Registra ventas o cobros para ver la gráfica</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={areaData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gFact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCob" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'monospace' }}
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
              <span className="text-[11px] text-slate-500 font-semibold">Facturado</span>
              <span className="font-mono text-[11px] font-bold text-slate-700">{fmtUSD(current.facturado)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-500 font-semibold">Cobrado</span>
              <span className="font-mono text-[11px] font-bold text-slate-700">{fmtUSD(current.cobrado)}</span>
            </div>
          </div>
        </div>

        {/* Right panel: Pie + Rates */}
        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* Pie chart */}
          <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="font-syne font-bold text-slate-900 text-[14px]">Distribución</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{periodLabel} · Por tipo</p>
            </div>
            <div className="p-5">
              {pieData.length === 0 ? (
                <div className="py-6 flex flex-col items-center text-slate-300 gap-2">
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
                          border: '1px solid #f1f5f9',
                          fontSize: 11,
                          boxShadow: '0 4px 24px rgba(0,0,0,.06)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-slate-600">{d.name}</span>
                        </div>
                        <span className="font-bold text-slate-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Exchange rates */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-syne font-bold text-slate-900 text-[13px]">Tasas de Cambio</h3>
              <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-base">🇺🇸</span>
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">BCV</span>
                </div>
                <span className="font-mono font-bold text-amber-600 text-[13px]">
                  Bs. {rates.tasaBCV.toFixed(2)}
                </span>
              </div>
              {rates.tasaGrupo > 0 && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💹</span>
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Grupo</span>
                  </div>
                  <span className="font-mono font-bold text-violet-600 text-[13px]">
                    Bs. {rates.tasaGrupo.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => onTabChange?.('tasas')}
              className="w-full mt-3 py-2 text-[10px] font-black text-slate-400 hover:text-[#4f6ef7] uppercase tracking-widest transition-colors"
            >
              Ver historial →
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-4">

        {/* Recent transactions */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-syne font-bold text-slate-900 text-[14px]">Últimas Transacciones</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Movimientos en tiempo real</p>
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
              <div className="p-8 text-center text-slate-300">
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
                    className="px-5 py-3 flex items-center gap-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-[11px] shrink-0 ${
                      isSupplier
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-[#4f6ef7]'
                    }`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-800 truncate">{name}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {m.date} · {m.movementType} · {isSupplier ? 'CxP' : 'CxC'}
                      </div>
                    </div>
                    <div className={`text-[13px] font-bold shrink-0 ${
                      isAbono ? 'text-emerald-600' : 'text-slate-800'
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
          <div className="bg-white border border-slate-100 rounded-3xl p-5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400 mb-4">
              Acceso Rápido
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: '🛒', label: 'POS Detal',   tab: 'cajas',         hover: 'hover:bg-blue-50 hover:border-blue-200' },
                { icon: '👥', label: 'Clientes',    tab: 'clientes',      hover: 'hover:bg-violet-50 hover:border-violet-200' },
                { icon: '📦', label: 'Inventario',  tab: 'inventario',    hover: 'hover:bg-amber-50 hover:border-amber-200' },
                { icon: '📚', label: 'Contabil.',   tab: 'contabilidad',  hover: 'hover:bg-emerald-50 hover:border-emerald-200' },
                { icon: '🏭', label: 'Proveedores', tab: 'proveedores',   hover: 'hover:bg-orange-50 hover:border-orange-200' },
                { icon: '📊', label: 'Reportes',    tab: 'reportes',      hover: 'hover:bg-rose-50 hover:border-rose-200' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => onTabChange?.(item.tab)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border border-slate-100 bg-slate-50/50 transition-all hover:-translate-y-0.5 hover:shadow-sm ${item.hover}`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-black text-slate-600 text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stock crítico */}
          <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-syne font-bold text-slate-900 text-[13px]">Stock Crítico</h3>
                {lowStockItems.length > 0 && (
                  <div className="bg-rose-50 text-rose-500 text-[9px] font-black px-2 py-0.5 rounded-xl">
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
                <div className="py-6 flex flex-col items-center text-slate-300 gap-2">
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
                          <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[140px]">
                            {(item as any).name || (item as any).nombre || 'Producto'}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-rose-500 ml-2">
                            {qty} un.
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
    </div>
  );
}
