import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useParams, Outlet } from 'react-router-dom';
import {
  Customer,
  Movement,
  User,
  Supplier,
} from '../types';

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
import AccountingSection from './components/AccountingSection';
import SupplierSection from './components/SupplierSection';
import RecursosHumanos from './pages/RecursosHumanos';
import Inventario from './pages/Inventario';
import VisionLab from './components/VisionLab';
import BooksComparePanel from './components/BooksComparePanel';
import AIChat from './components/AIChat';
import UserProfileModalComp from './components/UserProfileModal';
import CustomerViewer from './components/CustomerViewer';
import RateHistoryWall from './components/RateHistoryWall';
import DataImporter from './components/DataImporter';
import SmartCalculatorWidget from './components/SmartCalculatorWidget';
import HelpCenter from './components/HelpCenter';
import WidgetLaunchpad from './components/WidgetLaunchpad';
import AdminPosManager from './pages/AdminPosManager';
import SucursalesManager from './pages/SucursalesManager';
import TrialBanner from './components/TrialBanner';
import NotificationCenter from './components/NotificationCenter';
import ReportesSection from './components/ReportesSection';
import ReconciliationSection from './components/ReconciliationSection';
import FiscalSection from './pages/FiscalSection';

// WIDGETS
import StickyNotesWidget from './components/StickyNotesWidget';
import RateConverterWidget from './components/RateConverterWidget';
import TimerWidget from './components/TimerWidget';
import PriceCheckerWidget from './components/PriceCheckerWidget';
import TodoListWidget from './components/TodoListWidget';
import TeamChatWidget from './components/TeamChatWidget';
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
} from 'firebase/firestore';
import { Bell, HelpCircle, Lock, ArrowRight, Zap, Menu } from 'lucide-react';
import { logAudit } from './utils/auditLogger';
import ModeToggle from './components/ModeToggle';
import HelpPanel from './components/HelpPanel';
import { useSubscription } from './hooks/useSubscription';
import LegalDisclaimerModal from './components/LegalDisclaimerModal';

// ── Topbar ─────────────────────────────────────────────────────────────────────
const Topbar: React.FC<{
  topbarTitle: string;
  notifCount: number;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onOpenCalculator: () => void;
  onOpenHelp: () => void;
  onToggleSidebar: () => void;
  bcvRate: number;
}> = React.memo(({ topbarTitle, notifCount, showNotifications, onToggleNotifications, onOpenCalculator, onOpenHelp, onToggleSidebar, bcvRate }) => (
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
          <span>Dualis System</span>
          <span className="text-slate-200 dark:text-white/10">/</span>
          <span className="text-slate-500 dark:text-slate-400 capitalize">{topbarTitle.toLowerCase()}</span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
      <div className="flex items-center gap-2 md:gap-3 bg-slate-50 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/10 rounded-xl px-2.5 md:px-4 py-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse hidden sm:block" />
        <div className="flex flex-col">
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter text-slate-400 dark:text-slate-500 leading-none">BCV</span>
          <span className="text-[12px] md:text-[13px] font-mono font-bold text-amber-600 dark:text-amber-400">Bs. {bcvRate.toFixed(2)}</span>
        </div>
      </div>

      <div className="w-px h-8 bg-slate-100 dark:bg-white/[0.08] mx-0.5 md:mx-1 hidden sm:block" />

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
  const { empresa_id } = useParams<{ empresa_id: string }>();
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
            onClick={() => navigate(`/${empresa_id}/billing`)}
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
  const { user: firebaseUser, userProfile, updateUserProfile } = useAuth();
  const { rates, updateRates } = useRates();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const widgetManager = useWidgetManager();

  const { empresa_id } = useParams<{ empresa_id: string }>();
  const adminBase = empresa_id ? `/${empresa_id}/admin` : '';

  const [activeTab, setActiveTab] = useState<string>(initialTab || 'resumen');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('dualis_dismissed_notifs');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
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
  const { permissions: rolePermissions, canView: canViewRole } = useRolePermissions(businessId, user?.role || 'member');
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
    inventario:    `${adminBase}/inventario`,
    reportes:      `${adminBase}/reportes`,
    vision:        `${adminBase}/vision`,
    widgets:       `${adminBase}/widgets`,
    comparar:      `${adminBase}/comparar`,
    tasas:         `${adminBase}/tasas`,
    conciliacion:  `${adminBase}/conciliacion`,
    cajas:         `${adminBase}/cajas`,
    sucursales:    `${adminBase}/sucursales`,
    fiscal:        `${adminBase}/fiscal`,
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

  // ── Listener: solicitudes pendientes de unirse al equipo ─────────────────────
  useEffect(() => {
    const role = userProfile?.role;
    if (!businessId || (role !== 'owner' && role !== 'admin')) return;
    const q = query(
      collection(db, 'users'),
      where('businessId', '==', businessId),
      where('status', '==', 'PENDING_APPROVAL')
    );
    const unsub = onSnapshot(q, snap => setPendingJoinCount(snap.size));
    return unsub;
  }, [businessId, userProfile?.role]);

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

  const handleRegisterMovement = async (data: any) => {
    if (!businessId) return '';
    const docRef = await addDoc(collection(db, 'movements'), { ...data, businessId, createdAt: new Date().toISOString() });
    logAudit(businessId, uid, 'CREAR', 'MOVIMIENTO', `${data.movementType || 'MOV'} — ${data.description || docRef.id}`);
    // Custom hooks & webhook — fire-and-forget, never block the sale
    const saleRecord = { ...data, id: docRef.id, businessId };
    customization.afterSaleHook?.(saleRecord);
    if (data.movementType === 'FACTURA' || data.movementType === 'ABONO') {
      fireWebhook(businessId, webhookUrl, 'sale.created', saleRecord);
    }
    return docRef.id;
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
    const docRef = await addDoc(collection(db, 'customers'), { ...c, businessId });
    logAudit(businessId, uid, 'CREAR', 'CLIENTE', c.cedula || c.email || '');
    const record = { ...c, id: docRef.id, businessId };
    customization.afterCustomerHook?.(record);
    fireWebhook(businessId, webhookUrl, 'customer.created', record);
  };

  const handleUpdateCustomer = async (id: string, c: Customer) => {
    await updateDoc(doc(db, 'customers', id), c as any);
    logAudit(businessId, uid, 'EDITAR', 'CLIENTE', c.cedula || `ID: ${id}`);
  };

  const handleDeleteCustomer = async (id: string) => {
    withConfirm('¿Eliminar este cliente?', async () => {
      await deleteDoc(doc(db, 'customers', id));
      logAudit(businessId, uid, 'ELIMINAR', 'CLIENTE', `ID: ${id}`);
      toast.success('Cliente eliminado');
    });
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
      items.push({ id: 'overdue-cxc', title: `${overdueCount} cliente${overdueCount > 1 ? 's' : ''} con CxC vencida`, subtitle: 'Facturas sin cobrar > 30 días', type: 'warning' });
    }

    // 0. Solicitudes de acceso al equipo pendientes
    if (pendingJoinCount > 0) {
      items.push({ id: 'pending-join', title: `${pendingJoinCount} solicitud${pendingJoinCount > 1 ? 'es' : ''} de acceso al equipo`, subtitle: 'Ver en Configuración → Equipo', type: 'warning' });
    }

    // 5. Bonus days notification
    if (subData?.bonusNotification && !subData.bonusNotification.seen) {
      items.push({ id: 'bonus-days', title: `🎉 +${subData.bonusNotification.days} días gratis añadidos a tu cuenta`, subtitle: subData.bonusNotification.reason || 'Gracias por tu feedback', type: 'info' });
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

    return items;
  }, [inventoryItems, movements, pendingJoinCount, subData]);

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

  const legacyRates = { bcv: rates.tasaBCV, grupo: rates.tasaGrupo, lastUpdated: rates.lastUpdated };

  const tabTitles: Record<string, string> = {
    resumen: 'Resumen', clientes: 'Clientes', contabilidad: 'Contabilidad',
    proveedores: 'Proveedores', rrhh: 'RRHH', inventario: 'Inventario',
    reportes: 'Reportes', vision: 'VisionLab', widgets: 'Herramientas',
    comparar: 'Comparar', tasas: 'Tasas', conciliacion: 'Conciliación',
    cajas: 'Cajas', sucursales: 'Sucursales', fiscal: 'Gestión Fiscal',
    config: 'Configuración', help: 'Ayuda',
  };

  return (
    <div className="h-screen w-full flex bg-slate-50 dark:bg-[#0a0f1e] overflow-hidden font-inter transition-colors">
      {user && (
        <Sidebar
          activeTab={activeTab}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          user={user}
          config={{ companyName: userProfile?.businessId } as any}
          rolePermissions={rolePermissions}
          onLogout={() => auth.signOut()}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <TrialBanner businessId={businessId} />
        <Topbar
          topbarTitle={tabTitles[activeTab] || activeTab}
          notifCount={visibleNotifications.length}
          showNotifications={showNotifications}
          onToggleNotifications={() => setShowNotifications(p => !p)}
          onOpenCalculator={() => widgetManager.openWidget('calculator')}
          onOpenHelp={() => setHelpOpen(true)}
          onToggleSidebar={() => setIsSidebarOpen(p => !p)}
          bcvRate={rates.tasaBCV}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 relative custom-scroll">
          <div className="max-w-[1440px] mx-auto h-full">
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
            {activeTab === 'tasas'      && (canView('tasas') ? <RateHistoryWall rates={legacyRates as any} /> : <NoAccess />)}

            {activeTab === 'cajas' && (
              !canView('cajas') ? <NoAccess /> :
              canAccess('cajas')
                ? <AdminPosManager />
                : <LockedModule moduleName="Cajas / Terminales POS" requiredPlan="starter" />
            )}
            {activeTab === 'rrhh' && (
              !canView('rrhh') ? <NoAccess /> :
              canAccess('rrhh')
                ? <RecursosHumanos />
                : <LockedModule moduleName="Recursos Humanos" requiredPlan="negocio" />
            )}
            {activeTab === 'sucursales' && (
              !canView('sucursales') ? <NoAccess /> :
              canAccess('sucursales')
                ? <SucursalesManager />
                : <LockedModule moduleName="Sucursales" requiredPlan="negocio" />
            )}
            {activeTab === 'reportes' && (
              !canView('reportes') ? <NoAccess /> :
              canAccess('reportes')
                ? <ReportesSection movements={movements} customers={customers} />
                : <LockedModule moduleName="Reportes" requiredPlan="starter" />
            )}
            {activeTab === 'conciliacion' && (
              !canView('conciliacion') ? <NoAccess /> :
              canAccess('conciliacion')
                ? <ReconciliationSection movements={movements} businessId={businessId} ownerId={userProfile?.uid || ''} rates={legacyRates as any} />
                : <LockedModule moduleName="Conciliación Bancaria" requiredPlan="negocio" isAddon />
            )}
            {activeTab === 'fiscal'  && (canView('fiscal')  ? <FiscalSection /> : <NoAccess />)}
            {activeTab === 'vision' && (
              !canView('vision') ? <NoAccess /> :
              canAccess('vision')
                ? <VisionLab movements={movements} inventory={inventoryItems as any} rates={legacyRates as any} customers={customers} />
                : <LockedModule moduleName="VisionLab IA" requiredPlan="enterprise" isAddon />
            )}
            {activeTab === 'comparar' && (
              !canView('comparar') ? <NoAccess /> :
              canAccess('comparar')
                ? <BooksComparePanel movements={movements} customers={customers} rates={legacyRates as any} />
                : <LockedModule moduleName="Comparar Libros" requiredPlan="negocio" />
            )}

            {activeTab === 'clientes' && (
              canAccess('clientes') ? (
                <CustomerViewer
                  customers={customers}
                  movements={movements}
                  rates={legacyRates as any}
                  config={{} as any}
                  onAddMovement={handleRegisterMovement}
                  onUpdateMovement={updateMovement}
                  onDeleteMovement={deleteMovement}
                  onRegisterCustomer={handleRegisterCustomer}
                  onUpdateCustomer={handleUpdateCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  getSmartRate={async () => rates.tasaBCV}
                />
              ) : <LockedModule moduleName="Clientes / CxC" requiredPlan="starter" />
            )}

            {activeTab === 'contabilidad' && (
              canAccess('contabilidad') ? (
                <AccountingSection
                  movements={movements}
                  customers={customers}
                  suppliers={suppliers}
                  employees={employees}
                  rates={legacyRates as any}
                  config={{} as any}
                  onUpdateMovement={updateMovement}
                  onDeleteMovement={deleteMovement}
                />
              ) : <LockedModule moduleName="Contabilidad" requiredPlan="starter" />
            )}

            {activeTab === 'proveedores' && (
              canAccess('proveedores') ? (
                <SupplierSection
                  suppliers={suppliers}
                  movements={movements}
                  rates={legacyRates as any}
                  onRegisterMovement={handleRegisterMovement}
                  onUpdateMovement={updateMovement}
                  onDeleteMovement={deleteMovement}
                  onRegisterSupplier={handleRegisterSupplier}
                  onUpdateSupplier={handleUpdateSupplier}
                  onDeleteSupplier={handleDeleteSupplier}
                  getSmartRate={async () => rates.tasaBCV}
                  canCreateSupplier={isAdmin}
                  canEditSupplier={isAdmin}
                  canDeleteSupplier={isAdmin}
                  canCreateMovement={true}
                  canEditMovement={isAdmin}
                  canDeleteMovement={isAdmin}
                />
              ) : <LockedModule moduleName="Proveedores / CxP" requiredPlan="negocio" />
            )}

            <Outlet />
          </div>
        </main>

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
        <LegalDisclaimerModal />
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

      {/* MODALS */}
      <UserProfileModalComp isOpen={isProfileOpen} profile={userProfile as any} onClose={() => setIsProfileOpen(false)} onSave={handleSaveProfile} />
      <DataImporter open={isImporterOpen} onClose={() => setIsImporterOpen(false)} onImport={() => {}} onImportMovements={(rows) => rows.forEach(row => handleRegisterMovement(row))} customers={customers} onCreateCustomer={handleRegisterCustomer} />

      {confirmState && <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />}

      {/* WIDGETS */}
      <SmartCalculatorWidget rates={legacyRates as any} isOpen={widgetManager.widgets.calculator.isOpen} isMinimized={widgetManager.widgets.calculator.isMinimized} position={widgetManager.widgets.calculator.position} onClose={() => widgetManager.closeWidget('calculator')} onMinimize={() => widgetManager.setMinimized('calculator', !widgetManager.widgets.calculator.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('calculator', pos)} />
      {widgetManager.widgets.notes.isOpen && <StickyNotesWidget isOpen={true} isMinimized={widgetManager.widgets.notes.isMinimized} position={widgetManager.widgets.notes.position} onClose={() => widgetManager.closeWidget('notes')} onMinimize={() => widgetManager.setMinimized('notes', !widgetManager.widgets.notes.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('notes', pos)} />}
      {widgetManager.widgets.converter.isOpen && <RateConverterWidget rates={legacyRates as any} isOpen={true} isMinimized={widgetManager.widgets.converter.isMinimized} position={widgetManager.widgets.converter.position} onClose={() => widgetManager.closeWidget('converter')} onMinimize={() => widgetManager.setMinimized('converter', !widgetManager.widgets.converter.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('converter', pos)} />}
      {widgetManager.widgets.timer.isOpen && <TimerWidget isOpen={true} isMinimized={widgetManager.widgets.timer.isMinimized} position={widgetManager.widgets.timer.position} onClose={() => widgetManager.closeWidget('timer')} onMinimize={() => widgetManager.setMinimized('timer', !widgetManager.widgets.timer.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('timer', pos)} />}
      {widgetManager.widgets.priceChecker.isOpen && <PriceCheckerWidget inventory={inventoryItems as any} rates={legacyRates as any} isOpen={true} isMinimized={widgetManager.widgets.priceChecker.isMinimized} position={widgetManager.widgets.priceChecker.position} onClose={() => widgetManager.closeWidget('priceChecker')} onMinimize={() => widgetManager.setMinimized('priceChecker', !widgetManager.widgets.priceChecker.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('priceChecker', pos)} />}
      {widgetManager.widgets.todo.isOpen && <TodoListWidget isOpen={true} isMinimized={widgetManager.widgets.todo.isMinimized} position={widgetManager.widgets.todo.position} onClose={() => widgetManager.closeWidget('todo')} onMinimize={() => widgetManager.setMinimized('todo', !widgetManager.widgets.todo.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('todo', pos)} />}
      {widgetManager.widgets.chat.isOpen && <TeamChatWidget businessId={businessId} currentUserId={uid} currentUserName={user?.name} isOpen={true} isMinimized={widgetManager.widgets.chat.isMinimized} position={widgetManager.widgets.chat.position} onClose={() => widgetManager.closeWidget('chat')} onMinimize={() => widgetManager.setMinimized('chat', !widgetManager.widgets.chat.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('chat', pos)} />}
      {widgetManager.widgets.speedDial.isOpen && <SpeedDialWidget isOpen={true} isMinimized={widgetManager.widgets.speedDial.isMinimized} position={widgetManager.widgets.speedDial.position} onClose={() => widgetManager.closeWidget('speedDial')} onMinimize={() => widgetManager.setMinimized('speedDial', !widgetManager.widgets.speedDial.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('speedDial', pos)} />}

      <AIChat config={{} as any} customers={customers} employees={employees} rates={legacyRates as any} movements={movements} payrollRate={rates.tasaBCV} onRegisterMovement={handleRegisterMovement} onAddCustomer={handleRegisterCustomer} onUpdateRates={(newRates) => updateRates({ tasaBCV: newRates.bcv, tasaGrupo: newRates.grupo })} onRegisterAdvance={handleRegisterAdvance} />
    </div>
  );
};

export default MainSystem;
