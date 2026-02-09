import React, { useState, useEffect, useMemo } from 'react';
import {
  Customer,
  Movement,
  AccountType,
  MovementType,
  OperationalRecord,
  User,
  AppConfig,
  ExchangeRates,
  PaymentCurrency,
  Employee,
  Sanction,
  CashAdvance,
  Supplier,
  InventoryItem,
  PayrollReceipt,
  AuditLog,
} from '../types';

// CONTEXTO NUEVO
import { useAuth } from './context/AuthContext';

// COMPONENTES
import Sidebar from './components/Sidebar';
import SummarySection from './components/SummarySection';
import ConfigSection from './components/ConfigSection';
import AccountingSection from './components/AccountingSection';
import VisionSection from './components/VisionSection';
import SupplierSection from './components/SupplierSection';
import PayrollSection from './components/PayrollSection';
import InventorySection from './components/InventorySection';
import AIChat from './components/AIChat';
import CustomerViewer from './components/CustomerViewer';
import RateCheckModal from './components/RateCheckModal';
import DataImporter from './components/DataImporter';

// FIREBASE
import { auth, db } from './firebase/config';
import { signOut } from 'firebase/auth';
import { logAudit } from './firebase/api';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN POR DEFECTO ---
const DEFAULT_CONFIG: AppConfig = {
  companyName: 'BOUTIQUE LOS ANGELES',
  currency: 'USD',
  language: 'es',
  theme: {
    primaryColor: '#714B67',
    fontFamily: 'Inter',
    borderRadius: '0.5rem',
    darkMode: false,
    deviceMode: 'pc',
  },
  system: {
    alertThreshold: 15,
    enableAudit: true,
  },
  modules: {
    dashboard: true,
    cxc: true,
    cxp: true,
    statement: true,
    ledger: true,
    expenses: true,
    vision: true,
    reconciliation: true,
    nomina: true,
  },
};

const DEFAULT_RATES: ExchangeRates = {
  bcv: 36.5,
  grupo: 42.0,
  lastUpdated: new Date().toLocaleDateString(),
};

// Interfaz de Búsqueda
interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'Cliente' | 'Proveedor' | 'Empleado' | 'Producto' | 'Config';
  targetTab: string;
  entityId?: string;
}

const MainSystem: React.FC = () => {
  // 1. CONEXIÓN CON EL NUEVO LOGIN
  const { user: firebaseUser, userProfile } = useAuth();

  const user: User | null = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      username: firebaseUser.email || 'user',
      name: userProfile?.fullName || firebaseUser.displayName || 'Admin',
      role: userProfile?.role || 'admin',
    };
  }, [firebaseUser, userProfile]);

  const [loadingData, setLoadingData] = useState(false);

  // App State
  const [ratesConfirmed, setRatesConfirmed] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Data States
  const [config, setConfig] = useState<AppConfig>(() => {
    // 1. Clonamos la configuración por defecto
    const initialConfig = { ...DEFAULT_CONFIG };

    // 2. Buscamos si hay un color guardado en la memoria del navegador
    const savedColor = localStorage.getItem('theme_color');
    if (savedColor) {
      initialConfig.theme = { ...initialConfig.theme, primaryColor: savedColor };
    }

    // 3. Buscamos si había modo oscuro
    const savedMode = localStorage.getItem('theme_mode');
    if (savedMode) {
      initialConfig.theme = { ...initialConfig.theme, darkMode: savedMode === 'dark' };
    }

    return initialConfig;
  });

  // EFECTO PINTOR (Asegúrate de tener este también en MainSystem.tsx)
  useEffect(() => {
    document.documentElement.style.setProperty('--odoo-primary', config.theme.primaryColor);
  }, [config.theme.primaryColor]);
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES);
  const [payrollRate, setPayrollRate] = useState<number>(40.0);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<OperationalRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [advances, setAdvances] = useState<CashAdvance[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollReceipt[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Search State
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [preSelectedId, setPreSelectedId] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);

  // Sincronizar la clase "dark" global de Tailwind
  useEffect(() => {
    if (config.theme.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [config.theme.darkMode]);

  // --- DATA LOADING ---
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        setLoadingData(true);
        try {
          const customersSnap = await getDocs(collection(db, 'customers'));
          setCustomers(customersSnap.docs.map((d) => d.data() as Customer));

          const movementsSnap = await getDocs(collection(db, 'movements'));
          setMovements(movementsSnap.docs.map((d) => d.data() as Movement));

          const suppliersSnap = await getDocs(collection(db, 'suppliers'));
          setSuppliers(suppliersSnap.docs.map((d) => d.data() as Supplier));

          const employeesSnap = await getDocs(collection(db, 'employees'));
          setEmployees(employeesSnap.docs.map((d) => d.data() as Employee));

          const inventorySnap = await getDocs(collection(db, 'inventory'));
          setInventory(inventorySnap.docs.map((d) => d.data() as InventoryItem));
        } catch (error) {
          console.error('Error loading data from Firebase:', error);
        } finally {
          setLoadingData(false);
        }
      };
      fetchData();
    }
  }, [user]);

  // LOG ACTION
  const logAction = async (module: string, action: AuditLog['action'], detail: string) => {
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      user: user?.name || 'Sistema',
      module,
      action,
      detail,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    try {
      await logAudit(user?.username || null, action, { module, detail });
    } catch (e) {
      console.error('Error logging', e);
    }
  };

  // NOTIFICATIONS
  const notifications = useMemo(() => {
    const alerts: { title: string; subtitle: string; type: 'danger' | 'warning'; date: string }[] =
      [];
    const thresholdDays = config.system?.alertThreshold || 15;
    const today = new Date();

    customers.forEach((c) => {
      const customerMovs = movements.filter((m) => m.entityId === c.id);
      const debt = customerMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((s, m) => s + m.amountInUSD, 0);
      const paid = customerMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((s, m) => s + m.amountInUSD, 0);
      const balance = debt - paid;

      if (balance > 1) {
        const lastMov = customerMovs.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        if (lastMov) {
          const lastDate = new Date(lastMov.date);
          const diffTime = Math.abs(today.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > thresholdDays) {
            alerts.push({
              title: `Deuda Vencida: ${c.id}`,
              subtitle: `Debe $${balance.toFixed(2)} hace ${diffDays} días.`,
              type: 'danger',
              date: lastMov.date,
            });
          }
        }
      }
    });
    return alerts;
  }, [movements, customers, config]);

  // --- CRUD HANDLERS ---
  const handleRegisterCustomer = async (newC: Customer) => {
    setCustomers((prev) => [...prev, newC]);
    await setDoc(doc(db, 'customers', newC.id), newC);
    logAction('CLIENTES', 'CREAR', `Registró nuevo cliente: ${newC.id}`);
  };

  const handleRegisterSupplier = async (newS: Supplier) => {
    setSuppliers((prev) => [...prev, newS]);
    try {
      await setDoc(doc(db, 'suppliers', newS.id), newS);
      logAction('PROVEEDORES', 'CREAR', `Registró nuevo proveedor: ${newS.id}`);
    } catch (e) {
      console.error('Error creating supplier', e);
    }
  };

  const handleUpdateCustomer = async (id: string, updated: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
    await setDoc(doc(db, 'customers', id), updated);
    logAction('CLIENTES', 'EDITAR', `Actualizó cliente: ${id}`);
  };

  const handleDeleteCustomer = async (id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    await deleteDoc(doc(db, 'customers', id));
    logAction('CLIENTES', 'ELIMINAR', `Eliminó cliente: ${id}`);
  };

  const handleUpdateSupplier = async (id: string, updated: Supplier) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    await setDoc(doc(db, 'suppliers', id), updated);
    logAction('PROVEEDORES', 'EDITAR', `Actualizó proveedor: ${id}`);
  };

  const handleDeleteSupplier = async (id: string) => {
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    await deleteDoc(doc(db, 'suppliers', id));
    logAction('PROVEEDORES', 'ELIMINAR', `Eliminó proveedor: ${id}`);
  };

  const handleUpdateEmployee = async (id: string, updated: Employee) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? updated : e)));
    await setDoc(doc(db, 'employees', id), updated);
    logAction('NOMINA', 'EDITAR', `Modificó empleado: ${updated.name}`);
  };

  const handleDeleteEmployee = async (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    await deleteDoc(doc(db, 'employees', id));
    logAction('NOMINA', 'ELIMINAR', `Eliminó empleado ID: ${id}`);
  };

  const handleRegisterMovement = async (data: any) => {
    const safeReference = data.reference || null;
    const safeRate = Number(data.rate) || 1;
    const safeAmount = Number(data.amount) || 0;
    const safeIsSupplier = data.isSupplierMovement || false;
    const safeMetodoPago = data.metodoPago || (data.reference ? 'Transferencia' : 'Efectivo');
    const safeMontoCalculado =
      Number(data.montoCalculado) || Number(data.originalAmount) || safeAmount;

    const newMovement: Movement = {
      id: crypto.randomUUID(),
      date: data.date || new Date().toISOString().split('T')[0],
      entityId: data.customerName ? data.customerName.toUpperCase() : 'DESCONOCIDO',
      accountType: data.accountType,
      movementType: data.type,
      currency: data.currency || PaymentCurrency.USD,
      concept: data.concept || 'Operación sin detalle',
      amount: safeAmount,
      amountInUSD: safeAmount,
      rateUsed: safeRate,
      reference: safeReference,
      isSupplierMovement: safeIsSupplier,
      metodoPago: safeMetodoPago,
      montoCalculado: safeMontoCalculado,
      originalAmount: Number(data.originalAmount) || null,
    };

    // Auto-create customer
    if (!newMovement.isSupplierMovement) {
      const exists = customers.some((c) => c.id === newMovement.entityId);
      if (!exists) {
        const newCustomer: Customer = {
          id: newMovement.entityId,
          cedula: 'N/A',
          telefono: 'N/A',
          direccion: 'Cliente Rápido',
        };
        setCustomers((prev) => [...prev, newCustomer]);
        setDoc(doc(db, 'customers', newCustomer.id), newCustomer);
      }
    }

    setMovements((prev) => [newMovement, ...prev]);
    await setDoc(doc(db, 'movements', newMovement.id), newMovement);

    logAction(
      newMovement.isSupplierMovement ? 'CXP' : 'CXC',
      'CREAR',
      `Registró ${newMovement.movementType} de $${newMovement.amountInUSD.toFixed(2)} para ${
        newMovement.entityId
      }`
    );
    return 'SUCCESS';
  };

  const updateMovement = async (id: string, updated: Partial<Movement>) => {
    const safeUpdated = JSON.parse(JSON.stringify(updated));
    setMovements((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
    await updateDoc(doc(db, 'movements', id), safeUpdated);
    logAction('TESORERIA', 'EDITAR', `Corrigió movimiento ${id}`);
  };

  const deleteMovement = async (id: string) => {
    setMovements((prev) => prev.filter((m) => m.id !== id));
    await deleteDoc(doc(db, 'movements', id));
    logAction('TESORERIA', 'ELIMINAR', `Eliminó movimiento ${id}`);
  };

  const handleUpdateRates = (newRates: ExchangeRates) => {
    setRates(newRates);
    logAction('CONFIG', 'AJUSTE', `Actualizó tasas: BCV ${newRates.bcv}`);
  };

  // SEARCH LOGIC
  useEffect(() => {
    const timer = setTimeout(() => {
      if (globalSearchTerm.trim().length < 2) {
        setGlobalSearchResults([]);
        return;
      }
      const term = globalSearchTerm.toLowerCase();
      const results: SearchResult[] = [];

      customers.forEach((c) => {
        if (c.id.toLowerCase().includes(term) || c.cedula.toLowerCase().includes(term)) {
          results.push({
            id: c.id,
            title: c.id,
            subtitle: `Cliente`,
            type: 'Cliente',
            targetTab: 'clientes',
            entityId: c.id,
          });
        }
      });
      suppliers.forEach((s) => {
        if (s.id.toLowerCase().includes(term) || s.rif.toLowerCase().includes(term)) {
          results.push({
            id: s.id,
            title: s.id,
            subtitle: `Proveedor`,
            type: 'Proveedor',
            targetTab: 'proveedores',
            entityId: s.id,
          });
        }
      });
      employees.forEach((e) => {
        if (e.name.toLowerCase().includes(term) || e.lastName.toLowerCase().includes(term)) {
          results.push({
            id: e.id,
            title: `${e.name} ${e.lastName}`,
            subtitle: `Nómina`,
            type: 'Empleado',
            targetTab: 'nomina',
            entityId: e.id,
          });
        }
      });
      setGlobalSearchResults(results.slice(0, 10));
      setShowSearchResults(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearchTerm, customers, suppliers, employees]);

  const handleSearchResultClick = (result: SearchResult) => {
    setActiveTab(result.targetTab);
    if (result.entityId) {
      setPreSelectedId(result.entityId);
      setTimeout(() => setPreSelectedId(null), 1000);
    }
    setShowSearchResults(false);
    setGlobalSearchTerm('');
  };

  const handleCsvImport = (rows: { name: string; cedula: string; telefono: string }[]) => {
    rows.forEach((row) => {
      if (!row.name && !row.cedula) return;
      const id = (row.cedula || row.name || '').toUpperCase();
      if (!id) return;

      const newCustomer: Customer = {
        id,
        cedula: row.cedula || 'N/A',
        telefono: row.telefono || 'N/A',
        direccion: row.name || 'Importado CSV',
      };
      handleRegisterCustomer(newCustomer);
    });
  };

  if (loadingData || !user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50 flex-col">
        <div className="text-4xl mb-4 animate-bounce">☁️</div>
        <h2 className="text-xl font-black uppercase tracking-[0.3em]">Cargando Sistema...</h2>
      </div>
    );
  }

  // --- RENDERIZADO PRINCIPAL CORREGIDO (AQUÍ ESTÁ LA MAGIA DEL SCROLL) ---
  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-indigo-50 to-indigo-100 overflow-y-auto custom-scroll">
      {!ratesConfirmed && (
        <RateCheckModal
          currentRates={rates}
          onConfirm={(r) => {
            handleUpdateRates(r);
            setRatesConfirmed(true);
          }}
        />
      )}

      {/* Sidebar tiene su propio scroll interno si es necesario */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* CAMBIO 2: h-full y relative para que el contenido respete el alto de la pantalla */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 overflow-hidden">
        {/* TOPBAR (Fijo arriba) */}
        <header className="flex-shrink-0 bg-white/90 dark:bg-[#020617]/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 h-16 flex justify-between items-center px-6 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-700"
            >
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
            <nav className="hidden md:flex items-center text-sm font-medium text-slate-500">
              <span className="hover:text-slate-800 cursor-pointer">Sistema ERP</span>
              <i className="fa-solid fa-chevron-right text-[10px] mx-2"></i>
              <span className="text-slate-800 dark:text-white font-semibold capitalize">
                {activeTab.replace('_', ' ')}
              </span>
            </nav>
          </div>

          {/* SEARCH BAR */}
          <div className="flex-1 max-w-2xl mx-6 hidden md:block relative z-50">
            <div className="relative group">
              <input
                type="text"
                placeholder="Buscador Maestro (Ctrl+K)"
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#714B67] transition-all"
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                onFocus={() => {
                  if (globalSearchTerm.length >= 2) setShowSearchResults(true);
                }}
              />
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400"></i>
            </div>
            {showSearchResults && globalSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[400px] overflow-y-auto custom-scroll">
                {globalSearchResults.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSearchResultClick(result)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs">
                      {result.type.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        {result.title}
                      </p>
                      <p className="text-xs text-slate-500">{result.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* NOTIFICATIONS */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center relative"
              >
                <i
                  className={`fa-solid fa-bell text-xl ${
                    notifications.length > 0
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-400'
                  }`}
                ></i>
                {notifications.length > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[100]">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 font-bold text-xs uppercase text-slate-500">
                    Notificaciones
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scroll">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic">
                        Todo en orden ✅
                      </div>
                    ) : (
                      notifications.map((n, i) => (
                        <div
                          key={i}
                          className="p-4 border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          onClick={() => {
                            handleSearchResultClick({
                              id: n.title,
                              title: n.title,
                              subtitle: '',
                              type: 'Cliente',
                              targetTab: 'clientes',
                              entityId: n.title.split(': ')[1],
                            });
                            setShowNotifications(false);
                          }}
                        >
                          <p className="text-rose-600 font-bold text-xs">{n.title}</p>
                          <p className="text-slate-500 text-[10px] mt-1">{n.subtitle}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowImporter(true)}
              className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-slate-50 hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm"
            >
              <i className="fa-solid fa-file-import text-[11px]" />
              Importar
            </button>

            <div className="flex gap-4 px-4 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-right">
                <span className="block text-[9px] uppercase font-bold text-slate-400">BCV</span>
                <input
                  type="number"
                  value={rates.bcv}
                  onChange={(e) => handleUpdateRates({ ...rates, bcv: parseFloat(e.target.value) })}
                  className="w-16 bg-transparent text-right font-bold text-sm outline-none dark:text-white"
                />
              </div>
              <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
              <div className="text-right">
                <span className="block text-[9px] uppercase font-bold text-slate-400">Grupo</span>
                <input
                  type="number"
                  value={rates.grupo}
                  onChange={(e) =>
                    handleUpdateRates({ ...rates, grupo: parseFloat(e.target.value) })
                  }
                  className="w-16 bg-transparent text-right font-bold text-sm outline-none dark:text-white"
                />
              </div>
            </div>
          </div>
        </header>

        {/* CAMBIO 3: El main tiene el scroll interno */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 custom-scroll relative scroll-smooth">
          {activeTab === 'resumen' && (
            <SummarySection
              customerMovements={movements}
              records={records}
              config={config}
              rates={rates}
              customers={customers}
              suppliers={suppliers}
              onRegisterCustomer={handleRegisterCustomer}
              onRegisterSupplier={handleRegisterSupplier}
              onUpdateRates={handleUpdateRates}
              setActiveTab={setActiveTab}
              onRegisterMovement={handleRegisterMovement}
            />
          )}

          {activeTab === 'clientes' && (
            <CustomerViewer
              customers={customers}
              movements={movements}
              selectedId={preSelectedId}
              onSelectCustomer={() => {}}
              onUpdateMovement={updateMovement}
              onDeleteMovement={deleteMovement}
              onAddMovement={handleRegisterMovement}
              onRegisterCustomer={handleRegisterCustomer}
              onUpdateCustomer={handleUpdateCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              rates={rates}
            />
          )}

          {activeTab === 'proveedores' && (
            <SupplierSection
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              movements={movements}
              onRegisterMovement={handleRegisterMovement}
              onUpdateSupplier={handleUpdateSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onUpdateMovement={updateMovement}
              onDeleteMovement={deleteMovement}
              rates={rates}
            />
          )}

          {activeTab === 'contabilidad' && (
            <AccountingSection
              movements={movements}
              customers={customers}
              suppliers={suppliers}
              employees={employees}
              rates={rates}
              config={config}
              onUpdateMovement={updateMovement}
              onDeleteMovement={deleteMovement}
            />
          )}

          {activeTab === 'inventario' && (
            <InventorySection inventory={inventory} setInventory={setInventory} />
          )}

          {activeTab === 'vision' && (
            <VisionSection onImportMovements={(ms) => setMovements((prev) => [...ms, ...prev])} />
          )}

          {activeTab === 'nomina' && (
            <PayrollSection
              employees={employees}
              setEmployees={setEmployees}
              sanctions={sanctions}
              setSanctions={setSanctions}
              advances={advances}
              setAdvances={setAdvances}
              payrollRate={payrollRate}
              setPayrollRate={setPayrollRate}
              history={payrollHistory}
              setHistory={setPayrollHistory}
              onUpdateEmployee={handleUpdateEmployee}
              onDeleteEmployee={handleDeleteEmployee}
            />
          )}

          {activeTab === 'config' && (
            <ConfigSection
              config={config}
              onUpdateConfig={setConfig}
              auditLogs={auditLogs}
              userRole={user.role}
              onResetData={() => {
                if (confirm('Se borrará todo.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
            />
          )}
        </main>
      </div>

      <AIChat
        config={config}
        customers={customers}
        employees={employees}
        rates={rates}
        movements={movements}
        payrollRate={payrollRate}
        onRegisterMovement={handleRegisterMovement}
        onAddCustomer={handleRegisterCustomer}
        onUpdateRates={handleUpdateRates}
        onRegisterAdvance={(adv) => setAdvances((prev) => [adv, ...prev])}
      />

      <DataImporter
        open={showImporter}
        onClose={() => setShowImporter(false)}
        onImport={handleCsvImport}
      />
    </div>
  );
};

export default MainSystem;
