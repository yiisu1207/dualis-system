import React, { useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { User, AppConfig } from '../../types';
import {
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  Users,
  Package,
  LayoutGrid,
  ArrowLeftRight,
  Settings2,
  HelpCircle,
  BarChart3,
  Landmark,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ShoppingCart,
  Receipt,
  Wallet,
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

// ─── TYPES ────────────────────────────────────────────────────────────────────
type NavItem = {
  id: string;
  label: string;
  Icon: React.ElementType;
  path: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// ─── NAV DATA ─────────────────────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { id: 'resumen',      label: 'Dashboard',       Icon: LayoutDashboard, path: 'dashboard'     },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { id: 'inventario',   label: 'Inventario',      Icon: Package,         path: 'inventario'    },
      { id: 'cajas',        label: 'Ventas / Cajas',  Icon: ShoppingCart,    path: 'cajas'         },
      { id: 'rrhh',         label: 'RRHH / Nómina',  Icon: Users,           path: 'rrhh'          },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { id: 'clientes',     label: 'Deudores / CxC',  Icon: Wallet,          path: 'cobranzas'     },
      { id: 'proveedores',  label: 'Gastos / CxP',    Icon: Receipt,         path: 'cxp'           },
      { id: 'contabilidad', label: 'Contabilidad',    Icon: BookOpen,        path: 'contabilidad'  },
      { id: 'tasas',        label: 'Tasas de Cambio', Icon: TrendingUp,      path: 'tasas'         },
      { id: 'conciliacion', label: 'Conciliación',    Icon: Landmark,        path: 'conciliacion'  },
    ],
  },
  {
    label: 'Inteligencia',
    items: [
      { id: 'reportes',     label: 'Estadísticas',    Icon: BarChart3,       path: 'reportes'      },
      { id: 'vision',       label: 'Auditoría IA',    Icon: ClipboardList,   path: 'vision'        },
      { id: 'comparar',     label: 'Comparar Libros', Icon: ArrowLeftRight,  path: 'comparar'      },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { id: 'widgets',      label: 'Herramientas',    Icon: LayoutGrid,      path: 'widgets'       },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'config',       label: 'Configuración',   Icon: Settings2,       path: 'configuracion' },
      { id: 'help',         label: 'Ayuda',           Icon: HelpCircle,      path: 'help'          },
    ],
  },
];

const moduleMap: Record<string, string> = {
  clientes:     'cxc',
  proveedores:  'cxp',
  contabilidad: 'ledger',
  conciliacion: 'reconciliation',
  rrhh:         'nomina',
  vision:       'vision',
};

// ─── TOOLTIP helper (collapsed mode) ─────────────────────────────────────────
const Tip: React.FC<{ children: React.ReactNode; alignBottom?: boolean }> = ({ children, alignBottom }) => (
  <span
    className={`
      pointer-events-none absolute left-[calc(100%+12px)] z-[200]
      flex items-center gap-2
      px-3 py-2 rounded-xl bg-[#1a2235] border border-white/[0.08]
      text-white text-[11px] font-semibold tracking-wide whitespace-nowrap
      shadow-2xl shadow-black/50
      opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
      transition-all duration-150
      ${alignBottom ? 'bottom-0' : 'top-1/2 -translate-y-1/2'}
    `}
  >
    <ChevronRight size={9} className="text-indigo-400/60 shrink-0" />
    {children}
  </span>
);

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
  const location  = useLocation();
  const { empresa_id } = useParams();

  // Persist collapsed state across sessions
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dualis_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('dualis_sidebar_collapsed', String(next)); } catch { /* ignore */ }
  };

  const base   = empresa_id ? `/${empresa_id}/admin` : '';
  const toPath = (p: string) => `${base}/${p}`;

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  const isVisible = (item: NavItem) => {
    const modKey = moduleMap[item.id];
    if (modKey && (config as any).modules?.[modKey] === false) return false;
    if (item.id === 'comparar' && !canCompare) return false;
    if (!isOwnerOrAdmin && item.id !== 'cajas' && item.id !== 'help') return false;
    return true;
  };

  const roleLabel: Record<string, string> = {
    owner:   'Dueño',
    admin:   'Admin',
    ventas:  'Ventas',
    auditor: 'Auditor',
    staff:   'Staff',
    member:  'Miembro',
    pending: 'Pendiente',
  };

  // Accent colors per group index for icons
  const groupIconColor = [
    'text-indigo-400',   // Dashboard
    'text-sky-400',      // Operaciones
    'text-emerald-400',  // Finanzas
    'text-violet-400',   // Inteligencia
    'text-amber-400',    // Herramientas
    'text-slate-400',    // Sistema
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:static top-0 left-0 h-full z-50 flex flex-col overflow-hidden
          transition-[width] duration-300 ease-in-out
          lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-[72px]' : 'w-[220px]'}
          bg-[#070b14] relative
        `}
      >
        {/* ── Decorative background layers ── */}
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none" />
        {/* Right border gradient */}
        <div className="absolute right-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent pointer-events-none z-10" />
        {/* Top glow orb */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

        {/* ── LOGO HEADER ─────────────────────────────────────────── */}
        <div
          className={`
            relative z-10 flex items-center border-b border-white/[0.06] shrink-0 h-[60px]
            ${collapsed ? 'justify-center px-0' : 'px-4 justify-between'}
          `}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo mark */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-black text-[15px] text-white select-none shadow-[0_0_20px_rgba(99,102,241,0.45)] shrink-0">
              D
            </div>
            {/* Brand name (expanded only) */}
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-white font-black text-[14px] leading-none tracking-tight">Dualis</p>
                <p className="text-[8px] font-bold text-white/25 uppercase tracking-[0.18em] mt-0.5">Sistema ERP</p>
              </div>
            )}
          </div>

          {/* Collapse button (expanded only) */}
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="w-6 h-6 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-white/20 hover:text-white/60 flex items-center justify-center transition-all shrink-0"
              title="Colapsar menú"
            >
              <ChevronLeft size={12} />
            </button>
          )}
        </div>

        {/* ── NAV ─────────────────────────────────────────────────── */}
        <nav
          className={`
            relative z-10 flex-1 overflow-y-auto custom-scroll py-3
            ${collapsed ? 'flex flex-col items-center px-2.5' : 'px-2'}
          `}
        >
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(isVisible);
            if (visibleItems.length === 0) return null;
            const iconColor = groupIconColor[gi] ?? 'text-white/50';

            return (
              <React.Fragment key={group.label}>
                {/* Group header */}
                {collapsed ? (
                  gi > 0 && <div className="w-8 h-px bg-white/[0.06] my-2.5 shrink-0" />
                ) : (
                  <div className={`${gi > 0 ? 'mt-4' : 'mt-0'} mb-1 px-2`}>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                      {group.label}
                    </p>
                  </div>
                )}

                {/* Items */}
                {visibleItems.map((item) => {
                  const href     = toPath(item.path);
                  const isActive = activeTab === item.id || location.pathname === href;

                  return (
                    <NavLink
                      key={item.id}
                      to={href}
                      onClick={() => setIsOpen(false)}
                      className={`
                        relative group flex items-center rounded-xl transition-all duration-200 shrink-0
                        ${collapsed
                          ? 'w-11 h-11 justify-center my-0.5'
                          : 'gap-2.5 px-2.5 py-2 w-full mb-0.5'
                        }
                        ${isActive
                          ? 'bg-gradient-to-r from-indigo-600/[0.18] to-violet-600/[0.08] border border-indigo-500/[0.12] text-white'
                          : `${iconColor} hover:bg-white/[0.05] hover:text-white`
                        }
                      `}
                    >
                      {/* Active: left accent bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400 shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
                      )}

                      <item.Icon
                        size={15}
                        strokeWidth={isActive ? 2.2 : 1.7}
                        className="relative z-10 shrink-0"
                      />

                      {/* Label (expanded) */}
                      {!collapsed && (
                        <span
                          className={`text-[12px] font-medium tracking-tight truncate relative z-10 transition-colors ${isActive ? 'text-white' : ''}`}
                        >
                          {item.label}
                        </span>
                      )}

                      {/* Tooltip (collapsed) */}
                      {collapsed && <Tip>{item.label}</Tip>}
                    </NavLink>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── BOTTOM ───────────────────────────────────────────────── */}
        <div
          className={`
            relative z-10 shrink-0 border-t border-white/[0.06] py-3
            ${collapsed ? 'flex flex-col items-center gap-1 px-2.5' : 'px-2 space-y-0.5'}
          `}
        >
          {/* Expand button (collapsed only) */}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Expandir menú"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-white/20 hover:bg-white/[0.06] hover:text-white/50 transition-all"
            >
              <ChevronRight size={15} />
            </button>
          )}

          {/* Logout */}
          <button
            onClick={onLogout}
            className={`
              relative group flex items-center rounded-xl text-white/25
              hover:bg-rose-500/[0.12] hover:text-rose-400 transition-all
              ${collapsed ? 'w-11 h-11 justify-center' : 'gap-2.5 px-2.5 py-2 w-full'}
            `}
          >
            <LogOut size={14} strokeWidth={1.8} className="shrink-0" />
            {!collapsed && <span className="text-[12px] font-medium">Cerrar sesión</span>}
            {collapsed && <Tip>Cerrar sesión</Tip>}
          </button>

          {/* Avatar / Profile */}
          <button
            onClick={onOpenProfile}
            className={`
              relative group flex items-center rounded-xl
              hover:bg-white/[0.05] transition-all
              ${collapsed ? 'w-11 h-11 justify-center' : 'gap-2.5 px-2.5 py-2 w-full'}
            `}
          >
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white font-black text-[12px] select-none shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              {/* Role badge */}
              {collapsed && (
                <span className="absolute -bottom-1 -right-1 px-1 py-px rounded bg-[#1a2235] border border-white/[0.08] text-[7px] font-black text-white/50 uppercase leading-none">
                  {(roleLabel[user.role] || user.role).slice(0, 3)}
                </span>
              )}
            </div>

            {/* Name + role (expanded) */}
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[12px] font-black text-white/70 truncate leading-none">{user.name}</p>
                <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.15em] mt-0.5">
                  {roleLabel[user.role] || user.role}
                </p>
              </div>
            )}

            {/* Tooltip (collapsed) */}
            {collapsed && (
              <span
                className="
                  pointer-events-none absolute left-[calc(100%+12px)] bottom-0 z-[200]
                  flex flex-col gap-0.5
                  px-3 py-2.5 rounded-xl bg-[#1a2235] border border-white/[0.08]
                  shadow-2xl shadow-black/50 min-w-[140px]
                  opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                  transition-all duration-150
                "
              >
                <span className="text-white text-[12px] font-black leading-tight">{user.name}</span>
                <span className="text-white/40 text-[9px] font-bold uppercase tracking-widest">
                  {roleLabel[user.role] || user.role}
                </span>
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar);
