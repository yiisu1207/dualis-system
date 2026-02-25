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
  ArrowUpRight,
  ArrowDownRight,
  User,
  Tags,
  Download,
  Upload,
  Printer
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from '../../firebase/config';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { useRates } from '../../context/RatesContext';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  costoUSD: number;
  margen: number;
  precioVentaUSD: number;
  precioDetal: number;
  precioMayor: number;
  margenMayor: number;
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
  marca: '',
  categoria: 'General',
  costoUSD: 0,
  margen: 30,
  precioVentaUSD: 0,
  precioDetal: 0,
  precioMayor: 0,
  margenMayor: 20,
  stock: 0,
  stockMinimo: 5,
  iva: 16,
  unidad: 'UND',
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const KPICard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow flex-1 min-w-[240px]">
    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${colorClass}`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-slate-400 mt-1">{subtext}</p>}
    </div>
  </div>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AdminInventario() {
  const { tenantId } = useTenant();
  const { userProfile } = useAuth();
  const { rates } = useRates();
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

  const exchangeRate = rates.tasaBCV || 36.5;

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
    return { totalCapital, lowStockCount, totalItems: products.length, chartData };
  }, [products]);

  // 3. HANDLERS
  const handleCalculatePrice = (cost: number, margin: number) => cost + (cost * (margin / 100));

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const calculatedDetal = handleCalculatePrice(form.costoUSD, form.margen);
    const calculatedMayor = handleCalculatePrice(form.costoUSD, form.margenMayor);
    const payload = {
      ...form,
      precioVentaUSD: calculatedDetal,
      // Campos que el POS usa directamente
      precioDetal: calculatedDetal,
      precioMayor: calculatedMayor,
      // Campo de compatibilidad con CartContext fallback
      marketPrice: calculatedDetal,
      updatedAt: new Date().toISOString(),
    };
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
    <div className="min-h-screen bg-slate-50 p-8 pb-32 font-inter">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* HEADER & TOP DASHBOARD */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Centro de Control Logístico</h1>
              <p className="text-slate-400 font-medium text-sm mt-1 uppercase tracking-widest">Activos & Inventario Enterprise</p>
            </div>
            <div className="flex gap-3">
               <div className="px-5 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                 <BadgeDollarSign className="text-emerald-500" size={18} />
                 <span className="text-xs font-black text-slate-900">{exchangeRate} BS</span>
               </div>
               <button 
                onClick={() => { setEditingId(null); setForm(initialProduct); setModalOpen(true); }}
                className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
              >
                <Plus size={16} /> Nuevo Ingreso
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard title="Capital Invertido" value={`$${metrics.totalCapital.toLocaleString()}`} subtext={`${metrics.totalItems} productos activos`} icon={BadgeDollarSign} colorClass="bg-emerald-50 text-emerald-600" />
            <KPICard title="Alertas de Stock" value={metrics.lowStockCount} subtext="Revisiones urgentes" icon={AlertTriangle} colorClass="bg-rose-50 text-rose-600" />
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm h-32 flex flex-col">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Valoración por Categoría</p>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.chartData}>
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {metrics.chartData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#0f172a' : '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl w-fit shadow-sm">
          {[
            { id: 'catalog', label: 'Catálogo Maestro', icon: Package },
            { id: 'kardex', label: 'Kardex / Auditoría', icon: History },
            { id: 'tools', label: 'Herramientas', icon: Settings2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-3 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden min-h-[500px]">
          
          {/* TAB 1: CATALOG */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col h-full">
              <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por código, nombre o categoría..." className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" />
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-10 py-6">Producto / SKU</th>
                      <th className="px-10 py-6">Categoría</th>
                      <th className="px-10 py-6 text-right">Costo USD</th>
                      <th className="px-10 py-6 text-right">Precio Venta</th>
                      <th className="px-10 py-6 text-center">Stock</th>
                      <th className="px-10 py-6 text-right">Gestionar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase())).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-colors">
                              <Package size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{p.nombre}</p>
                              <p className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg w-fit mt-1">{p.codigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.categoria}</span>
                        </td>
                        <td className="px-10 py-6 text-right font-bold text-slate-500">${p.costoUSD.toFixed(2)}</td>
                        <td className="px-10 py-6 text-right">
                          <p className="text-sm font-black text-emerald-600">${(p.precioDetal || p.precioVentaUSD || 0).toFixed(2)} <span className="text-[9px] font-black text-slate-300">detal</span></p>
                          <p className="text-[10px] font-black text-amber-500">${(p.precioMayor || 0).toFixed(2)} <span className="text-[9px] text-slate-300">mayor</span></p>
                          <p className="text-[10px] font-black text-slate-300">Bs {((p.precioDetal || p.precioVentaUSD || 0) * exchangeRate).toFixed(2)}</p>
                        </td>
                        <td className="px-10 py-6 text-center">
                          <div className={`inline-flex flex-col items-center px-4 py-2 rounded-2xl ${p.stock < p.stockMinimo ? 'bg-rose-50' : 'bg-slate-50'}`}>
                            <span className={`text-sm font-black ${p.stock < p.stockMinimo ? 'text-rose-600' : 'text-slate-900'}`}>{p.stock}</span>
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">unidades</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            <button onClick={() => { setSelectedProduct(p); setAdjModalOpen(true); }} className="p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200" title="Ajuste de Stock"><TrendingUp size={14} /></button>
                            <button onClick={() => { setEditingId(p.id); setForm({ ...initialProduct, ...p }); setModalOpen(true); }} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"><Pencil size={14} /></button>
                            <button onClick={async () => { if(confirm('¿Eliminar?')) await deleteDoc(doc(db, `businesses/${tenantId}/products`, p.id)); }} className="p-2.5 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"><Trash2 size={14} /></button>
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
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-10 py-6">Fecha / Hora</th>
                    <th className="px-10 py-6">Producto</th>
                    <th className="px-10 py-6">Operación</th>
                    <th className="px-10 py-6 text-center">Cant.</th>
                    <th className="px-10 py-6">Notas</th>
                    <th className="px-10 py-6">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="text-xs font-bold text-slate-600 hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-6 text-slate-400 font-mono">
                        {m.createdAt instanceof Timestamp ? m.createdAt.toDate().toLocaleString() : 'Reciente'}
                      </td>
                      <td className="px-10 py-6 text-slate-900">{m.productName}</td>
                      <td className="px-10 py-6">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          m.type === 'VENTA' ? 'bg-amber-50 text-amber-600' : 
                          m.type === 'COMPRA' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>{m.type}</span>
                      </td>
                      <td className={`px-10 py-6 text-center font-black ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-10 py-6 italic text-slate-400">{m.reason || '—'}</td>
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500"><User size={12} /></div>
                          {m.userName}
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
            <div className="p-20 grid grid-cols-1 md:grid-cols-3 gap-10">
              <button className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group">
                <div className="h-20 w-20 rounded-[2rem] bg-white shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><Download className="text-slate-900" /></div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Exportar Excel</span>
                <span className="text-[10px] font-medium text-slate-400 mt-2">Respaldo total de stock</span>
              </button>
              <button className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group">
                <div className="h-20 w-20 rounded-[2rem] bg-white shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><Upload className="text-slate-900" /></div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Importar Carga</span>
                <span className="text-[10px] font-medium text-slate-400 mt-2">Carga masiva por archivo</span>
              </button>
              <button className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200 hover:border-slate-900 hover:bg-white transition-all group">
                <div className="h-20 w-20 rounded-[2rem] bg-white shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><Printer className="text-slate-900" /></div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Imprimir Barras</span>
                <span className="text-[10px] font-medium text-slate-400 mt-2">Generar etiquetas PDF</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* MODAL: NEW / EDIT PRODUCT */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-900">{editingId ? 'Ficha de Activo' : 'Nuevo Ingreso'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1 italic">Módulo de Abastecimiento</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-10 space-y-8 max-h-[60vh] overflow-y-auto custom-scroll">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Código SKU / Barras</label>
                  <div className="relative">
                    <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input required value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value.toUpperCase()})} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" placeholder="SCAN_CODE" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Categoría</label>
                  <input required value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" placeholder="Ej. Pantalones" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nombre del Producto</label>
                  <input required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" placeholder="Nombre completo del producto..." />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Marca / Fabricante</label>
                  <input value={form.marca} onChange={e => setForm({...form, marca: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" placeholder="Ej. Samsung, Nike..." />
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white space-y-6">
                <div className="flex items-center gap-3"><TrendingUp size={20} className="text-emerald-400" /><span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Análisis de Rentabilidad</span></div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Costo Base ($)</label><input type="number" step="0.01" value={form.costoUSD} onChange={e => setForm({...form, costoUSD: Number(e.target.value)})} className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" /></div>
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Margen Detal (%)</label><input type="number" value={form.margen} onChange={e => setForm({...form, margen: Number(e.target.value)})} className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" /></div>
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Precio Detal (POS)</label><div className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-base font-black text-emerald-400">${handleCalculatePrice(form.costoUSD, form.margen).toFixed(2)}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Margen Mayor (%)</label><input type="number" value={form.margenMayor} onChange={e => setForm({...form, margenMayor: Number(e.target.value)})} className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-black focus:ring-2 focus:ring-amber-400 focus:outline-none transition-all" /></div>
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">IVA (%)</label><input type="number" value={form.iva} onChange={e => setForm({...form, iva: Number(e.target.value)})} className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-sm font-black focus:ring-2 focus:ring-amber-400 focus:outline-none transition-all" /></div>
                  <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Precio Mayor (POS)</label><div className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-base font-black text-amber-400">${handleCalculatePrice(form.costoUSD, form.margenMayor).toFixed(2)}</div></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Existencia Actual</label><input type="number" value={form.stock} onChange={e => setForm({...form, stock: Number(e.target.value)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Mínimo de Alerta</label><input type="number" value={form.stockMinimo} onChange={e => setForm({...form, stockMinimo: Number(e.target.value)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all" /></div>
              </div>
            </form>

            <div className="px-10 py-8 border-t border-slate-50 bg-slate-50/30 flex justify-end gap-4">
              <button onClick={() => setModalOpen(false)} className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all">Cancelar</button>
              <button onClick={handleSaveProduct} className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl active:scale-95">Guardar Ficha</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {adjModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-10 space-y-8">
              <div className="text-center">
                <div className="h-16 w-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-xl"><TrendingUp className="text-white" size={28} /></div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ajuste de Existencia</h2>
                <p className="text-xs font-bold text-slate-400 uppercase mt-1 tracking-widest">{selectedProduct.nombre}</p>
              </div>

              <div className="space-y-6">
                <div className="flex p-1.5 bg-slate-100 rounded-2xl">
                  <button onClick={() => setAdjData({...adjData, type: 'AJUSTE'})} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adjData.type === 'AJUSTE' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>Ajuste Positivo</button>
                  <button onClick={() => setAdjData({...adjData, type: 'MERMA'})} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adjData.type === 'MERMA' ? 'bg-white text-rose-600 shadow-md' : 'text-slate-400'}`}>Merma / Daño</button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cantidad (+/-)</label>
                  <input type="number" value={adjData.quantity} onChange={e => setAdjData({...adjData, quantity: Number(e.target.value)})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black text-center focus:ring-2 focus:ring-slate-900" placeholder="0" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Razón del Movimiento</label>
                  <textarea rows={3} value={adjData.reason} onChange={e => setAdjData({...adjData, reason: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900" placeholder="Ej. Mercancía dañada por humedad..." />
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setAdjModalOpen(false)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cerrar</button>
                <button onClick={handleAdjustStock} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 active:scale-95">Aplicar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
