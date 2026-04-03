import React, { useState, useMemo, useEffect, useRef } from 'react';
import { NumericFormat } from 'react-number-format';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  Movement,
  MovementType,
  ExchangeRates,
  AppConfig,
  Customer,
  Supplier,
  Employee,
  AccountType,
  PaymentCurrency,
} from '../../types';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { AlertTriangle, BarChart3, Clock, Copy, Receipt, Info, LayoutList, Gauge } from 'lucide-react';
import { calcCreditScore } from './cxc/cxcHelpers';
import { buildClientStatus } from '../utils/clientStatus';
import ClientStatusBadge from './ClientStatusBadge';
import WhatsAppTemplateModal, { TemplateContext } from './WhatsAppTemplateModal';
import { DEFAULT_CONFIG } from '../utils/configDefaults';
import { useToast } from '../context/ToastContext';
import { useRates } from '../context/RatesContext';
import { useSubscription } from '../hooks/useSubscription';
import CxCClientProfile from './cxc/CxCClientProfile';
import CxPSupplierProfile from './cxc/CxPSupplierProfile';
import CxCLedgerTable from './cxc/CxCLedgerTable';

interface AccountingSectionProps {
  movements: Movement[];
  customers: Customer[];
  suppliers?: Supplier[];
  employees?: Employee[];
  rates: ExchangeRates;
  config: AppConfig;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
  onNavigateToCustomers?: () => void;
  onNavigateToSuppliers?: () => void;
  openEntityId?: string | null;
}

type ViewMode = 'DIRECTORY' | 'PROFILE' | 'SUPPLIER_PROFILE' | 'DETAIL';
type TabFilter = 'ALL' | AccountType;
type EntityTypeFilter = 'ALL' | 'CLIENTE' | 'PROVEEDOR' | 'NÓMINA' | 'CATALOGO';

const AccountingSection: React.FC<AccountingSectionProps> = ({
  movements,
  customers,
  suppliers = [],
  employees = [],
  rates,
  config,
  onUpdateMovement,
  onDeleteMovement,
  onNavigateToCustomers,
  onNavigateToSuppliers,
  openEntityId,
}) => {
  const { success, error, warning, info } = useToast();
  const { user } = useAuth();
  const { customRates } = useRates();
  const derivedBusinessId = movements[0]?.businessId || '';
  const { canAccess } = useSubscription(derivedBusinessId);
  const hasDynamicPricing = canAccess('precios_dinamicos');
  // --- STATE ---
  const [viewMode, setViewMode] = useState<ViewMode>('DIRECTORY');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
  const [entityFilter, setEntityFilter] = useState<EntityTypeFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByBalance, setSortByBalance] = useState<'none' | 'debt-desc'>('none');
  const [receivableOnly, setReceivableOnly] = useState(false);
  const [receivableAccountFilter, setReceivableAccountFilter] = useState<'ALL' | AccountType>('ALL');
  const [detailRangeFilter, setDetailRangeFilter] = useState<
    'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'CUSTOM'
  >('ALL');
  const [detailRangeFrom, setDetailRangeFrom] = useState('');
  const [detailRangeTo, setDetailRangeTo] = useState('');
  const detailTableRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedEntityRef = useRef<string | null>(null);
  const [shareMenuDetailAccount, setShareMenuDetailAccount] = useState<TabFilter>('ALL');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<TemplateContext>({});
  const [shareToast, setShareToast] = useState<string | null>(null);
  const shareToastTimerRef = useRef<number | null>(null);
  const messageTemplates =
    config.messageTemplates && config.messageTemplates.length > 0
      ? config.messageTemplates
      : DEFAULT_CONFIG.messageTemplates || [];

  const [viewStyle, setViewStyle] = useState<'lista' | 'semaforo'>('lista');

  // Abono directo modal
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoAccount, setAbonoAccount] = useState<AccountType>(AccountType.BCV);
  const [abonoMethod, setAbonoMethod] = useState('Transferencia');
  const [abonoRef, setAbonoRef] = useState('');
  const [abonoNote, setAbonoNote] = useState('');
  const [abonoLoading, setAbonoLoading] = useState(false);

  useEffect(() => {
    if (entityFilter !== 'CLIENTE') {
      setReceivableOnly(false);
      setReceivableAccountFilter('ALL');
    }
  }, [entityFilter]);

  useEffect(() => {
    if (!openEntityId) return;
    setSelectedEntityId(openEntityId);
    const isClient = customers.some((c) => c.id === openEntityId);
    setViewMode(isClient ? 'PROFILE' : 'SUPPLIER_PROFILE');
  }, [openEntityId, customers]);

  useEffect(() => {
    if (viewMode !== 'DETAIL' || !selectedEntityId) return;
    if (lastSelectedEntityRef.current !== selectedEntityId) {
      setShareMenuDetailAccount(activeTab);
      lastSelectedEntityRef.current = selectedEntityId;
    }
  }, [viewMode, selectedEntityId, activeTab]);

  useEffect(() => {
    if (!shareToast) return;
    if (shareToastTimerRef.current) {
      window.clearTimeout(shareToastTimerRef.current);
    }
    shareToastTimerRef.current = window.setTimeout(() => {
      setShareToast(null);
      shareToastTimerRef.current = null;
    }, 3500);
  }, [shareToast]);

  // --- EDITING STATE ---
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [editForm, setEditForm] = useState<{
    date: string;
    concept: string;
    amount: string;
    currency: string;
    rateUsed: string;
  } | null>(null);

  // --- LOGIC: DIRECTORY (LEVEL 1) ---
  const allEntities = useMemo(() => {
    // 1. Get all unique Entity IDs (movements + base directory)
    const uniqueIds: string[] = Array.from(
      new Set([
        ...movements.map((m) => m.entityId).filter(id => id !== 'CONSUMIDOR_FINAL'),
        ...customers.map((c) => c.id),
        ...suppliers.map((s) => s.id),
      ])
    );

    // 2. Build summary objects
    const summaries = uniqueIds.map((id) => {
      // Determine Type & Color Logic (Matching Screenshot Description)
      let type: EntityTypeFilter | 'OTRO' = 'OTRO';
      let typeColor = 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 border-slate-200 dark:border-white/10'; // Default

      if (suppliers.some((s) => s.id === id)) {
        type = 'PROVEEDOR';
        typeColor = 'bg-orange-50 text-orange-600 border-orange-200'; // Orange for Suppliers
      } else if (customers.some((c) => c.id === id)) {
        type = 'CLIENTE';
        typeColor = 'bg-blue-50 text-blue-600 border-blue-200'; // Blue for Customers
      } else if (employees.some((e) => id.includes(e.name.toUpperCase()))) {
        type = 'NÓMINA';
        typeColor = 'bg-purple-50 text-purple-600 border-purple-200'; // Purple for Payroll
      }

      // Calculate Total Global Balance (All Accounts)
      const entityMovs = movements.filter((m) => m.entityId === id);
      const totalDebt = entityMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = entityMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const globalBalance = totalDebt - totalPaid;

      const sumByAccount = (accountType: AccountType) => {
        const accountMovs = entityMovs.filter((m) => m.accountType === accountType);
        const accountDebt = accountMovs
          .filter((m) => m.movementType === MovementType.FACTURA)
          .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
        const accountPaid = accountMovs
          .filter((m) => m.movementType === MovementType.ABONO)
          .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
        return accountDebt - accountPaid;
      };

      const balances = {
        bcv: sumByAccount(AccountType.BCV),
        grupo: sumByAccount(AccountType.GRUPO),
        divisa: sumByAccount(AccountType.DIVISA),
      };

      const sortedByDate = [...entityMovs].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const customer = type === 'CLIENTE' ? customers.find((c) => c.id === id) : null;
      const clientStatus =
        type === 'CLIENTE'
          ? buildClientStatus(entityMovs, rates, new Date(), {
              customerCreatedAt: customer?.createdAt || null,
            })
          : null;

      return {
        id,
        type,
        typeColor,
        globalBalance,
        balances,
        lastMov: sortedByDate[sortedByDate.length - 1]?.date,
        firstMov: sortedByDate[0]?.date,
        totalDebt,
        totalPaid,
        tags: clientStatus?.tags || null,
      };
    });

    return summaries;
  }, [movements, customers, suppliers, employees, rates]);

  const directoryData = useMemo(() => {
    // 3. Filter by Type and Search
    let filtered = allEntities
      .filter((s) => {
        if (entityFilter === 'ALL') return true;
        if (entityFilter === 'CATALOGO') return s.type === 'CLIENTE' || s.type === 'PROVEEDOR';
        return s.type === entityFilter;
      })
      .filter((s) => s.id.toLowerCase().includes(searchTerm.toLowerCase()));

    if (receivableOnly) {
      filtered = filtered.filter((s) => s.type === 'CLIENTE' && s.globalBalance > 0.01);
    }

    if (receivableAccountFilter !== 'ALL') {
      filtered = filtered.filter(
        (s: any) => (s.balances?.[receivableAccountFilter.toLowerCase()] || 0) > 0.01
      );
    }

    if (sortByBalance === 'debt-desc') {
      filtered = [...filtered].sort((a, b) => Math.abs(b.globalBalance) - Math.abs(a.globalBalance));
    } else {
      filtered = [...filtered].sort((a, b) => b.globalBalance - a.globalBalance);
    }

    return filtered;
  }, [allEntities, searchTerm, entityFilter, sortByBalance, receivableOnly, receivableAccountFilter]);

  const summaryTotals = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    let bcvReceivable = 0;
    let grupoReceivable = 0;
    let divisaReceivable = 0;

    directoryData.forEach((entity) => {
      if (entity.type === 'CLIENTE' && entity.globalBalance > 0) {
        receivable += entity.globalBalance;
      }
      if (entity.type === 'PROVEEDOR' && entity.globalBalance > 0) {
        payable += entity.globalBalance;
      }
      if (entity.type === 'CLIENTE') {
        bcvReceivable += Math.max(0, (entity as any).balances?.bcv || 0);
        grupoReceivable += Math.max(0, (entity as any).balances?.grupo || 0);
        divisaReceivable += Math.max(0, (entity as any).balances?.divisa || 0);
      }
    });

    const net = receivable - payable;

    // New metrics for KPI cards
    const now = Date.now();
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const cobradoEsteMes = movements
      .filter(m => m.movementType === MovementType.ABONO && !m.anulada && new Date(m.date) >= thisMonthStart)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

    const thirtyDaysAgo = now - 30 * 86_400_000;
    const vencidoMas30d = movements
      .filter(m => m.movementType === MovementType.FACTURA && !m.anulada && !m.pagado)
      .filter(m => m.dueDate ? new Date(m.dueDate).getTime() < thirtyDaysAgo : new Date(m.date).getTime() < thirtyDaysAgo)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);

    const clientsWithOverdue = new Set(
      movements
        .filter(m => m.movementType === MovementType.FACTURA && !m.anulada && !m.pagado)
        .filter(m => m.dueDate ? new Date(m.dueDate).getTime() < now - 7 * 86_400_000 : new Date(m.date).getTime() < now - 37 * 86_400_000)
        .map(m => m.entityId)
    );

    return { receivable, payable, net, bcvReceivable, grupoReceivable, divisaReceivable, cobradoEsteMes, vencidoMas30d, enRiesgo: clientsWithOverdue.size };
  }, [directoryData, movements, rates]);

  // --- LOGIC: DETAIL VIEW (LEVEL 2) ---
  const detailData = useMemo(() => {
    if (!selectedEntityId) return [];
    const base = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      base,
      activeTab,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sorted = [...scoped].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    const withBalance = buildChronoData(sorted);
    return withBalance.reverse();
  }, [
    movements,
    selectedEntityId,
    activeTab,
    rates,
    detailRangeFilter,
    detailRangeFrom,
    detailRangeTo,
  ]);

  const detailChrono = useMemo(() => [...detailData].reverse(), [detailData]);

  const entityMovements = useMemo(() => {
    if (!selectedEntityId) return [] as Movement[];
    return movements.filter((m) => m.entityId === selectedEntityId);
  }, [movements, selectedEntityId]);

  const analyticsKpis = useMemo(() => {
    if (!entityMovements.length) {
      return { totalHistorical: 0, ticketAverage: 0, avgPaymentDays: 3 };
    }
    const invoices = entityMovements.filter((m) => m.movementType === MovementType.FACTURA);
    const totalHistorical = invoices.reduce(
      (sum, m) => sum + getMovementUsdAmount(m, rates),
      0
    );
    const ticketAverage = invoices.length ? totalHistorical / invoices.length : 0;
    const paymentDeltas = detailChrono
      .filter((m) => m.movementType === MovementType.ABONO && m.daysSinceLast != null)
      .map((m: any) => m.daysSinceLast as number);
    const avgPaymentDays = paymentDeltas.length
      ? Math.max(
          1,
          Math.round(paymentDeltas.reduce((sum, value) => sum + value, 0) / paymentDeltas.length)
        )
      : 3;
    return { totalHistorical, ticketAverage, avgPaymentDays };
  }, [entityMovements, detailChrono, rates]);

  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; cargos: number; abonos: number }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      months.push({
        key,
        label: date.toLocaleString('es-VE', { month: 'short' }),
        cargos: 0,
        abonos: 0,
      });
    }
    const monthMap = new Map(months.map((m) => [m.key, m]));
    entityMovements.forEach((m) => {
      const date = new Date(m.createdAt || m.date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = monthMap.get(key);
      if (!bucket) return;
      const amount = getMovementUsdAmount(m, rates);
      if (m.movementType === MovementType.FACTURA) bucket.cargos += amount;
      if (m.movementType === MovementType.ABONO) bucket.abonos += amount;
    });
    return months.map((m) => ({
      ...m,
      cargos: Number(m.cargos.toFixed(2)),
      abonos: Number(m.abonos.toFixed(2)),
    }));
  }, [entityMovements, rates]);

  const scopedBalances = useMemo(() => {
    if (!selectedEntityId) return { bcv: 0, grupo: 0, divisa: 0, total: 0 };
    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      'ALL',
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sumByAccount = (accountType: AccountType) => {
      const accountMovs = scoped.filter((m) => m.accountType === accountType);
      const totalDebt = accountMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = accountMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      return totalDebt - totalPaid;
    };
    const bcv = sumByAccount(AccountType.BCV);
    const grupo = sumByAccount(AccountType.GRUPO);
    const divisa = sumByAccount(AccountType.DIVISA);
    return { bcv, grupo, divisa, total: bcv + grupo + divisa };
  }, [selectedEntityId, movements, detailRangeFilter, detailRangeFrom, detailRangeTo, rates]);

  // Helper to get entity info
  const currentEntityInfo = allEntities.find((d) => d.id === selectedEntityId);
  const currentCustomer = customers.find((c) => c.id === selectedEntityId) || null;
  const currentSupplier = suppliers.find((s) => s.id === selectedEntityId) || null;

  // Helper for Context Colors
  const getContextColors = (tab: TabFilter) => {
    switch (tab) {
      case AccountType.BCV:
        return { border: 'border-blue-800', bg: 'bg-blue-50', text: 'text-blue-800' };
      case AccountType.GRUPO:
        return { border: 'border-orange-600', bg: 'bg-orange-50', text: 'text-orange-800' };
      case AccountType.DIVISA:
        return { border: 'border-emerald-700', bg: 'bg-emerald-50', text: 'text-emerald-800' };
      default:
        return { border: 'border-slate-800', bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-800 dark:text-slate-200' };
    }
  };
  const contextColors = getContextColors(activeTab);
  const totalPending = scopedBalances.total;
  const totalPendingClass = totalPending > 0 ? 'text-rose-600' : 'text-emerald-600';
  const trendIsSparse = entityMovements.length < 3;

  const formatDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('es-VE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toDateTimeLocal = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
      parsed.getDate()
    )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  };

  const formatPhone = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();
  const getEntityField = (value?: string) => (value && value.trim() ? value.trim() : 'N/A');

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');

  const daysSince = (dateValue?: string) => {
    if (!dateValue) return null;
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;
    const diffMs = Date.now() - parsed.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  function resolveRangeLabel(range: 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'CUSTOM') {
    switch (range) {
      case 'SINCE_ZERO':
        return 'Desde el ultimo saldo cero';
      case 'SINCE_LAST_DEBT':
        return 'Desde la ultima factura';
      case 'CUSTOM':
        return `${detailRangeFrom || 'Inicio'} - ${detailRangeTo || 'Hoy'}`;
      case 'ALL':
      default:
        return 'Todo el Historial';
    }
  }

  function filterMovementsByRange(
    items: Movement[],
    account: TabFilter,
    range: 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'CUSTOM',
    fromDate: string,
    toDate: string
  ) {
    const accountScoped =
      account === 'ALL' ? items : items.filter((m) => m.accountType === account);
    const sorted = [...accountScoped].sort((a, b) => {
      const aDate = new Date(a.createdAt || a.date).getTime();
      const bDate = new Date(b.createdAt || b.date).getTime();
      return aDate - bDate;
    });

    if (range === 'CUSTOM') {
      return sorted.filter((m) => {
        if (fromDate && m.date < fromDate) return false;
        if (toDate && m.date > toDate) return false;
        return true;
      });
    }

    if (range === 'SINCE_LAST_DEBT') {
      const idx = [...sorted].reverse().findIndex((m) => m.movementType === MovementType.FACTURA);
      if (idx === -1) return sorted;
      const startIndex = sorted.length - 1 - idx;
      return sorted.slice(startIndex);
    }

    if (range === 'SINCE_ZERO') {
      let running = 0;
      let lastZeroIndex = -1;
      sorted.forEach((m, index) => {
        const amountUsd = getMovementUsdAmount(m, rates);
        const debe = m.movementType === MovementType.FACTURA ? amountUsd : 0;
        const haber = m.movementType === MovementType.ABONO ? amountUsd : 0;
        running += debe - haber;
        if (running <= 0) lastZeroIndex = index;
      });
      if (lastZeroIndex === -1) return sorted;
      return sorted.slice(lastZeroIndex);
    }

    return sorted;
  }

  function buildChronoData(items: Movement[]) {
    let runningBalance = 0;
    let lastDate: Date | null = null;
    return items.map((m) => {
      const displayDate = m.createdAt || m.date;
      const currentDate = new Date(displayDate);
      const daysSinceLast = lastDate
        ? Math.ceil((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      lastDate = currentDate;
      const amountUsd = getMovementUsdAmount(m, rates);
      const debe = m.movementType === MovementType.FACTURA ? amountUsd : 0;
      const haber = m.movementType === MovementType.ABONO ? amountUsd : 0;
      runningBalance += debe - haber;
      return { ...m, debe, haber, runningBalance, displayDate, daysSinceLast };
    });
  }

  const buildRowShareMessage = (entityId: string) => {
    const entityMovs = movements.filter((m) => m.entityId === entityId);
    const sumByAccount = (accountType: AccountType) => {
      const accountMovs = entityMovs.filter((m) => m.accountType === accountType);
      const totalDebt = accountMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = accountMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      return totalDebt - totalPaid;
    };

    const bcv = sumByAccount(AccountType.BCV);
    const grupo = sumByAccount(AccountType.GRUPO);
    const divisa = sumByAccount(AccountType.DIVISA);

    return `Resumen Estado de Cuenta\nEntidad: ${entityId}\n\nSaldos Totales:\nBCV: ${formatCurrency(Math.abs(bcv), '$')}\nGRUPO: ${formatCurrency(Math.abs(grupo), '$')}\nDIVISA: ${formatCurrency(Math.abs(divisa), '$')}`;
  };

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '').trim();
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b] as [number, number, number];
  };

  const addPdfHeader = (doc: any, title: string, rightInfo: string[] = []) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const brand = hexToRgb(config.theme?.primaryColor || '#0f172a') || [15, 23, 42];
    doc.setFillColor(brand[0], brand[1], brand[2]);
    doc.rect(0, 0, pageWidth, 26, 'F');

    const logo = config.companyLogo || '';
    if (logo) {
      const format = logo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.setFillColor(255, 255, 255);
      doc.rect(12, 5, 14, 14, 'F');
      doc.addImage(logo, format, 12, 5, 14, 14);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(config.companyName || 'Empresa', 30, 11);
    doc.setFontSize(9);
    doc.text(title, 30, 18);

    if (rightInfo.length) {
      doc.setFontSize(8);
      rightInfo.slice(0, 4).forEach((line, idx) => {
        doc.text(line, pageWidth - 12, 10 + idx * 4, { align: 'right' });
      });
    }

    doc.setTextColor(0, 0, 0);
    return 32;
  };

  const addEntityBlock = (doc: any, startY: number) => {
    if (!selectedEntityId || !currentEntityInfo) return startY;
    const pageWidth = doc.internal.pageSize.getWidth();
    const boxX = 14;
    const boxY = startY + 2;
    const boxW = pageWidth - 28;
    const boxH = 20;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);

    const typeLabel = currentEntityInfo.type || 'ENTIDAD';
    doc.text(`Entidad: ${selectedEntityId}`, boxX + 4, boxY + 7);
    doc.text(`Tipo: ${typeLabel}`, boxX + 4, boxY + 12);

    if (currentEntityInfo.type === 'CLIENTE' && currentCustomer) {
      doc.text(`CI/RIF: ${getEntityField(currentCustomer.cedula)}`, boxX + 4, boxY + 17);
      doc.text(
        `Telefono: ${getEntityField(formatPhone(currentCustomer.telefono))}`,
        boxX + 70,
        boxY + 7
      );
      doc.text(
        `Direccion: ${getEntityField(currentCustomer.direccion)}`,
        boxX + 70,
        boxY + 12
      );
    } else if (currentEntityInfo.type === 'PROVEEDOR' && currentSupplier) {
      doc.text(`RIF: ${getEntityField(currentSupplier.rif)}`, boxX + 4, boxY + 17);
      doc.text(
        `Contacto: ${getEntityField(currentSupplier.contacto)}`,
        boxX + 70,
        boxY + 7
      );
      doc.text(
        `Categoria: ${getEntityField(currentSupplier.categoria)}`,
        boxX + 70,
        boxY + 12
      );
    }

    return boxY + boxH + 6;
  };

  // --- HANDLERS ---
  const handleEditClick = (mov: Movement) => {
    setEditingMovement(mov);
    const dateValue = mov.createdAt || `${mov.date}T00:00:00`;
    setEditForm({
      date: toDateTimeLocal(dateValue),
      concept: mov.concept,
      amount: mov.amount.toString(), // Original Amount
      currency: mov.currency as string,
      rateUsed: mov.rateUsed.toString(),
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement || !editForm) return;

    const newAmount = parseFloat(editForm.amount);
    const newRate = parseFloat(editForm.rateUsed);

    // RE-CALCULATION LOGIC:
    // If currency is BS, divide by rate. If USD, take amount as is.
    let newAmountInUSD = newAmount;
    if (editForm.currency === PaymentCurrency.BS) {
      newAmountInUSD = newAmount / newRate;
    }

    const isoDate = editForm.date.includes('T')
      ? editForm.date
      : `${editForm.date}T00:00:00`;
    onUpdateMovement(editingMovement.id, {
      date: isoDate.split('T')[0],
      createdAt: isoDate,
      concept: editForm.concept,
      amount: newAmount,
      currency: editForm.currency,
      rateUsed: newRate,
      amountInUSD: newAmountInUSD,
    });

    setEditingMovement(null);
    setEditForm(null);
  };

  const handleDeleteClick = () => {
    if (!editingMovement) return;
    if (
      confirm(
        '⚠️ ¿Eliminar este movimiento permanentemente?\n\nEsta acción afectará el saldo contable y no se puede deshacer.'
      )
    ) {
      onDeleteMovement(editingMovement.id);
      setEditingMovement(null);
      setEditForm(null);
    }
  };

  const buildShareMessage = () => {
    if (!selectedEntityId) return '';
    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      activeTab,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sumByAccount = (accountType: AccountType) => {
      const accountMovs = scoped.filter((m) => m.accountType === accountType);
      const totalDebt = accountMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = accountMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      return totalDebt - totalPaid;
    };

    if (activeTab !== 'ALL') {
      const total = sumByAccount(activeTab);
      return `Resumen Estado de Cuenta\nEntidad: ${selectedEntityId}\nCuenta: ${activeTab}\n\nSaldo: ${formatCurrency(Math.abs(total), '$')}`;
    }

    const bcv = sumByAccount(AccountType.BCV);
    const grupo = sumByAccount(AccountType.GRUPO);
    const divisa = sumByAccount(AccountType.DIVISA);

    return `Resumen Estado de Cuenta\nEntidad: ${selectedEntityId}\n\nSaldos Totales:\nBCV: ${formatCurrency(Math.abs(bcv), '$')}\nGRUPO: ${formatCurrency(Math.abs(grupo), '$')}\nDIVISA: ${formatCurrency(Math.abs(divisa), '$')}`;
  };

  const generateShareText = (clientName: string) => {
    const totalUsd = Math.abs(scopedBalances.total);
    const divisaUsd = Math.abs(scopedBalances.divisa);
    const bcvBs = Math.abs(scopedBalances.bcv * (rates.bcv || 1));
    const grupoBs = Math.abs(scopedBalances.grupo * (rates.grupo || 1));

    return `Hola *${clientName}*, un gusto saludarte. 👋\n\nAdjunto te envio el resumen de tu estado de cuenta a la fecha.\n\n📉 *Saldo Total Pendiente:* ${formatCurrency(totalUsd, '$')}\n\nDesglose:\n🇺🇸 Divisa: ${formatCurrency(divisaUsd, '$')}\n🇻🇪 BCV: ${formatCurrency(bcvBs, 'Bs')}\n🟠 Grupo: ${formatCurrency(grupoBs, 'Bs')}\n\nQuedo atento a tu pago. ¡Gracias!`;
  };

  const copyShareText = async () => {
    if (!selectedEntityId) return;
    const message = generateShareText(selectedEntityId);
    if (!navigator.clipboard?.writeText) {
      window.prompt('Copia el mensaje para WhatsApp:', message);
      return;
    }
    await navigator.clipboard.writeText(message);
    setShareToast('📋 ¡Texto copiado! Pégalo en WhatsApp.');
  };

  const openWhatsAppPreview = (context: TemplateContext) => {
    setWhatsAppContext(context);
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = (message: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    setShowWhatsAppModal(false);
  };

  const buildWhatsAppContext = (entityId: string, balance: number, lastMov?: string) => {
    return {
      nombre_cliente: entityId,
      monto_deuda: formatCurrency(Math.abs(balance), '$'),
      fecha_vencimiento: lastMov || '',
      nombre_empresa: config.companyName || '',
    };
  };

  const handleExportPdfSummary = async (accountOverride?: TabFilter) => {
    if (!selectedEntityId || !currentEntityInfo) return;
    const { default: jsPDF } = await import('jspdf');

    const doc = new jsPDF();
    const account = accountOverride || activeTab;
    const rangeLabel = resolveRangeLabel(detailRangeFilter);
    const rightInfo = [account === 'ALL' ? 'Cuenta: Global' : `Cuenta: ${account}`, `Rango: ${rangeLabel}`];
    const titleSuffix = detailRangeFilter !== 'ALL' ? ` (${rangeLabel})` : '';
    let cursorY = addPdfHeader(doc, `Estado de Cuenta Resumen${titleSuffix}`, rightInfo);
    cursorY = addEntityBlock(doc, cursorY);

    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      account,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sumByAccount = (accountType: AccountType) => {
      const accountMovs = scoped.filter((m) => m.accountType === accountType);
      const totalDebt = accountMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = accountMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      return totalDebt - totalPaid;
    };

    doc.setFontSize(11);
    doc.text('Saldo Total por Cuenta', 14, cursorY);
    cursorY += 8;

    if (account !== 'ALL') {
      const total = sumByAccount(account as AccountType);
      doc.text(`${account}: ${formatCurrency(Math.abs(total), '$')}`, 14, cursorY);
      cursorY += 6;
    } else {
      const bcv = sumByAccount(AccountType.BCV);
      const grupo = sumByAccount(AccountType.GRUPO);
      const divisa = sumByAccount(AccountType.DIVISA);
      doc.text(`BCV: ${formatCurrency(Math.abs(bcv), '$')}`, 14, cursorY);
      cursorY += 6;
      doc.text(`GRUPO: ${formatCurrency(Math.abs(grupo), '$')}`, 14, cursorY);
      cursorY += 6;
      doc.text(`DIVISA: ${formatCurrency(Math.abs(divisa), '$')}`, 14, cursorY);
      cursorY += 6;
    }

    doc.save(`estado-cuenta-resumen-${selectedEntityId}.pdf`);
    await copyShareText();
  };

  const handleExportPdfDetailed = async (accountOverride?: TabFilter) => {
    if (!selectedEntityId || !currentEntityInfo) return;
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape' });
    const account = accountOverride || activeTab;
    const rangeLabel = resolveRangeLabel(detailRangeFilter);
    const rightInfo = [account === 'ALL' ? 'Cuenta: Global' : `Cuenta: ${account}`, `Rango: ${rangeLabel}`];
    const titleSuffix = detailRangeFilter !== 'ALL' ? ` (${rangeLabel})` : '';
    let cursorY = addPdfHeader(doc, `Estado de Cuenta Detallado${titleSuffix}`, rightInfo);
    cursorY = addEntityBlock(doc, cursorY);
    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      account,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sorted = [...scoped].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    const chrono = buildChronoData(sorted);

    const rows = chrono.map((m) => {
      const refText =
        m.movementType === MovementType.ABONO
          ? `Ref: ${m.reference || 'N/A'} (Tasa: ${Number(m.rateUsed || 1).toFixed(2)})`
          : '-';
      return [
        formatDateTime((m as any).displayDate || m.date),
        m.concept,
        refText,
        m.debe > 0 ? m.debe.toFixed(2) : '-',
        m.haber > 0 ? m.haber.toFixed(2) : '-',
        m.runningBalance != null ? Number(m.runningBalance).toFixed(2) : '-',
      ];
    });

    const totalDebe = chrono.reduce((sum, m) => sum + (m.debe || 0), 0);
    const totalHaber = chrono.reduce((sum, m) => sum + (m.haber || 0), 0);

    autoTable(doc, {
      startY: cursorY + 2,
      head: [[
        'Fecha',
        'Concepto / Descripcion',
        'Referencia / Tasa',
        'Deuda (+)',
        'Abono (-)',
        'Saldo',
      ]],
      body: rows.length ? rows : [['-', '-', '-', '-', '-', '-']],
      foot: [[
        'TOTALES',
        '',
        '',
        totalDebe.toFixed(2),
        totalHaber.toFixed(2),
        (totalDebe - totalHaber).toFixed(2),
      ]],
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
      footStyles: { fillColor: [245, 247, 250], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 60 },
        2: { cellWidth: 48 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
      },
    });

    doc.save(`estado-cuenta-detallado-${selectedEntityId}.pdf`);
    await copyShareText();
  };

  const handleExportImage = async (accountOverride?: TabFilter) => {
    if (!selectedEntityId) return;
    const { default: html2canvas } = await import('html2canvas');
    const account = accountOverride || activeTab;
    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      account,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
    const sorted = [...scoped].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );
    const chrono = buildChronoData(sorted);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '24px';
    wrapper.style.width = '900px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';
    header.style.marginBottom = '12px';

    if (config.companyLogo) {
      const img = document.createElement('img');
      img.src = config.companyLogo;
      img.style.width = '56px';
      img.style.height = '56px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      header.appendChild(img);
    }

    const info = document.createElement('div');
    info.innerHTML = `
      <div style="font-weight: 800; font-size: 16px; color: #111827;">${
        config.companyName || 'Empresa'
      }</div>
      <div style="font-size: 12px; color: #6b7280;">Estado de Cuenta: ${
        selectedEntityId || 'Entidad'
      }</div>
      <div style="font-size: 12px; color: #6b7280;">Cuenta: ${
        account === 'ALL' ? 'Global' : account
      }</div>
      <div style="font-size: 12px; color: #6b7280;">Rango: ${resolveRangeLabel(
        detailRangeFilter
      )}</div>
    `;
    header.appendChild(info);
    wrapper.appendChild(header);

    const tableRows = chrono
      .map((m) => {
        const refText =
          m.movementType === MovementType.ABONO
            ? `Ref: ${m.reference || 'N/A'} (Tasa: ${Number(m.rateUsed || 1).toFixed(2)})`
            : '-';
        return `
          <tr>
            <td>${formatDateTime((m as any).displayDate || m.date)}</td>
            <td>${m.concept}</td>
            <td>${refText}</td>
            <td style="text-align:right;">${m.debe > 0 ? m.debe.toFixed(2) : '-'}</td>
            <td style="text-align:right;">${m.haber > 0 ? m.haber.toFixed(2) : '-'}</td>
            <td style="text-align:right;">${
              m.runningBalance != null ? Number(m.runningBalance).toFixed(2) : '-'
            }</td>
          </tr>
        `;
      })
      .join('');

    wrapper.innerHTML += `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="text-align:left;padding:6px;">Fecha</th>
            <th style="text-align:left;padding:6px;">Concepto / Descripcion</th>
            <th style="text-align:left;padding:6px;">Referencia / Tasa</th>
            <th style="text-align:right;padding:6px;">Deuda (+)</th>
            <th style="text-align:right;padding:6px;">Abono (-)</th>
            <th style="text-align:right;padding:6px;">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || ''}
        </tbody>
      </table>
    `;

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
      windowWidth: wrapper.scrollWidth,
      windowHeight: wrapper.scrollHeight,
    });
    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-detallado-${selectedEntityId || 'entidad'}.png`;
    link.click();
    await copyShareText();
  };

  const handleExportSummaryImage = async (accountOverride?: TabFilter) => {
    if (!selectedEntityId) return;
    const { default: html2canvas } = await import('html2canvas');
    const account = accountOverride || activeTab;
    const entityMovs = movements.filter((m) => m.entityId === selectedEntityId);
    const scoped = filterMovementsByRange(
      entityMovs,
      account,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );

    const sumByAccount = (accountType: AccountType) => {
      const accountMovs = scoped.filter((m) => m.accountType === accountType);
      const totalDebt = accountMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      const totalPaid = accountMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
      return totalDebt - totalPaid;
    };

    const total =
      account === 'ALL'
        ? sumByAccount(AccountType.BCV) +
          sumByAccount(AccountType.GRUPO) +
          sumByAccount(AccountType.DIVISA)
        : sumByAccount(account as AccountType);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '20px';
    wrapper.style.width = '520px';

    wrapper.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        ${
          config.companyLogo
            ? `<img src="${config.companyLogo}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" />`
            : ''
        }
        <div>
          <div style="font-weight:800;font-size:16px;color:#0f172a;">${
            config.companyName || 'Empresa'
          }</div>
          <div style="font-size:12px;color:#64748b;">Estado de Cuenta</div>
        </div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
        <div style="font-weight:700;font-size:12px;color:#475569;margin-bottom:6px;">Entidad</div>
        <div style="font-weight:800;font-size:16px;color:#0f172a;">${
          selectedEntityId
        }</div>
        <div style="font-size:11px;color:#64748b;">Cuenta: ${
          account === 'ALL' ? 'Global' : account
        }</div>
        <div style="font-size:11px;color:#64748b;">Rango: ${resolveRangeLabel(
          detailRangeFilter
        )}</div>
        <div style="display:flex;gap:12px;margin-top:12px;">
          <div style="flex:1;background:#f8fafc;border-radius:10px;padding:8px;">
            <div style="font-size:10px;color:#64748b;">Saldo</div>
            <div style="font-weight:800;color:#0f172a;">${formatCurrency(
              Math.abs(total),
              '$'
            )}</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { backgroundColor: '#ffffff', scale: 2 });
    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `estado-cuenta-resumen-${selectedEntityId || 'entidad'}.png`;
    link.click();
    await copyShareText();
  };

  // --- GENERATE PAYROLL RECEIPT (PDF) ---
  const handleGenerateReceipt = () => {
    if (!currentEntityInfo || !selectedEntityId) return;
    if (!(window as any).jspdf) {
      info('Generando PDF, espera un momento...');
      return;
    }

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- LOGIC FOR PAYROLL RECEIPT ---
    // Devengado (Facturas = Salarios/Bonos generados)
    const devengados = detailData.filter((m) => m.movementType === MovementType.FACTURA);
    const deducciones = detailData.filter((m) => m.movementType === MovementType.ABONO);

    const totalDevengado = devengados.reduce((s, m) => s + getMovementUsdAmount(m, rates), 0);
    const totalDeducciones = deducciones.reduce((s, m) => s + getMovementUsdAmount(m, rates), 0);
    const netoPagar = totalDevengado - totalDeducciones;

    // Header
    doc.setFillColor(113, 75, 103); // Brand Color
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(config.companyName, 20, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('RECIBO DE PAGO DE NÓMINA / VOUCHER', 20, 25);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, pageWidth - 20, 25, {
      align: 'right',
    });

    // Employee Info
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TRABAJADOR: ${selectedEntityId}`, 20, 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periodo: Histórico Consolidado`, 20, 56);

    // COLUMNS SETUP
    const col1X = 20;
    const col2X = 110;
    let y = 70;

    // Headers Columns
    doc.setFillColor(240, 240, 240);
    doc.rect(col1X, y, 80, 8, 'F');
    doc.rect(col2X, y, 80, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.text('DEVENGADO (Ingresos)', col1X + 2, y + 6);
    doc.text('DEDUCCIONES (Vales/Pagos)', col2X + 2, y + 6);

    y += 15;

    // Content
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const maxRows = Math.max(devengados.length, deducciones.length);

    for (let i = 0; i < maxRows; i++) {
      // Devengado Item
      if (devengados[i]) {
        doc.text(`${devengados[i].date} - ${devengados[i].concept.substring(0, 25)}`, col1X, y);
        doc.text(
          `$${getMovementUsdAmount(devengados[i], rates).toFixed(2)}`,
          col1X + 75,
          y,
          { align: 'right' }
        );
      }
      // Deduccion Item
      if (deducciones[i]) {
        doc.text(`${deducciones[i].date} - ${deducciones[i].concept.substring(0, 25)}`, col2X, y);
        doc.text(
          `$${getMovementUsdAmount(deducciones[i], rates).toFixed(2)}`,
          col2X + 75,
          y,
          { align: 'right' }
        );
      }
      y += 6;

      if (y > 220) {
        doc.addPage();
        y = 20;
      }
    }

    y += 10;
    // TOTALS LINE
    doc.setDrawColor(200, 200, 200);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL DEVENGADO:', col1X, y);
    doc.text(`$${totalDevengado.toFixed(2)}`, col1X + 75, y, { align: 'right' });

    doc.text('TOTAL DEDUCCIONES:', col2X, y);
    doc.text(`$${totalDeducciones.toFixed(2)}`, col2X + 75, y, { align: 'right' });

    y += 15;

    // NETO A PAGAR BOX
    doc.setFillColor(
      netoPagar >= 0 ? 230 : 255,
      netoPagar >= 0 ? 245 : 230,
      netoPagar >= 0 ? 230 : 230
    ); // Greenish or Reddish
    doc.roundedRect(pageWidth / 2 - 40, y, 80, 20, 3, 3, 'F');

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('NETO A PAGAR', pageWidth / 2, y + 7, { align: 'center' });
    doc.setFontSize(16);
    doc.text(`$${netoPagar.toFixed(2)}`, pageWidth / 2, y + 15, { align: 'center' });

    // SIGNATURES
    y = 270;
    doc.setLineWidth(0.5);
    doc.line(30, y, 90, y);
    doc.line(120, y, 180, y);

    doc.setFontSize(8);
    doc.text('POR LA EMPRESA', 60, y + 5, { align: 'center' });
    doc.text('RECIBIDO CONFORME (Trabajador)', 150, y + 5, { align: 'center' });

    doc.save(`Recibo_Nomina_${selectedEntityId}.pdf`);
  };

  // --- RENDER ---
  return (
    <div className="app-section space-y-6 animate-in h-full flex flex-col">
      {/* LEVEL 1: DIRECTORY VIEW */}
      {viewMode === 'DIRECTORY' && (
        <>
          <div className="app-panel p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* KPI 1 — Total CxC */}
              <div
                className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] dark:bg-rose-500/[0.08] px-5 py-4 cursor-pointer hover:border-rose-500/40 transition-all"
                onClick={() => { setReceivableOnly(true); setEntityFilter('CLIENTE'); setReceivableAccountFilter('ALL'); }}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-400/70 mb-1">Total CxC</p>
                <p className="text-2xl font-black text-rose-400">{formatCurrency(summaryTotals.receivable, '$')}</p>
                <p className="text-[10px] text-rose-400/50 font-semibold mt-0.5">{formatCurrency(summaryTotals.receivable * (rates.bcv || 1), 'Bs')}</p>
              </div>
              {/* KPI 2 — Cobrado este mes */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70 mb-1">Cobrado Este Mes</p>
                <p className="text-2xl font-black text-emerald-400">{formatCurrency(summaryTotals.cobradoEsteMes, '$')}</p>
                <p className="text-[10px] text-emerald-400/50 font-semibold mt-0.5">Abonos del mes</p>
              </div>
              {/* KPI 3 — En riesgo */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] dark:bg-amber-500/[0.08] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/70 mb-1">En Riesgo</p>
                <p className="text-2xl font-black text-amber-400">{summaryTotals.enRiesgo}</p>
                <p className="text-[10px] text-amber-400/50 font-semibold mt-0.5">Clientes con deuda vencida</p>
              </div>
              {/* KPI 4 — Vencido +30d */}
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] dark:bg-orange-500/[0.08] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400/70 mb-1">Vencido +30d</p>
                <p className="text-2xl font-black text-orange-400">{formatCurrency(summaryTotals.vencidoMas30d, '$')}</p>
                <p className="text-[10px] text-orange-400/50 font-semibold mt-0.5">Facturas sin cobrar</p>
              </div>
            </div>
          </div>

          <div className="app-panel p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="app-section-header">
              <p className="app-subtitle">Saldos por Entidad</p>
              <h2 className="app-title flex items-center gap-2">Directorio Contable
                <span className="relative group cursor-help">
                  <Info size={13} className="text-slate-400 dark:text-slate-600" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-900 text-[10px] text-white/80 font-medium shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-center leading-relaxed">
                    Saldos de clientes y proveedores. Los movimientos se registran automaticamente desde ventas POS y pagos.
                  </span>
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex app-chip p-1 rounded-xl">
                {(
                  [
                    { id: 'ALL', label: 'Todo' },
                    { id: 'CATALOGO', label: 'Clientes + Proveedores' },
                    { id: 'CLIENTE', label: 'Clientes' },
                    { id: 'PROVEEDOR', label: 'Proveedores' },
                    { id: 'NÓMINA', label: 'Empleados' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setEntityFilter(f.id)}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      entityFilter === f.id
                        ? 'bg-white dark:bg-slate-900 text-[var(--ui-accent)] shadow-sm'
                        : 'text-slate-400 hover:text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'ALL', label: 'Todos', color: 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400' },
                  { id: AccountType.BCV, label: 'BCV', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' },
                  ...(hasDynamicPricing ? customRates.filter(r => r.enabled).map((r, i) => ({
                    id: r.id as string,
                    label: r.name,
                    color: i % 2 === 0 ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                  })) : []),
                ].map((chip) => {
                  const isActive = receivableAccountFilter === chip.id;
                  const chipValue = chip.id === 'ALL'
                    ? formatCurrency(summaryTotals.receivable, '$')
                    : chip.id === AccountType.BCV
                    ? formatCurrency(summaryTotals.bcvReceivable * (rates.bcv || 1), 'Bs')
                    : formatCurrency(
                        (summaryTotals as any)[`${chip.id.toLowerCase()}Receivable`] || 0, '$'
                      );
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        setReceivableOnly(true);
                        setEntityFilter('CLIENTE');
                        setReceivableAccountFilter(chip.id as 'ALL' | AccountType);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${chip.color} ${
                        isActive ? 'ring-2 ring-slate-300 dark:ring-white/30' : 'hover:opacity-80'
                      }`}
                      title="Filtrar por cuenta"
                    >
                      {chip.label} {chipValue}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="app-input pl-10 pr-4 py-3 text-sm font-bold w-64"
                />
                <i className="fa-solid fa-search absolute left-4 top-3.5 text-slate-400"></i>
              </div>

              <select
                value={sortByBalance}
                onChange={(e) => setSortByBalance(e.target.value as 'none' | 'debt-desc')}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300"
              >
                <option value="none">Orden: Default</option>
                <option value="debt-desc">Mayor Deuda</option>
              </select>

              {/* View style toggle */}
              <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 gap-1">
                <button
                  onClick={() => setViewStyle('lista')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewStyle === 'lista' ? 'bg-white dark:bg-slate-900 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                >
                  <LayoutList size={12} /> Lista
                </button>
                <button
                  onClick={() => setViewStyle('semaforo')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewStyle === 'semaforo' ? 'bg-white dark:bg-slate-900 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                >
                  <Gauge size={12} /> Semáforo
                </button>
              </div>
            </div>
          </div>

          {/* SEMAFORO VIEW */}
          {viewStyle === 'semaforo' && (
            <div className="app-panel p-6 flex-1">
              {(() => {
                const clientMovements = movements.filter(m => m.entityId !== 'CONSUMIDOR_FINAL');
                const clientes = directoryData.filter(e => e.type === 'CLIENTE');
                const verde = clientes.filter(e => e.globalBalance <= 0.01);
                const amarillo = clientes.filter(e => e.globalBalance > 0.01 && e.globalBalance <= 500);
                const rojo = clientes.filter(e => e.globalBalance > 500);
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {([
                      { label: 'Al Día', color: 'emerald', items: verde },
                      { label: 'Deuda Moderada', color: 'amber', items: amarillo },
                      { label: 'Deuda Alta', color: 'rose', items: rojo },
                    ] as const).map(col => (
                      <div key={col.label}>
                        <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-${col.color}-500/10 border border-${col.color}-500/20`}>
                          <div className={`w-3 h-3 rounded-full bg-${col.color}-500`} />
                          <p className={`text-[11px] font-black uppercase tracking-widest text-${col.color}-400`}>{col.label}</p>
                          <span className={`ml-auto text-[10px] font-black text-${col.color}-400`}>{col.items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {col.items.map(entity => {
                            const score = calcCreditScore(clientMovements.filter(m => m.entityId === entity.id));
                            return (
                              <div
                                key={entity.id}
                                className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-all"
                                onClick={() => { setSelectedEntityId(entity.id); setViewMode('PROFILE'); }}
                              >
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                                  {getInitials(entity.id)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-white/80 truncate">{entity.id}</p>
                                  <p className={`text-xs font-bold ${entity.globalBalance > 0.01 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {entity.globalBalance > 0.01 ? formatCurrency(entity.globalBalance, '$') : 'Sin deuda'}
                                  </p>
                                </div>
                                {score && (
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                    score === 'EXCELENTE' ? 'bg-emerald-500/20 text-emerald-400' :
                                    score === 'BUENO'     ? 'bg-sky-500/20 text-sky-400' :
                                    score === 'REGULAR'   ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-rose-500/20 text-rose-400'
                                  }`}>{score}</span>
                                )}
                              </div>
                            );
                          })}
                          {col.items.length === 0 && (
                            <p className="text-center py-8 text-white/20 text-xs font-bold">Sin clientes</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* LISTA VIEW */}
          {viewStyle === 'lista' && (
          <div className="app-panel overflow-hidden flex-1">
            <div className="overflow-y-auto custom-scroll h-full">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10 border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="px-8 py-4">Tipo</th>
                    <th className="px-8 py-4">Entidad / Nombre</th>
                    <th className="px-8 py-4">Saldos por Cuenta</th>
                    <th className="px-8 py-4 text-center hidden lg:table-cell">Crédito</th>
                    <th className="px-8 py-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
                  {directoryData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-400 italic">
                        No hay registros para este filtro.
                      </td>
                    </tr>
                  ) : (
                    directoryData.map((entity) => {
                      // LOGICA DE COLOR Y TEXTO PARA NOMINA (INVERSA)
                      // Para Nómina: Balance > 0 significa que la empresa DEBE al empleado (Azul/Verde).
                      // Para Clientes: Balance > 0 significa que el cliente DEBE a la empresa (Rojo/Cobrar).
                      const isPayroll = entity.type === 'NÓMINA';
                      const resolveBalanceColor = (value: number) => {
                        if (isPayroll) {
                          return value >= 0 ? 'text-indigo-600' : 'text-rose-600';
                        }
                        return value > 0.01 ? 'text-rose-600' : 'text-emerald-600';
                      };

                      const bcv = (entity as any).balances?.bcv ?? 0;
                      const grupo = (entity as any).balances?.grupo ?? 0;
                      const divisa = (entity as any).balances?.divisa ?? 0;
                      const lastMovDays = daysSince(entity.lastMov);
                      const isInactive = lastMovDays != null && lastMovDays >= 60;

                      return (
                        <tr
                          key={entity.id}
                          className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors group cursor-pointer"
                          onClick={() => {
                            setSelectedEntityId(entity.id);
                            setViewMode(entity.type === 'CLIENTE' ? 'PROFILE' : 'SUPPLIER_PROFILE');
                          }}
                        >
                          <td className="px-8 py-4">
                            <span
                              className={`px-3 py-1 rounded-md text-[9px] font-black border uppercase ${entity.typeColor}`}
                            >
                              {entity.type}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black flex items-center justify-center text-xs">
                                {getInitials(entity.id)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-slate-700 dark:text-slate-200 text-base">
                                    {entity.id}
                                  </p>
                                  {entity.type === 'CLIENTE' && (
                                    <ClientStatusBadge
                                      tags={(entity as any).tags || undefined}
                                      maxTags={1}
                                    />
                                  )}
                                  {entity.type === 'CLIENTE' && (() => {
                                    const entMovs = movements.filter(m => m.entityId === entity.id);
                                    const score = calcCreditScore(entMovs);
                                    if (!score) return null;
                                    const cls = score === 'EXCELENTE' ? 'bg-emerald-500/15 text-emerald-400' : score === 'BUENO' ? 'bg-sky-500/15 text-sky-400' : score === 'REGULAR' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400';
                                    return <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${cls}`}>{score}</span>;
                                  })()}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                                  <span className={`w-2 h-2 rounded-full ${isInactive ? 'bg-slate-300' : 'bg-emerald-400'}`}></span>
                                  <span>
                                    {entity.lastMov
                                      ? `Ult. mov: hace ${lastMovDays} dias`
                                      : 'Ult. mov: sin registros'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex flex-col items-end text-[11px] font-semibold">
                              <div
                                className={`flex items-center gap-2 ${resolveBalanceColor(bcv)}`}
                              >
                                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                                <span className="uppercase text-[10px] font-black text-slate-500 dark:text-slate-400">BCV</span>
                                <span className="font-mono">
                                  {formatCurrency(Math.abs(bcv))}
                                </span>
                              </div>
                              <div
                                className={`flex items-center gap-2 ${resolveBalanceColor(grupo)}`}
                              >
                                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                                <span className="uppercase text-[10px] font-black text-slate-500 dark:text-slate-400">GRUPO</span>
                                <span className="font-mono">
                                  {formatCurrency(Math.abs(grupo))}
                                </span>
                              </div>
                              <div
                                className={`flex items-center gap-2 ${resolveBalanceColor(divisa)}`}
                              >
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                <span className="uppercase text-[10px] font-black text-slate-500 dark:text-slate-400">DIVISA</span>
                                <span className="font-mono">
                                  {formatCurrency(Math.abs(divisa))}
                                </span>
                              </div>
                              {isPayroll && (
                                <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">
                                  {entity.globalBalance >= 0 ? 'Por Pagar' : 'Sobregiro'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-center hidden lg:table-cell">
                            {entity.type === 'CLIENTE' && (() => {
                              const cust = customers.find(c => c.id === entity.id);
                              const limit = cust?.creditLimit ?? 0;
                              if (limit <= 0) return <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>;
                              const pct = entity.globalBalance > 0 ? (entity.globalBalance / limit) * 100 : 0;
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">${limit.toFixed(0)}</span>
                                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                  </div>
                                  <span className={`text-[8px] font-black ${pct > 90 ? 'text-rose-500' : pct > 60 ? 'text-amber-500' : 'text-emerald-500'}`}>{pct.toFixed(0)}%</span>
                                </div>
                              );
                            })()}
                            {entity.type !== 'CLIENTE' && <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                          <td className="px-8 py-4 text-center">
                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openWhatsAppPreview(
                                    buildWhatsAppContext(entity.id, entity.globalBalance, entity.lastMov)
                                  );
                                }}
                                className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-slate-900 dark:text-white transition-all shadow-sm dark:shadow-black/20"
                                title="WhatsApp"
                              >
                                <i className="fa-brands fa-whatsapp"></i>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedEntityId(entity.id);
                                  setViewMode('DETAIL');
                                }}
                                className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 hover:bg-indigo-600 hover:text-slate-900 dark:text-white transition-all shadow-sm dark:shadow-black/20"
                                title="Registrar Movimiento"
                              >
                                <i className="fa-solid fa-plus"></i>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedEntityId(entity.id);
                                  setViewMode(entity.type === 'CLIENTE' ? 'PROFILE' : 'SUPPLIER_PROFILE');
                                }}
                                className="w-9 h-9 rounded-full bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-600 hover:text-slate-900 dark:text-white transition-all shadow-sm dark:shadow-black/20"
                                title="Ver Expediente"
                              >
                                <i className="fa-solid fa-chevron-right"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </>
      )}

      {/* LEVEL 1.5: CLIENT PROFILE VIEW */}
      {viewMode === 'PROFILE' && selectedEntityId && currentEntityInfo && (
        <CxCClientProfile
          entityId={selectedEntityId}
          businessId={derivedBusinessId}
          userId={user?.uid || ''}
          customer={currentCustomer}
          movements={movements}
          rates={rates}
          config={config}
          customRates={customRates}
          onBack={() => setViewMode('DIRECTORY')}
          onViewLedger={() => setViewMode('DETAIL')}
          onRegisterAbono={() => { setViewMode('DETAIL'); setShowAbonoModal(true); }}
          onShareWhatsApp={() => {
            openWhatsAppPreview(
              buildWhatsAppContext(selectedEntityId, currentEntityInfo.globalBalance, currentEntityInfo.lastMov)
            );
          }}
          onExportPdf={() => handleExportPdfDetailed()}
        />
      )}

      {/* LEVEL 1.6: SUPPLIER PROFILE VIEW */}
      {viewMode === 'SUPPLIER_PROFILE' && selectedEntityId && currentSupplier && (
        <CxPSupplierProfile
          entityId={selectedEntityId}
          supplier={currentSupplier}
          movements={movements}
          rates={rates}
          customRates={customRates}
          onBack={() => setViewMode('DIRECTORY')}
          onViewLedger={() => setViewMode('DETAIL')}
          onRegisterPago={() => { setViewMode('DETAIL'); setShowAbonoModal(true); }}
        />
      )}

      {/* LEVEL 2: DETAILED VIEW */}
      {viewMode === 'DETAIL' && selectedEntityId && currentEntityInfo && (
        <div className="flex flex-col h-full gap-6 animate-in slide-in-from-right-4">
          {shareToast && (
            <div className="app-panel px-6 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl">
              {shareToast}
            </div>
          )}
          {/* HEADER DETAIL */}
          <div className="app-panel p-4 sm:p-8">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
              <div className="space-y-6">
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setViewMode(currentEntityInfo?.type === 'CLIENTE' ? 'PROFILE' : 'SUPPLIER_PROFILE')}
                    className="w-12 h-12 rounded-2xl app-btn app-btn-ghost flex items-center justify-center"
                  >
                    <i className="fa-solid fa-arrow-left"></i>
                  </button>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-3xl font-black text-slate-800 dark:text-slate-200 tracking-tight">
                        {currentEntityInfo.id}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${currentEntityInfo.typeColor}`}
                      >
                        {currentEntityInfo.type}
                      </span>
                    </div>
                    <p className="app-subtitle">
                      {currentEntityInfo.type === 'NÓMINA'
                        ? 'Expediente de Pagos'
                        : 'Hoja de Vida Financiera'}
                    </p>
                    {currentEntityInfo.type === 'CLIENTE' && currentCustomer && (
                      <><div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-500">
                        <div>
                          <span className="font-semibold text-slate-600 dark:text-slate-400">CI/RIF:</span>{' '}
                          {getEntityField(currentCustomer.cedula)}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600 dark:text-slate-400">Telefono:</span>{' '}
                          {currentCustomer.telefono ? (
                            <a
                              href={`tel:${currentCustomer.telefono.replace(/\s+/g, '')}`}
                              className="text-slate-700 dark:text-slate-300 hover:text-[var(--ui-accent)]"
                            >
                              {formatPhone(currentCustomer.telefono)}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-600 dark:text-slate-400">Direccion:</span>{' '}
                          {getEntityField(currentCustomer.direccion)}
                        </div>
                      </div>
                      {(currentCustomer.creditLimit ?? 0) > 0 && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20">
                            <span className="text-[9px] font-black uppercase tracking-widest text-violet-500 dark:text-violet-400">Límite de crédito</span>
                            <span className="text-sm font-black text-violet-700 dark:text-violet-300">${(currentCustomer.creditLimit || 0).toFixed(2)}</span>
                          </div>
                          {currentEntityInfo.globalBalance > 0 && (
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${currentEntityInfo.globalBalance > (currentCustomer.creditLimit || 0) ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'}`}>
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Usado</span>
                              <span className={`text-sm font-black ${currentEntityInfo.globalBalance > (currentCustomer.creditLimit || 0) ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {((currentEntityInfo.globalBalance / (currentCustomer.creditLimit || 1)) * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  {/* GENERAR RECIBO BUTTON (Solo para Nómina) */}
                  {currentEntityInfo.type === 'NÓMINA' && (
                    <button
                      onClick={handleGenerateReceipt}
                      className="px-6 py-2.5 app-btn app-btn-primary flex items-center gap-2"
                    >
                      <i className="fa-solid fa-file-invoice-dollar"></i> Generar Recibo
                    </button>
                  )}

                  {/* REGISTRAR ABONO BUTTON (Solo para Clientes con saldo) */}
                  {currentEntityInfo.type === 'CLIENTE' && currentEntityInfo.globalBalance > 0.01 && (
                    <button
                      onClick={() => setShowAbonoModal(true)}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-500/25 transition-all"
                    >
                      <Receipt size={14} /> Registrar Abono
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Periodo / Rango
                    </label>
                    <select
                      className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400"
                      value={detailRangeFilter}
                      onChange={(e) =>
                        setDetailRangeFilter(
                          e.target.value as 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'CUSTOM'
                        )
                      }
                    >
                      <option value="ALL">📅 Todo el Historial</option>
                      <option value="SINCE_ZERO">0️⃣ Desde Saldo Cero</option>
                      <option value="SINCE_LAST_DEBT">🧾 Desde Ultima Factura</option>
                      <option value="CUSTOM">🗓️ Rango Manual</option>
                    </select>
                  </div>
                  {detailRangeFilter === 'CUSTOM' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400"
                        value={detailRangeFrom}
                        onChange={(e) => setDetailRangeFrom(e.target.value)}
                      />
                      <input
                        type="date"
                        className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400"
                        value={detailRangeTo}
                        onChange={(e) => setDetailRangeTo(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                  <div className="app-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Client Analytics
                      </p>
                      <span className="text-[10px] font-bold uppercase text-slate-400">KPIs</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Total Historico
                          </p>
                          <BarChart3 className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                          {formatCurrency(analyticsKpis.totalHistorical)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Ticket Promedio
                          </p>
                          <Receipt className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                          {formatCurrency(analyticsKpis.ticketAverage)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Dias Prom. de Pago
                          </p>
                          <Clock className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200">
                          {analyticsKpis.avgPaymentDays} dias
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Saldo Pendiente Total
                          </p>
                          <AlertTriangle className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className={`text-lg font-black ${totalPendingClass}`}>
                          {formatCurrency(Math.abs(totalPending), '$')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="app-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Tendencia 6 meses
                      </p>
                      <div className="text-[10px] font-bold uppercase text-slate-400">
                        Cargos vs Abonos
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-3">
                      <div className="relative h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trendData} barSize={12}>
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                              formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                              labelFormatter={(label) => `${label}`}
                            />
                            <Bar dataKey="cargos" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="abonos" fill="#10b981" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        {trendIsSparse && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-[11px] font-bold text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10">
                              Generando tendencia...
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2.5">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Distribucion de Deuda
                        </div>
                        <div className="mt-2 space-y-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>🇺🇸 Divisa</span>
                            <span>{formatCurrency(Math.abs(scopedBalances.divisa), '$')}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>🇻🇪 BCV</span>
                            <span>
                              {formatCurrency(Math.abs(scopedBalances.bcv * (rates.bcv || 1)), 'Bs')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>🟠 Grupo</span>
                            <span>
                              {formatCurrency(
                                Math.abs(scopedBalances.grupo * (rates.grupo || 1)),
                                'Bs'
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[9px] font-bold uppercase text-slate-400">
                      <span>Cargos</span>
                      <span>Abonos</span>
                    </div>
                  </div>
                </div>

                {/* TABS DE FILTRO — DINÁMICO */}
                <div className="flex app-chip p-1.5 rounded-xl gap-1">
                  {([
                    { id: 'ALL', label: 'Global' },
                    { id: AccountType.BCV, label: 'BCV' },
                    ...(hasDynamicPricing ? customRates.filter(r => r.enabled).map(r => ({ id: r.id, label: r.name })) : []),
                  ] as { id: string; label: string }[]).map(
                    (tab) => {
                      const isActive = activeTab === tab.id;
                      const activeClasses = tab.id === 'ALL'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-lg'
                        : tab.id === AccountType.BCV
                        ? 'bg-blue-800 text-white shadow-lg shadow-blue-200/20'
                        : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/20';
                      const inactiveClasses = 'text-slate-400 dark:text-white/30 hover:bg-slate-200 dark:hover:bg-slate-800';

                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                            isActive ? activeClasses : inactiveClasses
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Exportar / Compartir
                    </p>
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">Resguardos del estado</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Accion rapida</span>
                </div>

                <div className="mt-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Cuenta a exportar
                  </label>
                  <div className="mt-2">
                    <select
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                      value={shareMenuDetailAccount}
                      onChange={(e) => setShareMenuDetailAccount(e.target.value as TabFilter)}
                    >
                      <option value="ALL">Global</option>
                      <option value={AccountType.BCV}>BCV</option>
                      {hasDynamicPricing && customRates.filter(r => r.enabled).map(r => (
                        <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-2">
                      El estado respeta el rango actual; la cuenta sale segun este selector.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={copyShareText}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <Copy className="h-4 w-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          Copiar Estado de Cuenta
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Copia el mensaje listo para WhatsApp.
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Resumen Ejecutivo
                  </div>
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => handleExportPdfSummary(shareMenuDetailAccount)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xl">📄</div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF Resumido</div>
                          <div className="text-[11px] text-slate-500">
                            Solo saldos totales por cuenta.
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSummaryImage(shareMenuDetailAccount)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xl">🖼️</div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Imagen Resumida</div>
                          <div className="text-[11px] text-slate-500">Tarjeta limpia para compartir.</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Detalle Completo
                  </div>
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => handleExportPdfDetailed(shareMenuDetailAccount)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xl">📄</div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF Detallado</div>
                          <div className="text-[11px] text-slate-500">
                            Incluye todos los movimientos y detalles.
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportImage(shareMenuDetailAccount)}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-xl">🖼️</div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Imagen Detallada</div>
                          <div className="text-[11px] text-slate-500">Captura completa del reporte.</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DETAILED TABLE WITH DUAL VIEW (DUALIS / EXCEL) */}
          <CxCLedgerTable
            movements={movements}
            rates={rates}
            entityId={selectedEntityId}
            accountTab={activeTab}
            rangeFilter={detailRangeFilter as any}
            rangeFrom={detailRangeFrom}
            rangeTo={detailRangeTo}
            isPayroll={currentEntityInfo.type === 'NÓMINA'}
            onEditClick={handleEditClick}
          />
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingMovement && editForm && (
        <div className="fixed inset-0 bg-white dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <form
            onSubmit={handleSaveEdit}
            className="app-panel w-full max-w-2xl p-0 overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10 px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Detalles de la Operacion
                </p>
                <h3 className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight text-xl">
                  Editar Movimiento
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMovement(null)}
                className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 text-slate-500 hover:bg-rose-500 hover:text-slate-900 dark:text-white transition-all flex items-center justify-center shadow"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-4 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Fecha y hora
                  </label>
                  <input
                    type="datetime-local"
                    required
                    className="app-input"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Monto Original
                  </label>
                  <NumericFormat
                    value={editForm.amount}
                    onValueChange={(values) =>
                      setEditForm({ ...editForm, amount: values.value || '' })
                    }
                    thousandSeparator="."
                    decimalSeparator="," 
                    decimalScale={2}
                    allowNegative={false}
                    className="app-input text-lg"
                    placeholder="0,00"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Tasa Cambio
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="app-input"
                    value={editForm.rateUsed}
                    onChange={(e) => setEditForm({ ...editForm, rateUsed: e.target.value })}
                    disabled={editForm.currency === PaymentCurrency.USD}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Moneda Orig.
                  </label>
                  <select
                    className="app-input"
                    value={editForm.currency}
                    onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  >
                    <option value={PaymentCurrency.USD}>USD ($)</option>
                    <option value={PaymentCurrency.BS}>Bolívares (Bs)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Concepto / Glosa
                  </label>
                  <input
                    type="text"
                    required
                    className="app-input"
                    value={editForm.concept}
                    onChange={(e) => setEditForm({ ...editForm, concept: e.target.value })}
                  />
                </div>
              </div>

              {/* PREVIEW CALCULATION */}
              <div className="bg-indigo-50 p-4 rounded-xl text-center border border-indigo-100">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                  Nuevo Monto Contable (USD)
                </p>
                <p className="text-2xl font-black text-indigo-700">
                  {formatCurrency(
                    editForm.currency === PaymentCurrency.BS
                      ? (parseFloat(editForm.amount) || 0) / (parseFloat(editForm.rateUsed) || 1)
                      : parseFloat(editForm.amount) || 0
                  )}
                </p>
              </div>
            </div>

            <div className="px-8 pb-8 flex flex-col md:flex-row gap-3">
              <button
                type="button"
                onClick={handleDeleteClick}
                className="md:w-1/2 w-full py-4 rounded-xl bg-rose-100 text-rose-700 font-black uppercase text-xs hover:bg-rose-200"
              >
                🗑️ Eliminar Transacción
              </button>
              <button
                type="submit"
                className="md:flex-1 w-full py-4 app-btn app-btn-primary shadow-xl transition-all transform active:scale-95"
              >
                Guardar Corrección
              </button>
            </div>
          </form>
        </div>
      )}
      <WhatsAppTemplateModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        templates={messageTemplates}
        context={whatsAppContext}
        onSend={handleSendWhatsApp}
      />

      {/* ABONO DIRECTO MODAL */}
      {showAbonoModal && selectedEntityId && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-black/40 max-w-md w-full overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              <h3 className="text-sm font-black uppercase tracking-widest">Registrar Abono</h3>
              <p className="text-xs font-bold text-emerald-100/70 mt-0.5">{selectedEntityId}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Tipo de Cuenta</label>
                <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl p-1 border border-slate-200 dark:border-white/[0.08]">
                  {([AccountType.BCV, AccountType.GRUPO, AccountType.DIVISA] as AccountType[]).map(acct => (
                    <button key={acct} onClick={() => setAbonoAccount(acct)}
                      className={`flex-1 px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center ${abonoAccount === acct ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>
                      {acct}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Monto (USD)</label>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-slate-400">$</span>
                  <input type="number" min="0" step="0.01" value={abonoAmount} onChange={e => setAbonoAmount(e.target.value)} placeholder="0.00"
                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-lg font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Método de Pago</label>
                <select value={abonoMethod} onChange={e => setAbonoMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white">
                  <option>Transferencia</option>
                  <option>Pago Móvil</option>
                  <option>Efectivo USD</option>
                  <option>Efectivo Bs</option>
                  <option>Punto de Venta</option>
                  <option>Zelle</option>
                  <option>Binance</option>
                  <option>PayPal</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Referencia</label>
                <input value={abonoRef} onChange={e => setAbonoRef(e.target.value)} placeholder="Nro. referencia o comprobante"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Nota (opcional)</label>
                <input value={abonoNote} onChange={e => setAbonoNote(e.target.value)} placeholder="Descripción del pago"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>

              {/* Early payment discount preview */}
              {(() => {
                const cp = config.creditPolicy;
                if (!cp?.enabled || !cp.earlyPaymentTiers?.length) return null;
                const amt = parseFloat(abonoAmount || '0');
                if (amt <= 0) return null;
                const sortedTiers = [...cp.earlyPaymentTiers].sort((a, b) => a.maxDays - b.maxDays);
                return (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">Descuento por Pronto Pago</p>
                    <div className="flex flex-wrap gap-2">
                      {sortedTiers.map((t, i) => {
                        const disc = amt * (t.discountPercent / 100);
                        return (
                          <span key={i} className="px-2.5 py-1.5 bg-white dark:bg-slate-900 rounded-lg text-[10px] font-black text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                            ≤{t.maxDays}d: -{t.discountPercent}% (${disc.toFixed(2)})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAbonoModal(false); setAbonoAmount(''); setAbonoRef(''); setAbonoNote(''); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">
                  Cancelar
                </button>
                <button
                  disabled={!abonoAmount || parseFloat(abonoAmount) <= 0 || abonoLoading}
                  onClick={async () => {
                    setAbonoLoading(true);
                    try {
                      const amt = parseFloat(abonoAmount);
                      const now = new Date();
                      const rateForAccount = abonoAccount === AccountType.BCV ? rates.bcv : abonoAccount === AccountType.GRUPO ? rates.grupo : rates.divisa;
                      const isDivisaAcct = abonoAccount === AccountType.DIVISA;
                      const newMov: Partial<Movement> = {
                        entityId: selectedEntityId!,
                        concept: `Abono — ${abonoMethod}${abonoNote ? ` — ${abonoNote}` : ''}`,
                        amount: amt,
                        amountInUSD: amt,
                        currency: 'USD' as any,
                        date: now.toISOString().split('T')[0],
                        createdAt: now.toISOString(),
                        movementType: MovementType.ABONO,
                        accountType: abonoAccount,
                        rateUsed: isDivisaAcct ? 0 : rateForAccount,
                        reference: abonoRef || undefined,
                      };
                      const { addDoc, collection } = await import('firebase/firestore');
                      const { db } = await import('../firebase/config');
                      const businessId = config.companyName ? movements.find(m => m.businessId)?.businessId : movements[0]?.businessId;
                      await addDoc(collection(db, 'movements'), { ...newMov, businessId });
                      success('Abono registrado correctamente');
                      setShowAbonoModal(false);
                      setAbonoAmount('');
                      setAbonoRef('');
                      setAbonoNote('');
                    } catch (err) {
                      console.error(err);
                      error('Error al registrar el abono');
                    } finally {
                      setAbonoLoading(false);
                    }
                  }}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${parseFloat(abonoAmount || '0') > 0 && !abonoLoading ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-300 cursor-not-allowed'}`}>
                  {abonoLoading ? 'Procesando...' : <><Receipt size={14} /> Registrar Abono</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingSection;
