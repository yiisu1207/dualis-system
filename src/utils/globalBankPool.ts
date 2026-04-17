// Pool global cross-cuenta de filas bancarias.
// Une todas las filas de todos los EdeC del negocio (filtrado opcional por período/cuenta)
// y marca como `isUsed` aquellas que ya tienen entrada en `usedReferences`.

import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { BankRow } from './bankReconciliation';
import type { UsedReference } from '../../types';
import { buildReferenceFingerprint } from './referenceFingerprint';

export interface PooledRow extends BankRow {
  // Garantizamos los campos denormalizados como requeridos en este tipo
  accountAlias: string;
  bankAccountId?: string;
  bankName?: string;
  monthKey: string;
  isUsed: boolean;
  usedBy?: { abonoId: string; claimedAt: string };
}

export interface LoadGlobalPoolOpts {
  periodFrom?: string;       // YYYY-MM-DD
  periodTo?: string;         // YYYY-MM-DD
  accountIds?: string[];     // restringir a ciertas BusinessBankAccount.id
  bankAccountAliases?: string[]; // alternativa: filtrar por alias del EdeC
  excludeUsed?: boolean;     // default true — filtra filas ya conciliadas
}

/** Devuelve YYYY-MM dado YYYY-MM-DD. */
function monthKeyFromDate(iso: string): string {
  return iso.slice(0, 7);
}

/** Lista los monthKeys que cubren un rango [from, to]. Si no hay rango, devuelve [] (= todos). */
function monthKeysInRange(from?: string, to?: string): string[] {
  if (!from && !to) return [];
  const start = from ? monthKeyFromDate(from) : '0000-00';
  const end = to ? monthKeyFromDate(to) : '9999-99';
  const out: string[] = [];
  if (start === end) return [start];
  // Iterar mes a mes — barato (≤ 24 iteraciones para 2 años)
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Carga todas las usedReferences de un negocio, indexadas por fingerprint. */
async function loadUsedReferencesIndex(
  db: Firestore,
  businessId: string,
): Promise<Map<string, UsedReference>> {
  const ref = collection(db, `businesses/${businessId}/usedReferences`);
  const snap = await getDocs(ref);
  const map = new Map<string, UsedReference>();
  snap.forEach(d => map.set(d.id, d.data() as UsedReference));
  return map;
}

/** Lista todos los monthKeys disponibles bajo `bankStatements`. */
async function listAvailableMonths(db: Firestore, businessId: string): Promise<string[]> {
  // bankStatements/{monthKey}/accounts/* — para listar monthKeys hay que listar la subcolección
  // Firestore web SDK no soporta listCollections en cliente; usamos un doc-índice opcional o
  // cargamos por rango. Si no hay rango, intentamos con últimos 24 meses como fallback.
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Carga todas las filas bancarias de un monthKey + cuenta. */
async function loadAccountsForMonth(
  db: Firestore,
  businessId: string,
  monthKey: string,
): Promise<Array<{ accountAlias: string; bankAccountId?: string; bankName?: string; rows: BankRow[] }>> {
  const ref = collection(db, `businesses/${businessId}/bankStatements/${monthKey}/accounts`);
  const snap = await getDocs(ref);
  const out: Array<{ accountAlias: string; bankAccountId?: string; bankName?: string; rows: BankRow[] }> = [];
  snap.forEach(d => {
    const data = d.data() as any;
    out.push({
      accountAlias: data.accountAlias || d.id,
      bankAccountId: data.bankAccountId,
      bankName: data.bankName,
      rows: (data.rows || []) as BankRow[],
    });
  });
  return out;
}

export async function loadGlobalPool(
  db: Firestore,
  businessId: string,
  opts: LoadGlobalPoolOpts = {},
): Promise<PooledRow[]> {
  const excludeUsed = opts.excludeUsed !== false;
  const months = opts.periodFrom || opts.periodTo
    ? monthKeysInRange(opts.periodFrom, opts.periodTo)
    : await listAvailableMonths(db, businessId);

  // Cargar cuentas de cada monthKey en paralelo
  const monthPayloads = await Promise.all(
    months.map(async (mk) => ({ monthKey: mk, accounts: await loadAccountsForMonth(db, businessId, mk) })),
  );

  // Cargar índice de usedReferences una sola vez
  const usedIndex = await loadUsedReferencesIndex(db, businessId);

  const pool: PooledRow[] = [];
  for (const { monthKey, accounts } of monthPayloads) {
    for (const acc of accounts) {
      // Filtro por accountIds o aliases si fue pedido
      if (opts.accountIds && opts.accountIds.length && acc.bankAccountId && !opts.accountIds.includes(acc.bankAccountId)) continue;
      if (opts.bankAccountAliases && opts.bankAccountAliases.length && !opts.bankAccountAliases.includes(acc.accountAlias)) continue;

      for (const row of acc.rows) {
        if (!row.amount || row.amount <= 0) continue; // solo créditos (los abonos son entrantes)
        // Filtro por período (fecha de la fila)
        if (opts.periodFrom && row.date < opts.periodFrom) continue;
        if (opts.periodTo && row.date > opts.periodTo) continue;

        // Calcular fingerprint para checkear usedReferences
        let isUsed = false;
        let usedBy: PooledRow['usedBy'] | undefined;
        if (acc.bankAccountId && row.reference) {
          try {
            const fp = await buildReferenceFingerprint(acc.bankAccountId, row.reference, row.amount);
            const u = usedIndex.get(fp);
            if (u) {
              isUsed = true;
              usedBy = { abonoId: u.abonoId, claimedAt: u.claimedAt };
            }
          } catch { /* fingerprint failure → asumir no usada */ }
        }

        if (excludeUsed && isUsed) continue;

        pool.push({
          ...row,
          accountAlias: acc.accountAlias,
          bankAccountId: acc.bankAccountId,
          bankName: acc.bankName,
          monthKey,
          isUsed,
          usedBy,
        });
      }
    }
  }
  return pool;
}
