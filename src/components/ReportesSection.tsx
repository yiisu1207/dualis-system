import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Download,
  Filter,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Movement, Customer, MovementType } from '../../types';

interface ReportesSectionProps {
  movements: Movement[];
  customers: Customer[];
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
];

function getStartDate(period: Period): string | null {
  const now = new Date();
  if (period === 'today') {
    return now.toISOString().split('T')[0];
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }
  if (period === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (period === 'year') {
    return `${now.getFullYear()}-01-01`;
  }
  return null;
}

function fmt(n: number, symbol = '$') {
  return `${symbol} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const ReportesSection: React.FC<ReportesSectionProps> = ({ movements, customers }) => {
  const [period, setPeriod] = useState<Period>('month');
  const [movType, setMovType] = useState<'ALL' | 'FACTURA' | 'ABONO'>('ALL');

  const startDate = useMemo(() => getStartDate(period), [period]);

  const filtered = useMemo(() => {
    let result = movements;
    if (startDate) {
      result = result.filter(m => (m.date || m.createdAt || '') >= startDate);
    }
    if (movType !== 'ALL') {
      result = result.filter(m => m.movementType === movType);
    }
    return result;
  }, [movements, startDate, movType]);

  // KPIs
  const kpis = useMemo(() => {
    const facturas = movements.filter(m => m.movementType === MovementType.FACTURA && (!startDate || (m.date || '') >= startDate));
    const abonos = movements.filter(m => m.movementType === MovementType.ABONO && (!startDate || (m.date || '') >= startDate));

    const totalFacturado = facturas.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const totalCobrado = abonos.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const balance = totalCobrado - totalFacturado;

    // CxC: unique clients with movements
    const clientIds = new Set(filtered.filter(m => !m.isSupplierMovement).map(m => m.entityId));
    const supplierMovs = filtered.filter(m => m.isSupplierMovement);
    const totalGastos = supplierMovs.reduce((s, m) => s + (m.amountInUSD || 0), 0);

    return { totalFacturado, totalCobrado, balance, clientIds: clientIds.size, totalGastos };
  }, [movements, filtered, startDate]);

  // Monthly chart data (current year)
  const monthlyData = useMemo(() => {
    const year = new Date().getFullYear();
    return MONTH_LABELS.map((label, idx) => {
      const month = String(idx + 1).padStart(2, '0');
      const prefix = `${year}-${month}`;
      const facturas = movements
        .filter(m => m.movementType === MovementType.FACTURA && (m.date || '').startsWith(prefix))
        .reduce((s, m) => s + (m.amountInUSD || 0), 0);
      const abonos = movements
        .filter(m => m.movementType === MovementType.ABONO && (m.date || '').startsWith(prefix))
        .reduce((s, m) => s + (m.amountInUSD || 0), 0);
      return { label, Facturado: +facturas.toFixed(2), Cobrado: +abonos.toFixed(2) };
    });
  }, [movements]);

  // Top clientes por deuda
  const topClientes = useMemo(() => {
    const map: Record<string, { name: string; deuda: number }> = {};
    movements.filter(m => !m.isSupplierMovement).forEach(m => {
      if (!map[m.entityId]) {
        const c = customers.find(c => c.id === m.entityId);
        map[m.entityId] = { name: (c as any)?.fullName || (c as any)?.nombre || m.entityId, deuda: 0 };
      }
      if (m.movementType === MovementType.FACTURA) map[m.entityId].deuda += (m.amountInUSD || 0);
      if (m.movementType === MovementType.ABONO) map[m.entityId].deuda -= (m.amountInUSD || 0);
    });
    return Object.values(map)
      .filter(c => c.deuda > 0)
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 5);
  }, [movements, customers]);

  const handleExport = () => {
    const rows = [
      ['Fecha', 'Concepto', 'Tipo', 'Monto USD', 'Cuenta', 'Referencia'],
      ...filtered.map(m => [
        m.date || m.createdAt || '',
        m.concept,
        m.movementType,
        m.amountInUSD?.toFixed(2) || '0.00',
        m.accountType,
        m.reference || '',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${period}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-black text-slate-900 text-2xl leading-tight">Reportes</h1>
          <p className="text-slate-400 text-sm mt-0.5 font-medium">Análisis financiero y operativo</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#4f6ef7] text-white rounded-2xl text-[12px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md shadow-blue-200"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {/* Period + Type filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          <Calendar size={13} className="text-slate-400 ml-2 mr-1" />
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                period === p.id
                  ? 'bg-[#4f6ef7] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          <Filter size={13} className="text-slate-400 ml-2 mr-1" />
          {(['ALL', 'FACTURA', 'ABONO'] as const).map(t => (
            <button
              key={t}
              onClick={() => setMovType(t)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                movType === t
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'ALL' ? 'Todos' : t === 'FACTURA' ? 'Facturas' : 'Abonos'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Facturado"
          value={fmt(kpis.totalFacturado)}
          icon={<FileText size={16} className="text-violet-600" />}
          bg="bg-violet-50"
          trend="neutral"
        />
        <KpiCard
          label="Cobrado"
          value={fmt(kpis.totalCobrado)}
          icon={<CheckCircle2 size={16} className="text-emerald-600" />}
          bg="bg-emerald-50"
          trend="up"
        />
        <KpiCard
          label="CxC Pendiente"
          value={fmt(Math.max(0, kpis.totalFacturado - kpis.totalCobrado))}
          icon={<Clock size={16} className="text-amber-600" />}
          bg="bg-amber-50"
          trend="down"
        />
        <KpiCard
          label="Clientes activos"
          value={`${kpis.clientIds}`}
          icon={<Users size={16} className="text-blue-600" />}
          bg="bg-blue-50"
          trend="neutral"
          isCurrency={false}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-[#4f6ef7]" />
            <h3 className="font-black text-slate-800 text-[14px]">Facturado vs Cobrado · {new Date().getFullYear()}</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barSize={10} barGap={2}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={(v: number) => [`$ ${v.toFixed(2)}`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Facturado" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Cobrado" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top clientes */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Users size={16} className="text-amber-500" />
            <h3 className="font-black text-slate-800 text-[14px]">Top CxC por cliente</h3>
          </div>
          {topClientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
              <CheckCircle2 size={28} className="text-emerald-300" />
              <span className="text-[12px] font-medium">Sin deudas pendientes</span>
            </div>
          ) : (
            <div className="space-y-3">
              {topClientes.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-[11px] font-black text-slate-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-slate-700 truncate">{c.name}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.min(100, (c.deuda / topClientes[0].deuda) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-black text-amber-600 shrink-0">{fmt(c.deuda)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Movements table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-slate-400" />
            <span className="font-black text-slate-800 text-[14px]">Movimientos</span>
            <span className="ml-1 bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-lg">
              {filtered.length}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <BarChart3 size={32} className="text-slate-200" />
            <span className="text-[13px] font-medium">Sin movimientos en este período</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Fecha', 'Concepto', 'Tipo', 'Cuenta', 'Monto USD', 'Referencia'].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-black text-slate-400 uppercase tracking-widest text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((m, i) => (
                  <tr
                    key={m.id || i}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-all"
                  >
                    <td className="px-5 py-3 font-medium text-slate-600">{m.date || m.createdAt?.split('T')[0] || '—'}</td>
                    <td className="px-5 py-3 font-medium text-slate-800 max-w-[180px] truncate">{m.concept}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                        m.movementType === MovementType.FACTURA
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {m.movementType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{m.accountType}</td>
                    <td className={`px-5 py-3 font-black ${
                      m.movementType === MovementType.FACTURA ? 'text-violet-700' : 'text-emerald-600'
                    }`}>
                      {fmt(m.amountInUSD || 0)}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{m.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <div className="px-5 py-3 text-center text-[11px] text-slate-400 border-t border-slate-50">
                Mostrando 100 de {filtered.length} registros · Exporta para ver todos
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── KPI Card helper ──────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  trend: 'up' | 'down' | 'neutral';
  isCurrency?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, bg, trend }) => (
  <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-9 h-9 rounded-2xl ${bg} flex items-center justify-center`}>{icon}</div>
      {trend === 'up' && <TrendingUp size={13} className="text-emerald-500" />}
      {trend === 'down' && <TrendingDown size={13} className="text-amber-500" />}
    </div>
    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
    <p className="text-[18px] font-black text-slate-900 leading-tight">{value}</p>
  </div>
);

export default ReportesSection;