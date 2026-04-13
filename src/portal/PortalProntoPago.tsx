import React from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { Zap, Clock, TrendingDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export default function PortalProntoPago() {
  const { businessId, customerId, currencySymbol } = usePortal();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { invoicesWithDiscount, loading, creditPolicy } = usePortalData(businessId, customerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const eligible = invoicesWithDiscount.filter((i) => i.eligibleTier);
  const totalSavings = eligible.reduce((s, i) => s + i.discountAmount, 0);
  const tiers = creditPolicy?.earlyPaymentTiers || [];

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Pronto Pago</h1>
        <p className="text-sm text-white/40 font-bold mt-1">
          Descuentos por pagar antes del vencimiento
        </p>
      </div>

      {/* Tiers info */}
      {tiers.length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-emerald-500/20 p-6 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-emerald-400" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
              Descuentos Disponibles
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {tiers
              .sort((a: any, b: any) => a.maxDays - b.maxDays)
              .map((t: any, i: number) => (
                <div
                  key={i}
                  className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <p className="text-lg font-black text-emerald-400">-{t.discountPercent}%</p>
                  <p className="text-[10px] font-bold text-emerald-400/60">
                    Pagando antes de {t.maxDays} días
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {eligible.length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-6 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[9px] font-black uppercase text-white/30">Documentos elegibles</p>
              <p className="text-2xl font-black text-white mt-1">{eligible.length}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-white/30">Ahorro potencial</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">
                {formatCurrency(totalSavings, currencySymbol)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-white/30">Total con descuento</p>
              <p className="text-2xl font-black text-white/80 mt-1">
                {formatCurrency(
                  eligible.reduce((s, i) => s + i.netAmount, 0),
                  currencySymbol
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice list */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-white/[0.07]">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">
            Pendientes de Pago
          </h3>
        </div>

        {invoicesWithDiscount.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingDown size={24} className="text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/20">No hay documentos pendientes</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {invoicesWithDiscount.map((item) => (
              <div
                key={item.movement.id}
                className="px-6 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white/70 truncate">
                      {item.movement.concept}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-white/30 font-bold mt-1">
                      <span>{item.movement.date}</span>
                      <span>{item.movement.accountType}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={9} /> {item.daysOld}d
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-black text-white/60">
                      {formatCurrency(item.amountUsd, currencySymbol)}
                    </p>
                    {item.eligibleTier ? (
                      <div className="flex items-center gap-1.5 mt-1 justify-end">
                        <Zap size={10} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400">
                          -{item.eligibleTier.discountPercent}% = {formatCurrency(item.netAmount, currencySymbol)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-white/20 mt-1">
                        Sin descuento
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      {eligible.length > 0 && (
        <button
          onClick={() => navigate(`/portal/${slug}/pagar`)}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center justify-center gap-2"
        >
          <Zap size={14} className="fill-white" /> Pagar con Descuento
        </button>
      )}
    </div>
  );
}
