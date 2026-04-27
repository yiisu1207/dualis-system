// Utilidades para importación masiva de clientes con saldo inicial.
//
// Soporta 3 fuentes de datos:
//   1. CSV/TSV (drag & drop o archivo)
//   2. Bulk paste (texto pegado de Excel/Sheets — autodetecta separador)
//   3. Vision (foto del cuaderno → Claude API → estructura) [N2]
//
// Cada fila parseada se valida y se compara contra los clientes existentes
// para detectar duplicados antes de aplicar la importación.

import { normalize } from './fuzzySearch';

export interface ImportRow {
  // Datos del cliente
  nombre: string;
  rif?: string;
  cedula?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  // Saldo inicial (opcional)
  saldoInicial?: number;
  diasAtras?: number;       // antigüedad de la deuda en días (calcula fecha)
  saldoFecha?: string;      // ISO YYYY-MM-DD si se especifica directamente
  saldoNota?: string;
  // Aging avanzado (N4): array de tramos con monto + antigüedad cada uno
  aging?: Array<{ amount: number; daysAgo: number; nota?: string }>;
  // Metadata de validación
  _row?: number;            // fila original (para reportes de error)
  _raw?: string;            // representación original
}

export interface ImportRowValidated extends ImportRow {
  errors: string[];
  warnings: string[];
  duplicateOfId?: string;   // si matchea con un cliente existente
  duplicateScore?: number;  // 0..1
  action: 'create' | 'update' | 'skip';
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Detecta el separador más probable en una línea: tab, coma o punto-coma.
 * Tab gana si está presente (Excel→clipboard usa tab).
 */
function detectSeparator(text: string): ',' | '\t' | ';' {
  const firstLines = text.split('\n').slice(0, 5).join('\n');
  const tabs = (firstLines.match(/\t/g) || []).length;
  const semis = (firstLines.match(/;/g) || []).length;
  const commas = (firstLines.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= semis && tabs >= commas) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/**
 * Quita comillas dobles en valores tipo CSV: "John Doe" → John Doe.
 * Maneja escapes "" → ".
 */
function unquote(s: string): string {
  let v = s.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1).replace(/""/g, '"');
  }
  return v;
}

/** Parser CSV simple — soporta comillas y separadores comunes. */
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(unquote);
}

/**
 * Diccionario de aliases de columnas → campo canónico.
 * Tolera variaciones comunes en español/inglés y con/sin acentos.
 */
const COLUMN_ALIASES: Record<string, keyof ImportRow> = {
  // Nombre
  'nombre': 'nombre', 'name': 'nombre', 'cliente': 'nombre', 'fullname': 'nombre',
  'razonsocial': 'nombre', 'razon': 'nombre', 'nombrecliente': 'nombre',
  // RIF
  'rif': 'rif', 'identificacionfiscal': 'rif', 'taxid': 'rif',
  // Cédula
  'cedula': 'cedula', 'ci': 'cedula', 'documento': 'cedula', 'dni': 'cedula',
  // Teléfono
  'telefono': 'telefono', 'tel': 'telefono', 'phone': 'telefono', 'movil': 'telefono',
  'celular': 'telefono', 'whatsapp': 'telefono', 'wa': 'telefono',
  // Email
  'email': 'email', 'correo': 'email', 'mail': 'email', 'correoelectronico': 'email',
  // Dirección
  'direccion': 'direccion', 'address': 'direccion', 'domicilio': 'direccion',
  // Saldo
  'saldoinicial': 'saldoInicial', 'saldo': 'saldoInicial', 'deuda': 'saldoInicial',
  'debe': 'saldoInicial', 'monto': 'saldoInicial', 'balance': 'saldoInicial',
  'openingbalance': 'saldoInicial', 'pendiente': 'saldoInicial',
  // Antigüedad
  'diasatras': 'diasAtras', 'dias': 'diasAtras', 'antiguedad': 'diasAtras',
  'daysago': 'diasAtras', 'diasvencido': 'diasAtras',
  // Fecha del saldo
  'fecha': 'saldoFecha', 'fechasaldo': 'saldoFecha', 'date': 'saldoFecha',
  // Nota
  'nota': 'saldoNota', 'note': 'saldoNota', 'observacion': 'saldoNota',
  'observaciones': 'saldoNota', 'comentario': 'saldoNota',
};

/** Mapea un header (después de normalize) al campo canónico. */
function resolveColumn(header: string): keyof ImportRow | null {
  const k = normalize(header).replace(/\s+/g, '');
  return COLUMN_ALIASES[k] || null;
}

/**
 * Parsea texto tabular (CSV / TSV / pegado de Excel) a filas estructuradas.
 *
 * Detecta automáticamente:
 *   - Separador (tab, coma, punto-coma)
 *   - Si la primera línea son encabezados o ya son datos
 *   - Mapeo de columnas tolerante a aliases
 *
 * @param text Contenido del archivo o texto pegado.
 * @returns Array de filas parseadas con metadata _row.
 */
export function parseTabular(text: string): ImportRow[] {
  const cleaned = text.replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return [];
  const sep = detectSeparator(cleaned);
  const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detectar si la primera línea son headers: si TODAS las celdas son no-numéricas,
  // probablemente lo son.
  const firstCells = parseCsvLine(lines[0], sep);
  const looksLikeHeader = firstCells.every(c => {
    const t = c.trim();
    return t.length > 0 && isNaN(Number(t));
  });

  let columnMap: Array<keyof ImportRow | null>;
  let dataLines: string[];

  if (looksLikeHeader) {
    columnMap = firstCells.map(resolveColumn);
    dataLines = lines.slice(1);
  } else {
    // Sin headers: asumimos orden por convención (nombre, telefono, saldo, ...).
    // Esto cubre el caso "pegué nombres con montos".
    columnMap = ['nombre', 'telefono', 'saldoInicial', 'diasAtras', 'saldoNota', 'rif', 'cedula', 'email', 'direccion'];
    dataLines = lines;
  }

  const rows: ImportRow[] = [];
  for (let i = 0; i < dataLines.length; i++) {
    const cells = parseCsvLine(dataLines[i], sep);
    const row: ImportRow = { nombre: '', _row: i + (looksLikeHeader ? 2 : 1), _raw: dataLines[i] };
    cells.forEach((value, idx) => {
      const field = columnMap[idx];
      if (!field || !value.trim()) return;
      const v = value.trim();
      if (field === 'saldoInicial') {
        row.saldoInicial = parseAmount(v);
      } else if (field === 'diasAtras') {
        const n = parseInt(v.replace(/[^\d-]/g, ''), 10);
        if (!isNaN(n)) row.diasAtras = n;
      } else {
        (row as any)[field] = v;
      }
    });
    if (row.nombre || row.telefono || row.rif || row.cedula) rows.push(row);
  }
  return rows;
}

/**
 * Parsea texto libre tipo "Juan 50, María 30, Carlos 100".
 * Heurística: cada línea o cada item separado por coma se trata como
 * "nombre + monto". Útil para anotaciones rápidas de WhatsApp/papel.
 */
export function parseFreeText(text: string): ImportRow[] {
  const cleaned = text.replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return [];
  // Si parece tabular (tiene tabs o muchas comas con números), delegamos.
  if (cleaned.includes('\t')) return parseTabular(cleaned);

  const rows: ImportRow[] = [];
  // Separar por línea, y dentro de cada línea intentar formato "Nombre Monto"
  const lines = cleaned.split('\n').filter(l => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Intentamos extraer todos los pares "texto ... número" en la línea.
    // Caso A: una sola persona "Juan 50"
    // Caso B: lista "Juan 50, María 30"
    const segments = line.split(/[,;]+/).map(s => s.trim()).filter(s => s);
    for (const seg of segments) {
      // Buscar el último número de la línea como monto
      const m = seg.match(/^(.*?)\s+\$?([\d.,]+)\s*$/);
      if (m) {
        const nombre = m[1].trim().replace(/[:=\-]+$/, '').trim();
        const amount = parseAmount(m[2]);
        if (nombre && amount > 0) {
          rows.push({ nombre, saldoInicial: amount, _row: i + 1, _raw: seg });
          continue;
        }
      }
      // Si no hay monto, se guarda solo el nombre (cliente sin saldo)
      if (seg && /[a-zA-Záéíóúñ]{2,}/.test(seg)) {
        rows.push({ nombre: seg, _row: i + 1, _raw: seg });
      }
    }
  }
  return rows;
}

/** Parsea un monto con formatos comunes: "1.234,56", "1,234.56", "1234.56", "Bs 50". */
export function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return 0;
  // Detectar separador decimal: el último , o . con 1-2 dígitos después
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized = cleaned;
  if (lastDot > lastComma) {
    // Formato US: 1,234.56 → quitamos comas
    normalized = cleaned.replace(/,/g, '');
  } else if (lastComma > lastDot) {
    // Formato VE/EU: 1.234,56 → quitamos puntos, cambiamos coma por punto
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

// ─── Validación + detección de duplicados ────────────────────────────────────

interface ExistingCustomerLite {
  id: string;
  fullName?: string;
  nombre?: string;
  rif?: string;
  cedula?: string;
  telefono?: string;
  email?: string;
}

/**
 * Valida una fila de importación + detecta duplicados contra clientes existentes.
 *
 * Reglas:
 *   - nombre obligatorio
 *   - saldoInicial >= 0 si está presente
 *   - duplicate match: exact RIF/cédula o exact email o nombre+teléfono normalizado
 */
export function validateRow(
  row: ImportRow,
  existing: ExistingCustomerLite[],
): ImportRowValidated {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row.nombre || !row.nombre.trim()) {
    errors.push('Nombre vacío');
  } else if (row.nombre.trim().length < 2) {
    errors.push('Nombre demasiado corto');
  }

  if (row.saldoInicial != null && row.saldoInicial < 0) {
    errors.push('Saldo inicial negativo');
  }
  if (row.diasAtras != null && row.diasAtras < 0) {
    warnings.push('Días en el futuro — se interpretará como vencimiento futuro');
  }

  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    warnings.push('Email mal formado');
  }

  // Detección de duplicados
  let duplicateOfId: string | undefined;
  let duplicateScore = 0;

  const norm = (s?: string) => normalize(s || '').replace(/\s+/g, '');
  const rowName = norm(row.nombre);
  const rowRif = norm(row.rif);
  const rowCed = norm(row.cedula);
  const rowTel = (row.telefono || '').replace(/\D/g, '');
  const rowMail = (row.email || '').toLowerCase().trim();

  for (const c of existing) {
    let score = 0;
    const cName = norm(c.fullName || c.nombre);
    const cRif = norm(c.rif);
    const cCed = norm(c.cedula);
    const cTel = (c.telefono || '').replace(/\D/g, '');
    const cMail = (c.email || '').toLowerCase().trim();

    if (rowRif && cRif && rowRif === cRif) score += 0.9;
    if (rowCed && cCed && rowCed === cCed) score += 0.9;
    if (rowMail && cMail && rowMail === cMail) score += 0.8;
    if (rowName && cName && rowName === cName) score += 0.5;
    if (rowTel && cTel && rowTel === cTel) score += 0.5;

    if (score > duplicateScore) {
      duplicateScore = score;
      duplicateOfId = c.id;
    }
  }

  let action: ImportRowValidated['action'] = 'create';
  if (duplicateScore >= 0.8) {
    warnings.push('Probable duplicado — el cliente ya existe en el sistema');
    action = 'update'; // por defecto sugerimos actualizar
  } else if (duplicateScore >= 0.5) {
    warnings.push('Posible duplicado — verifica si es el mismo cliente');
  }
  if (errors.length > 0) action = 'skip';

  return {
    ...row,
    errors,
    warnings,
    duplicateOfId,
    duplicateScore,
    action,
  };
}

/**
 * Convierte `diasAtras` a fecha ISO YYYY-MM-DD restando días al hoy.
 * Si la fila ya tiene `saldoFecha`, esa gana.
 */
export function resolveSaldoDate(row: ImportRow): string {
  if (row.saldoFecha) return row.saldoFecha;
  const days = Number(row.diasAtras || 0);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/** Formato amigable para mostrar antigüedad. */
export function formatAging(daysAgo: number): string {
  if (daysAgo <= 0) return 'al día';
  if (daysAgo < 30) return `${daysAgo}d`;
  if (daysAgo < 365) return `${Math.floor(daysAgo / 30)}m`;
  return `${Math.floor(daysAgo / 365)}a`;
}

// ─── Plantilla CSV ───────────────────────────────────────────────────────────

/** Genera contenido CSV de plantilla con headers + 2 filas de ejemplo. */
export function buildCsvTemplate(): string {
  const headers = [
    'nombre', 'rif', 'cedula', 'telefono', 'email', 'direccion',
    'saldo_inicial', 'dias_atras', 'nota',
  ].join(',');
  const sample1 = [
    'Juan Pérez', 'V-12345678', '12345678', '04141234567',
    'juan@ejemplo.com', 'Av. Principal 123, Caracas',
    '500.00', '90', 'Saldo del cuaderno antiguo',
  ].map(v => `"${v}"`).join(',');
  const sample2 = [
    'María González', '', '17654321', '04167654321', '', '',
    '120.50', '15', '',
  ].map(v => `"${v}"`).join(',');
  return [headers, sample1, sample2].join('\n');
}

/** Dispara descarga del archivo de plantilla. */
export function downloadCsvTemplate(): void {
  const content = buildCsvTemplate();
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dualis-clientes-plantilla.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
