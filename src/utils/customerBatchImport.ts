// Aplicación de la importación masiva de clientes — escritura a Firestore
// usando writeBatch para atomicidad.
//
// Por cada fila válida:
//   - Si action === 'create': crea documento en `customers` con metadata
//     de import (importedAt, importBatchId).
//   - Si action === 'update': actualiza el cliente existente (solo campos
//     no vacíos del row).
//   - Si action === 'skip': no hace nada.
//
// Si la fila tiene saldoInicial > 0 (o aging[]), genera además uno o varios
// movements en `movements` con `isOpeningBalance: true` para que el saldo
// aparezca en CxC pero NO afecte reportes de operación.
//
// Diseñado para batches grandes — chunkea cada 450 ops (Firestore limit 500).

import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { ImportRowValidated } from './customerImport';

export interface BatchImportResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  movementsCreated: number;
  errors: Array<{ row: number; reason: string }>;
}

interface BatchImportOptions {
  businessId: string;
  ownerId?: string;
  createdByName?: string;
  /** Si false, solo crea/actualiza clientes sin generar movements. */
  generateOpeningBalances?: boolean;
}

interface PendingOp {
  kind: 'create' | 'update' | 'set';
  ref: any;
  data: any;
}

const FIRESTORE_BATCH_LIMIT = 450;

/**
 * Aplica un lote de filas validadas a Firestore.
 *
 * @returns Resultado con conteos y errores por fila.
 */
export async function applyCustomerBatchImport(
  rows: ImportRowValidated[],
  options: BatchImportOptions,
): Promise<BatchImportResult> {
  const { businessId, ownerId, createdByName, generateOpeningBalances = true } = options;
  const batchId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  const result: BatchImportResult = {
    batchId,
    created: 0,
    updated: 0,
    skipped: 0,
    movementsCreated: 0,
    errors: [],
  };

  const ops: PendingOp[] = [];

  for (const row of rows) {
    if (row.action === 'skip' || row.errors.length > 0) {
      result.skipped++;
      continue;
    }

    try {
      const isUpdate = row.action === 'update' && !!row.duplicateOfId;
      const customerId = isUpdate
        ? row.duplicateOfId!
        : doc(collection(db, 'customers')).id;

      const fullName = (row.nombre || '').trim();
      const customerData: any = {
        fullName,
        nombre: fullName,
        businessId,
        importedAt: nowIso,
        importBatchId: batchId,
      };
      if (ownerId) customerData.ownerId = ownerId;
      if (row.rif) customerData.rif = row.rif.trim();
      if (row.cedula) customerData.cedula = row.cedula.trim();
      if (row.telefono) customerData.telefono = row.telefono.trim();
      if (row.email) customerData.email = row.email.trim().toLowerCase();
      if (row.direccion) customerData.direccion = row.direccion.trim();
      if (!isUpdate) customerData.createdAt = nowIso;

      // Tramos de saldo inicial (aging si está presente, si no un único monto)
      const tramos: Array<{ amount: number; daysAgo: number; nota?: string }> = [];
      if (row.aging && row.aging.length > 0) {
        for (const t of row.aging) {
          if (t.amount > 0) tramos.push(t);
        }
      } else if (row.saldoInicial && row.saldoInicial > 0) {
        tramos.push({
          amount: row.saldoInicial,
          daysAgo: row.diasAtras || 0,
          nota: row.saldoNota,
        });
      }

      const willHaveOpeningBalance = generateOpeningBalances && tramos.length > 0;
      if (willHaveOpeningBalance) customerData.hasOpeningBalance = true;

      // Op del cliente
      ops.push({
        kind: isUpdate ? 'update' : 'create',
        ref: doc(db, 'customers', customerId),
        data: customerData,
      });

      // Ops de movements (saldo inicial — uno por tramo de aging)
      if (willHaveOpeningBalance) {
        for (const tramo of tramos) {
          const movRef = doc(collection(db, 'movements'));
          const fecha = tramo.daysAgo > 0
            ? new Date(Date.now() - tramo.daysAgo * 86400_000).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          const movData: any = {
            entityId: customerId,
            entityName: fullName,
            businessId,
            ownerId: ownerId || null,
            date: fecha,
            createdAt: nowIso,
            concept: tramo.nota || row.saldoNota || 'Saldo inicial migrado',
            amount: tramo.amount,
            amountInUSD: tramo.amount,
            currency: 'USD',
            movementType: 'FACTURA',
            accountType: 'BCV',
            rateUsed: 1,
            // Flags clave para que NO afecte reportes operativos
            isOpeningBalance: true,
            openingBalanceNote: tramo.nota || row.saldoNota || null,
            importBatchId: batchId,
            migratedFromHistorical: true,
            // CxC: queda como factura abierta para que pueda recibir abonos
            pagado: false,
            estadoPago: 'PENDIENTE',
            esVentaContado: false,
            invoiceStatus: 'OPEN',
            allocations: [],
            allocatedTotal: 0,
            dueDate: fecha,
            createdBy: ownerId || null,
            createdByName: createdByName || null,
          };
          ops.push({ kind: 'set', ref: movRef, data: movData });
          result.movementsCreated++;
        }
      }

      if (isUpdate) result.updated++;
      else result.created++;
    } catch (e: any) {
      result.errors.push({ row: row._row || 0, reason: e?.message || 'Error inesperado' });
      result.skipped++;
    }
  }

  // Flush en chunks
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === 'set' || op.kind === 'create') {
        batch.set(op.ref, op.data);
      } else {
        batch.set(op.ref, op.data, { merge: true });
      }
    }
    try {
      await batch.commit();
    } catch (e: any) {
      console.error('[customerBatchImport] batch commit error', e);
      result.errors.push({
        row: 0,
        reason: `Lote ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1}: ${e?.message || 'commit failed'}`,
      });
    }
  }

  return result;
}
