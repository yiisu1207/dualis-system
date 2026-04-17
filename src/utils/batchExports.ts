// Export CSV de un ReconciliationBatch — para cuadre contable y auditoría.

import { collection, getDocs, type Firestore } from 'firebase/firestore';
import type { ReconciliationBatch, UsedReference } from '../../types';
import type { SessionAbono } from '../components/conciliacion/ReconciliationReport';

function csvEscape(v: any): string {
  const s = v == null ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportBatchCSV(
  batch: ReconciliationBatch,
  abonos: SessionAbono[],
): void {
  const headers = [
    'fecha', 'monto', 'referencia', 'estado', 'cuenta_dualis_alias',
    'banco_destino', 'cliente', 'cedula', 'telefono', 'tipo_operacion',
    'matched_row_id', 'matched_month_key', 'nota',
  ];
  const rows = abonos.map(a => [
    a.date,
    a.amount.toFixed(2),
    a.reference || '',
    a.status,
    a.matchAccountAlias || '',
    a.matchBankName || '',
    a.clientName || '',
    a.cedula || '',
    a.phone || '',
    a.operationType || '',
    a.matchRowId || '',
    a.matchMonthKey || '',
    a.note || '',
  ]);
  const lines = [
    headers.join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = batch.name.replace(/[^a-z0-9-]+/gi, '_').toLowerCase();
  a.download = `lote_${safeName}_${batch.id.slice(-6)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Snapshot CSV de `usedReferences` de un negocio — para auditoría anti-fraude.
 * Útil para contraloría, cierres anuales o verificación externa.
 */
export async function exportUsedReferencesCSV(db: Firestore, businessId: string): Promise<number> {
  const snap = await getDocs(collection(db, `businesses/${businessId}/usedReferences`));
  const headers = [
    'fingerprint', 'bank_account_id', 'referencia', 'monto', 'claimed_at',
    'claimed_by_uid', 'claimed_by_name', 'abono_id', 'movement_id', 'batch_id', 'month_key',
  ];
  const rows: string[][] = [];
  snap.forEach(d => {
    const r = d.data() as UsedReference;
    rows.push([
      r.fingerprint, r.bankAccountId, r.reference, r.amount.toFixed(2),
      r.claimedAt, r.claimedByUid, r.claimedByName || '',
      r.abonoId, r.movementId || '', r.batchId || '', r.monthKey || '',
    ]);
  });
  const lines = [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `auditoria_usedReferences_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
