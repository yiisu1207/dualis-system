import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, MapPin, MessageSquare, Mail, StickyNote, Send } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

/* ── Props ──────────────────────────────────────────────────── */

interface CommunicationModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  businessId: string;
  userId: string;
  userName: string;
}

/* ── Constants ──────────────────────────────────────────────── */

type CommType = 'llamada' | 'visita' | 'whatsapp' | 'email' | 'sms' | 'nota';
type Outcome = 'promesa_pago' | 'no_contesto' | 'rechazo' | 'acuerdo' | 'informativo';

const COMM_TYPES: { value: CommType; label: string; icon: React.ReactNode }[] = [
  { value: 'llamada',  label: 'Llamada',  icon: <Phone size={14} /> },
  { value: 'visita',   label: 'Visita',   icon: <MapPin size={14} /> },
  { value: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare size={14} /> },
  { value: 'email',    label: 'Email',    icon: <Mail size={14} /> },
  { value: 'sms',      label: 'SMS',      icon: <Send size={14} /> },
  { value: 'nota',     label: 'Nota',     icon: <StickyNote size={14} /> },
];

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'promesa_pago', label: 'Promesa de pago' },
  { value: 'no_contesto',  label: 'No contestó' },
  { value: 'rechazo',      label: 'Rechazo' },
  { value: 'acuerdo',      label: 'Acuerdo' },
  { value: 'informativo',  label: 'Informativo' },
];

const inputCls =
  'w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';

const labelCls =
  'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block';

/* ── Component ──────────────────────────────────────────────── */

export default function CommunicationModal({
  open, onClose, customerId, customerName, businessId, userId, userName,
}: CommunicationModalProps) {
  const [type, setType] = useState<CommType>('llamada');
  const [content, setContent] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [promiseDate, setPromiseDate] = useState('');
  const [saving, setSaving] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setType('llamada');
      setContent('');
      setOutcome('');
      setPromiseDate('');
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const doc: Record<string, unknown> = {
        type,
        content: content.trim(),
        date: serverTimestamp(),
        userId,
        userName,
      };
      if (outcome) doc.outcome = outcome;
      if (outcome === 'promesa_pago' && promiseDate) doc.promiseDate = promiseDate;
      await addDoc(
        collection(db, 'businesses', businessId, 'customers', customerId, 'communications'),
        doc,
      );
      onClose();
    } catch (err) {
      console.error('Error saving communication:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
    >
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl animate-[slideUp_200ms_ease-out]">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white dark:bg-[#0d1424] border-b border-slate-100 dark:border-white/[0.08] rounded-t-2xl">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Registrar Comunicación</h2>
            <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Tipo ──────────────────────────────────────── */}
          <div>
            <label className={labelCls}>Tipo de comunicación</label>
            <div className="flex gap-2 flex-wrap">
              {COMM_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setType(ct.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                    type === ct.value
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                      : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.1]'
                  }`}
                >
                  {ct.icon} {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Contenido ─────────────────────────────────── */}
          <div>
            <label className={labelCls}>Contenido *</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Detalle de la comunicación..."
              rows={3}
              className={`${inputCls} resize-none`}
              autoFocus
            />
          </div>

          {/* ── Resultado ─────────────────────────────────── */}
          <div>
            <label className={labelCls}>Resultado (opcional)</label>
            <div className="flex gap-2 flex-wrap">
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(prev => prev === o.value ? '' : o.value)}
                  className={`px-3 py-2 rounded-full text-xs font-bold transition-all ${
                    outcome === o.value
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                      : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.1]'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Fecha promesa ─────────────────────────────── */}
          {outcome === 'promesa_pago' && (
            <div>
              <label className={labelCls}>Fecha de promesa de pago</label>
              <input
                type="date"
                value={promiseDate}
                onChange={e => setPromiseDate(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 px-6 py-4 bg-white dark:bg-[#0d1424] border-t border-slate-100 dark:border-white/[0.08] rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </span>
            ) : (
              'Guardar'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
