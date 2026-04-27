// Detección de productos duplicados en el catálogo.
//
// Objetivo: ayudar al dueño a identificar y fusionar productos que en
// realidad son el mismo SKU físico pero quedaron registrados dos o más
// veces (típico cuando se carga un producto manualmente y otra vez al
// escanear barcode, o cuando hay typos en nombres como "SFOIA" vs "SOFIA").
//
// Tipos de detección (en orden de confianza):
//   1. EXACT_BARCODE  → mismo `barcode` o `codigo` (señal MUY fuerte)
//   2. SIMILAR_NAME   → nombres muy parecidos según fuzzy (typo, abrev.)
//
// Decisiones:
//   - No detectamos por costo o precio: dos productos legítimamente
//     pueden tener mismos precios (ej: dos sabores de la misma marca).
//   - Solo agrupamos productos no archivados.
//   - Mínimo 2 productos por grupo para considerarlo "duplicado".

import { normalize } from './fuzzySearch';

export type DuplicateReason = 'EXACT_BARCODE' | 'SIMILAR_NAME';

export interface DuplicateProduct {
  id: string;
  nombre: string;
  codigo?: string;
  barcode?: string;
  stock?: number;
  costoUSD?: number;
  precioDetal?: number;
  updatedAt?: any;
  archived?: boolean;
  mergedInto?: string;
  [key: string]: any;
}

export interface DuplicateGroup {
  /** Razón principal por la que se agrupan. */
  reason: DuplicateReason;
  /** Valor compartido (ej. el barcode, o el nombre normalizado). */
  key: string;
  /** Productos que forman el grupo. Mínimo 2. */
  items: DuplicateProduct[];
  /** Confianza: 'high' (barcode), 'medium' (nombre fuzzy >= 0.92). */
  confidence: 'high' | 'medium';
}

/** Quita prefijos/sufijos triviales para comparar nombres mejor. */
function nameKey(p: DuplicateProduct): string {
  return normalize(p.nombre || '');
}

/** Distancia de Levenshtein normalizada [0..1] — 1 = idénticos. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) / Math.max(la, lb) > 0.4) return 0; // muy distintos
  // Levenshtein matriz 1D rolling
  const v0 = new Array(lb + 1).fill(0);
  const v1 = new Array(lb + 1).fill(0);
  for (let i = 0; i <= lb; i++) v0[i] = i;
  for (let i = 0; i < la; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < lb; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= lb; j++) v0[j] = v1[j];
  }
  return 1 - v0[lb] / Math.max(la, lb);
}

/**
 * Encuentra todos los grupos de duplicados en el catálogo.
 *
 * @param products Lista de productos del catálogo (sin archivados).
 * @returns Grupos de 2+ productos sospechosos de ser el mismo SKU.
 */
export function findDuplicates(products: DuplicateProduct[]): DuplicateGroup[] {
  const active = products.filter(p => !p.archived);
  const groups: DuplicateGroup[] = [];
  const seenInGroup = new Set<string>(); // ids ya asignados a un grupo

  // 1) Por barcode/codigo exacto — confianza alta
  const byBarcode = new Map<string, DuplicateProduct[]>();
  for (const p of active) {
    const code = (p.barcode || p.codigo || '').trim();
    if (!code) continue;
    const arr = byBarcode.get(code) || [];
    arr.push(p);
    byBarcode.set(code, arr);
  }
  for (const [code, arr] of byBarcode.entries()) {
    if (arr.length < 2) continue;
    arr.forEach(p => seenInGroup.add(p.id));
    groups.push({
      reason: 'EXACT_BARCODE',
      key: code,
      items: arr,
      confidence: 'high',
    });
  }

  // 2) Por nombre similar (>= 92%) entre productos NO ya agrupados.
  //    Usamos pairwise N² pero solo sobre los que quedaron sin grupo.
  const remaining = active.filter(p => !seenInGroup.has(p.id));
  const nameKeys = remaining.map(p => ({ p, k: nameKey(p) }));
  const usedInNameGroup = new Set<string>();
  for (let i = 0; i < nameKeys.length; i++) {
    if (usedInNameGroup.has(nameKeys[i].p.id)) continue;
    const grupo: DuplicateProduct[] = [nameKeys[i].p];
    for (let j = i + 1; j < nameKeys.length; j++) {
      if (usedInNameGroup.has(nameKeys[j].p.id)) continue;
      const sim = similarity(nameKeys[i].k, nameKeys[j].k);
      if (sim >= 0.92) grupo.push(nameKeys[j].p);
    }
    if (grupo.length >= 2) {
      grupo.forEach(p => usedInNameGroup.add(p.id));
      groups.push({
        reason: 'SIMILAR_NAME',
        key: nameKeys[i].k,
        items: grupo,
        confidence: 'medium',
      });
    }
  }

  // Ordenar: barcode primero, luego por cantidad de duplicados desc.
  groups.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'high' ? -1 : 1;
    }
    return b.items.length - a.items.length;
  });

  return groups;
}

/**
 * Resume las acciones de la fusión sin ejecutarlas — útil para preview.
 *
 * Stock final = suma de todos los stocks individuales.
 * Costo / precio = los del canonical (no se tocan).
 * stockByAlmacen = suma por almacén.
 */
export interface MergePreview {
  canonicalId: string;
  canonicalName: string;
  toArchiveIds: string[];
  totalStock: number;
  combinedStockByAlmacen: Record<string, number>;
}

export function previewMerge(group: DuplicateGroup, canonicalId: string): MergePreview {
  const canonical = group.items.find(p => p.id === canonicalId);
  if (!canonical) {
    throw new Error('Canonical no encontrado en el grupo');
  }
  const toArchive = group.items.filter(p => p.id !== canonicalId);
  const totalStock = group.items.reduce((s, p) => s + Number(p.stock || 0), 0);
  const combined: Record<string, number> = {};
  for (const p of group.items) {
    const map = (p.stockByAlmacen || {}) as Record<string, number>;
    for (const [k, v] of Object.entries(map)) {
      combined[k] = (combined[k] || 0) + Number(v || 0);
    }
  }
  return {
    canonicalId,
    canonicalName: canonical.nombre,
    toArchiveIds: toArchive.map(p => p.id),
    totalStock,
    combinedStockByAlmacen: combined,
  };
}
