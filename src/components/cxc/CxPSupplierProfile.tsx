import React, { useMemo } from 'react';
import {
  Movement,
  MovementType,
  ExchangeRates,
  Supplier,
  CustomRate,
} from '../../../types';
import { formatCurrency, getMovementUsdAmount } from '../../utils/formatters';
import {
  ArrowLeft,
  FileText,
  Receipt,
  Building2,
  Phone,
  Hash,
  Tag,
  Calendar,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import {
  getInitials,
  getEntityField,
  daysSince,
  sumByAccount,
  getDistinctAccounts,
  buildAccountLabels,
} from './cxcHelpers';

interface Props {
  entityId: string;
  supplier: Supplier | null;
  movements: Movement[];
  rates: ExchangeRates;
  customRates?: CustomRate[];
  onBack: () => void;
  onViewLedger: () => void;
  onRegisterPago: () => void;
}

export default function CxPSupplierProfile({
  entityId,
  supplier,
  movements,
  rates,
  customRates = [],
  onBack,
  onViewLedger,
  onRegisterPago,
}: Props) {
  const entityMovs = useMemo(
    () => movements.filter((m) => m.entityId === entityId),
    [movements, entityId]
  );

  const distinctAccounts = useMemo(() => getDistinctAccounts(entityMovs), [entityMovs]);
  const accountLabels = useMemo(
    () => buildAccountLabels(distinctAccounts, customRates),
    [distinctAccounts, customRates]
  );

  // Balances por cuenta (FACTURA = deuda al proveedor, ABONO = pago hecho)
  const balances = useMemo(() => {
    const r: Record<string, number> = {};
    distinctAccounts.forEach((acc) => {
      r[acc] = sumByAccount(entityMovs, acc as any, rates);
    });
    r.total = Object.values(r).reduce((s, v) => s + v, 0);
    return r;
  }, [entityMovs, rates, distinctAccounts]);

  const totalDebt = balances.total; // Positivo = debemos al proveedor
  const lastMov = entityMovs.sort(
    (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()
  )[0];
  const lastPago = entityMovs
    .filter((m) => m.movementType === MovementType.ABONO)
    .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())[0];

  const totalFacturas = entityMovs.filter((m) => m.movementType === MovementType.FACTURA).length;
  const totalPagos = entityMovs.filter((m) => m.movementType === MovementType.ABONO).length;

  const name = supplier?.id || entityId;
  const initials = getInitials(name);
  const daysSinceLastPago = daysSince(lastPago?.createdAt || lastPago?.date);

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-left-4 pb-8">
      {/* HEADER */}
      <div className="app-panel p-5 sm:p-7">
        <div className="flex items-start gap-4 mb-6">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl app-btn app-btn-ghost flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-lg shrink-0">
            <span className="text-white font-black text-lg">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 truncate">{name}</h2>
            <p className="text-sm text-slate-500 dark:text-white/40 font-medium">Proveedor</p>

            {/* Balance badge */}
            <div className="mt-2">
              {totalDebt > 0.01 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 text-xs font-black border border-rose-200 dark:border-rose-500/25">
                  <AlertCircle className="w-3 h-3" />
                  Debes {formatCurrency(totalDebt, '$')} a este proveedor
                </span>
              ) : totalDebt < -0.01 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-black border border-emerald-200 dark:border-emerald-500/25">
                  Saldo a tu favor {formatCurrency(Math.abs(totalDebt), '$')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 text-xs font-black border border-slate-200 dark:border-white/[0.08]">
                  Al día ✓
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Datos del proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {[
            { icon: Hash, label: 'RIF', value: getEntityField(supplier?.rif) },
            { icon: Phone, label: 'Contacto', value: getEntityField(supplier?.contacto) },
            { icon: Tag, label: 'Categoría', value: getEntityField(supplier?.categoria) },
            {
              icon: Calendar,
              label: 'Último pago',
              value: daysSinceLastPago !== null
                ? `Hace ${daysSinceLastPago} día${daysSinceLastPago !== 1 ? 's' : ''}`
                : 'Sin pagos',
            },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]"
            >
              <Icon className="w-4 h-4 text-slate-400 dark:text-white/30 shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{label}</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onRegisterPago}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 transition-all"
          >
            <Receipt className="w-3.5 h-3.5" />
            Registrar Pago
          </button>
          <button
            onClick={onViewLedger}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.10] text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            Ver Historial Completo
          </button>
        </div>
      </div>

      {/* BALANCES POR CUENTA */}
      {distinctAccounts.length > 0 && (
        <div className="app-panel p-5">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            Saldo por cuenta
          </h3>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(distinctAccounts.length, 3)}, 1fr)` }}
          >
            {distinctAccounts.map((acc) => {
              const bal = balances[acc] ?? 0;
              return (
                <div
                  key={acc}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] text-center"
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">
                    {accountLabels[acc] ?? acc}
                  </p>
                  <p
                    className={`text-xl font-black ${
                      bal > 0.01
                        ? 'text-rose-600 dark:text-rose-400'
                        : bal < -0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-white/40'
                    }`}
                  >
                    {formatCurrency(Math.abs(bal), '$')}
                  </p>
                  <p className="text-[9px] text-slate-400 dark:text-white/30 mt-0.5">
                    {bal > 0.01 ? 'Por pagar' : bal < -0.01 ? 'A favor' : 'Al día'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Facturas', value: totalFacturas, icon: Building2, color: 'text-rose-500' },
          { label: 'Pagos', value: totalPagos, icon: Receipt, color: 'text-emerald-500' },
          { label: 'Movimientos', value: entityMovs.length, icon: FileText, color: 'text-indigo-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="app-panel p-4 text-center"
          >
            <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{label}</p>
          </div>
        ))}
      </div>

      {/* ÚLTIMOS MOVIMIENTOS */}
      {entityMovs.length > 0 && (
        <div className="app-panel p-5">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">Últimos movimientos</h3>
          <div className="space-y-2">
            {entityMovs
              .slice()
              .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
              .slice(0, 5)
              .map((m) => {
                const isFactura = m.movementType === MovementType.FACTURA;
                const amount = getMovementUsdAmount(m, rates);
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isFactura
                            ? 'bg-rose-100 dark:bg-rose-500/15'
                            : 'bg-emerald-100 dark:bg-emerald-500/15'
                        }`}
                      >
                        {isFactura ? (
                          <Building2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        ) : (
                          <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                          {isFactura ? 'Factura' : 'Pago'}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-white/30">
                          {new Date(m.createdAt || m.date).toLocaleDateString('es-VE')}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-black ${
                        isFactura
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isFactura ? '+' : '-'}{formatCurrency(amount, '$')}
                    </p>
                  </div>
                );
              })}
          </div>
          {entityMovs.length > 5 && (
            <button
              onClick={onViewLedger}
              className="mt-3 w-full py-2.5 text-xs font-black text-indigo-500 dark:text-indigo-400 hover:underline"
            >
              Ver todos los movimientos →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
