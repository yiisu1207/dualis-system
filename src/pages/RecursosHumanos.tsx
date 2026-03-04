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
const KPICard = ({ title, value, subtext, icon: Icon, colorClass, darkBg, onClick, actionLabel }: any) => (
  <div className={`p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20 transition-all duration-300 flex-1 min-w-[200px] relative overflow-hidden group bg-white ${darkBg || 'dark:bg-[#0d1424]'}`}>
    <div className="flex justify-between items-start mb-4 relative z-10">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-300 ${colorClass}`}>
        <Icon size={22} />
      </div>
      {onClick && (
        <button onClick={onClick} className="px-3 py-1.5 bg-slate-900 dark:bg-white/[0.1] dark:hover:bg-white/[0.2] text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-600 transition-all shadow-md">
          {actionLabel}
        </button>
      )}
    </div>
    <div className="relative z-10">
      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em] mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 mt-1.5 uppercase tracking-widest">{subtext}</p>
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.08] max-w-sm w-full p-6 animate-in zoom-in-95">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} />
        </div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">{state.message}</h3>
      </div>
      {state.detail && <p className="text-xs text-slate-400 mb-5 ml-13 pl-[52px]">{state.detail}</p>}
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
          Cancelar
        </button>
        <button
          onClick={() => { state.onConfirm(); onCancel(); }}
          className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all"
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
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070b14]">
        <Loader2 className="animate-spin text-indigo-500" size={36} />
      </div>
    );
  }

  const tabBtn = (tab: SubTab, _label: string, accent?: string) =>
    `px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
      activeTab === tab
        ? accent === 'violet'
          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25'
          : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
        : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.06]'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] p-5 pt-5 font-inter">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Capital Humano</h1>
            <p className="text-slate-400 dark:text-white/40 font-medium text-[10px] mt-2 uppercase tracking-[0.2em]">Gestión de Personal · Control de Adelantos</p>
          </div>
          <div className="flex gap-1.5 p-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-2xl shadow-sm">
            <button onClick={() => setActiveTab('directory')} className={tabBtn('directory', 'Directorio')}>Directorio</button>
            <button onClick={() => setActiveTab('vouchers')} className={tabBtn('vouchers', 'Vales')}>Control de Vales</button>
            <button onClick={() => setActiveTab('nomina')} className={tabBtn('nomina', 'Nómina', 'violet')}>Nómina</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-4">
          <KPICard
            title="Total Plantilla"
            value={employees.length}
            subtext="Colaboradores registrados"
            icon={Users}
            colorClass="bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
            darkBg="dark:bg-gradient-to-br dark:from-indigo-950/60 dark:to-[#0d1424]"
          />
          <KPICard
            title="Vales Pendientes"
            value={`$${pendingVoucherTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtext="Por descontar en quincena"
            icon={AlertCircle}
            colorClass="bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
            darkBg="dark:bg-gradient-to-br dark:from-rose-950/40 dark:to-[#0d1424]"
          />
          <KPICard
            title="Cierre Quincenal"
            value="CORTE"
            subtext="Liquidar adelantos pendientes"
            icon={Scissors}
            colorClass="bg-slate-100 dark:bg-white/[0.1] text-slate-700 dark:text-white"
            darkBg="dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-[#0d1424]"
            onClick={handleExecuteCorte}
            actionLabel="Ejecutar"
          />
        </div>

        {/* CONTENT CARD */}
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden animate-in fade-in slide-in-from-bottom-4">

          {activeTab === 'nomina' ? (
            <>
              {/* Nómina header */}
              <div className="px-5 py-4 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Cálculo de Nómina</h3>
                  <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">
                    Período: {new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={handleProcessPayroll}
                  disabled={processingPayroll || nominaPreview.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {processingPayroll ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Procesar Nómina
                </button>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto">
                {nominaPreview.length === 0 ? (
                  <div className="py-16 text-center text-slate-300 dark:text-white/20">
                    <Users size={48} className="mx-auto mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest">Sin empleados activos</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                        <th className="px-5 py-3.5">Empleado</th>
                        <th className="px-5 py-3.5 text-center">Salario Base</th>
                        <th className="px-5 py-3.5 text-center">Deducciones</th>
                        <th className="px-5 py-3.5 text-center">Vales Pend.</th>
                        <th className="px-5 py-3.5 text-right">Neto a Pagar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {nominaPreview.map(({ emp, deductions, net, voucherCount }) => (
                        <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-black text-slate-900 dark:text-white">{emp.fullName}</p>
                            <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mt-0.5">{emp.role}</p>
                          </td>
                          <td className="px-5 py-3.5 text-center font-black text-slate-700 dark:text-slate-300 text-sm">${(emp.salary || 0).toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-center">
                            {deductions > 0
                              ? <span className="font-black text-rose-600 dark:text-rose-400">-${deductions.toFixed(2)}</span>
                              : <span className="text-slate-300 dark:text-white/20 font-black">—</span>
                            }
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {voucherCount > 0
                              ? <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded-md text-[10px] font-black">{voucherCount}</span>
                              : <span className="text-slate-300 dark:text-white/20">0</span>
                            }
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">${net.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-100 dark:border-white/[0.07]">
                        <td className="px-5 py-3.5 font-black text-slate-500 dark:text-white/40 text-[11px] uppercase tracking-widest">TOTALES ({nominaPreview.length} empleados)</td>
                        <td className="px-5 py-3.5 text-center font-black text-slate-800 dark:text-slate-200 text-sm">${nominaTotals.gross.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-center font-black text-rose-600 dark:text-rose-400">{nominaTotals.deductions > 0 ? `-$${nominaTotals.deductions.toFixed(2)}` : '—'}</td>
                        <td className="px-5 py-3.5"></td>
                        <td className="px-5 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg">${nominaTotals.net.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Payroll history */}
              {payrollHistory.length > 0 && (
                <div className="border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="px-5 py-3.5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Historial de Nóminas</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05]">
                          <th className="px-5 py-3">Período</th>
                          <th className="px-5 py-3 text-center">Empleados</th>
                          <th className="px-5 py-3 text-center">Bruto</th>
                          <th className="px-5 py-3 text-center">Deducciones</th>
                          <th className="px-5 py-3 text-right">Neto Pagado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                        {payrollHistory.slice(0, 12).map(run => (
                          <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                            <td className="px-5 py-3">
                              <p className="font-black text-slate-800 dark:text-slate-200 text-sm">{run.period}</p>
                              <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">
                                {run.processedAt?.toDate ? run.processedAt.toDate().toLocaleString('es-VE') : 'Reciente'}
                              </p>
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-slate-600 dark:text-slate-400">{run.employeeCount}</td>
                            <td className="px-5 py-3 text-center font-black text-slate-700 dark:text-slate-300 text-sm">${run.totalGross.toFixed(2)}</td>
                            <td className="px-5 py-3 text-center font-black text-rose-500 dark:text-rose-400">{run.totalDeductions > 0 ? `-$${run.totalDeductions.toFixed(2)}` : '—'}</td>
                            <td className="px-5 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">${run.totalNet.toFixed(2)}</td>
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
              {/* Directory header */}
              <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Directorio de Personal</h3>
                <button
                  onClick={() => { setEditingId(null); setEmpForm({ fullName: '', email: '', role: 'Vendedor', salary: 0, status: 'Activo' }); setIsEmpModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25"
                >
                  <UserPlus size={14} /> Nuevo Empleado
                </button>
              </div>
              <div className="overflow-x-auto">
                {employees.length === 0 ? (
                  <div className="py-16 text-center text-slate-300 dark:text-white/20">
                    <Users size={48} className="mx-auto mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest">Sin empleados registrados</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                        <th className="px-5 py-3.5">Identidad</th>
                        <th className="px-5 py-3.5 text-center">Rol</th>
                        <th className="px-5 py-3.5 text-center">Estado</th>
                        <th className="px-5 py-3.5 text-center">Salario</th>
                        <th className="px-5 py-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {employees.map(e => (
                        <tr key={e.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-black text-slate-900 dark:text-white">{e.fullName}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-tighter mt-0.5">{e.email}</p>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase border border-indigo-100 dark:border-indigo-500/30">{e.role}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${e.status === 'Activo' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400 border-slate-200 dark:border-white/10'}`}>
                              <Circle size={6} fill="currentColor" /> {e.status}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm">${e.salary?.toLocaleString() || '—'}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => { setEditingId(e.id); setEmpForm(e as any); setIsEmpModalOpen(true); }} className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleDeleteEmployee(e)} className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-all">
                                <Trash2 size={13} />
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
            /* VOUCHERS TAB */
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                      <Ticket size={18} className="text-indigo-500" /> Auditoría de Vales
                    </h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/30 mt-0.5 tracking-widest">Ingreso masivo de adelantos</p>
                  </div>
                </div>
                <form onSubmit={handleQuickAddVoucher} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-[#0d1424] p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-md shadow-black/5 items-end">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Empleado</label>
                    <select required value={quickVouch.employeeId} onChange={e => setQuickVouch({ ...quickVouch, employeeId: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">Seleccionar...</option>
                      {employees.filter(e => e.status === 'Activo').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Monto ($)</label>
                    <input required type="number" step="0.01" value={quickVouch.amount} onChange={e => setQuickVouch({ ...quickVouch, amount: e.target.value })} placeholder="0.00" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Concepto</label>
                    <input required value={quickVouch.reason} onChange={e => setQuickVouch({ ...quickVouch, reason: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <button disabled={isSaving} className="h-[42px] bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.15em] shadow-md shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                    {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <><Plus size={14} /> Registrar Vale</>}
                  </button>
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                      <th className="px-5 py-3.5">Fecha</th>
                      <th className="px-5 py-3.5">Beneficiario</th>
                      <th className="px-5 py-3.5 text-center">Monto</th>
                      <th className="px-5 py-3.5">Concepto</th>
                      <th className="px-5 py-3.5 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {vouchers.map(v => (
                      <tr key={v.id} className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3.5 text-slate-400 dark:text-white/30 font-mono">{v.createdAt?.toDate ? v.createdAt.toDate().toLocaleString('es-VE') : 'Reciente'}</td>
                        <td className="px-5 py-3.5 text-slate-900 dark:text-white font-black">{v.employeeName}</td>
                        <td className="px-5 py-3.5 text-center font-black text-slate-900 dark:text-white text-sm">${Number(v.amount).toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-slate-400 dark:text-white/40 italic font-medium">{v.reason}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.status === 'PENDIENTE' ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/30' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30'}`}>
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {vouchers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-16 text-center">
                          <Ticket size={48} className="mx-auto text-slate-300 dark:text-white/20 mb-3" />
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin movimientos de vales</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-xl rounded-2xl shadow-2xl shadow-black/40 border border-slate-200 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.03]">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{editingId ? 'Editar Ficha' : 'Nuevo Registro'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">Módulo de Personal</p>
              </div>
              <button onClick={() => setIsEmpModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400 dark:text-white/40"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Nombre Completo</label>
                  <input required value={empForm.fullName} onChange={e => setEmpForm({ ...empForm, fullName: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Correo Corporativo</label>
                  <input required type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Rol</label>
                  <select value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value as any })} className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Administrador">Administrador</option>
                    <option value="Cajero">Cajero</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Vendedor">Vendedor</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Salario Mensual ($)</label>
                  <input type="number" value={empForm.salary} onChange={e => setEmpForm({ ...empForm, salary: Number(e.target.value) })} className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <button disabled={isSaving} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Guardar</>}
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
