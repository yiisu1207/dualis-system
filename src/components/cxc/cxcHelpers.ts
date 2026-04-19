import { Movement, MovementType, ExchangeRates, AccountType, CustomRate, Customer, CreditMode } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';

export function getEffectiveCreditMode(
  customer: Pick<Customer, 'creditMode'> | undefined | null,
  businessConfig: { creditMode?: CreditMode } | undefined | null
): CreditMode {
  return customer?.creditMode ?? businessConfig?.creditMode ?? 'accumulated';
}

export type TabFilter = 'ALL' | string;

export function getDistinctAccounts(movements: Movement[]): string[] {
  const seen = new Set<string>();
  movements.forEach((m) => { if (m.accountType) seen.add(m.accountType as string); });
  return [...seen].sort();
}

export function buildAccountLabels(
  accounts: string[],
  customRates: CustomRate[]
): Record<string, string> {
  const base: Record<string, string> = { BCV: 'BCV', GRUPO: 'Grupo', DIVISA: 'Divisa' };
  customRates.forEach((r) => { base[r.id] = r.name; });
  return Object.fromEntries(accounts.map((a) => [a, base[a] ?? a]));
}
export type RangeFilter = 'ALL' | 'SINCE_ZERO' | 'SINCE_LAST_DEBT' | 'CUSTOM';
export type ViewStyle = 'dualis' | 'excel';

export interface ChronoMovement extends Movement {
  debe: number;
  haber: number;
  runningBalance: number;
  displayDate: string;
  daysSinceLast: number | null;
}

export interface AgingBuckets {
  current: number;   // 0-30 days
  d31_60: number;    // 31-60 days
  d61_90: number;    // 61-90 days
  d90plus: number;   // 90+ days
}

export function filterMovementsByRange(
  items: Movement[],
  account: TabFilter,
  range: RangeFilter,
  fromDate: string,
  toDate: string,
  rates: ExchangeRates
): Movement[] {
  const accountScoped =
    account === 'ALL' ? items : items.filter((m) => m.accountType === account);
  const sorted = [...accountScoped].sort((a, b) => {
    const aDate = new Date(a.createdAt || a.date).getTime();
    const bDate = new Date(b.createdAt || b.date).getTime();
    return aDate - bDate;
  });

  if (range === 'CUSTOM') {
    return sorted.filter((m) => {
      if (fromDate && m.date < fromDate) return false;
      if (toDate && m.date > toDate) return false;
      return true;
    });
  }

  if (range === 'SINCE_LAST_DEBT') {
    const idx = [...sorted].reverse().findIndex((m) => m.movementType === MovementType.FACTURA);
    if (idx === -1) return sorted;
    const startIndex = sorted.length - 1 - idx;
    return sorted.slice(startIndex);
  }

  if (range === 'SINCE_ZERO') {
    let running = 0;
    let lastZeroIndex = -1;
    sorted.forEach((m, index) => {
      const amountUsd = getMovementUsdAmount(m, rates);
      const debe = m.movementType === MovementType.FACTURA ? amountUsd : 0;
      const haber = m.movementType === MovementType.ABONO ? amountUsd : 0;
      running += debe - haber;
      if (running <= 0) lastZeroIndex = index;
    });
    if (lastZeroIndex === -1) return sorted;
    return sorted.slice(lastZeroIndex);
  }

  return sorted;
}

export function buildChronoData(items: Movement[], rates: ExchangeRates): ChronoMovement[] {
  let runningBalance = 0;
  let lastDate: Date | null = null;
  return items.map((m) => {
    const displayDate = m.createdAt || m.date;
    const currentDate = new Date(displayDate);
    const daysSinceLast = lastDate
      ? Math.ceil((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    lastDate = currentDate;
    const amountUsd = getMovementUsdAmount(m, rates);
    const debe = m.movementType === MovementType.FACTURA ? amountUsd : 0;
    const haber = m.movementType === MovementType.ABONO ? amountUsd : 0;
    runningBalance += debe - haber;
    return { ...m, debe, haber, runningBalance, displayDate, daysSinceLast };
  });
}

/** Saldo restante USD de una factura según el modo activo. */
function invoiceRemainingUSD(inv: Movement, rates: ExchangeRates, mode: CreditMode): number {
  if (inv.anulada) return 0;
  const original = getMovementUsdAmount(inv, rates);
  if (mode === 'accumulated') return inv.pagado ? 0 : original;

  const hasNewFields =
    inv.invoiceStatus !== undefined ||
    inv.allocations !== undefined ||
    inv.allocatedTotal !== undefined;
  if (!hasNewFields) return inv.pagado ? 0 : original;

  if (inv.invoiceStatus === 'PAID') return 0;
  const allocated = inv.allocatedTotal ?? 0;
  return Math.max(0, original - allocated);
}

/** ¿La factura está pendiente (total o parcialmente) según el modo? */
function isInvoicePending(inv: Movement, mode: CreditMode): boolean {
  if (inv.anulada) return false;
  if (mode === 'accumulated') return !inv.pagado;
  const hasNewFields =
    inv.invoiceStatus !== undefined ||
    inv.allocations !== undefined ||
    inv.allocatedTotal !== undefined;
  if (!hasNewFields) return !inv.pagado;
  return inv.invoiceStatus !== 'PAID';
}

export function sumByAccount(
  movs: Movement[],
  accountType: AccountType,
  rates: ExchangeRates,
  mode: CreditMode = 'accumulated'
): number {
  const accountMovs = movs.filter((m) => m.accountType === accountType && !m.anulada);
  if (mode === 'accumulated') {
    const totalDebt = accountMovs
      .filter((m) => m.movementType === MovementType.FACTURA)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    const totalPaid = accountMovs
      .filter((m) => m.movementType === MovementType.ABONO)
      .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
    return totalDebt - totalPaid;
  }

  // invoiceLinked: saldo = Σ(factura.remaining) − Σ(abono.overpaymentUSD)
  const pendingInvoices = accountMovs
    .filter((m) => m.movementType === MovementType.FACTURA)
    .reduce((sum, m) => sum + invoiceRemainingUSD(m, rates, mode), 0);
  const credits = accountMovs
    .filter((m) => m.movementType === MovementType.ABONO)
    .reduce((sum, m) => sum + (m.overpaymentUSD ?? 0), 0);
  return pendingInvoices - credits;
}

export function calculateAgingBuckets(
  movs: Movement[],
  rates: ExchangeRates,
  mode: CreditMode = 'accumulated'
): AgingBuckets {
  const now = Date.now();
  const buckets: AgingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

  const pendingInvoices = movs.filter(
    (m) => m.movementType === MovementType.FACTURA && isInvoicePending(m, mode)
  );

  pendingInvoices.forEach((inv) => {
    const invoiceDate = new Date(inv.date).getTime();
    const daysOld = Math.floor((now - invoiceDate) / (1000 * 60 * 60 * 24));
    const amount = invoiceRemainingUSD(inv, rates, mode);
    if (amount <= 0.009) return;

    if (daysOld < 31) buckets.current += amount;
    else if (daysOld < 61) buckets.d31_60 += amount;
    else if (daysOld < 91) buckets.d61_90 += amount;
    else buckets.d90plus += amount;
  });

  return buckets;
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-VE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateTimeLocal(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate()
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export const formatPhone = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();
export const getEntityField = (value?: string) => (value && value.trim() ? value.trim() : 'N/A');

export const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

export const daysSince = (dateValue?: string) => {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// ── Descuento por pronto pago — expira automáticamente al pasar dueDate ────────

/**
 * Returns the effective amount owed for a FACTURA movement.
 * If today <= earlyPayDiscountExpiry, applies the discount.
 * If the date has passed, returns the full original amount.
 */
export function getEffectiveAmount(movement: Movement, asOfDate?: string): number {
  const today = asOfDate ?? new Date().toISOString().split('T')[0];
  if (
    movement.earlyPayDiscountPct &&
    movement.earlyPayDiscountPct > 0 &&
    movement.earlyPayDiscountExpiry &&
    today <= movement.earlyPayDiscountExpiry
  ) {
    return (movement.amountInUSD ?? 0) * (1 - movement.earlyPayDiscountPct / 100);
  }
  return movement.amountInUSD ?? 0;
}

/**
 * Checks if a movement has an active (not yet expired) early pay discount.
 */
export function hasActiveDiscount(movement: Movement, asOfDate?: string): boolean {
  const today = asOfDate ?? new Date().toISOString().split('T')[0];
  return !!(
    movement.earlyPayDiscountPct &&
    movement.earlyPayDiscountPct > 0 &&
    movement.earlyPayDiscountExpiry &&
    today <= movement.earlyPayDiscountExpiry
  );
}

// ── Score de crédito interno ───────────────────────────────────────────────────

import type { CreditScore } from '../../../types';

/**
 * Calculates an internal credit score based on payment history.
 * Compares ABONO dates vs. dueDate of their corresponding FACTURAs.
 * - EXCELENTE: average payment delay ≤ 0 days (always on time or early)
 * - BUENO: average delay 1–7 days
 * - REGULAR: average delay 8–30 days
 * - RIESGO: average delay > 30 days or has unpaid invoices > 90 days old
 */
export function calcCreditScore(
  movements: Movement[],
  mode: CreditMode = 'accumulated'
): CreditScore | null {
  const invoices = movements.filter(
    m => m.movementType === 'FACTURA' && !m.anulada && m.dueDate
  );
  if (invoices.length === 0) return null;

  const isPaid = (inv: Movement) =>
    mode === 'invoiceLinked' && inv.invoiceStatus !== undefined
      ? inv.invoiceStatus === 'PAID'
      : !!inv.pagado;

  // Check for very old unpaid invoices (risk flag)
  const now = Date.now();
  const hasOldUnpaid = invoices.some(inv => {
    if (isPaid(inv)) return false;
    const age = Math.floor((now - new Date(inv.date).getTime()) / 86_400_000);
    return age > 90;
  });
  if (hasOldUnpaid) return 'RIESGO';

  // Calculate average delay for paid invoices
  const paidInvoices = invoices.filter(inv => isPaid(inv) && inv.dueDate);
  if (paidInvoices.length === 0) return null;

  const abonos = movements.filter(m => m.movementType === 'ABONO' && !m.anulada);

  const delays: number[] = paidInvoices.map(inv => {
    // invoiceLinked: usar la última allocation aplicada a esta factura.
    if (mode === 'invoiceLinked' && Array.isArray(inv.allocations) && inv.allocations.length > 0) {
      const lastAlloc = [...inv.allocations].sort((a, b) =>
        new Date(a.allocatedAt).getTime() - new Date(b.allocatedAt).getTime()
      ).pop();
      if (lastAlloc && inv.dueDate) {
        const due  = new Date(inv.dueDate).getTime();
        const paid = new Date(lastAlloc.allocatedAt).getTime();
        return Math.floor((paid - due) / 86_400_000);
      }
    }

    // Legacy/accumulated: ABONO más cercano en la misma cuenta después de la factura
    const relatedAbono = abonos
      .filter(a => a.accountType === inv.accountType && a.date >= inv.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    if (!relatedAbono || !inv.dueDate) return 0;
    const due  = new Date(inv.dueDate).getTime();
    const paid = new Date(relatedAbono.date).getTime();
    return Math.floor((paid - due) / 86_400_000); // negative = paid early
  });

  const avgDelay = delays.reduce((s, d) => s + d, 0) / delays.length;

  if (avgDelay <= 0)  return 'EXCELENTE';
  if (avgDelay <= 7)  return 'BUENO';
  if (avgDelay <= 30) return 'REGULAR';
  return 'RIESGO';
}

// ── Helpers dinámicos para cuentas (no hardcodean GRUPO/DIVISA) ──────────────

/**
 * Obtiene la tasa de cambio para un accountType dado.
 * BCV → bcvRate. Custom rates → busca en customRates[].
 */
export function resolveRateForAccount(
  accountType: string,
  bcvRate: number,
  customRates: CustomRate[]
): number {
  if (accountType === 'BCV') return bcvRate;
  const cr = customRates.find(r => r.id === accountType);
  return cr?.value ?? bcvRate;
}

/**
 * Obtiene el label legible para un accountType.
 * BCV → 'BCV'. Custom → su nombre configurado.
 */
export function resolveAccountLabel(
  accountType: string,
  customRates: CustomRate[]
): string {
  if (accountType === 'BCV') return 'BCV';
  const cr = customRates.find(r => r.id === accountType);
  return cr?.name ?? accountType;
}

const ACCOUNT_PALETTE = ['violet', 'emerald', 'amber', 'rose', 'cyan', 'fuchsia'] as const;

/**
 * Obtiene un color consistente para un accountType.
 * BCV → indigo. Custom rates → paleta rotativa.
 */
export function resolveAccountColor(
  accountType: string,
  customRates: CustomRate[],
  index?: number
): string {
  if (accountType === 'BCV') return 'indigo';
  const idx = index ?? customRates.findIndex(r => r.id === accountType);
  return ACCOUNT_PALETTE[Math.max(0, idx) % ACCOUNT_PALETTE.length];
}

/**
 * Calcula balance por cuenta para una entidad.
 * Retorna array de cuentas activas con su balance.
 */
export function calcAccountBalances(
  entityMovements: Movement[],
  bcvRate: number,
  customRates: CustomRate[],
  rates: ExchangeRates,
  mode: CreditMode = 'accumulated'
): { accountType: string; label: string; color: string; balance: number; overdue: number; lastDate?: string }[] {
  const accounts = getDistinctAccounts(entityMovements);
  return accounts.map((acc, idx) => {
    const accMovs = entityMovements.filter(m => m.accountType === acc);
    const balance = sumByAccount(accMovs, acc as any, rates, mode);

    // Overdue: saldo restante de FACTURAs pendientes > 30 días
    const now = Date.now();
    const overdue = accMovs
      .filter(m => m.movementType === MovementType.FACTURA && isInvoicePending(m, mode))
      .filter(m => Math.floor((now - new Date(m.date).getTime()) / 86_400_000) > 30)
      .reduce((sum, m) => sum + invoiceRemainingUSD(m, rates, mode), 0);

    // Last movement date
    const sorted = accMovs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDate = sorted[0]?.date;

    return {
      accountType: acc,
      label: resolveAccountLabel(acc, customRates),
      color: resolveAccountColor(acc, customRates, idx),
      balance,
      overdue,
      lastDate,
    };
  });
}

export function resolveRangeLabel(
  range: RangeFilter,
  detailRangeFrom: string,
  detailRangeTo: string
): string {
  switch (range) {
    case 'SINCE_ZERO':
      return 'Desde el ultimo saldo cero';
    case 'SINCE_LAST_DEBT':
      return 'Desde la ultima factura';
    case 'CUSTOM':
      return `${detailRangeFrom || 'Inicio'} - ${detailRangeTo || 'Hoy'}`;
    case 'ALL':
    default:
      return 'Todo el Historial';
  }
}
