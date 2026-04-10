/**
 * Fase B.4 — Descuento ficticio por plazo de crédito.
 *
 * ⚠️ SUPERSEDED — NO IMPORTAR DESDE NUEVO CÓDIGO.
 * El feature está shipped vía el mecanismo canónico `businessConfigs.paymentPeriods`
 * (cada period tiene `discountPercent`). Ver:
 *   - src/pages/pos/PosMayor.tsx ~L1075-1115 (cálculo + storage en Movement)
 *   - src/components/NDEReceiptModal.tsx ~L162-164 (render del recibo)
 *   - src/pages/Configuracion.tsx → sección POS → editor de "Períodos de pago"
 * Los Movements resultantes llevan: creditMarkupApplied, creditMarkupPct,
 * realAmountUSD, earlyPayDiscountPct, earlyPayDiscountAmt, earlyPayDiscountExpiry.
 *
 * Este archivo se conserva como referencia pura de la fórmula. Si en el futuro
 * se quiere migrar a un editor de tiers dedicado (separado de paymentPeriods),
 * estas funciones siguen siendo válidas.
 *
 * Concepto: el cliente percibe un descuento por pagar a crédito, pero el negocio
 * no pierde margen. Se infla el precio y luego se "descuenta" hasta el neto real.
 *
 * Fórmula:
 *   precioMostrado = precioNeto / (1 - descuentoPct/100)
 *   descuentoMostrado = precioMostrado * (descuentoPct/100)
 *   neto = precioMostrado - descuentoMostrado === precioNeto
 */

export type DescuentoFicticioTier = { days: number; pct: number };

export type DescuentoFicticioConfig = {
  enabled: boolean;
  tiers: DescuentoFicticioTier[];
};

export const DEFAULT_DESCUENTO_FICTICIO: DescuentoFicticioConfig = {
  enabled: false,
  tiers: [
    { days: 15, pct: 2 },
    { days: 30, pct: 5 },
    { days: 45, pct: 7 },
    { days: 60, pct: 10 },
  ],
};

/**
 * Devuelve el porcentaje de descuento ficticio aplicable para un número de días.
 * Usa el tier exacto si existe; si no, el más alto cuyo `days` es <= input.
 */
export function getDescuentoPct(config: DescuentoFicticioConfig | undefined | null, days: number): number {
  if (!config?.enabled || !Array.isArray(config.tiers) || days <= 0) return 0;
  const sorted = [...config.tiers].sort((a, b) => a.days - b.days);
  let pct = 0;
  for (const tier of sorted) {
    if (tier.days <= days) pct = tier.pct;
    else break;
  }
  return pct;
}

/**
 * Calcula el precio mostrado (inflado) a partir del precio neto y el porcentaje.
 * Ejemplo: precioNeto=100, pct=5 → precioMostrado=105.26
 */
export function inflatePrice(precioNeto: number, pct: number): number {
  if (pct <= 0 || pct >= 100) return precioNeto;
  return precioNeto / (1 - pct / 100);
}

/**
 * Devuelve estructura completa de presentación de descuento.
 * `priceShown × qty - discount = priceNeto × qty`
 */
export function computeDescuentoFicticio(
  precioNeto: number,
  qty: number,
  config: DescuentoFicticioConfig | undefined | null,
  days: number,
) {
  const pct = getDescuentoPct(config, days);
  if (pct <= 0) {
    return { pct: 0, priceShown: precioNeto, lineShown: precioNeto * qty, discount: 0, lineNet: precioNeto * qty };
  }
  const priceShown = inflatePrice(precioNeto, pct);
  const lineShown = priceShown * qty;
  const lineNet = precioNeto * qty;
  const discount = lineShown - lineNet;
  return { pct, priceShown, lineShown, discount, lineNet };
}
