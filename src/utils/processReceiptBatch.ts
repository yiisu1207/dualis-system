// Procesa un lote de capturas (y/o entradas manuales) creando un ReconciliationBatch:
// - sube imágenes a Cloudinary, corre OCR, intenta auto-confirmar matches exact/high
// - crea SessionAbonos en bankStatements/{monthKey}/abonos
// - reclama referencias atómicamente vía claimReference (anti-reuso)
// - actualiza el batch con stats finales

import {
  doc, setDoc, getDocs, collectionGroup, query, where, limit, type Firestore,
} from 'firebase/firestore';
import { uploadToCloudinary } from './cloudinary';
import { extractReceipt, hashFile, type ExtractedReceipt } from './receiptOcr';
import { findMatches, type DraftAbono, type RankedMatch, type OperationType } from './bankReconciliation';
import { loadGlobalPool, type PooledRow } from './globalBankPool';
import { claimReference } from './reconciliationGuards';
import type { ReconciliationBatch, SessionAbonoCandidate } from '../../types';
import type { SessionAbono, AbonoStatus } from '../components/conciliacion/ReconciliationReport';

const OCR_CONCURRENCY = 4;

export interface ImageBatchItem {
  id: string;
  kind: 'image';
  file: File;
}

export interface ManualBatchItem {
  id: string;
  kind: 'manual';
  amount: number;
  date: string;
  reference: string;
  bankAccountId: string;
  cedula?: string;
  clientName?: string;
  note?: string;
}

export type BatchItemDraft = ImageBatchItem | ManualBatchItem;

export interface ProcessingResult {
  draft: BatchItemDraft;
  abono?: SessionAbono;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
}

export interface ProcessBatchOpts {
  db: Firestore;
  businessId: string;
  name: string;
  periodFrom?: string;
  periodTo?: string;
  accountIds?: string[];
  currentUserId: string;
  currentUserName?: string;
  items: BatchItemDraft[];
  onProgress?: (done: number, total: number) => void;
  onResultsChange?: (results: ProcessingResult[]) => void;
  onBatchCreated?: (batchId: string) => void;
}

export interface ProcessBatchOutcome {
  batchId: string;
  results: ProcessingResult[];
  stats: { total: number; confirmed: number; review: number; notFound: number; manual: number; duplicates: number };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Serializador FIFO. Encadena las llamadas `fn` en orden: el phase match+claim
 *  se ejecuta uno a la vez aunque haya múltiples workers de OCR en paralelo.
 *  Esto evita que dos capturas con igual monto+fecha elijan la misma fila del
 *  EdeC antes de que el primer claim se commitée.
 */
function makeSerializer() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Busca un abono existente en el mismo negocio con el mismo receiptHash.
// Si lo encuentra, retornamos sus identificadores para enlazar el duplicado al original.
// Usa collectionGroup('abonos') porque las capturas viven en bankStatements/{monthKey}/abonos.
async function findDuplicateAbono(
  db: Firestore,
  businessId: string,
  receiptHash: string,
): Promise<{ abonoId: string; batchId?: string; monthKey: string } | null> {
  try {
    const q = query(
      collectionGroup(db, 'abonos'),
      where('businessId', '==', businessId),
      where('receiptHash', '==', receiptHash),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() as any;
    // path: businesses/{bid}/bankStatements/{monthKey}/abonos/{abonoId}
    const segs = d.ref.path.split('/');
    const monthKey = segs[segs.length - 3] || todayISO().slice(0, 7);
    return {
      abonoId: data.id || d.id,
      batchId: data.batchId,
      monthKey,
    };
  } catch (e) {
    console.warn('[findDuplicateAbono] query falló, continuando sin chequeo de dup', e);
    return null;
  }
}

export function topCandidatesSnapshot(matches: RankedMatch[]): SessionAbonoCandidate[] {
  return matches.slice(0, 3).map(m => ({
    rowId: m.row.rowId,
    bankAccountId: m.row.bankAccountId,
    accountAlias: m.row.accountAlias,
    bankName: m.row.bankName,
    monthKey: m.row.monthKey,
    score: m.score,
    confidence: m.confidence,
    rowDate: m.row.date,
    rowAmount: m.row.amount,
    rowRef: m.row.reference,
    rowDescription: m.row.description,
    reasons: m.reasons,
  }));
}

// Recursivo: Firestore rechaza cualquier `undefined` anidado (p.ej. dentro de
// ocrRaw o candidateMatches). Limpia objetos planos y arrays; deja null/Date/primitivos intactos.
export function stripUndefined(obj: any): any {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj
      .map(v => stripUndefined(v))
      .filter(v => v !== undefined);
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = stripUndefined(v);
      if (cleaned !== undefined) clean[k] = cleaned;
    }
    return clean;
  }
  return obj;
}

export async function processReceiptBatch(opts: ProcessBatchOpts): Promise<ProcessBatchOutcome> {
  const {
    db, businessId, name, periodFrom, periodTo, accountIds,
    currentUserId, currentUserName, items,
    onProgress, onResultsChange, onBatchCreated,
  } = opts;

  // 1. Crear batch en Firestore
  const batchId = newId('batch');
  const batchDoc: ReconciliationBatch = {
    id: batchId,
    businessId,
    name: name.trim(),
    periodFrom: periodFrom || undefined,
    periodTo: periodTo || undefined,
    accountIds: accountIds && accountIds.length ? accountIds : undefined,
    createdAt: new Date().toISOString(),
    createdBy: currentUserId,
    createdByName: currentUserName,
    status: 'processing',
    stats: {
      total: items.length,
      confirmed: 0,
      review: 0,
      notFound: 0,
      manual: items.filter(i => i.kind === 'manual').length,
    },
    source: items.every(i => i.kind === 'manual')
      ? 'manual'
      : items.every(i => i.kind === 'image') ? 'capturas' : 'mixed',
  };
  await setDoc(doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`), stripUndefined(batchDoc));
  onBatchCreated?.(batchId);

  // 2. Cargar pool global con filtros
  const pool: PooledRow[] = await loadGlobalPool(db, businessId, {
    periodFrom: periodFrom || undefined,
    periodTo: periodTo || undefined,
    accountIds: accountIds && accountIds.length ? accountIds : undefined,
    excludeUsed: true,
  });

  // 3. Procesar items con concurrencia limitada
  const results: ProcessingResult[] = items.map(it => ({ draft: it, status: 'pending' as const }));
  onResultsChange?.(results);

  let done = 0;
  const aggregated = { confirmed: 0, review: 0, notFound: 0, duplicates: 0 };
  const serializeClaim = makeSerializer();

  const updateResult = (idx: number, patch: Partial<ProcessingResult>) => {
    results[idx] = { ...results[idx], ...patch };
    onResultsChange?.([...results]);
  };

  async function processOne(idx: number): Promise<void> {
    const draft = items[idx];
    updateResult(idx, { status: 'processing' });

    try {
      let abonoBase: DraftAbono;
      let receiptUrl: string | undefined;
      let receiptHash: string | undefined;
      let ocrRaw: ExtractedReceipt | undefined;

      if (draft.kind === 'image') {
        // 1) Hash primero (rápido, todo en cliente) para detectar duplicados antes de gastar OCR.
        receiptHash = await hashFile(draft.file);
        const dup = await findDuplicateAbono(db, businessId, receiptHash);
        if (dup) {
          // Archivar como duplicado: referencia al original, sin OCR ni match.
          const dupAbonoId = newId('ab');
          const dupMonth = todayISO().slice(0, 7);
          const dupAbono: SessionAbono & { businessId: string } = {
            id: dupAbonoId,
            status: 'duplicado',
            amount: 0,
            date: todayISO(),
            batchId,
            businessId,
            matchRowId: null,
            candidateMatches: [],
            receiptHash,
            duplicateOfAbonoId: dup.abonoId,
            duplicateOfBatchId: dup.batchId,
            duplicateOfMonthKey: dup.monthKey,
            note: `Duplicado de captura ya registrada (abono ${dup.abonoId}). Archivado para revisión manual.`,
            reviewReason: `La misma imagen ya fue procesada anteriormente (mismo hash SHA-256).`,
          };
          await setDoc(
            doc(db, `businesses/${businessId}/bankStatements/${dupMonth}/abonos/${dupAbonoId}`),
            stripUndefined(dupAbono),
          );
          aggregated.duplicates += 1;
          updateResult(idx, { status: 'done', abono: dupAbono });
          return;
        }
        // 2) No es duplicado: corre OCR y upload en paralelo.
        const [ocr, uploaded] = await Promise.all([
          extractReceipt(draft.file),
          uploadToCloudinary(draft.file, 'dualis_payments').catch(() => undefined),
        ]);
        ocrRaw = ocr;
        receiptUrl = uploaded?.secure_url;
        abonoBase = {
          amount: ocr.amount || 0,
          date: ocr.date || todayISO(),
          reference: ocr.reference || undefined,
          cedula: ocr.cedula || undefined,
          phone: ocr.phone || undefined,
          clientName: ocr.senderName || undefined,
          operationType: (ocr.operationType && ocr.operationType !== 'otro' ? ocr.operationType : undefined) as Exclude<OperationType, 'otro'> | undefined,
          note: ocr.notes || undefined,
          receiptUrl,
        };
      } else {
        abonoBase = {
          amount: draft.amount,
          date: draft.date,
          reference: draft.reference || undefined,
          cedula: draft.cedula || undefined,
          clientName: draft.clientName || undefined,
          note: draft.note || undefined,
        };
      }

      const filteredPool = draft.kind === 'manual' && draft.bankAccountId
        ? pool.filter(p => p.bankAccountId === draft.bankAccountId)
        : pool;

      // Usamos holder object para evitar que TS narrowee los tipos por el
      // valor inicial (las asignaciones viven en un closure async).
      const state: {
        status: AbonoStatus;
        matchRowId: string | null;
        matchAccountAlias?: string;
        matchBankAccountId?: string;
        matchBankName?: string;
        matchMonthKey?: string;
        reviewReason?: string;
        duplicateOfAbonoId?: string;
        duplicateOfBatchId?: string;
        duplicateOfMonthKey?: string;
        candidateMatches: SessionAbonoCandidate[];
      } = {
        status: 'no_encontrado',
        matchRowId: null,
        candidateMatches: [],
      };

      // CRÍTICO: el abonoId que se reclama y el que se persiste deben ser EL MISMO.
      // Antes generábamos uno random aquí y otro distinto al guardar el abono → la
      // entrada en usedReferences quedaba huérfana (apuntaba a un abonoId inexistente)
      // y bloqueaba para siempre la confirmación manual del candidato.
      const abonoId = newId('ab');

      // Phase match+claim serializado entre workers para evitar que dos capturas
      // con igual monto+fecha elijan la misma fila del EdeC antes de que el
      // primer claim se commitée. Al ganar el claim, se marca la fila como
      // `isUsed` en el pool compartido → workers siguientes la saltan.
      await serializeClaim(async () => {
        const matches = findMatches(abonoBase, filteredPool);
        state.candidateMatches = topCandidatesSnapshot(matches);
        const top = matches[0];
        const topIdentity = top?.row.bankAccountId || top?.row.accountAlias;
        if (top && (top.confidence === 'exact' || top.confidence === 'high')
            && topIdentity && top.row.reference && abonoBase.reference) {
          const claim = await claimReference(db, businessId, {
            bankAccountId: top.row.bankAccountId,
            accountAlias: top.row.accountAlias,
            reference: top.row.reference,
            amount: top.row.amount,
            abonoId,
            batchId,
            bankRowId: top.row.rowId,
            monthKey: top.row.monthKey,
            claimedByUid: currentUserId,
            claimedByName: currentUserName,
          });
          if (claim.ok === true) {
            state.status = 'confirmado';
            state.matchRowId = top.row.rowId;
            state.matchAccountAlias = top.row.accountAlias;
            state.matchBankAccountId = top.row.bankAccountId;
            state.matchBankName = top.row.bankName;
            state.matchMonthKey = top.row.monthKey;
            top.row.isUsed = true;
          } else {
            const ex = claim.existing;
            state.status = 'duplicado';
            state.reviewReason = `Mismo banco + referencia + monto ya conciliado por ${ex.claimedByName || ex.claimedByUid} el ${new Date(ex.claimedAt).toLocaleString()}.`;
            state.duplicateOfAbonoId = ex.abonoId;
            state.duplicateOfBatchId = ex.batchId;
            state.duplicateOfMonthKey = ex.monthKey;
            top.row.isUsed = true;
          }
        } else if (matches.length > 0) {
          state.status = 'revisar';
          state.reviewReason = `${matches.length} candidato(s). Top: ${top.confidence} (score ${top.score}). Confianza insuficiente para auto-confirmar.`;
        } else {
          state.reviewReason = 'No se encontraron filas en el pool que coincidan con monto y fecha (±3 días).';
        }
      });

      const {
        status, matchRowId, matchAccountAlias, matchBankAccountId, matchBankName,
        matchMonthKey, reviewReason, duplicateOfAbonoId, duplicateOfBatchId,
        duplicateOfMonthKey, candidateMatches,
      } = state;

      const abonoMonthKey = matchMonthKey || abonoBase.date.slice(0, 7);
      const sessionAbono: SessionAbono & { businessId: string } = {
        ...abonoBase,
        id: abonoId,
        status,
        matchRowId,
        matchAccountAlias,
        matchBankAccountId,
        matchBankName,
        matchMonthKey,
        batchId,
        candidateMatches,
        receiptUrl,
        receiptHash,
        ocrRaw,
        businessId,
        reviewReason,
        duplicateOfAbonoId,
        duplicateOfBatchId,
        duplicateOfMonthKey,
      };
      await setDoc(
        doc(db, `businesses/${businessId}/bankStatements/${abonoMonthKey}/abonos/${abonoId}`),
        stripUndefined(sessionAbono),
      );

      if (status === 'confirmado') aggregated.confirmed += 1;
      else if (status === 'revisar') aggregated.review += 1;
      else if (status === 'duplicado') aggregated.duplicates += 1;
      else aggregated.notFound += 1;

      updateResult(idx, { status: 'done', abono: sessionAbono });
    } catch (e: any) {
      // Aún en error, escribimos un abono placeholder para que aparezca en el panel
      // con el mensaje de error visible en `note`. Sin esto el contador del lote
      // dice "3 sin match" pero el panel está vacío (data huérfana).
      const errMsg = e?.message || String(e);
      aggregated.notFound += 1;
      try {
        const fallbackId = newId('ab');
        const fallbackMonth = todayISO().slice(0, 7);
        const fallbackName = draft.kind === 'image' ? draft.file.name : 'Manual';
        const errorAbono: SessionAbono & { businessId: string; errorMsg: string } = {
          id: fallbackId,
          status: 'no_encontrado',
          amount: 0,
          date: todayISO(),
          batchId,
          businessId,
          matchRowId: null,
          note: `⚠ Falló procesamiento (${fallbackName}): ${errMsg.slice(0, 200)}`,
          errorMsg: errMsg.slice(0, 500),
          candidateMatches: [],
        };
        await setDoc(
          doc(db, `businesses/${businessId}/bankStatements/${fallbackMonth}/abonos/${fallbackId}`),
          stripUndefined(errorAbono),
        );
      } catch (writeErr) {
        // si el escribirlo también falla, igual aggregamos al contador
        console.warn('[processReceiptBatch] no se pudo guardar abono de error', writeErr);
      }
      updateResult(idx, { status: 'error', errorMsg: errMsg });
    } finally {
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  // Concurrency runner
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(OCR_CONCURRENCY, items.length); w++) {
    workers.push((async function next() {
      while (cursor < items.length) {
        const idx = cursor++;
        await processOne(idx);
      }
    })());
  }
  await Promise.all(workers);

  // 4. Actualizar batch con stats finales
  const finalStats = {
    total: items.length,
    confirmed: aggregated.confirmed,
    review: aggregated.review,
    notFound: aggregated.notFound,
    manual: items.filter(i => i.kind === 'manual').length,
    duplicates: aggregated.duplicates,
  };
  await setDoc(
    doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`),
    { status: 'done', stats: finalStats },
    { merge: true },
  );

  return { batchId, results, stats: finalStats };
}

// Añade capturas a un lote ya existente. Usa los mismos filtros (período + cuentas)
// del batch para cargar el pool global. Los stats del batch se re-sincronizan
// automáticamente vía el useEffect de BatchReviewPanel — no tocar aquí.
export async function appendImagesToBatch(opts: {
  db: Firestore;
  businessId: string;
  batch: ReconciliationBatch;
  files: File[];
  currentUserId: string;
  currentUserName?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { db, businessId, batch, files, currentUserId, currentUserName, onProgress } = opts;
  if (!files.length) return;

  const pool = await loadGlobalPool(db, businessId, {
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    accountIds: batch.accountIds,
    excludeUsed: true,
  });

  let done = 0;
  const serializeClaim = makeSerializer();

  async function processOne(file: File): Promise<void> {
    try {
      const receiptHash = await hashFile(file);
      const dup = await findDuplicateAbono(db, businessId, receiptHash);
      if (dup) {
        const dupAbonoId = newId('ab');
        const dupMonth = todayISO().slice(0, 7);
        const dupAbono: SessionAbono & { businessId: string } = {
          id: dupAbonoId,
          status: 'duplicado',
          amount: 0,
          date: todayISO(),
          batchId: batch.id,
          businessId,
          matchRowId: null,
          candidateMatches: [],
          receiptHash,
          duplicateOfAbonoId: dup.abonoId,
          duplicateOfBatchId: dup.batchId,
          duplicateOfMonthKey: dup.monthKey,
          note: `Duplicado de captura ya registrada (abono ${dup.abonoId}). Archivado para revisión manual.`,
          reviewReason: `La misma imagen ya fue procesada anteriormente (mismo hash SHA-256).`,
        };
        await setDoc(
          doc(db, `businesses/${businessId}/bankStatements/${dupMonth}/abonos/${dupAbonoId}`),
          stripUndefined(dupAbono),
        );
        return;
      }
      const [ocr, uploaded] = await Promise.all([
        extractReceipt(file),
        uploadToCloudinary(file, 'dualis_payments').catch(() => undefined),
      ]);
      const receiptUrl = uploaded?.secure_url;
      const abonoBase: DraftAbono = {
        amount: ocr.amount || 0,
        date: ocr.date || todayISO(),
        reference: ocr.reference || undefined,
        cedula: ocr.cedula || undefined,
        phone: ocr.phone || undefined,
        clientName: ocr.senderName || undefined,
        operationType: (ocr.operationType && ocr.operationType !== 'otro' ? ocr.operationType : undefined) as Exclude<OperationType, 'otro'> | undefined,
        note: ocr.notes || undefined,
        receiptUrl,
      };

      const state: {
        status: AbonoStatus;
        matchRowId: string | null;
        matchAccountAlias?: string;
        matchBankAccountId?: string;
        matchBankName?: string;
        matchMonthKey?: string;
        reviewReason?: string;
        duplicateOfAbonoId?: string;
        duplicateOfBatchId?: string;
        duplicateOfMonthKey?: string;
        candidateMatches: SessionAbonoCandidate[];
      } = {
        status: 'no_encontrado',
        matchRowId: null,
        candidateMatches: [],
      };

      const abonoId = newId('ab');

      // Phase match+claim serializado para anti-carrera (ver processReceiptBatch).
      await serializeClaim(async () => {
        const matches = findMatches(abonoBase, pool);
        state.candidateMatches = topCandidatesSnapshot(matches);
        const top = matches[0];
        const topIdentity = top?.row.bankAccountId || top?.row.accountAlias;
        if (top && (top.confidence === 'exact' || top.confidence === 'high')
            && topIdentity && top.row.reference && abonoBase.reference) {
          const claim = await claimReference(db, businessId, {
            bankAccountId: top.row.bankAccountId,
            accountAlias: top.row.accountAlias,
            reference: top.row.reference,
            amount: top.row.amount,
            abonoId,
            batchId: batch.id,
            bankRowId: top.row.rowId,
            monthKey: top.row.monthKey,
            claimedByUid: currentUserId,
            claimedByName: currentUserName,
          });
          if (claim.ok === true) {
            state.status = 'confirmado';
            state.matchRowId = top.row.rowId;
            state.matchAccountAlias = top.row.accountAlias;
            state.matchBankAccountId = top.row.bankAccountId;
            state.matchBankName = top.row.bankName;
            state.matchMonthKey = top.row.monthKey;
            top.row.isUsed = true;
          } else {
            const ex = claim.existing;
            state.status = 'duplicado';
            state.reviewReason = `Mismo banco + referencia + monto ya conciliado por ${ex.claimedByName || ex.claimedByUid} el ${new Date(ex.claimedAt).toLocaleString()}.`;
            state.duplicateOfAbonoId = ex.abonoId;
            state.duplicateOfBatchId = ex.batchId;
            state.duplicateOfMonthKey = ex.monthKey;
            top.row.isUsed = true;
          }
        } else if (matches.length > 0) {
          state.status = 'revisar';
          state.reviewReason = `${matches.length} candidato(s). Top: ${top.confidence} (score ${top.score}). Confianza insuficiente para auto-confirmar.`;
        } else {
          state.reviewReason = 'No se encontraron filas en el pool que coincidan con monto y fecha (±3 días).';
        }
      });

      const {
        status, matchRowId, matchAccountAlias, matchBankAccountId, matchBankName,
        matchMonthKey, reviewReason, duplicateOfAbonoId, duplicateOfBatchId,
        duplicateOfMonthKey, candidateMatches,
      } = state;

      const abonoMonthKey = matchMonthKey || abonoBase.date.slice(0, 7);
      const sessionAbono: SessionAbono & { businessId: string } = {
        ...abonoBase,
        id: abonoId,
        status,
        matchRowId,
        matchAccountAlias,
        matchBankAccountId,
        matchBankName,
        matchMonthKey,
        batchId: batch.id,
        candidateMatches,
        receiptUrl,
        receiptHash,
        ocrRaw: ocr,
        businessId,
        reviewReason,
        duplicateOfAbonoId,
        duplicateOfBatchId,
        duplicateOfMonthKey,
      };
      await setDoc(
        doc(db, `businesses/${businessId}/bankStatements/${abonoMonthKey}/abonos/${abonoId}`),
        stripUndefined(sessionAbono),
      );
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      try {
        const fallbackId = newId('ab');
        const fallbackMonth = todayISO().slice(0, 7);
        const errorAbono: SessionAbono & { businessId: string; errorMsg: string } = {
          id: fallbackId,
          status: 'no_encontrado',
          amount: 0,
          date: todayISO(),
          batchId: batch.id,
          businessId,
          matchRowId: null,
          note: `⚠ Falló procesamiento (${file.name}): ${errMsg.slice(0, 200)}`,
          errorMsg: errMsg.slice(0, 500),
          candidateMatches: [],
        };
        await setDoc(
          doc(db, `businesses/${businessId}/bankStatements/${fallbackMonth}/abonos/${fallbackId}`),
          stripUndefined(errorAbono),
        );
      } catch (writeErr) {
        console.warn('[appendImagesToBatch] no se pudo guardar abono de error', writeErr);
      }
    } finally {
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(OCR_CONCURRENCY, files.length); w++) {
    workers.push((async function next() {
      while (cursor < files.length) {
        const idx = cursor++;
        await processOne(files[idx]);
      }
    })());
  }
  await Promise.all(workers);
}
