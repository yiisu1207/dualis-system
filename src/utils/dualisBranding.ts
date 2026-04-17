/**
 * Branding compartido de Dualis para exportaciones PDF.
 *
 * - `drawDualisLogo`: dos anillos entrelazados (cyan + violeta), el logo oficial.
 * - `drawDualisFooter`: footer con barra degradada fluida, logo, "Hecho por Dualis",
 *   paginación y tagline. Se aplica a TODAS las páginas del documento.
 *
 * Todas las funciones reciben `doc: any` (jsPDF) — dinámicamente importado.
 */

type JsPdfDoc = any;

const CYAN: [number, number, number] = [34, 211, 238];   // #22d3ee
const VIOLET: [number, number, number] = [139, 92, 246]; // #8b5cf6
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_400: [number, number, number] = [148, 163, 184];

/** Dibuja el logo oficial: dos anillos entrelazados cyan+violeta. */
export function drawDualisLogo(doc: JsPdfDoc, cx: number, cy: number, size = 6) {
  const r = size / 2;
  const offset = r * 0.65;
  doc.setLineWidth(size * 0.14);

  // Violeta atrás (derecha)
  doc.setDrawColor(VIOLET[0], VIOLET[1], VIOLET[2]);
  doc.circle(cx + offset, cy, r, 'S');

  // Cyan adelante (izquierda)
  doc.setDrawColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.circle(cx - offset, cy, r, 'S');

  doc.setLineWidth(0.2);
}

/** Barra horizontal con gradiente suave cyan → violeta (se ve sin corte). */
function drawGradientBar(
  doc: JsPdfDoc,
  x: number,
  y: number,
  width: number,
  height: number,
  from: [number, number, number] = CYAN,
  to: [number, number, number] = VIOLET,
) {
  const strips = 80;
  const stripW = width / strips;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    doc.setFillColor(r, g, b);
    doc.rect(x + i * stripW, y, stripW + 0.15, height, 'F');
  }
}

export interface FooterOptions {
  tagline?: string;
  showPagination?: boolean;
  /** Opt-out. Si true, no dibuja nada. Reservado para planes con white-label de exports. */
  skip?: boolean;
}

/**
 * Footer oficial de Dualis en TODAS las páginas.
 * Barra degradada + logo de anillos + "HECHO POR DUALIS" + paginación.
 * NO incluye "Generado [fecha]" — usa un tagline en su lugar.
 *
 * Alcance del branding: firma discreta del fabricante en el pie de página. NO
 * interfiere con datos legales ni fiscales del documento. El feature "white-label"
 * de planes Enterprise aplica al Portal de Clientes (logo/colores del negocio),
 * no a esta firma. Si en el futuro se comercializa un addon que retira esta firma
 * de los PDFs, pasar `skip: true` desde los callsites.
 */
export function drawDualisFooter(doc: JsPdfDoc, options: FooterOptions = {}) {
  const {
    tagline = 'Documento oficial · dualis.online',
    showPagination = true,
    skip = false,
  } = options;

  if (skip) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    const footerTop = pageHeight - 18;

    // ── Barra degradada suave cyan → violeta ──────────────────────────
    drawGradientBar(doc, 0, footerTop, pageWidth, 1.2);

    // ── Logo oficial: dos anillos entrelazados ────────────────────────
    const logoX = 20;
    const logoY = footerTop + 7;
    drawDualisLogo(doc, logoX, logoY, 6);

    // ── Marca + tagline a la izquierda (después del logo) ─────────────
    doc.setTextColor(SLATE_900[0], SLATE_900[1], SLATE_900[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('DUALIS', logoX + 9, logoY - 0.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(SLATE_500[0], SLATE_500[1], SLATE_500[2]);
    doc.text('Sistema ERP · Gestión integral', logoX + 9, logoY + 3.2);

    // ── Centro: "HECHO POR DUALIS" + tagline ──────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(VIOLET[0], VIOLET[1], VIOLET[2]);
    doc.text('HECHO POR DUALIS', pageWidth / 2, logoY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(SLATE_400[0], SLATE_400[1], SLATE_400[2]);
    doc.text(tagline, pageWidth / 2, logoY + 3.8, { align: 'center' });

    // ── Derecha: paginación o tagline ─────────────────────────────────
    if (showPagination && totalPages > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(SLATE_900[0], SLATE_900[1], SLATE_900[2]);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, logoY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE_400[0], SLATE_400[1], SLATE_400[2]);
      doc.text('Impulsando tu negocio', pageWidth - 14, logoY + 3.8, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(SLATE_900[0], SLATE_900[1], SLATE_900[2]);
      doc.text('Impulsando tu negocio', pageWidth - 14, logoY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE_400[0], SLATE_400[1], SLATE_400[2]);
      doc.text('dualis.online', pageWidth - 14, logoY + 3.8, { align: 'right' });
    }
  }
}

/** Texto de marca para exports tipo WhatsApp/email (sin PDF). */
export const DUALIS_TEXT_SIGNATURE = [
  '━━━━━━━━━━━━━━━━━━━━',
  '◆ *DUALIS* — Hecho con pasión',
  '_Sistema ERP · Gestión integral_',
  '🌐 dualis.online',
].join('\n');
