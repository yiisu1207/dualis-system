// Extracción de metadata del header del PDF nativo del banco:
// titular, número de cuenta, período (desde/hasta), saldos inicial/final.
//
// Estrategia: regex genéricos que cubren los principales bancos VE (Banesco, Mercantil,
// BDV, Provincial, BNC, BANCAMIGA). Si un banco usa headers no estándar, los regex
// devuelven undefined y el operador completa manualmente en el modal.

import type { BankStatementProfile } from '../data/bankStatementFormats';
import type { BankStatementExtractedMeta, BusinessBankAccount } from '../../types';

const RE_HOLDER = [
  /(?:cliente|titular|beneficiario|nombre del cliente|raz[oó]n social)\s*[:\-]?\s*([A-ZÑÁÉÍÓÚ0-9 .,&'-]{4,80})/i,
  /(?:nombre|name)\s*[:\-]\s*([A-ZÑÁÉÍÓÚ0-9 .,&'-]{4,80})/i,
];

const RE_ACCOUNT = [
  /(?:cuenta\s*(?:n[oº°]?\.?|nro\.?|no\.?|numero|n[uú]mero)?|n[uú]mero de cuenta|account)\s*[:\-]?\s*([0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4,8})/i,
  /(?:cuenta\s*(?:corriente|ahorro|de ahorro|de ahorros)?)\s*[:\-]?\s*([0-9-]{16,28})/i,
  /\b(0102|0105|0108|0114|0115|0116|0128|0134|0151|0156|0157|0163|0166|0168|0169|0171|0172|0174|0175|0177|0191)[-\s]?[0-9]{4}[-\s]?[0-9]{2}[-\s]?[0-9]{10}\b/,
];

const RE_PERIOD = [
  // "Período: Del 01/03/2026 al 31/03/2026"
  /(?:per[ií]odo|periodo|del)\s*(?:[:\-]\s*)?(?:del\s*)?(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:al|hasta|to|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  // "Desde 01/03/2026 Hasta 31/03/2026"
  /desde\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*hasta\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  // "01-03-2026 al 31-03-2026"
  /(\d{1,2}-\d{1,2}-\d{4})\s*al\s*(\d{1,2}-\d{1,2}-\d{4})/i,
  // ISO directo "2026-03-01 al 2026-03-31"
  /(\d{4}-\d{2}-\d{2})\s*(?:al|to|-)\s*(\d{4}-\d{2}-\d{2})/,
];

const RE_OPENING_BALANCE = [
  /(?:saldo\s*(?:inicial|anterior|de\s*apertura))\s*[:\-]?\s*([\d.,]+)/i,
  /(?:opening\s*balance|previous\s*balance)\s*[:\-]?\s*([\d.,]+)/i,
];

const RE_CLOSING_BALANCE = [
  /(?:saldo\s*(?:final|disponible|de\s*cierre|al\s*corte))\s*[:\-]?\s*([\d.,]+)/i,
  /(?:closing\s*balance|current\s*balance)\s*[:\-]?\s*([\d.,]+)/i,
];

function normalizeDateToISO(raw: string): string | undefined {
  // Acepta DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const m1 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return raw;
  return undefined;
}

function normalizeAmount(raw: string): number | undefined {
  // Asume separador miles "." y decimal "," como en VE; normaliza a número
  const cleaned = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

export function extractStatementMeta(
  rawText: string,
  _profile?: BankStatementProfile,
): BankStatementExtractedMeta {
  if (!rawText) return {};
  // Trabaja sobre las primeras 3000 chars (el header siempre está arriba)
  const head = rawText.slice(0, 3000);

  const meta: BankStatementExtractedMeta = {};

  const holder = firstMatch(head, RE_HOLDER);
  if (holder?.[1]) meta.holderName = holder[1].trim().replace(/\s+/g, ' ');

  const acct = firstMatch(head, RE_ACCOUNT);
  if (acct?.[1] || acct?.[0]) {
    const raw = (acct[1] || acct[0]).replace(/[\s-]/g, '');
    if (raw.length >= 16) meta.accountNumber = raw;
  }

  const period = firstMatch(head, RE_PERIOD);
  if (period?.[1] && period?.[2]) {
    meta.periodFrom = normalizeDateToISO(period[1]);
    meta.periodTo = normalizeDateToISO(period[2]);
  }

  const opening = firstMatch(head, RE_OPENING_BALANCE);
  if (opening?.[1]) meta.openingBalance = normalizeAmount(opening[1]);

  const closing = firstMatch(head, RE_CLOSING_BALANCE);
  if (closing?.[1]) meta.closingBalance = normalizeAmount(closing[1]);

  return meta;
}

/**
 * Intenta auto-mapear la metadata extraída a una BusinessBankAccount existente.
 * Match prioritario por accountNumber (últimos 4-8 dígitos), luego por holderName.
 */
export function autoMapToBusinessAccount(
  meta: BankStatementExtractedMeta,
  accounts: BusinessBankAccount[],
  detectedBankCode?: string,
): BusinessBankAccount | undefined {
  if (!accounts.length) return undefined;

  // 1. Match exacto por accountNumber completo (ignorando guiones/espacios)
  if (meta.accountNumber) {
    const target = meta.accountNumber.replace(/[\s-]/g, '');
    const exact = accounts.find(a => (a.accountNumber || '').replace(/[\s-]/g, '') === target);
    if (exact) return exact;

    // 2. Match por últimos 8 dígitos (común que el header del banco enmascare)
    if (target.length >= 8) {
      const last8 = target.slice(-8);
      const partial = accounts.find(a => {
        const n = (a.accountNumber || '').replace(/[\s-]/g, '');
        return n.length >= 8 && n.slice(-8) === last8;
      });
      if (partial) return partial;
    }
    // 3. Match por últimos 4 dígitos + bankCode
    if (target.length >= 4 && detectedBankCode) {
      const last4 = target.slice(-4);
      const partial4 = accounts.find(a => {
        const n = (a.accountNumber || '').replace(/[\s-]/g, '');
        return a.bankCode === detectedBankCode && n.length >= 4 && n.slice(-4) === last4;
      });
      if (partial4) return partial4;
    }
  }

  // 4. Match único por bankCode si solo hay una cuenta de ese banco
  if (detectedBankCode) {
    const sameBank = accounts.filter(a => a.bankCode === detectedBankCode);
    if (sameBank.length === 1) return sameBank[0];
  }

  return undefined;
}
