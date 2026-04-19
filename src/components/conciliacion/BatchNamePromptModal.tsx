import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, ImageIcon, Plus, Trash2 } from 'lucide-react';

interface BatchNamePromptModalProps {
  files: File[];
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (name: string, files: File[]) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BATCH = 20;
const ACCEPTED = /^image\/(png|jpeg|jpg|webp)$/i;

function fileKey(f: File): string {
  return `${f.name}_${f.size}_${f.lastModified}`;
}

export default function BatchNamePromptModal({ files: initialFiles, defaultName, onCancel, onConfirm }: BatchNamePromptModalProps) {
  const [name, setName] = useState(defaultName || '');
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const previews = useMemo(
    () => files.map(f => ({ file: f, url: URL.createObjectURL(f) })),
    [files],
  );
  useEffect(() => {
    return () => { previews.forEach(p => URL.revokeObjectURL(p.url)); };
  }, [previews]);

  const trimmed = name.trim();
  const validName = trimmed.length >= 3 && trimmed.length <= 40;
  const canSubmit = validName && files.length > 0 && !submitting;

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setWarning(null);
    const arr = Array.from(incoming);
    if (!arr.length) return;
    const existing = new Set(files.map(fileKey));
    const accepted: File[] = [];
    const rejected: string[] = [];
    let dupCount = 0;
    for (const f of arr) {
      if (!ACCEPTED.test(f.type)) { rejected.push(`${f.name}: tipo no soportado`); continue; }
      if (f.size > MAX_BYTES) { rejected.push(`${f.name}: > 5 MB`); continue; }
      const k = fileKey(f);
      if (existing.has(k)) { dupCount++; continue; }
      existing.add(k);
      accepted.push(f);
    }
    const room = MAX_BATCH - files.length;
    const toAdd = accepted.slice(0, Math.max(0, room));
    if (accepted.length > toAdd.length) {
      rejected.push(`${accepted.length - toAdd.length} excede el tope de ${MAX_BATCH}`);
    }
    if (dupCount) rejected.push(`${dupCount} duplicada(s) ignorada(s)`);
    if (rejected.length) setWarning(rejected.join(' · '));
    if (toAdd.length) setFiles(prev => [...prev, ...toAdd]);
  }, [files]);

  const removeAt = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (submitting) return;
    addFiles(e.dataTransfer.files);
  }, [submitting, addFiles]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }, [addFiles]);

  const submit = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    onConfirm(trimmed, files);
  };

  const atCap = files.length >= MAX_BATCH;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Nombre del lote</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <ImageIcon size={12} /> {files.length} / {MAX_BATCH} captura{files.length === 1 ? '' : 's'} listas para procesar
            </div>
          </div>
          <button onClick={onCancel} disabled={submitting} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Etiqueta del lote *</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Ej: Quincena 15-abr"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              disabled={submitting}
            />
            <div className="text-xs text-slate-400 mt-1">3–40 caracteres · pulsa Enter para procesar</div>
          </label>

          <div
            onDragEnter={(e) => { e.preventDefault(); if (!submitting && !atCap) setDragActive(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
              submitting || atCap
                ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 opacity-60'
                : dragActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500'
                  : 'bg-white dark:bg-slate-900/40 border-slate-300 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500'
            }`}
          >
            <Plus size={18} className="mx-auto text-slate-400 dark:text-slate-500 mb-1" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {atCap ? `Tope de ${MAX_BATCH} alcanzado` : 'Arrastra más capturas aquí o '}
              {!atCap && (
                <label className="inline-block">
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onPickFiles} disabled={submitting} />
                  <span className="text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">selecciona archivos</span>
                </label>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">PNG/JPG/WEBP · máx 5 MB c/u</div>
            {warning && <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">{warning}</div>}
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {previews.map((p, i) => (
                <div key={i} className="relative group rounded border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900">
                  <img src={p.url} alt={p.file.name} className="w-full h-16 object-cover" />
                  <button
                    onClick={() => removeAt(i)}
                    disabled={submitting}
                    title="Quitar"
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600 disabled:opacity-30"
                  >
                    <Trash2 size={10} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1">{p.file.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onCancel} disabled={submitting} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Procesar lote ({files.length})
          </button>
        </div>
      </div>
    </div>
  );
}
