import React from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { User, AppConfig } from '../../types';
import {
  LayoutDashboard,
  FolderOpen,
  BookOpen,
  TrendingUp,
  FileText,
  Users,
  Package,
  Sparkles,
  LayoutGrid,
  Monitor,
  ArrowLeftRight,
  Settings2,
  HelpCircle,
  BarChart3,
  Landmark,
  LogOut,
} from 'lucide-react';

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

const menuItems = [
  { id: 'resumen',      label: 'Resumen',         Icon: LayoutDashboard, path: 'dashboard' },
  { id: 'clientes',     label: 'Clientes / CxC',  Icon: FolderOpen,      path: 'cobranzas' },
  { id: 'contabilidad', label: 'Contabilidad',     Icon: BookOpen,        path: 'contabilidad' },
  { id: 'tasas',        label: 'Tasas de Cambio',  Icon: TrendingUp,      path: 'tasas' },
  { id: 'proveedores',  label: 'Proveedores / CxP',Icon: FileText,        path: 'cxp' },
  { id: 'rrhh',         label: 'RRHH / Nómina',   Icon: Users,           path: 'rrhh' },
  { id: 'inventario',   label: 'Inventario',       Icon: Package,         path: 'inventario' },
  { id: 'reportes',     label: 'Reportes',         Icon: BarChart3,       path: 'reportes' },
  { id: 'vision',       label: 'VisionLab IA',     Icon: Sparkles,        path: 'vision' },
  { id: 'conciliacion', label: 'Conciliación',     Icon: Landmark,        path: 'conciliacion' },
  { id: 'comparar',     label: 'Comparar Libros',  Icon: ArrowLeftRight,  path: 'comparar' },
  { id: 'widgets',      label: 'Herramientas',     Icon: LayoutGrid,      path: 'widgets' },
  { id: 'cajas',        label: 'Cajas / Terminales',Icon: Monitor,        path: 'cajas' },
  { id: 'config',       label: 'Configuración',    Icon: Settings2,       path: 'configuracion' },
  { id: 'help',         label: 'Ayuda',            Icon: HelpCircle,      path: 'help' },
];

const moduleMap: Record<string, string> = {
  clientes: 'cxc',
  proveedores: 'cxp',
  contabilidad: 'ledger',
  conciliacion: 'reconciliation',
  rrhh: 'nomina',
  vision: 'vision',
};

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
  const location = useLocation();
  const { empresa_id } = useParams();

  const base = empresa_id ? `/${empresa_id}/admin` : '';
  const toPath = (p: string) => `${base}/${p}`;

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  const visible = menuItems.filter(item => {
    const modKey = moduleMap[item.id];
    if (modKey && config.modules?.[modKey as keyof AppConfig['modules']] === false) return false;
    if (item.id === 'comparar' && !canCompare) return false;
    if (!isOwnerOrAdmin && item.id !== 'cajas' && item.id !== 'help') return false;
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 h-full w-[68px] z-50 transition-transform lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col bg-white border-r border-slate-100 items-center py-4 gap-1`}
      >
        {/* Logo mark */}
        <div className="w-10 h-10 bg-gradient-to-br from-[#4f6ef7] to-[#7c3aed] rounded-xl flex items-center justify-center font-syne font-extrabold text-[16px] text-white mb-4 shadow-[0_0_20px_rgba(79,110,247,0.4)] shrink-0 select-none">
          D
        </div>

        {/* Nav items */}
        <nav className="flex-1 w-full flex flex-col items-center gap-0.5 overflow-y-auto custom-scroll px-2">
          {visible.map(({ id, label, Icon, path }) => {
            const href = toPath(path);
            const isActive = activeTab === id || location.pathname === href;
            return (
              <NavLink
                key={id}
                to={href}
                onClick={() => setIsOpen(false)}
                title={label}
                className={`
                  relative group w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-150
                  ${isActive
                    ? 'bg-blue-50 text-[#4f6ef7]'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                  }
                `}
              >
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#4f6ef7] rounded-r-full" />
                )}

                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />

                {/* Tooltip */}
                <span className="absolute left-[calc(100%+10px)] px-3 py-1.5 bg-slate-900 text-white text-[11px] font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-[200] shadow-xl">
                  {label}
                  <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom: logout + avatar */}
        <div className="flex flex-col items-center gap-2 shrink-0 pb-1 px-2">
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="group relative w-11 h-11 flex items-center justify-center rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all"
          >
            <LogOut size={18} strokeWidth={1.8} />
            <span className="absolute left-[calc(100%+10px)] px-3 py-1.5 bg-slate-900 text-white text-[11px] font-semibold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-[200] shadow-xl">
              Cerrar sesión
              <span className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </span>
          </button>

          <button
            onClick={onOpenProfile}
            title={user.name}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#ef4444] flex items-center justify-center text-white font-bold text-[13px] shadow-md hover:scale-105 transition-transform select-none"
          >
            {user.name.charAt(0).toUpperCase()}
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar);
