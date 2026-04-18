// Vercel Serverless Function: /api/extract-receipt
// Proxy a Anthropic Vision para OCR de comprobantes bancarios.
// La API key ANTHROPIC_KEY vive en env vars de Vercel.

const { getAuth, getDb } = require('./_firebaseAdmin');

const MODEL = 'claude-sonnet-4-6';
const MAX_BYTES = 5 * 1024 * 1024;

const EXTRACT_PROMPT = `Eres un extractor de datos de comprobantes bancarios venezolanos. Analiza la imagen (captura de pago móvil, transferencia, o depósito) y devuelve SOLO un JSON válido con esta estructura exacta:

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

REGLAS GENERALES:
- amount: monto numérico en number (sin separadores de miles, punto decimal). Ej "1.234,56 Bs" → 1234.56. Ej "$45.00" → 45.
- currency: "VES" si ves "Bs", "Bs.", "BsS", "Bolívares". "USD" si ves "$", "USD", "Dólares". Si ambos aparecen, prioriza el monto más prominente.
- date: convierte SIEMPRE a "YYYY-MM-DD". "15/04/2026" → "2026-04-15". "15-04-2026" → "2026-04-15". "15 abr 2026" → "2026-04-15".
- reference: solo dígitos, sin espacios ni guiones. Ej "059 136 068 515" → "059136068515".
- cedula: formato "V-12345678" o "J-123456789" (con guion).
- phone: formato "0414-1234567" (con guion, 11 dígitos totales).
- originBank / destinationBank: nombre corto del banco en mayúsculas (ej "BDV", "BANESCO", "MERCANTIL", "PROVINCIAL", "BNC", "BANCAMIGA"). Para cuentas enmascaradas "0102****1234" el prefijo 0102 indica BDV (ver tabla abajo).
- senderName: nombre completo del que envió/hace el pago (no del receptor, a menos que solo aparezca uno).
- confidence: "high" si extrajiste ≥5 campos claros, "medium" si 3-4, "low" si <3 o imagen borrosa.
- notes: si ves "Concepto:", "Descripción:", "Motivo:" o similar, copia ese texto corto aquí.

CÓDIGOS DE BANCO (prefijos de cuenta 4 dígitos):
0102=BDV (Banco de Venezuela), 0105=MERCANTIL, 0108=PROVINCIAL, 0134=BANESCO, 0191=BNC, 0172=BANCAMIGA, 0114=BANCARIBE, 0163=BANCO DEL TESORO, 0175=BICENTENARIO, 0138=PLAZA, 0151=BFC, 0156=100% BANCO, 0157=DELSUR, 0166=BANAGRÍCOLA, 0168=BANCRECER, 0169=MIBANCO, 0171=BANCO ACTIVO, 0174=BANPLUS, 0177=BANFANB

FORMATOS POR BANCO (dónde buscar cada dato):

**BDV / Banco de Venezuela (app móvil — "Comprobante de operación")**:
- Header dice "Comprobante de operación" con subtítulo "Transferencias a terceros" / "Pago móvil" / "Transferencia entre cuentas".
- Monto grande en formato "X.XXX,XX Bs" (siempre VES).
- Label "Fecha:" → DD/MM/YYYY.
- Label "Operación:" → reference (12 dígitos típicamente).
- Label "Nombre:" → senderName (el que envió).
- Label "Origen:" → cuenta origen enmascarada "0102****XXXX" (siempre BDV en este formato).
- Label "Destino:" → cuenta/teléfono destino. Si empieza con "0102" es BDV; otros prefijos ver tabla.
- Label "Concepto:" → copiar a notes.
- Si destino es un teléfono (04XX-XXXXXXX) → operationType="pago_movil". Si es cuenta → "transferencia".

**Banesco (app/web — "Operación Exitosa")**:
- Header suele decir "Operación Exitosa", "Transferencia realizada" o "Pago Móvil realizado".
- Monto en "Bs X.XXX,XX" o "Bs. X.XXX,XX".
- "Nº de Operación", "Nro. Referencia" o "Referencia:" → reference (típicamente 6-10 dígitos).
- "Fecha y hora:" o "Fecha:" → date.
- "Beneficiario:" → destinatario. "Ordenante:" → senderName.
- "Cédula:" o "C.I.:" → cedula.
- "Teléfono:" o "Celular:" → phone.
- "Banco destino" → destinationBank.

**Mercantil (app — "Operación Exitosa")**:
- Header: "Transferencia exitosa" / "Pago móvil exitoso" / "Movimiento exitoso".
- Monto: "Monto: Bs X.XXX,XX".
- "Número de comprobante" o "Comprobante:" → reference.
- "Fecha de la operación:" → date.
- "Enviado desde:" → cuenta origen. "Enviado a:" → destinatario.
- "Titular:" → senderName.

**Provincial / BBVA (app — "Exitoso")**:
- Header: "¡Exitoso!" o "Operación realizada".
- Monto: "Bs X,XX".
- "Referencia:" o "Nº Operación:" → reference.
- "Fecha:" → date.
- "Cuenta origen" / "Cuenta destino" → con prefijo 0108.

**BNC (app — "Comprobante")**:
- Header: "Comprobante de pago" / "Transferencia exitosa".
- "Nº de referencia" o "Ref:" → reference.
- Cuentas con prefijo 0191.

**Bancamiga (app — "Pago realizado")**:
- Cuentas con prefijo 0172.
- "Número de operación" → reference.

**Pago Móvil genérico (cualquier banco)**:
- Incluye siempre: monto, cédula del destinatario, teléfono destinatario (04XX-XXXXXXX), banco destino, referencia.
- operationType siempre = "pago_movil".
- Si ves "V-12345678" y un teléfono "0414-1234567" y un banco destino → es pago móvil.

**Transferencia entre cuentas**:
- Dos números de cuenta largos (20 dígitos o enmascarados).
- operationType = "transferencia".

**Zelle / Divisas USD**:
- Aparece "$", "USD", "Zelle".
- currency = "USD". Ref puede ser un código alfanumérico; extrae solo si es claro.

IMPORTANTE:
- Si un campo no se ve claro o no aparece, devuelve null. NO inventes dígitos ni nombres.
- Devuelve SOLO el JSON, sin texto extra, sin markdown, sin \`\`\`.
- Si la imagen no es un comprobante bancario (es foto de persona, recibo de supermercado, meme, etc.), devuelve todos los campos en null con confidence="low" y notes="No es un comprobante bancario".`;

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
