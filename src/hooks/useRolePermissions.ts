import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// All sidebar module IDs that can be permission-gated
export const ALL_MODULES = [
  'resumen', 'inventario', 'cajas', 'rrhh', 'sucursales',
  'clientes', 'proveedores', 'contabilidad', 'fiscal', 'tasas', 'conciliacion',
  'tesoreria', 'reclamos',
  'reportes', 'vision', 'comparar', 'widgets', 'config',
] as const;

export type ModuleId = typeof ALL_MODULES[number];
export type RoleKey = 'ventas' | 'auditor' | 'staff' | 'member' | 'almacenista' | 'inventario';
export type RolePermissions = Record<RoleKey, Record<ModuleId, boolean>>;

export const MODULE_LABELS: Record<ModuleId, string> = {
  resumen:      'Dashboard',
  inventario:   'Inventario',
  cajas:        'Ventas / POS',
  rrhh:         'RRHH / Nómina',
  sucursales:   'Sucursales',
  clientes:     'Clientes / CxC',
  proveedores:  'Gastos / CxP',
  contabilidad: 'Contabilidad',
  fiscal:       'Gestión Fiscal',
  tasas:        'Tasas de Cambio',
  conciliacion: 'Conciliación',
  tesoreria:    'Tesorería',
  reclamos:     'Reclamos',
  reportes:     'Estadísticas',
  vision:       'Auditoría IA',
  comparar:     'Comparar Libros',
  widgets:      'Herramientas',
  config:       'Configuración',
};

// Built-in presets
export const PRESETS: Record<string, Partial<Record<ModuleId, boolean>>> = {
  // Cajero / staff: acceso a su caja + ver inventario (solo lectura)
  'Cajero': {
    resumen: false, cajas: true, inventario: true, rrhh: false, sucursales: false,
    clientes: false, proveedores: false, contabilidad: false, fiscal: false,
    tasas: false, conciliacion: false, reclamos: true, reportes: false, vision: false,
    comparar: false, widgets: true, config: false,
  },
  // Vendedor: cajero puro bloqueado a su terminal asignada + ver inventario (sin costos)
  'Vendedor': {
    resumen: false, cajas: true, inventario: true, rrhh: false, sucursales: false,
    clientes: false, proveedores: false, contabilidad: false, fiscal: false,
    tasas: false, conciliacion: false, reclamos: true, reportes: false, vision: false,
    comparar: false, widgets: true, config: false,
  },
  // Almacenista: gestión completa del inventario, sin acceso a POS ni finanzas
  'Almacenista': {
    resumen: false, cajas: false, inventario: true, rrhh: false, sucursales: false,
    clientes: false, proveedores: false, contabilidad: false, fiscal: false,
    tasas: false, conciliacion: false, reportes: false, vision: false,
    comparar: false, widgets: false, config: false,
  },
  'Contador': {
    resumen: true, cajas: false, inventario: true, rrhh: false, sucursales: false,
    clientes: true, proveedores: true, contabilidad: true, fiscal: true,
    tasas: true, conciliacion: true, tesoreria: true, reclamos: true, reportes: true, vision: false,
    comparar: false, widgets: true, config: false,
  },
  'Auditor': {
    resumen: true, cajas: false, inventario: true, rrhh: false, sucursales: false,
    clientes: true, proveedores: true, contabilidad: true, fiscal: true,
    tasas: true, conciliacion: true, tesoreria: true, reclamos: true, reportes: true, vision: true,
    comparar: true, widgets: true, config: false,
  },
  // Jefe de Inventario: gestión completa del catálogo (precios, categorías, aprobación)
  // Sin cajas, RRHH, contabilidad, CxC, CxP ni reportes financieros
  'JefeInventario': {
    resumen: false, cajas: false, inventario: true, rrhh: false, sucursales: false,
    clientes: false, proveedores: false, contabilidad: false, fiscal: false,
    tasas: true, conciliacion: false, reportes: false, vision: false,
    comparar: false, widgets: true, config: false,
  },
  'Completo': {
    resumen: true, cajas: true, inventario: true, rrhh: true, sucursales: true,
    clientes: true, proveedores: true, contabilidad: true, fiscal: true,
    tasas: true, conciliacion: true, tesoreria: true, reclamos: true, reportes: true, vision: true,
    comparar: true, widgets: true, config: false,
  },
};

const makeFullPreset = (partial: Partial<Record<ModuleId, boolean>>): Record<ModuleId, boolean> =>
  Object.fromEntries(ALL_MODULES.map(m => [m, partial[m] ?? false])) as Record<ModuleId, boolean>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  ventas:      makeFullPreset(PRESETS['Vendedor']),
  auditor:     makeFullPreset(PRESETS['Auditor']),
  staff:       makeFullPreset(PRESETS['Cajero']),
  member:      makeFullPreset(PRESETS['Cajero']),
  almacenista: makeFullPreset(PRESETS['Almacenista']),
  inventario:  makeFullPreset(PRESETS['JefeInventario']),
};

// ── Fase C.5 — ACL granular por rol ────────────────────────────────────────
// Lista plana de capabilities operativas, independientes de la visibilidad
// de módulos. Un usuario puede "ver" Inventario (moduleGate) pero no ver
// costos (capability). El enforcement vive en cada pantalla.
//
// IMPORTANTE: owner/admin SIEMPRE tiene todas las capabilities true — el gate
// nunca los bloquea. Los roles sin config definida reciben los defaults
// hardcodeados de abajo (compat total con Usuario A/B existentes).
export type Capability =
  | 'verCostos'             // columnas de costo en inventario, márgenes
  | 'verMargenes'           // rentabilidad en reportes/POS
  | 'anularVentas'          // revertir/anular Movement FACTURA
  | 'darDescuentos'         // aplicar descuento manual en POS
  | 'crearClientes'
  | 'verCxC'
  | 'verSoloMisClientes'    // filtro: solo los clientes creados por este user
  | 'verReportes'
  | 'verTesoreria'
  | 'cerrarTurno'
  | 'cobrarPOS'
  | 'gestionarInventario'   // crear/editar productos
  | 'hacerDespacho'
  | 'recibirMercancia'
  | 'aprobarPagos'          // aprobar portalPayments / paymentRequests
  | 'aprobarMovimientos'    // Fase D.0 — firmar pendingMovements en quórum
  | 'eliminarDatos';        // delete de docs (movimientos, productos, clientes)

export type CapabilityMap = Partial<Record<Capability, boolean>> & {
  maxDescPct?: number;      // 0–100 — descuento máximo sin aprobación supervisor
};

export type RoleCapabilities = Partial<Record<RoleKey, CapabilityMap>>;

// Defaults hardcodeados — replican comportamiento "pre-Fase C.5" para que
// Usuario A/B no vean ningún cambio sin config explícita en businessConfigs.
export const DEFAULT_CAPABILITIES: Record<RoleKey, CapabilityMap> = {
  ventas: {
    verCostos: false, verMargenes: false,
    anularVentas: false, darDescuentos: true, maxDescPct: 10,
    crearClientes: true, verCxC: false, verSoloMisClientes: true,
    verReportes: false, verTesoreria: false,
    cerrarTurno: true, cobrarPOS: true,
    gestionarInventario: false, hacerDespacho: false, recibirMercancia: false,
    aprobarPagos: false, aprobarMovimientos: false, eliminarDatos: false,
  },
  staff: {
    verCostos: false, verMargenes: false,
    anularVentas: false, darDescuentos: true, maxDescPct: 5,
    crearClientes: true, verCxC: false, verSoloMisClientes: false,
    verReportes: false, verTesoreria: false,
    cerrarTurno: true, cobrarPOS: true,
    gestionarInventario: false, hacerDespacho: false, recibirMercancia: false,
    aprobarPagos: false, aprobarMovimientos: false, eliminarDatos: false,
  },
  member: {
    verCostos: false, verMargenes: false,
    anularVentas: false, darDescuentos: true, maxDescPct: 5,
    crearClientes: true, verCxC: false, verSoloMisClientes: false,
    verReportes: false, verTesoreria: false,
    cerrarTurno: true, cobrarPOS: true,
    gestionarInventario: false, hacerDespacho: false, recibirMercancia: false,
    aprobarPagos: false, aprobarMovimientos: false, eliminarDatos: false,
  },
  almacenista: {
    verCostos: true, verMargenes: false,
    anularVentas: false, darDescuentos: false, maxDescPct: 0,
    crearClientes: false, verCxC: false, verSoloMisClientes: false,
    verReportes: false, verTesoreria: false,
    cerrarTurno: false, cobrarPOS: false,
    gestionarInventario: true, hacerDespacho: true, recibirMercancia: true,
    aprobarPagos: false, aprobarMovimientos: false, eliminarDatos: false,
  },
  inventario: {
    verCostos: true, verMargenes: true,
    anularVentas: false, darDescuentos: false, maxDescPct: 0,
    crearClientes: false, verCxC: false, verSoloMisClientes: false,
    verReportes: true, verTesoreria: false,
    cerrarTurno: false, cobrarPOS: false,
    gestionarInventario: true, hacerDespacho: false, recibirMercancia: true,
    aprobarPagos: false, aprobarMovimientos: false, eliminarDatos: false,
  },
  auditor: {
    verCostos: true, verMargenes: true,
    anularVentas: false, darDescuentos: false, maxDescPct: 0,
    crearClientes: false, verCxC: true, verSoloMisClientes: false,
    verReportes: true, verTesoreria: true,
    cerrarTurno: false, cobrarPOS: false,
    gestionarInventario: false, hacerDespacho: false, recibirMercancia: false,
    aprobarPagos: false, aprobarMovimientos: true, eliminarDatos: false,
  },
};

export function useRolePermissions(businessId: string, userRole: string) {
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [capabilities, setCapabilities] = useState<RoleCapabilities>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!businessId) { setLoaded(true); return; }
    getDoc(doc(db, 'businessConfigs', businessId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.rolePermissions) {
            setPermissions(prev => ({ ...prev, ...data.rolePermissions }));
          }
          if (data.roleCapabilities) {
            setCapabilities(data.roleCapabilities as RoleCapabilities);
          }
        }
      })
      .finally(() => setLoaded(true));
  }, [businessId]);

  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

  const canView = (moduleId: ModuleId): boolean => {
    if (isOwnerOrAdmin) return true;
    if (moduleId === 'help' as any) return true;
    const roleKey = userRole as RoleKey;
    if (!(roleKey in permissions)) return false;
    return permissions[roleKey][moduleId] === true;
  };

  // Fase C.5 — ACL granular. Owner/admin SIEMPRE true.
  // Para otros roles: override de businessConfigs → fallback a DEFAULT_CAPABILITIES.
  const can = (cap: Capability): boolean => {
    if (isOwnerOrAdmin) return true;
    const roleKey = userRole as RoleKey;
    const override = capabilities[roleKey]?.[cap];
    if (override !== undefined) return override === true;
    return DEFAULT_CAPABILITIES[roleKey]?.[cap] === true;
  };

  const maxDescPct: number = (() => {
    if (isOwnerOrAdmin) return 100;
    const roleKey = userRole as RoleKey;
    const override = capabilities[roleKey]?.maxDescPct;
    if (override !== undefined) return override;
    return DEFAULT_CAPABILITIES[roleKey]?.maxDescPct ?? 0;
  })();

  return { permissions, capabilities, loaded, canView, can, maxDescPct };
}
