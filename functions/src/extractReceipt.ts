/**
 * Cloud Function — extractReceipt
 *
 * Proxy a Anthropic Vision. Recibe una imagen base64, extrae datos de comprobante
 * bancario venezolano (pago móvil / transferencia / depósito). La API key vive
 * en el secret ANTHROPIC_KEY, nunca sale del servidor.
 *
 * Configurar antes del primer deploy:
 *   firebase functions:config:set anthropic.key="sk-ant-..."
 * (o en v1 con secrets: usar variable de entorno ANTHROPIC_KEY inyectada en runtime).
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const EXTRACT_PROMPT = `Eres un extractor de datos de comprobantes bancarios venezolanos. Analiza la imagen
(captura de pago móvil, transferencia, o depósito de Banesco/Mercantil/BDV/Provincial/BNC
o similares) y devuelve SOLO un JSON válido con esta estructura exacta:

{
  "amount": number | null,
  "currency": "USD" | "VES" | null,
  "date": "YYYY-MM-DD" | null,
  "reference": string | null,
  "cedula": string | null,
  "phone": string | null,
  "operationType": "pago_movil" | "transferencia" | "deposito" | "punto_venta" | null,
  "originBank": string | null,
  "destinationBank": string | null,
  "senderName": string | null,
  "confidence": "high" | "medium" | "low",
  "notes": string | null
}

Reglas:
- "amount" en la moneda visible. Solo el número, sin símbolos.
- "currency": USD si ves $/USD/Dólar, VES si Bs/Bolívares, null si no está claro.
- "date" en formato ISO YYYY-MM-DD.
- "reference": solo dígitos del número de comprobante/operación.
- "cedula": formato "V-12345678" (natural) o "J-123456789" (jurídica).
- "phone": formato "0414-1234567" (código + 7 dígitos).
- "operationType": elige el que mejor encaje; si no se ve claro, null.
- "confidence": tu confianza general en los datos extraídos.
- Si un campo no se ve claro, úsalo como null. NO inventes datos.
- NO añadas texto fuera del JSON. NO uses markdown. Solo el JSON crudo.`;

interface ExtractedReceipt {
  amount: number | null;
  currency: 'USD' | 'VES' | null;
  date: string | null;
  reference: string | null;
  cedula: string | null;
  phone: string | null;
  operationType: 'pago_movil' | 'transferencia' | 'deposito' | 'punto_venta' | null;
  originBank: string | null;
  destinationBank: string | null;
  senderName: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

const EMPTY: ExtractedReceipt = {
  amount: null, currency: null, date: null, reference: null,
  cedula: null, phone: null, operationType: null,
  originBank: null, destinationBank: null, senderName: null,
  confidence: 'low', notes: null,
};

function getAnthropicKey(): string {
  // v1 functions: config via runtime env (firebase functions:config:set anthropic.key=...)
  const cfg = functions.config();
  const fromConfig = cfg?.anthropic?.key;
  if (fromConfig) return String(fromConfig);
  const fromEnv = process.env.ANTHROPIC_KEY;
  if (fromEnv) return fromEnv;
  throw new functions.https.HttpsError('failed-precondition', 'ANTHROPIC_KEY not configured');
}

async function callAnthropic(imageBase64: string, mimeType: string): Promise<ExtractedReceipt> {
  const apiKey = getAnthropicKey();
  const body = {
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: EXTRACT_PROMPT },
      ],
    }],
  };
  const res = await (globalThis as any).fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new functions.https.HttpsError(
      'internal',
      `Anthropic API error ${res.status}: ${txt.slice(0, 300)}`,
    );
  }
  const json: any = await res.json();
  const textBlock = (json.content || []).find((b: any) => b.type === 'text');
  const raw = String(textBlock?.text || '').trim();
  // Intenta parsear JSON crudo; si el modelo devolvió con fence ```json ``` lo quitamos.
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: Partial<ExtractedReceipt>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    functions.logger.warn('[extractReceipt] Unparseable model output', { len: raw.length });
    return { ...EMPTY, notes: 'Respuesta del modelo no parseable como JSON' };
  }
  return { ...EMPTY, ...parsed };
}

export const extractReceipt = functions
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login requerido');
    }

    // Verificar rol — el token custom claim `role` se setea al crear/actualizar el usuario.
    // Si no hay claim aún, leer el doc users/{uid}.
    let role = (context.auth.token as any).role as string | undefined;
    if (!role) {
      const userDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
      role = (userDoc.data()?.role as string | undefined) || 'member';
    }
    if (!['owner', 'admin'].includes(role)) {
      throw new functions.https.HttpsError('permission-denied', 'Solo owner/admin');
    }

    const imageBase64 = String(data?.imageBase64 || '');
    const mimeType = String(data?.mimeType || '');
    if (!imageBase64) {
      throw new functions.https.HttpsError('invalid-argument', 'imageBase64 requerido');
    }
    if (!mimeType.startsWith('image/')) {
      throw new functions.https.HttpsError('invalid-argument', 'mimeType debe ser image/*');
    }
    // Tamaño máximo: base64 inflate ≈ 4/3, así que 7MB en base64 ≈ 5MB en binary.
    if (imageBase64.length > 7 * 1024 * 1024) {
      throw new functions.https.HttpsError('invalid-argument', 'Imagen demasiado grande (>5MB)');
    }

    const result = await callAnthropic(imageBase64, mimeType);
    return result;
  });
