import React, { createContext, useContext, useEffect, useState } from 'react';
import { extractSubdomain, resolveSlugToBusinessId } from '../utils/tenantResolver';

interface SubdomainInfo {
  /** El slug del subdominio (ej: "mitienda") o null si no hay */
  slug: string | null;
  /** El businessId resuelto desde Firestore, o null */
  businessId: string | null;
  /** Nombre de la empresa asociada al subdominio */
  businessName: string | null;
  /** Logo de la empresa */
  logoUrl: string | null;
  /** true mientras se resuelve el subdominio */
  loading: boolean;
  /** true si el subdominio no se encontró en Firestore */
  notFound: boolean;
}

const SubdomainContext = createContext<SubdomainInfo>({
  slug: null,
  businessId: null,
  businessName: null,
  logoUrl: null,
  loading: true,
  notFound: false,
});

export function SubdomainProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<SubdomainInfo>({
    slug: null,
    businessId: null,
    businessName: null,
    logoUrl: null,
    loading: true,
    notFound: false,
  });

  useEffect(() => {
    const slug = extractSubdomain();

    // También soportar ?tenant=slug en dev
    const params = new URLSearchParams(window.location.search);
    const devSlug = params.get('tenant');
    const effectiveSlug = slug || devSlug;

    if (!effectiveSlug) {
      // No hay subdominio → app normal (landing, login genérico)
      setInfo({ slug: null, businessId: null, businessName: null, logoUrl: null, loading: false, notFound: false });
      return;
    }

    // Resolver slug → businessId desde Firestore
    resolveSlugToBusinessId(effectiveSlug).then(result => {
      if (result) {
        setInfo({
          slug: effectiveSlug,
          businessId: result.businessId,
          businessName: result.businessName,
          logoUrl: result.logoUrl || null,
          loading: false,
          notFound: false,
        });
      } else {
        setInfo({
          slug: effectiveSlug,
          businessId: null,
          businessName: null,
          logoUrl: null,
          loading: false,
          notFound: true,
        });
      }
    });
  }, []);

  return (
    <SubdomainContext.Provider value={info}>
      {children}
    </SubdomainContext.Provider>
  );
}

export function useSubdomain() {
  return useContext(SubdomainContext);
}
