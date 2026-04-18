import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, ImageIcon } from 'lucide-react';

interface BatchNamePromptModalProps {
  files: File[];
  defaultName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

export default function BatchNamePromptModal({ files, defaultName, onCancel, onConfirm }: BatchNamePromptModalProps) {
  const [name, setName] = useState(defaultName || '');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 40;

  const submit = () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Nombre del lote</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <ImageIcon size={12} /> {files.length} captura{files.length === 1 ? '' : 's'} listas para procesar
            </div>
          </div>
          <button onClick={onCancel} disabled={submitting} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onCancel} disabled={submitting} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Procesar lote
          </button>
        </div>
      </div>
    </div>
  );
}
