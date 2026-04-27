// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  INVENTARIO MODULE — Orquestador rediseñado                              ║
// ║                                                                          ║
// ║  Layout nuevo: top-tabs horizontales (sin sidebar lateral) + el          ║
// ║  Dashboard como vista por default. El dashboard conecta TODO con KPIs    ║
// ║  vivos, alertas, top productos y accesos rápidos.                        ║
// ║                                                                          ║
// ║  Secciones:                                                              ║
// ║    🏠 Dashboard       — hub principal con KPIs y atajos                  ║
// ║    📦 Productos       — catálogo embebido (Inventario.tsx legacy)        ║
// ║    🔄 Movimientos     — kardex global                                    ║
// ║    ⬇️ Entradas        — recepciones, ajustes+, devoluciones              ║
// ║    ⬆️ Salidas         — despachos, mermas                                ║
// ║    📋 Conteo físico   — sesiones cíclicas                                ║
// ║    🏢 Almacenes       — multi-almacén                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useState } from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine, Activity,
  ClipboardList, Building2, LayoutDashboard, Truck,
} from 'lucide-react';
import DashboardInventario from './DashboardInventario';
import ProductosPage from './ProductosPage';
import MovimientosInventarioPage from './MovimientosInventarioPage';
import RecepcionPage from './RecepcionPage';
import EntradasPage from './EntradasPage';
import SalidasPage from './SalidasPage';
import ConteoFisicoPage from './ConteoFisicoPage';
import AlmacenesPage from './AlmacenesPage';

export type InvSection = 'dashboard' | 'productos' | 'movimientos' | 'recepcion' | 'entradas' | 'salidas' | 'conteo' | 'almacenes';

/** Payload opcional para drill-down: cuando el dashboard navega a otra
 *  sección con un filtro pre-aplicado (ej: "ver solo este producto"). */
export interface InvNavFocus {
  section: InvSection;
  productId?: string;
  productName?: string;
  /** Filtra movimientos a un tipo específico (ej: 'MERMA' al hacer click en alerta). */
  movementType?: string;
}

interface SectionDef {
  id: InvSection;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard, description: 'Vista general · KPIs · alertas · accesos rápidos' },
  { id: 'productos',   label: 'Productos',    icon: Package,         description: 'Catálogo · precios · variantes · kits' },
  { id: 'recepcion',   label: 'Recepción',    icon: Truck,           description: 'Ingreso de mercancía contra factura del proveedor' },
  { id: 'movimientos', label: 'Movimientos',  icon: Activity,        description: 'Kardex global · entradas y salidas históricas' },
  { id: 'entradas',    label: 'Ajustes +',    shortLabel: 'Ajustes+', icon: ArrowDownToLine, description: 'Ajustes positivos · devoluciones · inventario inicial' },
  { id: 'salidas',     label: 'Ajustes −',    shortLabel: 'Ajustes−', icon: ArrowUpFromLine, description: 'Mermas · ajustes negativos · transferencias' },
  { id: 'conteo',      label: 'Conteo físico', shortLabel: 'Conteo', icon: ClipboardList,   description: 'Sesiones cíclicas · aplicación de varianzas' },
  { id: 'almacenes',   label: 'Almacenes',    icon: Building2,       description: 'Gestión multi-almacén' },
];

export default function InventarioModule() {
  const [section, setSection] = useState<InvSection>('dashboard');
  const [focus, setFocus] = useState<InvNavFocus | null>(null);
  const active = SECTIONS.find(s => s.id === section)!;
  const ActiveIcon = active.icon;

  /** Cambia de sección y opcionalmente aplica un filtro pre-cargado. */
  const navigate = (next: InvSection | InvNavFocus) => {
    if (typeof next === 'string') {
      setSection(next);
      setFocus(null);
    } else {
      setSection(next.section);
      setFocus(next);
    }
  };

  const clearFocus = () => setFocus(null);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-full">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-4 sm:py-6">
        {/* Header compacto: título + breadcrumb */}
        <div className="mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shrink-0">
            <ActiveIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/40">
              <span>Inventario</span>
              {section !== 'dashboard' && (
                <>
                  <span className="text-slate-300 dark:text-white/20">/</span>
                  <span className="text-slate-700 dark:text-white/70 font-medium">{active.label}</span>
                </>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {section === 'dashboard' ? 'Inventario' : active.label}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-white/40 mt-0.5 hidden sm:block">{active.description}</p>
          </div>
        </div>

        {/* Top tabs horizontales (sticky) */}
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-5 px-3 sm:px-5 mb-5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06]">
          <nav className="flex gap-0.5 overflow-x-auto hide-scrollbar -mb-px">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const isActive = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                    isActive
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80 hover:border-slate-200 dark:hover:border-white/[0.1]'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.shortLabel || s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Banner de focus activo (cuando vienes con drill-down del dashboard) */}
        {focus && (focus.productName || focus.movementType) && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Focus</span>
            <span className="text-xs text-indigo-700 dark:text-indigo-200 truncate">
              {focus.productName ? `Producto: ${focus.productName}` : `Tipo: ${focus.movementType}`}
            </span>
            <button onClick={clearFocus} className="ml-auto text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Quitar focus
            </button>
          </div>
        )}

        {/* Contenido */}
        <main className="min-w-0">
          {section === 'dashboard'   && <DashboardInventario onNavigate={navigate} />}
          {section === 'productos'   && <ProductosPage />}
          {section === 'recepcion'   && <RecepcionPage />}
          {section === 'movimientos' && <MovimientosInventarioPage />}
          {section === 'entradas'    && <EntradasPage />}
          {section === 'salidas'     && <SalidasPage />}
          {section === 'conteo'      && <ConteoFisicoPage />}
          {section === 'almacenes'   && <AlmacenesPage />}
        </main>
      </div>
    </div>
  );
}
