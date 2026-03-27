import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppConfig, AuditLog, CustomRate } from '../../types';
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
  GitCompare,
  AlertTriangle,
  Lock,
  Unlock,
  Info,
  CreditCard,
  Plus,
  Trash2,
  Zap,
  Edit3,
  Database,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useRates } from '../context/RatesContext';
import { getSlugForBusiness, registerTenantSlug, isSlugAvailable, buildSubdomainUrl } from '../utils/tenantResolver';
import { seedTestData } from '../utils/seedTestData';

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
    | 'CREDITO'
    | 'MENSAJES'
    | 'OPERACION'
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
  currentUser,
}) => {
  const { success, error, warning, info } = useToast();
  const navigate = useNavigate();
  const { customRates, zoherEnabled, updateCustomRates, setZoherEnabled } = useRates();
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [localCustomRates, setLocalCustomRates] = useState<CustomRate[]>([]);
  const [activeTab, setActiveTab] = useState<
    'EMPRESA' | 'USUARIOS' | 'PERSONALIZACION' | 'SISTEMA' | 'FISCAL' | 'CREDITO' | 'MENSAJES' | 'OPERACION' | 'AUDITORIA' | 'DEV'
  >('EMPRESA');
  const [seedProgress, setSeedProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [seedResult, setSeedResult] = useState<{ products: number; customers: number; suppliers: number; movements: number; terminals: number } | null>(null);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  // Slug / URL personalizada
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [slugInput, setSlugInput] = useState('');
  const [slugCheck, setSlugCheck] = useState<'idle' | 'checking' | 'available' | 'taken' | 'saved'>('idle');
  const [slugSaving, setSlugSaving] = useState(false);
  const slugTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (businessId) {
      getSlugForBusiness(businessId).then(slug => {
        setCurrentSlug(slug);
        if (slug) setSlugInput(slug);
      });
    }
  }, [businessId]);

  useEffect(() => {
    setLocalCustomRates(customRates);
  }, [customRates]);

  const handleSlugChange = (val: string) => {
    const normalized = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlugInput(normalized);
    setSlugCheck('idle');
    clearTimeout(slugTimerRef.current);
    if (normalized.length >= 3 && normalized !== currentSlug) {
      setSlugCheck('checking');
      slugTimerRef.current = setTimeout(() => {
        isSlugAvailable(normalized).then(available => {
          setSlugCheck(available ? 'available' : 'taken');
        });
      }, 500);
    }
  };

  const handleSlugSave = async () => {
    if (!businessId || !slugInput || slugInput.length < 3) return;
    setSlugSaving(true);
    const result = await registerTenantSlug(slugInput, businessId, localConfig.companyName || 'Mi Negocio', localConfig.companyLogo);
    if (result.ok) {
      setCurrentSlug(slugInput);
      setSlugCheck('saved');
      success('URL personalizada guardada correctamente.');
    } else {
      const msg = 'error' in result ? result.error : 'Error al guardar';
      error(msg);
    }
    setSlugSaving(false);
  };

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

    // Credit policy settings
    const cp = localConfig.creditPolicy;
    if (cp) {
      localStorage.setItem('credit_policy_enabled', String(cp.enabled));
      localStorage.setItem('credit_default_limit', String(cp.defaultCreditLimit));
      localStorage.setItem('credit_grace_period', String(cp.gracePeriodDays));
      localStorage.setItem('credit_early_payment_tiers', JSON.stringify(cp.earlyPaymentTiers));
      localStorage.setItem('credit_require_abono_approval', String(cp.requireAbonoApproval ?? true));
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

  const inputClass = 'app-input w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white';
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
      default: return 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in h-full flex flex-col pb-20 bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
      {/* HEADER TIPO TARJETA */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 p-6 border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">
            Centro de Control
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Ajustes del Sistema y Seguridad
          </p>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex flex-wrap justify-center p-1 rounded-xl gap-1 bg-slate-100 dark:bg-white/[0.07] border border-slate-200 dark:border-white/10">
          {[
            { id: 'EMPRESA', icon: Building, label: 'Empresa' },
            { id: 'USUARIOS', icon: Users, label: 'Usuarios' },
            { id: 'PERSONALIZACION', icon: Palette, label: 'Estilo' },
            { id: 'SISTEMA', icon: Settings, label: 'Sistema' },
            { id: 'FISCAL', icon: Calculator, label: 'Fiscal / POS' },
            { id: 'CREDITO', icon: CreditCard, label: 'Crédito' },
            { id: 'OPERACION', icon: GitCompare, label: 'Operación' },
            { id: 'AUDITORIA', icon: Shield, label: 'Auditoría' },
            { id: 'DEV', icon: Database, label: 'Dev / Test' },
          ].map((tab) =>
            (tab.id === 'AUDITORIA' || tab.id === 'DEV') && !['admin', 'owner'].includes(userRole) ? null : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{ color: activeTab === tab.id ? localConfig.theme.primaryColor : '' }}
                className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-400'
                }`}
              >
                <tab.icon size={14} /> <span className="hidden md:inline">{tab.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div className="px-6 py-4 text-[11px] text-slate-500 flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-2xl">
        <span className="font-black uppercase tracking-widest text-slate-400">Atajos</span>
        <span>Alt + P: Perfil</span>
        <span>Alt + S: Configuracion</span>
        <span>Alt + H: Inicio</span>
        <span>Shift + +: Nueva Venta Rapida</span>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 p-8 overflow-y-auto custom-scroll relative border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
        {/* --- TAB: EMPRESA --- */}
        {activeTab === 'EMPRESA' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-300">
            <div className="text-center">
              <div className="w-32 h-32 bg-slate-50 dark:bg-slate-800/50 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-slate-100 dark:border-white/[0.07] overflow-hidden relative group shadow-inner">
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
                <label className={labelClass}>Identificador Interno</label>
                <input className={inputClass} value={businessId || 'Pendiente...'} readOnly />
              </div>

              {/* URL Personalizada */}
              {(userRole === 'owner' || userRole === 'admin') && (
              <div className="p-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04]">
                <label className={labelClass}>URL Personalizada</label>
                <p className="text-xs text-slate-500 dark:text-white/30 mb-3">
                  Tus usuarios podrán acceder directamente desde esta URL.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/20 text-xs font-mono pointer-events-none select-none">
                      https://
                    </span>
                    <input
                      className={`${inputClass} pl-[4.2rem] pr-[5.5rem] font-mono text-sm ${
                        slugCheck === 'available' ? '!border-emerald-500/40' :
                        slugCheck === 'taken' ? '!border-red-500/40' :
                        slugCheck === 'saved' ? '!border-emerald-500/40' : ''
                      }`}
                      value={slugInput}
                      onChange={e => handleSlugChange(e.target.value)}
                      placeholder="mi-empresa"
                      maxLength={30}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/15 text-[10px] font-mono pointer-events-none select-none">
                      .dualis.app
                    </span>
                  </div>
                  <button
                    onClick={handleSlugSave}
                    disabled={slugSaving || slugCheck === 'taken' || slugInput.length < 3 || slugInput === currentSlug}
                    className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:from-indigo-500 hover:to-violet-500 transition-all shrink-0"
                  >
                    {slugSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
                <div className="mt-2 ml-1">
                  {slugCheck === 'checking' && <p className="text-[10px] text-slate-400 dark:text-white/30 font-bold">Verificando...</p>}
                  {slugCheck === 'available' && <p className="text-[10px] text-emerald-500 font-bold">Disponible</p>}
                  {slugCheck === 'taken' && <p className="text-[10px] text-red-400 font-bold">No disponible</p>}
                  {slugCheck === 'saved' && <p className="text-[10px] text-emerald-500 font-bold">Guardado — tu URL es: {slugInput}.dualis.app</p>}
                  {currentSlug && slugCheck === 'idle' && (
                    <p className="text-[10px] text-slate-500 dark:text-white/25 font-bold">
                      URL actual: <span className="text-indigo-400 font-mono">{currentSlug}.dualis.app</span>
                    </p>
                  )}
                </div>
              </div>
              )}

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
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3 mb-3 text-slate-800 dark:text-slate-200">
                <Users size={20} />
                <h3 className="font-black text-sm uppercase tracking-widest">Gestión de usuarios</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
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
            <div className="p-6 border border-slate-200 dark:border-white/10 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
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
                        ? 'border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-slate-800/50 shadow-sm'
                        : 'border-slate-100 dark:border-white/[0.07] bg-white dark:bg-slate-900 hover:border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">{style.label}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{style.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 border border-slate-200 dark:border-white/10 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Sun size={20} /> Modo de Visualización
              </h3>
              <div className="w-full p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest">Modo Claro</span>
                <span className="text-xl flex items-center gap-2 font-black">
                  ON <Sun className="text-amber-500" />
                </span>
              </div>
              <p className="mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Modo oscuro deshabilitado para mejor contraste.</p>
            </div>
            <div className="p-6 border border-slate-200 dark:border-white/10 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
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
                    className={`w-10 h-10 rounded-full border-4 transition-transform ${localConfig.theme.primaryColor === color ? 'border-slate-200 dark:border-white/10 scale-110 shadow-md' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="p-6 border border-slate-200 dark:border-white/10 rounded-[2rem] bg-white dark:bg-slate-900 shadow-sm">
              <h3 className="font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
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
                    className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${localConfig.theme.deviceMode === mode ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500'}`}
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

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-white/10 text-center">
              <button onClick={() => { if (confirm('¿Seguro? Se perderán todos los datos locales.')) onResetData(); }} className="text-[10px] font-black text-rose-600 bg-white dark:bg-slate-900 border border-rose-200 px-8 py-4 rounded-xl uppercase hover:bg-rose-600 hover:text-white transition-all shadow-sm">
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
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${(localConfig.fiscal?.igtfEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {(localConfig.fiscal?.igtfEnabled ?? true) && (
                <div className="mt-4 flex items-center gap-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-700 shrink-0">Tasa IGTF (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={localConfig.fiscal?.igtfRate ?? 3}
                    onChange={(e) => setLocalConfig({ ...localConfig, fiscal: { igtfEnabled: localConfig.fiscal?.igtfEnabled ?? true, igtfRate: parseFloat(e.target.value) || 3, ivaEnabled: localConfig.fiscal?.ivaEnabled ?? true, scannerEnabled: localConfig.fiscal?.scannerEnabled ?? true } })}
                    className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 rounded-xl text-sm font-black text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
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
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${(localConfig.fiscal?.ivaEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* ESCANER DE CÁMARA */}
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Camera size={20} className="text-slate-500 shrink-0" />
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-widest">Escáner de Cámara</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Botón de escaneo QR / código de barras en los POS</p>
                  </div>
                </div>
                <button
                  onClick={() => setLocalConfig({ ...localConfig, fiscal: { igtfEnabled: localConfig.fiscal?.igtfEnabled ?? true, igtfRate: localConfig.fiscal?.igtfRate ?? 3, ivaEnabled: localConfig.fiscal?.ivaEnabled ?? true, scannerEnabled: !(localConfig.fiscal?.scannerEnabled ?? true) } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${(localConfig.fiscal?.scannerEnabled ?? true) ? 'bg-slate-900' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${(localConfig.fiscal?.scannerEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
              Recuerda guardar los cambios para que apliquen en los terminales POS.
            </p>
          </div>
        )}

        {/* --- TAB: CRÉDITO --- */}
        {activeTab === 'CREDITO' && (() => {
          const cp = localConfig.creditPolicy ?? { enabled: false, defaultCreditLimit: 0, earlyPaymentTiers: [], gracePeriodDays: 30, requireAbonoApproval: true };
          const updateCP = (patch: Partial<typeof cp>) => setLocalConfig({ ...localConfig, creditPolicy: { ...cp, ...patch } });
          return (
            <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">

              {/* Enable credit system */}
              <div className="p-6 bg-violet-50 dark:bg-violet-500/5 rounded-[2rem] border border-violet-100 dark:border-violet-500/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black text-violet-800 dark:text-violet-300 text-sm uppercase tracking-widest flex items-center gap-2">
                      <CreditCard size={16} /> Sistema de Crédito
                    </h3>
                    <p className="text-xs text-violet-600 dark:text-violet-400/70 mt-0.5">Habilita ventas a crédito con control de límites y pronto pago</p>
                  </div>
                  <button
                    onClick={() => updateCP({ enabled: !cp.enabled })}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${cp.enabled ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-slate-200 dark:bg-white/10'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cp.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {cp.enabled && (
                <>
                  {/* Default credit limit */}
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-sm">
                    <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-widest mb-1">Límite de Crédito por Defecto</h3>
                    <p className="text-[11px] text-slate-400 mb-4">Aplica a clientes nuevos sin límite individual. $0 = sin límite.</p>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-slate-400">$</span>
                      <input
                        type="number" min="0" step="100"
                        value={cp.defaultCreditLimit || ''}
                        onChange={(e) => updateCP({ defaultCreditLimit: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                        className="w-40 px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-lg font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                      />
                      <span className="text-xs font-bold text-slate-400">USD</span>
                    </div>
                  </div>

                  {/* Grace period */}
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-sm">
                    <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-widest mb-1">Período de Gracia</h3>
                    <p className="text-[11px] text-slate-400 mb-4">Días después del vencimiento antes de bloquear nuevas ventas a crédito.</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="number" min="0" max="365"
                        value={cp.gracePeriodDays || ''}
                        onChange={(e) => updateCP({ gracePeriodDays: parseInt(e.target.value) || 0 })}
                        placeholder="30"
                        className="w-24 px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-lg font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none text-center"
                      />
                      <span className="text-xs font-bold text-slate-400">días</span>
                    </div>
                  </div>

                  {/* Early payment tiers */}
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-500/5 rounded-[2rem] border border-emerald-100 dark:border-emerald-500/20">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-black text-emerald-800 dark:text-emerald-300 text-sm uppercase tracking-widest">Descuento por Pronto Pago</h3>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400/70 mt-0.5">Incentiva pagos anticipados con descuentos automáticos (VEN-NIF legal)</p>
                      </div>
                      <button
                        onClick={() => updateCP({ earlyPaymentTiers: [...cp.earlyPaymentTiers, { maxDays: 7, discountPercent: 3, label: '7 días' }] })}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/25"
                      >
                        <Plus size={12} /> Agregar
                      </button>
                    </div>

                    {cp.earlyPaymentTiers.length === 0 ? (
                      <p className="text-xs text-emerald-500/60 font-bold text-center py-4">No hay tiers configurados. Agrega uno para habilitar descuento por pronto pago.</p>
                    ) : (
                      <div className="space-y-3">
                        {cp.earlyPaymentTiers.map((tier, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-100 dark:border-emerald-500/15">
                            <div className="flex-1 grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Máx. Días</label>
                                <input type="number" min="1" value={tier.maxDays}
                                  onChange={(e) => {
                                    const tiers = [...cp.earlyPaymentTiers];
                                    tiers[idx] = { ...tier, maxDays: parseInt(e.target.value) || 7 };
                                    updateCP({ earlyPaymentTiers: tiers });
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-black text-center" />
                              </div>
                              <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Descuento %</label>
                                <input type="number" min="0" max="100" step="0.5" value={tier.discountPercent}
                                  onChange={(e) => {
                                    const tiers = [...cp.earlyPaymentTiers];
                                    tiers[idx] = { ...tier, discountPercent: parseFloat(e.target.value) || 0 };
                                    updateCP({ earlyPaymentTiers: tiers });
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-black text-center" />
                              </div>
                              <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Etiqueta</label>
                                <input value={tier.label}
                                  onChange={(e) => {
                                    const tiers = [...cp.earlyPaymentTiers];
                                    tiers[idx] = { ...tier, label: e.target.value };
                                    updateCP({ earlyPaymentTiers: tiers });
                                  }}
                                  placeholder="Ej: 7 días"
                                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold" />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const tiers = cp.earlyPaymentTiers.filter((_, i) => i !== idx);
                                updateCP({ earlyPaymentTiers: tiers });
                              }}
                              className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 flex items-center justify-center transition-all shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {cp.earlyPaymentTiers.length > 0 && (
                      <div className="mt-4 p-3 bg-emerald-100/50 dark:bg-emerald-500/10 rounded-xl">
                        <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-1">Vista previa</p>
                        <div className="flex flex-wrap gap-2">
                          {cp.earlyPaymentTiers.sort((a, b) => a.maxDays - b.maxDays).map((t, i) => (
                            <span key={i} className="px-3 py-1.5 bg-white dark:bg-slate-900 rounded-lg text-xs font-black text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                              ≤{t.maxDays}d → {t.discountPercent}% desc.
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Abono approval toggle */}
                  <div className="p-6 bg-amber-50 dark:bg-amber-500/5 rounded-[2rem] border border-amber-100 dark:border-amber-500/20">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-black text-amber-800 dark:text-amber-300 text-sm uppercase tracking-widest flex items-center gap-2">
                          <Shield size={16} /> Aprobación de Abonos
                        </h3>
                        <p className="text-xs text-amber-600 dark:text-amber-400/70 mt-0.5">
                          Los vendedores registran solicitudes de abono. Un administrador debe aprobar antes de aplicar el pago a la cuenta del cliente.
                        </p>
                      </div>
                      <button
                        onClick={() => updateCP({ requireAbonoApproval: !(cp.requireAbonoApproval ?? true) })}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${(cp.requireAbonoApproval ?? true) ? 'bg-gradient-to-r from-amber-500 to-orange-600' : 'bg-slate-200 dark:bg-white/10'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(cp.requireAbonoApproval ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {(cp.requireAbonoApproval ?? true) && (
                      <div className="mt-3 p-3 bg-amber-100/50 dark:bg-amber-500/10 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                          <strong>Flujo:</strong> Vendedor registra abono → Aparece como solicitud pendiente → Admin revisa y aprueba/rechaza → Si aprueba, se crea el movimiento ABONO automáticamente.
                        </p>
                      </div>
                    )}
                    {!(cp.requireAbonoApproval ?? true) && (
                      <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                          <strong>Modo directo:</strong> Los vendedores pueden registrar abonos directamente sin aprobación. Solo recomendado si confías plenamente en tu equipo.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Multi-account info */}
                  <div className="p-6 bg-sky-50 dark:bg-sky-500/5 rounded-[2rem] border border-sky-100 dark:border-sky-500/20">
                    <h3 className="font-black text-sky-800 dark:text-sky-300 text-sm uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Info size={16} /> Multi-Cuenta (BCV / Grupo / Divisa)
                    </h3>
                    <p className="text-xs text-sky-600 dark:text-sky-400/70 leading-relaxed">
                      El sistema soporta 3 tipos de cuenta por cliente: <strong>BCV</strong> (tasa oficial), <strong>Grupo</strong> (tasa paralela) y <strong>Divisa</strong> (solo USD).
                      Cada producto puede tener un precio diferente por cuenta. Los precios se configuran en <strong>Inventario → editar producto</strong>.
                      Las tasas se gestionan desde <strong>Finanzas → Tasas</strong>.
                    </p>
                    <p className="text-[10px] font-bold text-sky-500/70 dark:text-sky-400/50 mt-2 uppercase tracking-widest">
                      Gestión interna — La factura fiscal siempre muestra tasa BCV (cumplimiento legal)
                    </p>
                  </div>
                </>
              )}

              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
                Recuerda guardar los cambios para que apliquen en todo el sistema.
              </p>
            </div>
          );
        })()}

        {/* --- TAB: MENSAJES --- */}
        {activeTab === 'MENSAJES' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
            <div className="p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm uppercase tracking-widest">Plantillas de Mensajes</h3>
                <button type="button" onClick={handleAddTemplate} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest">+ Agregar</button>
              </div>

              <div className="mt-6 space-y-4">
                {templates.map((template) => (
                  <div key={template.id} className="border border-slate-200 dark:border-white/10 rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between gap-3">
                      <input className="app-input w-full max-w-[260px]" value={template.name} onChange={(e) => handleUpdateTemplate(template.id, { name: e.target.value })} placeholder="Nombre de plantilla" />
                      <button type="button" onClick={() => handleDeleteTemplate(template.id)} className="px-3 py-2 rounded-lg bg-rose-100 text-rose-700 text-xs font-black uppercase">Eliminar</button>
                    </div>
                    <textarea className="mt-3 w-full min-h-[90px] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 text-xs font-semibold text-slate-700 dark:text-slate-300" value={template.body} onChange={(e) => handleUpdateTemplate(template.id, { body: e.target.value })} placeholder="Escribe el mensaje..." />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: OPERACION --- */}
        {activeTab === 'OPERACION' && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Modo de Operación — Libros</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Define cómo los usuarios manejan los registros contables y operativos.</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Mode selector */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Individual */}
                <button
                  onClick={() => setLocalConfig(c => ({ ...c, operation: { ...c.operation, isolationMode: 'individual' } }))}
                  className={`rounded-2xl border-2 p-5 text-left transition-all ${
                    localConfig.operation?.isolationMode === 'individual'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      localConfig.operation?.isolationMode === 'individual'
                        ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                        : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400'
                    }`}>
                      <Lock size={18} />
                    </div>
                    <div>
                      <p className={`text-sm font-black ${
                        localConfig.operation?.isolationMode === 'individual' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'
                      }`}>Modo Individual</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">Aislado</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Cada usuario opera en su propio libro. No puede ver ni alterar lo que registra otro usuario en el mismo módulo.
                    Ideal para empresas con múltiples cajeros o áreas contables independientes.
                  </p>
                </button>

                {/* Shared */}
                <button
                  onClick={() => setLocalConfig(c => ({ ...c, operation: { ...c.operation, isolationMode: 'shared' } }))}
                  className={`rounded-2xl border-2 p-5 text-left transition-all ${
                    localConfig.operation?.isolationMode === 'shared' || !localConfig.operation?.isolationMode
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      localConfig.operation?.isolationMode === 'shared' || !localConfig.operation?.isolationMode
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400'
                    }`}>
                      <Unlock size={18} />
                    </div>
                    <div>
                      <p className={`text-sm font-black ${
                        localConfig.operation?.isolationMode === 'shared' || !localConfig.operation?.isolationMode ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
                      }`}>Modo Compartido</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">Colaborativo</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Todos los usuarios operan sobre el mismo libro general. Los cambios de cualquier usuario son visibles para todos.
                    Ideal para equipos pequeños con alta confianza.
                  </p>
                </button>
              </div>

              {/* Recommendations */}
              <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/[0.06] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Recomendaciones de seguridad</p>
                </div>
                <ul className="text-[11px] text-amber-800/80 dark:text-amber-300/70 space-y-2 pl-5 list-disc leading-relaxed">
                  <li><strong>Modo Individual</strong> es recomendado cuando tienes <strong>más de 2 usuarios</strong> operando el mismo módulo (ej: 2 cajeros, vendedor + admin).</li>
                  <li>Evita que un usuario con malas intenciones <strong>elimine o modifique cargos</strong> sin que el otro se dé cuenta.</li>
                  <li>Con modo individual activo, los usuarios pueden <strong>solicitar comparaciones</strong> para detectar discrepancias entre libros.</li>
                  <li>El <strong>AuditLog</strong> registra todas las operaciones independientemente del modo — úsalo para trazabilidad.</li>
                  <li>Si cambias de modo, los registros existentes <strong>no se pierden</strong>. Solo cambia cómo se filtran y muestran.</li>
                </ul>
              </div>

              {/* Info about Compare feature */}
              {localConfig.operation?.isolationMode === 'individual' && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/[0.06] p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={15} className="text-indigo-600 dark:text-indigo-400" />
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-400">Comparar Libros habilitado</p>
                  </div>
                  <p className="text-[11px] text-indigo-700/70 dark:text-indigo-300/60 leading-relaxed">
                    Con el modo individual activo, la sección <strong>"Comparar Libros"</strong> cobra mayor utilidad.
                    Los usuarios pueden solicitar comparaciones cruzadas, detectar diferencias automáticamente,
                    chatear sobre discrepancias y exportar reportes. Todo queda registrado en el AuditLog.
                  </p>
                </div>
              )}

              {/* ── Extensión de Tasas Personalizadas ── */}
              <div className="border-t border-slate-200 dark:border-white/10 pt-6 mt-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <Zap size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        Precios Dinámicos por Tasa
                        <span className="relative group cursor-help">
                          <Info size={12} className="text-slate-400 dark:text-slate-600" />
                          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-900 text-[10px] text-white/80 font-medium shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-center leading-relaxed">
                            Habilita precios que se recalculan automaticamente segun las tasas. Los productos se clasifican como BCV (estatico) o tasa custom (dinamico) en Inventario.
                          </span>
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">
                        Extensión de tasas personalizadas
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await setZoherEnabled(!zoherEnabled);
                      success(zoherEnabled ? 'Extensión desactivada' : 'Extensión activada');
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      zoherEnabled ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-slate-300 dark:bg-white/10'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform ${
                      zoherEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                {zoherEnabled && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Los productos clasificados bajo estas tasas tendrán precios que se recalculan automáticamente al actualizar las tasas del día.
                      En POS no se pueden mezclar productos de tasas distintas en una misma venta.
                    </p>

                    {/* Custom rates list */}
                    <div className="space-y-2">
                      {localCustomRates.map((rate, idx) => (
                        <div key={rate.id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <Edit3 size={12} className="text-slate-400 shrink-0" />
                            <input
                              type="text"
                              value={rate.name}
                              onChange={(e) => {
                                const updated = [...localCustomRates];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setLocalCustomRates(updated);
                              }}
                              placeholder="Nombre de la tasa"
                              className="flex-1 min-w-0 bg-transparent text-sm font-bold text-slate-700 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Bs/$</span>
                            <input
                              type="number"
                              value={rate.value || ''}
                              onChange={(e) => {
                                const updated = [...localCustomRates];
                                updated[idx] = { ...updated[idx], value: parseFloat(e.target.value) || 0 };
                                setLocalCustomRates(updated);
                              }}
                              step="0.01"
                              className="w-20 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-700 dark:text-white text-right outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const updated = [...localCustomRates];
                              updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                              setLocalCustomRates(updated);
                            }}
                            className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${
                              rate.enabled
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400'
                            }`}
                          >
                            {rate.enabled ? 'ON' : 'OFF'}
                          </button>
                          <button
                            onClick={() => setLocalCustomRates(localCustomRates.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add rate button */}
                    {localCustomRates.length < 3 && (
                      <button
                        onClick={() => {
                          setLocalCustomRates([
                            ...localCustomRates,
                            { id: `RATE_${Date.now()}`, name: '', value: 0, enabled: true },
                          ]);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 text-slate-400 hover:border-amber-400 hover:text-amber-500 transition-all text-[10px] font-black uppercase tracking-widest w-full justify-center"
                      >
                        <Plus size={13} /> Agregar tasa ({localCustomRates.length}/3)
                      </button>
                    )}

                    {/* Save custom rates */}
                    <button
                      onClick={async () => {
                        const invalid = localCustomRates.find((r) => !r.name.trim());
                        if (invalid) {
                          error('Todas las tasas deben tener un nombre');
                          return;
                        }
                        await updateCustomRates(localCustomRates);
                        success('Tasas personalizadas guardadas');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/25"
                    >
                      <Save size={13} /> Guardar tasas
                    </button>
                  </div>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={() => {
                  onUpdateConfig(localConfig);
                  localStorage.setItem('operation_isolation_mode', localConfig.operation?.isolationMode || 'shared');
                  success('Modo de operación actualizado');
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25"
              >
                <Save size={13} /> Guardar configuración
              </button>
            </div>
          </div>
        )}

        {/* --- TAB: AUDITORIA --- */}
        {activeTab === 'AUDITORIA' && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Auditoria del sistema</h3>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{filteredAuditLogs.length} eventos</p>
            </div>

            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} placeholder="Buscar..." className="app-input text-xs" />
              <select value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)} className="app-input text-xs">
                <option value="ALL">Todas las acciones</option>
                {auditActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-white/[0.07] text-slate-500 font-bold uppercase sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Accion</th>
                    <th className="px-6 py-4">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{new Date(log.date).toLocaleString()}</td>
                      <td className="px-6 py-3 font-bold text-slate-800 dark:text-slate-200">{log.user}</td>
                      <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getAuditActionBadge(log.action)}`}>{log.action}</span></td>
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400 max-w-[300px] truncate">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* --- TAB: DEV / TEST --- */}
        {activeTab === 'DEV' && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden animate-in zoom-in-95 duration-300 p-6 space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white">Datos de Prueba</h3>
              <p className="text-xs text-slate-400 mt-1">
                Carga datos de prueba para probar todas las funciones del sistema: productos, clientes, proveedores, ventas, gastos, terminales, arqueos.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-50 dark:bg-amber-500/[0.08] p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Advertencia</p>
                <p className="text-xs text-amber-600 dark:text-amber-400/70 mt-1">
                  Esto creará datos ficticios en tu negocio. Ideal para testing y demos. Los datos se pueden eliminar después manualmente.
                </p>
              </div>
            </div>

            {seedResult && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/[0.08] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">Datos cargados exitosamente</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                  {[
                    { label: 'Productos', count: seedResult.products },
                    { label: 'Clientes', count: seedResult.customers },
                    { label: 'Proveedores', count: seedResult.suppliers },
                    { label: 'Movimientos', count: seedResult.movements },
                    { label: 'Terminales', count: seedResult.terminals },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10">
                      <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{s.count}</p>
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seedProgress && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-indigo-500 animate-spin" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{seedProgress.msg}</p>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${seedProgress.pct}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={async () => {
                if (!businessId) { error('No se encontró el businessId'); return; }
                const uid = currentUser?.uid || 'test-owner';
                setSeedResult(null);
                setSeedProgress({ msg: 'Iniciando...', pct: 0 });
                try {
                  const result = await seedTestData(businessId, uid, (msg, pct) => {
                    setSeedProgress({ msg, pct });
                  });
                  setSeedResult(result);
                  setSeedProgress(null);
                  success(`Datos de prueba cargados: ${result.products} productos, ${result.movements} movimientos`);
                } catch (e: any) {
                  console.error('[Seed]', e);
                  error('Error al cargar datos: ' + (e.message || 'Error desconocido'));
                  setSeedProgress(null);
                }
              }}
              disabled={!!seedProgress}
              className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-black text-white transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              {seedProgress ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Cargar datos de prueba
            </button>

            <div className="border-t border-slate-200 dark:border-white/10 pt-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Lo que se creará:</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li>30 productos con precios, márgenes, stock y categorías variadas</li>
                <li>8 clientes con datos completos y límites de crédito</li>
                <li>5 proveedores con RIF y categoría</li>
                <li>120 ventas (facturas) distribuidas en los últimos 30 días</li>
                <li>15 abonos de clientes (pagos parciales)</li>
                <li>20 gastos/compras (CxP) con categorías variadas</li>
                <li>3 terminales POS (2 detal + 1 mayor)</li>
                <li>5 arqueos históricos con conteo de billetes</li>
                <li>Configuración fiscal completa (IVA + IGTF)</li>
              </ul>
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
