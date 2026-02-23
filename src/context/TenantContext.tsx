import React, { createContext, useContext } from 'react';

type TenantContextValue = {
  tenantId: string;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={{ tenantId }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
