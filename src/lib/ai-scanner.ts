// Client helper for the Vercel Serverless proxy at /api/scanner.

async function callProxy(payload: Record<string, any>) {
  const res = await fetch('/api/scanner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Proxy error: ${res.status} ${detail}`);
  }

  return await res.json();
}

export async function summarizeText(text: string): Promise<string> {
  const data = await callProxy({ text });
  return data?.result || '';
}

export async function scanInvoiceImage(file: File, target: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER') {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const mimeType = file.type || 'image/jpeg';

  const data = await callProxy({ image: base64, imageMimeType: mimeType, mode: 'ocr', target });
  const rawResult = data?.result || null;
  if (!rawResult) return null;

  const parseNumber = (value: string) => {
    let cleaned = value.trim();
    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    cleaned = cleaned.replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const normalizeDate = (value: string) => {
    const iso = value.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (iso) return iso[0];
    const slash = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
    return '';
  };

  const parseTextFallback = (text: string) => {
    const currencyMatch = text.match(/\b(usd|us\$|dolares|dólares|bs|bolivares|bolívares)\b/i);
    const amountMatch = text.match(/\b(amount|monto)\s*[:=]?\s*\$?\s*([0-9.,]+)/i);
    const dateMatch = normalizeDate(text);
    const entityMatch = text.match(/\b(proveedor|supplier|vendor|cliente|customer)\s*[:=]?\s*(.+)/i);

    const currencyToken = currencyMatch?.[1]?.toLowerCase() || '';
    const currency = currencyToken.includes('bs') || currencyToken.includes('bol') ? 'BS' : 'USD';

    const amount = amountMatch ? parseNumber(amountMatch[2]) : 0;
    const movementType = /\b(abono|pago|payment)\b/i.test(text) ? 'ABONO' : 'FACTURA';
    const accountType = /\bbcv\b/i.test(text)
      ? 'BCV'
      : /\bgrupo\b/i.test(text)
      ? 'GRUPO'
      : 'DIVISA';

    return {
      entityName: entityMatch ? entityMatch[2].trim() : '',
      date: dateMatch || '',
      amount,
      currency,
      concept: '',
      movementType,
      accountType,
      reference: '',
      isSupplierMovement: target === 'SUPPLIER',
    };
  };

  if (typeof rawResult === 'string') {
    const clean = rawResult.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch (e) {
      return parseTextFallback(clean);
    }
  }

  return rawResult;
}

export async function analyzeVisionText(images: string[]) {
  const normalized = images.map((img) => {
    if (img.startsWith('data:')) {
      const match = img.match(/^data:(.*?);base64,(.*)$/);
      if (match) return { data: match[2], mimeType: match[1] };
    }
    return img;
  });
  const data = await callProxy({ images: normalized, mode: 'vision-text' });
  return data?.result || '';
}

export async function analyzeVisionJson(images: string[]) {
  const normalized = images.map((img) => {
    if (img.startsWith('data:')) {
      const match = img.match(/^data:(.*?);base64,(.*)$/);
      if (match) return { data: match[2], mimeType: match[1] };
    }
    return img;
  });
  const data = await callProxy({ images: normalized, mode: 'vision-json' });
  return data?.result || [];
}
