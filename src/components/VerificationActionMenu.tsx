/**
 * Fase D.0.1 — Menú de acción para cambiar el estado de verificación de un
 * Movement desde cualquier tabla. Presentación: popover con 3 botones
 * (Verificado / No llegó / Sin verificar) + opcional textarea para nota.
 *
 * El componente es puramente presentacional; el caller provee la función
 * `onUpdate(payload)` que persiste en Firestore. Usado por VerificacionPanel
 * y (en el futuro) por menús contextuales en CxCLedgerTable / LedgerView.
 */

import React, { useState } from 'react';
import { Check, X as XIcon, Clock } from 'lucide-react';
import type { Movement } from '../../types';
import { resolveVerificationStatus, type VerificationStatus } from '../utils/movementHelpers';

export interface VerificationUpdatePayload {
  status: VerificationStatus;
  note?: string;
}

interface Props {
  movement: Pick<
    Movement,
    'verificationStatus' | 'reconciledAt' | 'verificationNote'
  >;
  onUpdate: (payload: VerificationUpdatePayload) => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
}

const VerificationActionMenu: React.FC<Props> = ({ movement, onUpdate, onClose, busy }) => {
  const current = resolveVerificationStatus(movement);
  const [note, setNote] = useState(movement.verificationNote || '');
  const [showNote, setShowNote] = useState(current === 'not_arrived');

  const apply = async (status: VerificationStatus) => {
    await onUpdate({ status, note: status === 'not_arrived' ? note : undefined });
    onClose();
  };

  return (
    <div
      className="w-72 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 px-1">
        Verificación bancaria
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => apply('verified')}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
          current === 'verified'
            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
            : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent'
        }`}
      >
        <Check size={14} /> Marcar como verificado
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => setShowNote(true)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
          current === 'not_arrived'
            ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
            : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 hover:bg-rose-500/10 hover:text-rose-500 border border-transparent'
        }`}
      >
        <XIcon size={14} /> No llegó al banco
      </button>

      {showNote && (
        <div className="space-y-2 pt-1">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota opcional (ej: Apareció como rechazado en BDV del 15-abr)"
            rows={2}
            className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-700 dark:text-white/70 outline-none resize-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => apply('not_arrived')}
            className="w-full px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500 text-white hover:bg-rose-600 transition-all"
          >
            Confirmar "No llegó"
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => apply('unverified')}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
          current === 'unverified'
            ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
            : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 hover:bg-amber-500/10 hover:text-amber-500 border border-transparent'
        }`}
      >
        <Clock size={14} /> Dejar sin verificar
      </button>
    </div>
  );
};

export default VerificationActionMenu;
