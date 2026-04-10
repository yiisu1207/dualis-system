/**
 * Fase D.0 — Helpers para el quórum de aprobación de movimientos CxC/CxP.
 *
 * Separado de MainSystem para facilitar testing y reusar en AprobacionesPanel,
 * CxCPage, CxPPage, MovementFormPanel y Configuración.
 */

import type {
  ApprovalConfig,
  ApprovalMovementKind,
  Movement,
  MovementType,
  PendingMovement,
} from '../../types';
import {
  Capability,
  DEFAULT_CAPABILITIES,
  RoleKey,
  RoleCapabilities,
} from '../hooks/useRolePermissions';

// Roles que implícitamente tienen todas las capabilities.
const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

export interface ValidatorUser {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
}

/**
 * Cuenta cuántos usuarios del negocio tienen la capability `aprobarMovimientos`
 * (o son owner/admin, que siempre pueden aprobar).
 */
export function countValidators(
  users: ValidatorUser[],
  roleCapabilities: RoleCapabilities = {}
): { count: number; ids: string[] } {
  const ids: string[] = [];
  for (const u of users) {
    if (!u.role) continue;
    if (PRIVILEGED_ROLES.has(u.role)) {
      ids.push(u.uid);
      continue;
    }
    const roleKey = u.role as RoleKey;
    const override = roleCapabilities[roleKey]?.aprobarMovimientos;
    const resolved =
      override !== undefined
        ? override === true
        : DEFAULT_CAPABILITIES[roleKey]?.aprobarMovimientos === true;
    if (resolved) ids.push(u.uid);
  }
  return { count: ids.length, ids };
}

/**
 * Mapea un Movement draft al ApprovalMovementKind para comparar contra
 * `approvalConfig.appliesTo`. Retorna null si el movement no cae en
 * ninguna categoría sujeta a quórum (ej: venta POS, recepción inventario).
 */
export function mapMovementToApprovalKind(
  mov: Pick<Movement, 'movementType' | 'isSupplierMovement' | 'anulada'>
): ApprovalMovementKind | null {
  const isCxP = mov.isSupplierMovement === true;
  const type = (mov.movementType || '').toString().toUpperCase();

  if (mov.anulada) return isCxP ? 'ANULACION_CXP' : 'ANULACION_CXC';
  if (type === 'FACTURA') return isCxP ? 'FACTURA_CXP' : 'FACTURA_CXC';
  if (type === 'ABONO') return isCxP ? 'ABONO_CXP' : 'ABONO_CXC';
  // Tipos futuros (AJUSTE, NC, etc.) caen fuera por ahora.
  return null;
}

export interface QuorumDecisionInput {
  config?: ApprovalConfig;
  movementDraft: Pick<Movement, 'movementType' | 'isSupplierMovement' | 'anulada'>;
  validatorCount: number;
  fromPosRealtime?: boolean;
  migratedFromHistorical?: boolean;
  fromPortalPayment?: boolean;
}

/**
 * Decide si el movement requiere pasar por la cola de pendingMovements
 * o si puede commitearse directo al ledger.
 *
 * Reglas (orden):
 * 1. Sin config o `enabled=false` → commit directo
 * 2. Bypass flags (historical/pos/portal exempt) → commit directo
 * 3. Tipo no sujeto a quórum → commit directo
 * 4. Validadores < quorumRequired → commit directo (auto-aprobado)
 * 5. En cualquier otro caso → pending
 */
export function decideQuorum(input: QuorumDecisionInput): {
  needsQuorum: boolean;
  reason:
    | 'disabled'
    | 'historical'
    | 'pos_realtime'
    | 'portal_exempt'
    | 'not_applicable'
    | 'insufficient_validators'
    | 'quorum_required';
} {
  const { config, movementDraft, validatorCount } = input;

  if (!config || !config.enabled) return { needsQuorum: false, reason: 'disabled' };
  if (input.migratedFromHistorical) return { needsQuorum: false, reason: 'historical' };
  if (input.fromPosRealtime && config.exemptPosRealtime !== false)
    return { needsQuorum: false, reason: 'pos_realtime' };
  if (input.fromPortalPayment && config.exemptPortalPayments !== false)
    return { needsQuorum: false, reason: 'portal_exempt' };

  const kind = mapMovementToApprovalKind(movementDraft);
  if (!kind || !config.appliesTo.includes(kind))
    return { needsQuorum: false, reason: 'not_applicable' };

  const required = Math.max(2, config.quorumRequired || 2);
  if (validatorCount < required)
    return { needsQuorum: false, reason: 'insufficient_validators' };

  return { needsQuorum: true, reason: 'quorum_required' };
}

/**
 * Chequea si un user puede firmar un pending específico.
 * Reglas duras:
 * - Tiene que tener la capability `aprobarMovimientos`
 * - NO puede ser el creador (el creador nunca firma su propio draft)
 * - NO puede haber firmado ya (anti doble-firma)
 */
export function canApprovePending(
  pending: PendingMovement,
  currentUser: { uid: string; role?: string },
  hasCapability: (cap: Capability) => boolean
): { allowed: boolean; reason?: string } {
  if (pending.status !== 'pending') return { allowed: false, reason: 'not_pending' };
  if (!hasCapability('aprobarMovimientos'))
    return { allowed: false, reason: 'no_capability' };
  if (pending.createdBy === currentUser.uid)
    return { allowed: false, reason: 'is_creator' };
  if (pending.approvals.some(a => a.userId === currentUser.uid))
    return { allowed: false, reason: 'already_signed' };
  return { allowed: true };
}

/**
 * Default config seguro — si el business no tiene `approvalConfig` escrito,
 * se usa éste: disabled (compat total con Usuario A/B pre-D.0).
 */
export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  enabled: false,
  quorumRequired: 2,
  appliesTo: [
    'FACTURA_CXC', 'ABONO_CXC', 'AJUSTE_CXC', 'ANULACION_CXC',
    'FACTURA_CXP', 'ABONO_CXP', 'AJUSTE_CXP', 'ANULACION_CXP',
  ],
  exemptPortalPayments: true,
  exemptPosRealtime: true,
};
