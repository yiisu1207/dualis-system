import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { AppConfig, ExchangeRates, ReconciliationRecord } from '../../types';

export type RequestStatus =
  | 'pending_match'
  | 'accepted'
  | 'connected'
  | 'closed'
  | 'rejected';

const normalizeDateKey = (date: string) => {
  if (!date) return new Date().toISOString().split('T')[0];
  if (date.includes('T')) return date.split('T')[0];
  return date;
};

const mapExchangeRateDoc = (data: any): ExchangeRates | null => {
  if (!data) return null;
  const bcv = Number(data.bcv) || 0;
  const grupo = Number(data.parallel ?? data.grupo) || 0;
  return {
    bcv,
    grupo,
    lastUpdated: data.date || new Date().toLocaleDateString(),
  };
};

const exchangeRatesCollection = (businessId: string) =>
  collection(db, 'businesses', businessId, 'exchange_rates_history');

export async function upsertExchangeRate(
  businessId: string,
  date: string,
  rates: ExchangeRates,
  createdBy?: { uid: string; displayName?: string | null; photoURL?: string | null },
  notes?: string
) {
  if (!businessId) throw new Error('Missing businessId for exchange rates');
  const key = normalizeDateKey(date);
  const payload: Record<string, any> = {
    date: key,
    bcv: Number(rates.bcv) || 0,
    parallel: Number(rates.grupo) || 0,
    timestamp: serverTimestamp(),
  };
  if (createdBy) {
    payload.createdBy = {
      uid: createdBy.uid,
      displayName: createdBy.displayName || null,
      photoURL: createdBy.photoURL || null,
      timestamp: serverTimestamp(),
    };
  }
  if (notes !== undefined) {
    payload.notes = String(notes || '');
  }
  await setDoc(
    doc(db, 'businesses', businessId, 'exchange_rates_history', key),
    payload,
    { merge: true }
  );
}

export async function createExchangeRateEntry(
  businessId: string,
  date: string,
  rates: ExchangeRates,
  createdBy?: { uid: string; displayName?: string | null; photoURL?: string | null },
  notes?: string
) {
  if (!businessId) throw new Error('Missing businessId for exchange rates');
  const key = normalizeDateKey(date);
  const payload: Record<string, any> = {
    date: key,
    bcv: Number(rates.bcv) || 0,
    parallel: Number(rates.grupo) || 0,
    timestamp: serverTimestamp(),
  };
  if (createdBy) {
    payload.createdBy = {
      uid: createdBy.uid,
      displayName: createdBy.displayName || null,
      photoURL: createdBy.photoURL || null,
      timestamp: serverTimestamp(),
    };
  }
  if (notes !== undefined) {
    payload.notes = String(notes || '');
  }
  await addDoc(exchangeRatesCollection(businessId), payload);
}

export async function getLatestExchangeRate(businessId: string) {
  if (!businessId) return null;
  const q = query(
    exchangeRatesCollection(businessId),
    orderBy('date', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapExchangeRateDoc(snap.docs[0].data());
}

export async function getSmartExchangeRate(businessId: string, date: string) {
  if (!businessId) return null;
  const key = normalizeDateKey(date);
  const q = query(
    exchangeRatesCollection(businessId),
    where('date', '>=', key),
    orderBy('date', 'asc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapExchangeRateDoc(snap.docs[0].data());
}

export async function logAudit(userId: string | null, action: string, meta: Record<string, any> = {}) {
  try {
    const businessId = meta?.businessId || null;
    await addDoc(collection(db, 'audits'), {
      userId: userId || null,
      action,
      meta,
      businessId,
      createdAt: new Date().toISOString(),
    });
    // Also mirror to legacy `auditLogs` used in MainSystem
    try {
      await addDoc(collection(db, 'auditLogs'), {
        id: crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        date: new Date().toISOString(),
        user: userId || 'sistema',
        module: meta.module || 'system',
        action,
        detail: JSON.stringify(meta || {}),
        businessId,
      });
    } catch (e) {
      // ignore
    }
  } catch (e) {
    console.warn('Audit log failed', e);
  }
}

export async function sendWorkspaceRequest(payload: {
  senderId: string;
  senderEmail: string;
  senderName?: string;
  workspaceId: string;
}) {
  const col = collection(db, 'workspaceRequests');
  const docRef = await addDoc(col, {
    senderId: payload.senderId,
    senderEmail: payload.senderEmail,
    senderName: payload.senderName || '',
    workspaceId: payload.workspaceId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  // Log audit
  try {
    await addDoc(collection(db, 'audits'), {
      userId: payload.senderId,
      action: 'send_workspace_request',
      meta: { workspaceId: payload.workspaceId, senderEmail: payload.senderEmail, businessId: payload.workspaceId },
      businessId: payload.workspaceId,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return docRef.id;
}

export async function getSentRequests(senderId: string) {
  const q = query(
    collection(db, 'workspaceRequests'),
    where('senderId', '==', senderId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getReceivedRequests(workspaceId: string) {
  const q = query(
    collection(db, 'workspaceRequests'),
    where('workspaceId', '==', workspaceId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function acceptRequest(requestId: string, role: string = 'ventas') {
  const reqRef = doc(db, 'workspaceRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Solicitud no encontrada');
  const data: any = reqSnap.data();

  // 1) marcar como accepted
  await updateDoc(reqRef, { status: 'accepted', respondedAt: new Date().toISOString(), assignedRole: role });

  // 2) activar al usuario con el rol asignado
  if (data.senderId) {
    const userRef = doc(db, 'users', data.senderId);
    await setDoc(
      userRef,
      {
        uid: data.senderId,
        email: data.senderEmail,
        fullName: data.senderName || '',
        businessId: data.workspaceId,
        role,
        status: 'ACTIVE',
      },
      { merge: true }
    );
    // 3) añadir también como miembro en la subcolección businesses/{id}/members
    try {
      const memberRef = doc(db, 'businesses', data.workspaceId, 'members', data.senderId);
      await setDoc(
        memberRef,
        {
          uid: data.senderId,
          email: data.senderEmail,
          fullName: data.senderName || '',
          role,
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to write member subcollection', e);
    }
  }

  // audit
  try {
    await addDoc(collection(db, 'audits'), {
      userId: data.senderId || null,
      action: 'accept_request',
      meta: { requestId, workspaceId: data.workspaceId, businessId: data.workspaceId },
      businessId: data.workspaceId,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return true;
}

export async function rejectRequest(requestId: string) {
  await updateDoc(doc(db, 'workspaceRequests', requestId), {
    status: 'rejected',
    respondedAt: new Date().toISOString(),
  });
  try {
    await addDoc(collection(db, 'audits'), {
      userId: null,
      action: 'reject_request',
      meta: { requestId },
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}

export async function listUsers(businessId: string) {
  const q = query(collection(db, 'users'), where('businessId', '==', businessId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function searchUsers(businessId: string, term: string) {
  // Firestore text search is limited; fetch and filter client-side
  const users = await listUsers(businessId);
  const t = term.toLowerCase();
  return users.filter((u: any) => {
    return (
      (u.email && u.email.toLowerCase().includes(t)) ||
      (u.fullName && u.fullName.toLowerCase().includes(t))
    );
  });
}

export async function updateUser(uid: string, changes: Record<string, any>, businessId?: string) {
  await updateDoc(doc(db, 'users', uid), changes);
  try {
    await addDoc(collection(db, 'audits'), {
      userId: uid,
      action: 'update_user',
      meta: { changes, businessId },
      businessId: businessId || null,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}

export async function deleteUser(uid: string, businessId?: string) {
  await deleteDoc(doc(db, 'users', uid));
  try {
    await addDoc(collection(db, 'audits'), {
      userId: uid,
      action: 'delete_user',
      meta: { businessId },
      businessId: businessId || null,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}

export async function getBusinessConfig(businessId: string) {
  const ref = doc(db, 'businessConfigs', businessId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Partial<AppConfig>) : null;
}

export async function saveBusinessConfig(
  businessId: string,
  config: AppConfig,
  userId?: string | null
) {
  const ref = doc(db, 'businessConfigs', businessId);
  await setDoc(
    ref,
    {
      ...config,
      businessId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  try {
    await addDoc(collection(db, 'audits'), {
      userId: userId || null,
      action: 'update_business_config',
      meta: { businessId },
      businessId,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return true;
}

export async function getReconciliationHistory(
  businessId: string,
  maxItems = 100,
  ownerId?: string
) {
  const constraints = [
    where('businessId', '==', businessId),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  ];
  if (ownerId) {
    constraints.unshift(where('ownerId', '==', ownerId));
  }
  const q = query(collection(db, 'reconciliations'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ReconciliationRecord) }));
}

export async function saveReconciliationRecord(record: Omit<ReconciliationRecord, 'id'>) {
  const ref = await addDoc(collection(db, 'reconciliations'), record);
  return ref.id;
}

export async function getAuditLogs(businessId: string, maxItems = 200) {
  const q = query(
    collection(db, 'audits'),
    where('businessId', '==', businessId),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createBookAccessRequest(payload: {
  businessId: string;
  requesterId: string;
  requesterName?: string;
  requesterEmail?: string;
  targetUserId: string;
  targetUserName?: string;
}) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'bookAccessRequests'), {
    businessId: payload.businessId,
    requesterId: payload.requesterId,
    requesterName: payload.requesterName || '',
    requesterEmail: payload.requesterEmail || '',
    targetUserId: payload.targetUserId,
    targetUserName: payload.targetUserName || '',
    status: 'approved',
    createdAt: now,
    respondedAt: now,
    respondedBy: 'auto',
  });

  await addDoc(collection(db, 'bookAccessGrants'), {
    businessId: payload.businessId,
    granteeId: payload.requesterId,
    targetUserId: payload.targetUserId,
    createdAt: now,
    requestId: ref.id,
  });

  await addDoc(collection(db, 'bookAccessGrants'), {
    businessId: payload.businessId,
    granteeId: payload.targetUserId,
    targetUserId: payload.requesterId,
    createdAt: now,
    requestId: ref.id,
  });

  try {
    await logAudit(payload.requesterId, 'book_access_granted_auto', {
      businessId: payload.businessId,
      targetUserId: payload.targetUserId,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return ref.id;
}

export async function getBookAccessRequests(businessId: string, status?: string) {
  const constraints: any[] = [where('businessId', '==', businessId)];
  if (status) constraints.push(where('status', '==', status));
  constraints.push(orderBy('createdAt', 'desc'));
  const q = query(collection(db, 'bookAccessRequests'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyBookAccessRequests(requesterId: string) {
  const q = query(
    collection(db, 'bookAccessRequests'),
    where('requesterId', '==', requesterId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function approveBookAccessRequest(requestId: string, adminId: string) {
  const reqRef = doc(db, 'bookAccessRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Solicitud no encontrada');
  const data: any = reqSnap.data();

  await updateDoc(reqRef, {
    status: 'approved',
    respondedAt: new Date().toISOString(),
    respondedBy: adminId,
  });

  await addDoc(collection(db, 'bookAccessGrants'), {
    businessId: data.businessId,
    granteeId: data.requesterId,
    targetUserId: data.targetUserId,
    createdAt: new Date().toISOString(),
    requestId,
  });

  try {
    await logAudit(adminId, 'book_access_approved', {
      businessId: data.businessId,
      targetUserId: data.targetUserId,
      requesterId: data.requesterId,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return true;
}

export async function rejectBookAccessRequest(requestId: string, adminId: string) {
  const reqRef = doc(db, 'bookAccessRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  const data: any = reqSnap.exists() ? reqSnap.data() : {};
  await updateDoc(reqRef, {
    status: 'rejected',
    respondedAt: new Date().toISOString(),
    respondedBy: adminId,
  });
  try {
    await logAudit(adminId, 'book_access_rejected', {
      businessId: data.businessId || null,
      targetUserId: data.targetUserId,
      requesterId: data.requesterId,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}

export async function getBookAccessGrants(businessId: string, granteeId: string) {
  const q = query(
    collection(db, 'bookAccessGrants'),
    where('businessId', '==', businessId),
    where('granteeId', '==', granteeId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createBookCompareRequest(payload: {
  businessId: string;
  requesterId: string;
  requesterName?: string;
  requesterEmail?: string;
  targetUserId: string;
  targetUserName?: string;
  requesterCustomerId?: string;
}) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'bookCompareRequests'), {
    businessId: payload.businessId,
    requesterId: payload.requesterId,
    requesterName: payload.requesterName || '',
    requesterEmail: payload.requesterEmail || '',
    targetUserId: payload.targetUserId,
    targetUserName: payload.targetUserName || '',
    requesterCustomerId: payload.requesterCustomerId || null,
    responderCustomerId: null,
    status: 'pending_match',
    createdAt: now,
  });

  try {
    await logAudit(payload.requesterId, 'book_compare_request', {
      businessId: payload.businessId,
      targetUserId: payload.targetUserId,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return ref.id;
}

export async function getLatestBookCompareRequest(
  businessId: string,
  requesterId: string,
  targetUserId: string
) {
  const q = query(
    collection(db, 'bookCompareRequests'),
    where('businessId', '==', businessId),
    where('requesterId', '==', requesterId),
    where('targetUserId', '==', targetUserId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as any;
}

export async function getIncomingBookCompareRequests(
  businessId: string,
  targetUserId: string
) {
  const q = query(
    collection(db, 'bookCompareRequests'),
    where('businessId', '==', businessId),
    where('targetUserId', '==', targetUserId),
    where('status', '==', 'pending_match'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function respondBookCompareRequest(
  requestId: string,
  status: RequestStatus,
  responderId: string,
  extra?: { responderCustomerId?: string | null }
) {
  const reqRef = doc(db, 'bookCompareRequests', requestId);
  const updatePayload: Record<string, any> = {
    status,
    respondedAt: new Date().toISOString(),
    respondedBy: responderId,
  };
  if (extra && 'responderCustomerId' in extra) {
    updatePayload.responderCustomerId = extra.responderCustomerId || null;
  }
  await updateDoc(reqRef, updatePayload);

  try {
    await logAudit(responderId, `book_compare_${status}`, {
      requestId,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return true;
}

export async function listTerminals(businessId: string) {
  const q = query(collection(db, 'businesses', businessId, 'terminals'), orderBy('nombre', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function openTerminal(businessId: string, terminalId: string, userId: string, userName: string) {
  const ref = doc(db, 'businesses', businessId, 'terminals', terminalId);
  await updateDoc(ref, {
    estado: 'abierta',
    cajeroId: userId,
    cajeroNombre: userName,
    apertura: new Date().toISOString(),
    totalFacturado: 0,
    movimientos: 0,
  });
  return true;
}

export async function closeTerminal(businessId: string, terminalId: string) {
  const ref = doc(db, 'businesses', businessId, 'terminals', terminalId);
  await updateDoc(ref, {
    estado: 'cerrada',
    // No borramos el cajero para auditoria posterior inmediata, pero el estado impide acceso
    cierre: new Date().toISOString(),
  });
  return true;
}

export async function createTerminal(businessId: string, data: { nombre: string; tipo: 'detal' | 'mayor' }) {
  const col = collection(db, 'businesses', businessId, 'terminals');
  const docRef = await addDoc(col, {
    ...data,
    estado: 'cerrada',
    totalFacturado: 0,
    movimientos: 0,
    cajeroId: '',
    cajeroNombre: 'Sin asignar',
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
}

export async function backfillOwnerId(businessId: string, ownerId: string) {
  const collectionsToBackfill = ['customers', 'suppliers', 'movements', 'reconciliations'];
  const results: Record<string, number> = {};

  for (const name of collectionsToBackfill) {
    const q = query(
      collection(db, name),
      where('businessId', '==', businessId),
      where('ownerId', '==', null)
    );
    const snap = await getDocs(q);
    let count = 0;
    for (const docSnap of snap.docs) {
      await updateDoc(doc(db, name, docSnap.id), { ownerId });
      count += 1;
    }
    results[name] = count;
  }

  try {
    await logAudit(ownerId, 'backfill_owner', {
      businessId,
      results,
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }

  return results;
}

export async function getBusiness(businessId: string) {
  const snap = await getDoc(doc(db, 'businesses', businessId));
  return snap.exists() ? snap.data() : null;
}

export async function updateBusiness(businessId: string, changes: Record<string, any>) {
  await updateDoc(doc(db, 'businesses', businessId), changes);
  return true;
}

export async function listCustomers(businessId: string) {
  const q = query(collection(db, 'customers'), where('businessId', '==', businessId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listMovements(businessId: string) {
  const q = query(collection(db, 'movements'), where('businessId', '==', businessId), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listInventory(businessId: string) {
  const q = query(collection(db, `businesses/${businessId}/products`));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
