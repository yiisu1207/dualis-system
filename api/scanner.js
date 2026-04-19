// Vercel Serverless Function: /api/scanner
// Proxy for Gemini (text + vision). Reads API key from process.env.GOOGLE_API_KEY.

const { getAuth } = require('./_firebaseAdmin');
const { applyCors } = require('./_cors');

const MODEL = 'gemini-1.5-flash';
const RATE_LIMIT_PER_MINUTE = 30;
const rateLimitMap = new Map();

function checkRateLimit(uid) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const timestamps = (rateLimitMap.get(uid) || []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_PER_MINUTE) return false;
  timestamps.push(now);
  rateLimitMap.set(uid, timestamps);
  return true;
}

const fetchFn = globalThis.fetch
  ? (...args) => globalThis.fetch(...args)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  applyCors(req, res, 'POST,OPTIONS,GET');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Google API key not configured in environment.' });
  }

  // Auth: exige idToken válido para bloquear anónimos gastando cuotas Gemini.
  const bearer = req.headers.authorization?.replace('Bearer ', '') || '';
  if (!bearer) return res.status(401).json({ error: 'Missing token' });
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(bearer);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!checkRateLimit(decoded.uid)) {
    return res.status(429).json({ error: `Rate limit: ${RATE_LIMIT_PER_MINUTE} req/min` });
  }

  const { text, image, imageMimeType, images, mode, target } = req.body || {};

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const parts = [];

    if (text) {
      parts.push({ text });
    }

    if (image) {
      const mimeType = imageMimeType || 'image/jpeg';
      parts.push({
        inlineData: { mimeType, data: image },
      });
    }

    if (Array.isArray(images)) {
      images.forEach((img) => {
        if (img && typeof img === 'object') {
          const mimeType = img.mimeType || 'image/jpeg';
          if (img.data) parts.push({ inlineData: { mimeType, data: img.data } });
          return;
        }
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
      });
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'Missing "text" or "image" in request body.' });
    }

    const isOcr = mode === 'ocr';
    const isVisionText = mode === 'vision-text';
    const isVisionJson = mode === 'vision-json';

    let systemText = '';
    if (isOcr) {
      const targetHint = target === 'SUPPLIER' ? 'proveedor' : 'cliente';
      systemText = `Extrae datos de la factura o recibo. Devuelve SOLO JSON estricto con este esquema: { "entityName": string, "date": "YYYY-MM-DD" | "", "amount": number, "currency": "USD" | "BS" | "", "concept": string, "movementType": "FACTURA" | "ABONO", "accountType": "BCV" | "GRUPO" | "DIVISA" | "", "reference": string, "isSupplierMovement": boolean }. Si falta un campo, usa cadena vacia o 0. El entityName debe ser el ${targetHint}.`;
    }

    if (isVisionText) {
      systemText = 'ACTUA COMO AUDITOR CONTABLE. Extrae los movimientos de estas fotos del libro mayor. Genera un reporte resumido de lo que ves, indicando nombres de clientes y totales.';
    }

    if (isVisionJson) {
      systemText = 'Genera una lista de movimientos en JSON. Esquema: [{ customerName, date (YYYY-MM-DD), concept, amount (number), movementType (FACTURA|ABONO), accountType (BCV|GRUPO|DIVISA) }]. Se estricto con el formato.';
    }

    const payload = {
      contents: [
        {
          parts: [{ text: systemText || 'Responde de forma clara y breve.' }, ...parts],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: isOcr || isVisionJson ? 'application/json' : undefined,
      },
    };

    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Upstream error', details: data });

    const textOut = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    let result = textOut;

    if (isOcr || isVisionJson) {
      try {
        const clean = textOut.replace(/```json|```/g, '').trim();
        result = JSON.parse(clean);
      } catch (e) {
        // fall back to raw text
      }
    }

    return res.json({ result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
