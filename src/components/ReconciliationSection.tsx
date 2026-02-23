import React, { useEffect, useState, useMemo } from 'react';
import { NumericFormat } from 'react-number-format';
import {
  Movement,
  AccountType,
  MovementType,
  OperationalRecord,
  ReconciliationRecord,
  User,
} from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { getReconciliationHistory, saveReconciliationRecord } from '../firebase/api';
import { isDemoMode, loadDemoData } from '../utils/demoStore';

interface ReconciliationSectionProps {
  movements: Movement[];
  records: OperationalRecord[];
  user: User;
  businessId: string;
  userId?: string;
  ownerIdFilter?: string;
}

const ReconciliationSection: React.FC<ReconciliationSectionProps> = ({
  movements,
  records,
  user,
  businessId,
  userId,
  ownerIdFilter,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<AccountType>(AccountType.DIVISA);
  const [physicalAmount, setPhysicalAmount] = useState<string>('');
  const [history, setHistory] = useState<ReconciliationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterAccount, setFilterAccount] = useState<'ALL' | AccountType>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!businessId && !isDemoMode()) return;
    const loadHistory = async () => {
      try {
        setLoadingHistory(true);
        if (isDemoMode()) {
          const demo = loadDemoData();
          const items = (demo?.reconciliations || []) as ReconciliationRecord[];
          const filtered = ownerIdFilter
            ? items.filter((i) => i.ownerId === ownerIdFilter)
            : items;
          setHistory(filtered);
          return;
        }
        const data = await getReconciliationHistory(businessId, 100, ownerIdFilter);
        setHistory(data);
      } catch (e) {
        console.error('Error cargando conciliaciones', e);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [businessId, ownerIdFilter]);

  const systemBalance = useMemo(() => {
    // Calculamos el saldo teórico: Ingresos - Egresos
    // Ingresos: Abonos de clientes (Dinero que entró a caja)
    const ingresos = movements
      .filter((m) => m.accountType === selectedAccount && m.movementType === MovementType.ABONO)
      .reduce((acc, m) => acc + getMovementUsdAmount(m), 0);

    // Egresos 1: Pagos a proveedores desde esta cuenta
    const egresosProveedores = movements
      .filter(
        (m) =>
          m.accountType === selectedAccount &&
          m.movementType === MovementType.ABONO &&
          m.isSupplierMovement
      )
      .reduce((acc, m) => acc + getMovementUsdAmount(m), 0);

    // Egresos 2: Gastos operativos registrados
    const egresosGastos = records
      .filter((r) => r.accountSource === selectedAccount)
      .reduce((acc, r) => acc + r.amount, 0);

    return ingresos - egresosProveedores - egresosGastos;
  }, [movements, records, selectedAccount]);

  const filteredHistory = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return history.filter((item) => {
      if (filterAccount !== 'ALL' && item.account !== filterAccount) return false;
      const itemDate = new Date(item.createdAt);
      if (from && itemDate < from) return false;
      if (to && itemDate > to) return false;
      return true;
    });
  }, [history, filterAccount, dateFrom, dateTo]);

  const handleSave = async () => {
    if (!physicalAmount) return;
    const physical = parseFloat(physicalAmount);
    const diff = physical - systemBalance;

    const record: Omit<ReconciliationRecord, 'id'> = {
      businessId,
      ownerId: userId,
      account: selectedAccount,
      system: systemBalance,
      physical: physical,
      difference: diff,
      userName: user.name,
      userId,
      createdAt: new Date().toISOString(),
    };

    try {
      const id = await saveReconciliationRecord(record);
      setHistory((prev) => [{ id, ...record }, ...prev]);
      setPhysicalAmount('');
      alert(`Auditoría Guardada. Diferencia: ${formatCurrency(diff)}`);
    } catch (e) {
      console.error('Error guardando conciliación', e);
      alert('Error guardando la conciliación. Intenta nuevamente.');
    }
  };

  return (
    <div className="app-section space-y-10 animate-in">
      <div className="app-section-header">
        <p className="app-subtitle">Auditoria de Saldos</p>
        <h1 className="app-title uppercase">Conciliacion de Cajas</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="app-panel p-10">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black italic uppercase tracking-tighter">
              Verificación de Saldo
            </h3>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value as AccountType)}
              className="app-input text-[10px] uppercase tracking-widest"
            >
              <option value={AccountType.BCV}>BANESCO BCV</option>
              <option value={AccountType.GRUPO}>GRUPO PARALELO</option>
              <option value={AccountType.DIVISA}>CAJA EFECTIVO $</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="p-8 app-card">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Saldo en Sistema
              </p>
              <p className="text-3xl font-black text-slate-900 dark:text-slate-100">
                {formatCurrency(systemBalance)}
              </p>
            </div>
            <div className="p-8 app-card">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                Conteo Físico Real
              </p>
              <div className="relative mt-2">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 font-black text-slate-300 text-lg">
                  $
                </span>
                <NumericFormat
                  value={physicalAmount}
                  onValueChange={(values) => setPhysicalAmount(values.value || '')}
                  thousandSeparator="."
                  decimalSeparator="," 
                  decimalScale={2}
                  allowNegative={false}
                  className="w-full pl-6 bg-transparent border-none outline-none text-2xl font-black text-indigo-700"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {physicalAmount && (
            <div
              className={`p-8 rounded-[2rem] mb-10 text-center animate-in zoom-in ${
                parseFloat(physicalAmount) - systemBalance === 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">
                Discrepancia Auditada
              </p>
              <p className="text-4xl font-black">
                {formatCurrency(parseFloat(physicalAmount) - systemBalance)}
              </p>
              <p className="text-[10px] font-bold mt-2 uppercase tracking-tighter">
                {parseFloat(physicalAmount) - systemBalance === 0
                  ? 'Saldos perfectamente cuadrados'
                  : 'Se requiere ajuste de auditoría'}
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full py-5 app-btn app-btn-primary text-xs shadow-2xl hover:scale-[1.02] transition-all active:scale-95"
          >
            REGISTRAR CIERRE DE CAJA
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
            <div className="flex flex-col gap-4">
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm uppercase tracking-widest">
                Historial de Cierres
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value as 'ALL' | AccountType)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-100"
                >
                  <option value="ALL">Todas las cuentas</option>
                  <option value={AccountType.BCV}>BANESCO BCV</option>
                  <option value={AccountType.GRUPO}>GRUPO PARALELO</option>
                  <option value={AccountType.DIVISA}>CAJA EFECTIVO $</option>
                </select>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-100"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] custom-scroll p-6">
            {loadingHistory ? (
              <div className="py-20 text-center text-slate-400 dark:text-slate-500 font-black italic uppercase">
                Cargando historial...
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="py-20 text-center text-slate-300 dark:text-slate-600 font-black italic uppercase">
                Sin registros de conciliación
              </div>
            ) : (
              filteredHistory.map((h) => (
                <div
                  key={h.id}
                  className="p-6 bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center group"
                >
                  <div>
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase italic">
                      {h.account}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">
                      {new Date(h.createdAt).toLocaleString()} • {h.userName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-black ${
                        h.difference === 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {h.difference === 0 ? 'OK' : formatCurrency(h.difference)}
                    </p>
                    <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                      Dif. Real
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationSection;
