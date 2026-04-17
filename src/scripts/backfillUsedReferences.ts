// One-shot backfill: reconstruye `usedReferences/{fingerprint}` a partir de los
// abonos históricos ya confirmados (`status='confirmado'` con `matchRowId`).
//
// Se corre una sola vez antes de poner el flujo industrial en producción.
// Sin esta pasada, los abonos conciliados hace meses NO bloquean reuso.
//
// Uso desde Configuración → Mantenimiento (o botón SuperAdmin):
//   const result = await backfillUsedReferences(db, businessId, currentUser.uid);
//   console.log(result);
//
// Idempotente: si `usedReferences/{fp}` ya existe, lo salta.

import {
  collection, collectionGroup, doc, getDoc, getDocs, query, where, setDoc,
  type Firestore,
} from 'firebase/firestore';
import { buildReferenceFingerprint } from '../utils/referenceFingerprint';
import type { UsedReference } from '../../types';

export interface BackfillResult {
  scanned: number;             // abonos confirmados encontrados
  skippedNoRef: number;        // sin matchRowId o sin reference extraíble
  skippedAlreadyExists: number;
  written: number;
  errors: Array<{ abonoId: string; monthKey: string; reason: string }>;
}

export async function backfillUsedReferences(
  db: Firestore,
  businessId: string,
  runByUid: string,
  opts?: { dryRun?: boolean; onProgress?: (done: number, total: number) => void },
): Promise<BackfillResult> {
  const dryRun = !!opts?.dryRun;
  const result: BackfillResult = {
    scanned: 0, skippedNoRef: 0, skippedAlreadyExists: 0, written: 0, errors: [],
  };

  // collectionGroup sobre 'abonos' con filtro por status
  const q = query(
    collectionGroup(db, 'abonos'),
    where('status', '==', 'confirmado'),
  );
  const snap = await getDocs(q);
  const candidates = snap.docs.filter(d => {
    // Restringir al negocio (path: businesses/{bid}/bankStatements/{monthKey}/abonos/{id})
    const segments = d.ref.path.split('/');
    return segments[0] === 'businesses' && segments[1] === businessId;
  });

  const total = candidates.length;
  let done = 0;

  for (const d of candidates) {
    result.scanned++;
    const data = d.data() as any;
    const monthKey = d.ref.parent.parent?.id || '';
    const abonoId = d.id;

    try {
      const matchRowId: string | undefined = data.matchRowId;
      const matchAccountAlias: string | undefined = data.matchAccountAlias;
      const matchBankAccountId: string | undefined = data.matchBankAccountId;
      const amount: number | undefined = typeof data.amount === 'number' ? data.amount : undefined;
      const reference: string | undefined = data.reference;

      if (!matchRowId || !amount || amount <= 0) {
        result.skippedNoRef++;
        continue;
      }

      // Necesitamos bankAccountId para el fingerprint. Si el abono no lo guardó
      // (registros pre-Fase 1), leemos la cuenta del EdeC por alias.
      let bankAccountId = matchBankAccountId;
      let rowAmount = amount;
      let rowRef = reference;

      if (!bankAccountId && matchAccountAlias && monthKey) {
        const accRef = doc(db, `businesses/${businessId}/bankStatements/${monthKey}/accounts/${matchAccountAlias}`);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          const accData = accSnap.data() as any;
          bankAccountId = accData.bankAccountId;
          // Si no tenemos la ref bancaria, buscar la fila matched
          const row = (accData.rows || []).find((r: any) => r.rowId === matchRowId);
          if (row) {
            rowAmount = typeof row.amount === 'number' ? row.amount : rowAmount;
            rowRef = rowRef || row.reference;
          }
        }
      }

      if (!bankAccountId || !rowRef) {
        result.skippedNoRef++;
        continue;
      }

      const fingerprint = await buildReferenceFingerprint(bankAccountId, rowRef, rowAmount);
      const fpRef = doc(db, `businesses/${businessId}/usedReferences/${fingerprint}`);
      const existing = await getDoc(fpRef);
      if (existing.exists()) {
        result.skippedAlreadyExists++;
        continue;
      }

      if (!dryRun) {
        const record: UsedReference = {
          fingerprint,
          bankAccountId,
          reference: rowRef.trim(),
          amount: Number(rowAmount.toFixed(2)),
          claimedAt: data.createdAt || new Date().toISOString(),
          claimedByUid: runByUid,
          claimedByName: 'Backfill histórico',
          abonoId,
          movementId: data.fromMovementId,
          monthKey,
        };
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(record)) if (v !== undefined) clean[k] = v;
        await setDoc(fpRef, clean);
      }
      result.written++;
    } catch (err: any) {
      result.errors.push({ abonoId, monthKey, reason: err?.message || String(err) });
    }

    done++;
    opts?.onProgress?.(done, total);
  }

  return result;
}
