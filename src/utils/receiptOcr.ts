// Cliente de OCR de comprobantes — llama la Cloud Function `extractReceipt`
// que hace proxy a Anthropic Vision. La API key vive en el servidor.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/config';
import type { OperationType } from './bankReconciliation';

export interface ExtractedReceipt {
  amount: number | null;
  currency: 'USD' | 'VES' | null;
  date: string | null;
  reference: string | null;
  cedula: string | null;
  phone: string | null;
  operationType: OperationType | null;
  originBank: string | null;
  destinationBank: string | null;
  senderName: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/png;base64,XXXX → XXXX
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Error leyendo imagen'));
    reader.readAsDataURL(file);
  });
}

export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback básico (no criptográfico) por tamaño+nombre — solo para dedup en sesión.
  return `${file.size}_${file.name}_${file.lastModified}`;
}

export async function extractReceipt(file: File): Promise<ExtractedReceipt> {
  if (file.size > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 5 MB.`);
  }
  if (!file.type.startsWith('image/')) {
    throw new Error(`Tipo inválido: ${file.type}. Usa PNG, JPG o WEBP.`);
  }
  const base64 = await fileToBase64(file);
  const fn = httpsCallable(getFunctions(app), 'extractReceipt');
  const res = await fn({ imageBase64: base64, mimeType: file.type });
  return res.data as ExtractedReceipt;
}

export interface BatchItem {
  file: File;
  imageHash: string;
  result: ExtractedReceipt | null;
  error?: string;
}

export async function extractReceiptsBatch(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 3,
): Promise<BatchItem[]> {
  const items: BatchItem[] = await Promise.all(files.map(async (f) => ({
    file: f,
    imageHash: await hashFile(f),
    result: null,
  })));

  // Dedup por hash dentro del batch: si hay duplicados, solo procesa el primero.
  const seen = new Set<string>();
  const uniqueIdxs: number[] = [];
  items.forEach((it, i) => {
    if (seen.has(it.imageHash)) {
      it.error = `Duplicado en el batch (ya procesado)`;
    } else {
      seen.add(it.imageHash);
      uniqueIdxs.push(i);
    }
  });

  let done = 0;
  const total = items.length;
  onProgress?.(done, total);

  async function worker(idx: number) {
    const item = items[idx];
    try {
      item.result = await extractReceipt(item.file);
    } catch (err: any) {
      item.error = err?.message || String(err);
    } finally {
      done++;
      onProgress?.(done, total);
    }
  }

  const queue = [...uniqueIdxs];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    runners.push((async function next() {
      while (queue.length) {
        const idx = queue.shift()!;
        await worker(idx);
      }
    })());
  }
  await Promise.all(runners);

  // Contar duplicados como 'done' para el progress final.
  done = total;
  onProgress?.(done, total);

  return items;
}
