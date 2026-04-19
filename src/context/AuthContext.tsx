import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import i18n from '../i18n';

// Definimos la "Ficha Técnica" del usuario
interface UserProfile {
  uid: string;
  email: string;
  businessId: string; // 👈 LA CLAVE: Esto conecta al usuario con SU empresa
  empresa_id?: string;
  role: 'owner' | 'admin' | 'ventas' | 'auditor' | 'pending' | 'staff' | 'member' | 'almacenista' | 'inventario';
  fullName: string;
  displayName?: string;
  bio?: string;
  age?: number;
  location?: string;
  jobTitle?: string;
  photoURL?: string;
  nationalId?: string;
  country?: string;
  language?: 'es' | 'en' | 'ar' | string;
  status?: 'ACTIVE' | 'PENDING' | string;
  uiVersion?: 'classic' | 'editorial';
  assignedCajaId?: string;  // caja asignada para rol 'ventas'
  pin?: string;
}

// Creamos el contexto
const AuthContext = createContext<{
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isolationMode: 'individual' | 'shared';
  updateUserProfile: (patch: Partial<UserProfile>) => void;
}>({ user: null, userProfile: null, loading: true, isolationMode: 'shared', updateUserProfile: () => undefined });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<{
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
  }>({
    user: null,
    userProfile: null,
    loading: true,
  });

  const [isolationMode, setIsolationMode] = useState<'individual' | 'shared'>('shared');

  const updateUserProfile = (patch: Partial<UserProfile>) => {
    setAuthState((prev) => ({
      ...prev,
      userProfile: prev.userProfile ? { ...prev.userProfile, ...patch } : prev.userProfile
    }));
  };

  const generateWorkspaceId = () => {
    const prefix = 'key_';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!';
    const size = 28;
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${prefix}${token}`;
  };

  useEffect(() => {
    // Tracks the real-time profile listener so we can clean it up on logout/switch
    let profileUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Always clean up previous profile listener first
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      // 1. Si no hay usuario, limpiamos todo de golpe
      if (!firebaseUser) {
        setAuthState({
          user: null,
          userProfile: null,
          loading: false,
        });
        return;
      }

      // 2. Si hay usuario, mantenemos loading en true mientras buscamos el perfil
      setAuthState(prev => ({ ...prev, user: firebaseUser, loading: true }));

      try {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);

        const ensureBusiness = async (businessId: string, ownerId: string, name: string) => {
          await setDoc(
            doc(db, 'businesses', businessId),
            {
              name,
              ownerId,
              createdAt: new Date().toISOString(),
              plan: 'free_tier',
            },
            { merge: true }
          );
        };

        const ensureMembership = async (businessId: string, userId: string, role: UserProfile['role']) => {
          await setDoc(
            doc(db, 'businesses', businessId, 'members', userId),
            {
              uid: userId,
              role,
              permissions: { read: true, write: true },
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
        };

        let finalProfile: UserProfile | null = null;

        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          // Ensure uid is always set (doc ID = auth UID)
          if (!profile.uid) profile.uid = firebaseUser.uid;
          // Forzar sincronía de ID — también persiste en Firestore si falta businessId
          if (profile.empresa_id && !profile.businessId) {
            profile.businessId = profile.empresa_id;
          }

          let needsProfileUpdate = false;
          const firestoreUpdate: Record<string, unknown> = {};

          // Auto-repair: si tiene businessId pero status quedó en PENDING_SETUP por bug anterior, restaurar
          if (profile.businessId && profile.status === 'PENDING_SETUP') {
            profile.status = 'ACTIVE';
            firestoreUpdate.status = 'ACTIVE';
            needsProfileUpdate = true;
          }
          if (!profile.displayName) {
            profile.displayName = profile.fullName || profile.email || 'Usuario';
            firestoreUpdate.displayName = profile.displayName;
            needsProfileUpdate = true;
          }
          if (!profile.role) {
            profile.role = 'owner';
            firestoreUpdate.role = 'owner';
            needsProfileUpdate = true;
          }
          if (!profile.status) {
            profile.status = 'ACTIVE';
            firestoreUpdate.status = 'ACTIVE';
            needsProfileUpdate = true;
          }
          // Persistir businessId en Firestore si solo existía como empresa_id
          if (profile.businessId && !docSnap.data().businessId) {
            firestoreUpdate.businessId = profile.businessId;
            needsProfileUpdate = true;
          }
          if (needsProfileUpdate) {
            const ownerId = profile.uid || firebaseUser.uid;
            try {
              await updateDoc(doc(db, 'users', ownerId), firestoreUpdate);
            } catch (e) {
              console.warn('[AuthContext] profile update failed (may lack permissions):', e);
            }
          }
          // Solo asegurar membership si el usuario está activo (no pendientes de aprobación)
          if (profile.businessId && profile.status !== 'PENDING_APPROVAL' && profile.role !== 'pending') {
            const ownerId = profile.uid || firebaseUser.uid;
            const role = (profile.role || 'owner') as UserProfile['role'];
            try {
              await ensureMembership(profile.businessId, ownerId, role);
            } catch (e) {
              console.warn('[AuthContext] ensureMembership failed (may lack permissions):', e);
            }
          }
          finalProfile = profile;
        } else {
          // Race condition: el doc puede estar siendo creado por Register.tsx.
          // Reintentamos una vez después de 1.5s.
          await new Promise(r => setTimeout(r, 1500));
          const retrySnap = await getDoc(docRef);
          if (retrySnap.exists()) {
            const profile = retrySnap.data() as UserProfile;
            if (profile.empresa_id && !profile.businessId) {
              profile.businessId = profile.empresa_id;
            }
            if (!profile.displayName) {
              profile.displayName = profile.fullName || profile.email || 'Usuario';
            }
            if (!profile.role) profile.role = 'owner';
            if (!profile.status) profile.status = 'PENDING_SETUP';
            finalProfile = profile;
          } else {
            finalProfile = null;
          }
        }
        
        // 3. FINALMENTE: Actualizamos todo el estado atómicamente
        setAuthState({
          user: firebaseUser,
          userProfile: finalProfile,
          loading: false,
        });

        // 4. Escucha cambios en tiempo real al perfil (rol, suspensión, etc.)
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), snap => {
          if (!snap.exists()) return;
          const data = snap.data() as UserProfile;
          const updated: UserProfile = {
            ...data,
            uid: data.uid || firebaseUser.uid,
            businessId: data.businessId || data.empresa_id || '',
            displayName: data.displayName || data.fullName || data.email || 'Usuario',
            role: data.role || 'owner',
            status: data.status || 'ACTIVE',
          };
          // Si el admin suspendió al usuario, cerramos sesión inmediatamente
          if (updated.status === 'DISABLED') {
            auth.signOut();
            return;
          }
          setAuthState(prev => prev.user ? { ...prev, userProfile: updated } : prev);
        }, () => { /* ignorar errores del listener */ });

      } catch (error) {
        console.error('Error buscando perfil:', error);
        setAuthState({
          user: firebaseUser,
          userProfile: null,
          loading: false,
        });
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const resolveLanguageFromProfile = (profile?: UserProfile | null) => {
    if (!profile) return null;
    const explicit = (profile.language || '').toLowerCase();
    if (explicit === 'es' || explicit === 'en' || explicit === 'ar') return explicit;
    const country = (profile.country || '').toUpperCase();
    if (country === 'VE' || country.includes('VENEZ')) return 'es';
    if (country === 'US' || country.includes('UNITED') || country.includes('ESTADOS')) return 'en';
    if (country === 'AE' || country.includes('EMIR')) return 'ar';
    return null;
  };

  useEffect(() => {
    const nextLanguage = resolveLanguageFromProfile(authState.userProfile);
    if (!nextLanguage) return;
    if (i18n.language !== nextLanguage) {
      i18n.changeLanguage(nextLanguage);
    }
  }, [authState.userProfile?.country, authState.userProfile?.language]);

  // Load businessConfigs for isolation mode — one-time read to save quota
  useEffect(() => {
    const businessId = authState.userProfile?.businessId;
    if (!businessId) return;
    getDoc(doc(db, 'businessConfigs', businessId)).then(snap => {
      if (snap.exists()) {
        const personalBooks = snap.data()?.features?.personalBooks;
        const mode: 'individual' | 'shared' = personalBooks ? 'individual' : 'shared';
        setIsolationMode(mode);
        localStorage.setItem('operation_isolation_mode', mode);
      }
    }).catch(() => {});
  }, [authState.userProfile?.businessId]);

  return (
    <AuthContext.Provider value={{
      user: authState.user,
      userProfile: authState.userProfile,
      loading: authState.loading,
      isolationMode,
      updateUserProfile
    }}>
      {!authState.loading && children}
    </AuthContext.Provider>
  );
};
