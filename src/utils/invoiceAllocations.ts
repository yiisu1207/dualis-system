import {
  Firestore,
  doc,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { Movement, MovementType, InvoiceAllocation } from '../../types';

/**
 * Saldo restante de una factura en modo invoiceLinked.
 * Legacy fallback: si no tiene invoiceStatus/allocations, usa `pagado` como proxy.
 */
export function getInvoiceRemaining(invoice: Movement): number {
  const original = invoice.amountInUSD ?? 0;
  if (invoice.anulada) return 0;

  const hasNewFields =
    invoice.invoiceStatus !== undefined ||
    invoice.allocations !== undefined ||
    invoice.allocatedTotal !== undefined;

  if (!hasNewFields) {
    return invoice.pagado ? 0 : original;
  }

  if (invoice.invoiceStatus === 'PAID') return 0;
  const allocated = invoice.allocatedTotal ?? 0;
  return Math.max(0, original - allocated);
}

/**
 * Recalcula el estado de una factura a partir de su allocatedTotal y monto.
 */
export function recomputeInvoiceStatus(
  invoice: Pick<Movement, 'amountInUSD' | 'allocatedTotal'>
): 'OPEN' | 'PARTIAL' | 'PAID' {
  const original = invoice.amountInUSD ?? 0;
  const allocated = invoice.allocatedTotal ?? 0;
  if (allocated <= 0) return 'OPEN';
  if (allocated + 0.009 >= original) return 'PAID';
  return 'PARTIAL';
}

/**
 * FIFO: ordena facturas por fecha ascendente y consume el abono hasta agotarlo.
 * Devuelve las allocations resultantes (sin allocatedAt / abonoMovementId, que rellena el caller).
 */
export function computeFifoAllocations(
  openInvoices: Movement[],
  abonoUSD: number,
): Array<{ invoiceId: string; invoiceRef?: string; amount: number }> {
  const candidates = openInvoices
    .filter((inv) => inv.movementType === MovementType.FACTURA && !inv.anulada)
    .map((inv) => ({ inv, remaining: getInvoiceRemaining(inv) }))
    .filter(({ remaining }) => remaining > 0.009)
    .sort((a, b) => {
      const da = new Date(a.inv.date).getTime();
      const db_ = new Date(b.inv.date).getTime();
      if (da !== db_) return da - db_;
      return new Date(a.inv.createdAt || a.inv.date).getTime()
           - new Date(b.inv.createdAt || b.inv.date).getTime();
    });

  const result: Array<{ invoiceId: string; invoiceRef?: string; amount: number }> = [];
  let pool = abonoUSD;
  for (const { inv, remaining } of candidates) {
    if (pool <= 0.009) break;
    const apply = Math.min(pool, remaining);
    result.push({
      invoiceId: inv.id,
      invoiceRef: inv.nroControl || inv.concept || undefined,
      amount: Number(apply.toFixed(2)),
    });
    pool -= apply;
  }
  return result;
}

/**
 * Aplica las allocations al documento del ABONO y propaga a cada FACTURA afectada.
 *
 * - ABONO: guarda `allocations[]`, `allocatedTotal`, `overpaymentUSD`.
 * - FACTURA: agrega una entrada al array `allocations[]`, recalcula `allocatedTotal`
 *   e `invoiceStatus`. Marca `pagado`/`pagadoAt` si queda en PAID para compat con código legacy.
 *
 * Idempotencia: si el ABONO ya tiene allocations registradas, se asume que fue aplicado
 * previamente y NO se duplica. Para re-aplicar, primero llamar `reverseAbonoAllocations`.
 */
export async function applyAbonoAllocations(
  db: Firestore,
  abonoMovementId: string,
  abonoAmountUSD: number,
  allocations: Array<{ invoiceId: string; invoiceRef?: string; amount: number }>,
): Promise<void> {
  const allocatedAt = new Date().toISOString();
  const batch = writeBatch(db);

  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
  const overpaymentUSD = Math.max(0, abonoAmountUSD - allocatedTotal);

  const fullAllocations: InvoiceAllocation[] = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceRef: a.invoiceRef,
    amount: Number(a.amount.toFixed(2)),
    allocatedAt,
    abonoMovementId,
  }));

  // 1) ABONO: grabar allocations + totales
  batch.update(doc(db, 'movements', abonoMovementId), {
    allocations: fullAllocations,
    allocatedTotal: Number(allocatedTotal.toFixed(2)),
    overpaymentUSD: Number(overpaymentUSD.toFixed(2)),
  });

  // 2) Para cada factura: leer current state, agregar allocation, recalcular status
  for (const alloc of fullAllocations) {
    const invRef = doc(db, 'movements', alloc.invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) continue;

    const inv = invSnap.data() as Movement;
    const original = inv.amountInUSD ?? 0;
    const existing: InvoiceAllocation[] = Array.isArray(inv.allocations) ? inv.allocations : [];
    const nextAllocations = [...existing, alloc];
    const nextAllocatedTotal = nextAllocations.reduce((s, x) => s + x.amount, 0);
    const nextStatus = recomputeInvoiceStatus({
      amountInUSD: original,
      allocatedTotal: nextAllocatedTotal,
    });

    const update: Record<string, any> = {
      allocations: nextAllocations,
      allocatedTotal: Number(nextAllocatedTotal.toFixed(2)),
      invoiceStatus: nextStatus,
    };
    if (nextStatus === 'PAID') {
      update.pagado = true;
      update.pagadoAt = allocatedAt;
    } else {
      update.pagado = false;
    }
    batch.update(invRef, update);
  }

  await batch.commit();
}

/**
 * Revierte las allocations de un ABONO previamente aplicado.
 * Se llama al anular o editar un ABONO. Quita las allocations del ABONO y de cada FACTURA afectada.
 */
export async function reverseAbonoAllocations(
  db: Firestore,
  abonoMovementId: string,
): Promise<void> {
  const abonoRef = doc(db, 'movements', abonoMovementId);
  const abonoSnap = await getDoc(abonoRef);
  if (!abonoSnap.exists()) return;

  const abono = abonoSnap.data() as Movement;
  const allocs: InvoiceAllocation[] = Array.isArray(abono.allocations) ? abono.allocations : [];
  if (allocs.length === 0) return;

  const batch = writeBatch(db);

  // 1) Limpiar el ABONO
  batch.update(abonoRef, {
    allocations: [],
    allocatedTotal: 0,
    overpaymentUSD: 0,
  });

  // 2) Para cada factura, quitar las allocations que referencian este abono
  const invoiceIds = [...new Set(allocs.map((a) => a.invoiceId))];
  for (const invoiceId of invoiceIds) {
    const invRef = doc(db, 'movements', invoiceId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) continue;

    const inv = invSnap.data() as Movement;
    const existing: InvoiceAllocation[] = Array.isArray(inv.allocations) ? inv.allocations : [];
    const nextAllocations = existing.filter((a) => a.abonoMovementId !== abonoMovementId);
    const nextAllocatedTotal = nextAllocations.reduce((s, x) => s + x.amount, 0);
    const nextStatus = recomputeInvoiceStatus({
      amountInUSD: inv.amountInUSD ?? 0,
      allocatedTotal: nextAllocatedTotal,
    });

    const update: Record<string, any> = {
      allocations: nextAllocations,
      allocatedTotal: Number(nextAllocatedTotal.toFixed(2)),
      invoiceStatus: nextStatus,
      pagado: nextStatus === 'PAID',
    };
    if (nextStatus !== 'PAID') update.pagadoAt = null;
    batch.update(invRef, update);
  }

  await batch.commit();
}
