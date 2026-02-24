import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  Users, 
  Receipt, 
  Download, 
  ArrowUpRight, 
  ArrowDownRight,
  Zap,
  Target,
  Clock,
  FileText
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
  Cell 
} from 'recharts';
import { Movement, MovementType } from '../../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface VisionLabProps {
  movements: Movement[];
}

const StatCard = ({ title, value, change, icon: Icon, colorClass, trend }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 flex flex-col justify-between border-none hover:scale-[1.02] transition-transform duration-300">
    <div className="flex justify-between items-start mb-6">
      <div className={`p-4 rounded-3xl ${colorClass} bg-opacity-10`}>
        <Icon className={`w-7 h-7 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      <div className={`flex items-center gap-1 text-sm font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
        {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        {change}
      </div>
    </div>
    <div>
      <h3 className="text-slate-500 font-medium text-sm tracking-wide uppercase mb-1">{title}</h3>
      <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
    </div>
  </div>
);

export default function VisionLab({ movements = [] }: VisionLabProps) {
  
  const { chartData, sellerData, stats } = useMemo(() => {
    const now = new Date();
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return d.toLocaleString('es', { month: 'short' });
    });

    const monthlyData = last6Months.map(month => ({ month, ingresos: 0, egresos: 0 }));
    const sellerMap: Record<string, number> = {};

    let totalSales = 0;
    let totalSalesPrev = 0;
    let saleCount = 0;

    const currentMonth = now.getMonth();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;

    movements.forEach(m => {
      const mDate = new Date(m.date);
      const mMonth = mDate.toLocaleString('es', { month: 'short' });
      const amount = m.amountInUSD || 0;
      const isSale = m.movementType === MovementType.FACTURA;
      
      const monthIdx = last6Months.indexOf(mMonth);
      if (monthIdx !== -1) {
        if (isSale) monthlyData[monthIdx].ingresos += amount;
        else monthlyData[monthIdx].egresos += amount;
      }

      if (isSale) {
        const sellerName = m.concept.split('-')[0].trim() || 'General';
        sellerMap[sellerName] = (sellerMap[sellerName] || 0) + amount;
        
        if (mDate.getMonth() === currentMonth) {
          totalSales += amount;
          saleCount++;
        } else if (mDate.getMonth() === prevMonth) {
          totalSalesPrev += amount;
        }
      }
    });

    const sellers = Object.entries(sellerMap)
      .map(([name, value], i) => ({
        name,
        value,
        color: ['#a855f7', '#ec4899', '#10b981', '#3b82f6', '#f59e0b'][i % 5]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const salesChange = totalSalesPrev > 0 ? ((totalSales - totalSalesPrev) / totalSalesPrev * 100).toFixed(1) : '100';
    const ticketPromedio = saleCount > 0 ? (totalSales / saleCount).toFixed(2) : '0.00';
    
    // Salud del Negocio (Relación Ingresos/Egresos)
    const totalIngresos = monthlyData.reduce((acc, d) => acc + d.ingresos, 0);
    const totalEgresos = monthlyData.reduce((acc, d) => acc + d.egresos, 0);
    const healthScore = totalIngresos > 0 ? (totalIngresos / (totalIngresos + totalEgresos) * 100) : 0;
    const businessHealth = healthScore > 70 ? 'Óptima' : healthScore > 40 ? 'Estable' : 'Crítica';

    // Índice de Actividad (Ventas por día en el mes actual)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const activityIndex = ((saleCount / daysInMonth) * 10).toFixed(1);

    return {
      chartData: monthlyData,
      sellerData: sellers.length > 0 ? sellers : [{ name: 'Sin Datos', value: 0, color: '#e2e8f0' }],
      stats: {
        proyeccion: totalSales.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
        ticket: `$${ticketPromedio}`,
        change: `${Number(salesChange) >= 0 ? '+' : ''}${salesChange}%`,
        trend: Number(salesChange) >= 0 ? 'up' : 'down',
        health: businessHealth,
        activity: activityIndex
      }
    };
  }, [movements]);

  // FUNCIÓN DE EXPORTACIÓN REAL
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Estilo del Header
    doc.setFontSize(22);
    doc.setTextColor(15, 118, 110); // Indigo/Teal color
    doc.text('Vision Lab - Reporte de Analítica', 20, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado el: ${new Date().toLocaleString()}`, 20, 30);
    doc.text(`Basado en ${movements.length} operaciones.`, 20, 35);

    // Resumen de KPIs
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Resumen Ejecutivo', 20, 50);
    doc.setFontSize(11);
    doc.text(`Ventas del Mes Actual: ${stats.proyeccion}`, 25, 60);
    doc.text(`Ticket Promedio: ${stats.ticket}`, 25, 67);
    doc.text(`Crecimiento vs Mes Anterior: ${stats.change}`, 25, 74);

    // Tabla de Movimientos Recientes
    doc.setFontSize(14);
    doc.text('Detalle de Operaciones Recientes', 20, 90);
    
    const tableData = movements.slice(0, 20).map(m => [
      new Date(m.date).toLocaleDateString(),
      m.concept,
      m.movementType,
      `$${(m.amountInUSD || 0).toFixed(2)}`,
      m.metodoPago || 'N/A'
    ]);

    (doc as any).autoTable({
      startY: 100,
      head: [['Fecha', 'Concepto', 'Tipo', 'Monto (USD)', 'Método']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110] }
    });

    doc.save(`reporte-visionlab-${new Date().getTime()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans animate-in">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>
            Vision Lab <span className="text-indigo-600">—</span> 
            <span className="text-slate-400 font-normal ml-2">Analytics & AI Insights</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Datos sincronizados en tiempo real
          </p>
        </div>
        <button 
          onClick={handleExportPDF}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 group"
        >
          <FileText className="w-5 h-5 group-hover:animate-pulse" />
          Exportar Reporte
        </button>
      </header>

      {/* Grid de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
        <StatCard 
          title="Ventas del Mes" 
          value={stats.proyeccion} 
          change={stats.change} 
          trend={stats.trend}
          icon={Target} 
          colorClass="bg-purple-500" 
        />
        <StatCard 
          title="Ticket Promedio" 
          value={stats.ticket} 
          change={stats.change} 
          trend={stats.trend}
          icon={Receipt} 
          colorClass="bg-fuchsia-500" 
        />
        <StatCard 
          title="Salud del Negocio" 
          value={stats.health} 
          change="Real-time" 
          trend={stats.health === 'Crítica' ? 'down' : 'up'}
          icon={Zap} 
          colorClass="bg-emerald-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-8 bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border-none min-h-[500px]">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <TrendingUp className="text-indigo-500" />
                Flujo de Caja Real (USD)
              </h2>
              <p className="text-slate-400 text-sm font-medium mt-1">Saldos operativos de los últimos 6 meses</p>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="ingresos" 
                  stroke="#6366f1" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorIngresos)" 
                  name="Ingresos"
                />
                <Area 
                  type="monotone" 
                  dataKey="egresos" 
                  stroke="#f43f5e" 
                  strokeWidth={2}
                  fillOpacity={0} 
                  strokeDasharray="5 5"
                  name="Egresos"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border-none min-h-[500px]">
          <div className="mb-10">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Zap className="text-amber-500 w-5 h-5 fill-amber-500" />
              Líderes de Venta
            </h2>
            <p className="text-slate-400 text-sm font-medium mt-1">Top rendimiento por concepto</p>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={sellerData}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  width={100}
                />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={20}>
                  {sellerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-6 p-4 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-indigo-600 w-4 h-4" />
              <span className="text-xs font-bold text-indigo-700">Índice de Actividad</span>
            </div>
            <span className="text-sm font-black text-indigo-900">{stats.activity}/10</span>
          </div>
        </div>
      </div>
    </div>
  );
}
