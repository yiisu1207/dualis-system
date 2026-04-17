import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2, Trash2, FileText } from 'lucide-react';
import { Timestamp, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { BANK_PROFILES, GENERIC_PROFILE, type BankStatementProfile } from '../../data/bankStatementFormats';
import { parseBankStatement, slugifyAlias, type ParseResult } from '../../utils/bankStatementParser';
import { extractStatementMeta, autoMapToBusinessAccount } from '../../utils/bankStatementMeta';
import type { BankRow } from '../../utils/bankReconciliation';
import type { BusinessBankAccount, BankStatementExtractedMeta } from '../../../types';

interface MultiBankUploadModalProps {
  businessId: string;
  monthKey: string;            // default monthKey si no hay periodo extraído
  uploadedByUid: string;
  existingAliases: string[];   // de la month actual (info para reemplazo)
  onClose: () => void;
  onDone?: () => void;
}

interface FileEntry {
  id: string;
  file: File;
  status: 'parsing' | 'parsed' | 'error' | 'saving' | 'saved';
  parseResult?: ParseResult;
  meta?: BankStatementExtractedMeta;
  detectedProfile?: BankStatementProfile;
  detectedBankCode?: string;
  alias: string;               // editable por el usuario
  bankAccountId?: string;      // auto-mapped o seleccionado manualmente
  amountTolerancePct: number;
  errorMsg?: string;
  monthKey?: string;           // YYYY-MM derivado del período si existe
  fileUrl?: string;
}

const MAX_FILES = 10;
const MAX_SIZE_MB = 15;

function newId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function deriveMonthKey(meta?: BankStatementExtractedMeta, fallback?: string): string {
  // Prefer periodFrom; fallback monthKey actual
  const iso = meta?.periodFrom || meta?.periodTo;
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
  return fallback || new Date().toISOString().slice(0, 7);
}

function deriveAlias(meta: BankStatementExtractedMeta | undefined, profile: BankStatementProfile | undefined, file: File): string {
  // Si meta tiene cuenta, usa últimos 4 dígitos + nombre del banco
  if (meta?.accountNumber && profile?.bankName) {
    const last4 = meta.accountNumber.slice(-4);
    return slugifyAlias(`${profile.bankName} ${last4}`);
  }
  if (profile?.bankName) return slugifyAlias(`${profile.bankName} ${file.name.replace(/\.[^.]+$/, '').slice(0, 12)}`);
  return slugifyAlias(file.name.replace(/\.[^.]+$/, '').slice(0, 24));
}

export default function MultiBankUploadModal({
  businessId,
  monthKey: defaultMonthKey,
  uploadedByUid,
  existingAliases,
  onClose,
  onDone,
}: MultiBankUploadModalProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [businessAccounts, setBusinessAccounts] = useState<BusinessBankAccount[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cargar BusinessBankAccount del negocio (para auto-mapeo)
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      collection(db, `businesses/${businessId}/bankAccounts`),
      (snap) => {
        const list: BusinessBankAccount[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setBusinessAccounts(list.filter(a => a.enabled !== false));
      },
      (err) => console.error('[MultiBankUpload] bankAccounts', err),
    );
    return () => unsub();
  }, [businessId]);

  const processFile = useCallback(async (entry: FileEntry) => {
    try {
      const res = await parseBankStatement(entry.file, {
        accountAlias: entry.alias || 'pending',
        accountLabel: entry.alias || entry.file.name,
        accountBankCode: entry.detectedBankCode,
        amountTolerancePct: entry.amountTolerancePct,
        includeDebits: false,
      });
      const profile = res.detectedProfile || GENERIC_PROFILE;
      const meta = res.rawText ? extractStatementMeta(res.rawText, profile) : {};
      const mapped = autoMapToBusinessAccount(meta, businessAccounts, profile.bankCode);
      const monthKey = deriveMonthKey(meta, defaultMonthKey);
      const alias = mapped
        ? slugifyAlias(`${profile.bankName} ${(mapped.accountNumber || '').slice(-4)}`)
        : deriveAlias(meta, profile, entry.file);

      setEntries(prev => prev.map(e => e.id === entry.id ? {
        ...e,
        status: 'parsed',
        parseResult: res,
        meta,
        detectedProfile: profile,
        detectedBankCode: profile.bankCode,
        alias,
        bankAccountId: mapped?.id,
        monthKey,
        errorMsg: res.rows.length === 0 ? (res.warnings[0] || 'Sin filas parseadas') : undefined,
      } : e));
    } catch (e: any) {
      setEntries(prev => prev.map(en => en.id === entry.id ? {
        ...en,
        status: 'error',
        errorMsg: e?.message || String(e),
      } : en));
    }
  }, [businessAccounts, defaultMonthKey]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    setGlobalError(null);
    const list: FileEntry[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (entries.length + list.length >= MAX_FILES) {
        setGlobalError(`Máximo ${MAX_FILES} archivos por upload.`);
        break;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        setGlobalError(`"${f.name}" excede ${MAX_SIZE_MB} MB.`);
        continue;
      }
      list.push({
        id: newId(),
        file: f,
        status: 'parsing',
        alias: slugifyAlias(f.name.replace(/\.[^.]+$/, '').slice(0, 24)),
        amountTolerancePct: 0,
      });
    }
    if (list.length) {
      setEntries(prev => [...prev, ...list]);
      list.forEach(e => processFile(e));
    }
    if (fileRef.current) fileRef.current.value = '';
  }, [entries.length, processFile]);

  const updateEntry = (id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const reparse = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    updateEntry(id, { status: 'parsing', parseResult: undefined, errorMsg: undefined });
    processFile({ ...entry, status: 'parsing' });
  };

  const saveOne = async (entry: FileEntry): Promise<void> => {
    if (!entry.parseResult || !entry.parseResult.rows.length) return;
    if (!entry.alias.trim()) throw new Error('Alias requerido');

    const monthKey = entry.monthKey || defaultMonthKey;
    const totalCredit = entry.parseResult.rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const totalDebit = entry.parseResult.rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);

    // Subir PDF a Storage
    let fileUrl: string | undefined;
    try {
      const path = `bankStatements/${businessId}/${monthKey}/${entry.alias}/${entry.file.name}`;
      const sref = storageRef(storage, path);
      await uploadBytes(sref, entry.file);
      fileUrl = await getDownloadURL(sref);
    } catch (e) {
      console.warn('[MultiBankUpload] storage upload failed; saving without fileUrl', e);
    }

    const profile = entry.detectedProfile;
    // Inyectar bankAccountId + monthKey en cada fila para anti-reuso cross-cuenta
    const rows: BankRow[] = entry.parseResult.rows.map(r => ({
      ...r,
      bankAccountId: entry.bankAccountId,
      monthKey,
      matched: false,
      matchedAbonoId: undefined,
    }));

    const mappedAccount = entry.bankAccountId
      ? businessAccounts.find(a => a.id === entry.bankAccountId)
      : undefined;
    const accountLabel = mappedAccount
      ? `${mappedAccount.bankName} ${(mappedAccount.accountNumber || '').slice(-4)}`
      : entry.alias;

    const payload: any = {
      accountAlias: entry.alias,
      accountLabel,
      bankCode: entry.bankAccountId ? mappedAccount?.bankCode : profile?.bankCode,
      bankName: entry.bankAccountId ? mappedAccount?.bankName : profile?.bankName,
      bankAccountId: entry.bankAccountId,
      amountTolerancePct: entry.amountTolerancePct,
      sourceFilename: entry.file.name,
      fileUrl,
      uploadedAt: Timestamp.now(),
      uploadedBy: uploadedByUid,
      rows,
      rowCount: rows.length,
      totalCredit,
      totalDebit,
      extractedMeta: entry.meta || undefined,
    };
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) if (v !== undefined) clean[k] = v;

    const ref = doc(db, `businesses/${businessId}/bankStatements/${monthKey}/accounts/${entry.alias}`);
    await setDoc(ref, clean);
  };

  const handleSaveAll = async () => {
    const ready = entries.filter(e => e.status === 'parsed' && (e.parseResult?.rows.length || 0) > 0 && !!e.bankAccountId);
    if (!ready.length) {
      setGlobalError('Mapea al menos una cuenta Dualis y asegúrate de que tengan filas parseadas.');
      return;
    }
    setSavingAll(true);
    setGlobalError(null);
    try {
      for (const entry of ready) {
        updateEntry(entry.id, { status: 'saving' });
        try {
          await saveOne(entry);
          updateEntry(entry.id, { status: 'saved' });
        } catch (e: any) {
          updateEntry(entry.id, { status: 'error', errorMsg: e?.message || String(e) });
        }
      }
      onDone?.();
    } finally {
      setSavingAll(false);
    }
  };

  const allSaved = entries.length > 0 && entries.every(e => e.status === 'saved');
  const someReady = entries.some(e => e.status === 'parsed' && !!e.bankAccountId);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Subir estados de cuenta (multi)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hasta {MAX_FILES} archivos · {MAX_SIZE_MB} MB c/u · PDF nativo del banco recomendado
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center">
            <Upload size={28} className="mx-auto text-slate-400 dark:text-slate-500 mb-2" />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv,.xlsx,.xls"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={entries.length >= MAX_FILES}
              className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Seleccionar archivos
            </button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {entries.length}/{MAX_FILES} cargados
            </p>
          </div>

          {globalError && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700/50 text-rose-800 dark:text-rose-300 rounded-lg p-3 text-sm">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {globalError}
            </div>
          )}

          {entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left py-2">Archivo</th>
                    <th className="text-left py-2">Banco / Período</th>
                    <th className="text-left py-2">Titular / Cuenta detectada</th>
                    <th className="text-left py-2">Cuenta Dualis</th>
                    <th className="text-left py-2">Alias</th>
                    <th className="text-right py-2">Filas</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className="border-b border-slate-100 dark:border-slate-700 align-top">
                      <td className="py-3">
                        <div className="flex items-start gap-2">
                          <FileText size={14} className="text-slate-400 mt-0.5" />
                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]" title={e.file.name}>
                              {e.file.name}
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              {(e.file.size / 1024).toFixed(0)} KB
                              {e.status === 'parsing' && <> · <Loader2 size={10} className="inline animate-spin" /> parseando</>}
                              {e.status === 'saving' && <> · guardando…</>}
                              {e.status === 'saved' && <> · <CheckCircle2 size={10} className="inline text-emerald-500" /> guardado</>}
                              {e.status === 'error' && <span className="text-rose-500"> · error</span>}
                            </div>
                            {e.errorMsg && (
                              <div className="text-rose-500 text-[11px] mt-1">{e.errorMsg}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="text-slate-700 dark:text-slate-200">
                          {e.detectedProfile?.bankName || '—'}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {e.meta?.periodFrom && e.meta?.periodTo ? `${e.meta.periodFrom} → ${e.meta.periodTo}` : (e.monthKey || '—')}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="text-slate-700 dark:text-slate-200 truncate max-w-[180px]" title={e.meta?.holderName}>
                          {e.meta?.holderName || '—'}
                        </div>
                        <div className="text-slate-400 text-[11px] font-mono">
                          {e.meta?.accountNumber || '—'}
                        </div>
                      </td>
                      <td className="py-3">
                        <select
                          value={e.bankAccountId || ''}
                          onChange={(ev) => updateEntry(e.id, { bankAccountId: ev.target.value || undefined })}
                          className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded text-xs"
                        >
                          <option value="">— elegir —</option>
                          {businessAccounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.bankName} · {(a.accountNumber || '').slice(-4)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        <input
                          type="text"
                          value={e.alias}
                          onChange={(ev) => updateEntry(e.id, { alias: slugifyAlias(ev.target.value) })}
                          className="w-32 px-2 py-1 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded text-xs font-mono"
                        />
                        {existingAliases.includes(e.alias) && (
                          <div className="text-amber-500 text-[10px] mt-0.5">⚠ reemplaza</div>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-700 dark:text-slate-200">
                        {e.parseResult?.rows.length ?? 0}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {e.status === 'error' && (
                            <button
                              onClick={() => reparse(e.id)}
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Reintentar
                            </button>
                          )}
                          <button
                            onClick={() => removeEntry(e.id)}
                            disabled={e.status === 'saving'}
                            className="text-slate-400 hover:text-rose-500 disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {entries.filter(e => e.status === 'saved').length} guardados · {entries.filter(e => !!e.bankAccountId && e.status === 'parsed').length} listos para guardar
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
              {allSaved ? 'Cerrar' : 'Cancelar'}
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!someReady || savingAll}
              className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              {savingAll ? <><Loader2 size={14} className="inline animate-spin mr-1" /> Guardando…</> : 'Guardar todos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
