import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export type AuditAction =
  | 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'LOGIN' | 'LOGOUT' | 'AJUSTE' | 'EXPORTAR'
  | 'APROBAR' | 'FIRMAR' | 'RECHAZAR' | 'CANCELAR'
  | 'VERIFY_PAYMENT' | 'REVERT_PAYMENT' | 'APPROVE_PAYMENT' | 'REJECT_PAYMENT'
  | 'IMPORT_DATA' | 'CHANGE_ROLE' | 'CLOSE_REGISTER' | 'RECONCILE'
  | 'APPROVE_MOVEMENT' | 'REJECT_MOVEMENT' | 'TRANSFER_STOCK';

export interface AuditEntry {
  businessId: string;
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  entity: string;        // e.g. 'movement/abc123', 'product/xyz789'
  details: string;
  diff?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * Registra una entrada en el log de auditoría.
 * Nunca lanza errores para no interrumpir el flujo principal.
 */
export async function logAudit(
  businessId: string,
  userId: string,
  action: AuditAction,
  entity: string,
  details: string,
  extra?: {
    userEmail?: string;
    userRole?: string;
    diff?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  }
): Promise<void> {
  if (!businessId || !userId) return;
  try {
    const entry: AuditEntry = {
      businessId,
      userId,
      action,
      entity,
      details,
      timestamp: new Date().toISOString(),
    };
    if (extra?.userEmail) entry.userEmail = extra.userEmail;
    if (extra?.userRole) entry.userRole = extra.userRole;
    if (extra?.diff) entry.diff = extra.diff;
    // Capture browser context (best-effort)
    if (typeof navigator !== 'undefined') {
      entry.userAgent = navigator.userAgent;
    }
    const deviceId = getDeviceId();
    if (deviceId) entry.deviceId = deviceId;

    await addDoc(collection(db, 'auditLogs'), entry);
  } catch (e) {
    console.warn('[AuditLogger] No se pudo registrar entrada:', e);
  }
}

/**
 * Build a diff object from two snapshots, keeping only changed keys.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } | undefined {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before[key];
      changedAfter[key] = after[key];
    }
  }
  if (Object.keys(changedBefore).length === 0) return undefined;
  return { before: changedBefore, after: changedAfter };
}

/** Stable device fingerprint stored in localStorage */
function getDeviceId(): string | undefined {
  try {
    const KEY = 'dualis:deviceId';
    let id = localStorage.getItem(KEY);
    if (!id) {
      const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}|${navigator.language}`;
      // Simple hash (not crypto, just fingerprint)
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
      }
      id = `dev_${Math.abs(hash).toString(36)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}
