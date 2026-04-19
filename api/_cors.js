// Helper CORS centralizado. Reemplaza ACAO:* con whitelist por origen.
// ALLOWED_ORIGINS puede ser una env var coma-separada; si no está, usamos
// los hosts conocidos de producción + localhost para dev.

const DEFAULT_ALLOWED = [
  'https://dualisystem.com',
  'https://www.dualisystem.com',
  'https://dualis-system.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function allowedOrigins() {
  const env = (process.env.ALLOWED_ORIGINS || '').trim();
  if (!env) return DEFAULT_ALLOWED;
  return env.split(',').map((s) => s.trim()).filter(Boolean);
}

// Acepta también subdominios de Vercel preview y de dualisystem.com.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const list = allowedOrigins();
  if (list.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith('.dualisystem.com')) return true;
    if (u.hostname.endsWith('.vercel.app') && u.hostname.includes('dualis')) return true;
  } catch {
    return false;
  }
  return false;
}

function applyCors(req, res, methods = 'POST,OPTIONS') {
  const origin = req.headers && req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

module.exports = { applyCors, isAllowedOrigin };
