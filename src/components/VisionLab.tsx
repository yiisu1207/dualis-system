import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Target,
  Receipt,
  Users,
  DollarSign,
  Download,
  RefreshCw,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Ban,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  TrendingDown,
  Package,
  Activity,
  Clock,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { Movement, InventoryItem, ExchangeRates, Customer } from '../../types';
import { auth } from '../firebase/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisionLabProps {
  movements: Movement[];
  inventory?: InventoryItem[];
  rates?: ExchangeRates;
  customers?: Customer[];
}

interface InsightData {
  fortalezas: string;
  riesgos: string;
  comprar: string;
  evitar: string;
  pronostico: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtUSDFull = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function parseInsights(text: string): InsightData {
  const extract = (key: string): string => {
    const regex = new RegExp(`${key}:[\\s]*([\\s\\S]+?)(?=\\n[A-ZÁÉÍÓÚ]+:|$)`);
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };
  return {
    fortalezas: extract('FORTALEZAS'),
    riesgos: extract('RIESGOS'),
    comprar: extract('COMPRAR'),
    evitar: extract('EVITAR'),
    pronostico: extract('PRONOSTICO'),
  };
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 text-sm">
      <p className="font-black text-slate-700 mb-2 uppercase tracking-widest text-[10px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name === 'ingresos' ? 'Ingresos' : 'Egresos'}:</span>
          <span className="font-black text-slate-900">{fmtUSD(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, sub, icon: Icon, color, trend, trendLabel }) => (
  <div className="bg-white rounded-[2rem] p-6 shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col gap-3 hover:shadow-xl transition-all duration-300">
    <div className="flex items-center justify-between">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      {trend && trendLabel && (
        <div
          className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${
            trend === 'up'
              ? 'text-emerald-700 bg-emerald-50'
              : trend === 'down'
              ? 'text-rose-700 bg-rose-50'
              : 'text-slate-500 bg-slate-100'
          }`}
        >
          {trend === 'up' ? <ArrowUpRight size={12} /> : trend === 'down' ? <ArrowDownRight size={12} /> : null}
          {trendLabel}
        </div>
      )}
    </div>
    <div>
      <div className="text-2xl font-black text-slate-900 tracking-tight leading-none">{value}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{title}</div>
    </div>
    {sub && !trendLabel && <div className="text-[11px] text-slate-400 font-medium">{sub}</div>}
  </div>
);

// ─── AI Insight Card ──────────────────────────────────────────────────────────

interface InsightCardProps {
  icon: React.ElementType;
  title: string;
  text: string;
  border: string;
  iconBg: string;
  textColor: string;
}

const InsightCard: React.FC<InsightCardProps> = ({ icon: Icon, title, text, border, iconBg, textColor }) => (
  <div className={`rounded-3xl border ${border} p-6 flex flex-col gap-3`}>
    <div className="flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon size={16} className={textColor} />
      </div>
      <span className={`text-[10px] font-black uppercase tracking-widest ${textColor}`}>{title}</span>
    </div>
    <p className="text-sm text-slate-300 leading-relaxed font-medium">{text || 'Analizando…'}</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VisionLab({
  movements = [],
  inventory = [],
  rates,
  customers = [],
}: VisionLabProps) {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsFetched, setInsightsFetched] = useState(false);

  // ── Analytics ──────────────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isRevenue = (m: Movement) =>
      (m.movementType as string) === 'FACTURA' && !m.isSupplierMovement;
    const isExpense = (m: Movement) =>
      (m.movementType as string) === 'EGRESO' ||
      ((m.movementType as string) === 'FACTURA' && !!m.isSupplierMovement);

    // 6-month labels
    const months6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(currentYear, currentMonth - (5 - i), 1);
      return { label: d.toLocaleString('es', { month: 'short' }), month: d.getMonth(), year: d.getFullYear() };
    });

    // Monthly chart data
    const monthlyData = months6.map(({ label, month, year }) => {
      const inMonth = movements.filter(m => {
        const d = new Date(m.date);
        return d.getMonth() === month && d.getFullYear() === year;
      });
      return {
        month: label,
        ingresos: inMonth.filter(isRevenue).reduce((s, m) => s + (m.amountInUSD || 0), 0),
        egresos: inMonth.filter(isExpense).reduce((s, m) => s + (m.amountInUSD || 0), 0),
      };
    });

    // Current & prev month movements
    const currMovs = movements.filter(m => {
      const d = new Date(m.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMovs = movements.filter(m => {
      const d = new Date(m.date);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });

    const currRevenue = currMovs.filter(isRevenue).reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const currExpenses = currMovs.filter(isExpense).reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const prevRevenue = prevMovs.filter(isRevenue).reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const prevExpenses = prevMovs.filter(isExpense).reduce((s, m) => s + (m.amountInUSD || 0), 0);

    const utilidad = currRevenue - currExpenses;
    const prevUtilidad = prevRevenue - prevExpenses;
    const margen = currRevenue > 0 ? (utilidad / currRevenue) * 100 : 0;
    const revenueMovs = currMovs.filter(isRevenue);
    const ticketPromedio = revenueMovs.length > 0 ? currRevenue / revenueMovs.length : 0;
    const clientesActivos = new Set(revenueMovs.map(m => m.entityId).filter(Boolean)).size;
    const growth = prevRevenue > 0 ? ((currRevenue - prevRevenue) / prevRevenue) * 100 : currRevenue > 0 ? 100 : 0;
    const expenseGrowth = prevExpenses > 0 ? ((currExpenses - prevExpenses) / prevExpenses) * 100 : 0;
    const utilidadGrowth = prevUtilidad !== 0 ? ((utilidad - prevUtilidad) / Math.abs(prevUtilidad)) * 100 : 0;

    // Business health
    const totalIn = monthlyData.reduce((s, d) => s + d.ingresos, 0);
    const totalOut = monthlyData.reduce((s, d) => s + d.egresos, 0);
    const healthPct = totalIn > 0 ? (totalIn / (totalIn + totalOut)) * 100 : 0;
    const healthGrade =
      healthPct >= 70 ? 'A' : healthPct >= 55 ? 'B' : healthPct >= 40 ? 'C' : healthPct >= 25 ? 'D' : 'F';
    const healthLabel =
      healthPct >= 70
        ? 'Excelente'
        : healthPct >= 55
        ? 'Buena'
        : healthPct >= 40
        ? 'Estable'
        : healthPct >= 25
        ? 'Crítica'
        : 'Alerta';
    const healthColor =
      healthPct >= 70
        ? 'text-emerald-600'
        : healthPct >= 55
        ? 'text-blue-600'
        : healthPct >= 40
        ? 'text-amber-600'
        : 'text-rose-600';

    // Expense by category (pie)
    const expenseMap: Record<string, number> = {};
    movements.filter(isExpense).forEach(m => {
      const cat = (m as any).category || m.expenseCategory || 'Gastos Generales';
      expenseMap[cat] = (expenseMap[cat] || 0) + (m.amountInUSD || 0);
    });
    const expensePie = Object.entries(expenseMap)
      .map(([name, value], i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Revenue by account type bar
    const revenueMap: Record<string, number> = {};
    movements.filter(isRevenue).forEach(m => {
      const key = m.accountType || 'GENERAL';
      revenueMap[key] = (revenueMap[key] || 0) + (m.amountInUSD || 0);
    });
    const revenueBar = Object.entries(revenueMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Low stock items
    const lowStock = (inventory || []).filter(item => item.stock <= (item.minStock || 0));

    // Recent movements (last 10)
    const recent = [...movements]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    // Monthly P&L table (6 rows)
    const pnlTable = monthlyData.map(d => ({
      month: d.month,
      ingresos: d.ingresos,
      egresos: d.egresos,
      utilidad: d.ingresos - d.egresos,
      margen: d.ingresos > 0 ? ((d.ingresos - d.egresos) / d.ingresos) * 100 : 0,
    }));

    return {
      monthlyData,
      currRevenue,
      currExpenses,
      utilidad,
      margen,
      ticketPromedio,
      clientesActivos,
      growth,
      expenseGrowth,
      utilidadGrowth,
      healthGrade,
      healthLabel,
      healthColor,
      healthPct,
      expensePie,
      revenueBar,
      lowStock,
      recent,
      pnlTable,
      prevRevenue,
    };
  }, [movements, inventory]);

  // ── AI Insights ────────────────────────────────────────────────────────────

  const buildPrompt = useCallback((): string => {
    const now = new Date();
    const monthName = now.toLocaleString('es', { month: 'long', year: 'numeric' });
    const {
      currRevenue, currExpenses, utilidad, margen, ticketPromedio,
      clientesActivos, growth, monthlyData, lowStock,
    } = analytics;

    const history6 = monthlyData
      .map(d => `  ${d.month}: Ingresos $${d.ingresos.toFixed(0)} / Egresos $${d.egresos.toFixed(0)} / Neto $${(d.ingresos - d.egresos).toFixed(0)}`)
      .join('\n');

    const lowStockStr =
      lowStock.length > 0
        ? lowStock.slice(0, 8).map(i => `${i.name} (stock: ${i.stock}, mínimo: ${i.minStock})`).join(', ')
        : 'Sin alertas de stock bajo';

    const totalInventory = (inventory || []).length;
    const totalCustomers = customers.length;

    return `Eres un analista financiero especializado en PYMEs venezolanas. Analiza estos datos financieros y responde EXACTAMENTE con este formato en español (no añadas texto antes o después):

FORTALEZAS: [3 líneas analizando los puntos positivos del negocio con referencias a los datos]
RIESGOS: [3 líneas sobre riesgos concretos detectados en los datos, con alertas específicas]
COMPRAR: [recomendaciones específicas: qué productos comprar, qué inventario reponer, en qué activos invertir — basado en los datos]
EVITAR: [qué gastos reducir, qué no comprar, qué categorías de egreso son excesivas — basado en los datos]
PRONOSTICO: [predicción del próximo mes con estimados numéricos de ingresos, egresos y utilidad basados en la tendencia]

DATOS FINANCIEROS (${monthName}):
Ingresos del mes: $${currRevenue.toFixed(2)}
Egresos del mes: $${currExpenses.toFixed(2)}
Utilidad neta: $${utilidad.toFixed(2)}
Margen de utilidad: ${margen.toFixed(1)}%
Ticket promedio: $${ticketPromedio.toFixed(2)}
Clientes activos: ${clientesActivos}
Total clientes registrados: ${totalCustomers}
Total productos en inventario: ${totalInventory}
Variación vs mes anterior: ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%

Historial últimos 6 meses:
${history6}

Productos con stock bajo:
${lowStockStr}

Responde con datos concretos y recomendaciones accionables para una PYME venezolana.`;
  }, [analytics, inventory, customers]);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const prompt = buildPrompt();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          system: 'Eres un analista financiero experto. Responde ÚNICAMENTE con el formato solicitado: FORTALEZAS, RIESGOS, COMPRAR, EVITAR, PRONOSTICO.',
          temperature: 0.4,
        }),
      });
      if (!res.ok) throw new Error('API no disponible');
      const data = await res.json();
      const parsed = parseInsights(data.result || '');
      setInsights(parsed);
      setInsightsFetched(true);
    } catch {
      setInsightsError('No se pudo conectar con la IA. Verifica tu conexión o configuración de API.');
    } finally {
      setInsightsLoading(false);
    }
  }, [buildPrompt]);

  useEffect(() => {
    if (movements.length > 0 && !insightsFetched) {
      fetchInsights();
    }
  }, [movements.length]); // eslint-disable-line

  // ── PDF Export ─────────────────────────────────────────────────────────────

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const { currRevenue, currExpenses, utilidad, margen, ticketPromedio, pnlTable } = analytics;

    doc.setFontSize(20);
    doc.setTextColor(99, 102, 241);
    doc.text('VisionLab IA — Reporte Financiero', 20, 22);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString('es-VE')}  |  ${movements.length} operaciones analizadas`, 20, 30);

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('KPIs del Mes Actual', 20, 45);

    doc.setFontSize(10);
    doc.setTextColor(60);
    const kpis = [
      ['Ingresos del Mes', fmtUSDFull(currRevenue)],
      ['Egresos del Mes', fmtUSDFull(currExpenses)],
      ['Utilidad Neta', fmtUSDFull(utilidad)],
      ['Margen de Utilidad', `${margen.toFixed(1)}%`],
      ['Ticket Promedio', fmtUSDFull(ticketPromedio)],
    ];
    kpis.forEach(([label, value], i) => {
      doc.text(`${label}: ${value}`, 25, 55 + i * 7);
    });

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('P&L — Últimos 6 Meses', 20, 100);

    (doc as any).autoTable({
      startY: 106,
      head: [['Mes', 'Ingresos', 'Egresos', 'Utilidad', 'Margen %']],
      body: pnlTable.map(r => [
        r.month,
        fmtUSD(r.ingresos),
        fmtUSD(r.egresos),
        fmtUSD(r.utilidad),
        `${r.margen.toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 9 },
    });

    const afterTable = (doc as any).lastAutoTable?.finalY + 12 || 185;

    if (insights) {
      doc.setFontSize(13);
      doc.setTextColor(30);
      doc.text('Análisis IA — Recomendaciones', 20, afterTable);
      doc.setFontSize(9);
      doc.setTextColor(60);
      let y = afterTable + 8;
      const sections: [string, string][] = [
        ['Fortalezas', insights.fortalezas],
        ['Riesgos', insights.riesgos],
        ['Qué Comprar', insights.comprar],
        ['Qué Evitar', insights.evitar],
        ['Pronóstico', insights.pronostico],
      ];
      sections.forEach(([label, text]) => {
        if (!text) return;
        doc.setFontSize(10);
        doc.setTextColor(99, 102, 241);
        doc.text(label + ':', 20, y);
        y += 5;
        doc.setFontSize(8);
        doc.setTextColor(80);
        const lines = doc.splitTextToSize(text, 170);
        doc.text(lines, 20, y);
        y += lines.length * 5 + 4;
        if (y > 270) { doc.addPage(); y = 20; }
      });
    }

    doc.setFontSize(13);
    doc.setTextColor(30);
    const movY = afterTable + (insights ? 100 : 12);
    if (movY < 270) {
      doc.text('Movimientos Recientes', 20, movY);
      (doc as any).autoTable({
        startY: movY + 6,
        head: [['Fecha', 'Tipo', 'Concepto', 'Monto USD']],
        body: analytics.recent.slice(0, 15).map(m => [
          new Date(m.date).toLocaleDateString('es-VE'),
          m.movementType,
          (m.concept || (m as any).description || '').slice(0, 40),
          fmtUSDFull(m.amountInUSD || 0),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
        styles: { fontSize: 8 },
      });
    }

    doc.save(`visionlab-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Empty State ─────────────────────────────────────────────────────────────

  if (movements.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="h-24 w-24 rounded-[2rem] bg-indigo-50 flex items-center justify-center mx-auto mb-6">
            <Activity size={40} className="text-indigo-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Sin datos aún</h2>
          <p className="text-slate-400 font-medium text-sm">
            Registra movimientos en Contabilidad, CxC o POS para que VisionLab genere análisis e insights.
          </p>
        </div>
      </div>
    );
  }

  const {
    monthlyData, currRevenue, currExpenses, utilidad, margen,
    ticketPromedio, clientesActivos, growth, expenseGrowth, utilidadGrowth,
    healthGrade, healthLabel, healthColor, expensePie, revenueBar,
    lowStock, recent, pnlTable,
  } = analytics;

  const isProfit = utilidad >= 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-8 pt-10 font-inter space-y-8">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">AI Business Intelligence</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none flex items-center gap-4">
            <Sparkles size={34} className="text-indigo-600" />
            VisionLab
            <span className="text-slate-300 font-light">—</span>
            <span className="text-slate-400 font-normal text-2xl">Analytics & IA</span>
          </h1>
          <p className="text-slate-400 font-medium text-sm mt-2 flex items-center gap-2">
            <Clock size={13} />
            Datos en tiempo real · {movements.length} operaciones analizadas
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Health Grade */}
          <div className="flex flex-col items-center justify-center h-20 w-20 rounded-[1.5rem] bg-white border border-slate-100 shadow-lg">
            <span className={`text-3xl font-black leading-none ${healthColor}`}>{healthGrade}</span>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1">Salud</span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-200/50 transition-all active:scale-95"
            >
              <Download size={14} /> Exportar PDF
            </button>
            <button
              onClick={() => { setInsightsFetched(false); setInsights(null); fetchInsights(); }}
              disabled={insightsLoading}
              className="flex items-center gap-2 bg-slate-900 hover:bg-indigo-900 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
            >
              {insightsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {insightsLoading ? 'Analizando…' : 'Actualizar IA'}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI GRID ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
        <KPICard
          title="Ingresos del Mes"
          value={fmtUSD(currRevenue)}
          icon={TrendingUp}
          color="bg-emerald-500"
          trend={growth >= 0 ? 'up' : 'down'}
          trendLabel={`${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`}
        />
        <KPICard
          title="Egresos del Mes"
          value={fmtUSD(currExpenses)}
          icon={TrendingDown}
          color="bg-rose-500"
          trend={expenseGrowth > 10 ? 'down' : expenseGrowth < -5 ? 'up' : 'neutral'}
          trendLabel={`${expenseGrowth >= 0 ? '+' : ''}${expenseGrowth.toFixed(1)}%`}
        />
        <KPICard
          title="Utilidad Neta"
          value={fmtUSD(utilidad)}
          icon={DollarSign}
          color={isProfit ? 'bg-indigo-600' : 'bg-rose-600'}
          trend={utilidadGrowth >= 0 ? 'up' : 'down'}
          trendLabel={`${utilidadGrowth >= 0 ? '+' : ''}${utilidadGrowth.toFixed(1)}%`}
        />
        <KPICard
          title="Margen de Utilidad"
          value={`${margen.toFixed(1)}%`}
          icon={Target}
          color={margen >= 30 ? 'bg-violet-500' : margen >= 10 ? 'bg-amber-500' : 'bg-rose-500'}
          sub={margen >= 30 ? 'Excelente' : margen >= 10 ? 'Aceptable' : 'Bajo'}
        />
        <KPICard
          title="Ticket Promedio"
          value={fmtUSD(ticketPromedio)}
          icon={Receipt}
          color="bg-sky-500"
          sub={`${revenueBar.length > 0 ? revenueBar[0].name : 'General'}`}
        />
        <KPICard
          title="Clientes Activos"
          value={String(clientesActivos)}
          icon={Users}
          color="bg-amber-500"
          sub={`de ${customers.length} registrados`}
        />
      </div>

      {/* ── CASH FLOW + P&L ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-700 delay-200">

        {/* Area Chart */}
        <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <TrendingUp className="text-indigo-500" size={22} />
                Flujo de Caja — Últimos 6 Meses
              </h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Ingresos <span className="text-indigo-400">━━</span> vs Egresos <span className="text-rose-400">━━</span>
              </p>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                {fmtUSD(utilidad)}
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Neto este mes</div>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEgresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="ingresos"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fill="url(#gradIngresos)"
                  name="ingresos"
                  dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="egresos"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#gradEgresos)"
                  strokeDasharray="6 3"
                  name="egresos"
                  dot={{ fill: '#f43f5e', r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* P&L Table */}
        <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mb-6">
            <FileText className="text-slate-400" size={20} />
            P&amp;L Mensual
          </h2>
          <div className="space-y-2">
            {pnlTable.map((row, i) => {
              const isCurrentMonth = i === pnlTable.length - 1;
              const profit = row.utilidad >= 0;
              return (
                <div
                  key={row.month}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                    isCurrentMonth ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className={`text-xs font-black uppercase tracking-wider ${isCurrentMonth ? 'text-indigo-700' : 'text-slate-500'}`}>
                      {row.month}
                    </span>
                    {isCurrentMonth && (
                      <span className="ml-2 text-[8px] font-black text-indigo-400 uppercase">actual</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-black ${profit ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {fmtUSD(row.utilidad)}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400">{row.margen.toFixed(0)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Business Health Bar */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Salud Financiera</span>
              <span className={`text-sm font-black ${healthColor}`}>{healthLabel}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  analytics.healthPct >= 70
                    ? 'bg-emerald-500'
                    : analytics.healthPct >= 55
                    ? 'bg-blue-500'
                    : analytics.healthPct >= 40
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(analytics.healthPct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-300 font-bold">0</span>
              <span className="text-[9px] text-slate-300 font-bold">100</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CHARTS ROW ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-700 delay-300">

        {/* Pie — Expense Distribution */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mb-2">
            <Zap className="text-amber-500" size={20} />
            Distribución de Egresos
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Por categoría · histórico</p>
          {expensePie.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-300 text-sm font-semibold">
              Sin datos de egresos
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensePie}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expensePie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [fmtUSD(value), 'Total']}
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bar — Revenue by Type */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 mb-2">
            <Activity className="text-indigo-500" size={20} />
            Ingresos por Tipo de Cuenta
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">BCV / GRUPO / DIVISA · histórico</p>
          {revenueBar.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-300 text-sm font-semibold">
              Sin datos de ingresos
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueBar} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [fmtUSD(value), 'Ingresos']}
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={48}>
                    {revenueBar.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── AI INSIGHTS ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl animate-in fade-in duration-700 delay-400">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-[1.25rem] bg-indigo-600 flex items-center justify-center shadow-lg">
              <Sparkles size={26} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Análisis IA — Vision Manager</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Gemini · Generado automáticamente con tus datos reales
              </p>
            </div>
          </div>
          {insightsFetched && !insightsLoading && (
            <div className="px-4 py-2 rounded-xl bg-emerald-900/40 border border-emerald-700/30">
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 size={11} /> Análisis completado
              </span>
            </div>
          )}
        </div>

        {insightsLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-slate-400 font-medium text-sm">Analizando tus datos con IA…</p>
            <p className="text-slate-600 text-xs">Calculando fortalezas, riesgos, inversiones y pronóstico</p>
          </div>
        )}

        {insightsError && !insightsLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-14 w-14 rounded-2xl bg-rose-900/30 flex items-center justify-center">
              <AlertTriangle size={26} className="text-rose-400" />
            </div>
            <p className="text-rose-400 font-bold">{insightsError}</p>
            <button
              onClick={fetchInsights}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all"
            >
              <RefreshCw size={13} /> Reintentar
            </button>
          </div>
        )}

        {!insightsLoading && !insightsError && insights && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InsightCard
              icon={CheckCircle2}
              title="Fortalezas"
              text={insights.fortalezas}
              border="border-emerald-700/30"
              iconBg="bg-emerald-900/40"
              textColor="text-emerald-400"
            />
            <InsightCard
              icon={AlertTriangle}
              title="Riesgos Detectados"
              text={insights.riesgos}
              border="border-amber-700/30"
              iconBg="bg-amber-900/40"
              textColor="text-amber-400"
            />
            <InsightCard
              icon={ShoppingCart}
              title="Qué Comprar / Invertir"
              text={insights.comprar}
              border="border-sky-700/30"
              iconBg="bg-sky-900/40"
              textColor="text-sky-400"
            />
            <InsightCard
              icon={Ban}
              title="Qué Evitar"
              text={insights.evitar}
              border="border-rose-700/30"
              iconBg="bg-rose-900/40"
              textColor="text-rose-400"
            />
            <div className="md:col-span-2 lg:col-span-1">
              <InsightCard
                icon={TrendingUp}
                title="Pronóstico Próximo Mes"
                text={insights.pronostico}
                border="border-violet-700/30"
                iconBg="bg-violet-900/40"
                textColor="text-violet-400"
              />
            </div>
          </div>
        )}

        {!insightsLoading && !insightsError && !insights && movements.length > 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-slate-500 font-medium text-sm">Los insights se cargan automáticamente al abrir VisionLab.</p>
            <button
              onClick={fetchInsights}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all"
            >
              <Sparkles size={13} /> Generar Análisis IA
            </button>
          </div>
        )}
      </div>

      {/* ── LOW STOCK ALERT ─────────────────────────────────────────────────── */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6 animate-in fade-in duration-700 delay-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Package size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-900">Alertas de Stock Bajo</h3>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                {lowStock.length} producto{lowStock.length !== 1 ? 's' : ''} por debajo del mínimo
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 10).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-200 rounded-xl"
              >
                <span className="text-xs font-black text-slate-700">{item.name}</span>
                <span className="text-[10px] font-bold text-rose-500">{item.stock}/{item.minStock}</span>
              </div>
            ))}
            {lowStock.length > 10 && (
              <div className="flex items-center px-4 py-2 bg-white border border-amber-200 rounded-xl">
                <span className="text-xs font-bold text-slate-400">+{lowStock.length - 10} más</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RECENT MOVEMENTS ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-in fade-in duration-700 delay-500">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center">
              <Activity size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Movimientos Recientes</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Últimas 10 operaciones
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-300 border-b border-slate-50">
                <th className="px-8 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4 max-w-xs">Concepto</th>
                <th className="px-6 py-4">Cuenta</th>
                <th className="px-6 py-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recent.map(m => {
                const isIncome = (m.movementType as string) === 'FACTURA' && !m.isSupplierMovement;
                const isEgreso = (m.movementType as string) === 'EGRESO';
                const label = isIncome ? 'INGRESO' : isEgreso ? 'EGRESO' : m.movementType;
                const labelColor = isIncome
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : (m.movementType as string) === 'ABONO'
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : 'bg-rose-50 text-rose-700 border-rose-100';

                return (
                  <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-600">
                        {new Date(m.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${labelColor}`}>
                        {label}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <span className="text-xs font-medium text-slate-600 truncate block max-w-[220px]">
                        {m.concept || (m as any).description || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {m.accountType || (m as any).category || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {fmtUSDFull(m.amountInUSD || 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
