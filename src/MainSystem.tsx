import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Customer,
  Movement,
  User,
  Supplier,
  PendingMovement,
  ApprovalConfig,
} from '../types';
import {
  decideQuorum,
  countValidators,
  DEFAULT_APPROVAL_CONFIG,
  canApprovePending,
  ValidatorUser,
} from './utils/approvalHelpers';

import { useAuth } from './context/AuthContext';
import { useRates } from './context/RatesContext';
import { useToast } from './context/ToastContext';
import { useBusinessData } from './hooks/useBusinessData';
import { useRolePermissions } from './hooks/useRolePermissions';
import { useVendor } from './context/VendorContext';
import { getCustomization } from './customizations/index';
import { fireWebhook } from './utils/webhookTrigger';
import { useTranslation } from 'react-i18next';
import { useWidgetManager } from './context/WidgetContext';

// COMPONENTES
import Sidebar from './components/Sidebar';
import AdminDashboard from './features/admin/AdminDashboard';
import Configuracion from './pages/Configuracion';
// AccountingSection (legacy, ~2400 líneas) reemplazado por ReportesContables
// 2026-04-24. El tab 'contabilidad' ahora abre el dashboard ejecutivo nuevo
// (P&L 6m, semáforos, alertas, aging, top deudores, nómina próxima, etc.).
const ReportesContables = lazy(() => import('./pages/ReportesContables'));
import SupplierSection from './components/SupplierSection';
import RecursosHumanos from './pages/RecursosHumanos';
const ComisionesReporte = lazy(() => import('./pages/ComisionesReporte'));
const Tesoreria = lazy(() => import('./pages/Tesoreria'));
import Inventario from './pages/Inventario';
const BooksComparePanel = lazy(() => import('./components/BooksComparePanel'));
import UserProfileModalComp from './components/UserProfileModal';
import CxCPage from './pages/CxCPage';
import CxPPage from './pages/CxPPage';
import AgendaCobranza from './pages/AgendaCobranza';
import PortalChatAdmin from './pages/PortalChatAdmin';
import { countPendingReminders, calculateReminders } from './utils/reminderEngine';
import DataImporter from './components/DataImporter';
import SmartCalculatorWidget from './components/SmartCalculatorWidget';
import HelpCenter from './components/HelpCenter';
import WidgetLaunchpad from './components/WidgetLaunchpad';
import AdminPosManager from './pages/AdminPosManager';
import DespachoPanel from './pages/DespachoPanel';
const QuotesPanel = lazy(() => import('./pages/QuotesPanel'));
const RecurringBillingPanel = lazy(() => import('./pages/RecurringBillingPanel'));
const CashFlowPanel = lazy(() => import('./pages/CashFlowPanel'));
const ParetoPanel = lazy(() => import('./pages/ParetoPanel'));
const Estadisticas = lazy(() => import('./pages/Estadisticas'));
const TransferenciasPanel = lazy(() => import('./pages/TransferenciasPanel'));
const RentabilidadPage = lazy(() => import('./pages/RentabilidadPage'));
const SucursalesManager = lazy(() => import('./pages/SucursalesManager'));
import TrialBanner from './components/TrialBanner';
import NotificationCenter from './components/NotificationCenter';
import ReportesSection from './components/ReportesSection';
const Conciliacion = lazy(() => import('./pages/Conciliacion'));
import LibroVentasSection from './components/LibroVentasSection';
import PaymentRequestsPanel from './components/PaymentRequestsPanel';
const DisputesPanel = lazy(() => import('./components/DisputesPanel'));
import ExchangeRatesSection from './components/ExchangeRatesSection';
import GlobalSearchPalette from './components/GlobalSearchPalette';
import KeyboardShortcutsOverlay from './components/KeyboardShortcutsOverlay';
import QuickActionsFAB from './components/QuickActionsFAB';

// WIDGETS
import RateConverterWidget from './components/RateConverterWidget';
import PriceCheckerWidget from './components/PriceCheckerWidget';
import SpeedDialWidget from './components/SpeedDialWidget';

// FIREBASE
import { auth, db } from './firebase/config';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import { applyLoyaltyForMovement } from './utils/loyaltyEngine';
import { sendOverduePaymentsDigest, sendBirthdayEmail } from './utils/emailService';
import { Bell, HelpCircle, Lock, ArrowRight, Zap, Menu, Search as SearchIcon } from 'lucide-react';
import { logAudit } from './utils/auditLogger';
import ModeToggle from './components/ModeToggle';
import HelpPanel from './components/HelpPanel';
import { useSubscription } from './hooks/useSubscription';
import LegalDisclaimerModal from './components/LegalDisclaimerModal';
import OfflineBanner from './components/OfflineBanner';
import SessionLockOverlay from './components/SessionLockOverlay';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { useKeyboardFix } from './hooks/useKeyboardFix';
import { useDriverTour } from './components/DriverTour';

// ── Topbar ─────────────────────────────────────────────────────────────────────
const Topbar: React.FC<{
  topbarTitle: string;
  breadcrumbGroup?: string;
  notifCount: number;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onOpenCalculator: () => void;
  onOpenHelp: () => void;
  onOpenSearch: () => void;
  onToggleSidebar: () => void;
  bcvRate: number;
  customRates?: { id: string; name: string; value: number }[];
  usingStaleRate?: boolean;
  lastUpdated?: string;
  onRefreshRate?: () => void;
  lastSyncAt?: number;
}> = React.memo(({ topbarTitle, breadcrumbGroup, notifCount, showNotifications, onToggleNotifications, onOpenCalculator, onOpenHelp, onOpenSearch, onToggleSidebar, bcvRate, customRates, usingStaleRate, lastUpdated, onRefreshRate, lastSyncAt }) => (
  <header className="h-14 md:h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.08] px-3 md:px-7 flex items-center justify-between sticky top-0 z-50 transition-colors">
    <div className="flex items-center gap-2 md:gap-3 min-w-0">
      {/* Hamburger menu — mobile only */}
      <button
        onClick={onToggleSidebar}
        className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.07] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300 lg:hidden shrink-0"
      >
        <Menu size={18} />
      </button>

      <div className="min-w-0">
        <div className="font-syne font-bold text-[15px] md:text-[17px] text-slate-900 dark:text-white leading-tight capitalize truncate">{topbarTitle}</div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
          <span>Dualis</span>
          <span className="text-slate-200 dark:text-white/10">/</span>
          {breadcrumbGroup && (
            <>
              <span className="text-slate-400 dark:text-white/25">{breadcrumbGroup}</span>
              <span className="text-slate-200 dark:text-white/10">/</span>
            </>
          )}
          <span className="text-slate-500 dark:text-slate-400 capitalize">{topbarTitle.toLowerCase()}</span>
          {lastSyncAt && (
            <span
              className="ml-2 flex items-center gap-1 text-[9px] text-emerald-500/60"
              title={`Sincronizado: ${new Date(lastSyncAt).toLocaleTimeString('es-VE')}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden md:inline">En vivo</span>
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
      <div
        className={`flex items-center gap-2 md:gap-3 border rounded-xl px-2.5 md:px-4 py-1.5 ${
          usingStaleRate
            ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300/60 dark:border-amber-500/30 cursor-pointer'
            : 'bg-slate-50 dark:bg-white/[0.05] border-slate-200/60 dark:border-white/10'
        }`}
        onClick={usingStaleRate ? onRefreshRate : undefined}
        title={usingStaleRate ? `Usando tasa del ${lastUpdated ? new Date(lastUpdated).toLocaleDateString('es-VE') : '?'}. Click para reintentar.` : `Tasa actualizada hoy`}
      >
        <div className={`w-2 h-2 rounded-full hidden sm:block shrink-0 ${usingStaleRate ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
        <div className="flex flex-col">
          <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-tighter leading-none ${usingStaleRate ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
            BCV{usingStaleRate ? ' ⚠' : ''}
          </span>
          <span className="text-[12px] md:text-[13px] font-mono font-bold text-amber-600 dark:text-amber-400">Bs. {bcvRate.toFixed(2)}</span>
        </div>
        {customRates?.filter(cr => cr.value > 0).map(cr => (
          <React.Fragment key={cr.id}>
            <span className="w-px h-5 bg-slate-200 dark:bg-white/10 hidden md:block" />
            <div className="flex-col hidden md:flex">
              <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400 dark:text-slate-500 leading-none">{cr.name}</span>
              <span className="text-[12px] font-mono font-bold text-violet-600 dark:text-violet-400">Bs. {cr.value.toFixed(2)}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="w-px h-8 bg-slate-100 dark:bg-white/[0.08] mx-0.5 md:mx-1 hidden sm:block" />

      <button
        onClick={onOpenSearch}
        data-tour="topbar-search"
        title="Búsqueda global (Ctrl+K)"
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/10 text-slate-400 dark:text-white/30 hover:bg-white dark:hover:bg-white/10 hover:border-indigo-200 hover:text-indigo-500 transition-all"
      >
        <SearchIcon size={14} />
        <span className="text-[11px] font-bold">Buscar</span>
        <span className="ml-1 text-[9px] font-mono font-black px-1.5 py-0.5 rounded-md bg-slate-200/60 dark:bg-white/[0.08] text-slate-500 dark:text-white/40">
          Ctrl+K
        </span>
      </button>

      <span className="hidden sm:block"><ModeToggle /></span>

      <button
        onClick={onToggleNotifications}
        className={`relative w-9 h-9 md:w-10 md:h-10 rounded-xl border flex items-center justify-center transition-all ${
          showNotifications
            ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-[#4f6ef7]'
            : 'bg-slate-50 dark:bg-white/[0.05] border-slate-100 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:border-blue-200 hover:text-blue-600'
        }`}
      >
        <Bell size={16} />
        {notifCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
            {notifCount > 9 ? '9+' : notifCount}
          </span>
        )}
      </button>

      <button
        onClick={onOpenCalculator}
        className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:border-blue-200 hover:text-blue-600 transition-all font-mono text-sm font-bold hidden sm:flex"
      >
        =
      </button>

      <button
        onClick={onOpenHelp}
        title="Ayuda y tutoriales"
        className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10 hover:border-violet-300 hover:text-violet-500 transition-all hidden sm:flex"
      >
        <HelpCircle size={16} />
      </button>
    </div>
  </header>
));

// ── Confirm Dialog ─────────────────────────────────────────────────────────────
interface ConfirmState {
  message: string;
  onConfirm: () => Promise<void>;
}

const ConfirmDialog: React.FC<{ state: ConfirmState; onClose: () => void }> = ({ state, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl dark:shadow-black/40 border border-slate-100 dark:border-white/[0.08] max-w-sm w-full p-8 animate-in zoom-in-95">
      <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6">{state.message}</h3>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3.5 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
          Cancelar
        </button>
        <button
          onClick={async () => { await state.onConfirm(); onClose(); }}
          className="flex-1 py-3.5 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
);

// ── NoAccess ───────────────────────────────────────────────────────────────────
const NoAccess: React.FC = () => (
  <div className="h-full flex items-center justify-center p-12">
    <div className="max-w-sm w-full text-center">
      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center">
        <Lock size={24} className="text-slate-400 dark:text-white/30" />
      </div>
      <h2 className="text-lg font-black text-slate-700 dark:text-white/70 mb-2">Acceso Restringido</h2>
      <p className="text-sm text-slate-400 dark:text-white/30">No tienes permisos para ver esta sección. Contacta al administrador de tu espacio de trabajo.</p>
    </div>
  </div>
);

// ── LockedModule ───────────────────────────────────────────────────────────────
const PLAN_LABELS: Record<string, { name: string; color: string }> = {
  starter:    { name: 'Starter',    color: 'from-sky-500 to-blue-600' },
  negocio:    { name: 'Negocio',    color: 'from-indigo-500 to-violet-600' },
  enterprise: { name: 'Enterprise', color: 'from-violet-500 to-purple-600' },
};

const LockedModule: React.FC<{ moduleName: string; requiredPlan?: string; isAddon?: boolean }> = ({
  moduleName, requiredPlan = 'negocio', isAddon = false,
}) => {
  const navigate = useNavigate();
  const { name, color } = PLAN_LABELS[requiredPlan] ?? PLAN_LABELS.negocio;
  return (
    <div className="h-full flex items-center justify-center p-12">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br ${color} flex items-center justify-center shadow-2xl shadow-indigo-500/20`}>
          <Lock size={32} className="text-white" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
          {moduleName}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {isAddon
            ? `Este módulo es un add-on premium. Actívalo desde tu panel de suscripción.`
            : `Este módulo está disponible desde el plan `}
          {!isAddon && (
            <span className={`font-black bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{name}</span>
          )}
          {!isAddon && '.'}
        </p>

        {/* Plan badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r ${color} text-white text-xs font-black uppercase tracking-widest mb-8 shadow-lg`}>
          <Zap size={12} className="fill-white" />
          {isAddon ? 'Add-on disponible' : `Plan ${name}`}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate('/billing')}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r ${color} text-white text-sm font-black shadow-lg hover:-translate-y-0.5 transition-all`}
          >
            Ver planes <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MainSystem ─────────────────────────────────────────────────────────────────
const MainSystem: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const { user: firebaseUser, userProfile, updateUserProfile, isolationMode } = useAuth();
  const { rates, customRates, updateRates, usingStaleRate, forceRefreshBCV } = useRates();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const widgetManager = useWidgetManager();

  const adminBase = '/admin';

  const [activeTab, setActiveTab] = useState<string>(initialTab || 'resumen');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  // Timeout configurable (minutos). 0 = nunca. Default 15 min.
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(15);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  const [pendingCompareCount, setPendingCompareCount] = useState(0);
  const [pendingProductsCount, setPendingProductsCount] = useState(0);
  const [overduePaymentsCount, setOverduePaymentsCount] = useState(0);
  // ── Feature 7: Live sync indicator ──
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const touchSync = useCallback(() => setLastSyncAt(Date.now()), []);
  // Fase D.0 — Quórum de aprobación CxC/CxP
  const [approvalConfig, setApprovalConfig] = useState<ApprovalConfig>(DEFAULT_APPROVAL_CONFIG);
  const [pendingMovementsList, setPendingMovementsList] = useState<PendingMovement[]>([]);
  const [businessUsersList, setBusinessUsersList] = useState<ValidatorUser[]>([]);
  const approvalLocks = useRef(new Set<string>());
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dualis_dismissed_notifs');
      if (!raw) return new Set<string>();
      const arr: string[] = JSON.parse(raw);
      // Limpiar dismissed IDs viejos de pending-approvals (ahora usan IDs dinámicos)
      const cleaned = arr.filter(id => !id.startsWith('pending-approvals'));
      if (cleaned.length !== arr.length) {
        localStorage.setItem('dualis_dismissed_notifs', JSON.stringify(cleaned));
      }
      return new Set(cleaned);
    } catch { return new Set<string>(); }
  });

  const user: User | null = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      username: firebaseUser.email || 'user',
      name: userProfile?.displayName || userProfile?.fullName || firebaseUser.displayName || 'Admin',
      role: userProfile?.role || 'admin',
    };
  }, [firebaseUser, userProfile]);

  const businessId = userProfile?.businessId || '';
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const { canAccess, subscription: subData, markBonusSeen } = useSubscription(businessId);
  const { runAndMark: runTourAndMark } = useDriverTour(firebaseUser?.uid);

  // Fase C.4 — Auto-dispatch del tour guiado en el primer login post-onboarding
  useEffect(() => {
    if (!firebaseUser?.uid || !userProfile) return;
    if ((userProfile as any).tourCompleted) return;
    if (!(userProfile as any).onboardingCompleted) return;
    // Pequeño delay para que el DOM (sidebar, topbar) esté montado
    const t = setTimeout(() => { void runTourAndMark(); }, 1200);
    return () => clearTimeout(t);
  }, [firebaseUser?.uid, userProfile, runTourAndMark]);

  const {
    permissions: rolePermissions,
    canView: canViewRole,
    capabilities: roleCapabilities,
    can: canCapability,
  } = useRolePermissions(businessId, user?.role || 'member');
  const { moduleHidden, moduleForced, featureOverride, webhookUrl } = useVendor();

  // Per-business code customization (registry-based, zero impact on other businesses)
  const customization = useMemo(() => getCustomization(businessId), [businessId]);

  // canView = role permission AND not vendor-hidden (vendor-forced overrides both)
  const canView = (moduleId: Parameters<typeof canViewRole>[0]) => {
    if (moduleHidden(moduleId)) return false;
    if (moduleForced(moduleId)) return true;
    return canViewRole(moduleId);
  };

  // ── Data via hook (replaces 6 individual listeners) ──────────────────────────
  const { customers, suppliers, movements, employees, advances, payrollHistory, inventoryItems } = useBusinessData(businessId);

  // ── Tab routing ──────────────────────────────────────────────────────────────
  const tabRoutes: Record<string, string> = useMemo(() => ({
    resumen:       `${adminBase}/dashboard`,
    clientes:      `${adminBase}/cobranzas`,
    contabilidad:  `${adminBase}/contabilidad`,
    proveedores:   `${adminBase}/cxp`,
    rrhh:          `${adminBase}/rrhh`,
    comisiones:    `${adminBase}/comisiones`,
    inventario:    `${adminBase}/inventario`,
    reportes:      `${adminBase}/reportes`,
    widgets:       `${adminBase}/widgets`,
    comparar:      `${adminBase}/comparar`,
    tasas:         `${adminBase}/tasas`,
    conciliacion:  `${adminBase}/conciliacion`,
    cajas:         `${adminBase}/cajas`,
    despacho:      `${adminBase}/despacho`,
    sucursales:    `${adminBase}/sucursales`,
    fiscal:        `${adminBase}/fiscal`,
    reclamos:      `${adminBase}/reclamos`,
    libroventas:   `${adminBase}/libroventas`,
    tesoreria:     `${adminBase}/tesoreria`,
    cobranza:      `${adminBase}/cobranza`,
    portalchat:    `${adminBase}/portalchat`,
    verificacion:  `${adminBase}/verificacion`,
    config:        `${adminBase}/configuracion`,
    help:          `${adminBase}/help`,
  }), [adminBase]);

  useEffect(() => {
    const path = location.pathname;
    for (const [tab, route] of Object.entries(tabRoutes)) {
      if (path === route || path.startsWith(route + '/')) {
        setActiveTab(tab);
        break;
      }
    }
  }, [location.pathname, tabRoutes]);

  const goTab = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tabRoutes[tab]) navigate(tabRoutes[tab]);
  }, [navigate, tabRoutes]);

  // ── Navigation shortcuts: Alt+<key> for quick module access ─────────────────
  // Customizable from Configuración → Atajos. Stored in businessConfigs.navShortcuts
  // as Record<tab, key>. Defaults below apply when not overridden.
  const DEFAULT_NAV_SHORTCUTS: Array<{ key: string; tab: string; label: string }> = useMemo(() => [
    { key: '1', tab: 'resumen',    label: 'Dashboard' },
    { key: '2', tab: 'inventario', label: 'Inventario' },
    { key: '3', tab: 'cajas',     label: 'Ventas / Cajas' },
    { key: '4', tab: 'clientes',  label: 'CxC' },
    { key: '5', tab: 'tesoreria', label: 'Tesorería' },
    { key: '6', tab: 'despacho',  label: 'Despacho' },
    { key: '7', tab: 'reportes',  label: 'Reportes' },
    { key: '8', tab: 'rrhh',     label: 'RRHH' },
    { key: '9', tab: 'config',   label: 'Configuración' },
  ], []);

  const [navShortcutOverrides, setNavShortcutOverrides] = useState<Record<string, string>>({});

  const NAV_SHORTCUTS = useMemo(() => {
    return DEFAULT_NAV_SHORTCUTS.map(s => ({
      ...s,
      key: (navShortcutOverrides[s.tab] || s.key).toString(),
    }));
  }, [DEFAULT_NAV_SHORTCUTS, navShortcutOverrides]);

  // Build shortcutHints map for Sidebar display: { resumen: 'Alt+1', ... }
  const shortcutHints = useMemo(() => {
    const map: Record<string, string> = {};
    NAV_SHORTCUTS.forEach(s => {
      if (s.key) map[s.tab] = `Alt+${s.key.toUpperCase()}`;
    });
    return map;
  }, [NAV_SHORTCUTS]);

  // ── Global hotkeys: Ctrl+K (search), ? (shortcuts overlay), Ctrl+L (lock), Alt+N (nav) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K → búsqueda global
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
        return;
      }
      // Ctrl+L / Cmd+L → bloquear sesión (sin cerrar Firebase auth)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        setSessionLocked(true);
        return;
      }
      // Alt+<key> → navegación rápida a módulos (personalizable desde Configuración)
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const pressed = e.key.toLowerCase();
        const sc = NAV_SHORTCUTS.find(s => s.key && s.key.toLowerCase() === pressed);
        if (sc) {
          e.preventDefault();
          goTab(sc.tab);
          return;
        }
      }
      // "?" (Shift+/) → overlay de atajos — solo si no estás escribiendo en un input
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable;
        if (!isEditable) {
          e.preventDefault();
          setShortcutsOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [NAV_SHORTCUTS, goTab]);

  // ── Fase A.7: Leer timeout de sesión desde businessConfigs (one-time read) ──
  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, 'businessConfigs', businessId)).then((snap) => {
      touchSync();
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const raw = data?.securityConfig?.sessionTimeoutMinutes;
      if (typeof raw === 'number' && raw >= 0) {
        setSessionTimeoutMinutes(raw);
      }
      const cfg = data?.approvalConfig;
      if (cfg && typeof cfg === 'object') {
        setApprovalConfig({ ...DEFAULT_APPROVAL_CONFIG, ...cfg });
      } else {
        setApprovalConfig(DEFAULT_APPROVAL_CONFIG);
      }
      const ns = data?.navShortcuts;
      if (ns && typeof ns === 'object') {
        const clean: Record<string, string> = {};
        Object.keys(ns).forEach(k => {
          const v = ns[k];
          if (typeof v === 'string' && v.length === 1) clean[k] = v;
        });
        setNavShortcutOverrides(clean);
      } else {
        setNavShortcutOverrides({});
      }
    }).catch(() => {});

    // Escuchar cambios de approvalConfig hechos desde Configuración
    const handleApprovalChange = (e: Event) => {
      const cfg = (e as CustomEvent).detail;
      if (cfg && typeof cfg === 'object') {
        setApprovalConfig({ ...DEFAULT_APPROVAL_CONFIG, ...cfg });
      }
    };
    window.addEventListener('approvalConfigChanged', handleApprovalChange);
    return () => window.removeEventListener('approvalConfigChanged', handleApprovalChange);
  }, [businessId]);

  // ── Fase A.7: Auto-lock por inactividad ──────────────────────────────────────
  const idleMs = sessionTimeoutMinutes > 0 ? sessionTimeoutMinutes * 60 * 1000 : 0;
  useIdleTimeout(
    idleMs,
    () => setSessionLocked(true),
    !!firebaseUser && !sessionLocked && idleMs > 0
  );

  // ── Mobile keyboard fix (iOS virtual keyboard covering inputs) ───────────────
  useKeyboardFix();

  // ── Listener: solicitudes pendientes de unirse al equipo ─────────────────────
  useEffect(() => {
    const role = userProfile?.role;
    if (!businessId || (role !== 'owner' && role !== 'admin')) return;
    const q = query(
      collection(db, 'users'),
      where('businessId', '==', businessId),
      where('status', '==', 'PENDING_APPROVAL')
    );
    const unsub = onSnapshot(q, snap => { touchSync(); setPendingJoinCount(snap.size); });
    return unsub;
  }, [businessId, userProfile?.role]);

  // ── Listener: productos pendientes de revisión (almacenista) ────────────────────
  useEffect(() => {
    const role = userProfile?.role;
    if (!businessId || (role !== 'owner' && role !== 'admin' && role !== 'inventario')) return;
    const q = query(
      collection(db, `businesses/${businessId}/products`),
      where('status', '==', 'pending_review')
    );
    const unsub = onSnapshot(q, snap => { touchSync(); setPendingProductsCount(snap.size); });
    return unsub;
  }, [businessId, userProfile?.role]);

  // ── Listener: pagos de portal pendientes >24h (badge Tesorería + digest) ───
  useEffect(() => {
    const role = userProfile?.role;
    if (!businessId || (role !== 'owner' && role !== 'admin')) return;
    const q = query(
      collection(db, `businesses/${businessId}/portalPayments`),
      where('status', '==', 'pending')
    );
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const unsub = onSnapshot(q, snap => {
      const now = Date.now();
      const overdue = snap.docs.filter(d => {
        const data = d.data() as any;
        const created = new Date(data.createdAt || 0).getTime();
        return now - created >= ONE_DAY_MS;
      });
      setOverduePaymentsCount(overdue.length);
    });
    return unsub;
  }, [businessId, userProfile?.role]);

  // ── Fase D.0: listener de pendingMovements del negocio ─────────────────────
  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, `businesses/${businessId}/pendingMovements`));
    const unsub = onSnapshot(q, snap => {
      touchSync();
      const list: PendingMovement[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setPendingMovementsList(list);
    }, () => { /* ignore */ });
    return () => unsub();
  }, [businessId]);

  // ── Fase D.0: listener de usuarios del negocio (para contar validadores) ──
  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'users'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, snap => {
      const list: ValidatorUser[] = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          uid: d.id,
          name: data.displayName || data.fullName,
          email: data.email,
          role: data.role,
        };
      });
      setBusinessUsersList(list);
    }, () => { /* ignore */ });
    return () => unsub();
  }, [businessId]);

  // ── One-shot: digest diario al primer login admin del día (Opción A K.3) ───
  useEffect(() => {
    const role = userProfile?.role;
    if (!businessId || (role !== 'owner' && role !== 'admin')) return;
    if (!userProfile?.email) return;
    let cancelled = false;

    const run = async () => {
      try {
        const cfgRef = doc(db, 'businessConfigs', businessId);
        const cfgSnap = await getDoc(cfgRef);
        const cfg = cfgSnap.exists() ? cfgSnap.data() as any : {};
        if (cfg.notifyOverduePayments === false) return;

        const lastSent = cfg.lastDigestSent ? new Date(cfg.lastDigestSent).getTime() : 0;
        const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
        if (lastSent >= todayMidnight.getTime()) return;

        // Buscar pagos pendientes >24h
        const pendingQ = query(
          collection(db, `businesses/${businessId}/portalPayments`),
          where('status', '==', 'pending')
        );
        const snap = await getDocs(pendingQ);
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const overdue = snap.docs
          .map(d => d.data() as any)
          .filter((data) => now - new Date(data.createdAt || 0).getTime() >= ONE_DAY_MS);

        if (cancelled || overdue.length === 0) return;

        await sendOverduePaymentsDigest(userProfile.email!, {
          count: overdue.length,
          businessName: (userProfile as any)?.businessName || 'tu negocio',
          list: overdue.slice(0, 10).map((p: any) => ({
            customerName: p.customerName || 'Cliente',
            amount: Number(p.amount || 0),
            createdAt: p.createdAt,
          })),
        });

        await setDoc(cfgRef, { lastDigestSent: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[Digest] failed:', err);
      }
    };

    // Delay 3s para no competir con login flow
    const t = setTimeout(run, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [businessId, userProfile?.role, userProfile?.email]);


  // ── F.7 Birthday auto-greeting (cron-less, runs once per day per mount) ──────
  useEffect(() => {
    const bName = (userProfile as any)?.businessName || 'Tu negocio';
    if (!businessId || !customers.length) return;
    const today = new Date();
    const todayMMDD = (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
    const thisYear = today.getFullYear();

    customers.forEach(async (c: any) => {
      if (!c.birthday || !c.email) return;
      const bMMDD = c.birthday.slice(5); // "YYYY-MM-DD" → "MM-DD"
      if (bMMDD !== todayMMDD) return;
      if (c.lastBirthdayGreetingYear === thisYear) return;
      try {
        await sendBirthdayEmail(c.email, { customerName: c.nombre || c.fullName || 'Cliente', businessName: bName });
        await updateDoc(doc(db, 'businesses', businessId, 'customers', c.id), { lastBirthdayGreetingYear: thisYear });
      } catch (e) { console.error('[Birthday greeting]', e); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, customers.length]);

  // ── Listener: solicitudes de Comparar Libros pendientes ──────────────────────
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !businessId) return;
    // Single where to avoid composite index requirement — filter status + businessId client-side
    const q = query(
      collection(db, 'bookCompareRequests'),
      where('receiverId', '==', uid)
    );
    const unsub = onSnapshot(q, snap => {
      const count = snap.docs.filter(d => {
        const data = d.data();
        return data.businessId === businessId && data.status === 'pending';
      }).length;
      setPendingCompareCount(count);
    });
    return unsub;
  }, [businessId, firebaseUser?.uid]);

  // ── Confirm helper ───────────────────────────────────────────────────────────
  const withConfirm = useCallback((message: string, action: () => Promise<void>) => {
    setConfirmState({ message, onConfirm: action });
  }, []);

  // ── Mutation handlers ────────────────────────────────────────────────────────
  const handleSaveProfile = async (patch: any) => {
    if (!firebaseUser) return;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), patch);
      updateUserProfile(patch);
      setIsProfileOpen(false);
      toast.success('Perfil actualizado correctamente');
    } catch {
      toast.error('Error al actualizar el perfil');
    }
  };

  const uid = firebaseUser?.uid || '';

  // ── Fase D.0 — Write path dividido en commit + submit ────────────────────
  // commitMovement = el write real al ledger (lógica legacy preservada)
  // submitMovement = wrapper que decide si el movement va a quórum o directo
  type SubmitOpts = {
    approvalFlowId?: string;
    approvedBy?: string[];
    migratedFromHistorical?: boolean;
    fromPosRealtime?: boolean;
    fromPortalPayment?: boolean;
  };

  const commitMovement = async (data: any, opts: SubmitOpts = {}): Promise<string> => {
    if (!businessId) return '';

    // G.1 — Detector de ventas/abonos duplicados (últimos 5 min, mismo cliente + monto)
    if (
      !opts.migratedFromHistorical &&
      (data.movementType === 'FACTURA' || data.movementType === 'ABONO') &&
      data.entityId &&
      data.amountInUSD
    ) {
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const dupQ = query(
          collection(db, 'movements'),
          where('businessId', '==', businessId),
          where('entityId', '==', data.entityId),
          where('movementType', '==', data.movementType),
          where('createdAt', '>=', fiveMinAgo),
        );
        const dupSnap = await getDocs(dupQ);
        const similar = dupSnap.docs.find(d => Math.abs((d.data().amountInUSD || 0) - data.amountInUSD) < 0.01);
        if (similar) {
          toast.warning(`Movimiento similar registrado hace menos de 5 min (${data.movementType} $${data.amountInUSD} al mismo cliente). Verifica que no sea duplicado.`);
        }
      } catch {
        // No bloquear la venta si la query falla
      }
    }

    const raw: any = {
      ...data,
      businessId,
      createdAt: new Date().toISOString(),
      status: 'committed',
    };
    if (opts.approvalFlowId) raw.approvalFlowId = opts.approvalFlowId;
    if (opts.approvedBy) raw.approvedBy = opts.approvedBy;
    if (opts.migratedFromHistorical) raw.migratedFromHistorical = true;
    // Firestore rechaza undefined — limpiar todos los campos undefined
    const payload = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
    const docRef = await addDoc(collection(db, 'movements'), payload);
    logAudit(businessId, uid, 'CREAR', 'MOVIMIENTO', `${data.movementType || 'MOV'} — ${data.description || docRef.id}`);
    // Custom hooks & webhook — fire-and-forget, never block the sale
    const saleRecord = { ...payload, id: docRef.id };
    customization.afterSaleHook?.(saleRecord);
    if (data.movementType === 'FACTURA' || data.movementType === 'ABONO') {
      fireWebhook(businessId, webhookUrl, 'sale.created', saleRecord);
    }
    // Loyalty engine — fire-and-forget, never block the sale
    applyLoyaltyForMovement(db, businessId, data, docRef.id)
      .catch(err => console.error('[loyalty] award failed', err));
    return docRef.id;
  };

  const submitMovement = async (data: any, opts: SubmitOpts = {}): Promise<string> => {
    if (!businessId) return '';
    const { count: validatorCount, ids: validatorIds } = countValidators(
      businessUsersList,
      roleCapabilities
    );
    const decision = decideQuorum({
      config: approvalConfig,
      movementDraft: data,
      validatorCount,
      fromPosRealtime: opts.fromPosRealtime,
      migratedFromHistorical: opts.migratedFromHistorical,
      fromPortalPayment: opts.fromPortalPayment,
    });

    if (!decision.needsQuorum) {
      if (decision.reason === 'insufficient_validators' && approvalConfig.enabled) {
        toast.warning('Aprobaciones activas pero validadores insuficientes — movimiento auto-aprobado');
      }
      return commitMovement(data, opts);
    }

    // Crea pendingMovement — el write al ledger ocurrirá cuando se alcance el quórum
    // El creador cuenta como primera firma automáticamente
    const now = new Date().toISOString();
    const quorumNeeded = Math.max(2, approvalConfig.quorumRequired || 2);
    const creatorApproval = { userId: uid, userName: user?.name || '', at: now, note: 'Creador' };
    const pendingRef = await addDoc(
      collection(db, `businesses/${businessId}/pendingMovements`),
      {
        movementDraft: data,
        createdBy: uid,
        createdByName: user?.name || '',
        createdAt: now,
        status: 'pending',
        approvals: [creatorApproval],
        rejections: [],
        quorumRequired: quorumNeeded,
        quorumSnapshot: { validatorIds, validatorCount },
      }
    );
    logAudit(businessId, uid, 'CREAR', 'MOV_PENDIENTE', `${data.movementType || 'MOV'} → cola aprobación`);
    toast.info(`Movimiento enviado a aprobación (1/${quorumNeeded}) — falta ${quorumNeeded - 1} firma(s)`);
    return pendingRef.id;
  };

  // Alias backwards-compat para callsites existentes (CxC/CxP/DataImporter)
  const handleRegisterMovement = (data: any) => submitMovement(data);

  // Wrapper para POS: bypass quórum por tratarse de venta en tiempo real
  const handleRegisterMovementPos = (data: any) =>
    submitMovement(data, { fromPosRealtime: true });

  // Wrapper para DataImporter: bypass quórum por tratarse de histórico
  const handleRegisterMovementHistorical = (data: any) =>
    submitMovement(data, { migratedFromHistorical: true });

  // ── Fase D.0 — handlers de aprobación ───────────────────────────────────
  const approvePendingMovement = async (pendingId: string, note?: string) => {
    if (!businessId || !uid) return;
    // Lock local para evitar doble-click en la misma sesión
    if (approvalLocks.current.has(pendingId)) return;
    approvalLocks.current.add(pendingId);
    try {
      const pendingDocRef = doc(db, `businesses/${businessId}/pendingMovements`, pendingId);
      const nowIso = new Date().toISOString();

      // Firestore rechaza undefined dentro de arrays/objetos — construir la firma sin el campo si no hay nota
      const mySignature: Record<string, any> = { userId: uid, userName: user?.name || '', at: nowIso };
      if (note && note.trim()) mySignature.note = note.trim();

      // runTransaction garantiza lectura atómica — si otro click ya escribió,
      // el transaction reintenta con datos frescos y detecta la firma duplicada
      const result = await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(pendingDocRef);
        if (!freshSnap.exists()) return { ok: false, msg: 'Movimiento pendiente no encontrado' } as const;

        const pending = { id: freshSnap.id, ...freshSnap.data() } as PendingMovement;

        if (pending.status !== 'pending') return { ok: false, msg: 'Esta solicitud ya fue procesada' } as const;
        if (pending.approvals.some((a: any) => a.userId === uid)) return { ok: false, msg: 'Ya firmaste esta solicitud' } as const;

        // Validar capability con datos frescos
        const check = canApprovePending(pending, { uid, role: user?.role }, (cap) => canCapability(cap as any));
        if (!check.allowed) return { ok: false, msg: `No se puede aprobar: ${check.reason}` } as const;

        const newApprovals = [...(pending.approvals || []), mySignature];
        const quorumReached = newApprovals.length >= (pending.quorumRequired || 2);

        if (quorumReached) {
          transaction.update(pendingDocRef, {
            approvals: newApprovals,
            status: 'approved',
            committedAt: nowIso,
          });
          return { ok: true, quorumReached: true, newApprovals, draft: pending.movementDraft, quorum: pending.quorumRequired } as const;
        } else {
          transaction.update(pendingDocRef, { approvals: newApprovals });
          return { ok: true, quorumReached: false, newApprovals, quorum: pending.quorumRequired } as const;
        }
      });

      if (!result.ok) {
        toast.info(result.msg);
        return;
      }

      if (result.quorumReached) {
        try {
          // Commit al ledger FUERA del transaction (addDoc no es transaccional)
          const committedId = await commitMovement((result as any).draft, {
            approvalFlowId: pendingId,
            approvedBy: result.newApprovals.map((a: any) => a.userId),
          });
          // Guardar el ID del movimiento commiteado
          await updateDoc(doc(db, `businesses/${businessId}/pendingMovements`, pendingId), {
            committedMovementId: committedId,
          });
          logAudit(businessId, uid, 'APROBAR', 'MOV_PENDIENTE', `quórum alcanzado → ${committedId}`);
          toast.success('Movimiento aprobado y registrado en el libro');
        } catch (err) {
          console.error('[approvePendingMovement] commitMovement failed after quorum', err);
          toast.error('Quórum alcanzado pero hubo un error al registrar el movimiento en el libro');
        }
      } else {
        logAudit(businessId, uid, 'FIRMAR', 'MOV_PENDIENTE', `${result.newApprovals.length}/${result.quorum}`);
        toast.success(`Firma registrada (${result.newApprovals.length}/${result.quorum})`);
      }
    } catch (err) {
      console.error('[approvePendingMovement] transaction failed', err);
      toast.error(`Error al aprobar: ${(err as Error)?.message || 'desconocido'}`);
    } finally {
      approvalLocks.current.delete(pendingId);
    }
  };

  const rejectPendingMovement = async (pendingId: string, reason: string) => {
    if (!businessId || !uid) return;
    const pending = pendingMovementsList.find(p => p.id === pendingId);
    if (!pending) return;
    if (pending.status !== 'pending') {
      toast.error('Solo se pueden rechazar pendientes activos');
      return;
    }
    if (pending.createdBy === uid) {
      toast.error('No puedes rechazar tu propio movimiento — cancélalo en su lugar');
      return;
    }
    if (!canCapability('aprobarMovimientos' as any)) {
      toast.error('Sin permiso para rechazar');
      return;
    }
    const nowIso = new Date().toISOString();
    const newRejections = [
      ...(pending.rejections || []),
      { userId: uid, userName: user?.name || '', at: nowIso, reason },
    ];
    await updateDoc(doc(db, `businesses/${businessId}/pendingMovements`, pendingId), {
      status: 'rejected',
      rejections: newRejections,
    });
    logAudit(businessId, uid, 'RECHAZAR', 'MOV_PENDIENTE', reason);
    toast.success('Movimiento rechazado');
  };

  const cancelPendingMovement = async (pendingId: string) => {
    if (!businessId || !uid) return;
    const pending = pendingMovementsList.find(p => p.id === pendingId);
    if (!pending) return;
    if (pending.createdBy !== uid) {
      toast.error('Solo el creador puede cancelar');
      return;
    }
    if (pending.status !== 'pending') {
      toast.error('Solo se pueden cancelar pendientes activos');
      return;
    }
    await updateDoc(doc(db, `businesses/${businessId}/pendingMovements`, pendingId), {
      status: 'cancelled',
    });
    logAudit(businessId, uid, 'CANCELAR', 'MOV_PENDIENTE', pendingId);
    toast.success('Movimiento cancelado');
  };

  const updateMovement = async (id: string, updated: Partial<Movement>) => {
    await updateDoc(doc(db, 'movements', id), updated);
    logAudit(businessId, uid, 'EDITAR', 'MOVIMIENTO', `ID: ${id}`);
  };

  const deleteMovement = async (id: string) => {
    withConfirm('¿Eliminar este movimiento?', async () => {
      await deleteDoc(doc(db, 'movements', id));
      logAudit(businessId, uid, 'ELIMINAR', 'MOVIMIENTO', `ID: ${id}`);
      toast.success('Movimiento eliminado');
    });
  };

  const handleRegisterCustomer = async (c: Customer) => {
    const payload = { ...c, businessId, createdAt: (c as any).createdAt || new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'customers'), payload);
    logAudit(businessId, uid, 'CREAR', 'CLIENTE', c.cedula || c.email || '');
    const record = { ...payload, id: docRef.id };
    customization.afterCustomerHook?.(record);
    fireWebhook(businessId, webhookUrl, 'customer.created', record);
  };

  const handleUpdateCustomer = async (id: string, c: Customer) => {
    await updateDoc(doc(db, 'customers', id), c as any);
    logAudit(businessId, uid, 'EDITAR', 'CLIENTE', c.cedula || `ID: ${id}`);
  };

  const handleDeleteCustomer = async (id: string) => {
    await deleteDoc(doc(db, 'customers', id));
    logAudit(businessId, uid, 'ELIMINAR', 'CLIENTE', `ID: ${id}`);
    toast.success('Cliente eliminado');
  };

  const handleRegisterSupplier = async (s: Supplier) => {
    await addDoc(collection(db, 'suppliers'), { ...s, businessId });
    logAudit(businessId, uid, 'CREAR', 'PROVEEDOR', s.contacto || s.rif || '');
  };

  const handleUpdateSupplier = async (id: string, s: Supplier) => {
    await updateDoc(doc(db, 'suppliers', id), s as any);
    logAudit(businessId, uid, 'EDITAR', 'PROVEEDOR', s.contacto || `ID: ${id}`);
  };

  const handleDeleteSupplier = async (id: string) => {
    withConfirm('¿Eliminar este proveedor?', async () => {
      await deleteDoc(doc(db, 'suppliers', id));
      logAudit(businessId, uid, 'ELIMINAR', 'PROVEEDOR', `ID: ${id}`);
      toast.success('Proveedor eliminado');
    });
  };

  const handleRegisterAdvance = async (adv: any) => {
    await addDoc(collection(db, `businesses/${businessId}/payroll_advances`), { ...adv, businessId });
    logAudit(businessId, uid, 'CREAR', 'ANTICIPO', `${adv.employeeName || ''} — $${adv.amount || 0}`);
  };

  // ── Notifications derived from live data ─────────────────────────────────────
  const notifications = useMemo(() => {
    const items: Array<{ id: string; title: string; subtitle: string; type: 'warning' | 'info' }> = [];

    // 1. Stock bajo
    const lowStock = inventoryItems.filter(p => {
      const stock = (p as any).stock ?? (p as any).quantity ?? 0;
      const min = (p as any).minStock ?? 10;
      return stock < min;
    });
    if (lowStock.length > 0) {
      items.push({ id: 'low-stock', title: `${lowStock.length} producto${lowStock.length > 1 ? 's' : ''} con stock bajo`, subtitle: 'Ver inventario', type: 'warning' });
    }

    // 2. Movimientos del día
    const today = new Date().toISOString().split('T')[0];
    const todayTx = movements.filter(m => m.date?.startsWith(today));
    if (todayTx.length > 0) {
      items.push({ id: 'today-activity', title: `${todayTx.length} movimiento${todayTx.length > 1 ? 's' : ''} hoy`, subtitle: 'Actividad del día', type: 'info' });
    }

    // 3. CxC vencidas > 30 días
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const clientBalance: Record<string, number> = {};
    // Excluye ventas POS contado y Consumidor Final — no tienen CxC pendiente real
    movements
      .filter(m => !m.isSupplierMovement && !(m as any).pagado && m.entityId !== 'CONSUMIDOR_FINAL')
      .forEach(m => {
        if (!clientBalance[m.entityId]) clientBalance[m.entityId] = 0;
        if (m.movementType === 'FACTURA') clientBalance[m.entityId] += (m.amountInUSD || 0);
        if (m.movementType === 'ABONO') clientBalance[m.entityId] -= (m.amountInUSD || 0);
      });
    const overdueCount = [...new Set(
      movements
        .filter(m =>
          !m.isSupplierMovement &&
          m.movementType === 'FACTURA' &&
          (m.date || '') < cutoffStr &&
          !(m as any).pagado &&
          m.entityId !== 'CONSUMIDOR_FINAL'
        )
        .filter(m => (clientBalance[m.entityId] || 0) > 0)
        .map(m => m.entityId)
    )].length;
    if (overdueCount > 0) {
      items.push({ id: 'overdue-cxc', title: `${overdueCount} cliente${overdueCount > 1 ? 's' : ''} con CxC vencida`, subtitle: 'Cargos sin cobrar > 30 días', type: 'warning' });
    }

    // 3b. Recordatorios progresivos CxC
    const reminderCount = countPendingReminders(calculateReminders(movements, customers));
    if (reminderCount > 0) {
      items.push({ id: 'cobranza-reminders', title: `${reminderCount} recordatorio${reminderCount > 1 ? 's' : ''} de cobranza`, subtitle: 'Facturas próximas a vencer o vencidas', type: 'warning' });
    }

    // 0. Solicitudes de acceso al equipo pendientes
    if (pendingJoinCount > 0) {
      items.push({ id: 'pending-join', title: `${pendingJoinCount} solicitud${pendingJoinCount > 1 ? 'es' : ''} de acceso al equipo`, subtitle: 'Ver en Configuración → Equipo', type: 'warning' });
    }

    // 7. Productos pendientes de revisión (registrados por almacenista sin precio)
    const canReviewProducts = isAdmin || user?.role === 'inventario';
    if (canReviewProducts && pendingProductsCount > 0) {
      items.push({ id: 'pending-products', title: `${pendingProductsCount} producto${pendingProductsCount > 1 ? 's' : ''} pendiente${pendingProductsCount > 1 ? 's' : ''} de revisión`, subtitle: 'Un almacenista registró mercancía sin precio asignado', type: 'warning' });
    }

    // 5. Bonus days notification
    if (subData?.bonusNotification && !subData.bonusNotification.seen) {
      items.push({ id: 'bonus-days', title: `🎉 +${subData.bonusNotification.days} días gratis añadidos a tu cuenta`, subtitle: subData.bonusNotification.reason || 'Gracias por tu feedback', type: 'info' });
    }

    // 6. Solicitudes de Comparar Libros pendientes
    if (pendingCompareCount > 0) {
      items.push({ id: 'pending-compare', title: `📬 ${pendingCompareCount} solicitud${pendingCompareCount > 1 ? 'es' : ''} de Comparar Libros`, subtitle: 'Alguien quiere cotejar registros contigo', type: 'warning' });
    }

    // 4. CxP pendiente con proveedores
    const supplierBalance: Record<string, number> = {};
    movements.filter(m => m.isSupplierMovement).forEach(m => {
      if (!supplierBalance[m.entityId]) supplierBalance[m.entityId] = 0;
      if (m.movementType === 'FACTURA') supplierBalance[m.entityId] += (m.amountInUSD || 0);
      if (m.movementType === 'ABONO') supplierBalance[m.entityId] -= (m.amountInUSD || 0);
    });
    const debtSuppliers = Object.values(supplierBalance).filter(b => b > 0).length;
    if (debtSuppliers > 0) {
      items.push({ id: 'pending-cxp', title: `${debtSuppliers} proveedor${debtSuppliers > 1 ? 'es' : ''} con deuda pendiente`, subtitle: 'Ver CxP', type: 'info' });
    }

    // NDE pendientes de despacho (visible para almacenista/admin/owner)
    const ndePendientes = movements.filter((m: any) => m.esNotaEntrega && m.estadoNDE === 'pendiente_despacho' && !m.anulada);
    if (ndePendientes.length > 0) {
      items.push({ id: 'nde-pendientes', title: `${ndePendientes.length} comprobante${ndePendientes.length > 1 ? 's' : ''} pendiente${ndePendientes.length > 1 ? 's' : ''} de despacho`, subtitle: 'Panel de Despacho', type: 'warning' });
    }

    // Movimientos pendientes de aprobación (solo los que el usuario actual puede firmar)
    const myPendingApprovals = pendingMovementsList.filter(p =>
      p.status === 'pending' && p.createdBy !== uid && !p.approvals?.some(a => a.userId === uid)
    );
    if (myPendingApprovals.length > 0) {
      // ID dinámico con los IDs de los pendientes para que al cambiar la lista se muestre de nuevo
      const pendingKey = myPendingApprovals.map(p => p.id).sort().join(',');
      items.push({ id: `pending-approvals:${pendingKey}`, title: `${myPendingApprovals.length} movimiento${myPendingApprovals.length > 1 ? 's' : ''} esperando tu aprobación`, subtitle: 'Revisa en la ficha del cliente', type: 'warning' });
    }

    return items;
  }, [inventoryItems, movements, pendingJoinCount, pendingCompareCount, pendingProductsCount, subData, isAdmin, pendingMovementsList, uid]);

  const visibleNotifications = useMemo(
    () => notifications.filter(n => !dismissedNotifIds.has(n.id)),
    [notifications, dismissedNotifIds]
  );

  const handleDismissNotif = useCallback((id: string) => {
    if (id === 'bonus-days') markBonusSeen();
    setDismissedNotifIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('dualis_dismissed_notifs', JSON.stringify([...next]));
      return next;
    });
  }, [markBonusSeen]);

  const handleDismissAllNotifs = useCallback(() => {
    setDismissedNotifIds(prev => {
      const next = new Set([...prev, ...notifications.map(n => n.id)]);
      localStorage.setItem('dualis_dismissed_notifs', JSON.stringify([...next]));
      return next;
    });
  }, [notifications]);

  const legacyRates = { bcv: rates.tasaBCV, grupo: rates.tasaGrupo, divisa: rates.tasaDivisa || rates.tasaGrupo - 1, lastUpdated: rates.lastUpdated };

  // ── Breadcrumb group mapping (tab → parent group label) ───────────────────
  const tabGroupMap: Record<string, string> = useMemo(() => ({
    resumen: 'Dashboard',
    inventario: 'Operaciones', cajas: 'Operaciones', despacho: 'Operaciones', cotizaciones: 'Operaciones',
    recurrentes: 'Operaciones', transferencias: 'Operaciones', tasas: 'Operaciones', historial: 'Operaciones',
    clientes: 'Finanzas', cobranza: 'Finanzas', proveedores: 'Finanzas', tesoreria: 'Finanzas',
    flujocaja: 'Finanzas', verificacion: 'Finanzas', reclamos: 'Finanzas',
    portalchat: 'Finanzas', contabilidad: 'Finanzas', conciliacion: 'Finanzas',
    rrhh: 'Equipo', comisiones: 'Equipo', sucursales: 'Equipo',
    reportes: 'Inteligencia', estadisticas: 'Inteligencia', pareto: 'Inteligencia',
    rentabilidad: 'Inteligencia', comparar: 'Inteligencia',
    config: 'Sistema', help: 'Sistema',
  }), []);

  const tabTitles: Record<string, string> = useMemo(() => ({
    resumen: 'Resumen', clientes: 'Clientes', contabilidad: 'Reportes',
    proveedores: 'Proveedores', rrhh: 'RRHH',
    inventario: 'Inventario',
    reportes: 'Reportes', widgets: 'Herramientas',
    comparar: 'Comparar', tasas: 'Tasas', conciliacion: 'Conciliación',
    cajas: 'Cajas', despacho: 'Panel Despacho', sucursales: 'Sucursales', fiscal: 'Gestión Fiscal', libroventas: 'Reporte de Ventas',
    tesoreria: 'Tesorería', comisiones: 'Reporte de Comisiones',
    verificacion: 'Verificación',
    reclamos: 'Reclamos',
    config: 'Configuración', help: 'Ayuda',
  }), []);

  // ── Sidebar Mini KPIs ────────────────────────────────────────────────────
  const sidebarKpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const ventasHoy = movements.filter(m => m.movementType === 'FACTURA' && m.date?.startsWith(today) && !m.isSupplierMovement && !(m as any).anulada).length;

    // CxC total pendiente
    let montoCxC = 0;
    movements
      .filter(m => !m.isSupplierMovement && !(m as any).pagado && m.entityId !== 'CONSUMIDOR_FINAL' && !(m as any).anulada)
      .forEach(m => {
        if (m.movementType === 'FACTURA') montoCxC += (m.amountInUSD || 0);
        if (m.movementType === 'ABONO') montoCxC -= (m.amountInUSD || 0);
      });
    if (montoCxC < 0) montoCxC = 0;

    const stockBajo = inventoryItems.filter(p => {
      const s = (p as any).stock ?? (p as any).quantity ?? 0;
      return s < ((p as any).minStock ?? 10);
    }).length;

    return { ventasHoy, montoCxC, stockBajo };
  }, [movements, inventoryItems]);

  return (
    <div className="h-screen w-full flex bg-slate-50 dark:bg-[#0a0f1e] overflow-hidden font-inter transition-colors">
      {user && (
        <div className="absolute lg:relative shrink-0">
          <Sidebar
            activeTab={activeTab}
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
            user={user}
            config={{ companyName: userProfile?.businessId } as any}
            rolePermissions={rolePermissions}
            canCompare={canAccess('comparar')}
            kpis={sidebarKpis}
            shortcutHints={shortcutHints}
            badges={{
              comparar: pendingCompareCount,
              tesoreria: overduePaymentsCount,
              cobranza: countPendingReminders(calculateReminders(movements, customers)),
              inventario: inventoryItems.filter(p => { const s = (p as any).stock ?? (p as any).quantity ?? 0; return s < ((p as any).minStock ?? 10); }).length,
              despacho: movements.filter((m: any) => m.esNotaEntrega && m.estadoNDE === 'pendiente_despacho' && !m.anulada).length,
              clientes: pendingMovementsList.filter(p =>
                p.status === 'pending' &&
                !(p.movementDraft as any)?.isSupplierMovement &&
                p.createdBy !== uid &&
                !p.approvals?.some((a: any) => a.userId === uid)
              ).length,
              proveedores: pendingMovementsList.filter(p =>
                p.status === 'pending' &&
                (p.movementDraft as any)?.isSupplierMovement &&
                p.createdBy !== uid &&
                !p.approvals?.some((a: any) => a.userId === uid)
              ).length,
            }}
            onLogout={() => auth.signOut()}
            onOpenProfile={() => setIsProfileOpen(true)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <OfflineBanner />
        <TrialBanner businessId={businessId} />
        <Topbar
          topbarTitle={tabTitles[activeTab] || activeTab}
          breadcrumbGroup={tabGroupMap[activeTab]}
          notifCount={visibleNotifications.length}
          showNotifications={showNotifications}
          onToggleNotifications={() => setShowNotifications(p => !p)}
          onOpenCalculator={() => widgetManager.openWidget('calculator')}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleSidebar={() => setIsSidebarOpen(p => !p)}
          bcvRate={rates.tasaBCV}
          customRates={customRates}
          usingStaleRate={usingStaleRate}
          lastUpdated={rates.lastUpdated}
          onRefreshRate={() => { void forceRefreshBCV(); }}
          lastSyncAt={lastSyncAt}
        />

        <main className="flex-1 overflow-y-auto p-2 sm:p-3 lg:p-4 relative custom-scroll">
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
          <div className="max-w-[1800px] mx-auto h-full">
            {/* Custom extra tabs from registry — rendered before standard tabs */}
            {customization.extraTabs?.map(tab =>
              activeTab === tab.id ? (
                <div key={tab.id}>{tab.component}</div>
              ) : null
            )}

            {activeTab === 'resumen' && (canView('resumen') ? (
              <>
                {/* Custom dashboard cards injected at top for this business */}
                {customization.dashboardCards && customization.dashboardCards.length > 0 && (
                  <div className="mb-6 space-y-4">{customization.dashboardCards}</div>
                )}
                <AdminDashboard onTabChange={goTab} />
              </>
            ) : <NoAccess />)}
            {activeTab === 'widgets'    && (canView('widgets')    ? <WidgetLaunchpad /> : <NoAccess />)}
            {activeTab === 'inventario' && (canView('inventario') ? <Inventario /> : <NoAccess />)}
            {activeTab === 'config'     && (canView('config')     ? <Configuracion /> : <NoAccess />)}
            {activeTab === 'help'       && <HelpCenter />}
            {activeTab === 'tasas' && <ExchangeRatesSection />}
            {activeTab === 'historial' && (canView('reportes') ? <LibroVentasSection /> : <NoAccess />)}
            {activeTab === 'cajas' && (
              !canView('cajas') ? <NoAccess /> :
              canAccess('cajas')
                ? <AdminPosManager />
                : <LockedModule moduleName="Cajas / Terminales POS" requiredPlan="starter" />
            )}
            {activeTab === 'despacho' && (
              (user?.role === 'owner' || user?.role === 'admin' || user?.role === 'almacenista' || user?.role === 'inventario')
                ? <DespachoPanel businessId={businessId} />
                : <NoAccess />
            )}
            {activeTab === 'cotizaciones' && (
              <QuotesPanel
                businessId={businessId}
                currentUserId={firebaseUser?.uid || ''}
                currentUserName={userProfile?.fullName || 'Admin'}
              />
            )}
            {activeTab === 'recurrentes' && (
              <RecurringBillingPanel
                businessId={businessId}
                currentUserId={firebaseUser?.uid || ''}
                currentUserName={userProfile?.fullName || 'Admin'}
              />
            )}
            {activeTab === 'rrhh' && (
              !canView('rrhh') ? <NoAccess /> :
              canAccess('rrhh')
                ? <RecursosHumanos />
                : <LockedModule moduleName="Recursos Humanos" requiredPlan="negocio" />
            )}
            {activeTab === 'comisiones' && (
              isAdmin ? <ComisionesReporte businessId={businessId} /> : <NoAccess />
            )}
            {activeTab === 'flujocaja' && (
              <CashFlowPanel businessId={businessId} />
            )}
            {activeTab === 'pareto' && (
              <ParetoPanel businessId={businessId} />
            )}
            {activeTab === 'estadisticas' && (
              <Estadisticas businessId={businessId} movements={movements} inventoryItems={inventoryItems as any} customers={customers as any} />
            )}
            {activeTab === 'transferencias' && (
              <TransferenciasPanel />
            )}
            {activeTab === 'tesoreria' && (
              !canView('tesoreria') ? <NoAccess /> :
              canAccess('tesoreria')
                ? <Tesoreria
                    businessId={businessId}
                    businessName={(userProfile as any)?.businessName}
                    currentUserId={firebaseUser?.uid || ''}
                    currentUserName={user?.name || 'Usuario'}
                    userRole={user?.role || 'member'}
                    customers={customers as any}
                  />
                : <LockedModule moduleName="Tesorería" requiredPlan="basico" />
            )}
            {activeTab === 'verificacion' && (
              canCapability('aprobarPagos' as any)
                ? <Conciliacion
                    businessId={businessId}
                    currentUserId={userProfile?.uid || firebaseUser?.uid || ''}
                    userRole={userProfile?.role || ''}
                    movements={movements}
                    currentUserName={user?.name || userProfile?.displayName || userProfile?.email || 'Usuario'}
                    canVerify={canCapability('aprobarPagos' as any)}
                  />
                : <NoAccess />
            )}
            {activeTab === 'sucursales' && (
              !canView('sucursales') ? <NoAccess /> :
              canAccess('sucursales')
                ? <SucursalesManager />
                : <LockedModule moduleName="Sucursales" requiredPlan="negocio" />
            )}
            {activeTab === 'rentabilidad' && (
              <RentabilidadPage businessId={businessId} />
            )}
            {activeTab === 'reportes' && (
              !canView('reportes') ? <NoAccess /> :
              canAccess('reportes')
                ? <ReportesSection movements={movements} customers={customers} bcvRate={rates.tasaBCV} />
                : <LockedModule moduleName="Reportes" requiredPlan="starter" />
            )}
            {activeTab === 'conciliacion' && (
              !canView('conciliacion') ? <NoAccess /> :
              canAccess('conciliacion')
                ? <Conciliacion
                    businessId={businessId}
                    currentUserId={userProfile?.uid || firebaseUser?.uid || ''}
                    userRole={userProfile?.role || ''}
                    movements={movements}
                    currentUserName={user?.name || userProfile?.displayName || userProfile?.email || 'Usuario'}
                    canVerify={canCapability('aprobarPagos' as any)}
                  />
                : <LockedModule moduleName="Conciliación Bancaria" requiredPlan="negocio" isAddon />
            )}
            {activeTab === 'comparar' && (
              !canView('comparar') ? <NoAccess /> :
              canAccess('comparar')
                ? <BooksComparePanel
                    businessId={businessId}
                    currentUserId={userProfile?.uid || firebaseUser?.uid || ''}
                    currentUserName={userProfile?.displayName || userProfile?.fullName || userProfile?.email || 'Yo'}
                    isAdmin={userProfile?.role === 'owner' || userProfile?.role === 'admin'}
                    movements={movements}
                    customers={customers}
                    suppliers={suppliers}
                    employees={employees}
                    advances={advances}
                    rates={legacyRates as any}
                  />
                : <LockedModule moduleName="Comparar Libros" requiredPlan="negocio" />
            )}

            {activeTab === 'clientes' && (
              canAccess('clientes') ? (
                <CxCPage
                  customers={customers}
                  movements={movements}
                  suppliers={suppliers}
                  rates={legacyRates as any}
                  bcvRate={rates.tasaBCV}
                  customRates={customRates ?? []}
                  businessId={businessId}
                  userRole={user?.role || 'member'}
                  isolationMode={isolationMode}
                  currentUserId={firebaseUser?.uid}
                  currentUserName={user?.name || userProfile?.displayName || userProfile?.email || 'Usuario'}
                  canVerify={canCapability('aprobarPagos' as any)}
                  approvalConfig={approvalConfig}
                  validatorCount={countValidators(businessUsersList, roleCapabilities).count}
                  pendingMovements={pendingMovementsList}
                  onApprovePending={approvePendingMovement}
                  onRejectPending={rejectPendingMovement}
                  onCancelPending={cancelPendingMovement}
                  canDelete={canCapability('eliminarDatos' as any)}
                  canCreateCustomer={canCapability('crearClientes' as any)}
                  businessName={(userProfile as any)?.businessName || ''}
                  onSaveMovement={handleRegisterMovement}
                  onUpdateMovement={updateMovement}
                  onDeleteMovement={deleteMovement}
                  onCreateCustomer={handleRegisterCustomer as any}
                  onUpdateCustomer={handleUpdateCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                />
              ) : <LockedModule moduleName="Clientes / CxC" requiredPlan="starter" />
            )}

            {activeTab === 'cobranza' && (
              <AgendaCobranza
                movements={movements}
                customers={customers}
                businessId={businessId}
                businessName={(userProfile as any)?.businessName || ''}
              />
            )}

            {activeTab === 'portalchat' && (
              <PortalChatAdmin
                businessId={businessId}
                businessName={(userProfile as any)?.businessName || ''}
                userName={(userProfile as any)?.displayName || firebaseUser?.displayName || 'Admin'}
                customers={customers}
              />
            )}

            {activeTab === 'contabilidad' && (
              canAccess('contabilidad') ? (
                <ReportesContables
                  movements={movements}
                  customers={customers}
                  suppliers={suppliers}
                  employees={employees}
                  inventoryItems={inventoryItems}
                  rates={legacyRates as any}
                  businessName={(userProfile as any)?.businessName}
                />
              ) : <LockedModule moduleName="Reportes contables" requiredPlan="starter" />
            )}

            {activeTab === 'proveedores' && (
              canAccess('proveedores') ? (
                <CxPPage
                  suppliers={suppliers}
                  customers={customers}
                  movements={movements}
                  rates={legacyRates as any}
                  bcvRate={rates.tasaBCV}
                  customRates={customRates ?? []}
                  businessId={businessId}
                  userRole={user?.role || 'member'}
                  isolationMode={isolationMode}
                  currentUserId={firebaseUser?.uid}
                  currentUserName={user?.name || userProfile?.displayName || userProfile?.email || 'Usuario'}
                  canVerify={canCapability('aprobarPagos' as any)}
                  approvalConfig={approvalConfig}
                  validatorCount={countValidators(businessUsersList, roleCapabilities).count}
                  pendingMovements={pendingMovementsList}
                  canDelete={canCapability('eliminarDatos' as any)}
                  canCreateCustomer={canCapability('crearClientes' as any)}
                  onSaveMovement={handleRegisterMovement}
                  onUpdateMovement={updateMovement}
                  onDeleteMovement={deleteMovement}
                  onCreateSupplier={handleRegisterSupplier as any}
                  onUpdateSupplier={handleUpdateSupplier}
                  onDeleteSupplier={handleDeleteSupplier}
                />
              ) : <LockedModule moduleName="Proveedores / CxP" requiredPlan="negocio" />
            )}

            {activeTab === 'solicitudes' && (
              <PaymentRequestsPanel
                businessId={businessId}
                businessName={(userProfile as any)?.businessName || 'tu negocio'}
                userRole={user?.role || 'member'}
                userId={firebaseUser?.uid || ''}
                userName={user?.name || 'Vendedor'}
                rates={legacyRates as any}
              />
            )}

            {activeTab === 'reclamos' && (
              <DisputesPanel
                businessId={businessId}
                businessName={(userProfile as any)?.businessName || 'tu negocio'}
                userId={firebaseUser?.uid || ''}
                userName={user?.name || 'Admin'}
              />
            )}

            <Outlet />
          </div>
          </Suspense>
        </main>

        <QuickActionsFAB />

        {/* STATUS BAR — hidden on mobile to save space */}
        <footer className="hidden md:block bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/[0.06] px-4 lg:px-7 shrink-0">
          <div className="h-10 flex items-center justify-between font-mono text-[10px] text-slate-400 dark:text-slate-600">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span>Firebase Live</span></div>
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span>{user?.role || 'pending'}</span></div>
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span>{userProfile?.businessId?.slice(0, 12) || 'N/A'}</span></div>
            </div>
            <span className="hidden lg:inline">Dualis ERP v3.0.0-beta · <span className="text-amber-500/70">No homologado SENIAT</span> · Solo uso administrativo</span>
          </div>
        </footer>

        {/* LEGAL DISCLAIMER — shown once on first login */}
        <LegalDisclaimerModal businessId={userProfile?.businessId} userId={firebaseUser?.uid} />
      </div>

      {/* NOTIFICATION CENTER */}
      {showNotifications && (
        <NotificationCenter
          notifications={visibleNotifications}
          inventoryItems={inventoryItems as any}
          movements={movements}
          onClose={() => setShowNotifications(false)}
          onNavigate={(tab) => { goTab(tab); setShowNotifications(false); }}
          onDismiss={handleDismissNotif}
          onDismissAll={handleDismissAllNotifs}
        />
      )}

      {/* HELP PANEL */}
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* GLOBAL SEARCH (Ctrl+K) */}
      <GlobalSearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        customers={customers}
        products={inventoryItems as any}
        movements={movements}
        onNavigate={(tab) => goTab(tab)}
      />

      {/* KEYBOARD SHORTCUTS OVERLAY (?) */}
      <KeyboardShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* MODALS */}
      <UserProfileModalComp isOpen={isProfileOpen} profile={userProfile as any} onClose={() => setIsProfileOpen(false)} onSave={handleSaveProfile} />
      <DataImporter open={isImporterOpen} onClose={() => setIsImporterOpen(false)} onImport={() => {}} onImportMovements={(rows) => rows.forEach(row => handleRegisterMovementHistorical(row))} customers={customers} onCreateCustomer={handleRegisterCustomer} />

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}

      {/* WIDGETS */}
      <SmartCalculatorWidget rates={legacyRates as any} isOpen={widgetManager.widgets.calculator.isOpen} isMinimized={widgetManager.widgets.calculator.isMinimized} position={widgetManager.widgets.calculator.position} onClose={() => widgetManager.closeWidget('calculator')} onMinimize={() => widgetManager.setMinimized('calculator', !widgetManager.widgets.calculator.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('calculator', pos)} />
      {widgetManager.widgets.converter.isOpen && <RateConverterWidget rates={legacyRates as any} isOpen={true} isMinimized={widgetManager.widgets.converter.isMinimized} position={widgetManager.widgets.converter.position} onClose={() => widgetManager.closeWidget('converter')} onMinimize={() => widgetManager.setMinimized('converter', !widgetManager.widgets.converter.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('converter', pos)} />}
      {widgetManager.widgets.priceChecker.isOpen && <PriceCheckerWidget inventory={inventoryItems as any} rates={legacyRates as any} isOpen={true} isMinimized={widgetManager.widgets.priceChecker.isMinimized} position={widgetManager.widgets.priceChecker.position} onClose={() => widgetManager.closeWidget('priceChecker')} onMinimize={() => widgetManager.setMinimized('priceChecker', !widgetManager.widgets.priceChecker.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('priceChecker', pos)} />}
      {widgetManager.widgets.speedDial.isOpen && <SpeedDialWidget isOpen={true} isMinimized={widgetManager.widgets.speedDial.isMinimized} position={widgetManager.widgets.speedDial.position} onClose={() => widgetManager.closeWidget('speedDial')} onMinimize={() => widgetManager.setMinimized('speedDial', !widgetManager.widgets.speedDial.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('speedDial', pos)} />}

      {/* SESSION LOCK — Fase A.7 */}
      <SessionLockOverlay
        locked={sessionLocked}
        masterPin={(userProfile as any)?.pin}
        userName={user?.name}
        onUnlock={() => setSessionLocked(false)}
        onForceLogout={() => { setSessionLocked(false); auth.signOut(); }}
      />
    </div>
  );
};

export default MainSystem;
