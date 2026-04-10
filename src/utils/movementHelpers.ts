/**
 * Fase D.0.1 — Helpers para la capa de verificación de llegada al banco.
 *
 * La verificación es 100% informativa: permite al admin marcar fila por fila
 * si un pago entró realmente al banco. NO afecta saldos, contabilidad ni
 * reportes financieros — es un historial/control paralelo.
 */

import type { Movement } from '../../types';

// Métodos que NO son verificables porque llegan en mano o tiempo real.
const NON_VERIFIABLE_METHODS = new Set([
  'Efectivo',
  'Efectivo USD',
  'Tarjeta',
  'Tarjeta de débito',
  'Tarjeta de crédito',
]);

/**
 * Un Movement es "verificable" si:
 * - Es un ABONO o FACTURA (los ajustes/mermas no aplican)
 * - Tiene metodoPago definido
 * - Su metodoPago NO está en la lista de no-verificables
 *
 * Nota: una FACTURA pagada en el momento por transferencia también es
 * verificable porque el dinero tiene que llegar al banco igual.
 */
export function isVerifiable(m: Pick<Movement, 'movementType' | 'metodoPago'>): boolean {
  const type = (m.movementType || '').toString().toUpperCase();
  if (type !== 'ABONO' && type !== 'FACTURA') return false;
  if (!m.metodoPago) return false;
  return !NON_VERIFIABLE_METHODS.has(m.metodoPago);
}

export type VerificationStatus = NonNullable<Movement['verificationStatus']>;

/**
 * Resuelve el status efectivo considerando la migración perezosa desde P6.K.8:
 * si el Movement tiene `reconciledAt` pero no `verificationStatus`, se trata
 * como 'verified' (el campo nuevo absorbe el legacy).
 */
export function resolveVerificationStatus(
  m: Pick<Movement, 'verificationStatus' | 'reconciledAt'>
): VerificationStatus {
  if (m.verificationStatus) return m.verificationStatus;
  if (m.reconciledAt) return 'verified';
  return 'unverified';
}

export interface VerificationDisplay {
  label: string;
  tone: 'warning' | 'success' | 'danger';
  icon: '⏳' | '✓' | '⚠';
}

export function formatVerificationStatus(status: VerificationStatus): VerificationDisplay {
  switch (status) {
    case 'verified':
      return { label: 'Verificado', tone: 'success', icon: '✓' };
    case 'not_arrived':
      return { label: 'No llegó', tone: 'danger', icon: '⚠' };
    case 'unverified':
    default:
      return { label: 'Sin verificar', tone: 'warning', icon: '⏳' };
  }
}
