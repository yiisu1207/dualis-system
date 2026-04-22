// Vercel Serverless Function: /api/assistant
// Simple text proxy for Gemini. Reads API key from process.env.GOOGLE_API_KEY.

const { getAuth } = require('./_firebaseAdmin');
const { applyCors } = require('./_cors');

const MODEL = 'gemini-1.5-flash';
const RATE_LIMIT_PER_MINUTE = 60;
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

  const { prompt, system, temperature, messages, maxOutputTokens } = req.body || {};

  // Dos modos de invocación:
  //  1) one-shot: { prompt, system?, temperature? } — legacy, lo siguen usando otros callers.
  //  2) chat multi-turno: { system?, messages: [{ role: 'user'|'model', content: string }, ...] }
  //     (usado por SuperAdminPanel después de migrar fuera de VITE_GEMINI_API_KEY).
  if (!prompt && !(Array.isArray(messages) && messages.length)) {
    return res.status(400).json({ error: 'Missing "prompt" or "messages" in request body.' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const contents = Array.isArray(messages) && messages.length
      ? [
          // system va como primer turno del modelo para que el chat multi-turno lo respete.
          ...(system ? [{ role: 'user', parts: [{ text: String(system) }] }] : []),
          ...messages.map((m) => ({
            role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content ?? '') }],
          })),
        ]
      : [
          {
            parts: [
              { text: system ? String(system) : 'Responde de forma clara y breve.' },
              { text: String(prompt) },
            ],
          },
        ];

    const payload = {
      contents,
      generationConfig: {
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.2,
        maxOutputTokens: Number.isFinite(Number(maxOutputTokens)) ? Math.min(Number(maxOutputTokens), 8192) : 1024,
      },
    };

    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Upstream error', details: data });

    const textOut =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

    return res.json({ result: textOut });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
