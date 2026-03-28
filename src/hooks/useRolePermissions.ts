import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// All sidebar module IDs that can be permission-gated
export const ALL_MODULES = [
  'resumen', 'inventario', 'cajas', 'rrhh', 'sucursales',
  'clientes', 'proveedores', 'contabilidad', 'fiscal', 'tasas', 'conciliacion',
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
    tasas: false, conciliacion: false, reportes: false, vision: false,
    comparar: false, widgets: true, config: false,
  },
  // Vendedor: cajero puro bloqueado a su terminal asignada + ver inventario (sin costos)
  'Vendedor': {
    resumen: false, cajas: true, inventario: true, rrhh: false, sucursales: false,
    clientes: false, proveedores: false, contabilidad: false, fiscal: false,
    tasas: false, conciliacion: false, reportes: false, vision: false,
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
    tasas: true, conciliacion: true, reportes: true, vision: false,
    comparar: false, widgets: true, config: false,
  },
  'Auditor': {
    resumen: true, cajas: false, inventario: true, rrhh: false, sucursales: false,
    clientes: true, proveedores: true, contabilidad: true, fiscal: true,
    tasas: true, conciliacion: true, reportes: true, vision: true,
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
    tasas: true, conciliacion: true, reportes: true, vision: true,
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

export function useRolePermissions(businessId: string, userRole: string) {
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!businessId) { setLoaded(true); return; }
    getDoc(doc(db, 'businessConfigs', businessId))
      .then(snap => {
        if (snap.exists() && snap.data().rolePermissions) {
          setPermissions(prev => ({ ...prev, ...snap.data().rolePermissions }));
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

  return { permissions, loaded, canView };
}
