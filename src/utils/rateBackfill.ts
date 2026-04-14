import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';

export type BackfillSource = 'auto-fetch' | 'manual' | 'backfill-post-holiday';

/**
 * Escribe la tasa BCV de `dateStr` en exchange_rates_history y, si el registro
 * previo más reciente está a más de 1 día, rellena los días faltantes con la
 * misma tasa marcándolos `source: 'backfill-post-holiday'` (estilo Instagram BCV
 * que replica la tasa publicada al fin de semana/feriado cubierto).
 *
 * No pisa registros manuales previos. Usa un solo writeBatch para atomicidad.
 */
export async function backfillMissingRatesUpTo(
  businessId: string,
  dateStr: string,
  rate: number,
  source: BackfillSource,
  createdBy?: { uid: string; displayName: string },
): Promise<{ written: string[]; backfilled: string[] }> {
  if (!businessId || !dateStr || !(rate > 0)) {
    return { written: [], backfilled: [] };
  }

  const col = collection(db, 'businesses', businessId, 'exchange_rates_history');

  // 1. Verificar si ya existe el doc de `dateStr`. Si es manual, no lo pisamos.
  const existingRef = doc(col, dateStr);
  const existingSnap = await getDoc(existingRef);
  const written: string[] = [];
  const batch = writeBatch(db);

  if (!existingSnap.exists() || existingSnap.data()?.source !== 'manual') {
    batch.set(
      existingRef,
      {
        date: dateStr,
        bcv: rate,
        timestamp: serverTimestamp(),
        source,
        status: 'verified',
        ...(createdBy ? { createdBy } : {}),
      },
      { merge: true },
    );
    written.push(dateStr);
  }

  // 2. Buscar el registro previo más reciente (anterior a dateStr).
  const priorQuery = query(col, orderBy('date', 'desc'), limit(10));
  const priorSnap = await getDocs(priorQuery);
  const priorDates = priorSnap.docs
    .map((d) => d.data()?.date as string)
    .filter((d) => !!d && d < dateStr)
    .sort((a, b) => b.localeCompare(a));
  const lastPrior = priorDates[0];

  // 3. Si hay gap > 1 día, rellenar días intermedios con la misma tasa.
  const backfilled: string[] = [];
  if (lastPrior) {
    const gaps = enumerateDatesBetween(lastPrior, dateStr);
    for (const missing of gaps) {
      const missingRef = doc(col, missing);
      const missingSnap = await getDoc(missingRef);
      if (missingSnap.exists()) continue; // no pisar nada
      batch.set(missingRef, {
        date: missing,
        bcv: rate,
        timestamp: serverTimestamp(),
        source: 'backfill-post-holiday',
        status: 'verified',
        backfilledFrom: dateStr,
        ...(createdBy ? { createdBy } : {}),
      });
      backfilled.push(missing);
    }
  }

  if (written.length || backfilled.length) {
    await batch.commit();
  }
  return { written, backfilled };
}

/**
 * Devuelve los días entre `start` y `end` exclusivos (YYYY-MM-DD).
 * Ej: enumerateDatesBetween('2026-04-10', '2026-04-14') → ['2026-04-11','2026-04-12','2026-04-13']
 */
function enumerateDatesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return out;
  const cursor = new Date(s.getTime() + 86400000); // start + 1 día
  while (cursor < e) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
