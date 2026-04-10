/**
 * Costo promedio ponderado para ingreso de mercancía.
 * Fórmula: (stockActual × costoActual + cantidadIngresada × costoCompra) / (stockActual + cantidadIngresada)
 */
export function weightedAverageCost(
  currentStock: number,
  currentCost: number,
  receivedQty: number,
  receivedCost: number
): number {
  const totalQty = currentStock + receivedQty;
  if (totalQty <= 0) return receivedCost || currentCost || 0;
  return (currentStock * currentCost + receivedQty * receivedCost) / totalQty;
}
