import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, Loader2, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { drawDualisFooter, drawDualisLogo } from '../../utils/dualisBranding';
import type { ReconciliationBatch } from '../../../types';
import type { AccountChipData } from './AccountChips';

interface ConciliacionPdfExportModalProps {
  batches: ReconciliationBatch[];
  accountChips?: AccountChipData[];
  businessId: string;
  /** Pre-selecciona meses (YYYY-MM). Si se pasa, arranca con ese filtro aplicado. */
  initialSelectedMonths?: string[];
  /** Título inicial override (ej. "Cierre Mensual — enero 2026"). */
  initialTitle?: string;
  onClose: () => void;
}

interface BusinessInfo {
  name?: string;
  rif?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface FieldOptions {
  includeKpis: boolean;
  includeAccounts: boolean;
  includeBatches: boolean;
  includeBatchStatus: boolean;
  includeBatchCreator: boolean;
  includeBatchPeriod: boolean;
  onlyOpenBatches: boolean;
  selectedMonths: string[];   // YYYY-MM; vacío = todos
  title: string;
}

const DEFAULT_OPTS: FieldOptions = {
  includeKpis: true,
  includeAccounts: true,
  includeBatches: true,
  includeBatchStatus: true,
  includeBatchCreator: true,
  includeBatchPeriod: true,
  onlyOpenBatches: false,
  selectedMonths: [],
  title: 'Reporte de Conciliación Bancaria',
};

// Meses YYYY-MM que toca un batch: los que caen entre periodFrom..periodTo,
// o el mes de createdAt como fallback si no hay período.
function batchMonths(b: ReconciliationBatch): string[] {
  if (b.periodFrom && b.periodTo) {
    const months = new Set<string>();
    const [fy, fm] = b.periodFrom.slice(0, 7).split('-').map(Number);
    const [ty, tm] = b.periodTo.slice(0, 7).split('-').map(Number);
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      months.add(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      if (months.size > 120) break;
    }
    return Array.from(months);
  }
  if (b.createdAt) return [b.createdAt.slice(0, 7)];
  return [];
}

const fmtMonthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
};

const fmtDateTime = (d: Date) => d.toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// Gradiente cyan→violeta (mismo patrón que dualisBranding pero público aquí
// porque el footer está en esa lib y esto es para la banda del header).
function drawGradientBarMm(pdf: any, x: number, y: number, width: number, height: number) {
  const from: [number, number, number] = [34, 211, 238];
  const to: [number, number, number] = [139, 92, 246];
  const strips = 80;
  const stripW = width / strips;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    pdf.setFillColor(r, g, b);
    pdf.rect(x + i * stripW, y, stripW + 0.05, height, 'F');
  }
}

export default function ConciliacionPdfExportModal({ batches, accountChips, businessId, initialSelectedMonths, initialTitle, onClose }: ConciliacionPdfExportModalProps) {
  const [opts, setOpts] = useState<FieldOptions>(() => ({
    ...DEFAULT_OPTS,
    selectedMonths: initialSelectedMonths && initialSelectedMonths.length ? [...initialSelectedMonths] : [],
    title: initialTitle || DEFAULT_OPTS.title,
  }));
  const [busy, setBusy] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo>({});

  // Cargamos info del negocio para estamparla en el header del PDF (mismo
  // patrón que exportStatementFullPDF en clientStatementExports).
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'businesses', businessId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as any;
        setBusiness({
          name: data.name || data.businessName,
          rif: data.rif || data.taxId,
          phone: data.phone,
          email: data.email,
          address: data.address,
        });
      } catch (err) {
        console.warn('[ConciliacionPdf] could not load business info', err);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  // Meses disponibles entre todos los lotes (derivados de período o createdAt)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const b of batches) batchMonths(b).forEach(m => set.add(m));
    return Array.from(set).sort().reverse();
  }, [batches]);

  // Aplica filtros globales: meses seleccionados + onlyOpenBatches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (opts.selectedMonths.length) {
        const months = batchMonths(b);
        const hit = months.some(m => opts.selectedMonths.includes(m));
        if (!hit) return false;
      }
      if (opts.onlyOpenBatches && (b.status === 'done' || b.status === 'archived')) return false;
      return true;
    });
  }, [batches, opts.selectedMonths, opts.onlyOpenBatches]);

  const kpis = useMemo(() => {
    let total = 0, confirmed = 0, review = 0, notFound = 0, duplicates = 0;
    for (const b of filteredBatches) {
      const s = b.stats || { total: 0, confirmed: 0, review: 0, notFound: 0, manual: 0 };
      total += s.total; confirmed += s.confirmed; review += s.review; notFound += s.notFound;
      duplicates += s.duplicates ?? 0;
    }
    const autoRatio = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, review, notFound, duplicates, autoRatio };
  }, [filteredBatches]);

  const toggleMonth = (m: string) =>
    setOpts(o => ({
      ...o,
      selectedMonths: o.selectedMonths.includes(m)
        ? o.selectedMonths.filter(x => x !== m)
        : [...o.selectedMonths, m],
    }));

  const update = <K extends keyof FieldOptions>(key: K, value: FieldOptions[K]) =>
    setOpts(o => ({ ...o, [key]: value }));

  const handleExport = async () => {
    setBusy(true);
    try {
      // Unidades en mm (mismo patrón que clientStatementExports / paymentReceiptPdf).
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const generatedAt = new Date();
      const title = opts.title || 'Reporte de Conciliación Bancaria';

      // ── HEADER: banda slate-900 con logo + empresa + título ─────────────
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageW, 32, 'F');

      // Logo Dualis (anillos cyan+violeta). Los anillos tienen offset interno
      // (~r*0.65 a cada lado), así que el ancho visual real ≈ size * 1.4.
      // Colocamos el centro en x=12 con size=7 → ocupa ~4..20mm. El texto de
      // la empresa arranca en x=24 para no chocar.
      drawDualisLogo(pdf, 12, 10, 7);

      const textX = 24;
      const rightColX = pageW - margin;
      // Ancho disponible para el nombre (deja espacio al título de la derecha).
      const leftColMaxW = pageW - textX - 80; // reserva ~80mm al bloque derecho

      // Nombre de la empresa en mayúsculas (el titular del documento).
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      const bizName = (business.name || 'Empresa').toUpperCase();
      // splitTextToSize evita overflow horizontal si el nombre es largo.
      const bizLines = pdf.splitTextToSize(bizName, leftColMaxW) as string[];
      pdf.text(bizLines[0] || bizName, textX, 13);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const infoParts: string[] = [];
      if (business.rif) infoParts.push(`RIF: ${business.rif}`);
      if (business.phone) infoParts.push(business.phone);
      if (business.email) infoParts.push(business.email);
      if (infoParts.length) {
        const infoLines = pdf.splitTextToSize(infoParts.join(' · '), leftColMaxW) as string[];
        pdf.text(infoLines[0], textX, 19);
      }
      if (business.address) {
        const addrLines = pdf.splitTextToSize(business.address, leftColMaxW) as string[];
        pdf.text(addrLines[0], textX, 24);
      }

      // Bloque derecho: título del reporte + metadatos.
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(title, rightColX, 13, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(`Emitido: ${fmtDateTime(generatedAt)}`, rightColX, 19, { align: 'right' });
      const monthsHint = opts.selectedMonths.length
        ? `Meses: ${opts.selectedMonths.map(fmtMonthLabel).join(', ')}`
        : `${filteredBatches.length} lote${filteredBatches.length === 1 ? '' : 's'} incluido${filteredBatches.length === 1 ? '' : 's'}`;
      pdf.text(monthsHint, rightColX, 24, { align: 'right' });

      // Banda cyan→violeta bajo el header para firmar visualmente el doc.
      drawGradientBarMm(pdf, 0, 32, pageW, 0.7);

      let y = 40;

      // ── KPIs ────────────────────────────────────────────────────────────
      if (opts.includeKpis) {
        // Banner slate con los números clave (mismo estilo que drawBalanceBlock).
        pdf.setFillColor(15, 23, 42);
        pdf.roundedRect(margin, y, pageW - margin * 2, 20, 1.5, 1.5, 'F');

        const labels = ['AUTO-MATCH', 'CONFIRMADOS', 'POR REVISAR', 'SIN MATCH', 'DUPLICADOS'];
        const values = [
          `${kpis.autoRatio}%`,
          `${kpis.confirmed}/${kpis.total}`,
          `${kpis.review}`,
          `${kpis.notFound}`,
          `${kpis.duplicates}`,
        ];
        const colW = (pageW - margin * 2) / labels.length;
        for (let i = 0; i < labels.length; i++) {
          const cx = margin + colW * i + colW / 2;
          pdf.setTextColor(148, 163, 184);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(6.8);
          pdf.text(labels[i], cx, y + 6, { align: 'center' });

          // El valor KPI crítico (auto-match) en color de marca.
          if (i === 0) pdf.setTextColor(34, 211, 238);
          else if (i === 1) pdf.setTextColor(134, 239, 172);
          else if (i === 2) pdf.setTextColor(251, 191, 36);
          else if (i === 3) pdf.setTextColor(248, 113, 113);
          else pdf.setTextColor(196, 181, 253);
          pdf.setFontSize(12);
          pdf.text(values[i], cx, y + 14, { align: 'center' });
        }
        y += 26;
      }

      // ── Cuentas bancarias ──────────────────────────────────────────────
      if (opts.includeAccounts && accountChips && accountChips.length > 0) {
        if (y > pageH - 50) { pdf.addPage(); y = margin; }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(71, 85, 105);
        pdf.text('CUENTAS BANCARIAS CARGADAS', margin, y);
        y += 2;

        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Alias', 'Banco', 'Filas', 'Usadas', '%']],
          body: accountChips.map(c => {
            const denom = c.creditRowCount || c.rowCount || 0;
            const used = c.usedCount || 0;
            const pct = denom > 0 ? Math.round((used / denom) * 100) : 0;
            return [
              c.accountLabel || c.accountAlias,
              c.bankName || '—',
              String(c.rowCount),
              String(used),
              `${pct}%`,
            ];
          }),
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 1.5, textColor: [51, 65, 85] },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { fontStyle: 'bold' },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'right', fontStyle: 'bold' },
          },
        });
        y = (pdf as any).lastAutoTable.finalY + 6;
      }

      // ── Lotes ──────────────────────────────────────────────────────────
      if (opts.includeBatches) {
        const rows = filteredBatches;
        if (rows.length > 0) {
          if (y > pageH - 50) { pdf.addPage(); y = margin; }
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(71, 85, 105);
          pdf.text(`LOTES (${rows.length})`, margin, y);
          y += 2;

          const head: string[] = ['Nombre'];
          if (opts.includeBatchPeriod) head.push('Período');
          head.push('Total', 'Confirm.', 'Revisar', 'Sin match', 'Dup.');
          if (opts.includeBatchCreator) head.push('Creado por');
          if (opts.includeBatchStatus) head.push('Estado');

          const body = rows.map(b => {
            const row: string[] = [b.name];
            if (opts.includeBatchPeriod) {
              // Guión ASCII en vez de flecha unicode: helvetica de jsPDF no tiene
              // glifo para → y termina rendereando los dígitos con tracking raro
              // ("2 0 2 6 - 0 1 - 0 7"). Con "-" se ve limpio.
              const per = b.periodFrom && b.periodTo
                ? (b.periodFrom === b.periodTo ? b.periodFrom : `${b.periodFrom} a ${b.periodTo}`)
                : '-';
              row.push(per);
            }
            row.push(
              String(b.stats?.total ?? 0),
              String(b.stats?.confirmed ?? 0),
              String(b.stats?.review ?? 0),
              String(b.stats?.notFound ?? 0),
              String(b.stats?.duplicates ?? 0),
            );
            if (opts.includeBatchCreator) {
              const created = b.createdAt ? new Date(b.createdAt).toLocaleDateString('es-VE') : '—';
              row.push(`${b.createdByName || '—'}\n${created}`);
            }
            if (opts.includeBatchStatus) row.push(b.status);
            return row;
          });

          // Anchos fijos: damos espacio a Período (fechas largas) y a los
          // contadores numéricos para que no colapsen con line-break raro.
          const colStyles: Record<number, any> = { 0: { fontStyle: 'bold', cellWidth: 45 } };
          let idx = 1;
          if (opts.includeBatchPeriod) { colStyles[idx] = { cellWidth: 42, halign: 'center' }; idx++; }
          // Total, Confirm., Revisar, Sin match, Dup.
          for (let k = 0; k < 5; k++) { colStyles[idx] = { cellWidth: 15, halign: 'center' }; idx++; }
          if (opts.includeBatchCreator) { colStyles[idx] = { cellWidth: 26 }; idx++; }
          if (opts.includeBatchStatus) { colStyles[idx] = { cellWidth: 18, halign: 'center' }; idx++; }

          autoTable(pdf, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [head],
            body,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', textColor: [51, 65, 85] },
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: colStyles,
            didParseCell: (data) => {
              // Pintamos Confirm. verde, Revisar ámbar, Sin match rojo para lectura rápida.
              if (data.section !== 'body') return;
              const headerText = (data.table.head[0]?.cells?.[data.column.index]?.raw as string) || '';
              const val = Number(data.cell.raw);
              if (headerText === 'Confirm.' && val > 0) data.cell.styles.textColor = [5, 150, 105];
              else if (headerText === 'Revisar' && val > 0) data.cell.styles.textColor = [217, 119, 6];
              else if (headerText === 'Sin match' && val > 0) data.cell.styles.textColor = [225, 29, 72];
              else if (headerText === 'Dup.' && val > 0) data.cell.styles.textColor = [147, 51, 234];
            },
          });
          y = (pdf as any).lastAutoTable.finalY + 6;
        }
      }

      // Footer oficial Dualis en TODAS las páginas (anillos + barra + marca).
      drawDualisFooter(pdf, {
        tagline: `${title} · dualis.online`,
      });

      const filename = `conciliacion_${generatedAt.toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
      onClose();
    } catch (err) {
      console.error('[ConciliacionPdf] export failed', err);
      alert('Error generando PDF: ' + (err as any)?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <FileText size={16} className="text-indigo-700 dark:text-indigo-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Exportar PDF de Conciliación</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Selecciona qué incluir en el reporte</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Título del reporte
            </label>
            <input
              type="text"
              value={opts.title}
              onChange={(e) => update('title', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
              placeholder="Reporte de Conciliación Bancaria"
            />
          </div>

          <Section label="Secciones a incluir">
            <Check
              label="Resumen global (KPIs, auto-match %, totales)"
              checked={opts.includeKpis}
              onChange={(v) => update('includeKpis', v)}
            />
            <Check
              label={`Cuentas bancarias cargadas${accountChips?.length ? ` (${accountChips.length})` : ''}`}
              checked={opts.includeAccounts}
              onChange={(v) => update('includeAccounts', v)}
              disabled={!accountChips?.length}
            />
            <Check
              label={`Tabla de lotes (${batches.length})`}
              checked={opts.includeBatches}
              onChange={(v) => update('includeBatches', v)}
            />
          </Section>

          <Section label="Columnas de los lotes">
            <Check
              label="Período"
              checked={opts.includeBatchPeriod}
              onChange={(v) => update('includeBatchPeriod', v)}
              disabled={!opts.includeBatches}
            />
            <Check
              label="Creado por / fecha"
              checked={opts.includeBatchCreator}
              onChange={(v) => update('includeBatchCreator', v)}
              disabled={!opts.includeBatches}
            />
            <Check
              label="Estado"
              checked={opts.includeBatchStatus}
              onChange={(v) => update('includeBatchStatus', v)}
              disabled={!opts.includeBatches}
            />
          </Section>

          <Section label="Filtros">
            <Check
              label="Solo lotes abiertos (excluir 'done' y 'archived')"
              checked={opts.onlyOpenBatches}
              onChange={(v) => update('onlyOpenBatches', v)}
              disabled={!opts.includeBatches}
            />
          </Section>

          {availableMonths.length > 0 && (
            <Section label={`Meses disponibles (${opts.selectedMonths.length || 'todos'})`}>
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => update('selectedMonths', [])}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => update('selectedMonths', [...availableMonths])}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Seleccionar todos
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {availableMonths.map(m => {
                  const active = opts.selectedMonths.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {fmtMonthLabel(m)}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 italic">
                {opts.selectedMonths.length
                  ? `Filtrando ${filteredBatches.length} de ${batches.length} lote${batches.length === 1 ? '' : 's'}`
                  : 'Sin selección = incluir todos los meses'}
              </div>
            </Section>
          )}

          <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            El reporte captura el estado actual del sistema. El período de cada lote se deriva de las fechas reales de sus abonos.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={busy || (!opts.includeKpis && !opts.includeAccounts && !opts.includeBatches)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="space-y-1.5 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/30">{children}</div>
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
    </label>
  );
}
