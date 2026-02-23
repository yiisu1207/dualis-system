// Vercel Serverless Function: /api/assistant
// Simple text proxy for Gemini. Reads API key from process.env.GOOGLE_API_KEY.

const MODEL = 'gemini-1.5-flash';

const fetchFn = globalThis.fetch
  ? (...args) => globalThis.fetch(...args)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  const { prompt, system, temperature } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Missing "prompt" in request body.' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: system ? String(system) : 'Responde de forma clara y breve.' },
            { text: String(prompt) },
          ],
        },
      ],
      generationConfig: {
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.2,
        maxOutputTokens: 512,
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
