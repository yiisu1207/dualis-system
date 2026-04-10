import React from 'react';
import { ArrowLeft, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChangelogEntry {
  version: string;
  date: string;
  tag: 'major' | 'minor' | 'patch';
  changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-04-09',
    tag: 'major',
    changes: [
      'Lanzamiento oficial v1 — sistema administrativo completo',
      'POS Mayor y Detal con bultos, barcode, descuento ficticio, arqueo de caja',
      'Cuentas por Cobrar (CxC) con quórum de aprobación y verificación bancaria',
      'Cuentas por Pagar (CxP) rediseñado con 2 paneles',
      'Tesorería completa con cuentas bancarias, estadísticas y conciliación',
      'Portal del cliente con pagos manuales, voucher, chat y fidelidad',
      'Sistema de fidelidad con tiers Bronce a Elite y precios por nivel',
      'Inventario con variantes, kits, lotes FEFO, transferencias entre almacenes',
      'Cotizaciones con PDF, envío por email y conversión a venta',
      'Agenda de cobranza con recordatorios progresivos y calendario',
      'Chat portal bidireccional en tiempo real',
      'Permisos granulares por rol (owner, admin, cajero, vendedor, almacenista)',
      'Gating por tipo de negocio y presets verticales',
      'ErrorBoundary global con logging a Firestore y Sentry',
      'Timeout de sesión configurable con bloqueo PIN',
      'Font scaling accesible (xs a xl)',
      'Disclaimer legal no-SENIAT persistido',
      'Notificaciones en tiempo real (stock bajo, facturas vencidas, pagos portal)',
      'Busqueda global Cmd+K con fuzzy search',
      'Exportar/importar datos (ZIP completo, Excel robusto)',
      'Devoluciones parciales y totales con ajuste de stock',
      'Costo promedio ponderado al recibir mercancia',
      'Calculadora de rentabilidad en productos',
      'Alertas de reposicion inteligente basadas en velocidad de venta',
      'Conteo fisico de inventario con ajuste automatico',
      'Estado de cuenta PDF descargable con aging',
      'Flujo de caja proyectado y analisis Pareto 80/20',
      'PWA instalable con Service Worker',
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  major: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  minor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  patch: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function Changelog() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Volver
        </button>

        <h1 className="text-2xl font-black mb-2">Changelog</h1>
        <p className="text-white/40 text-sm mb-10">Historial de versiones de Dualis ERP</p>

        <div className="space-y-10">
          {CHANGELOG.map((entry) => (
            <article key={entry.version} className="relative pl-6 border-l-2 border-white/10">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-2 border-[#070b14]" />

              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold">v{entry.version}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${TAG_COLORS[entry.tag]}`}>
                  <Tag size={10} className="inline mr-1" />
                  {entry.tag}
                </span>
                <span className="text-white/30 text-xs">{entry.date}</span>
              </div>

              <ul className="space-y-1.5">
                {entry.changes.map((change, i) => (
                  <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                    <span className="text-indigo-400 mt-1 flex-none">-</span>
                    {change}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-white/20 text-xs">Dualis ERP &copy; {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
