import { findRateForDate, type FallbackPolicy, type RateHistoryEntry } from './rateLookup';

export type VoucherIssueType = 'no-voucher-date' | 'no-rate-used' | 'rate-divergent';

export interface AuditVoucher {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  currency: 'USD' | 'BS';
  amountUSD: number;
  rateUsed?: number;
  voucherDate?: string;
  status: 'PENDIENTE' | 'DESCONTADO' | 'CORREGIDO';
  correctedFrom?: string;
  createdAt: any;
}

export interface AuditEmployee {
  id: string;
  fullName: string;
  paymentCurrency: 'USD' | 'BS';
}

export interface VoucherIssueRow {
  voucherId: string;
  voucher: AuditVoucher;
  employee?: AuditEmployee;
  issueType: VoucherIssueType;
  /** Fecha que se usó para el cálculo: voucherDate si existe, si no createdAt proxy */
  effectiveDate: string;
  /** True si no había voucherDate y tuvimos que inferir desde createdAt */
  dateWasInferred: boolean;
  currentRate: number | undefined;
  suggestedRate: number;
  suggestedSourceDate: string | null;
  suggestedIsFallback: boolean;
  currentAmountUSD: number;
  correctedAmountUSD: number;
  diff: number;
  diffPct: number;
  /** True si el vale ya fue descontado en un corte pagado — corrección solo afecta reportes */
  alreadySettled: boolean;
}

const DIVERGENCE_PCT_THRESHOLD = 0.1;

function timestampToDateStr(ts: any): string {
  if (!ts) return new Date().toISOString().slice(0, 10);
  if (typeof ts === 'string') return ts.slice(0, 10);
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().toISOString().slice(0, 10);
  }
  if (ts instanceof Date) return ts.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Detecta vales con posible tasa errónea.
 *
 * Reglas:
 * - Se ignoran vales `CORREGIDO` o con `correctedFrom` (ya parte de cadena auditada).
 * - Solo aplica a vales en BS (los USD no dependen de tasa).
 * - `no-voucher-date`: falta `voucherDate` → usa `createdAt` como proxy y sugiere tasa.
 * - `no-rate-used`: tiene `voucherDate` pero no `rateUsed` → recalcula y reporta si
 *   `amountUSD` actual difiere del correcto > threshold.
 * - `rate-divergent`: tiene `voucherDate` + `rateUsed` pero al recalcular con
 *   `findRateForDate` la tasa histórica correcta difiere > threshold.
 */
export function detectVoucherRateIssues(
  vouchers: AuditVoucher[],
  bcvHistory: RateHistoryEntry[],
  voucherRateHistory: RateHistoryEntry[],
  policy: FallbackPolicy,
  employees: AuditEmployee[],
): VoucherIssueRow[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const out: VoucherIssueRow[] = [];

  for (const v of vouchers) {
    if (v.status === 'CORREGIDO' || v.correctedFrom) continue;
    if (v.currency !== 'BS') continue;
    if (!(v.amount > 0)) continue;

    const emp = empById.get(v.employeeId);
    const isBcv = emp ? emp.paymentCurrency === 'BS' : true;
    const history = isBcv ? bcvHistory : voucherRateHistory;
    if (!history.length) continue;

    const dateWasInferred = !v.voucherDate;
    const effectiveDate = v.voucherDate || timestampToDateStr(v.createdAt);

    const lookup = findRateForDate(history, effectiveDate, policy);
    if (!(lookup.rate > 0)) continue;

    const correctedAmountUSD = v.amount / lookup.rate;
    const currentAmountUSD = Number(v.amountUSD || 0);
    const diff = correctedAmountUSD - currentAmountUSD;
    const diffPct = currentAmountUSD > 0
      ? Math.abs(diff / currentAmountUSD) * 100
      : (correctedAmountUSD > 0 ? 100 : 0);

    let issueType: VoucherIssueType | null = null;
    if (dateWasInferred) {
      issueType = 'no-voucher-date';
    } else if (!(v.rateUsed && v.rateUsed > 0)) {
      if (diffPct > DIVERGENCE_PCT_THRESHOLD) issueType = 'no-rate-used';
    } else {
      const rateDiffPct = Math.abs((v.rateUsed - lookup.rate) / lookup.rate) * 100;
      if (rateDiffPct > DIVERGENCE_PCT_THRESHOLD) issueType = 'rate-divergent';
    }

    if (!issueType) continue;

    out.push({
      voucherId: v.id,
      voucher: v,
      employee: emp,
      issueType,
      effectiveDate,
      dateWasInferred,
      currentRate: v.rateUsed,
      suggestedRate: lookup.rate,
      suggestedSourceDate: lookup.sourceDate,
      suggestedIsFallback: lookup.isFallback,
      currentAmountUSD,
      correctedAmountUSD,
      diff,
      diffPct,
      alreadySettled: v.status === 'DESCONTADO',
    });
  }

  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export function issueTypeLabel(t: VoucherIssueType): string {
  if (t === 'no-voucher-date') return 'Sin fecha de vale';
  if (t === 'no-rate-used') return 'Sin tasa registrada';
  return 'Tasa divergente';
}

export function exportIssuesToCSV(rows: VoucherIssueRow[]): string {
  const header = [
    'voucherId', 'empleado', 'tipo', 'fechaEfectiva', 'fechaInferida',
    'monto', 'moneda', 'tasaActual', 'tasaCorrecta', 'tasaFuente',
    'amountUSDActual', 'amountUSDCorregido', 'diffUSD', 'diffPct',
    'yaDescontado',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.voucherId,
      JSON.stringify(r.voucher.employeeName || ''),
      issueTypeLabel(r.issueType),
      r.effectiveDate,
      r.dateWasInferred ? 'sí' : 'no',
      r.voucher.amount.toFixed(2),
      r.voucher.currency,
      r.currentRate ? r.currentRate.toFixed(4) : '',
      r.suggestedRate.toFixed(4),
      r.suggestedSourceDate || '',
      r.currentAmountUSD.toFixed(2),
      r.correctedAmountUSD.toFixed(2),
      r.diff.toFixed(2),
      r.diffPct.toFixed(2),
      r.alreadySettled ? 'sí' : 'no',
    ].join(','));
  }
  return lines.join('\n');
}
