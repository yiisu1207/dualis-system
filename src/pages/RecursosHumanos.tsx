import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase/config';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Circle,
  Ticket,
  AlertCircle,
  Scissors,
  Plus,
  AlertTriangle,
} from 'lucide-react';

// ── TYPES ──────────────────────────────────────────────────────────────────────
interface Employee {
  id: string;
  fullName: string;
  email: string;
  role: 'Administrador' | 'Cajero' | 'Gerente' | 'Vendedor';
  status: 'Activo' | 'Inactivo';
  salary: number;
}

interface Voucher {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  status: 'PENDIENTE' | 'DESCONTADO';
  createdAt: any;
}

type SubTab = 'directory' | 'vouchers' | 'nomina';

interface PayrollRun {
  id: string;
  period: string;
  processedAt: any;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  details: { employeeId: string; name: string; gross: number; deductions: number; net: number }[];
}

// ── KPI CARD ───────────────────────────────────────────────────────────────────
const KPICard = ({ title, value, subtext, icon: Icon, colorClass, onClick, actionLabel }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between group hover:shadow-2xl transition-all duration-500 flex-1 min-w-[280px] relative overflow-hidden">
    <div className="flex justify-between items-start mb-6 relative z-10">
      <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 ${colorClass}`}>
        <Icon size={28} />
      </div>
      {onClick && (
        <button onClick={onClick} className="px-4 py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg">
          {actionLabel}
        </button>
      )}
    </div>
    <div className="relative z-10">
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{title}</p>
      <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">{subtext}</p>
    </div>
  </div>
);

// ── CONFIRM DIALOG ─────────────────────────────────────────────────────────────
interface ConfirmState {
  message: string;
  detail?: string;
  onConfirm: () => void;
}

const ConfirmDialog = ({ state, onCancel }: { state: ConfirmState; onCancel: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 max-w-sm w-full p-8 animate-in zoom-in-95">
      <div className="flex items-center gap-4 mb-4">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertTriangle size={22} />
        </div>
        <h3 className="text-lg font-black text-slate-900">{state.message}</h3>
      </div>
      {state.detail && <p className="text-sm text-slate-400 mb-6 ml-16">{state.detail}</p>}
      <div className="flex gap-3 mt-6">
        <button onClick={onCancel} className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
          Cancelar
        </button>
        <button
          onClick={() => { state.onConfirm(); onCancel(); }}
          className="flex-1 py-3.5 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all"
        >
          Confirmar
        </button>
      </div>
    </div>
  </div>
);

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function RecursosHumanos() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const businessId = userProfile?.businessId;

  const [activeTab, setActiveTab] = useState<SubTab>('directory');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [empForm, setEmpForm] = useState({
    fullName: '',
    email: '',
    role: 'Vendedor' as Employee['role'],
    salary: 0,
    status: 'Activo' as Employee['status'],
  });
  const [quickVouch, setQuickVouch] = useState({ employeeId: '', amount: '', reason: 'Adelanto' });
  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [processingPayroll, setProcessingPayroll] = useState(false);

  useEffect(() => {
    if (!businessId) {
      const t = setTimeout(() => setLoading(false), 1000);
      return () => clearTimeout(t);
    }
    setLoading(true);
    const qEmp = query(collection(db, `businesses/${businessId}/employees`));
    const unsubEmp = onSnapshot(qEmp, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });

    const qVouch = query(collection(db, `businesses/${businessId}/vouchers`), orderBy('createdAt', 'desc'));
    const unsubVouch = onSnapshot(qVouch, snap => {
      setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher)));
    }, err => { console.warn(err); });

    const qPayroll = query(collection(db, `businesses/${businessId}/payroll_runs`), orderBy('processedAt', 'desc'));
    const unsubPayroll = onSnapshot(qPayroll, snap => {
      setPayrollHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRun)));
    }, err => { console.warn(err); });

    return () => { unsubEmp(); unsubVouch(); unsubPayroll(); };
  }, [businessId]);

  const pendingVoucherTotal = useMemo(
    () => vouchers.filter(v => v.status === 'PENDIENTE').reduce((acc, v) => acc + (Number(v.amount) || 0), 0),
    [vouchers]
  );

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, `businesses/${businessId}/employees`, editingId), { ...empForm, updatedAt: serverTimestamp() });
        toast.success('Empleado actualizado correctamente');
      } else {
        await addDoc(collection(db, `businesses/${businessId}/employees`), { ...empForm, createdAt: serverTimestamp() });
        toast.success('Empleado registrado correctamente');
      }
      setIsEmpModalOpen(false);
    } catch {
      toast.error('Error al guardar el empleado');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAddVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !quickVouch.employeeId || !quickVouch.amount) return;
    setIsSaving(true);
    const emp = employees.find(e => e.id === quickVouch.employeeId);
    try {
      await addDoc(collection(db, `businesses/${businessId}/vouchers`), {
        employeeId: quickVouch.employeeId,
        employeeName: emp?.fullName || 'Desconocido',
        amount: Number(quickVouch.amount),
        reason: quickVouch.reason,
        status: 'PENDIENTE',
        createdAt: serverTimestamp(),
      });
      setQuickVouch(prev => ({ ...prev, employeeId: '', amount: '' }));
      toast.success(`Vale registrado para ${emp?.fullName || 'empleado'}`);
    } catch {
      toast.error('Error al registrar el vale');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteCorte = () => {
    const pending = vouchers.filter(v => v.status === 'PENDIENTE');
    if (pending.length === 0) {
      toast.info('No hay vales pendientes por liquidar');
      return;
    }
    setConfirmState({
      message: '¿Ejecutar Corte Quincenal?',
      detail: `Se liquidarán ${pending.length} vales pendientes por $${pendingVoucherTotal.toFixed(2)}.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          pending.forEach(v => {
            const ref = doc(db, `businesses/${businessId}/vouchers`, v.id);
            batch.update(ref, { status: 'DESCONTADO', settledAt: serverTimestamp() });
          });
          await batch.commit();
          toast.success(`Corte ejecutado. ${pending.length} vales liquidados.`);
        } catch {
          toast.error('Error al ejecutar el corte');
        }
      },
    });
  };

  const handleDeleteEmployee = (emp: Employee) => {
    setConfirmState({
      message: `¿Eliminar a ${emp.fullName}?`,
      detail: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `businesses/${businessId}/employees`, emp.id));
          toast.success('Empleado eliminado');
        } catch {
          toast.error('Error al eliminar el empleado');
        }
      },
    });
  };

  // ── Nómina calculation ───────────────────────────────────────────────────────
  const nominaPreview = useMemo(() => {
    return employees
      .filter(e => e.status === 'Activo')
      .map(emp => {
        const empVouchers = vouchers.filter(v => v.employeeId === emp.id && v.status === 'PENDIENTE');
        const deductions = empVouchers.reduce((acc, v) => acc + (Number(v.amount) || 0), 0);
        const net = Math.max(0, (emp.salary || 0) - deductions);
        return { emp, deductions, net, voucherCount: empVouchers.length };
      });
  }, [employees, vouchers]);

  const nominaTotals = useMemo(() => ({
    gross: nominaPreview.reduce((s, n) => s + (n.emp.salary || 0), 0),
    deductions: nominaPreview.reduce((s, n) => s + n.deductions, 0),
    net: nominaPreview.reduce((s, n) => s + n.net, 0),
  }), [nominaPreview]);

  const handleProcessPayroll = async () => {
    if (!businessId || nominaPreview.length === 0) return;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    setConfirmState({
      message: '¿Procesar Nómina?',
      detail: `Se generará la nómina de ${nominaPreview.length} empleados. Neto total: $${nominaTotals.net.toFixed(2)}`,
      onConfirm: async () => {
        setProcessingPayroll(true);
        try {
          const run: Omit<PayrollRun, 'id'> = {
            period,
            processedAt: serverTimestamp(),
            totalGross: nominaTotals.gross,
            totalDeductions: nominaTotals.deductions,
            totalNet: nominaTotals.net,
            employeeCount: nominaPreview.length,
            details: nominaPreview.map(n => ({
              employeeId: n.emp.id,
              name: n.emp.fullName,
              gross: n.emp.salary || 0,
              deductions: n.deductions,
              net: n.net,
            })),
          };
          await addDoc(collection(db, `businesses/${businessId}/payroll_runs`), run);
          // Mark pending vouchers as DESCONTADO
          const pending = vouchers.filter(v => v.status === 'PENDIENTE');
          if (pending.length > 0) {
            const batch = writeBatch(db);
            pending.forEach(v => {
              batch.update(doc(db, `businesses/${businessId}/vouchers`, v.id), { status: 'DESCONTADO', settledAt: serverTimestamp() });
            });
            await batch.commit();
          }
          toast.success(`Nómina de ${period} procesada correctamente`);
        } catch {
          toast.error('Error al procesar la nómina');
        } finally {
          setProcessingPayroll(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-400" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 pt-8 font-inter">
      <div className="max-w-7xl mx-auto space-y-10">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">Capital Humano</h1>
            <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest">Gestión de Personal y Control de Adelantos</p>
          </div>
          <div className="flex gap-3 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <button onClick={() => setActiveTab('directory')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'directory' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>Directorio</button>
            <button onClick={() => setActiveTab('vouchers')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'vouchers' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>Control de Vales</button>
            <button onClick={() => setActiveTab('nomina')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'nomina' ? 'bg-[#4f6ef7] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>Nómina</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-8">
          <KPICard title="Total Plantilla" value={employees.length} subtext="Colaboradores registrados" icon={Users} colorClass="bg-indigo-50 text-indigo-600" />
          <KPICard title="Vales Pendientes" value={`$${pendingVoucherTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtext="Por descontar en quincena" icon={AlertCircle} colorClass="bg-rose-50 text-rose-600" />
          <KPICard title="Cierre Quincenal" value="CORTE" subtext="Liquidar adelantos pendientes" icon={Scissors} colorClass="bg-slate-900 text-white" onClick={handleExecuteCorte} actionLabel="Ejecutar Corte" />
        </div>

        {/* CONTENT */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-bottom-4">

          {activeTab === 'nomina' ? (
            <>
              <div className="p-10 bg-slate-50/30 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Cálculo de Nómina</h3>
                  <p className="text-[10px] font-black uppercase text-slate-400 mt-1 tracking-widest">
                    Período: {new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={handleProcessPayroll}
                  disabled={processingPayroll || nominaPreview.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-[#4f6ef7] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {processingPayroll ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Procesar Nómina
                </button>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto">
                {nominaPreview.length === 0 ? (
                  <div className="py-20 text-center text-slate-300">
                    <Users size={60} className="mx-auto mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">Sin empleados activos</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-300 border-b border-slate-50">
                        <th className="px-12 py-6">Empleado</th>
                        <th className="px-12 py-6 text-center">Salario Base</th>
                        <th className="px-12 py-6 text-center">Deducciones</th>
                        <th className="px-12 py-6 text-center">Vales Pend.</th>
                        <th className="px-12 py-6 text-right">Neto a Pagar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {nominaPreview.map(({ emp, deductions, net, voucherCount }) => (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-all">
                          <td className="px-12 py-6">
                            <p className="text-sm font-black text-slate-900">{emp.fullName}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{emp.role}</p>
                          </td>
                          <td className="px-12 py-6 text-center font-black text-slate-700">${(emp.salary || 0).toFixed(2)}</td>
                          <td className="px-12 py-6 text-center">
                            {deductions > 0
                              ? <span className="font-black text-rose-600">-${deductions.toFixed(2)}</span>
                              : <span className="text-slate-300 font-black">—</span>
                            }
                          </td>
                          <td className="px-12 py-6 text-center">
                            {voucherCount > 0
                              ? <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black">{voucherCount}</span>
                              : <span className="text-slate-300">0</span>
                            }
                          </td>
                          <td className="px-12 py-6 text-right">
                            <span className="text-lg font-black text-emerald-700">${net.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-slate-50 border-t-2 border-slate-100">
                        <td className="px-12 py-6 font-black text-slate-500 text-[11px] uppercase tracking-widest">TOTALES ({nominaPreview.length} empleados)</td>
                        <td className="px-12 py-6 text-center font-black text-slate-800">${nominaTotals.gross.toFixed(2)}</td>
                        <td className="px-12 py-6 text-center font-black text-rose-600">{nominaTotals.deductions > 0 ? `-$${nominaTotals.deductions.toFixed(2)}` : '—'}</td>
                        <td className="px-12 py-6"></td>
                        <td className="px-12 py-6 text-right font-black text-emerald-700 text-xl">${nominaTotals.net.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Payroll history */}
              {payrollHistory.length > 0 && (
                <div className="border-t border-slate-100">
                  <div className="p-10 pb-4">
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-slate-400">Historial de Nóminas</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-300 border-b border-slate-50">
                          <th className="px-12 py-4">Período</th>
                          <th className="px-12 py-4 text-center">Empleados</th>
                          <th className="px-12 py-4 text-center">Bruto</th>
                          <th className="px-12 py-4 text-center">Deducciones</th>
                          <th className="px-12 py-4 text-right">Neto Pagado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {payrollHistory.slice(0, 12).map(run => (
                          <tr key={run.id} className="hover:bg-slate-50/40 transition-all">
                            <td className="px-12 py-4">
                              <p className="font-black text-slate-800 text-sm">{run.period}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {run.processedAt?.toDate ? run.processedAt.toDate().toLocaleString('es-VE') : 'Reciente'}
                              </p>
                            </td>
                            <td className="px-12 py-4 text-center font-bold text-slate-600">{run.employeeCount}</td>
                            <td className="px-12 py-4 text-center font-black text-slate-700">${run.totalGross.toFixed(2)}</td>
                            <td className="px-12 py-4 text-center font-black text-rose-500">{run.totalDeductions > 0 ? `-$${run.totalDeductions.toFixed(2)}` : '—'}</td>
                            <td className="px-12 py-4 text-right font-black text-emerald-700 text-base">${run.totalNet.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'directory' ? (
            <>
              <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Directorio de Personal</h3>
                <button
                  onClick={() => { setEditingId(null); setEmpForm({ fullName: '', email: '', role: 'Vendedor', salary: 0, status: 'Activo' }); setIsEmpModalOpen(true); }}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all"
                >
                  <UserPlus size={16} /> Nuevo Empleado
                </button>
              </div>
              <div className="overflow-x-auto">
                {employees.length === 0 ? (
                  <div className="py-20 text-center text-slate-300">
                    <Users size={60} className="mx-auto mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">Sin empleados registrados</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-300 border-b border-slate-50">
                        <th className="px-12 py-8">Identidad</th>
                        <th className="px-12 py-8 text-center">Rol</th>
                        <th className="px-12 py-8 text-center">Estado</th>
                        <th className="px-12 py-8 text-center">Salario</th>
                        <th className="px-12 py-8 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {employees.map(e => (
                        <tr key={e.id} className="group hover:bg-slate-50/50 transition-all">
                          <td className="px-12 py-8">
                            <p className="text-sm font-black text-slate-900">{e.fullName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{e.email}</p>
                          </td>
                          <td className="px-12 py-8 text-center">
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase border border-indigo-100">{e.role}</span>
                          </td>
                          <td className="px-12 py-8 text-center">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border ${e.status === 'Activo' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                              <Circle size={8} fill="currentColor" /> {e.status}
                            </div>
                          </td>
                          <td className="px-12 py-8 text-center">
                            <span className="font-mono font-bold text-slate-700 text-sm">${e.salary?.toLocaleString() || '—'}</span>
                          </td>
                          <td className="px-12 py-8 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => { setEditingId(e.id); setEmpForm(e as any); setIsEmpModalOpen(true); }} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDeleteEmployee(e)} className="p-2.5 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-10 bg-slate-50/30 border-b border-slate-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                      <Ticket size={24} className="text-indigo-500" /> Auditoría de Vales
                    </h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 mt-1 tracking-widest">Ingreso masivo de adelantos</p>
                  </div>
                </div>
                <form onSubmit={handleQuickAddVoucher} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/20 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Empleado</label>
                    <select required value={quickVouch.employeeId} onChange={e => setQuickVouch({ ...quickVouch, employeeId: e.target.value })} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none">
                      <option value="">Seleccionar...</option>
                      {employees.filter(e => e.status === 'Activo').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Monto ($)</label>
                    <input required type="number" step="0.01" value={quickVouch.amount} onChange={e => setQuickVouch({ ...quickVouch, amount: e.target.value })} placeholder="0.00" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black focus:ring-2 focus:ring-slate-900 outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Concepto</label>
                    <input required value={quickVouch.reason} onChange={e => setQuickVouch({ ...quickVouch, reason: e.target.value })} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none" />
                  </div>
                  <button disabled={isSaving} className="h-[52px] bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                    {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <><Plus size={16} /> Registrar Vale</>}
                  </button>
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-300 border-b border-slate-50">
                      <th className="px-12 py-8">Fecha</th>
                      <th className="px-12 py-8">Beneficiario</th>
                      <th className="px-12 py-8 text-center">Monto</th>
                      <th className="px-12 py-8">Concepto</th>
                      <th className="px-12 py-8 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {vouchers.map(v => (
                      <tr key={v.id} className="text-xs font-bold text-slate-600 hover:bg-slate-50/50 transition-colors">
                        <td className="px-12 py-8 text-slate-400 font-mono">{v.createdAt?.toDate ? v.createdAt.toDate().toLocaleString('es-VE') : 'Reciente'}</td>
                        <td className="px-12 py-8 text-slate-900 font-black">{v.employeeName}</td>
                        <td className="px-12 py-8 text-center font-black text-slate-900 text-base">${Number(v.amount).toFixed(2)}</td>
                        <td className="px-12 py-8 text-slate-400 italic font-medium">{v.reason}</td>
                        <td className="px-12 py-8 text-right">
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.status === 'PENDIENTE' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {vouchers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-12 py-20 text-center opacity-30">
                          <Ticket size={60} className="mx-auto text-slate-300 mb-4" />
                          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Sin movimientos de vales</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: EMPLEADO */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingId ? 'Editar Ficha' : 'Nuevo Registro'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 mt-1 tracking-widest">Módulo de Personal</p>
              </div>
              <button onClick={() => setIsEmpModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all"><X size={24} /></button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Nombre Completo</label>
                  <input required value={empForm.fullName} onChange={e => setEmpForm({ ...empForm, fullName: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Correo Corporativo</label>
                  <input required type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Rol</label>
                  <select value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value as any })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none">
                    <option value="Administrador">Administrador</option>
                    <option value="Cajero">Cajero</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Salario Mensual ($)</label>
                  <input type="number" value={empForm.salary} onChange={e => setEmpForm({ ...empForm, salary: Number(e.target.value) })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none" />
                </div>
              </div>
              <button disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="animate-spin" /> : <><Save size={18} /> Guardar</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmState && (
        <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
      )}
    </div>
  );
}
