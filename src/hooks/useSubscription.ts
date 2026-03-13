import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanId = 'trial' | 'starter' | 'negocio' | 'enterprise' | 'custom';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export interface SubscriptionAddOns {
  extraUsers:      number;  // +$3 each
  extraProducts:   number;  // +$5 per 1k block
  extraSucursales: number;  // +$9 each
  visionLab:       boolean; // +$24
  conciliacion:    boolean; // +$12
  rrhhPro:         boolean; // +$15
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

// ─── Plan limits ──────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<PlanId, { users: number; products: number; sucursales: number; modules: string[] }> = {
  trial:      { users: 2,  products: 500,  sucursales: 0, modules: ['*'] },
  starter:    { users: 2,  products: 500,  sucursales: 0, modules: ['pos_detal','inventario','tasas','clientes','cajas','reportes','contabilidad'] },
  negocio:    { users: 5,  products: 2000, sucursales: 1, modules: ['pos_detal','pos_mayor','inventario','tasas','clientes','proveedores','cajas','rrhh','reportes','sucursales','contabilidad','comparar'] },
  enterprise: { users: -1, products: -1,   sucursales: 3, modules: ['*'] },
  custom:     { users: -1, products: -1,   sucursales: -1, modules: ['*'] }, // resolved at runtime with addOns
};

export const PLAN_BASE_PRICE: Record<Exclude<PlanId,'trial'|'custom'>, number> = {
  starter:    24,
  negocio:    49,
  enterprise: 89,
};

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

  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - now) / 86_400_000))
    : null;

  const isExpired =
    subscription?.status === 'expired' ||
    subscription?.status === 'cancelled' ||
    (subscription?.status === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 0);

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
    isActive,
    isExpired,
    canAccess,
    maxUsers,
    maxProducts,
    markBonusSeen,
  };
}
