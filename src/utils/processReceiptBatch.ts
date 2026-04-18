// Procesa un lote de capturas (y/o entradas manuales) creando un ReconciliationBatch:
// - sube imágenes a Cloudinary, corre OCR, intenta auto-confirmar matches exact/high
// - crea SessionAbonos en bankStatements/{monthKey}/abonos
// - reclama referencias atómicamente vía claimReference (anti-reuso)
// - actualiza el batch con stats finales

import { doc, setDoc, type Firestore } from 'firebase/firestore';
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
  stats: { total: number; confirmed: number; review: number; notFound: number; manual: number };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function topCandidatesSnapshot(matches: RankedMatch[]): SessionAbonoCandidate[] {
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
  }));
}

function stripUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
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
  const aggregated = { confirmed: 0, review: 0, notFound: 0 };

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
        const [ocr, hash, uploaded] = await Promise.all([
          extractReceipt(draft.file),
          hashFile(draft.file),
          uploadToCloudinary(draft.file, 'dualis_payments').catch(() => undefined),
        ]);
        ocrRaw = ocr;
        receiptHash = hash;
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

      const matches = findMatches(abonoBase, filteredPool);
      const candidateMatches = topCandidatesSnapshot(matches);
      const top = matches[0];

      let status: AbonoStatus = 'no_encontrado';
      let matchRowId: string | null = null;
      let matchAccountAlias: string | undefined;
      let matchBankAccountId: string | undefined;
      let matchBankName: string | undefined;
      let matchMonthKey: string | undefined;

      if (top && (top.confidence === 'exact' || top.confidence === 'high')
          && top.row.bankAccountId && top.row.reference && abonoBase.reference) {
        const claim = await claimReference(db, businessId, {
          bankAccountId: top.row.bankAccountId,
          reference: top.row.reference,
          amount: top.row.amount,
          abonoId: newId('ab'),
          batchId,
          bankRowId: top.row.rowId,
          monthKey: top.row.monthKey,
          claimedByUid: currentUserId,
          claimedByName: currentUserName,
        });
        if (claim.ok) {
          status = 'confirmado';
          matchRowId = top.row.rowId;
          matchAccountAlias = top.row.accountAlias;
          matchBankAccountId = top.row.bankAccountId;
          matchBankName = top.row.bankName;
          matchMonthKey = top.row.monthKey;
        } else {
          status = matches.length > 0 ? 'revisar' : 'no_encontrado';
        }
      } else if (matches.length > 0) {
        status = 'revisar';
      }

      const abonoId = newId('ab');
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
      };
      await setDoc(
        doc(db, `businesses/${businessId}/bankStatements/${abonoMonthKey}/abonos/${abonoId}`),
        stripUndefined(sessionAbono),
      );

      if (status === 'confirmado') aggregated.confirmed += 1;
      else if (status === 'revisar') aggregated.review += 1;
      else aggregated.notFound += 1;

      updateResult(idx, { status: 'done', abono: sessionAbono });
    } catch (e: any) {
      aggregated.notFound += 1;
      updateResult(idx, { status: 'error', errorMsg: e?.message || String(e) });
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
  };
  await setDoc(
    doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`),
    { status: 'done', stats: finalStats },
    { merge: true },
  );

  return { batchId, results, stats: finalStats };
}
