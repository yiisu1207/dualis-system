import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDhogwFlgTEePSm0Mgda10lSDt-ljzauT4',
  authDomain: 'erp-web-f99dc.firebaseapp.com',
  projectId: 'erp-web-f99dc',
  storageBucket: 'erp-web-f99dc.firebasestorage.app',
  messagingSenderId: '610732608731',
  appId: '1:610732608731:web:2b42838f390a33c0bb90fe',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persistence con API moderna (multi-tab compatible)
export const db = typeof window !== 'undefined'
  ? initializeFirestore(app, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    } as any)
  : getFirestore(app);

export const storage = null;
