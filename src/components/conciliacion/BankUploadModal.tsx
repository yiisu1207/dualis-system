import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BANK_PROFILES, GENERIC_PROFILE, type BankStatementProfile } from '../../data/bankStatementFormats';
import { parseBankStatement, slugifyAlias, type ParseResult } from '../../utils/bankStatementParser';
import type { BankRow } from '../../utils/bankReconciliation';

interface BankUploadModalProps {
  existingAliases: string[];
  onClose: () => void;
  onConfirm: (data: {
    accountAlias: string;
    accountLabel: string;
    bankCode?: string;
    bankName?: string;
    amountTolerancePct?: number;
    sourceFilename: string;
    rows: BankRow[];
  }) => Promise<void>;
}

export default function BankUploadModal({ existingAliases, onClose, onConfirm }: BankUploadModalProps) {
  const [alias, setAlias] = useState('');
  const [bankCode, setBankCode] = useState<string>('');
  const [tolerancePct, setTolerancePct] = useState<string>('0');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [includeDebits, setIncludeDebits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedProfile: BankStatementProfile | undefined =
    bankCode ? BANK_PROFILES.find(p => p.bankCode === bankCode) : undefined;

  const slug = slugifyAlias(alias);
  const isDuplicate = !!slug && existingAliases.includes(slug);

  const doParse = useCallback(async (f: File) => {
    setError(null);
    setParsing(true);
    setResult(null);
    try {
      const res = await parseBankStatement(f, {
        accountAlias: slug || 'pending',
        accountLabel: alias || f.name,
        accountBankCode: bankCode || undefined,
        profile: selectedProfile || (bankCode === 'generico' ? GENERIC_PROFILE : undefined),
        amountTolerancePct: parseFloat(tolerancePct) / 100 || 0,
        includeDebits,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setParsing(false);
    }
  }, [alias, slug, bankCode, selectedProfile, tolerancePct, includeDebits]);

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    if (f) doParse(f);
  }, [doParse]);

  const handleConfirm = async () => {
    if (!file || !result || !alias.trim() || !result.rows.length) return;
    if (isDuplicate) {
      if (!confirm(`Ya existe una cuenta "${alias}" este mes. ¿Reemplazarla?`)) return;
    }
    setSaving(true);
    try {
      const profile = result.detectedProfile;
      await onConfirm({
        accountAlias: slug,
        accountLabel: alias.trim(),
        bankCode: bankCode || profile?.bankCode,
        bankName: profile?.bankName,
        amountTolerancePct: parseFloat(tolerancePct) / 100 || 0,
        sourceFilename: file.name,
        rows: result.rows,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const canConfirm = !!(file && result && result.rows.length > 0 && alias.trim() && !saving);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Agregar estado de cuenta</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Alias de la cuenta *</span>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej: Banesco Principal"
                className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
              {isDuplicate && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 block">⚠ Ya existe una cuenta con este alias — se reemplazará.</span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Banco</span>
              <select
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              >
                <option value="">Auto-detectar</option>
                {BANK_PROFILES.map(p => (
                  <option key={p.bankCode} value={p.bankCode}>{p.bankName}</option>
                ))}
                <option value="generico">Genérico / Otro</option>
              </select>
            </label>
          </div>

          <details className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200 px-4 py-2">
              Avanzado: tolerancia de monto e inclusión de débitos
            </summary>
            <div className="px-4 pb-4 pt-2 space-y-3">
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-300">Tolerancia de monto (%)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={tolerancePct}
                  onChange={(e) => setTolerancePct(e.target.value)}
                  className="w-32 mt-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 rounded text-sm"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                  0% = exacto (±$0.01). Usa 0.5% solo para cuentas Bs con redondeos de tasa.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeDebits} onChange={(e) => setIncludeDebits(e.target.checked)} />
                <span>Incluir débitos (salidas) — por default solo créditos (abonos recibidos)</span>
              </label>
            </div>
          </details>

          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
            <Upload size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600"
            >
              Seleccionar archivo CSV / Excel
            </button>
            {file && (
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                📎 {file.name} <span className="text-slate-400 dark:text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 size={16} className="animate-spin" /> Parseando archivo...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700/50 text-rose-800 dark:text-rose-300 rounded-lg p-3 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {result && result.rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300 rounded-lg p-3 text-sm">
                <CheckCircle2 size={16} />
                <span>
                  <strong>{result.rows.length}</strong> filas parseadas
                  {result.detectedProfile && ` — detectado: ${result.detectedProfile.bankName}`}
                  {result.warnings.length > 0 && ` · ${result.warnings.length} warnings`}
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Preview (primeras 10 filas):</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 dark:text-slate-400 text-left">
                      <th className="pb-1">Fecha</th>
                      <th className="pb-1">Monto</th>
                      <th className="pb-1">Ref</th>
                      <th className="pb-1">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 10).map(r => (
                      <tr key={r.rowId} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="py-1">{r.date}</td>
                        <td className="py-1 font-mono">${r.amount.toFixed(2)}</td>
                        <td className="py-1 font-mono text-slate-500 dark:text-slate-400">{r.reference || '—'}</td>
                        <td className="py-1 text-slate-600 dark:text-slate-300 truncate max-w-xs">{r.description || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.warnings.length > 0 && (
                <details className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3">
                  <summary className="cursor-pointer font-medium">
                    {result.warnings.length} warnings del parser
                  </summary>
                  <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.warnings.slice(0, 50).map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {result && result.needsManualMapping && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-300 rounded-lg p-3 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                El parser no pudo mapear bien este archivo. Verifica que hayas elegido el banco correcto,
                o prueba con el perfil Genérico. El mapeo manual por columna no está disponible en v1.
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}
