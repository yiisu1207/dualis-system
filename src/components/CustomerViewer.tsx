import React, { useState, useMemo, useEffect } from 'react';
import {
  Customer,
  Movement,
  AccountType,
  MovementType,
  ExchangeRates,
  PaymentCurrency,
} from '../../types';
import Autocomplete from './Autocomplete';
import { formatCurrency } from '../utils/formatters';

interface CustomerViewerProps {
  customers: Customer[];
  movements: Movement[];
  selectedId?: string | null;
  onSelectCustomer: (id: string | null) => void;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
  onAddMovement: (data: any) => void;
  onRegisterCustomer: (c: Customer) => void;
  onUpdateCustomer: (id: string, c: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  rates: ExchangeRates;
}

// --- SUB-COMPONENT: ACTION CARD ---
const ActionCard: React.FC<{
  title: string;
  accountType: AccountType;
  rate: number;
  headerColor: string;
  btnColor: string;
  icon: string;
  customerName?: string;
  isGlobal?: boolean;
  allCustomers?: Customer[];
  onAction: (data: any) => void;
  onCreateCustomer?: (c: Customer) => void;
}> = ({
  title,
  accountType,
  rate,
  headerColor,
  btnColor,
  icon,
  customerName,
  isGlobal,
  allCustomers,
  onAction,
  onCreateCustomer,
}) => {
  const [localCustomer, setLocalCustomer] = useState(customerName || '');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [reference, setReference] = useState('');
  const [type, setType] = useState<MovementType>(MovementType.FACTURA);
  const [currency, setCurrency] = useState<PaymentCurrency>(
    accountType === AccountType.DIVISA ? PaymentCurrency.USD : PaymentCurrency.BS
  );
  const [customRate, setCustomRate] = useState(rate.toString());
  const [quickPaymentOption, setQuickPaymentOption] = useState<'USD' | 'BS'>(
    accountType === AccountType.DIVISA ? 'USD' : 'BS'
  );

  useEffect(() => {
    if (customerName) setLocalCustomer(customerName);
  }, [customerName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !concept || !localCustomer) {
      if (!localCustomer) alert('Por favor seleccione un cliente.');
      return;
    }
    const numAmount = parseFloat(amount);
    const usedRate = parseFloat(customRate) || 1;

    // Determinar método de pago según opción rápida
    const metodoPago = quickPaymentOption === 'BS' ? 'Transferencia' : 'Efectivo';
    const usedCurrency = quickPaymentOption === 'BS' ? PaymentCurrency.BS : PaymentCurrency.USD;

    // amountInUSD: si es bolívares dividimos entre la tasa, si es USD usamos directo
    const amountInUSD = usedCurrency === PaymentCurrency.BS ? numAmount / usedRate : numAmount;

    onAction({
      customerName: localCustomer,
      date: new Date().toISOString().split('T')[0],
      concept,
      amount: amountInUSD,
      originalAmount: numAmount,
      type,
      accountType,
      currency: usedCurrency,
      rate: usedRate,
      metodoPago,
      reference: reference || null,
    });
    setAmount('');
    setConcept('');
    setReference('');
    if (isGlobal) setLocalCustomer('');
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full hover:border-indigo-300 transition-colors">
      <div className={`${headerColor} px-3 py-2 flex justify-between items-center text-white`}>
        <div className="flex items-center gap-2">
          <i className={`fa-solid ${icon} text-xs`}></i>
          <span className="font-bold text-[10px] uppercase tracking-wide">{title}</span>
        </div>
        <div className="text-[9px] font-mono bg-black/20 px-1.5 rounded">Ref: {rate}</div>
      </div>
      <form onSubmit={handleSubmit} className="p-3 flex flex-col gap-2 flex-1">
        {isGlobal && allCustomers ? (
          <Autocomplete
            items={allCustomers}
            stringify={(c: any) => c.id}
            placeholder="Cliente..."
            value={localCustomer}
            onChange={setLocalCustomer}
            onSelect={(c: any) => setLocalCustomer(c.id)}
            onCreate={(name) => {
              if (onCreateCustomer)
                onCreateCustomer({
                  id: name.toUpperCase(),
                  cedula: 'N/A',
                  telefono: '',
                  direccion: '',
                });
              setLocalCustomer(name.toUpperCase());
            }}
          />
        ) : (
          <div className="hidden"></div>
        )}

        <div className="flex rounded-md bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setType(MovementType.FACTURA)}
            className={`flex-1 py-1 text-[9px] font-bold uppercase rounded transition-all ${
              type === MovementType.FACTURA
                ? 'bg-white shadow-sm text-rose-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Deuda
          </button>
          <button
            type="button"
            onClick={() => setType(MovementType.ABONO)}
            className={`flex-1 py-1 text-[9px] font-bold uppercase rounded transition-all ${
              type === MovementType.ABONO
                ? 'bg-white shadow-sm text-emerald-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Abono
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">
                {currency === PaymentCurrency.BS ? 'Bs' : '$'}
              </span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                required
                className="w-full pl-6 pr-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {accountType !== AccountType.DIVISA && (
              <div className="w-16">
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-1 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded text-xs text-center outline-none focus:border-indigo-500"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  title="Tasa"
                />
              </div>
            )}
          </div>

          <div className="mt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickPaymentOption('USD');
                  setCurrency(PaymentCurrency.USD);
                }}
                className={`py-1 px-3 rounded-md text-xs font-bold ${
                  quickPaymentOption === 'USD'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white'
                }`}
              >
                USD / EFECTIVO
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickPaymentOption('BS');
                  setCurrency(PaymentCurrency.BS);
                }}
                className={`py-1 px-3 rounded-md text-xs font-bold ${
                  quickPaymentOption === 'BS'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white'
                }`}
              >
                Bs / TRANSFERENCIA
              </button>
            </div>
            <div className="mt-2">
              <span
                className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full text-white"
                style={{ backgroundColor: 'var(--odoo-primary)' }}
              >
                {quickPaymentOption === 'BS' ? '💳 TRANSFERENCIA' : '💵 EFECTIVO'}
              </span>
            </div>
          </div>

          <input
            type="text"
            placeholder="Concepto..."
            className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300 outline-none focus:bg-white focus:border-indigo-500"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Referencia / N° Control (opcional)"
            className="w-full mt-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300 outline-none"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className={`w-full py-2 mt-auto text-white rounded font-bold text-[10px] uppercase tracking-wide shadow-sm hover:shadow-md transition-all active:scale-95 ${btnColor}`}
        >
          Procesar
        </button>
      </form>
    </div>
  );
};

// --- MAIN COMPONENT ---
const CustomerViewer: React.FC<CustomerViewerProps> = ({
  customers,
  movements,
  selectedId: propSelectedId,
  onSelectCustomer,
  onUpdateMovement,
  onDeleteMovement,
  onAddMovement,
  onRegisterCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  rates,
}) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'DETAIL' | 'AGING'>('LIST');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showQuickOp, setShowQuickOp] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const [quickForm, setQuickForm] = useState({
    customerName: '',
    amount: '',
    concept: '',
    type: MovementType.FACTURA,
    accountType: AccountType.DIVISA,
    rate: '',
    reference: '',
    useRate: true,
  });

  useEffect(() => {
    if (propSelectedId) {
      setInternalSelectedId(propSelectedId);
      setViewMode('DETAIL');
    }
  }, [propSelectedId]);

  useEffect(() => {
    const r =
      quickForm.accountType === AccountType.BCV
        ? rates.bcv
        : quickForm.accountType === AccountType.GRUPO
        ? rates.grupo
        : 1;
    setQuickForm((prev) => ({ ...prev, rate: r.toString() }));
  }, [quickForm.accountType, rates]);

  const directoryData = useMemo(() => {
    const toNum = (v: any) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    return customers
      .map((c) => {
        const customerMovs = movements.filter((m) => m.entityId === c.id);
        const nativeAmount = (m: any) => {
          if (m?.originalAmount != null) return toNum(m.originalAmount);
          if (m?.amountInUSD != null) {
            if (m.accountType === AccountType.DIVISA) return toNum(m.amountInUSD);
            const r = toNum(m.rateUsed ?? m.rate ?? 1);
            return toNum(m.amountInUSD * r);
          }
          return 0;
        };

        const sumBy = (filterAccount: AccountType, mvType: MovementType) =>
          customerMovs
            .filter((m: any) => m.accountType === filterAccount && m.movementType === mvType)
            .reduce((s: number, m: any) => s + nativeAmount(m), 0);

        const bcvDebt = sumBy(AccountType.BCV, MovementType.FACTURA);
        const bcvPaid = sumBy(AccountType.BCV, MovementType.ABONO);
        const bcvNet = bcvPaid - bcvDebt;

        const grupoDebt = sumBy(AccountType.GRUPO, MovementType.FACTURA);
        const grupoPaid = sumBy(AccountType.GRUPO, MovementType.ABONO);
        const grupoNet = grupoPaid - grupoDebt;

        const divDebt = sumBy(AccountType.DIVISA, MovementType.FACTURA);
        const divPaid = sumBy(AccountType.DIVISA, MovementType.ABONO);
        const divNet = divPaid - divDebt;

        const totalNetUSD = 0;

        return {
          ...c,
          lastMov: customerMovs[0]?.date || '-',
          balances: {
            bcv: toNum(bcvNet),
            grupo: toNum(grupoNet),
            div: toNum(divNet),
            totalUSD: toNum(totalNetUSD),
          },
        };
      })
      .filter(
        (c) =>
          c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.cedula || '').toString().includes(searchTerm)
      );
  }, [customers, movements, searchTerm]);

  const agingReport = useMemo(() => {
    const report: {
      customer: string;
      amount: number;
      age: number;
      date: string;
      category: 'green' | 'yellow' | 'red';
    }[] = [];
    const today = new Date();

    directoryData
      .filter((c) => c.balance > 1)
      .forEach((c) => {
        const invoices = movements
          .filter((m) => m.entityId === c.id && m.movementType === MovementType.FACTURA)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalPaid = movements
          .filter((m) => m.entityId === c.id && m.movementType === MovementType.ABONO)
          .reduce((s, m) => s + m.amountInUSD, 0);

        let remainingPaymentCoverage = totalPaid;
        const invoicesOldestFirst = [...invoices].reverse();

        invoicesOldestFirst.forEach((inv) => {
          if (remainingPaymentCoverage >= inv.amountInUSD) {
            remainingPaymentCoverage -= inv.amountInUSD;
          } else {
            const openAmount = inv.amountInUSD - remainingPaymentCoverage;
            remainingPaymentCoverage = 0;

            const invDate = new Date(inv.date);
            const diffTime = Math.abs(today.getTime() - invDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let category: 'green' | 'yellow' | 'red' = 'green';
            if (diffDays > 30) category = 'red';
            else if (diffDays > 15) category = 'yellow';

            report.push({
              customer: c.id,
              amount: openAmount,
              age: diffDays,
              date: inv.date,
              category,
            });
          }
        });
      });

    return report.sort((a, b) => b.age - a.age);
  }, [directoryData, movements]);

  const selectedCustomer = customers.find((c) => c.id === internalSelectedId);
  const filteredMovements = useMemo(
    () =>
      movements
        .filter((m) => m.entityId === internalSelectedId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements, internalSelectedId]
  );

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (editCustomer) {
      onUpdateCustomer(editCustomer.id, editCustomer);
      setEditCustomer(null);
    } else {
      if (!newCustomer.id || !newCustomer.cedula) return alert('Nombre y Cédula requeridos');
      onRegisterCustomer({
        id: newCustomer.id.toUpperCase(),
        cedula: newCustomer.cedula,
        telefono: newCustomer.telefono || '',
        direccion: newCustomer.direccion || '',
      });
      setShowAddModal(false);
      setNewCustomer({});
    }
  };

  const handleQuickOpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickForm.customerName || !quickForm.amount || !quickForm.concept) return;

    const numAmount = parseFloat(quickForm.amount);
    const usedRate = parseFloat(quickForm.rate) || 1;

    let currency = PaymentCurrency.USD;
    if (quickForm.accountType !== AccountType.DIVISA) currency = PaymentCurrency.BS;

    const amountInUSD = currency === PaymentCurrency.BS ? numAmount / usedRate : numAmount;

    onAddMovement({
      customerName: quickForm.customerName,
      date: new Date().toISOString().split('T')[0],
      concept: quickForm.concept,
      amount: amountInUSD,
      originalAmount: numAmount,
      type: quickForm.type,
      accountType: quickForm.accountType,
      currency: currency,
      rate: usedRate,
      reference: quickForm.reference || null,
    });

    setShowQuickOp(false);
    setQuickForm({ ...quickForm, amount: '', concept: '', reference: '' });
    alert('✅ Operación registrada con éxito');
  };

  const handleExportCSV = () => {
    const headers = [
      'NOMBRE/RAZON SOCIAL',
      'CEDULA/RIF',
      'TELEFONO',
      'SALDO BCV (Bs)',
      'SALDO GRUPO (Bs)',
      'SALDO DIVISA ($)',
      'ULTIMO MOVIMIENTO',
    ];
    const rows = directoryData.map((c) => {
      const bcv = (c as any).balances?.bcv || 0;
      const grupo = (c as any).balances?.grupo || 0;
      const divisa = (c as any).balances?.div || 0;
      const bcvUsd = rates.bcv ? bcv / rates.bcv : 0;
      const grupoUsd = rates.grupo ? grupo / rates.grupo : 0;
      return [
        c.id,
        c.cedula,
        c.telefono,
        bcvUsd.toFixed(2),
        grupoUsd.toFixed(2),
        divisa.toFixed(2),
        c.lastMov,
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'directorio_clientes.csv');
    document.body.appendChild(link);
    link.click();
  };

  const handleDelete = (id: string) => {
    if (confirm(`¿Eliminar al cliente ${id} y todo su historial?`)) {
      onDeleteCustomer(id);
      setViewMode('LIST');
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-slate-800 p-6 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase italic">
            {viewMode === 'LIST'
              ? 'Directorio de Clientes'
              : viewMode === 'AGING'
              ? 'Semáforo de Morosidad'
              : `Expediente: ${internalSelectedId}`}
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Módulo de Gestión de Cobranzas
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {viewMode === 'DETAIL' &&
            selectedCustomer &&
            (() => {
              const d = directoryData.find((c) => c.id === selectedCustomer.id);
              const bcv = d?.balances?.bcv || 0;
              const grupo = d?.balances?.grupo || 0;
              const div = d?.balances?.div || 0;
              const bcvUsd = rates.bcv ? bcv / rates.bcv : 0;
              const grupoUsd = rates.grupo ? grupo / rates.grupo : 0;
              return (
                <div className="hidden md:flex items-center gap-3 mr-2">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700 text-right flex flex-col justify-center items-end min-w-[140px]">
                    <div className="text-[10px] text-slate-400 font-bold">BCV</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        bcvUsd > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(bcvUsd), '$')}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700 text-right flex flex-col justify-center items-end min-w-[140px]">
                    <div className="text-[10px] text-slate-400 font-bold">Grupo</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        grupoUsd > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(grupoUsd), '$')}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700 text-right flex flex-col justify-center items-end min-w-[120px]">
                    <div className="text-[10px] text-slate-400 font-bold">Divisa</div>
                    <div
                      className={`font-mono font-black text-2xl truncate ${
                        div > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {formatCurrency(Math.abs(div), '$')}
                    </div>
                  </div>
                </div>
              );
            })()}
          {viewMode === 'DETAIL' && (
            <button
              onClick={() => setViewMode('LIST')}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i> Volver
            </button>
          )}

          {viewMode !== 'DETAIL' && (
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase ${
                  viewMode === 'LIST' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('AGING')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase ${
                  viewMode === 'AGING' ? 'bg-white shadow text-rose-600' : 'text-slate-400'
                }`}
              >
                Semáforo
              </button>
            </div>
          )}

          {viewMode === 'LIST' && (
            <>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs uppercase hover:bg-emerald-100 border border-emerald-200 hidden md:block"
              >
                <i className="fa-solid fa-file-excel mr-2"></i> Exportar
              </button>
              <button
                onClick={() => setShowQuickOp(true)}
                className="px-4 py-2 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-black text-xs uppercase hover:bg-amber-100 shadow-sm flex items-center gap-2"
              >
                <i className="fa-solid fa-bolt"></i> Operación Rápida
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase hover:bg-indigo-700 shadow-lg"
              >
                + Nuevo Cliente
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'LIST' && (
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="px-6 pt-6 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <ActionCard
                isGlobal
                allCustomers={customers}
                title="BCV"
                accountType={AccountType.BCV}
                rate={rates.bcv}
                headerColor="bg-blue-800"
                btnColor="bg-blue-800"
                icon="fa-building-columns"
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                isGlobal
                allCustomers={customers}
                title="Grupo"
                accountType={AccountType.GRUPO}
                rate={rates.grupo}
                headerColor="bg-orange-600"
                btnColor="bg-orange-600"
                icon="fa-users"
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                isGlobal
                allCustomers={customers}
                title="Divisa"
                accountType={AccountType.DIVISA}
                rate={1}
                headerColor="bg-emerald-700"
                btnColor="bg-emerald-700"
                icon="fa-money-bill"
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
            </div>
          </div>

          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 mt-4">
            <input
              type="text"
              placeholder="🔍 Buscar cliente por nombre, cédula..."
              className="w-full bg-transparent border-none outline-none font-bold text-slate-600 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Nombre / Razón Social</th>
                  <th className="px-6 py-4">RIF / C.I.</th>
                  <th className="px-6 py-4">Teléfono</th>
                  <th className="px-6 py-4 text-right">Saldo Actual</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {directoryData.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-white">{c.id}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{c.cedula}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{c.telefono}</td>
                    <td className="px-6 py-4 text-right align-top">
                      <div className="flex flex-col items-end text-xs">
                        <div
                          className={`flex items-center gap-2 ${
                            ((c as any).balances?.bcv || 0) / (rates.bcv || 1) > 0
                              ? 'text-emerald-500'
                              : 'text-rose-500'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                          <span>
                            {formatCurrency(
                              Math.abs(((c as any).balances?.bcv || 0) / (rates.bcv || 1)),
                              '$'
                            )}
                          </span>
                        </div>
                        <div
                          className={`flex items-center gap-2 ${
                            ((c as any).balances?.grupo || 0) / (rates.grupo || 1) > 0
                              ? 'text-emerald-500'
                              : 'text-rose-500'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                          <span>
                            {formatCurrency(
                              Math.abs(((c as any).balances?.grupo || 0) / (rates.grupo || 1)),
                              '$'
                            )}
                          </span>
                        </div>
                        <div
                          className={`flex items-center gap-2 ${
                            (c as any).balances?.div > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                          <span>
                            {formatCurrency(Math.abs((c as any).balances?.div || 0), '$')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 flex justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditCustomer(c)}
                        className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors"
                        title="Editar Datos"
                      >
                        <i className="fa-solid fa-pencil"></i>
                      </button>
                      <button
                        onClick={() => {
                          setInternalSelectedId(c.id);
                          setViewMode('DETAIL');
                        }}
                        className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-colors"
                        title="Ver Expediente"
                      >
                        <i className="fa-solid fa-folder-open"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center justify-center transition-colors"
                        title="Eliminar"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'AGING' && (
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col p-6 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            <div className="flex flex-col bg-emerald-50/50 rounded-2xl border border-emerald-100 overflow-hidden">
              <div className="p-4 bg-emerald-100 border-b border-emerald-200 text-center">
                <h3 className="text-emerald-800 font-black uppercase text-xs tracking-widest">
                  Al Día (0-15 Días)
                </h3>
                <p className="text-emerald-600 text-[10px] font-bold mt-1">Cobranza Regular</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingReport
                  .filter((i) => i.category === 'green')
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-xl shadow-sm border border-emerald-100"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className="font-bold text-slate-700 text-xs truncate max-w-[120px]"
                          title={item.customer}
                        >
                          {item.customer}
                        </span>
                        <span className="font-mono font-black text-emerald-600 text-xs">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>{item.date}</span>
                        <span>{item.age} días</span>
                      </div>
                    </div>
                  ))}
                {agingReport.filter((i) => i.category === 'green').length === 0 && (
                  <div className="text-center text-emerald-300 font-black uppercase text-xs mt-10">
                    Sin deudas recientes
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col bg-amber-50/50 rounded-2xl border border-amber-100 overflow-hidden">
              <div className="p-4 bg-amber-100 border-b border-amber-200 text-center">
                <h3 className="text-amber-800 font-black uppercase text-xs tracking-widest">
                  Pendiente (16-30 Días)
                </h3>
                <p className="text-amber-600 text-[10px] font-bold mt-1">Atención Requerida</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingReport
                  .filter((i) => i.category === 'yellow')
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-xl shadow-sm border border-amber-100"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className="font-bold text-slate-700 text-xs truncate max-w-[120px]"
                          title={item.customer}
                        >
                          {item.customer}
                        </span>
                        <span className="font-mono font-black text-amber-600 text-xs">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>{item.date}</span>
                        <span>{item.age} días</span>
                      </div>
                    </div>
                  ))}
                {agingReport.filter((i) => i.category === 'yellow').length === 0 && (
                  <div className="text-center text-amber-300 font-black uppercase text-xs mt-10">
                    Limpio
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col bg-rose-50/50 rounded-2xl border border-rose-100 overflow-hidden">
              <div className="p-4 bg-rose-100 border-b border-rose-200 text-center">
                <h3 className="text-rose-800 font-black uppercase text-xs tracking-widest">
                  Vencido (+30 Días)
                </h3>
                <p className="text-rose-600 text-[10px] font-bold mt-1">Riesgo Alto / Cobranza</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
                {agingReport
                  .filter((i) => i.category === 'red')
                  .map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-xl shadow-sm border border-rose-100"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className="font-bold text-slate-700 text-xs truncate max-w-[120px]"
                          title={item.customer}
                        >
                          {item.customer}
                        </span>
                        <span className="font-mono font-black text-rose-600 text-xs">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>{item.date}</span>
                        <span>{item.age} días</span>
                      </div>
                    </div>
                  ))}
                {agingReport.filter((i) => i.category === 'red').length === 0 && (
                  <div className="text-center text-rose-300 font-black uppercase text-xs mt-10">
                    Sin morosidad crítica
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'DETAIL' && selectedCustomer && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 h-auto xl:h-[220px]">
            <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                title="BCV"
                accountType={AccountType.BCV}
                rate={rates.bcv}
                headerColor="bg-blue-800"
                btnColor="bg-blue-800"
                icon="fa-building-columns"
                customerName={selectedCustomer.id}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                title="Grupo"
                accountType={AccountType.GRUPO}
                rate={rates.grupo}
                headerColor="bg-orange-600"
                btnColor="bg-orange-600"
                icon="fa-users"
                customerName={selectedCustomer.id}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
              <ActionCard
                title="Divisa"
                accountType={AccountType.DIVISA}
                rate={1}
                headerColor="bg-emerald-700"
                btnColor="bg-emerald-700"
                icon="fa-money-bill"
                customerName={selectedCustomer.id}
                onAction={onAddMovement}
                onCreateCustomer={onRegisterCustomer}
              />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl mb-2">
                👤
              </div>
              <h2 className="font-black text-slate-800 dark:text-white leading-none mb-1">
                {selectedCustomer.id}
              </h2>
              <p className="text-xs text-slate-500 mb-4">{selectedCustomer.cedula}</p>

              <div className="w-full flex flex-col gap-2 mt-2 px-1 overflow-y-auto max-h-[100px] custom-scroll">
                {(() => {
                  const d = directoryData.find((c) => c.id === selectedCustomer.id);
                  const bcv = d?.balances?.bcv || 0;
                  const grupo = d?.balances?.grupo || 0;
                  const div = d?.balances?.div || 0;
                  return (
                    <>
                      <div className="flex justify-between items-center p-2 rounded bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800">
                        <span className="text-[10px] font-black text-blue-700 uppercase">BCV</span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            bcv > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(bcv), 'Bs')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800">
                        <span className="text-[10px] font-black text-orange-700 uppercase">
                          Grupo
                        </span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            grupo > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(grupo), 'Bs')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800">
                        <span className="text-[10px] font-black text-emerald-700 uppercase">
                          Divisa
                        </span>
                        <span
                          className={`font-mono font-black text-sm truncate ${
                            div > 0 ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(Math.abs(div), '$')}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
            {/* AQUÍ ESTÁ EL CAMBIO IMPORTANTE: pb-20 y un espaciador al final */}
            <div className="overflow-y-auto custom-scroll flex-1 relative p-1 pb-24">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] uppercase font-black sticky top-0">
                  <tr>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Concepto</th>
                    <th className="px-6 py-3 text-center">Tasa</th>
                    <th className="px-6 py-3 text-right">Deuda</th>
                    <th className="px-6 py-3 text-right">Abono</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-3 font-bold text-slate-500 text-xs">{m.date}</td>
                      <td className="px-6 py-3 text-slate-700 dark:text-white font-medium">
                        {m.concept}
                      </td>
                      <td className="px-6 py-3 text-center text-slate-400 text-xs">
                        {m.rateUsed > 1 ? m.rateUsed : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-rose-500">
                        {m.movementType === MovementType.FACTURA
                          ? formatCurrency(m.amountInUSD)
                          : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-emerald-500">
                        {m.movementType === MovementType.ABONO
                          ? formatCurrency(m.amountInUSD)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Espacio de seguridad al final de la tabla (evita que la barra inferior tape filas) */}
              <div className="h-24 w-full"></div>
            </div>
          </div>
        </div>
      )}

      {/* ... (Resto de los modales sin cambios) ... */}
      {(showAddModal || editCustomer) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl animate-in zoom-in"
          >
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 uppercase italic">
              {editCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <div className="space-y-4">
              <input
                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                placeholder="Nombre / Razón Social"
                value={editCustomer ? editCustomer.id : newCustomer.id || ''}
                onChange={(e) =>
                  editCustomer
                    ? setEditCustomer({ ...editCustomer, id: e.target.value })
                    : setNewCustomer({ ...newCustomer, id: e.target.value })
                }
              />
              <input
                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                placeholder="Cédula / RIF"
                value={editCustomer ? editCustomer.cedula : newCustomer.cedula || ''}
                onChange={(e) =>
                  editCustomer
                    ? setEditCustomer({ ...editCustomer, cedula: e.target.value })
                    : setNewCustomer({ ...newCustomer, cedula: e.target.value })
                }
              />
              <input
                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                placeholder="Teléfono"
                value={editCustomer ? editCustomer.telefono : newCustomer.telefono || ''}
                onChange={(e) =>
                  editCustomer
                    ? setEditCustomer({ ...editCustomer, telefono: e.target.value })
                    : setNewCustomer({ ...newCustomer, telefono: e.target.value })
                }
              />
              <input
                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                placeholder="Dirección"
                value={editCustomer ? editCustomer.direccion : newCustomer.direccion || ''}
                onChange={(e) =>
                  editCustomer
                    ? setEditCustomer({ ...editCustomer, direccion: e.target.value })
                    : setNewCustomer({ ...newCustomer, direccion: e.target.value })
                }
              />
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditCustomer(null);
                }}
                className="px-6 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 uppercase text-xs"
              >
                Guardar Datos
              </button>
            </div>
          </form>
        </div>
      )}

      {showQuickOp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleQuickOpSubmit}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in border-t-8 border-amber-400"
          >
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 uppercase italic">
              <i className="fa-solid fa-bolt text-amber-500 mr-2"></i> Operación Rápida
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Cliente
                </label>
                <Autocomplete
                  items={customers}
                  stringify={(i: any) => i.id}
                  secondary={(i: any) => i.cedula || ''}
                  placeholder="Buscar cliente..."
                  value={quickForm.customerName}
                  onChange={(v) => setQuickForm({ ...quickForm, customerName: v })}
                  onSelect={(it: any) => setQuickForm({ ...quickForm, customerName: it.id })}
                  onCreate={(label: string) => {
                    const newC: Customer = {
                      id: label.toUpperCase(),
                      cedula: 'N/A',
                      telefono: 'N/A',
                      direccion: 'Creado Rápido',
                    };
                    onRegisterCustomer(newC);
                    setQuickForm((prev) => ({ ...prev, customerName: newC.id }));
                  }}
                />
              </div>

              <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex">
                <button
                  type="button"
                  onClick={() => setQuickForm({ ...quickForm, type: MovementType.FACTURA })}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                    quickForm.type === MovementType.FACTURA
                      ? 'bg-white shadow text-rose-500'
                      : 'text-slate-400'
                  }`}
                >
                  Generar Deuda
                </button>
                <button
                  type="button"
                  onClick={() => setQuickForm({ ...quickForm, type: MovementType.ABONO })}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                    quickForm.type === MovementType.ABONO
                      ? 'bg-emerald-500 shadow text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Registrar Abono
                </button>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Cuenta Destino
                </label>
                <select
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                  value={quickForm.accountType}
                  onChange={(e) =>
                    setQuickForm({ ...quickForm, accountType: e.target.value as AccountType })
                  }
                >
                  <option value={AccountType.BCV}>BCV (Bolívares)</option>
                  <option value={AccountType.GRUPO}>Grupo (Paralelo)</option>
                  <option value={AccountType.DIVISA}>Divisa (Efectivo)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Monto ({quickForm.accountType === AccountType.DIVISA ? '$' : 'Bs'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-black text-lg text-slate-800 outline-none"
                    placeholder="0.00"
                    value={quickForm.amount}
                    onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Tasa Ref.
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-600 outline-none"
                    value={quickForm.rate}
                    onChange={(e) => setQuickForm({ ...quickForm, rate: e.target.value })}
                    disabled={quickForm.accountType === AccountType.DIVISA}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Concepto..."
                className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300 outline-none focus:bg-white focus:border-indigo-500"
                value={quickForm.concept}
                onChange={(e) => setQuickForm({ ...quickForm, concept: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Referencia / N° Control (opcional)"
                className="w-full mt-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300 outline-none"
                value={quickForm.reference}
                onChange={(e) => setQuickForm({ ...quickForm, reference: e.target.value })}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowQuickOp(false)}
                className="px-4 py-2 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-amber-500 text-white font-black rounded-xl hover:bg-amber-600 uppercase text-xs"
              >
                Procesar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CustomerViewer;
