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
      <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] flex items-center justify-center">
        <Loader2 className="animate-spin h-10 w-10 text-indigo-500" />
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
    'w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-white/20';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] flex flex-col font-inter">
      {/* HEADER */}
      <header className="h-16 bg-white dark:bg-[#0d1424] border-b border-slate-200 dark:border-white/[0.07] px-6 flex items-center justify-between shrink-0 z-20 shadow-sm shadow-black/5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-400 dark:text-white/40 transition-all border border-transparent hover:border-slate-100 dark:hover:border-white/[0.08]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Centro de Configuración</h1>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Workspace Enterprise
            </div>
          </div>
        </div>
        <button
          disabled={saving}
          onClick={handleSaveConfig}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={15} /> : <><Save size={15} /> Guardar Cambios</>}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ASIDE */}
        <aside className="w-60 border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] p-4 overflow-y-auto custom-scroll">
          <nav className="space-y-1">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as SectionType)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  activeSection === item.id
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-white'
                }`}
              >
                <item.icon size={16} className={activeSection === item.id ? 'text-indigo-200' : 'text-slate-300 dark:text-white/30'} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-white/[0.07]">
            <button
              onClick={() => auth.signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
            >
              <LogOut size={16} /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-6 overflow-y-auto custom-scroll bg-slate-50 dark:bg-[#070b14]">
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-6 duration-700">

            {/* IDENTIDAD */}
            {activeSection === 'identidad' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Building2 className="text-indigo-500" size={22} /> Identidad del Negocio
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-white/30 font-medium mt-1">Configura los datos fiscales y públicos de tu empresa.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mb-5 pb-5 border-b border-slate-50 dark:border-white/[0.06]">
                    <div className="relative group">
                      <div className="h-24 w-24 rounded-2xl bg-slate-50 dark:bg-white/[0.05] flex items-center justify-center border-2 border-white dark:border-white/[0.1] shadow-lg overflow-hidden group-hover:scale-105 transition-transform duration-300">
                        <Building2 size={36} className="text-slate-300 dark:text-white/20" />
                      </div>
                      <button className="absolute -bottom-1.5 -right-1.5 h-8 w-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white dark:border-[#0d1424] hover:bg-indigo-500 active:scale-95 transition-all">
                        <Camera size={14} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Logo Corporativo</h4>
                      <p className="text-xs text-slate-400 dark:text-white/30 font-medium leading-relaxed max-w-xs">Aparecerá en facturas, tickets y correos. SVG o PNG transparente.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-5">
                    <Receipt className="text-emerald-500" size={22} /> Parámetros de Venta
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden pb-4">
                <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Gestión de Equipo</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mt-0.5">Control de Roles y Autorizaciones</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all active:scale-95">
                    <Plus size={14} /> Invitar Miembro
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-50 dark:border-white/[0.05]">
                        <th className="px-5 py-3.5">Identidad</th>
                        <th className="px-5 py-3.5 text-center">Nivel</th>
                        <th className="px-5 py-3.5 text-center">Estado</th>
                        <th className="px-5 py-3.5 text-right">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {users.map(u => (
                        <tr key={u.uid} className="group transition-all hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center font-black text-slate-400 text-base group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white transition-all">
                                {u.fullName?.charAt(0) || u.email?.charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900 dark:text-white">{u.fullName || 'Sin nombre'}</p>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 tracking-tight mt-0.5">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-500/30">{u.role}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${u.status === 'ACTIVE' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30' : 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/30'}`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                              {u.status}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button className="p-2 rounded-xl text-slate-300 dark:text-white/20 hover:bg-white dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-all opacity-0 group-hover:opacity-100">
                              <ChevronRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="px-5 py-12 text-center text-slate-400 dark:text-white/30 text-sm font-semibold">Sin miembros registrados aún</div>
                  )}
                </div>
              </div>
            )}

            {/* SEGURIDAD */}
            {activeSection === 'seguridad' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-5">
                    <ShieldCheck className="text-indigo-500" size={22} /> Protocolos de Seguridad
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'twoFactor', title: 'Autenticación de Dos Factores (2FA)', desc: 'Protege tu acceso con un código dinámico adicional.', enabled: configData.security.twoFactor, icon: Fingerprint },
                      { id: 'auditLogs', title: 'Registros de Auditoría', desc: 'Seguimiento de inicios de sesión y acciones críticas.', enabled: configData.security.auditLogs, icon: Activity },
                      { id: 'terminalMonitor', title: 'Monitoreo de Terminales', desc: 'Controla qué dispositivos están autorizados para facturar.', enabled: configData.security.terminalMonitor, icon: Monitor },
                    ].map(opt => (
                      <div key={opt.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100 dark:border-white/[0.07] group hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-md transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${opt.enabled ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400 dark:text-white/30'}`}>
                            <opt.icon size={20} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{opt.title}</h4>
                            <p className="text-xs text-slate-400 dark:text-white/30 font-medium mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                        <div
                          onClick={() => setConfigData({ ...configData, security: { ...configData.security, [opt.id]: !opt.enabled } })}
                          className={`h-7 w-12 rounded-full relative cursor-pointer transition-colors shrink-0 ${opt.enabled ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/10'}`}
                        >
                          <div className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-all shadow-sm ${opt.enabled ? 'right-1' : 'left-1'}`} />
                        </div>
                      </div>
                    ))}

                    {/* AUDIT LOG VIEWER */}
                    {configData.security.auditLogs && businessId && (
                      <div className="mt-4">
                        <AuditLogViewer businessId={businessId} />
                      </div>
                    )}

                    {/* PIN MAESTRO */}
                    <div className="mt-4 p-6 bg-gradient-to-br from-slate-900 to-[#0d1220] rounded-2xl text-white shadow-2xl shadow-black/30 relative overflow-hidden group border border-white/[0.06]">
                      <div className="absolute -right-10 -top-10 h-40 w-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10">
                        <h4 className="text-lg font-black mb-1.5 flex items-center gap-2">
                          <Fingerprint className="text-indigo-400" size={20} /> PIN de Autoridad Maestro
                        </h4>
                        <p className="text-white/40 text-xs font-medium mb-5 max-w-md">
                          Código de 4 dígitos requerido para eliminar facturas, clientes o realizar ajustes críticos.
                        </p>
                        <div className="flex flex-col md:flex-row items-center gap-5">
                          <div className="flex gap-2.5">
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} className={`h-12 w-10 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${userProfile?.pin ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                                {userProfile?.pin ? '●' : ''}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => { setNewPinValue(''); setPinModal(true); }}
                            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
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
              <div className="space-y-5 pb-10">
                <div className="bg-gradient-to-br from-slate-900 via-indigo-950/50 to-[#0d1220] p-6 rounded-2xl shadow-2xl shadow-black/30 text-white relative overflow-hidden group border border-white/[0.06]">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-700 pointer-events-none">
                    <ShieldCheck size={140} />
                  </div>
                  <div className="absolute -left-10 -bottom-10 h-40 w-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-4">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Plan Enterprise Activo
                    </div>
                    <h3 className="text-3xl font-black tracking-tighter mb-2">Enterprise Pro</h3>
                    <p className="text-white/40 font-medium text-sm mb-5 max-w-md">Infraestructura dedicada, terminales ilimitadas y soporte técnico prioritario 24/7.</p>
                    <div className="flex gap-3">
                      <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Historial de Facturas</button>
                      <button className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Gestionar Plan</button>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-base font-black text-slate-900 dark:text-white mb-1 tracking-tight">Acceso a la Organización</h4>
                  <p className="text-xs text-slate-400 dark:text-white/30 font-medium mb-5">Usa este identificador para conectar sucursales o invitar personal.</p>
                  <div className="bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-white/30 mb-3">CÓDIGO DE ESPACIO ÚNICO</p>
                    <p className="text-xl font-mono font-black text-slate-900 dark:text-white break-all select-all tracking-wider">{businessId}</p>
                    <button
                      onClick={() => handleCopyToClipboard(businessId || '')}
                      className="mt-4 flex items-center gap-2 mx-auto px-5 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-white/[0.10] hover:text-indigo-600 dark:hover:text-white transition-all active:scale-95"
                    >
                      <Copy size={14} /> {copyToast ? '¡Copiado!' : 'Copiar Identificador'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* APARIENCIA */}
            {activeSection === 'apariencia' && (
              <div className="space-y-4 pb-10">

                {/* Header card */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-5 rounded-2xl text-white relative overflow-hidden shadow-xl shadow-violet-500/20">
                  <div className="absolute -right-6 -top-6 h-32 w-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -left-4 -bottom-4 h-20 w-20 bg-white/5 rounded-full blur-xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette size={18} className="text-violet-200" />
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-200">Personalización por Usuario</span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight mb-1">Tu Espacio, Tu Estilo</h3>
                    <p className="text-violet-200/80 text-xs font-medium leading-relaxed max-w-md">
                      Ajusta la apariencia a tu gusto. Cada cambio se guarda por usuario y aplica al instante.
                    </p>
                  </div>
                </div>

                {/* Font size */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Type size={13} /> Tamaño de Fuente
                  </h4>
                  <div className="flex gap-2 flex-wrap">
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
                        className={`flex-1 min-w-[60px] flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border-2 transition-all ${
                          uiPrefs.fontSize === f.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <span className={`font-black text-slate-900 dark:text-white ${f.size}`}>Aa</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Palette size={13} /> Color de Acento
                  </h4>
                  <div className="flex gap-4 flex-wrap">
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
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className={`h-10 w-10 rounded-xl ${c.bg} transition-all ${
                          uiPrefs.accentColor === c.val
                            ? `ring-4 ring-offset-2 dark:ring-offset-[#0d1424] ${c.ring} scale-110`
                            : 'hover:scale-105 opacity-60 hover:opacity-100'
                        }`} />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60 transition-colors">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Border radius */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Sliders size={13} /> Forma de los Bordes
                  </h4>
                  <div className="flex gap-3 flex-wrap">
                    {([
                      { val: 'sharp',   label: 'Recto',   cls: 'rounded-none' },
                      { val: 'normal',  label: 'Normal',  cls: 'rounded-xl'   },
                      { val: 'rounded', label: 'Suave',   cls: 'rounded-3xl'  },
                      { val: 'pill',    label: 'Cápsula', cls: 'rounded-full' },
                    ] as const).map(r => (
                      <button
                        key={r.val}
                        onClick={() => setUiPrefs(p => ({ ...p, borderRadius: r.val }))}
                        className={`flex-1 min-w-[70px] flex flex-col items-center gap-3 py-5 rounded-xl border-2 transition-all ${
                          uiPrefs.borderRadius === r.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`h-6 w-12 bg-slate-800 dark:bg-white/60 ${r.cls}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4">Densidad de Interfaz</h4>
                  <div className="flex gap-3">
                    {([
                      { val: 'compact',  label: 'Compacto',  desc: 'Más contenido', bars: [4, 4, 4, 4] },
                      { val: 'normal',   label: 'Normal',    desc: 'Balanceado',    bars: [6, 6, 6]    },
                      { val: 'spacious', label: 'Espacioso', desc: 'Fácil de leer', bars: [10, 10]     },
                    ] as const).map(d => (
                      <button
                        key={d.val}
                        onClick={() => setUiPrefs(p => ({ ...p, density: d.val }))}
                        className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                          uiPrefs.density === d.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <div className="flex flex-col gap-1 mb-3">
                          {d.bars.map((h, i) => (
                            <div key={i} className="rounded bg-slate-200 dark:bg-white/10 w-full" style={{ height: `${h}px` }} />
                          ))}
                        </div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{d.label}</p>
                        <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{d.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animation speed */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Zap size={13} /> Velocidad de Animaciones
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { val: 'fast',   label: 'Rápido'     },
                      { val: 'normal', label: 'Normal'     },
                      { val: 'slow',   label: 'Suave'      },
                      { val: 'none',   label: 'Sin animar' },
                    ] as const).map(s => (
                      <button
                        key={s.val}
                        onClick={() => setUiPrefs(p => ({ ...p, animationSpeed: s.val }))}
                        className={`flex-1 py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${
                          uiPrefs.animationSpeed === s.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                            : 'border-slate-100 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date + number format */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Date format */}
                  <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-3">Formato de Fecha</h4>
                    <div className="space-y-2">
                      {(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setUiPrefs(p => ({ ...p, dateFormat: fmt }))}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                            uiPrefs.dateFormat === fmt
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                          }`}
                        >
                          <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300">{fmt}</span>
                          {uiPrefs.dateFormat === fmt && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Number format */}
                  <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-3">Separador de Miles</h4>
                    <div className="space-y-2">
                      {([
                        { val: 'dot',   example: '1.000.000,00', desc: 'Estilo europeo / latam' },
                        { val: 'comma', example: '1,000,000.00', desc: 'Estilo americano'        },
                      ] as const).map(n => (
                        <button
                          key={n.val}
                          onClick={() => setUiPrefs(p => ({ ...p, numberFormat: n.val }))}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                            uiPrefs.numberFormat === n.val
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                          }`}
                        >
                          <div className="text-left">
                            <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300 block">{n.example}</span>
                            <span className="text-[10px] text-slate-400 dark:text-white/30">{n.desc}</span>
                          </div>
                          {uiPrefs.numberFormat === n.val && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveUiPrefs}
                    disabled={savingPrefs}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25 active:scale-95 disabled:opacity-50"
                  >
                    {savingPrefs ? <Loader2 className="animate-spin" size={15} /> : <><Save size={15} /> Guardar Preferencias</>}
                  </button>
                </div>

              </div>
            )}

          </div>
        </main>
      </div>

      {/* PIN MODAL */}
      {pinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-sm rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
              <h2 className="text-base font-black text-slate-900 dark:text-white">Nuevo PIN Maestro</h2>
              <button onClick={() => { setPinModal(false); setNewPinValue(''); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400 dark:text-white/40">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 dark:text-white/40 font-medium">Ingresa exactamente 4 dígitos numéricos.</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPinValue}
                onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full text-center text-3xl font-mono tracking-[1rem] px-5 py-4 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                placeholder="••••"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setPinModal(false); setNewPinValue(''); }}
                  className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePin}
                  disabled={newPinValue.length !== 4 || saving}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : 'Guardar PIN'}
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
