import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  BarChart3, AlertTriangle, Wallet, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { Movement } from '../../types';

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface RecurringInvoice {
  id: string;
  status: string;
  frequency: string;
  nextDueDate: string;
  endDate?: string;
  total: number;
  customerName: string;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addFrequency(dateStr: string, freq: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  switch (freq) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'biweekly':  d.setDate(d.getDate() + 14); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function currency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Period = '7d' | '30d' | '90d' | '180d';
type Grouping = 'day' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = { '7d': '7 días', '30d': '30 días', '90d': '90 días', '180d': '6 meses' };
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '180d': 180 };
const GROUP_LABELS: Record<Grouping, string> = { day: 'Día', week: 'Semana', month: 'Mes' };
const GROUP_DAYS: Record<Grouping, number> = { day: 1, week: 7, month: 30 };

// ─── COMPONENT ──────────────────────────────────────────────────────────────
interface Props {
  businessId: string;
}

export default function CashFlowPanel({ businessId }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [grouping, setGrouping] = useState<Grouping>('week');

  useEffect(() => {
    if (!businessId) return;
    const unsubs = [
      onSnapshot(query(collection(db, 'movements'), where('businessId', '==', businessId)), snap => {
        setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
      }),
      onSnapshot(collection(db, `businesses/${businessId}/recurringInvoices`), snap => {
        setRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringInvoice)));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [businessId]);

  const today = todayISO();
  const horizonDate = addDays(today, PERIOD_DAYS[period]);

  const projection = useMemo(() => {
    const pendingCxC = movements.filter(m =>
      m.movementType === 'FACTURA' && !m.pagado && !m.anulada && !m.isSupplierMovement
    );
    const inflows = pendingCxC.filter(m => {
      const due = m.dueDate || m.date;
      return due >= today && due <= horizonDate;
    });
    const inflowTotal = inflows.reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);

    const pendingCxP = movements.filter(m =>
      m.movementType === 'FACTURA' && !m.pagado && !m.anulada && m.isSupplierMovement
    );
    const outflows = pendingCxP.filter(m => {
      const due = m.dueDate || m.date;
      return due >= today && due <= horizonDate;
    });
    const outflowTotal = outflows.reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);

    let recurringInflow = 0;
    const recurringItems: Array<{ name: string; date: string; amount: number }> = [];
    for (const ri of recurring) {
      if (ri.status !== 'active') continue;
      let next = ri.nextDueDate;
      while (next <= horizonDate) {
        if (next >= today) {
          recurringInflow += ri.total;
          recurringItems.push({ name: ri.customerName, date: next, amount: ri.total });
        }
        next = addFrequency(next, ri.frequency);
        if (ri.endDate && next > ri.endDate) break;
      }
    }

    // Recent realized (last 30 days)
    const thirtyAgo = addDays(today, -30);
    const recentInflow = movements.filter(m =>
      m.movementType === 'ABONO' && !m.anulada && !m.isSupplierMovement && m.date >= thirtyAgo && m.date <= today
    ).reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);
    const recentOutflow = movements.filter(m =>
      m.movementType === 'ABONO' && !m.anulada && m.isSupplierMovement && m.date >= thirtyAgo && m.date <= today
    ).reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);

    // Overdue
    const overdueCxC = pendingCxC.filter(m => (m.dueDate || m.date) < today);
    const overdueTotal = overdueCxC.reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);
    const overdueCxP = pendingCxP.filter(m => (m.dueDate || m.date) < today);
    const overdueCxPTotal = overdueCxP.reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);

    // Build buckets based on selected grouping
    const bucketSize = GROUP_DAYS[grouping];
    const buckets: Array<{ label: string; inflow: number; outflow: number }> = [];
    let cursor = today;
    while (cursor < horizonDate) {
      const bucketEnd = addDays(cursor, bucketSize);
      const bIn = inflows.filter(m => { const d = m.dueDate || m.date; return d >= cursor && d < bucketEnd; })
        .reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);
      const bOut = outflows.filter(m => { const d = m.dueDate || m.date; return d >= cursor && d < bucketEnd; })
        .reduce((s, m) => s + (m.amountInUSD || m.amount || 0), 0);
      const bRec = recurringItems.filter(ri => ri.date >= cursor && ri.date < bucketEnd)
        .reduce((s, ri) => s + ri.amount, 0);
      buckets.push({ label: cursor.slice(5), inflow: bIn + bRec, outflow: bOut });
      cursor = bucketEnd;
    }

    return {
      inflowTotal: inflowTotal + recurringInflow,
      outflowTotal,
      netFlow: (inflowTotal + recurringInflow) - outflowTotal,
      overdueTotal, overdueCxPTotal,
      overdueCount: overdueCxC.length, overdueCxPCount: overdueCxP.length,
      inflowCount: inflows.length + recurringItems.length,
      outflowCount: outflows.length,
      recentInflow, recentOutflow,
      buckets,
      topInflows: [
        ...inflows.map(m => ({ name: m.entityName || '—', amount: m.amountInUSD || m.amount || 0, date: m.dueDate || m.date })),
        ...recurringItems,
      ].sort((a, b) => b.amount - a.amount).slice(0, 5),
      topOutflows: outflows.map(m => ({ name: m.entityName || '—', amount: m.amountInUSD || m.amount || 0, date: m.dueDate || m.date }))
        .sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
  }, [movements, recurring, period, grouping, today, horizonDate]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Wallet size={20} className="text-indigo-500" /> Flujo de Caja Proyectado
          </h2>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">
            Proyección basada en facturas pendientes, CxP y recurrentes
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['7d', '30d', '90d', '180d'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                period === p
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <span className="w-px bg-slate-200 dark:bg-white/[0.08] mx-1" />
          {(['day', 'week', 'month'] as Grouping[]).map(g => (
            <button key={g} onClick={() => setGrouping(g)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                grouping === g
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}>
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      {/* Negative projection alert */}
      {projection.netFlow < 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
            Alerta: la proyección indica un déficit de {currency(Math.abs(projection.netFlow))} en los próximos {PERIOD_LABELS[period]}.
            Revisa los pagos pendientes o acelera cobros.
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <ArrowUpRight size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Ingresos Esperados</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{currency(projection.inflowTotal)}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-white/30">{projection.inflowCount} cobros próximos {PERIOD_LABELS[period]}</p>
        </div>

        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
              <ArrowDownRight size={18} className="text-rose-500" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Egresos Esperados</p>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400">{currency(projection.outflowTotal)}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-white/30">{projection.outflowCount} pagos pendientes</p>
        </div>

        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${projection.netFlow >= 0 ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
              {projection.netFlow >= 0
                ? <TrendingUp size={18} className="text-indigo-500" />
                : <TrendingDown size={18} className="text-amber-500" />}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Flujo Neto</p>
              <p className={`text-lg font-black ${projection.netFlow >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {currency(projection.netFlow)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-white/30">{projection.netFlow >= 0 ? 'Superávit' : 'Déficit'} proyectado</p>
        </div>

        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Vencido</p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400">{currency(projection.overdueTotal)}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-white/30">
            {projection.overdueCount} CxC · {projection.overdueCxPCount} CxP ({currency(projection.overdueCxPTotal)})
          </p>
        </div>
      </div>

      {/* Recharts bar chart */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 size={14} className="text-indigo-400" /> Proyección por {GROUP_LABELS[grouping].toLowerCase()}
          </h3>
          <div className="flex items-center gap-3 text-[9px] font-bold">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Ingresos</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Egresos</span>
          </div>
        </div>
        {projection.buckets.length === 0 ? (
          <p className="text-center text-xs text-slate-400 dark:text-white/30 py-8">Sin datos para el período seleccionado</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projection.buckets} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }}
                labelStyle={{ color: '#94a3b8', fontWeight: 800, fontSize: 10 }}
                formatter={(val: number) => [currency(val)]}
              />
              <Bar dataKey="inflow" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Egresos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top inflows & outflows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <h3 className="text-xs font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <ArrowUpRight size={12} className="text-emerald-500" /> Mayores Cobros Esperados
          </h3>
          {projection.topInflows.length === 0 ? (
            <p className="text-[10px] text-slate-400 dark:text-white/30 py-4 text-center">Sin cobros pendientes</p>
          ) : (
            <div className="space-y-2">
              {projection.topInflows.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-white/70 truncate">{item.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/20">{item.date}</p>
                  </div>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">{currency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
          <h3 className="text-xs font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <ArrowDownRight size={12} className="text-rose-500" /> Mayores Pagos Pendientes
          </h3>
          {projection.topOutflows.length === 0 ? (
            <p className="text-[10px] text-slate-400 dark:text-white/30 py-4 text-center">Sin pagos pendientes</p>
          ) : (
            <div className="space-y-2">
              {projection.topOutflows.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-white/70 truncate">{item.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-white/20">{item.date}</p>
                  </div>
                  <span className="text-xs font-black text-rose-600 dark:text-rose-400 shrink-0 ml-2">{currency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Last 30 days realized */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
        <h3 className="text-xs font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <Calendar size={12} className="text-slate-400" /> Últimos 30 días (realizado)
        </h3>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block">Cobrado</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">{currency(projection.recentInflow)}</span>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block">Pagado</span>
            <span className="font-black text-rose-600 dark:text-rose-400">{currency(projection.recentOutflow)}</span>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 block">Neto Real</span>
            <span className={`font-black ${(projection.recentInflow - projection.recentOutflow) >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {currency(projection.recentInflow - projection.recentOutflow)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
