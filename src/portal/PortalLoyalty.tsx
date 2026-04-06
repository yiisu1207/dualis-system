import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { usePortal } from './PortalGuard';
import { LoyaltyConfig, LoyaltyEvent, LoyaltyAccount } from '../../types';
import {
  DEFAULT_LOYALTY_CONFIG, TIER_ORDER, TIER_LABELS, TIER_COLORS,
  tierProgress, getTierBenefits,
} from '../utils/loyaltyEngine';
import { Trophy, Star, ArrowUp, Gift, Clock, TrendingUp } from 'lucide-react';

export default function PortalLoyalty() {
  const { businessId, customerId, customerName } = usePortal();

  const [config, setConfig] = useState<LoyaltyConfig>(DEFAULT_LOYALTY_CONFIG);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId || !customerId) return;
    (async () => {
      try {
        // Load config
        const cfgSnap = await getDoc(doc(db, `businesses/${businessId}/config`, 'loyalty'));
        const cfg = cfgSnap.exists() ? { ...DEFAULT_LOYALTY_CONFIG, ...cfgSnap.data() as LoyaltyConfig } : DEFAULT_LOYALTY_CONFIG;
        setConfig(cfg);

        // Load account
        const accSnap = await getDoc(doc(db, `businesses/${businessId}/loyaltyAccounts`, customerId));
        if (accSnap.exists()) {
          setAccount(accSnap.data() as LoyaltyAccount);
        }

        // Load recent events
        const evSnap = await getDocs(
          query(
            collection(db, `businesses/${businessId}/loyaltyEvents`),
            where('customerId', '==', customerId),
          )
        );
        const evts = evSnap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyEvent));
        evts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setEvents(evts.slice(0, 20));
      } catch (err) {
        console.error('Error loading loyalty data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId, customerId]);

  if (!config.enabled) {
    return (
      <div className="text-center py-20">
        <Trophy size={48} className="text-white/10 mx-auto mb-4" />
        <p className="text-sm text-white/30">El programa de fidelidad no está disponible</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-3 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalPoints = account?.totalPoints || 0;
  const currentPoints = account?.currentPoints || 0;
  const progress = tierProgress(totalPoints, config);
  const currentTier = progress.currentTier;
  const benefits = getTierBenefits(currentTier, config);
  const colors = TIER_COLORS[currentTier];

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-black text-white tracking-tight">Mi Fidelidad</h1>
        <p className="text-xs text-white/30 mt-1">{customerName}</p>
      </div>

      {/* Tier card */}
      <div className={`rounded-2xl border p-6 text-center ${colors.bg} ${colors.border}`}>
        <p className="text-4xl mb-2">{benefits.badge}</p>
        <p className={`text-xl font-black ${colors.text}`}>{TIER_LABELS[currentTier]}</p>
        <p className="text-3xl font-black text-white mt-2">{currentPoints.toLocaleString()}</p>
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">puntos disponibles</p>

        {/* Progress to next tier */}
        {progress.nextTier && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[10px] text-white/30 mb-1.5">
              <span>{TIER_LABELS[currentTier]}</span>
              <span>{TIER_LABELS[progress.nextTier]}</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <p className="text-[10px] text-white/20 mt-1.5">
              {progress.pointsToNext.toLocaleString()} puntos para {TIER_LABELS[progress.nextTier]}
            </p>
          </div>
        )}
      </div>

      {/* Benefits */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
          <Gift size={14} /> Tus Beneficios
        </p>
        <div className="grid grid-cols-3 gap-3">
          {benefits.creditLimitBonus > 0 && (
            <div className="text-center">
              <p className="text-lg font-black text-indigo-400">+{benefits.creditLimitBonus}%</p>
              <p className="text-[9px] text-white/20 uppercase">Crédito</p>
            </div>
          )}
          {benefits.graceDaysBonus > 0 && (
            <div className="text-center">
              <p className="text-lg font-black text-emerald-400">+{benefits.graceDaysBonus}d</p>
              <p className="text-[9px] text-white/20 uppercase">Gracia</p>
            </div>
          )}
          {benefits.discountPercent > 0 && (
            <div className="text-center">
              <p className="text-lg font-black text-amber-400">{benefits.discountPercent}%</p>
              <p className="text-[9px] text-white/20 uppercase">Descuento</p>
            </div>
          )}
          {!benefits.creditLimitBonus && !benefits.graceDaysBonus && !benefits.discountPercent && (
            <div className="col-span-3 text-center py-3">
              <p className="text-xs text-white/20">Sube de nivel para desbloquear beneficios</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4 text-center">
          <TrendingUp size={18} className="text-indigo-400 mx-auto mb-1" />
          <p className="text-xl font-black text-white">{totalPoints.toLocaleString()}</p>
          <p className="text-[9px] text-white/20 uppercase">Total acumulado</p>
        </div>
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4 text-center">
          <Star size={18} className="text-amber-400 mx-auto mb-1" />
          <p className="text-xl font-black text-white">{config.pointsPerDollar}</p>
          <p className="text-[9px] text-white/20 uppercase">Pts por cada $1</p>
        </div>
      </div>

      {/* Activity */}
      {events.length > 0 && (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
            <Clock size={14} /> Actividad Reciente
          </p>
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                <div>
                  <p className="text-xs font-bold text-white/60">{ev.description}</p>
                  <p className="text-[9px] text-white/20">{new Date(ev.createdAt).toLocaleDateString('es-VE')}</p>
                </div>
                <span className={`text-sm font-black ${ev.points > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ev.points > 0 ? '+' : ''}{ev.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All tiers */}
      <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Niveles</p>
        <div className="space-y-2">
          {TIER_ORDER.map(tier => {
            const tc = TIER_COLORS[tier];
            const tb = config.tierBenefits[tier];
            const isCurrent = tier === currentTier;
            const isLocked = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(currentTier);
            return (
              <div key={tier} className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                isCurrent ? `${tc.bg} ${tc.border}` : 'border-white/[0.04]'
              } ${isLocked ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{tb.badge}</span>
                  <div>
                    <p className={`text-xs font-black ${isCurrent ? tc.text : 'text-white/50'}`}>{TIER_LABELS[tier]}</p>
                    <p className="text-[9px] text-white/20">{config.tierThresholds[tier].toLocaleString()} pts</p>
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40">Actual</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
