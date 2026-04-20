// Re-evalúa abonos pendientes contra el pool global actual.
// Se dispara después de cargar un nuevo EdeC, o manualmente desde el panel
// "Pendientes" con el botón "Re-buscar global".
// - Si el top candidato es exact/high → auto-confirma con claimReference atómico
// - Si hay candidatos de menor confianza → pasa a 'revisar' con top-3 precalculado
// - Si sigue sin candidatos → queda en su estado original ('no_encontrado')

import {
  collectionGroup, getDocs, query, setDoc, where, type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { loadGlobalPool } from './globalBankPool';
import { findMatches, type DraftAbono } from './bankReconciliation';
import { claimReference } from './reconciliationGuards';
import { topCandidatesSnapshot, stripUndefined } from './processReceiptBatch';

export type RematchStatus = 'no_encontrado' | 'revisar';

export interface RematchResult {
  scanned: number;
  confirmed: number;
  movedToReview: number;
  stillOrphan: number;
  errors: string[];
}

export interface RematchOptions {
  /** Estados a re-evaluar. Default: ['no_encontrado']. El botón "Re-buscar global"
   *  pasa ['no_encontrado', 'revisar'] para también recalcular los ya en revisión. */
  statuses?: RematchStatus[];
  /** Si se provee, solo se escanean abonos de esos lotes (mucho más eficiente
   *  que el collectionGroup scan porque batchId está indexado en Firestore). */
  batchIds?: string[];
}

export async function rematchOrphanAbonos(
  db: Firestore,
  businessId: string,
  currentUserId: string,
  currentUserName?: string,
  options?: RematchOptions,
): Promise<RematchResult> {
  const statuses = options?.statuses?.length ? options.statuses : (['no_encontrado'] as RematchStatus[]);
  const result: RematchResult = {
    scanned: 0, confirmed: 0, movedToReview: 0, stillOrphan: 0, errors: [],
  };

  // Recolección de candidatos: si hay batchIds conocidos, usamos queries por
  // batchId (indexado, barato). Si no, fallback a collectionGroup completo.
  let docs: QueryDocumentSnapshot[];
  if (options?.batchIds && options.batchIds.length > 0) {
    const snaps = await Promise.all(
      options.batchIds.map(id =>
        getDocs(query(collectionGroup(db, 'abonos'), where('batchId', '==', id))),
      ),
    );
    docs = snaps.flatMap(s => s.docs);
  } else {
    const snap = await getDocs(collectionGroup(db, 'abonos'));
    docs = snap.docs;
  }

  const orphans = docs.filter(d => {
    const segs = d.ref.path.split('/');
    if (segs[0] !== 'businesses' || segs[1] !== businessId) return false;
    const status = (d.data() as any)?.status;
    return statuses.includes(status);
  });
  if (orphans.length === 0) return result;

  const pool = await loadGlobalPool(db, businessId, { excludeUsed: true });
  if (pool.length === 0) return { ...result, stillOrphan: orphans.length };

  for (const d of orphans) {
    result.scanned++;
    const data = d.data() as any;

    if (typeof data.amount !== 'number' || data.amount <= 0 || !data.date) {
      result.stillOrphan++;
      continue;
    }

    const draft: DraftAbono = {
      amount: data.amount,
      date: data.date,
      reference: data.reference,
      cedula: data.cedula,
      phone: data.phone,
      clientName: data.clientName,
      operationType: data.operationType,
    };

    const matches = findMatches(draft, pool);
    if (matches.length === 0) {
      result.stillOrphan++;
      continue;
    }

    const top = matches[0];
    const candidateMatches = topCandidatesSnapshot(matches);

    const topIdentity = top.row.bankAccountId || top.row.accountAlias;
    const canAutoConfirm =
      (top.confidence === 'exact' || top.confidence === 'high')
      && !!topIdentity
      && !!top.row.reference
      && !!draft.reference;

    if (canAutoConfirm) {
      try {
        const claim = await claimReference(db, businessId, {
          bankAccountId: top.row.bankAccountId,
          accountAlias: top.row.accountAlias,
          reference: top.row.reference!,
          amount: top.row.amount,
          abonoId: d.id,
          batchId: data.batchId,
          bankRowId: top.row.rowId,
          monthKey: top.row.monthKey,
          claimedByUid: currentUserId,
          claimedByName: currentUserName,
        });
        if (claim.ok) {
          await setDoc(d.ref, stripUndefined({
            status: 'confirmado',
            matchRowId: top.row.rowId,
            matchAccountAlias: top.row.accountAlias,
            matchBankAccountId: top.row.bankAccountId,
            matchBankName: top.row.bankName,
            matchMonthKey: top.row.monthKey,
            candidateMatches,
          }), { merge: true });
          result.confirmed++;
          continue;
        }
        // already_used → cae al flujo de revisión
      } catch (e: any) {
        result.errors.push(`${d.id}: ${e?.message || String(e)}`);
      }
    }

    await setDoc(d.ref, stripUndefined({
      status: 'revisar',
      candidateMatches,
      reviewReason: `Rematch tras nuevo EdeC: ${candidateMatches.length} candidato(s). Top: ${top.confidence} (score ${top.score}).`,
    }), { merge: true });
    result.movedToReview++;
  }

  return result;
}
