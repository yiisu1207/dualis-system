// Parser de estados de cuenta CSV / Excel / PDF con detección de header,
// normalización de fecha y monto, y detección de tipo de operación.

import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
import {
  BANK_PROFILES,
  GENERIC_PROFILE,
  type BankStatementProfile,
  type DateFormat,
} from '../data/bankStatementFormats';
import type { BankRow, OperationType } from './bankReconciliation';

// Worker de pdf.js — usa el CDN para evitar problemas de bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ParseResult {
  rows: BankRow[];
  detectedProfile?: BankStatementProfile;
  warnings: string[];
  needsManualMapping: boolean;
}

export interface ParseOpts {
  accountAlias: string;
  accountLabel: string;
  accountBankCode?: string;      // para calcular isIntrabank
  profile?: BankStatementProfile; // si el usuario lo eligió a mano
  amountTolerancePct?: number;   // heredado del BankStatementAccount
  includeDebits?: boolean;       // default false — solo créditos
  manualColumnMap?: Partial<Record<'date' | 'credit' | 'debit' | 'amount' | 'reference' | 'description' | 'balance', number>>; // override por índice
}

const HEADER_KEYWORDS = [
  'fecha', 'monto', 'referencia', 'descripcion', 'concepto',
  'credito', 'debito', 'saldo', 'importe', 'abono', 'cargo',
];

const norm = (s: any): string =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// ——— Lectura de archivos ———

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Error leyendo archivo'));
    reader.readAsText(file);
  });
}

async function readFileAsBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('Error leyendo archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// ——— Parser CSV minimal (maneja comillas dobles, delimitador auto) ———

function detectDelimiter(sample: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = (sample.match(new RegExp(d === '\t' ? '\\t' : d, 'g')) || []).length;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCSV(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sample = normalized.split('\n').slice(0, 5).join('\n');
  const delimiter = detectDelimiter(sample);
  const lines = normalized.split('\n').filter(l => l.length > 0);
  return lines.map(l => parseCsvLine(l, delimiter));
}

// ——— Parser Excel via exceljs ———

async function parseExcel(buffer: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as any[];
    // exceljs row.values tiene índice 1-based, posición 0 es null
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      if (v == null) { cells.push(''); continue; }
      if (v instanceof Date) { cells.push(v.toISOString().slice(0, 10)); continue; }
      if (typeof v === 'object') {
        // formula / richtext
        if ('result' in v) { cells.push(String((v as any).result ?? '')); continue; }
        if ('richText' in v) {
          cells.push((v as any).richText.map((r: any) => r.text).join(''));
          continue;
        }
        cells.push(String(v));
      } else {
        cells.push(String(v));
      }
    }
    out.push(cells);
  });
  return out;
}

// ——— Parser PDF via pdfjs-dist ———

// Regex para detectar fechas DD/MM/YYYY al inicio de una línea de texto
const DATE_LINE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}\b/;

// Regex para montos venezolanos: -1.100.000,00 o 48.754,00
const VE_AMOUNT_RE = /^-?[\d.]+,\d{2}$/;

/**
 * Extrae texto de un PDF y reconstruye filas tabulares.
 *
 * Los PDFs bancarios venezolanos (BDV, Banesco, Mercantil, etc.) tienen texto
 * seleccionable con columnas posicionales. El reto principal son las líneas
 * partidas: en BDV el "Concepto" y la "Operación" se parten en 2 líneas.
 *
 * Estrategia: extraer items de texto con coordenadas X/Y por página,
 * agrupar por Y (misma fila visual), ordenar por X, y luego detectar
 * columnas por posición X. Las filas que empiezan con fecha son filas nuevas;
 * las que no, son continuaciones (se concatenan al concepto de la fila anterior).
 */
async function parsePDF(buffer: ArrayBuffer): Promise<string[][]> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const allRows: string[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupar items por coordenada Y (con tolerancia de 2px para misma línea)
    const lineMap = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round((item as any).transform[5] * 10) / 10; // Y con 1 decimal
      const x = Math.round((item as any).transform[4] * 10) / 10;
      // Buscar un Y existente dentro de ±2px
      let matchedY = y;
      for (const ky of lineMap.keys()) {
        if (Math.abs(ky - y) <= 2) { matchedY = ky; break; }
      }
      if (!lineMap.has(matchedY)) lineMap.set(matchedY, []);
      lineMap.get(matchedY)!.push({ x, text: item.str });
    }

    // Ordenar líneas por Y descendente (pdf.js Y crece hacia arriba)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = items.map(i => i.text).join(' ').trim();
      if (!lineText) continue;

      // Filtrar líneas de pie de página / encabezado de página
      if (/^Pagina:\s*\d/i.test(lineText)) continue;
      if (/Banco de Venezuela.*RIF/i.test(lineText)) continue;
      if (/BDVenl[ií]nea/i.test(lineText)) continue;
      if (/^Hist[oó]rico de movimientos$/i.test(lineText)) continue;

      // Detectar si es una fila de header
      const lNorm = norm(lineText);
      const isHeader = ['fecha', 'concepto', 'monto', 'saldo', 'referencia', 'operacion']
        .filter(k => lNorm.includes(k)).length >= 3;

      if (isHeader) {
        // Reconstruir header como columnas separadas por posición X
        // Usar las posiciones X de los items para inferir columnas
        const headerCells = items.map(i => i.text.trim()).filter(Boolean);
        allRows.push(headerCells);
        continue;
      }

      // Detectar si es una fila de datos (empieza con fecha)
      if (DATE_LINE_RE.test(lineText)) {
        // Fila nueva con fecha — parsear columnas por posición X
        const cells = splitPdfRowByClusters(items);
        allRows.push(cells);
      } else {
        // Línea continuación — concatenar al concepto de la fila anterior
        // (ej. nombre del cliente en la segunda línea, "Débito"/"Crédito" suelto)
        if (allRows.length > 0) {
          const prev = allRows[allRows.length - 1];
          // Si es solo "Crédito" o "Débito" (parte de la columna Operación)
          const trimmed = lineText.trim();
          if (/^(cr[eé]dito|d[eé]bito|inicial)$/i.test(trimmed)) {
            // Buscar la celda de operación (normalmente la 4ta columna) y concatenar
            if (prev.length >= 4) {
              prev[3] = (prev[3] + ' ' + trimmed).trim();
            }
          } else {
            // Es continuación del concepto (columna 2, ej. nombre del cliente)
            if (prev.length >= 2) {
              prev[1] = (prev[1] + ' ' + trimmed).trim();
            }
          }
        }
      }
    }
  }

  return allRows;
}

/**
 * Divide una fila de PDF en celdas usando clustering por gaps en X.
 * Los items con gap > umbral se consideran columnas separadas.
 */
function splitPdfRowByClusters(items: { x: number; text: string }[]): string[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.x - b.x);

  // Calcular gaps entre items consecutivos
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].x - sorted[i - 1].x - (sorted[i - 1].text.length * 4)); // approx char width
  }

  // Umbral: un gap significativo indica separación de columna
  // Para PDFs bancarios VE, las columnas están bien separadas (~30-50px)
  const threshold = 15;

  const cells: string[] = [];
  let current = sorted[0].text;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - sorted[i - 1].x;
    if (gap > threshold) {
      cells.push(current.trim());
      current = sorted[i].text;
    } else {
      current += ' ' + sorted[i].text;
    }
  }
  cells.push(current.trim());

  return cells;
}

// ——— Detección de header ———

function findHeaderRow(rows: string[][]): number {
  const maxCheck = Math.min(30, rows.length);
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < maxCheck; i++) {
    const joined = rows[i].map(norm).join(' | ');
    const hits = HEADER_KEYWORDS.filter(k => joined.includes(k)).length;
    if (hits >= 3 && hits > bestScore) {
      bestScore = hits;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normHeaders = headers.map(norm);
  // Match exacto primero
  for (const alias of aliases) {
    const idx = normHeaders.findIndex(h => h === norm(alias));
    if (idx >= 0) return idx;
  }
  // Match parcial
  for (const alias of aliases) {
    const a = norm(alias);
    const idx = normHeaders.findIndex(h => h.includes(a) || a.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ——— Normalización ———

function normalizeDate(raw: string, fmt: DateFormat): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Si ya viene ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Formatos DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(s);
  if (!m) return null;
  let a = m[1], b = m[2], y = m[3];
  if (y.length === 2) y = '20' + y;
  let day: string, month: string;
  if (fmt === 'MM/DD/YYYY') { month = a; day = b; }
  else { day = a; month = b; }
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');
  if (+month > 12 && +day <= 12) {
    // swap si el usuario aplicó el formato equivocado
    const tmp = day; day = month; month = tmp;
  }
  // Validar que la fecha sea real (ej. no 31 de febrero)
  const result = `${y}-${month}-${day}`;
  const check = new Date(result + 'T00:00:00Z');
  if (isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== result) return null;
  return result;
}

function normalizeAmount(raw: string, decimalSep: string): number | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[^\d,.\-+]/g, '');
  if (!s) return null;
  if (decimalSep === ',') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // quitar separadores de miles con coma
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function detectOperationType(description: string): OperationType {
  const d = norm(description);
  if (!d) return 'otro';
  if (/\bpago\s*movil\b|\bpagomovil\b|\bp2p\b|\bpm\b/.test(d)) return 'pago_movil';
  if (/\btransf(erencia)?\b|\btrf\b/.test(d)) return 'transferencia';
  if (/\bdeposito\b|\bdep\b/.test(d)) return 'deposito';
  if (/\bpunto\s*(de\s*)?venta\b|\bpos\b|\bc2p\b/.test(d)) return 'punto_venta';
  return 'otro';
}

function detectOriginBankCode(description: string): string | undefined {
  // Ej "0102 PAGO MOVIL ..." o "PAGO MOVIL DESDE 0134 ..."
  const d = String(description || '');
  const m = /(?:^|\s|desde\s)(\d{4})(?:\s|$)/i.exec(d);
  if (m && /^0\d{3}$/.test(m[1])) return m[1];
  return undefined;
}

// Hash estable basado en (amount + date + reference). Si no hay ref, incluye fragmento de description.
async function computeRowId(amount: number, date: string, reference?: string, descFallback?: string): Promise<string> {
  const base = reference
    ? `${amount.toFixed(2)}|${date}|${reference}`
    : `${amount.toFixed(2)}|${date}|${(descFallback || '').slice(0, 40)}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(base);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  // Fallback sin crypto.subtle
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) - h + base.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 16) + '0'.repeat(8);
}

// ——— Detección de perfil ———

function detectProfile(headerRow: string[]): BankStatementProfile | undefined {
  const joined = headerRow.map(norm).join(' | ');
  for (const p of BANK_PROFILES) {
    const hits = p.headerKeywords.filter(k => joined.includes(norm(k))).length;
    if (hits >= Math.min(2, p.headerKeywords.length)) return p;
  }
  return undefined;
}

// ——— Parser principal ———

export async function parseBankStatement(file: File, opts: ParseOpts): Promise<ParseResult> {
  const warnings: string[] = [];
  let rawRows: string[][] = [];

  try {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const buf = await readFileAsBuffer(file);
      rawRows = await parsePDF(buf);
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await readFileAsBuffer(file);
      rawRows = await parseExcel(buf);
    } else {
      const text = await readFileAsText(file);
      rawRows = parseCSV(text);
    }
  } catch (err: any) {
    return {
      rows: [],
      warnings: [`Error leyendo archivo: ${err?.message || String(err)}`],
      needsManualMapping: true,
    };
  }

  if (!rawRows.length) {
    return { rows: [], warnings: ['Archivo vacío'], needsManualMapping: true };
  }

  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx < 0) {
    return {
      rows: [],
      warnings: ['No se detectó la fila de encabezados. Revisa el archivo o usa mapeo manual.'],
      needsManualMapping: true,
    };
  }

  const headerRow = rawRows[headerIdx];
  const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c && c.trim()));

  const profile = opts.profile || detectProfile(headerRow) || GENERIC_PROFILE;

  // Resolución de columnas
  const cm = opts.manualColumnMap || {};
  const dateIdx  = cm.date        ?? findColumnIndex(headerRow, profile.columnMap.date);
  const creditIx = cm.credit      ?? (profile.columnMap.credit ? findColumnIndex(headerRow, profile.columnMap.credit) : -1);
  const debitIdx = cm.debit       ?? (profile.columnMap.debit ? findColumnIndex(headerRow, profile.columnMap.debit) : -1);
  const amountIdx= cm.amount      ?? (profile.columnMap.amount ? findColumnIndex(headerRow, profile.columnMap.amount) : -1);
  const refIdx   = cm.reference   ?? (profile.columnMap.reference ? findColumnIndex(headerRow, profile.columnMap.reference) : -1);
  const descIdx  = cm.description ?? (profile.columnMap.description ? findColumnIndex(headerRow, profile.columnMap.description) : -1);
  const balIdx   = cm.balance     ?? (profile.columnMap.balance ? findColumnIndex(headerRow, profile.columnMap.balance) : -1);

  if (dateIdx < 0) {
    return {
      rows: [], detectedProfile: profile,
      warnings: ['No se encontró columna de fecha. Usa mapeo manual.'],
      needsManualMapping: true,
    };
  }
  if (creditIx < 0 && debitIdx < 0 && amountIdx < 0) {
    return {
      rows: [], detectedProfile: profile,
      warnings: ['No se encontró columna de monto. Usa mapeo manual.'],
      needsManualMapping: true,
    };
  }

  const includeDebits = !!opts.includeDebits;
  const rows: BankRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawDate = row[dateIdx] || '';
    const date = normalizeDate(rawDate, profile.dateFormat);
    if (!date) {
      warnings.push(`Fila ${i + headerIdx + 2}: fecha inválida "${rawDate}"`);
      continue;
    }

    let amount: number | null = null;
    if (creditIx >= 0 || debitIdx >= 0) {
      const credit = creditIx >= 0 ? (normalizeAmount(row[creditIx] || '', profile.decimalSep) ?? 0) : 0;
      const debit  = debitIdx >= 0 ? (normalizeAmount(row[debitIdx] || '', profile.decimalSep) ?? 0) : 0;
      amount = credit - debit;
    } else if (amountIdx >= 0) {
      amount = normalizeAmount(row[amountIdx] || '', profile.decimalSep);
    }

    if (amount == null || amount === 0) {
      warnings.push(`Fila ${i + headerIdx + 2}: monto inválido`);
      continue;
    }

    if (!includeDebits && amount < 0) continue;

    const reference   = refIdx  >= 0 ? String(row[refIdx] || '').trim() : undefined;
    const description = descIdx >= 0 ? String(row[descIdx] || '').trim() : undefined;
    const balance     = balIdx  >= 0 ? normalizeAmount(row[balIdx] || '', profile.decimalSep) ?? undefined : undefined;

    const opType = detectOperationType(description || '');
    const originBankCode = detectOriginBankCode(description || '');
    const isIntrabank = opts.accountBankCode && originBankCode
      ? originBankCode === opts.accountBankCode
      : undefined;

    const rowId = await computeRowId(amount, date, reference, description);

    const rawRow: Record<string, string> = {};
    headerRow.forEach((h, idx) => { rawRow[h || `col${idx}`] = row[idx] ?? ''; });

    rows.push({
      rowId,
      accountAlias: opts.accountAlias,
      accountLabel: opts.accountLabel,
      bankCode: opts.accountBankCode,
      bankName: profile.bankName,
      date,
      amount,
      reference: reference || undefined,
      description: description || undefined,
      operationType: opType,
      originBankCode,
      isIntrabank,
      balance,
      amountTolerancePct: opts.amountTolerancePct,
      matched: false,
    });
  }

  const needsManualMapping = rows.length === 0 || warnings.length > rows.length;

  return {
    rows,
    detectedProfile: profile,
    warnings,
    needsManualMapping,
  };
}

export function slugifyAlias(alias: string): string {
  return norm(alias).replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 40);
}
