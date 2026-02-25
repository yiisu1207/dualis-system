import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export type AuditAction = 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'LOGIN' | 'AJUSTE' | 'EXPORTAR';

export interface AuditEntry {
  businessId: string;
  userId: string;
  action: AuditAction;
  entity: string;
  details: string;
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
  details: string
): Promise<void> {
  if (!businessId || !userId) return;
  try {
    await addDoc(collection(db, 'auditLogs'), {
      businessId,
      userId,
      action,
      entity,
      details,
      timestamp: new Date().toISOString(),
    } satisfies AuditEntry);
  } catch (e) {
    console.warn('[AuditLogger] No se pudo registrar entrada:', e);
  }
}
