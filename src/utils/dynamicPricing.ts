import type { CustomRate } from '../../types';

/**
 * Calcula precios dinámicos para productos clasificados bajo una tasa custom.
 *
 * Lógica:
 *   precioCustom = costoUSD × (1 + margen/100)         — precio de venta a la tasa custom
 *   precioBCV    = (precioCustom × tasaCustom) / tasaBCV — equivalente a tasa BCV
 */
export function computeDynamicPrices(
  costoUSD: number,
  margenMayor: number,
  margenDetal: number,
  customRateValue: number,
  tasaBCV: number,
) {
  const precioMayorCustom = costoUSD * (1 + margenMayor / 100);
  const precioDetalCustom = costoUSD * (1 + margenDetal / 100);

  const safeBCV = tasaBCV > 0 ? tasaBCV : 1;
  const precioBCV_Mayor = (precioMayorCustom * customRateValue) / safeBCV;
  const precioBCV_Detal = (precioDetalCustom * customRateValue) / safeBCV;

  return { precioMayorCustom, precioDetalCustom, precioBCV_Mayor, precioBCV_Detal };
}

/**
 * Resuelve el precio de un producto dinámico para un contexto POS específico.
 *
 * @param costoUSD       Costo del producto (ref. a tasa custom)
 * @param margen         Margen % (margenMayor o margenDetal según POS)
 * @param productRateVal Valor de la tasa custom del producto
 * @param targetRateVal  Valor de la tasa destino (la cuenta de venta)
 */
export function resolveDynamicPrice(
  costoUSD: number,
  margen: number,
  productRateVal: number,
  targetRateVal: number,
): number {
  const precioCustom = costoUSD * (1 + margen / 100);
  const safeTarget = targetRateVal > 0 ? targetRateVal : 1;
  return (precioCustom * productRateVal) / safeTarget;
}

/**
 * Busca un CustomRate por id en el array.
 */
export function findCustomRate(customRates: CustomRate[], id: string): CustomRate | undefined {
  return customRates.find((r) => r.id === id);
}

/**
 * Verifica si un producto es de pricing dinámico.
 */
export function isDynamicProduct(tipoTasa?: string): boolean {
  return !!tipoTasa && tipoTasa !== 'BCV';
}
