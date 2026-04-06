import { LoyaltyTier, LoyaltyConfig, TierBenefit } from '../../types';

// ─── Default Loyalty Config ────────────────────────────────────────────────────

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: false,
  pointsPerDollar: 10,
  earlyPaymentBonus: 50,
  tierThresholds: {
    bronce:   0,
    plata:    500,
    oro:      2000,
    platino:  5000,
    diamante: 15000,
    elite:    50000,
  },
  tierBenefits: {
    bronce:   { creditLimitBonus: 0,  graceDaysBonus: 0,  discountPercent: 0,   badge: '🥉' },
    plata:    { creditLimitBonus: 5,  graceDaysBonus: 3,  discountPercent: 1,   badge: '🥈' },
    oro:      { creditLimitBonus: 10, graceDaysBonus: 5,  discountPercent: 2,   badge: '🥇' },
    platino:  { creditLimitBonus: 20, graceDaysBonus: 7,  discountPercent: 3,   badge: '💎' },
    diamante: { creditLimitBonus: 30, graceDaysBonus: 10, discountPercent: 5,   badge: '💠' },
    elite:    { creditLimitBonus: 50, graceDaysBonus: 15, discountPercent: 8,   badge: '👑' },
  },
};

export const TIER_ORDER: LoyaltyTier[] = ['bronce', 'plata', 'oro', 'platino', 'diamante', 'elite'];

export const TIER_LABELS: Record<LoyaltyTier, string> = {
  bronce:   'Bronce',
  plata:    'Plata',
  oro:      'Oro',
  platino:  'Platino',
  diamante: 'Diamante',
  elite:    'Elite',
};

export const TIER_COLORS: Record<LoyaltyTier, { bg: string; text: string; border: string }> = {
  bronce:   { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  plata:    { bg: 'bg-slate-400/10',  text: 'text-slate-300',  border: 'border-slate-400/20'  },
  oro:      { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20'  },
  platino:  { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20'   },
  diamante: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  elite:    { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
};

// ─── Engine functions ──────────────────────────────────────────────────────────

/** Calculate points earned from a payment */
export function calculatePurchasePoints(amountUSD: number, config: LoyaltyConfig): number {
  return Math.floor(amountUSD * config.pointsPerDollar);
}

/** Calculate bonus points for early payment */
export function calculateEarlyPaymentBonus(
  paidDaysBeforeDue: number,
  config: LoyaltyConfig,
): number {
  if (paidDaysBeforeDue <= 0) return 0;
  // Base bonus + extra for each day early
  return config.earlyPaymentBonus + Math.floor(paidDaysBeforeDue * 2);
}

/** Determine tier based on total accumulated points */
export function calculateTier(totalPoints: number, config: LoyaltyConfig): LoyaltyTier {
  let tier: LoyaltyTier = 'bronce';
  for (const t of TIER_ORDER) {
    if (totalPoints >= config.tierThresholds[t]) {
      tier = t;
    }
  }
  return tier;
}

/** Get benefits for a specific tier */
export function getTierBenefits(tier: LoyaltyTier, config: LoyaltyConfig): TierBenefit {
  return config.tierBenefits[tier];
}

/** Progress to next tier (0-100%) */
export function tierProgress(totalPoints: number, config: LoyaltyConfig): {
  currentTier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  progress: number;
  pointsToNext: number;
} {
  const currentTier = calculateTier(totalPoints, config);
  const currentIdx = TIER_ORDER.indexOf(currentTier);
  const nextTier = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null;

  if (!nextTier) {
    return { currentTier, nextTier: null, progress: 100, pointsToNext: 0 };
  }

  const currentThreshold = config.tierThresholds[currentTier];
  const nextThreshold = config.tierThresholds[nextTier];
  const range = nextThreshold - currentThreshold;
  const earned = totalPoints - currentThreshold;
  const progress = Math.min(100, Math.round((earned / range) * 100));

  return {
    currentTier,
    nextTier,
    progress,
    pointsToNext: Math.max(0, nextThreshold - totalPoints),
  };
}
