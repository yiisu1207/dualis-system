// Motor determinístico de conciliación bancaria.
// Puro, sin Firebase, testable.

export type OperationType = 'pago_movil' | 'transferencia' | 'deposito' | 'punto_venta' | 'otro';

export interface BankRow {
  rowId: string;
  accountAlias: string;
  accountLabel?: string;
  bankCode?: string;
  bankName?: string;
  date: string;            // YYYY-MM-DD
  amount: number;          // positivo = crédito
  reference?: string;
  description?: string;
  operationType?: OperationType;
  originBankCode?: string;
  isIntrabank?: boolean;
  balance?: number;
  amountTolerancePct?: number; // hereda del BankStatementAccount al denormalizar
  matched?: boolean;
  matchedAbonoId?: string;
}

export interface DraftAbono {
  id?: string;
  amount: number;
  date: string;            // YYYY-MM-DD
  operationType?: Exclude<OperationType, 'otro'>;
  reference?: string;
  cedula?: string;         // "V-12345678" o "J-123456789"
  phone?: string;          // "0414-1234567"
  clientName?: string;
  note?: string;
}

export type Confidence = 'exact' | 'high' | 'medium' | 'low';

export interface RankedMatch {
  row: BankRow;
  confidence: Confidence;
  reasons: string[];
  score: number;
}

export interface FindMatchesOpts {
  dateToleranceDays?: number; // default 1
}

const onlyDigits = (s: string | undefined | null): string =>
  (s || '').replace(/\D+/g, '');

const daysBetween = (a: string, b: string): number => {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.round(Math.abs(da - db) / 86_400_000);
};

const last = (s: string, n: number): string => s.length >= n ? s.slice(-n) : s;

/** Fuzzy ref match — compara últimos 8/7 dígitos exactos. Muestra los dígitos matcheados en reason. */
function fuzzyRefScore(abonoRef?: string, rowRef?: string): { points: number; reason: string } | null {
  const a = onlyDigits(abonoRef);
  const r = onlyDigits(rowRef);
  if (!a || !r) return null;
  // Ref completa idéntica
  if (a === r) return { points: 30, reason: `ref exacta (${a})` };
  // Últimos 8 dígitos
  if (a.length >= 8 && r.length >= 8 && last(a, 8) === last(r, 8)) {
    const matched = last(a, 8);
    return { points: 25, reason: `ref últimos 8: ${matched}` };
  }
  // Últimos 7 dígitos
  if (a.length >= 7 && r.length >= 7 && last(a, 7) === last(r, 7)) {
    const matched = last(a, 7);
    return { points: 22, reason: `ref últimos 7: ${matched}` };
  }
  return null;
}

/** Normaliza string para fuzzy: minúsculas, sin tildes, sin puntuación extra, espacios colapsados. */
const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function nameWordsMatch(clientName: string, description: string): number {
  const name = normalize(clientName);
  const desc = normalize(description);
  if (!name || !desc) return 0;
  const words = name.split(' ').filter(w => w.length >= 3);
  if (!words.length) return 0;
  const hits = words.filter(w => desc.includes(w)).length;
  return hits >= 1 ? 5 : 0;
}

const classifyByScore = (score: number): Confidence => {
  if (score >= 80) return 'exact';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

export function findMatches(
  abono: DraftAbono,
  pool: BankRow[],
  opts: FindMatchesOpts = {},
): RankedMatch[] {
  const dateTol = opts.dateToleranceDays ?? 1;
  if (!Number.isFinite(abono.amount) || !abono.date) return [];

  const cedulaDigits = onlyDigits(abono.cedula);
  const phoneDigits = onlyDigits(abono.phone);
  const phoneLast7 = phoneDigits.length >= 7 ? phoneDigits.slice(-7) : '';

  const results: RankedMatch[] = [];
  for (const row of pool) {
    if (!row || !Number.isFinite(row.amount) || !row.date) continue;

    // Filtro duro monto — tolerancia exacta ±0.01, o pct si la cuenta lo define.
    const pct = row.amountTolerancePct && row.amountTolerancePct > 0 ? row.amountTolerancePct : 0;
    const tolerance = Math.max(0.01, pct * Math.abs(row.amount));
    const amountDiff = Math.abs(row.amount - abono.amount);
    if (amountDiff > tolerance) continue;

    // Filtro duro fecha
    const dDiff = daysBetween(row.date, abono.date);
    if (dDiff > dateTol) continue;

    // Scoring
    const reasons: string[] = [];
    let score = 0;

    if (amountDiff <= 0.01) {
      score += 40;
      reasons.push('monto exacto');
    } else {
      score += 25;
      reasons.push(`monto aproximado (diff $${amountDiff.toFixed(2)})`);
    }

    if (dDiff === 0) {
      score += 25;
      reasons.push('fecha exacta');
    } else {
      score += 15;
      reasons.push(`fecha ±${dDiff}d`);
    }

    const ref = fuzzyRefScore(abono.reference, row.reference);
    if (ref) {
      score += ref.points;
      reasons.push(ref.reason);
    }

    if (abono.operationType && row.operationType) {
      if (abono.operationType === row.operationType) {
        score += 10;
        reasons.push('tipo coincide');
      } else if (row.operationType !== 'otro') {
        score -= 15;
        reasons.push('tipo contradice');
      }
    }

    if (cedulaDigits && row.description && row.description.includes(cedulaDigits)) {
      score += 10;
      reasons.push('cédula en descripción');
    }

    if (phoneLast7 && row.description && row.description.includes(phoneLast7)) {
      score += 10;
      reasons.push('teléfono en descripción');
    }

    if (abono.clientName && row.description) {
      const nameBonus = nameWordsMatch(abono.clientName, row.description);
      if (nameBonus > 0) {
        score += nameBonus;
        reasons.push('nombre en descripción');
      }
    }

    if (row.matched) {
      score -= 30;
      reasons.push('ya conciliada');
    }

    results.push({
      row,
      score,
      confidence: classifyByScore(score),
      reasons,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function classifyAbono(
  _abono: DraftAbono,
  matches: RankedMatch[],
  userPickedMatch?: string,
): 'confirmado' | 'revisar' | 'no_encontrado' {
  if (!matches.length) return 'no_encontrado';
  if (userPickedMatch) {
    const picked = matches.find(m => m.row.rowId === userPickedMatch);
    if (picked && (picked.confidence === 'exact' || picked.confidence === 'high')) {
      return 'confirmado';
    }
    if (picked) return 'revisar';
  }
  // Si ninguno fue elegido, cae en revisar por default (hay candidatos pero no decisión).
  return 'revisar';
}

/**
 * Dedup — devuelve abonoId si hay uno con mismo (amount +-0.01, date igual, y ref fuzzy alta).
 * Usa la misma fuzzy logic de findMatches para ref.
 */
export function findDuplicateAbono(
  candidate: DraftAbono,
  existing: DraftAbono[],
): string | null {
  for (const ex of existing) {
    if (!ex.id) continue;
    if (Math.abs(ex.amount - candidate.amount) > 0.01) continue;
    if (ex.date !== candidate.date) continue;
    // Si ambos tienen ref, exigir fuzzy match fuerte (≥22 = últimos 7 dígitos).
    if (candidate.reference && ex.reference) {
      const ref = fuzzyRefScore(candidate.reference, ex.reference);
      if (ref && ref.points >= 22) return ex.id;
      continue;
    }
    // Si ninguno tiene ref, mismo monto+fecha basta.
    if (!candidate.reference && !ex.reference) return ex.id;
  }
  return null;
}
