import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import i18n from '../i18n';

// Definimos la "Ficha Técnica" del usuario
interface UserProfile {
  uid: string;
  email: string;
  businessId: string; // 👈 LA CLAVE: Esto conecta al usuario con SU empresa
  empresa_id?: string;
  role: 'owner' | 'admin' | 'ventas' | 'auditor' | 'pending' | 'staff' | 'member';
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
}

// Creamos el contexto
const AuthContext = createContext<{
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  updateUserProfile: (patch: Partial<UserProfile>) => void;
}>({ user: null, userProfile: null, loading: true, updateUserProfile: () => undefined });

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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
          // Forzar sincronía de ID
          if (profile.empresa_id && !profile.businessId) {
            profile.businessId = profile.empresa_id;
          }
          
          let needsProfileUpdate = false;
          
          if (!profile.businessId && profile.status === 'ACTIVE') {
            // Este es un estado inconsistente, lo enviamos a onboarding
            profile.status = 'PENDING_SETUP';
            needsProfileUpdate = true;
          }
          if (!profile.displayName) {
            profile.displayName = profile.fullName || profile.email || 'Usuario';
            needsProfileUpdate = true;
          }
          if (!profile.role) {
            profile.role = 'owner';
            needsProfileUpdate = true;
          }
          if (!profile.status) {
            profile.status = 'ACTIVE';
            needsProfileUpdate = true;
          }
          if (needsProfileUpdate) {
            const ownerId = profile.uid || firebaseUser.uid;
            await updateDoc(doc(db, 'users', ownerId), {
              displayName: profile.displayName,
              role: profile.role,
              status: profile.status,
            });
          }
          if (profile.businessId) {
            const ownerId = profile.uid || firebaseUser.uid;
            const role = (profile.role || 'owner') as UserProfile['role'];
            await ensureMembership(profile.businessId, ownerId, role);
          }
          finalProfile = profile;
        } else {
          // Si no existe el perfil (pero hay auth), no lo creamos automáticamente aquí
          // para dejar que OnboardingGate haga su trabajo si es necesario.
          // Pero para evitar el bucle, seteamos el usuario con perfil null.
          finalProfile = null;
        }
        
        // 3. FINALMENTE: Actualizamos todo el estado atómicamente
        setAuthState({
          user: firebaseUser,
          userProfile: finalProfile,
          loading: false,
        });
      } catch (error) {
        console.error('Error buscando perfil:', error);
        setAuthState({
          user: firebaseUser,
          userProfile: null,
          loading: false,
        });
      }
    });

    return () => unsubscribe();
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

  return (
    <AuthContext.Provider value={{ 
      user: authState.user, 
      userProfile: authState.userProfile, 
      loading: authState.loading, 
      updateUserProfile 
    }}>
      {!authState.loading && children}
    </AuthContext.Provider>
  );
};
