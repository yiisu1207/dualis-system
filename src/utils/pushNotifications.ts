/**
 * K.4 — FCM push notification setup (client-side token collection).
 * Actual push sending requires Cloud Functions (deferred to v1.1).
 * This module handles: permission request, token retrieval, token storage in Firestore.
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

let messagingInstance: any = null;

/**
 * Lazily initialize Firebase Messaging to avoid importing it in the main bundle.
 */
async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      console.info('[FCM] Push notifications not supported in this browser');
      return null;
    }
    // getMessaging uses the default Firebase app (already initialized in config.ts)
    messagingInstance = getMessaging();
    return messagingInstance;
  } catch (err) {
    console.warn('[FCM] Failed to initialize messaging:', err);
    return null;
  }
}

/**
 * Request notification permission and get FCM token.
 * Stores the token in `users/{uid}.fcmToken` for later use by Cloud Functions.
 */
export async function requestPushPermission(userId: string): Promise<string | null> {
  if (!('Notification' in window)) {
    console.info('[FCM] Notifications API not available');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('[FCM] Permission denied by user');
    return null;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
    });

    if (token) {
      // Store token in user doc
      await updateDoc(doc(db, 'users', userId), {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
      console.info('[FCM] Token stored successfully');
      return token;
    }
  } catch (err) {
    console.warn('[FCM] Failed to get token:', err);
  }

  return null;
}

/**
 * Listen for foreground messages (when app is open).
 * Shows a toast notification via the callback.
 */
export async function onForegroundMessage(
  callback: (payload: { title: string; body: string; link?: string }) => void
): Promise<(() => void) | null> {
  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  try {
    const { onMessage } = await import('firebase/messaging');
    const unsubscribe = onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || 'Dualis';
      const body = payload.notification?.body || payload.data?.body || '';
      const link = payload.data?.link;
      callback({ title, body, link });
    });
    return unsubscribe;
  } catch (err) {
    console.warn('[FCM] Failed to set up foreground listener:', err);
    return null;
  }
}
