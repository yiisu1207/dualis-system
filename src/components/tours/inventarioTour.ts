// Tour de introducción del módulo Inventario.
//
// Cubre todas las features nuevas del refactor modular:
//   - Dashboard de inventario con KPIs y predicción de ruptura
//   - Tabs por sub-módulo (Productos / Recepción / Salidas / Movimientos / Ajustes / Conteo / Almacenes)
//   - Búsqueda fuzzy
//   - Predicción de cobertura por SKU (idea #2 del roadmap)
//   - Acciones rápidas
//
// Se dispara la primera vez que el usuario entra a /admin/inventario.
// Persistencia en localStorage por tenant para no molestar de nuevo.

import type { TourStep } from '../DriverTour';

export const INVENTARIO_TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="inv-hero"]',
    title: '📦 Bienvenido a Inventario',
    description: 'Aquí controlas todo: productos, stock, vencimientos, recepciones y predicciones de ruptura. Te muestro lo nuevo.',
    side: 'bottom',
  },
  {
    element: '[data-tour="inv-tabs"]',
    title: 'Sub-módulos del inventario',
    description: 'Ahora el inventario está organizado en pestañas: Dashboard · Productos · Recepción · Salidas · Movimientos · Ajustes · Conteo físico · Almacenes. Cada una con su propio espacio.',
    side: 'bottom',
  },
  {
    element: '[data-tour="inv-kpi-valor"]',
    title: '💰 Valor del inventario',
    description: 'Suma del valor a costo de todo tu stock — útil para auditoría, seguros, y saber cuánto capital tienes "dormido" en mercancía.',
    side: 'bottom',
  },
  {
    element: '[data-tour="inv-kpi-salud"]',
    title: '🏥 Salud del catálogo',
    description: 'Porcentaje de tus productos en buen estado (con stock). Te avisa cuántos están bajos, críticos o agotados.',
    side: 'bottom',
  },
  {
    element: '[data-tour="inv-prediccion"]',
    title: '🔮 Predicción de ruptura — NUEVO',
    description: 'Inteligencia: el sistema analiza tu velocidad de venta y te dice "Pepsi 2L se agota en 3 días al ritmo actual". Esto NO lo tiene ningún ERP venezolano. Click en "Avisar al proveedor" → mensaje pre-armado para WhatsApp.',
    side: 'top',
  },
  {
    element: '[data-tour="inv-quick-recepcion"]',
    title: 'Recepción de mercancía',
    description: 'Click aquí cuando llega un pedido del proveedor. Registras facturas, cantidades, costos. Se actualiza el stock automáticamente.',
    side: 'top',
  },
  {
    element: '[data-tour="inv-quick-salida"]',
    title: 'Salidas',
    description: 'Para mermas, daños, regalos, uso interno o cualquier ajuste de stock que NO sea venta.',
    side: 'top',
  },
  {
    element: '[data-tour="inv-quick-conteo"]',
    title: 'Conteo físico',
    description: 'Sesiones cíclicas para verificar que el stock real coincide con el sistema. Detecta diferencias = posible robo o error.',
    side: 'top',
  },
  {
    element: '[data-tour="inv-quick-kardex"]',
    title: 'Kardex / Movimientos',
    description: 'Historial completo de cada producto: cuándo entró, cuándo salió, quién lo movió, a qué precio. Auditable.',
    side: 'top',
  },
];

const TOUR_KEY_PREFIX = 'tour_inventario_v1_';

export function inventarioTourSeen(tenantId: string): boolean {
  if (!tenantId) return true;
  try {
    return localStorage.getItem(TOUR_KEY_PREFIX + tenantId) === '1';
  } catch {
    return true;
  }
}

export function markInventarioTourSeen(tenantId: string): void {
  if (!tenantId) return;
  try {
    localStorage.setItem(TOUR_KEY_PREFIX + tenantId, '1');
  } catch {
    // ignore
  }
}

export function resetInventarioTour(tenantId: string): void {
  if (!tenantId) return;
  try {
    localStorage.removeItem(TOUR_KEY_PREFIX + tenantId);
  } catch {
    // ignore
  }
}
