import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppConfig } from '../../types'; // ✅ CORREGIDO: Ruta correcta
import { 
  getBusinessConfig, 
  listUsers, 
  updateBusiness 
} from '../firebase/api';
import { 
  Building2, 
  Receipt, 
  Users2, 
  ShieldCheck, 
  CreditCard, 
  Save, 
  ArrowLeft,
  LogOut,
  Camera,
  CheckCircle2,
  Copy,
  Plus,
  ChevronRight,
  Loader2,
  Globe,
  Phone,
  Mail,
  MapPin,
  Percent,
  Coins,
  FileText,
  MessageSquare,
  Monitor, // ✅ CORREGIDO: Importación añadida
  Fingerprint,
  Activity
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config'; // ✅ CORREGIDO: Importación de auth añadida

type SectionType = 'identidad' | 'facturacion' | 'equipo' | 'seguridad' | 'suscripcion';

interface ConfigData {
  companyName: string;
  companyRif: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  defaultIva: number;
  mainCurrency: 'USD' | 'BS';
  invoicePrefix: string;
  ticketFooter: string;
}

const Configuracion: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionType>('identidad');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  const handleSaveConfigPin = async (newPin: string) => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), { pin: newPin }, { merge: true });
      updateUserProfile({ pin: newPin });
      alert('PIN Maestro actualizado exitosamente ✅');
    } catch (e) {
      console.error(e);
      alert('Error al guardar PIN');
    } finally {
      setSaving(false);
    }
  };

  // ESTADO GLOBAL DEL FORMULARIO
  const [configData, setConfigData] = useState<ConfigData>({
    companyName: '',
    companyRif: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    defaultIva: 16,
    mainCurrency: 'USD',
    invoicePrefix: 'FACT-',
    ticketFooter: '¡Gracias por su compra!'
  });

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';
  const businessId = userProfile?.businessId;

  // CONEXIÓN A FIREBASE (LECTURA)
  useEffect(() => {
    const loadData = async () => {
      if (!businessId) return;
      setLoading(true);
      try {
        const [configSnap, usersSnap] = await Promise.all([
          getBusinessConfig(businessId),
          listUsers(businessId)
        ]);

        if (configSnap) {
          setConfigData(prev => ({
            ...prev,
            ...configSnap,
            defaultIva: Number(configSnap.defaultIva || 16)
          }));
        }
        setUsers(usersSnap);
      } catch (e) {
        console.error("Error cargando configuración:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [businessId]);

  // CONEXIÓN A FIREBASE (ESCRITURA)
  const handleSaveConfig = async () => {
    if (!isAdmin || !businessId) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'businessConfigs', businessId);
      await setDoc(docRef, {
        ...configData,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid // Usar auth.currentUser directamente
      }, { merge: true });
      
      await updateBusiness(businessId, {
        name: configData.companyName,
        rif: configData.companyRif
      });

      alert('Configuración guardada exitosamente ✅');
    } catch (e) {
      console.error("Error al guardar:", e);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  const menuItems = [
    { id: 'identidad', label: 'Identidad del Negocio', icon: Building2 },
    { id: 'facturacion', label: 'Facturación y POS', icon: Receipt },
    { id: 'equipo', label: 'Equipo y Permisos', icon: Users2 },
    { id: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
    { id: 'suscripcion', label: 'Suscripción', icon: CreditCard },
  ];

  const inputClasses = "w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all shadow-inner outline-none placeholder:text-slate-300";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      
      {/* HEADER BAR */}
      <header className="h-24 bg-white border-b border-slate-200 px-10 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="h-12 w-12 flex items-center justify-center rounded-2xl hover:bg-slate-50 text-slate-400 transition-all border border-transparent hover:border-slate-100">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centro de Configuración</h1>
            {/* ✅ CORREGIDO: div en lugar de p para evitar nesting inválido */}
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Workspace Enterprise
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            disabled={saving}
            onClick={handleSaveConfig}
            className="flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Guardar Cambios</>}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT ASIDE MENU */}
        <aside className="w-80 border-r border-slate-200 bg-white p-8 overflow-y-auto custom-scroll">
          <nav className="space-y-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as SectionType)}
                className={`w-full flex items-center gap-4 px-6 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  activeSection === item.id 
                    ? 'bg-slate-900 text-white shadow-2xl shadow-slate-300 translate-x-2' 
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
              >
                <item.icon size={18} className={activeSection === item.id ? 'text-indigo-400' : 'text-slate-300'} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-20 pt-8 border-t border-slate-100">
            <button 
              onClick={() => auth.signOut()}
              className="w-full flex items-center gap-4 px-6 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest text-rose-400 hover:bg-rose-50 transition-all"
            >
              <LogOut size={18} /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* RIGHT CONTENT AREA */}
        <main className="flex-1 p-12 overflow-y-auto custom-scroll bg-slate-50/30">
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-6 duration-700">
            
            {/* SECTION: IDENTIDAD */}
            {activeSection === 'identidad' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="flex justify-between items-start mb-12">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Building2 className="text-indigo-500" size={28} /> Identidad del Negocio
                      </h3>
                      <p className="text-sm text-slate-400 font-medium mt-2">Configura la imagen pública y datos fiscales de tu empresa.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-10 mb-12 pb-12 border-b border-slate-50">
                    <div className="relative group">
                      <div className="h-40 w-40 rounded-[3rem] bg-slate-50 flex items-center justify-center border-4 border-white shadow-2xl overflow-hidden group-hover:scale-105 transition-transform duration-500">
                        <Building2 size={60} className="text-slate-200" />
                      </div>
                      <button className="absolute -bottom-2 -right-2 h-12 w-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl border-4 border-white hover:scale-110 active:scale-95 transition-all">
                        <Camera size={20} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Logo Corporativo</h4>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xs">El logo aparecerá en tus facturas, tickets y correos electrónicos. Se recomienda SVG o PNG transparente.</p>
                      <button className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 pt-2 transition-colors">Eliminar Imagen Actual</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <Globe size={12} /> Nombre Comercial
                      </label>
                      <input 
                        value={configData.companyName}
                        onChange={e => setConfigData({...configData, companyName: e.target.value})}
                        placeholder="Ej. Dualis Boutique"
                        className={inputClasses} 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <FileText size={12} /> RIF / Documento Fiscal
                      </label>
                      <input 
                        value={configData.companyRif}
                        onChange={e => setConfigData({...configData, companyRif: e.target.value})}
                        placeholder="J-00000000-0"
                        className={inputClasses} 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <Phone size={12} /> Teléfono de Contacto
                      </label>
                      <input 
                        value={configData.companyPhone}
                        onChange={e => setConfigData({...configData, companyPhone: e.target.value})}
                        placeholder="+58 412 0000000"
                        className={inputClasses} 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <Mail size={12} /> Correo Electrónico
                      </label>
                      <input 
                        value={configData.companyEmail}
                        onChange={e => setConfigData({...configData, companyEmail: e.target.value})}
                        placeholder="contacto@empresa.com"
                        className={inputClasses} 
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <MapPin size={12} /> Dirección Fiscal Completa
                      </label>
                      <textarea 
                        rows={3} 
                        value={configData.companyAddress}
                        onChange={e => setConfigData({...configData, companyAddress: e.target.value})}
                        placeholder="Calle, Edificio, Ciudad, Estado..."
                        className={`${inputClasses} py-5 resize-none`} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: FACTURACION */}
            {activeSection === 'facturacion' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 mb-12">
                    <Receipt className="text-emerald-500" size={28} /> Parámetros de Venta
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <Percent size={12} /> IVA por Defecto (%)
                      </label>
                      <input 
                        type="number"
                        value={configData.defaultIva}
                        onChange={e => setConfigData({...configData, defaultIva: Number(e.target.value)})}
                        className={inputClasses} 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <Coins size={12} /> Moneda Principal
                      </label>
                      <select 
                        value={configData.mainCurrency}
                        onChange={e => setConfigData({...configData, mainCurrency: e.target.value as any})}
                        className={inputClasses}
                      >
                        <option value="USD">Dólares (USD)</option>
                        <option value="BS">Bolívares (VES)</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <FileText size={12} /> Prefijo de Facturación
                      </label>
                      <input 
                        value={configData.invoicePrefix}
                        onChange={e => setConfigData({...configData, invoicePrefix: e.target.value.toUpperCase()})}
                        className={inputClasses} 
                        placeholder="FACT-"
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2">
                        <MessageSquare size={12} /> Mensaje al Pie del Ticket
                      </label>
                      <textarea 
                        rows={3} 
                        value={configData.ticketFooter}
                        onChange={e => setConfigData({...configData, ticketFooter: e.target.value})}
                        className={`${inputClasses} py-5 resize-none`} 
                        placeholder="Gracias por preferirnos..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: EQUIPO */}
            {activeSection === 'equipo' && (
              <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden pb-10">
                <div className="p-12 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Equipo</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Control de Roles y Autorizaciones</p>
                  </div>
                  <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95">
                    <Plus size={18} /> Invitar Miembro
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        <th className="px-12 py-8">Identidad</th>
                        <th className="px-12 py-8 text-center">Nivel</th>
                        <th className="px-12 py-8 text-center">Estado</th>
                        <th className="px-12 py-8 text-right">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.map((u) => (
                        <tr key={u.uid} className="group transition-all hover:bg-slate-50/50">
                          <td className="px-12 py-8">
                            <div className="flex items-center gap-5">
                              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xl shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all">
                                {u.fullName?.charAt(0) || u.email?.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900">{u.fullName || 'Sin nombre'}</p>
                                <p className="text-[10px] font-bold text-slate-400 tracking-tight mt-0.5">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-12 py-8 text-center">
                            <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100">{u.role}</span>
                          </td>
                          <td className="px-12 py-8 text-center">
                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                              {u.status}
                            </div>
                          </td>
                          <td className="px-12 py-8 text-right">
                            <button className="p-3 rounded-2xl text-slate-300 hover:bg-white hover:text-slate-900 hover:shadow-lg transition-all opacity-0 group-hover:opacity-100">
                              <ChevronRight size={20} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECTION: SEGURIDAD */}
            {activeSection === 'seguridad' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 mb-12">
                    <ShieldCheck className="text-indigo-500" size={28} /> Protocolos de Seguridad
                  </h3>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {[
                      { 
                        title: 'Autenticación de Dos Factores (2FA)', 
                        desc: 'Protege tu acceso administrativo con un código dinámico adicional.', 
                        enabled: false,
                        icon: Fingerprint 
                      },
                      { 
                        title: 'Registros de Auditoría', 
                        desc: 'Seguimiento detallado de cada inicio de sesión y acciones críticas del sistema.', 
                        enabled: true,
                        icon: Activity
                      },
                      { 
                        title: 'Monitoreo de Terminales', 
                        desc: 'Controla qué dispositivos están actualmente autorizados para facturar.', 
                        enabled: true,
                        icon: Monitor
                      }
                    ].map((opt, i) => (
                      <div key={i} className="flex items-center justify-between p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all duration-500">
                        <div className="flex items-center gap-6">
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${opt.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <opt.icon size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{opt.title}</h4>
                            <p className="text-xs text-slate-400 font-medium mt-1">{opt.desc}</p>
                          </div>
                        </div>
                        <div className={`h-8 w-14 rounded-full relative cursor-pointer transition-colors ${opt.enabled ? 'bg-slate-900' : 'bg-slate-200'}`}>
                          <div className={`absolute top-1.5 h-5 w-5 bg-white rounded-full transition-all shadow-sm ${opt.enabled ? 'right-1.5' : 'left-1.5'}`} />
                        </div>
                      </div>
                    ))}

                    {/* GESTIÓN DE PIN MAESTRO */}
                    <div className="mt-8 p-12 bg-slate-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute -right-20 -top-20 h-64 w-64 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors pointer-events-none"></div>
                        <div className="relative z-10">
                            <h4 className="text-2xl font-black mb-2 flex items-center gap-3">
                                <Fingerprint className="text-indigo-400" /> PIN de Autoridad Maestro
                            </h4>
                            <p className="text-slate-400 text-sm font-medium mb-10 max-w-md">Este código de 4 dígitos será solicitado para eliminar facturas, clientes o realizar ajustes contables críticos.</p>
                            
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="flex gap-4">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className={`h-16 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${userProfile?.pin ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                                            {userProfile?.pin ? '●' : ''}
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    onClick={() => {
                                        const val = prompt('Ingresa tu nuevo PIN de 4 dígitos:');
                                        if (val && val.length === 4 && !isNaN(Number(val))) {
                                            handleSaveConfigPin(val);
                                        } else if (val) {
                                            alert('El PIN debe ser exactamente de 4 números.');
                                        }
                                    }}
                                    className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
                                >
                                    {userProfile?.pin ? 'Cambiar PIN Maestro' : 'Establecer PIN Ahora'}
                                </button>
                            </div>
                        </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: SUSCRIPCION */}
            {activeSection === 'suscripcion' && (
              <div className="space-y-10 pb-20">
                <div className="bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-125 transition-transform duration-700 pointer-events-none">
                    <ShieldCheck size={180} />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-8 shadow-2xl shadow-emerald-900/40">
                      <div className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                      Plan Enterprise Activo
                    </div>
                    <h3 className="text-5xl font-black tracking-tighter mb-4">Enterprise Pro</h3>
                    <p className="text-slate-400 font-medium text-lg mb-12 max-w-md leading-relaxed">Infraestructura dedicada, terminales ilimitadas y soporte técnico prioritario 24/7 para tu negocio.</p>
                    <div className="flex gap-6">
                      <button className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-2xl shadow-white/10">Historial de Facturas</button>
                      <button className="px-10 py-5 bg-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/10 hover:bg-white/20 transition-all">Gestionar Plan</button>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h4 className="text-xl font-black text-slate-900 mb-2 tracking-tight">Acceso a la Organización</h4>
                  <p className="text-sm text-slate-400 font-medium mb-10 leading-relaxed">Usa este identificador global para conectar nuevas sucursales o invitar personal de confianza.</p>
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center relative group transition-all hover:border-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 mb-4">CÓDIGO DE ESPACIO ÚNICO</p>
                    <p className="text-3xl font-mono font-black text-slate-900 break-all select-all tracking-wider">{businessId}</p>
                    <button 
                      onClick={() => handleCopyToClipboard(businessId || '')}
                      className="mt-8 flex items-center gap-3 mx-auto px-8 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-all shadow-xl shadow-slate-100 active:scale-95"
                    >
                      <Copy size={16} /> {copyToast ? '¡Copiado!' : 'Copiar Identificador'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
};

export default Configuracion;
