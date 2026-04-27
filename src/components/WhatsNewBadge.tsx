// Sistema "What's New" — notifica a usuarios existentes de features nuevas.
//
// Componentes:
//   - WhatsNewBadge       → mini pill "NEW" para colocar al lado de items recién agregados
//   - WhatsNewModal       → modal con highlights de la versión actual
//   - useWhatsNew()       → hook para auto-disparar el modal una vez por versión
//
// Versionado: cada release nuevo bumpea WHATS_NEW_VERSION. Usuarios que ya
// vieron el modal de la versión anterior reciben el modal nuevo automáticamente
// la próxima vez que entren. Persistencia en localStorage por usuario.

import React, { useState } from 'react';
import { Sparkles, X, ChevronRight, Zap, Package, Keyboard, Search, TrendingUp, Award } from 'lucide-react';

// ─── VERSIONING ──────────────────────────────────────────────────────────────
// Bumpea esto cuando agregues una nueva tanda de "what's new".
export const WHATS_NEW_VERSION = '2026.04.26';

const STORAGE_KEY = 'dualis_whatsnew_seen_v';

interface WhatsNewItem {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  /** Tab/sección a la que lleva si el usuario clickea "Probar". Opcional. */
  goToTab?: string;
}

const HIGHLIGHTS: WhatsNewItem[] = [
  {
    icon: Package,
    iconColor: 'text-emerald-400',
    title: 'Inventario reorganizado en módulos',
    description: 'Ahora tiene Dashboard, Productos, Recepción, Salidas, Movimientos, Ajustes, Conteo físico y Almacenes. Cada uno con su espacio dedicado.',
    goToTab: 'inventario',
  },
  {
    icon: TrendingUp,
    iconColor: 'text-violet-400',
    title: 'Predicción de ruptura de stock',
    description: 'El sistema analiza tu velocidad de venta y te avisa: "Pepsi 2L se agota en 3 días". Botón directo para mandar pedido por WhatsApp al proveedor. Ningún ERP local hace esto.',
    goToTab: 'inventario',
  },
  {
    icon: Keyboard,
    iconColor: 'text-indigo-400',
    title: 'Atajos de teclado en POS',
    description: 'F1 cobrar, F2 crédito, F3 cliente, F4 descuento, F12 retener... configurable por terminal. Vendes 5x más rápido.',
    goToTab: 'cajas',
  },
  {
    icon: Search,
    iconColor: 'text-sky-400',
    title: 'Búsqueda inteligente en POS',
    description: 'Tolera typos ("civeza" → cerveza), acentos, orden de palabras y "cocacola" sin espacio. Encuentra todo más rápido.',
    goToTab: 'cajas',
  },
  {
    icon: Award,
    iconColor: 'text-amber-400',
    title: 'Tour guiado por sección',
    description: 'La primera vez que entras a Inventario o POS, te llevamos paso a paso por las features nuevas. Puedes re-verlo desde Configuración.',
  },
];

// ─── Cache module-level: leemos localStorage UNA vez al cargar el módulo,
// no por cada Badge montado. Esto evita 30+ accesos a localStorage en
// cada render del sidebar (que era la causa principal del lag).
let _cachedSeenVersion: string | null | undefined;
function readSeen(): string | null {
  if (_cachedSeenVersion !== undefined) return _cachedSeenVersion;
  try {
    _cachedSeenVersion = localStorage.getItem(STORAGE_KEY);
  } catch {
    _cachedSeenVersion = null;
  }
  return _cachedSeenVersion;
}

/** Invalida el cache — útil después de cerrar el modal "What's New". */
function invalidateCache(): void {
  _cachedSeenVersion = undefined;
}

// ─── BADGE pill "NEW" ────────────────────────────────────────────────────────
interface BadgeProps {
  className?: string;
  /** Versión a chequear — si el usuario ya marcó esta versión, no se muestra. */
  version?: string;
}

// Memo + cache evita que cada uso del badge en el sidebar haga su propio
// useEffect/setState/localStorage. Render plano, sin re-render por estado.
export const WhatsNewBadge: React.FC<BadgeProps> = React.memo(({ className = '', version = WHATS_NEW_VERSION }) => {
  if (readSeen() === version) return null;

  return (
    <span
      className={`
        inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full
        bg-gradient-to-r from-violet-500 to-indigo-500
        text-white text-[8px] font-black uppercase tracking-wider
        shadow-[0_0_8px_rgba(139,92,246,0.5)]
        ${className}
      `}
      title="Nueva feature disponible"
    >
      <Sparkles size={7} className="shrink-0" />
      NEW
    </span>
  );
});
WhatsNewBadge.displayName = 'WhatsNewBadge';

// ─── MODAL "What's New" ──────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  onGoToTab?: (tab: string) => void;
}

export const WhatsNewModal: React.FC<ModalProps> = ({ open, onClose, onGoToTab }) => {
  if (!open) return null;

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
    } catch {
      // ignore
    }
    invalidateCache();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c1322] via-[#0a0f1e] to-[#0c1322] border border-white/[0.08] shadow-2xl shadow-violet-500/20 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Glow decorativo */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />

        {/* Header */}
        <div className="relative shrink-0 px-6 sm:px-8 pt-6 pb-4 border-b border-white/[0.06]">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white flex items-center justify-center transition-all"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/40">
              <Sparkles size={22} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-400/70">Novedades</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
                ¿Qué hay de nuevo?
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/50 max-w-lg">
            Hicimos cambios importantes. Te resumimos lo más interesante para que aproveches todo desde el primer minuto.
          </p>
        </div>

        {/* Body — lista de highlights */}
        <div className="relative flex-1 overflow-y-auto px-6 sm:px-8 py-4 custom-scroll">
          <div className="space-y-3">
            {HIGHLIGHTS.map((h, i) => (
              <div
                key={i}
                className="group relative flex items-start gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.10] transition-all"
              >
                <div className={`shrink-0 w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center ${h.iconColor}`}>
                  <h.icon size={19} strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-black text-white leading-tight">
                    {h.title}
                  </h3>
                  <p className="mt-1 text-[13px] text-white/55 leading-relaxed">
                    {h.description}
                  </p>
                  {h.goToTab && onGoToTab && (
                    <button
                      onClick={() => {
                        handleClose();
                        onGoToTab(h.goToTab!);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Probar ahora <ChevronRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative shrink-0 px-6 sm:px-8 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium text-white/30">
            Versión {WHATS_NEW_VERSION}
          </p>
          <button
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-500/30 flex items-center gap-2"
          >
            <Zap size={13} />
            Entendido, ¡a usar!
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── HOOK ────────────────────────────────────────────────────────────────────
/**
 * Auto-dispara el modal What's New si el usuario aún no vio esta versión.
 *
 * Devuelve { open, setOpen } por si quieres dispararlo manualmente
 * desde un botón en Configuración o el menú de ayuda.
 */
export function useWhatsNew(): { open: boolean; openModal: () => void; closeModal: () => void } {
  // Inicial sincrónico: lee del cache (1 acceso a localStorage en TODO el módulo).
  // Sin useEffect → sin re-render extra al montar.
  const [open, setOpen] = useState<boolean>(() => readSeen() !== WHATS_NEW_VERSION);

  return {
    open,
    openModal: () => setOpen(true),
    closeModal: () => setOpen(false),
  };
}

/**
 * Resetea el flag — útil para probar el modal en development o desde
 * Configuración con un botón "volver a ver novedades".
 */
export function resetWhatsNew(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
