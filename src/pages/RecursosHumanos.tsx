import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, query, addDoc, doc, updateDoc,
  deleteDoc, serverTimestamp, orderBy, writeBatch,
} from 'firebase/firestore';
import {
  Users, UserPlus, Pencil, Trash2, X, Save, Loader2, Circle,
  Ticket, AlertCircle, Scissors, Plus, AlertTriangle, ChevronRight,
  DollarSign, Banknote, Calendar, Clock, Gift, TrendingUp, TrendingDown,
  FileText, ChevronDown, Phone, Mail, BadgeCheck, Briefcase,
} from 'lucide-react';

// ── CONSTANTS ───────────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  'Administración', 'Ventas', 'Almacén', 'Caja', 'Operaciones',
  'Gerencia', 'Servicios', 'Logística', 'Recursos Humanos', 'Otro',
];
const ROLES = ['Administrador', 'Gerente', 'Supervisor', 'Cajero', 'Vendedor', 'Almacenista', 'Servicios', 'Otro'];
const FREQ_LABELS: Record<string, string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
const FREQ_DIVISOR: Record<string, number> = { semanal: 4.33, quincenal: 2, mensual: 1 };

// ── TYPES ───────────────────────────────────────────────────────────────────────
interface Employee {
  id: string;
  fullName: string;
  cedula?: string;
  phone?: string;
  email?: string;
  role: string;
  department: string;
  status: 'Activo' | 'Inactivo' | 'Vacaciones' | 'Suspendido';
  payFrequency: 'semanal' | 'quincenal' | 'mensual';
  paymentCurrency: 'USD' | 'BS' | 'MIXTO';
  salaryUSD: number;
  salaryBs: number;
  bonusUSD: number;
  bonusBs: number;
  startDate?: string;
}

interface Voucher {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  currency: 'USD' | 'BS';
  reason: string;
  status: 'PENDIENTE' | 'DESCONTADO';
  createdAt: any;
  settledAt?: any;
}

interface PayrollDetail {
  employeeId: string;
  name: string;
  department: string;
  grossUSD: number;
  grossBs: number;
  deductionsUSD: number;
  deductionsBs: number;
  netUSD: number;
  netBs: number;
}

interface PayrollRun {
  id: string;
  period: string;
  frequency: string;
  processedAt: any;
  totalGrossUSD: number;
  totalGrossBs: number;
  totalDeductionsUSD: number;
  totalDeductionsBs: number;
  totalNetUSD: number;
  totalNetBs: number;
  employeeCount: number;
  details: PayrollDetail[];
}

type SubTab = 'directory' | 'vouchers' | 'nomina';

const EMPTY_EMP: Omit<Employee, 'id'> = {
  fullName: '', cedula: '', phone: '', email: '',
  role: 'Vendedor', department: 'Ventas', status: 'Activo',
  payFrequency: 'quincenal', paymentCurrency: 'USD',
  salaryUSD: 0, salaryBs: 0, bonusUSD: 0, bonusBs: 0, startDate: '',
};

// ── HELPERS ─────────────────────────────────────────────────────────────────────
function periodSalary(emp: Employee, currency: 'USD' | 'BS') {
  const base = currency === 'USD' ? (emp.salaryUSD || 0) : (emp.salaryBs || 0);
  const bonus = currency === 'USD' ? (emp.bonusUSD || 0) : (emp.bonusBs || 0);
  return (base + bonus) / (FREQ_DIVISOR[emp.payFrequency] || 1);
}

function fmt(n: number) { return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── KPI CARD ────────────────────────────────────────────────────────────────────
const KPICard = ({ title, value, sub, icon: Icon, color, bg, onClick, btn }: any) => (
  <div className={`p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 flex-1 min-w-[160px] relative overflow-hidden group bg-white ${bg || 'dark:bg-[#0d1424]'}`}>
    <div className="flex justify-between items-start mb-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={20} /></div>
      {onClick && (
        <button onClick={onClick} className="px-3 py-1.5 bg-slate-900 dark:bg-white/[0.1] text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-600 transition-all">
          {btn}
        </button>
      )}
    </div>
    <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em] mb-1">{title}</p>
    <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
    {sub && <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 mt-1 uppercase tracking-widest">{sub}</p>}
  </div>
);

// ── CONFIRM DIALOG ───────────────────────────────────────────────────────────────
const ConfirmDialog = ({ msg, detail, onConfirm, onCancel }: { msg: string; detail?: string; onConfirm: () => void; onCancel: () => void }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.08] max-w-sm w-full p-6 animate-in zoom-in-95">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} />
        </div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">{msg}</h3>
      </div>
      {detail && <p className="text-xs text-slate-400 dark:text-white/40 ml-[52px] mb-1">{detail}</p>}
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">Cancelar</button>
        <button onClick={() => { onConfirm(); onCancel(); }} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all">Confirmar</button>
      </div>
    </div>
  </div>
);

// ── EMPLOYEE PROFILE PANEL ───────────────────────────────────────────────────────
function EmployeeProfilePanel({
  emp, vouchers, payrollHistory, businessId, onClose, onAddVoucher,
}: {
  emp: Employee;
  vouchers: Voucher[];
  payrollHistory: PayrollRun[];
  businessId: string;
  onClose: () => void;
  onAddVoucher: (v: Omit<Voucher, 'id' | 'createdAt' | 'settledAt'>) => Promise<void>;
}) {
  const [vForm, setVForm] = useState({ amount: '', currency: 'USD' as 'USD' | 'BS', reason: 'Adelanto' });
  const [saving, setSaving] = useState(false);

  const pending = vouchers.filter(v => v.employeeId === emp.id && v.status === 'PENDIENTE');
  const pendingUSD = pending.filter(v => v.currency === 'USD').reduce((s, v) => s + v.amount, 0);
  const pendingBs  = pending.filter(v => v.currency === 'BS').reduce((s, v) => s + v.amount, 0);

  const pSalUSD = periodSalary(emp, 'USD');
  const pSalBs  = periodSalary(emp, 'BS');
  const overdraftUSD = emp.salaryUSD > 0 && pendingUSD > pSalUSD;
  const overdraftBs  = emp.salaryBs > 0 && pendingBs > pSalBs;
  const isOverdraft  = overdraftUSD || overdraftBs;

  // Historial de nóminas de este empleado
  const empHistory = payrollHistory
    .filter(r => r.details?.some(d => d.employeeId === emp.id))
    .slice(0, 8)
    .map(r => ({ run: r, detail: r.details.find(d => d.employeeId === emp.id)! }));

  const handleSubmitVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vForm.amount) return;
    setSaving(true);
    await onAddVoucher({
      employeeId: emp.id,
      employeeName: emp.fullName,
      amount: Number(vForm.amount),
      currency: vForm.currency,
      reason: vForm.reason,
      status: 'PENDIENTE',
    });
    setVForm(f => ({ ...f, amount: '', reason: 'Adelanto' }));
    setSaving(false);
  };

  const statusColors: Record<string, string> = {
    Activo: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30',
    Inactivo: 'bg-slate-100 dark:bg-white/[0.07] text-slate-400 border-slate-200 dark:border-white/10',
    Vacaciones: 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/30',
    Suspendido: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/30',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-[480px] bg-white dark:bg-[#0d1424] border-l border-slate-100 dark:border-white/[0.07] overflow-y-auto animate-in slide-in-from-right-4 duration-300 shadow-2xl shadow-black/40">

        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-white dark:bg-[#0d1424] border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/20 shrink-0">
              {emp.fullName[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-sm leading-tight">{emp.fullName}</p>
              <p className="text-[10px] font-bold text-slate-400 dark:text-white/40 uppercase tracking-widest">{emp.department} · {emp.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400 dark:text-white/40"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">

          {/* Overdraft Alert */}
          {isOverdraft && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-2xl">
              <AlertTriangle size={16} className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">⚠ Empleado Sobregirado</p>
                <p className="text-[11px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">
                  Los vales pendientes superan el salario del período actual
                  {overdraftUSD && emp.salaryUSD > 0 ? ` (USD: ${fmt(pendingUSD)} > ${fmt(pSalUSD)})` : ''}
                  {overdraftBs && emp.salaryBs > 0 ? ` (Bs: ${fmt(pendingBs)} > ${fmt(pSalBs)})` : ''}.
                </p>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Estatus', val: (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border inline-flex items-center gap-1 ${statusColors[emp.status]}`}>
                  <Circle size={5} fill="currentColor" /> {emp.status}
                </span>
              )},
              { label: 'Frecuencia', val: FREQ_LABELS[emp.payFrequency] },
              { label: 'Moneda de pago', val: emp.paymentCurrency },
              { label: 'Ingreso', val: emp.startDate || '—' },
              ...(emp.cedula ? [{ label: 'Cédula', val: emp.cedula }] : []),
              ...(emp.phone  ? [{ label: 'Teléfono', val: emp.phone }] : []),
            ].map(({ label, val }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06]">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">{label}</p>
                <div className="text-xs font-black text-slate-800 dark:text-white">{val}</div>
              </div>
            ))}
          </div>

          {/* Salary breakdown */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] space-y-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Estructura Salarial</p>
            {emp.salaryUSD > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-white/40 flex items-center gap-1.5"><DollarSign size={12} className="text-emerald-500" /> Salario USD</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">${fmt(emp.salaryUSD)}<span className="text-[9px] text-slate-400 dark:text-white/30 font-bold ml-1">mensual</span></span>
              </div>
            )}
            {emp.salaryBs > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-white/40 flex items-center gap-1.5"><Banknote size={12} className="text-sky-500" /> Salario Bs</span>
                <span className="font-black text-sky-600 dark:text-sky-400 text-sm">Bs {fmt(emp.salaryBs)}<span className="text-[9px] text-slate-400 dark:text-white/30 font-bold ml-1">mensual</span></span>
              </div>
            )}
            {emp.bonusUSD > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-white/40 flex items-center gap-1.5"><Gift size={12} className="text-violet-500" /> Bono USD</span>
                <span className="font-black text-violet-600 dark:text-violet-400 text-sm">+${fmt(emp.bonusUSD)}</span>
              </div>
            )}
            {emp.bonusBs > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 dark:text-white/40 flex items-center gap-1.5"><Gift size={12} className="text-amber-500" /> Bono Bs</span>
                <span className="font-black text-amber-600 dark:text-amber-400 text-sm">+Bs {fmt(emp.bonusBs)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-white/30">Pago por {FREQ_LABELS[emp.payFrequency]}</span>
              <div className="text-right">
                {emp.salaryUSD > 0 && <p className="text-xs font-black text-slate-800 dark:text-white">${fmt(pSalUSD)} USD</p>}
                {emp.salaryBs > 0  && <p className="text-xs font-black text-slate-800 dark:text-white">Bs {fmt(pSalBs)}</p>}
              </div>
            </div>
          </div>

          {/* Pending vouchers summary */}
          <div className={`p-4 rounded-2xl border ${isOverdraft ? 'bg-rose-50 dark:bg-rose-500/[0.07] border-rose-200 dark:border-rose-500/25' : 'bg-white dark:bg-white/[0.03] border-slate-100 dark:border-white/[0.06]'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Vales Pendientes del Período</p>
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">USD</p>
                <p className={`text-lg font-black ${pendingUSD > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-white/20'}`}>${fmt(pendingUSD)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Bs</p>
                <p className={`text-lg font-black ${pendingBs > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-white/20'}`}>Bs {fmt(pendingBs)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Saldo USD</p>
                <p className={`text-lg font-black ${pSalUSD - pendingUSD < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  ${fmt(Math.max(0, pSalUSD - pendingUSD))}
                </p>
              </div>
            </div>
          </div>

          {/* Add voucher form */}
          <form onSubmit={handleSubmitVoucher} className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Registrar Vale</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 mb-1 block">Moneda</label>
                <select value={vForm.currency} onChange={e => setVForm(f => ({ ...f, currency: e.target.value as any }))}
                  className="w-full px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="USD">USD ($)</option>
                  <option value="BS">Bs (Bolívares)</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 mb-1 block">Monto</label>
                <input required type="number" step="0.01" min="0.01" value={vForm.amount} onChange={e => setVForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 mb-1 block">Concepto</label>
              <input value={vForm.reason} onChange={e => setVForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <><Plus size={13} /> Registrar Vale</>}
            </button>
          </form>

          {/* Voucher list */}
          {pending.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Detalle de Vales Pendientes</p>
              <div className="space-y-1.5">
                {pending.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] rounded-xl">
                    <div>
                      <p className="text-xs font-black text-slate-800 dark:text-white">{v.reason}</p>
                      <p className="text-[9px] text-slate-400 dark:text-white/30 font-mono">{v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString('es-VE') : 'Reciente'}</p>
                    </div>
                    <span className={`font-black text-sm ${v.currency === 'USD' ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      -{v.currency === 'USD' ? '$' : 'Bs '}{fmt(v.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payroll history for this employee */}
          {empHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Historial de Nóminas</p>
              <div className="space-y-1.5">
                {empHistory.map(({ run, detail }) => (
                  <div key={run.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] rounded-xl">
                    <div>
                      <p className="text-xs font-black text-slate-800 dark:text-white">{run.period}</p>
                      <p className="text-[9px] text-slate-400 dark:text-white/30">{FREQ_LABELS[run.frequency] || run.frequency}</p>
                    </div>
                    <div className="text-right">
                      {detail.netUSD > 0 && <p className="font-black text-emerald-600 dark:text-emerald-400 text-sm">${fmt(detail.netUSD)}</p>}
                      {detail.netBs > 0  && <p className="font-black text-sky-600 dark:text-sky-400 text-xs">Bs {fmt(detail.netBs)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────────
export default function RecursosHumanos() {
  const { userProfile } = useAuth();
  const toast = useToast();
  const businessId = userProfile?.businessId;

  const [activeTab, setActiveTab] = useState<SubTab>('directory');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Employee CRUD
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<Omit<Employee, 'id'>>(EMPTY_EMP);

  // Ficha (profile panel)
  const [fichaEmp, setFichaEmp] = useState<Employee | null>(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{ msg: string; detail?: string; onConfirm: () => void } | null>(null);

  // Directory filters
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Voucher quick form
  const [quickVouch, setQuickVouch] = useState({ employeeId: '', amount: '', currency: 'USD' as 'USD' | 'BS', reason: 'Adelanto' });

  // Nomina
  const [processingPayroll, setProcessingPayroll] = useState(false);

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) { setTimeout(() => setLoading(false), 800); return; }
    setLoading(true);
    const u1 = onSnapshot(query(collection(db, `businesses/${businessId}/employees`)),
      snap => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))); setLoading(false); },
      () => setLoading(false));
    const u2 = onSnapshot(query(collection(db, `businesses/${businessId}/vouchers`), orderBy('createdAt', 'desc')),
      snap => setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher))),
      () => {});
    const u3 = onSnapshot(query(collection(db, `businesses/${businessId}/payroll_runs`), orderBy('processedAt', 'desc')),
      snap => setPayrollHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRun))),
      () => {});
    return () => { u1(); u2(); u3(); };
  }, [businessId]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const pendingVouchers = useMemo(() => vouchers.filter(v => v.status === 'PENDIENTE'), [vouchers]);
  const pendingTotalUSD = useMemo(() => pendingVouchers.filter(v => v.currency === 'USD').reduce((s, v) => s + v.amount, 0), [pendingVouchers]);
  const pendingTotalBs  = useMemo(() => pendingVouchers.filter(v => v.currency === 'BS').reduce((s, v) => s + v.amount, 0), [pendingVouchers]);

  const overdraftEmployees = useMemo(() => employees.filter(emp => {
    const pUSD = pendingVouchers.filter(v => v.employeeId === emp.id && v.currency === 'USD').reduce((s, v) => s + v.amount, 0);
    const pBs  = pendingVouchers.filter(v => v.employeeId === emp.id && v.currency === 'BS').reduce((s, v) => s + v.amount, 0);
    return (emp.salaryUSD > 0 && pUSD > periodSalary(emp, 'USD')) ||
           (emp.salaryBs  > 0 && pBs  > periodSalary(emp, 'BS'));
  }), [employees, pendingVouchers]);

  const nominaPreview = useMemo(() => employees.filter(e => e.status === 'Activo').map(emp => {
    const dUSD = pendingVouchers.filter(v => v.employeeId === emp.id && v.currency === 'USD').reduce((s, v) => s + v.amount, 0);
    const dBs  = pendingVouchers.filter(v => v.employeeId === emp.id && v.currency === 'BS').reduce((s, v) => s + v.amount, 0);
    const grossUSD = (emp.salaryUSD || 0) + (emp.bonusUSD || 0);
    const grossBs  = (emp.salaryBs  || 0) + (emp.bonusBs  || 0);
    return {
      emp, dUSD, dBs, grossUSD, grossBs,
      netUSD: Math.max(0, grossUSD - dUSD),
      netBs:  Math.max(0, grossBs  - dBs),
      vCount: pendingVouchers.filter(v => v.employeeId === emp.id).length,
      isOverdraft: (emp.salaryUSD > 0 && dUSD > periodSalary(emp, 'USD')) || (emp.salaryBs > 0 && dBs > periodSalary(emp, 'BS')),
    };
  }), [employees, pendingVouchers]);

  const nominaTotals = useMemo(() => ({
    grossUSD: nominaPreview.reduce((s, n) => s + n.grossUSD, 0),
    grossBs:  nominaPreview.reduce((s, n) => s + n.grossBs, 0),
    dUSD:     nominaPreview.reduce((s, n) => s + n.dUSD, 0),
    dBs:      nominaPreview.reduce((s, n) => s + n.dBs, 0),
    netUSD:   nominaPreview.reduce((s, n) => s + n.netUSD, 0),
    netBs:    nominaPreview.reduce((s, n) => s + n.netBs, 0),
  }), [nominaPreview]);

  const filteredEmployees = useMemo(() => employees.filter(e => {
    if (deptFilter !== 'all' && e.department !== deptFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search && !e.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [employees, deptFilter, statusFilter, search]);

  const departments = useMemo(() => ['all', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))], [employees]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, `businesses/${businessId}/employees`, editingId), { ...empForm, updatedAt: serverTimestamp() });
        toast.success('Empleado actualizado');
        if (fichaEmp?.id === editingId) setFichaEmp({ id: editingId, ...empForm });
      } else {
        await addDoc(collection(db, `businesses/${businessId}/employees`), { ...empForm, createdAt: serverTimestamp() });
        toast.success('Empleado registrado');
      }
      setIsEmpModalOpen(false);
    } catch { toast.error('Error al guardar'); }
    finally { setIsSaving(false); }
  };

  const handleAddVoucher = useCallback(async (v: Omit<Voucher, 'id' | 'createdAt' | 'settledAt'>) => {
    if (!businessId) return;
    await addDoc(collection(db, `businesses/${businessId}/vouchers`), { ...v, createdAt: serverTimestamp() });
    toast.success(`Vale registrado para ${v.employeeName}`);
  }, [businessId, toast]);

  const handleQuickVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !quickVouch.employeeId || !quickVouch.amount) return;
    setIsSaving(true);
    const emp = employees.find(x => x.id === quickVouch.employeeId);
    try {
      await handleAddVoucher({
        employeeId: quickVouch.employeeId,
        employeeName: emp?.fullName || '',
        amount: Number(quickVouch.amount),
        currency: quickVouch.currency,
        reason: quickVouch.reason,
        status: 'PENDIENTE',
      });
      setQuickVouch(f => ({ ...f, employeeId: '', amount: '' }));
    } finally { setIsSaving(false); }
  };

  const handleCorte = () => {
    if (pendingVouchers.length === 0) { toast.info('Sin vales pendientes'); return; }
    setConfirm({
      msg: '¿Ejecutar Corte de Vales?',
      detail: `${pendingVouchers.length} vale(s) — $${fmt(pendingTotalUSD)} USD + Bs ${fmt(pendingTotalBs)}`,
      onConfirm: async () => {
        const batch = writeBatch(db);
        pendingVouchers.forEach(v => batch.update(doc(db, `businesses/${businessId}/vouchers`, v.id), { status: 'DESCONTADO', settledAt: serverTimestamp() }));
        await batch.commit();
        toast.success('Corte ejecutado correctamente');
      },
    });
  };

  const handleProcessPayroll = () => {
    if (nominaPreview.length === 0) return;
    const freq = nominaPreview[0]?.emp.payFrequency || 'mensual';
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setConfirm({
      msg: '¿Procesar Nómina?',
      detail: `${nominaPreview.length} empleados — Neto: $${fmt(nominaTotals.netUSD)} USD + Bs ${fmt(nominaTotals.netBs)}`,
      onConfirm: async () => {
        setProcessingPayroll(true);
        try {
          const run: Omit<PayrollRun, 'id'> = {
            period, frequency: freq, processedAt: serverTimestamp(),
            totalGrossUSD: nominaTotals.grossUSD, totalGrossBs: nominaTotals.grossBs,
            totalDeductionsUSD: nominaTotals.dUSD, totalDeductionsBs: nominaTotals.dBs,
            totalNetUSD: nominaTotals.netUSD, totalNetBs: nominaTotals.netBs,
            employeeCount: nominaPreview.length,
            details: nominaPreview.map(n => ({
              employeeId: n.emp.id, name: n.emp.fullName, department: n.emp.department,
              grossUSD: n.grossUSD, grossBs: n.grossBs,
              deductionsUSD: n.dUSD, deductionsBs: n.dBs,
              netUSD: n.netUSD, netBs: n.netBs,
            })),
          };
          await addDoc(collection(db, `businesses/${businessId}/payroll_runs`), run);
          if (pendingVouchers.length > 0) {
            const batch = writeBatch(db);
            pendingVouchers.forEach(v => batch.update(doc(db, `businesses/${businessId}/vouchers`, v.id), { status: 'DESCONTADO', settledAt: serverTimestamp() }));
            await batch.commit();
          }
          toast.success(`Nómina ${period} procesada`);
        } catch { toast.error('Error al procesar nómina'); }
        finally { setProcessingPayroll(false); }
      },
    });
  };

  const handleDeleteEmployee = (emp: Employee) => setConfirm({
    msg: `¿Eliminar a ${emp.fullName}?`,
    detail: 'Esta acción no se puede deshacer.',
    onConfirm: async () => {
      await deleteDoc(doc(db, `businesses/${businessId}/employees`, emp.id));
      toast.success('Empleado eliminado');
      if (fichaEmp?.id === emp.id) setFichaEmp(null);
    },
  });

  const openNewEmp = () => { setEditingId(null); setEmpForm(EMPTY_EMP); setIsEmpModalOpen(true); };
  const openEditEmp = (e: Employee) => { setEditingId(e.id); setEmpForm(e); setIsEmpModalOpen(true); };

  const tabBtn = (t: SubTab, label: string) =>
    `px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
      activeTab === t
        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
        : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.06]'}`;

  const inp = 'w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none';

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070b14]">
      <Loader2 className="animate-spin text-indigo-500" size={36} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] p-5 font-inter">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Capital Humano</h1>
            <p className="text-slate-400 dark:text-white/40 font-medium text-[10px] mt-2 uppercase tracking-[0.2em]">Nómina · Vales · Fichas de Personal</p>
          </div>
          <div className="flex gap-1.5 p-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-2xl shadow-sm">
            {(['directory', 'vouchers', 'nomina'] as SubTab[]).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} className={tabBtn(t, t)}>
                {t === 'directory' ? 'Directorio' : t === 'vouchers' ? 'Control de Vales' : 'Nómina'}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-4">
          <KPICard title="Plantilla Activa" value={employees.filter(e => e.status === 'Activo').length}
            sub={`${employees.length} registrados`} icon={Users}
            color="bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
            bg="dark:bg-gradient-to-br dark:from-indigo-950/60 dark:to-[#0d1424]" />
          <KPICard title="Vales Pend. USD" value={`$${fmt(pendingTotalUSD)}`}
            sub={`${pendingVouchers.filter(v => v.currency === 'USD').length} vales`} icon={DollarSign}
            color="bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
            bg="dark:bg-gradient-to-br dark:from-rose-950/40 dark:to-[#0d1424]" />
          <KPICard title="Vales Pend. Bs" value={`Bs ${fmt(pendingTotalBs)}`}
            sub={`${pendingVouchers.filter(v => v.currency === 'BS').length} vales`} icon={Banknote}
            color="bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400"
            bg="dark:bg-gradient-to-br dark:from-orange-950/40 dark:to-[#0d1424]" />
          {overdraftEmployees.length > 0 && (
            <KPICard title="Sobregirados" value={overdraftEmployees.length}
              sub="Vales > salario período" icon={AlertTriangle}
              color="bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
              bg="dark:bg-gradient-to-br dark:from-rose-950/40 dark:to-[#0d1424]" />
          )}
          <KPICard title="Corte de Vales" value="EJECUTAR" sub="Liquidar vales pendientes" icon={Scissors}
            color="bg-slate-100 dark:bg-white/[0.1] text-slate-700 dark:text-white"
            bg="dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-[#0d1424]"
            onClick={handleCorte} btn="Corte" />
        </div>

        {/* Overdraft banner */}
        {overdraftEmployees.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-500/[0.08] border border-rose-200 dark:border-rose-500/25 rounded-2xl">
            <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">⚠ Empleados con Sobregiro Detectado</p>
              <p className="text-[11px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">
                {overdraftEmployees.map(e => e.fullName).join(', ')} — los vales superan el salario del período.
              </p>
            </div>
          </div>
        )}

        {/* CONTENT */}
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden">

          {/* ── DIRECTORY TAB ─────────────────────────────────────────────── */}
          {activeTab === 'directory' && (
            <>
              <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex-1 min-w-0">Directorio de Personal</h3>
                {/* Filters */}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre..."
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-40" />
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none">
                  {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'Todos los depto.' : d}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none">
                  {['all', 'Activo', 'Inactivo', 'Vacaciones', 'Suspendido'].map(s => <option key={s} value={s}>{s === 'all' ? 'Todos' : s}</option>)}
                </select>
                <button onClick={openNewEmp}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25">
                  <UserPlus size={14} /> Nuevo Empleado
                </button>
              </div>
              <div className="overflow-x-auto">
                {filteredEmployees.length === 0 ? (
                  <div className="py-16 text-center text-slate-300 dark:text-white/20">
                    <Users size={48} className="mx-auto mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest">Sin empleados</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                        <th className="px-5 py-3.5">Empleado</th>
                        <th className="px-5 py-3.5">Departamento</th>
                        <th className="px-5 py-3.5 text-center">Estado</th>
                        <th className="px-5 py-3.5 text-center">Frecuencia</th>
                        <th className="px-5 py-3.5 text-center">Salario</th>
                        <th className="px-5 py-3.5 text-center">Vales Pend.</th>
                        <th className="px-5 py-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {filteredEmployees.map(e => {
                        const empPendUSD = pendingVouchers.filter(v => v.employeeId === e.id && v.currency === 'USD').reduce((s, v) => s + v.amount, 0);
                        const empPendBs  = pendingVouchers.filter(v => v.employeeId === e.id && v.currency === 'BS').reduce((s, v) => s + v.amount, 0);
                        const isOver = overdraftEmployees.some(o => o.id === e.id);
                        return (
                          <tr key={e.id}
                            className="group hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all cursor-pointer"
                            onClick={() => setFichaEmp(e)}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 dark:from-indigo-500/30 dark:to-violet-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-sm shrink-0">
                                  {e.fullName[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    {e.fullName}
                                    {isOver && <AlertTriangle size={12} className="text-rose-500" />}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest">{e.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="px-2.5 py-1 bg-slate-50 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-lg text-[9px] font-black uppercase border border-slate-100 dark:border-white/[0.08]">{e.department || '—'}</span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${
                                e.status === 'Activo' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30' :
                                e.status === 'Vacaciones' ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/30' :
                                'bg-slate-100 dark:bg-white/[0.07] text-slate-400 border-slate-200 dark:border-white/10'
                              }`}><Circle size={5} fill="currentColor" /> {e.status}</span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{FREQ_LABELS[e.payFrequency]}</span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <div>
                                {e.salaryUSD > 0 && <p className="font-black text-slate-700 dark:text-slate-300 text-sm">${fmt(e.salaryUSD)}</p>}
                                {e.salaryBs  > 0 && <p className="font-black text-sky-600 dark:text-sky-400 text-xs">Bs {fmt(e.salaryBs)}</p>}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {(empPendUSD > 0 || empPendBs > 0) ? (
                                <div>
                                  {empPendUSD > 0 && <p className={`text-xs font-black ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>${fmt(empPendUSD)}</p>}
                                  {empPendBs  > 0 && <p className={`text-xs font-black ${isOver ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>Bs {fmt(empPendBs)}</p>}
                                </div>
                              ) : <span className="text-slate-300 dark:text-white/20 text-sm">—</span>}
                            </td>
                            <td className="px-5 py-3.5 text-right" onClick={e2 => e2.stopPropagation()}>
                              <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => setFichaEmp(e)} className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-all" title="Ver ficha">
                                  <FileText size={13} />
                                </button>
                                <button onClick={() => openEditEmp(e)} className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteEmployee(e)} className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── VOUCHERS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'vouchers' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                  <Ticket size={18} className="text-indigo-500" /> Control de Vales
                </h3>
                <form onSubmit={handleQuickVoucher} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white dark:bg-[#0d1424] p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-md shadow-black/5 items-end">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Empleado</label>
                    <select required value={quickVouch.employeeId} onChange={e => setQuickVouch(f => ({ ...f, employeeId: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">Seleccionar...</option>
                      {employees.filter(e => e.status === 'Activo').map(e => <option key={e.id} value={e.id}>{e.fullName} ({e.department})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Moneda</label>
                    <select value={quickVouch.currency} onChange={e => setQuickVouch(f => ({ ...f, currency: e.target.value as any }))}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="USD">USD ($)</option>
                      <option value="BS">Bs (Bolívares)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Monto</label>
                    <input required type="number" step="0.01" value={quickVouch.amount} onChange={e => setQuickVouch(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Concepto</label>
                    <input value={quickVouch.reason} onChange={e => setQuickVouch(f => ({ ...f, reason: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <button disabled={isSaving} className="h-[42px] bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Registrar</>}
                  </button>
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                      <th className="px-5 py-3.5">Fecha</th>
                      <th className="px-5 py-3.5">Empleado</th>
                      <th className="px-5 py-3.5 text-center">Moneda</th>
                      <th className="px-5 py-3.5 text-center">Monto</th>
                      <th className="px-5 py-3.5">Concepto</th>
                      <th className="px-5 py-3.5 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {vouchers.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-16 text-center">
                        <Ticket size={40} className="mx-auto text-slate-300 dark:text-white/20 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin vales registrados</p>
                      </td></tr>
                    )}
                    {vouchers.map(v => (
                      <tr key={v.id} className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3.5 font-mono text-[10px] text-slate-400 dark:text-white/30">{v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString('es-VE') : 'Reciente'}</td>
                        <td className="px-5 py-3.5 font-black text-slate-900 dark:text-white">
                          {v.employeeName}
                          <span className="ml-2 text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase">
                            {employees.find(e => e.id === v.employeeId)?.department || ''}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${v.currency === 'USD' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' : 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/20'}`}>
                            {v.currency}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center font-black text-slate-900 dark:text-white">
                          {v.currency === 'USD' ? '$' : 'Bs '}{fmt(v.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 dark:text-white/40 italic">{v.reason}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.status === 'PENDIENTE' ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/30' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30'}`}>
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── NÓMINA TAB ────────────────────────────────────────────────── */}
          {activeTab === 'nomina' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Cálculo de Nómina</h3>
                  <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">
                    {new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })} · {nominaPreview.length} empleados activos
                  </p>
                </div>
                <button onClick={handleProcessPayroll} disabled={processingPayroll || nominaPreview.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25 disabled:opacity-40">
                  {processingPayroll ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Procesar Nómina
                </button>
              </div>
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
                        <th className="px-5 py-3.5">Depto.</th>
                        <th className="px-5 py-3.5 text-center">Bruto USD</th>
                        <th className="px-5 py-3.5 text-center">Bruto Bs</th>
                        <th className="px-5 py-3.5 text-center">Deducciones</th>
                        <th className="px-5 py-3.5 text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {nominaPreview.map(({ emp, grossUSD, grossBs, dUSD, dBs, netUSD, netBs, vCount, isOverdraft }) => (
                        <tr key={emp.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all ${isOverdraft ? 'bg-rose-50/30 dark:bg-rose-500/[0.05]' : ''}`}>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                              {emp.fullName}
                              {isOverdraft && <span className="px-1.5 py-0.5 bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded text-[8px] font-black uppercase border border-rose-100 dark:border-rose-500/30">SOBREGIRADO</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mt-0.5">{FREQ_LABELS[emp.payFrequency]} · {emp.paymentCurrency}</p>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-white/40">{emp.department}</td>
                          <td className="px-5 py-3.5 text-center font-black text-slate-700 dark:text-slate-300 text-sm">{grossUSD > 0 ? `$${fmt(grossUSD)}` : '—'}</td>
                          <td className="px-5 py-3.5 text-center font-black text-sky-600 dark:text-sky-400 text-sm">{grossBs > 0 ? `Bs ${fmt(grossBs)}` : '—'}</td>
                          <td className="px-5 py-3.5 text-center">
                            {(dUSD > 0 || dBs > 0) ? (
                              <div>
                                {dUSD > 0 && <p className="font-black text-rose-600 dark:text-rose-400 text-xs">-${fmt(dUSD)}<span className="text-[8px] ml-0.5 opacity-60">({vCount})</span></p>}
                                {dBs  > 0 && <p className="font-black text-rose-600 dark:text-rose-400 text-xs">-Bs {fmt(dBs)}</p>}
                              </div>
                            ) : <span className="text-slate-300 dark:text-white/20">—</span>}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {netUSD > 0 && <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">${fmt(netUSD)}</p>}
                            {netBs  > 0 && <p className="font-black text-sky-600 dark:text-sky-400 text-sm">Bs {fmt(netBs)}</p>}
                          </td>
                        </tr>
                      ))}
                      {/* Totals */}
                      <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-100 dark:border-white/[0.07]">
                        <td colSpan={2} className="px-5 py-3.5 font-black text-slate-500 dark:text-white/40 text-[11px] uppercase tracking-widest">TOTALES ({nominaPreview.length} empleados)</td>
                        <td className="px-5 py-3.5 text-center font-black text-slate-800 dark:text-slate-200">{nominaTotals.grossUSD > 0 ? `$${fmt(nominaTotals.grossUSD)}` : '—'}</td>
                        <td className="px-5 py-3.5 text-center font-black text-sky-600 dark:text-sky-400">{nominaTotals.grossBs > 0 ? `Bs ${fmt(nominaTotals.grossBs)}` : '—'}</td>
                        <td className="px-5 py-3.5 text-center font-black text-rose-600 dark:text-rose-400">
                          {nominaTotals.dUSD > 0 && <span className="block">-${fmt(nominaTotals.dUSD)}</span>}
                          {nominaTotals.dBs  > 0 && <span className="block">-Bs {fmt(nominaTotals.dBs)}</span>}
                          {nominaTotals.dUSD === 0 && nominaTotals.dBs === 0 && '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {nominaTotals.netUSD > 0 && <p className="font-black text-emerald-600 dark:text-emerald-400 text-lg">${fmt(nominaTotals.netUSD)}</p>}
                          {nominaTotals.netBs  > 0 && <p className="font-black text-sky-600 dark:text-sky-400"          >Bs {fmt(nominaTotals.netBs)}</p>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Payroll history */}
              {payrollHistory.length > 0 && (
                <div className="border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="px-5 py-3.5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Historial de Nóminas Procesadas</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05]">
                          <th className="px-5 py-3">Período</th>
                          <th className="px-5 py-3 text-center">Empl.</th>
                          <th className="px-5 py-3 text-center">Bruto USD</th>
                          <th className="px-5 py-3 text-center">Bruto Bs</th>
                          <th className="px-5 py-3 text-center">Deduc.</th>
                          <th className="px-5 py-3 text-right">Neto Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                        {payrollHistory.slice(0, 10).map(run => (
                          <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all">
                            <td className="px-5 py-3">
                              <p className="font-black text-slate-800 dark:text-slate-200 text-sm">{run.period}</p>
                              <p className="text-[10px] text-slate-400 dark:text-white/30">{FREQ_LABELS[run.frequency] || run.frequency} · {run.processedAt?.toDate ? run.processedAt.toDate().toLocaleDateString('es-VE') : 'Reciente'}</p>
                            </td>
                            <td className="px-5 py-3 text-center font-bold text-slate-600 dark:text-slate-400">{run.employeeCount}</td>
                            <td className="px-5 py-3 text-center font-black text-slate-700 dark:text-slate-300">{run.totalGrossUSD > 0 ? `$${fmt(run.totalGrossUSD)}` : '—'}</td>
                            <td className="px-5 py-3 text-center font-black text-sky-600 dark:text-sky-400">{run.totalGrossBs > 0 ? `Bs ${fmt(run.totalGrossBs)}` : '—'}</td>
                            <td className="px-5 py-3 text-center font-black text-rose-500 dark:text-rose-400">
                              {(run.totalDeductionsUSD > 0 || run.totalDeductionsBs > 0) ? (
                                <div>
                                  {run.totalDeductionsUSD > 0 && <span className="block">-${fmt(run.totalDeductionsUSD)}</span>}
                                  {run.totalDeductionsBs  > 0 && <span className="block">-Bs {fmt(run.totalDeductionsBs)}</span>}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {run.totalNetUSD > 0 && <p className="font-black text-emerald-600 dark:text-emerald-400">${fmt(run.totalNetUSD)}</p>}
                              {run.totalNetBs  > 0 && <p className="font-black text-sky-600 dark:text-sky-400 text-sm">Bs {fmt(run.totalNetBs)}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── EMPLOYEE PROFILE PANEL ──────────────────────────────────────────── */}
      {fichaEmp && (
        <EmployeeProfilePanel
          emp={fichaEmp}
          vouchers={vouchers}
          payrollHistory={payrollHistory}
          businessId={businessId || ''}
          onClose={() => setFichaEmp(null)}
          onAddVoucher={handleAddVoucher}
        />
      )}

      {/* ── EMPLOYEE MODAL ──────────────────────────────────────────────────── */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-2xl rounded-2xl shadow-2xl shadow-black/40 border border-slate-200 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.03] sticky top-0 z-10">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{editingId ? 'Editar Ficha' : 'Nuevo Empleado'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">Módulo de Personal</p>
              </div>
              <button onClick={() => setIsEmpModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400 dark:text-white/40"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-6 space-y-5">

              {/* Personal data */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Datos Personales</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Nombre Completo *</label>
                    <input required value={empForm.fullName} onChange={e => setEmpForm(f => ({ ...f, fullName: e.target.value }))} className={inp} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Cédula</label>
                    <input value={empForm.cedula || ''} onChange={e => setEmpForm(f => ({ ...f, cedula: e.target.value }))} placeholder="V-12345678" className={inp} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Teléfono</label>
                    <input value={empForm.phone || ''} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} placeholder="04XX-0000000" className={inp} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Correo</label>
                    <input type="email" value={empForm.email || ''} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} className={inp} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Fecha de Ingreso</label>
                    <input type="date" value={empForm.startDate || ''} onChange={e => setEmpForm(f => ({ ...f, startDate: e.target.value }))} className={inp} />
                  </div>
                </div>
              </div>

              {/* Work data */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Cargo y Departamento</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Departamento</label>
                    <select value={empForm.department} onChange={e => setEmpForm(f => ({ ...f, department: e.target.value }))} className={inp}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Rol / Cargo</label>
                    <select value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} className={inp}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Estatus</label>
                    <select value={empForm.status} onChange={e => setEmpForm(f => ({ ...f, status: e.target.value as any }))} className={inp}>
                      {['Activo', 'Inactivo', 'Vacaciones', 'Suspendido'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pay settings */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Configuración de Pago</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Frecuencia de Pago</label>
                    <select value={empForm.payFrequency} onChange={e => setEmpForm(f => ({ ...f, payFrequency: e.target.value as any }))} className={inp}>
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Moneda de Pago</label>
                    <select value={empForm.paymentCurrency} onChange={e => setEmpForm(f => ({ ...f, paymentCurrency: e.target.value as any }))} className={inp}>
                      <option value="USD">USD (Dólares)</option>
                      <option value="BS">Bs (Bolívares BCV)</option>
                      <option value="MIXTO">Mixto (USD + Bs)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Salary */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Salario y Bonos (mensual base)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(empForm.paymentCurrency === 'USD' || empForm.paymentCurrency === 'MIXTO') && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Salario USD</label>
                        <input type="number" min="0" step="0.01" value={empForm.salaryUSD}
                          onChange={e => setEmpForm(f => ({ ...f, salaryUSD: Number(e.target.value) }))} className={inp} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Bono USD</label>
                        <input type="number" min="0" step="0.01" value={empForm.bonusUSD}
                          onChange={e => setEmpForm(f => ({ ...f, bonusUSD: Number(e.target.value) }))} className={inp} />
                      </div>
                    </>
                  )}
                  {(empForm.paymentCurrency === 'BS' || empForm.paymentCurrency === 'MIXTO') && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Salario Bs</label>
                        <input type="number" min="0" step="0.01" value={empForm.salaryBs}
                          onChange={e => setEmpForm(f => ({ ...f, salaryBs: Number(e.target.value) }))} className={inp} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Bono Bs</label>
                        <input type="number" min="0" step="0.01" value={empForm.bonusBs}
                          onChange={e => setEmpForm(f => ({ ...f, bonusBs: Number(e.target.value) }))} className={inp} />
                      </div>
                    </>
                  )}
                </div>
                {/* Preview */}
                <div className="mt-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20 flex flex-wrap gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Pago por {FREQ_LABELS[empForm.payFrequency]}</p>
                    {empForm.salaryUSD > 0 && <p className="text-sm font-black text-indigo-700 dark:text-indigo-300">${fmt((empForm.salaryUSD + empForm.bonusUSD) / FREQ_DIVISOR[empForm.payFrequency])} USD</p>}
                    {empForm.salaryBs  > 0 && <p className="text-sm font-black text-sky-700 dark:text-sky-300">Bs {fmt((empForm.salaryBs + empForm.bonusBs) / FREQ_DIVISOR[empForm.payFrequency])}</p>}
                  </div>
                </div>
              </div>

              <button disabled={isSaving} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2">
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Guardar Empleado</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG ──────────────────────────────────────────────────── */}
      {confirm && (
        <ConfirmDialog msg={confirm.msg} detail={confirm.detail} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
