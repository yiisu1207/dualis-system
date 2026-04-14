export type FallbackPolicy = 'prior' | 'posterior' | 'ask';

export interface RateHistoryEntry {
  date: string;
  bcv: number;
}

export interface RateLookupResult {
  rate: number;
  sourceDate: string | null;
  isFallback: boolean;
  fallbackDirection: 'prior' | 'posterior' | 'exact' | 'none';
}

/**
 * Busca la tasa BCV para una fecha dada respetando una política de fallback.
 *
 * - `exact`: hay un registro para `dateStr` exacto.
 * - `prior`: usa el registro con fecha ≤ dateStr más cercano (comportamiento BCV real).
 * - `posterior`: usa el registro con fecha ≥ dateStr más cercano.
 * - `ask`: devuelve el match exacto si existe; si no, retorna `none` para que
 *   el caller muestre modal al usuario con las dos opciones.
 *
 * `history` debe ser un array de entradas con `date` (YYYY-MM-DD) y `bcv`.
 * Se ordena internamente para no depender del orden de entrada.
 */
export function findRateForDate(
  history: RateHistoryEntry[],
  dateStr: string,
  policy: FallbackPolicy = 'prior',
): RateLookupResult {
  const valid = history.filter((e) => e && e.bcv > 0 && !!e.date);
  if (!valid.length) {
    return { rate: 0, sourceDate: null, isFallback: false, fallbackDirection: 'none' };
  }

  const exact = valid.find((e) => e.date === dateStr);
  if (exact) {
    return { rate: exact.bcv, sourceDate: exact.date, isFallback: false, fallbackDirection: 'exact' };
  }

  if (policy === 'ask') {
    return { rate: 0, sourceDate: null, isFallback: true, fallbackDirection: 'none' };
  }

  if (policy === 'posterior') {
    const after = valid
      .filter((e) => e.date >= dateStr)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (after) {
      return { rate: after.bcv, sourceDate: after.date, isFallback: true, fallbackDirection: 'posterior' };
    }
    const latestPrior = valid
      .filter((e) => e.date <= dateStr)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latestPrior) {
      return { rate: latestPrior.bcv, sourceDate: latestPrior.date, isFallback: true, fallbackDirection: 'prior' };
    }
    return { rate: 0, sourceDate: null, isFallback: true, fallbackDirection: 'none' };
  }

  const prior = valid
    .filter((e) => e.date <= dateStr)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (prior) {
    return { rate: prior.bcv, sourceDate: prior.date, isFallback: true, fallbackDirection: 'prior' };
  }
  const after = valid
    .filter((e) => e.date >= dateStr)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (after) {
    return { rate: after.bcv, sourceDate: after.date, isFallback: true, fallbackDirection: 'posterior' };
  }
  return { rate: 0, sourceDate: null, isFallback: true, fallbackDirection: 'none' };
}

/**
 * Formatea una fecha YYYY-MM-DD como DD/MM para badges de UI.
 */
export function formatRateSourceDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [, mm, dd] = dateStr.split('-');
  if (!mm || !dd) return dateStr;
  return `${dd}/${mm}`;
}
