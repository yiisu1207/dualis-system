// Importación masiva de clientes con saldo inicial.
//
// Flujo:
//   1. Usuario elige fuente: CSV/Excel | Bulk paste | Foto cuaderno (próx)
//   2. Sistema parsea → muestra preview con validación
//   3. Por cada fila: estado ✅ válida | ⚠️ duplicado | ❌ error
//   4. Usuario revisa y decide qué hacer con duplicados
//   5. Click "Importar X clientes" → batch write
//   6. Reporte post-import con conteo
//
// Diseñado para que el cliente venezolano migre desde Excel/cuaderno físico
// a Dualis sin tener que meter cliente por cliente manualmente.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import {
  X, Upload, Clipboard, Camera, Download, FileSpreadsheet,
  AlertTriangle, CheckCircle2, Loader2, Sparkles, Shield,
  Plus, Trash2, Edit3, Calendar, DollarSign,
} from 'lucide-react';
import {
  parseTabular, parseFreeText, validateRow, downloadCsvTemplate,
  formatAging,
  type ImportRow, type ImportRowValidated,
} from '../../utils/customerImport';
import { applyCustomerBatchImport, type BatchImportResult } from '../../utils/customerBatchImport';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: (result: BatchImportResult) => void;
}

type Source = 'csv' | 'paste' | 'vision';

export default function ImportCustomersModal({ open, onClose, onImported }: Props) {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId;

  const [source, setSource] = useState<Source>('csv');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [existing, setExisting] = useState<any[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [rows, setRows] = useState<ImportRowValidated[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [error, setError] = useState('');
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  // Cargar clientes existentes para detección de duplicados
  useEffect(() => {
    if (!open || !businessId) return;
    setLoadingExisting(true);
    getDocs(collection(db, 'customers'))
      .then(snap => {
        const arr: any[] = [];
        snap.forEach(d => {
          const data = d.data() as any;
          if (data.businessId === businessId) {
            arr.push({ id: d.id, ...data });
          }
        });
        setExisting(arr);
      })
      .catch(e => console.warn('[ImportCustomersModal] load existing error', e))
      .finally(() => setLoadingExisting(false));
  }, [open, businessId]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setRawText('');
      setFileName('');
      setRows([]);
      setResult(null);
      setError('');
      setEditingRowIdx(null);
    }
  }, [open]);

  // Re-parsear cuando cambia el texto o la fuente
  useEffect(() => {
    if (!rawText.trim()) {
      setRows([]);
      return;
    }
    let parsed: ImportRow[];
    if (source === 'paste') {
      // Si parece tabular usamos parseTabular, si es texto libre usamos parseFreeText
      const looksTabular = /\t/.test(rawText) || rawText.split('\n').filter(l => l.trim()).length > 1 && /,|;/.test(rawText.split('\n')[0] || '');
      parsed = looksTabular ? parseTabular(rawText) : parseFreeText(rawText);
    } else {
      parsed = parseTabular(rawText);
    }
    const validated = parsed.map(r => validateRow(r, existing));
    setRows(validated);
  }, [rawText, source, existing]);

  const handleFileUpload = useCallback((file: File) => {
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      const text = String(e.target?.result || '');
      setRawText(text);
    };
    reader.onerror = () => setError('No se pudo leer el archivo');
    reader.readAsText(file, 'utf-8');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const stats = useMemo(() => {
    let toCreate = 0, toUpdate = 0, withErrors = 0, withWarnings = 0, withSaldo = 0, totalSaldo = 0;
    for (const r of rows) {
      if (r.errors.length > 0) withErrors++;
      else if (r.action === 'create') toCreate++;
      else if (r.action === 'update') toUpdate++;
      if (r.warnings.length > 0) withWarnings++;
      if (r.saldoInicial && r.saldoInicial > 0) {
        withSaldo++;
        totalSaldo += r.saldoInicial;
      }
    }
    return { toCreate, toUpdate, withErrors, withWarnings, withSaldo, totalSaldo, total: rows.length };
  }, [rows]);

  const handleImport = async () => {
    if (!businessId || rows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const validRows = rows.filter(r => r.errors.length === 0 && r.action !== 'skip');
      const res = await applyCustomerBatchImport(validRows, {
        businessId,
        ownerId: userProfile?.uid,
        createdByName: userProfile?.fullName,
      });
      setResult(res);
      onImported?.(res);
    } catch (e: any) {
      setError(e?.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<ImportRowValidated>) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleAction = (idx: number) => {
    const r = rows[idx];
    let nextAction: ImportRowValidated['action'];
    if (r.action === 'create') nextAction = r.duplicateOfId ? 'update' : 'skip';
    else if (r.action === 'update') nextAction = 'skip';
    else nextAction = 'create';
    updateRow(idx, { action: nextAction });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-md">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Importar clientes</h2>
              <p className="text-sm text-slate-500 dark:text-white/50">
                Migra clientes con saldo inicial sin afectar tus estadísticas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 hover:text-slate-700 dark:text-white/50 flex items-center justify-center transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Aviso seguridad */}
        <div className="shrink-0 mx-6 mt-4 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-start gap-2.5">
          <Shield size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
            <strong className="font-bold">Saldos iniciales separados de ventas.</strong> Los montos que tengan tus clientes desde antes se importan como deuda en CxC pero <strong>NO cuentan</strong> como ventas del día/mes — tus reportes operativos quedan limpios.
          </div>
        </div>

        {/* Tabs de fuente */}
        {!result && (
          <div className="shrink-0 px-6 mt-4 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="flex gap-1">
              <SourceTab
                active={source === 'csv'}
                icon={<FileSpreadsheet size={14} />}
                label="CSV / Excel"
                onClick={() => { setSource('csv'); setRawText(''); }}
              />
              <SourceTab
                active={source === 'paste'}
                icon={<Clipboard size={14} />}
                label="Pegar de Excel"
                onClick={() => { setSource('paste'); setRawText(''); }}
              />
              <SourceTab
                active={source === 'vision'}
                icon={<Camera size={14} />}
                label="Foto del cuaderno"
                soon
                onClick={() => { setSource('vision'); }}
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {result ? (
            <ImportResult result={result} onClose={onClose} />
          ) : source === 'vision' ? (
            <VisionPlaceholder />
          ) : (
            <>
              {/* Input según fuente */}
              {source === 'csv' && (
                <CsvInput
                  fileName={fileName}
                  onDrop={handleDrop}
                  onFileSelect={handleFileUpload}
                  onPaste={(text) => setRawText(text)}
                />
              )}
              {source === 'paste' && (
                <PasteInput value={rawText} onChange={setRawText} />
              )}

              {/* Preview + stats */}
              {rows.length > 0 && (
                <div className="mt-5">
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <StatPill icon={<Plus size={11} />} label="Crear" value={stats.toCreate} tone="emerald" />
                    <StatPill icon={<Edit3 size={11} />} label="Actualizar" value={stats.toUpdate} tone="amber" />
                    <StatPill icon={<AlertTriangle size={11} />} label="Errores" value={stats.withErrors} tone="rose" />
                    <StatPill icon={<DollarSign size={11} />} label="Saldo total" value={`$${stats.totalSaldo.toFixed(0)}`} tone="indigo" />
                  </div>

                  {/* Tabla preview */}
                  <PreviewTable
                    rows={rows}
                    onToggleAction={toggleAction}
                    onRemove={removeRow}
                    onEdit={setEditingRowIdx}
                    editingIdx={editingRowIdx}
                    onUpdate={updateRow}
                  />
                </div>
              )}

              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-sm text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="shrink-0 px-6 py-3 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-3 bg-slate-50 dark:bg-white/[0.01]">
            <p className="text-xs text-slate-500 dark:text-white/40">
              {loadingExisting ? 'Cargando clientes existentes…' : `${existing.length} clientes existentes (para detectar duplicados)`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/[0.06] hover:bg-slate-300 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white/80 text-xs font-bold uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing || stats.toCreate + stats.toUpdate === 0 || source === 'vision'}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm"
              >
                {importing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    Importar {stats.toCreate + stats.toUpdate} cliente{(stats.toCreate + stats.toUpdate) !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function SourceTab({ active, icon, label, onClick, soon }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void; soon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-semibold transition-all border-b-2 inline-flex items-center gap-1.5 ${
        active
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
      }`}
    >
      {icon}
      {label}
      {soon && (
        <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
          próx
        </span>
      )}
    </button>
  );
}

function CsvInput({ fileName, onDrop, onFileSelect, onPaste }: {
  fileName: string;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (file: File) => void;
  onPaste: (text: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600 dark:text-white/60">
          Sube tu archivo CSV o Excel exportado a CSV.
        </p>
        <button
          onClick={downloadCsvTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-400 text-xs font-bold uppercase tracking-wider transition-all"
        >
          <Download size={12} /> Descargar plantilla
        </button>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="rounded-xl border-2 border-dashed border-slate-300 dark:border-white/[0.12] hover:border-indigo-400 transition-colors p-8 text-center bg-slate-50/50 dark:bg-white/[0.02]"
      >
        <Upload size={32} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-bold text-slate-700 dark:text-white/80 mb-1">
          {fileName || 'Arrastra tu archivo aquí'}
        </p>
        <p className="text-xs text-slate-500 dark:text-white/40 mb-3">
          O selecciónalo manualmente
        </p>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider cursor-pointer">
          <FileSpreadsheet size={13} />
          Elegir archivo
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onFileSelect(f);
            }}
          />
        </label>
      </div>

      <details className="text-xs text-slate-500 dark:text-white/40">
        <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-white/60">
          ¿Qué columnas debe tener el archivo?
        </summary>
        <div className="mt-2 pl-3 space-y-1 leading-relaxed">
          <p><strong>Obligatorias:</strong> <code className="font-mono">nombre</code></p>
          <p><strong>Opcionales:</strong> <code>rif</code>, <code>cedula</code>, <code>telefono</code>, <code>email</code>, <code>direccion</code>, <code>saldo_inicial</code>, <code>dias_atras</code>, <code>nota</code></p>
          <p>El sistema acepta variaciones de nombres (ej: "RIF", "rif", "Razón Social" → razón).</p>
        </div>
      </details>
    </div>
  );
}

function PasteInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-white/60">
        Pega aquí lo que copiaste de Excel, Google Sheets, o un mensaje de WhatsApp.
        El sistema detecta automáticamente el formato.
      </p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`Ejemplos:\n\nExcel pegado:\nJuan Pérez	04141234567	500	90\nMaría González	04167654321	120	15\n\nO texto libre:\nJuan 50, María 30, Carlos 100`}
        className="w-full min-h-[200px] px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 resize-y"
      />
      <p className="text-[11px] text-slate-500 dark:text-white/40">
        💡 Tip: en Excel selecciona las celdas, Ctrl+C, vuelve aquí y Ctrl+V.
      </p>
    </div>
  );
}

function VisionPlaceholder() {
  return (
    <div className="py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mx-auto flex items-center justify-center mb-4 shadow-lg">
        <Camera size={28} className="text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
        Foto del cuaderno con IA
      </h3>
      <p className="text-sm text-slate-600 dark:text-white/60 max-w-md mx-auto mb-4 leading-relaxed">
        Pronto podrás tomar una foto de tu cuaderno físico y nuestra IA extraerá automáticamente nombres, deudas y antigüedad.
      </p>
      <p className="text-xs text-slate-500 dark:text-white/40 max-w-md mx-auto">
        Esta función requiere conexión con Claude Vision. Por ahora usa la pestaña <strong>"Pegar de Excel"</strong> para migrar rápido desde texto.
      </p>
      <div className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold">
        <Sparkles size={12} />
        Disponible próximamente
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number | string; tone: 'emerald' | 'amber' | 'rose' | 'indigo';
}) {
  const colors = {
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400',
    rose: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400',
  };
  return (
    <div className={`px-3 py-2 rounded-lg border ${colors[tone]} flex items-center gap-2`}>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 truncate">{label}</p>
        <p className="text-sm font-black tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function PreviewTable({ rows, onToggleAction, onRemove, onEdit, editingIdx, onUpdate }: {
  rows: ImportRowValidated[];
  onToggleAction: (idx: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number | null) => void;
  editingIdx: number | null;
  onUpdate: (idx: number, patch: Partial<ImportRowValidated>) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-slate-50 dark:bg-white/[0.03]">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 w-10">#</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Estado</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Nombre</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">RIF / Cédula</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Teléfono</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Saldo inicial</th>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Antigüedad</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {rows.map((r, idx) => (
              <PreviewRow
                key={idx}
                row={r}
                idx={idx}
                editing={editingIdx === idx}
                onToggleAction={() => onToggleAction(idx)}
                onRemove={() => onRemove(idx)}
                onEdit={() => onEdit(editingIdx === idx ? null : idx)}
                onUpdate={(patch) => onUpdate(idx, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewRow({ row, idx, editing, onToggleAction, onRemove, onEdit, onUpdate }: {
  row: ImportRowValidated; idx: number; editing: boolean;
  onToggleAction: () => void; onRemove: () => void; onEdit: () => void;
  onUpdate: (patch: Partial<ImportRowValidated>) => void;
}) {
  const hasError = row.errors.length > 0;
  const isWarning = row.warnings.length > 0 && !hasError;
  const isDuplicate = !!row.duplicateOfId;
  const stateColor = hasError
    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20'
    : isDuplicate
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20'
      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
  const actionLabel = row.action === 'create' ? 'Nuevo' : row.action === 'update' ? 'Actualizar' : 'Saltar';

  return (
    <>
      <tr className={hasError ? 'bg-rose-50/30 dark:bg-rose-500/[0.03]' : isDuplicate ? 'bg-amber-50/30 dark:bg-amber-500/[0.03]' : ''}>
        <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
        <td className="px-3 py-2">
          <button
            onClick={onToggleAction}
            disabled={hasError}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${stateColor} ${hasError ? 'cursor-not-allowed opacity-70' : 'hover:opacity-80 cursor-pointer'}`}
            title={hasError ? row.errors.join(', ') : 'Click para cambiar acción'}
          >
            {hasError ? <AlertTriangle size={10} /> : isDuplicate ? <Edit3 size={10} /> : <CheckCircle2 size={10} />}
            {hasError ? 'Error' : actionLabel}
          </button>
        </td>
        <td className="px-3 py-2">
          <p className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{row.nombre}</p>
          {row.warnings.length > 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[200px]" title={row.warnings.join(', ')}>
              ⚠ {row.warnings[0]}
            </p>
          )}
          {row.errors.length > 0 && (
            <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate max-w-[200px]" title={row.errors.join(', ')}>
              ✗ {row.errors[0]}
            </p>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 font-mono">
          {row.rif || row.cedula || '—'}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600 dark:text-white/60 tabular-nums">
          {row.telefono || '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-700 dark:text-white/80">
          {row.saldoInicial && row.saldoInicial > 0 ? `$${row.saldoInicial.toFixed(2)}` : '—'}
        </td>
        <td className="px-3 py-2 text-xs text-slate-500 dark:text-white/40 tabular-nums">
          {row.diasAtras != null && row.diasAtras > 0 ? formatAging(row.diasAtras) : '—'}
        </td>
        <td className="px-2 py-2 text-right">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-400 hover:text-indigo-500"
              title="Editar fila"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={onRemove}
              className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-500/[0.1] text-slate-400 hover:text-rose-500"
              title="Eliminar fila"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="bg-indigo-50/40 dark:bg-indigo-500/[0.04]">
          <td colSpan={8} className="px-4 py-3">
            <RowEditor row={row} onUpdate={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowEditor({ row, onUpdate }: { row: ImportRowValidated; onUpdate: (patch: Partial<ImportRowValidated>) => void }) {
  const inputCls = 'w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1 block';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>Nombre</label>
          <input className={inputCls} value={row.nombre} onChange={e => onUpdate({ nombre: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>RIF</label>
          <input className={inputCls} value={row.rif || ''} onChange={e => onUpdate({ rif: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Cédula</label>
          <input className={inputCls} value={row.cedula || ''} onChange={e => onUpdate({ cedula: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input className={inputCls} value={row.telefono || ''} onChange={e => onUpdate({ telefono: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} value={row.email || ''} onChange={e => onUpdate({ email: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>Dirección</label>
          <input className={inputCls} value={row.direccion || ''} onChange={e => onUpdate({ direccion: e.target.value })} />
        </div>
      </div>

      <div className="pt-2 border-t border-indigo-200 dark:border-indigo-500/20">
        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400 mb-2 flex items-center gap-1">
          <DollarSign size={11} /> Saldo inicial (no cuenta como venta)
        </p>
        <AgingEditor row={row} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function AgingEditor({ row, onUpdate }: { row: ImportRowValidated; onUpdate: (patch: Partial<ImportRowValidated>) => void }) {
  const inputCls = 'w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1 block';
  const aging = row.aging || [];
  const useAging = aging.length > 0;

  const addAgingRow = () => {
    const next = [...aging, { amount: 0, daysAgo: 0 }];
    onUpdate({ aging: next, saldoInicial: 0, diasAtras: 0 });
  };
  const updateAgingRow = (i: number, patch: Partial<{ amount: number; daysAgo: number; nota?: string }>) => {
    const next = [...aging];
    next[i] = { ...next[i], ...patch };
    onUpdate({ aging: next });
  };
  const removeAgingRow = (i: number) => {
    onUpdate({ aging: aging.filter((_, idx) => idx !== i) });
  };

  if (!useAging) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Monto USD</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={row.saldoInicial || ''}
              onChange={e => onUpdate({ saldoInicial: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className={labelCls}>Días atrás</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              value={row.diasAtras || ''}
              onChange={e => onUpdate({ diasAtras: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className={labelCls}>Nota</label>
            <input className={inputCls} value={row.saldoNota || ''} onChange={e => onUpdate({ saldoNota: e.target.value })} placeholder="Origen del saldo" />
          </div>
        </div>
        <button
          type="button"
          onClick={addAgingRow}
          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          title="Dividir el saldo por antigüedad — útil para que la IA de cobranza priorice correctamente desde el día 1"
        >
          <Plus size={10} /> Dividir saldo por antigüedad
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-500 dark:text-white/40">
        Cada tramo crea una factura de saldo inicial separada con su propia fecha. Útil para aging correcto desde el día 1.
      </p>
      {aging.map((t, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <label className={labelCls}>Monto USD</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={t.amount || ''}
              onChange={e => updateAgingRow(i, { amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="col-span-3">
            <label className={labelCls}>Días atrás</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              value={t.daysAgo || ''}
              onChange={e => updateAgingRow(i, { daysAgo: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="col-span-5">
            <label className={labelCls}>Nota (opcional)</label>
            <input
              className={inputCls}
              value={t.nota || ''}
              onChange={e => updateAgingRow(i, { nota: e.target.value })}
              placeholder="Ej: Compra de marzo"
            />
          </div>
          <div className="col-span-1 flex justify-center">
            <button
              type="button"
              onClick={() => removeAgingRow(i)}
              className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-500/[0.1] text-slate-400 hover:text-rose-500"
              title="Eliminar tramo"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addAgingRow}
        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
      >
        <Plus size={10} /> Agregar tramo
      </button>
    </div>
  );
}

function ImportResult({ result, onClose }: { result: BatchImportResult; onClose: () => void }) {
  const total = result.created + result.updated;
  return (
    <div className="py-8 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center mb-4">
        <CheckCircle2 size={40} className="text-emerald-500" />
      </div>
      <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
        ¡Importación completada!
      </h3>
      <p className="text-sm text-slate-600 dark:text-white/60 mb-6">
        Se procesaron <strong className="text-slate-900 dark:text-white tabular-nums">{total}</strong> clientes correctamente.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto mb-6">
        <ResultCell label="Creados" value={result.created} tone="emerald" />
        <ResultCell label="Actualizados" value={result.updated} tone="amber" />
        <ResultCell label="Saltados" value={result.skipped} tone="slate" />
        <ResultCell label="Movimientos" value={result.movementsCreated} tone="indigo" />
      </div>

      {result.errors.length > 0 && (
        <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-left">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300 mb-1">
            {result.errors.length} error{result.errors.length !== 1 ? 'es' : ''} al importar:
          </p>
          <ul className="text-xs text-rose-600 dark:text-rose-400 space-y-0.5 max-h-32 overflow-y-auto">
            {result.errors.map((e, i) => (
              <li key={i}>• Fila {e.row}: {e.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-white/40 mb-4">
        Lote de importación: <code className="font-mono">{result.batchId}</code>
      </p>

      <button
        onClick={onClose}
        className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold uppercase tracking-wider"
      >
        Cerrar
      </button>
    </div>
  );
}

function ResultCell({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' | 'indigo' }) {
  const colors = {
    emerald: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
    slate: 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-white/60',
    indigo: 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  };
  return (
    <div className={`px-4 py-3 rounded-lg border ${colors[tone]}`}>
      <p className="text-3xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-80 mt-0.5">{label}</p>
    </div>
  );
}
