import React from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { User, AppConfig } from '../../types';
import { useTranslation } from 'react-i18next';
import Logo from './ui/Logo';

interface SidebarProps {
  activeTab: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: User;
  config: AppConfig;
  canCompare?: boolean;
  onLogout: () => void;
  onOpenProfile: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  isOpen,
  setIsOpen,
  user,
  config,
  canCompare = false,
  onLogout,
  onOpenProfile,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { tenantId } = useTenant();
  const { empresa_id } = useParams();
  
  const displayName = config.companyName || 'DUALIS';
  const roleLabel = user.role || 'Usuario';

  // Construcción dinámica de rutas multi-tenant
  const base = empresa_id ? `/${empresa_id}/admin` : '';
  const legacy = (ruta: string) => empresa_id ? `/${empresa_id}/admin/${ruta}` : `/${ruta}`;
  const menuItems = [
    { id: 'resumen', label: t('menu.dashboard'), icon: 'fa-solid fa-chart-pie', path: legacy('dashboard') },
    { id: 'clientes', label: t('menu.cobranzas'), icon: 'fa-solid fa-folder-open', path: legacy('cobranzas') },
    { id: 'contabilidad', label: t('menu.contabilidad'), icon: 'fa-solid fa-scale-balanced', path: legacy('contabilidad') },
    { id: 'tasas', label: t('menu.tasas'), icon: 'fa-solid fa-arrow-trend-up', path: legacy('tasas') },
    { id: 'proveedores', label: t('menu.cxp'), icon: 'fa-solid fa-file-invoice-dollar', path: legacy('cxp') },
    { id: 'rrhh', label: t('menu.rrhh'), icon: 'fa-solid fa-users-gear', path: legacy('rrhh') },
    { id: 'inventario', label: t('menu.inventario'), icon: 'fa-solid fa-boxes-stacked', path: legacy('inventario') },
    { id: 'vision', label: t('menu.vision'), icon: 'fa-solid fa-wand-magic-sparkles', path: legacy('vision') },
    // Nueva opción de cajas/terminales
    { id: 'cajas', label: 'Cajas / Terminales', icon: 'fa-solid fa-cash-register', path: legacy('cajas') },
    { id: 'comparar', label: t('menu.comparar'), icon: 'fa-solid fa-code-compare', path: legacy('comparar') },
    { id: 'config', label: t('menu.configuracion'), icon: 'fa-solid fa-gears', path: legacy('configuracion') },
    { id: 'help', label: t('menu.help'), icon: 'fa-regular fa-circle-question', path: legacy('help') },
  ];

  const moduleMap: Partial<Record<string, keyof AppConfig['modules']>> = {
    resumen: 'dashboard',
    clientes: 'cxc',
    proveedores: 'cxp',
    contabilidad: 'ledger',
    conciliacion: 'reconciliation',
    nomina: 'nomina',
    vision: 'vision',
  };

  const isModuleEnabled = (itemId: string) => {
    const key = moduleMap[itemId];
    if (!key) return true;
    return config.modules?.[key] !== false;
  };

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  const filteredItems = menuItems.filter((item) => {
    if (!isModuleEnabled(item.id)) return false;
    if (item.id === 'comparar' && !canCompare) return false;
    
    // Si no es owner o admin, restringir acceso a la mayoría de los módulos
    // Solo permitir 'cajas' (terminal) y 'help'
    if (!isOwnerOrAdmin && item.id !== 'cajas' && item.id !== 'help') {
      return false;
    }

    return true;
  });

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 h-full w-[280px] z-50 transition-transform lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col bg-white border-r border-slate-200 shadow-xl lg:shadow-none`}
      >
        {/* APP BRAND */}
        <div className="h-20 flex items-center px-8 border-b border-slate-100">
          <div className="mr-3">
            <Logo showText={false} />
          </div>
          <div>
            <span className="block font-black text-lg text-slate-800 tracking-tight leading-none">{displayName}</span>
            <span className="block text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400 mt-1">
              Workspace
            </span>
          </div>
        </div>

        {/* MENU */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <p className="px-4 text-[10px] font-black uppercase tracking-widest mb-4 text-slate-400">
            Navegación
          </p>
          {filteredItems.map((item) => {
            const isActive = location.pathname.includes(item.path) || activeTab === item.id;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all
                  ${
                    isActive
                      ? 'bg-violet-50 text-violet-700 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }
                `}
              >
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                  ${isActive ? 'bg-white text-violet-600 shadow-sm' : 'bg-transparent text-slate-400'}
                `}>
                  <i className={`${item.icon} text-sm`}></i>
                </div>
                <span>{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-600"></div>}
              </NavLink>
            );
          })}
        </nav>

        {/* USER PROFILE */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black shadow-md shadow-indigo-200">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden text-left flex-1">
              <p className="text-sm font-bold truncate text-slate-800 group-hover:text-indigo-700 transition-colors">{user.name}</p>
              <p className="text-[10px] uppercase font-bold text-slate-400">{roleLabel}</p>
            </div>
            <i className="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 p-2 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center group-hover:bg-rose-100 group-hover:text-rose-500 transition-colors">
              <i className="fa-solid fa-right-from-bracket text-sm"></i>
            </div>
            <span className="text-sm font-bold">Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar);
