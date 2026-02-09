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
} from 'firebase/firestore';
import { db } from './config';

export type RequestStatus = 'pending' | 'accepted' | 'rejected';

export async function logAudit(userId: string | null, action: string, meta: Record<string, any> = {}) {
  try {
    await addDoc(collection(db, 'audits'), {
      userId: userId || null,
      action,
      meta,
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
      meta: { workspaceId: payload.workspaceId, senderEmail: payload.senderEmail },
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

export async function acceptRequest(requestId: string) {
  const reqRef = doc(db, 'workspaceRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Solicitud no encontrada');
  const data: any = reqSnap.data();

  // 1) marcar como accepted
  await updateDoc(reqRef, { status: 'accepted', respondedAt: new Date().toISOString() });

  // 2) añadir usuario a la colección users (si no existe)
  if (data.senderId) {
    const userRef = doc(db, 'users', data.senderId);
    await setDoc(
      userRef,
      {
        uid: data.senderId,
        email: data.senderEmail,
        fullName: data.senderName || '',
        businessId: data.workspaceId,
        role: 'member',
      },
      { merge: true }
    );
    // 3) añadir también como miembro en la subcolección businesses/{id}/members
    try {
      const memberRef = doc(db, 'businesses', data.workspaceId, 'members', data.senderId);
      await setDoc(memberRef, {
        uid: data.senderId,
        email: data.senderEmail,
        fullName: data.senderName || '',
        role: 'member',
        joinedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Failed to write member subcollection', e);
    }
  }

  // audit
  try {
    await addDoc(collection(db, 'audits'), {
      userId: data.senderId || null,
      action: 'accept_request',
      meta: { requestId, workspaceId: data.workspaceId },
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

export async function updateUser(uid: string, changes: Record<string, any>) {
  await updateDoc(doc(db, 'users', uid), changes);
  try {
    await addDoc(collection(db, 'audits'), {
      userId: uid,
      action: 'update_user',
      meta: { changes },
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}

export async function deleteUser(uid: string) {
  await deleteDoc(doc(db, 'users', uid));
  try {
    await addDoc(collection(db, 'audits'), {
      userId: uid,
      action: 'delete_user',
      meta: {},
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed', e);
  }
  return true;
}
