/**
 * shareLink — helpers para compartir links/textos vía WhatsApp y email.
 * Usado en CxCClientProfile (acceso al portal), DespachoPanel (notificación al cliente),
 * Disputas (notificación al cliente), Onboarding wizard (envío de invitación), etc.
 */

/** Normaliza un teléfono venezolano a formato internacional (58XXXXXXXXXX). */
export function normalizeVePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('58')) return digits;
  if (digits.startsWith('0')) return '58' + digits.slice(1);
  if (digits.length === 10) return '58' + digits;
  return digits;
}

/** Construye una URL de wa.me para abrir WhatsApp con texto pre-poblado. */
export function buildWhatsAppUrl(phone: string, text: string): string {
  const normalized = normalizeVePhone(phone);
  const encoded = encodeURIComponent(text);
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

/** Construye una URL mailto: con asunto y cuerpo pre-poblados. */
export function buildMailtoUrl(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email}?${params.toString().replace(/\+/g, '%20')}`;
}

/** Abre WhatsApp en una nueva pestaña con el mensaje. */
export function shareViaWhatsApp(phone: string, text: string): void {
  const url = buildWhatsAppUrl(phone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Abre el cliente de email del usuario con el mensaje. */
export function shareViaEmail(email: string, subject: string, body: string): void {
  const url = buildMailtoUrl(email, subject, body);
  window.location.href = url;
}

/** Copia un texto al portapapeles. Devuelve true si tuvo éxito. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback para http (sin clipboard API)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Templates de mensaje para los flujos comunes. */
export const messageTemplates = {
  portalAccess: (businessName: string, customerName: string, link: string, pin?: string) =>
    `Hola ${customerName}, ${businessName} te ha habilitado tu portal personal.\n\n` +
    `Accede aquí: ${link}\n` +
    (pin ? `PIN de acceso: ${pin}\n\n` : '\n') +
    `Desde el portal puedes ver tus facturas, abonos, reportar disputas y confirmar despachos.`,

  dispatchConfirm: (businessName: string, customerName: string, link: string, nro?: string) =>
    `Hola ${customerName}, ${businessName} ha despachado tu pedido${nro ? ` #${nro}` : ''}.\n\n` +
    `Por favor confirma la recepción aquí: ${link}\n\n` +
    `Si hay algún problema con la entrega, puedes reportarlo desde el mismo enlace.`,

  disputeAck: (businessName: string, customerName: string, disputeId: string) =>
    `Hola ${customerName}, ${businessName} recibió tu reporte de disputa #${disputeId.slice(-6)}.\n\n` +
    `Lo estamos revisando y te contactaremos pronto.`,

  disputeResolved: (businessName: string, customerName: string, resolution: string) =>
    `Hola ${customerName}, tu disputa con ${businessName} fue resuelta:\n\n` +
    `${resolution}\n\n` +
    `Si tienes dudas, contáctanos directamente.`,

  /** Recordatorio suave — factura próxima a vencer */
  reminderSoft: (businessName: string, customerName: string, amount: string, dueDate: string) =>
    `Hola ${customerName}, le escribimos de ${businessName}.\n\n` +
    `Le recordamos que tiene un saldo pendiente de ${amount} con vencimiento el ${dueDate}.\n\n` +
    `Si ya realizó el pago, por favor ignore este mensaje. ¡Gracias!`,

  /** Recordatorio urgente — factura vence hoy */
  reminderUrgent: (businessName: string, customerName: string, amount: string) =>
    `Hola ${customerName}, le escribimos de ${businessName}.\n\n` +
    `Su saldo pendiente de ${amount} vence HOY. Le agradecemos ponerse al día a la brevedad.\n\n` +
    `Si ya realizó el pago, por favor comuníquese con nosotros. ¡Gracias!`,

  /** Aviso de vencimiento — factura vencida */
  reminderOverdue: (businessName: string, customerName: string, amount: string, days: number) =>
    `Hola ${customerName}, le escribimos de ${businessName}.\n\n` +
    `Su saldo pendiente de ${amount} tiene ${days} día${days !== 1 ? 's' : ''} de vencido. ` +
    `Le solicitamos regularizar su situación a la brevedad.\n\n` +
    `Contáctenos para cualquier consulta o acuerdo de pago.`,

  /** Aviso final — deuda seria */
  reminderFinal: (businessName: string, customerName: string, amount: string, days: number) =>
    `Hola ${customerName}, le escribimos de ${businessName}.\n\n` +
    `AVISO FINAL: Su deuda de ${amount} tiene ${days} días de vencida. ` +
    `Lamentablemente, de no recibir pago en los próximos días, nos veremos en la necesidad ` +
    `de suspender su línea de crédito.\n\n` +
    `Contáctenos urgentemente para resolver esta situación.`,
};
