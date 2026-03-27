/**
 * Seed script: creates tenant slugs for existing businesses.
 * Run from browser console or a temporary button.
 *
 * Usage (in browser console after login):
 *   import('./utils/seedTenants').then(m => m.seedExistingTenants())
 */
import { registerTenantSlug } from './tenantResolver';

const EXISTING_TENANTS = [
  {
    slug: 'minimarket-armando',
    businessId: 'key_Ai8A-_i18UyGBPOebzFa8WYfqoDu',
    businessName: 'MiniMarket Armando',
  },
  {
    slug: 'boutique-los-angeles',
    businessId: 'key_TFT8_hWY3J.PLe1TSoNtDtQSWqRn',
    businessName: 'Boutique Los Angeles',
  },
];

export async function seedExistingTenants() {
  const results: { slug: string; ok: boolean; error?: string }[] = [];

  for (const t of EXISTING_TENANTS) {
    const res = await registerTenantSlug(t.slug, t.businessId, t.businessName);
    if (res.ok) {
      results.push({ slug: t.slug, ok: true });
      console.log(`[seedTenants] ✓ ${t.slug} → ${t.businessId}`);
    } else {
      const errMsg = 'error' in res ? res.error : 'Unknown error';
      results.push({ slug: t.slug, ok: false, error: errMsg });
      console.warn(`[seedTenants] ✗ ${t.slug}: ${errMsg}`);
    }
  }

  console.table(results);
  return results;
}
