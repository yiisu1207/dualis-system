import React, { useMemo, useState } from 'react';
import { X, Download, Loader2, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReconciliationBatch } from '../../../types';
import type { AccountChipData } from './AccountChips';

interface ConciliacionPdfExportModalProps {
  batches: ReconciliationBatch[];
  accountChips?: AccountChipData[];
  onClose: () => void;
}

interface FieldOptions {
  includeKpis: boolean;
  includeAccounts: boolean;
  includeBatches: boolean;
  includeBatchStatus: boolean;
  includeBatchCreator: boolean;
  includeBatchPeriod: boolean;
  onlyOpenBatches: boolean;
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
  title: 'Reporte de Conciliación Bancaria',
};

const fmtDate = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtDateTime = (d: Date) => d.toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export default function ConciliacionPdfExportModal({ batches, accountChips, onClose }: ConciliacionPdfExportModalProps) {
  const [opts, setOpts] = useState<FieldOptions>(DEFAULT_OPTS);
  const [busy, setBusy] = useState(false);

  const kpis = useMemo(() => {
    let total = 0, confirmed = 0, review = 0, notFound = 0, duplicates = 0;
    for (const b of batches) {
      const s = b.stats || { total: 0, confirmed: 0, review: 0, notFound: 0, manual: 0 };
      total += s.total; confirmed += s.confirmed; review += s.review; notFound += s.notFound;
      duplicates += s.duplicates ?? 0;
    }
    const autoRatio = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, review, notFound, duplicates, autoRatio };
  }, [batches]);

  const update = <K extends keyof FieldOptions>(key: K, value: FieldOptions[K]) =>
    setOpts(o => ({ ...o, [key]: value }));

  const handleExport = async () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;
      let y = margin;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(opts.title || 'Reporte de Conciliación Bancaria', margin, y);
      y += 20;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const generatedAt = new Date();
      doc.text(`Generado ${fmtDateTime(generatedAt)} · Estado actual del sistema`, margin, y);
      y += 8;
      doc.text(`${batches.length} lote(s) registrado(s)`, margin, y);
      y += 16;

      // KPIs
      if (opts.includeKpis) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text('Resumen global', margin, y);
        y += 12;

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Métrica', 'Valor']],
          body: [
            ['Auto-match %', `${kpis.autoRatio}%`],
            ['Abonos confirmados', `${kpis.confirmed} / ${kpis.total}`],
            ['Por revisar', String(kpis.review)],
            ['Sin match', String(kpis.notFound)],
            ['Duplicados', String(kpis.duplicates)],
          ],
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [79, 70, 229], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        y = (doc as any).lastAutoTable.finalY + 16;
      }

      // Cuentas bancarias
      if (opts.includeAccounts && accountChips && accountChips.length > 0) {
        if (y > pageH - 140) { doc.addPage(); y = margin; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text('Cuentas bancarias cargadas', margin, y);
        y += 12;

        autoTable(doc, {
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
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [79, 70, 229], textColor: 255 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        y = (doc as any).lastAutoTable.finalY + 16;
      }

      // Lotes
      if (opts.includeBatches) {
        const rows = (opts.onlyOpenBatches ? batches.filter(b => b.status !== 'archived' && b.status !== 'done') : batches);
        if (rows.length > 0) {
          if (y > pageH - 140) { doc.addPage(); y = margin; }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(30, 41, 59);
          doc.text(`Lotes (${rows.length})`, margin, y);
          y += 12;

          const head: string[] = ['Nombre'];
          if (opts.includeBatchPeriod) head.push('Período');
          head.push('Total', 'Confirm.', 'Revisar', 'Sin match', 'Dup.');
          if (opts.includeBatchCreator) head.push('Creado por');
          if (opts.includeBatchStatus) head.push('Estado');

          const body = rows.map(b => {
            const row: string[] = [b.name];
            if (opts.includeBatchPeriod) row.push(b.periodFrom && b.periodTo ? `${b.periodFrom} → ${b.periodTo}` : '—');
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

          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [head],
            body,
            styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
            headStyles: { fillColor: [79, 70, 229], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
          });
          y = (doc as any).lastAutoTable.finalY + 16;
        }
      }

      const pageCount = (doc.internal as any).getNumberOfPages();
      const footerY = pageH - 18;
      const footerText = `Generado ${fmtDateTime(generatedAt)}`;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(footerText, margin, footerY);
        doc.text(`Página ${i} / ${pageCount}`, pageW - margin, footerY, { align: 'right' });
      }

      const filename = `conciliacion_${generatedAt.toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
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

          <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            El reporte captura el estado actual del sistema — incluye todos los lotes creados hasta hoy, sin cortar por mes.
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
