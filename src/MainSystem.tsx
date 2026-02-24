import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams, Outlet } from 'react-router-dom';
import {
  Customer,
  Movement,
  AccountType,
  MovementType,
  User,
  AppConfig,
  ExchangeRates,
  PaymentCurrency,
  Employee,
  CashAdvance,
  Supplier,
  PayrollReceipt,
} from '../types';

// CONTEXTO NUEVO
import { useAuth } from './context/AuthContext';
import { useRates } from './context/RatesContext';
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
import WidgetDock from './components/WidgetDock';
import HelpCenter from './components/HelpCenter';
import WidgetLaunchpad from './components/WidgetLaunchpad';
import AdminPosManager from './pages/AdminPosManager';

// FIREBASE
import { auth, db } from './firebase/config';
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';

type ConfigTabId =
  | 'EMPRESA'
  | 'USUARIOS'
  | 'PERSONALIZACION'
  | 'SISTEMA'
  | 'MENSAJES'
  | 'AUDITORIA';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'Cliente' | 'Proveedor' | 'Empleado' | 'Producto' | 'Config' | 'Ruta' | 'Accion';
  targetTab?: string;
  targetConfigTab?: ConfigTabId;
  entityId?: string;
  action?: () => void;
}

type TopbarProps = {
  topbarTitle: string;
  t: (key: string) => string;
  i18n: any;
  onOpenSidebar: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  globalSearchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchBlur: () => void;
  onSearchFocus: () => void;
  showSearchResults: boolean;
  globalSearchResults: SearchResult[];
  onSearchResultClick: (result: SearchResult) => void;
  notifications: Array<{ title: string; subtitle: string }>;
  showNotifications: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  onOpenCalculator: () => void;
  canImport: boolean;
  onOpenImporter: () => void;
  canManageRates: boolean;
  isOnline: boolean;
  pendingWrites: number;
  syncError: string | null;
  lastSyncAt: string | null;
};

const Topbar: React.FC<TopbarProps> = React.memo(
  ({
    topbarTitle,
    t,
    i18n,
    onOpenSidebar,
    searchInputRef,
    globalSearchTerm,
    onSearchTermChange,
    onSearchBlur,
    onSearchFocus,
    showSearchResults,
    globalSearchResults,
    onSearchResultClick,
    notifications,
    showNotifications,
    onToggleNotifications,
    onCloseNotifications,
    onOpenCalculator,
    canImport,
    onOpenImporter,
    canManageRates,
    isOnline,
    pendingWrites,
    syncError,
    lastSyncAt,
  }) => {
    const { rates, updateRates } = useRates();

    return (
      <header className="h-14 app-topbar flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenSidebar}
            className="lg:hidden text-slate-500 hover:text-slate-700"
          >
            <i className="fa-solid fa-bars text-xl"></i>
          </button>
          <nav className="hidden md:flex items-center text-sm font-medium text-slate-500">
            <span className="hover:text-slate-900 cursor-pointer">
              {t('app.name')}
            </span>
            <i className="fa-solid fa-chevron-right text-[10px] mx-2"></i>
            <span className="text-slate-900 font-semibold">
              {topbarTitle}
            </span>
          </nav>
        </div>

        <div className="flex-1 max-w-2xl mx-6 hidden md:block relative z-50">
          <div className="relative group">
            <input
              type="text"
              placeholder="Buscador Maestro (Ctrl+K)"
              className="w-full app-input pl-10 pr-4 text-sm"
              ref={searchInputRef as any}
              value={globalSearchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              onBlur={onSearchBlur}
              onFocus={onSearchFocus}
            />
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400"></i>
          </div>
          {showSearchResults && globalSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 app-card overflow-hidden max-h-[400px] overflow-y-auto custom-scroll">
              {globalSearchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => onSearchResultClick(result)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                    {result.type.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {result.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {result.subtitle}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="h-10 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300"
              title={t('language.label')}
            >
              <option value="es">{t('language.es')}</option>
              <option value="en">{t('language.en')}</option>
              <option value="ar">{t('language.ar')}</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenCalculator}
            className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center"
            title="Calculadora inteligente"
          >
            <i className="fa-solid fa-calculator text-lg text-slate-600"></i>
          </button>

          <div className="flex gap-4 px-4 py-1.5 app-chip rounded-xl">
            <div className="text-right">
              <span className="block text-[9px] uppercase font-bold text-slate-400">BCV</span>
              <input
                type="number"
                value={rates.tasaBCV}
                onChange={(e) => updateRates({ tasaBCV: parseFloat(e.target.value) })}
                disabled={!canManageRates}
                className={`w-16 bg-transparent text-right font-bold text-sm outline-none ${
                  canManageRates ? '' : 'cursor-not-allowed text-slate-400'
                }`}
              />
            </div>
            <div className="w-px bg-slate-200"></div>
            <div className="text-right">
              <span className="block text-[9px] uppercase font-bold text-slate-400">Grupo</span>
              <input
                type="number"
                value={rates.tasaGrupo}
                onChange={(e) => updateRates({ tasaGrupo: parseFloat(e.target.value) })}
                disabled={!canManageRates}
                className={`w-16 bg-transparent text-right font-bold text-sm outline-none ${
                  canManageRates ? '' : 'cursor-not-allowed text-slate-400'
                }`}
              />
            </div>
          </div>
        </div>
      </header>
    );
  }
);

const MainSystem: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const { user: firebaseUser, userProfile } = useAuth();
  const { rates, updateRates } = useRates();
  const location = useLocation();
  const navigate = useNavigate();
  const widgetManager = useWidgetManager();
  const { t, i18n } = useTranslation();
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // URL Multi-tenant
  const { empresa_id } = useParams<{ empresa_id: string }>();
  const adminBase = empresa_id ? `/${empresa_id}/admin` : '';

  const [activeTab, setActiveTab] = useState<string>(initialTab || 'resumen');

  const user: User | null = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      username: firebaseUser.email || 'user',
      name: userProfile?.displayName || userProfile?.fullName || firebaseUser.displayName || 'Admin',
      role: userProfile?.role || 'admin',
    };
  }, [firebaseUser, userProfile]);

  const businessId = userProfile?.businessId || '';
  const role = user?.role || 'pending';
  const isAdmin = role === 'owner' || role === 'admin';

  // DATA STATES
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<CashAdvance[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollReceipt[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const { updateUserProfile } = useAuth();

  const handleSaveProfile = async (patch: any) => {
    if (!firebaseUser) return;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), patch);
      updateUserProfile(patch);
      setIsProfileOpen(false);
      alert('Perfil actualizado con éxito');
    } catch (e) {
      console.error(e);
      alert('Error al actualizar perfil');
    }
  };

  // LÓGICA DE BÚSQUEDA GLOBAL
  const globalSearchResults = useMemo(() => {
    if (!globalSearchTerm) return [];
    const term = globalSearchTerm.toLowerCase();
    const results: SearchResult[] = [];

    // Buscar en Clientes
    customers.forEach(c => {
      if ((c.cedula || '').toLowerCase().includes(term) || (c.id || '').toLowerCase().includes(term)) {
        results.push({ id: c.id, title: c.cedula, subtitle: 'Cliente', type: 'Cliente', targetTab: 'clientes' });
      }
    });

    // Buscar en Rutas/Módulos
    const modules = [
      { title: 'Ventas y Cobranzas', tab: 'clientes' },
      { title: 'Inventario de Productos', tab: 'inventario' },
      { title: 'Recursos Humanos', tab: 'rrhh' },
      { title: 'Configuración del Sistema', tab: 'config' },
      { title: 'Vision Lab Analytics', tab: 'vision' }
    ];
    modules.forEach(m => {
      if (m.title.toLowerCase().includes(term)) {
        results.push({ id: m.tab, title: m.title, subtitle: 'Módulo', type: 'Ruta', targetTab: m.tab });
      }
    });

    return results.slice(0, 10);
  }, [globalSearchTerm, customers]);

  const handleSearchResultClick = (result: SearchResult) => {
    if (result.targetTab) {
      setActiveTab(result.targetTab);
      navigate(tabRoutes[result.targetTab]);
    }
    setGlobalSearchTerm('');
    setShowSearchResults(false);
  };
  useEffect(() => {
    if (!businessId) return;

    const qCust = query(collection(db, 'customers'), where('businessId', '==', businessId));
    const unsubCust = onSnapshot(qCust, (snap) => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    const qSupp = query(collection(db, 'suppliers'), where('businessId', '==', businessId));
    const unsubSupp = onSnapshot(qSupp, (snap) => setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    const qMov = query(collection(db, 'movements'), where('businessId', '==', businessId), orderBy('date', 'desc'), limit(200));
    const unsubMov = onSnapshot(qMov, (snap) => setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    const qEmp = query(collection(db, `businesses/${businessId}/employees`), orderBy('name', 'asc'));
    const unsubEmp = onSnapshot(qEmp, (snap) => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    const qAdv = query(collection(db, `businesses/${businessId}/payroll_advances`), orderBy('date', 'desc'));
    const unsubAdv = onSnapshot(qAdv, (snap) => setAdvances(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    const qHist = query(collection(db, `businesses/${businessId}/payroll_history`), orderBy('date', 'desc'), limit(24));
    const unsubHist = onSnapshot(qHist, (snap) => setPayrollHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))));

    return () => { 
      unsubCust(); unsubSupp(); unsubMov(); unsubEmp(); unsubAdv(); unsubHist();
    };
  }, [businessId]);

  const handleRegisterMovement = async (data: any) => {
    if (!businessId) return '';
    const docRef = await addDoc(collection(db, 'movements'), { ...data, businessId, createdAt: new Date().toISOString() });
    return docRef.id;
  };

  const updateMovement = async (id: string, updated: Partial<Movement>) => {
    await updateDoc(doc(db, 'movements', id), updated);
  };

  const deleteMovement = async (id: string) => {
    if (confirm('¿Eliminar movimiento?')) await deleteDoc(doc(db, 'movements', id));
  };

  const handleRegisterCustomer = async (c: Customer) => {
    await addDoc(collection(db, 'customers'), { ...c, businessId });
  };

  const handleUpdateCustomer = async (id: string, c: Customer) => {
    await updateDoc(doc(db, 'customers', id), c as any);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (confirm('¿Eliminar cliente?')) await deleteDoc(doc(db, 'customers', id));
  };

  // PROVEEDORES HANDLERS
  const handleRegisterSupplier = async (s: Supplier) => {
    await addDoc(collection(db, 'suppliers'), { ...s, businessId });
  };
  const handleUpdateSupplier = async (id: string, s: Supplier) => {
    await updateDoc(doc(db, 'suppliers', id), s as any);
  };
  const handleDeleteSupplier = async (id: string) => {
    if (confirm('¿Eliminar proveedor?')) await deleteDoc(doc(db, 'suppliers', id));
  };

  // RRHH HANDLERS
  const handleRegisterEmployee = async (emp: any) => {
    await addDoc(collection(db, `businesses/${businessId}/employees`), { ...emp, businessId });
  };
  const handleUpdateEmployee = async (id: string, emp: any) => {
    await updateDoc(doc(db, `businesses/${businessId}/employees`, id), emp);
  };
  const handleDeleteEmployee = async (id: string) => {
    await deleteDoc(doc(db, `businesses/${businessId}/employees`, id));
  };
  const handleRegisterAdvance = async (adv: any) => {
    await addDoc(collection(db, `businesses/${businessId}/payroll_advances`), { ...adv, businessId });
  };
  const handleRegisterPayrollCycle = async (receipt: any) => {
    await addDoc(collection(db, `businesses/${businessId}/payroll_history`), { ...receipt, businessId });
  };

  const tabRoutes: Record<string, string> = {
    resumen: `${adminBase}/dashboard`,
    clientes: `${adminBase}/cobranzas`,
    contabilidad: `${adminBase}/contabilidad`,
    proveedores: `${adminBase}/cxp`,
    rrhh: `${adminBase}/rrhh`,
    inventario: `${adminBase}/inventario`,
    vision: `${adminBase}/vision`,
    widgets: `${adminBase}/widgets`,
    comparar: `${adminBase}/comparar`,
    tasas: `${adminBase}/tasas`,
    cajas: `${adminBase}/cajas`,
    config: `${adminBase}/configuracion`,
    help: `${adminBase}/help`,
  };

  useEffect(() => {
    const path = location.pathname;
    Object.entries(tabRoutes).forEach(([tab, route]) => {
      if (path === route || path.startsWith(route + '/')) {
        setActiveTab(tab);
      }
    });
  }, [location.pathname, adminBase]);

  const handleLogout = () => auth.signOut();

  // Compatibilidad con componentes legacy que esperan rates con bcv/grupo
  const legacyRates = { bcv: rates.tasaBCV, grupo: rates.tasaGrupo, lastUpdated: rates.lastUpdated };

  return (
    <div className="h-screen w-full flex bg-slate-50 overflow-hidden font-inter">
      {user && (
        <Sidebar
          activeTab={activeTab}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          user={user}
          config={{ companyName: userProfile?.businessId } as any}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar
          topbarTitle={activeTab.toUpperCase()}
          t={t}
          i18n={i18n}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          searchInputRef={searchInputRef}
          globalSearchTerm={globalSearchTerm}
          onSearchTermChange={setGlobalSearchTerm}
          onSearchBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
          onSearchFocus={() => setShowSearchResults(true)}
          showSearchResults={showSearchResults}
          globalSearchResults={globalSearchResults}
          onSearchResultClick={handleSearchResultClick}
          notifications={[]}
          showNotifications={false}
          onToggleNotifications={() => {}}
          onCloseNotifications={() => {}}
          onOpenCalculator={() => widgetManager.openWidget('calculator')}
          canImport={isAdmin}
          onOpenImporter={() => setIsImporterOpen(true)}
          canManageRates={isAdmin}
          isOnline={navigator.onLine}
          pendingWrites={0}
          syncError={null}
          lastSyncAt={null}
        />

        <main className="flex-1 overflow-y-auto p-6 relative">
          <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'resumen' && (
              <AdminDashboard onTabChange={(tab) => {
                setActiveTab(tab);
                navigate(tabRoutes[tab]);
              }} />
            )}
            {activeTab === 'widgets' && <WidgetLaunchpad />}
            {activeTab === 'inventario' && <Inventario />}
            {activeTab === 'config' && <Configuracion />}
            {activeTab === 'cajas' && <AdminPosManager />}
            {activeTab === 'rrhh' && <RecursosHumanos />}
            {activeTab === 'help' && <HelpCenter />}
            {activeTab === 'vision' && <VisionLab movements={movements} />}
            {activeTab === 'tasas' && <RateHistoryWall rates={legacyRates as any} />}
            {activeTab === 'comparar' && <BooksComparePanel movements={movements} customers={customers} rates={legacyRates as any} />}
            
            {activeTab === 'clientes' && (
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
            )}

            {activeTab === 'contabilidad' && (
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
            )}

            {activeTab === 'proveedores' && (
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
            )}

            <Outlet />
          </div>
        </main>
      </div>

      <UserProfileModalComp 
        isOpen={isProfileOpen} 
        profile={userProfile as any} 
        onClose={() => setIsProfileOpen(false)} 
        onSave={handleSaveProfile} 
      />

      <DataImporter 
        open={isImporterOpen} 
        onClose={() => setIsImporterOpen(false)} 
        onImport={() => {}} 
        onImportMovements={(rows) => {
          rows.forEach(row => handleRegisterMovement(row));
        }}
        customers={customers}
        onCreateCustomer={handleRegisterCustomer}
      />

      <SmartCalculatorWidget rates={legacyRates as any} isOpen={widgetManager.widgets.calculator.isOpen} isMinimized={widgetManager.widgets.calculator.isMinimized} position={widgetManager.widgets.calculator.position} onClose={() => widgetManager.closeWidget('calculator')} onMinimize={() => widgetManager.setMinimized('calculator', !widgetManager.widgets.calculator.isMinimized)} onPositionChange={(pos) => widgetManager.setPosition('calculator', pos)} />
      <AIChat 
        config={{} as any}
        customers={customers}
        employees={employees}
        rates={legacyRates as any}
        movements={movements}
        payrollRate={rates.tasaBCV}
        onRegisterMovement={handleRegisterMovement}
        onAddCustomer={handleRegisterCustomer}
        onUpdateRates={(newRates) => updateRates({ tasaBCV: newRates.bcv, tasaGrupo: newRates.grupo })}
        onRegisterAdvance={handleRegisterAdvance}
      />
    </div>
  );
};

export default MainSystem;
