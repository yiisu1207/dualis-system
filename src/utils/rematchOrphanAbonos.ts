// Re-evalúa abonos pendientes contra el pool global actual.
// Se dispara después de cargar un nuevo EdeC, o manualmente desde el panel
// "Pendientes" con el botón "Re-buscar global".
// - Si el top candidato es exact/high → auto-confirma escribiendo el claim
//   directo en `usedReferences` (dentro de un writeBatch, no por transacción)
// - Si hay candidatos de menor confianza → pasa a 'revisar' con top-3 precalculado
// - Si sigue sin candidatos → queda en su estado original ('no_encontrado')
//
// IMPLEMENTACIÓN BATCH: la versión anterior llamaba `claimReference` (transacción
// atómica) una vez por cada orphan. Con 50+ auto-confirmaciones eso saturaba la
// cuota de Firestore y devolvía 429 "resource-exhausted" en cascada. Ahora:
//  1. Calculamos TODAS las acciones en memoria (sin I/O extra).
//  2. Deduplicamos fingerprints dentro del mismo run.
//  3. Escribimos todo con `writeBatch` (hasta 400 writes/batch) — 1 RPC por batch
//     en vez de 1 transacción × orphan.
// La garantía atómica la reemplaza el filtro `excludeUsed: true` de
// `loadGlobalPool`: los fingerprints que auto-confirmamos ya NO existen en
// `usedReferences` al snapshot que leímos. Una colisión con otro operador
// ejecutando rematch al mismo milisegundo es un edge case que aceptamos
// (el último write gana). El flujo normal de confirmación single-item sí
// sigue usando `claimReference` transaccional.

import {
  collectionGroup, doc, getDocs, query, setDoc, where, writeBatch, type Firestore,
  type DocumentReference, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { loadGlobalPool } from './globalBankPool';
import { findMatches, type DraftAbono } from './bankReconciliation';
import { buildReferenceFingerprint } from './referenceFingerprint';
import { topCandidatesSnapshot, stripUndefined, recomputeBatchStats } from './processReceiptBatch';
import type { UsedReference } from '../../types';

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

interface PendingAction {
  abonoRef: DocumentReference;
  abonoUpdate: Record<string, any>;
  claim?: {
    ref: DocumentReference;
    record: UsedReference;
  };
  kind: 'confirmed' | 'review';
  batchId?: string;
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

  // Fase 1: calcular todas las acciones en memoria.
  const actions: PendingAction[] = [];
  const claimedFingerprints = new Set<string>(); // para dedup intra-run

  for (const d of orphans) {
    result.scanned++;
    const data = d.data() as any;

    if (typeof data.amount !== 'number' || data.amount <= 0 || !data.date) {
      result.stillOrphan++;
      continue;
    }

    // Coerción defensiva: Firestore puede devolver reference como number si el
    // parser lo guardó así (BDV Empresa devolvía refs numéricas en algunos casos).
    // `findMatches` y `buildReferenceFingerprint` asumen string → normalizamos acá.
    const draftReference = data.reference == null ? undefined : String(data.reference).trim() || undefined;
    const draft: DraftAbono = {
      amount: data.amount,
      date: data.date,
      reference: draftReference,
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
    const topIdentity = top.row.bankAccountId || top.row.accountAlias || '';
    const topRowReference = top.row.reference == null ? undefined : String(top.row.reference).trim() || undefined;
    const failures: string[] = [];
    if (top.confidence !== 'exact' && top.confidence !== 'high') failures.push(`conf=${top.confidence}`);
    if (!topIdentity) failures.push('sin bankAccountId ni accountAlias en fila');
    if (!topRowReference) failures.push('fila sin ref');
    if (!draftReference) failures.push('abono sin ref');
    const canAutoConfirm = failures.length === 0;

    if (canAutoConfirm) {
      try {
        const fp = await buildReferenceFingerprint(topIdentity, topRowReference!, top.row.amount);
        if (claimedFingerprints.has(fp)) {
          // Otro orphan en este mismo run ya reclamó este fp → cae a revisión.
          actions.push({
            kind: 'review',
            abonoRef: d.ref,
            batchId: data.batchId,
            abonoUpdate: stripUndefined({
              status: 'revisar',
              candidateMatches,
              reviewReason: `Rematch: fingerprint ya reclamado por otro abono del mismo run.`,
            }),
          });
          continue;
        }
        claimedFingerprints.add(fp);

        const usedRef = doc(db, `businesses/${businessId}/usedReferences/${fp}`);
        const record: UsedReference = {
          fingerprint: fp,
          bankAccountId: topIdentity,
          reference: topRowReference!,
          amount: Number(top.row.amount.toFixed(2)),
          claimedAt: new Date().toISOString(),
          claimedByUid: currentUserId,
          claimedByName: currentUserName,
          abonoId: d.id,
          batchId: data.batchId,
          bankRowId: top.row.rowId,
          monthKey: top.row.monthKey,
        };
        actions.push({
          kind: 'confirmed',
          abonoRef: d.ref,
          batchId: data.batchId,
          abonoUpdate: stripUndefined({
            status: 'confirmado',
            matchRowId: top.row.rowId,
            matchAccountAlias: top.row.accountAlias,
            matchBankAccountId: top.row.bankAccountId,
            matchBankName: top.row.bankName,
            matchMonthKey: top.row.monthKey,
            candidateMatches,
          }),
          claim: { ref: usedRef, record },
        });
        continue;
      } catch (e: any) {
        const msg = e?.message || String(e);
        result.errors.push(`${d.id}: ${msg}`);
        console.warn('[rematchOrphanAbonos] fingerprint/auto-confirm falló', { abonoId: d.id, topIdentity, topRowReference, amount: top.row.amount, err: msg });
        // cae a review — incluimos el error en la razón para diagnóstico.
        actions.push({
          kind: 'review',
          abonoRef: d.ref,
          batchId: data.batchId,
          abonoUpdate: stripUndefined({
            status: 'revisar',
            candidateMatches,
            reviewReason: `Rematch: error al auto-confirmar exact/high (${msg}). Top: ${top.confidence} (score ${top.score}).`,
          }),
        });
        continue;
      }
    }

    // canAutoConfirm fue false — incluimos qué condición(es) falló(aron) en la razón
    // para no tener que adivinar en el próximo run (ej. "sin bankAccountId ni alias").
    const failReason = failures.length > 0 ? ` [bloqueo auto: ${failures.join(', ')}]` : '';
    actions.push({
      kind: 'review',
      abonoRef: d.ref,
      batchId: data.batchId,
      abonoUpdate: stripUndefined({
        status: 'revisar',
        candidateMatches,
        reviewReason: `Rematch tras nuevo EdeC: ${candidateMatches.length} candidato(s). Top: ${top.confidence} (score ${top.score}).${failReason}`,
      }),
    });
  }

  // Fase 2: escribir todas las acciones en batches. Cada acción de 'confirmed'
  // genera 2 writes (abono + usedReference), 'review' genera 1. Agrupamos en
  // lotes de ~200 acciones (máx ~400 writes, bajo el límite de 500).
  const CHUNK = 200;
  for (let i = 0; i < actions.length; i += CHUNK) {
    const chunk = actions.slice(i, i + CHUNK);
    const wb = writeBatch(db);
    for (const a of chunk) {
      wb.set(a.abonoRef, a.abonoUpdate, { merge: true });
      if (a.claim) {
        // Limpieza de undefineds — writeBatch.set rechaza undefined.
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(a.claim.record)) if (v !== undefined) clean[k] = v;
        wb.set(a.claim.ref, clean);
      }
    }
    try {
      await wb.commit();
      for (const a of chunk) {
        if (a.kind === 'confirmed') result.confirmed++;
        else result.movedToReview++;
      }
    } catch (e: any) {
      result.errors.push(`batch ${i / CHUNK}: ${e?.message || String(e)}`);
    }
  }

  // Fase 3: recomputar stats de los batches afectados. Sin esto el tab "Revisar N"
  // y los KPIs de Conciliacion.tsx quedan stale — leen batch.stats congelado al
  // procesamiento inicial en vez del estado real post-rematch, y muestran 46
  // cuando en realidad hay 17.
  const affectedBatchIds = Array.from(
    new Set(actions.map(a => a.batchId).filter((x): x is string => !!x)),
  );
  for (const batchId of affectedBatchIds) {
    try {
      const { stats, periodFrom, periodTo } = await recomputeBatchStats(db, businessId, batchId);
      await setDoc(
        doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`),
        stripUndefined({ stats, periodFrom, periodTo }),
        { merge: true },
      );
    } catch (e: any) {
      result.errors.push(`recompute ${batchId}: ${e?.message || String(e)}`);
    }
  }

  return result;
}
