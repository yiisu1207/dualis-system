import React from 'react';
import { X, Keyboard } from 'lucide-react';

/**
 * Keyboard shortcuts cheat-sheet (Fase 8.2).
 * Triggered with "?" anywhere in the app.
 * Shows all registered shortcuts grouped by area.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const CTRL = isMac ? '⌘' : 'Ctrl';

const GROUPS: Group[] = [
  {
    title: 'Navegación Global',
    items: [
      { keys: [CTRL, 'K'], label: 'Abrir búsqueda global' },
      { keys: ['?'], label: 'Mostrar esta ayuda' },
      { keys: ['Esc'], label: 'Cerrar modal / diálogo' },
    ],
  },
  {
    title: 'Punto de Venta',
    items: [
      { keys: ['F2'], label: 'Buscar producto por código' },
      { keys: ['F4'], label: 'Cobrar / finalizar venta' },
      { keys: ['F8'], label: 'Cancelar venta' },
      { keys: ['+'], label: 'Aumentar cantidad del ítem' },
      { keys: ['-'], label: 'Disminuir cantidad del ítem' },
    ],
  },
  {
    title: 'Listas y tablas',
    items: [
      { keys: ['↑', '↓'], label: 'Navegar resultados' },
      { keys: ['Enter'], label: 'Abrir / seleccionar' },
      { keys: ['Tab'], label: 'Siguiente campo' },
    ],
  },
  {
    title: 'Widgets flotantes',
    items: [
      { keys: ['Arrastrar'], label: 'Mover widget' },
      { keys: ['Click X'], label: 'Cerrar widget' },
      { keys: ['Click —'], label: 'Minimizar widget' },
    ],
  },
];

export default function KeyboardShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Keyboard size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Atajos de Teclado</h2>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-white/40">Todo lo que puedes hacer sin mouse</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {GROUPS.map(g => (
              <div key={g.title}>
                <h3 className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-2">
                  {g.title}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-white/70">{s.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-white shadow-sm min-w-[22px] text-center"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02] flex items-center justify-between shrink-0">
          <span className="text-[10px] font-bold text-slate-400 dark:text-white/40">
            Presiona <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-white font-black">?</kbd> en cualquier momento
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
