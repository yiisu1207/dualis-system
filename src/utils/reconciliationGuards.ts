// Anti-reuso atómico de referencias bancarias.
// Cada match confirmado genera un doc en `businesses/{bid}/usedReferences/{fingerprint}`.
// La transacción Firestore garantiza que dos operadores que intenten confirmar la misma
// fila simultáneamente no la pisen — uno gana, el otro recibe `already_used`.

import { runTransaction, doc, type Firestore } from 'firebase/firestore';
import { buildReferenceFingerprint } from './referenceFingerprint';
import type { UsedReference } from '../../types';

export interface ClaimReferencePayload {
  bankAccountId: string;
  reference: string;
  amount: number;
  abonoId: string;
  movementId?: string;
  batchId?: string;
  bankRowId?: string;
  monthKey?: string;
  claimedByUid: string;
  claimedByName?: string;
}

export type ClaimResult =
  | { ok: true; fingerprint: string }
  | { ok: false; reason: 'already_used'; fingerprint: string; existing: UsedReference };

export async function claimReference(
  db: Firestore,
  businessId: string,
  payload: ClaimReferencePayload,
): Promise<ClaimResult> {
  const fingerprint = await buildReferenceFingerprint(
    payload.bankAccountId,
    payload.reference,
    payload.amount,
  );
  const ref = doc(db, `businesses/${businessId}/usedReferences/${fingerprint}`);

  return runTransaction<ClaimResult>(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      return {
        ok: false as const,
        reason: 'already_used' as const,
        fingerprint,
        existing: snap.data() as UsedReference,
      };
    }
    const record: UsedReference = {
      fingerprint,
      bankAccountId: payload.bankAccountId,
      reference: payload.reference.trim(),
      amount: Number(payload.amount.toFixed(2)),
      claimedAt: new Date().toISOString(),
      claimedByUid: payload.claimedByUid,
      claimedByName: payload.claimedByName,
      abonoId: payload.abonoId,
      movementId: payload.movementId,
      batchId: payload.batchId,
      bankRowId: payload.bankRowId,
      monthKey: payload.monthKey,
    };
    // Limpieza de undefineds para Firestore
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(record)) if (v !== undefined) clean[k] = v;
    tx.set(ref, clean);
    return { ok: true as const, fingerprint } as ClaimResult;
  });
}

/**
 * Libera una referencia previamente reclamada (usado por flujos de "des-conciliar" / rollback).
 * Idempotente: si no existe, no falla.
 */
export async function releaseReference(
  db: Firestore,
  businessId: string,
  fingerprint: string,
): Promise<void> {
  const ref = doc(db, `businesses/${businessId}/usedReferences/${fingerprint}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) tx.delete(ref);
  });
}
