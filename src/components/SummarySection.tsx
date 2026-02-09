import React, { useState, useMemo } from 'react';
import { Movement, AppConfig, ExchangeRates, OperationalRecord, MovementType, PaymentCurrency, Customer, AccountType, Supplier } from '../../types';
import { formatCurrency } from '../utils/formatters';
import Autocomplete from './Autocomplete';

interface SummarySectionProps {
  customerMovements: Movement[];
  records: OperationalRecord[];
  config: AppConfig;
  rates: ExchangeRates;
    customers: Customer[];
    suppliers: Supplier[];
    onRegisterCustomer: (c: Customer) => void;
    onRegisterSupplier: (s: Supplier) => void;
  onUpdateRates: (newRates: ExchangeRates) => void;
  setActiveTab: (tab: string) => void;
  onRegisterMovement: (data: any) => void;
}

const SummarySection: React.FC<SummarySectionProps> = ({ 
    customerMovements, records, setActiveTab, customers, suppliers, onRegisterCustomer, onRegisterSupplier, onRegisterMovement, rates 
}) => {
  
  // --- STATE FOR QUICK TERMINAL ---
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickType, setQuickType] = useState<MovementType>(MovementType.FACTURA);
  const [quickForm, setQuickForm] = useState({
      customerName: '',
      amount: '',
      accountType: AccountType.DIVISA,
      reference: '',
      concept: ''
  });
    const [quickPaymentOption, setQuickPaymentOption] = useState<'USD'|'BS'>('USD');
    const [quickTarget, setQuickTarget] = useState<'CUSTOMER'|'SUPPLIER'>('CUSTOMER');
    const [creatingInline, setCreatingInline] = useState(false);
    const [newEntity, setNewEntity] = useState<{ id: string; cedula?: string; telefonoCountry?: string; telefono?: string; direccion?: string }>({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });

  // --- ANALYTICS CALCULATIONS (VISION LAB) ---

  // 1. Cash Flow (Ingresos Reales vs Egresos Operativos)
  const cashFlow = useMemo(() => {
      const income = customerMovements
        .filter(m => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + m.amountInUSD, 0);
      
      const expenses = records.reduce((sum, r) => sum + r.amount, 0);
      const maxVal = Math.max(income, expenses, 1);
      
      return { income, expenses, maxVal };
  }, [customerMovements, records]);

  // 2. Debt Distribution (Por Cobrar: Divisa vs BCV)
  const debtDistribution = useMemo(() => {
      const debts = customerMovements.filter(m => m.movementType === MovementType.FACTURA);
      const bcvDebt = debts.filter(m => m.currency === PaymentCurrency.BS).reduce((s, m) => s + m.amountInUSD, 0);
      const usdDebt = debts.filter(m => m.currency === PaymentCurrency.USD).reduce((s, m) => s + m.amountInUSD, 0);
      const total = bcvDebt + usdDebt || 1;
      
      return { 
          bcvPercent: (bcvDebt / total) * 100, 
          usdPercent: (usdDebt / total) * 100,
          total
      };
  }, [customerMovements]);

  // 3. Sales Trend (Last 7 Days)
  const salesTrend = useMemo(() => {
      const today = new Date();
      const last7 = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(today.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
      });

      const data = last7.map(date => {
          const total = customerMovements
            .filter(m => m.date === date && m.movementType === MovementType.FACTURA)
            .reduce((s, m) => s + m.amountInUSD, 0);
          return total;
      });

      // Normalize for SVG Polyline (0-100 height)
      const max = Math.max(...data, 1);
      const points = data.map((val, i) => {
          const x = (i / (data.length - 1)) * 100;
          const y = 100 - ((val / max) * 100);
          return `${x},${y}`;
      }).join(' ');

      return { points, totalWeek: data.reduce((a,b)=>a+b, 0) };
  }, [customerMovements]);


  // --- HANDLERS ---
  const handleQuickSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(!quickForm.customerName || !quickForm.amount) return;

      // Logic to resolve rate and currency
      const isBsAccount = quickForm.accountType !== AccountType.DIVISA;
      const enteredAmount = parseFloat(quickForm.amount);

    // Determinar método de pago según la opción rápida seleccionada
    const metodoPago = quickPaymentOption === 'BS' ? 'Transferencia' : (quickForm.reference && quickForm.reference.trim().length > 0 ? 'Transferencia' : 'Efectivo');

    // Si seleccionamos BS usamos la tasa correspondiente, si USD usamos 1:1
    const cardRate = (quickForm.accountType === AccountType.BCV ? rates.bcv : rates.grupo);
    const rate = quickPaymentOption === 'BS' ? cardRate : 1;

    const currency = quickPaymentOption === 'BS' || isBsAccount ? PaymentCurrency.BS : PaymentCurrency.USD;

    // amountInUSD: para bolívares (abono) dividimos por la tasa; para USD usamos directo
    const amountInUSD = (currency === PaymentCurrency.BS) ? (enteredAmount / rate) : enteredAmount;

    // montoCalculado: lo que se registra como monto real (por ejemplo mostrar en caja). Transferencia 1:1, efectivo puede multiplicar si fuese necesario
    const montoCalculado = metodoPago === 'Efectivo' ? (enteredAmount * (currency === PaymentCurrency.BS ? cardRate : 1)) : enteredAmount;

      onRegisterMovement({
          customerName: quickForm.customerName,
          date: new Date().toISOString().split('T')[0],
          type: quickType,
          concept: quickForm.concept || (quickType === MovementType.FACTURA ? 'Venta Rápida' : 'Abono Rápida'),
          amount: amountInUSD,
          originalAmount: enteredAmount,
          currency: currency,
          rate: rate,
          accountType: quickForm.accountType,
          reference: quickForm.reference || null,
          metodoPago,
          isSupplierMovement: quickTarget === 'SUPPLIER',
          montoCalculado
      });

      setShowQuickModal(false);
      setQuickForm({ customerName: '', amount: '', accountType: AccountType.DIVISA, reference: '', concept: '' });
      alert("✅ Operación Registrada Exitosamente");
  };
  
  const handleCreateInlineCustomer = async () => {
      if(!newEntity.id) return alert('Nombre requerido');
      const payload: Customer = { id: newEntity.id.toUpperCase(), cedula: newEntity.cedula || 'N/A', telefono: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''), direccion: newEntity.direccion || '' };
      await onRegisterCustomer(payload);
      setQuickForm(prev => ({ ...prev, customerName: payload.id }));
      setCreatingInline(false);
      setNewEntity({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
  };

  const handleCreateInlineSupplier = async () => {
      if(!newEntity.id) return alert('Nombre requerido');
      const payload: Supplier = { id: newEntity.id.toUpperCase(), rif: newEntity.cedula || 'N/A', contacto: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''), categoria: 'GENERAL' };
      await onRegisterSupplier(payload);
      setQuickForm(prev => ({ ...prev, customerName: payload.id }));
      setCreatingInline(false);
      setNewEntity({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
  };
  const openQuickModal = (type: MovementType) => {
      setQuickType(type);
      setQuickTarget('CUSTOMER');
      setShowQuickModal(true);
  };

  const openQuickModalForSupplier = (type: MovementType) => {
      setQuickType(type);
      setQuickTarget('SUPPLIER');
      setShowQuickModal(true);
  };

  const AppIcon = ({ label, icon, color, target, description }: any) => (
    <button onClick={() => setActiveTab(target)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:-translate-y-1 transition-all text-left group flex items-center gap-4 w-full h-full">
      <div className={`w-12 h-12 rounded-xl ${color} text-white flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform`}>
        <i className={icon}></i>
      </div>
      <div>
         <h3 className="font-bold text-slate-800 dark:text-white text-sm">{label}</h3>
         <p className="text-[10px] text-slate-500 line-clamp-1">{description}</p>
      </div>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto py-8 animate-in space-y-8 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Panel de Control Principal</p>
           <h1 className="text-3xl font-light text-slate-800 dark:text-white">Resumen <span className="font-bold">Ejecutivo</span></h1>
        </div>
        
        {/* Indicador de Tasas Rápido */}
        <div className="flex gap-4">
             <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">BCV</p>
                <p className="text-xl font-black text-slate-800 dark:text-white">{rates.bcv}</p>
             </div>
             <div className="w-px bg-slate-200 dark:bg-slate-700"></div>
             <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Paralelo</p>
                <p className="text-xl font-black text-slate-800 dark:text-white">{rates.grupo}</p>
             </div>
        </div>
      </div>

      {/* ⚡ SECCIÓN 1: TERMINAL DE CAJA RÁPIDA (MODIFICADO PARA DARK/LIGHT) */}
      <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-[2.5rem] p-8 shadow-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden transition-colors duration-300">
          
          {/* Fondo decorativo sutil */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="relative z-10">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <i className="fa-solid fa-bolt text-amber-400"></i> Terminal de Caja Rápida
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Botón Factura */}
                  <button 
                    onClick={() => openQuickModal(MovementType.FACTURA)}
                    className="group relative bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 transition-all hover:scale-[1.02] active:scale-95 text-left shadow-sm hover:border-indigo-500"
                  >
                      <div className="absolute top-4 right-4 text-3xl opacity-20 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">🧾</div>
                      <h3 className="text-2xl font-black uppercase italic mb-1 text-slate-800 dark:text-white">Nueva Factura</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Registrar Deuda / Venta</p>
                  </button>

                  {/* Botón Abono */}
                  <button 
                    onClick={() => openQuickModal(MovementType.ABONO)}
                    className="group relative bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 transition-all hover:scale-[1.02] active:scale-95 text-left shadow-sm hover:border-emerald-500"
                  >
                      <div className="absolute top-4 right-4 text-3xl opacity-20 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">💰</div>
                      <h3 className="text-2xl font-black uppercase italic mb-1 text-slate-800 dark:text-white">Registrar Abono</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ingreso de Dinero / Pago</p>
                  </button>
              </div>
          </div>
      </div>

      {/* Terminal de Proveedores / Gastos (duplicado) */}
      <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-[2.5rem] p-8 shadow-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden transition-colors duration-300">
          <div className="relative z-10">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <i className="fa-solid fa-building text-amber-400"></i> Terminal de Proveedores / Gastos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button 
                    onClick={() => openQuickModalForSupplier(MovementType.FACTURA)}
                    className="group relative bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 transition-all hover:scale-[1.02] active:scale-95 text-left shadow-sm hover:border-indigo-500"
                  >
                      <div className="absolute top-4 right-4 text-3xl opacity-20 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">🧾</div>
                      <h3 className="text-2xl font-black uppercase italic mb-1 text-slate-800 dark:text-white">Registrar Gasto/Factura</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Registrar Deuda / Gasto</p>
                  </button>

                  <button 
                    onClick={() => openQuickModalForSupplier(MovementType.ABONO)}
                    className="group relative bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 transition-all hover:scale-[1.02] active:scale-95 text-left shadow-sm hover:border-emerald-500"
                  >
                      <div className="absolute top-4 right-4 text-3xl opacity-20 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">💸</div>
                      <h3 className="text-2xl font-black uppercase italic mb-1 text-slate-800 dark:text-white">Registrar Pago</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Salida de Dinero / Pago</p>
                  </button>
              </div>
          </div>
      </div>

      {/* 📊 SECCIÓN 2: VISION LAB (Analítica) */}
      <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-white mb-4 flex items-center gap-2">
             <i className="fa-solid fa-chart-pie text-indigo-500"></i> Vision Lab (Analítica)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* CARD 1: FLUJO DE CAJA */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col transition-colors">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Flujo de Caja Real</h4>
                  <div className="flex items-end justify-center gap-8 h-32 mt-auto pb-2 px-4">
                      {/* Income Bar */}
                      <div className="w-12 flex flex-col items-center gap-2 group">
                          <span className="text-[10px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">{formatCurrency(cashFlow.income, '$')}</span>
                          <div className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-t-lg relative overflow-hidden" style={{height: '100px'}}>
                              <div className="absolute bottom-0 w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(cashFlow.income / cashFlow.maxVal) * 100}%` }}></div>
                          </div>
                          <span className="text-[9px] font-black uppercase text-slate-500">Ingresos</span>
                      </div>
                      {/* Expense Bar */}
                      <div className="w-12 flex flex-col items-center gap-2 group">
                          <span className="text-[10px] font-bold text-rose-600 op acity-0 group-hover:opacity-100 transition-opacity">{formatCurrency(cashFlow.expenses, '$')}</span>
                          <div className="w-full bg-rose-100 dark:bg-rose-900/30 rounded-t-lg relative overflow-hidden" style={{height: '100px'}}>
                              <div className="absolute bottom-0 w-full bg-rose-500 transition-all duration-1000" style={{ height: `${(cashFlow.expenses / cashFlow.maxVal) * 100}%` }}></div>
                          </div>
                          <span className="text-[9px] font-black uppercase text-slate-500">Egresos</span>
                      </div>
                  </div>
              </div>

              {/* CARD 2: DEUDA POR COBRAR */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative transition-colors">
                  <h4 className="absolute top-6 left-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cartera de Deuda</h4>
                  <div className="w-32 h-32 rounded-full relative flex items-center justify-center mt-4"
                       style={{ background: `conic-gradient(#3B82F6 0% ${debtDistribution.bcvPercent}%, #10B981 ${debtDistribution.bcvPercent}% 100%)` }}>
                       <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex flex-col items-center justify-center z-10 transition-colors">
                           <span className="text-[9px] text-slate-400 font-bold">Total</span>
                           <span className="text-xs font-black text-slate-800 dark:text-white">{formatCurrency(debtDistribution.total, '$')}</span>
                       </div>
                  </div>
                  <div className="flex gap-4 mt-6 w-full justify-center">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-[9px] font-bold text-slate-500">BCV ({Math.round(debtDistribution.bcvPercent)}%)</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div><span className="text-[9px] font-bold text-slate-500">Divisa ({Math.round(debtDistribution.usdPercent)}%)</span></div>
                  </div>
              </div>

              {/* CARD 3: TENDENCIA VENTAS */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col transition-colors">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tendencia 7 Días</h4>
                   <p className="text-2xl font-black text-slate-800 dark:text-white mb-4">{formatCurrency(salesTrend.totalWeek, '$')} <span className="text-[9px] text-slate-400 font-normal align-middle">/ Semana</span></p>
                   <div className="flex-1 w-full h-24 relative">
                       <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                           <defs>
                             <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                               <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"></stop>
                               <stop offset="100%" stopColor="#6366f1" stopOpacity="0"></stop>
                             </linearGradient>
                           </defs>
                           <polygon points={`0,100 ${salesTrend.points} 100,100`} fill="url(#gradient)" />
                           <polyline fill="none" stroke="#6366f1" strokeWidth="3" points={salesTrend.points} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                           {salesTrend.points.split(' ').map((p, i) => (
                               <circle key={i} cx={p.split(',')[0]} cy={p.split(',')[1]} r="2" fill="white" stroke="#6366f1" strokeWidth="2" />
                           ))}
                       </svg>
                   </div>
              </div>

          </div>
      </div>

      {/* SHORTCUTS GRID */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-white mt-8 mb-4">Accesos Directos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
           <AppIcon label="Cobranzas" icon="fa-solid fa-folder-tree" color="bg-[#017E84]" target="clientes" description="Cartera clientes" />
           <AppIcon label="Libro Mayor" icon="fa-solid fa-book-journal-whills" color="bg-[#714B67]" target="contabilidad" description="Registro contable" />
           <AppIcon label="Cuentas x Pagar" icon="fa-solid fa-file-invoice-dollar" color="bg-[#3B82F6]" target="proveedores" description="Proveedores" />
           <AppIcon label="Inventario" icon="fa-solid fa-boxes-stacked" color="bg-[#10B981]" target="inventario" description="Control Stock" />
           <AppIcon label="RRHH" icon="fa-solid fa-users-gear" color="bg-[#EC4899]" target="nomina" description="Nómina y Vales" />
           <AppIcon label="Configuración" icon="fa-solid fa-sliders" color="bg-[#64748B]" target="config" description="Ajustes Sistema" />
        </div>
      </div>

      {/* QUICK OPERATION MODAL */}
      {showQuickModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
           <form onSubmit={handleQuickSubmit} className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 w-full max-w-md animate-in zoom-in border-t-8 border-indigo-500 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">
                      {quickType === MovementType.FACTURA ? 'Nueva Factura' : 'Registrar Abono'}
                  </h3>
                  <button type="button" onClick={() => setShowQuickModal(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="space-y-4">
                  {/* CLIENT */}
                        <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{quickTarget === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}</label>
                            <Autocomplete
                                items={quickTarget === 'CUSTOMER' ? customers : suppliers}
                                stringify={(i: any) => i.id}
                                secondary={(i: any) => quickTarget === 'CUSTOMER' ? i.cedula || '' : i.rif || ''}
                                placeholder={quickTarget === 'CUSTOMER' ? 'Buscar cliente por nombre o cédula...' : 'Buscar proveedor por nombre o RIF...'}
                                value={quickForm.customerName}
                                onChange={(v) => setQuickForm({...quickForm, customerName: v})}
                                onSelect={(it: any) => setQuickForm({...quickForm, customerName: it.id})}
                                onCreate={(label: string) => {
                                     // Open inline create
                                     setCreatingInline(true);
                                     setNewEntity(prev => ({ ...prev, id: label }));
                                     return Promise.resolve();
                                }}
                            />
                        </div>

                        {creatingInline && (
                          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                              <div className="space-y-2">
                                  <input className="w-full p-3 bg-white dark:bg-slate-800 border-none rounded text-sm font-bold" value={newEntity.id} onChange={e => setNewEntity({...newEntity, id: e.target.value})} />
                                  <div className="grid grid-cols-3 gap-2">
                                      <select className="col-span-1 p-2 rounded" value={newEntity.telefonoCountry} onChange={e => setNewEntity({...newEntity, telefonoCountry: e.target.value})}>
                                          <option value="+58">+58</option>
                                          <option value="+1">+1</option>
                                          <option value="+52">+52</option>
                                      </select>
                                      <input className="col-span-2 p-2 rounded" placeholder="Teléfono" value={newEntity.telefono} onChange={e => setNewEntity({...newEntity, telefono: e.target.value})} />
                                  </div>
                                  <input className="w-full p-3 rounded" placeholder="Cédula / RIF" value={newEntity.cedula} onChange={e => setNewEntity({...newEntity, cedula: e.target.value})} />
                                  <input className="w-full p-3 rounded" placeholder="Dirección fiscal" value={newEntity.direccion} onChange={e => setNewEntity({...newEntity, direccion: e.target.value})} />
                                  <div className="flex gap-2 justify-end">
                                      <button type="button" onClick={() => { setCreatingInline(false); setNewEntity({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' }); }} className="px-3 py-2 text-sm">Cancelar</button>
                                      <button type="button" onClick={() => quickTarget === 'CUSTOMER' ? handleCreateInlineCustomer() : handleCreateInlineSupplier()} className="px-3 py-2 bg-indigo-600 text-white rounded">Crear y Seleccionar</button>
                                  </div>
                              </div>
                          </div>
                        )}

                  {/* ACCOUNT TYPE */}
                  <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cuenta / Moneda</label>
                      <select className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 dark:text-white outline-none" value={quickForm.accountType} onChange={e => setQuickForm({...quickForm, accountType: e.target.value as AccountType})}>
                          <option value={AccountType.DIVISA}>Divisa ($ Efectivo)</option>
                          <option value={AccountType.BCV}>Bolívares (BCV)</option>
                          <option value={AccountType.GRUPO}>Bolívares (Paralelo)</option>
                      </select>
                  </div>

                  {/* AMOUNT */}
                  <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Monto {quickForm.accountType === AccountType.DIVISA ? '($)' : '(Bs)'}</label>
                      <input type="number" step="0.01" className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-black text-2xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" value={quickForm.amount} onChange={e => setQuickForm({...quickForm, amount: e.target.value})} required />
                      <div className="mt-3">
                          <input type="text" className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-white outline-none" placeholder="Referencia (opcional)" value={quickForm.reference} onChange={e => setQuickForm({...quickForm, reference: e.target.value})} />
                      </div>

                      <div className="mt-2">
                          <div className="flex gap-2 mt-3">
                              <button type="button" onClick={() => { setQuickPaymentOption('USD'); setQuickForm(prev => ({ ...prev, accountType: AccountType.DIVISA })); }} className={`py-2 px-3 rounded-xl text-sm font-bold ${quickPaymentOption === 'USD' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white'}`}>
                                  USD / EFECTIVO
                              </button>
                              <button type="button" onClick={() => { setQuickPaymentOption('BS'); setQuickForm(prev => ({ ...prev, accountType: prev.accountType === AccountType.DIVISA ? AccountType.BCV : prev.accountType })); }} className={`py-2 px-3 rounded-xl text-sm font-bold ${quickPaymentOption === 'BS' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white'}`}>
                                  Bs / TRANSFERENCIA
                              </button>
                          </div>
                          <div className="mt-2">
                              <span style={{ backgroundColor: 'var(--odoo-primary)' }} className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full text-white">
                                  {quickPaymentOption === 'BS' ? '💳 TRANSFERENCIA' : '💵 EFECTIVO'}
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  {/* CONCEPT */}
                  <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Concepto</label>
                      <input type="text" className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-sm text-slate-700 dark:text-white outline-none" placeholder="Opcional: Detalle de venta..." value={quickForm.concept} onChange={e => setQuickForm({...quickForm, concept: e.target.value})} />
                  </div>
              </div>

              <div className="mt-8">
                  <button type="submit" className={`w-full py-4 rounded-xl font-black text-white text-xs uppercase tracking-widest shadow-xl transition-transform active:scale-95 ${quickType === MovementType.FACTURA ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                      Confirmar Operación
                  </button>
              </div>
           </form>
        </div>
      )}

    </div>
  );
};

export default SummarySection;