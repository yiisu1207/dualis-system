import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  PlanId, SubscriptionStatus, PLAN_LIMITS, PLAN_PRICES,
  FEATURE_LABELS, buildUpgradeWhatsApp, buildQuoteWhatsApp,
  getVerticalLimits,
} from '../utils/planConfig';

// Re-export for backward compat
export type { PlanId, SubscriptionStatus };
export { PLAN_LIMITS, PLAN_PRICES as PLAN_BASE_PRICE };

export interface SubscriptionAddOns {
  // Legacy
  extraUsers:      number;
  extraProducts:   number;
  extraSucursales: number;
  visionLab:       boolean;
  conciliacion:    boolean;
  rrhhPro:         boolean;
  // New add-ons
  portal?:         boolean;
  tienda?:         boolean;
  dualisPay?:      boolean;
  whatsappAuto?:   boolean;
  auditoria_ia?:   boolean;
  recurrentes?:    boolean;
}

export interface BonusNotification {
  days:      number;
  grantedAt: string;
  reason:    string;
  seen:      boolean;
}

export interface SubscriptionData {
  plan:              PlanId;
  status:            SubscriptionStatus;
  trialEndsAt?:      Date;
  currentPeriodEnd?: Date;
  addOns:            SubscriptionAddOns;
  paymentMethod?:    'stripe' | 'binance' | 'zelle' | 'pago_movil' | 'manual';
  paymentRef?:       string;
  lastPaymentAt?:    string;
  amountUsd?:        number;
  bonusNotification?: BonusNotification;
  // New fields
  discountPercent?:  number;   // from Programa Embajador
  referredBy?:       string;   // businessId del referidor
  billingCycle?:     'monthly' | 'annual';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(businessId: string) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [tipoNegocio, setTipoNegocio]   = useState<string>('general');
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!businessId) { setLoading(false); return; }

    const unsub = onSnapshot(doc(db, 'businesses', businessId), snap => {
      const raw = snap.data()?.subscription as any;
      setTipoNegocio(snap.data()?.tipoNegocio || 'general');

      if (raw) {
        setSubscription({
          plan:             raw.plan             ?? 'gratis',
          status:           raw.status           ?? 'trial',
          trialEndsAt:      raw.trialEndsAt?.toDate?.(),
          currentPeriodEnd: raw.currentPeriodEnd?.toDate?.(),
          addOns: {
            extraUsers:      raw.addOns?.extraUsers      ?? 0,
            extraProducts:   raw.addOns?.extraProducts   ?? 0,
            extraSucursales: raw.addOns?.extraSucursales ?? 0,
            visionLab:       raw.addOns?.visionLab       ?? false,
            conciliacion:    raw.addOns?.conciliacion     ?? false,
            rrhhPro:         raw.addOns?.rrhhPro          ?? false,
            portal:          raw.addOns?.portal           ?? false,
            tienda:          raw.addOns?.tienda           ?? false,
            dualisPay:       raw.addOns?.dualisPay        ?? false,
            whatsappAuto:    raw.addOns?.whatsappAuto     ?? false,
            auditoria_ia:    raw.addOns?.auditoria_ia     ?? false,
            recurrentes:     raw.addOns?.recurrentes      ?? false,
          },
          paymentMethod:    raw.paymentMethod,
          paymentRef:       raw.paymentRef,
          lastPaymentAt:    raw.lastPaymentAt,
          amountUsd:        raw.amountUsd,
          bonusNotification: raw.bonusNotification ?? undefined,
          discountPercent:  raw.discountPercent,
          referredBy:       raw.referredBy,
          billingCycle:     raw.billingCycle,
        });
      } else {
        setSubscription(null);
      }
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [businessId]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const now        = Date.now();
  const GRACE_DAYS = 7;

  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - now) / 86_400_000))
    : null;

  const planDaysLeft = subscription?.currentPeriodEnd
    ? Math.ceil((subscription.currentPeriodEnd.getTime() - now) / 86_400_000)
    : null;

  const graceDaysLeft = (() => {
    if (subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0) {
      const days = subscription.trialEndsAt
        ? Math.floor((now - subscription.trialEndsAt.getTime()) / 86_400_000)
        : 0;
      return Math.max(0, GRACE_DAYS - days);
    }
    if (subscription?.status === 'active' && planDaysLeft !== null && planDaysLeft <= 0) {
      const days = subscription.currentPeriodEnd
        ? Math.floor((now - subscription.currentPeriodEnd.getTime()) / 86_400_000)
        : 0;
      return Math.max(0, GRACE_DAYS - days);
    }
    return null;
  })();

  const inGracePeriod = graceDaysLeft !== null && graceDaysLeft > 0;

  const isExpired =
    subscription?.status === 'expired' ||
    subscription?.status === 'cancelled' ||
    (subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0 && !inGracePeriod) ||
    (subscription?.status === 'active' && planDaysLeft !== null && planDaysLeft <= 0 && !inGracePeriod);

  const isActive = !isExpired && subscription !== null;

  const isOnTrial = (): boolean =>
    subscription?.status === 'trial' && !isExpired;

  const daysLeftOnTrial = (): number =>
    trialDaysLeft ?? 0;

  // ── canAccess ───────────────────────────────────────────────────────────────

  const canAccess = (moduleId: string): boolean => {
    if (!subscription) return false;
    if (isExpired) return false;

    // Vertical plan uses per-vertical limits (distinct module list per tipoNegocio)
    const limits = subscription.plan === 'vertical'
      ? getVerticalLimits(tipoNegocio)
      : (PLAN_LIMITS[subscription.plan] ?? PLAN_LIMITS['gratis']);

    // '*' = all modules (trial, enterprise, custom)
    if (limits.modules.includes('*')) return true;
    if (limits.modules.includes(moduleId)) return true;

    // Add-on overrides (legacy)
    if (moduleId === 'vision'        && (subscription.addOns.visionLab    || subscription.addOns.auditoria_ia)) return true;
    if (moduleId === 'conciliacion'  && (subscription.addOns.conciliacion || subscription.addOns.conciliacion)) return true;
    if (moduleId === 'rrhh'          && subscription.addOns.rrhhPro)         return true;
    // New add-ons
    if (moduleId === 'portal_clientes' && subscription.addOns.portal)        return true;
    if (moduleId === 'tienda'          && subscription.addOns.tienda)         return true;
    if (moduleId === 'dualis_pay'      && subscription.addOns.dualisPay)      return true;
    if (moduleId === 'whatsapp_auto'   && subscription.addOns.whatsappAuto)   return true;
    if (moduleId === 'auditoria_ia'    && (subscription.addOns.auditoria_ia || subscription.addOns.visionLab)) return true;
    if (moduleId === 'recurrentes'     && subscription.addOns.recurrentes)    return true;

    return false;
  };

  // ── getUpgradePrompt ────────────────────────────────────────────────────────

  const getUpgradePrompt = (moduleId: string, businessName?: string): {
    title: string;
    description: string;
    minPlan: string;
    hasAddon: boolean;
    addonPrice?: number;
    whatsappUrl: string;
    quoteUrl: string;
  } => {
    const info = FEATURE_LABELS[moduleId];
    const name = info?.name ?? moduleId;
    const minPlan = info?.minPlan ?? 'Negocio';
    const isEnterprise = minPlan === 'Enterprise';

    return {
      title:       `${name} requiere Plan ${minPlan}`,
      description: info?.addonPrice
        ? `Disponible desde Plan ${minPlan} o como add-on (+$${info.addonPrice}/mes en tu plan actual).`
        : `Esta función está disponible desde el Plan ${minPlan}.`,
      minPlan,
      hasAddon:    !!info?.addonKey,
      addonPrice:  info?.addonPrice,
      whatsappUrl: isEnterprise
        ? buildQuoteWhatsApp(businessName)
        : buildUpgradeWhatsApp(minPlan, businessName),
      quoteUrl: buildQuoteWhatsApp(businessName),
    };
  };

  // ── Limits ──────────────────────────────────────────────────────────────────

  const maxUsers = (() => {
    if (!subscription) return 0;
    const limits = subscription.plan === 'vertical'
      ? getVerticalLimits(tipoNegocio)
      : PLAN_LIMITS[subscription.plan];
    const base = limits?.users ?? 1;
    if (base === -1) return Infinity;
    return base + (subscription.addOns.extraUsers ?? 0);
  })();

  const maxProducts = (() => {
    if (!subscription) return 0;
    const limits = subscription.plan === 'vertical'
      ? getVerticalLimits(tipoNegocio)
      : PLAN_LIMITS[subscription.plan];
    const base = limits?.products ?? 50;
    if (base === -1) return Infinity;
    return base + (subscription.addOns.extraProducts ?? 0) * 1000;
  })();

  const markBonusSeen = async () => {
    if (!businessId || !subscription?.bonusNotification) return;
    try {
      await updateDoc(doc(db, 'businesses', businessId), { 'subscription.bonusNotification.seen': true });
    } catch {}
  };

  return {
    subscription,
    loading,
    trialDaysLeft,
    planDaysLeft: planDaysLeft !== null ? Math.max(0, planDaysLeft) : null,
    graceDaysLeft,
    inGracePeriod,
    isActive,
    isExpired,
    isOnTrial,
    daysLeftOnTrial,
    canAccess,
    getUpgradePrompt,
    maxUsers,
    maxProducts,
    markBonusSeen,
  };
}
