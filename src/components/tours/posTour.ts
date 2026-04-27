// Tour de introducción del POS Detal.
//
// Cubre las features nuevas del POS:
//   - Hotkeys configurables (F1/F2/F3/F4/F12 + Ctrl+N/Ctrl+R/Esc)
//   - Modal de hotkeys (?)
//   - Búsqueda fuzzy de productos (tolera typos, acentos, orden)
//   - Lookup automático por barcode
//   - Repetir última venta (Ctrl+R)
//   - Retener carrito (F12)
//
// Se dispara la primera vez que el cajero entra al POS.
// Persistencia por terminal (cajaId) para que cada cajero vea el suyo.

import type { TourStep } from '../DriverTour';

export const POS_TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="pos-hero"]',
    title: '🛒 Bienvenido al POS',
    description: 'Vendes desde aquí. Te muestro lo nuevo: hotkeys, búsqueda inteligente, repetir venta y atajos que aceleran 5x.',
    side: 'bottom',
  },
  {
    element: '[data-tour="pos-search"]',
    title: '🔎 Búsqueda inteligente — NUEVO',
    description: 'Tolera typos ("civeza" encuentra "cerveza"), acentos, orden de palabras y hasta sin espacios ("cocacola" = "Coca Cola"). Escribe el nombre, código o barcode.',
    side: 'bottom',
  },
  {
    element: '[data-tour="pos-cart"]',
    title: '🧺 Carrito de venta',
    description: 'Aquí se acumulan los productos. Edita cantidades, aplica descuento por línea o global, y pasa a cobrar cuando estés listo.',
    side: 'left',
  },
  {
    element: '[data-tour="pos-hotkeys-btn"]',
    title: '⌨️ Atajos de teclado — NUEVO',
    description: 'Click aquí (o pulsa "?") para ver y configurar TODOS los atajos. Cada terminal puede tener sus propias teclas. Defaults: F1=cobrar, F2=crédito, F3=cliente, F4=descuento, F12=retener.',
    side: 'bottom',
  },
  {
    element: '[data-tour="pos-customer"]',
    title: '👤 Cliente de la venta',
    description: 'F3 = foco aquí. Busca cliente existente o crea uno nuevo (Ctrl+N). F8 toggle a Consumidor Final.',
    side: 'left',
  },
  {
    element: '[data-tour="pos-pay"]',
    title: '💵 Cobrar (F1)',
    description: 'F1 abre el modal de pago: efectivo USD, transferencia Bs, Zelle, Pago Móvil, mixto. Calcula vuelto automático y maneja IGTF (3% sobre divisas).',
    side: 'top',
  },
  {
    element: '[data-tour="pos-credit"]',
    title: '💳 Vender a crédito (F2)',
    description: 'Para clientes con cupo de crédito. Genera factura en CxC, agenda vencimiento, y queda en Cobranza para seguimiento.',
    side: 'top',
  },
];

const TOUR_KEY_PREFIX = 'tour_pos_v1_';

export function posTourSeen(cajaId: string): boolean {
  if (!cajaId) return true;
  try {
    return localStorage.getItem(TOUR_KEY_PREFIX + cajaId) === '1';
  } catch {
    return true;
  }
}

export function markPosTourSeen(cajaId: string): void {
  if (!cajaId) return;
  try {
    localStorage.setItem(TOUR_KEY_PREFIX + cajaId, '1');
  } catch {
    // ignore
  }
}

export function resetPosTour(cajaId: string): void {
  if (!cajaId) return;
  try {
    localStorage.removeItem(TOUR_KEY_PREFIX + cajaId);
  } catch {
    // ignore
  }
}
