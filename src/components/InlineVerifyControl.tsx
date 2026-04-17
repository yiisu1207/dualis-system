/**
 * Fase D.2 — Control de verificación inline.
 *
 * Envuelve VerificationBadge para que sea clickeable y despliegue el
 * VerificationActionMenu popover. Maneja internamente la persistencia
 * a Firestore (top-level `movements/{id}`).
 *
 * Uso desde tablas de CxC/CxP (CxCLedgerTable, LedgerView): si
 * `canVerify === false` el badge sigue mostrándose pero no abre el menú.
 */

import React, { useEffect, useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Movement } from '../../types';
import { isVerifiable } from '../utils/movementHelpers';
import VerificationBadge from './VerificationBadge';
import VerificationActionMenu, { type VerificationUpdatePayload } from './VerificationActionMenu';

interface Props {
  movement: Movement;
  currentUserId: string;
  currentUserName: string;
  canVerify: boolean;
  size?: 'xs' | 'sm';
}

const InlineVerifyControl: React.FC<Props> = ({ movement, currentUserId, currentUserName, canVerify, size = 'xs' }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isVerifiable(movement)) return null;

  const handleUpdate = async (payload: VerificationUpdatePayload) => {
    setBusy(true);
    try {
      const ref = doc(db, 'movements', movement.id);
      const update: Record<string, any> = {
        verificationStatus: payload.status,
      };
      if (payload.status === 'verified') {
        update.verifiedAt = new Date().toISOString();
        update.verifiedByUid = currentUserId;
        update.verifiedByName = currentUserName;
        update.verificationNote = null;
      } else if (payload.status === 'not_arrived') {
        update.verifiedAt = new Date().toISOString();
        update.verifiedByUid = currentUserId;
        update.verifiedByName = currentUserName;
        update.verificationNote = payload.note || null;
      } else {
        update.verifiedAt = null;
        update.verifiedByUid = null;
        update.verifiedByName = null;
        update.verificationNote = null;
      }
      update.verificationUpdatedAt = serverTimestamp();
      await updateDoc(ref, update);
    } catch (err) {
      console.error('[InlineVerifyControl] update failed', err);
      alert('No se pudo actualizar el estado de verificación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <button
        type="button"
        disabled={!canVerify || busy}
        onClick={(e) => {
          e.stopPropagation();
          if (canVerify) setOpen((v) => !v);
        }}
        className={canVerify ? 'cursor-pointer' : 'cursor-default'}
        title={canVerify ? 'Cambiar verificación' : undefined}
      >
        <VerificationBadge movement={movement} size={size} />
      </button>
      {open && canVerify && (
        <div className="absolute left-0 top-full mt-1 z-30">
          <VerificationActionMenu
            movement={movement}
            busy={busy}
            onUpdate={handleUpdate}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </span>
  );
};

export default InlineVerifyControl;
