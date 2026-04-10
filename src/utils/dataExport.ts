import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

type ProgressCallback = (msg: string, pct: number) => void;

const COLLECTIONS = [
  'customers',
  'products',
  'movements',
  'suppliers',
  'stock_movements',
  'commissions',
  'loyaltyAccounts',
  'loyaltyEvents',
  'appointments',
  'preorders',
  'repair_tickets',
  'quotes',
  'bankAccounts',
  'terminals',
  'almacenes',
  'categories',
] as const;

function toCsvRow(obj: Record<string, unknown>, keys: string[]): string {
  return keys
    .map(k => {
      const v = obj[k];
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Escape CSV: wrap in quotes if contains comma, newline, or double quote
      if (s.includes(',') || s.includes('\n') || s.includes('"')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

function docsToCsv(docs: Array<Record<string, unknown>>): string {
  if (docs.length === 0) return '';
  // Collect all unique keys across all docs
  const keySet = new Set<string>();
  docs.forEach(d => Object.keys(d).forEach(k => keySet.add(k)));
  const keys = Array.from(keySet).sort();
  const header = keys.join(',');
  const rows = docs.map(d => toCsvRow(d, keys));
  return [header, ...rows].join('\n');
}

export async function exportBusinessData(
  businessId: string,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  // Lazy-load jszip to keep initial bundle small
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const manifest: Record<string, number> = {};
  const total = COLLECTIONS.length;

  for (let i = 0; i < COLLECTIONS.length; i++) {
    const name = COLLECTIONS[i];
    onProgress?.(`Exportando ${name}...`, Math.round(((i) / total) * 100));

    try {
      const snap = await getDocs(collection(db, `businesses/${businessId}/${name}`));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      manifest[name] = docs.length;

      if (docs.length > 0) {
        zip.file(`${name}.csv`, docsToCsv(docs as Array<Record<string, unknown>>));
      }
    } catch (err) {
      console.warn(`[export] skipped ${name}:`, err);
      manifest[name] = -1; // Error indicator
    }
  }

  // Add manifest
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        businessId,
        collections: manifest,
      },
      null,
      2,
    ),
  );

  onProgress?.('Generando ZIP...', 95);
  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('¡Listo!', 100);
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
