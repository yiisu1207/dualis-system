import { createContext } from 'react';

export interface PosKioskCtx {
  businessId: string;
  cajaId: string;
  token: string;
}

export const PosKioskContext = createContext<PosKioskCtx | null>(null);
