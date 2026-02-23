import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const storage = null;
