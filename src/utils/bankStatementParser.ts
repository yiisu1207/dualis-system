// Parser de estados de cuenta CSV / Excel / PDF con detección de header,
// normalización de fecha y monto, y detección de tipo de operación.

import ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite ?url suffix resuelve a un string en build
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  BANK_PROFILES,
  GENERIC_PROFILE,
  type BankStatementProfile,
  type DateFormat,
} from '../data/bankStatementFormats';
import type { BankRow, OperationType } from './bankReconciliation';

// Worker de pdf.js — bundled local por Vite para evitar 404 de CDN y "fake worker".
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export interface RejectedPdfLine {
  page: number;
  y: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  rows: BankRow[];
  detectedProfile?: BankStatementProfile;
  warnings: string[];
  needsManualMapping: boolean;
  /** Texto crudo del PDF (solo cuando el archivo es PDF) — para extracción de metadata del header. */
  rawText?: string;
  /** Filas tabulares brutas extraídas del archivo (post-parser, pre-mapeo) — para debug cuando falla. */
  debugRawRows?: string[][];
  /** Índice del header detectado dentro de debugRawRows (-1 si no se detectó). */
  debugHeaderIdx?: number;
  /** Líneas del PDF que fueron descartadas (no header, no data row, no continuación válida) con razón. */
  debugRejectedLines?: RejectedPdfLine[];
  /** Líneas del PDF que sí fueron aceptadas como data row (para auditoría) con razón. */
  debugAcceptedLines?: RejectedPdfLine[];
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

// Regex para detectar fechas DD/MM/YYYY en cualquier posición de la línea.
// BDV "persona" pone Referencia primero; otros bancos ponen Fecha primero.
// Por eso buscamos en cualquier parte y filtramos los headers de página por separado.
const DATE_ANYWHERE_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

// Ancla alternativa: "DD <ref alfanumérica de 6+>" al inicio de la línea.
// Usada en EdeC Banesco mensual donde la columna "DIA" es solo el día (02, 05, ...)
// y el período (mes/año) vive en el header del PDF.
const DAY_REF_ANCHOR_RE = /^\s*\d{1,2}\s+[A-Z0-9]{6,}\b/i;

// Headers de página que también contienen fechas (deben ser ignorados):
const PERIOD_HEADER_RE = /\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4}/;
const ACCOUNT_NUM_HEADER_RE = /\*{2,}\d{3,}/;

// Regex para extraer mes+año del período (ej. "Período: 01-2026" o "Periodo: 04/2025").
const PERIOD_MM_YYYY_RE = /per[ií]odo:?\s*(\d{1,2})\s*[-/]\s*(\d{4})/i;


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
async function parsePDF(buffer: ArrayBuffer): Promise<{
  rows: string[][];
  rawText: string;
  rejected: RejectedPdfLine[];
  accepted: RejectedPdfLine[];
}> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const allRows: string[][] = [];
  const rawTextParts: string[] = [];
  const rejected: RejectedPdfLine[] = [];
  const accepted: RejectedPdfLine[] = [];

  // Cuando detectamos un header, guardamos los X de cada columna para usarlos
  // de "snap" en las filas de datos siguientes — más preciso que clustering por gaps.
  let headerColumnXs: number[] | null = null;
  // Layout de 2 columnas (EdeC Banesco mensual páginas de continuación).
  // Cuando el header contiene 2 "DIA", guardamos anclas para cada bloque y un X
  // de división. Cada fila de datos se divide en 2 sub-filas (izquierda / derecha).
  let headerColumnXsRight: number[] | null = null;
  let splitX: number | null = null;
  let headerPushed = false;

  // Trackeo del último saldo visto en filas aceptadas. Usado para discriminar
  // cargo vs abono en filas "embebidas" (ver rama length>40 más abajo) cuando
  // pdfjs agrupó por Y la metadata del cliente con la primera fila del detalle.
  let lastSaldoSeen: number | null = null;
  const updateLastSaldoFromCells = (cells: string[]) => {
    if (!cells.length) return;
    for (let k = cells.length - 1; k >= 0; k--) {
      const v = (cells[k] || '').trim();
      if (!v) continue;
      const n = normalizeAmount(v, ',');
      if (n != null) { lastSaldoSeen = n; return; }
    }
  };

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

      // Acumular texto raw para detección de banco
      rawTextParts.push(lineText);

      // Filtrar líneas de pie de página / encabezado de página
      if (/^P[aá]gina:?\s*\d/i.test(lineText)) continue;
      if (/Banco de Venezuela.*RIF/i.test(lineText)) continue;
      if (/BDVenl[ií]nea/i.test(lineText)) continue;
      if (/^Hist[oó]rico de movimientos$/i.test(lineText)) continue;
      if (/Banco Universal.*RIF/i.test(lineText)) continue;
      // "DETALLE DE MOVIMIENTOS" puede venir aislado o duplicado por las 2 columnas
      // del layout Banesco mensual. Filtramos cualquier repetición sin trailing data.
      if (/^(DETALLE\s+DE\s+MOVIMIENTOS\s*(\(continuaci[oó]n\))?\s*)+$/i.test(lineText.trim())) continue;
      if (/^Estado de cuenta/i.test(lineText)) continue;
      if (/^Cliente\s/i.test(lineText)) continue;
      if (/^Direcci[oó]n\s/i.test(lineText)) continue;
      if (/Saldo inicial.*Saldo promedio/i.test(lineText)) continue;
      if (/Intereses pagados.*Intereses cobrados/i.test(lineText)) continue;
      // Filas que solo traen el período (DD/MM/YYYY - DD/MM/YYYY) o el nro de cuenta enmascarado
      if (PERIOD_HEADER_RE.test(lineText)) continue;
      if (ACCOUNT_NUM_HEADER_RE.test(lineText)) continue;

      // Metadata Banesco EdeC mensual — silent skip de cabecera del cliente y
      // tablas de resumen (CHEQUES, RESUMEN DE SALDOS, totales por categoría,
      // saldos Inicial/Final/Promedio, RIF, nombre del titular, ciudad, etc.).
      // Todos estos regex tienen ancla $ al final: si la línea trae además una
      // fila embebida ("... 02 53655440408 TRANS,CTAS ..."), NO matcheará y
      // caerá a la rama de embedded extraction más abajo.
      const trimmedLine = lineText.trim();
      if (/^CHEQUES?\s*$/i.test(trimmedLine)) continue;
      if (/^CHEQUE\s+DIA\s+MONTO(\s+CHEQUE\s+DIA\s+MONTO)?\s*$/i.test(trimmedLine)) continue;
      if (/^RESUMEN\s+DE\s+(SALDOS|MOVIMIENTOS)\s*$/i.test(trimmedLine)) continue;
      if (/^Concepto\s+Cantidad\s+Monto\s+Total\s*$/i.test(trimmedLine)) continue;
      if (/^(Cheques\s+Pagados|Otros\s+(D[eé]bitos|Cr[eé]ditos)|Dep[oó]sitos)\s+\d+\s+[\d.,]+\s*$/i.test(trimmedLine)) continue;
      if (/^(Inicial|Final|Promedio)\s+[\d.,]+\s*$/i.test(trimmedLine)) continue;
      if (/^RIF:/i.test(trimmedLine)) continue;
      if (/SALDO\s+MES\s+ANTERIOR/i.test(trimmedLine)) continue;
      // Nombre del titular o ciudad en mayúsculas (HOJEIJ HASSAN, PUERTO LA CRUZ)
      if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,28}$/.test(trimmedLine)) continue;

      // Detectar si es una fila de header.
      // Incluye 'dia', 'ref', 'cargo', 'abono' para EdeC Banesco mensual
      // ("DIA REF. CONCEPTO CARGOS ABONOS SALDOS") que no tiene 'fecha'/'referencia'.
      // Guarda: si la línea empieza con DD/MM/YYYY o "DD <ref>", es dato, no header.
      const lNorm = norm(lineText);
      const startsLikeDataRow = DATE_ANYWHERE_RE.test(lineText) || DAY_REF_ANCHOR_RE.test(lineText);
      const isHeader = !startsLikeDataRow && ['fecha', 'concepto', 'monto', 'saldo', 'referencia', 'operacion', 'descripcion', 'debito', 'credito', 'mov', 'dia', 'ref', 'cargo', 'abono']
        .filter(k => lNorm.includes(k)).length >= 3;

      if (isHeader) {
        // Reconstruir header como columnas separadas por posición X.
        const sortedItems = [...items].sort((a, b) => a.x - b.x);

        // Detectar layout 2-col: si aparece "DIA" (o "Día") 2+ veces, es 2 columnas.
        const diaItems = sortedItems.filter(i => /^\s*d[ií]a\s*$/i.test(i.text));
        if (diaItems.length >= 2) {
          splitX = diaItems[1].x - 5; // buffer pequeño
          headerColumnXs = sortedItems.filter(i => i.x < splitX!).map(i => i.x);
          headerColumnXsRight = sortedItems.filter(i => i.x >= splitX!).map(i => i.x);
        } else {
          splitX = null;
          headerColumnXs = sortedItems.map(i => i.x);
          headerColumnXsRight = null;
        }

        // Solo pushear el primer header — los siguientes son repeticiones por página
        // y contaminan dataRows con "fecha inválida: 'Fecha'".
        if (!headerPushed) {
          const headerSource = splitX !== null
            ? sortedItems.filter(i => i.x < splitX!)
            : sortedItems;
          const headerCells = headerSource.map(i => i.text.trim()).filter(Boolean);
          allRows.push(headerCells);
          headerPushed = true;
        }
        continue;
      }

      // Filtrar resúmenes numéricos entre páginas (ej: "16.018,48 568.610,25 ...")
      // — son puros montos y se concatenaban como continuación del row anterior.
      const wordCount = lineText.split(/\s+/).filter(Boolean).length;
      const letterCount = (lineText.match(/[a-záéíóúüñ]/gi) || []).length;
      const isNumericOnly = letterCount === 0 && wordCount >= 2;
      if (isNumericOnly) {
        rejected.push({ page: p, y, text: lineText, reason: 'numeric-only (saldos/totales entre páginas)' });
        continue;
      }

      // Detectar si es una fila de datos:
      //   (a) contiene fecha DD/MM/YYYY en cualquier posición, o
      //   (b) empieza con "DD <ref larga>" (EdeC Banesco mensual con DIA-only).
      if (DATE_ANYWHERE_RE.test(lineText) || DAY_REF_ANCHOR_RE.test(lineText)) {
        accepted.push({ page: p, y, text: lineText, reason: 'data-row (fecha o DD+ref)' });
        if (splitX !== null && headerColumnXs && headerColumnXsRight) {
          // Layout 2-col: partir items por splitX y emitir hasta 2 sub-filas.
          const leftItems = items.filter(i => i.x < splitX!);
          const rightItems = items.filter(i => i.x >= splitX!);
          const subs: Array<[{ x: number; text: string }[], number[]]> = [
            [leftItems, headerColumnXs],
            [rightItems, headerColumnXsRight],
          ];
          for (const [subItems, subHeaderXs] of subs) {
            if (!subItems.length) continue;
            const subText = subItems.map(i => i.text).join(' ');
            if (DATE_ANYWHERE_RE.test(subText) || DAY_REF_ANCHOR_RE.test(subText)) {
              const newCells = splitByHeaderColumns(subItems, subHeaderXs);
              allRows.push(newCells);
              updateLastSaldoFromCells(newCells);
            }
          }
        } else {
          // Fila nueva — usar X del header como anclas si está disponible,
          // si no caer al clustering por gaps
          const cells = headerColumnXs
            ? splitByHeaderColumns(items, headerColumnXs)
            : splitPdfRowByClusters(items);
          allRows.push(cells);
          updateLastSaldoFromCells(cells);
        }
      } else {
        const trimmed = lineText.trim();

        // Caso especial: línea que parece data row pero sin día explícito al inicio.
        // Ocurre en EdeC Banesco mensual cuando pdfjs separa el ítem del día (DD)
        // en una Y ligeramente distinta del resto, p.ej:
        //   "03590009829 TRANS,CTAS 866.320,00 658.692,03"
        // La empujamos como data row con DIA vacío — parseBankStatement aplica el
        // fallback de lastDay y le asigna el día del grupo previo.
        const looksLikeDataRowMissingDay =
          /^\d{6,}\s+\S/.test(trimmed) &&
          /,\d{2}/.test(trimmed) &&
          trimmed.length > 30;
        if (looksLikeDataRowMissingDay) {
          accepted.push({ page: p, y, text: lineText, reason: 'data-row sin día (recuperada por fallback lastDay)' });
          if (splitX !== null && headerColumnXs && headerColumnXsRight) {
            const leftItems = items.filter(i => i.x < splitX!);
            const rightItems = items.filter(i => i.x >= splitX!);
            const subs: Array<[{ x: number; text: string }[], number[]]> = [
              [leftItems, headerColumnXs],
              [rightItems, headerColumnXsRight],
            ];
            for (const [subItems, subHeaderXs] of subs) {
              if (!subItems.length) continue;
              const subText = subItems.map(i => i.text).join(' ').trim();
              if (/^\d{6,}\s+\S/.test(subText) && /,\d{2}/.test(subText)) {
                const newCells = splitByHeaderColumns(subItems, subHeaderXs);
                allRows.push(newCells);
                updateLastSaldoFromCells(newCells);
              }
            }
          } else {
            const cells = headerColumnXs
              ? splitByHeaderColumns(items, headerColumnXs)
              : splitPdfRowByClusters(items);
            allRows.push(cells);
            updateLastSaldoFromCells(cells);
          }
          continue;
        }

        // Línea continuación normal — solo aplicar si es un token corto/conocido.
        // Rechazar líneas largas (son casi seguro metadata de página, no wrap).
        if (trimmed.length > 40) {
          // Caso especial: línea larga donde pdfjs agrupó por Y la metadata del
          // cliente/resumen del PDF (lado izquierdo) con la PRIMERA fila del
          // detalle de movimientos (lado derecho). El patrón al final es:
          //   "... DD <ref(6+)> <concepto> <monto>,DD <saldo>,DD"
          // p.ej "RESUMEN DE MOVIMIENTOS ... 02 53655440408 TRANS,CTAS. A TERCEROS BANESCO 15.000,00 171.382,91"
          // Extraemos esa sub-fila y la sintetizamos como data row real.
          if (headerColumnXs && headerColumnXs.length >= 6) {
            const re = /(?:^|\s)(\d{1,2})\s+(\d{6,})\s+(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s*$/;
            const m = re.exec(trimmed);
            if (m) {
              const [, day, ref, concept, amountStr, saldoStr] = m;
              const newSaldo = normalizeAmount(saldoStr, ',');
              const amount = normalizeAmount(amountStr, ',');
              // Decidir cargo (col 3) vs abono (col 4) por comparación de saldos.
              // Si no tenemos saldo previo, fallback a heurística por concepto:
              // conceptos típicos de cargo en Banesco contienen estas marcas.
              let isCredit: boolean;
              if (newSaldo != null && lastSaldoSeen != null && amount != null) {
                isCredit = newSaldo > lastSaldoSeen;
              } else {
                isCredit = !/\b(COM,|SERV\s*MTTO|POS\/NATIVA|TDB\s*CAPIT|DOMICILIAC|EMISION\s+DE\s+ESTADO|DIGITEL|MOVISTAR|MOVILNET|PAGO\s+MOVIL\s+CCE)\b/i.test(concept);
              }
              const synthItems: { x: number; text: string }[] = [
                { x: headerColumnXs[0], text: day },
                { x: headerColumnXs[1], text: ref },
                { x: headerColumnXs[2], text: concept },
              ];
              if (isCredit) {
                synthItems.push({ x: headerColumnXs[4], text: amountStr });
              } else {
                synthItems.push({ x: headerColumnXs[3], text: amountStr });
              }
              synthItems.push({ x: headerColumnXs[5], text: saldoStr });
              const cells = splitByHeaderColumns(synthItems, headerColumnXs);
              allRows.push(cells);
              updateLastSaldoFromCells(cells);
              accepted.push({
                page: p, y, text: lineText,
                reason: `data-row embebido al final de línea larga (${isCredit ? 'abono' : 'cargo'} por ${newSaldo != null && lastSaldoSeen != null ? 'comparación de saldos' : 'heurística por concepto'})`,
              });
              continue;
            }
          }
          rejected.push({ page: p, y, text: lineText, reason: `descartada: length ${trimmed.length} > 40 y no matchea patrón de data row` });
          continue;
        }
        if (allRows.length > 0) {
          const prev = allRows[allRows.length - 1];
          if (/^(cr[eé]dito|d[eé]bito|inicial)$/i.test(trimmed)) {
            if (prev.length >= 4) {
              prev[3] = (prev[3] + ' ' + trimmed).trim();
              accepted.push({ page: p, y, text: lineText, reason: 'continuación: token CR/DB/INICIAL pegado a fila previa' });
            } else {
              rejected.push({ page: p, y, text: lineText, reason: 'token CR/DB/INICIAL pero fila previa < 4 cols' });
            }
          } else if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+$/.test(trimmed) && trimmed.length < 30) {
            // Nombre propio corto (ej. nombre de cliente), posible continuación real
            if (prev.length >= 2) {
              prev[1] = (prev[1] + ' ' + trimmed).trim();
              accepted.push({ page: p, y, text: lineText, reason: 'continuación: nombre propio pegado a fila previa' });
            } else {
              rejected.push({ page: p, y, text: lineText, reason: 'nombre propio corto pero fila previa < 2 cols' });
            }
          } else {
            rejected.push({ page: p, y, text: lineText, reason: 'no matchea: ni data-row ni continuación conocida' });
          }
        } else {
          rejected.push({ page: p, y, text: lineText, reason: 'no matchea ningún patrón y no hay fila previa' });
        }
      }
    }
  }

  // Console group cuando el operador activa debug con localStorage.bankParserDebug='1'.
  if (typeof localStorage !== 'undefined' && localStorage.getItem('bankParserDebug') === '1') {
    console.group(`[bankParser] PDF → ${allRows.length} filas, ${rejected.length} rechazadas, ${accepted.length} aceptadas`);
    if (rejected.length) {
      console.group(`Rechazadas (${rejected.length})`);
      for (const r of rejected) console.log(`p${r.page} y${r.y}: [${r.reason}]`, r.text);
      console.groupEnd();
    }
    if (accepted.length) {
      console.group(`Aceptadas (${accepted.length})`);
      for (const a of accepted) console.log(`p${a.page} y${a.y}: [${a.reason}]`, a.text);
      console.groupEnd();
    }
    console.groupEnd();
  }

  return { rows: allRows, rawText: rawTextParts.join(' '), rejected, accepted };
}

/**
 * Asigna cada item de texto a la columna del header más cercana por X.
 * Mucho más preciso que clustering por gaps cuando tenemos X de referencia.
 */
function splitByHeaderColumns(
  items: { x: number; text: string }[],
  headerXs: number[],
): string[] {
  const cells: string[] = headerXs.map(() => '');
  const sorted = [...items].sort((a, b) => a.x - b.x);
  for (const it of sorted) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < headerXs.length; i++) {
      const d = Math.abs(it.x - headerXs[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${it.text}` : it.text;
  }
  // Fallback EdeC Banesco mensual: si la celda DIA (col 0) quedó vacía
  // pero la siguiente empieza con "DD <ref de 6+>", mover el día.
  // Pasa cuando el ítem del día cae más cerca de REF que de DIA por X.
  if (!cells[0] && cells[1]) {
    const m = /^(\d{1,2})\s+([A-Z0-9]{6,}.*)$/i.exec(cells[1].trim());
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      cells[0] = m[1];
      cells[1] = m[2];
    }
  }
  return cells.map(c => c.trim());
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

// ——— Detección de banco desde texto PDF ———

function detectProfileFromPdfText(rawText: string): BankStatementProfile | undefined {
  const t = norm(rawText);
  // Best-match: gana el perfil con más keywords matched.
  // Esto permite que variantes específicas (BDV Empresa con "bdvenlinea empresas",
  // "historico de movimientos") superen a las genéricas (BDV Personal con solo "bdv").
  let best: { profile: BankStatementProfile; hits: number } | null = null;
  for (const p of BANK_PROFILES) {
    if (!p.pdfDetectionKeywords?.length) continue;
    const hits = p.pdfDetectionKeywords.filter(k => t.includes(norm(k))).length;
    if (hits >= 1 && (!best || hits > best.hits)) best = { profile: p, hits };
  }
  return best?.profile;
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

function normalizeDate(
  raw: string,
  fmt: DateFormat,
  periodHint?: { month: string; year: string },
): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Si ya viene ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Formatos DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(s);
  if (!m) {
    // Fallback: solo día (1-31). Requiere periodHint con mes/año del header.
    const dayOnly = /^(\d{1,2})$/.exec(s);
    if (dayOnly && periodHint) {
      const day = dayOnly[1].padStart(2, '0');
      if (+day >= 1 && +day <= 31) {
        const iso = `${periodHint.year}-${periodHint.month}-${day}`;
        const check = new Date(iso + 'T00:00:00Z');
        if (!isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso) {
          return iso;
        }
      }
    }
    return null;
  }
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
  let pdfProfile: BankStatementProfile | undefined;
  let pdfRawText: string | undefined;
  let pdfRejected: RejectedPdfLine[] | undefined;
  let pdfAccepted: RejectedPdfLine[] | undefined;

  try {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const buf = await readFileAsBuffer(file);
      const result = await parsePDF(buf);
      rawRows = result.rows;
      pdfRawText = result.rawText;
      pdfRejected = result.rejected;
      pdfAccepted = result.accepted;
      pdfProfile = detectProfileFromPdfText(result.rawText);
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
    return {
      rows: [], warnings: ['Archivo vacío'], needsManualMapping: true,
      rawText: pdfRawText, debugRawRows: rawRows, debugHeaderIdx: -1,
      debugRejectedLines: pdfRejected, debugAcceptedLines: pdfAccepted,
    };
  }

  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx < 0) {
    return {
      rows: [],
      warnings: ['No se detectó la fila de encabezados. Revisa el archivo o usa mapeo manual.'],
      needsManualMapping: true,
      rawText: pdfRawText, debugRawRows: rawRows, debugHeaderIdx: -1,
      debugRejectedLines: pdfRejected, debugAcceptedLines: pdfAccepted,
    };
  }

  const headerRow = rawRows[headerIdx];
  const dataRows = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c && c.trim()));

  const profile = opts.profile || pdfProfile || detectProfile(headerRow) || GENERIC_PROFILE;

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

  // Extraer período del rawText del PDF para resolver fechas DD-only (EdeC Banesco mensual).
  let periodHint: { month: string; year: string } | undefined;
  if (pdfRawText) {
    const pm = PERIOD_MM_YYYY_RE.exec(pdfRawText);
    if (pm) {
      const month = pm[1].padStart(2, '0');
      const year = pm[2];
      if (+month >= 1 && +month <= 12) {
        periodHint = { month, year };
      }
    }
  }

  // Banesco mensual imprime la columna DIA una sola vez por grupo de mismo día.
  // Las filas siguientes con DIA vacío heredan el último día visto (replicando la
  // convención visual del EdeC).
  let lastDay: string | null = null;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawDate = row[dateIdx] || '';
    let date = normalizeDate(rawDate, profile.dateFormat, periodHint);
    if (!date && !rawDate && lastDay && periodHint) {
      // Fallback: celda DIA vacía → usar el último día parseado en el período.
      date = normalizeDate(lastDay, profile.dateFormat, periodHint);
    }
    if (!date) {
      warnings.push(`Fila ${i + headerIdx + 2}: fecha inválida "${rawDate}"`);
      continue;
    }
    // Capturar el día (DD) del date ISO para heredarlo en filas siguientes.
    const dayMatch = /-(\d{2})$/.exec(date);
    if (dayMatch) lastDay = dayMatch[1];

    let amount: number | null = null;
    if (creditIx >= 0 || debitIdx >= 0) {
      const credit = creditIx >= 0 ? (normalizeAmount(row[creditIx] || '', profile.decimalSep) ?? 0) : 0;
      const debitRaw = debitIdx >= 0 ? (normalizeAmount(row[debitIdx] || '', profile.decimalSep) ?? 0) : 0;
      // Algunos bancos (BDV) ya muestran el débito con signo negativo en la columna.
      // Otros usan valor absoluto. Normalizar a positivo y restar para tener convención uniforme:
      // amount > 0 = ingreso, amount < 0 = egreso.
      const debit = Math.abs(debitRaw);
      amount = credit - debit;
    } else if (amountIdx >= 0) {
      amount = normalizeAmount(row[amountIdx] || '', profile.decimalSep);
    }

    if (amount == null || amount === 0) {
      // Filas tipo "SALDO ANTERIOR / SALDO INICIAL" tienen fecha + saldo pero sin
      // crédito/débito — NO son un error de parseo, son informativas. Skip silente.
      const descRaw = descIdx >= 0 ? String(row[descIdx] || '').toLowerCase() : '';
      const isSaldoInformativo = /saldo\s+(anterior|inicial|final)/.test(descRaw);
      if (!isSaldoInformativo) {
        warnings.push(`Fila ${i + headerIdx + 2}: monto inválido`);
      }
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
    rawText: pdfRawText,
    debugRawRows: rawRows,
    debugHeaderIdx: headerIdx,
    debugRejectedLines: pdfRejected,
    debugAcceptedLines: pdfAccepted,
  };
}

export function slugifyAlias(alias: string): string {
  return norm(alias).replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 40);
}
