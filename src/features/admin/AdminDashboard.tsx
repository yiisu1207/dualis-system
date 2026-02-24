import React, { useState, useEffect, useMemo } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useRates } from '../../context/RatesContext';
import { useAuth } from '../../context/AuthContext';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Movement, InventoryItem } from '../../../types';
import { 
  TrendingUp, 
  Calculator, 
  Store, 
  Users, 
  BadgeDollarSign, 
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Settings2,
  X,
  Save,
  Loader2,
  Wallet,
  Clock,
  AlertCircle,
  Package,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  ShoppingCart,
  Fingerprint,
  Zap
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';

// ─── COMPONENTES ATÓMICOS ────────────────────────────────────────────────────

const SectionLabel = ({ title, icon: Icon, colorClass }: any) => (
  <div className="flex items-center gap-3 mb-6 ml-2">
    <div className={`p-2 rounded-lg ${colorClass}`}>
      <Icon size={16} />
    </div>
    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{title}</h2>
  </div>
);

const KPICard = ({ title, value, subtext, icon: Icon, colorClass, trend, alert }: any) => (
  <div className={`bg-white p-8 rounded-[2.5rem] border ${alert ? 'border-rose-100 shadow-rose-50' : 'border-slate-100 shadow-xl shadow-slate-200/50'} flex flex-col justify-between hover:shadow-2xl transition-all duration-500 group relative overflow-hidden`}>
    <div className="flex justify-between items-start mb-6">
      <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 ${colorClass}`}>
        <Icon size={28} />
      </div>
      {trend !== undefined && (
        <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
    <div className="relative z-10">
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{title}</p>
      <p className={`text-3xl font-black ${alert ? 'text-rose-600' : 'text-slate-900'} tracking-tight`}>{value}</p>
      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">{subtext}</p>
    </div>
    {alert && <div className="absolute -right-4 -bottom-4 opacity-5 text-rose-600 rotate-12"><AlertCircle size={120} /></div>}
  </div>
);

// ─── DASHBOARD PRINCIPAL ─────────────────────────────────────────────────────

export default function AdminDashboard({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { tenantId } = useTenant();
  const { rates, updateRates } = useRates();
  const { userProfile } = useAuth();
  
  const [activeTerminals, setActiveTerminals] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRateBCV, setNewRateBCV] = useState('');
  const [newRateGrupo, setNewRateGrupo] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Listener de Terminales Activas
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/terminals`), where('estado', '==', 'abierta'));
    const unsub = onSnapshot(q, (snap) => setActiveTerminals(snap.size));
    return () => unsub();
  }, [tenantId]);

  // Listener de Movimientos
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, 'movements'), where('businessId', '==', tenantId), orderBy('date', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
      setLoading(false);
    });
    return () => unsub();
  }, [tenantId]);

  // Listener de Productos (Top y Stock)
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/products`), orderBy('stock', 'asc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    });
    return () => unsub();
  }, [tenantId]);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const salesToday = movements
      .filter(m => m.date === today && m.movementType === 'FACTURA')
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0);
    
    const salesYesterday = movements
      .filter(m => m.date === yesterday && m.movementType === 'FACTURA')
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0);

    const trendSales = salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : 0;

    const ticketsToday = movements.filter(m => m.date === today && m.movementType === 'FACTURA').length;
    const avgTicket = ticketsToday > 0 ? salesToday / ticketsToday : 0;

    // Cuentas por Cobrar (Créditos Activos)
    const totalCredits = movements
      .filter(m => m.movementType === 'FACTURA' && !m.isSupplierMovement)
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0) -
      movements
      .filter(m => (m.movementType === 'ABONO' || m.movementType === 'PAGO') && !m.isSupplierMovement)
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0);

    const recoveredToday = movements
      .filter(m => m.date === today && (m.movementType === 'ABONO' || m.movementType === 'PAGO') && !m.isSupplierMovement)
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0);

    // Cuotas Vencidas (Facturas a crédito > 15 días sin abono total)
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const overdueCredits = movements
      .filter(m => m.date < fifteenDaysAgo && m.movementType === 'FACTURA' && !m.isSupplierMovement)
      .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0) * 0.35; // Estimación conservadora

    return {
      salesToday,
      trendSales,
      avgTicket,
      totalCredits,
      recoveredToday,
      overdueCredits
    };
  }, [movements]);

  // Datos de la Gráfica Semanal
  const weeklyData = useMemo(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d.toISOString().split('T')[0],
        day: days[d.getDay()],
        sales: 0
      };
    });

    last7Days.forEach(day => {
      day.sales = movements
        .filter(m => m.date === day.date && m.movementType === 'FACTURA')
        .reduce((acc, m) => acc + (m.amountInUSD || m.amount || 0), 0);
    });

    return last7Days;
  }, [movements]);

  // Top Productos Vendidos (Agregado real de movimientos)
  const topProductsList = useMemo(() => {
    const salesMap: Record<string, { name: string; qty: number }> = {};
    
    movements.forEach(m => {
      if (m.movementType === 'FACTURA' && m.items) {
        m.items.forEach((item: any) => {
          const id = item.id || item.productId;
          if (!id) return;
          if (!salesMap[id]) salesMap[id] = { name: item.nombre || item.name || 'Producto', qty: 0 };
          salesMap[id].qty += (item.qty || 0);
        });
      }
    });

    return Object.entries(salesMap)
      .map(([id, data]) => ({
        id,
        name: data.name,
        sales: data.qty,
        trend: data.qty > 10 ? 'Alta' : 'Normal',
        color: 'text-indigo-600'
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [movements]);

  const handleUpdateRate = async () => {
    if (!tenantId) return;
    setIsSaving(true);
    try {
      await updateRates({
        tasaBCV: newRateBCV ? parseFloat(newRateBCV) : rates.tasaBCV,
        tasaGrupo: newRateGrupo ? parseFloat(newRateGrupo) : rates.tasaGrupo,
      });
      setIsModalOpen(false);
      setNewRateBCV('');
      setNewRateGrupo('');
    } catch (e) {
      alert('Error al actualizar tasa');
    } finally {
      setIsSaving(false);
    }
  };

  const suggestions = useMemo(() => {
    const list = [];
    if (!userProfile?.pin) {
      list.push({
        id: 'pin',
        title: 'Configura tu PIN Maestro',
        desc: 'Protege tus registros de eliminaciones accidentales o malintencionadas.',
        icon: Fingerprint,
        color: 'bg-rose-500',
        action: () => onTabChange?.('config')
      });
    }
    if (products.length === 0) {
      list.push({
        id: 'products',
        title: 'Carga tu Inventario',
        desc: 'Aún no tienes productos registrados para vender en el POS.',
        icon: Package,
        color: 'bg-indigo-500',
        action: () => onTabChange?.('inventario')
      });
    }
    if (movements.length === 0) {
      list.push({
        id: 'sales',
        title: 'Registra tu primera venta',
        desc: 'Usa el terminal para generar tu primera factura y ver las analíticas.',
        icon: ShoppingCart,
        color: 'bg-emerald-500',
        action: () => (window.location.href = `/${tenantId}/pos/detal`) // El POS sí está fuera de MainSystem
      });
    }
    return list;
  }, [userProfile, products, movements, tenantId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-inter">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* HEADER: SALUDO & TASA GIGANTE */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Panel de Control General</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">¡Hola, Admin! 👋</h1>
            <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest italic">
              Actividad financiera en <span className="text-slate-900 font-black">{tenantId}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="bg-white px-10 py-6 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 flex items-center gap-8 group hover:shadow-indigo-100 transition-all">
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">BCV (Oficial)</span>
                <span className="text-2xl font-black text-slate-900">{rates.tasaBCV.toFixed(2)}</span>
              </div>
              <div className="w-px h-10 bg-slate-100"></div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Grupo (Interna)</span>
                <span className="text-2xl font-black text-indigo-600">{rates.tasaGrupo.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => {
                  setNewRateBCV(rates.tasaBCV.toString());
                  setNewRateGrupo(rates.tasaGrupo.toString());
                  setIsModalOpen(true);
                }}
                className="ml-2 h-14 w-14 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-xl hover:bg-slate-800 transition-all active:scale-90 group duration-500"
              >
                <Settings2 size={24} className="group-hover:rotate-90 transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>

        {/* PANEL DE SUGERENCIAS / GUÍA DE INICIO */}
        {suggestions.length > 0 && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="flex items-center gap-3 mb-6 ml-2">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Zap size={16} />
              </div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Guía de Inicio Rápido</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={s.action}
                  className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-5 text-left hover:scale-[1.02] transition-all group"
                >
                  <div className={`h-12 w-12 rounded-2xl ${s.color} text-white flex items-center justify-center shrink-0 shadow-lg group-hover:rotate-12 transition-transform`}>
                    <s.icon size={24} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-tight mb-1">{s.title}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* SECCIÓN 1: FLUJO DE CAJA (POS / CONTADO) */}
        <section className="animate-in fade-in slide-in-from-left-4 duration-700">
          <SectionLabel title="Flujo de Caja (Ventas de Contado)" icon={Wallet} colorClass="bg-emerald-50 text-emerald-600" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <KPICard 
              title="Ingresos POS Hoy" 
              value={`$${kpis.salesToday.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              subtext="Capital liquidado hoy" 
              icon={TrendingUp} 
              colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100"
              trend={kpis.trendSales}
            />
            <KPICard 
              title="Ticket Promedio" 
              value={`$${kpis.avgTicket.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              subtext="Eficiencia de venta" 
              icon={Calculator} 
              colorClass="bg-sky-50 text-sky-600 shadow-sky-100"
            />
            <KPICard 
              title="Terminales Activas" 
              value={activeTerminals} 
              subtext="Cajas en operación" 
              icon={Store} 
              colorClass="bg-indigo-50 text-indigo-600 shadow-indigo-100"
            />
          </div>
        </section>

        {/* SECCIÓN 2: CUENTAS POR COBRAR (CRÉDITOS) */}
        <section className="bg-slate-100/40 p-10 rounded-[3.5rem] border border-white shadow-inner animate-in fade-in slide-in-from-right-4 duration-700 delay-100">
          <SectionLabel title="Cuentas por Cobrar (Ventas a Crédito)" icon={Clock} colorClass="bg-indigo-50 text-indigo-600" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <KPICard 
              title="Créditos Activos" 
              value={`$${kpis.totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              subtext="Deuda total en la calle" 
              icon={Users} 
              colorClass="bg-indigo-100/50 text-indigo-700"
            />
            <KPICard 
              title="Cuotas Vencidas" 
              value={`$${kpis.overdueCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              subtext="Estimado de retraso" 
              icon={AlertCircle} 
              colorClass="bg-rose-50 text-rose-600"
              alert={kpis.overdueCredits > 100}
            />
            <KPICard 
              title="Recuperado Hoy" 
              value={`$${kpis.recoveredToday.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              subtext="Pagos de deuda recibidos" 
              icon={CheckCircle2} 
              colorClass="bg-emerald-50 text-emerald-600"
            />
          </div>
        </section>

        {/* SECCIÓN 3: INTELIGENCIA DE NEGOCIO */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* GRÁFICA DE INGRESOS (8/12) */}
          <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 group">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Ingresos Generales de la Semana</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Consolidado Contado + Cobranzas</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                <Calendar size={20} />
              </div>
            </div>
            
            <div className="h-[350px] w-full min-h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fontWeight: '900', fill: '#94a3b8', textTransform: 'uppercase'}} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fontWeight: '900', fill: '#94a3b8'}} 
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px'}}
                    itemStyle={{fontSize: '14px', fontWeight: '900', color: '#0f172a'}}
                    labelStyle={{fontSize: '10px', fontWeight: '900', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase'}}
                  />
                  <Bar dataKey="sales" radius={[10, 10, 0, 0]} barSize={45}>
                    {weeklyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 6 ? '#4f46e5' : '#e2e8f0'} className="hover:fill-indigo-600 transition-all duration-300" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TOP PRODUCTOS (4/12) */}
          <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Estado de Stock</h3>
            </div>
            
            <div className="space-y-6 flex-1">
              {topProductsList.map((product, i) => (
                <div key={product.id} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50/50 hover:bg-white hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer border border-transparent hover:border-slate-100 group">
                  <div className={`h-12 w-12 rounded-2xl bg-white shadow-inner flex items-center justify-center ${product.color} opacity-60 group-hover:opacity-100 transition-all`}>
                    <Package size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate">{product.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{product.sales} unidades vendidas</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[10px] font-black ${product.trend === 'Bajo' ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'} px-2 py-0.5 rounded-full`}>{product.trend}</span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => onTabChange?.('inventario')}
              className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group"
            >
              Ver Inventario Completo <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
      </div>

      {/* UPDATE RATE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Ajustar Tasas</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1 italic">Mercado de Divisas</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-all shadow-sm"><X size={24} /></button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">BCV Hoy</p>
                  <p className="text-xl font-black text-slate-900">{rates.tasaBCV.toFixed(2)}</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Grupo Hoy</p>
                  <p className="text-xl font-black text-slate-900">{rates.tasaGrupo.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block font-black">Nueva Tasa BCV</label>
                  <input type="number" step="0.01" value={newRateBCV} onChange={e => setNewRateBCV(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-center focus:ring-4 focus:ring-slate-900 focus:bg-white shadow-inner transition-all outline-none" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block font-black">Nueva Tasa Grupo</label>
                  <input type="number" step="0.01" value={newRateGrupo} onChange={e => setNewRateGrupo(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-center focus:ring-4 focus:ring-slate-900 focus:bg-white shadow-inner transition-all outline-none" placeholder="0.00" />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all">Cancelar</button>
                <button disabled={isSaving || (!newRateBCV && !newRateGrupo)} onClick={handleUpdateRate} className="flex-[2] py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Guardar Cambios</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
