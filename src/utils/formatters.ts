export const formatCurrency = (amount: number, symbol: string = '$'): string => {
  const formatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatter.format(amount)}`;
};
