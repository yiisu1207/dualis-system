import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Movement, AppConfig, ExchangeRates, OperationalRecord, MovementType, PaymentCurrency, Customer, AccountType, Supplier } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import Autocomplete from './Autocomplete';
import OnboardingChecklist from './OnboardingChecklist';
import { scanInvoiceImage } from '../lib/ai-scanner';
import { buildClientStatus } from '../utils/clientStatus';
import EmptyState from './EmptyState';
import { useTranslation } from 'react-i18next';
import { NumericFormat } from 'react-number-format';

interface SummarySectionProps {
  customerMovements: Movement[];
  records: OperationalRecord[];
  config: AppConfig;
  rates: ExchangeRates;
    getSmartRate?: (date: string, accountType: AccountType) => Promise<number>;
    customers: Customer[];
    suppliers: Supplier[];
    onRegisterCustomer: (c: Customer) => void;
    onRegisterSupplier: (s: Supplier) => void;
  onUpdateRates: (newRates: ExchangeRates) => void;
  setActiveTab: (tab: string) => void;
    onOpenLedger?: (customerId: string) => void;
    onRegisterMovement: (data: any) => Promise<'SUCCESS' | 'DENIED' | void> | 'SUCCESS' | 'DENIED' | void;
    canCreateMovement: boolean;
    canCreateCustomer: boolean;
    canCreateSupplier: boolean;
    currentUserId?: string;
    quickAction?: {
        type: MovementType;
        target: 'CUSTOMER' | 'SUPPLIER';
        preset?: {
            amount?: number;
            concept?: string;
            customerName?: string;
        };
    } | null;
    onQuickActionHandled?: () => void;
}

const SummarySection: React.FC<SummarySectionProps> = ({ 
    customerMovements,
    records,
    setActiveTab,
    onOpenLedger,
    customers,
    suppliers,
    onRegisterCustomer,
    onRegisterSupplier,
    onRegisterMovement,
    rates,
    getSmartRate,
    canCreateMovement,
    canCreateCustomer,
    canCreateSupplier,
    currentUserId,
    quickAction,
    onQuickActionHandled
}) => {
    const { t } = useTranslation();
  
  // --- STATE FOR QUICK TERMINAL ---
    const [showQuickModal, setShowQuickModal] = useState(false);
    const [blurAmounts, setBlurAmounts] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [alertTab, setAlertTab] = useState<'OVERDUE' | 'STOCK'>('OVERDUE');
  const [quickType, setQuickType] = useState<MovementType>(MovementType.FACTURA);
  const [quickForm, setQuickForm] = useState({
      customerName: '',
      amount: '',
      accountType: AccountType.DIVISA,
      reference: '',
      concept: '',
      date: new Date().toISOString().split('T')[0],
  });
    const [quickPaymentOption, setQuickPaymentOption] = useState<'USD'|'BS'>('USD');
    const [quickTarget, setQuickTarget] = useState<'CUSTOMER'|'SUPPLIER'>('CUSTOMER');
    const [creatingInline, setCreatingInline] = useState(false);
    const [newEntity, setNewEntity] = useState<{ id: string; cedula?: string; telefonoCountry?: string; telefono?: string; direccion?: string }>({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
        const [ocrLoading, setOcrLoading] = useState(false);
        const ocrInputRef = useRef<HTMLInputElement | null>(null);
    const [quickRate, setQuickRate] = useState<number>(rates.bcv || 1);

    const hasFirstInvoice = useMemo(
        () => customerMovements.some((movement) => movement.movementType === MovementType.FACTURA),
        [customerMovements]
    );
    const checklistKey = currentUserId
        ? `onboarding_checklist_${currentUserId}`
        : 'onboarding_checklist_default';

    useEffect(() => {
        if (!quickAction) return;
        setQuickType(quickAction.type);
        setQuickTarget(quickAction.target);
        setShowQuickModal(true);
        if (quickAction.preset) {
            setQuickForm((prev) => ({
                ...prev,
                amount:
                    quickAction.preset?.amount != null
                        ? String(quickAction.preset.amount)
                        : prev.amount,
                concept: quickAction.preset?.concept ?? prev.concept,
                customerName: quickAction.preset?.customerName ?? prev.customerName,
            }));
        }
        if (onQuickActionHandled) onQuickActionHandled();
    }, [quickAction, onQuickActionHandled]);

    useEffect(() => {
        let active = true;
        const resolveRate = async () => {
            if (quickForm.accountType === AccountType.DIVISA) {
                setQuickRate(1);
                return;
            }
            if (!getSmartRate) {
                const fallback =
                    quickForm.accountType === AccountType.BCV ? rates.bcv : rates.grupo;
                setQuickRate(fallback || 1);
                return;
            }
            const rate = await getSmartRate(quickForm.date, quickForm.accountType);
            if (active) setQuickRate(rate || 1);
        };
        resolveRate();
        return () => {
            active = false;
        };
    }, [quickForm.accountType, quickForm.date, getSmartRate, rates.bcv, rates.grupo]);

  // --- ANALYTICS CALCULATIONS ---
  const cashFlow = useMemo(() => {
      const income = customerMovements
        .filter(m => m.movementType === MovementType.ABONO)
                .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      
      const expenses = records.reduce((sum, r) => sum + r.amount, 0);
      const maxVal = Math.max(income, expenses, 1);
      
      return { income, expenses, maxVal };
    }, [customerMovements, records, rates]);

  const debtDistribution = useMemo(() => {
      const debts = customerMovements.filter(m => m.movementType === MovementType.FACTURA);
            const bcvDebt = debts
                .filter(m => m.currency === PaymentCurrency.BS)
                .reduce((s, m) => s + getMovementUsdAmount(m, rates), 0);
            const usdDebt = debts
                .filter(m => m.currency === PaymentCurrency.USD)
                .reduce((s, m) => s + getMovementUsdAmount(m, rates), 0);
      const total = bcvDebt + usdDebt || 1;
      
      return { 
          bcvPercent: (bcvDebt / total) * 100, 
          usdPercent: (usdDebt / total) * 100,
          total
      };
    }, [customerMovements, rates]);

  const salesTrend = useMemo(() => {
      const today = new Date();
      const last7 = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(today.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
      });

      const data = last7.map(date => {
          const total = customerMovements
            .filter(m => m.date === date && m.movementType === MovementType.FACTURA)
                        .reduce((s, m) => s + getMovementUsdAmount(m, rates), 0);
          return total;
      });

      const max = Math.max(...data, 1);
      const points = data.map((val, i) => {
          const x = (i / (data.length - 1)) * 100;
          const y = 100 - ((val / max) * 100);
          return `${x},${y}`;
      }).join(' ');

      return { points, totalWeek: data.reduce((a,b)=>a+b, 0) };
    }, [customerMovements, rates]);

    const clientInsights = useMemo(() => {
        return customers.map((c) => {
            const movs = customerMovements.filter(
                (m) => m.entityId === c.id && !m.isSupplierMovement
            );
            return {
                customer: c,
                ...buildClientStatus(movs, rates),
            };
        });
    }, [customers, customerMovements, rates]);

    const overdueClients = useMemo(() => {
        return [...clientInsights]
            .filter((item) => item.status === 'RED' && item.balance > 0)
            .sort((a, b) => (b.daysSinceLast || 0) - (a.daysSinceLast || 0))
            .slice(0, 5);
    }, [clientInsights]);

    const handleOpenLedger = (customerId: string) => {
        if (onOpenLedger) {
            onOpenLedger(customerId);
            return;
        }
        setActiveTab('contabilidad');
    };

    const handleQuickSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!quickForm.customerName || !quickForm.amount) return;
            if (!canCreateMovement) {
                alert('No tienes permisos para registrar movimientos.');
                return;
            }

      const enteredAmount = parseFloat(quickForm.amount);
    const metodoPago = quickPaymentOption === 'BS' ? 'Transferencia' : (quickForm.reference && quickForm.reference.trim().length > 0 ? 'Transferencia' : 'Efectivo');
    const cardRate = quickForm.accountType === AccountType.DIVISA ? 1 : quickRate;
    const rate = quickPaymentOption === 'BS' ? cardRate : 1;
    const currency = quickPaymentOption === 'BS' ? PaymentCurrency.BS : PaymentCurrency.USD;
    const montoCalculado = metodoPago === 'Efectivo' ? (enteredAmount * (currency === PaymentCurrency.BS ? cardRate : 1)) : enteredAmount;

      const result = await onRegisterMovement({
          customerName: quickForm.customerName,
          date: quickForm.date || new Date().toISOString().split('T')[0],
          type: quickType,
          concept: quickForm.concept || (quickType === MovementType.FACTURA ? 'Venta Rápida' : 'Abono Rápida'),
          amount: enteredAmount,
          originalAmount: enteredAmount,
          currency: currency,
          rate: rate,
          accountType: quickForm.accountType,
          reference: quickForm.reference || null,
          metodoPago,
          isSupplierMovement: quickTarget === 'SUPPLIER',
          montoCalculado
      });
      if (result === 'DENIED') return;

      setShowQuickModal(false);
            setQuickForm({
                customerName: '',
                amount: '',
                accountType: AccountType.DIVISA,
                reference: '',
                concept: '',
                date: new Date().toISOString().split('T')[0],
            });
      alert("✅ Operación Registrada Exitosamente");
  };
  
  const handleCreateInlineCustomer = async () => {
      if (!canCreateCustomer) {
          alert('No tienes permisos para crear clientes.');
          return;
      }
      if(!newEntity.id) return alert('Nombre requerido');
      const payload: Customer = { id: newEntity.id.toUpperCase(), cedula: newEntity.cedula || 'N/A', telefono: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''), direccion: newEntity.direccion || '' };
      await onRegisterCustomer(payload);
      setQuickForm(prev => ({ ...prev, customerName: payload.id }));
      setCreatingInline(false);
      setNewEntity({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
  };

  const handleCreateInlineSupplier = async () => {
      if (!canCreateSupplier) {
          alert('No tienes permisos para crear proveedores.');
          return;
      }
      if(!newEntity.id) return alert('Nombre requerido');
      const payload: Supplier = { id: newEntity.id.toUpperCase(), rif: newEntity.cedula || 'N/A', contacto: (newEntity.telefonoCountry || '') + (newEntity.telefono || ''), categoria: 'GENERAL' };
      await onRegisterSupplier(payload);
      setQuickForm(prev => ({ ...prev, customerName: payload.id }));
      setCreatingInline(false);
      setNewEntity({ id: '', cedula: '', telefonoCountry: '+58', telefono: '', direccion: '' });
  };

  const openQuickModal = (type: MovementType) => {
      if (!canCreateMovement) {
          alert('No tienes permisos para registrar movimientos.');
          return;
      }
      setQuickType(type);
      setQuickTarget('CUSTOMER');
      setShowQuickModal(true);
  };

  const openQuickModalForSupplier = (type: MovementType) => {
      if (!canCreateMovement) {
          alert('No tienes permisos para registrar movimientos.');
          return;
      }
      setQuickType(type);
      setQuickTarget('SUPPLIER');
      setShowQuickModal(true);
  };

    const applyOcrToQuickForm = (data: any) => {
        if (!data) return;
        const targetIsSupplier = data.isSupplierMovement === true || quickTarget === 'SUPPLIER';
        setQuickTarget(targetIsSupplier ? 'SUPPLIER' : 'CUSTOMER');
        const entityName = (data.entityName || '').toString().toUpperCase();
        const amount = data.amount != null ? String(data.amount) : '';
        const concept = data.concept || '';
        const reference = data.reference || '';
        const movementType = data.movementType === 'ABONO' ? MovementType.ABONO : MovementType.FACTURA;
        setQuickType(movementType);
        setQuickForm((prev) => ({
            ...prev,
            customerName: entityName || prev.customerName,
            amount: amount || prev.amount,
            concept: concept || prev.concept,
            reference: reference || prev.reference,
            accountType: data.accountType === 'BCV' ? AccountType.BCV : data.accountType === 'GRUPO' ? AccountType.GRUPO : AccountType.DIVISA,
        }));
        if (data.currency === 'BS') setQuickPaymentOption('BS');
        if (data.currency === 'USD') setQuickPaymentOption('USD');
    };

    const amountMaskClass = blurAmounts ? 'blur-sm select-none' : '';
    const AppIcon = ({ label, icon, color, target, description }: any) => (
        <button
            onClick={() => setActiveTab(target)}
            className="p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all text-left group flex items-center gap-4 w-full h-full"
        >
            <div className={`w-12 h-12 rounded-xl ${color} text-white flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform`}>
                <i className={icon}></i>
            </div>
            <div>
                <h3 className="font-bold text-slate-800 text-sm">{label}</h3>
                <p className="text-[10px] text-slate-400 line-clamp-1">{description}</p>
            </div>
        </button>
    );

  return (
    <div className="app-section space-y-8 bg-slate-50 min-h-full">
      
      {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                                <div className="flex items-center gap-3">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{t('dashboard.headerSubtitle')}</p>
                                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t('dashboard.headerTitle')}</h1>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setBlurAmounts((prev) => !prev)}
                                            className="w-10 h-10 rounded-full bg-white text-slate-600 border border-slate-200 shadow-sm hover:text-slate-900 transition-colors"
                                            title={blurAmounts ? t('dashboard.showAmounts') : t('dashboard.hideAmounts')}
                                        >
                                            <i className={`fa-solid ${blurAmounts ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                </div>

                {/* Indicador de Tasas Rápido */}
                <div className="flex gap-4 px-4 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">BCV</p>
                        <p className="text-xl font-black text-slate-800">{rates.bcv}</p>
                    </div>
                    <div className="w-px bg-slate-200"></div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Paralelo</p>
                        <p className="text-xl font-black text-slate-800">{rates.grupo}</p>
                    </div>
                </div>
            </div>

            <OnboardingChecklist 
                storageKey={checklistKey} 
                hasFirstInvoice={hasFirstInvoice} 
                onCreateInvoice={() => openQuickModal(MovementType.FACTURA)} 
                onOpenCustomers={() => setActiveTab('clientes')} 
                onOpenConfig={() => setActiveTab('config')} 
                onOpenHelp={() => setActiveTab('help')} 
            />

            {/* SECCIÓN 1: TERMINALES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 relative overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-sm">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-slate-500">
                        <i className="fa-solid fa-bolt text-emerald-500"></i> {t('dashboard.terminals.clients')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onClick={() => openQuickModal(MovementType.FACTURA)} className="group p-4 bg-white border border-slate-100 rounded-2xl transition-all text-left hover:border-emerald-400 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">🧾</div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-slate-800">{t('dashboard.actions.newInvoice')}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('dashboard.actions.newInvoiceDesc')}</p>
                            </div>
                        </button>
                        <button onClick={() => openQuickModal(MovementType.ABONO)} className="group p-4 bg-white border border-slate-100 rounded-2xl transition-all text-left hover:border-emerald-400 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">💰</div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-slate-800">{t('dashboard.actions.registerPayment')}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('dashboard.actions.registerPaymentDesc')}</p>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="p-6 relative overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-sm">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-slate-500">
                        <i className="fa-solid fa-building text-rose-500"></i> {t('dashboard.terminals.suppliers')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onClick={() => openQuickModalForSupplier(MovementType.FACTURA)} className="group p-4 bg-white border border-slate-100 rounded-2xl transition-all text-left hover:border-rose-400 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">🧾</div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-slate-800">{t('dashboard.actions.registerExpense')}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('dashboard.actions.registerExpenseDesc')}</p>
                            </div>
                        </button>
                        <button onClick={() => openQuickModalForSupplier(MovementType.ABONO)} className="group p-4 bg-white border border-slate-100 rounded-2xl transition-all text-left hover:border-rose-400 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">💸</div>
                            <div>
                                <h3 className="text-sm font-black uppercase text-slate-800">{t('dashboard.actions.registerSupplierPayment')}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('dashboard.actions.registerSupplierPaymentDesc')}</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* ATENCIÓN REQUERIDA */}
            <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">{t('dashboard.attention.title')}</h3>
                        <p className="text-xs text-slate-400 font-bold">{t('dashboard.attention.subtitle')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setAlertTab('OVERDUE')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-colors ${alertTab === 'OVERDUE' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>🔴 {t('dashboard.attention.overdue')}</button>
                        <button type="button" onClick={() => setAlertTab('STOCK')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-colors ${alertTab === 'STOCK' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>🟡 {t('dashboard.attention.stock')}</button>
                    </div>
                </div>

                <div className="mt-5">
                    {alertTab === 'OVERDUE' ? (
                        overdueClients.length === 0 ? (
                            <EmptyState icon="🎉" title={t('dashboard.empty.title')} description={t('dashboard.empty.description')} actionLabel={t('dashboard.empty.cobranzas')} onAction={() => setActiveTab('clientes')} />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {overdueClients.map((item) => (
                                    <button key={item.customer.id} type="button" onClick={() => handleOpenLedger(item.customer.id)} className="p-4 rounded-2xl border border-rose-100 bg-rose-50 text-left hover:shadow-md transition-all">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-rose-700 uppercase">{item.customer.id}</p>
                                                <p className="text-[10px] text-slate-400 font-bold">{item.daysSinceLast ?? 0} dias sin movimiento</p>
                                            </div>
                                            <div className={`text-sm font-black text-slate-800 ${amountMaskClass}`}>{formatCurrency(item.balance, '$')}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : (
                        <EmptyState icon="📦" title={t('dashboard.empty.title')} description={t('dashboard.empty.description')} actionLabel={t('dashboard.empty.inventario')} onAction={() => setActiveTab('inventario')} />
                    )}
                </div>
            </div>

      {/* ANALÍTICA */}
      <div>
             <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                 <i className="fa-solid fa-chart-pie text-indigo-500"></i> {t('dashboard.visionLab')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col shadow-sm">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Flujo de Caja</h4>
                  <div className="flex items-end justify-center gap-8 h-32 mt-auto pb-2 px-4">
                      <div className="w-12 flex flex-col items-center gap-2 group">
                          <span className={`text-[10px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity ${amountMaskClass}`}>{formatCurrency(cashFlow.income, '$')}</span>
                          <div className="w-full bg-emerald-50 rounded-t-lg relative overflow-hidden" style={{height: '100px'}}><div className="absolute bottom-0 w-full bg-emerald-500 transition-all duration-1000" style={{ height: `${(cashFlow.income / cashFlow.maxVal) * 100}%` }}></div></div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Ingresos</span>
                      </div>
                      <div className="w-12 flex flex-col items-center gap-2 group">
                          <span className={`text-[10px] font-bold text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity ${amountMaskClass}`}>{formatCurrency(cashFlow.expenses, '$')}</span>
                          <div className="w-full bg-rose-50 rounded-t-lg relative overflow-hidden" style={{height: '100px'}}><div className="absolute bottom-0 w-full bg-rose-500 transition-all duration-1000" style={{ height: `${(cashFlow.expenses / cashFlow.maxVal) * 100}%` }}></div></div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Egresos</span>
                      </div>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col items-center justify-center relative shadow-sm">
                  <h4 className="absolute top-6 left-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cartera</h4>
                  <div className="w-32 h-32 rounded-full relative flex items-center justify-center mt-4" style={{ background: `conic-gradient(#3B82F6 0% ${debtDistribution.bcvPercent}%, #10B981 ${debtDistribution.bcvPercent}% 100%)` }}>
                       <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center z-10"><span className="text-[9px] text-slate-400 font-bold">Total</span><span className={`text-xs font-black text-slate-800 ${amountMaskClass}`}>{formatCurrency(debtDistribution.total, '$')}</span></div>
                  </div>
                  <div className="flex gap-4 mt-6 w-full justify-center">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-blue-500 rounded-full"></div><span className="text-[9px] font-bold text-slate-500">BCV</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div><span className="text-[9px] font-bold text-slate-500">Divisa</span></div>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col shadow-sm">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ventas 7 Días</h4>
                   <p className="text-2xl font-black text-slate-800 mb-4"><span className={amountMaskClass}>{formatCurrency(salesTrend.totalWeek, '$')}</span></p>
                   <div className="flex-1 w-full h-24 relative">
                       <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full"><polyline fill="none" stroke="#6366f1" strokeWidth="3" points={salesTrend.points} vectorEffect="non-scaling-stroke" strokeLinecap="round" /></svg>
                   </div>
              </div>
          </div>
      </div>

      {/* ATAJOS */}
      <div>
          <h3 className="text-sm font-bold text-slate-700 mt-8 mb-4">{t('dashboard.shortcuts.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
              <AppIcon label={t('menu.cobranzas')} icon="fa-solid fa-folder-tree" color="bg-indigo-600" target="clientes" description={t('dashboard.shortcuts.cobranzasDesc')} />
              <AppIcon label={t('menu.contabilidad')} icon="fa-solid fa-book-journal-whills" color="bg-purple-600" target="contabilidad" description={t('dashboard.shortcuts.contabilidadDesc')} />
              <AppIcon label={t('menu.cxp')} icon="fa-solid fa-file-invoice-dollar" color="bg-blue-600" target="proveedores" description={t('dashboard.shortcuts.cxpDesc')} />
              <AppIcon label={t('menu.inventario')} icon="fa-solid fa-boxes-stacked" color="bg-emerald-600" target="inventario" description={t('dashboard.shortcuts.inventarioDesc')} />
          </div>
      </div>

      {/* MODAL OPERACIÓN RÁPIDA */}
      {showQuickModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
           <form onSubmit={handleQuickSubmit} className="bg-white rounded-[2rem] p-8 w-full max-w-md animate-in zoom-in shadow-2xl border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{quickType === MovementType.FACTURA ? 'Nueva Factura' : 'Registrar Abono'}</h3>
                  <button type="button" onClick={() => setShowQuickModal(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="space-y-4">
                  <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{quickTarget === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}</label>
                      <Autocomplete items={quickTarget === 'CUSTOMER' ? customers : suppliers} stringify={(i: any) => i.id} secondary={(i: any) => quickTarget === 'CUSTOMER' ? i.cedula || '' : i.rif || ''} placeholder="Buscar..." value={quickForm.customerName} onChange={(v) => setQuickForm({...quickForm, customerName: v})} onSelect={(it: any) => setQuickForm({...quickForm, customerName: it.id})} onCreate={(label: string) => { setCreatingInline(true); setNewEntity(prev => ({ ...prev, id: label })); return Promise.resolve(); }} />
                  </div>

                  {creatingInline && (
                    <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                        <input className="app-input w-full font-bold" value={newEntity.id} onChange={e => setNewEntity({...newEntity, id: e.target.value})} placeholder="Nombre" />
                        <input className="app-input w-full" placeholder="Cédula / RIF" value={newEntity.cedula} onChange={e => setNewEntity({...newEntity, cedula: e.target.value})} />
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setCreatingInline(false)} className="text-xs font-bold text-slate-400 uppercase">Cancelar</button>
                            <button type="button" onClick={() => quickTarget === 'CUSTOMER' ? handleCreateInlineCustomer() : handleCreateInlineSupplier()} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-black uppercase">Crear</button>
                        </div>
                    </div>
                  )}

                  <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Monto</label>
                      <NumericFormat value={quickForm.amount} onValueChange={(values) => setQuickForm({ ...quickForm, amount: values.value || '' })} thousandSeparator="." decimalSeparator="," decimalScale={2} className="app-input w-full font-black text-2xl" placeholder="0,00" required />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cuenta</label>
                          <select className="app-input w-full text-xs font-bold" value={quickForm.accountType} onChange={e => setQuickForm({...quickForm, accountType: e.target.value as AccountType})}>
                              <option value={AccountType.DIVISA}>Divisa ($)</option>
                              <option value={AccountType.BCV}>Bolívares (BCV)</option>
                              <option value={AccountType.GRUPO}>Bolívares (P.)</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Pago</label>
                          <select className="app-input w-full text-xs font-bold" value={quickPaymentOption} onChange={e => setQuickPaymentOption(e.target.value as any)}>
                              <option value="USD">Efectivo</option>
                              <option value="BS">Transferencia</option>
                          </select>
                      </div>
                  </div>
              </div>

              <button type="submit" className={`mt-8 w-full py-4 rounded-xl font-black text-white text-xs uppercase tracking-widest shadow-lg ${quickType === MovementType.FACTURA ? 'bg-indigo-600' : 'bg-emerald-600'}`}>Confirmar</button>
           </form>
        </div>
      )}

    </div>
  );
};

export default SummarySection;
