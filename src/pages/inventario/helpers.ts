// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  INVENTARIO — Lógica de procesamiento                                    ║
// ║                                                                          ║
// ║  Aquí vive todo lo que afecta a Firestore al procesar entradas/salidas:  ║
// ║   · Crear/actualizar StockEntry/StockExit                                ║
// ║   · Aplicar al stock del producto (stockByAlmacen + stock total)         ║
// ║   · Generar inventoryMovements para el Kardex                            ║
// ║   · Detectar diferencias contra documento esperado                       ║
// ║   · Generar backorders automáticos (recepción parcial)                   ║
// ║   · Aplicar varianzas de conteo físico                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import {
  collection, doc, runTransaction, setDoc, serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type {
  StockEntry, StockExit, StockOpLine,
  PhysicalCount, PhysicalCountLine,
} from './types';

// ─── ID generation ────────────────────────────────────────────────────────

export function genId(prefix: string = ''): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Detección de diferencias contra documento esperado ──────────────────

export interface LineDiff {
  productId: string;
  productName: string;
  expectedQty: number;
  doneQty: number;
  diff: number;        // doneQty - expectedQty (positivo = sobra, negativo = falta)
  pct: number;         // diff / expectedQty * 100
  severity: 'ok' | 'minor' | 'major';
}

export function detectLineDiffs(lines: StockOpLine[]): LineDiff[] {
  return lines.map(l => {
    const diff = l.doneQty - l.expectedQty;
    const pct = l.expectedQty > 0 ? (diff / l.expectedQty) * 100 : 0;
    const absPct = Math.abs(pct);
    const severity: LineDiff['severity'] = absPct < 0.01 ? 'ok'
      : absPct < 5 ? 'minor'
      : 'major';
    return {
      productId: l.productId,
      productName: l.productName,
      expectedQty: l.expectedQty,
      doneQty: l.doneQty,
      diff,
      pct,
      severity,
    };
  });
}

export function hasShortReceipt(lines: StockOpLine[]): boolean {
  return lines.some(l => l.doneQty < l.expectedQty);
}

export function hasOverReceipt(lines: StockOpLine[]): boolean {
  return lines.some(l => l.doneQty > l.expectedQty);
}

// ─── Cálculo de totales ──────────────────────────────────────────────────

export function calcTotalUSD(lines: StockOpLine[]): number {
  return lines.reduce((sum, l) => sum + (l.doneQty * (l.unitCostUSD ?? 0)), 0);
}

// ─── Procesamiento atómico: aplica una entrada al stock ──────────────────

/**
 * Procesa una StockEntry: aumenta el stock de cada producto en el almacén
 * destino, escribe el documento como DONE, y genera movements para el kardex.
 *
 * Si hay diferencia entre expectedQty y doneQty (recepción parcial), genera
 * automáticamente un backorder (otra StockEntry en DRAFT con las cantidades
 * faltantes apuntando al original via parentEntryId).
 *
 * Todo en una transacción Firestore para garantizar consistencia.
 */
export async function processStockEntry(
  db: Firestore,
  businessId: string,
  entry: StockEntry,
  options: {
    /** Si true y hay líneas con doneQty < expectedQty, crea un backorder. */
    createBackorder?: boolean;
    /** Si true, además marca el sourceDoc (ej. compra) como recibido. No-op si no hay sourceDocId. */
    markSourceAsReceived?: boolean;
    /** Usuario que procesa. */
    actorUid: string;
    actorName?: string;
  },
): Promise<{ ok: true; processedEntry: StockEntry; backorderEntry?: StockEntry } | { ok: false; error: string }> {
  if (entry.status === 'DONE' || entry.status === 'CANCELLED') {
    return { ok: false, error: `La entrada ya está en estado ${entry.status}.` };
  }
  if (!entry.lines.length) {
    return { ok: false, error: 'La entrada no tiene líneas de producto.' };
  }
  if (!entry.warehouseId) {
    return { ok: false, error: 'Falta especificar el almacén destino.' };
  }

  // Detectar líneas que requieren backorder
  const needsBackorder = options.createBackorder && hasShortReceipt(entry.lines);
  const backorderLines: StockOpLine[] = needsBackorder
    ? entry.lines
        .filter(l => l.doneQty < l.expectedQty)
        .map(l => ({
          ...l,
          id: genId('line_'),
          expectedQty: l.expectedQty - l.doneQty,
          doneQty: 0,
        }))
    : [];

  const backorderEntry: StockEntry | undefined = needsBackorder ? {
    id: genId('entry_'),
    businessId,
    type: entry.type,
    status: 'DRAFT',
    operationDate: new Date().toISOString(),
    warehouseId: entry.warehouseId,
    warehouseName: entry.warehouseName,
    sourceDocType: entry.sourceDocType,
    sourceDocId: entry.sourceDocId,
    sourceDocLabel: entry.sourceDocLabel ? `${entry.sourceDocLabel} (backorder)` : 'backorder',
    lines: backorderLines,
    motivo: `Backorder de entrada ${entry.id} — cantidades pendientes de recibir`,
    totalUSD: calcTotalUSD(backorderLines),
    parentEntryId: entry.id,
    createdAt: new Date().toISOString(),
    createdBy: options.actorUid,
    createdByName: options.actorName,
  } : undefined;

  try {
    await runTransaction(db, async (tx) => {
      // 1. Para cada línea, leer el producto y actualizar stock
      const productRefs = entry.lines.map(l => doc(db, `businesses/${businessId}/products/${l.productId}`));
      const productSnaps = await Promise.all(productRefs.map(r => tx.get(r)));

      for (let i = 0; i < entry.lines.length; i++) {
        const line = entry.lines[i];
        if (line.doneQty <= 0) continue;
        const snap = productSnaps[i];
        if (!snap.exists()) continue;
        const prod = snap.data() as any;

        const stockByAlmacen = { ...(prod.stockByAlmacen || {}) };
        const currentInWarehouse = Number(stockByAlmacen[entry.warehouseId] || 0);
        stockByAlmacen[entry.warehouseId] = currentInWarehouse + line.doneQty;

        // Stock total = suma de todos los almacenes (o legacy stock + delta)
        const newTotalStock = Object.values(stockByAlmacen).reduce((s: number, v: any) => s + Number(v || 0), 0);

        tx.update(productRefs[i], {
          stockByAlmacen,
          stock: newTotalStock,
          // Si la entrada tiene costo unitario, actualizamos el costo del producto
          // (promedio ponderado simplificado). Dejamos esto como opt-in del caller.
          ...(line.unitCostUSD && line.unitCostUSD > 0 ? { costoUSD: line.unitCostUSD } : {}),
        });

        // 2. Generar movimientos en ambas colecciones para que el Kardex
        //    nuevo Y el legacy muestren la operación. La nueva incluye más
        //    metadata (warehouseName, sourceDocType, drill-down). La legacy
        //    mantiene compatibilidad con queries existentes y el tab Kardex
        //    de la pantalla Inventario vieja.
        const newMovRef = doc(collection(db, `businesses/${businessId}/inventoryMovements`));
        tx.set(newMovRef, {
          productId: line.productId,
          productName: line.productName,
          productCode: line.productCode,
          type: 'COMPRA', // canonico para "entrada"
          quantity: line.doneQty,
          balanceAfter: newTotalStock,
          unitCostUSD: line.unitCostUSD,
          warehouseId: entry.warehouseId,
          warehouseName: entry.warehouseName,
          reason: entry.motivo || `${entry.type} — ${entry.sourceDocLabel || ''}`.trim(),
          sourceDocType: 'stockEntry',
          sourceDocId: entry.id,
          createdAt: serverTimestamp(),
          createdBy: options.actorUid,
          createdByName: options.actorName,
        });
        const legacyMovRef = doc(collection(db, `businesses/${businessId}/stock_movements`));
        tx.set(legacyMovRef, {
          productId: line.productId,
          productName: line.productName,
          type: 'COMPRA',
          quantity: line.doneQty,
          reason: entry.motivo || `${entry.type} — ${entry.sourceDocLabel || ''}`.trim(),
          userName: options.actorName || options.actorUid,
          createdAt: serverTimestamp(),
        });
      }

      // 3. Marcar la entrada como DONE
      const entryRef = doc(db, `businesses/${businessId}/stockEntries/${entry.id}`);
      tx.set(entryRef, {
        ...entry,
        status: 'DONE',
        processedAt: new Date().toISOString(),
        processedBy: options.actorUid,
        processedByName: options.actorName,
        ...(backorderEntry ? { backorderId: backorderEntry.id } : {}),
        totalUSD: calcTotalUSD(entry.lines),
      });

      // 4. Si hay backorder, crearlo en DRAFT
      if (backorderEntry) {
        const boRef = doc(db, `businesses/${businessId}/stockEntries/${backorderEntry.id}`);
        tx.set(boRef, backorderEntry);
      }
    });

    return {
      ok: true,
      processedEntry: { ...entry, status: 'DONE', processedAt: new Date().toISOString() },
      backorderEntry,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Procesamiento de salida (espejo de entrada) ──────────────────────────

export async function processStockExit(
  db: Firestore,
  businessId: string,
  exit: StockExit,
  options: {
    /** Si true y la salida es TRANSFERENCIA, crea automáticamente la
     *  StockEntry par en el almacén destino en estado CONFIRMED. */
    autoPairTransfer?: boolean;
    /** Si true, permite procesar aunque no haya stock suficiente (genera negativo). */
    allowNegative?: boolean;
    actorUid: string;
    actorName?: string;
  },
): Promise<{ ok: true; processedExit: StockExit; pairedEntry?: StockEntry } | { ok: false; error: string }> {
  if (exit.status === 'DONE' || exit.status === 'CANCELLED') {
    return { ok: false, error: `La salida ya está en estado ${exit.status}.` };
  }
  if (!exit.lines.length) {
    return { ok: false, error: 'La salida no tiene líneas de producto.' };
  }
  if (!exit.warehouseId) {
    return { ok: false, error: 'Falta especificar el almacén origen.' };
  }
  if (exit.type === 'TRANSFERENCIA' && !exit.destinationWarehouseId) {
    return { ok: false, error: 'Una transferencia requiere almacén destino.' };
  }

  try {
    let pairedEntryOut: StockEntry | undefined;

    await runTransaction(db, async (tx) => {
      const productRefs = exit.lines.map(l => doc(db, `businesses/${businessId}/products/${l.productId}`));
      const productSnaps = await Promise.all(productRefs.map(r => tx.get(r)));

      for (let i = 0; i < exit.lines.length; i++) {
        const line = exit.lines[i];
        if (line.doneQty <= 0) continue;
        const snap = productSnaps[i];
        if (!snap.exists()) continue;
        const prod = snap.data() as any;

        const stockByAlmacen = { ...(prod.stockByAlmacen || {}) };
        const currentInWarehouse = Number(stockByAlmacen[exit.warehouseId] || 0);
        const newInWarehouse = currentInWarehouse - line.doneQty;

        if (newInWarehouse < 0 && !options.allowNegative) {
          throw new Error(`Stock insuficiente de "${line.productName}" en almacén — disponible ${currentInWarehouse}, solicitado ${line.doneQty}`);
        }

        stockByAlmacen[exit.warehouseId] = newInWarehouse;
        const newTotalStock = Object.values(stockByAlmacen).reduce((s: number, v: any) => s + Number(v || 0), 0);

        tx.update(productRefs[i], {
          stockByAlmacen,
          stock: newTotalStock,
        });

        const legacyType = exit.type === 'MERMA' ? 'MERMA'
              : exit.type === 'AJUSTE_NEGATIVO' ? 'AJUSTE'
              : 'VENTA';
        const newMovRef = doc(collection(db, `businesses/${businessId}/inventoryMovements`));
        tx.set(newMovRef, {
          productId: line.productId,
          productName: line.productName,
          productCode: line.productCode,
          type: legacyType,
          quantity: -line.doneQty,
          balanceAfter: newTotalStock,
          unitCostUSD: line.unitCostUSD,
          warehouseId: exit.warehouseId,
          warehouseName: exit.warehouseName,
          reason: exit.motivo || `${exit.type} — ${exit.sourceDocLabel || ''}`.trim(),
          sourceDocType: 'stockExit',
          sourceDocId: exit.id,
          createdAt: serverTimestamp(),
          createdBy: options.actorUid,
          createdByName: options.actorName,
        });
        // Mirror al schema legacy `stock_movements` (qty positivo, type define dir)
        const legacyMovRef = doc(collection(db, `businesses/${businessId}/stock_movements`));
        tx.set(legacyMovRef, {
          productId: line.productId,
          productName: line.productName,
          type: legacyType,
          quantity: line.doneQty,
          reason: exit.motivo || `${exit.type} — ${exit.sourceDocLabel || ''}`.trim(),
          userName: options.actorName || options.actorUid,
          createdAt: serverTimestamp(),
        });
      }

      // Si es transferencia y autoPair, generar la StockEntry par
      if (exit.type === 'TRANSFERENCIA' && options.autoPairTransfer && exit.destinationWarehouseId) {
        const pairedEntry: StockEntry = {
          id: genId('entry_'),
          businessId,
          type: 'TRANSFERENCIA',
          status: 'CONFIRMED',
          operationDate: new Date().toISOString(),
          warehouseId: exit.destinationWarehouseId,
          warehouseName: exit.destinationWarehouseName,
          sourceDocType: 'stockExit',
          sourceDocId: exit.id,
          sourceDocLabel: `Transferencia desde ${exit.warehouseName || exit.warehouseId}`,
          lines: exit.lines.map(l => ({ ...l, id: genId('line_'), expectedQty: l.doneQty, doneQty: 0 })),
          motivo: `Pendiente de recibir en ${exit.destinationWarehouseName}`,
          totalUSD: 0,
          createdAt: new Date().toISOString(),
          createdBy: options.actorUid,
          createdByName: options.actorName,
        };
        const peRef = doc(db, `businesses/${businessId}/stockEntries/${pairedEntry.id}`);
        tx.set(peRef, pairedEntry);
        pairedEntryOut = pairedEntry;

        const exitRef = doc(db, `businesses/${businessId}/stockExits/${exit.id}`);
        tx.set(exitRef, {
          ...exit,
          status: 'DONE',
          pairedEntryId: pairedEntry.id,
          processedAt: new Date().toISOString(),
          processedBy: options.actorUid,
          processedByName: options.actorName,
          totalUSD: calcTotalUSD(exit.lines),
        });
      } else {
        const exitRef = doc(db, `businesses/${businessId}/stockExits/${exit.id}`);
        tx.set(exitRef, {
          ...exit,
          status: 'DONE',
          processedAt: new Date().toISOString(),
          processedBy: options.actorUid,
          processedByName: options.actorName,
          totalUSD: calcTotalUSD(exit.lines),
        });
      }
    });

    return {
      ok: true,
      processedExit: { ...exit, status: 'DONE', processedAt: new Date().toISOString() },
      pairedEntry: pairedEntryOut,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Conteo físico: aplicar varianzas ────────────────────────────────────

/**
 * Aplica un PhysicalCount: por cada línea con varianza ≠ 0 genera una entrada
 * (varianza positiva, productos que sobraron) o una salida (varianza negativa,
 * productos que faltaron). Marca el conteo como APPLIED.
 */
export async function applyPhysicalCount(
  db: Firestore,
  businessId: string,
  count: PhysicalCount,
  options: { actorUid: string; actorName?: string },
): Promise<{ ok: true; entryId?: string; exitId?: string } | { ok: false; error: string }> {
  if (count.status === 'APPLIED' || count.status === 'CANCELLED') {
    return { ok: false, error: `El conteo ya está ${count.status}.` };
  }

  // Líneas con varianza calculada
  const linesWithVariance: PhysicalCountLine[] = count.lines
    .filter(l => l.countedQty !== null)
    .map(l => ({ ...l, variance: (l.countedQty as number) - l.theoreticalQty }));

  const positives = linesWithVariance.filter(l => (l.variance ?? 0) > 0);
  const negatives = linesWithVariance.filter(l => (l.variance ?? 0) < 0);

  let entryId: string | undefined;
  let exitId: string | undefined;

  // 1. Si hay positivas, generar StockEntry CONTEO_VARIANZA
  if (positives.length) {
    const entry: StockEntry = {
      id: genId('entry_'),
      businessId,
      type: 'CONTEO_VARIANZA',
      status: 'DRAFT',
      operationDate: new Date().toISOString(),
      warehouseId: count.warehouseId,
      warehouseName: count.warehouseName,
      sourceDocType: 'physicalCount',
      sourceDocId: count.id,
      sourceDocLabel: `Conteo físico ${count.id.slice(0, 8)}`,
      lines: positives.map(l => ({
        id: genId('line_'),
        productId: l.productId,
        productCode: l.productCode,
        productName: l.productName,
        expectedQty: l.variance ?? 0,
        doneQty: l.variance ?? 0,
        unitCostUSD: l.unitCostUSD,
        lineMotivo: l.varianceMotivo,
      })),
      motivo: `Varianza positiva del conteo físico ${count.id}`,
      totalUSD: 0,
      createdAt: new Date().toISOString(),
      createdBy: options.actorUid,
      createdByName: options.actorName,
    };
    entry.totalUSD = calcTotalUSD(entry.lines);
    const res = await processStockEntry(db, businessId, entry, {
      actorUid: options.actorUid,
      actorName: options.actorName,
    });
    if (res.ok === false) return { ok: false, error: `Error al aplicar varianza positiva: ${res.error}` };
    entryId = entry.id;
  }

  // 2. Si hay negativas, generar StockExit CONTEO_VARIANZA
  if (negatives.length) {
    const exit: StockExit = {
      id: genId('exit_'),
      businessId,
      type: 'CONTEO_VARIANZA',
      status: 'DRAFT',
      operationDate: new Date().toISOString(),
      warehouseId: count.warehouseId,
      warehouseName: count.warehouseName,
      sourceDocType: 'physicalCount',
      sourceDocId: count.id,
      sourceDocLabel: `Conteo físico ${count.id.slice(0, 8)}`,
      lines: negatives.map(l => ({
        id: genId('line_'),
        productId: l.productId,
        productCode: l.productCode,
        productName: l.productName,
        expectedQty: Math.abs(l.variance ?? 0),
        doneQty: Math.abs(l.variance ?? 0),
        unitCostUSD: l.unitCostUSD,
        lineMotivo: l.varianceMotivo,
      })),
      motivo: `Varianza negativa del conteo físico ${count.id}`,
      totalUSD: 0,
      createdAt: new Date().toISOString(),
      createdBy: options.actorUid,
      createdByName: options.actorName,
    };
    exit.totalUSD = calcTotalUSD(exit.lines);
    const res = await processStockExit(db, businessId, exit, {
      actorUid: options.actorUid,
      actorName: options.actorName,
      allowNegative: true,
    });
    if (res.ok === false) return { ok: false, error: `Error al aplicar varianza negativa: ${res.error}` };
    exitId = exit.id;
  }

  // 3. Marcar el conteo como APPLIED
  await setDoc(
    doc(db, `businesses/${businessId}/physicalCounts/${count.id}`),
    {
      ...count,
      status: 'APPLIED',
      appliedAt: new Date().toISOString(),
      appliedBy: options.actorUid,
      appliedByName: options.actorName,
      appliedEntryId: entryId,
      appliedExitId: exitId,
    },
    { merge: true },
  );

  return { ok: true, entryId, exitId };
}

// ─── Generar hoja de conteo desde productos ──────────────────────────────

/**
 * Crea una PhysicalCount nueva con todos los productos del almacén (o filtrados
 * por categoría/tag) en estado DRAFT, lista para que el operario empiece a
 * contar y rellenar countedQty en cada línea.
 */
export function buildCountSheet(
  products: Array<{ id: string; codigo?: string; nombre: string; stock?: number; stockByAlmacen?: Record<string, number>; costoUSD?: number; categoria?: string }>,
  warehouseId: string,
  /** El warehouseName no se usa dentro del builder (cada línea no lo guarda),
   *  pero el caller lo necesita para hidratar el documento PhysicalCount. Se
   *  acepta por symmetría y futura expansión. */
  _warehouseName: string,
  filters: { category?: string; tag?: string } = {},
): PhysicalCountLine[] {
  return products
    .filter(p => !filters.category || p.categoria === filters.category)
    .map(p => ({
      productId: p.id,
      productCode: p.codigo,
      productName: p.nombre,
      theoreticalQty: Number(p.stockByAlmacen?.[warehouseId] ?? p.stock ?? 0),
      countedQty: null,
      unitCostUSD: p.costoUSD,
    })) as any;
}
