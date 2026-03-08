/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         DUALIS — FIREBASE CLOUD FUNCTIONS                       ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Requisito: plan Blaze (pago por uso) en Firebase Console.      ║
 * ║  Deploy: npm run build && firebase deploy --only functions      ║
 * ║                                                                  ║
 * ║  Añadir lógica por empresa:                                     ║
 * ║    if (data.businessId === 'BUSINESS_ID_CLIENTE') { ... }       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Loads vendorOverrides for a business (webhook URL, etc.) */
async function getVendorOverride(businessId: string) {
  const snap = await db.doc(`vendorOverrides/${businessId}`).get();
  return snap.exists ? snap.data() ?? {} : {};
}

/** Fires a POST to the business's configured webhook URL */
async function fireWebhook(
  businessId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const override = await getVendorOverride(businessId);
  const url = override.webhookUrl as string | undefined;
  if (!url) return;

  const events = (override.webhookEvents as string[] | undefined) ?? [];
  if (events.length > 0 && !events.includes(event)) return;

  try {
    // Node 20 has native fetch globally available
    await (globalThis as any).fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, businessId, timestamp: new Date().toISOString(), data }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    functions.logger.warn(`[webhook] Failed for ${businessId}:`, e);
  }
}

// ─── Trigger: New movement (sale, payment, etc.) ──────────────────────────────
export const onMovementCreated = functions.firestore
  .document('movements/{movId}')
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot) => {
    const data = snap.data();
    const businessId: string = data.businessId ?? '';
    if (!businessId) return;

    functions.logger.info(`[movement] ${data.movementType} — ${businessId}`);

    // ── Webhook ──
    await fireWebhook(businessId, 'sale.created', { ...data, id: snap.id });

    // ── Per-business automation — add client logic here ──────────────────────
    //
    // if (businessId === 'BUSINESS_ID_PANADERIA') {
    //   await db.collection('panaderia_daily_totals').add({ ... });
    // }
    //
    // if (businessId === 'BUSINESS_ID_FARMACIA') {
    //   // decrement lote stock, alert if near expiry
    // }
  });

// ─── Trigger: Movement updated (e.g. anulación) ───────────────────────────────
export const onMovementUpdated = functions.firestore
  .document('movements/{movId}')
  .onUpdate(async (change: functions.Change<functions.firestore.QueryDocumentSnapshot>) => {
    const after = change.after.data();
    const before = change.before.data();
    const businessId: string = after.businessId ?? '';
    if (!businessId) return;

    // Detect cancellation
    if (!before.anulada && after.anulada) {
      functions.logger.info(`[movement] ANULADA — ${businessId}`);
      await fireWebhook(businessId, 'sale.cancelled', { ...after, id: change.after.id });
    }

    // Detect payment received (pagado changed to true)
    if (!before.pagado && after.pagado) {
      await fireWebhook(businessId, 'payment.received', { ...after, id: change.after.id });
    }
  });

// ─── Trigger: New customer ────────────────────────────────────────────────────
export const onCustomerCreated = functions.firestore
  .document('customers/{customerId}')
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot) => {
    const data = snap.data();
    const businessId: string = data.businessId ?? '';
    if (!businessId) return;

    await fireWebhook(businessId, 'customer.created', { ...data, id: snap.id });
  });

// ─── Trigger: Shift closed (arqueo) ──────────────────────────────────────────
export const onArqueoCreated = functions.firestore
  .document('businesses/{businessId}/arqueos/{arqueoId}')
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot, ctx: functions.EventContext) => {
    const businessId = ctx.params.businessId as string;
    const data = snap.data();

    functions.logger.info(`[arqueo] Turno cerrado — ${businessId} — ${data.terminalName}`);
    await fireWebhook(businessId, 'shift.closed', { ...data, id: snap.id });

    // ── Per-business: e.g. send daily summary email ───────────────────────────
    //
    // if (businessId === 'BUSINESS_ID_SUPERMERCADO') {
    //   await sendDailySummaryEmail(data, 'gerente@supermercado.com');
    // }
  });

// ─── Scheduled: Daily cleanup / reports (optional) ───────────────────────────
export const dailyMaintenance = functions.pubsub
  .schedule('0 3 * * *')  // 3 AM every day
  .timeZone('America/Caracas')
  .onRun(async () => {
    functions.logger.info('[daily] Maintenance run started');

    // Example: auto-expire trials older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const expiredTrials = await db.collection('subscriptions')
      .where('plan', '==', 'trial')
      .where('trialEndsAt', '<', cutoff)
      .get();

    for (const doc of expiredTrials.docs) {
      await doc.ref.update({ status: 'expired', expiredAt: new Date().toISOString() });
      functions.logger.info(`[daily] Expired trial: ${doc.id}`);
    }

    functions.logger.info(`[daily] Expired ${expiredTrials.size} trials`);
  });

// ─── HTTP endpoint: Receive external events (e.g. from payment processor) ────
export const receiveExternalEvent = functions.https.onRequest(async (req: functions.https.Request, res: import('express').Response) => {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const { businessId, event, data, secret } = req.body ?? {};

  // Verify secret matches vendorOverrides.webhookSecret
  if (!businessId || !event) { res.status(400).send('Missing fields'); return; }

  const override = await getVendorOverride(businessId);
  if (override.webhookSecret && override.webhookSecret !== secret) {
    res.status(401).send('Unauthorized');
    return;
  }

  // Log incoming event to Firestore for audit
  await db.collection('externalEvents').add({
    businessId, event, data,
    receivedAt: new Date().toISOString(),
  });

  functions.logger.info(`[external] ${event} for ${businessId}`);
  res.status(200).json({ ok: true });
});
