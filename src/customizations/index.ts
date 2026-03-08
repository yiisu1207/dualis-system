/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         DUALIS — REGISTRO DE CUSTOMIZACIONES POR EMPRESA        ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Para añadir una customización a un cliente:                    ║
 * ║  1. Crea su carpeta:  src/customizations/businesses/{nombre}/   ║
 * ║  2. Crea los componentes necesarios ahí                         ║
 * ║  3. Registra su businessId como clave en CUSTOM_REGISTRY abajo  ║
 * ║  4. Despliega — otras empresas NO son afectadas                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import type { BusinessCustomization } from './types';

// ── Importa aquí los componentes de cada cliente ─────────────────────────────
// import { PanaleriaCustomization } from './businesses/panaderia-xyz';
// import { FarmaciaCustomization }  from './businesses/farmacia-abc';

// ── Registro principal ────────────────────────────────────────────────────────
export const CUSTOM_REGISTRY: Record<string, BusinessCustomization> = {
  // Ejemplo — descomenta y reemplaza con el businessId real del cliente:
  //
  // 'BUSINESS_ID_PANADERIA': PanaleriaCustomization,
  //
  // 'BUSINESS_ID_FARMACIA': {
  //   extraTabs: [{
  //     id:        'lotes',
  //     label:     'Lotes / Vencimiento',
  //     group:     'Operaciones',
  //     component: <ControlLotes />,
  //   }],
  //   afterSaleHook: async (sale) => {
  //     await registrarConsumoMedicamento(sale);
  //   },
  // },
};

/**
 * Returns the customization for a given businessId,
 * or an empty object if none is registered.
 */
export function getCustomization(businessId: string): BusinessCustomization {
  return CUSTOM_REGISTRY[businessId] ?? {};
}
