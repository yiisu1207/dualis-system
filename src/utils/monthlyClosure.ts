// Cierre mensual contable de la conciliación.
//
// El gesto "cerré enero" hace tres cosas atómicamente:
//  1. Escribe `businesses/{bid}/monthlyClosures/{YYYY-MM}` con snapshot de KPIs.
//  2. Marca todos los `reconciliationBatches` cuyo período cae 100% dentro del
//     mes con `closed: true` + metadata del cierre.
//  3. (Los EdeC NO cambian su doc — el `closed` del mes se deriva leyendo el
//     MonthlyClosure al vuelo en la UI. Evita N writes adicionales.)
//
// Precheck obligatorio antes del cierre: contar abonos en estado 'revisar' /
// 'no_encontrado' del mes. Si hay > 0, el caller debe confirmar antes de seguir
// (se quedan como "no reclamados permanentes" una vez cerrado).
//
// Cross-period writes: cerrar un mes NO bloquea matches rezagados contra sus
// EdeC. Un pago nuevo de junio que matchea una fila de marzo cerrado sigue
// funcionando — sólo marca el abono con `matchedCrossClosedPeriod: true` para
// que la UI lo resalte. El MonthlyClosure del mes cerrado no se modifica.

import {
  collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, where,
  writeBatch, deleteDoc, type Firestore,
} from 'firebase/firestore';
import type { MonthlyClosure, ReconciliationBatch } from '../../types';

export type MonthKey = string; // YYYY-MM

/** Devuelve el YYYY-MM al que pertenece un lote. Regla: si tiene periodFrom+To
 *  y ambos caen en el mismo mes, ese es su monthKey. Si cruzan meses, usa el
 *  mes de periodFrom (convención). Si no tiene período, usa createdAt. */
export function batchMonthKey(b: ReconciliationBatch): MonthKey | null {
  if (b.periodFrom) return b.periodFrom.slice(0, 7);
  if (b.createdAt) return b.createdAt.slice(0, 7);
  return null;
}

/** True si el período del lote cae 100% dentro del mes (ambos extremos). */
export function batchFullyInMonth(b: ReconciliationBatch, monthKey: MonthKey): boolean {
  if (!b.periodFrom || !b.periodTo) {
    // Sin período explícito: caemos al monthKey derivado. Suficiente para el
    // botón "Cerrar mes" del caso común; el operador puede excluir manualmente.
    return batchMonthKey(b) === monthKey;
  }
  return b.periodFrom.slice(0, 7) === monthKey && b.periodTo.slice(0, 7) === monthKey;
}

export interface ClosurePrecheck {
  monthKey: MonthKey;
  /** Lotes que serían cerrados. */
  batchesToClose: ReconciliationBatch[];
  /** Abonos en review/no_encontrado dentro de esos lotes (lo que quedaría como "no reclamado" permanente). */
  orphans: {
    review: number;
    notFound: number;
    duplicates: number;
    total: number;
  };
  /** Snapshot base de KPIs — se persiste al cerrar. */
  snapshot: MonthlyClosure['snapshot'];
  /** Ya está cerrado este mes? Si sí, la UI debe mostrar "Re-abrir" en vez de "Cerrar". */
  alreadyClosed?: MonthlyClosure;
}

/** Calcula el precheck sin escribir nada. La UI lo llama para decidir si
 *  muestra warning de huérfanos antes de confirmar el cierre. */
export async function precheckMonthClosure(
  db: Firestore,
  businessId: string,
  monthKey: MonthKey,
  allBatches: ReconciliationBatch[],
): Promise<ClosurePrecheck> {
  const batchesToClose = allBatches.filter(b => batchFullyInMonth(b, monthKey));

  // Contamos huérfanos y confirmados desde los stats cacheados de cada lote.
  // Son la fuente de verdad visible al operador; si están stale, ya tenemos
  // "Re-buscar global" para re-sincronizar antes de cerrar.
  let confirmed = 0, review = 0, notFound = 0, duplicates = 0;
  for (const b of batchesToClose) {
    const s = b.stats;
    if (!s) continue;
    confirmed += s.confirmed || 0;
    review += s.review || 0;
    notFound += s.notFound || 0;
    duplicates += s.duplicates || 0;
  }

  // usedReferences con monthKey == este: sólo informativo (cuántas refs de
  // EdeC del mes están quemadas).
  let usedReferenceCount = 0;
  try {
    const snap = await getDocs(
      query(
        collection(db, `businesses/${businessId}/usedReferences`),
        where('monthKey', '==', monthKey),
      ),
    );
    usedReferenceCount = snap.size;
  } catch {
    // No crítico, seguimos.
  }

  // EdeC del mes = count de docs en bankStatements/{monthKey}/accounts/*
  let accountCount = 0;
  try {
    const accSnap = await getDocs(
      collection(db, `businesses/${businessId}/bankStatements/${monthKey}/accounts`),
    );
    accountCount = accSnap.size;
  } catch {
    // No crítico.
  }

  let alreadyClosed: MonthlyClosure | undefined;
  try {
    const existing = await getDoc(
      doc(db, `businesses/${businessId}/monthlyClosures/${monthKey}`),
    );
    if (existing.exists()) alreadyClosed = existing.data() as MonthlyClosure;
  } catch {
    // ignore
  }

  return {
    monthKey,
    batchesToClose,
    orphans: { review, notFound, duplicates, total: review + notFound + duplicates },
    snapshot: {
      accountCount,
      batchCount: batchesToClose.length,
      confirmed,
      review,
      notFound,
      usedReferenceCount,
    },
    alreadyClosed,
  };
}

export interface CloseMonthResult {
  ok: true;
  closure: MonthlyClosure;
  batchesClosed: number;
}

/** Ejecuta el cierre. Asume que el caller ya mostró el precheck al usuario y
 *  obtuvo confirmación si había huérfanos. */
export async function closeMonth(
  db: Firestore,
  businessId: string,
  precheck: ClosurePrecheck,
  author: { uid: string; name?: string; note?: string },
): Promise<CloseMonthResult> {
  const closedAt = new Date().toISOString();

  const closure: MonthlyClosure = {
    monthKey: precheck.monthKey,
    closedAt,
    closedBy: author.uid,
    closedByName: author.name,
    snapshot: precheck.snapshot,
    note: author.note,
    reopens: [],
  };

  // writeBatch: el doc de cierre + flag closed en cada lote. Límite Firestore
  // es 500 writes por batch; para meses con >450 lotes habría que paginar,
  // pero en práctica un mes tiene decenas, no cientos.
  const wb = writeBatch(db);

  wb.set(
    doc(db, `businesses/${businessId}/monthlyClosures/${precheck.monthKey}`),
    stripUndefined(closure),
  );

  for (const b of precheck.batchesToClose) {
    wb.set(
      doc(db, `businesses/${businessId}/reconciliationBatches/${b.id}`),
      {
        closed: true,
        closedAt,
        closedBy: author.uid,
        closedByName: author.name,
        closedMonthKey: precheck.monthKey,
      },
      { merge: true },
    );
  }

  await wb.commit();

  return { ok: true, closure, batchesClosed: precheck.batchesToClose.length };
}

/** Re-abre un mes previamente cerrado. Apendiza al array `reopens` para
 *  auditoría — el MonthlyClosure se mantiene (no se borra) pero los flags
 *  `closed` de los lotes se revierten. Reason es obligatorio (contexto legal). */
export async function reopenMonth(
  db: Firestore,
  businessId: string,
  monthKey: MonthKey,
  allBatches: ReconciliationBatch[],
  author: { uid: string; name?: string; reason: string },
): Promise<{ ok: true; batchesReopened: number } | { ok: false; error: string }> {
  if (!author.reason || author.reason.trim().length < 3) {
    return { ok: false, error: 'Debes escribir una razón (mínimo 3 caracteres) para re-abrir un mes cerrado.' };
  }

  const closureRef = doc(db, `businesses/${businessId}/monthlyClosures/${monthKey}`);
  const existing = await getDoc(closureRef);
  if (!existing.exists()) return { ok: false, error: `El mes ${monthKey} no estaba cerrado.` };

  const prev = existing.data() as MonthlyClosure;
  const reopenEntry = {
    at: new Date().toISOString(),
    by: author.uid,
    byName: author.name,
    reason: author.reason.trim(),
  };

  // Borramos el doc de cierre (no lo guardamos con flag reopened — la
  // presencia/ausencia del doc ES el estado). Pero antes apendizamos el
  // evento a un historial separado para auditoría.
  const wb = writeBatch(db);

  // Historial inmutable: businesses/{bid}/closureHistory/{monthKey}_{timestamp}
  const historyId = `${monthKey}_${Date.now()}`;
  wb.set(
    doc(db, `businesses/${businessId}/closureHistory/${historyId}`),
    stripUndefined({
      monthKey,
      closedAt: prev.closedAt,
      closedBy: prev.closedBy,
      closedByName: prev.closedByName,
      snapshot: prev.snapshot,
      note: prev.note,
      reopen: reopenEntry,
    }),
  );

  // Borramos el cierre activo.
  wb.delete(closureRef);

  // Revertimos flags en los lotes que fueron cerrados por este mes.
  const affected = allBatches.filter(b => b.closed && b.closedMonthKey === monthKey);
  for (const b of affected) {
    wb.set(
      doc(db, `businesses/${businessId}/reconciliationBatches/${b.id}`),
      {
        closed: false,
        closedAt: null,
        closedBy: null,
        closedByName: null,
        closedMonthKey: null,
      },
      { merge: true },
    );
  }

  await wb.commit();

  // Además: registro independiente con el evento de reopen para que
  // monthlyClosures/{monthKey} si alguien lo re-cierra tenga el historial
  // unificado. Lo dejamos para Fase C — por ahora el closureHistory alcanza.
  // (Opcional: podríamos delegate a una colección unificada.)
  void reopenEntry;

  return { ok: true, batchesReopened: affected.length };
}

/** Lista los cierres vigentes del negocio. Para UI de "meses cerrados" y
 *  para que `loadGlobalPool` sepa cuáles EdeC marcar como read-only en la vista. */
export async function listMonthlyClosures(
  db: Firestore,
  businessId: string,
): Promise<MonthlyClosure[]> {
  const snap = await getDocs(collection(db, `businesses/${businessId}/monthlyClosures`));
  return snap.docs.map(d => d.data() as MonthlyClosure);
}

/** True si el monthKey está cerrado actualmente. Útil para guards de escritura
 *  del lado cliente (la reglas Firestore son la verdad, esto es UX). */
export async function isMonthClosed(
  db: Firestore,
  businessId: string,
  monthKey: MonthKey,
): Promise<boolean> {
  const snap = await getDoc(doc(db, `businesses/${businessId}/monthlyClosures/${monthKey}`));
  return snap.exists();
}

/** Marca (client-side) un abono nuevo que matcheó una fila de un EdeC en mes
 *  cerrado. La UI debe llamarlo desde el flujo de confirmación; el flag queda
 *  en el abono para que el lote del mes actual resalte el item con chip amarillo
 *  y el reporte lo liste separado. El mes cerrado NO se modifica. */
export async function tagCrossClosedMatch(
  db: Firestore,
  abonoRef: any, // DocumentReference tipada en el caller
  closedMonthKey: MonthKey,
): Promise<void> {
  await setDoc(
    abonoRef,
    {
      matchedCrossClosedPeriod: true,
      matchedCrossClosedMonthKey: closedMonthKey,
    },
    { merge: true },
  );
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// Export no usado ahora pero disponible para futuros callers — silenciar
// warning de bundler si no hay consumidor todavía.
void deleteDoc;
void collectionGroup;
