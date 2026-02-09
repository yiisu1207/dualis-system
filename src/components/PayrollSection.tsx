import React, { useState, useMemo } from 'react';
import {
  Employee,
  Sanction,
  CashAdvance,
  PayFrequency,
  SanctionLevel,
  PaymentCurrency,
  PayrollReceipt,
} from '../../types';
import { formatCurrency } from '../utils/formatters';

interface PayrollSectionProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  sanctions: Sanction[];
  setSanctions: React.Dispatch<React.SetStateAction<Sanction[]>>;
  advances: CashAdvance[];
  setAdvances: React.Dispatch<React.SetStateAction<CashAdvance[]>>;
  payrollRate: number;
  setPayrollRate: React.Dispatch<React.SetStateAction<number>>;
  history: PayrollReceipt[];
  setHistory: React.Dispatch<React.SetStateAction<PayrollReceipt[]>>;
  onUpdateEmployee: (id: string, e: Employee) => void;
  onDeleteEmployee: (id: string) => void;
}

const PayrollSection: React.FC<PayrollSectionProps> = ({
  employees,
  setEmployees,
  sanctions,
  setSanctions,
  advances,
  setAdvances,
  payrollRate,
  setPayrollRate,
  history,
  setHistory,
  onUpdateEmployee,
  onDeleteEmployee,
}) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'empleados' | 'vales' | 'procesar' | 'historico'>(
    'empleados'
  );

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);

  // Forms State
  const [newEmp, setNewEmp] = useState<Partial<Employee>>({
    frequency: 'QUINCENAL',
    status: 'ACTIVO',
  });
  const [newAdvance, setNewAdvance] = useState({
    amount: '',
    reason: '',
    currency: PaymentCurrency.BS as PaymentCurrency,
    rateOverride: '',
  });
  const [missedDaysInput, setMissedDaysInput] = useState<Record<string, number>>({});

  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  // --- LOGIC: EMPLOYEE MANAGEMENT ---
  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (editEmployee) {
      onUpdateEmployee(editEmployee.id, editEmployee);
      setEditEmployee(null);
    } else {
      const employee: Employee = {
        id: crypto.randomUUID(),
        name: newEmp.name || '',
        lastName: newEmp.lastName || '',
        idNumber: newEmp.idNumber || '',
        address: newEmp.address || '',
        phone: newEmp.phone || '',
        position: newEmp.position || 'Ventas',
        salary: Number(newEmp.salary) || 0,
        frequency: newEmp.frequency as PayFrequency,
        hiredDate: new Date().toISOString().split('T')[0],
        status: 'ACTIVO',
      };
      setEmployees((prev) => [...prev, employee]);
      setShowAddModal(false);
      setNewEmp({ frequency: 'QUINCENAL', status: 'ACTIVO' });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Seguro que deseas eliminar este empleado? Se perderá su historial.'))
      onDeleteEmployee(id);
  };

  // --- LOGIC: ADVANCES ---
  const handleAddAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !newAdvance.amount) return;
    const originalAmount = parseFloat(newAdvance.amount);
    const rate =
      newAdvance.currency === PaymentCurrency.BS
        ? parseFloat(newAdvance.rateOverride) || payrollRate
        : 1;
    const amountInUSD =
      newAdvance.currency === PaymentCurrency.BS ? originalAmount / rate : originalAmount;

    const advance: CashAdvance = {
      id: crypto.randomUUID(),
      employeeId: selectedEmpId,
      date: new Date().toISOString().split('T')[0],
      amount: amountInUSD,
      originalAmount: originalAmount,
      currency: newAdvance.currency,
      exchangeRate: rate,
      reason: newAdvance.reason,
      status: 'PENDIENTE',
    };
    setAdvances((prev) => [advance, ...prev]);
    setShowAdvanceModal(false);
    setNewAdvance({ amount: '', reason: '', currency: PaymentCurrency.BS, rateOverride: '' });
  };

  // --- LOGIC: PAYROLL PROCESSING ---
  const payrollData = useMemo(() => {
    return employees
      .filter((e) => e.status === 'ACTIVO')
      .map((emp) => {
        const pendingAdvances = advances
          .filter((a) => a.employeeId === emp.id && a.status === 'PENDIENTE')
          .reduce((sum, a) => sum + a.amount, 0);
        const missedDays = missedDaysInput[emp.id] || 0;
        const daysInPeriod =
          emp.frequency === 'MENSUAL' ? 30 : emp.frequency === 'QUINCENAL' ? 15 : 7;
        const dailyRate = emp.salary / daysInPeriod;
        const deductionAmount = dailyRate * missedDays;
        return {
          ...emp,
          periodBase: emp.salary,
          pendingAdvances,
          missedDays,
          deductionAmount,
          netPay: emp.salary - pendingAdvances - deductionAmount,
        };
      });
  }, [employees, advances, missedDaysInput]);

  const handleCloseCycle = () => {
    if (
      !confirm(
        '¿CONFIRMAR CIERRE DE NÓMINA?\n\nEsta acción generará los recibos y descontará los vales.'
      )
    )
      return;
    const newReceipt: PayrollReceipt = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      period: `${new Date().toLocaleString('es-VE', {
        month: 'long',
      })} ${new Date().getFullYear()}`,
      totalPaid: payrollData.reduce((sum, item) => sum + item.netPay, 0),
      details: payrollData.map((d) => ({
        employeeId: d.id,
        employeeName: `${d.name} ${d.lastName}`,
        baseSalary: d.periodBase,
        totalAdvances: d.pendingAdvances,
        missedDays: d.missedDays,
        deductionAmount: d.deductionAmount,
        netPay: d.netPay,
      })),
    };
    setHistory((prev) => [newReceipt, ...prev]);
    setAdvances((prev) =>
      prev.map((a) =>
        a.status === 'PENDIENTE' &&
        employees.find((e) => e.id === a.employeeId)?.status === 'ACTIVO'
          ? { ...a, status: 'DESCONTADO' }
          : a
      )
    );
    setMissedDaysInput({});
    alert('✅ Ciclo de Nómina Cerrado Exitosamente.');
    setActiveTab('historico');
  };

  return (
    <div className="space-y-6 animate-in h-full flex flex-col">
      {/* HEADER RRHH */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight">
            Directorio de Capital Humano
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
            Gestión de Talento & Nómina
          </p>
        </div>
        <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-right">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Tasa Nómina (Bs/$)
            </span>
            <input
              type="number"
              value={payrollRate}
              onChange={(e) => setPayrollRate(parseFloat(e.target.value))}
              className="w-20 bg-transparent text-right font-black text-lg text-slate-800 dark:text-white outline-none"
            />
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-lg shadow-lg">
            <i className="fa-solid fa-money-bill-transfer"></i>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-fit">
        {[
          { id: 'empleados', icon: 'fa-users', label: 'Personal' },
          { id: 'vales', icon: 'fa-hand-holding-dollar', label: 'Vales' },
          { id: 'procesar', icon: 'fa-calculator', label: 'Corte de Nómina' },
          { id: 'historico', icon: 'fa-clock-rotate-left', label: 'Historial' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2 transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <i className={`fa-solid ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* --- TAB: EMPLEADOS (CRUD) --- */}
      {activeTab === 'empleados' && (
        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditEmployee(null);
                setShowAddModal(true);
              }}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all"
            >
              + Nuevo Empleado
            </button>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex-1">
            <div className="overflow-y-auto custom-scroll h-full">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Nombre Completo</th>
                    <th className="px-6 py-4">Cargo</th>
                    <th className="px-6 py-4">Frecuencia</th>
                    <th className="px-6 py-4 text-right">Sueldo Base ($)</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {employees.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-white">
                        {e.name} {e.lastName}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{e.position}</td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 dark:bg-slate-900 text-slate-500 px-2 py-1 rounded text-[10px] font-black uppercase">
                          {e.frequency}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-black text-emerald-600">
                        {formatCurrency(e.salary)}
                      </td>
                      <td className="px-6 py-4 flex justify-center gap-2">
                        <button
                          onClick={() => setEditEmployee(e)}
                          className="text-indigo-500 hover:text-indigo-700 w-8 h-8 flex items-center justify-center bg-indigo-50 rounded-lg"
                        >
                          <i className="fa-solid fa-pencil"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-rose-500 hover:text-rose-700 w-8 h-8 flex items-center justify-center bg-rose-50 rounded-lg"
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
        </div>
      )}

      {/* --- TAB: VALES (ADELANTOS) --- */}
      {activeTab === 'vales' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-bold text-xs uppercase text-slate-500">
              Seleccionar Empleado
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {employees
                .filter((e) => e.status === 'ACTIVO')
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmpId(e.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all border ${
                      selectedEmpId === e.id
                        ? 'bg-indigo-50 border-indigo-200 shadow-sm dark:bg-indigo-900/20 dark:border-indigo-800'
                        : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <p className="font-bold text-slate-800 dark:text-white text-sm">
                      {e.name} {e.lastName}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {e.position}
                    </p>
                  </button>
                ))}
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-6">
            {selectedEmp ? (
              <>
                <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div>
                    <h3 className="font-black text-lg text-slate-800 dark:text-white">
                      {selectedEmp.name} {selectedEmp.lastName}
                    </h3>
                    <p className="text-xs text-slate-500">Adelantos pendientes</p>
                  </div>
                  <button
                    onClick={() => setShowAdvanceModal(true)}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 shadow-lg"
                  >
                    💸 Registrar Vale
                  </button>
                </div>
                <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                  <div className="overflow-y-auto flex-1 p-4 space-y-3">
                    {advances.filter(
                      (a) => a.employeeId === selectedEmp.id && a.status === 'PENDIENTE'
                    ).length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300">
                        <i className="fa-solid fa-piggy-bank text-4xl mb-4"></i>
                        <p className="font-bold uppercase text-xs">Sin vales pendientes</p>
                      </div>
                    ) : (
                      advances
                        .filter((a) => a.employeeId === selectedEmp.id && a.status === 'PENDIENTE')
                        .map((a) => (
                          <div
                            key={a.id}
                            className="flex justify-between items-center p-4 border border-slate-100 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50"
                          >
                            <div>
                              <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                                {a.reason}
                              </p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[9px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-500">
                                  {a.date}
                                </span>
                                {a.currency === PaymentCurrency.BS && (
                                  <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                                    Orig: Bs. {a.originalAmount}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-mono font-black text-rose-500 text-lg">
                                -{formatCurrency(a.amount)}
                              </p>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                A Descontar
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-300 font-black uppercase text-sm border-2 border-dashed border-slate-200 rounded-2xl">
                Selecciona un empleado
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL ADD/EDIT EMPLOYEE --- */}
      {(showAddModal || editEmployee) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveEmployee}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-2xl shadow-2xl animate-in zoom-in"
          >
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-8 uppercase italic tracking-tight">
              {editEmployee ? 'Editar Ficha' : 'Nuevo Ingreso'}
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <input
                placeholder="Nombre"
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                required
                value={editEmployee ? editEmployee.name : newEmp.name || ''}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({ ...editEmployee, name: e.target.value })
                    : setNewEmp({ ...newEmp, name: e.target.value })
                }
              />
              <input
                placeholder="Apellido"
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                required
                value={editEmployee ? editEmployee.lastName : newEmp.lastName || ''}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({ ...editEmployee, lastName: e.target.value })
                    : setNewEmp({ ...newEmp, lastName: e.target.value })
                }
              />
              <input
                placeholder="Cédula"
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                required
                value={editEmployee ? editEmployee.idNumber : newEmp.idNumber || ''}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({ ...editEmployee, idNumber: e.target.value })
                    : setNewEmp({ ...newEmp, idNumber: e.target.value })
                }
              />
              <input
                placeholder="Cargo"
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                required
                value={editEmployee ? editEmployee.position : newEmp.position || ''}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({ ...editEmployee, position: e.target.value })
                    : setNewEmp({ ...newEmp, position: e.target.value })
                }
              />
              <input
                type="number"
                placeholder="Sueldo Base ($)"
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                required
                value={editEmployee ? editEmployee.salary : newEmp.salary || ''}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({ ...editEmployee, salary: Number(e.target.value) })
                    : setNewEmp({ ...newEmp, salary: Number(e.target.value) })
                }
              />
              <select
                className="p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                value={editEmployee ? editEmployee.frequency : newEmp.frequency}
                onChange={(e) =>
                  editEmployee
                    ? setEditEmployee({
                        ...editEmployee,
                        frequency: e.target.value as PayFrequency,
                      })
                    : setNewEmp({ ...newEmp, frequency: e.target.value as PayFrequency })
                }
              >
                <option value="SEMANAL">Semanal</option>
                <option value="QUINCENAL">Quincenal</option>
                <option value="MENSUAL">Mensual</option>
              </select>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditEmployee(null);
                }}
                className="px-6 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-8 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 uppercase text-xs"
              >
                Guardar Ficha
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL ADD ADVANCE --- */}
      {showAdvanceModal && selectedEmp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleAddAdvance}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in border-t-4 border-emerald-500"
          >
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">
                Registrar Vale
              </h3>
              <p className="text-xs text-slate-500 font-bold mt-1">
                {selectedEmp.name} {selectedEmp.lastName}
              </p>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 p-1 rounded-xl flex">
                <button
                  type="button"
                  onClick={() => setNewAdvance({ ...newAdvance, currency: PaymentCurrency.BS })}
                  className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${
                    newAdvance.currency === PaymentCurrency.BS
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400'
                  }`}
                >
                  En Bolívares (Bs)
                </button>
                <button
                  type="button"
                  onClick={() => setNewAdvance({ ...newAdvance, currency: PaymentCurrency.USD })}
                  className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${
                    newAdvance.currency === PaymentCurrency.USD
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400'
                  }`}
                >
                  En Dólares ($)
                </button>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Monto ({newAdvance.currency === PaymentCurrency.USD ? '$' : 'Bs'})
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-black text-xl text-slate-800 outline-none"
                  required
                  value={newAdvance.amount}
                  onChange={(e) => setNewAdvance({ ...newAdvance, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              {newAdvance.currency === PaymentCurrency.BS && (
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Tasa de Cambio (Default: {payrollRate})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-600 outline-none"
                    value={newAdvance.rateOverride}
                    onChange={(e) => setNewAdvance({ ...newAdvance, rateOverride: e.target.value })}
                    placeholder={`Usar tasa del sistema: ${payrollRate}`}
                  />
                </div>
              )}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Motivo / Descripción
                </label>
                <input
                  type="text"
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-slate-700 outline-none"
                  required
                  value={newAdvance.reason}
                  onChange={(e) => setNewAdvance({ ...newAdvance, reason: e.target.value })}
                  placeholder="Ej: Adelanto semanal, Medicina..."
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdvanceModal(false)}
                className="px-6 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-8 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 uppercase text-xs"
              >
                Procesar Vale
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default PayrollSection;
