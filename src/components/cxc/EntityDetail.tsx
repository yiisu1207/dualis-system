import React, { useMemo, useState } from 'react';
import { ArrowLeft, FileText, CreditCard, MessageCircle, ChevronLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Customer, Supplier, Movement, CustomRate, ExchangeRates, CreditScore } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';
import {
  calcAccountBalances,
  calculateAgingBuckets,
  calcCreditScore,
  daysSince,
  getInitials,
  resolveAccountLabel,
  formatDateTime,
} from './cxcHelpers';
import { AccountCard } from './AccountCard';
import { LedgerView } from './LedgerView';

interface EntityDetailProps {
  mode: 'cxc' | 'cxp';
  entity: Customer | Supplier;
  movements: Movement[];
  rates: ExchangeRates;
  bcvRate: number;
  customRates: CustomRate[];
  onRegisterMovement: (type: 'FACTURA' | 'ABONO', accountPreset?: string) => void;
  onEditMovement?: (movement: Movement) => void;
  onDeleteMovement?: (id: string) => void;
  onUpdateEntity?: (id: string, data: Partial<Customer>) => Promise<void>;
  onBack?: () => void;
  canEdit: boolean;
}

type Tab = 'resumen' | 'movimientos' | 'config';

const SCORE_STYLES: Record<string, { bg: string; text: string }> = {
  EXCELENTE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  BUENO: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
  REGULAR: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  RIESGO: { bg: 'bg-rose-500/10', text: 'text-rose-400' },
};

export function EntityDetail({
  mode,
  entity,
  movements,
  rates,
  bcvRate,
  customRates,
  onRegisterMovement,
  onEditMovement,
  onDeleteMovement,
  onUpdateEntity,
  onBack,
  canEdit,
}: EntityDetailProps) {
  const [tab, setTab] = useState<Tab>('resumen');

  const isCxC = mode === 'cxc';
  const customer = isCxC ? (entity as Customer) : null;

  const entityName = (entity as any).fullName || (entity as any).nombre || entity.id || 'Entidad';
  const entityDoc = (entity as Customer).cedula || (entity as Customer).rif || (entity as Supplier).rif || '';

  const entityMovements = useMemo(
    () => movements.filter(m => m.entityId === entity.id && (isCxC ? !m.isSupplierMovement : m.isSupplierMovement)),
    [movements, entity.id, isCxC]
  );

  const accountBalances = useMemo(
    () => calcAccountBalances(entityMovements, bcvRate, customRates, rates),
    [entityMovements, bcvRate, customRates, rates]
  );

  const totalBalance = useMemo(
    () => accountBalances.reduce((s, a) => s + a.balance, 0),
    [accountBalances]
  );

  const aging = useMemo(
    () => isCxC ? calculateAgingBuckets(entityMovements, rates) : null,
    [entityMovements, rates, isCxC]
  );

  const score = useMemo(() => isCxC ? calcCreditScore(entityMovements) : null, [entityMovements, isCxC]);

  // 6-month trend data
  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; facturas: number; abonos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: d.toLocaleString('es-VE', { month: 'short' }),
        facturas: 0,
        abonos: 0,
      });
    }
    entityMovements.forEach(m => {
      if (m.anulada) return;
      const mKey = m.date?.slice(0, 7);
      const bucket = months.find(mo => mo.key === mKey);
      if (!bucket) return;
      const usd = getMovementUsdAmount(m, rates);
      if (m.movementType === 'FACTURA') bucket.facturas += usd;
      else if (m.movementType === 'ABONO') bucket.abonos += usd;
    });
    return months;
  }, [entityMovements, rates]);

  // Recent 5 movements
  const recentMovements = useMemo(
    () => [...entityMovements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [entityMovements]
  );

  // Credit config state (CxC only)
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit?.toString() || '0');
  const [defaultDays, setDefaultDays] = useState(customer?.defaultPaymentDays ?? 30);
  const [creditApproved, setCreditApproved] = useState(customer?.creditApproved ?? false);
  const [internalNotes, setInternalNotes] = useState(customer?.internalNotes || '');
  const [savingConfig, setSavingConfig] = useState(false);

  const handleSaveConfig = async () => {
    if (!onUpdateEntity || !customer) return;
    setSavingConfig(true);
    try {
      await onUpdateEntity(customer.id, {
        creditLimit: parseFloat(creditLimit) || 0,
        defaultPaymentDays: defaultDays,
        creditApproved,
        internalNotes: internalNotes.trim(),
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
        tab === t
          ? 'border-indigo-500 text-indigo-500'
          : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'
      }`}
    >
      {label}
    </button>
  );

  const inp = "w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all";
  const lbl = "text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start gap-4 mb-4">
          {onBack && (
            <button onClick={onBack} className="mt-1 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all lg:hidden">
              <ChevronLeft size={16} className="text-slate-400" />
            </button>
          )}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
            totalBalance > 0.01 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-300 dark:text-white/20'
          }`}>
            {getInitials(entityName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-slate-900 dark:text-white truncate">{entityName}</h2>
              {score && (
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black ${SCORE_STYLES[score]?.bg} ${SCORE_STYLES[score]?.text}`}>
                  {score}
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 mt-0.5">
              {entityDoc}
              {(entity as Customer).telefono && ` · ${(entity as Customer).telefono}`}
              {(entity as Customer).email && ` · ${(entity as Customer).email}`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onRegisterMovement('FACTURA')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all"
            >
              <FileText size={12} /> Factura
            </button>
            <button
              onClick={() => onRegisterMovement('ABONO')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
            >
              <CreditCard size={12} /> Abono
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {tabBtn('resumen', 'Resumen')}
          {tabBtn('movimientos', 'Movimientos')}
          {isCxC && tabBtn('config', 'Config')}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* ═══ TAB: RESUMEN ═══ */}
        {tab === 'resumen' && (
          <div className="p-5 space-y-6">
            {/* Account Cards */}
            {accountBalances.length > 0 ? (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Cuentas activas</p>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {accountBalances.map(acc => (
                    <AccountCard
                      key={acc.accountType}
                      accountType={acc.accountType}
                      label={acc.label}
                      color={acc.color}
                      balanceUSD={acc.balance}
                      overdueUSD={acc.overdue}
                      lastMovementDate={acc.lastDate}
                      onRegisterAbono={() => onRegisterMovement('ABONO', acc.accountType)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-8 text-center">
                <p className="text-sm font-bold text-slate-300 dark:text-white/15">Sin movimientos registrados</p>
              </div>
            )}

            {/* Aging (CxC only) */}
            {isCxC && aging && (aging.current + aging.d31_60 + aging.d61_90 + aging.d90plus) > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Antiguedad de deuda</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '0-30d', value: aging.current, color: 'emerald' },
                    { label: '31-60d', value: aging.d31_60, color: 'amber' },
                    { label: '61-90d', value: aging.d61_90, color: 'orange' },
                    { label: '90+d', value: aging.d90plus, color: 'rose' },
                  ].map(b => (
                    <div key={b.label} className={`rounded-xl bg-${b.color}-500/[0.06] border border-${b.color}-500/20 px-3 py-2.5 text-center`}>
                      <p className={`text-[9px] font-black uppercase text-${b.color}-400/60`}>{b.label}</p>
                      <p className={`text-sm font-black text-${b.color}-500 mt-0.5`}>${b.value.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trend Chart */}
            {trendData.some(m => m.facturas > 0 || m.abonos > 0) && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Tendencia 6 meses</p>
                <div className="h-40 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} barGap={2}>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, fontSize: 11, fontWeight: 700 }}
                        formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === 'facturas' ? 'Facturas' : 'Abonos']}
                      />
                      <Bar dataKey="facturas" radius={[4, 4, 0, 0]} maxBarSize={20}>
                        {trendData.map((_, i) => <Cell key={i} fill="rgba(244,63,94,0.6)" />)}
                      </Bar>
                      <Bar dataKey="abonos" radius={[4, 4, 0, 0]} maxBarSize={20}>
                        {trendData.map((_, i) => <Cell key={i} fill="rgba(16,185,129,0.6)" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Recent movements */}
            {recentMovements.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-3">Ultimos movimientos</p>
                <div className="space-y-1.5">
                  {recentMovements.map(m => {
                    const isFactura = m.movementType === 'FACTURA';
                    const usd = getMovementUsdAmount(m, rates);
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFactura ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 dark:text-white/60 truncate">
                            {isFactura ? 'Factura' : 'Abono'} · {resolveAccountLabel(m.accountType as string, customRates)}
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-white/25">{m.concept || '-'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-black ${isFactura ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {isFactura ? '+' : '-'}${usd.toFixed(2)}
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-white/25">{m.date?.split('T')[0]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Credit info (CxC) */}
            {isCxC && customer?.creditLimit && customer.creditLimit > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Credito</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-white/40">Limite</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">${customer.creditLimit.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-white/40">Usado</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">${Math.max(0, totalBalance).toFixed(2)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      totalBalance / customer.creditLimit > 0.9 ? 'bg-rose-500' : totalBalance / customer.creditLimit > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, (totalBalance / customer.creditLimit) * 100))}%` }}
                  />
                </div>
                <p className="text-[9px] font-bold text-slate-400 dark:text-white/25 text-right">
                  {Math.max(0, customer.creditLimit - totalBalance).toFixed(2)} USD disponible
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: MOVIMIENTOS ═══ */}
        {tab === 'movimientos' && (
          <div className="p-5">
            <LedgerView
              movements={movements}
              entityId={entity.id}
              rates={rates}
              customRates={customRates}
              onEdit={canEdit ? onEditMovement : undefined}
              onDelete={canEdit ? onDeleteMovement : undefined}
              canEdit={canEdit}
              mode={mode}
            />
          </div>
        )}

        {/* ═══ TAB: CONFIG (CxC only) ═══ */}
        {tab === 'config' && isCxC && customer && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Limite de credito (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={creditLimit}
                  onChange={e => setCreditLimit(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Dias pago por defecto</label>
                <div className="flex gap-1.5">
                  {[0, 15, 30, 45, 60].map(d => (
                    <button
                      key={d}
                      onClick={() => setDefaultDays(d)}
                      className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                        defaultDays === d
                          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                          : 'border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30'
                      }`}
                    >
                      {d === 0 ? 'Contado' : `${d}d`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setCreditApproved(!creditApproved)}
                  className={`w-10 h-6 rounded-full transition-all cursor-pointer relative ${
                    creditApproved ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/[0.1]'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${creditApproved ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-xs font-black text-slate-700 dark:text-white/70">Credito aprobado</span>
              </label>
            </div>

            <div>
              <label className={lbl}>Score crediticio</label>
              {score ? (
                <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-black ${SCORE_STYLES[score]?.bg} ${SCORE_STYLES[score]?.text}`}>
                  {score}
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-white/25 font-bold">Sin datos suficientes</span>
              )}
              <p className="text-[9px] text-slate-400 dark:text-white/25 mt-1">Calculado automaticamente a partir del historial de pagos</p>
            </div>

            <div>
              <label className={lbl}>Notas internas</label>
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                rows={4}
                placeholder="Notas visibles solo para el equipo..."
                className={inp + ' resize-none'}
              />
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-black uppercase tracking-wider hover:from-indigo-400 hover:to-violet-400 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-40"
            >
              {savingConfig ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
