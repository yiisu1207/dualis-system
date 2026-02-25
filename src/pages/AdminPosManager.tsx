import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';
import { 
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Monitor, 
  Lock, 
  Unlock, 
  Plus, 
  Store, 
  Factory, 
  Calculator, 
  Receipt, 
  Activity, 
  X, 
  ChevronRight, 
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Loader2,
  Clock,
  Save,
  Download
} from 'lucide-react';
import ExcelJS from 'exceljs';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Terminal {
  id: string;
  nombre: string;
  tipo: 'detal' | 'mayor';
  estado: 'abierta' | 'cerrada';
  totalFacturado: number;
  movimientos: number;
  cajeroNombre: string;
  apertura?: string;
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const KPICard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500">
    <div className="flex justify-between items-start mb-6">
      <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 ${colorClass}`}>
        <Icon size={28} />
      </div>
      <div className="h-2 w-2 rounded-full bg-slate-200 group-hover:bg-indigo-500 transition-colors" />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{title}</p>
      <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">{subtext}</p>
    </div>
  </div>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function AdminPosManager() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const businessId = userProfile?.businessId;
  const isAdmin = userProfile?.role === 'owner' || userProfile?.role === 'admin';

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Auditoría
  const [selectedTerminalAudit, setSelectedTerminalAudit] = useState<Terminal | null>(null);
  const [auditMovements, setAuditMovements] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  
  // NUEVO: Estado para las pestañas Detal/Mayor
  const [activeTab, setActiveTab] = useState<'detal' | 'mayor'>('detal');
  
  // Form State
  const [newTerminal, setNewTerminal] = useState({ nombre: '', tipo: 'detal' as 'detal' | 'mayor' });

  const handleExportExcel = async () => {
    if (!auditMovements.length) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Auditoria');
    worksheet.columns = [
      { header: 'Fecha', key: 'date', width: 15 },
      { header: 'Concepto', key: 'concept', width: 30 },
      { header: 'Monto ($)', key: 'amount', width: 15 },
      { header: 'Tasa BCV', key: 'rate', width: 15 }
    ];
    auditMovements.forEach(m => worksheet.addRow({ date: m.date, concept: m.concept, amount: m.amountInUSD || m.amount, rate: m.rateUsed }));
    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer]));
    link.download = `Auditoria_${selectedTerminalAudit?.nombre}.xlsx`;
    link.click();
  };

  // 1. REAL-TIME LISTENER
  useEffect(() => {
    if (!businessId) {
      const timer = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(timer);
    }

    setLoading(true);
    const q = query(collection(db, `businesses/${businessId}/terminals`));
    
    const unsub = onSnapshot(q, 
      (snap) => {
        setTerminals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Terminal)));
        setLoading(false);
      },
      (error) => {
        console.error("Error loading terminals:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [businessId]);

  // Auditoría de movimientos
  useEffect(() => {
    if (!selectedTerminalAudit || !businessId) return;
    
    setLoadingAudit(true);
    const q = query(
      collection(db, 'movements'), 
      where('businessId', '==', businessId),
      where('cajaId', '==', selectedTerminalAudit.id),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      setAuditMovements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingAudit(false);
    });

    return () => unsub();
  }, [selectedTerminalAudit, businessId]);

  // 2. ANALYTICS (Suma Global de TODAS las cajas)
  const stats = useMemo(() => {
    const totalUSD = terminals.reduce((acc, t) => acc + (t.totalFacturado || 0), 0);
    const totalBS = totalUSD * (rates?.tasaBCV || 0); // Previene error si rates aún no carga
    const activeCount = terminals.filter(t => t.estado === 'abierta').length;
    return { totalUSD, totalBS, activeCount };
  }, [terminals, rates]);

  // Filtramos las cajas para mostrar solo las de la pestaña seleccionada
  const filteredTerminals = useMemo(() => {
    return terminals.filter(t => t.tipo === activeTab);
  }, [terminals, activeTab]);

  // 3. HANDLERS
  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !newTerminal.nombre) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/terminals`), {
        ...newTerminal,
        estado: 'cerrada',
        totalFacturado: 0,
        movimientos: 0,
        cajeroNombre: 'Sin asignar',
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewTerminal({ nombre: '', tipo: 'detal' });
    } catch (e) {
      alert('Error al crear terminal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseShift = async (id: string) => {
    if (!confirm('¿Confirmar cierre de turno? La terminal quedará inactiva.')) return;
    const terminalRef = doc(db, `businesses/${businessId}/terminals`, id);
    await updateDoc(terminalRef, {
      estado: 'cerrada',
      totalFacturado: 0,
      movimientos: 0,
      cajeroNombre: 'Sin asignar',
      apertura: null
    });
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-900 mb-4" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cargando Infraestructura...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 pt-4 font-inter">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* HEADER & KPIs */}
        <div className="space-y-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Control de Infraestructura</span>
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">Centro de Cajas</h1>
              <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest italic">Monitoreo de terminales de venta</p>
            </div>
            
            {isAdmin && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="h-16 px-10 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-3 group"
              >
                <Plus size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                Nueva Terminal
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <KPICard title="Cajas Activas" value={stats.activeCount} subtext="Terminales facturando ahora" icon={Monitor} colorClass="bg-indigo-50 text-indigo-600 shadow-indigo-100" />
            <KPICard title="Facturado Hoy ($)" value={`$${stats.totalUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}`} subtext="Ingresos totales en divisa" icon={Calculator} colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100" />
            <KPICard title="Facturado Hoy (BS)" value={`${stats.totalBS.toLocaleString('es-VE', {minimumFractionDigits: 2})} BS`} subtext={`Tasa: ${rates?.tasaBCV || 0} BS`} icon={Receipt} colorClass="bg-sky-50 text-sky-600 shadow-sky-100" />
          </div>
        </div>

        {/* NAVEGACIÓN DE PESTAÑAS (DETAL / MAYOR) */}
        <div className="flex gap-3 bg-white p-2 rounded-[1.5rem] shadow-sm border border-slate-100 w-fit">
          <button 
            onClick={() => setActiveTab('detal')}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'detal' ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'
            }`}
          >
            <Store size={14} /> Sucursal Detal
          </button>
          <button 
            onClick={() => setActiveTab('mayor')}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'mayor' ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'
            }`}
          >
            <Factory size={14} /> Sucursal Mayor
          </button>
        </div>

        {/* TERMINALS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
          {filteredTerminals.map((t) => (
            <div key={t.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col overflow-hidden group hover:shadow-2xl transition-all duration-500">
              {/* Card Header */}
              <div className={`p-8 pb-6 flex justify-between items-start ${t.estado === 'abierta' ? 'bg-emerald-50/30' : 'bg-slate-50/50'}`}>
                <div className="flex items-center gap-4">
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-inner ${t.tipo === 'detal' ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
                    {t.tipo === 'detal' ? <Store size={24} /> : <Factory size={24} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">{t.nombre}</h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.tipo === 'detal' ? 'Sucursal Detal' : 'Venta al Mayor'}</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${t.estado === 'abierta' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-200 text-slate-500'}`}>
                  {t.estado === 'abierta' ? <Unlock size={10} /> : <Lock size={10} />}
                  {t.estado}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-8 space-y-6 flex-1">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                  <div className="flex items-center gap-3">
                    <UserCheck size={16} className="text-slate-400" />
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cajero</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">{t.cajeroNombre}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Turno Actual</p>
                    <p className="text-xl font-black text-slate-900">${(t.totalFacturado || 0).toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Movimientos</p>
                    <p className="text-xl font-black text-slate-900">{t.movimientos || 0}</p>
                  </div>
                </div>

                {t.estado === 'abierta' && (
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest pt-2">
                    <Clock size={12} />
                    Inició hace {t.apertura ? 'poco' : '—'}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="p-8 pt-0 flex gap-3">
                <button 
                  onClick={() => setSelectedTerminalAudit(t)}
                  className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
                  title="Auditoría de Ventas"
                >
                  <Activity size={20} />
                </button>
                {t.estado === 'abierta' && isAdmin && (
                  <button 
                    onClick={() => handleCloseShift(t.id)}
                    className="flex-1 py-4 rounded-2xl bg-rose-50 text-rose-500 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all border border-rose-100"
                  >
                    Cerrar Turno
                  </button>
                )}
                <button 
                  onClick={() => navigate(`/${businessId}/pos/${t.tipo}?cajaId=${t.id}`)}
                  className={`flex-[2] py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl transition-all hover:scale-105 active:scale-95 ${t.estado === 'abierta' ? 'bg-slate-900 text-white shadow-slate-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  <ExternalLink size={14} />
                  Entrar Terminal
                </button>
              </div>
            </div>
          ))}

          {/* MENSAJE SI NO HAY CAJAS EN LA PESTAÑA */}
          {filteredTerminals.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-40">
              {activeTab === 'detal' ? <Store size={80} className="text-slate-300 mb-6" /> : <Factory size={80} className="text-slate-300 mb-6" />}
              <h3 className="text-2xl font-black text-slate-900">Sin Cajas de {activeTab === 'detal' ? 'Detal' : 'Mayor'}</h3>
              <p className="text-sm font-medium text-slate-400 mt-2 uppercase tracking-widest">No hay terminales registradas en esta sucursal</p>
            </div>
          )}
        </div>
      </div>

      {/* AUDIT MODAL (JOURNAL) */}
      {selectedTerminalAudit && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl h-screen shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Auditoría: {selectedTerminalAudit.nombre}</h2>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Historial de Transacciones</p>
                  <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md hover:bg-emerald-600 hover:text-white transition-all"
                  >
                    <Download size={10} /> Exportar Excel
                  </button>
                </div>
              </div>
              <button onClick={() => setSelectedTerminalAudit(null)} className="h-12 w-12 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scroll">
              {loadingAudit ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <Loader2 className="animate-spin mb-4" size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest">Consultando registros...</p>
                </div>
              ) : auditMovements.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                  <Activity size={64} className="mb-6" />
                  <h3 className="text-xl font-black">Sin Movimientos</h3>
                  <p className="text-sm font-medium mt-2">Esta terminal aún no ha procesado ventas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {auditMovements.map((m) => (
                    <div key={m.id} className="p-6 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                            {m.vendedorNombre?.charAt(0) || 'V'}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{m.entityId}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(m.createdAt).toLocaleTimeString()} • {m.date}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-slate-900">${Number(m.amountInUSD || m.amount).toFixed(2)}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Rate: {m.rateUsed || 0} BS</p>
                        </div>
                      </div>
                      
                      {/* Items mini-list */}
                      {m.items && (
                        <div className="pt-4 border-t border-slate-50 space-y-2">
                          {m.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-[10px] font-medium text-slate-500">
                              <span>{item.qty}x {item.nombre}</span>
                              <span className="font-bold text-slate-700">${Number(item.price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW TERMINAL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Nueva Terminal</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1 italic">Registro de Punto de Venta</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleCreateTerminal} className="p-10 space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Nombre Identificador</label>
                <input 
                  required
                  autoFocus
                  value={newTerminal.nombre}
                  onChange={e => setNewTerminal({...newTerminal, nombre: e.target.value})}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" 
                  placeholder="Ej. Caja Principal PB" 
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Tipo de Sucursal</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button"
                    onClick={() => setNewTerminal({...newTerminal, tipo: 'detal'})}
                    className={`py-5 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${newTerminal.tipo === 'detal' ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                  >
                    <Store size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Detal</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewTerminal({...newTerminal, tipo: 'mayor'})}
                    className={`py-5 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${newTerminal.tipo === 'mayor' ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                  >
                    <Factory size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Al Mayor</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all">Cancelar</button>
                <button 
                  disabled={isSaving || !newTerminal.nombre}
                  className="flex-[2] py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Crear Caja</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}