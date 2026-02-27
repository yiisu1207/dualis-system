import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NumericFormat } from 'react-number-format';
import {
  Supplier,
  Movement,
  AccountType,
  MovementType,
  ExchangeRates,
  PaymentCurrency,
} from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { scanInvoiceImage } from '../lib/ai-scanner';
import EmptyState from './EmptyState';

interface SupplierSectionProps {
  suppliers: Supplier[];
  movements: Movement[];
  onRegisterMovement: (data: any) => void;
  onRegisterSupplier: (s: Supplier) => void;
  onUpdateSupplier: (id: string, s: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
  onOpenLedger?: (supplierId: string) => void;
  rates: ExchangeRates;
  getSmartRate?: (date: string, accountType: AccountType) => Promise<number>;
  canCreateSupplier: boolean;
  canEditSupplier: boolean;
  canDeleteSupplier: boolean;
  canCreateMovement: boolean;
  canEditMovement: boolean;
  canDeleteMovement: boolean;
}

const SupplierSection: React.FC<SupplierSectionProps> = ({
  suppliers,
  movements,
  onRegisterMovement,
  onRegisterSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onUpdateMovement,
  onDeleteMovement,
  onOpenLedger,
  rates,
  getSmartRate,
  canCreateSupplier,
  canEditSupplier,
  canDeleteSupplier,
  canCreateMovement,
  canEditMovement,
  canDeleteMovement,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState({
    id: '',
    rif: '',
    contacto: '',
    categoria: 'Fábrica',
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [viewHistory, setViewHistory] = useState(false); // To toggle between Quick Action and History
  const [detailAccountFilter, setDetailAccountFilter] = useState<'ALL' | AccountType>('ALL');
  const [detailRangeFilter, setDetailRangeFilter] = useState<
    'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'SINCE_LAST_PAYMENT' | 'CUSTOM'
  >('ALL');
  const [detailRangeFrom, setDetailRangeFrom] = useState('');
  const [detailRangeTo, setDetailRangeTo] = useState('');

  // Transaction State
  const [movData, setMovData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    concept: '',
    type: MovementType.FACTURA,
    expenseCategory: 'Inventario',
    invoiceImage: '',
    accountType: AccountType.BCV,
    rate: String(rates?.bcv ?? '1'),
  });

  // Edit Movement State
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [editForm, setEditForm] = useState<{ amount: string }>({ amount: '' });
  const [ocrLoading, setOcrLoading] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const montoRef = useRef<HTMLInputElement | null>(null);
  const conceptoRef = useRef<HTMLInputElement | null>(null);
  const ocrInputRef = useRef<HTMLInputElement | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);
  const invoiceUpdateRef = useRef<HTMLInputElement | null>(null);
  const [invoiceTargetId, setInvoiceTargetId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const supplierStats = useMemo(() => {
    return suppliers.map((s) => {
      const sMovs = movements.filter((m) => m.entityId === s.id && m.isSupplierMovement);
      const sumBy = (accountType: AccountType, mvType: MovementType) =>
        sMovs
          .filter((m) => m.accountType === accountType && m.movementType === mvType)
          .reduce((acc, m) => acc + getMovementUsdAmount(m, rates), 0);

      const bcvDebt = sumBy(AccountType.BCV, MovementType.FACTURA);
      const bcvPaid = sumBy(AccountType.BCV, MovementType.ABONO);
      const bcvNet = bcvDebt - bcvPaid;

      const grupoDebt = sumBy(AccountType.GRUPO, MovementType.FACTURA);
      const grupoPaid = sumBy(AccountType.GRUPO, MovementType.ABONO);
      const grupoNet = grupoDebt - grupoPaid;

      const divDebt = sumBy(AccountType.DIVISA, MovementType.FACTURA);
      const divPaid = sumBy(AccountType.DIVISA, MovementType.ABONO);
      const divNet = divDebt - divPaid;

      const total = bcvNet + grupoNet + divNet;

      return {
        ...s,
        balance: total,
        balances: {
          bcv: bcvNet,
          grupo: grupoNet,
          div: divNet,
        },
      };
    });
  }, [suppliers, movements, rates]);

  const selectedSupplierMovements = useMemo(() => {
    if (!selectedSupplierId) return [];
    return movements
      .filter((m) => m.entityId === selectedSupplierId && m.isSupplierMovement)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, selectedSupplierId]);

  const filterMovementsByRange = (
    items: Movement[],
    account: 'ALL' | AccountType,
    range: 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'SINCE_LAST_PAYMENT' | 'CUSTOM',
    fromDate: string,
    toDate: string
  ) => {
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

    if (range === 'SINCE_LAST_DEBT' || range === 'SINCE_LAST_PAYMENT') {
      const targetType =
        range === 'SINCE_LAST_DEBT' ? MovementType.FACTURA : MovementType.ABONO;
      const idx =
        [...sorted].reverse().findIndex((m) => m.movementType === targetType) ?? -1;
      if (idx === -1) return sorted;
      const startIndex = sorted.length - 1 - idx;
      return sorted.slice(startIndex);
    }

    if (range === 'SINCE_ZERO') {
      let running = 0;
      let lastZeroIndex = -1;
      sorted.forEach((m, index) => {
        const amountUsd = getMovementUsdAmount(m, rates);
        const debt = m.movementType === MovementType.FACTURA ? amountUsd : 0;
        const paid = m.movementType === MovementType.ABONO ? amountUsd : 0;
        running += debt - paid;
        if (running <= 0) lastZeroIndex = index;
      });
      if (lastZeroIndex === -1) return sorted;
      return sorted.slice(lastZeroIndex);
    }

    return sorted;
  };

  const detailFilteredMovements = useMemo(() => {
    return filterMovementsByRange(
      selectedSupplierMovements,
      detailAccountFilter,
      detailRangeFilter,
      detailRangeFrom,
      detailRangeTo
    );
  }, [
    selectedSupplierMovements,
    detailAccountFilter,
    detailRangeFilter,
    detailRangeFrom,
    detailRangeTo,
  ]);

  const detailMovementsChrono = useMemo(() => {
    const sorted = [...detailFilteredMovements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const runningMap: Record<AccountType, number> = {
      [AccountType.BCV]: 0,
      [AccountType.GRUPO]: 0,
      [AccountType.DIVISA]: 0,
    };

    return sorted.map((m) => {
      const amountUsd = getMovementUsdAmount(m, rates);
      const delta = m.movementType === MovementType.FACTURA ? amountUsd : -amountUsd;
      const accountKey = m.accountType || AccountType.DIVISA;
      runningMap[accountKey] = (runningMap[accountKey] || 0) + delta;
      return { ...m, amountUsd, runningBalance: runningMap[accountKey] };
    });
  }, [detailFilteredMovements, rates]);

  const detailMovementsDisplay = useMemo(
    () => [...detailMovementsChrono].reverse(),
    [detailMovementsChrono]
  );

  const selectedSupplierTotals = useMemo(() => {
    const items = detailMovementsChrono;
    const bcv = items
      .filter((m) => m.accountType === AccountType.BCV)
      .reduce((acc, m) => acc + (m.movementType === MovementType.FACTURA ? m.amountUsd : -m.amountUsd), 0);
    const grupo = items
      .filter((m) => m.accountType === AccountType.GRUPO)
      .reduce((acc, m) => acc + (m.movementType === MovementType.FACTURA ? m.amountUsd : -m.amountUsd), 0);
    const div = items
      .filter((m) => m.accountType === AccountType.DIVISA)
      .reduce((acc, m) => acc + (m.movementType === MovementType.FACTURA ? m.amountUsd : -m.amountUsd), 0);
    return { bcv, grupo, div };
  }, [detailMovementsChrono]);

  const resolveAccountDotClass = (accountType: AccountType) => {
    if (accountType === AccountType.BCV) return 'bg-blue-500';
    if (accountType === AccountType.GRUPO) return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  useEffect(() => {
    let active = true;
    const resolveRate = async () => {
      if (movData.accountType === AccountType.DIVISA) {
        setMovData((prev) => ({ ...prev, rate: '1' }));
        return;
      }
      if (!getSmartRate) {
        const fallback =
          movData.accountType === AccountType.BCV ? rates.bcv : rates.grupo;
        setMovData((prev) => ({ ...prev, rate: String(fallback || 1) }));
        return;
      }
      const rate = await getSmartRate(movData.date, movData.accountType);
      if (!active) return;
      setMovData((prev) => ({ ...prev, rate: String(rate || 1) }));
    };
    resolveRate();
    return () => {
      active = false;
    };
  }, [movData.accountType, movData.date, getSmartRate, rates.bcv, rates.grupo]);

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (editSupplier) {
      if (!canEditSupplier) {
        alert('No tienes permisos para editar proveedores.');
        return;
      }
      onUpdateSupplier(editSupplier.id, editSupplier);
      setEditSupplier(null);
    } else {
      if (!canCreateSupplier) {
        alert('No tienes permisos para crear proveedores.');
        return;
      }
      if (!newSupplier.id) return;
      onRegisterSupplier({ ...newSupplier, id: newSupplier.id.toUpperCase() } as Supplier);
      setShowAdd(false);
      setNewSupplier({ id: '', rif: '', contacto: '', categoria: 'Fábrica' });
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !movData.amount) return;
    if (!canCreateMovement) return;
    const rateValue =
      movData.accountType === AccountType.DIVISA
        ? 1
        : Number(movData.rate) ||
          (movData.accountType === AccountType.BCV ? rates.bcv : rates.grupo) ||
          1;
    const amountValue = parseFloat(movData.amount);
    const currency =
      movData.accountType === AccountType.DIVISA ? PaymentCurrency.USD : PaymentCurrency.BS;
    onRegisterMovement({
      customerName: selectedSupplierId,
      ...movData,
      amount: amountValue,
      originalAmount: amountValue,
      currency,
      rate: rateValue,
      isSupplierMovement: true,
    });
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 2000);
    setMovData(prev => ({
      ...prev,
      amount: '',
      concept: '',
      date: new Date().toISOString().split('T')[0],
      invoiceImage: '',
    }));
    setTimeout(() => montoRef.current?.focus(), 50);
  };

  const handleAccountTypeChange = (at: AccountType) => {
    const newRate =
      at === AccountType.BCV ? String(rates?.bcv ?? '1') :
      at === AccountType.GRUPO ? String(rates?.grupo ?? '1') : '1';
    setMovData(prev => ({ ...prev, accountType: at, rate: newRate }));
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      setMovData(prev => ({
        ...prev,
        amount: '',
        concept: '',
        date: new Date().toISOString().split('T')[0],
        invoiceImage: '',
        accountType: AccountType.BCV,
        rate: String(rates?.bcv ?? '1'),
      }));
      return;
    }
    if (!e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'b': handleAccountTypeChange(AccountType.BCV); break;
      case 'g': handleAccountTypeChange(AccountType.GRUPO); break;
      case 'd': handleAccountTypeChange(AccountType.DIVISA); break;
      case 'f': setMovData(p => ({ ...p, type: MovementType.FACTURA })); break;
      case 'a': setMovData(p => ({ ...p, type: MovementType.ABONO })); break;
    }
  };

  const handleDelete = (id: string) => {
    if (!canDeleteSupplier) {
      alert('No tienes permisos para eliminar proveedores.');
      return;
    }
    if (confirm('¿Eliminar proveedor y sus registros?')) onDeleteSupplier(id);
  };

  const handleSaveEditMovement = () => {
    if (!canEditMovement) {
      alert('No tienes permisos para editar movimientos.');
      return;
    }
    if (editingMovement && editForm.amount) {
      const val = parseFloat(editForm.amount);
      const rate = editingMovement.rateUsed || 1;
      const amountInUSD =
        editingMovement.currency === PaymentCurrency.BS || editingMovement.currency === 'BS'
          ? val / (rate || 1)
          : val;
      onUpdateMovement(editingMovement.id, {
        amount: val,
        originalAmount: val,
        amountInUSD,
      });
      setEditingMovement(null);
    }
  };

  const resolveBalanceClass = (value: number) =>
    value >= 0 ? 'text-rose-600' : 'text-emerald-600';

  const resolveAccountLabel = (accountType: AccountType) => {
    if (accountType === AccountType.BCV) return 'BCV';
    if (accountType === AccountType.GRUPO) return 'GRUPO';
    return 'DIVISA';
  };

  return (
    <div className="app-section space-y-6 animate-in h-full flex flex-col">
      <input
        ref={invoiceUpdateRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !invoiceTargetId) return;
          if (!canEditMovement) {
            alert('No tienes permisos para adjuntar facturas.');
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            onUpdateMovement(invoiceTargetId, { invoiceImage: reader.result as string });
            setInvoiceTargetId(null);
          };
          reader.readAsDataURL(file);
          if (invoiceUpdateRef.current) invoiceUpdateRef.current.value = '';
        }}
      />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 app-panel p-6">
        <div className="app-section-header">
          <p className="app-subtitle">Cuentas por Pagar</p>
          <h1 className="app-title uppercase">Directorio de Proveedores</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          disabled={!canCreateSupplier}
          className={`px-6 py-2 text-[10px] app-btn ${
            canCreateSupplier ? 'app-btn-primary' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          + Nuevo Proveedor
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        {/* TABLA PROVEEDORES */}
        <div className="lg:col-span-2 app-panel overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-white">
            <i className="fa-solid fa-magnifying-glass text-slate-300 text-xs" />
            <input
              className="flex-1 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-300 bg-transparent"
              placeholder="Buscar proveedor..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="text-slate-300 hover:text-slate-500">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            )}
          </div>
          <div className="overflow-y-auto custom-scroll flex-1">
            {supplierStats.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon="📦"
                  title="Comienza tu Agenda"
                  description="Crea tu primer proveedor para registrar gastos y pagos."
                  actionLabel="Crear Nuevo Proveedor"
                  onAction={() => setShowAdd(true)}
                />
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0">
                  <tr>
                    <th className="p-4">Empresa / Fábrica</th>
                    <th className="p-4">Contacto</th>
                    <th className="p-4 text-right">Deuda Pendiente</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierStats.filter(s =>
                    !searchTerm || (s.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (s.rif || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (s.contacto || '').toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((s) => (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                        selectedSupplierId === s.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedSupplierId(s.id)}
                    >
                      <td className="p-4">
                        <p className="font-bold text-slate-700">{s.id}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{s.rif}</p>
                      </td>
                      <td className="p-4 text-xs font-medium text-slate-500">{s.contacto}</td>
                      <td className="p-4 text-right align-top">
                        <div className="flex flex-col items-end text-[11px] font-semibold">
                          <div
                            className={`flex items-center gap-2 ${resolveBalanceClass(
                              (s as any).balances?.bcv || 0
                            )}`}
                          >
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en bolivares segun tasa BCV"
                            >
                              BCV
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((s as any).balances?.bcv || 0), '$')}
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 ${resolveBalanceClass(
                              (s as any).balances?.grupo || 0
                            )}`}
                          >
                            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en divisa manejado internamente"
                            >
                              GRUPO
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((s as any).balances?.grupo || 0), '$')}
                            </span>
                          </div>
                          <div
                            className={`flex items-center gap-2 ${resolveBalanceClass(
                              (s as any).balances?.div || 0
                            )}`}
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                            <span
                              className="uppercase text-[10px] font-black text-slate-500"
                              title="Saldo en caja divisa (USD)"
                            >
                              DIVISA
                            </span>
                            <span className="font-mono">
                              {formatCurrency(Math.abs((s as any).balances?.div || 0), '$')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 flex justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLedger?.(s.id);
                          }}
                          className="text-emerald-500 hover:text-emerald-700"
                          title="Ver Libro Mayor"
                        >
                          <i className="fa-solid fa-folder-open"></i>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditSupplier(s);
                          }}
                          disabled={!canEditSupplier}
                          className={`text-indigo-500 ${
                            canEditSupplier ? 'hover:text-indigo-700' : 'opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <i className="fa-solid fa-pencil"></i>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(s.id);
                          }}
                          disabled={!canDeleteSupplier}
                          className={`text-rose-500 ${
                            canDeleteSupplier ? 'hover:text-rose-700' : 'opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* PANEL DE ACCIÓN & HISTORIAL */}
        <div className="bg-white rounded-[1.5rem] shadow-md border border-slate-200 flex flex-col h-fit overflow-hidden max-h-full">
          {selectedSupplierId ? (
            <>
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest">
                  {viewHistory ? 'Historial Detallado' : 'Operaciones Rápidas'}
                </h3>
                <button
                  onClick={() => setViewHistory(!viewHistory)}
                  className="text-[10px] font-bold text-blue-600 underline"
                >
                  {viewHistory ? 'Registrar Nuevo' : 'Ver Historial'}
                </button>
              </div>

              <div className="text-center p-4 bg-slate-50">
                <h3 className="font-black text-slate-800 leading-none">
                  {selectedSupplierId}
                </h3>
              </div>

              {viewHistory ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailAccountFilter('ALL')}
                      className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border transition-colors ${
                        detailAccountFilter === 'ALL'
                          ? 'bg-white text-slate-900 border-slate-900'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      Global
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailAccountFilter(AccountType.BCV)}
                      className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border transition-colors ${
                        detailAccountFilter === AccountType.BCV
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      BCV
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailAccountFilter(AccountType.GRUPO)}
                      className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border transition-colors ${
                        detailAccountFilter === AccountType.GRUPO
                          ? 'bg-amber-500 text-slate-900 border-amber-500'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      Grupo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailAccountFilter(AccountType.DIVISA)}
                      className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border transition-colors ${
                        detailAccountFilter === AccountType.DIVISA
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      Divisa
                    </button>
                    <div className="flex flex-col gap-1 min-w-[200px]">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Periodo / Rango
                      </label>
                      <select
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700"
                        value={detailRangeFilter}
                        onChange={(e) =>
                          setDetailRangeFilter(
                            e.target.value as
                              | 'ALL'
                              | 'SINCE_ZERO'
                              | 'SINCE_LAST_DEBT'
                              | 'SINCE_LAST_PAYMENT'
                              | 'CUSTOM'
                          )
                        }
                      >
                        <option value="ALL">📅 Todo el Historial</option>
                        <option value="SINCE_ZERO">0️⃣ Desde Saldo Cero</option>
                        <option value="SINCE_LAST_DEBT">🧾 Desde Ultimo Gasto</option>
                        <option value="SINCE_LAST_PAYMENT">💰 Desde Ultimo Pago</option>
                        <option value="CUSTOM">🗓️ Rango Personalizado</option>
                      </select>
                    </div>
                    {detailRangeFilter === 'CUSTOM' && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Desde
                          </label>
                          <input
                            type="date"
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700"
                            value={detailRangeFrom}
                            onChange={(e) => setDetailRangeFrom(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Hasta
                          </label>
                          <input
                            type="date"
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700"
                            value={detailRangeTo}
                            onChange={(e) => setDetailRangeTo(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-4 pb-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      Saldos Totales
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-right">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-blue-700 uppercase">BCV</span>
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        </div>
                        <div
                          className={`font-mono font-black text-lg truncate ${resolveBalanceClass(
                            selectedSupplierTotals.bcv
                          )}`}
                        >
                          {formatCurrency(Math.abs(selectedSupplierTotals.bcv), '$')}
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-right">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-orange-700 uppercase">Grupo</span>
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                        </div>
                        <div
                          className={`font-mono font-black text-lg truncate ${resolveBalanceClass(
                            selectedSupplierTotals.grupo
                          )}`}
                        >
                          {formatCurrency(Math.abs(selectedSupplierTotals.grupo), '$')}
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-100 text-right">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-emerald-700 uppercase">Divisa</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </div>
                        <div
                          className={`font-mono font-black text-lg truncate ${resolveBalanceClass(
                            selectedSupplierTotals.div
                          )}`}
                        >
                          {formatCurrency(Math.abs(selectedSupplierTotals.div), '$')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scroll">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest">
                        <tr>
                          <th className="p-3 text-left">Fecha</th>
                          <th className="p-3 text-left">Concepto</th>
                          <th className="p-3 text-left">Cuenta</th>
                          <th className="p-3 text-center">Tipo</th>
                          <th className="p-3 text-right">Monto</th>
                          <th className="p-3 text-right">Saldo</th>
                          <th className="p-3 text-center">Adjunto</th>
                          <th className="p-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailMovementsDisplay.map((m: any) => {
                          const amountUsd = m.amountUsd ?? getMovementUsdAmount(m, rates);
                          const runningBalance = m.runningBalance ?? 0;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50:bg-white/70">
                              <td className="p-3 text-slate-500 font-semibold">{m.date}</td>
                              <td className="p-3">
                                <p className="font-bold text-slate-700 truncate">
                                  {m.concept}
                                </p>
                                {m.expenseCategory && (
                                  <p className="text-[9px] uppercase text-slate-400 font-bold">
                                    {m.expenseCategory}
                                  </p>
                                )}
                              </td>
                              <td className="p-3">
                                <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-slate-600">
                                  <span
                                    className={`w-2 h-2 rounded-full ${resolveAccountDotClass(
                                      m.accountType || AccountType.DIVISA
                                    )}`}
                                  ></span>
                                  {resolveAccountLabel(m.accountType || AccountType.DIVISA)}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${
                                    m.movementType === MovementType.FACTURA
                                      ? 'bg-rose-100 text-rose-600'
                                      : 'bg-emerald-100 text-emerald-600'
                                  }`}
                                >
                                  {m.movementType}
                                </span>
                              </td>
                              <td
                                className={`p-3 text-right font-mono font-black ${
                                  m.movementType === MovementType.FACTURA
                                    ? 'text-rose-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {m.movementType === MovementType.FACTURA ? '-' : '+'}
                                {formatCurrency(amountUsd)}
                              </td>
                              <td className="p-3 text-right font-mono font-black">
                                {formatCurrency(runningBalance)}
                              </td>
                              <td className="p-3 text-center">
                                {m.invoiceImage ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewImage(m.invoiceImage as string);
                                      setPreviewTitle(m.concept || 'Factura adjunta');
                                    }}
                                    className="text-amber-600 hover:text-amber-700"
                                  >
                                    <i className="fa-solid fa-paperclip"></i>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!canEditMovement) {
                                        alert('No tienes permisos para adjuntar facturas.');
                                        return;
                                      }
                                      setInvoiceTargetId(m.id);
                                      invoiceUpdateRef.current?.click();
                                    }}
                                    className="text-slate-400 hover:text-amber-600"
                                  >
                                    <i className="fa-solid fa-paperclip"></i>
                                  </button>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMovement(m);
                                      setEditForm({ amount: String(m.amount) });
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800"
                                  >
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm('Eliminar?')) onDeleteMovement(m.id);
                                    }}
                                    className="text-rose-600 hover:text-rose-800"
                                  >
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-3">
                  {/* Hidden file inputs */}
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setOcrLoading(true);
                      try {
                        const result = await scanInvoiceImage(file, 'SUPPLIER');
                        const resolvedAccount =
                          result?.accountType === 'BCV' ? AccountType.BCV :
                          result?.accountType === 'GRUPO' ? AccountType.GRUPO :
                          result?.currency === 'BS' ? AccountType.BCV : AccountType.DIVISA;
                        if (result?.entityName) setSelectedSupplierId(String(result.entityName).toUpperCase());
                        if (result?.amount != null) setMovData(prev => ({ ...prev, amount: String(Number(result.amount) || 0) }));
                        if (result?.concept) setMovData(prev => ({ ...prev, concept: String(result.concept) }));
                        if (result?.movementType === 'ABONO') setMovData(prev => ({ ...prev, type: MovementType.ABONO }));
                        if (result?.movementType === 'FACTURA') setMovData(prev => ({ ...prev, type: MovementType.FACTURA }));
                        setMovData(prev => ({
                          ...prev,
                          accountType: resolvedAccount,
                          rate: resolvedAccount === AccountType.DIVISA ? '1' :
                            String(resolvedAccount === AccountType.BCV ? rates.bcv || 1 : rates.grupo || 1),
                        }));
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setOcrLoading(false);
                        if (ocrInputRef.current) ocrInputRef.current.value = '';
                      }
                    }}
                  />
                  <input
                    ref={invoiceInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => setMovData(prev => ({ ...prev, invoiceImage: reader.result as string }));
                      reader.readAsDataURL(file);
                      if (invoiceInputRef.current) invoiceInputRef.current.value = '';
                    }}
                  />

                  <form onSubmit={handleRegister} onKeyDown={handleFormKeyDown}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">

                    {/* Fila 1: Tipo + Cuenta + Adjuntos */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Type pills */}
                      {([
                        { t: MovementType.FACTURA, label: 'Gasto', hint: '⌥F', color: 'amber' },
                        { t: MovementType.ABONO, label: 'Pago', hint: '⌥A', color: 'emerald' },
                      ] as const).map(({ t, label, hint, color }) => (
                        <button
                          key={t} type="button"
                          onClick={() => setMovData(p => ({ ...p, type: t }))}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1.5 ${
                            movData.type === t
                              ? color === 'amber'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {label}
                          <span className="opacity-60 font-normal text-[9px]">{hint}</span>
                        </button>
                      ))}

                      <div className="w-px h-4 bg-slate-200" />

                      {/* Account type pills */}
                      {([
                        { at: AccountType.BCV, label: 'BCV', hint: '⌥B', color: 'indigo' },
                        { at: AccountType.GRUPO, label: 'Grupo', hint: '⌥G', color: 'orange' },
                        { at: AccountType.DIVISA, label: 'Divisa', hint: '⌥D', color: 'emerald' },
                      ] as const).map(({ at, label, hint, color }) => (
                        <button
                          key={at} type="button"
                          onClick={() => handleAccountTypeChange(at)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1.5 ${
                            movData.accountType === at
                              ? color === 'indigo'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : color === 'orange'
                                ? 'bg-orange-500 text-white shadow-sm'
                                : 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {label}
                          <span className="opacity-60 font-normal text-[9px]">{hint}</span>
                        </button>
                      ))}

                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => ocrInputRef.current?.click()}
                          className="px-2.5 py-1.5 text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                        >
                          {ocrLoading ? '...' : 'OCR'}
                        </button>
                        <button
                          type="button"
                          onClick={() => invoiceInputRef.current?.click()}
                          className={`px-2.5 py-1.5 text-[10px] font-black uppercase rounded-lg border transition-colors ${
                            movData.invoiceImage
                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200'
                          }`}
                        >
                          {movData.invoiceImage ? '📎 ✓' : '📎'}
                        </button>
                      </div>
                    </div>

                    {/* Fila 2: Monto + Tasa + Categoría + Fecha + Concepto + Guardar */}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {movData.accountType === AccountType.DIVISA ? 'Monto ($)' : 'Monto (Bs)'}
                        </label>
                        <NumericFormat
                          getInputRef={montoRef}
                          value={movData.amount}
                          onValueChange={vals => setMovData(prev => ({ ...prev, amount: vals.value || '' }))}
                          thousandSeparator="."
                          decimalSeparator=","
                          decimalScale={2}
                          allowNegative={false}
                          tabIndex={1}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); conceptoRef.current?.focus(); } }}
                          className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-800 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                          placeholder="0,00"
                          required
                        />
                      </div>

                      {movData.accountType !== AccountType.DIVISA && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tasa</label>
                          <input
                            type="number"
                            step="0.0001"
                            tabIndex={2}
                            className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all"
                            value={movData.rate}
                            onChange={e => setMovData(prev => ({ ...prev, rate: e.target.value }))}
                            required
                          />
                        </div>
                      )}

                      {movData.type === MovementType.FACTURA && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoría</label>
                          <select
                            tabIndex={3}
                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-600 outline-none focus:border-[var(--ui-accent)] transition-all"
                            value={movData.expenseCategory}
                            onChange={e => setMovData(prev => ({ ...prev, expenseCategory: e.target.value }))}
                          >
                            <option value="Inventario">Inventario</option>
                            <option value="Servicios">Servicios</option>
                            <option value="Nomina">Nómina</option>
                            <option value="Alquiler">Alquiler</option>
                            <option value="Mantenimiento">Mantenimiento</option>
                            <option value="Otros">Otros</option>
                          </select>
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                        <input
                          type="date"
                          tabIndex={4}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-600 outline-none focus:border-[var(--ui-accent)] transition-all"
                          value={movData.date}
                          onChange={e => setMovData(prev => ({ ...prev, date: e.target.value }))}
                        />
                      </div>

                      <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {movData.type === MovementType.FACTURA ? 'Nro Factura / Descripción' : 'Concepto / Referencia'}
                        </label>
                        <input
                          ref={conceptoRef}
                          tabIndex={5}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-soft)] transition-all placeholder:text-slate-300"
                          value={movData.concept}
                          onChange={e => setMovData(prev => ({ ...prev, concept: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRegister(e as any); } }}
                          placeholder={movData.type === MovementType.FACTURA ? 'FAC-001...' : 'Transferencia...'}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        tabIndex={6}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm ${
                          successFlash
                            ? 'bg-emerald-500 text-white'
                            : movData.type === MovementType.FACTURA
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        }`}
                      >
                        {successFlash ? '✓ Guardado' : 'Guardar ↵'}
                      </button>
                    </div>
                  </form>

                  {/* Keyboard hints */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-300 px-1">
                    <span>⌥F Gasto</span>
                    <span>⌥A Pago</span>
                    <span className="text-slate-200">·</span>
                    <span>⌥B BCV</span>
                    <span>⌥G Grupo</span>
                    <span>⌥D Divisa</span>
                    <span className="text-slate-200">·</span>
                    <span>↵ Guardar</span>
                    <span>Esc Limpiar</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-10 text-center opacity-50 flex flex-col items-center justify-center h-full">
              <i className="fa-solid fa-arrow-left text-3xl mb-2"></i>
              <p className="text-xs font-bold uppercase">Seleccione un proveedor</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL EDIT MOVEMENT */}
      {editingMovement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-4">Corregir Monto</h3>
            <NumericFormat
              value={editForm.amount}
              onValueChange={(values) => setEditForm({ amount: values.value || '' })}
              thousandSeparator="."
              decimalSeparator="," 
              decimalScale={2}
              allowNegative={false}
              className="w-full p-3 border rounded-xl mb-4 font-bold"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingMovement(null)}
                className="flex-1 py-2 text-slate-500 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditMovement}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADD/EDIT SUPPLIER */}
      {(showAdd || editSupplier) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in"
          >
            <h3 className="font-black text-slate-800 uppercase italic text-lg mb-6">
              {editSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h3>
            <div className="space-y-3">
              <input
                placeholder="Nombre Empresa"
                className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.id : newSupplier.id}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, id: e.target.value })
                    : setNewSupplier({ ...newSupplier, id: e.target.value })
                }
                required
              />
              <input
                placeholder="RIF"
                className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.rif : newSupplier.rif}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, rif: e.target.value })
                    : setNewSupplier({ ...newSupplier, rif: e.target.value })
                }
              />
              <input
                placeholder="Contacto / Tel"
                className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.contacto : newSupplier.contacto}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, contacto: e.target.value })
                    : setNewSupplier({ ...newSupplier, contacto: e.target.value })
                }
              />
              <input
                placeholder="Categoría (Telas, Hilos...)"
                className="w-full p-3 bg-slate-50 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.categoria : newSupplier.categoria}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, categoria: e.target.value })
                    : setNewSupplier({ ...newSupplier, categoria: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setEditSupplier(null);
                }}
                className="flex-1 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-blue-600 text-slate-900 rounded-xl font-black uppercase text-xs"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-700">Factura adjunta</h3>
                <p className="text-xs text-slate-500 truncate">{previewTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewImage(null);
                  setPreviewTitle('');
                }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 flex items-center justify-center">
              <img src={previewImage} alt="Factura" className="max-h-[70vh] w-auto rounded-lg" />
            </div>
            <div className="mt-3 flex justify-end">
              <a
                href={previewImage}
                download
                className="px-4 py-2 rounded-lg bg-white text-slate-900 text-xs font-black uppercase"
              >
                Descargar
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierSection;
