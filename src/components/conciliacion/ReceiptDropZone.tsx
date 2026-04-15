import React, { useCallback, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';

interface ReceiptDropZoneProps {
  disabled?: boolean;
  progress?: { done: number; total: number } | null;
  onDropSingle: (file: File) => void;       // 1 imagen → llena form
  onDropBatch: (files: File[]) => void;     // N imágenes → modal batch
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BATCH = 20;
const ACCEPTED = /^image\/(png|jpeg|jpg|webp)$/i;

export default function ReceiptDropZone({ disabled, progress, onDropSingle, onDropBatch }: ReceiptDropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    const arr = Array.from(files);
    if (!arr.length) return;

    const valid: File[] = [];
    for (const f of arr) {
      if (!ACCEPTED.test(f.type)) {
        setError(`"${f.name}" tipo no soportado (solo PNG/JPG/WEBP)`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" excede 5 MB`);
        continue;
      }
      valid.push(f);
      if (valid.length >= MAX_BATCH) break;
    }

    if (!valid.length) return;
    if (valid.length === 1) onDropSingle(valid[0]);
    else onDropBatch(valid);
  }, [onDropSingle, onDropBatch]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  }, [handleFiles]);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); if (!disabled) setDragActive(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
        disabled
          ? 'bg-slate-50 border-slate-200 opacity-60'
          : dragActive
            ? 'bg-indigo-50 border-indigo-400'
            : 'bg-white border-slate-300 hover:border-indigo-300'
      }`}
    >
      {progress && progress.total > 0 ? (
        <div className="flex items-center justify-center gap-2 text-sm text-indigo-700">
          <Loader2 size={16} className="animate-spin" />
          Procesando {progress.done}/{progress.total}...
        </div>
      ) : (
        <>
          <ImageIcon size={24} className="mx-auto text-slate-400 mb-2" />
          <div className="text-sm font-medium text-slate-700">
            Arrastra capturas de comprobantes aquí
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            1 imagen → llena el form · varias → cola de revisión · máx 5MB c/u
          </div>
          <label className="mt-2 inline-block">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={onPickFiles}
              disabled={disabled}
            />
            <span className="text-xs text-indigo-600 cursor-pointer hover:underline">
              o haz clic para seleccionar
            </span>
          </label>
        </>
      )}
      {error && (
        <div className="mt-2 text-xs text-rose-600">{error}</div>
      )}
    </div>
  );
}
