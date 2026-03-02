import React from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
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
  ChevronRight,
  ShoppingCart,
  Receipt,
  Wallet,
  PieChart,
  ClipboardList,
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

// ─── GROUPS ──────────────────────────────────────────────────────────────────
type NavItem = {
  id: string;
  label: string;
  Icon: React.ElementType;
  path: string;
  color: string;
  bg: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { id: 'resumen',      label: 'Dashboard',         Icon: LayoutDashboard, path: 'dashboard',    color: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { id: 'inventario',   label: 'Inventario',        Icon: Package,         path: 'inventario',   color: 'text-sky-400',     bg: 'bg-sky-500/15' },
      { id: 'cajas',        label: 'Ventas / Cajas',    Icon: ShoppingCart,    path: 'cajas',        color: 'text-sky-400',     bg: 'bg-sky-500/15' },
      { id: 'rrhh',         label: 'RRHH / Nómina',    Icon: Users,           path: 'rrhh',         color: 'text-sky-400',     bg: 'bg-sky-500/15' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { id: 'clientes',     label: 'Deudores / CxC',   Icon: Wallet,          path: 'cobranzas',    color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
      { id: 'proveedores',  label: 'Gastos / CxP',     Icon: Receipt,         path: 'cxp',          color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
      { id: 'contabilidad', label: 'Contabilidad',      Icon: BookOpen,        path: 'contabilidad', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
      { id: 'tasas',        label: 'Tasas de Cambio',   Icon: TrendingUp,      path: 'tasas',        color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
      { id: 'conciliacion', label: 'Conciliación',      Icon: Landmark,        path: 'conciliacion', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    ],
  },
  {
    label: 'Reportes',
    items: [
      { id: 'reportes',     label: 'Estadísticas',      Icon: BarChart3,       path: 'reportes',     color: 'text-violet-400',  bg: 'bg-violet-500/15' },
      { id: 'vision',       label: 'Auditoría IA',      Icon: ClipboardList,   path: 'vision',       color: 'text-violet-400',  bg: 'bg-violet-500/15' },
      { id: 'comparar',     label: 'Comparar Libros',   Icon: ArrowLeftRight,  path: 'comparar',     color: 'text-violet-400',  bg: 'bg-violet-500/15' },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { id: 'widgets',      label: 'Herramientas',      Icon: LayoutGrid,      path: 'widgets',      color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'config',       label: 'Configuración',     Icon: Settings2,       path: 'configuracion', color: 'text-slate-400',   bg: 'bg-slate-500/15' },
      { id: 'help',         label: 'Ayuda',             Icon: HelpCircle,      path: 'help',          color: 'text-slate-400',   bg: 'bg-slate-500/15' },
    ],
  },
];

const moduleMap: Record<string, string> = {
  clientes: 'cxc',
  proveedores: 'cxp',
  contabilidad: 'ledger',
  conciliacion: 'reconciliation',
  rrhh: 'nomina',
  vision: 'vision',
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
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

  const isVisible = (item: NavItem) => {
    const modKey = moduleMap[item.id];
    if (modKey && config.modules?.[modKey as keyof AppConfig['modules']] === false) return false;
    if (item.id === 'comparar' && !canCompare) return false;
    if (!isOwnerOrAdmin && item.id !== 'cajas' && item.id !== 'help') return false;
    return true;
  };

  const roleLabel: Record<string, string> = {
    owner: 'Dueño',
    admin: 'Admin',
    ventas: 'Ventas',
    auditor: 'Auditor',
    staff: 'Staff',
    member: 'Miembro',
    pending: 'Pendiente',
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:static top-0 left-0 h-full z-50
          transition-transform lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          w-[72px] flex flex-col
          bg-[#090e1a] border-r border-white/[0.05]
        `}
      >
        {/* ── LOGO ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center py-5 border-b border-white/[0.05] shrink-0">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-syne font-extrabold text-[18px] text-white select-none shadow-[0_0_28px_rgba(99,102,241,0.55)]">
              D
            </div>
            {/* subtle ring */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-indigo-400/20" />
          </div>
        </div>

        {/* ── NAV ──────────────────────────────────────────────────── */}
        <nav className="flex-1 flex flex-col items-center py-3 overflow-y-auto custom-scroll gap-0 px-2.5">
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(isVisible);
            if (visibleItems.length === 0) return null;

            return (
              <React.Fragment key={group.label}>
                {gi > 0 && (
                  <div className="w-8 h-px bg-white/[0.06] my-2 shrink-0" />
                )}
                {visibleItems.map((item) => {
                  const href = toPath(item.path);
                  const isActive = activeTab === item.id || location.pathname === href;

                  return (
                    <NavLink
                      key={item.id}
                      to={href}
                      onClick={() => setIsOpen(false)}
                      title={item.label}
                      className={`
                        relative group w-11 h-11 flex items-center justify-center rounded-xl
                        transition-all duration-200 shrink-0 my-0.5
                        ${isActive
                          ? `${item.bg} ${item.color}`
                          : 'text-white/20 hover:bg-white/[0.06] hover:text-white/50'
                        }
                      `}
                    >
                      {/* Active left bar + glow */}
                      {isActive && (
                        <>
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                            style={{ background: 'currentColor', filter: 'blur(0px)' }}
                          />
                          <span
                            className="absolute inset-0 rounded-xl opacity-40"
                            style={{ boxShadow: '0 0 12px currentColor' }}
                          />
                        </>
                      )}

                      <item.Icon
                        size={18}
                        strokeWidth={isActive ? 2.2 : 1.7}
                        className="relative z-10"
                      />

                      {/* Tooltip */}
                      <span
                        className="
                          pointer-events-none absolute left-[calc(100%+12px)] z-[200]
                          flex items-center gap-2
                          px-3 py-2 rounded-xl bg-[#1e293b] border border-white/[0.08]
                          text-white text-[11px] font-bold tracking-wide whitespace-nowrap
                          shadow-2xl
                          opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                          transition-all duration-150
                        "
                      >
                        <ChevronRight size={10} className="text-white/30 shrink-0" />
                        {item.label}
                      </span>
                    </NavLink>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── BOTTOM ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/[0.05] flex flex-col items-center gap-2 py-4 px-2.5">
          {/* Logout */}
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="
              relative group w-11 h-11 flex items-center justify-center rounded-xl
              text-white/20 hover:bg-rose-500/10 hover:text-rose-400
              transition-all duration-200
            "
          >
            <LogOut size={17} strokeWidth={1.8} />
            <span
              className="
                pointer-events-none absolute left-[calc(100%+12px)] z-[200]
                flex items-center gap-2
                px-3 py-2 rounded-xl bg-[#1e293b] border border-white/[0.08]
                text-white text-[11px] font-bold tracking-wide whitespace-nowrap
                shadow-2xl
                opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                transition-all duration-150
              "
            >
              <ChevronRight size={10} className="text-white/30 shrink-0" />
              Cerrar sesión
            </span>
          </button>

          {/* Avatar */}
          <button
            onClick={onOpenProfile}
            title={user.name}
            className="relative group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white font-black text-[14px] select-none shadow-[0_0_16px_rgba(245,158,11,0.35)] hover:scale-105 transition-transform">
              {user.name.charAt(0).toUpperCase()}
            </div>
            {/* Role badge */}
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-[#1e293b] border border-white/10 text-[8px] font-black text-white/60 uppercase tracking-widest leading-none">
              {(roleLabel[user.role] || user.role).slice(0, 3)}
            </span>

            {/* Hover tooltip with full name + role */}
            <span
              className="
                pointer-events-none absolute left-[calc(100%+12px)] bottom-0 z-[200]
                flex flex-col gap-0.5
                px-3 py-2.5 rounded-xl bg-[#1e293b] border border-white/[0.08]
                shadow-2xl min-w-[140px]
                opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                transition-all duration-150
              "
            >
              <span className="text-white text-[12px] font-black leading-tight">{user.name}</span>
              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{roleLabel[user.role] || user.role}</span>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar);
