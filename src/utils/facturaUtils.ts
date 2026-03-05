import { db } from '../firebase/config';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Atomically increments the invoice counter for a business and returns the next number.
 * Uses Firestore transaction to prevent duplicates even under concurrent saves.
 */
export async function getNextNroControl(businessId: string): Promise<{ num: number; formatted: string }> {
  const configRef = doc(db, 'businessConfigs', businessId);
  let nextNum = 1;
  let prefix = 'FACT-';

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(configRef);
    const data = snap.data() ?? {};
    nextNum = typeof data.nextNroControl === 'number' ? data.nextNroControl : 1;
    prefix = typeof data.invoicePrefix === 'string' && data.invoicePrefix ? data.invoicePrefix : 'FACT-';
    tx.set(configRef, { nextNroControl: nextNum + 1 }, { merge: true });
  });

  const padded = String(nextNum).padStart(8, '0');
  return { num: nextNum, formatted: `${prefix}${padded}` };
}
