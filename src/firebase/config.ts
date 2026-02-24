import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

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
export const db = getFirestore(app);

// Enable Persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistence not supported by browser');
    }
  });
}

export const storage = null;
