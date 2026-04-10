/**
 * K.2 — Progressive CxC reminder engine.
 * Calculates which customers need reminders based on invoice due dates.
 * Cron-less: runs in-memory when MainSystem loads movements.
 */

import type { Movement, Customer } from '../../types';

export type ReminderSeverity = 'warn5' | 'dueToday' | 'overdue5' | 'overdue15' | 'overdue30';

export interface ReminderItem {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  severity: ReminderSeverity;
  daysUntilDue: number;        // positive = days remaining, negative = days overdue
  totalDebtUSD: number;
  overdueInvoices: { id: string; amount: number; date: string; dueDate: string }[];
}

const SEVERITY_CONFIG: Record<ReminderSeverity, { label: string; color: string; emailSeverity: 'soft' | 'urgent' | 'overdue' | 'final' }> = {
  warn5:     { label: 'Vence en 5 días',      color: 'amber',   emailSeverity: 'soft' },
  dueToday:  { label: 'Vence HOY',            color: 'orange',  emailSeverity: 'urgent' },
  overdue5:  { label: 'Vencida hace 5 días',  color: 'red',     emailSeverity: 'overdue' },
  overdue15: { label: 'Vencida hace 15 días', color: 'red',     emailSeverity: 'overdue' },
  overdue30: { label: 'Vencida hace 30 días', color: 'rose',    emailSeverity: 'final' },
};

export function getSeverityConfig(severity: ReminderSeverity) {
  return SEVERITY_CONFIG[severity];
}

/**
 * Calculate progressive reminder buckets from unpaid invoices.
 * Only includes invoices with a `dueDate` set.
 */
export function calculateReminders(
  movements: Movement[],
  customers: Customer[],
): ReminderItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Build customer lookup
  const custMap = new Map(customers.map(c => [c.id, c]));

  // Filter to unpaid, non-voided invoices with dueDates
  const unpaidInvoices = movements.filter(m =>
    !m.isSupplierMovement &&
    m.movementType === 'FACTURA' &&
    !(m as any).pagado &&
    !(m as any).anulada &&
    m.dueDate &&
    m.entityId !== 'CONSUMIDOR_FINAL'
  );

  // Calculate per-customer balance (to exclude customers who already paid)
  const balanceByCustomer: Record<string, number> = {};
  movements
    .filter(m => !m.isSupplierMovement && !(m as any).pagado && !(m as any).anulada && m.entityId !== 'CONSUMIDOR_FINAL')
    .forEach(m => {
      if (!balanceByCustomer[m.entityId]) balanceByCustomer[m.entityId] = 0;
      if (m.movementType === 'FACTURA') balanceByCustomer[m.entityId] += (m.amountInUSD || 0);
      if (m.movementType === 'ABONO') balanceByCustomer[m.entityId] -= (m.amountInUSD || 0);
    });

  // Group invoices by customer + severity
  const reminderMap = new Map<string, ReminderItem>();

  for (const inv of unpaidInvoices) {
    const balance = balanceByCustomer[inv.entityId] || 0;
    if (balance <= 0) continue; // fully paid

    const due = new Date(inv.dueDate!);
    due.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((due.getTime() - todayMs) / 86400000);

    let severity: ReminderSeverity | null = null;
    if (daysDiff === 5 || (daysDiff > 0 && daysDiff <= 5)) severity = 'warn5';
    else if (daysDiff === 0) severity = 'dueToday';
    else if (daysDiff >= -5 && daysDiff < 0) severity = 'overdue5';
    else if (daysDiff >= -15 && daysDiff < -5) severity = 'overdue15';
    else if (daysDiff < -15) severity = 'overdue30';

    if (!severity) continue;

    const key = `${inv.entityId}::${severity}`;
    const cust = custMap.get(inv.entityId);

    if (!reminderMap.has(key)) {
      reminderMap.set(key, {
        customerId: inv.entityId,
        customerName: inv.entityName || cust?.nombre || cust?.fullName || 'Sin nombre',
        customerPhone: cust?.telefono,
        customerEmail: cust?.email,
        severity,
        daysUntilDue: daysDiff,
        totalDebtUSD: balance,
        overdueInvoices: [],
      });
    }
    const item = reminderMap.get(key)!;
    item.overdueInvoices.push({
      id: inv.id,
      amount: inv.amountInUSD || 0,
      date: inv.date,
      dueDate: inv.dueDate!,
    });
    // Keep the worst (most negative) daysDiff
    if (daysDiff < item.daysUntilDue) {
      item.daysUntilDue = daysDiff;
    }
  }

  // Sort: most urgent first (most negative daysDiff)
  return Array.from(reminderMap.values())
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/** Count total distinct customers needing reminders */
export function countPendingReminders(reminders: ReminderItem[]): number {
  return new Set(reminders.map(r => r.customerId)).size;
}

/** Get the most severe reminder per customer (for badge/summary) */
export function worstPerCustomer(reminders: ReminderItem[]): ReminderItem[] {
  const map = new Map<string, ReminderItem>();
  for (const r of reminders) {
    const existing = map.get(r.customerId);
    if (!existing || r.daysUntilDue < existing.daysUntilDue) {
      map.set(r.customerId, r);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}
