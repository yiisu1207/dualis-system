// Vercel Cron Job: /api/cron-bcv
// Schedule: cada día 10:00 UTC = 6:00 AM America/Caracas (UTC-4)
//
// El BCV publica la tasa oficial entre 4-6 PM del día anterior, y esa tasa
// entra en vigencia al día siguiente. A las 6 AM las APIs de terceros
// (ve.dolarapi, pydolarve, dolarapi.com) ya reflejan la tasa vigente HOY,
// así que cualquier usuario que abra la app en la mañana ya la ve actualizada.
//
// Este endpoint reemplaza al scheduled function de Firebase porque el proyecto
// no está en plan Blaze. Vercel Cron corre server-side sin depender de que
// un usuario abra la app.
//
// Security: Vercel Cron attaches header `Authorization: Bearer ${CRON_SECRET}`
// cuando CRON_SECRET está en env. Rechazamos requests sin ese header.

const { getDb } = require('./_firebaseAdmin');

const BCV_SOURCES = [
  {
    name: 've.dolarapi.com',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (d) => (typeof d?.promedio === 'number' && d.promedio > 0 ? d.promedio : null),
  },
  {
    name: 'pydolarve.org',
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd',
    parse: (d) => {
      const p = d?.price ?? d?.monitors?.usd?.price;
      return typeof p === 'number' && p > 0 ? p : null;
    },
  },
  {
    name: 'dolarapi.com',
    url: 'https://dolarapi.com/v1/dolares',
    parse: (d) => {
      if (!Array.isArray(d)) return null;
      const oficial = d.find((x) => x?.casa === 'oficial' || x?.casa === 'bcv');
      return typeof oficial?.promedio === 'number' && oficial.promedio > 0 ? oficial.promedio : null;
    },
  },
];

async function fetchBCVFromSources() {
  for (const src of BCV_SOURCES) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(src.url, { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = src.parse(data);
      if (rate && rate > 0) {
        return { rate, source: src.name };
      }
    } catch (e) {
      console.warn(`[bcv] Source ${src.name} failed:`, e?.message || e);
    }
  }
  return null;
}

function enumerateDatesBetween(start, end) {
  const out = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return out;
  const cursor = new Date(s.getTime() + 86400000);
  while (cursor < e) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

async function writeRateHistory(db, businessId, dateStr, rate) {
  const admin = require('firebase-admin');
  const colPath = `businesses/${businessId}/exchange_rates_history`;
  const existingRef = db.doc(`${colPath}/${dateStr}`);
  const existingSnap = await existingRef.get();

  const batch = db.batch();
  let wrote = false;
  const createdBy = { uid: 'system-cron', displayName: 'Auto-fetch BCV (Vercel Cron)' };

  if (!existingSnap.exists || existingSnap.data()?.source !== 'manual') {
    batch.set(
      existingRef,
      {
        date: dateStr,
        bcv: rate,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'auto-fetch',
        status: 'verified',
        createdBy,
      },
      { merge: true },
    );
    wrote = true;
  }

  // Backfill fines de semana / feriados
  const priorQuery = await db.collection(colPath).orderBy('date', 'desc').limit(10).get();
  const lastPrior = priorQuery.docs
    .map((d) => d.data()?.date)
    .filter((d) => !!d && d < dateStr)
    .sort((a, b) => b.localeCompare(a))[0];

  if (lastPrior) {
    const gaps = enumerateDatesBetween(lastPrior, dateStr);
    for (const missing of gaps) {
      const missingRef = db.doc(`${colPath}/${missing}`);
      const snap = await missingRef.get();
      if (snap.exists) continue;
      batch.set(missingRef, {
        date: missing,
        bcv: rate,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        source: 'backfill-post-holiday',
        status: 'verified',
        backfilledFrom: dateStr,
        createdBy,
      });
      wrote = true;
    }
  }

  if (wrote) await batch.commit();
}

module.exports = async (req, res) => {
  // Verify Vercel Cron secret (si está configurado)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await fetchBCVFromSources();
    if (!result) {
      console.error('[cron-bcv] All sources failed');
      return res.status(502).json({ ok: false, error: 'All BCV sources failed' });
    }

    const { rate, source } = result;
    const today = new Date().toISOString().split('T')[0];
    const db = getDb();

    const configsSnap = await db.collection('businessConfigs').get();
    let updated = 0;
    const errors = [];

    for (const cfg of configsSnap.docs) {
      const businessId = cfg.id;
      const data = cfg.data() || {};
      const currentBCV = Number(data.tasaBCV || 0);

      try {
        const payload = { updatedAt: new Date().toISOString() };
        if (Math.abs(rate - currentBCV) > 0.0001) payload.tasaBCV = rate;
        await cfg.ref.set(payload, { merge: true });

        await writeRateHistory(db, businessId, today, rate);
        updated++;
      } catch (e) {
        errors.push({ businessId, error: e?.message || String(e) });
      }
    }

    console.log(`[cron-bcv] Updated ${updated}/${configsSnap.size} businesses (BCV=${rate} from ${source})`);
    return res.status(200).json({
      ok: true,
      rate,
      source,
      businessesUpdated: updated,
      businessesTotal: configsSnap.size,
      date: today,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error('[cron-bcv] Fatal:', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
