/**
 * Fase D.0.1 — Badge universal de verificación de pago.
 *
 * Se muestra en cualquier tabla/lista de Movements para indicar al admin
 * si el pago ha sido confirmado contra el banco. Solo para roles internos
 * (owner/admin/auditor) — el portal del cliente NUNCA debe renderizarlo.
 */

import React from 'react';
import type { Movement } from '../../types';
import {
  formatVerificationStatus,
  isVerifiable,
  resolveVerificationStatus,
} from '../utils/movementHelpers';

interface Props {
  movement: Pick<
    Movement,
    'movementType' | 'metodoPago' | 'verificationStatus' | 'reconciledAt' |
    'verifiedAt' | 'verifiedByName' | 'verificationNote'
  >;
  size?: 'xs' | 'sm';
  showTooltip?: boolean;
}

const TONE_CLASSES: Record<'warning' | 'success' | 'danger', string> = {
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  danger:  'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const VerificationBadge: React.FC<Props> = ({ movement, size = 'sm', showTooltip = true }) => {
  if (!isVerifiable(movement)) return null;

  const status = resolveVerificationStatus(movement);
  const display = formatVerificationStatus(status);
  const cls = TONE_CLASSES[display.tone];
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  let tooltip: string | undefined;
  if (showTooltip) {
    if (status === 'verified') {
      const who = movement.verifiedByName ? ` por ${movement.verifiedByName}` : '';
      const when = movement.verifiedAt ? ` el ${new Date(movement.verifiedAt).toLocaleDateString()}` : '';
      tooltip = `Confirmado contra el banco${who}${when}`;
    } else if (status === 'not_arrived') {
      tooltip = movement.verificationNote
        ? `No llegó al banco — ${movement.verificationNote}`
        : 'Marcado como no llegado al banco';
    } else {
      tooltip = 'Aún no confirmado contra el estado de cuenta bancario';
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${cls} ${padding}`}
      title={tooltip}
    >
      <span aria-hidden>{display.icon}</span>
      <span>{display.label}</span>
    </span>
  );
};

export default VerificationBadge;
