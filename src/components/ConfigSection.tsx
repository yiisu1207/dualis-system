import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppConfig, AuditLog } from '../../types';
import {
  Building,
  Users,
  Palette,
  Settings,
  Shield,
  Image,
  Save,
  Sun,
  Bell,
  Calculator,
  Camera,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface ConfigSectionProps {
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig) => void;
  onResetData: () => void;
  auditLogs: AuditLog[];
  userRole: string;
  initialTab?:
    | 'EMPRESA'
    | 'USUARIOS'
    | 'PERSONALIZACION'
    | 'SISTEMA'
    | 'FISCAL'
    | 'MENSAJES'
    | 'AUDITORIA';
  userUiVersion?: 'classic' | 'editorial';
  onUpdateUiVersion?: (version: 'classic' | 'editorial') => void;
  businessId?: string | null;
  currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null };
}

const ConfigSection: React.FC<ConfigSectionProps> = ({
  config,
  onUpdateConfig,
  onResetData,
  auditLogs,
  userRole,
  initialTab,
  userUiVersion,
  onUpdateUiVersion,
  businessId,
}) => {
  const { success, error, warning, info } = useToast();
  const navigate = useNavigate();
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [activeTab, setActiveTab] = useState<
    'EMPRESA' | 'USUARIOS' | 'PERSONALIZACION' | 'SISTEMA' | 'FISCAL' | 'MENSAJES' | 'AUDITORIA'
  >('EMPRESA');
  const [auditQuery, setAuditQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleSave = () => {
    onUpdateConfig(localConfig);
    localStorage.setItem('theme_color', localConfig.theme.primaryColor);
    localStorage.setItem('theme_mode', 'light');

    if (localConfig.companyLogo) {
      localStorage.setItem('company_logo', localConfig.companyLogo);
    }
    if (localConfig.companyName) {
      localStorage.setItem('company_name', localConfig.companyName);
    }

    if (localConfig.theme.deviceMode) {
      localStorage.setItem('device_mode', localConfig.theme.deviceMode);
      try {
        document.documentElement.setAttribute('data-device', localConfig.theme.deviceMode);
      } catch (e) {}
    }
    if (localConfig.theme.uiVersion) {
      localStorage.setItem('ui_version', localConfig.theme.uiVersion);
      try {
        document.documentElement.setAttribute('data-ui', localConfig.theme.uiVersion);
      } catch (e) {}
    }

    // Fiscal / POS settings
    const fiscal = localConfig.fiscal;
    if (fiscal) {
      localStorage.setItem('fiscal_igtf_enabled', String(fiscal.igtfEnabled ?? true));
      localStorage.setItem('fiscal_igtf_rate', String(fiscal.igtfRate ?? 3));
      localStorage.setItem('fiscal_iva_enabled', String(fiscal.ivaEnabled ?? true));
      localStorage.setItem('fiscal_scanner_enabled', String(fiscal.scannerEnabled ?? true));
    }

    success('Configuración guardada correctamente.');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalConfig({ ...localConfig, companyLogo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const inputClass = 'app-input w-full bg-white border-slate-200 text-slate-900';
  const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1 block';
  const templates = localConfig.messageTemplates || [];

  const handleAddTemplate = () => {
    const nextId = crypto?.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}`;
    const next = {
      id: nextId,
      name: 'Nueva Plantilla',
      body: 'Hola {nombre_cliente}, ...',
    };
    setLocalConfig({
      ...localConfig,
      messageTemplates: [...templates, next],
    });
  };

  const handleUpdateTemplate = (id: string, changes: Partial<{ name: string; body: string }>) => {
    setLocalConfig({
      ...localConfig,
      messageTemplates: templates.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setLocalConfig({
      ...localConfig,
      messageTemplates: templates.filter((t) => t.id !== id),
    });
  };

  const auditUsers = useMemo(() => {
    return Array.from(new Set(auditLogs.map((log) => log.user).filter(Boolean))).sort();
  }, [auditLogs]);

  const auditActions = useMemo(() => {
    return Array.from(new Set(auditLogs.map((log) => log.action).filter(Boolean))).sort();
  }, [auditLogs]);

  const auditModules = useMemo(() => {
    return Array.from(new Set(auditLogs.map((log) => log.module).filter(Boolean))).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditActionFilter !== 'ALL' && log.action !== auditActionFilter) return false;
      if (auditUserFilter !== 'ALL' && log.user !== auditUserFilter) return false;
      if (auditModuleFilter !== 'ALL' && log.module !== auditModuleFilter) return false;
      if (!query) return true;
      const haystack = [log.user, log.action, log.module, log.detail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [auditLogs, auditActionFilter, auditUserFilter, auditModuleFilter, auditQuery]);

  const getAuditActionBadge = (action: string) => {
    const normalized = (action || '').toUpperCase();
    switch (normalized) {
      case 'CREAR': return 'bg-emerald-100 text-emerald-700';
      case 'EDITAR': return 'bg-sky-100 text-sky-700';
      case 'ELIMINAR': return 'bg-rose-100 text-rose-700';
      case 'LOGIN': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in h-full flex flex-col pb-20 bg-white text-slate-900">
      {/* HEADER TIPO TARJETA */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 p-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            Centro de Control
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Ajustes del Sistema y Seguridad
          </p>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex flex-wrap justify-center p-1 rounded-xl gap-1 bg-slate-100 border border-slate-200">
          {[
            { id: 'EMPRESA', icon: Building, label: 'Empresa' },
            { id: 'USUARIOS', icon: Users, label: 'Usuarios' },
            { id: 'PERSONALIZACION', icon: Palette, label: 'Estilo' },
            { id: 'SISTEMA', icon: Settings, label: 'Sistema' },
            { id: 'FISCAL', icon: Calculator, label: 'Fiscal / POS' },
            { id: 'AUDITORIA', icon: Shield, label: 'Auditoría' },
          ].map((tab) =>
            tab.id === 'AUDITORIA' && !['admin', 'owner'].includes(userRole) ? null : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{ color: activeTab === tab.id ? localConfig.theme.primaryColor : '' }}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <tab.icon size={14} /> <span className="hidden md:inline">{tab.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div className="px-6 py-4 text-[11px] text-slate-500 flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <span className="font-black uppercase tracking-widest text-slate-400">Atajos</span>
        <span>Alt + P: Perfil</span>
        <span>Alt + S: Configuracion</span>
        <span>Alt + H: Inicio</span>
        <span>Shift + +: Nueva Venta Rapida</span>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 p-8 overflow-y-auto custom-scroll relative border border-slate-200 rounded-2xl bg-white shadow-sm">
        {/* --- TAB: EMPRESA --- */}
        {activeTab === 'EMPRESA' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-300">
            <div className="text-center">
              <div className="w-32 h-32 bg-slate-50 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-slate-100 overflow-hidden relative group shadow-inner">
                {localConfig.companyLogo ? (
                  <img src={localConfig.companyLogo} className="w-full h-full object-cover" alt="Logo" />
                ) : (
                  <Image className="text-slate-300" size={48} />
                )}
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm">
                  <span className="text-white text-xs font-bold flex flex-col items-center gap-1">
                    <Image size={16} /> Cambiar
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Logo de la Empresa</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nombre Comercial</label>
                <input className={inputClass} value={localConfig.companyName} onChange={(e) => setLocalConfig({ ...localConfig, companyName: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className={labelClass}>RIF / Identificación Fiscal</label>
                <input className={inputClass} value={localConfig.companyRif || ''} onChange={(e) => setLocalConfig({ ...localConfig, companyRif: e.target.value.toUpperCase() })} placeholder="J-12345678-9" />
              </div>
              <div>
                <label className={labelClass}>Codigo de Espacio</label>
                <input className={inputClass} value={businessId || 'Pendiente...'} readOnly />
              </div>
              <div>
                <label className={labelClass}>Mensaje en Recibos</label>
                <input className={inputClass} value={localConfig.receiptMessage || ''} onChange={(e) => setLocalConfig({ ...localConfig, receiptMessage: e.target.value })} placeholder="¡Gracias por su compra!" />
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: USUARIOS --- */}
        {activeTab === 'USUARIOS' && (
          <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3 mb-3 text-slate-800">
                <Users size={20} />
                <h3 className="font-black text-sm uppercase tracking-widest">Gestión de usuarios</h3>
              </div>
              <p className="text-sm text-slate-600">
                La administración de usuarios se realiza en la página de Configuración, dentro de
                Gestión de Usuarios. Aquí solo se mantienen opciones del sistema.
              </p>
              <button onClick={() => navigate('/configuracion')} className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors">
                Ir a Gestión de Usuarios
              </button>
            </div>
          </div>
        )}

        {/* --- TAB: PERSONALIZACION --- */}
        {activeTab === 'PERSONALIZACION' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="p-6 border border-slate-200 rounded-[2rem] bg-white shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 flex items-center gap-2">
                <Palette size={20} /> Estilo de Interfaz
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {([
                  { id: 'editorial', label: 'Nuevo (Editorial)', desc: 'Look moderno y premium.' },
                  { id: 'classic', label: 'Clasico', desc: 'Interfaz original del sistema.' },
                ] as const).map((style) => (
                  <button
                    key={style.id}
                    onClick={() => {
                      setLocalConfig({ ...localConfig, theme: { ...localConfig.theme, uiVersion: style.id } });
                      onUpdateUiVersion?.(style.id);
                      document.documentElement.setAttribute('data-ui', style.id);
                    }}
                    className={`w-full p-4 rounded-2xl border text-left transition-all ${
                      (userUiVersion || localConfig.theme.uiVersion || 'editorial') === style.id
                        ? 'border-slate-300 bg-slate-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <p className="text-sm font-black text-slate-800">{style.label}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{style.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 border border-slate-200 rounded-[2rem] bg-white shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 flex items-center gap-2">
                <Sun size={20} /> Modo de Visualización
              </h3>
              <div className="w-full p-5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest">Modo Claro</span>
                <span className="text-xl flex items-center gap-2 font-black">
                  ON <Sun className="text-amber-500" />
                </span>
              </div>
              <p className="mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Modo oscuro deshabilitado para mejor contraste.</p>
            </div>
            <div className="p-6 border border-slate-200 rounded-[2rem] bg-white shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 flex items-center gap-2">
                <Palette size={20} /> Color Principal
              </h3>
              <div className="flex gap-4 justify-center">
                {['#714B67', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setLocalConfig({ ...localConfig, theme: { ...localConfig.theme, primaryColor: color } });
                      document.documentElement.style.setProperty('--odoo-primary', color);
                    }}
                    className={`w-10 h-10 rounded-full border-4 transition-transform ${localConfig.theme.primaryColor === color ? 'border-slate-200 scale-110 shadow-md' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="p-6 border border-slate-200 rounded-[2rem] bg-white shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 flex items-center gap-2">
                Dispositivo
              </h3>
              <div className="flex gap-3 justify-center">
                {(['pc', 'tablet', 'mobile'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setLocalConfig({ ...localConfig, theme: { ...localConfig.theme, deviceMode: mode as any } });
                      document.documentElement.setAttribute('data-device', mode);
                    }}
                    className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${localConfig.theme.deviceMode === mode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}
                  >
                    {mode === 'pc' ? 'PC' : mode === 'tablet' ? 'Tablet' : 'Móvil'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SISTEMA --- */}
        {activeTab === 'SISTEMA' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
            <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
              <h3 className="font-bold text-rose-800 mb-2 flex items-center gap-2">
                <Bell size={20} /> Alertas de Cobranza
              </h3>
              <p className="text-xs text-rose-600 mb-6">
                El sistema notificará cuando una deuda supere estos días sin movimiento.
              </p>
              <div className="flex items-center gap-6">
                <input
                  type="range" min="7" max="60"
                  value={localConfig.system?.alertThreshold || 15}
                  onChange={(e) => setLocalConfig({ ...localConfig, system: { ...localConfig.system, alertThreshold: parseInt(e.target.value) } })}
                  className="flex-1 accent-rose-600 h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="font-black text-rose-800 text-2xl w-24 text-center">
                  {localConfig.system?.alertThreshold || 15} <span className="text-xs align-top">días</span>
                </span>
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 text-center">
              <button onClick={() => { if (confirm('¿Seguro? Se perderán todos los datos locales.')) onResetData(); }} className="text-[10px] font-black text-rose-600 bg-white border border-rose-200 px-8 py-4 rounded-xl uppercase hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                ⚠️ Factory Reset (Borrar Todo)
              </button>
            </div>
          </div>
        )}

        {/* --- TAB: FISCAL / POS --- */}
        {activeTab === 'FISCAL' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">

            {/* IGTF */}
            <div className="p-6 bg-amber-50 rounded-[2rem] border border-amber-100">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-black text-amber-800 text-sm uppercase tracking-widest flex items-center gap-2">
                    <Calculator size={16} /> IGTF
                  </h3>
                  <p className="text-xs text-amber-600 mt-0.5">Impuesto sobre pagos en divisas (Ley 2022)</p>
                </div>
                <button
                  onClick={() => setLocalConfig({ ...localConfig, fiscal: { ...localConfig.fiscal, igtfEnabled: !(localConfig.fiscal?.igtfEnabled ?? true), igtfRate: localConfig.fiscal?.igtfRate ?? 3, ivaEnabled: localConfig.fiscal?.ivaEnabled ?? true, scannerEnabled: localConfig.fiscal?.scannerEnabled ?? true } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${(localConfig.fiscal?.igtfEnabled ?? true) ? 'bg-amber-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(localConfig.fiscal?.igtfEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {(localConfig.fiscal?.igtfEnabled ?? true) && (
                <div className="mt-4 flex items-center gap-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-700 shrink-0">Tasa IGTF (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={localConfig.fiscal?.igtfRate ?? 3}
                    onChange={(e) => setLocalConfig({ ...localConfig, fiscal: { igtfEnabled: localConfig.fiscal?.igtfEnabled ?? true, igtfRate: parseFloat(e.target.value) || 3, ivaEnabled: localConfig.fiscal?.ivaEnabled ?? true, scannerEnabled: localConfig.fiscal?.scannerEnabled ?? true } })}
                    className="w-24 px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-black text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                  />
                  <span className="text-xs font-bold text-amber-600">
                    Actual: {localConfig.fiscal?.igtfRate ?? 3}%
                  </span>
                </div>
              )}
            </div>

            {/* IVA */}
            <div className="p-6 bg-sky-50 rounded-[2rem] border border-sky-100">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-black text-sky-800 text-sm uppercase tracking-widest">IVA</h3>
                  <p className="text-xs text-sky-600 mt-0.5">Mostrar desglose de IVA en el cobro</p>
                </div>
                <button
                  onClick={() => setLocalConfig({ ...localConfig, fiscal: { igtfEnabled: localConfig.fiscal?.igtfEnabled ?? true, igtfRate: localConfig.fiscal?.igtfRate ?? 3, ivaEnabled: !(localConfig.fiscal?.ivaEnabled ?? true), scannerEnabled: localConfig.fiscal?.scannerEnabled ?? true } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${(localConfig.fiscal?.ivaEnabled ?? true) ? 'bg-sky-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(localConfig.fiscal?.ivaEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* ESCANER DE CÁMARA */}
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Camera size={20} className="text-slate-500 shrink-0" />
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Escáner de Cámara</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Botón de escaneo QR / código de barras en los POS</p>
                  </div>
                </div>
                <button
                  onClick={() => setLocalConfig({ ...localConfig, fiscal: { igtfEnabled: localConfig.fiscal?.igtfEnabled ?? true, igtfRate: localConfig.fiscal?.igtfRate ?? 3, ivaEnabled: localConfig.fiscal?.ivaEnabled ?? true, scannerEnabled: !(localConfig.fiscal?.scannerEnabled ?? true) } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${(localConfig.fiscal?.scannerEnabled ?? true) ? 'bg-slate-900' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(localConfig.fiscal?.scannerEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
              Recuerda guardar los cambios para que apliquen en los terminales POS.
            </p>
          </div>
        )}

        {/* --- TAB: MENSAJES --- */}
        {activeTab === 'MENSAJES' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
            <div className="p-6 rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Plantillas de Mensajes</h3>
                <button type="button" onClick={handleAddTemplate} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest">+ Agregar</button>
              </div>

              <div className="mt-6 space-y-4">
                {templates.map((template) => (
                  <div key={template.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <input className="app-input w-full max-w-[260px]" value={template.name} onChange={(e) => handleUpdateTemplate(template.id, { name: e.target.value })} placeholder="Nombre de plantilla" />
                      <button type="button" onClick={() => handleDeleteTemplate(template.id)} className="px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-black uppercase">Eliminar</button>
                    </div>
                    <textarea className="mt-3 w-full min-h-[90px] rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700" value={template.body} onChange={(e) => handleUpdateTemplate(template.id, { body: e.target.value })} placeholder="Escribe el mensaje..." />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: AUDITORIA --- */}
        {activeTab === 'AUDITORIA' && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Auditoria del sistema</h3>
              <p className="text-sm font-bold text-slate-700">{filteredAuditLogs.length} eventos</p>
            </div>

            <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} placeholder="Buscar..." className="app-input text-xs" />
              <select value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)} className="app-input text-xs">
                <option value="ALL">Todas las acciones</option>
                {auditActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-500 font-bold uppercase sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Accion</th>
                    <th className="px-6 py-4">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{new Date(log.date).toLocaleString()}</td>
                      <td className="px-6 py-3 font-bold text-slate-800">{log.user}</td>
                      <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getAuditActionBadge(log.action)}`}>{log.action}</span></td>
                      <td className="px-6 py-3 text-slate-600 max-w-[300px] truncate">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 sticky bottom-0 z-20">
        <button onClick={handleSave} style={{ backgroundColor: localConfig.theme.primaryColor }} className="flex items-center gap-2 px-10 py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
          <Save size={18} /> Guardar Configuración
        </button>
      </div>
    </div>
  );
};

export default ConfigSection;
