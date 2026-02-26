import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AppConfig } from '../../types';
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
  Monitor,
  Fingerprint,
  Activity,
  X,
  Sliders,
  Type,
  Zap,
  Palette,
} from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import AuditLogViewer from '../components/AuditLogViewer';

type SectionType = 'identidad' | 'facturacion' | 'equipo' | 'seguridad' | 'suscripcion' | 'apariencia';

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
  security: {
    twoFactor: boolean;
    auditLogs: boolean;
    terminalMonitor: boolean;
  };
}

interface UiPrefs {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  accentColor: 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'blue';
  borderRadius: 'sharp' | 'normal' | 'rounded' | 'pill';
  density: 'compact' | 'normal' | 'spacious';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  numberFormat: 'dot' | 'comma';
  animationSpeed: 'fast' | 'normal' | 'slow' | 'none';
}

const DEFAULT_UI_PREFS: UiPrefs = {
  fontSize: 'base',
  accentColor: 'violet',
  borderRadius: 'normal',
  density: 'normal',
  dateFormat: 'DD/MM/YYYY',
  numberFormat: 'dot',
  animationSpeed: 'normal',
};

function applyUiPrefs(prefs: UiPrefs) {
  const root = document.documentElement;
  const fontSizes: Record<UiPrefs['fontSize'], string> = {
    xs: '11px', sm: '13px', base: '14px', lg: '16px', xl: '18px',
  };
  root.style.fontSize = fontSizes[prefs.fontSize] ?? '14px';
  const accents: Record<UiPrefs['accentColor'], { p: string; h: string; s: string }> = {
    indigo:  { p: '#4f46e5', h: '#4338ca', s: 'rgba(79,70,229,0.08)'   },
    violet:  { p: '#7c3aed', h: '#6d28d9', s: 'rgba(124,58,237,0.08)'  },
    emerald: { p: '#059669', h: '#047857', s: 'rgba(5,150,105,0.08)'    },
    rose:    { p: '#e11d48', h: '#be123c', s: 'rgba(225,29,72,0.08)'    },
    amber:   { p: '#d97706', h: '#b45309', s: 'rgba(217,119,6,0.08)'    },
    blue:    { p: '#2563eb', h: '#1d4ed8', s: 'rgba(37,99,235,0.08)'    },
  };
  const a = accents[prefs.accentColor] ?? accents.violet;
  root.style.setProperty('--ui-accent', a.p);
  root.style.setProperty('--ui-accent-hover', a.h);
  root.style.setProperty('--ui-soft', a.s);
  const radii: Record<UiPrefs['borderRadius'], string> = {
    sharp: '4px', normal: '12px', rounded: '20px', pill: '9999px',
  };
  root.style.setProperty('--ui-radius', radii[prefs.borderRadius] ?? '12px');
  root.setAttribute('data-density', prefs.density);
  const speeds: Record<UiPrefs['animationSpeed'], string> = {
    fast: '0.1s', normal: '0.25s', slow: '0.5s', none: '0s',
  };
  root.style.setProperty('--ui-transition', speeds[prefs.animationSpeed] ?? '0.25s');
}

const Configuracion: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile } = useAuth();
  const toast = useToast();

  const [activeSection, setActiveSection] = useState<SectionType>('identidad');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // PIN Modal state
  const [pinModal, setPinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');

  const [configData, setConfigData] = useState<ConfigData>({
    companyName: '',
    companyRif: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    defaultIva: 16,
    mainCurrency: 'USD',
    invoicePrefix: 'FACT-',
    ticketFooter: '¡Gracias por su compra!',
    security: {
      twoFactor: false,
      auditLogs: true,
      terminalMonitor: true,
    },
  });

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';
  const businessId = userProfile?.businessId;

  useEffect(() => {
    const loadData = async () => {
      if (!businessId) return;
      setLoading(true);
      try {
        const [configSnap, usersSnap] = await Promise.all([
          getBusinessConfig(businessId),
          listUsers(businessId),
        ]);
        if (configSnap) {
          setConfigData(prev => ({
            ...prev,
            ...configSnap,
            defaultIva: Number(configSnap.defaultIva || 16),
          }));
        }
        setUsers(usersSnap);
      } catch (e) {
        console.error('Error cargando configuración:', e);
        toast.error('No se pudo cargar la configuración');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [businessId]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    getDoc(doc(db, 'users', userProfile.uid)).then(snap => {
      if (snap.exists() && snap.data().uiPrefs) {
        const saved = { ...DEFAULT_UI_PREFS, ...snap.data().uiPrefs } as UiPrefs;
        setUiPrefs(saved);
        applyUiPrefs(saved);
      }
    }).catch(() => {});
  }, [userProfile?.uid]);

  const handleSaveConfig = async () => {
    if (!isAdmin || !businessId || !userProfile?.uid) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'businessConfigs', businessId);
      await setDoc(docRef, {
        ...configData,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile.uid,
      }, { merge: true });

      await updateBusiness(businessId, {
        name: configData.companyName,
        rif: configData.companyRif,
      });

      toast.success('Configuración guardada correctamente');
    } catch (e) {
      console.error('Error al guardar:', e);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async () => {
    if (!userProfile?.uid) return;
    if (newPinValue.length !== 4) {
      toast.warning('El PIN debe ser exactamente de 4 dígitos');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', userProfile.uid), { pin: newPinValue }, { merge: true });
      updateUserProfile({ pin: newPinValue });
      toast.success('PIN Maestro actualizado correctamente');
      setPinModal(false);
      setNewPinValue('');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar el PIN');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleSaveUiPrefs = async () => {
    if (!userProfile?.uid) return;
    setSavingPrefs(true);
    try {
      await setDoc(doc(db, 'users', userProfile.uid), { uiPrefs }, { merge: true });
      applyUiPrefs(uiPrefs);
      toast.success('Preferencias de apariencia guardadas');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar preferencias');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-slate-400" />
      </div>
    );
  }

  const menuItems = [
    { id: 'identidad', label: 'Identidad del Negocio', icon: Building2 },
    { id: 'facturacion', label: 'Facturación y POS', icon: Receipt },
    { id: 'equipo', label: 'Equipo y Permisos', icon: Users2 },
    { id: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
    { id: 'suscripcion', label: 'Suscripción', icon: CreditCard },
    { id: 'apariencia', label: 'Apariencia', icon: Palette },
  ];

  const inputClasses =
    'w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 transition-all shadow-inner outline-none placeholder:text-slate-300';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      {/* HEADER */}
      <header className="h-24 bg-white border-b border-slate-200 px-10 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(-1)}
            className="h-12 w-12 flex items-center justify-center rounded-2xl hover:bg-slate-50 text-slate-400 transition-all border border-transparent hover:border-slate-100"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centro de Configuración</h1>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Workspace Enterprise
            </div>
          </div>
        </div>
        <button
          disabled={saving}
          onClick={handleSaveConfig}
          className="flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Guardar Cambios</>}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ASIDE */}
        <aside className="w-80 border-r border-slate-200 bg-white p-8 overflow-y-auto custom-scroll">
          <nav className="space-y-3">
            {menuItems.map(item => (
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

        {/* MAIN CONTENT */}
        <main className="flex-1 p-12 overflow-y-auto custom-scroll bg-slate-50/30">
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-6 duration-700">

            {/* IDENTIDAD */}
            {activeSection === 'identidad' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="flex justify-between items-start mb-12">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Building2 className="text-indigo-500" size={28} /> Identidad del Negocio
                      </h3>
                      <p className="text-sm text-slate-400 font-medium mt-2">Configura los datos fiscales y públicos de tu empresa.</p>
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
                      <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xs">Aparecerá en facturas, tickets y correos. Se recomienda SVG o PNG transparente.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Globe size={12} /> Nombre Comercial</label>
                      <input value={configData.companyName} onChange={e => setConfigData({ ...configData, companyName: e.target.value })} placeholder="Ej. Mi Empresa" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><FileText size={12} /> RIF / Documento Fiscal</label>
                      <input value={configData.companyRif} onChange={e => setConfigData({ ...configData, companyRif: e.target.value })} placeholder="J-00000000-0" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Phone size={12} /> Teléfono</label>
                      <input value={configData.companyPhone} onChange={e => setConfigData({ ...configData, companyPhone: e.target.value })} placeholder="+58 412 0000000" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Mail size={12} /> Correo Electrónico</label>
                      <input value={configData.companyEmail} onChange={e => setConfigData({ ...configData, companyEmail: e.target.value })} placeholder="contacto@empresa.com" className={inputClasses} />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><MapPin size={12} /> Dirección Fiscal</label>
                      <textarea rows={3} value={configData.companyAddress} onChange={e => setConfigData({ ...configData, companyAddress: e.target.value })} placeholder="Calle, Edificio, Ciudad..." className={`${inputClasses} py-5 resize-none`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FACTURACIÓN */}
            {activeSection === 'facturacion' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 mb-12">
                    <Receipt className="text-emerald-500" size={28} /> Parámetros de Venta
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Percent size={12} /> IVA por Defecto (%)</label>
                      <input type="number" value={configData.defaultIva} onChange={e => setConfigData({ ...configData, defaultIva: Number(e.target.value) })} className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Coins size={12} /> Moneda Principal</label>
                      <select value={configData.mainCurrency} onChange={e => setConfigData({ ...configData, mainCurrency: e.target.value as any })} className={inputClasses}>
                        <option value="USD">Dólares (USD)</option>
                        <option value="BS">Bolívares (VES)</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><FileText size={12} /> Prefijo de Facturación</label>
                      <input value={configData.invoicePrefix} onChange={e => setConfigData({ ...configData, invoicePrefix: e.target.value.toUpperCase() })} className={inputClasses} placeholder="FACT-" />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><MessageSquare size={12} /> Mensaje al Pie del Ticket</label>
                      <textarea rows={3} value={configData.ticketFooter} onChange={e => setConfigData({ ...configData, ticketFooter: e.target.value })} className={`${inputClasses} py-5 resize-none`} placeholder="Gracias por preferirnos..." />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EQUIPO */}
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
                      {users.map(u => (
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
                  {users.length === 0 && (
                    <div className="px-12 py-16 text-center text-slate-400 text-sm font-semibold">Sin miembros registrados aún</div>
                  )}
                </div>
              </div>
            )}

            {/* SEGURIDAD */}
            {activeSection === 'seguridad' && (
              <div className="space-y-10 pb-20">
                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 mb-12">
                    <ShieldCheck className="text-indigo-500" size={28} /> Protocolos de Seguridad
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    {[
                      { id: 'twoFactor', title: 'Autenticación de Dos Factores (2FA)', desc: 'Protege tu acceso con un código dinámico adicional.', enabled: configData.security.twoFactor, icon: Fingerprint },
                      { id: 'auditLogs', title: 'Registros de Auditoría', desc: 'Seguimiento de inicios de sesión y acciones críticas.', enabled: configData.security.auditLogs, icon: Activity },
                      { id: 'terminalMonitor', title: 'Monitoreo de Terminales', desc: 'Controla qué dispositivos están autorizados para facturar.', enabled: configData.security.terminalMonitor, icon: Monitor },
                    ].map(opt => (
                      <div key={opt.id} className="flex items-center justify-between p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all duration-500">
                        <div className="flex items-center gap-6">
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${opt.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <opt.icon size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{opt.title}</h4>
                            <p className="text-xs text-slate-400 font-medium mt-1">{opt.desc}</p>
                          </div>
                        </div>
                        <div
                          onClick={() => setConfigData({ ...configData, security: { ...configData.security, [opt.id]: !opt.enabled } })}
                          className={`h-8 w-14 rounded-full relative cursor-pointer transition-colors ${opt.enabled ? 'bg-slate-900' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1.5 h-5 w-5 bg-white rounded-full transition-all shadow-sm ${opt.enabled ? 'right-1.5' : 'left-1.5'}`} />
                        </div>
                      </div>
                    ))}

                    {/* AUDIT LOG VIEWER */}
                    {configData.security.auditLogs && businessId && (
                      <div className="mt-8">
                        <AuditLogViewer businessId={businessId} />
                      </div>
                    )}

                    {/* PIN MAESTRO */}
                    <div className="mt-8 p-12 bg-slate-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                      <div className="absolute -right-20 -top-20 h-64 w-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10">
                        <h4 className="text-2xl font-black mb-2 flex items-center gap-3">
                          <Fingerprint className="text-indigo-400" /> PIN de Autoridad Maestro
                        </h4>
                        <p className="text-slate-400 text-sm font-medium mb-10 max-w-md">
                          Código de 4 dígitos requerido para eliminar facturas, clientes o realizar ajustes críticos.
                        </p>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex gap-4">
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} className={`h-16 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${userProfile?.pin ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                                {userProfile?.pin ? '●' : ''}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => { setNewPinValue(''); setPinModal(true); }}
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

            {/* SUSCRIPCION */}
            {activeSection === 'suscripcion' && (
              <div className="space-y-10 pb-20">
                <div className="bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-125 transition-transform duration-700 pointer-events-none">
                    <ShieldCheck size={180} />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-8">
                      <div className="h-1.5 w-1.5 rounded-full bg-white animate-ping" /> Plan Enterprise Activo
                    </div>
                    <h3 className="text-5xl font-black tracking-tighter mb-4">Enterprise Pro</h3>
                    <p className="text-slate-400 font-medium text-lg mb-12 max-w-md leading-relaxed">Infraestructura dedicada, terminales ilimitadas y soporte técnico prioritario 24/7.</p>
                    <div className="flex gap-6">
                      <button className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">Historial de Facturas</button>
                      <button className="px-10 py-5 bg-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/10 hover:bg-white/20 transition-all">Gestionar Plan</button>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <h4 className="text-xl font-black text-slate-900 mb-2 tracking-tight">Acceso a la Organización</h4>
                  <p className="text-sm text-slate-400 font-medium mb-10 leading-relaxed">Usa este identificador para conectar sucursales o invitar personal.</p>
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 mb-4">CÓDIGO DE ESPACIO ÚNICO</p>
                    <p className="text-3xl font-mono font-black text-slate-900 break-all select-all tracking-wider">{businessId}</p>
                    <button
                      onClick={() => handleCopyToClipboard(businessId || '')}
                      className="mt-8 flex items-center gap-3 mx-auto px-8 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-all shadow-xl active:scale-95"
                    >
                      <Copy size={16} /> {copyToast ? '¡Copiado!' : 'Copiar Identificador'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* APARIENCIA */}
            {activeSection === 'apariencia' && (
              <div className="space-y-8 pb-20">

                {/* Header card */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-10 rounded-[3rem] text-white relative overflow-hidden shadow-2xl shadow-violet-500/20">
                  <div className="absolute -right-10 -top-10 h-48 w-48 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -left-6 -bottom-6 h-32 w-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-3">
                      <Palette size={22} className="text-violet-200" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-200">Personalización por Usuario</span>
                    </div>
                    <h3 className="text-3xl font-black tracking-tight mb-2">Tu Espacio, Tu Estilo</h3>
                    <p className="text-violet-200 text-sm font-medium leading-relaxed max-w-md">
                      Ajusta la apariencia a tu gusto. Cada cambio se guarda por usuario y aplica al instante.
                    </p>
                  </div>
                </div>

                {/* Font size */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                    <Type size={14} /> Tamaño de Fuente
                  </h4>
                  <div className="flex gap-3 flex-wrap">
                    {([
                      { val: 'xs',   label: 'XS',   size: 'text-xs'   },
                      { val: 'sm',   label: 'SM',   size: 'text-sm'   },
                      { val: 'base', label: 'Base', size: 'text-base' },
                      { val: 'lg',   label: 'LG',   size: 'text-lg'   },
                      { val: 'xl',   label: 'XL',   size: 'text-xl'   },
                    ] as const).map(f => (
                      <button
                        key={f.val}
                        onClick={() => setUiPrefs(p => ({ ...p, fontSize: f.val }))}
                        className={`flex-1 min-w-[70px] flex flex-col items-center gap-2 py-6 px-3 rounded-2xl border-2 transition-all ${
                          uiPrefs.fontSize === f.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10'
                        }`}
                      >
                        <span className={`font-black text-slate-900 dark:text-white ${f.size}`}>Aa</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                    <Palette size={14} /> Color de Acento
                  </h4>
                  <div className="flex gap-5 flex-wrap">
                    {([
                      { val: 'indigo',  bg: 'bg-indigo-500',  ring: 'ring-indigo-400',  label: 'Índigo'    },
                      { val: 'violet',  bg: 'bg-violet-500',  ring: 'ring-violet-400',  label: 'Violeta'   },
                      { val: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-400', label: 'Esmeralda' },
                      { val: 'rose',    bg: 'bg-rose-500',    ring: 'ring-rose-400',    label: 'Rosa'      },
                      { val: 'amber',   bg: 'bg-amber-500',   ring: 'ring-amber-400',   label: 'Ámbar'     },
                      { val: 'blue',    bg: 'bg-blue-500',    ring: 'ring-blue-400',    label: 'Azul'      },
                    ] as const).map(c => (
                      <button
                        key={c.val}
                        onClick={() => setUiPrefs(p => ({ ...p, accentColor: c.val }))}
                        title={c.label}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className={`h-12 w-12 rounded-2xl ${c.bg} transition-all ${
                          uiPrefs.accentColor === c.val
                            ? `ring-4 ring-offset-2 ${c.ring} scale-110`
                            : 'hover:scale-105 opacity-70 hover:opacity-100'
                        }`} />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Border radius */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                    <Sliders size={14} /> Forma de los Bordes
                  </h4>
                  <div className="flex gap-4 flex-wrap">
                    {([
                      { val: 'sharp',   label: 'Recto',   cls: 'rounded-none' },
                      { val: 'normal',  label: 'Normal',  cls: 'rounded-xl'   },
                      { val: 'rounded', label: 'Suave',   cls: 'rounded-3xl'  },
                      { val: 'pill',    label: 'Cápsula', cls: 'rounded-full' },
                    ] as const).map(r => (
                      <button
                        key={r.val}
                        onClick={() => setUiPrefs(p => ({ ...p, borderRadius: r.val }))}
                        className={`flex-1 min-w-[80px] flex flex-col items-center gap-4 py-7 rounded-2xl border-2 transition-all ${
                          uiPrefs.borderRadius === r.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10'
                        }`}
                      >
                        <div className={`h-8 w-16 bg-slate-900 dark:bg-white/80 ${r.cls}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6">Densidad de Interfaz</h4>
                  <div className="flex gap-4">
                    {([
                      { val: 'compact',  label: 'Compacto',  desc: 'Más contenido visible', bars: [4, 4, 4, 4] },
                      { val: 'normal',   label: 'Normal',    desc: 'Espaciado balanceado',  bars: [6, 6, 6]    },
                      { val: 'spacious', label: 'Espacioso', desc: 'Más fácil de leer',     bars: [10, 10]     },
                    ] as const).map(d => (
                      <button
                        key={d.val}
                        onClick={() => setUiPrefs(p => ({ ...p, density: d.val }))}
                        className={`flex-1 p-6 rounded-2xl border-2 transition-all text-left ${
                          uiPrefs.density === d.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10'
                        }`}
                      >
                        <div className="flex flex-col gap-1 mb-4">
                          {d.bars.map((h, i) => (
                            <div key={i} className="rounded bg-slate-200 dark:bg-white/10 w-full" style={{ height: `${h}px` }} />
                          ))}
                        </div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{d.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{d.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animation speed */}
                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                    <Zap size={14} /> Velocidad de Animaciones
                  </h4>
                  <div className="flex gap-3 flex-wrap">
                    {([
                      { val: 'fast',   label: 'Rápido'     },
                      { val: 'normal', label: 'Normal'     },
                      { val: 'slow',   label: 'Suave'      },
                      { val: 'none',   label: 'Sin animar' },
                    ] as const).map(s => (
                      <button
                        key={s.val}
                        onClick={() => setUiPrefs(p => ({ ...p, animationSpeed: s.val }))}
                        className={`flex-1 py-4 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${
                          uiPrefs.animationSpeed === s.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                            : 'border-slate-100 dark:border-white/[0.06] text-slate-400 hover:border-slate-200 dark:hover:border-white/10'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date + number format */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Date format */}
                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6">Formato de Fecha</h4>
                    <div className="space-y-3">
                      {(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setUiPrefs(p => ({ ...p, dateFormat: fmt }))}
                          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all ${
                            uiPrefs.dateFormat === fmt
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10'
                          }`}
                        >
                          <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300">{fmt}</span>
                          {uiPrefs.dateFormat === fmt && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Number format */}
                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 dark:bg-slate-900 dark:border-white/[0.06]">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-6">Separador de Miles</h4>
                    <div className="space-y-3">
                      {([
                        { val: 'dot',   example: '1.000.000,00', desc: 'Estilo europeo / latam' },
                        { val: 'comma', example: '1,000,000.00', desc: 'Estilo americano'        },
                      ] as const).map(n => (
                        <button
                          key={n.val}
                          onClick={() => setUiPrefs(p => ({ ...p, numberFormat: n.val }))}
                          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all ${
                            uiPrefs.numberFormat === n.val
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10'
                          }`}
                        >
                          <div className="text-left">
                            <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300 block">{n.example}</span>
                            <span className="text-[10px] text-slate-400">{n.desc}</span>
                          </div>
                          {uiPrefs.numberFormat === n.val && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveUiPrefs}
                    disabled={savingPrefs}
                    className="flex items-center gap-3 px-12 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-violet-700 hover:to-indigo-700 transition-all shadow-2xl shadow-violet-500/25 active:scale-95 disabled:opacity-50"
                  >
                    {savingPrefs ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Guardar Preferencias</>}
                  </button>
                </div>

              </div>
            )}

          </div>
        </main>
      </div>

      {/* PIN MODAL */}
      {pinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95">
            <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900">Nuevo PIN Maestro</h2>
              <button onClick={() => { setPinModal(false); setNewPinValue(''); }} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-sm text-slate-400 font-medium">Ingresa exactamente 4 dígitos numéricos.</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPinValue}
                onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full text-center text-3xl font-mono tracking-[1rem] px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 outline-none"
                placeholder="••••"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setPinModal(false); setNewPinValue(''); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePin}
                  disabled={newPinValue.length !== 4 || saving}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : 'Guardar PIN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Configuracion;
