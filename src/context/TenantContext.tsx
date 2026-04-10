import React, { createContext, useContext } from 'react';
import { useSubdomain } from './SubdomainContext';
import { useAuth } from './AuthContext';

type TenantContextValue = {
  tenantId: string;
};

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Explicit provider — recibe el tenantId resuelto manualmente.
 * Usado por KioskGate (token-opaque resolution) y casos especiales.
 */
export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={{ tenantId }}>{children}</TenantContext.Provider>;
}

/**
 * Auto-resolver — calcula el tenantId desde subdomain o el perfil del usuario,
 * sin depender de un segmento `:empresa_id` en la URL.
 *
 * Prioridad:
 *   1. SubdomainProvider.businessId (cuando el usuario entra por nolavistevenir.dualis.online)
 *   2. userProfile.businessId / empresa_id (fallback para apex domain)
 *
 * Si no hay tenantId resoluble, igual renderiza children con tenantId vacío
 * para que los guards downstream decidan a dónde redirigir.
 */
export function AutoTenantProvider({ children }: { children: React.ReactNode }) {
  const subdomain = useSubdomain();
  const { userProfile } = useAuth();
  const tenantId =
    subdomain.businessId ||
    userProfile?.businessId ||
    userProfile?.empresa_id ||
    '';
  return <TenantContext.Provider value={{ tenantId }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}

/**
 * Versión segura: devuelve `{ tenantId: '' }` si no hay provider montado,
 * útil para componentes que pueden renderizarse fuera del árbol admin.
 */
export function useTenantSafe(): TenantContextValue {
  const context = useContext(TenantContext);
  return context || { tenantId: '' };
}
