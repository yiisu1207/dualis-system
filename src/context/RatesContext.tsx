import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';

interface Rates {
  tasaBCV: number;
  tasaGrupo: number;
  lastUpdated: string;
}

interface RatesContextValue {
  rates: Rates;
  loading: boolean;
  updateRates: (newRates: Partial<Rates>) => Promise<void>;
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined);

export const RatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [rates, setRates] = useState<Rates>({ tasaBCV: 0, tasaGrupo: 0, lastUpdated: '' });
  const [loading, setLoading] = useState(true);

  const businessId = userProfile?.businessId;

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, 'businessConfigs', businessId);
    
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRates({
          tasaBCV: Number(data.tasaBCV || 36.5),
          tasaGrupo: Number(data.tasaGrupo || 42.0),
          lastUpdated: data.updatedAt || '',
        });
      } else {
        // Valores por defecto si no existe el documento
        setRates({ tasaBCV: 36.5, tasaGrupo: 42.0, lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to rates:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [businessId]);

  const updateRates = async (newRates: Partial<Rates>) => {
    if (!businessId) return;
    const docRef = doc(db, 'businessConfigs', businessId);
    await setDoc(docRef, {
      ...newRates,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  };

  return (
    <RatesContext.Provider value={{ rates, loading, updateRates }}>
      {children}
    </RatesContext.Provider>
  );
};

export const useRates = () => {
  const context = useContext(RatesContext);
  if (context === undefined) {
    throw new Error('useRates must be used within a RatesProvider');
  }
  return context;
};
