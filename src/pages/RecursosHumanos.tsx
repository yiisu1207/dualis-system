import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, query, addDoc, doc, updateDoc,
  deleteDoc, serverTimestamp, orderBy, writeBatch, getDoc, limit,
} from 'firebase/firestore';
import {
  Users, UserPlus, Pencil, Trash2, X, Save, Loader2, Circle,
  Ticket, Scissors, Plus, AlertTriangle, DollarSign, Banknote,
  Gift, FileText, Printer, Download, Filter, RefreshCw,
  ShieldCheck, CreditCard, Sun, Clock, TrendingDown, ChevronDown,
  ChevronRight, RotateCcw, History,
  Eye, ArrowLeftRight, Calendar,
} from 'lucide-react';
import { printVoucherSheet, printPayslip, printPayrollRunPDF, exportNominaCSV, accrueVacationDays, fmtHR } from '../utils/hrUtils';
import { logAudit } from '../utils/auditLogger';
import { useRates } from '../context/RatesContext';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const DEPARTMENTS = ['Administración','Ventas','Almacén','Caja','Operaciones','Gerencia','Servicios','Logística','RRHH','Otro'];
const ROLES = ['Administrador','Gerente','Supervisor','Cajero','Vendedor','Almacenista','Servicios','Otro'];
const FREQ_LABEL: Record<string,string> = { semanal:'Semanal', quincenal:'Quincenal', mensual:'Mensual' };
const FREQ_DIV:   Record<string,number> = { semanal:4.33, quincenal:2, mensual:1 };
const FREQ_COLOR: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  semanal:   { bg:'bg-emerald-50 dark:bg-emerald-500/10', text:'text-emerald-700 dark:text-emerald-400', border:'border-emerald-200 dark:border-emerald-500/20', dot:'bg-emerald-500' },
  quincenal: { bg:'bg-sky-50 dark:bg-sky-500/10',         text:'text-sky-700 dark:text-sky-400',         border:'border-sky-200 dark:border-sky-500/20',         dot:'bg-sky-500' },
  mensual:   { bg:'bg-violet-50 dark:bg-violet-500/10',   text:'text-violet-700 dark:text-violet-400',   border:'border-violet-200 dark:border-violet-500/20',   dot:'bg-violet-500' },
};
const FREQ_DAYS: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 };

// ── TYPES ────────────────────────────────────────────────────────────────────
interface Employee {
  id: string; fullName: string; cedula?: string; phone?: string;
  role: string; department: string;
  status: 'Activo'|'Inactivo'|'Vacaciones'|'Suspendido';
  payFrequency: 'semanal'|'quincenal'|'mensual';
  paymentCurrency: 'USD'|'BS';
  salaryUSD: number; salaryBs: number;
  bonusUSD: number; bonusUSDCurrency: 'USD'|'BS';
  bonusBs: number;
  ivssEnabled: boolean; ivssRate: number;
  paroEnabled: boolean; paroRate: number;
  vacationDaysPerYear: number; vacationDaysUsed: number;
  startDate?: string;
}
interface Voucher {
  id: string; employeeId: string; employeeName: string;
  amount: number; currency: 'USD'|'BS';
  amountUSD: number; rateUsed?: number;
  reason: string; status: 'PENDIENTE'|'DESCONTADO'|'CORREGIDO';
  createdAt: any; settledAt?: any;
  voucherDate?: string;
  deferToNextPeriod?: boolean;
  registeredBy?: string; registeredByName?: string;
  correctedFrom?: string; originalAmount?: number; correctionNote?: string; correctedAt?: any;
}
interface VoucherRate {
  id: string; rate: number; createdAt: any; createdBy: string; notes?: string;
  effectiveDate?: string; // YYYY-MM-DD — the date this rate applies to
}
interface Loan {
  id: string; employeeId: string; employeeName: string;
  totalAmount: number; currency: 'USD'|'BS';
  totalInstallments: number; paidInstallments: number;
  installmentAmount: number; reason: string;
  status: 'ACTIVO'|'PAGADO'; createdAt: any;
}
interface TimeEntry {
  id: string; employeeId: string; employeeName: string;
  type: 'overtime' | 'absence' | 'missing_day';
  hours?: number;        // horas extra u horas ausentes
  days?: number;         // días faltantes
  date: string;          // fecha del evento
  reason: string;
  amountUSD?: number;    // monto calculado en USD (positivo = sumar, negativo = restar)
  status: 'PENDIENTE' | 'APLICADO';
  registeredBy?: string; registeredByName?: string;
  createdAt: any;
}
interface Abono {
  id: string; employeeId: string; employeeName: string;
  amount: number; currency: 'USD'|'BS'; amountUSD: number; rateUsed?: number;
  concept: string; date: string; status: 'PENDIENTE'|'APLICADO';
  registeredBy?: string; registeredByName?: string; createdAt: any;
}
interface PayrollDetail {
  employeeId: string; name: string; department: string;
  grossUSD: number; grossBs: number;
  voucherDedUSD: number; ivssUSD: number; paroUSD: number; loanDedUSD: number;
  overtimeUSD: number; absenceDeductionUSD: number;
  totalDedUSD: number; netUSD: number; netBs: number;
  settledVouchers?: { reason: string; amount: number; currency: string; amountUSD?: number }[];
}
interface PayrollRun {
  id: string; period: string; frequency: string; processedAt: any;
  totalGrossUSD: number; totalGrossBs: number;
  totalDedUSD: number; totalNetUSD: number; totalNetBs: number;
  employeeCount: number; details: PayrollDetail[];
}
type NominaRow = {
  emp: Employee; grossUSD: number; grossBs: number;
  voucherDedUSD: number; voucherDedBs: number;
  ivssUSD: number; paroUSD: number; loanDedUSD: number;
  overtimeUSD: number; absenceDeductionUSD: number;
  totalDedUSD: number; netUSD: number; netBs: number;
  vCount: number; isOverdraft: boolean;
};
interface CorteVoucherDetail {
  id: string; employeeId: string; employeeName: string;
  amount: number; currency: 'USD'|'BS'; amountUSD: number;
  reason: string; voucherDate?: string;
}
interface CorteRecord {
  id: string;
  executedAt: any;
  executedBy: string;
  executedByName: string;
  frequency?: string;
  totalUSD: number;
  totalBs: number;
  totalNetUSD?: number;
  employeeCount?: number;
  voucherCount: number;
  deferredCount: number;
  vouchers: CorteVoucherDetail[];
}
type SubTab = 'directory'|'vouchers'|'nomina'|'tasas'|'historial';

const EMPTY_EMP: Omit<Employee,'id'> = {
  fullName:'', cedula:'', phone:'', role:'Vendedor', department:'Ventas',
  status:'Activo', payFrequency:'quincenal', paymentCurrency:'USD',
  salaryUSD:0, salaryBs:0, bonusUSD:0, bonusUSDCurrency:'USD', bonusBs:0,
  ivssEnabled:false, ivssRate:4, paroEnabled:false, paroRate:2,
  vacationDaysPerYear:15, vacationDaysUsed:0, startDate:'',
};

const getCurrencyLabel = (c: 'USD'|'BS') => c === 'USD' ? 'Tasa Interna' : 'BCV';

function periodSal(emp: Employee, cur: 'USD'|'BS') {
  const base  = cur==='USD' ? (emp.salaryUSD||0) : (emp.salaryBs||0);
  const bonus = cur==='USD' ? (emp.bonusUSD||0)  : (emp.bonusBs||0);
  return (base + bonus) / (FREQ_DIV[emp.payFrequency]||1);
}

// ── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const KPI = ({ title, value, sub, icon: Icon, color, bg, onClick, btn }: any) => (
  <div className={`p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg flex-1 min-w-[calc(50%-8px)] sm:min-w-[155px] bg-white dark:bg-[#0d1424] ${bg||''}`}>
    <div className="flex justify-between items-start mb-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={19}/></div>
      {onClick && <button onClick={onClick} className="px-3 py-1.5 bg-slate-900 dark:bg-white/[0.1] text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-600 transition-all">{btn}</button>}
    </div>
    <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em] mb-1">{title}</p>
    <p className="text-xl font-black text-slate-900 dark:text-white">{value}</p>
    {sub && <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 mt-1 uppercase tracking-widest">{sub}</p>}
  </div>
);

const Confirm = ({ msg, detail, onConfirm, onCancel }: any) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl border border-slate-100 dark:border-white/[0.08] max-w-sm w-full p-6 animate-in zoom-in-95">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><AlertTriangle size={18}/></div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">{msg}</h3>
      </div>
      {detail && <p className="text-xs text-slate-400 dark:text-white/40 ml-[52px] mb-1">{detail}</p>}
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">Cancelar</button>
        <button onClick={()=>{onConfirm();onCancel();}} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all">Confirmar</button>
      </div>
    </div>
  </div>
);

// ── EMPLOYEE PROFILE PANEL ───────────────────────────────────────────────────
function ProfilePanel({ emp, vouchers, loans, payrollHistory, businessId, currentRate, onClose, onAddVoucher, onAddLoan, businessName, businessLogo }:
  { emp:Employee; vouchers:Voucher[]; loans:Loan[]; payrollHistory:PayrollRun[];
    businessId:string; currentRate:number; onClose:()=>void;
    onAddVoucher:(v:any)=>Promise<void>; onAddLoan:(l:any)=>Promise<void>; businessName:string; businessLogo?:string }) {

  const [vForm,  setVForm]  = useState({ amount:'', currency:'USD' as 'USD'|'BS', reason:'Adelanto' });
  const [lForm,  setLForm]  = useState({ totalAmount:'', currency:'USD' as 'USD'|'BS', totalInstallments:'2', reason:'Préstamo' });
  const [saving, setSaving] = useState(false);
  const [showLoan, setShowLoan] = useState(false);

  const pending    = vouchers.filter(v => v.employeeId===emp.id && v.status==='PENDIENTE');
  const allVouchers = vouchers.filter(v => v.employeeId===emp.id);
  const pendingUSD = pending.reduce((s,v)=> s+(v.currency==='USD'?v.amount:(v.amountUSD||0)), 0);
  const pendingBs  = pending.filter(v=>v.currency==='BS').reduce((s,v)=>s+v.amount, 0);
  const pSalUSD    = periodSal(emp,'USD');
  const isOver     = (emp.salaryUSD>0 && pendingUSD > pSalUSD);
  const accrued    = accrueVacationDays(emp.startDate||'', emp.vacationDaysPerYear||15);
  const vacLeft    = Math.max(0, accrued - (emp.vacationDaysUsed||0));
  const activeLoans = loans.filter(l=>l.employeeId===emp.id && l.status==='ACTIVO');
  const empHistory  = payrollHistory.filter(r=>r.details?.some(d=>d.employeeId===emp.id)).slice(0,6)
    .map(r=>({ run:r, det:r.details.find(d=>d.employeeId===emp.id)! }));

  // Bs voucher: calc equiv USD
  const equivUSD = vForm.currency==='BS' && currentRate>0 ? Number(vForm.amount||0)/currentRate : Number(vForm.amount||0);

  const submitVoucher = async (e: React.FormEvent) => {
    e.preventDefault(); if (!vForm.amount) return;
    setSaving(true);
    const amt = Number(vForm.amount);
    await onAddVoucher({
      employeeId: emp.id, employeeName: emp.fullName,
      amount: amt, currency: vForm.currency,
      amountUSD: vForm.currency==='USD' ? amt : (currentRate>0 ? amt/currentRate : 0),
      ...(vForm.currency==='BS' && currentRate > 0 ? { rateUsed: currentRate } : {}),
      reason: vForm.reason, status: 'PENDIENTE',
    });
    setVForm(f=>({...f,amount:'',reason:'Adelanto'}));
    setSaving(false);
  };

  const submitLoan = async (e: React.FormEvent) => {
    e.preventDefault(); if (!lForm.totalAmount) return;
    setSaving(true);
    const total = Number(lForm.totalAmount);
    const inst  = Number(lForm.totalInstallments)||1;
    await onAddLoan({
      employeeId:emp.id, employeeName:emp.fullName,
      totalAmount:total, currency:lForm.currency,
      totalInstallments:inst, paidInstallments:0,
      installmentAmount: parseFloat((total/inst).toFixed(2)),
      reason:lForm.reason, status:'ACTIVO',
    });
    setLForm({totalAmount:'',currency:'USD',totalInstallments:'2',reason:'Préstamo'});
    setShowLoan(false); setSaving(false);
  };

  const inp = 'w-full px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="w-full max-w-[460px] bg-white dark:bg-[#0d1424] border-l border-slate-100 dark:border-white/[0.07] overflow-y-auto animate-in slide-in-from-right-4 duration-300 shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4 bg-white dark:bg-[#0d1424] border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-lg shrink-0">
              {emp.fullName[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-black text-slate-900 dark:text-white text-sm">{emp.fullName}</p>
              <p className="text-[10px] text-slate-400 dark:text-white/40 uppercase tracking-widest">{emp.department} · {emp.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>printVoucherSheet(emp, allVouchers, businessName, businessLogo)} title="Imprimir Hoja de Vales"
              className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-all">
              <Printer size={15}/>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400"><X size={18}/></button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Overdraft */}
          {isOver && (
            <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 rounded-xl">
              <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5"/>
              <div>
                <p className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">⚠ Sobregirado</p>
                <p className="text-[11px] text-rose-600/70 dark:text-rose-400/60 mt-0.5">
                  Vales ${fmtHR(pendingUSD)} › Salario período ${fmtHR(pSalUSD)}
                </p>
              </div>
            </div>
          )}

          {/* Net pay box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">Neto a Recibir USD</p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">${fmtHR(Math.max(0,pSalUSD-pendingUSD))}</p>
              <p className="text-[9px] text-emerald-600/60 dark:text-emerald-400/50 mt-0.5">por {FREQ_LABEL[emp.payFrequency]}</p>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/[0.07] border border-rose-100 dark:border-rose-500/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-1">Vales Pendientes</p>
              {pendingUSD>0 && <p className="text-lg font-black text-rose-700 dark:text-rose-300">-${fmtHR(pendingUSD)}</p>}
              {pendingBs >0 && <p className="text-sm font-black text-rose-600 dark:text-rose-400">Bs {fmtHR(pendingBs)}</p>}
              {pendingUSD===0&&pendingBs===0 && <p className="text-xl font-black text-slate-300 dark:text-white/20">—</p>}
            </div>
          </div>

          {/* Info chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { l:'Cédula', v: emp.cedula||'—' },
              { l:'Teléfono', v: emp.phone||'—' },
              { l:'Frecuencia', v: FREQ_LABEL[emp.payFrequency] },
              { l:'Moneda', v: getCurrencyLabel(emp.paymentCurrency) },
              { l:'Inicio', v: emp.startDate||'—' },
              { l:'Estatus', v: emp.status },
            ].map(({l,v})=>(
              <div key={l} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.05]">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-0.5">{l}</p>
                <p className="text-xs font-black text-slate-800 dark:text-white">{v}</p>
              </div>
            ))}
          </div>

          {/* Salary structure */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Estructura Salarial</p>
            {emp.salaryUSD>0 && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">Salario USD</span><span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">${fmtHR(emp.salaryUSD)}<span className="text-[9px] text-slate-400 ml-1">mensual</span></span></div>}
            {emp.bonusUSD>0  && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">Bono en {emp.bonusUSDCurrency==='BS'?'Bs (BCV)':'USD'}</span><span className="font-black text-violet-600 dark:text-violet-400 text-sm">+${fmtHR(emp.bonusUSD)}</span></div>}
            {emp.salaryBs>0  && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">Salario Bs (BCV)</span><span className="font-black text-sky-600 dark:text-sky-400 text-sm">Bs {fmtHR(emp.salaryBs)}<span className="text-[9px] text-slate-400 ml-1">mensual</span></span></div>}
            {emp.bonusBs>0   && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">Bono Bs (BCV)</span><span className="font-black text-amber-600 dark:text-amber-400 text-sm">+Bs {fmtHR(emp.bonusBs)}</span></div>}
            {emp.ivssEnabled && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">IVSS ({emp.ivssRate}%)</span><span className="font-black text-rose-500 text-xs">-${fmtHR((emp.salaryUSD||0)*(emp.ivssRate||4)/100)}</span></div>}
            {emp.paroEnabled && <div className="flex justify-between"><span className="text-xs text-slate-500 dark:text-white/40">Paro Forzoso ({emp.paroRate}%)</span><span className="font-black text-rose-500 text-xs">-${fmtHR((emp.salaryUSD||0)*(emp.paroRate||2)/100)}</span></div>}
          </div>

          {/* Vacaciones */}
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-500/[0.07] border border-sky-100 dark:border-sky-500/20 flex items-center gap-4">
            <Sun size={18} className="text-sky-500 shrink-0"/>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400">Vacaciones</p>
              <p className="text-xs text-sky-700/70 dark:text-sky-400/60 mt-0.5">{accrued} días acumulados · {emp.vacationDaysUsed||0} usados</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-sky-700 dark:text-sky-300">{vacLeft}</p>
              <p className="text-[9px] text-sky-600/60 dark:text-sky-400/50 uppercase tracking-widest">disponibles</p>
            </div>
          </div>

          {/* Active loans */}
          {activeLoans.length>0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Préstamos Activos</p>
              {activeLoans.map(l=>(
                <div key={l.id} className="flex items-center justify-between px-3 py-2.5 bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-100 dark:border-amber-500/20 rounded-xl">
                  <div>
                    <p className="text-xs font-black text-slate-800 dark:text-white">{l.reason}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/30">{l.paidInstallments}/{l.totalInstallments} cuotas pagadas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-amber-700 dark:text-amber-400">{l.currency==='USD'?'$':'Bs '}{fmtHR(l.installmentAmount)}/cuota</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/30">{l.currency==='USD'?'$':'Bs '}{fmtHR(l.totalAmount)} total</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add voucher */}
          <form onSubmit={submitVoucher} className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20 space-y-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Registrar Vale</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={vForm.currency} onChange={e=>setVForm(f=>({...f,currency:e.target.value as any}))} className={inp}>
                <option value="USD">USD ($)</option>
                <option value="BS">Bs (BCV)</option>
              </select>
              <input required type="number" step="0.01" min="0.01" placeholder="Monto" value={vForm.amount}
                onChange={e=>setVForm(f=>({...f,amount:e.target.value}))} className={inp}/>
            </div>
            {vForm.currency==='BS' && currentRate>0 && Number(vForm.amount)>0 && (
              <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-bold">
                Tasa: Bs {fmtHR(currentRate)} → Equiv. USD: ${fmtHR(equivUSD)}
              </p>
            )}
            <input value={vForm.reason} onChange={e=>setVForm(f=>({...f,reason:e.target.value}))} className={inp}/>
            <button disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              {saving?<Loader2 size={13} className="animate-spin"/>:<><Plus size={13}/>Registrar Vale</>}
            </button>
          </form>

          {/* Add loan button */}
          <button onClick={()=>setShowLoan(s=>!s)} className="w-full py-2.5 border border-dashed border-amber-300 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-500/[0.07] transition-all">
            <CreditCard size={13}/> {showLoan ? 'Cancelar' : 'Nuevo Préstamo a Cuotas'}
          </button>
          {showLoan && (
            <form onSubmit={submitLoan} className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-100 dark:border-amber-500/20 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 block mb-1">Moneda</label>
                  <select value={lForm.currency} onChange={e=>setLForm(f=>({...f,currency:e.target.value as any}))} className={inp}>
                    <option value="USD">USD ($)</option><option value="BS">Bs</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 block mb-1">Monto Total</label>
                  <input required type="number" step="0.01" value={lForm.totalAmount} onChange={e=>setLForm(f=>({...f,totalAmount:e.target.value}))} className={inp}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 block mb-1">Nro. Cuotas</label>
                  <input required type="number" min="1" max="52" value={lForm.totalInstallments} onChange={e=>setLForm(f=>({...f,totalInstallments:e.target.value}))} className={inp}/>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 block mb-1">Concepto</label>
                  <input value={lForm.reason} onChange={e=>setLForm(f=>({...f,reason:e.target.value}))} className={inp}/>
                </div>
              </div>
              {lForm.totalAmount && Number(lForm.totalInstallments)>0 && (
                <p className="text-[10px] font-black text-amber-700 dark:text-amber-300">
                  Cuota: {lForm.currency==='USD'?'$':'Bs '}{fmtHR(Number(lForm.totalAmount)/Number(lForm.totalInstallments))} × {lForm.totalInstallments}
                </p>
              )}
              <button disabled={saving} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {saving?<Loader2 size={13} className="animate-spin"/>:<><Save size={13}/>Crear Préstamo</>}
              </button>
            </form>
          )}

          {/* Pending vouchers list */}
          {pending.length>0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Vales Pendientes del Período</p>
              {pending.map(v=>(
                <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] rounded-xl mb-1.5">
                  <div>
                    <p className="text-xs font-black text-slate-800 dark:text-white">{v.reason}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/30 font-mono">{v.createdAt?.toDate?v.createdAt.toDate().toLocaleDateString('es-VE'):'—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-rose-600 dark:text-rose-400 text-sm">{v.currency==='USD'?'-$':'-Bs '}{fmtHR(v.amount)}</p>
                    {v.currency==='BS' && v.amountUSD!=null && <p className="text-[9px] text-slate-400 dark:text-white/30">≈ -${fmtHR(v.amountUSD)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payroll history */}
          {empHistory.length>0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Historial de Nóminas</p>
              {empHistory.map(({run,det})=>(
                <div key={run.id} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] rounded-xl mb-1.5">
                  <div>
                    <p className="text-xs font-black text-slate-800 dark:text-white">{run.period}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/30">{FREQ_LABEL[run.frequency]||run.frequency}</p>
                  </div>
                  <div className="text-right">
                    {det.netUSD>0 && <p className="font-black text-emerald-600 dark:text-emerald-400 text-sm">${fmtHR(det.netUSD)}</p>}
                    {det.netBs >0 && <p className="font-black text-sky-600 dark:text-sky-400 text-xs">Bs {fmtHR(det.netBs)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function RecursosHumanos() {
  const { userProfile, isolationMode } = useAuth();
  const toast           = useToast();
  const { rates: _ratesCtx } = useRates();
  const tasaBCV = _ratesCtx.tasaBCV;
  const bid             = userProfile?.businessId || '';

  // ── Isolation mode comes from AuthContext (Firestore real-time) ──────────────
  const isIndividual = isolationMode === 'individual';
  const myUid = userProfile?.uid || '';

  const [activeTab,      setActiveTab]      = useState<SubTab>('directory');
  const [employees,      setEmployees]      = useState<Employee[]>([]);
  const [vouchers,       setVouchers]       = useState<Voucher[]>([]);
  const [voucherRates,   setVoucherRates]   = useState<VoucherRate[]>([]);
  const [bcvHistory,     setBcvHistory]     = useState<{date:string; bcv:number}[]>([]);
  const [loans,          setLoans]          = useState<Loan[]>([]);
  const [timeEntries,    setTimeEntries]    = useState<TimeEntry[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [loading,        setLoading]        = useState(true);

  // Employee modal
  const [empModal,  setEmpModal]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [editId,    setEditId]    = useState<string|null>(null);
  const [empForm,   setEmpForm]   = useState<Omit<Employee,'id'>>(EMPTY_EMP);

  // Profile panel
  const [fichaEmp, setFichaEmp] = useState<Employee|null>(null);

  // Confirm
  const [confirm, setConfirm] = useState<{msg:string;detail?:string;onConfirm:()=>void}|null>(null);

  // Directory filters
  const [deptFilter,   setDeptFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');

  // Nomina filters
  const [freqFilter, setFreqFilter] = useState('all');
  const [procLoading, setProcLoading] = useState(false);

  // Vouchers tab quick form
  const [qv, setQv] = useState({ empId:'', date: new Date().toISOString().slice(0,10), amount:'', currency:'USD' as 'USD'|'BS', reason:'Adelanto', defer: false });
  const amtRef = useRef<HTMLInputElement>(null);

  // Voucher correction
  const [correcting, setCorrecting] = useState<{v:Voucher; newAmt:string; newDate:string; newCurrency:'USD'|'BS'; note:string}|null>(null);

  // Time entries quick form
  const [te, setTe] = useState({ empId:'', date: new Date().toISOString().slice(0,10), type:'overtime' as TimeEntry['type'], hours:'', days:'', reason:'' });

  // Payroll history detail
  const [selectedRun, setSelectedRun] = useState<PayrollRun|null>(null);

  // Tasas tab
  const [rateInput, setRateInput] = useState('');
  const [rateNotes, setRateNotes] = useState('');
  const [rateDate, setRateDate]   = useState(() => new Date().toISOString().slice(0,10));
  const [savingRate, setSavingRate] = useState(false);

  // Editable rate history
  const [editingRate, setEditingRate] = useState<{id:string;rate:string;effectiveDate:string;notes:string}|null>(null);

  // Dismissible hints (J)

  // Abonos (L)
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [qa, setQa] = useState({ empId:'', date: new Date().toISOString().slice(0,10), amount:'', currency:'USD' as 'USD'|'BS', concept:'Abono en efectivo' });
  const [savingAbono, setSavingAbono] = useState(false);

  // Pagination for vouchers table
  const VALES_PER_PAGE = 10;
  const [valesPage, setValesPage] = useState(1);
  // Reset to page 1 when employee filter changes
  useEffect(() => { setValesPage(1); }, [qv.empId]);

  // Emp dropdown state (G)
  const [empDropOpen, setEmpDropOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [teDropOpen, setTeDropOpen] = useState(false);
  const [teSearch, setTeSearch] = useState('');
  const [abonoDropOpen, setAbonoDropOpen] = useState(false);
  const [abonoSearch, setAbonoSearch] = useState('');
  const empDropRef = useRef<HTMLDivElement>(null);
  const teDropRef  = useRef<HTMLDivElement>(null);
  const abonoDropRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (empDropRef.current && !empDropRef.current.contains(e.target as Node)) setEmpDropOpen(false);
      if (teDropRef.current  && !teDropRef.current.contains(e.target as Node))  setTeDropOpen(false);
      if (abonoDropRef.current && !abonoDropRef.current.contains(e.target as Node)) setAbonoDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Historial de cortes
  const [cortes, setCortes] = useState<CorteRecord[]>([]);
  const [selectedCorte, setSelectedCorte] = useState<CorteRecord|null>(null);

  // Business name + logo for prints (fetched from Firestore)
  const [businessName, setBusinessName] = useState('Mi Negocio');
  const [businessLogo, setBusinessLogo] = useState('');
  useEffect(() => {
    if (!bid) return;
    getDoc(doc(db, 'businesses', bid)).then(snap => {
      if (snap.exists()) {
        setBusinessName(snap.data().name || 'Mi Negocio');
        setBusinessLogo(snap.data().logoUrl || snap.data().logo || '');
      }
    }).catch(() => {});
  }, [bid]);

  // ── Listeners ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bid) { setTimeout(()=>setLoading(false),600); return; }
    setLoading(true);
    const u1 = onSnapshot(query(collection(db,`businesses/${bid}/employees`)),
      s=>{setEmployees(s.docs.map(d=>({id:d.id,...d.data()} as Employee)));setLoading(false);},
      ()=>setLoading(false));
    const u2 = onSnapshot(query(collection(db,`businesses/${bid}/vouchers`),orderBy('createdAt','desc')),
      s=>setVouchers(s.docs.map(d=>({id:d.id,...d.data()} as Voucher))), ()=>{});
    const u3 = onSnapshot(query(collection(db,`businesses/${bid}/voucher_rates`),orderBy('createdAt','desc')),
      s=>setVoucherRates(s.docs.map(d=>({id:d.id,...d.data()} as VoucherRate))), ()=>{});
    const u4 = onSnapshot(query(collection(db,`businesses/${bid}/loans`),orderBy('createdAt','desc')),
      s=>setLoans(s.docs.map(d=>({id:d.id,...d.data()} as Loan))), ()=>{});
    const u5 = onSnapshot(query(collection(db,`businesses/${bid}/payroll_runs`),orderBy('processedAt','desc')),
      s=>setPayrollHistory(s.docs.map(d=>({id:d.id,...d.data()} as PayrollRun))), ()=>{});
    const u6 = onSnapshot(query(collection(db,`businesses/${bid}/time_entries`)),
      s=>setTimeEntries(s.docs.map(d=>({id:d.id,...d.data()} as TimeEntry)).sort((a,b)=>(b.date||'').localeCompare(a.date||''))), ()=>{});
    const u7 = onSnapshot(query(collection(db,`businesses/${bid}/abonos`),orderBy('createdAt','desc')),
      s=>setAbonos(s.docs.map(d=>({id:d.id,...d.data()} as Abono))), ()=>{});
    const u8 = onSnapshot(query(collection(db,`businesses/${bid}/exchange_rates_history`),orderBy('date','desc'),limit(200)),
      s=>setBcvHistory(s.docs.map(d=>({date:(d.data() as any).date||d.id, bcv:Number((d.data() as any).bcv)||0}))),
      ()=>{});
    const u9 = onSnapshot(query(collection(db,`businesses/${bid}/cortes`),orderBy('executedAt','desc')),
      s=>setCortes(s.docs.map(d=>({id:d.id,...d.data()} as CorteRecord))),
      ()=>{});
    return ()=>{u1();u2();u3();u4();u5();u6();u7();u8();u9();};
  }, [bid]);

  // ── Derived ────────────────────────────────────────────────────────────────
  // When isolation mode = individual, only show MY entries
  const isOwner = userProfile?.role === 'owner';
  const visibleVouchers   = useMemo(() => {
    let list = !isIndividual
      ? vouchers
      : vouchers.filter(v => v.registeredBy === myUid || (isOwner && !v.registeredBy));
    // Filter by selected employee in the form
    if (qv.empId) list = list.filter(v => v.employeeId === qv.empId);
    return list;
  }, [vouchers, isIndividual, myUid, isOwner, qv.empId]);
  const visibleTimeEntries = useMemo(() => {
    if (!isIndividual) return timeEntries;
    return timeEntries.filter(t => t.registeredBy === myUid || (isOwner && !t.registeredBy));
  }, [timeEntries, isIndividual, myUid, isOwner]);
  const visibleAbonos = useMemo(() => {
    if (!isIndividual) return abonos;
    return abonos.filter(a => a.registeredBy === myUid || (isOwner && !a.registeredBy));
  }, [abonos, isIndividual, myUid, isOwner]);

  // Tasa interna propia de RRHH; si no hay, cae al BCV global
  const currentRate = voucherRates[0]?.rate || (tasaBCV ?? 0);

  // Find the applicable rate for a specific date (latest effectiveDate on or before that date)
  const getRateForDate = useCallback((dateStr: string): number => {
    const bcvFallback = tasaBCV ?? 0;
    if (!voucherRates.length) return bcvFallback;
    // Use effectiveDate if available, else fall back to createdAt
    const withDates = voucherRates.map(r => {
      const ed = r.effectiveDate
        ? new Date(r.effectiveDate + 'T23:59:59')
        : (r.createdAt?.toDate?.() ?? new Date(r.createdAt));
      return { ...r, _date: ed };
    }).sort((a, b) => b._date.getTime() - a._date.getTime());
    const target = new Date(dateStr + 'T23:59:59');
    for (const r of withDates) {
      if (r._date <= target) return r.rate;
    }
    return withDates[withDates.length - 1]?.rate || bcvFallback;
  }, [voucherRates, tasaBCV]);

  // BCV rate lookup from exchange_rates_history by date (for BCV-paid employees)
  const getBcvRateForDate = useCallback((dateStr: string): number => {
    const fallback = tasaBCV ?? 0;
    if (!bcvHistory.length) return fallback;
    // bcvHistory is already sorted desc by date
    const match = bcvHistory.find(e => e.date <= dateStr && e.bcv > 0);
    return match?.bcv ?? bcvHistory[bcvHistory.length - 1]?.bcv ?? fallback;
  }, [bcvHistory, tasaBCV]);

  const pendingVouchers = useMemo(()=>visibleVouchers.filter(v=>v.status==='PENDIENTE'),[visibleVouchers]);
  // For nómina: exclude deferred vales (they apply next period)
  const currentPeriodVouchers = useMemo(()=>pendingVouchers.filter(v=>!v.deferToNextPeriod),[pendingVouchers]);
  const activeLoans     = useMemo(()=>loans.filter(l=>l.status==='ACTIVO'),[loans]);

  // Dynamic currency options for vale form (C)
  const valeMonedaOpts = useMemo(()=>{
    const emp = employees.find(e=>e.id===qv.empId);
    if (!emp) return [{ value:'USD' as const, label:'Tasa Interna ($)' },{ value:'BS' as const, label:'Bs (Tasa Interna)' }];
    if (emp.paymentCurrency==='BS') return [
      { value:'USD' as const, label:'USD ($)' },
      { value:'BS' as const, label:'Bs (BCV)' },
    ];
    return [
      { value:'USD' as const, label:'Tasa Interna ($)' },
      { value:'BS' as const, label:'Bs (Tasa Interna)' },
    ];
  },[employees, qv.empId]);

  const pendingTotalUSD = useMemo(()=>pendingVouchers.reduce((s,v)=>s+(v.currency==='USD'?v.amount:(v.amountUSD||0)),0),[pendingVouchers]);
  const pendingTotalBs  = useMemo(()=>pendingVouchers.filter(v=>v.currency==='BS').reduce((s,v)=>s+v.amount,0),[pendingVouchers]);

  const pendingTimeEntries = useMemo(() => visibleTimeEntries.filter(t => t.status === 'PENDIENTE'), [visibleTimeEntries]);

  const nominaRows = useMemo(():NominaRow[] => {
    const filtered = employees.filter(e=>e.status==='Activo' && (freqFilter==='all'||e.payFrequency===freqFilter));
    return filtered.map(emp=>{
      const ev   = currentPeriodVouchers.filter(v=>v.employeeId===emp.id);
      const vDedUSD = ev.reduce((s,v)=>s+(v.currency==='USD'?v.amount:(v.amountUSD||0)),0);
      const vDedBs  = ev.filter(v=>v.currency==='BS').reduce((s,v)=>s+v.amount,0);
      // Subtract abonos from voucher deductions (L) — use visibleAbonos for isolation
      const empAbonosUSD = visibleAbonos.filter(a=>a.employeeId===emp.id&&a.status==='PENDIENTE')
        .reduce((s,a)=>s+(a.currency==='USD'?a.amount:(a.amountUSD||0)),0);
      const netVDedUSD = Math.max(0, vDedUSD - empAbonosUSD);
      const ivssUSD = emp.ivssEnabled?(emp.salaryUSD||0)*(emp.ivssRate||4)/100:0;
      const paroUSD = emp.paroEnabled?(emp.salaryUSD||0)*(emp.paroRate||2)/100:0;
      const loanDed = activeLoans.filter(l=>l.employeeId===emp.id)
        .reduce((s,l)=>s+(l.currency==='USD'?l.installmentAmount:(currentRate>0?l.installmentAmount/currentRate:0)),0);

      const empTimeEntries = pendingTimeEntries.filter(t => t.employeeId === emp.id);
      const overtimeUSD = empTimeEntries.filter(t => t.type === 'overtime').reduce((s, t) => s + (t.amountUSD || 0), 0);
      const absenceDeductionUSD = Math.abs(empTimeEntries.filter(t => t.type !== 'overtime').reduce((s, t) => s + (t.amountUSD || 0), 0));

      const grossUSD   = (emp.salaryUSD||0)+(emp.bonusUSD||0)+overtimeUSD;
      const grossBs    = (emp.salaryBs||0)+(emp.bonusBs||0);
      const totalDed   = netVDedUSD+ivssUSD+paroUSD+loanDed+absenceDeductionUSD;
      const pSal       = periodSal(emp,'USD');
      return {
        emp, grossUSD, grossBs,
        voucherDedUSD:netVDedUSD, voucherDedBs:vDedBs,
        ivssUSD, paroUSD, loanDedUSD:loanDed,
        overtimeUSD, absenceDeductionUSD,
        totalDedUSD:totalDed,
        netUSD:Math.max(0,grossUSD-totalDed),
        netBs:Math.max(0,grossBs-vDedBs),
        vCount:ev.length,
        isOverdraft:emp.salaryUSD>0 && netVDedUSD>pSal,
      };
    });
  },[employees,currentPeriodVouchers,visibleAbonos,activeLoans,pendingTimeEntries,freqFilter,currentRate]);

  const nominaTotals = useMemo(()=>({
    grossUSD:nominaRows.reduce((s,n)=>s+n.grossUSD,0),
    grossBs: nominaRows.reduce((s,n)=>s+n.grossBs,0),
    dedUSD:  nominaRows.reduce((s,n)=>s+n.totalDedUSD,0),
    netUSD:  nominaRows.reduce((s,n)=>s+n.netUSD,0),
    netBs:   nominaRows.reduce((s,n)=>s+n.netBs,0),
  }),[nominaRows]);

  const overdraftList = useMemo(()=>employees.filter(emp=>{
    const pv = currentPeriodVouchers.filter(v=>v.employeeId===emp.id).reduce((s,v)=>s+(v.currency==='USD'?v.amount:(v.amountUSD||0)),0);
    return emp.salaryUSD>0 && pv>periodSal(emp,'USD');
  }),[employees,currentPeriodVouchers]);

  const loansTotal = useMemo(()=>activeLoans.reduce((s,l)=>{
    const remaining = (l.totalInstallments - l.paidInstallments) * l.installmentAmount;
    return s + (l.currency==='USD' ? remaining : (currentRate>0 ? remaining/currentRate : 0));
  },0),[activeLoans,currentRate]);

  const freqAlerts = useMemo(()=>{
    const today = new Date();
    const dow = today.getDay(); // 0=Sun..6=Sat
    const dom = today.getDate();
    const lastDay = new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
    const active = employees.filter(e=>e.status==='Activo');
    const results: { freq: string; label: string; count: number; due: boolean; dueLabel: string }[] = [];
    const freqs = ['semanal','quincenal','mensual'] as const;
    for(const f of freqs){
      const count = active.filter(e=>e.payFrequency===f).length;
      if(!count) continue;
      let due = false; let dueLabel = '';
      if(f==='semanal' && (dow===4||dow===5)){
        due=true; dueLabel=dow===4?'Mañana toca pagar':'Hoy toca pagar';
      } else if(f==='quincenal' && (dom===14||dom===15||dom===lastDay-1||dom===lastDay)){
        due=true; dueLabel=(dom===14||dom===lastDay-1)?'Mañana toca pagar':'Hoy toca pagar';
      } else if(f==='mensual' && (dom===lastDay-1||dom===lastDay)){
        due=true; dueLabel=dom===lastDay-1?'Mañana toca pagar':'Hoy toca pagar';
      }
      results.push({ freq:f, label:FREQ_LABEL[f], count, due, dueLabel });
    }
    return results;
  },[employees]);

  const dueAlerts = useMemo(()=>freqAlerts.filter(a=>a.due),[freqAlerts]);

  const filteredEmps = useMemo(()=>employees.filter(e=>{
    if(deptFilter!=='all'&&e.department!==deptFilter) return false;
    if(statusFilter!=='all'&&e.status!==statusFilter) return false;
    if(search && !e.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }),[employees,deptFilter,statusFilter,search]);

  const depts = useMemo(()=>['all',...Array.from(new Set(employees.map(e=>e.department).filter(Boolean)))]
  ,[employees]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault(); if(!bid) return;
    setSaving(true);
    try {
      if(editId) {
        const prev = employees.find(x=>x.id===editId);
        const salaryChanged = prev && (
          prev.salaryUSD!==empForm.salaryUSD || prev.bonusUSD!==empForm.bonusUSD ||
          prev.salaryBs!==empForm.salaryBs  || prev.bonusBs!==empForm.bonusBs
        );
        if(salaryChanged && prev) {
          await addDoc(collection(db,`businesses/${bid}/employees/${editId}/salary_history`),{
            previousSalaryUSD:prev.salaryUSD, previousBonusUSD:prev.bonusUSD,
            previousSalaryBs:prev.salaryBs,  previousBonusBs:prev.bonusBs,
            newSalaryUSD:empForm.salaryUSD,   newBonusUSD:empForm.bonusUSD,
            newSalaryBs:empForm.salaryBs,     newBonusBs:empForm.bonusBs,
            changedAt:serverTimestamp(),
            changedBy:userProfile?.fullName||userProfile?.email||'Sistema',
          });
        }
        await updateDoc(doc(db,`businesses/${bid}/employees`,editId),{...empForm,updatedAt:serverTimestamp()});
        toast.success(salaryChanged ? 'Empleado actualizado · historial salarial guardado' : 'Empleado actualizado');
        if(fichaEmp?.id===editId) setFichaEmp({id:editId,...empForm});
      } else {
        await addDoc(collection(db,`businesses/${bid}/employees`),{...empForm,createdAt:serverTimestamp()});
        toast.success('Empleado registrado');
      }
      setEmpModal(false);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleAddVoucher = useCallback(async (v: any) => {
    if(!bid) return;
    try {
      // Remove undefined values — Firestore rejects them
      const clean: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) { if (val !== undefined) clean[k] = val; }
      await addDoc(collection(db,`businesses/${bid}/vouchers`),{
        ...clean,
        registeredBy: userProfile?.uid || '',
        registeredByName: userProfile?.fullName || userProfile?.email || 'Usuario',
        createdAt: serverTimestamp(),
      });
      toast.success(`Vale registrado — ${v.employeeName}`);
    } catch (err: any) {
      toast.error(err?.code === 'permission-denied' ? 'Sin permisos para registrar vales' : `Error: ${err?.message || 'intenta de nuevo'}`);
      throw err;
    }
  },[bid,toast,userProfile]);

  const handleAddLoan = useCallback(async (l: any) => {
    if(!bid) return;
    await addDoc(collection(db,`businesses/${bid}/loans`),{...l,createdAt:serverTimestamp()});
    toast.success('Préstamo registrado');
  },[bid,toast]);

  const handleQuickVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!bid||!qv.empId||!qv.amount) return;
    setSaving(true);
    const emp = employees.find(x=>x.id===qv.empId);
    const amt = Number(qv.amount);
    // D: BCV employees → lookup BCV rate from exchange_rates_history for that date
    //    Tasa Interna employees → lookup from voucher_rates (getRateForDate)
    const isBcvEmp = emp?.paymentCurrency === 'BS';
    const rateForDate = qv.currency==='BS' ? (isBcvEmp ? getBcvRateForDate(qv.date) : getRateForDate(qv.date)) : 0;
    try {
      await handleAddVoucher({
        employeeId:qv.empId, employeeName:emp?.fullName||'',
        amount:amt, currency:qv.currency,
        amountUSD:qv.currency==='USD'?amt:(rateForDate>0?amt/rateForDate:0),
        ...(qv.currency==='BS' && rateForDate > 0 ? { rateUsed: rateForDate } : {}),
        reason:qv.reason, status:'PENDIENTE',
        voucherDate: qv.date,
        ...(qv.defer ? { deferToNextPeriod: true } : {}),
      });
      // I: Only reset empId and amount — keep date, currency, reason
      setQv(f=>({...f, empId:'', amount:'', defer: false}));
      setTimeout(()=>amtRef.current?.focus(),100);
    } catch { /* error ya mostrado por handleAddVoucher */ }
    finally { setSaving(false); }
  };

  // ── Time Entry (overtime / absence / missing day) ──────────────────────
  const handleAddTimeEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bid || !te.empId) return;
    const emp = employees.find(x => x.id === te.empId);
    if (!emp) return;

    const hours = te.type !== 'missing_day' ? Number(te.hours) : 0;
    const days = te.type === 'missing_day' ? Number(te.days) : 0;
    if (te.type === 'missing_day' && !days) return;
    if (te.type !== 'missing_day' && !hours) return;

    setSaving(true);
    try {
      // Calculate USD amount — overtime adds, absence/missing subtracts
      const dailySalary = (emp.salaryUSD || 0) / 30;
      const hourlyRate = dailySalary / 8;
      let amountUSD = 0;
      if (te.type === 'overtime') amountUSD = hours * hourlyRate * 1.5; // 1.5x overtime rate
      else if (te.type === 'absence') amountUSD = -(hours * hourlyRate);
      else if (te.type === 'missing_day') amountUSD = -(days * dailySalary);

      await addDoc(collection(db, `businesses/${bid}/time_entries`), {
        employeeId: te.empId,
        employeeName: emp.fullName || '',
        type: te.type,
        hours: hours || null,
        days: days || null,
        date: te.date,
        reason: te.reason || (te.type === 'overtime' ? 'Horas extras' : te.type === 'absence' ? 'Horas ausentes' : 'Día faltante'),
        amountUSD: Math.round(amountUSD * 100) / 100,
        status: 'PENDIENTE',
        registeredBy: userProfile?.uid || '',
        registeredByName: userProfile?.fullName || userProfile?.email || 'Usuario',
        createdAt: serverTimestamp(),
      });
      logAudit(bid, userProfile?.uid || '', 'CREAR', 'TIME_ENTRY',
        `${te.type === 'overtime' ? 'Horas extras' : te.type === 'absence' ? 'Horas ausentes' : 'Día faltante'}: ${emp.fullName} — ${te.type === 'missing_day' ? `${days} día(s)` : `${hours}h`}`);
      toast.success(`Registro de ${te.type === 'overtime' ? 'horas extras' : te.type === 'absence' ? 'ausencia' : 'día faltante'} guardado`);
      setTe(f => ({ ...f, empId: '', hours: '', days: '', reason: '', date: new Date().toISOString().slice(0, 10) }));
    } catch (err: any) {
      toast.error(err?.code === 'permission-denied' ? 'Sin permisos para registrar.' : `Error: ${err?.message || 'intenta de nuevo'}`);
    } finally { setSaving(false); }
  };

  const handleCorrectVoucher = async () => {
    if(!correcting||!bid) return;
    const {v, newAmt, newDate, newCurrency, note} = correcting;
    const newAmount = Number(newAmt);
    if(!newAmount||newAmount<=0) return;
    setSaving(true);
    try {
      await updateDoc(doc(db,`businesses/${bid}/vouchers`,v.id),{
        status:'CORREGIDO', correctedAt:serverTimestamp(),
        correctionNote:note, correctedToAmount:newAmount,
      });
      const emp = employees.find(x=>x.id===v.employeeId);
      const isBcvEmp = emp?.paymentCurrency === 'BS';
      const _corrDate = newDate || v.voucherDate || new Date().toISOString().slice(0,10);
      const rateForDate = newCurrency==='BS'
        ? (isBcvEmp ? getBcvRateForDate(_corrDate) : getRateForDate(_corrDate))
        : 0;
      await addDoc(collection(db,`businesses/${bid}/vouchers`),{
        employeeId:v.employeeId, employeeName:v.employeeName,
        amount:newAmount, currency:newCurrency,
        amountUSD:newCurrency==='USD'?newAmount:(rateForDate>0?newAmount/rateForDate:0),
        ...(newCurrency==='BS' && rateForDate > 0 ? { rateUsed: rateForDate } : {}),
        reason:v.reason, status:'PENDIENTE',
        correctedFrom:v.id, originalAmount:v.amount, correctionNote:note,
        voucherDate: newDate || v.voucherDate,
        registeredBy: userProfile?.uid || '',
        registeredByName: userProfile?.fullName || userProfile?.email || 'Usuario',
        createdAt:serverTimestamp(),
      });
      toast.success(`Vale corregido: ${v.currency==='USD'?'$':'Bs '}${fmtHR(v.amount)} → ${newCurrency==='USD'?'$':'Bs '}${fmtHR(newAmount)}`);
      setCorrecting(null);
    } catch { toast.error('Error al corregir el vale'); }
    finally { setSaving(false); }
  };

  const handleCerrarPeriodo = (freq: 'semanal'|'quincenal'|'mensual') => {
    if(!nominaRows.length) return;
    // Filter everything by this frequency
    const freqEmployeeIds = new Set(employees.filter(e=>e.status==='Activo'&&e.payFrequency===freq).map(e=>e.id));
    const freqRows = nominaRows.filter(n=>freqEmployeeIds.has(n.emp.id));
    if(!freqRows.length){ toast.info(`Sin empleados ${FREQ_LABEL[freq]?.toLowerCase()}s activos`); return; }

    // Vouchers: only this frequency's employees, exclude deferred
    const freqVouchers = currentPeriodVouchers.filter(v=>freqEmployeeIds.has(v.employeeId));
    const freqDeferred = pendingVouchers.filter(v=>v.deferToNextPeriod && freqEmployeeIds.has(v.employeeId));
    const freqTimeEntries = pendingTimeEntries.filter(t=>freqEmployeeIds.has(t.employeeId));
    const freqLoans = activeLoans.filter(l=>freqEmployeeIds.has(l.employeeId));
    const freqAbonos = abonos.filter(a=>a.status==='PENDIENTE'&&freqEmployeeIds.has(a.employeeId));

    const freqTotals = {
      grossUSD: freqRows.reduce((s,n)=>s+n.grossUSD,0),
      grossBs:  freqRows.reduce((s,n)=>s+n.grossBs,0),
      dedUSD:   freqRows.reduce((s,n)=>s+n.totalDedUSD,0),
      netUSD:   freqRows.reduce((s,n)=>s+n.netUSD,0),
      netBs:    freqRows.reduce((s,n)=>s+n.netBs,0),
    };
    const vTotalUSD = freqVouchers.reduce((s,v)=>s+(v.currency==='USD'?v.amount:(v.amountUSD||0)),0);
    const vTotalBs  = freqVouchers.filter(v=>v.currency==='BS').reduce((s,v)=>s+v.amount,0);

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    setConfirm({
      msg:`¿Cerrar Período ${FREQ_LABEL[freq]}?`,
      detail:`${freqRows.length} empleados · ${freqVouchers.length} vales · Neto $${fmtHR(freqTotals.netUSD)} USD${freqDeferred.length?` · ${freqDeferred.length} diferidos pasan al próximo`:''}`,
      onConfirm:async()=>{
        setProcLoading(true);
        try {
          // 1. Create payroll_run record
          const run: Omit<PayrollRun,'id'> = {
            period, frequency:freq, processedAt:serverTimestamp(),
            totalGrossUSD:freqTotals.grossUSD, totalGrossBs:freqTotals.grossBs,
            totalDedUSD:freqTotals.dedUSD, totalNetUSD:freqTotals.netUSD, totalNetBs:freqTotals.netBs,
            employeeCount:freqRows.length,
            details:freqRows.map(n=>({
              employeeId:n.emp.id, name:n.emp.fullName, department:n.emp.department,
              grossUSD:n.grossUSD, grossBs:n.grossBs,
              voucherDedUSD:n.voucherDedUSD, ivssUSD:n.ivssUSD, paroUSD:n.paroUSD, loanDedUSD:n.loanDedUSD,
              overtimeUSD:n.overtimeUSD, absenceDeductionUSD:n.absenceDeductionUSD,
              totalDedUSD:n.totalDedUSD, netUSD:n.netUSD, netBs:n.netBs,
              settledVouchers:freqVouchers.filter(v=>v.employeeId===n.emp.id)
                .map(v=>({reason:v.reason,amount:v.amount,currency:v.currency,amountUSD:v.amountUSD})),
            })),
          };
          await addDoc(collection(db,`businesses/${bid}/payroll_runs`),run);

          // 2. Settle vouchers (only this frequency, only non-deferred)
          if(freqVouchers.length){
            const batch=writeBatch(db);
            freqVouchers.forEach(v=>batch.update(doc(db,`businesses/${bid}/vouchers`,v.id),{status:'DESCONTADO',settledAt:serverTimestamp()}));
            await batch.commit();
          }

          // 3. Clear deferToNextPeriod flag so deferred appear next period
          if(freqDeferred.length){
            const dBatch=writeBatch(db);
            freqDeferred.forEach(v=>dBatch.update(doc(db,`businesses/${bid}/vouchers`,v.id),{deferToNextPeriod:false}));
            await dBatch.commit();
          }

          // 4. Settle time entries (only this frequency)
          if(freqTimeEntries.length){
            const teBatch=writeBatch(db);
            freqTimeEntries.forEach(t=>teBatch.update(doc(db,`businesses/${bid}/time_entries`,t.id),{status:'APLICADO',settledAt:serverTimestamp()}));
            await teBatch.commit();
          }

          // 5. Advance loan installments (only this frequency)
          for(const loan of freqLoans){
            const paid=loan.paidInstallments+1;
            await updateDoc(doc(db,`businesses/${bid}/loans`,loan.id),{
              paidInstallments:paid,
              status:paid>=loan.totalInstallments?'PAGADO':'ACTIVO',
            });
          }

          // 6. Settle abonos (only this frequency)
          if(freqAbonos.length){
            const aBatch=writeBatch(db);
            freqAbonos.forEach(a=>aBatch.update(doc(db,`businesses/${bid}/abonos`,a.id),{status:'APLICADO',settledAt:serverTimestamp()}));
            await aBatch.commit();
          }

          // 7. Persist corte record for historial
          await addDoc(collection(db,`businesses/${bid}/cortes`),{
            executedAt: serverTimestamp(),
            executedBy: userProfile?.uid || '',
            executedByName: userProfile?.fullName || userProfile?.email || 'Usuario',
            frequency: freq,
            totalUSD: vTotalUSD,
            totalBs: vTotalBs,
            totalNetUSD: freqTotals.netUSD,
            employeeCount: freqRows.length,
            voucherCount: freqVouchers.length,
            deferredCount: freqDeferred.length,
            vouchers: freqVouchers.map(v=>({
              id:v.id, employeeId:v.employeeId, employeeName:v.employeeName,
              amount:v.amount, currency:v.currency, amountUSD:v.amountUSD||0,
              reason:v.reason, voucherDate:v.voucherDate||'',
            })),
          });

          toast.success(`Período ${FREQ_LABEL[freq]} cerrado — ${freqRows.length} empleados · revisa el Historial${freqDeferred.length?` · ${freqDeferred.length} vales pasan al próximo período`:''}`);
        } catch { toast.error('Error al cerrar el período'); }
        finally { setProcLoading(false); }
      },
    });
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!rateInput||!bid) return;
    setSavingRate(true);
    try {
      await addDoc(collection(db,`businesses/${bid}/voucher_rates`),{
        rate:Number(rateInput),notes:rateNotes,
        effectiveDate:rateDate,
        createdBy:userProfile?.fullName||userProfile?.email||'Usuario',
        createdAt:serverTimestamp(),
      });
      setRateInput('');setRateNotes('');setRateDate(new Date().toISOString().slice(0,10));
      toast.success('Tasa actualizada');
    } catch { toast.error('Error al guardar la tasa'); }
    finally { setSavingRate(false); }
  };

  // F: Edit existing rate entry
  const handleEditRate = async () => {
    if (!editingRate || !bid) return;
    const newRate = Number(editingRate.rate);
    if (!newRate || newRate <= 0) return;
    setSavingRate(true);
    try {
      await updateDoc(doc(db, `businesses/${bid}/voucher_rates`, editingRate.id), {
        rate: newRate,
        effectiveDate: editingRate.effectiveDate,
        notes: editingRate.notes,
      });
      setEditingRate(null);
      toast.success('Tasa actualizada');
    } catch { toast.error('Error al editar la tasa'); }
    finally { setSavingRate(false); }
  };

  // L: Register abono
  const handleAddAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bid || !qa.empId || !qa.amount) return;
    setSavingAbono(true);
    const emp = employees.find(x => x.id === qa.empId);
    const amt = Number(qa.amount);
    const isBcvEmp = emp?.paymentCurrency === 'BS';
    const rate = qa.currency === 'BS' ? (isBcvEmp ? getBcvRateForDate(qa.date || new Date().toISOString().slice(0,10)) : currentRate) : 0;
    try {
      await addDoc(collection(db, `businesses/${bid}/abonos`), {
        employeeId: qa.empId, employeeName: emp?.fullName || '',
        amount: amt, currency: qa.currency,
        amountUSD: qa.currency === 'USD' ? amt : (rate > 0 ? amt / rate : 0),
        ...(qa.currency === 'BS' && rate > 0 ? { rateUsed: rate } : {}),
        concept: qa.concept, date: qa.date, status: 'PENDIENTE',
        registeredBy: userProfile?.uid || '',
        registeredByName: userProfile?.fullName || userProfile?.email || 'Usuario',
        createdAt: serverTimestamp(),
      });
      setQa(f => ({ ...f, empId: '', amount: '' }));
      toast.success(`Abono registrado — ${emp?.fullName}`);
    } catch (err: any) {
      toast.error(err?.code === 'permission-denied' ? 'Sin permisos' : `Error: ${err?.message}`);
    } finally { setSavingAbono(false); }
  };

  const handleDeleteEmployee = (emp:Employee) => setConfirm({
    msg:`¿Eliminar a ${emp.fullName}?`, detail:'Esta acción no se puede deshacer.',
    onConfirm:async()=>{
      await deleteDoc(doc(db,`businesses/${bid}/employees`,emp.id));
      toast.success('Empleado eliminado');
      if(fichaEmp?.id===emp.id) setFichaEmp(null);
    },
  });

  const openNew  = () => {setEditId(null);setEmpForm(EMPTY_EMP);setEmpModal(true);};
  const openEdit = (e:Employee) => {setEditId(e.id);setEmpForm(e);setEmpModal(true);};


  const tabCls = (t:SubTab) => `px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
    activeTab===t
      ?'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
      :'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.06]'}`;
  const inp = 'w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none';

  if(loading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070b14]"><Loader2 className="animate-spin text-indigo-500" size={36}/></div>;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#070b14] p-4 sm:p-5 font-inter">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Capital Humano</h1>
            <p className="text-slate-400 dark:text-white/40 font-medium text-[10px] mt-2 uppercase tracking-[0.2em]">Nómina · Vales · Préstamos · Tasas</p>
          </div>
          <div className="flex gap-1.5 p-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-x-auto">
            {(['directory','vouchers','nomina','tasas','historial'] as SubTab[]).map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)} className={`${tabCls(t)} whitespace-nowrap shrink-0`}>
                {t==='directory'?'Directorio':t==='vouchers'?'Vales':t==='nomina'?'Nómina':t==='tasas'?'Tasa Interna':'Historial'}
              </button>
            ))}
          </div>
        </div>

        {/* Isolation mode banner */}
        {isIndividual && (
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06]">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
              <Eye size={15} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Modo Individual Activo</p>
              <p className="text-[10px] text-indigo-300/60 mt-0.5">Solo ves tus propios registros.</p>
            </div>
          </div>
        )}

        {/* ── KPI DASHBOARD ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Empleados con badges de frecuencia */}
          <div className="p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
                <Users size={18} className="text-indigo-600 dark:text-indigo-400"/>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em]">Plantilla Activa</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{employees.filter(e=>e.status==='Activo').length}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {freqAlerts.map(a=>{
                const fc = FREQ_COLOR[a.freq] || FREQ_COLOR.quincenal;
                return (
                  <span key={a.freq} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black ${fc.bg} ${fc.text} border ${fc.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${fc.dot}`}/>{a.count} {a.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Card 2: Vales pendientes */}
          <div className="p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center">
                <Ticket size={18} className="text-rose-600 dark:text-rose-400"/>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em]">Vales Pendientes</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">${fmtHR(pendingTotalUSD)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
              <span className="font-bold text-slate-500 dark:text-white/40">
                <strong className="text-slate-700 dark:text-slate-300">{pendingVouchers.length}</strong> vales
              </span>
              {pendingTotalBs > 0 && (
                <span className="font-bold text-sky-600 dark:text-sky-400">Bs {fmtHR(pendingTotalBs)}</span>
              )}
              {overdraftList.length > 0 && (
                <span className="font-bold text-rose-600 dark:text-rose-400">{overdraftList.length} sobregirados</span>
              )}
            </div>
          </div>

          {/* Card 3: Préstamos activos */}
          <div className="p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
                <CreditCard size={18} className="text-amber-600 dark:text-amber-400"/>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.18em]">Préstamos Activos</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{activeLoans.length}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
              {loansTotal > 0 && (
                <span className="font-bold text-slate-500 dark:text-white/40">
                  Saldo: <strong className="text-amber-600 dark:text-amber-400">${fmtHR(loansTotal)}</strong>
                </span>
              )}
              <span className="font-bold text-slate-400 dark:text-white/30">
                Tasa: Bs {currentRate>0?fmtHR(currentRate):'—'}
              </span>
            </div>
          </div>
        </div>

        {/* ── FREQUENCY ALERT BANNER ─────────────────────────────────── */}
        {dueAlerts.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {dueAlerts.map(a=>{
              const fc = FREQ_COLOR[a.freq] || FREQ_COLOR.quincenal;
              return (
                <div key={a.freq} className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border ${fc.border} ${fc.bg} flex-1 min-w-[260px]`}>
                  <div className={`h-9 w-9 rounded-xl ${fc.bg} flex items-center justify-center shrink-0`}>
                    <Clock size={16} className={fc.text}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${fc.text}`}>
                      {a.dueLabel} a {a.count} empleado{a.count>1?'s':''} {a.label.toLowerCase()}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-white/30 mt-0.5">
                      Ve a Nómina → filtra por {a.label} → Cerrar Período
                    </p>
                  </div>
                  <button onClick={()=>{setFreqFilter(a.freq);setActiveTab('nomina');}} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${fc.text} bg-white/60 dark:bg-white/[0.08] hover:bg-white dark:hover:bg-white/[0.15] border ${fc.border} transition-all`}>
                    Ir a Nómina
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Overdraft banner */}
        {overdraftList.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-500/[0.08] border border-rose-200 dark:border-rose-500/25 rounded-2xl">
            <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">Empleados Sobregirados</p>
              <p className="text-[11px] text-rose-600/70 dark:text-rose-400/60 mt-0.5">{overdraftList.map(e=>e.fullName).join(', ')}</p>
            </div>
          </div>
        )}

        {/* CONTENT */}
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg overflow-hidden">

          {/* ── DIRECTORY ─────────────────────────────────────────────────── */}
          {activeTab==='directory' && (
            <>
              <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex-1 min-w-0">Directorio</h3>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..."
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-36"/>
                <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none">
                  {depts.map(d=><option key={d} value={d}>{d==='all'?'Todos los depto.':d}</option>)}
                </select>
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none">
                  {['all','Activo','Inactivo','Vacaciones','Suspendido'].map(s=><option key={s} value={s}>{s==='all'?'Todos':s}</option>)}
                </select>
                <button onClick={openNew}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25">
                  <UserPlus size={13}/> Nuevo
                </button>
              </div>
              {filteredEmps.length===0 ? (
                <div className="py-16 text-center"><Users size={48} className="mx-auto text-slate-200 dark:text-white/10 mb-3"/><p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin empleados</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                        <th className="px-2.5 py-2 sm:px-5 sm:py-3.5">Empleado</th><th className="px-2.5 py-2 sm:px-5 sm:py-3.5">Depto.</th>
                        <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">Estado</th><th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">Frecuencia</th>
                        <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">Salario</th><th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">Vales Pend.</th>
                        <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {filteredEmps.map(e=>{
                        const ePend = pendingVouchers.filter(v=>v.employeeId===e.id).reduce((s,v)=>s+(v.currency==='USD'?v.amount:(v.amountUSD||0)),0);
                        const ePendBs = pendingVouchers.filter(v=>v.employeeId===e.id&&v.currency==='BS').reduce((s,v)=>s+v.amount,0);
                        const isOv  = overdraftList.some(o=>o.id===e.id);
                        const eLoans = loans.filter(l=>l.employeeId===e.id&&l.status==='ACTIVO');
                        const eLoanRemaining = eLoans.reduce((s,l)=>s+(l.totalInstallments-l.paidInstallments)*l.installmentAmount,0);
                        const pSal = periodSal(e,'USD');
                        const pSalBs = periodSal(e,'BS');
                        const eVoucherCount = pendingVouchers.filter(v=>v.employeeId===e.id).length;
                        return (
                          <tr key={e.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer" onClick={()=>setFichaEmp(e)}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-sm shrink-0">
                                  {e.fullName[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                    {e.fullName}{isOv&&<AlertTriangle size={12} className="text-rose-500"/>}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest">{e.role} · {e.cedula||'S/C'}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-black">
                                      Neto: ${fmtHR(Math.max(0,pSal-ePend))} {pSalBs>0?`/ Bs ${fmtHR(Math.max(0,pSalBs-ePendBs))}`:''} <span className="text-slate-400 dark:text-white/25 font-bold">({FREQ_LABEL[e.payFrequency]})</span>
                                    </span>
                                    {eLoans.length>0&&(
                                      <span className="text-[8px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase" title={`Restante: $${fmtHR(eLoanRemaining)} en ${eLoans.reduce((s,l)=>s+(l.totalInstallments-l.paidInstallments),0)} cuotas`}>
                                        Préstamo · ${fmtHR(eLoanRemaining)}
                                      </span>
                                    )}
                                    {eVoucherCount>0&&(
                                      <span className="text-[8px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded font-black uppercase">
                                        {eVoucherCount} vale{eVoucherCount>1?'s':''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5"><span className="px-2.5 py-1 bg-slate-50 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-lg text-[9px] font-black uppercase border border-slate-100 dark:border-white/[0.08]">{e.department||'—'}</span></td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${e.status==='Activo'?'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30':e.status==='Vacaciones'?'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/30':'bg-slate-100 dark:bg-white/[0.07] text-slate-400 border-slate-200 dark:border-white/10'}`}>
                                <Circle size={5} fill="currentColor"/> {e.status}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">{FREQ_LABEL[e.payFrequency]}</td>
                            <td className="px-5 py-3.5 text-center">
                              {e.salaryUSD>0&&<p className="font-black text-slate-700 dark:text-slate-300 text-sm">${fmtHR(e.salaryUSD)}</p>}
                              {e.salaryBs>0 &&<p className="font-black text-sky-600 dark:text-sky-400 text-xs">Bs {fmtHR(e.salaryBs)}</p>}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {ePend>0?<span className={`font-black text-sm ${isOv?'text-rose-600 dark:text-rose-400':'text-orange-600 dark:text-orange-400'}`}>-${fmtHR(ePend)}</span>:<span className="text-slate-300 dark:text-white/20">—</span>}
                            </td>
                            <td className="px-5 py-3.5 text-right" onClick={ev=>ev.stopPropagation()}>
                              <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={()=>setFichaEmp(e)} className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-all" title="Ver ficha"><FileText size={13}/></button>
                                <button onClick={()=>openEdit(e)} className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all"><Pencil size={13}/></button>
                                <button onClick={()=>handleDeleteEmployee(e)} className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-500 dark:text-rose-400 hover:bg-rose-100 transition-all"><Trash2 size={13}/></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── VOUCHERS ──────────────────────────────────────────────────── */}
          {activeTab==='vouchers' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-4">
                  <Ticket size={18} className="text-indigo-500"/>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Control de Vales</h3>
                  {currentRate>0&&<span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase rounded-full border border-indigo-100 dark:border-indigo-500/25">Tasa: Bs {fmtHR(currentRate)}</span>}
                </div>
                {/* Hint banner */}
                <div className="flex items-start gap-3 p-3 mb-3 bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/25 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5"/>
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 flex-1">
                    <strong>Recuerda:</strong> Verifica la fecha del vale antes de registrar. El sistema usa la tasa vigente de esa fecha.
                  </p>
                </div>
                {/* Quick form */}
                <form onSubmit={handleQuickVoucher} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 bg-white dark:bg-[#0d1424] p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-md items-end">
                  {/* G: Custom colored employee dropdown */}
                  <div ref={empDropRef} className="relative">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Empleado</label>
                    <button type="button"onClick={()=>{setEmpDropOpen(o=>!o);setEmpSearch('');}}
                      className={`w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border rounded-xl text-xs font-bold dark:text-white outline-none text-left flex items-center justify-between gap-1 transition-all ${empDropOpen?'border-indigo-500 ring-2 ring-indigo-500/20':'border-slate-200 dark:border-white/[0.08]'}`}>
                      {qv.empId ? (()=>{
                        const e = employees.find(x=>x.id===qv.empId);
                        return <span className={`font-black ${e?.paymentCurrency==='USD'?'text-emerald-700 dark:text-emerald-400':'text-sky-700 dark:text-sky-400'}`}>{e?.fullName}</span>;
                      })() : <span className="text-slate-400 dark:text-white/30">Seleccionar...</span>}
                      <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${empDropOpen?'rotate-180':''}`}/>
                    </button>
                    {empDropOpen && (
                      <div className="absolute z-30 top-full mt-1 left-0 w-full min-w-[320px] bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
                          <input autoFocus value={empSearch} onChange={e=>setEmpSearch(e.target.value)} placeholder="Buscar empleado..."
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg dark:text-white outline-none"/>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {employees.filter(e=>e.status==='Activo'&&(!empSearch||e.fullName.toLowerCase().includes(empSearch.toLowerCase()))).map(e=>(
                            <button key={e.id} type="button" onClick={()=>{
                              const autoCurrency = e.paymentCurrency === 'BS' ? 'BS' : 'USD';
                              setQv(f=>({...f, empId: e.id, currency: autoCurrency}));
                              setEmpDropOpen(false);
                            }}
                              className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all flex items-center gap-2 ${qv.empId===e.id?'bg-indigo-50 dark:bg-indigo-500/[0.08]':''}`}>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${e.paymentCurrency==='USD'?'bg-emerald-500':'bg-sky-500'}`}/>
                              <span className={`font-bold flex-1 ${e.paymentCurrency==='USD'?'text-emerald-700 dark:text-emerald-400':'text-sky-700 dark:text-sky-400'}`}>{e.fullName}</span>
                              <span className="text-[9px] text-slate-400 dark:text-white/30 uppercase">{e.department}</span>
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${e.paymentCurrency==='USD'?'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20':'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'}`}>
                                {getCurrencyLabel(e.paymentCurrency)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Fecha del Vale</label>
                    <input type="date" required value={qv.date} onChange={e=>setQv(f=>({...f,date:e.target.value}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Moneda</label>
                    <select value={qv.currency} onChange={e=>setQv(f=>({...f,currency:e.target.value as any}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                      {valeMonedaOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">
                      Monto{' '}
                      {qv.currency==='BS'&&qv.date&&(()=>{
                        const selEmp = employees.find(e=>e.id===qv.empId);
                        const isBcv = selEmp?.paymentCurrency==='BS';
                        const rate = isBcv ? getBcvRateForDate(qv.date) : getRateForDate(qv.date);
                        const amt = Number(qv.amount);
                        return <>
                          <span className="text-[8px] text-indigo-400 normal-case">(Tasa: Bs {fmtHR(rate)})</span>
                          {amt > 0 && rate > 0 && <span className="text-emerald-400 text-[9px] ml-1">≈ ${fmtHR(amt / rate)}</span>}
                        </>;
                      })()}
                    </label>
                    <input ref={amtRef} required type="number" step="0.01" value={qv.amount} onChange={e=>setQv(f=>({...f,amount:e.target.value}))}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Concepto</label>
                    <input value={qv.reason} onChange={e=>setQv(f=>({...f,reason:e.target.value}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"/>
                  </div>
                  <div className="flex flex-col gap-2">
                    {/* N: Defer toggle */}
                    <button type="button" onClick={()=>setQv(f=>({...f,defer:!f.defer}))}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${qv.defer?'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400':'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:border-amber-300 hover:text-amber-600'}`}>
                      <span className={`w-2 h-2 rounded-full ${qv.defer?'bg-amber-500':'bg-slate-300 dark:bg-white/20'}`}/>
                      {qv.defer ? 'Próx. corte' : 'Este corte'}
                    </button>
                    <button disabled={saving} className="h-[42px] bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md flex items-center justify-center gap-2 disabled:opacity-50 hover:from-indigo-500 hover:to-violet-500 transition-all">
                      {saving?<Loader2 size={13} className="animate-spin"/>:<><Plus size={13}/>Registrar</>}
                    </button>
                  </div>
                </form>
              </div>
              {qv.empId && (() => {
                const empFilt = employees.find(e => e.id === qv.empId);
                return (
                  <div className="flex items-center justify-between px-5 py-2.5 bg-indigo-500/[0.06] border-t border-indigo-500/[0.12]">
                    <span className="text-xs font-black text-indigo-400">Mostrando vales de: {empFilt?.fullName}</span>
                    <button onClick={() => setQv(f => ({...f, empId: ''}))}
                      className="text-[10px] text-white/30 hover:text-white/60 transition-all px-2 py-1 rounded-lg hover:bg-white/[0.04]">
                      Ver todos ×
                    </button>
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                      <th className="px-5 py-3.5">Fecha</th><th className="px-5 py-3.5">Empleado</th>
                      <th className="px-5 py-3.5 text-center">Moneda</th><th className="px-5 py-3.5 text-right">Monto</th>
                      <th className="px-5 py-3.5 text-right">Tasa</th><th className="px-5 py-3.5 text-right">Equiv. USD</th>
                      <th className="px-5 py-3.5">Concepto</th><th className="px-5 py-3.5 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {visibleVouchers.length===0&&<tr><td colSpan={8} className="px-5 py-16 text-center"><Ticket size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-3"/><p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin vales{isIndividual ? ' (modo individual — solo tus registros)' : ''}</p></td></tr>}
                    {visibleVouchers.slice((valesPage-1)*VALES_PER_PAGE, valesPage*VALES_PER_PAGE).map(v=>(
                      <React.Fragment key={v.id}>
                      <tr className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors ${v.status==='CORREGIDO'?'opacity-50':''}`}>
                        <td className="px-5 py-3 font-mono text-[10px] text-slate-400 dark:text-white/30">{v.voucherDate || (v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString('es-VE') : '—')}</td>
                        <td className="px-5 py-3">
                          <p className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1.5 flex-wrap">
                            {v.employeeName}
                            {v.correctedFrom&&<span className="text-[8px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase">Corrección</span>}
                            {v.deferToNextPeriod&&<span className="text-[8px] bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-violet-700 dark:text-violet-400 px-1.5 py-0.5 rounded font-black uppercase">Próx. corte</span>}
                          </p>
                          {v.registeredByName && <p className="text-[9px] text-slate-400 dark:text-white/25 mt-0.5">por {v.registeredByName}</p>}
                        </td>
                        <td className="px-5 py-3 text-center"><span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${v.currency==='USD'?'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20':'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/20'}`}>{v.currency}</span></td>
                        <td className="px-5 py-3 text-right font-black text-slate-900 dark:text-white">
                          {v.correctedFrom&&v.originalAmount!=null&&<span className="text-[9px] text-slate-400 dark:text-white/25 line-through mr-1">{v.currency==='USD'?'$':'Bs '}{fmtHR(v.originalAmount)}</span>}
                          {v.currency==='USD'?'$':'Bs '}{fmtHR(v.amount)}
                        </td>
                        <td className="px-5 py-3 text-right text-[10px] font-mono text-slate-400 dark:text-white/30">{v.rateUsed?`Bs ${fmtHR(v.rateUsed)}`:'—'}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-700 dark:text-slate-300">{v.amountUSD!=null?'$'+fmtHR(v.amountUSD):v.currency==='USD'?'$'+fmtHR(v.amount):'—'}</td>
                        <td className="px-5 py-3 text-slate-400 dark:text-white/40 italic text-xs">{v.reason}{v.correctionNote&&<span className="block text-[9px] text-amber-500 not-italic">{v.correctionNote}</span>}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${v.status==='PENDIENTE'?'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/30':v.status==='CORREGIDO'?'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/30':'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30'}`}>{v.status}</span>
                            {v.status==='PENDIENTE'&&(
                              <button onClick={()=>setCorrecting({v, newAmt:String(v.amount), newDate: v.voucherDate||new Date().toISOString().slice(0,10), newCurrency: v.currency, note:''})}
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-100 transition-all" title="Corregir vale">
                                <Pencil size={11}/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Inline correction form */}
                      {correcting?.v.id===v.id&&(
                        <tr>
                          <td colSpan={8} className="px-5 py-3 bg-amber-50 dark:bg-amber-500/[0.06] border-l-4 border-amber-400">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                              <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest shrink-0">
                                <RotateCcw size={11}/> Corrección: {v.currency==='USD'?'$':'Bs '}{fmtHR(v.amount)}
                                <ChevronRight size={11}/>
                              </div>
                              <input type="number" step="0.01" min="0.01" placeholder="Nuevo monto"
                                value={correcting.newAmt} onChange={e=>setCorrecting(c=>c?{...c,newAmt:e.target.value}:null)}
                                className="px-3 py-1.5 text-xs font-black bg-white dark:bg-white/[0.08] border border-amber-300 dark:border-amber-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-amber-500 w-28"/>
                              <input type="date" value={correcting.newDate}
                                onChange={e=>setCorrecting(c=>c?{...c,newDate:e.target.value}:null)}
                                className="px-3 py-1.5 text-xs bg-white dark:bg-white/[0.08] border border-amber-300 dark:border-amber-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-amber-500 w-36"/>
                              <select value={correcting.newCurrency}
                                onChange={e=>setCorrecting(c=>c?{...c,newCurrency:e.target.value as 'USD'|'BS'}:null)}
                                className="px-3 py-1.5 text-xs bg-white dark:bg-white/[0.08] border border-amber-300 dark:border-amber-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-amber-500">
                                <option value="USD">USD</option><option value="BS">Bs</option>
                              </select>
                              <input placeholder="Motivo (opcional)"
                                value={correcting.note} onChange={e=>setCorrecting(c=>c?{...c,note:e.target.value}:null)}
                                className="px-3 py-1.5 text-xs bg-white dark:bg-white/[0.08] border border-amber-300 dark:border-amber-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-amber-500 flex-1 min-w-0"/>
                              <div className="flex gap-1.5 shrink-0">
                                <button onClick={handleCorrectVoucher} disabled={saving}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-1">
                                  {saving?<Loader2 size={11} className="animate-spin"/>:<Save size={11}/>} Guardar
                                </button>
                                <button onClick={()=>setCorrecting(null)} className="px-3 py-1.5 border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 rounded-lg font-black text-[10px] uppercase hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                                  <X size={11}/>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {visibleVouchers.length > VALES_PER_PAGE && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-white/[0.06]">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-white/30">
                    {(valesPage-1)*VALES_PER_PAGE+1}–{Math.min(valesPage*VALES_PER_PAGE, visibleVouchers.length)} de {visibleVouchers.length}
                  </p>
                  <div className="flex items-center gap-1">
                    {Array.from({length: Math.ceil(visibleVouchers.length / VALES_PER_PAGE)}, (_,i) => i+1).map(p => (
                      <button key={p} onClick={() => setValesPage(p)}
                        className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[10px] font-black transition-all ${
                          p === valesPage
                            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                            : 'text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                        }`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ABONOS (L) ── */}
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowLeftRight size={16} className="text-emerald-500"/>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Abonos a Cuenta</h3>
                  <span className="text-[9px] text-slate-400 dark:text-white/30 font-normal">Pagos del empleado que reducen su saldo de vales</span>
                </div>
                <form onSubmit={handleAddAbono} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 bg-white dark:bg-[#0d1424] p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-md items-end">
                  {/* Abono employee dropdown */}
                  <div ref={abonoDropRef} className="relative">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Empleado</label>
                    <button type="button" onClick={()=>{setAbonoDropOpen(o=>!o);setAbonoSearch('');}}
                      className={`w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border rounded-xl text-xs font-bold dark:text-white outline-none text-left flex items-center justify-between gap-1 transition-all ${abonoDropOpen?'border-emerald-500 ring-2 ring-emerald-500/20':'border-slate-200 dark:border-white/[0.08]'}`}>
                      {qa.empId ? (()=>{
                        const e = employees.find(x=>x.id===qa.empId);
                        return <span className="font-black text-emerald-700 dark:text-emerald-400">{e?.fullName}</span>;
                      })() : <span className="text-slate-400 dark:text-white/30">Seleccionar...</span>}
                      <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${abonoDropOpen?'rotate-180':''}`}/>
                    </button>
                    {abonoDropOpen && (
                      <div className="absolute z-30 top-full mt-1 left-0 w-full min-w-[320px] bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
                          <input autoFocus value={abonoSearch} onChange={e=>setAbonoSearch(e.target.value)} placeholder="Buscar..."
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg dark:text-white outline-none"/>
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {employees.filter(e=>e.status==='Activo'&&(!abonoSearch||e.fullName.toLowerCase().includes(abonoSearch.toLowerCase()))).map(e=>(
                            <button key={e.id} type="button" onClick={()=>{setQa(f=>({...f,empId:e.id}));setAbonoDropOpen(false);}}
                              className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all flex items-center gap-2 ${qa.empId===e.id?'bg-emerald-50 dark:bg-emerald-500/[0.08]':''}`}>
                              <span className="font-bold text-slate-800 dark:text-white flex-1">{e.fullName}</span>
                              <span className="text-[9px] text-slate-400 dark:text-white/30 uppercase">{e.department}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Fecha</label>
                    <input type="date" required value={qa.date} onChange={e=>setQa(f=>({...f,date:e.target.value}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Monto</label>
                    <div className="flex gap-1.5">
                      <select value={qa.currency} onChange={e=>setQa(f=>({...f,currency:e.target.value as any}))}
                        className="px-2 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="USD">USD</option><option value="BS">Bs</option>
                      </select>
                      <input required type="number" step="0.01" min="0.01" value={qa.amount} onChange={e=>setQa(f=>({...f,amount:e.target.value}))}
                        placeholder="0.00" className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"/>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Concepto</label>
                    <input value={qa.concept} onChange={e=>setQa(f=>({...f,concept:e.target.value}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <button disabled={savingAbono||!qa.empId} className="h-[42px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md flex items-center justify-center gap-2 disabled:opacity-50 hover:from-emerald-500 hover:to-teal-500 transition-all">
                    {savingAbono?<Loader2 size={13} className="animate-spin"/>:<><Plus size={13}/>Registrar Abono</>}
                  </button>
                </form>
                {/* Abonos table */}
                {visibleAbonos.filter(a=>a.status==='PENDIENTE').length>0&&(
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05]">
                        <th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Empleado</th>
                        <th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2">Concepto</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                        {visibleAbonos.filter(a=>a.status==='PENDIENTE').map(a=>(
                          <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                            <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400 dark:text-white/30">{a.date}</td>
                            <td className="px-4 py-2.5 font-black text-slate-900 dark:text-white text-sm">{a.employeeName}</td>
                            <td className="px-4 py-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">+{a.currency==='USD'?'$':'Bs '}{fmtHR(a.amount)}</td>
                            <td className="px-4 py-2.5 text-slate-400 dark:text-white/40 italic text-xs">{a.concept}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── TIME ENTRIES (Horas Extras / Ausencias / Días Faltantes) ── */}
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={18} className="text-violet-500"/>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Horas Extras, Ausencias y Días Faltantes</h3>
                </div>
                {/* Hint banner */}
                <div className="flex items-start gap-3 p-3 mb-3 bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/25 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5"/>
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 flex-1">
                    <strong>Recuerda:</strong> Verifica el tipo y la fecha antes de registrar. Las ausencias y días faltantes restan del pago del período.
                  </p>
                </div>
                <form onSubmit={handleAddTimeEntry} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 bg-white dark:bg-[#0d1424] p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-md items-end">
                  {/* G: Custom colored employee dropdown */}
                  <div ref={teDropRef} className="relative">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Empleado</label>
                    <button type="button"onClick={()=>{setTeDropOpen(o=>!o);setTeSearch('');}}
                      className={`w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border rounded-xl text-xs font-bold dark:text-white outline-none text-left flex items-center justify-between gap-1 transition-all ${teDropOpen?'border-violet-500 ring-2 ring-violet-500/20':'border-slate-200 dark:border-white/[0.08]'}`}>
                      {te.empId ? (()=>{
                        const e = employees.find(x=>x.id===te.empId);
                        return <span className={`font-black ${e?.paymentCurrency==='USD'?'text-emerald-700 dark:text-emerald-400':'text-sky-700 dark:text-sky-400'}`}>{e?.fullName}</span>;
                      })() : <span className="text-slate-400 dark:text-white/30">Seleccionar...</span>}
                      <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${teDropOpen?'rotate-180':''}`}/>
                    </button>
                    {teDropOpen && (
                      <div className="absolute z-30 top-full mt-1 left-0 w-full min-w-[320px] bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100 dark:border-white/[0.06]">
                          <input autoFocus value={teSearch} onChange={e=>setTeSearch(e.target.value)} placeholder="Buscar empleado..."
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg dark:text-white outline-none"/>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {employees.filter(e=>e.status==='Activo'&&(!teSearch||e.fullName.toLowerCase().includes(teSearch.toLowerCase()))).map(e=>(
                            <button key={e.id} type="button" onClick={()=>{setTe(f=>({...f,empId:e.id}));setTeDropOpen(false);}}
                              className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all flex items-center gap-2 ${te.empId===e.id?'bg-violet-50 dark:bg-violet-500/[0.08]':''}`}>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${e.paymentCurrency==='USD'?'bg-emerald-500':'bg-sky-500'}`}/>
                              <span className={`font-bold flex-1 ${e.paymentCurrency==='USD'?'text-emerald-700 dark:text-emerald-400':'text-sky-700 dark:text-sky-400'}`}>{e.fullName}</span>
                              <span className="text-[9px] text-slate-400 dark:text-white/30 uppercase">{e.department}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Tipo</label>
                    <select value={te.type} onChange={e=>setTe(f=>({...f,type:e.target.value as TimeEntry['type']}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="overtime">Horas Extras (+)</option>
                      <option value="absence">Horas Ausentes (−)</option>
                      <option value="missing_day">Día Faltante (−)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Fecha</label>
                    <input type="date" required value={te.date} onChange={e=>setTe(f=>({...f,date:e.target.value}))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-violet-500"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">
                      {te.type==='missing_day'?'Días':'Horas'}
                    </label>
                    {te.type==='missing_day' ? (
                      <input required type="number" step="1" min="1" value={te.days} onChange={e=>setTe(f=>({...f,days:e.target.value}))}
                        placeholder="1"
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-violet-500"/>
                    ) : (
                      <input required type="number" step="0.5" min="0.5" value={te.hours} onChange={e=>setTe(f=>({...f,hours:e.target.value}))}
                        placeholder="0.0"
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-violet-500"/>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1 block mb-1.5">Razón</label>
                    <input value={te.reason} onChange={e=>setTe(f=>({...f,reason:e.target.value}))}
                      placeholder={te.type==='overtime'?'Horas extras':te.type==='absence'?'Permiso/Ausencia':'Falta sin justificar'}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-violet-500"/>
                  </div>
                  <button disabled={saving} className="h-[42px] bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md flex items-center justify-center gap-2 disabled:opacity-50 hover:from-violet-500 hover:to-purple-500 transition-all">
                    {saving?<Loader2 size={13} className="animate-spin"/>:<><Plus size={13}/>Registrar</>}
                  </button>
                </form>
              </div>

              {/* Time Entries table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                      <th className="px-5 py-3.5">Fecha</th><th className="px-5 py-3.5">Empleado</th>
                      <th className="px-5 py-3.5 text-center">Tipo</th><th className="px-5 py-3.5 text-right">Cant.</th>
                      <th className="px-5 py-3.5 text-right">Impacto USD</th><th className="px-5 py-3.5">Razón</th>
                      <th className="px-5 py-3.5 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {visibleTimeEntries.length===0&&<tr><td colSpan={7} className="px-5 py-16 text-center"><Clock size={40} className="mx-auto text-slate-200 dark:text-white/10 mb-3"/><p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin registros de tiempo{isIndividual ? ' (modo individual)' : ''}</p></td></tr>}
                    {visibleTimeEntries.map(t=>(
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3 font-mono text-[10px] text-slate-400 dark:text-white/30">{t.date || '—'}</td>
                        <td className="px-5 py-3">
                          <p className="font-black text-slate-900 dark:text-white text-sm">{t.employeeName}</p>
                          {t.registeredByName && <p className="text-[9px] text-slate-400 dark:text-white/25 mt-0.5">por {t.registeredByName}</p>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${
                            t.type==='overtime'?'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                            :t.type==='absence'?'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20'
                            :'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20'
                          }`}>{t.type==='overtime'?'H. Extra':t.type==='absence'?'Ausencia':'Día faltante'}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-black text-slate-900 dark:text-white">
                          {t.type==='missing_day'?`${t.days} día(s)`:`${t.hours}h`}
                        </td>
                        <td className={`px-5 py-3 text-right font-black ${(t.amountUSD||0)>=0?'text-emerald-600 dark:text-emerald-400':'text-rose-600 dark:text-rose-400'}`}>
                          {(t.amountUSD||0)>=0?'+':''}{fmtHR(t.amountUSD||0)} USD
                        </td>
                        <td className="px-5 py-3 text-slate-400 dark:text-white/40 italic text-xs">{t.reason}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${t.status==='PENDIENTE'?'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/30':'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30'}`}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── NOMINA ────────────────────────────────────────────────────── */}
          {activeTab==='nomina' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Cálculo de Nómina</h3>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 mt-0.5">{new Date().toLocaleDateString('es-VE',{month:'long',year:'numeric'})} · {nominaRows.length} empleados</p>
                </div>
                {/* Freq filter */}
                <select value={freqFilter} onChange={e=>setFreqFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl dark:text-white outline-none">
                  <option value="all">Todas las frecuencias</option>
                  <option value="semanal">Solo Semanales</option>
                  <option value="quincenal">Solo Quincenales</option>
                  <option value="mensual">Solo Mensuales</option>
                </select>
                <button onClick={()=>exportNominaCSV(nominaRows,new Date().toISOString().slice(0,7))}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-all">
                  <Download size={13}/> Excel
                </button>
                {freqFilter==='all' ? (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                    Selecciona una frecuencia para cerrar período
                  </span>
                ) : (
                  <button onClick={()=>handleCerrarPeriodo(freqFilter as 'semanal'|'quincenal'|'mensual')} disabled={procLoading||nominaRows.length===0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/25 disabled:opacity-40 transition-all">
                    {procLoading?<Loader2 size={13} className="animate-spin"/>:<Scissors size={13}/>} Cerrar {FREQ_LABEL[freqFilter]}
                  </button>
                )}
              </div>
              {nominaRows.length===0?(
                <div className="py-16 text-center"><Users size={48} className="mx-auto text-slate-200 dark:text-white/10 mb-3"/><p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin empleados activos</p></div>
              ):(
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02]">
                        <th className="px-5 py-3.5">Empleado</th><th className="px-4 py-3.5 text-center">Frec.</th>
                        <th className="px-4 py-3.5 text-right">Bruto USD</th><th className="px-4 py-3.5 text-right">Vales</th>
                        <th className="px-4 py-3.5 text-right">H.Extra</th><th className="px-4 py-3.5 text-right">Ausencias</th>
                        <th className="px-4 py-3.5 text-right">IVSS/Paro</th><th className="px-4 py-3.5 text-right">Préstamos</th>
                        <th className="px-4 py-3.5 text-right">Neto USD</th><th className="px-4 py-3.5 text-right">Neto Bs</th>
                        <th className="px-4 py-3.5 text-right">Recibo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {nominaRows.map(n=>(
                        <tr key={n.emp.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] ${n.isOverdraft?'bg-rose-50/30 dark:bg-rose-500/[0.04]':''}`}>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                              {n.emp.fullName}{n.isOverdraft&&<span className="text-[8px] px-1.5 py-0.5 bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded border border-rose-100 dark:border-rose-500/25 font-black uppercase">sobregiro</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mt-0.5">{n.emp.department} · {getCurrencyLabel(n.emp.paymentCurrency)}</p>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {(()=>{const fc=FREQ_COLOR[n.emp.payFrequency]||FREQ_COLOR.quincenal; return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black ${fc.bg} ${fc.text} border ${fc.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${fc.dot}`}/>{FREQ_LABEL[n.emp.payFrequency]?.slice(0,5)}
                              </span>
                            );})()}
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-slate-700 dark:text-slate-300">{n.grossUSD>0?`$${fmtHR(n.grossUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-rose-600 dark:text-rose-400">{n.voucherDedUSD>0?`-$${fmtHR(n.voucherDedUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400">{n.overtimeUSD>0?`+$${fmtHR(n.overtimeUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-rose-600 dark:text-rose-400">{n.absenceDeductionUSD>0?`-$${fmtHR(n.absenceDeductionUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-orange-600 dark:text-orange-400">{(n.ivssUSD+n.paroUSD)>0?`-$${fmtHR(n.ivssUSD+n.paroUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-amber-600 dark:text-amber-400">{n.loanDedUSD>0?`-$${fmtHR(n.loanDedUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 text-base">{n.netUSD>0?`$${fmtHR(n.netUSD)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-sky-600 dark:text-sky-400">{n.netBs>0?`Bs ${fmtHR(n.netBs)}`:'—'}</td>
                          <td className="px-4 py-3.5 text-right">
                            <button onClick={()=>printPayslip(n.emp,n,new Date().toISOString().slice(0,7),n.emp.payFrequency,businessName,pendingVouchers.filter(v=>v.employeeId===n.emp.id),undefined,loans)}
                              className="p-2 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all" title="Imprimir recibo">
                              <Printer size={13}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* Totals */}
                      <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-100 dark:border-white/[0.07]">
                        <td colSpan={2} className="px-5 py-3.5 font-black text-slate-500 dark:text-white/40 text-[11px] uppercase tracking-widest">TOTALES ({nominaRows.length})</td>
                        <td className="px-4 py-3.5 text-right font-black text-slate-800 dark:text-slate-200">{nominaTotals.grossUSD>0?`$${fmtHR(nominaTotals.grossUSD)}`:'—'}</td>
                        <td className="px-4 py-3.5 text-right font-black text-rose-600 dark:text-rose-400">{nominaTotals.dedUSD>0?`-$${fmtHR(nominaTotals.dedUSD)}`:'—'}</td>
                        <td colSpan={4}></td>
                        <td className="px-4 py-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg">{`$${fmtHR(nominaTotals.netUSD)}`}</td>
                        <td className="px-4 py-3.5 text-right font-black text-sky-600 dark:text-sky-400">{nominaTotals.netBs>0?`Bs ${fmtHR(nominaTotals.netBs)}`:'—'}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {/* Payroll history */}
              {payrollHistory.length>0&&(
                <div className="border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="px-5 py-3 bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-2">
                    <History size={14} className="text-indigo-400"/>
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Historial de Nóminas</h4>
                    <span className="text-[9px] text-slate-300 dark:text-white/20">Haz clic para ver detalle</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05]">
                        <th className="px-5 py-3">Período</th><th className="px-5 py-3 text-center">Empl.</th>
                        <th className="px-5 py-3 text-right">Bruto USD</th><th className="px-5 py-3 text-right">Deduc.</th>
                        <th className="px-5 py-3 text-right">Neto USD</th><th className="px-5 py-3 text-right">Neto Bs</th>
                        <th className="px-5 py-3"></th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                        {payrollHistory.slice(0,10).map(r=>(
                          <tr key={r.id} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.04] cursor-pointer transition-colors" onClick={()=>setSelectedRun(r)}>
                            <td className="px-5 py-3"><p className="font-black text-slate-800 dark:text-slate-200 text-sm">{r.period}</p><p className="text-[10px] text-slate-400 dark:text-white/30">{FREQ_LABEL[r.frequency]||r.frequency} · {r.processedAt?.toDate?r.processedAt.toDate().toLocaleDateString('es-VE'):'—'}</p></td>
                            <td className="px-5 py-3 text-center font-bold text-slate-600 dark:text-slate-400">{r.employeeCount}</td>
                            <td className="px-5 py-3 text-right font-black text-slate-700 dark:text-slate-300">{r.totalGrossUSD>0?`$${fmtHR(r.totalGrossUSD)}`:'—'}</td>
                            <td className="px-5 py-3 text-right font-black text-rose-500 dark:text-rose-400">{r.totalDedUSD>0?`-$${fmtHR(r.totalDedUSD)}`:'—'}</td>
                            <td className="px-5 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">{`$${fmtHR(r.totalNetUSD)}`}</td>
                            <td className="px-5 py-3 text-right font-black text-sky-600 dark:text-sky-400">{r.totalNetBs>0?`Bs ${fmtHR(r.totalNetBs)}`:'—'}</td>
                            <td className="px-5 py-3"><ChevronRight size={14} className="text-slate-300 dark:text-white/20"/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TASAS DE VALES ────────────────────────────────────────────── */}
          {activeTab==='tasas' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <RefreshCw size={16} className="text-indigo-500"/> Tasa Interna
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-white/40 mt-1">Tasa interna para convertir vales en Bs → USD al descontar de nómina.</p>
              </div>
              <div className="p-5 grid md:grid-cols-2 gap-5">
                {/* Current rate */}
                <div className={`p-6 rounded-2xl border ${currentRate>0?'border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/[0.07]':'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]'}`}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-2">Tasa Actual</p>
                  {currentRate>0?(
                    <>
                      <p className="text-5xl font-black text-indigo-700 dark:text-indigo-300 tracking-tight">Bs {fmtHR(currentRate)}</p>
                      <p className="text-sm text-indigo-600/60 dark:text-indigo-400/50 mt-1">por 1 USD</p>
                      <p className="text-[10px] text-indigo-600/50 dark:text-indigo-400/40 mt-3">
                        {voucherRates[0]?.effectiveDate
                          ? <>Vigente desde: <span className="font-bold">{new Date(voucherRates[0].effectiveDate+'T12:00:00').toLocaleDateString('es-VE',{day:'2-digit',month:'short',year:'numeric'})}</span> · </>
                          : null}
                        Registrada: {voucherRates[0]?.createdAt?.toDate?voucherRates[0].createdAt.toDate().toLocaleString('es-VE'):'—'} · por {voucherRates[0]?.createdBy}
                      </p>
                      {voucherRates[0]?.notes&&<p className="text-[10px] text-indigo-600/50 dark:text-indigo-400/40 italic mt-1">{voucherRates[0].notes}</p>}
                    </>
                  ):(
                    <p className="text-slate-400 dark:text-white/30 text-sm font-bold mt-2">Sin tasa configurada. Ingresa una a continuación.</p>
                  )}
                </div>
                {/* Update rate form */}
                <form onSubmit={handleSaveRate} className="p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Actualizar Tasa</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1">Nueva Tasa (Bs / USD)</label>
                      <input required type="number" step="0.01" min="1" value={rateInput}
                        onChange={e=>setRateInput(e.target.value)} placeholder="Ej. 40.50"
                        className={inp}/>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1">Fecha Vigencia</label>
                      <input required type="date" value={rateDate}
                        onChange={e=>setRateDate(e.target.value)}
                        className={inp}/>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1">Notas (opcional)</label>
                    <input value={rateNotes} onChange={e=>setRateNotes(e.target.value)} placeholder="Ej. Tasa grupal para vales de comida"
                      className={inp}/>
                  </div>
                  {rateInput&&Number(rateInput)>0&&(
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                      Ejemplo: Vale de Bs 100 → descuenta ${fmtHR(100/Number(rateInput))} USD
                    </p>
                  )}
                  <button disabled={savingRate} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/25">
                    {savingRate?<Loader2 size={13} className="animate-spin"/>:<><Save size={13}/>Guardar Tasa</>}
                  </button>
                </form>
              </div>
              {/* Rate history */}
              {voucherRates.length>0&&(
                <div className="border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="px-5 py-3 bg-slate-50/50 dark:bg-white/[0.02]"><p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Historial de Tasas</p></div>
                  <table className="w-full text-left">
                    <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-50 dark:border-white/[0.05]">
                      <th className="px-5 py-3">Vigencia</th><th className="px-5 py-3">Registrada</th><th className="px-5 py-3 text-right">Tasa (Bs/USD)</th>
                      <th className="px-5 py-3">Por</th><th className="px-5 py-3">Notas</th><th className="px-5 py-3"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {voucherRates.slice(0,20).map((r,i)=>(
                        <React.Fragment key={r.id}>
                        <tr className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] ${i===0?'bg-indigo-50/30 dark:bg-indigo-500/[0.04]':''}`}>
                          <td className="px-5 py-3 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{r.effectiveDate?new Date(r.effectiveDate+'T12:00:00').toLocaleDateString('es-VE',{day:'2-digit',month:'short',year:'numeric'}):<span className="text-slate-400 dark:text-white/30 text-[10px]">—</span>}</td>
                          <td className="px-5 py-3 font-mono text-[10px] text-slate-400 dark:text-white/30">{r.createdAt?.toDate?r.createdAt.toDate().toLocaleString('es-VE'):'—'}</td>
                          <td className="px-5 py-3 text-right font-black text-slate-900 dark:text-white text-sm">Bs {fmtHR(r.rate)}{i===0&&<span className="ml-2 text-[8px] text-indigo-500 font-black uppercase">vigente</span>}</td>
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{r.createdBy}</td>
                          <td className="px-5 py-3 text-slate-400 dark:text-white/30 italic text-xs">{r.notes||'—'}</td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={()=>setEditingRate({id:r.id,rate:String(r.rate),effectiveDate:r.effectiveDate||'',notes:r.notes||''})}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all">
                              <Pencil size={11}/>
                            </button>
                          </td>
                        </tr>
                        {editingRate?.id===r.id&&(
                          <tr>
                            <td colSpan={6} className="px-5 py-3 bg-indigo-50 dark:bg-indigo-500/[0.06] border-l-4 border-indigo-400">
                              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                                <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest"><Pencil size={11}/> Editar</div>
                                <input type="number" step="0.01" min="1" placeholder="Tasa (Bs/USD)" value={editingRate.rate}
                                  onChange={e=>setEditingRate(x=>x?{...x,rate:e.target.value}:null)}
                                  className="px-3 py-1.5 text-xs font-black bg-white dark:bg-white/[0.08] border border-indigo-300 dark:border-indigo-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-32"/>
                                <input type="date" value={editingRate.effectiveDate}
                                  onChange={e=>setEditingRate(x=>x?{...x,effectiveDate:e.target.value}:null)}
                                  className="px-3 py-1.5 text-xs bg-white dark:bg-white/[0.08] border border-indigo-300 dark:border-indigo-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 w-36"/>
                                <input placeholder="Notas" value={editingRate.notes}
                                  onChange={e=>setEditingRate(x=>x?{...x,notes:e.target.value}:null)}
                                  className="px-3 py-1.5 text-xs bg-white dark:bg-white/[0.08] border border-indigo-300 dark:border-indigo-500/30 rounded-lg dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"/>
                                <div className="flex gap-1.5 shrink-0">
                                  <button onClick={handleEditRate} disabled={savingRate}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-1">
                                    {savingRate?<Loader2 size={11} className="animate-spin"/>:<Save size={11}/>} Guardar
                                  </button>
                                  <button onClick={()=>setEditingRate(null)} className="px-3 py-1.5 border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 rounded-lg font-black text-[10px] uppercase hover:bg-slate-50 dark:hover:bg-white/[0.04]"><X size={11}/></button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── HISTORIAL DE CORTES ─────────────────────────────────────── */}
          {activeTab==='historial' && (
            <>
              <div className="px-5 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 mb-1">
                  <History size={18} className="text-violet-500"/>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Historial de Períodos</h3>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-white/40">Cada período cerrado queda registrado aquí. Haz clic en uno para ver los detalles.</p>
              </div>

              {cortes.length === 0 ? (
                <div className="py-16 text-center">
                  <Scissors size={48} className="mx-auto text-slate-200 dark:text-white/10 mb-3"/>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Sin períodos cerrados</p>
                  <p className="text-[10px] text-slate-300 dark:text-white/20 mt-1">Los períodos que cierres aparecerán aquí</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {cortes.map(c => {
                    const dateStr = c.executedAt?.toDate
                      ? c.executedAt.toDate().toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—';
                    const empMap = new Map<string, { name: string; count: number; totalUSD: number }>();
                    (c.vouchers || []).forEach(v => {
                      const prev = empMap.get(v.employeeId) || { name: v.employeeName, count: 0, totalUSD: 0 };
                      prev.count++;
                      prev.totalUSD += v.amountUSD || 0;
                      empMap.set(v.employeeId, prev);
                    });
                    const fc = c.frequency ? FREQ_COLOR[c.frequency] : null;

                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCorte(c)}
                        className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all group"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Calendar size={13} className="text-violet-400 shrink-0"/>
                              <p className="text-xs font-black text-slate-900 dark:text-white">{dateStr}</p>
                              {fc && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black ${fc.bg} ${fc.text} border ${fc.border}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${fc.dot}`}/>{FREQ_LABEL[c.frequency!]}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px]">
                              {c.employeeCount != null && (
                                <span className="text-slate-500 dark:text-white/40">
                                  <strong className="text-slate-700 dark:text-slate-300">{c.employeeCount}</strong> empleados
                                </span>
                              )}
                              <span className="text-slate-500 dark:text-white/40">
                                <strong className="text-slate-700 dark:text-slate-300">{c.voucherCount}</strong> vales
                              </span>
                              {c.totalNetUSD != null && c.totalNetUSD > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  Neto ${fmtHR(c.totalNetUSD)}
                                </span>
                              )}
                              {c.deferredCount > 0 && (
                                <span className="text-amber-500 dark:text-amber-400">
                                  {c.deferredCount} diferidos
                                </span>
                              )}
                              <span className="text-[9px] text-slate-400 dark:text-white/25">
                                por {c.executedByName}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {c.totalUSD > 0 && (
                              <p className="text-sm font-black text-rose-600 dark:text-rose-400">${fmtHR(c.totalUSD)}</p>
                            )}
                            {c.totalBs > 0 && (
                              <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400">Bs {fmtHR(c.totalBs)}</p>
                            )}
                          </div>
                          <ChevronRight size={16} className="text-slate-300 dark:text-white/15 group-hover:text-indigo-400 transition-colors shrink-0"/>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* CORTE DETAIL MODAL */}
      {selectedCorte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={()=>setSelectedCorte(null)}>
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.03] shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Scissors size={16} className="text-violet-400"/> Detalle del Corte
                </h2>
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">
                  {selectedCorte.executedAt?.toDate
                    ? selectedCorte.executedAt.toDate().toLocaleDateString('es-VE',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})
                    : '—'}
                  {' · '}por {selectedCorte.executedByName}
                </p>
              </div>
              <button onClick={()=>setSelectedCorte(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl text-slate-400"><X size={18}/></button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 divide-x divide-slate-50 dark:divide-white/[0.06] border-b border-slate-50 dark:border-white/[0.06] shrink-0">
              {[
                {l:'Vales descontados', v: String(selectedCorte.voucherCount), c:'text-slate-700 dark:text-slate-300'},
                {l:'Total USD', v:`$${fmtHR(selectedCorte.totalUSD)}`, c:'text-rose-600 dark:text-rose-400'},
                {l:'Total Bs', v:`Bs ${fmtHR(selectedCorte.totalBs)}`, c:'text-sky-600 dark:text-sky-400'},
              ].map((k,i)=>(
                <div key={i} className="px-4 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-0.5">{k.l}</p>
                  <p className={`text-sm font-black ${k.c}`}>{k.v}</p>
                </div>
              ))}
            </div>

            {selectedCorte.deferredCount > 0 && (
              <div className="px-6 py-2 border-b border-slate-50 dark:border-white/[0.06] bg-amber-50/50 dark:bg-amber-500/5">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  ⏳ {selectedCorte.deferredCount} vale{selectedCorte.deferredCount>1?'s':''} diferido{selectedCorte.deferredCount>1?'s':''} al próximo período
                </p>
              </div>
            )}

            {/* Vouchers grouped by employee */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {(() => {
                const grouped = new Map<string,{name:string; vouchers:CorteVoucherDetail[]; totalUSD:number}>();
                (selectedCorte.vouchers||[]).forEach(v => {
                  const prev = grouped.get(v.employeeId) || {name:v.employeeName, vouchers:[], totalUSD:0};
                  prev.vouchers.push(v);
                  prev.totalUSD += v.amountUSD||0;
                  grouped.set(v.employeeId, prev);
                });
                return Array.from(grouped.entries()).map(([empId,g]) => (
                  <div key={empId} className="rounded-xl border border-slate-100 dark:border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-white/[0.03] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
                          <Users size={12} className="text-indigo-600 dark:text-indigo-400"/>
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white">{g.name}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/30">{g.vouchers.length} vale{g.vouchers.length>1?'s':''}</p>
                        </div>
                      </div>
                      <p className="text-sm font-black text-rose-600 dark:text-rose-400">${fmtHR(g.totalUSD)}</p>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {g.vouchers.map((v,i) => (
                        <div key={i} className="px-4 py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-slate-700 dark:text-white/70 truncate">{v.reason||'Sin motivo'}</p>
                            {v.voucherDate && (
                              <p className="text-[9px] text-slate-400 dark:text-white/25 mt-0.5">{v.voucherDate}</p>
                            )}
                          </div>
                          <p className={`text-xs font-bold shrink-0 ${v.currency==='USD'?'text-rose-600 dark:text-rose-400':'text-sky-600 dark:text-sky-400'}`}>
                            {v.currency==='USD'?'$':'Bs '}{fmtHR(v.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* PROFILE PANEL */}
      {fichaEmp&&(
        <ProfilePanel
          emp={fichaEmp} vouchers={visibleVouchers} loans={loans}
          payrollHistory={payrollHistory} businessId={bid}
          currentRate={currentRate} businessName={businessName} businessLogo={businessLogo}
          onClose={()=>setFichaEmp(null)}
          onAddVoucher={handleAddVoucher}
          onAddLoan={handleAddLoan}
        />
      )}

      {/* PAYROLL RUN DETAIL MODAL */}
      {selectedRun&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={()=>setSelectedRun(null)}>
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.03] shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <History size={16} className="text-indigo-400"/> Nómina {selectedRun.period}
                </h2>
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">
                  {FREQ_LABEL[selectedRun.frequency]||selectedRun.frequency} · {selectedRun.processedAt?.toDate?selectedRun.processedAt.toDate().toLocaleString('es-VE'):'—'} · {selectedRun.employeeCount} empleados
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>printPayrollRunPDF(selectedRun, businessName)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-all border border-indigo-100 dark:border-indigo-500/25"
                  title="Exportar PDF">
                  <Download size={12}/> PDF
                </button>
                <button onClick={()=>setSelectedRun(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl text-slate-400"><X size={18}/></button>
              </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-3 divide-x divide-slate-50 dark:divide-white/[0.06] border-b border-slate-50 dark:border-white/[0.06] shrink-0">
              {[
                {l:'Bruto Total',v:`$${fmtHR(selectedRun.totalGrossUSD)}`,c:'text-slate-700 dark:text-slate-300'},
                {l:'Deducciones',v:`-$${fmtHR(selectedRun.totalDedUSD)}`,c:'text-rose-600 dark:text-rose-400'},
                {l:'Neto Total USD',v:`$${fmtHR(selectedRun.totalNetUSD)}`,c:'text-emerald-600 dark:text-emerald-400'},
              ].map(({l,v,c})=>(
                <div key={l} className="px-5 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">{l}</p>
                  <p className={`text-lg font-black ${c}`}>{v}</p>
                </div>
              ))}
            </div>

            {/* Detail table */}
            <div className="overflow-y-auto flex-1">
              {selectedRun.details?.map((det,i)=>{
                const hasVouchers = (det.settledVouchers||[]).length>0;
                return (
                  <div key={det.employeeId||i} className="border-b border-slate-50 dark:border-white/[0.04] px-6 py-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-1">
                      <p className="font-black text-slate-900 dark:text-white text-sm">{det.name}</p>
                      <span className="text-[9px] bg-slate-50 dark:bg-white/[0.06] border border-slate-100 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded uppercase font-black">{det.department}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[10px]">
                      {det.grossUSD>0&&<span className="text-slate-500 dark:text-white/40">Bruto: <strong className="text-slate-700 dark:text-slate-300">${fmtHR(det.grossUSD)}</strong></span>}
                      {det.voucherDedUSD>0&&<span className="text-rose-500 dark:text-rose-400">Vales: -${fmtHR(det.voucherDedUSD)}</span>}
                      {det.ivssUSD>0&&<span className="text-orange-500 dark:text-orange-400">IVSS: -${fmtHR(det.ivssUSD)}</span>}
                      {det.paroUSD>0&&<span className="text-orange-500 dark:text-orange-400">Paro: -${fmtHR(det.paroUSD)}</span>}
                      {det.loanDedUSD>0&&<span className="text-amber-600 dark:text-amber-400">Préstamo: -${fmtHR(det.loanDedUSD)}</span>}
                      <span className="font-black text-emerald-600 dark:text-emerald-400">Neto: ${fmtHR(det.netUSD)}</span>
                      {det.netBs>0&&<span className="font-black text-sky-600 dark:text-sky-400">/ Bs {fmtHR(det.netBs)}</span>}
                    </div>
                    {hasVouchers&&(
                      <div className="mt-2 pl-3 border-l-2 border-rose-200 dark:border-rose-500/25 space-y-0.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 mb-1">Vales descontados este período:</p>
                        {det.settledVouchers!.map((sv,j)=>(
                          <p key={j} className="text-[10px] text-slate-500 dark:text-white/40">
                            · {sv.reason} — <strong>{sv.currency==='USD'?'$':'Bs '}{fmtHR(Number(sv.amount))}</strong>
                            {sv.currency==='BS'&&sv.amountUSD!=null&&` (≈ $${fmtHR(Number(sv.amountUSD))})`}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* EMPLOYEE MODAL */}
      {empModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.03] sticky top-0 z-10">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{editId?'Editar Ficha':'Nuevo Empleado'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 mt-0.5 tracking-widest">Módulo de Personal</p>
              </div>
              <button onClick={()=>setEmpModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl text-slate-400"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-6 space-y-5">

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Datos Personales</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Nombre Completo *</label><input required value={empForm.fullName} onChange={e=>setEmpForm(f=>({...f,fullName:e.target.value}))} className={inp}/></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Cédula</label><input value={empForm.cedula||''} onChange={e=>setEmpForm(f=>({...f,cedula:e.target.value}))} placeholder="V-12345678" className={inp}/></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Teléfono</label><input value={empForm.phone||''} onChange={e=>setEmpForm(f=>({...f,phone:e.target.value}))} placeholder="04XX-0000000" className={inp}/></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Fecha de Ingreso</label><input type="date" value={empForm.startDate||''} onChange={e=>setEmpForm(f=>({...f,startDate:e.target.value}))} className={inp}/></div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Cargo y Departamento</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Departamento</label><select value={empForm.department} onChange={e=>setEmpForm(f=>({...f,department:e.target.value}))} className={inp}>{DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Cargo</label><select value={empForm.role} onChange={e=>setEmpForm(f=>({...f,role:e.target.value}))} className={inp}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Estatus</label><select value={empForm.status} onChange={e=>setEmpForm(f=>({...f,status:e.target.value as any}))} className={inp}>{['Activo','Inactivo','Vacaciones','Suspendido'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Configuración de Pago</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Frecuencia de Pago</label><select value={empForm.payFrequency} onChange={e=>setEmpForm(f=>({...f,payFrequency:e.target.value as any}))} className={inp}><option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option></select></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Moneda de Pago</label><select value={empForm.paymentCurrency} onChange={e=>setEmpForm(f=>({...f,paymentCurrency:e.target.value as any}))} className={inp}><option value="USD">Tasa Interna</option><option value="BS">BCV (Bolívares)</option></select></div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Salario y Bonos (base mensual)</p>
                {empForm.paymentCurrency==='USD' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Salario (Tasa Interna)</label><input type="number" min="0" step="0.01" value={empForm.salaryUSD} onChange={e=>setEmpForm(f=>({...f,salaryUSD:Number(e.target.value)}))} className={inp}/></div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Bono</label>
                      <input type="number" min="0" step="0.01" value={empForm.bonusUSD} onChange={e=>setEmpForm(f=>({...f,bonusUSD:Number(e.target.value)}))} className={inp}/>
                      <div className="flex gap-1 mt-1">
                        {(['USD','BS'] as const).map(c=>(
                          <button key={c} type="button" onClick={()=>setEmpForm(f=>({...f,bonusUSDCurrency:c}))}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-black uppercase transition-all border ${empForm.bonusUSDCurrency===c?'bg-indigo-600 text-white border-indigo-600':'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:border-indigo-400'}`}>
                            {c==='USD'?'Tasa Interna':'BCV (Bs)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* E: Simplified BCV form — one USD field + Bs preview */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Sueldo base (USD equivalente)</label>
                      <input type="number" min="0" step="0.01" value={empForm.salaryUSD} onChange={e=>setEmpForm(f=>({...f,salaryUSD:Number(e.target.value)}))} className={inp}/>
                      {tasaBCV>0&&empForm.salaryUSD>0&&(
                        <p className="text-[10px] text-sky-600 dark:text-sky-400 font-bold ml-1">≈ Bs {fmtHR(empForm.salaryUSD*tasaBCV)} al BCV actual</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Bono Bs (BCV)</label>
                      <input type="number" min="0" step="0.01" value={empForm.bonusBs} onChange={e=>setEmpForm(f=>({...f,bonusBs:Number(e.target.value)}))} className={inp}/>
                    </div>
                  </div>
                )}
                {/* Pay preview */}
                <div className="mt-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-1">Pago por {FREQ_LABEL[empForm.payFrequency]}</p>
                  {empForm.salaryUSD>0&&<p className="text-sm font-black text-indigo-700 dark:text-indigo-300">${fmtHR((empForm.salaryUSD+(empForm.paymentCurrency==='USD'?empForm.bonusUSD:0))/(FREQ_DIV[empForm.payFrequency]||1))} USD</p>}
                  {empForm.paymentCurrency==='BS'&&tasaBCV>0&&empForm.salaryUSD>0&&<p className="text-sm font-black text-sky-700 dark:text-sky-300">≈ Bs {fmtHR(empForm.salaryUSD*tasaBCV/(FREQ_DIV[empForm.payFrequency]||1))} al BCV actual</p>}
                  {empForm.salaryBs>0&&empForm.paymentCurrency==='USD'&&<p className="text-sm font-black text-sky-700 dark:text-sky-300">Bs {fmtHR((empForm.salaryBs+empForm.bonusBs)/(FREQ_DIV[empForm.payFrequency]||1))}</p>}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Deducciones Fijas</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                    <div><p className="text-xs font-black text-slate-800 dark:text-white">IVSS</p><p className="text-[10px] text-slate-400 dark:text-white/30">Seguro social</p></div>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="20" step="0.1" value={empForm.ivssRate} onChange={e=>setEmpForm(f=>({...f,ivssRate:Number(e.target.value)}))} className="w-16 px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs font-black dark:text-white outline-none text-center"/>
                      <span className="text-xs text-slate-400 dark:text-white/30">%</span>
                      <button type="button" onClick={()=>setEmpForm(f=>({...f,ivssEnabled:!f.ivssEnabled}))}
                        className={`relative h-6 w-11 rounded-full transition-colors ${empForm.ivssEnabled?'bg-indigo-600':'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${empForm.ivssEnabled?'left-5':'left-0.5'}`}/>
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                    <div><p className="text-xs font-black text-slate-800 dark:text-white">Paro Forzoso</p><p className="text-[10px] text-slate-400 dark:text-white/30">BANAVIH/INCE</p></div>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="20" step="0.1" value={empForm.paroRate} onChange={e=>setEmpForm(f=>({...f,paroRate:Number(e.target.value)}))} className="w-16 px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs font-black dark:text-white outline-none text-center"/>
                      <span className="text-xs text-slate-400 dark:text-white/30">%</span>
                      <button type="button" onClick={()=>setEmpForm(f=>({...f,paroEnabled:!f.paroEnabled}))}
                        className={`relative h-6 w-11 rounded-full transition-colors ${empForm.paroEnabled?'bg-indigo-600':'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${empForm.paroEnabled?'left-5':'left-0.5'}`}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-3">Vacaciones</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Días por Año</label><input type="number" min="1" max="60" value={empForm.vacationDaysPerYear} onChange={e=>setEmpForm(f=>({...f,vacationDaysPerYear:Number(e.target.value)}))} className={inp}/></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 ml-1">Días Usados</label><input type="number" min="0" value={empForm.vacationDaysUsed} onChange={e=>setEmpForm(f=>({...f,vacationDaysUsed:Number(e.target.value)}))} className={inp}/></div>
                </div>
              </div>

              <button disabled={saving} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving?<Loader2 className="animate-spin" size={16}/>:<><Save size={16}/> Guardar Empleado</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {confirm&&<Confirm msg={confirm.msg} detail={confirm.detail} onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
