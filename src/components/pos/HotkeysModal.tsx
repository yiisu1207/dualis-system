// Modal para configurar / mostrar atajos de teclado del POS.
// Aparece automáticamente la primera vez que el cajero usa el POS en este
// terminal (onboarding). Después es accesible desde Configuración.

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, X, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import {
  type HotkeyDef,
  DEFAULT_HOTKEYS,
  saveHotkeys,
  resetHotkeys,
  markOnboarded,
  eventToCombo,
  comboLabel,
} from '../../utils/posHotkeys';

interface HotkeysModalProps {
  cajaId: string;
  initial: HotkeyDef[];
  onClose: () => void;
  onSaved: (next: HotkeyDef[]) => void;
  /** Si es true, muestra mensaje de bienvenida + obligatoriedad de cerrar/aceptar. */
  isOnboarding?: boolean;
}

export default function HotkeysModal({
  cajaId, initial, onClose, onSaved, isOnboarding = false,
}: HotkeysModalProps) {
  const [hotkeys, setHotkeys] = useState<HotkeyDef[]>(initial);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const recordingRef = useRef<string | null>(null);

  useEffect(() => {
    recordingRef.current = recordingFor;
  }, [recordingFor]);

  // Captura global de tecla mientras grabamos
  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = eventToCombo(e);
      if (!combo) return; // tecla modificadora sola
      // Detectar conflicto con otra acción
      const existingForOtherAction = hotkeys.find(
        h => h.combo === combo && h.action !== recordingFor,
      );
      if (existingForOtherAction) {
        setConflictWarning(
          `"${comboLabel(combo)}" ya está asignado a "${existingForOtherAction.label}". Cámbialo allá primero o elige otro combo.`,
        );
        return;
      }
      setConflictWarning(null);
      setHotkeys(prev =>
        prev.map(h => (h.action === recordingFor ? { ...h, combo } : h))
      );
      setRecordingFor(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingFor, hotkeys]);

  const handleReset = () => {
    if (!confirm('¿Restaurar todos los atajos a sus valores por defecto?')) return;
    const def = resetHotkeys(cajaId);
    setHotkeys(def);
    setConflictWarning(null);
  };

  const handleSave = () => {
    saveHotkeys(cajaId, hotkeys);
    if (isOnboarding) markOnboarded(cajaId);
    onSaved(hotkeys);
    onClose();
  };

  const handleSkipOnboarding = () => {
    // Guarda defaults y marca onboarded para no volver a mostrar
    saveHotkeys(cajaId, DEFAULT_HOTKEYS);
    markOnboarded(cajaId);
    onSaved(DEFAULT_HOTKEYS);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget && !isOnboarding) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Keyboard size={16} className="text-indigo-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isOnboarding ? '¡Atajos de teclado disponibles!' : 'Configurar atajos de teclado'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-white/50">
                {isOnboarding
                  ? 'Personaliza las teclas para vender más rápido (o usa los defaults)'
                  : `Persistente por terminal · ${cajaId || '—'}`}
              </p>
            </div>
          </div>
          {!isOnboarding && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {isOnboarding && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/[0.05] p-3 mb-3 text-[12px] text-indigo-700 dark:text-indigo-300">
              <p className="font-bold mb-1">💡 Teclas rápidas para tu día a día</p>
              <p>Estos atajos te dejan vender sin levantar las manos del teclado. Son los defaults; si los aceptas, no volvemos a mostrar este mensaje. Después podrás editarlos desde <span className="font-bold">Configuración → Atajos</span>.</p>
            </div>
          )}

          {conflictWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[12px] p-2.5 flex items-start gap-2 mb-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {conflictWarning}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
            {hotkeys.map((hk) => {
              const isRecording = recordingFor === hk.action;
              const isCustomized = hk.combo !== hk.defaultCombo;
              return (
                <div key={hk.action} className="px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{hk.label}</p>
                      {isCustomized && (
                        <span className="px-1 py-0 rounded bg-slate-200 dark:bg-white/[0.08] text-[9px] font-bold text-slate-600 dark:text-white/60">
                          custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-white/50">{hk.description}</p>
                    {isCustomized && (
                      <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">
                        Default: <span className="font-mono">{comboLabel(hk.defaultCombo)}</span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setRecordingFor(isRecording ? null : hk.action)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors min-w-[110px] text-center ${
                      isRecording
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-white/80 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-slate-200 dark:border-white/[0.08]'
                    }`}
                  >
                    {isRecording ? 'Presiona tecla…' : comboLabel(hk.combo)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
          >
            <RotateCcw size={12} /> Restaurar defaults
          </button>
          <div className="flex items-center gap-2">
            {isOnboarding && (
              <button
                onClick={handleSkipOnboarding}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
              >
                Usar defaults
              </button>
            )}
            {!isOnboarding && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
            >
              <Check size={12} /> {isOnboarding ? 'Aceptar y empezar' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
