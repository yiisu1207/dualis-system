import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  CalendarDays,
  Award,
  ShieldCheck,
  MessageCircle,
  Search,
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
  labelOverrides?: Record<string, string>;
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
      { id: 'cotizaciones', label: 'Cotizaciones',     Icon: FileText,        path: 'cotizaciones' },
      { id: 'recurrentes', label: 'Recurrentes',      Icon: Clock,           path: 'recurrentes'  },
      { id: 'transferencias',label: 'Transferencias',   Icon: ArrowLeftRight,  path: 'transferencias'},
      { id: 'tasas',        label: 'Tasas Cambiarias', Icon: TrendingUp,      path: 'tasas'        },
      { id: 'historial',    label: 'Libro Movimientos',Icon: History,         path: 'historial'    },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    items: [
      { id: 'clientes',     label: 'Deudores / CxC',   Icon: Wallet,          path: 'cobranzas'    },
      { id: 'cobranza',     label: 'Agenda Cobranza',  Icon: CalendarDays,    path: 'cobranza'     },
      { id: 'proveedores',  label: 'Gastos / CxP',     Icon: Receipt,         path: 'cxp'          },
      { id: 'tesoreria',    label: 'Tesorería',        Icon: Landmark,        path: 'tesoreria'    },
      { id: 'flujocaja',    label: 'Flujo de Caja',    Icon: TrendingUp,      path: 'flujocaja'    },
      { id: 'aprobaciones', label: 'Aprobaciones',     Icon: ShieldCheck,     path: 'aprobaciones' },
      { id: 'verificacion', label: 'Verificación',     Icon: ShieldCheck,     path: 'verificacion' },
      { id: 'reclamos',     label: 'Reclamos',         Icon: ClipboardCheck,  path: 'reclamos'     },
      { id: 'portalchat',   label: 'Chat Portal',      Icon: MessageCircle,   path: 'portalchat'   },
      { id: 'contabilidad', label: 'Contabilidad',     Icon: BookOpen,        path: 'contabilidad' },
      { id: 'conciliacion', label: 'Conciliación',     Icon: Landmark,        path: 'conciliacion' },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    items: [
      { id: 'rrhh',         label: 'RRHH / Nómina',    Icon: Users,           path: 'rrhh'         },
      { id: 'comisiones',   label: 'Comisiones',       Icon: Award,           path: 'comisiones'   },
      { id: 'sucursales',   label: 'Sucursales',       Icon: MapPin,          path: 'sucursales'   },
    ],
  },
  {
    id: 'inteligencia',
    label: 'Inteligencia',
    items: [
      { id: 'reportes',     label: 'Reportes',         Icon: BarChart3,       path: 'reportes'     },
      { id: 'estadisticas', label: 'Estadísticas',     Icon: BarChart3,       path: 'estadisticas' },
      { id: 'pareto',       label: 'Pareto 80/20',     Icon: BarChart3,       path: 'pareto'       },
      { id: 'rentabilidad', label: 'Rentabilidad',     Icon: TrendingUp,      path: 'rentabilidad' },
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

// Fase C.4 — Mapeo item → data-tour selector para el tour guiado
const TOUR_ATTR: Record<string, string> = {
  cajas:      'nav-pos',
  inventario: 'nav-inventario',
  clientes:   'nav-cxc',
  reportes:   'nav-reportes',
  config:     'topbar-config',
};

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

// Tinted header colors per group (subtle accent for labels)
const GROUP_HEADER_COLOR = [
  'text-indigo-500/30',  // Dashboard
  'text-sky-500/30',     // Operaciones
  'text-emerald-500/30', // Finanzas
  'text-sky-500/30',     // Equipo
  'text-violet-500/30',  // Inteligencia
  'text-white/20',       // Sistema (neutral)
];

// Dot accent colors for group headers
const GROUP_DOT_COLOR = [
  'bg-indigo-400/40',    // Dashboard
  'bg-sky-400/40',       // Operaciones
  'bg-emerald-400/40',   // Finanzas
  'bg-sky-400/40',       // Equipo
  'bg-violet-400/40',    // Inteligencia
  'bg-slate-400/30',     // Sistema
];

// Indent line gradient colors per group
const GROUP_INDENT_COLOR = [
  'from-indigo-400/20',  // Dashboard
  'from-sky-400/20',     // Operaciones
  'from-emerald-400/20', // Finanzas
  'from-sky-400/20',     // Equipo
  'from-violet-400/20',  // Inteligencia
  'from-slate-400/15',   // Sistema
];

// Separator gradient colors (via color between groups)
const GROUP_SEP_COLOR = [
  'via-indigo-500/15',   // Dashboard
  'via-sky-500/15',      // Operaciones
  'via-emerald-500/15',  // Finanzas
  'via-sky-500/15',      // Equipo
  'via-violet-500/15',   // Inteligencia
  'via-slate-500/10',    // Sistema
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
  labelOverrides = {},
  onLogout,
  onOpenProfile,
}) => {
  const location     = useLocation();
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

  // ── Swipe-to-close on mobile ────────────────────────────────────────────
  const touchStartX = useRef(0);
  const sidebarSwipeRef = useRef<HTMLElement>(null);
  const [swipeX, setSwipeX] = useState(0);
  const swiping = useRef(false);

  const handleSidebarTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    swiping.current = true;
  }, []);
  const handleSidebarTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < 0) setSwipeX(dx);
  }, []);
  const handleSidebarTouchEnd = useCallback(() => {
    swiping.current = false;
    if (swipeX < -80) setIsOpen(false);
    setSwipeX(0);
  }, [swipeX, setIsOpen]);

  // ── Inline search ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Recientes (last 4 visited pages) ──────────────────────────────────
  const allItems = NAV_GROUPS.flatMap(g => g.items);
  const [recientes, setRecientes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dualis_recientes') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    if (!activeTab || activeTab === 'resumen') return;
    setRecientes(prev => {
      const next = [activeTab, ...prev.filter(t => t !== activeTab)].slice(0, 4);
      try { localStorage.setItem('dualis_recientes', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [activeTab]);

  // ── Auto-close sidebar on resize past lg breakpoint ────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && isOpen) setIsOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [isOpen, setIsOpen]);

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

  const base   = '/admin';
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
        ref={sidebarSwipeRef}
        data-tour="sidebar"
        onTouchStart={handleSidebarTouchStart}
        onTouchMove={handleSidebarTouchMove}
        onTouchEnd={handleSidebarTouchEnd}
        style={swipeX < 0 ? { transform: `translateX(${swipeX}px)`, transition: swiping.current ? 'none' : undefined } : undefined}
        className={`
          fixed lg:static top-0 left-0 h-full z-50 flex flex-col overflow-hidden
          transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          w-[280px] sm:w-[260px] ${collapsed ? 'lg:w-[72px]' : 'lg:w-[230px]'}
          bg-gradient-to-b from-[#0c1322] via-[#070b14] to-[#0a0f1a] relative
        `}
      >
        {/* Decorative layers */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none" />
        <div className="absolute right-0 inset-y-0 w-px bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent pointer-events-none z-10" />
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-600/[0.12] rounded-full blur-3xl pointer-events-none" />

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
                <p className="text-white font-black text-[15px] leading-none tracking-tight">Dualis</p>
                <p className="text-[9px] font-bold text-indigo-400/40 uppercase tracking-[0.18em] mt-0.5">Sistema ERP</p>
                <div className="h-0.5 w-10 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full mt-1.5" />
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              className="w-6 h-6 rounded-lg bg-indigo-500/[0.08] hover:bg-indigo-500/[0.15] text-white/20 hover:text-white/60 flex items-center justify-center transition-all shrink-0"
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
          {/* ── Inline search ── */}
          {!collapsed && (
            <div className="px-1 mb-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo..."
                  className="w-full pl-7 pr-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[11px] text-white placeholder:text-white/20 focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500/30 outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* ── Recientes ── */}
          {!collapsed && !searchQuery && recientes.length > 0 && (
            <div className="mb-1">
              <div className="px-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-amber-400/40" />
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500/30">Recientes</p>
                </div>
              </div>
              {recientes.map(tabId => {
                const item = allItems.find(it => it.id === tabId);
                if (!item || !isVisible(item)) return null;
                const gIdx = NAV_GROUPS.findIndex(g => g.items.some(i => i.id === tabId));
                const iColor = GROUP_ICON_COLOR[gIdx] ?? 'text-white/50';
                return (
                  <NavItemRow
                    key={`recent-${item.id}`}
                    item={item}
                    href={toPath(item.path)}
                    isActive={activeTab === item.id}
                    iconColor={iColor}
                    badge={badges[item.id] ?? 0}
                    collapsed={false}
                    indented={false}
                    onNavigate={() => setIsOpen(false)}
                  />
                );
              })}
              <div className="mx-3 my-2 h-px bg-gradient-to-r from-transparent via-amber-500/10 to-transparent" />
            </div>
          )}

          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items
              .filter(isVisible)
              .filter(it => !searchQuery || it.label.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(it => labelOverrides[it.id] ? { ...it, label: labelOverrides[it.id] } : it);
            if (visibleItems.length === 0) return null;

            const iconColor       = GROUP_ICON_COLOR[gi] ?? 'text-white/50';
            const groupBadgeCount = visibleItems.reduce((sum, it) => sum + (badges[it.id] ?? 0), 0);
            const isGroupOpen     = !collapsedGroups.has(group.id);
            // Dashboard group has only 1 item and no collapsible header
            const isSimpleGroup   = group.items.length === 1;

            return (
              <div key={group.id} className={gi > 0 ? 'mt-1' : ''}>

                {/* ── Group header ── */}
                {collapsed ? (
                  // Icon-only mode: separator with group color
                  gi > 0 && <div className={`w-8 h-px bg-gradient-to-r from-transparent ${GROUP_SEP_COLOR[gi] || 'via-white/10'} to-transparent my-2.5 shrink-0 mx-auto`} />
                ) : isSimpleGroup ? (
                  // Single-item groups: static label with accent
                  <div className={`${gi > 0 ? 'mt-3' : 'mt-0'} mb-1 px-2`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${GROUP_DOT_COLOR[gi] || 'bg-white/20'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${GROUP_HEADER_COLOR[gi] || 'text-white/20'}`}>
                        {group.label}
                      </p>
                    </div>
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
                      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${isGroupOpen ? 'scale-125' : 'scale-100'} ${groupBadgeCount > 0 ? 'bg-rose-400/70 animate-pulse shadow-[0_0_6px_rgba(244,63,94,0.4)]' : GROUP_DOT_COLOR[gi] || 'bg-white/20'}`} />
                      <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isGroupOpen ? GROUP_HEADER_COLOR[gi]?.replace('/30', '/50') || 'text-white/40' : GROUP_HEADER_COLOR[gi] || 'text-white/20'} group-hover/gh:text-white/40 transition-colors`}>
                        {group.label}
                      </p>
                      {groupBadgeCount > 0 && !isGroupOpen && (
                        <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500/15 text-rose-400 text-[8px] font-black flex items-center justify-center animate-pulse">
                          {groupBadgeCount}
                        </span>
                      )}
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
                      <div className={`ml-[14px] mr-1 w-px rounded-full self-stretch my-0.5 bg-gradient-to-b ${GROUP_INDENT_COLOR[gi] || 'from-white/10'} to-transparent`} />
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
            const billingPath   = '/billing';
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
            <LogOut size={15} strokeWidth={1.8} className="shrink-0" />
            {!collapsed && <span className="text-[13px] font-medium">Cerrar sesión</span>}
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
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white font-black text-[12px] select-none shadow-[0_0_12px_rgba(245,158,11,0.3)] ring-2 ring-emerald-500/50">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#070b14]" />
              {collapsed && (
                <span className="absolute -bottom-1 -right-1 px-1 py-px rounded bg-[#1a2235] border border-white/[0.08] text-[7px] font-black text-white/50 uppercase leading-none">
                  {(roleLabel[user.role] || user.role).slice(0, 3)}
                </span>
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-black text-white/70 truncate leading-none">{user.name}</p>
                <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em] mt-0.5">
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
    data-tour={TOUR_ATTR[item.id] || undefined}
    onClick={onNavigate}
    className={`
      relative group flex items-center rounded-xl transition-all duration-200 shrink-0
      ${collapsed
        ? 'lg:w-11 lg:h-11 lg:justify-center lg:my-0.5 gap-2.5 px-2.5 py-2 w-full mb-0.5'
        : `gap-2.5 px-2.5 py-2 w-full mb-0.5 ${indented ? 'pl-2.5' : ''}`
      }
      ${isActive
        ? 'bg-gradient-to-r from-indigo-600/[0.22] to-violet-600/[0.10] border border-indigo-500/[0.15] text-white'
        : `${iconColor} hover:bg-white/[0.07] hover:text-white hover:pl-3 ${badge > 0 ? 'bg-rose-500/[0.04]' : ''}`
      }
    `}
  >
    {isActive && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400 shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
    )}
    {!isActive && badge > 0 && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-r-full bg-rose-400/50 animate-pulse" />
    )}
    <span className="relative shrink-0">
      <item.Icon size={15} strokeWidth={isActive ? 2.2 : 1.7} className="relative z-10" />
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 z-20 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[8px] font-black leading-none shadow-[0_0_6px_rgba(244,63,94,0.5)]">
          {badge}
        </span>
      )}
    </span>
    <span className={`text-[13px] font-medium tracking-tight truncate relative z-10 transition-colors ${collapsed ? 'lg:hidden' : ''} ${isActive ? 'text-white' : ''}`}>
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
