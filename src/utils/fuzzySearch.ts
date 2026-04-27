// Búsqueda difusa (fuzzy match) liviana — sin librerías externas (~2kb).
// Tolera typos, omisión de espacios, acentos, mayúsculas y orden de palabras.
//
// Uso:
//   const results = fuzzyFilter(items, query, item => `${item.name} ${item.sku}`);
//   results es el subset de items ordenado por relevancia descendente.
//
// Decisiones de diseño:
//   - normaliza acentos + lowercase + colapsa espacios → robusto a "Coca Cola" / "cocacola" / "cócacolá"
//   - usa Levenshtein + bonus por substring + bonus por inicio de palabra
//   - threshold dinámico: queries cortas exigen más exactitud que queries largas
//   - si la query está vacía, devuelve todos los items sin filtrar

/** Quita acentos, lowercase, colapsa espacios y signos. */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacríticos
    .replace(/[^a-z0-9]+/g, ' ')      // solo alfanumérico, demás → espacio
    .trim()
    .replace(/\s+/g, ' ');
}

/** Variante sin espacios para tolerar "cocacola" vs "coca cola". */
function compact(s: string): string {
  return normalize(s).replace(/\s+/g, '');
}

/** Distancia de Levenshtein optimizada (matriz 1D rolling). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let i = 0; i <= bl; i++) v0[i] = i;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1,        // inserción
        v0[j + 1] + 1,    // borrado
        v0[j] + cost      // sustitución
      );
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

/**
 * Score 0..100 de qué tan bien una query matchea un texto. Mayor = mejor.
 * Devuelve 0 si no debería incluirse.
 */
export function fuzzyScore(text: string, query: string): number {
  const q = normalize(query);
  if (!q) return 100;
  const t = normalize(text);
  if (!t) return 0;

  // 1. Match exacto al inicio → score máximo
  if (t.startsWith(q)) return 100;

  // 2. Match exacto en cualquier parte → muy alto
  if (t.includes(q)) {
    // bonus si está al inicio de palabra
    const idx = t.indexOf(q);
    if (idx === 0 || t[idx - 1] === ' ') return 90;
    return 80;
  }

  // 3. Match sin espacios (cocacola vs coca cola)
  const tCompact = compact(text);
  const qCompact = compact(query);
  if (tCompact.includes(qCompact)) return 75;

  // 4. Todas las palabras de la query están en el texto (cualquier orden)
  const qWords = q.split(' ').filter(w => w.length > 0);
  if (qWords.length > 1 && qWords.every(w => t.includes(w))) return 70;

  // 5. Fuzzy con Levenshtein por palabra (tolera typos)
  // Por cada palabra de la query, encontramos la palabra más cercana del texto
  const tWords = t.split(' ').filter(w => w.length > 0);
  let totalDist = 0;
  let totalLen = 0;
  for (const qw of qWords) {
    let best = Infinity;
    for (const tw of tWords) {
      // Si la palabra del texto contiene la query (sustring), distancia 0
      if (tw.includes(qw)) { best = 0; break; }
      const d = levenshtein(qw, tw);
      if (d < best) best = d;
      // Optimización: si encontramos match perfecto, salir
      if (best === 0) break;
    }
    if (best === Infinity) return 0; // palabra no aparece ni cerca
    totalDist += best;
    totalLen += qw.length;
  }

  // Threshold: tolera 1 typo cada 4 caracteres
  const maxAllowedDist = Math.max(1, Math.floor(totalLen / 4));
  if (totalDist > maxAllowedDist) {
    // Último intento: Levenshtein sobre los compactos
    const dCompact = levenshtein(qCompact, tCompact);
    if (dCompact <= maxAllowedDist) return 50;
    return 0;
  }

  // Score inversamente proporcional a la distancia (60 = match perfecto fuzzy, baja con typos)
  return Math.max(40, 60 - totalDist * 5);
}

/**
 * Filtra y ordena items según relevancia respecto a la query.
 * Cada item produce un texto de búsqueda vía `getText`. Se evalúa todo y se
 * devuelve solo lo que matchea, ordenado por score desc.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  options?: { minScore?: number; limit?: number },
): T[] {
  const q = (query || '').trim();
  if (!q) return items;
  const minScore = options?.minScore ?? 40;
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const s = fuzzyScore(getText(item), q);
    if (s >= minScore) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const limit = options?.limit ?? scored.length;
  return scored.slice(0, limit).map(x => x.item);
}
