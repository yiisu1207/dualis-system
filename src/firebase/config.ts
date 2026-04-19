import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyDhogwFlgTEePSm0Mgda10lSDt-ljzauT4',
  authDomain: 'erp-web-f99dc.firebaseapp.com',
  projectId: 'erp-web-f99dc',
  storageBucket: 'erp-web-f99dc.firebasestorage.app',
  messagingSenderId: '610732608731',
  appId: '1:610732608731:web:2b42838f390a33c0bb90fe',
};

// Validación temprana — si en algún momento estos campos se mueven a env vars
// y no se cargan, quiero un mensaje claro en consola, no un error críptico de Firebase.
const requiredKeys: Array<keyof typeof firebaseConfig> = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missing = requiredKeys.filter((k) => !firebaseConfig[k]);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(`[firebase/config] Faltan campos en firebaseConfig: ${missing.join(', ')}. La app no podrá conectarse.`);
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// NOTE: AppCheck (ReCaptcha V3) fue removido — nunca funcionó en producción.
// La defensa ahora vive en firestore.rules (tenant isolation + shape validation)
// + rate limiting client+server (Fase J). Ver SUPERPLAN Fase A.2 + Fase J.

// Persistence con API moderna (multi-tab compatible)
export const db = typeof window !== 'undefined'
  ? initializeFirestore(app, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    } as any)
  : getFirestore(app);

// Firebase Storage (estados de cuenta, comprobantes, etc.)
export const storage = getStorage(app);
