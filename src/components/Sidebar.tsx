import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { User, AppConfig } from '../../types';
import { type RolePermissions, type ModuleId } from '../hooks/useRolePermissions';
import { useVendor } from '../context/VendorContext';
import { useSubscription } from '../hooks/useSubscription';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Package,
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
  MapPin,
  FileText,
  ClipboardCheck,
  CreditCard,
  Clock,
  Zap,
  TrendingUp,
  Truck,
  History,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: User;
  config: AppConfig;
  canCompare?: boolean;
  rolePermissions?: RolePermissions;
  badges?: Record<string, number>;
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
  id: string;
  label: string;
  items: NavItem[];
};

// ─── NAV DATA ─────────────────────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      { id: 'resumen',      label: 'Dashboard',        Icon: LayoutDashboard, path: 'dashboard'    },
    ],
  },
  {
    id: 'operaciones',
    label: 'Operaciones',
    items: [
      { id: 'inventario',   label: 'Inventario',       Icon: Package,         path: 'inventario'   },
      { id: 'cajas',        label: 'Ventas / Cajas',   Icon: ShoppingCart,    path: 'cajas'        },
      { id: 'despacho',     label: 'Panel Despacho',   Icon: Truck,           path: 'despacho'     },
      { id: 'tasas',        label: 'Tasas Cambiarias', Icon: TrendingUp,      path: 'tasas'        },
      { id: 'historial',    label: 'Libro Movimientos',Icon: History,         path: 'historial'    },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    items: [
      { id: 'clientes',     label: 'Deudores / CxC',   Icon: Wallet,          path: 'cobranzas'    },
      { id: 'proveedores',  label: 'Gastos / CxP',     Icon: Receipt,         path: 'cxp'          },
      { id: 'contabilidad', label: 'Contabilidad',     Icon: BookOpen,        path: 'contabilidad' },
      { id: 'conciliacion', label: 'Conciliación',     Icon: Landmark,        path: 'conciliacion' },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    items: [
      { id: 'rrhh',         label: 'RRHH / Nómina',    Icon: Users,           path: 'rrhh'         },
      { id: 'sucursales',   label: 'Sucursales',       Icon: MapPin,          path: 'sucursales'   },
    ],
  },
  {
    id: 'inteligencia',
    label: 'Inteligencia',
    items: [
      { id: 'reportes',     label: 'Estadísticas',     Icon: BarChart3,       path: 'reportes'     },
      { id: 'vision',       label: 'Auditoría IA',     Icon: ClipboardList,   path: 'vision'       },
      { id: 'comparar',     label: 'Comparar Libros',  Icon: ArrowLeftRight,  path: 'comparar'     },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { id: 'config',       label: 'Configuración',    Icon: Settings2,       path: 'configuracion'},
      { id: 'help',         label: 'Ayuda',            Icon: HelpCircle,      path: 'help'         },
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

// Accent colors per group index for icons
const GROUP_ICON_COLOR = [
  'text-indigo-400',   // Dashboard
  'text-sky-400',      // Operaciones
  'text-emerald-400',  // Finanzas
  'text-sky-400',      // Equipo
  'text-violet-400',   // Inteligencia
  'text-slate-400',    // Sistema
];

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
  rolePermissions,
  badges = {},
  onLogout,
  onOpenProfile,
}) => {
  const location     = useLocation();
  const { empresa_id } = useParams();
  const navigate     = useNavigate();
  const { moduleHidden, moduleForced } = useVendor();

  const businessId = (config as any)?.companyName || '';
  const { subscription, trialDaysLeft, planDaysLeft, graceDaysLeft, inGracePeriod, isExpired } = useSubscription(businessId);

  // ── Sidebar collapse (icon-only mode) ──────────────────────────────────────
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dualis_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('dualis_sidebar_collapsed', String(next)); } catch { /* ignore */ }
  };

  // ── Group collapse (folder-style) ──────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('dualis_sidebar_groups');
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      try { localStorage.setItem('dualis_sidebar_groups', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Auto-open the group that contains the active item
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      const hasActive = group.items.some(item => item.id === activeTab);
      if (hasActive && collapsedGroups.has(group.id)) {
        setCollapsedGroups(prev => {
          const next = new Set(prev);
          next.delete(group.id);
          try { localStorage.setItem('dualis_sidebar_groups', JSON.stringify([...next])); } catch { /* ignore */ }
          return next;
        });
      }
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const base   = empresa_id ? `/${empresa_id}/admin` : '';
  const toPath = (p: string) => `${base}/${p}`;

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  const isVisible = (item: NavItem): boolean => {
    if (moduleHidden(item.id)) return false;
    if (item.id === 'help') return true;

    const modKey = moduleMap[item.id];
    if (modKey && (config as any).modules?.[modKey] === false && !moduleForced(item.id)) return false;
    if (item.id === 'comparar' && !canCompare && !moduleForced(item.id)) return false;

    if (isOwnerOrAdmin) return true;
    if (moduleForced(item.id)) return true;

    const role = user.role as keyof RolePermissions;
    if (rolePermissions && role in rolePermissions) {
      return rolePermissions[role][item.id as ModuleId] === true;
    }
    if (item.id === 'despacho' && (user.role === 'almacenista' || user.role === 'inventario')) return true;
    return item.id === 'cajas';
  };

  const roleLabel: Record<string, string> = {
    owner:       'Dueño',
    admin:       'Admin',
    ventas:      'Vendedor',
    auditor:     'Auditor',
    staff:       'Staff',
    member:      'Miembro',
    pending:     'Pendiente',
    almacenista: 'Almacenista',
    inventario:  'Jefe Inv.',
  };

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
          transition-all duration-300 ease-in-out
          lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          w-[260px] sm:w-[240px] ${collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]'}
          bg-[#070b14] relative
        `}
      >
        {/* Decorative layers */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none" />
        <div className="absolute right-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent pointer-events-none z-10" />
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

        {/* ── LOGO ──────────────────────────────────────────────────── */}
        <div
          className={`
            relative z-10 flex items-center border-b border-white/[0.06] shrink-0 h-[60px]
            ${collapsed ? 'lg:justify-center lg:px-0 px-4 justify-between' : 'px-4 justify-between'}
          `}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Dualis" className="w-8 h-8 rounded-xl object-contain shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-white font-black text-[14px] leading-none tracking-tight">Dualis</p>
                <p className="text-[8px] font-bold text-white/25 uppercase tracking-[0.18em] mt-0.5">Sistema ERP</p>
              </div>
            )}
          </div>
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

        {/* ── NAV ───────────────────────────────────────────────────── */}
        <nav
          className={`
            relative z-10 flex-1 overflow-y-auto custom-scroll py-3
            ${collapsed ? 'lg:flex lg:flex-col lg:items-center lg:px-2.5 px-2' : 'px-2'}
          `}
        >
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(isVisible);
            if (visibleItems.length === 0) return null;

            const iconColor      = GROUP_ICON_COLOR[gi] ?? 'text-white/50';
            const isGroupOpen    = !collapsedGroups.has(group.id);
            // Dashboard group has only 1 item and no collapsible header
            const isSimpleGroup  = group.items.length === 1;

            return (
              <div key={group.id} className={gi > 0 ? 'mt-1' : ''}>

                {/* ── Group header ── */}
                {collapsed ? (
                  // Icon-only mode: just a separator
                  gi > 0 && <div className="w-8 h-px bg-white/[0.06] my-2.5 shrink-0 mx-auto" />
                ) : isSimpleGroup ? (
                  // Single-item groups: static label
                  <div className={`${gi > 0 ? 'mt-3' : 'mt-0'} mb-1 px-2`}>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                      {group.label}
                    </p>
                  </div>
                ) : (
                  // Multi-item groups: clickable folder header
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`
                      w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg
                      hover:bg-white/[0.03] transition-all duration-150 group/gh
                      ${gi > 0 ? 'mt-2' : 'mt-0'}
                    `}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-px h-3 rounded-full bg-current opacity-30 ${iconColor}`} />
                      <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${isGroupOpen ? 'text-white/30' : 'text-white/20'} group-hover/gh:text-white/40 transition-colors`}>
                        {group.label}
                      </p>
                    </div>
                    <ChevronRight
                      size={10}
                      className={`text-white/15 group-hover/gh:text-white/30 transition-all duration-200 shrink-0 ${isGroupOpen ? 'rotate-90' : 'rotate-0'}`}
                    />
                  </button>
                )}

                {/* ── Group items (animated collapse) ── */}
                <div
                  className={`
                    overflow-hidden transition-all duration-200 ease-in-out
                    ${collapsed || isSimpleGroup || isGroupOpen
                      ? 'max-h-[500px] opacity-100'
                      : 'max-h-0 opacity-0'
                    }
                  `}
                >
                  {/* Indent line for expanded groups */}
                  {!collapsed && !isSimpleGroup && isGroupOpen && (
                    <div className="flex">
                      <div className="ml-[14px] mr-1 w-px bg-white/[0.05] rounded-full self-stretch my-0.5" />
                      <div className="flex-1 flex flex-col gap-0">
                        {visibleItems.map(item => (
                          <NavItemRow
                            key={item.id}
                            item={item}
                            href={toPath(item.path)}
                            isActive={activeTab === item.id || location.pathname === toPath(item.path)}
                            iconColor={iconColor}
                            badge={badges[item.id] ?? 0}
                            collapsed={false}
                            indented
                            onNavigate={() => setIsOpen(false)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No indent for simple groups or collapsed sidebar */}
                  {(collapsed || isSimpleGroup) && visibleItems.map(item => (
                    <NavItemRow
                      key={item.id}
                      item={item}
                      href={toPath(item.path)}
                      isActive={activeTab === item.id || location.pathname === toPath(item.path)}
                      iconColor={iconColor}
                      badge={badges[item.id] ?? 0}
                      collapsed={collapsed}
                      indented={false}
                      onNavigate={() => setIsOpen(false)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── BOTTOM ──────────────────────────────────────────────────── */}
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

          {/* License status badge */}
          {subscription && (() => {
            const isTrial       = subscription.status === 'trial' && !inGracePeriod && !isExpired;
            const isActivePaid  = subscription.status === 'active' && !inGracePeriod && !isExpired;
            const days          = inGracePeriod ? graceDaysLeft : isTrial ? trialDaysLeft : planDaysLeft;
            const planName      = subscription.plan === 'trial' ? 'Trial' : subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);
            const billingPath   = `/${empresa_id}/billing`;
            const theme         = isExpired || inGracePeriod ? 'rose' : isTrial ? 'amber' : 'emerald';

            if (collapsed) {
              return (
                <button
                  onClick={() => navigate(billingPath)}
                  title={`${planName} — ${days != null ? `${days}d` : ''}`}
                  className={`relative group w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
                    theme === 'rose' ? 'text-rose-400/60 hover:bg-rose-500/10'
                    : theme === 'amber' ? 'text-amber-400/60 hover:bg-amber-500/10'
                    : 'text-emerald-400/60 hover:bg-emerald-500/10'
                  }`}
                >
                  <CreditCard size={14} strokeWidth={1.8} />
                  {days != null && days <= 15 && (
                    <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[8px] font-black flex items-center justify-center ${
                      theme === 'rose' ? 'bg-rose-500 text-white animate-pulse'
                      : days <= 5 ? 'bg-rose-500 text-white'
                      : 'bg-amber-500 text-black'
                    }`}>
                      {days}
                    </span>
                  )}
                  <Tip>
                    {inGracePeriod ? `Gracia · ${days}d` : `Licencia ${planName}`}
                    {!inGracePeriod && days != null ? ` · ${days}d` : ''}
                  </Tip>
                </button>
              );
            }

            return (
              <button
                onClick={() => navigate(billingPath)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${
                  theme === 'rose'
                    ? 'bg-rose-500/[0.08] hover:bg-rose-500/[0.14] border border-rose-500/20'
                    : theme === 'amber'
                      ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.14] border border-amber-500/20'
                      : 'bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14] border border-emerald-500/20'
                }`}
              >
                {theme === 'rose'
                  ? <Zap size={13} className="text-rose-400 shrink-0" />
                  : theme === 'amber'
                    ? <Clock size={13} className="text-amber-400 shrink-0" />
                    : <CreditCard size={13} className="text-emerald-400 shrink-0" />}
                <div className="min-w-0 flex-1 text-left">
                  <p className={`text-[10px] font-black uppercase tracking-widest leading-none ${
                    theme === 'rose' ? 'text-rose-400'
                    : theme === 'amber' ? 'text-amber-400'
                    : 'text-emerald-400'
                  }`}>
                    {isExpired ? 'Bloqueado'
                      : inGracePeriod ? 'Período de gracia'
                      : isTrial ? 'Trial gratuito'
                      : `Plan ${planName}`}
                  </p>
                  <p className={`text-[9px] font-bold mt-0.5 ${
                    theme === 'rose' ? 'text-rose-400/50'
                    : theme === 'amber' ? 'text-amber-400/50'
                    : 'text-emerald-400/50'
                  }`}>
                    {isExpired ? 'Renueva para continuar'
                      : inGracePeriod && days != null
                        ? `${days} día${days !== 1 ? 's' : ''} antes de bloqueo`
                      : days != null
                        ? days === 0 ? 'Vence hoy' : `${days} día${days !== 1 ? 's' : ''} restante${days !== 1 ? 's' : ''}`
                        : isActivePaid ? 'Activo' : ''}
                  </p>
                </div>
              </button>
            );
          })()}

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
              {collapsed && (
                <span className="absolute -bottom-1 -right-1 px-1 py-px rounded bg-[#1a2235] border border-white/[0.08] text-[7px] font-black text-white/50 uppercase leading-none">
                  {(roleLabel[user.role] || user.role).slice(0, 3)}
                </span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[12px] font-black text-white/70 truncate leading-none">{user.name}</p>
                <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.15em] mt-0.5">
                  {roleLabel[user.role] || user.role}
                </p>
              </div>
            )}
            {collapsed && (
              <span className="pointer-events-none absolute left-[calc(100%+12px)] bottom-0 z-[200] flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-[#1a2235] border border-white/[0.08] shadow-2xl shadow-black/50 min-w-[140px] opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
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

// ─── NAV ITEM ROW (extracted for reuse) ───────────────────────────────────────
interface NavItemRowProps {
  item: NavItem;
  href: string;
  isActive: boolean;
  iconColor: string;
  badge: number;
  collapsed: boolean;
  indented: boolean;
  onNavigate: () => void;
}

const NavItemRow: React.FC<NavItemRowProps> = ({
  item, href, isActive, iconColor, badge, collapsed, indented, onNavigate,
}) => (
  <NavLink
    to={href}
    onClick={onNavigate}
    className={`
      relative group flex items-center rounded-xl transition-all duration-200 shrink-0
      ${collapsed
        ? 'lg:w-11 lg:h-11 lg:justify-center lg:my-0.5 gap-2.5 px-2.5 py-2 w-full mb-0.5'
        : `gap-2.5 px-2.5 py-2 w-full mb-0.5 ${indented ? 'pl-2.5' : ''}`
      }
      ${isActive
        ? 'bg-gradient-to-r from-indigo-600/[0.18] to-violet-600/[0.08] border border-indigo-500/[0.12] text-white'
        : `${iconColor} hover:bg-white/[0.05] hover:text-white`
      }
    `}
  >
    {isActive && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400 shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
    )}
    <span className="relative shrink-0">
      <item.Icon size={15} strokeWidth={isActive ? 2.2 : 1.7} className="relative z-10" />
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-20 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[8px] font-black leading-none shadow-[0_0_6px_rgba(244,63,94,0.5)]">
          {badge}
        </span>
      )}
    </span>
    <span className={`text-[12px] font-medium tracking-tight truncate relative z-10 transition-colors ${collapsed ? 'lg:hidden' : ''} ${isActive ? 'text-white' : ''}`}>
      {item.label}
    </span>
    {collapsed && (
      <span className="hidden lg:block">
        <span className="pointer-events-none absolute left-[calc(100%+12px)] z-[200] flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2235] border border-white/[0.08] text-white text-[11px] font-semibold tracking-wide whitespace-nowrap shadow-2xl shadow-black/50 opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 top-1/2 -translate-y-1/2">
          <ChevronRight size={9} className="text-indigo-400/60 shrink-0" />
          {item.label}
        </span>
      </span>
    )}
  </NavLink>
);

export default React.memo(Sidebar);
