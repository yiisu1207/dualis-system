// Generador de PDF de comprobante de pago aprobado.
// Lazy-imports jspdf y qrcode para no inflar el bundle inicial.

import type { PortalPayment } from '../../types';

interface BusinessForReceipt {
  id: string;
  name: string;
  logoUrl?: string;
  slug?: string;
}

interface CustomerForReceipt {
  name?: string;
  email?: string;
  phone?: string;
  cedula?: string;
}

interface ReceiptOptions {
  payment: PortalPayment & { id: string };
  business: BusinessForReceipt;
  customer?: CustomerForReceipt;
  bankName?: string;
  approvedAt?: string;
}

/**
 * Genera un PDF de comprobante de pago.
 * Devuelve un Blob listo para subir a Cloudinary o descargar.
 */
export async function generatePaymentReceiptPDF(opts: ReceiptOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const QRCode = (await import('qrcode')).default;

  const { payment, business, customer, bankName, approvedAt } = opts;

  // URL pública de verificación
  const verifyUrl = buildVerifyUrl(business.slug || business.id, payment.id);
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 220,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  // PDF A5 vertical (148 x 210 mm)
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W = 148;
  const M = 12;
  let y = M;

  // Header — barra de color
  pdf.setFillColor(99, 102, 241); // indigo-500
  pdf.rect(0, 0, W, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('COMPROBANTE DE PAGO', W / 2, 13, { align: 'center' });
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(business.name || 'Negocio', W / 2, 21, { align: 'center' });

  y = 38;

  // Status grande
  pdf.setTextColor(16, 185, 129); // emerald-500
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.text('APROBADO', W / 2, y, { align: 'center' });
  y += 8;

  // Monto destacado
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(28);
  pdf.text(`$${Number(payment.amount).toFixed(2)}`, W / 2, y + 8, { align: 'center' });
  y += 18;

  // Línea separadora
  pdf.setDrawColor(226, 232, 240);
  pdf.line(M, y, W - M, y);
  y += 6;

  // Detalles
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);

  const rows: [string, string][] = [
    ['Cliente',        customer?.name || payment.customerName || '—'],
    ['Cédula/RIF',     payment.payerCedula || customer?.cedula || '—'],
    ['Banco destino',  bankName || '—'],
    ['Método',         payment.metodoPago || '—'],
    ['Referencia',     payment.referencia || '—'],
    ['Fecha de pago',  formatDate(payment.paymentDate)],
    ['Aprobado',       formatDate(approvedAt || payment.reviewedAt)],
    ['ID',             payment.id],
  ];

  rows.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), M, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    pdf.text(truncate(value, 36), W - M, y, { align: 'right' });
    y += 5;
  });

  y += 4;
  pdf.line(M, y, W - M, y);
  y += 6;

  // QR de verificación
  pdf.addImage(qrDataUrl, 'PNG', (W - 35) / 2, y, 35, 35);
  y += 38;

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Escanea para verificar este pago', W / 2, y, { align: 'center' });
  y += 4;
  pdf.setFontSize(7);
  pdf.text(verifyUrl, W / 2, y, { align: 'center' });

  // Footer
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Generado por Dualis ERP', W / 2, 200, { align: 'center' });

  return pdf.output('blob');
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function buildVerifyUrl(slug: string, paymentId: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/portal/${slug}/payment/${paymentId}/verify`;
  }
  return `https://app.dualis.com/portal/${slug}/payment/${paymentId}/verify`;
}
