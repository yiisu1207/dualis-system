/**
 * webhookTrigger — Fires POST requests to a business's configured webhook URL.
 *
 * Set webhookUrl in vendorOverrides/{businessId} from the super-admin panel.
 * Useful for connecting to n8n, Zapier, Make, or a custom backend.
 *
 * Usage:
 *   await triggerWebhook(businessId, webhookUrl, 'sale.created', { ...saleData });
 */

export type WebhookEvent =
  | 'sale.created'
  | 'sale.cancelled'
  | 'customer.created'
  | 'customer.updated'
  | 'inventory.updated'
  | 'payment.received'
  | 'employee.payroll'
  | 'shift.opened'
  | 'shift.closed';

interface WebhookPayload {
  event: WebhookEvent;
  businessId: string;
  timestamp: string;
  data: Record<string, any>;
}

/**
 * Sends a POST to the configured webhook URL.
 * Silently fails — never throws, never blocks the UI.
 */
export async function triggerWebhook(
  businessId: string,
  webhookUrl: string | undefined,
  event: WebhookEvent,
  data: Record<string, any>,
): Promise<void> {
  if (!webhookUrl) return;

  const payload: WebhookPayload = {
    event,
    businessId,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      // Short timeout so it never blocks the user
      signal: AbortSignal.timeout?.(5000),
    });
  } catch {
    // Silently ignore — webhook failure must never affect the main flow
  }
}

/**
 * Queue-based version — fires and forgets immediately.
 * Use this in UI event handlers where you can't await.
 */
export function fireWebhook(
  businessId: string,
  webhookUrl: string | undefined,
  event: WebhookEvent,
  data: Record<string, any>,
): void {
  triggerWebhook(businessId, webhookUrl, event, data);
}
