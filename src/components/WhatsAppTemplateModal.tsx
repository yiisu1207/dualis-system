import React, { useEffect, useMemo, useState } from 'react';
import { MessageTemplate } from '../../types';

export type TemplateContext = {
  nombre_cliente?: string;
  monto_deuda?: string;
  fecha_vencimiento?: string;
  nombre_empresa?: string;
};

interface WhatsAppTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: MessageTemplate[];
  context: TemplateContext;
  onSend: (message: string) => void;
}

const replaceVariables = (text: string, context: TemplateContext) => {
  return text
    .replaceAll('{nombre_cliente}', context.nombre_cliente || '')
    .replaceAll('{monto_deuda}', context.monto_deuda || '')
    .replaceAll('{fecha_vencimiento}', context.fecha_vencimiento || '')
    .replaceAll('{nombre_empresa}', context.nombre_empresa || '');
};

const WhatsAppTemplateModal: React.FC<WhatsAppTemplateModalProps> = ({
  isOpen,
  onClose,
  templates,
  context,
  onSend,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (templates.length > 0) {
      setSelectedId(templates[0].id);
      setCustomText('');
      return;
    }
    setSelectedId('custom');
    setCustomText('');
  }, [isOpen, templates]);

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedId) || null;
  }, [templates, selectedId]);

  const previewText = useMemo(() => {
    if (selectedId === 'custom') {
      return customText.trim();
    }
    if (!selectedTemplate) return '';
    return replaceVariables(selectedTemplate.body, context).trim();
  }, [selectedId, selectedTemplate, customText, context]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-700 dark:text-slate-100">
              Plantillas de WhatsApp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Previsualiza antes de enviar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="mt-4">
          <label className="text-[10px] font-black uppercase text-slate-400">Plantilla</label>
          <select
            className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-100"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="custom">Mensaje Libre</option>
          </select>
        </div>

        {selectedId === 'custom' && (
          <div className="mt-4">
            <label className="text-[10px] font-black uppercase text-slate-400">
              Mensaje libre
            </label>
            <textarea
              className="mt-2 w-full min-h-[90px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-semibold text-slate-700 dark:text-slate-100"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Escribe tu mensaje..."
            />
          </div>
        )}

        <div className="mt-4">
          <label className="text-[10px] font-black uppercase text-slate-400">Vista previa</label>
          <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-700 dark:text-slate-100 whitespace-pre-wrap">
            {previewText || 'Sin contenido.'}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-xs font-black uppercase"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSend(previewText)}
            disabled={!previewText}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase disabled:opacity-50"
          >
            Enviar por WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppTemplateModal;
