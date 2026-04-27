// Búsqueda de info de producto por código de barras en cascada a través de
// varios providers gratuitos. Llama directo desde el cliente (todos permiten
// CORS), así no necesita serverless function ni configuración de proxy en dev.
//
// Cascada:
//   1. Open Food Facts          (100% gratis, sin límite, sin key)
//   2. UPC ItemDB (trial)       (100 req/día por IP)
//   3. Open Beauty Facts        (100% gratis, productos cosmética)
//   4. Open Products Facts      (100% gratis, productos generales)

export interface LookupProductData {
  name: string;
  brand: string;
  category: string;
  description: string;
  image: string | null;
  allImages: string[];
}

export interface LookupResult {
  ok: boolean;
  source?: string;
  sourceLabel?: string;
  barcode?: string;
  product?: LookupProductData;
  error?: string;
  attempts?: { provider: string; found: boolean; error?: string }[];
}

interface Provider {
  name: string;
  label: string;
  fn: (barcode: string) => Promise<LookupProductData | null>;
}

// ─── Providers ─────────────────────────────────────────────────────────────

async function fetchOpenFoodFacts(barcode: string): Promise<LookupProductData | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const images: string[] = [];
  if (p.image_url) images.push(p.image_url);
  if (p.image_front_url && !images.includes(p.image_front_url)) images.push(p.image_front_url);
  if (p.selected_images?.front?.display?.es) images.push(p.selected_images.front.display.es);
  if (p.selected_images?.front?.display?.en) images.push(p.selected_images.front.display.en);
  const uniqueImages = Array.from(new Set(images.filter(Boolean)));
  if (!p.product_name && uniqueImages.length === 0) return null;
  return {
    name: p.product_name || p.product_name_es || p.product_name_en || '',
    brand: (p.brands || '').split(',')[0]?.trim() || '',
    category: ((p.categories_tags?.[0] as string) || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' '),
    description: p.generic_name || p.generic_name_es || '',
    image: uniqueImages[0] || null,
    allImages: uniqueImages,
  };
}

async function fetchUpcItemDB(barcode: string): Promise<LookupProductData | null> {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== 'OK' || !Array.isArray(data.items) || data.items.length === 0) return null;
  const item = data.items[0];
  const images: string[] = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
  if (!item.title && images.length === 0) return null;
  return {
    name: item.title || '',
    brand: item.brand || '',
    category: item.category || '',
    description: item.description || '',
    image: images[0] || null,
    allImages: images,
  };
}

async function fetchOpenBeautyFacts(barcode: string): Promise<LookupProductData | null> {
  const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const images: string[] = [];
  if (p.image_url) images.push(p.image_url);
  if (p.image_front_url && !images.includes(p.image_front_url)) images.push(p.image_front_url);
  const uniqueImages = Array.from(new Set(images.filter(Boolean)));
  if (!p.product_name && uniqueImages.length === 0) return null;
  return {
    name: p.product_name || '',
    brand: (p.brands || '').split(',')[0]?.trim() || '',
    category: ((p.categories_tags?.[0] as string) || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' '),
    description: p.generic_name || '',
    image: uniqueImages[0] || null,
    allImages: uniqueImages,
  };
}

async function fetchOpenProductsFacts(barcode: string): Promise<LookupProductData | null> {
  const url = `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const images: string[] = [];
  if (p.image_url) images.push(p.image_url);
  if (p.image_front_url && !images.includes(p.image_front_url)) images.push(p.image_front_url);
  const uniqueImages = Array.from(new Set(images.filter(Boolean)));
  if (!p.product_name && uniqueImages.length === 0) return null;
  return {
    name: p.product_name || '',
    brand: (p.brands || '').split(',')[0]?.trim() || '',
    category: ((p.categories_tags?.[0] as string) || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' '),
    description: p.generic_name || '',
    image: uniqueImages[0] || null,
    allImages: uniqueImages,
  };
}

const PROVIDERS: Provider[] = [
  { name: 'openfoodfacts', label: 'Open Food Facts', fn: fetchOpenFoodFacts },
  { name: 'upcitemdb', label: 'UPC ItemDB', fn: fetchUpcItemDB },
  { name: 'openbeautyfacts', label: 'Open Beauty Facts', fn: fetchOpenBeautyFacts },
  { name: 'openproductsfacts', label: 'Open Products Facts', fn: fetchOpenProductsFacts },
];

/**
 * Busca un producto por código de barras en cascada a través de varios
 * providers gratuitos. Devuelve el primer match exitoso.
 */
export async function lookupProductByBarcode(barcode: string): Promise<LookupResult> {
  const code = String(barcode || '').trim();
  if (!code || code.length < 6) {
    return { ok: false, error: 'Código de barras inválido (mínimo 6 dígitos)' };
  }

  const attempts: { provider: string; found: boolean; error?: string }[] = [];
  for (const provider of PROVIDERS) {
    try {
      const result = await provider.fn(code);
      attempts.push({ provider: provider.name, found: !!result });
      if (result && (result.image || result.name)) {
        return {
          ok: true,
          source: provider.name,
          sourceLabel: provider.label,
          barcode: code,
          product: result,
          attempts,
        };
      }
    } catch (err: any) {
      attempts.push({ provider: provider.name, found: false, error: err?.message || String(err) });
    }
  }

  return {
    ok: false,
    barcode: code,
    error: 'No encontrado en ninguna base de datos',
    attempts,
  };
}
