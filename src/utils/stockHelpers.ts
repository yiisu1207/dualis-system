// ─── Stock Helpers ────────────────────────────────────────────────────────────
// Pure functions for reading product stock under the dual model:
//   product.stock          (legacy global field)
//   product.stockByAlmacen (per-warehouse map, newer)
//
// Compatibility rule: products created BEFORE the multi-warehouse model only
// have `stock`. Reading `stockByAlmacen[id]` directly returns 0/undefined for
// those products and breaks UI. These helpers always fall back to the legacy
// field when the warehouse is the default ('principal') or when no map exists.

export interface StockProduct {
  stock?: number;
  stockByAlmacen?: Record<string, number>;
}

/**
 * Returns the stock of a product in the given warehouse.
 *
 * - If `stockByAlmacen[almacenId]` is set, returns it.
 * - If not set and `almacenId === 'principal'`, falls back to `product.stock`
 *   (legacy products lived entirely on the principal warehouse).
 * - Otherwise returns 0.
 */
export const getAlmacenStock = (
  product: StockProduct | null | undefined,
  almacenId: string,
): number => {
  if (!product) return 0;
  const map = product.stockByAlmacen;
  if (map && Object.prototype.hasOwnProperty.call(map, almacenId)) {
    return Number(map[almacenId] ?? 0);
  }
  if (almacenId === 'principal') return Number(product.stock ?? 0);
  return 0;
};

/**
 * Total stock of a product across all warehouses.
 *
 * - If `stockByAlmacen` exists, sums its values. If `stock` is greater than
 *   the sum (stale legacy field), returns `stock` as a safety floor.
 * - If no map, returns `stock`.
 */
export const getTotalStock = (product: StockProduct | null | undefined): number => {
  if (!product) return 0;
  const legacy = Number(product.stock ?? 0);
  const map = product.stockByAlmacen;
  if (!map || Object.keys(map).length === 0) return legacy;
  const sum = Object.values(map).reduce<number>((acc, v) => acc + Number(v ?? 0), 0);
  // Safety: if legacy > sum, the map is incomplete (legacy product), trust legacy
  return sum >= legacy ? sum : legacy;
};

/**
 * True if the product has any stock (across all warehouses, with fallback).
 */
export const hasStock = (product: StockProduct | null | undefined): boolean =>
  getTotalStock(product) > 0;
