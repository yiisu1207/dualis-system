// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  REPORTES CONTABLES — Pulso financiero del negocio en una vista          ║
// ║                                                                          ║
// ║  Reemplaza la vieja "Contabilidad" (AccountingSection) que era un        ║
// ║  directorio listado redundante con CxC/CxP. Ahora es la pantalla         ║
// ║  ejecutiva: el dueño abre y en 5 segundos sabe si el negocio va bien     ║
// ║  o mal este mes.                                                         ║
// ║                                                                          ║
// ║  Inspirado en patrones de Xero, QuickBooks, Stripe, Brex:                ║
// ║   · Hero row con 4 KPIs (Cash / CxC / CxP / Net del mes vs anterior)     ║
// ║   · 3 semáforos binarios (flujo positivo / cartera sana / runway)        ║
// ║   · Alertas en lenguaje natural ("Bs 12.500 vencidos hace +60 días")     ║
// ║   · P&L mini-chart 6 meses (barras apiladas, no tabla contable)          ║
// ║   · Aging CxC barra horizontal segmentada 0-30/31-60/61-90/90+           ║
// ║   · Top deudores con monto y días vencidos                               ║
// ║   · Próxima nómina con countdown (no como gasto del mes, como CxP)       ║
// ║   · Inventario solo low-stock alerts (no valor total — confunde dueños)  ║
// ║   · Toggle USD ↔ Bs en hero (multi-moneda VE — diferenciador real)       ║
// ║   · Layout plano scroll vertical, NO tabs anidados (anti-pattern)        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useMemo, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Users, Building2, Package, Clock, DollarSign, ArrowUpRight,
  ArrowDownRight, Activity, Calendar, AlertCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
  Legend,
} from 'recharts';
import type {
  Movement, Customer, Supplier, Employee, ExchangeRates, InventoryItem,
} from '../../types';
import { getMovementUsdAmount } from '../utils/formatters';

interface ReportesContablesProps {
  movements: Movement[];
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  inventoryItems?: InventoryItem[];
  rates: ExchangeRates;
  businessName?: string;
}

type Currency = 'USD' | 'BS';

const fmt = (amount: number, currency: Currency, rates: ExchangeRates) => {
  const value = currency === 'BS' ? amount * (rates.bcv || 1) : amount;
  const symbol = currency === 'BS' ? 'Bs.' : '$';
  return `${symbol} ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
};

const fmtCompact = (amount: number, currency: Currency, rates: ExchangeRates) => {
  const value = currency === 'BS' ? amount * (rates.bcv || 1) : amount;
  const symbol = currency === 'BS' ? 'Bs.' : '$';
  if (Math.abs(value) >= 1_000_000) return `${symbol} ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol} ${(value / 1_000).toFixed(1)}k`;
  return `${symbol} ${value.toFixed(0)}`;
};

export default function ReportesContables({
  movements,
  customers,
  suppliers,
  employees,
  inventoryItems = [],
  rates,
  businessName,
}: ReportesContablesProps) {
  const [currency, setCurrency] = useState<Currency>('USD');

  // ─── CALCULOS ──────────────────────────────────────────────────────────

  const now = useMemo(() => new Date(), []);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  // CxC: facturas - abonos por cliente. Saldo positivo = nos deben.
  const cxcStats = useMemo(() => {
    let total = 0;
    let overdue = 0;
    let overdueCount = 0;
    const byEntity = new Map<string, { name: string; balance: number; overdue: number; oldestDays: number }>();

    for (const m of movements) {
      if (m.anulada) continue;
      if ((m as any).isSupplierMovement) continue;
      if (!['FACTURA', 'ABONO'].includes(m.movementType as string)) continue;
      const usd = getMovementUsdAmount(m, rates);
      const sign = m.movementType === 'FACTURA' ? 1 : -1;
      total += sign * usd;

      const cust = customers.find(c => c.id === m.entityId);
      const name = m.entityName || cust?.fullName || cust?.nombre || m.entityId;
      const entry = byEntity.get(m.entityId) || { name, balance: 0, overdue: 0, oldestDays: 0 };
      entry.balance += sign * usd;
      entry.name = name;

      if (m.movementType === 'FACTURA' && !m.pagado) {
        const issued = new Date(m.date).getTime();
        const daysOld = Math.floor((now.getTime() - issued) / 86_400_000);
        if (daysOld > 30) {
          overdue += usd;
          overdueCount++;
          if (daysOld > entry.oldestDays) entry.oldestDays = daysOld;
          entry.overdue += usd;
        }
      }
      byEntity.set(m.entityId, entry);
    }

    const topDebtors = Array.from(byEntity.values())
      .filter(e => e.balance > 0.01)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    return { total: Math.max(0, total), overdue, overdueCount, topDebtors };
  }, [movements, customers, rates, now]);

  // CxP: facturas a proveedores - pagos. Positivo = les debemos.
  const cxpStats = useMemo(() => {
    let total = 0;
    let nextWeek = 0;
    let nextWeekCount = 0;
    const byEntity = new Map<string, { name: string; balance: number }>();

    for (const m of movements) {
      if (m.anulada) continue;
      if (!(m as any).isSupplierMovement) continue;
      if (!['FACTURA', 'ABONO'].includes(m.movementType as string)) continue;
      const usd = getMovementUsdAmount(m, rates);
      const sign = m.movementType === 'FACTURA' ? 1 : -1;
      total += sign * usd;

      const sup = suppliers.find(s => s.id === m.entityId);
      const name = m.entityName || sup?.contacto || sup?.id || m.entityId;
      const entry = byEntity.get(m.entityId) || { name, balance: 0 };
      entry.balance += sign * usd;
      entry.name = name;

      // Próximas a vencer en 7 días (con dueDate)
      if (m.movementType === 'FACTURA' && !m.pagado && m.dueDate) {
        const due = new Date(m.dueDate).getTime();
        const daysToDue = Math.floor((due - now.getTime()) / 86_400_000);
        if (daysToDue >= 0 && daysToDue <= 7) {
          nextWeek += usd;
          nextWeekCount++;
        }
      }
      byEntity.set(m.entityId, entry);
    }

    const topCreditors = Array.from(byEntity.values())
      .filter(e => e.balance > 0.01)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    return { total: Math.max(0, total), nextWeek, nextWeekCount, topCreditors };
  }, [movements, suppliers, rates, now]);

  // P&L del mes actual y anterior + serie 6 meses
  const plStats = useMemo(() => {
    const months: { key: string; label: string; ingresos: number; gastos: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: d.toLocaleString('es-VE', { month: 'short' }),
        ingresos: 0,
        gastos: 0,
        net: 0,
      });
    }

    for (const m of movements) {
      if (m.anulada) continue;
      const mKey = (m.date || '').slice(0, 7);
      const bucket = months.find(b => b.key === mKey);
      if (!bucket) continue;
      const usd = getMovementUsdAmount(m, rates);

      const isSale = m.movementType === 'VENTA' || (m.movementType === 'FACTURA' && !(m as any).isSupplierMovement);
      const isExpense = (m.movementType === 'FACTURA' && (m as any).isSupplierMovement) || m.movementType === 'GASTO';

      if (isSale) bucket.ingresos += usd;
      else if (isExpense) bucket.gastos += usd;
    }

    months.forEach(b => { b.net = b.ingresos - b.gastos; });

    const thisMonth = months[months.length - 1] || { ingresos: 0, gastos: 0, net: 0 };
    const prev = months[months.length - 2] || { ingresos: 0, gastos: 0, net: 0 };
    const netDelta = prev.net !== 0 ? ((thisMonth.net - prev.net) / Math.abs(prev.net)) * 100 : 0;

    return { months, thisMonth, prev, netDelta };
  }, [movements, rates, now]);

  // Aging CxC
  const aging = useMemo(() => {
    const buckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const m of movements) {
      if (m.anulada) continue;
      if ((m as any).isSupplierMovement) continue;
      if (m.movementType !== 'FACTURA' || m.pagado) continue;
      const issued = new Date(m.date).getTime();
      const daysOld = Math.floor((now.getTime() - issued) / 86_400_000);
      const usd = getMovementUsdAmount(m, rates);
      if (daysOld < 31) buckets.current += usd;
      else if (daysOld < 61) buckets.d31_60 += usd;
      else if (daysOld < 91) buckets.d61_90 += usd;
      else buckets.d90plus += usd;
    }
    const total = buckets.current + buckets.d31_60 + buckets.d61_90 + buckets.d90plus;
    return { ...buckets, total };
  }, [movements, rates, now]);

  // Caja efectiva = saldo de movimientos directos (ABONO recibido − ABONO pagado)
  // proxy simple: total ingresos del mes − gastos del mes acumulado en histórico.
  // En sistemas reales se hace contra cuentas bancarias; acá uso flujo neto histórico.
  const cashStats = useMemo(() => {
    let cash = 0;
    for (const m of movements) {
      if (m.anulada) continue;
      const usd = getMovementUsdAmount(m, rates);
      if (m.movementType === 'ABONO') {
        cash += (m as any).isSupplierMovement ? -usd : usd;
      }
    }
    return { cash: Math.max(0, cash) };
  }, [movements, rates]);

  // Próxima nómina (suma de salarios mensuales activos)
  const payrollNext = useMemo(() => {
    const activos = employees.filter(e => e.status === 'ACTIVO');
    const monthly = activos.reduce((s, e) => s + (e.salary || 0), 0);
    // Convención: nómina se paga fin de mes si no hay otra señal
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysToPayroll = Math.max(0, Math.ceil((lastDay.getTime() - now.getTime()) / 86_400_000));
    return { monthly, count: activos.length, daysToPayroll };
  }, [employees, now]);

  // Inventario: low stock alerts
  const inventoryAlerts = useMemo(() => {
    const lowStock = inventoryItems.filter(p => {
      const stock = (p as any).stock ?? 0;
      const minStock = (p as any).minStock ?? 0;
      return minStock > 0 && stock <= minStock;
    });
    const outOfStock = inventoryItems.filter(p => {
      const stock = (p as any).stock ?? 0;
      return stock <= 0;
    });
    return { lowStock, outOfStock };
  }, [inventoryItems]);

  // ─── SEMÁFOROS BINARIOS (patrón Brex/Ramp, no score 0-100) ─────────────
  const healthIndicators = useMemo(() => {
    const flowPositive = plStats.thisMonth.net > 0;
    const carteraSana = aging.total === 0 || (aging.d90plus / Math.max(1, aging.total)) < 0.2;
    const reservaOk = payrollNext.monthly === 0 || cashStats.cash >= payrollNext.monthly;
    return { flowPositive, carteraSana, reservaOk };
  }, [plStats, aging, payrollNext, cashStats]);

  // Alertas accionables en lenguaje natural
  const alerts = useMemo(() => {
    const list: { tone: 'rose' | 'amber' | 'indigo'; icon: any; text: string }[] = [];
    if (cxcStats.overdueCount > 0) {
      list.push({
        tone: 'rose',
        icon: AlertTriangle,
        text: `${fmt(cxcStats.overdue, currency, rates)} vencidos hace +30 días en ${cxcStats.overdueCount} factura${cxcStats.overdueCount === 1 ? '' : 's'}.`,
      });
    }
    if (aging.d90plus > 0) {
      list.push({
        tone: 'rose',
        icon: AlertCircle,
        text: `${fmt(aging.d90plus, currency, rates)} con +90 días sin cobrar — riesgo de pérdida.`,
      });
    }
    if (cxpStats.nextWeekCount > 0) {
      list.push({
        tone: 'amber',
        icon: Clock,
        text: `${fmt(cxpStats.nextWeek, currency, rates)} a pagar a proveedores en los próximos 7 días (${cxpStats.nextWeekCount} factura${cxpStats.nextWeekCount === 1 ? '' : 's'}).`,
      });
    }
    if (payrollNext.monthly > 0 && payrollNext.daysToPayroll <= 5) {
      list.push({
        tone: 'amber',
        icon: Calendar,
        text: `Nómina de ${fmt(payrollNext.monthly, currency, rates)} en ${payrollNext.daysToPayroll === 0 ? 'hoy' : `${payrollNext.daysToPayroll}d`} (${payrollNext.count} empleados).`,
      });
    }
    if (inventoryAlerts.outOfStock.length > 0) {
      list.push({
        tone: 'rose',
        icon: Package,
        text: `${inventoryAlerts.outOfStock.length} producto${inventoryAlerts.outOfStock.length === 1 ? '' : 's'} sin stock.`,
      });
    } else if (inventoryAlerts.lowStock.length > 0) {
      list.push({
        tone: 'amber',
        icon: Package,
        text: `${inventoryAlerts.lowStock.length} producto${inventoryAlerts.lowStock.length === 1 ? '' : 's'} con stock bajo.`,
      });
    }
    if (plStats.thisMonth.net < 0) {
      list.push({
        tone: 'rose',
        icon: TrendingDown,
        text: `Estás gastando más de lo que ingresás este mes (${fmt(plStats.thisMonth.net, currency, rates)}).`,
      });
    }
    return list;
  }, [cxcStats, cxpStats, aging, payrollNext, plStats, inventoryAlerts, currency, rates]);

  // ─── RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-50 dark:bg-slate-900">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Pulso financiero</h1>
            <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">
              Cómo va {businessName || 'el negocio'} este mes — todo en un vistazo
            </p>
          </div>
          {/* Toggle moneda */}
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-white/[0.04] p-0.5">
            {(['USD', 'BS'] as Currency[]).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  currency === c
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-500 dark:text-white/40 hover:text-slate-700'
                }`}
              >
                {c === 'USD' ? '$ USD' : 'Bs. Bolívares'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Hero: 4 KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Caja */}
          <KpiCard
            label="Caja efectiva"
            value={fmt(cashStats.cash, currency, rates)}
            sub={`${plStats.months.length} meses de historial`}
            icon={<Wallet size={14} />}
            tone="indigo"
          />
          {/* CxC */}
          <KpiCard
            label="Te deben (CxC)"
            value={fmt(cxcStats.total, currency, rates)}
            sub={cxcStats.overdueCount > 0
              ? `${fmt(cxcStats.overdue, currency, rates)} vencido`
              : 'al día'}
            subTone={cxcStats.overdueCount > 0 ? 'rose' : 'emerald'}
            icon={<Users size={14} />}
            tone="slate"
          />
          {/* CxP */}
          <KpiCard
            label="Debes (CxP)"
            value={fmt(cxpStats.total, currency, rates)}
            sub={cxpStats.nextWeekCount > 0
              ? `${fmt(cxpStats.nextWeek, currency, rates)} en 7d`
              : 'sin urgencias'}
            subTone={cxpStats.nextWeekCount > 0 ? 'amber' : 'emerald'}
            icon={<Building2 size={14} />}
            tone="slate"
          />
          {/* Net del mes */}
          <KpiCard
            label="Resultado del mes"
            value={fmt(plStats.thisMonth.net, currency, rates)}
            sub={
              <>
                {plStats.netDelta >= 0 ? <ArrowUpRight size={11} className="inline text-emerald-500" /> : <ArrowDownRight size={11} className="inline text-rose-500" />}
                {' '}
                <span className={plStats.netDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {Math.abs(plStats.netDelta).toFixed(0)}%
                </span>
                {' vs mes anterior'}
              </>
            }
            icon={plStats.thisMonth.net >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            tone={plStats.thisMonth.net >= 0 ? 'emerald' : 'rose'}
          />
        </div>

        {/* ── Semáforos binarios ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <HealthChip
            ok={healthIndicators.flowPositive}
            okText="Flujo positivo"
            badText="Flujo negativo"
            okSub="Ingresos > gastos este mes"
            badSub={`${fmt(Math.abs(plStats.thisMonth.net), currency, rates)} de pérdida este mes`}
          />
          <HealthChip
            ok={healthIndicators.carteraSana}
            okText="Cartera sana"
            badText="Cartera en riesgo"
            okSub={aging.total === 0 ? 'sin facturas pendientes' : `<20% con +90d (${((aging.d90plus / Math.max(1, aging.total)) * 100).toFixed(0)}%)`}
            badSub={`${((aging.d90plus / Math.max(1, aging.total)) * 100).toFixed(0)}% del CxC con +90 días`}
          />
          <HealthChip
            ok={healthIndicators.reservaOk}
            okText="Cubre nómina"
            badText="Reserva insuficiente"
            okSub={payrollNext.monthly === 0 ? 'sin nómina activa' : 'caja ≥ próxima nómina'}
            badSub={`Caja ${fmt(cashStats.cash, currency, rates)} < nómina ${fmt(payrollNext.monthly, currency, rates)}`}
          />
        </div>

        {/* ── Alertas accionables ── */}
        {alerts.length > 0 && (
          <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.04] flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
                Atención
              </h3>
              <span className="text-[10px] text-slate-400 dark:text-white/30">· {alerts.length}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {alerts.map((a, i) => {
                const Icon = a.icon;
                const colorCls = a.tone === 'rose'
                  ? 'text-rose-600 dark:text-rose-400'
                  : a.tone === 'amber'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-indigo-600 dark:text-indigo-400';
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <Icon size={14} className={`shrink-0 ${colorCls}`} />
                    <p className="text-sm text-slate-700 dark:text-white/70">{a.text}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 2 columnas: P&L (60%) + Aging CxC (40%) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* P&L 6 meses */}
          <section className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
                  Ingresos vs Gastos
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5">Últimos 6 meses</p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                  <span className="text-slate-500 dark:text-white/40">Ingresos</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-rose-500" />
                  <span className="text-slate-500 dark:text-white/40">Gastos</span>
                </span>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plStats.months} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#ffffff' }}
                    formatter={(value: number, name: string) => [
                      fmt(value, currency, rates),
                      name === 'ingresos' ? 'Ingresos' : 'Gastos',
                    ]}
                  />
                  <Bar dataKey="ingresos" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {plStats.months.map((_, i) => <Cell key={i} fill="rgba(16,185,129,0.85)" />)}
                  </Bar>
                  <Bar dataKey="gastos" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {plStats.months.map((_, i) => <Cell key={i} fill="rgba(244,63,94,0.85)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Aging CxC */}
          <section className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
                Antigüedad de cartera
              </h3>
              <span className="text-[10px] text-slate-400 dark:text-white/30">
                Total: {fmt(aging.total, currency, rates)}
              </span>
            </div>
            {aging.total === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 size={28} className="mx-auto text-emerald-400/60 mb-2" />
                <p className="text-sm text-slate-500 dark:text-white/40">Sin cartera pendiente</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {[
                    { label: '0-30 días', value: aging.current, tone: 'emerald' },
                    { label: '31-60 días', value: aging.d31_60, tone: 'amber' },
                    { label: '61-90 días', value: aging.d61_90, tone: 'amber' },
                    { label: '+90 días', value: aging.d90plus, tone: 'rose' },
                  ].map(b => {
                    const pct = aging.total > 0 ? (b.value / aging.total) * 100 : 0;
                    const textCls = b.tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
                      : b.tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400';
                    const bgCls = b.tone === 'emerald' ? 'bg-emerald-500'
                      : b.tone === 'amber' ? 'bg-amber-500'
                      : 'bg-rose-500';
                    return (
                      <div key={b.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500 dark:text-white/50">{b.label}</span>
                          <span className={`font-semibold tabular-nums ${textCls}`}>{fmt(b.value, currency, rates)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.04] overflow-hidden">
                          <div className={`h-full ${bgCls}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ── 2 columnas: Top deudores + Top proveedores ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankList
            title="Top deudores"
            icon={<Users size={13} className="text-rose-500" />}
            empty="Sin clientes con deuda"
            items={cxcStats.topDebtors.map(d => ({
              name: d.name,
              amount: fmt(d.balance, currency, rates),
              sub: d.overdue > 0 ? `${fmt(d.overdue, currency, rates)} vencido · ${d.oldestDays}d` : 'al día',
              subTone: d.overdue > 0 ? 'rose' : 'slate',
            }))}
          />
          <RankList
            title="Top acreedores (proveedores)"
            icon={<Building2 size={13} className="text-amber-500" />}
            empty="Sin deuda con proveedores"
            items={cxpStats.topCreditors.map(c => ({
              name: c.name,
              amount: fmt(c.balance, currency, rates),
              sub: '',
              subTone: 'slate' as const,
            }))}
          />
        </div>

        {/* ── Próxima nómina + Inventario alertas ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Próxima nómina */}
          <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={13} className="text-indigo-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
                Próxima nómina
              </h3>
            </div>
            {payrollNext.monthly === 0 ? (
              <p className="text-sm text-slate-400 dark:text-white/30 py-3">Sin empleados activos</p>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                    {fmt(payrollNext.monthly, currency, rates)}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/40 mt-0.5">
                    {payrollNext.count} empleado{payrollNext.count === 1 ? '' : 's'} activo{payrollNext.count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-semibold tabular-nums ${
                    payrollNext.daysToPayroll <= 3 ? 'text-rose-600 dark:text-rose-400'
                    : payrollNext.daysToPayroll <= 7 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-700 dark:text-white/70'
                  }`}>
                    {payrollNext.daysToPayroll === 0 ? 'Hoy' : `${payrollNext.daysToPayroll}d`}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-white/40 mt-0.5">
                    {payrollNext.daysToPayroll === 0 ? 'pago hoy' : 'para pagar'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Inventario alertas */}
          <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={13} className="text-indigo-500" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
                Inventario
              </h3>
              <span className="text-[10px] text-slate-400 dark:text-white/30 ml-auto">
                {inventoryItems.length} {inventoryItems.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            {inventoryAlerts.outOfStock.length === 0 && inventoryAlerts.lowStock.length === 0 ? (
              <div className="text-center py-3">
                <CheckCircle2 size={22} className="mx-auto text-emerald-400/60 mb-1.5" />
                <p className="text-sm text-slate-500 dark:text-white/40">Stock saludable en todos los productos</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {inventoryAlerts.outOfStock.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">{inventoryAlerts.outOfStock.length}</span>
                    <span className="text-slate-600 dark:text-white/60">sin stock</span>
                    <span className="text-[11px] text-slate-400 dark:text-white/30 ml-auto truncate max-w-[200px]">
                      {inventoryAlerts.outOfStock.slice(0, 2).map(p => p.name).join(', ')}
                      {inventoryAlerts.outOfStock.length > 2 && ` +${inventoryAlerts.outOfStock.length - 2}`}
                    </span>
                  </div>
                )}
                {inventoryAlerts.lowStock.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{inventoryAlerts.lowStock.length}</span>
                    <span className="text-slate-600 dark:text-white/60">stock bajo</span>
                    <span className="text-[11px] text-slate-400 dark:text-white/30 ml-auto truncate max-w-[200px]">
                      {inventoryAlerts.lowStock.slice(0, 2).map(p => p.name).join(', ')}
                      {inventoryAlerts.lowStock.length > 2 && ` +${inventoryAlerts.lowStock.length - 2}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Footer: comparativo MoM compacto ── */}
        <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-indigo-500" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
              Mes a mes
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Compare label="Ingresos" current={plStats.thisMonth.ingresos} previous={plStats.prev.ingresos} positive={true} currency={currency} rates={rates} />
            <Compare label="Gastos" current={plStats.thisMonth.gastos} previous={plStats.prev.gastos} positive={false} currency={currency} rates={rates} />
            <Compare label="Resultado neto" current={plStats.thisMonth.net} previous={plStats.prev.net} positive={true} currency={currency} rates={rates} />
          </div>
        </section>

        <div className="text-[11px] text-slate-400 dark:text-white/25 text-center pt-2">
          Datos en vivo desde Firestore · Actualización automática
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, subTone, icon, tone }: {
  label: string;
  value: string;
  sub: React.ReactNode;
  subTone?: 'rose' | 'amber' | 'emerald' | 'slate';
  icon?: React.ReactNode;
  tone: 'indigo' | 'emerald' | 'rose' | 'slate';
}) {
  const toneCls = tone === 'emerald' ? 'border-emerald-200 dark:border-emerald-500/20'
    : tone === 'rose' ? 'border-rose-200 dark:border-rose-500/20'
    : tone === 'indigo' ? 'border-indigo-200 dark:border-indigo-500/20'
    : 'border-slate-200 dark:border-white/[0.06]';
  const subCls = subTone === 'rose' ? 'text-rose-600 dark:text-rose-400'
    : subTone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : subTone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-500 dark:text-white/40';
  const iconCls = tone === 'emerald' ? 'text-emerald-500'
    : tone === 'rose' ? 'text-rose-500'
    : tone === 'indigo' ? 'text-indigo-500'
    : 'text-slate-400 dark:text-white/30';
  return (
    <div className={`rounded-xl border ${toneCls} bg-white dark:bg-white/[0.02] p-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={iconCls}>{icon}</span>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-white/40">{label}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className={`text-[11px] mt-1 ${subCls}`}>{sub}</p>
    </div>
  );
}

function HealthChip({ ok, okText, badText, okSub, badSub }: {
  ok: boolean;
  okText: string;
  badText: string;
  okSub: string;
  badSub: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${
      ok
        ? 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/50 dark:bg-emerald-500/[0.04]'
        : 'border-rose-200 dark:border-rose-500/25 bg-rose-50/50 dark:bg-rose-500/[0.04]'
    }`}>
      <div className="flex items-center gap-2">
        {ok
          ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
          : <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400" />}
        <p className={`text-sm font-semibold ${
          ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
        }`}>
          {ok ? okText : badText}
        </p>
      </div>
      <p className="text-[11px] mt-1 text-slate-500 dark:text-white/40">
        {ok ? okSub : badSub}
      </p>
    </div>
  );
}

function RankList({ title, icon, items, empty }: {
  title: string;
  icon: React.ReactNode;
  items: { name: string; amount: string; sub: string; subTone: 'rose' | 'slate' }[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.04] flex items-center gap-2">
        {icon}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
          {title}
        </h3>
        <span className="text-[10px] text-slate-400 dark:text-white/30 ml-auto">Top {items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-slate-400 dark:text-white/30">{empty}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {items.map((it, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700 dark:text-white/70 truncate">{it.name}</p>
                <p className={`text-[11px] mt-0.5 ${
                  it.subTone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-white/30'
                }`}>
                  {it.sub}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white shrink-0">{it.amount}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Compare({ label, current, previous, positive, currency, rates }: {
  label: string;
  current: number;
  previous: number;
  /** true = subir es bueno (ingresos, neto). false = subir es malo (gastos). */
  positive: boolean;
  currency: Currency;
  rates: ExchangeRates;
}) {
  const delta = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const upIsGood = positive;
  const isUp = delta > 0;
  const isGood = (isUp && upIsGood) || (!isUp && !upIsGood);
  const tone = Math.abs(delta) < 0.5 ? 'slate' : isGood ? 'emerald' : 'rose';
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 dark:text-white/40">{label}</p>
      <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-white mt-1">
        {fmt(current, currency, rates)}
      </p>
      <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${
        tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'rose' ? 'text-rose-600 dark:text-rose-400'
        : 'text-slate-400 dark:text-white/30'
      }`}>
        {Math.abs(delta) >= 0.5 && (isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />)}
        <span>{Math.abs(delta).toFixed(0)}% vs anterior</span>
      </p>
    </div>
  );
}
