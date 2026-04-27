// Predicción de ruptura de stock — basado en velocidad histórica de ventas.
//
// Algoritmo simple pero efectivo:
//   1. Mira las ventas de los últimos N días del producto
//   2. Calcula velocidad = unidades vendidas / días con ventas
//   3. Proyecta hora/día de ruptura: stock_actual / velocidad
//   4. Marca con severidad: crítico (<24h), alto (<3d), medio (<7d), info (<14d)
//
// Limitaciones conocidas:
//   - No considera estacionalidad (ej: "los viernes vendo el doble")
//   - No considera tendencia (ej: "este SKU está creciendo en demanda")
//   - No considera promociones puntuales que distorsionen la media
// Para v1 esto es suficiente; v2 puede usar regresión por día de la semana.

export interface PredictionInput {
  productId: string;
  productName: string;
  productCode?: string;
  currentStock: number;
  /** Movements del producto (FACTURA con items, idealmente últimos 30-60 días). */
  salesEvents: Array<{ date: string; quantity: number }>;
}

export interface RuptureRisk {
  productId: string;
  productName: string;
  productCode?: string;
  currentStock: number;
  /** Unidades vendidas por día (promedio). */
  velocityPerDay: number;
  /** Días estimados hasta ruptura (a la velocidad actual). */
  daysToRupture: number;
  /** Hora absoluta estimada de ruptura. */
  ruptureAt: Date;
  /** Severidad para coloreo de UI. */
  severity: 'critical' | 'high' | 'medium' | 'info';
  /** Mensaje legible para mostrar. */
  message: string;
}

/** Calcula la velocidad de venta promedio en unidades/día. */
function computeVelocity(events: Array<{ date: string; quantity: number }>): number {
  if (events.length === 0) return 0;
  const sortedDates = events
    .map(e => new Date(e.date).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (sortedDates.length === 0) return 0;
  const totalQty = events.reduce((s, e) => s + (e.quantity || 0), 0);
  // Span: del primer evento al último, mínimo 1 día para no dividir por 0
  const spanMs = Math.max(1, sortedDates[sortedDates.length - 1] - sortedDates[0]);
  const spanDays = Math.max(1, spanMs / (1000 * 60 * 60 * 24));
  return totalQty / spanDays;
}

function severityFor(daysToRupture: number): RuptureRisk['severity'] {
  if (daysToRupture <= 1) return 'critical';
  if (daysToRupture <= 3) return 'high';
  if (daysToRupture <= 7) return 'medium';
  return 'info';
}

function humanizeDays(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  if (days < 2) return '1 día';
  if (days < 14) return `${Math.round(days)} días`;
  return `${Math.round(days / 7)} sem`;
}

export function predictRupture(input: PredictionInput): RuptureRisk | null {
  const velocity = computeVelocity(input.salesEvents);
  if (velocity <= 0) return null; // sin ventas → no se puede predecir
  if (input.currentStock <= 0) {
    // Ya está agotado
    return {
      productId: input.productId,
      productName: input.productName,
      productCode: input.productCode,
      currentStock: 0,
      velocityPerDay: velocity,
      daysToRupture: 0,
      ruptureAt: new Date(),
      severity: 'critical',
      message: `Ya agotado · vendías ${velocity.toFixed(1)}/día`,
    };
  }
  const daysToRupture = input.currentStock / velocity;
  const ruptureAt = new Date(Date.now() + daysToRupture * 24 * 60 * 60 * 1000);
  const severity = severityFor(daysToRupture);
  const human = humanizeDays(daysToRupture);
  let message: string;
  if (severity === 'critical') {
    message = `Se agota HOY (${ruptureAt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })})`;
  } else if (severity === 'high') {
    message = `Se agota en ${human} (${ruptureAt.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit' })})`;
  } else {
    message = `Cobertura ${human}`;
  }
  return {
    productId: input.productId,
    productName: input.productName,
    productCode: input.productCode,
    currentStock: input.currentStock,
    velocityPerDay: velocity,
    daysToRupture,
    ruptureAt,
    severity,
    message,
  };
}

/** Ordena por urgencia descendente (los más urgentes primero). */
export function sortByUrgency(risks: RuptureRisk[]): RuptureRisk[] {
  return [...risks].sort((a, b) => a.daysToRupture - b.daysToRupture);
}

/** Genera texto pre-armado para WhatsApp al proveedor con la lista. */
export function buildWhatsAppMessage(risks: RuptureRisk[], businessName?: string): string {
  if (risks.length === 0) return '';
  const lines = risks
    .filter(r => r.severity === 'critical' || r.severity === 'high')
    .slice(0, 20)
    .map(r => `• ${r.productName}${r.productCode ? ` (${r.productCode})` : ''} — stock ${r.currentStock}, ${r.message.toLowerCase()}`);
  if (lines.length === 0) return '';
  const header = businessName ? `Hola, soy ${businessName}. Necesito reponer:` : 'Necesito reponer estos productos urgente:';
  return `${header}\n\n${lines.join('\n')}\n\n¿Puedes confirmar disponibilidad y precio? Gracias.`;
}
