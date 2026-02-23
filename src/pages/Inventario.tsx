import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import {
  BadgeDollarSign,
  Barcode,
  Package,
  Pencil,
  Search,
  Trash2,
  Plus,
  TrendingUp,
  AlertTriangle,
  History,
  FileSpreadsheet,
  Settings2,
  X,
  User,
  Tags,
  Download,
  Upload,
  Printer
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  costoUSD: number;
  margen: number;
  precioVentaUSD: number;
  stock: number;
  stockMinimo: number;
  iva: number;
  unidad: string;
};

type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  type: 'VENTA' | 'COMPRA' | 'AJUSTE' | 'MERMA';
  quantity: number;
  reason: string;
  userName: string;
  createdAt: any;
};

type TabType = 'catalog' | 'kardex' | 'tools';

const initialProduct: Omit<Product, 'id'> = {
  codigo: '',
  nombre: '',
  categoria: 'General',
  costoUSD: 0,
  margen: 30,
  precioVentaUSD: 0,
  stock: 0,
  stockMinimo: 5,
  iva: 16,
  unidad: 'UND',
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const KPICard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-6 hover:shadow-2xl transition-all flex-1 min-w-[280px] group">
    <div className={`h-14 w-14 rounded-3xl flex items-center justify-center transition-transform group-hover:scale-110 ${colorClass}`}>
      <Icon size={28} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{subtext}</p>}
    </div>
  </div>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function Inventario() {
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const tenantId = userProfile?.businessId;
  
  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for Catalog
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialProduct);
  
  // States for Adjustments
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjData, setAdjData] = useState({ type: 'AJUSTE', quantity: 0, reason: '' });

  // 1. DATA LISTENERS
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    
    // Listen to Products
    const qProd = query(collection(db, `businesses/${tenantId}/products`));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    });

    // Listen to Movements (Kardex)
    const qMov = query(
      collection(db, `businesses/${tenantId}/stock_movements`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubMov = onSnapshot(qMov, (snap) => {
      setMovements(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockMovement)));
    });

    return () => { unsubProd(); unsubMov(); };
  }, [tenantId]);

  // 2. METRICS
  const metrics = useMemo(() => {
    const totalCapital = products.reduce((acc, p) => acc + (p.costoUSD * p.stock), 0);
    const lowStockCount = products.filter(p => p.stock < p.stockMinimo).length;
    const catMap: Record<string, number> = {};
    products.forEach(p => catMap[p.categoria] = (catMap[p.categoria] || 0) + (p.costoUSD * p.stock));
    const chartData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    return { totalCapital, lowStockCount, totalItems: products.reduce((acc, p) => acc + p.stock, 0), chartData };
  }, [products]);

  // 3. HANDLERS
  const handleCalculatePrice = (cost: number, margin: number) => cost + (cost * (margin / 100));

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const payload = { ...form, precioVentaUSD: handleCalculatePrice(form.costoUSD, form.margen), updatedAt: new Date().toISOString() };
    if (editingId) {
      await setDoc(doc(db, `businesses/${tenantId}/products`, editingId), payload, { merge: true });
    } else {
      await addDoc(collection(db, `businesses/${tenantId}/products`), payload);
    }
    setModalOpen(false);
    setForm(initialProduct);
    setEditingId(null);
  };

  const handleAdjustStock = async () => {
    if (!tenantId || !selectedProduct) return;
    const newStock = selectedProduct.stock + Number(adjData.quantity);
    
    // Update Product Stock
    await setDoc(doc(db, `businesses/${tenantId}/products`, selectedProduct.id), { stock: newStock }, { merge: true });
    
    // Log Movement
    await addDoc(collection(db, `businesses/${tenantId}/stock_movements`), {
      productId: selectedProduct.id,
      productName: selectedProduct.nombre,
      type: adjData.type,
      quantity: Number(adjData.quantity),
      reason: adjData.reason,
      userName: userProfile?.fullName || 'Admin',
      createdAt: serverTimestamp()
    });

    setAdjModalOpen(false);
    setSelectedProduct(null);
    setAdjData({ type: 'AJUSTE', quantity: 0, reason: '' });
  };

  // 4. RENDERING
  return (
    <div className="min-h-screen bg-slate-50 p-8 pt-24 pb-32 font-inter">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* DASHBOARD PERSISTENTE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <KPICard title="Capital en Stock" value={`$${metrics.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} subtext={`${metrics.totalItems} unidades en bodega`} icon={BadgeDollarSign} colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100" />
          <KPICard title="Alertas Críticas" value={metrics.lowStockCount} subtext="Revisiones de stock urgentes" icon={AlertTriangle} colorClass="bg-rose-50 text-rose-600 shadow-rose-100" />
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col group h-full">
            <div className="flex justify-between items-center mb-4 px-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Inversión por Rama</p>
              <TrendingUp size={16} className="text-slate-300" />
            </div>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData}>
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {metrics.chartData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#0f172a' : '#cbd5e1'} />)}
                  </Bar>
                  <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* CONTROLES Y NAVEGACIÓN */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex gap-2 p-2 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
            {[
              { id: 'catalog', label: 'Catálogo Maestro', icon: Package },
              { id: 'kardex', label: 'Kardex / Auditoría', icon: History },
              { id: 'tools', label: 'Herramientas', icon: Settings2 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-3 px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <button 
            onClick={() => { setEditingId(null); setForm(initialProduct); setModalOpen(true); }}
            className="flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95"
          >
            <Plus size={18} /> Registrar Mercancía
          </button>
        </div>

        {/* AREA DE CONTENIDO */}
        <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* TAB 1: CATALOG */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col h-full">
              <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="relative w-full md:w-[450px]">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 h-5 w-5" />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por código, nombre o categoría..." className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" />
                </div>
                <div className="flex gap-4">
                   <div className="px-6 py-3 bg-slate-900 rounded-2xl text-white flex items-center gap-3 shadow-lg">
                     <Tags size={16} className="text-slate-400" />
                     <span className="text-[10px] font-black uppercase tracking-widest">{rates.tasaBCV.toFixed(2)} BS / USD</span>
                   </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-10 py-8">Producto / SKU</th>
                      <th className="px-10 py-8">Categoría</th>
                      <th className="px-10 py-8 text-right">Costo Unit.</th>
                      <th className="px-10 py-8 text-right">Precio Mercado</th>
                      <th className="px-10 py-8 text-center">Stock Real</th>
                      <th className="px-10 py-8 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase())).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all">
                              <Package size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 tracking-tight">{p.nombre}</p>
                              <p className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg w-fit mt-1.5 border border-slate-100">{p.codigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200">{p.categoria}</span>
                        </td>
                        <td className="px-10 py-8 text-right font-bold text-slate-500">
                          <p className="text-sm font-black">${p.costoUSD.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-300 uppercase tracking-widest mt-0.5">Margen: {p.margen}%</p>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <p className="text-sm font-black text-emerald-600">${p.precioVentaUSD.toFixed(2)}</p>
                          <p className="text-[10px] font-black text-slate-300 mt-0.5">Bs {(p.precioVentaUSD * rates.tasaBCV).toFixed(2)}</p>
                        </td>
                        <td className="px-10 py-8 text-center">
                          <div className={`inline-flex flex-col items-center px-6 py-3 rounded-2xl border ${p.stock < p.stockMinimo ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-lg font-black ${p.stock < p.stockMinimo ? 'text-rose-600' : 'text-slate-900'}`}>{p.stock}</span>
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">UNIDADES</span>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            <button onClick={() => { setSelectedProduct(p); setAdjModalOpen(true); }} className="p-3 rounded-2xl bg-slate-900 text-white hover:bg-emerald-500 transition-all shadow-xl shadow-slate-200" title="Ajuste de Stock"><TrendingUp size={16} /></button>
                            <button onClick={() => { setEditingId(p.id); setForm(p); setModalOpen(true); }} className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-all"><Pencil size={16} /></button>
                            <button onClick={async () => { if(confirm('¿Eliminar producto?')) await deleteDoc(doc(db, `businesses/${tenantId}/products`, p.id)); }} className="p-3 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: KARDEX */}
          {activeTab === 'kardex' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-8">Fecha / Hora</th>
                    <th className="px-10 py-8">Producto</th>
                    <th className="px-10 py-8">Operación</th>
                    <th className="px-10 py-8 text-center">Cant.</th>
                    <th className="px-10 py-8">Notas</th>
                    <th className="px-10 py-8">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="text-xs font-bold text-slate-600 hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-8 text-slate-400 font-mono">
                        {m.createdAt instanceof Timestamp ? m.createdAt.toDate().toLocaleString() : 'Reciente'}
                      </td>
                      <td className="px-10 py-8 text-slate-900 font-black">{m.productName}</td>
                      <td className="px-10 py-8">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                          m.type === 'VENTA' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                          m.type === 'COMPRA' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>{m.type}</span>
                      </td>
                      <td className={`px-10 py-8 text-center font-black text-base ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-10 py-8 italic text-slate-400 font-medium">{m.reason || 'Sincronización automática'}</td>
                      <td className="px-10 py-8 text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 shadow-inner"><User size={14} /></div>
                          <span className="uppercase tracking-tighter font-black text-[10px]">{m.userName}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: TOOLS */}
          {activeTab === 'tools' && (
            <div className="p-24 grid grid-cols-1 md:grid-cols-3 gap-12">
              <button className="flex flex-col items-center justify-center p-16 bg-slate-50 rounded-[4rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group shadow-inner">
                <div className="h-24 w-24 rounded-[2.5rem] bg-white shadow-2xl flex items-center justify-center mb-8 group-hover:rotate-6 transition-all"><Download className="text-slate-900" size={32} /></div>
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-900">Exportar Excel</span>
                <span className="text-[10px] font-bold text-slate-400 mt-3 uppercase">Stock Consolidado</span>
              </button>
              <button className="flex flex-col items-center justify-center p-16 bg-slate-50 rounded-[4rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group shadow-inner">
                <div className="h-24 w-24 rounded-[2.5rem] bg-white shadow-2xl flex items-center justify-center mb-8 group-hover:-rotate-6 transition-all"><Upload className="text-slate-900" size={32} /></div>
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-900">Importar Carga</span>
                <span className="text-[10px] font-bold text-slate-400 mt-3 uppercase">Carga Masiva Masiva</span>
              </button>
              <button className="flex flex-col items-center justify-center p-16 bg-slate-50 rounded-[4rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group shadow-inner">
                <div className="h-24 w-24 rounded-[2.5rem] bg-white shadow-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-all"><Printer className="text-slate-900" size={32} /></div>
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-900">Imprimir Barras</span>
                <span className="text-[10px] font-bold text-slate-400 mt-3 uppercase">Etiquetas Adhesivas</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* MODAL: NEW / EDIT PRODUCT */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <div className="px-12 py-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{editingId ? 'Ficha de Activo' : 'Nuevo Ingreso'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mt-2 italic">Logística de Abastecimiento</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-4 hover:bg-slate-100 rounded-full text-slate-400 transition-all shadow-sm"><X size={28} /></button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-12 space-y-8 max-h-[60vh] overflow-y-auto custom-scroll">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Código SKU / Barras</label>
                  <div className="relative">
                    <Barcode className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input required value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value.toUpperCase()})} className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner uppercase" placeholder="SCAN_BARCODE" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Categoría</label>
                  <input required value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Ej. Pantalones" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Descripción del Activo</label>
                <input required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Nombre completo del producto..." />
              </div>

              <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl text-white space-y-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-125 transition-transform"><TrendingUp size={120} /></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6"><TrendingUp size={24} className="text-emerald-400" /><span className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-400">Análisis Financiero Proyectado</span></div>
                  <div className="grid grid-cols-3 gap-8">
                    <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Costo Base ($)</label><input type="number" step="0.01" value={form.costoUSD} onChange={e => setForm({...form, costoUSD: Number(e.target.value)})} className="w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl text-lg font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" /></div>
                    <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Margen (%)</label><input type="number" value={form.margen} onChange={e => setForm({...form, margen: Number(e.target.value)})} className="w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl text-lg font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" /></div>
                    <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">PVP Sugerido</label><div className="w-full px-5 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xl font-black text-emerald-400 shadow-inner">${handleCalculatePrice(form.costoUSD, form.margen).toFixed(2)}</div></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Stock de Apertura</label><input type="number" value={form.stock} onChange={e => setForm({...form, stock: Number(e.target.value)})} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" /></div>
                <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Alerta de Mínimo</label><input type="number" value={form.stockMinimo} onChange={e => setForm({...form, stockMinimo: Number(e.target.value)})} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" /></div>
              </div>
            </form>

            <div className="px-12 py-10 border-t border-slate-50 bg-slate-50/30 flex justify-end gap-6">
              <button onClick={() => setModalOpen(false)} className="px-10 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-100 transition-all">Cancelar Operación</button>
              <button onClick={handleSaveProduct} className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-2xl shadow-slate-300 active:scale-95">Guardar Ficha Técnica</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {adjModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-12 space-y-10">
              <div className="text-center">
                <div className="h-20 w-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse"><TrendingUp className="text-white" size={32} /></div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Ajuste de Stock</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-[0.2em]">{selectedProduct.nombre}</p>
              </div>

              <div className="space-y-8">
                <div className="flex p-2 bg-slate-100 rounded-[1.5rem] shadow-inner">
                  <button onClick={() => setAdjData({...adjData, type: 'AJUSTE'})} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'AJUSTE' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400'}`}>Entrada / Ajuste</button>
                  <button onClick={() => setAdjData({...adjData, type: 'MERMA'})} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'MERMA' ? 'bg-white text-rose-600 shadow-xl' : 'text-slate-400'}`}>Salida / Merma</button>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Cantidad de Unidades</label>
                  <input type="number" value={adjData.quantity} onChange={e => setAdjData({...adjData, quantity: Number(e.target.value)})} className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-3xl font-black text-center focus:ring-4 focus:ring-slate-900 shadow-inner" placeholder="0" />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Razón de la Auditoría</label>
                  <textarea rows={3} value={adjData.reason} onChange={e => setAdjData({...adjData, reason: e.target.value})} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-bold focus:ring-2 focus:ring-slate-900 shadow-inner" placeholder="Explique el motivo del cambio..." />
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setAdjModalOpen(false)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cerrar</button>
                <button onClick={handleAdjustStock} className="flex-[2] py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 active:scale-95">Ejecutar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
