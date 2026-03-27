import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PlanId, SubscriptionStatus, PLAN_LIMITS, PLAN_PRICES } from '../utils/planConfig';

// Re-export for backward compat
export type { PlanId, SubscriptionStatus };
export { PLAN_LIMITS, PLAN_PRICES as PLAN_BASE_PRICE };

export interface SubscriptionAddOns {
  extraUsers:      number;
  extraProducts:   number;
  extraSucursales: number;
  visionLab:       boolean;
  conciliacion:    boolean;
  rrhhPro:         boolean;
}

export interface BonusNotification {
  days:       number;
  grantedAt:  string;
  reason:     string;
  seen:       boolean;
}

export interface SubscriptionData {
  plan:             PlanId;
  status:           SubscriptionStatus;
  trialEndsAt?:     Date;
  currentPeriodEnd?: Date;
  addOns:           SubscriptionAddOns;
  /** How the last payment was made (manual = you confirmed it by hand) */
  paymentMethod?:   'stripe' | 'binance' | 'zelle' | 'pago_movil' | 'manual';
  /** Raw payment reference (Stripe sub ID, Zelle confirmación, etc.) */
  paymentRef?:      string;
  /** ISO date of last successful payment */
  lastPaymentAt?:   string;
  /** Monthly price in USD at time of last payment */
  amountUsd?:       number;
  /** Bonus days notification from admin */
  bonusNotification?: BonusNotification;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(businessId: string) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!businessId) { setLoading(false); return; }

    const unsub = onSnapshot(doc(db, 'businesses', businessId), snap => {
      const raw = snap.data()?.subscription as any;

      if (raw) {
        setSubscription({
          plan:             raw.plan             ?? 'trial',
          status:           raw.status           ?? 'trial',
          trialEndsAt:      raw.trialEndsAt?.toDate?.(),
          currentPeriodEnd: raw.currentPeriodEnd?.toDate?.(),
          addOns: {
            extraUsers:      raw.addOns?.extraUsers      ?? 0,
            extraProducts:   raw.addOns?.extraProducts   ?? 0,
            extraSucursales: raw.addOns?.extraSucursales ?? 0,
            visionLab:       raw.addOns?.visionLab       ?? false,
            conciliacion:    raw.addOns?.conciliacion    ?? false,
            rrhhPro:         raw.addOns?.rrhhPro         ?? false,
          },
          paymentMethod: raw.paymentMethod,
          paymentRef:    raw.paymentRef,
          lastPaymentAt: raw.lastPaymentAt,
          amountUsd:     raw.amountUsd,
          bonusNotification: raw.bonusNotification ?? undefined,
        });
      } else {
        // No subscription yet — SubscriptionWall handles creation
        setSubscription(null);
      }
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [businessId]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const now = Date.now();

  /** Grace period: 7 days after expiry before blocking access (data is NEVER deleted) */
  const GRACE_DAYS = 7;

  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - now) / 86_400_000))
    : null;

  /** Days left on a paid (active) plan — null if no currentPeriodEnd */
  const planDaysLeft = subscription?.currentPeriodEnd
    ? Math.ceil((subscription.currentPeriodEnd.getTime() - now) / 86_400_000) // can be negative (past expiry)
    : null;

  /**
   * Grace period: days remaining in grace after plan/trial expired.
   * null = not in grace, >0 = grace active, 0 = grace exhausted → blocked.
   * During grace: system works but shows urgent renewal warnings.
   * After grace: access blocked (data preserved, NEVER deleted).
   */
  const graceDaysLeft = (() => {
    // Trial expired
    if (subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0) {
      const daysSinceExpiry = subscription.trialEndsAt
        ? Math.floor((now - subscription.trialEndsAt.getTime()) / 86_400_000)
        : 0;
      return Math.max(0, GRACE_DAYS - daysSinceExpiry);
    }
    // Paid plan expired (planDaysLeft can be negative when past due)
    if (subscription?.status === 'active' && planDaysLeft !== null && planDaysLeft <= 0) {
      const daysSinceExpiry = subscription.currentPeriodEnd
        ? Math.floor((now - subscription.currentPeriodEnd.getTime()) / 86_400_000)
        : 0;
      return Math.max(0, GRACE_DAYS - daysSinceExpiry);
    }
    return null;
  })();

  /** True if in grace period (expired but still within 7-day grace window) */
  const inGracePeriod = graceDaysLeft !== null && graceDaysLeft > 0;

  /**
   * Fully blocked: subscription expired AND grace period exhausted.
   * Access is blocked but data is NEVER deleted — only access is restricted.
   */
  const isExpired =
    subscription?.status === 'expired' ||
    subscription?.status === 'cancelled' ||
    (subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0 && !inGracePeriod) ||
    (subscription?.status === 'active' && planDaysLeft !== null && planDaysLeft <= 0 && !inGracePeriod);

  const isActive = !isExpired && subscription !== null;

  /** True if module is unlocked in current plan (or via add-on) */
  const canAccess = (moduleId: string): boolean => {
    if (!subscription) return false;
    if (isExpired) return false;
    const limits = PLAN_LIMITS[subscription.plan];
    if (limits.modules.includes('*')) return true;
    if (limits.modules.includes(moduleId)) return true;
    // Add-on overrides
    if (moduleId === 'vision'       && subscription.addOns.visionLab)   return true;
    if (moduleId === 'conciliacion' && subscription.addOns.conciliacion) return true;
    if (moduleId === 'rrhh'         && subscription.addOns.rrhhPro)      return true;
    return false;
  };

  /** Effective user cap (base + add-ons) */
  const maxUsers = (() => {
    if (!subscription) return 0;
    const base = PLAN_LIMITS[subscription.plan].users;
    if (base === -1) return Infinity;
    return base + (subscription.addOns.extraUsers ?? 0);
  })();

  /** Effective product cap */
  const maxProducts = (() => {
    if (!subscription) return 0;
    const base = PLAN_LIMITS[subscription.plan].products;
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
    canAccess,
    maxUsers,
    maxProducts,
    markBonusSeen,
  };
}
