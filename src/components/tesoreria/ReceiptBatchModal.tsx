import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Upload, Loader2, ArrowRight, ArrowLeft, Plus, Trash2, ImageIcon,
  CheckCircle2, AlertTriangle, XCircle, Calendar,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  processReceiptBatch,
  type BatchItemDraft,
  type ImageBatchItem,
  type ManualBatchItem,
  type ProcessingResult,
} from '../../utils/processReceiptBatch';
import type { BusinessBankAccount } from '../../../types';

interface ReceiptBatchModalProps {
  businessId: string;
  currentUserId: string;
  currentUserName?: string;
  onClose: () => void;
  onCreated?: (batchId: string) => void;
}

const MAX_ITEMS = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageItem = ImageBatchItem;
type ManualItem = ManualBatchItem;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReceiptBatchModal({
  businessId,
  currentUserId,
  currentUserName,
  onClose,
  onCreated,
}: ReceiptBatchModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: metadata
  const [name, setName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [businessAccounts, setBusinessAccounts] = useState<BusinessBankAccount[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]); // empty = todas

  // Step 2: items
  const [items, setItems] = useState<BatchItemDraft[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3: processing
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [processing, setProcessing] = useState(false);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);

  // Cargar BusinessBankAccount
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      collection(db, `businesses/${businessId}/bankAccounts`),
      (snap) => {
        const list: BusinessBankAccount[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setBusinessAccounts(list.filter(a => a.enabled !== false));
      },
    );
    return () => unsub();
  }, [businessId]);

  const addImageFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setItems(prev => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_ITEMS) break;
        if (!f.type.startsWith('image/')) continue;
        if (f.size > MAX_IMAGE_BYTES) continue;
        next.push({ id: newId('img'), kind: 'image', file: f });
      }
      return next;
    });
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const startProcessing = useCallback(async () => {
    setStep(3);
    setProcessing(true);
    setProgress({ done: 0, total: items.length });
    try {
      const outcome = await processReceiptBatch({
        db,
        businessId,
        name,
        periodFrom: periodFrom || undefined,
        periodTo: periodTo || undefined,
        accountIds: accountIds.length ? accountIds : undefined,
        currentUserId,
        currentUserName,
        items,
        onProgress: (done, total) => setProgress({ done, total }),
        onResultsChange: (next) => setResults(next),
        onBatchCreated: (id) => setCreatedBatchId(id),
      });
      onCreated?.(outcome.batchId);
    } finally {
      setProcessing(false);
    }
  }, [items, name, periodFrom, periodTo, accountIds, businessId, currentUserId, currentUserName, onCreated]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const canStep2 = name.trim().length >= 3 && name.trim().length <= 40;
  const canProcess = items.length > 0 && items.every(i => i.kind === 'image' || (i.kind === 'manual' && i.amount > 0 && i.date && i.reference && i.bankAccountId));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Nuevo lote de capturas</h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <Step n={1} active={step === 1} done={step > 1} label="Metadata" />
              <ArrowRight size={12} />
              <Step n={2} active={step === 2} done={step > 2} label="Capturas" />
              <ArrowRight size={12} />
              <Step n={3} active={step === 3} done={false} label="Procesamiento" />
            </div>
          </div>
          <button onClick={onClose} disabled={processing} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {step === 1 && (
            <Step1Metadata
              name={name} setName={setName}
              periodFrom={periodFrom} setPeriodFrom={setPeriodFrom}
              periodTo={periodTo} setPeriodTo={setPeriodTo}
              accounts={businessAccounts} accountIds={accountIds} setAccountIds={setAccountIds}
            />
          )}

          {step === 2 && (
            <Step2Items
              items={items}
              addImageFiles={addImageFiles}
              removeItem={removeItem}
              fileRef={fileRef}
              manualOpen={manualOpen}
              setManualOpen={setManualOpen}
              accounts={businessAccounts}
              setItems={setItems}
            />
          )}

          {step === 3 && (
            <Step3Processing
              progress={progress}
              results={results}
              processing={processing}
              batchId={createdBatchId}
            />
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => step > 1 && step < 3 ? setStep((step - 1) as 1 | 2) : onClose()}
            disabled={processing}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 inline-flex items-center gap-1"
          >
            {step === 1 || step === 3 ? 'Cerrar' : <><ArrowLeft size={14} /> Atrás</>}
          </button>
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              disabled={!canStep2}
              className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Siguiente <ArrowRight size={14} className="inline ml-1" />
            </button>
          )}
          {step === 2 && (
            <button
              onClick={startProcessing}
              disabled={!canProcess}
              className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Procesar {items.length} item{items.length === 1 ? '' : 's'} <ArrowRight size={14} className="inline ml-1" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function Step({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${active ? 'text-indigo-600 dark:text-indigo-300 font-semibold' : done ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-300 dark:bg-slate-600 text-white'}`}>
        {done ? '✓' : n}
      </span>
      {label}
    </span>
  );
}

function Step1Metadata({
  name, setName, periodFrom, setPeriodFrom, periodTo, setPeriodTo,
  accounts, accountIds, setAccountIds,
}: any) {
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre del lote *</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          minLength={3}
          placeholder="Ej: Quincena 15-abr"
          className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm"
        />
        <div className="text-xs text-slate-400 mt-1">3–40 caracteres</div>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Período desde (opcional)</span>
          <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Período hasta (opcional)</span>
          <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm" />
        </label>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 -mt-3">
        Si seteas el período, el matching solo busca filas dentro de ese rango.
      </div>

      <div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cuentas a considerar</span>
        <div className="text-xs text-slate-400 mb-2">Por default: todas las cuentas activas</div>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2">
          {accounts.map((a: BusinessBankAccount) => (
            <label key={a.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={accountIds.includes(a.id)}
                onChange={(e) => {
                  setAccountIds((prev: string[]) => e.target.checked ? [...prev, a.id] : prev.filter((x: string) => x !== a.id));
                }}
              />
              <span>{a.bankName} · {(a.accountNumber || '').slice(-4)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step2Items({ items, addImageFiles, removeItem, fileRef, manualOpen, setManualOpen, accounts, setItems }: any) {
  const imageCount = items.filter((i: BatchItemDraft) => i.kind === 'image').length;
  const manualCount = items.filter((i: BatchItemDraft) => i.kind === 'manual').length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {imageCount} captura{imageCount === 1 ? '' : 's'} + {manualCount} manual{manualCount === 1 ? '' : 'es'} = <strong>{items.length}/{MAX_ITEMS}</strong>
        </div>
        <button
          onClick={() => setManualOpen(true)}
          disabled={items.length >= MAX_ITEMS}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
        >
          <Plus size={12} /> Agregar manual sin imagen
        </button>
      </div>

      <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center">
        <Upload size={28} className="mx-auto text-slate-400 mb-2" />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => addImageFiles(e.target.files || [])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={items.length >= MAX_ITEMS}
          className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          Seleccionar capturas
        </button>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">PNG/JPG/WEBP · máx 5 MB c/u</p>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((it: BatchItemDraft) => (
            <div key={it.id} className="relative bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs">
              <button
                onClick={() => removeItem(it.id)}
                className="absolute top-1 right-1 p-1 rounded bg-white dark:bg-slate-800 text-rose-500 hover:bg-rose-50"
              >
                <Trash2 size={10} />
              </button>
              {it.kind === 'image' ? (
                <>
                  <ImageIcon size={20} className="text-slate-400 mb-1" />
                  <div className="truncate text-slate-700 dark:text-slate-200" title={it.file.name}>{it.file.name}</div>
                  <div className="text-slate-400">{(it.file.size / 1024).toFixed(0)} KB</div>
                </>
              ) : (
                <>
                  <Calendar size={20} className="text-amber-500 mb-1" />
                  <div className="text-slate-700 dark:text-slate-200">${it.amount.toFixed(2)}</div>
                  <div className="text-slate-400 truncate">Ref {it.reference}</div>
                  <div className="text-slate-400">{it.date}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {manualOpen && (
        <ManualEntryForm
          accounts={accounts}
          onClose={() => setManualOpen(false)}
          onAdd={(m: ManualItem) => { setItems((prev: BatchItemDraft[]) => [...prev, m]); setManualOpen(false); }}
        />
      )}
    </div>
  );
}

function ManualEntryForm({ accounts, onClose, onAdd }: { accounts: BusinessBankAccount[]; onClose: () => void; onAdd: (m: ManualItem) => void }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [cedula, setCedula] = useState('');
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!date || !reference.trim() || !bankAccountId) return;
    onAdd({
      id: newId('man'), kind: 'manual',
      amount: amt, date, reference: reference.trim(), bankAccountId,
      cedula: cedula.trim() || undefined,
      clientName: clientName.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pago sin captura</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>
            <span className="text-slate-600 dark:text-slate-300">Monto USD *</span>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
          </label>
          <label>
            <span className="text-slate-600 dark:text-slate-300">Fecha *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
          </label>
          <label className="col-span-2">
            <span className="text-slate-600 dark:text-slate-300">Referencia *</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="123456"
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded font-mono" />
          </label>
          <label className="col-span-2">
            <span className="text-slate-600 dark:text-slate-300">Cuenta destino *</span>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded">
              <option value="">— elegir —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.bankName} · {(a.accountNumber || '').slice(-4)}</option>)}
            </select>
          </label>
          <label>
            <span className="text-slate-600 dark:text-slate-300">Cédula</span>
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="V-12345678"
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
          </label>
          <label>
            <span className="text-slate-600 dark:text-slate-300">Cliente</span>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
          </label>
          <label className="col-span-2">
            <span className="text-slate-600 dark:text-slate-300">Nota</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">Cancelar</button>
          <button onClick={submit} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded">Agregar</button>
        </div>
      </div>
    </div>
  );
}

function Step3Processing({ progress, results, processing, batchId }: any) {
  const confirmed = results.filter((r: ProcessingResult) => r.abono?.status === 'confirmado').length;
  const review = results.filter((r: ProcessingResult) => r.abono?.status === 'revisar').length;
  const notFound = results.filter((r: ProcessingResult) => r.abono?.status === 'no_encontrado').length;
  const errors = results.filter((r: ProcessingResult) => r.status === 'error').length;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
          <span>Procesando {progress.done}/{progress.total}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center">
        <Stat color="emerald" icon={<CheckCircle2 size={14} />} label="Confirmados" value={confirmed} />
        <Stat color="amber" icon={<AlertTriangle size={14} />} label="Revisar" value={review} />
        <Stat color="rose" icon={<XCircle size={14} />} label="No encontrado" value={notFound} />
        <Stat color="slate" icon={<X size={14} />} label="Errores" value={errors} />
      </div>

      <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
        {results.map((r: ProcessingResult, i: number) => (
          <div key={i} className="px-3 py-2 text-xs flex items-center gap-2">
            <span className="w-5 text-center">
              {r.status === 'pending' && '·'}
              {r.status === 'processing' && <Loader2 size={12} className="animate-spin text-indigo-500" />}
              {r.status === 'done' && r.abono?.status === 'confirmado' && <CheckCircle2 size={12} className="text-emerald-500" />}
              {r.status === 'done' && r.abono?.status === 'revisar' && <AlertTriangle size={12} className="text-amber-500" />}
              {r.status === 'done' && r.abono?.status === 'no_encontrado' && <XCircle size={12} className="text-rose-500" />}
              {r.status === 'error' && <X size={12} className="text-rose-500" />}
            </span>
            <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
              {r.draft.kind === 'image' ? r.draft.file.name : `Manual · Ref ${r.draft.reference} · $${r.draft.amount.toFixed(2)}`}
            </span>
            {r.abono && (
              <span className="text-slate-400 font-mono">{r.abono.amount.toFixed(2)} · {r.abono.reference || '—'}</span>
            )}
            {r.errorMsg && <span className="text-rose-500 truncate max-w-[200px]" title={r.errorMsg}>{r.errorMsg}</span>}
          </div>
        ))}
      </div>

      {!processing && batchId && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300 rounded-lg p-3 text-sm">
          Lote procesado. Cierra este modal y abre el lote desde la tab "Lotes" para revisar los pendientes.
        </div>
      )}
    </div>
  );
}

function Stat({ color, icon, label, value }: { color: string; icon: React.ReactNode; label: string; value: number }) {
  const cls: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/50',
    rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/50',
    slate: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <div className={`border rounded-lg p-2 ${cls[color] || cls.slate}`}>
      <div className="flex items-center justify-center gap-1 text-xs">{icon}<span>{label}</span></div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
