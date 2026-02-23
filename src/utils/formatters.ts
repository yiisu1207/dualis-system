import { AccountType, ExchangeRates, Movement, PaymentCurrency } from '../../types';

export const formatCurrency = (amount: number, symbol: string = '$'): string => {
  const formatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatter.format(amount)}`;
};

const toNumber = (value: any) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const resolveRate = (movement: Movement, rates?: ExchangeRates) => {
  const storedRate = toNumber(movement.rateUsed);
  if (storedRate > 0) return storedRate;
  if (movement.accountType === AccountType.BCV) return toNumber(rates?.bcv) || 1;
  if (movement.accountType === AccountType.GRUPO) return toNumber(rates?.grupo) || 1;
  return 1;
};

export const getMovementUsdAmount = (movement: Movement, rates?: ExchangeRates) => {
  const currency = movement.currency as PaymentCurrency | string;
  const rate = resolveRate(movement, rates);
  const originalAmount = movement.originalAmount != null ? toNumber(movement.originalAmount) : null;
  const amountInUSD = toNumber(movement.amountInUSD);
  const amount = toNumber(movement.amount);

  if (currency === PaymentCurrency.BS || currency === 'BS') {
    if (originalAmount != null && originalAmount !== 0) return originalAmount / rate;
    if (amountInUSD !== 0) return amountInUSD;
    if (amount !== 0) return amount / rate;
    return 0;
  }

  if (amountInUSD !== 0) return amountInUSD;
  if (amount !== 0) return amount;
  if (originalAmount != null) return originalAmount;
  return 0;
};
