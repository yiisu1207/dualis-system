import { Movement, MovementType, ExchangeRates, AccountType, CustomRate } from '../../../types';
import { getMovementUsdAmount } from '../../utils/formatters';

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

export function sumByAccount(
  movs: Movement[],
  accountType: AccountType,
  rates: ExchangeRates
): number {
  const accountMovs = movs.filter((m) => m.accountType === accountType);
  const totalDebt = accountMovs
    .filter((m) => m.movementType === MovementType.FACTURA)
    .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
  const totalPaid = accountMovs
    .filter((m) => m.movementType === MovementType.ABONO)
    .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
  return totalDebt - totalPaid;
}

export function calculateAgingBuckets(
  movs: Movement[],
  rates: ExchangeRates
): AgingBuckets {
  const now = Date.now();
  const buckets: AgingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

  // Only unpaid FACTURAs contribute to aging
  const unpaidInvoices = movs.filter(
    (m) => m.movementType === MovementType.FACTURA && !(m as any).pagado && !(m as any).anulada
  );

  unpaidInvoices.forEach((inv) => {
    const invoiceDate = new Date(inv.date).getTime();
    const daysOld = Math.floor((now - invoiceDate) / (1000 * 60 * 60 * 24));
    const amount = getMovementUsdAmount(inv, rates);

    if (daysOld <= 30) buckets.current += amount;
    else if (daysOld <= 60) buckets.d31_60 += amount;
    else if (daysOld <= 90) buckets.d61_90 += amount;
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
