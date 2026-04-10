/**
 * DriverTour — Fase C.4 del SUPERPLAN.
 *
 * Wrapper ligero alrededor de driver.js. Se dispara UNA sola vez por usuario
 * después del onboarding, marcando `users/{uid}.tourCompleted=true` en Firestore
 * para no volver a aparecer. Puede re-ejecutarse manualmente desde Configuración
 * → Apariencia → "Volver a ver tour".
 *
 * Usa lazy import para no cargar driver.js en el first paint — solo cuando
 * el tour realmente se va a mostrar.
 */

import { useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface TourStep {
  element: string;                // CSS selector — usa data-tour="..."
  title: string;
  description: string;
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over';
  align?: 'start' | 'center' | 'end';
}

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="sidebar"]',
    title: '¡Bienvenido a Dualis ERP!',
    description: 'Desde esta barra lateral navegas entre todos los módulos. Se adapta a tu tipo de negocio.',
    side: 'right',
  },
  {
    element: '[data-tour="nav-pos"]',
    title: 'Punto de venta',
    description: 'Aquí vendes — POS Mayor para facturación completa, POS Detal para venta rápida de mostrador.',
    side: 'right',
  },
  {
    element: '[data-tour="nav-inventario"]',
    title: 'Inventario',
    description: 'Controla productos, stock por almacén, bultos, variantes y recepción de mercancía.',
    side: 'right',
  },
  {
    element: '[data-tour="nav-cxc"]',
    title: 'Cuentas por cobrar',
    description: 'Clientes, saldos, facturas pendientes y aging. Aquí registras abonos y compensaciones.',
    side: 'right',
  },
  {
    element: '[data-tour="nav-reportes"]',
    title: 'Reportes y estadísticas',
    description: 'KPIs, libro de movimientos, flujo de caja y análisis Pareto 80/20.',
    side: 'right',
  },
  {
    element: '[data-tour="topbar-search"]',
    title: 'Búsqueda global (Ctrl+K)',
    description: 'Encuentra cualquier cliente, producto o movimiento en segundos.',
    side: 'bottom',
  },
  {
    element: '[data-tour="topbar-config"]',
    title: 'Configuración',
    description: 'Personaliza tu negocio, tasas, roles, tema, portal de clientes y mucho más.',
    side: 'bottom',
  },
];

/**
 * Lanza el tour con los pasos provistos. Si falla la carga de driver.js
 * (p.ej. sin red), hace no-op silencioso.
 */
export async function runTour(steps: TourStep[] = DEFAULT_TOUR_STEPS): Promise<void> {
  try {
    const mod = await import('driver.js');
    const { driver } = mod as any;
    if (!driver) return;

    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 8,
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '¡Listo!',
      steps: steps
        .filter(s => document.querySelector(s.element)) // skip missing targets
        .map(s => ({
          element: s.element,
          popover: {
            title: s.title,
            description: s.description,
            side: s.side,
            align: s.align,
          },
        })),
    });

    if (d.getConfig().steps?.length) {
      d.drive();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[DriverTour] load failed (ignored):', e);
  }
}

/**
 * Hook que expone `startTour` y `markTourCompleted` para disparar y persistir.
 */
export function useDriverTour(uid?: string) {
  const startTour = useCallback(async (steps?: TourStep[]) => {
    await runTour(steps);
  }, []);

  const markTourCompleted = useCallback(async () => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), { tourCompleted: true });
    } catch {
      // swallow — no queremos romper la app por marcar un flag opcional
    }
  }, [uid]);

  const runAndMark = useCallback(async (steps?: TourStep[]) => {
    await runTour(steps);
    await markTourCompleted();
  }, [markTourCompleted]);

  return { startTour, markTourCompleted, runAndMark };
}
