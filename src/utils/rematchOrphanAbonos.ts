// Re-evalúa abonos en estado 'no_encontrado' contra el pool global actual.
// Se dispara después de cargar un nuevo EdeC para encontrar matches que antes no existían.
// - Si el top candidato es exact/high → auto-confirma con claimReference atómico
// - Si hay candidatos de menor confianza → pasa a 'revisar' con top-3 precalculado
// - Si sigue sin candidatos → queda como 'no_encontrado'

import {
  collectionGroup, getDocs, setDoc, type Firestore,
} from 'firebase/firestore';
import { loadGlobalPool } from './globalBankPool';
import { findMatches, type DraftAbono } from './bankReconciliation';
import { claimReference } from './reconciliationGuards';
import { topCandidatesSnapshot, stripUndefined } from './processReceiptBatch';

export interface RematchResult {
  scanned: number;
  confirmed: number;
  movedToReview: number;
  stillOrphan: number;
  errors: string[];
}

export async function rematchOrphanAbonos(
  db: Firestore,
  businessId: string,
  currentUserId: string,
  currentUserName?: string,
): Promise<RematchResult> {
  const result: RematchResult = {
    scanned: 0, confirmed: 0, movedToReview: 0, stillOrphan: 0, errors: [],
  };

  // Filtrar en memoria — el collectionGroup + where('status') exige índice
  // composite que no aporta valor (ya filtramos por path). Más simple sin él.
  const snap = await getDocs(collectionGroup(db, 'abonos'));
  const orphans = snap.docs.filter(d => {
    const segs = d.ref.path.split('/');
    if (segs[0] !== 'businesses' || segs[1] !== businessId) return false;
    return (d.data() as any)?.status === 'no_encontrado';
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
    }), { merge: true });
    result.movedToReview++;
  }

  return result;
}
