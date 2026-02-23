import { ExchangeRates, Movement, MovementType } from '../../types';
import { getMovementUsdAmount } from './formatters';

export type ClientStatus = 'GREEN' | 'YELLOW' | 'RED';

export type ClientTag = {
  key:
    | 'MOROSO'
    | 'NUEVO'
    | 'VIP'
    | 'AL_DIA';
  label: string;
  tooltip: string;
  className: string;
};

export type ClientStatusResult = {
  status: ClientStatus;
  balance: number;
  accountBalances: {
    bcv: number;
    grupo: number;
    div: number;
    totalNet: number;
    totalPositive: number;
  };
  daysSinceLast: number | null;
  lastMovement: Movement | null;
  lastMovementDate: string | null;
  firstMovementDate: string | null;
  totalFacturas: number;
  totalAbonos: number;
  totalMovements: number;
  tags: ClientTag[];
};

const getMovementDate = (m: Movement) => {
  const raw = m.createdAt || m.date;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const buildClientStatus = (
  movements: Movement[],
  rates: ExchangeRates,
  now: Date = new Date(),
  options?: {
    vipSalesThreshold?: number;
    morosoDays?: number;
    newCustomerDays?: number;
    customerCreatedAt?: string | null;
    inactiveDays?: number;
  }
): ClientStatusResult => {
  const vipSalesThreshold = options?.vipSalesThreshold ?? 5000;
  const morosoDays = options?.morosoDays ?? 30;
  const newCustomerDays = options?.newCustomerDays ?? 30;
  const inactiveDays = options?.inactiveDays ?? 30;

  const accountTotals = {
    bcv: { debt: 0, paid: 0 },
    grupo: { debt: 0, paid: 0 },
    div: { debt: 0, paid: 0 },
  };

  movements.forEach((m) => {
    const amount = getMovementUsdAmount(m, rates);
    const bucket =
      m.accountType === 'BCV'
        ? accountTotals.bcv
        : m.accountType === 'GRUPO'
        ? accountTotals.grupo
        : accountTotals.div;
    if (m.movementType === MovementType.FACTURA) {
      bucket.debt += amount;
    } else if (m.movementType === MovementType.ABONO) {
      bucket.paid += amount;
    }
  });

  const totalFacturas = movements
    .filter((m) => m.movementType === MovementType.FACTURA)
    .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
  const totalAbonos = movements
    .filter((m) => m.movementType === MovementType.ABONO)
    .reduce((sum, m) => sum + getMovementUsdAmount(m, rates), 0);
  const balance = totalFacturas - totalAbonos;

  const accountBalances = {
    bcv: accountTotals.bcv.paid - accountTotals.bcv.debt,
    grupo: accountTotals.grupo.paid - accountTotals.grupo.debt,
    div: accountTotals.div.paid - accountTotals.div.debt,
  };

  const totalNet = accountBalances.bcv + accountBalances.grupo + accountBalances.div;
  const totalPositive = [accountBalances.bcv, accountBalances.grupo, accountBalances.div]
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const hasDebt =
    accountBalances.bcv < 0 || accountBalances.grupo < 0 || accountBalances.div < 0;

  const sortedByDate = [...movements].sort((a, b) => {
    const aDate = getMovementDate(a)?.getTime() ?? 0;
    const bDate = getMovementDate(b)?.getTime() ?? 0;
    return bDate - aDate;
  });

  const lastMovement = sortedByDate[0] || null;
  const lastMovementDate = lastMovement ? lastMovement.date : null;
  const lastMovementTime = lastMovement ? getMovementDate(lastMovement) : null;
  const daysSinceLast = lastMovementTime
    ? Math.max(
        0,
        Math.ceil((now.getTime() - lastMovementTime.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;

  const earliestMovement = [...movements]
    .sort((a, b) => (getMovementDate(a)?.getTime() ?? 0) - (getMovementDate(b)?.getTime() ?? 0))
    .find((m) => getMovementDate(m));
  const firstMovementDate = earliestMovement ? earliestMovement.date : null;
  const firstMovementTime = earliestMovement ? getMovementDate(earliestMovement) : null;
  const daysSinceFirst = firstMovementTime
    ? Math.max(
        0,
        Math.ceil((now.getTime() - firstMovementTime.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;

  const status: ClientStatus = (() => {
    if (hasDebt) return 'RED';
    if (movements.length === 0) return 'YELLOW';
    if (daysSinceLast != null && daysSinceLast > inactiveDays) return 'YELLOW';
    return 'GREEN';
  })();

  const createdAtRaw = options?.customerCreatedAt || null;
  const createdAtDate = createdAtRaw ? new Date(createdAtRaw) : null;
  const createdAtValid = createdAtDate && !Number.isNaN(createdAtDate.getTime());
  const daysSinceCreated = createdAtValid
    ? Math.max(
        0,
        Math.ceil((now.getTime() - createdAtDate!.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;

  const isMoroso = balance > 0 && daysSinceLast != null && daysSinceLast > morosoDays;
  const isVip = totalFacturas >= vipSalesThreshold;
  const isNew = daysSinceCreated != null && daysSinceCreated <= newCustomerDays;

  const tags: ClientTag[] = [];
  if (isMoroso) {
    tags.push({
      key: 'MOROSO',
      label: 'Moroso',
      tooltip: `Deuda con mas de ${morosoDays} dias de antiguedad.`,
      className: 'bg-rose-100 text-rose-700 border border-rose-200',
    });
  } else if (isVip) {
    tags.push({
      key: 'VIP',
      label: 'VIP',
      tooltip: `Compras historicas superiores a $${vipSalesThreshold}.`,
      className: 'bg-yellow-100 text-yellow-900 border border-yellow-200',
    });
  } else if (isNew) {
    tags.push({
      key: 'NUEVO',
      label: 'Nuevo',
      tooltip: `Cliente con menos de ${newCustomerDays} dias en el sistema.`,
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    });
  } else {
    tags.push({
      key: 'AL_DIA',
      label: 'Al dia',
      tooltip: 'Sin mora y sin alertas especiales.',
      className: 'bg-slate-100 text-slate-600 border border-slate-200',
    });
  }

  return {
    status,
    balance,
    accountBalances: {
      bcv: accountBalances.bcv,
      grupo: accountBalances.grupo,
      div: accountBalances.div,
      totalNet,
      totalPositive,
    },
    daysSinceLast,
    lastMovement,
    lastMovementDate,
    firstMovementDate,
    totalFacturas,
    totalAbonos,
    totalMovements: movements.length,
    tags,
  };
};
