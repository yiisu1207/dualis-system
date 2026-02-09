import React, { useState, useMemo, useEffect } from 'react';
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
import { formatCurrency } from '../utils/formatters';

interface AccountingSectionProps {
  movements: Movement[];
  customers: Customer[];
  suppliers?: Supplier[];
  employees?: Employee[];
  rates: ExchangeRates;
  config: AppConfig;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
}

type ViewMode = 'DIRECTORY' | 'DETAIL';
type TabFilter = 'ALL' | AccountType;
type EntityTypeFilter = 'ALL' | 'CLIENTE' | 'PROVEEDOR' | 'NÓMINA';

const AccountingSection: React.FC<AccountingSectionProps> = ({
  movements,
  customers,
  suppliers = [],
  employees = [],
  rates,
  config,
  onUpdateMovement,
  onDeleteMovement,
}) => {
  // --- STATE ---
  const [viewMode, setViewMode] = useState<ViewMode>('DIRECTORY');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');
  const [entityFilter, setEntityFilter] = useState<EntityTypeFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

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
  const directoryData = useMemo(() => {
    // 1. Get all unique Entity IDs from movements
    const uniqueIds: string[] = Array.from(new Set(movements.map((m) => m.entityId)));

    // 2. Build summary objects
    const summaries = uniqueIds.map((id) => {
      // Determine Type & Color Logic (Matching Screenshot Description)
      let type: EntityTypeFilter | 'OTRO' = 'OTRO';
      let typeColor = 'bg-slate-100 text-slate-500 border-slate-200'; // Default

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
        .reduce((sum, m) => sum + m.amountInUSD, 0);
      const totalPaid = entityMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((sum, m) => sum + m.amountInUSD, 0);
      const globalBalance = totalDebt - totalPaid;

      return { id, type, typeColor, globalBalance, lastMov: entityMovs[0]?.date };
    });

    // 3. Filter by Type and Search
    return summaries
      .filter((s) => entityFilter === 'ALL' || s.type === entityFilter)
      .filter((s) => s.id.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.globalBalance - a.globalBalance);
  }, [movements, customers, suppliers, employees, searchTerm, entityFilter]);

  // --- LOGIC: DETAIL VIEW (LEVEL 2) ---
  const detailData = useMemo(() => {
    if (!selectedEntityId) return [];

    // 1. Filter by Entity
    let filtered = movements.filter((m) => m.entityId === selectedEntityId);

    // 2. Filter by Tab (Account Type)
    if (activeTab !== 'ALL') {
      filtered = filtered.filter((m) => m.accountType === activeTab);
    }

    // 3. Sort Chronologically
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 4. Calculate Running Balance
    let runningBalance = 0;
    const withBalance = sorted.map((m) => {
      const debe = m.movementType === MovementType.FACTURA ? m.amountInUSD : 0;
      const haber = m.movementType === MovementType.ABONO ? m.amountInUSD : 0;
      runningBalance += debe - haber;
      return { ...m, debe, haber, runningBalance };
    });

    // 5. Reverse to show newest on top
    return withBalance.reverse();
  }, [movements, selectedEntityId, activeTab]);

  // Helper to get entity info
  const currentEntityInfo = directoryData.find((d) => d.id === selectedEntityId);

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
        return { border: 'border-slate-800', bg: 'bg-slate-50', text: 'text-slate-800' };
    }
  };
  const contextColors = getContextColors(activeTab);

  // --- HANDLERS ---
  const handleEditClick = (mov: Movement) => {
    setEditingMovement(mov);
    setEditForm({
      date: mov.date,
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

    onUpdateMovement(editingMovement.id, {
      date: editForm.date,
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

  // --- GENERATE PAYROLL RECEIPT (PDF) ---
  const handleGenerateReceipt = () => {
    if (!currentEntityInfo || !selectedEntityId) return;
    if (!(window as any).jspdf) {
      alert('Librería PDF cargando...');
      return;
    }

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- LOGIC FOR PAYROLL RECEIPT ---
    // Devengado (Facturas = Salarios/Bonos generados)
    const devengados = detailData.filter((m) => m.movementType === MovementType.FACTURA);
    const deducciones = detailData.filter((m) => m.movementType === MovementType.ABONO);

    const totalDevengado = devengados.reduce((s, m) => s + m.amountInUSD, 0);
    const totalDeducciones = deducciones.reduce((s, m) => s + m.amountInUSD, 0);
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
        doc.text(`$${devengados[i].amountInUSD.toFixed(2)}`, col1X + 75, y, { align: 'right' });
      }
      // Deduccion Item
      if (deducciones[i]) {
        doc.text(`${deducciones[i].date} - ${deducciones[i].concept.substring(0, 25)}`, col2X, y);
        doc.text(`$${deducciones[i].amountInUSD.toFixed(2)}`, col2X + 75, y, { align: 'right' });
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
    <div className="space-y-6 animate-in h-full flex flex-col">
      {/* LEVEL 1: DIRECTORY VIEW */}
      {viewMode === 'DIRECTORY' && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                Directorio Contable
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                Saldos por Entidad
              </p>
            </div>

            {/* FILTROS PRINCIPALES */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
              {(
                [
                  { id: 'ALL', label: 'Todo' },
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
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl text-sm font-bold w-64 focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <i className="fa-solid fa-search absolute left-4 top-3.5 text-slate-400"></i>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex-1">
            <div className="overflow-y-auto custom-scroll h-full">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-8 py-4">Tipo</th>
                    <th className="px-8 py-4">Entidad / Nombre</th>
                    <th className="px-8 py-4 text-right">Saldo Global ($)</th>
                    <th className="px-8 py-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {directoryData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-20 text-center text-slate-400 italic">
                        No hay registros para este filtro.
                      </td>
                    </tr>
                  ) : (
                    directoryData.map((entity) => {
                      // LOGICA DE COLOR Y TEXTO PARA NOMINA (INVERSA)
                      // Para Nómina: Balance > 0 significa que la empresa DEBE al empleado (Azul/Verde).
                      // Para Clientes: Balance > 0 significa que el cliente DEBE a la empresa (Rojo/Cobrar).
                      const isPayroll = entity.type === 'NÓMINA';
                      let balanceColor = '';

                      if (isPayroll) {
                        balanceColor =
                          entity.globalBalance >= 0 ? 'text-indigo-600' : 'text-rose-600';
                      } else {
                        balanceColor =
                          entity.globalBalance > 0.01 ? 'text-rose-600' : 'text-emerald-600';
                      }

                      return (
                        <tr
                          key={entity.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer"
                          onClick={() => {
                            setSelectedEntityId(entity.id);
                            setViewMode('DETAIL');
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
                            <p className="font-bold text-slate-700 dark:text-white text-base">
                              {entity.id}
                            </p>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`text-lg font-black font-mono ${balanceColor}`}>
                                {formatCurrency(entity.globalBalance)}
                              </span>
                              {isPayroll && (
                                <span className="text-[8px] font-bold text-slate-400 uppercase">
                                  {entity.globalBalance >= 0 ? 'Por Pagar' : 'Sobregiro'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <button className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                              <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* LEVEL 2: DETAILED VIEW */}
      {viewMode === 'DETAIL' && selectedEntityId && currentEntityInfo && (
        <div className="flex flex-col h-full gap-6 animate-in slide-in-from-right-4">
          {/* HEADER DETAIL */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setViewMode('DIRECTORY')}
                className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center"
              >
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                    {currentEntityInfo.id}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${currentEntityInfo.typeColor}`}
                  >
                    {currentEntityInfo.type}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  {currentEntityInfo.type === 'NÓMINA'
                    ? 'Expediente de Pagos'
                    : 'Hoja de Vida Financiera'}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              {/* GENERAR RECIBO BUTTON (Solo para Nómina) */}
              {currentEntityInfo.type === 'NÓMINA' && (
                <button
                  onClick={handleGenerateReceipt}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-slate-700 shadow-lg flex items-center gap-2"
                >
                  <i className="fa-solid fa-file-invoice-dollar"></i> Generar Recibo
                </button>
              )}

              {/* TABS DE FILTRO DE ALTO CONTRASTE */}
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl gap-1">
                {(['ALL', AccountType.BCV, AccountType.GRUPO, AccountType.DIVISA] as const).map(
                  (tab) => {
                    // Logic for High Contrast Colors based on prompt
                    let activeClasses = '';
                    const inactiveClasses =
                      'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700';

                    if (activeTab === tab) {
                      switch (tab) {
                        case 'ALL':
                          activeClasses = 'bg-slate-800 text-white shadow-lg';
                          break;
                        case AccountType.BCV:
                          activeClasses =
                            'bg-blue-800 text-white shadow-lg shadow-blue-200 dark:shadow-none';
                          break;
                        case AccountType.GRUPO:
                          activeClasses =
                            'bg-orange-600 text-white shadow-lg shadow-orange-200 dark:shadow-none';
                          break;
                        case AccountType.DIVISA:
                          activeClasses =
                            'bg-emerald-700 text-white shadow-lg shadow-emerald-200 dark:shadow-none';
                          break;
                      }
                    }

                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                          activeTab === tab ? activeClasses : inactiveClasses
                        }`}
                      >
                        {tab === 'ALL'
                          ? 'Global'
                          : tab === AccountType.BCV
                          ? 'BCV (Azul)'
                          : tab === AccountType.GRUPO
                          ? 'Grupo (Naranja)'
                          : 'Divisa (Verde)'}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* DETAILED TABLE WITH CONTEXT BORDER */}
          <div
            className={`bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border-x border-b border-slate-200 dark:border-slate-700 overflow-hidden flex-1 flex flex-col border-t-[6px] ${contextColors.border}`}
          >
            {/* Table Header */}
            <div
              className={`px-8 py-4 ${contextColors.bg} border-b border-slate-200 dark:border-slate-700 grid grid-cols-7 text-[10px] font-black uppercase tracking-widest ${contextColors.text}`}
            >
              <div className="col-span-1">Fecha</div>
              <div className="col-span-2">Concepto</div>
              <div className="col-span-1 text-center">Ref. Tasa</div>
              <div className="col-span-1 text-right text-rose-600">
                {currentEntityInfo.type === 'NÓMINA' ? 'Devengado (+)' : 'Cargo ($)'}
              </div>
              <div className="col-span-1 text-right text-emerald-600">
                {currentEntityInfo.type === 'NÓMINA' ? 'Deducción (-)' : 'Abono ($)'}
              </div>
              <div className="col-span-1 text-center">Acción</div>
            </div>

            <div className="overflow-y-auto custom-scroll flex-1">
              {detailData.length === 0 ? (
                <div className="py-20 text-center text-slate-300 font-black italic uppercase">
                  No hay movimientos en esta cuenta ({activeTab})
                </div>
              ) : (
                detailData.map((mov) => (
                  <div
                    key={mov.id}
                    className="px-8 py-4 border-b border-slate-100 dark:border-slate-700/50 grid grid-cols-7 items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-xs group"
                  >
                    <div className="col-span-1 font-bold text-slate-500">{mov.date}</div>
                    <div
                      className="col-span-2 font-medium text-slate-700 dark:text-slate-200 truncate pr-4"
                      title={mov.concept}
                    >
                      {mov.concept}
                      <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-[8px] rounded text-slate-400 font-bold">
                        {mov.accountType}
                      </span>
                    </div>
                    <div className="col-span-1 text-center font-mono text-slate-400 text-[10px]">
                      {mov.rateUsed > 1 ? `Bs ${mov.rateUsed}` : '1:1'}
                    </div>
                    <div className="col-span-1 text-right font-black font-mono text-rose-600">
                      {mov.debe > 0 ? formatCurrency(mov.debe) : '-'}
                    </div>
                    <div className="col-span-1 text-right font-black font-mono text-emerald-600">
                      {mov.haber > 0 ? formatCurrency(mov.haber) : '-'}
                    </div>

                    {/* EDIT BUTTON */}
                    <div className="col-span-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditClick(mov)}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-500 hover:text-white text-slate-500 transition-all flex items-center justify-center"
                      >
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                      </button>
                    </div>

                    {/* Row Footer with Running Balance */}
                    <div className="col-span-7 mt-2 pt-2 border-t border-dashed border-slate-100 flex justify-end items-center gap-2 opacity-60">
                      <span className="text-[9px] uppercase font-bold text-slate-400">
                        {currentEntityInfo.type === 'NÓMINA'
                          ? 'Saldo Acumulado:'
                          : 'Saldo tras operación:'}
                      </span>

                      {/* LOGICA DE COLOR PARA SALDO INDIVIDUAL */}
                      {currentEntityInfo.type === 'NÓMINA' ? (
                        <span
                          className={`font-mono font-black ${
                            mov.runningBalance >= 0 ? 'text-indigo-500' : 'text-rose-500'
                          }`}
                        >
                          {formatCurrency(mov.runningBalance)}
                        </span>
                      ) : (
                        <span
                          className={`font-mono font-black ${
                            mov.runningBalance > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {formatCurrency(mov.runningBalance)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {editingMovement && editForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in duration-300"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-800 dark:text-white uppercase italic tracking-tight text-xl">
                Editar Movimiento
              </h3>
              <button
                type="button"
                onClick={() => setEditingMovement(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Moneda Orig.
                  </label>
                  <select
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editForm.currency}
                    onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  >
                    <option value={PaymentCurrency.USD}>USD ($)</option>
                    <option value={PaymentCurrency.BS}>Bolívares (Bs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Concepto / Glosa
                </label>
                <input
                  type="text"
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editForm.concept}
                  onChange={(e) => setEditForm({ ...editForm, concept: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Monto Original
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-black text-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
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
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editForm.rateUsed}
                    onChange={(e) => setEditForm({ ...editForm, rateUsed: e.target.value })}
                    disabled={editForm.currency === PaymentCurrency.USD}
                  />
                </div>
              </div>

              {/* PREVIEW CALCULATION */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl text-center border border-indigo-100 dark:border-indigo-800">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                  Nuevo Monto Contable (USD)
                </p>
                <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                  {formatCurrency(
                    editForm.currency === PaymentCurrency.BS
                      ? (parseFloat(editForm.amount) || 0) / (parseFloat(editForm.rateUsed) || 1)
                      : parseFloat(editForm.amount) || 0
                  )}
                </p>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={handleDeleteClick}
                className="px-6 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all"
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
              <button
                type="submit"
                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all transform active:scale-95"
              >
                Guardar Corrección
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AccountingSection;
