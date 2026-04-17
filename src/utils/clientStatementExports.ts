import type { Customer, Supplier, Movement, CustomRate, ExchangeRates } from '../../types';
import {
  buildChronoData,
  resolveAccountLabel,
  formatDateTime,
  type ChronoMovement,
} from '../components/cxc/cxcHelpers';
import { drawDualisFooter, DUALIS_TEXT_SIGNATURE } from './dualisBranding';

export interface CompanyInfo {
  name?: string;
  rif?: string;
  phone?: string;
  address?: string;
  email?: string;
  logo?: string;
}

export interface ExportMeta {
  company: CompanyInfo;
  rangeLabel?: string;
  filtersLabel?: string;
  mode?: 'cxc' | 'cxp';
}

type Entity = Customer | Supplier;

const getEntityName = (e: Entity): string =>
  (e as any).fullName || (e as any).nombre || (e as any).contacto || (e as any).razonSocial || '—';

const getEntityDoc = (e: Entity): string =>
  (e as any).cedula || (e as any).rif || '—';

const getEntityPhone = (e: Entity): string =>
  (e as any).telefono || (e as any).phone || '—';

const getEntityEmail = (e: Entity): string =>
  (e as any).email || (e as any).correo || '—';

const getEntityAddress = (e: Entity): string =>
  (e as any).direccion || (e as any).address || '—';

const getEntityCreated = (e: Entity): string => {
  const raw = (e as any).createdAt;
  if (!raw) return '—';
  try {
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const fmtMoney = (n: number) => `$${(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = () => new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'cliente';

export function buildBalancesByAccount(movements: ChronoMovement[], customRates: CustomRate[]) {
  const map = new Map<string, { label: string; balance: number }>();
  for (const m of movements) {
    const key = (m.accountType as string) || 'BCV';
    const cur = map.get(key) || { label: resolveAccountLabel(key, customRates), balance: 0 };
    cur.balance += (m.debe || 0) - (m.haber || 0);
    map.set(key, cur);
  }
  return [...map.values()].filter(v => Math.abs(v.balance) > 0.01);
}

/** Stats completos por cuenta: cargos, abonos, saldo y conteo. Incluye cuentas
 * saldadas (balance 0) siempre que haya tenido actividad. Ordenado por saldo desc. */
export interface AccountStats {
  account: string;
  label: string;
  cargos: number;
  abonos: number;
  saldo: number;
  count: number;
}

export function buildAccountStats(
  movements: ChronoMovement[],
  customRates: CustomRate[],
): AccountStats[] {
  const map = new Map<string, AccountStats>();
  for (const m of movements) {
    const key = (m.accountType as string) || 'BCV';
    const cur = map.get(key) || {
      account: key,
      label: resolveAccountLabel(key, customRates),
      cargos: 0,
      abonos: 0,
      saldo: 0,
      count: 0,
    };
    cur.cargos += m.debe || 0;
    cur.abonos += m.haber || 0;
    cur.saldo = cur.cargos - cur.abonos;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
}

export function exportStatementCSV(
  entity: Entity,
  movements: ChronoMovement[],
  customRates: CustomRate[],
  meta: ExportMeta,
) {
  const header = 'Fecha,NroCtrl,Concepto,Cuenta,Tasa,Debe,Haber,Saldo';
  const rows = movements.map(m =>
    [
      formatDateTime(m.displayDate),
      m.nroControl || '',
      `"${(m.concept || '').replace(/"/g, '""')}"`,
      resolveAccountLabel(m.accountType as string, customRates),
      m.rateUsed ? m.rateUsed.toFixed(2) : '',
      m.debe > 0 ? m.debe.toFixed(2) : '',
      m.haber > 0 ? m.haber.toFixed(2) : '',
      m.runningBalance.toFixed(2),
    ].join(',')
  );

  // Resumen por cuenta al final del CSV
  const stats = buildAccountStats(movements, customRates);
  const totalDebe = movements.reduce((s, m) => s + m.debe, 0);
  const totalHaber = movements.reduce((s, m) => s + m.haber, 0);
  const saldo = movements.length ? movements[movements.length - 1].runningBalance : 0;

  const summaryLines: string[] = [];
  summaryLines.push('');
  summaryLines.push('RESUMEN POR CUENTA');
  summaryLines.push('Cuenta,Movimientos,Cargos,Abonos,Saldo');
  stats.forEach(a => {
    summaryLines.push([
      `"${a.label.replace(/"/g, '""')}"`,
      a.count,
      a.cargos.toFixed(2),
      a.abonos.toFixed(2),
      a.saldo.toFixed(2),
    ].join(','));
  });
  summaryLines.push([
    'TOTAL',
    movements.length,
    totalDebe.toFixed(2),
    totalHaber.toFixed(2),
    saldo.toFixed(2),
  ].join(','));

  const csv = [header, ...rows, ...summaryLines].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estado-cuenta-${slugify(getEntityName(entity))}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  void meta;
}

export function buildStatementText(
  entity: Entity,
  movements: ChronoMovement[],
  customRates: CustomRate[],
  meta: ExportMeta,
): string {
  const name = getEntityName(entity);
  const doc = getEntityDoc(entity);
  const totalDebe = movements.reduce((s, m) => s + m.debe, 0);
  const totalHaber = movements.reduce((s, m) => s + m.haber, 0);
  const saldo = movements.length ? movements[movements.length - 1].runningBalance : 0;
  const accountStats = buildAccountStats(movements, customRates);

  const lines: string[] = [];
  lines.push(`*${(meta.company.name || 'Estado de cuenta').toUpperCase()}*`);
  lines.push(`Estado de Cuenta — ${todayStr()}`);
  lines.push('');
  lines.push(`👤 *Cliente:* ${name}`);
  lines.push(`🆔 *Documento:* ${doc}`);
  if (meta.rangeLabel) lines.push(`📅 *Rango:* ${meta.rangeLabel}`);
  lines.push('');
  lines.push(`💰 *Saldo actual:* ${fmtMoney(saldo)}`);
  lines.push('');
  lines.push(`Total Cargos: ${fmtMoney(totalDebe)}`);
  lines.push(`Total Abonos: ${fmtMoney(totalHaber)}`);
  lines.push(`Movimientos: ${movements.length}`);

  if (accountStats.length > 0) {
    lines.push('');
    lines.push('📊 *Desglose por cuenta:*');
    accountStats.forEach(a => {
      const saldoStr = Math.abs(a.saldo) < 0.01 ? 'Al día' : fmtMoney(a.saldo);
      lines.push(`  • *${a.label}* (${a.count} mov.)`);
      lines.push(`     Cargos: ${fmtMoney(a.cargos)}  ·  Abonos: ${fmtMoney(a.abonos)}  ·  Saldo: ${saldoStr}`);
    });
  }

  if (movements.length > 0 && movements.length <= 20) {
    lines.push('');
    lines.push('*Movimientos:*');
    movements.forEach(m => {
      const tipo = m.debe > 0 ? '➖' : '➕';
      const monto = m.debe > 0 ? fmtMoney(m.debe) : fmtMoney(m.haber);
      const acc = resolveAccountLabel(m.accountType as string, customRates);
      lines.push(`${tipo} ${formatDateTime(m.displayDate)} · ${m.concept || '—'} · ${acc} · ${monto}`);
    });
  } else if (movements.length > 20) {
    lines.push('');
    lines.push(`_(${movements.length} movimientos — exporta PDF o CSV para ver todos)_`);
  }

  lines.push('');
  lines.push(DUALIS_TEXT_SIGNATURE);
  return lines.join('\n');
}

export async function copyStatementText(
  entity: Entity,
  movements: ChronoMovement[],
  customRates: CustomRate[],
  meta: ExportMeta,
): Promise<void> {
  const text = buildStatementText(entity, movements, customRates, meta);
  await navigator.clipboard.writeText(text);
}

/* ── PDF helpers ────────────────────────────────────────────────── */

type JsPdfDoc = any;

function drawPdfHeader(doc: JsPdfDoc, title: string, meta: ExportMeta): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((meta.company.name || 'Empresa').toUpperCase(), 14, 12);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const infoParts: string[] = [];
  if (meta.company.rif) infoParts.push(`RIF: ${meta.company.rif}`);
  if (meta.company.phone) infoParts.push(meta.company.phone);
  if (meta.company.email) infoParts.push(meta.company.email);
  if (infoParts.length) doc.text(infoParts.join(' · '), 14, 18);
  if (meta.company.address) doc.text(meta.company.address, 14, 23);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth - 14, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Emitido: ${todayStr()}`, pageWidth - 14, 18, { align: 'right' });
  if (meta.rangeLabel) doc.text(`Rango: ${meta.rangeLabel}`, pageWidth - 14, 23, { align: 'right' });

  return 34;
}

function drawEntityBlock(doc: JsPdfDoc, entity: Entity, startY: number, mode: 'cxc' | 'cxp'): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, pageWidth - 28, 28, 2, 2, 'FD');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(mode === 'cxc' ? 'CLIENTE' : 'PROVEEDOR', 18, startY + 5);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(getEntityName(entity), 18, startY + 11);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  const col1X = 18;
  const col2X = pageWidth / 2;
  doc.text(`Documento: ${getEntityDoc(entity)}`, col1X, startY + 17);
  doc.text(`Teléfono: ${getEntityPhone(entity)}`, col1X, startY + 22);
  doc.text(`Dirección: ${getEntityAddress(entity)}`, col1X, startY + 27);
  doc.text(`Email: ${getEntityEmail(entity)}`, col2X, startY + 17);
  doc.text(`Fecha alta: ${getEntityCreated(entity)}`, col2X, startY + 22);

  return startY + 34;
}

function drawBalanceBlock(
  doc: JsPdfDoc,
  startY: number,
  totals: { totalDebe: number; totalHaber: number; saldo: number; count: number },
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, startY, pageWidth - 28, 18, 2, 2, 'F');

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL CARGOS', 20, startY + 6);
  doc.text('TOTAL ABONOS', 75, startY + 6);
  doc.text('SALDO', 130, startY + 6);
  doc.text('MOVIMIENTOS', 175, startY + 6);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(fmtMoney(totals.totalDebe), 20, startY + 14);
  doc.text(fmtMoney(totals.totalHaber), 75, startY + 14);
  doc.setTextColor(totals.saldo > 0.01 ? 251 : 134, totals.saldo > 0.01 ? 191 : 239, totals.saldo > 0.01 ? 36 : 172);
  doc.text(fmtMoney(totals.saldo), 130, startY + 14);
  doc.setTextColor(255, 255, 255);
  doc.text(`${totals.count}`, 175, startY + 14);

  return startY + 22;
}

async function drawAccountStatsTable(
  doc: JsPdfDoc,
  startY: number,
  stats: AccountStats[],
): Promise<number> {
  if (stats.length === 0) return startY;
  const { default: autoTable } = await import('jspdf-autotable');

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DESGLOSE POR CUENTA', 14, startY + 2);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Cuenta', 'Movs', 'Cargos', 'Abonos', 'Saldo']],
    body: stats.map(a => [
      a.label,
      `${a.count}`,
      fmtMoney(a.cargos),
      fmtMoney(a.abonos),
      Math.abs(a.saldo) < 0.01 ? 'Al día' : fmtMoney(a.saldo),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [51, 65, 85] },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 32, halign: 'right', textColor: [225, 29, 72] },
      3: { cellWidth: 32, halign: 'right', textColor: [5, 150, 105] },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
  return (doc as any).lastAutoTable.finalY + 4;
}

function drawFooter(doc: JsPdfDoc): void {
  drawDualisFooter(doc);
}

export async function exportStatementFullPDF(
  entity: Entity,
  movements: ChronoMovement[],
  customRates: CustomRate[],
  meta: ExportMeta,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const totalDebe = movements.reduce((s, m) => s + m.debe, 0);
  const totalHaber = movements.reduce((s, m) => s + m.haber, 0);
  const saldo = movements.length ? movements[movements.length - 1].runningBalance : 0;
  const stats = buildAccountStats(movements, customRates);

  let y = drawPdfHeader(doc, 'EXPEDIENTE — ESTADO DE CUENTA', meta);
  y = drawEntityBlock(doc, entity, y, meta.mode || 'cxc');
  y = drawBalanceBlock(doc, y, { totalDebe, totalHaber, saldo, count: movements.length });
  y = await drawAccountStatsTable(doc, y, stats);

  autoTable(doc, {
    startY: y + 2,
    head: [['Fecha', 'NroCtrl', 'Concepto', 'Cuenta', 'Tasa', 'Debe', 'Haber', 'Saldo']],
    body: movements.map(m => [
      formatDateTime(m.displayDate),
      m.nroControl || '—',
      m.concept || '—',
      resolveAccountLabel(m.accountType as string, customRates),
      m.rateUsed ? m.rateUsed.toFixed(2) : '—',
      m.debe > 0 ? fmtMoney(m.debe) : '',
      m.haber > 0 ? fmtMoney(m.haber) : '',
      fmtMoney(m.runningBalance),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 20 },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 20, halign: 'right', textColor: [225, 29, 72] },
      6: { cellWidth: 20, halign: 'right', textColor: [5, 150, 105] },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  doc.save(`expediente-${slugify(getEntityName(entity))}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportStatementSummaryPDF(
  entity: Entity,
  allMovements: Movement[],
  rates: ExchangeRates,
  customRates: CustomRate[],
  meta: ExportMeta,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();

  // Group movements by account, compute full chrono per account, then slice last 5
  const entityMovs = allMovements.filter(m => m.entityId === entity.id);
  const byAccount = new Map<string, Movement[]>();
  for (const m of entityMovs) {
    const key = (m.accountType as string) || 'BCV';
    const arr = byAccount.get(key) || [];
    arr.push(m);
    byAccount.set(key, arr);
  }

  // Only accounts with positive balance (debt)
  const sections: { account: string; label: string; last5: ChronoMovement[]; balance: number }[] = [];
  for (const [account, movs] of byAccount.entries()) {
    const chrono = buildChronoData(movs, rates);
    const balance = chrono.length ? chrono[chrono.length - 1].runningBalance : 0;
    if (balance <= 0.01) continue;
    sections.push({
      account,
      label: resolveAccountLabel(account, customRates),
      last5: chrono.slice(-5),
      balance,
    });
  }

  let y = drawPdfHeader(doc, 'RESUMEN EJECUTIVO', meta);
  y = drawEntityBlock(doc, entity, y, meta.mode || 'cxc');

  if (sections.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(11);
    doc.text('Sin cuentas deudoras.', 14, y + 10);
    drawFooter(doc);
    doc.save(`resumen-${slugify(getEntityName(entity))}-${new Date().toISOString().split('T')[0]}.pdf`);
    return;
  }

  const totalSaldo = sections.reduce((s, x) => s + x.balance, 0);
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, y, doc.internal.pageSize.getWidth() - 28, 14, 2, 2, 'F');
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SALDO TOTAL DEUDOR', 20, y + 6);
  doc.setTextColor(251, 191, 36);
  doc.setFontSize(14);
  doc.text(fmtMoney(totalSaldo), 20, y + 12);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.text(`${sections.length} cuenta(s)`, doc.internal.pageSize.getWidth() - 20, y + 10, { align: 'right' });
  y += 20;

  for (const sec of sections) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, doc.internal.pageSize.getWidth() - 28, 10, 2, 2, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(sec.label, 18, y + 7);
    doc.setTextColor(225, 29, 72);
    doc.text(`Saldo: ${fmtMoney(sec.balance)}`, doc.internal.pageSize.getWidth() - 18, y + 7, { align: 'right' });
    y += 12;

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Concepto', 'Debe', 'Haber', 'Saldo']],
      body: sec.last5.map(m => [
        formatDateTime(m.displayDate),
        m.concept || '—',
        m.debe > 0 ? fmtMoney(m.debe) : '',
        m.haber > 0 ? fmtMoney(m.haber) : '',
        fmtMoney(m.runningBalance),
      ]),
      theme: 'plain',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24, halign: 'right', textColor: [225, 29, 72] },
        3: { cellWidth: 24, halign: 'right', textColor: [5, 150, 105] },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  drawFooter(doc);
  doc.save(`resumen-${slugify(getEntityName(entity))}-${new Date().toISOString().split('T')[0]}.pdf`);
}
