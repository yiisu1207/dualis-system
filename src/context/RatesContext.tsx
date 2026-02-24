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
  fetchBCVRate: () => Promise<number | null>;
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined);

export const RatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [rates, setRates] = useState<Rates>({ tasaBCV: 0, tasaGrupo: 0, lastUpdated: '' });
  const [loading, setLoading] = useState(true);

  const businessId = userProfile?.businessId;

  const fetchBCVRate = async () => {
    try {
      const res = await fetch('/api/bcv');
      const data = await res.json();
      return data.rate || null;
    } catch (e) {
      console.error("Error fetching BCV:", e);
      return null;
    }
  };

  useEffect(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, 'businessConfigs', businessId);
    
    const unsub = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const currentBCV = Number(data.tasaBCV || 36.5);
        const lastUpd = data.updatedAt || '';
        
        setRates({
          tasaBCV: currentBCV,
          tasaGrupo: Number(data.tasaGrupo || 42.0),
          lastUpdated: lastUpd,
        });

        // AUTO-UPDATE: Si no se ha actualizado hoy, buscar la tasa
        const today = new Date().toISOString().split('T')[0];
        if (!lastUpd.startsWith(today)) {
          const freshRate = await fetchBCVRate();
          if (freshRate && freshRate !== currentBCV) {
            await updateRates({ tasaBCV: freshRate });
          }
        }
      } else {
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
    <RatesContext.Provider value={{ rates, loading, updateRates, fetchBCVRate }}>
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
