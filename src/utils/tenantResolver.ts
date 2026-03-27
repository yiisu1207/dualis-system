import { doc, getDoc, setDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Dominios base donde corre Dualis.
 * En dev: localhost, en prod: dualis.app (o el dominio que uses).
 * Cualquier hostname que NO sea uno de estos se trata como subdominio custom.
 */
const BASE_DOMAINS = [
  'localhost',
  '127.0.0.1',
  'dualis.app',
  'www.dualis.app',
  'dualis-erp.vercel.app',
];

/** Dominios reservados que no se pueden usar como slug */
const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'panel', 'login', 'register',
  'help', 'support', 'docs', 'blog', 'status', 'mail', 'smtp',
  'ftp', 'dev', 'staging', 'test', 'demo', 'cdn', 'assets',
  'static', 'media', 'pos', 'kiosk', 'caja',
]);

/**
 * Extrae el slug del subdominio desde el hostname actual.
 * Ej: "mitienda.dualis.app" → "mitienda"
 *     "localhost:6000"       → null (no hay subdominio)
 *     "dualis.app"           → null (es el dominio base)
 */
export function extractSubdomain(): string | null {
  const hostname = window.location.hostname.toLowerCase();

  // localhost / IP → no hay subdominio
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // Verificar si es un dominio base exacto
  if (BASE_DOMAINS.includes(hostname)) {
    return null;
  }

  // Extraer la primera parte del hostname
  // "mitienda.dualis.app" → parts = ["mitienda", "dualis", "app"]
  const parts = hostname.split('.');
  if (parts.length < 3) {
    // Solo "dualis.app" → no hay subdominio
    return null;
  }

  const subdomain = parts[0];

  // Verificar que no sea un subdominio reservado
  if (RESERVED_SLUGS.has(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Busca en Firestore el businessId asociado a un slug.
 * Collection: tenants/{slug} → { businessId, name, createdAt }
 */
export async function resolveSlugToBusinessId(slug: string): Promise<{
  businessId: string;
  businessName: string;
  logoUrl?: string;
} | null> {
  try {
    const tenantDoc = await getDoc(doc(db, 'tenants', slug.toLowerCase()));
    if (!tenantDoc.exists()) return null;
    const data = tenantDoc.data();
    return {
      businessId: data.businessId,
      businessName: data.businessName || data.name || slug,
      logoUrl: data.logoUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Registra un slug para una empresa.
 * Valida unicidad y formato.
 */
export async function registerTenantSlug(
  slug: string,
  businessId: string,
  businessName: string,
  logoUrl?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = slug.toLowerCase().trim();

  // Validar formato: solo letras, números y guiones, 3-30 chars
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(normalized)) {
    return { ok: false, error: 'El slug debe tener 3-30 caracteres, solo letras, números y guiones.' };
  }

  if (RESERVED_SLUGS.has(normalized)) {
    return { ok: false, error: 'Este nombre está reservado. Elige otro.' };
  }

  // Verificar que no exista
  const existing = await getDoc(doc(db, 'tenants', normalized));
  if (existing.exists()) {
    const existingData = existing.data();
    if (existingData.businessId !== businessId) {
      return { ok: false, error: 'Este nombre ya está en uso por otra empresa.' };
    }
    // Ya existe para este mismo negocio, actualizar
  }

  await setDoc(doc(db, 'tenants', normalized), {
    slug: normalized,
    businessId,
    businessName,
    logoUrl: logoUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { ok: true };
}

/**
 * Busca el slug actual de una empresa.
 */
export async function getSlugForBusiness(businessId: string): Promise<string | null> {
  try {
    const q = query(collection(db, 'tenants'), where('businessId', '==', businessId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch {
    return null;
  }
}

/**
 * Valida si un slug está disponible.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const normalized = slug.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(normalized)) return false;
  if (RESERVED_SLUGS.has(normalized)) return false;
  const existing = await getDoc(doc(db, 'tenants', normalized));
  return !existing.exists();
}

/**
 * Genera un slug automático a partir del nombre de la empresa.
 * Ej: "Mi Tienda Express" → "mi-tienda-express"
 *     "Bodegón El Rey 2" → "bodegon-el-rey-2"
 * Si el slug generado ya existe, añade un sufijo numérico.
 */
export async function generateAutoSlug(businessName: string, businessId: string): Promise<string | null> {
  // Normalizar: quitar acentos, lowercase, reemplazar espacios y caracteres especiales
  let base = businessName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // solo alfanuméricos, espacios y guiones
    .trim()
    .replace(/\s+/g, '-')           // espacios → guiones
    .replace(/-+/g, '-')            // múltiples guiones → uno
    .replace(/^-|-$/g, '');         // quitar guiones al inicio/final

  // Asegurar longitud mínima
  if (base.length < 3) base = base + '-app';
  // Truncar si es muy largo
  if (base.length > 28) base = base.slice(0, 28).replace(/-$/, '');

  // Verificar reservados
  if (RESERVED_SLUGS.has(base)) base = base + '-erp';

  // Intentar slug base primero
  let candidate = base;
  let attempt = 0;
  const maxAttempts = 10;

  while (attempt < maxAttempts) {
    const existing = await getDoc(doc(db, 'tenants', candidate));
    if (!existing.exists()) {
      // Disponible — registrar y retornar
      await setDoc(doc(db, 'tenants', candidate), {
        slug: candidate,
        businessId,
        businessName,
        logoUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return candidate;
    }
    // Si ya existe para este mismo negocio, retornar
    if (existing.data().businessId === businessId) return candidate;
    // Probar con sufijo
    attempt++;
    candidate = `${base}-${attempt}`;
  }
  return null; // No se pudo generar
}

/** Genera la URL completa del subdominio */
export function buildSubdomainUrl(slug: string): string {
  const proto = window.location.protocol;
  // En producción usa tu dominio real
  const baseDomain = window.location.hostname === 'localhost'
    ? `localhost:${window.location.port}`
    : 'dualis.app';

  if (window.location.hostname === 'localhost') {
    // En dev no se pueden usar subdominios fácilmente, retornar URL con query param
    return `${proto}//${baseDomain}?tenant=${slug}`;
  }

  return `${proto}//${slug}.${baseDomain}`;
}
