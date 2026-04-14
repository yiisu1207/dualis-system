import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';
import { backfillMissingRatesUpTo } from '../utils/rateBackfill';
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
  /** true si hoy no se pudo refrescar la tasa BCV y se está usando la última conocida */
  usingStaleRate: boolean;
  /** fecha ISO de la última vez que se intentó un fetch BCV (éxito o fallo) */
  lastFetchAttempt: string | null;
  updateRates: (newRates: Partial<Rates>) => Promise<void>;
  updateCustomRates: (newCustomRates: CustomRate[]) => Promise<void>;
  setZoherEnabled: (enabled: boolean) => Promise<void>;
  fetchBCVRate: () => Promise<number | null>;
  /** fuerza un re-fetch manual ignorando el check "ya se actualizó hoy" */
  forceRefreshBCV: () => Promise<number | null>;
}

const RatesContext = createContext<RatesContextValue | undefined>(undefined);

/**
 * Fuentes públicas de la tasa BCV. Se intentan en orden; la primera que responde gana.
 * Todas soportan CORS desde el navegador (verificado 2026-04).
 *
 * Si todas fallan, el contexto mantiene la última tasa conocida y expone
 * `usingStaleRate=true` para que la UI muestre un banner "Usando tasa de DD/MM".
 *
 * Nota: NO usamos `/api/bcv` porque el backend no existe en Firebase Hosting
 * (no tenemos Cloud Functions). Todo corre client-side.
 */
const BCV_SOURCES: Array<{ name: string; url: string; parse: (data: unknown) => number | null }> = [
  {
    name: 've.dolarapi.com',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (data) => {
      const d = data as { promedio?: number };
      return typeof d?.promedio === 'number' && d.promedio > 0 ? d.promedio : null;
    },
  },
  {
    name: 'pydolarve.org',
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd',
    parse: (data) => {
      const d = data as { price?: number; monitors?: { usd?: { price?: number } } };
      const price = d?.price ?? d?.monitors?.usd?.price;
      return typeof price === 'number' && price > 0 ? price : null;
    },
  },
];

async function fetchBCVFromSources(): Promise<{ rate: number; source: string } | null> {
  for (const source of BCV_SOURCES) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000); // 5s timeout
      const res = await fetch(source.url, { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = source.parse(data);
      if (rate && rate > 0) {
        return { rate, source: source.name };
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[RatesContext] Fuente BCV ${source.name} falló:`, e);
    }
  }
  return null;
}

export const RatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [rates, setRates] = useState<Rates>({ tasaBCV: 0, tasaGrupo: 0, tasaDivisa: 0, lastUpdated: '' });
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);
  const [zoherEnabledState, setZoherEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingStaleRate, setUsingStaleRate] = useState(false);
  const [lastFetchAttempt, setLastFetchAttempt] = useState<string | null>(null);

  const businessId = userProfile?.businessId;

  // Guarda contra re-ejecutar el auto-update en cada snapshot.
  // Bug original: el fetch estaba dentro del onSnapshot, así que cada
  // updateRates disparaba otro snapshot → otro fetch → loop.
  const autoUpdateAttemptedForDayRef = useRef<string | null>(null);

  const fetchBCVRate = async (): Promise<number | null> => {
    const result = await fetchBCVFromSources();
    setLastFetchAttempt(new Date().toISOString());
    if (result) {
      setUsingStaleRate(false);
      return result.rate;
    }
    setUsingStaleRate(true);
    return null;
  };

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

        // AUTO-UPDATE: una sola vez por día, fuera del callback del snapshot
        // para no generar loops de actualización.
        const today = new Date().toISOString().split('T')[0];
        if (!lastUpd.startsWith(today) && autoUpdateAttemptedForDayRef.current !== today) {
          autoUpdateAttemptedForDayRef.current = today;
          // Stale por defecto hasta que el fetch responda
          setUsingStaleRate(true);
          // Dispatch async sin bloquear el callback
          void (async () => {
            const freshRate = await fetchBCVRate();
            if (freshRate && Math.abs(freshRate - currentBCV) > 0.0001) {
              try {
                await setDoc(
                  doc(db, 'businessConfigs', businessId),
                  { tasaBCV: freshRate, updatedAt: new Date().toISOString() },
                  { merge: true },
                );
                setUsingStaleRate(false);
                try {
                  await backfillMissingRatesUpTo(
                    businessId,
                    today,
                    freshRate,
                    'auto-fetch',
                    { uid: 'system', displayName: 'Auto-fetch BCV' },
                  );
                } catch (bfErr) {
                  // eslint-disable-next-line no-console
                  console.error('[RatesContext] Backfill post-fetch falló:', bfErr);
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[RatesContext] No se pudo guardar la tasa fresca:', e);
              }
            } else if (freshRate) {
              // Misma tasa — ya estamos al día, pero marcar la fecha
              try {
                await setDoc(
                  doc(db, 'businessConfigs', businessId),
                  { updatedAt: new Date().toISOString() },
                  { merge: true },
                );
                setUsingStaleRate(false);
                try {
                  await backfillMissingRatesUpTo(
                    businessId,
                    today,
                    freshRate,
                    'auto-fetch',
                    { uid: 'system', displayName: 'Auto-fetch BCV' },
                  );
                } catch (bfErr) {
                  // eslint-disable-next-line no-console
                  console.error('[RatesContext] Backfill post-fetch (misma tasa) falló:', bfErr);
                }
              } catch {}
            }
            // Si freshRate es null, usingStaleRate queda true
          })();
        } else if (lastUpd.startsWith(today)) {
          setUsingStaleRate(false);
        }
      } else {
        // Doc doesn't exist yet — start with BCV only, no custom rates
        setRates({ tasaBCV: 36.5, tasaGrupo: 0, tasaDivisa: 0, lastUpdated: new Date().toISOString() });
        setCustomRates([]);
      }
      setLoading(false);
    }, (error) => {
      // eslint-disable-next-line no-console
      console.error('Error listening to rates:', error);
      setLoading(false);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const forceRefreshBCV = async (): Promise<number | null> => {
    if (!businessId) return null;
    autoUpdateAttemptedForDayRef.current = null; // reset
    const freshRate = await fetchBCVRate();
    if (freshRate) {
      await updateRates({ tasaBCV: freshRate });
    }
    return freshRate;
  };

  return (
    <RatesContext.Provider value={{
      rates, customRates, zoherEnabled: zoherEnabledState, loading,
      usingStaleRate, lastFetchAttempt,
      updateRates, updateCustomRates, setZoherEnabled, fetchBCVRate, forceRefreshBCV,
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
