import { db } from '../firebase/config';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Atomically increments the invoice counter for a business and returns the next number.
 * Uses Firestore transaction to prevent duplicates even under concurrent saves.
 *
 * If `cajaId` is provided, a separate counter is maintained per terminal
 * (stored in `businessConfigs/{businessId}` under `counters.{cajaId}`).
 * The prefix can be overridden per-business via `invoicePrefix` field.
 */
export async function getNextNroControl(
  businessId: string,
  cajaId?: string,
): Promise<{ num: number; formatted: string }> {
  const configRef = doc(db, 'businessConfigs', businessId);
  let nextNum = 1;
  let prefix = 'NF-';

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(configRef);
    const data = snap.data() ?? {};
    prefix = typeof data.invoicePrefix === 'string' && data.invoicePrefix ? data.invoicePrefix : 'NF-';

    if (cajaId) {
      // Per-terminal counter: stored under counters map
      const counters = (data.counters as Record<string, number>) ?? {};
      nextNum = typeof counters[cajaId] === 'number' ? counters[cajaId] : 1;
      tx.set(configRef, { counters: { ...counters, [cajaId]: nextNum + 1 } }, { merge: true });
    } else {
      // Global counter (legacy / fallback)
      nextNum = typeof data.nextNroControl === 'number' ? data.nextNroControl : 1;
      tx.set(configRef, { nextNroControl: nextNum + 1 }, { merge: true });
    }
  });

  const padded = String(nextNum).padStart(8, '0');
  return { num: nextNum, formatted: `${prefix}${padded}` };
}
