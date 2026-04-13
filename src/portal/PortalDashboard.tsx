import React, { useCallback } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import {
  CreditCard, Calendar, TrendingDown, Clock, Zap, Receipt,
  ArrowUpDown, CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PortalPaymentTimeline from '../components/portal/PortalPaymentTimeline';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

export default function PortalDashboard() {
  const { businessId, customerId, customerName, currencySymbol } = usePortal();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const {
    loading,
    balances,
    aging,
    creditLimit,
    creditAvailable,
    invoicesWithDiscount,
    upcomingDueDates,
    rates,
    portalPayments,
  } = usePortalData(businessId, customerId);

  const { refreshing } = usePullToRefresh(useCallback(async () => { await new Promise(r => setTimeout(r, 400)); }, []));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalDebt = Math.max(0, balances.total);
  const creditPct = creditLimit > 0 ? (totalDebt / creditLimit) * 100 : 0;
  const prontoPayoCount = invoicesWithDiscount.filter((i) => i.eligibleTier).length;
  const overdue = upcomingDueDates.filter((d) => d.daysUntilDue < 0);
  const dueSoon = upcomingDueDates.filter((d) => d.daysUntilDue >= 0 && d.daysUntilDue <= 7);
  const recentPayments = portalPayments
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-5 animate-in">
      {refreshing && (
        <div className="flex justify-center py-2">
          <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
      {/* Welcome */}
      <div>
        <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
          Hola, {customerName.split(' ')[0]}
        </h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">
          Resumen de tu cuenta al {new Date().toLocaleDateString('es-VE')}
        </p>
      </div>

      {/* Timeline de pagos en curso (últimos 7 días) */}
      <PortalPaymentTimeline businessId={businessId} payments={portalPayments} />

      {/* Exchange Rates — BCV + dynamic custom rates */}
      {(rates.bcv > 0 || rates.customRates.some(r => r.enabled && r.value > 0)) && (() => {
        const CUSTOM_COLORS = ['violet', 'emerald', 'amber'];
        const rateCards = [
          { label: 'BCV', value: rates.bcv, color: 'sky' },
          ...rates.customRates
            .filter(r => r.enabled && r.value > 0)
            .map((r, i) => ({ label: r.name, value: r.value, color: CUSTOM_COLORS[i % CUSTOM_COLORS.length] })),
        ];
        const cols = rateCards.length <= 2 ? 'grid-cols-2' : rateCards.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';
        return (
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpDown size={13} className="text-sky-400" />
              <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
                Tasas de Cambio
              </h3>
              {rates.lastUpdated && (
                <span className="text-[8px] font-bold text-white/20 ml-auto">
                  Actualizado: {new Date(rates.lastUpdated).toLocaleDateString('es-VE')}
                </span>
              )}
            </div>
            <div className={`grid ${cols} gap-2 sm:gap-4`}>
              {rateCards.map((r) => (
                <div
                  key={r.label}
                  className={`rounded-xl p-3 sm:p-4 text-center border border-${r.color}-500/20 bg-${r.color}-500/5`}
                >
                  <p className={`text-[9px] font-black uppercase tracking-widest text-${r.color}-400/60`}>
                    {r.label}
                  </p>
                  <p className={`text-lg sm:text-xl font-black text-${r.color}-400 mt-0.5 font-mono`}>
                    {r.value > 0 ? r.value.toFixed(2) : '\u2014'}
                  </p>
                  <p className="text-[8px] font-bold text-white/20 mt-0.5">Bs/$</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Debt */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/40">
              Deuda Total
            </p>
            <TrendingDown size={13} className="text-rose-400" />
          </div>
          <p className={`text-lg sm:text-2xl font-black ${totalDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatCurrency(totalDebt, currencySymbol)}
          </p>
          <div className="mt-1.5 flex flex-col sm:flex-row gap-1 sm:gap-3 text-[9px] font-bold text-white/30">
            <span>BCV: {formatCurrency(Math.max(0, balances.bcv), currencySymbol)}</span>
            <span>Grupo: {formatCurrency(Math.max(0, balances.grupo), currencySymbol)}</span>
            <span>Divisa: {formatCurrency(Math.max(0, balances.divisa), currencySymbol)}</span>
          </div>
        </div>

        {/* Credit Available */}
        {creditLimit > 0 && (
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/40">
                Crédito
              </p>
              <CreditCard size={13} className="text-violet-400" />
            </div>
            <p className="text-lg sm:text-2xl font-black text-violet-400">
              {formatCurrency(creditAvailable, currencySymbol)}
            </p>
            <div className="mt-1.5">
              <div className="w-full h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    creditPct > 90 ? 'bg-rose-500' : creditPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, creditPct)}%` }}
                />
              </div>
              <p className="text-[8px] font-bold text-white/30 mt-1">
                {creditPct.toFixed(0)}% usado · Límite: {currencySymbol}{creditLimit.toFixed(0)}
              </p>
            </div>
          </div>
        )}

        {/* Pronto Pago */}
        <div
          className={`bg-[#0d1424] rounded-2xl border p-4 sm:p-5 shadow-lg cursor-pointer active:scale-[0.98] hover:border-emerald-500/30 transition-all ${
            prontoPayoCount > 0 ? 'border-emerald-500/20' : 'border-white/[0.07]'
          }`}
          onClick={() => navigate(`/portal/${slug}/pronto-pago`)}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/40">
              Pronto Pago
            </p>
            <Zap size={13} className={prontoPayoCount > 0 ? 'text-emerald-400' : 'text-white/20'} />
          </div>
          <p className={`text-lg sm:text-2xl font-black ${prontoPayoCount > 0 ? 'text-emerald-400' : 'text-white/20'}`}>
            {prontoPayoCount}
          </p>
          <p className="text-[9px] font-bold text-white/30 mt-1">
            {prontoPayoCount > 0
              ? `${prontoPayoCount} con descuento`
              : 'Sin descuentos'}
          </p>
        </div>

        {/* Due Soon */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white/40">
              Vencimientos
            </p>
            <Calendar size={13} className={overdue.length > 0 ? 'text-rose-400' : 'text-amber-400'} />
          </div>
          {overdue.length > 0 ? (
            <>
              <p className="text-lg sm:text-2xl font-black text-rose-400">{overdue.length}</p>
              <p className="text-[9px] font-bold text-rose-400/60 mt-1">
                {overdue.length} vencida{overdue.length !== 1 ? 's' : ''}
              </p>
            </>
          ) : dueSoon.length > 0 ? (
            <>
              <p className="text-lg sm:text-2xl font-black text-amber-400">{dueSoon.length}</p>
              <p className="text-[9px] font-bold text-amber-400/60 mt-1">
                Vence{dueSoon.length !== 1 ? 'n' : ''} esta semana
              </p>
            </>
          ) : (
            <>
              <p className="text-lg sm:text-2xl font-black text-emerald-400">0</p>
              <p className="text-[9px] font-bold text-white/30 mt-1">Todo al día</p>
            </>
          )}
        </div>
      </div>

      {/* Aging Buckets */}
      {totalDebt > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
            Antigüedad de Deuda
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {([
              { label: '0-30d', value: aging.current, color: 'emerald' },
              { label: '31-60d', value: aging.d31_60, color: 'amber' },
              { label: '61-90d', value: aging.d61_90, color: 'orange' },
              { label: '90+d', value: aging.d90plus, color: 'rose' },
            ] as const).map((b) => (
              <div
                key={b.label}
                className={`rounded-xl p-3 text-center border ${
                  b.value > 0
                    ? `border-${b.color}-500/20 bg-${b.color}-500/5`
                    : 'border-white/[0.05] bg-white/[0.02]'
                }`}
              >
                <p className="text-[8px] font-black uppercase text-white/40">{b.label}</p>
                <p className={`text-base sm:text-lg font-black mt-0.5 ${
                  b.value > 0 ? `text-${b.color}-400` : 'text-white/10'
                }`}>
                  {formatCurrency(b.value, currencySymbol)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments (history) */}
      {recentPayments.length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
          <div className="px-4 sm:px-6 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Mis Pagos Recientes
            </h3>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {recentPayments.map((p) => (
              <div key={p.id} className="px-4 sm:px-6 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  p.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400'
                    : p.status === 'rejected' ? 'bg-rose-500/10 text-rose-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {p.status === 'approved' ? <CheckCircle2 size={14} />
                    : p.status === 'rejected' ? <XCircle size={14} />
                    : <Clock size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white/70 truncate">
                    {p.metodoPago} · {p.referencia}
                  </p>
                  <p className="text-[9px] text-white/30">
                    {new Date(p.createdAt).toLocaleDateString('es-VE')} · {p.accountType}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-white/80 font-mono">
                    {currencySymbol}{p.amount.toFixed(2)}
                  </p>
                  <p className={`text-[8px] font-black uppercase ${
                    p.status === 'approved' ? 'text-emerald-400'
                      : p.status === 'rejected' ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}>
                    {p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Due Dates */}
      {upcomingDueDates.length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
          <div className="px-4 sm:px-6 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Próximos Vencimientos
            </h3>
            <Clock size={12} className="text-white/20" />
          </div>
          <div className="divide-y divide-white/[0.05]">
            {upcomingDueDates.slice(0, 6).map((item) => (
              <div
                key={item.movement.id}
                className="px-4 sm:px-6 py-3 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white/70 truncate">
                    {item.movement.concept}
                  </p>
                  <p className="text-[9px] text-white/30">
                    {(item.movement as any).nroControl || item.movement.date} · {item.movement.accountType}
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-sm font-black text-white/80 font-mono">
                    {formatCurrency(item.amountUsd, currencySymbol)}
                  </p>
                  <p className={`text-[9px] font-black ${
                    item.daysUntilDue < 0
                      ? 'text-rose-400'
                      : item.daysUntilDue <= 3
                      ? 'text-amber-400'
                      : 'text-white/30'
                  }`}>
                    {item.daysUntilDue < 0
                      ? `Vencida ${Math.abs(item.daysUntilDue)}d`
                      : item.daysUntilDue === 0
                      ? 'Hoy'
                      : `${item.daysUntilDue}d`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate(`/portal/${slug}/pagar`)}
          className="p-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-left shadow-lg shadow-indigo-500/20 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] transition-all"
        >
          <CreditCard size={18} className="text-white/80 mb-2" />
          <p className="text-sm font-black text-white">Registrar Pago</p>
          <p className="text-[9px] font-bold text-white/50 mt-0.5">
            Envía tu comprobante
          </p>
        </button>
        <button
          onClick={() => navigate(`/portal/${slug}/estado-cuenta`)}
          className="p-5 rounded-2xl bg-[#0d1424] border border-white/[0.07] text-left shadow-lg hover:border-white/[0.12] active:scale-[0.98] transition-all"
        >
          <Receipt size={18} className="text-white/40 mb-2" />
          <p className="text-sm font-black text-white/80">Estado de Cuenta</p>
          <p className="text-[9px] font-bold text-white/30 mt-0.5">
            Balance por cuenta
          </p>
        </button>
        <button
          onClick={() => navigate(`/portal/${slug}/ayuda`)}
          className="p-5 rounded-2xl bg-[#0d1424] border border-white/[0.07] text-left shadow-lg hover:border-white/[0.12] active:scale-[0.98] transition-all"
        >
          <HelpCircle size={18} className="text-white/40 mb-2" />
          <p className="text-sm font-black text-white/80">Centro de Ayuda</p>
          <p className="text-[9px] font-bold text-white/30 mt-0.5">
            Guías y tutoriales
          </p>
        </button>
      </div>
    </div>
  );
}
