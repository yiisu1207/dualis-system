import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';
import type { CustomRate } from '../../types';

interface Rates {
  tasaBCV: number;
  tasaGrupo: number;
  tasaDivisa: number;
  lastUpdated: string;
}

interface RatesContextValue {
  rates: Rates;
  customRates: CustomRate[];
  zoherEnabled: boolean;
  loading: boolean;
  updateRates: (newRates: Partial<Rates>) => Promise<void>;
  updateCustomRates: (newCustomRates: CustomRate[]) => Promise<void>;
  setZoherEnabled: (enabled: boolean) => Promise<void>;
  fetchBCVRate: () => Promise<number | null>;
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined);

export const RatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [rates, setRates] = useState<Rates>({ tasaBCV: 0, tasaGrupo: 0, tasaDivisa: 0, lastUpdated: '' });
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [zoherEnabled, setZoherEnabledState] = useState(false);
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

        const grupoVal = Number(data.tasaGrupo || 42.0);
        const divisaVal = Number(data.tasaDivisa || (grupoVal > 0 ? grupoVal - 1 : 41.0));

        setRates({
          tasaBCV: currentBCV,
          tasaGrupo: grupoVal,
          tasaDivisa: divisaVal,
          lastUpdated: lastUpd,
        });

        // Custom rates: leer del doc o migrar desde campos legacy
        if (Array.isArray(data.customRates)) {
          setCustomRates(data.customRates);
        } else if (grupoVal > 0) {
          // Migración automática: construir array desde campos legacy
          const migrated: CustomRate[] = [
            { id: 'GRUPO', name: 'Grupo', value: grupoVal, enabled: true },
            { id: 'DIVISA', name: 'Divisa', value: divisaVal, enabled: true },
          ];
          setCustomRates(migrated);
        }

        setZoherEnabledState(!!data.zoherEnabled);

        // AUTO-UPDATE: Si no se ha actualizado hoy, buscar la tasa
        const today = new Date().toISOString().split('T')[0];
        if (!lastUpd.startsWith(today)) {
          const freshRate = await fetchBCVRate();
          if (freshRate && freshRate !== currentBCV) {
            await updateRates({ tasaBCV: freshRate });
          }
        }
      } else {
        // Doc doesn't exist yet — start with BCV only, no custom rates
        setRates({ tasaBCV: 36.5, tasaGrupo: 0, tasaDivisa: 0, lastUpdated: new Date().toISOString() });
        setCustomRates([]);
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

  const updateCustomRates = async (newCustomRates: CustomRate[]) => {
    if (!businessId) return;
    const docRef = doc(db, 'businessConfigs', businessId);
    // Sync legacy fields for backward compat
    const grupoRate = newCustomRates.find((r) => r.id === 'GRUPO');
    const divisaRate = newCustomRates.find((r) => r.id === 'DIVISA');
    await setDoc(docRef, {
      customRates: newCustomRates,
      ...(grupoRate ? { tasaGrupo: grupoRate.value } : {}),
      ...(divisaRate ? { tasaDivisa: divisaRate.value } : {}),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  };

  const setZoherEnabled = async (enabled: boolean) => {
    if (!businessId) return;
    const docRef = doc(db, 'businessConfigs', businessId);
    await setDoc(docRef, { zoherEnabled: enabled }, { merge: true });
  };

  return (
    <RatesContext.Provider value={{
      rates, customRates, zoherEnabled, loading,
      updateRates, updateCustomRates, setZoherEnabled, fetchBCVRate,
    }}>
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
