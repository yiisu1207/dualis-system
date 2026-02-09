import React, { useState, useMemo } from 'react';
import { Movement, AccountType, MovementType, OperationalRecord, User } from '../../types';
import { formatCurrency } from '../utils/formatters';

interface ReconciliationSectionProps {
  movements: Movement[];
  records: OperationalRecord[];
  user: User;
}

const ReconciliationSection: React.FC<ReconciliationSectionProps> = ({
  movements,
  records,
  user,
}) => {
  const [selectedAccount, setSelectedAccount] = useState<AccountType>(AccountType.DIVISA);
  const [physicalAmount, setPhysicalAmount] = useState<string>('');
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('db_reconciliation_history');
    return saved ? JSON.parse(saved) : [];
  });

  const systemBalance = useMemo(() => {
    // Calculamos el saldo teórico: Ingresos - Egresos
    // Ingresos: Abonos de clientes (Dinero que entró a caja)
    const ingresos = movements
      .filter((m) => m.accountType === selectedAccount && m.movementType === MovementType.ABONO)
      .reduce((acc, m) => acc + m.amountInUSD, 0);

    // Egresos 1: Pagos a proveedores desde esta cuenta
    const egresosProveedores = movements
      .filter(
        (m) =>
          m.accountType === selectedAccount &&
          m.movementType === MovementType.ABONO &&
          m.isSupplierMovement
      )
      .reduce((acc, m) => acc + m.amountInUSD, 0);

    // Egresos 2: Gastos operativos registrados
    const egresosGastos = records
      .filter((r) => r.accountSource === selectedAccount)
      .reduce((acc, r) => acc + r.amount, 0);

    return ingresos - egresosProveedores - egresosGastos;
  }, [movements, records, selectedAccount]);

  const handleSave = () => {
    if (!physicalAmount) return;
    const physical = parseFloat(physicalAmount);
    const diff = physical - systemBalance;

    const record = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleString(),
      account: selectedAccount,
      system: systemBalance,
      physical: physical,
      difference: diff,
      user: user.name,
    };

    const newHistory = [record, ...history];
    setHistory(newHistory);
    localStorage.setItem('db_reconciliation_history', JSON.stringify(newHistory));
    setPhysicalAmount('');
    alert(`Auditoría Guardada. Diferencia: ${formatCurrency(diff)}`);
  };

  return (
    <div className="space-y-10 animate-in">
      <div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">
          Conciliación de Cajas
        </h1>
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
          Auditoría de Saldos Físicos vs Teóricos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="glass-panel p-10 rounded-[2.5rem] bg-white border border-slate-100 shadow-2xl">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black italic uppercase tracking-tighter">
              Verificación de Saldo
            </h3>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value as AccountType)}
              className="p-3 bg-slate-50 border-none rounded-xl font-black text-[10px] uppercase tracking-widest outline-none"
            >
              <option value={AccountType.BCV}>BANESCO BCV</option>
              <option value={AccountType.GRUPO}>GRUPO PARALELO</option>
              <option value={AccountType.DIVISA}>CAJA EFECTIVO $</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="p-8 bg-slate-50 rounded-[2rem] border-2 border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Saldo en Sistema
              </p>
              <p className="text-3xl font-black text-slate-900">{formatCurrency(systemBalance)}</p>
            </div>
            <div className="p-8 bg-indigo-50 rounded-[2rem] border-2 border-indigo-100">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                Conteo Físico Real
              </p>
              <div className="relative mt-2">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 font-black text-slate-300 text-lg">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-6 bg-transparent border-none outline-none text-2xl font-black text-indigo-700"
                  placeholder="0.00"
                  value={physicalAmount}
                  onChange={(e) => setPhysicalAmount(e.target.value)}
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
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-[1.02] transition-all active:scale-95"
          >
            REGISTRAR CIERRE DE CAJA
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-8 border-b bg-slate-50">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">
              Historial de Cierres
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] custom-scroll p-6">
            {history.length === 0 ? (
              <div className="py-20 text-center text-slate-300 font-black italic uppercase">
                Sin registros de conciliación
              </div>
            ) : (
              history.map((h) => (
                <div
                  key={h.id}
                  className="p-6 bg-white border-b border-slate-50 flex justify-between items-center group"
                >
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase italic">
                      {h.account}
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold">
                      {h.date} • {h.user}
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
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
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
