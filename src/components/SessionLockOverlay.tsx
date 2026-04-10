import React, { useEffect, useRef, useState } from 'react';
import { Lock, LogOut, Delete } from 'lucide-react';

interface Props {
  /** Si true, cubre toda la pantalla y bloquea la UI */
  locked: boolean;
  /** PIN maestro del usuario (4 dígitos). Si undefined, no se puede desbloquear con PIN. */
  masterPin: string | undefined;
  /** Nombre del usuario para mostrar en la pantalla de lock */
  userName?: string;
  /** Callback cuando el PIN es correcto */
  onUnlock: () => void;
  /** Callback cuando el usuario decide cerrar sesión (o agota intentos) */
  onForceLogout: () => void;
}

/**
 * Overlay fullscreen que bloquea la app sin cerrar la sesión de Firebase.
 *
 * Se activa por:
 *  - Inactividad (useIdleTimeout)
 *  - Ctrl+L manual
 *  - Botón "Bloquear" en el perfil
 *
 * Pide el PIN maestro (`users/{uid}.pin`) — el mismo PIN de supervisor
 * configurado en Configuración → Seguridad.
 *
 * Tras 5 intentos fallidos, fuerza logout.
 *
 * Fase A.7 del SUPERPLAN.
 */
export default function SessionLockOverlay({
  locked,
  masterPin,
  userName,
  onUnlock,
  onForceLogout,
}: Props) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset al activarse
  useEffect(() => {
    if (locked) {
      setPin('');
      setError(null);
      setShake(false);
      // Focus para capturar teclado físico
      setTimeout(() => containerRef.current?.focus(), 50);
    }
  }, [locked]);

  // Listener de teclado físico (números + backspace + enter)
  useEffect(() => {
    if (!locked) return;

    const handler = (e: KeyboardEvent) => {
      // Evitar capturar cuando el usuario escribe en otro input (no debería haber otros con este overlay)
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Validación se dispara automáticamente en el useEffect de pin
      } else if (e.key === 'Escape') {
        // No permitir cerrar con Escape
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [locked]);

  // Validación cuando se completan 4 dígitos
  useEffect(() => {
    if (!locked || pin.length !== 4) return;

    if (!masterPin) {
      setError('No hay PIN maestro configurado. Contacta al administrador o cierra sesión.');
      return;
    }

    if (pin === masterPin) {
      // ✓ Correcto
      setPin('');
      setAttempts(0);
      setError(null);
      onUnlock();
    } else {
      // ✗ Incorrecto
      const next = attempts + 1;
      setAttempts(next);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setPin(''), 300);

      if (next >= 5) {
        setError('Demasiados intentos fallidos. Cerrando sesión...');
        setTimeout(() => onForceLogout(), 1500);
      } else {
        setError(`PIN incorrecto. ${5 - next} intento${5 - next === 1 ? '' : 's'} restante${5 - next === 1 ? '' : 's'}.`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, locked]);

  if (!locked) return null;

  const handleDigit = (d: string) => {
    if (pin.length < 4) setPin((prev) => prev + d);
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Pantalla bloqueada"
    >
      <div className={`w-full max-w-sm ${shake ? 'animate-[shake_0.5s]' : ''}`}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-500/40 mb-4">
            <Lock className="h-8 w-8 text-indigo-300" />
          </div>
          <h1 className="text-xl font-black text-white mb-1">Sesión bloqueada</h1>
          {userName && (
            <p className="text-sm text-slate-400">{userName}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Introduce tu PIN maestro para continuar
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex items-center justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-all ${
                pin.length > i
                  ? 'bg-indigo-400 border-indigo-400 scale-110'
                  : 'bg-transparent border-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 text-center text-xs font-semibold text-rose-400 min-h-[18px]">
            {error}
          </div>
        )}
        {!error && <div className="mb-4 min-h-[18px]" />}

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => handleDigit(String(n))}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-white text-2xl font-bold transition-colors active:scale-95"
            >
              {n}
            </button>
          ))}
          <div /> {/* spacer */}
          <button
            onClick={() => handleDigit('0')}
            className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-white text-2xl font-bold transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Borrar"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* Logout escape hatch */}
        <button
          onClick={onForceLogout}
          className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
