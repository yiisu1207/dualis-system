import { useMemo } from 'react';
import { getPreset, type BusinessPreset } from '../data/businessPresets';

/**
 * Returns the BusinessPreset for the current business type.
 * Falls back to 'general' if no type is set.
 */
export function useBusinessPreset(tipoNegocio?: string | null): BusinessPreset {
  return useMemo(() => getPreset(tipoNegocio), [tipoNegocio]);
}
