/**
 * FEFO (First Expired, First Out) lot-tracking helpers.
 *
 * Pure utility — no Firebase or React imports.
 */

export interface ProductLot {
  lotNumber: string;
  qty: number;
  expiryDate: string; // ISO YYYY-MM-DD
  receivedAt: string; // ISO date-time of reception
}

/**
 * FEFO: sort lots by expiry date ascending, return the first with stock > 0.
 */
export function getFefoLot(lots: ProductLot[]): ProductLot | null {
  return (
    lots
      .filter(l => l.qty > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0] || null
  );
}

/**
 * Deduct `qty` units from lots using FEFO order.
 * Returns a new lots array with updated quantities.
 */
export function deductFefo(lots: ProductLot[], qty: number): ProductLot[] {
  const sorted = [...lots].sort((a, b) =>
    a.expiryDate.localeCompare(b.expiryDate),
  );
  let remaining = qty;
  return sorted.map(lot => {
    if (remaining <= 0) return lot;
    const deduct = Math.min(lot.qty, remaining);
    remaining -= deduct;
    return { ...lot, qty: lot.qty - deduct };
  });
}
