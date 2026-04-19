import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
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
 * Atomicidad: corre en `runTransaction` para que reads+writes sean consistentes
 * aún bajo concurrencia (dos usuarios aplicando pagos al mismo set de facturas).
 *
 * Idempotencia: si el ABONO ya tiene allocations con este abonoMovementId registradas,
 * la operación es un no-op. En cada FACTURA se filtran duplicados por abonoMovementId
 * antes de agregar, evitando doble conteo por re-edición sin reverse previo.
 */
export async function applyAbonoAllocations(
  db: Firestore,
  abonoMovementId: string,
  abonoAmountUSD: number,
  allocations: Array<{ invoiceId: string; invoiceRef?: string; amount: number }>,
): Promise<void> {
  const allocatedAt = new Date().toISOString();

  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
  const overpaymentUSD = Math.max(0, abonoAmountUSD - allocatedTotal);

  const fullAllocations: InvoiceAllocation[] = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceRef: a.invoiceRef,
    amount: Number(a.amount.toFixed(2)),
    allocatedAt,
    abonoMovementId,
  }));

  const abonoRef = doc(db, 'movements', abonoMovementId);
  const invoiceRefs = fullAllocations.map((a) => doc(db, 'movements', a.invoiceId));

  await runTransaction(db, async (tx) => {
    const abonoSnap = await tx.get(abonoRef);
    const abonoExisting = abonoSnap.exists()
      ? ((abonoSnap.data() as Movement).allocations as InvoiceAllocation[] | undefined) ?? []
      : [];
    const alreadyApplied =
      abonoExisting.length > 0 &&
      abonoExisting.every((a) => a.abonoMovementId === abonoMovementId) &&
      abonoExisting.length === fullAllocations.length &&
      abonoExisting.every((a, i) =>
        a.invoiceId === fullAllocations[i].invoiceId &&
        Math.abs(a.amount - fullAllocations[i].amount) < 0.005
      );
    if (alreadyApplied) return;

    const invoiceSnaps = await Promise.all(invoiceRefs.map((r) => tx.get(r)));

    tx.update(abonoRef, {
      allocations: fullAllocations,
      allocatedTotal: Number(allocatedTotal.toFixed(2)),
      overpaymentUSD: Number(overpaymentUSD.toFixed(2)),
    });

    for (let i = 0; i < fullAllocations.length; i++) {
      const alloc = fullAllocations[i];
      const invSnap = invoiceSnaps[i];
      if (!invSnap.exists()) continue;

      const inv = invSnap.data() as Movement;
      const original = inv.amountInUSD ?? 0;
      const existing: InvoiceAllocation[] = Array.isArray(inv.allocations) ? inv.allocations : [];
      const deduped = existing.filter((a) => a.abonoMovementId !== abonoMovementId);
      const nextAllocations = [...deduped, alloc];
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
      tx.update(invoiceRefs[i], update);
    }
  });
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

  // Leemos fuera de la transacción para saber qué facturas tocar.
  // La re-lectura dentro de la tx garantiza la atomicidad del rollback.
  const abonoSnapOuter = await getDoc(abonoRef);
  if (!abonoSnapOuter.exists()) return;
  const abono = abonoSnapOuter.data() as Movement;
  const allocs: InvoiceAllocation[] = Array.isArray(abono.allocations) ? abono.allocations : [];
  if (allocs.length === 0) return;

  const invoiceIds = [...new Set(allocs.map((a) => a.invoiceId))];
  const invoiceRefs = invoiceIds.map((id) => doc(db, 'movements', id));

  await runTransaction(db, async (tx) => {
    const abonoSnap = await tx.get(abonoRef);
    if (!abonoSnap.exists()) return;
    const abonoCurrent = abonoSnap.data() as Movement;
    const currentAllocs: InvoiceAllocation[] = Array.isArray(abonoCurrent.allocations)
      ? abonoCurrent.allocations
      : [];
    if (currentAllocs.length === 0) return;

    const invoiceSnaps = await Promise.all(invoiceRefs.map((r) => tx.get(r)));

    tx.update(abonoRef, {
      allocations: [],
      allocatedTotal: 0,
      overpaymentUSD: 0,
    });

    for (let i = 0; i < invoiceRefs.length; i++) {
      const invSnap = invoiceSnaps[i];
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
      tx.update(invoiceRefs[i], update);
    }
  });
}
