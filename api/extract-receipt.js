// Vercel Serverless Function: /api/extract-receipt
// Proxy a Anthropic Vision para OCR de comprobantes bancarios.
// La API key ANTHROPIC_KEY vive en env vars de Vercel.

const { getAuth, getDb } = require('./_firebaseAdmin');

const MODEL = 'claude-sonnet-4-6';
const MAX_BYTES = 5 * 1024 * 1024;

const EXTRACT_PROMPT = `Eres un extractor de datos de comprobantes bancarios venezolanos. Analiza la imagen (captura de pago móvil, transferencia, o depósito de Banesco/Mercantil/BDV/Provincial/BNC o similares) y devuelve SOLO un JSON válido con esta estructura exacta:

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

- amount: monto numérico visible (sin separadores).
- currency: USD si dice $ o USD; VES si dice Bs.
- date: formato YYYY-MM-DD.
- reference: número de comprobante/operación, solo dígitos.
- cedula: formato "V-12345678" o "J-123456789".
- phone: formato "0414-1234567".
- Si un campo no se ve claro, devolvé null. NO inventes. NO añadas texto fuera del JSON.`;

const fetchFn = globalThis.fetch
  ? (...args) => globalThis.fetch(...args)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_KEY not configured in environment' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);

    // Role check: owner/admin solo. Role vive en /users/{uid}.
    const db = getDb();
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : null;
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'Solo owner/admin pueden extraer comprobantes' });
    }

    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 requerido' });
    }
    if (!mimeType || !/^image\/(png|jpe?g|webp)$/i.test(mimeType)) {
      return res.status(400).json({ error: 'mimeType inválido (usa PNG/JPG/WEBP)' });
    }
    // base64 length → aprox bytes = len * 3 / 4
    const approxBytes = Math.floor(imageBase64.length * 3 / 4);
    if (approxBytes > MAX_BYTES) {
      return res.status(413).json({ error: `Imagen excede 5 MB (${(approxBytes / 1024 / 1024).toFixed(1)} MB)` });
    }

    const anthropicRes = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      console.error('[extract-receipt] Anthropic error', anthropicRes.status, errText.slice(0, 500));
      return res.status(502).json({ error: `Anthropic API error ${anthropicRes.status}` });
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    const rawText = textBlock?.text || '';

    // Extraer el primer bloque JSON válido (a veces Claude envuelve con ```json).
    let jsonStr = rawText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[extract-receipt] JSON parse fail', rawText.slice(0, 300));
      return res.status(502).json({ error: 'La respuesta no era JSON válido' });
    }

    return res.json({
      ...parsed,
      usage: data.usage || null,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[extract-receipt] error', msg, err?.stack);
    // Detalle visible al cliente para distinguir misconfig vs token vs Anthropic
    let stage = 'internal';
    if (/FIREBASE_SERVICE_ACCOUNT/.test(msg)) stage = 'firebase_admin_init';
    else if (/verifyIdToken|auth\/|token/i.test(msg)) stage = 'auth_token';
    else if (/credential|service account/i.test(msg)) stage = 'firebase_admin_credential';
    return res.status(500).json({ error: msg, stage });
  }
};
