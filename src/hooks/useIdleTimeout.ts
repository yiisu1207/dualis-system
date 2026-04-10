import { useEffect, useRef } from 'react';

/**
 * Detecta inactividad del usuario y dispara `onIdle` al pasar `timeoutMs`.
 *
 * Reinicia el contador cada vez que hay actividad (mouse, keyboard, touch, scroll).
 * Usa `Date.now()` + setInterval en lugar de setTimeout recursivo para que no se
 * afecte por throttling del navegador cuando la tab está en background.
 *
 * También dispara al volver de background en PWA si la tab estuvo oculta más
 * que `timeoutMs` (via visibilitychange).
 *
 * Fase A.7 del SUPERPLAN.
 *
 * @param timeoutMs — milisegundos de inactividad antes de disparar onIdle. Si ≤ 0, no dispara.
 * @param onIdle — callback a ejecutar cuando expira el timer.
 * @param enabled — si false, el hook no monta listeners (default true).
 */
export function useIdleTimeout(
  timeoutMs: number,
  onIdle: () => void,
  enabled = true,
) {
  const lastActivityRef = useRef<number>(Date.now());
  const firedRef = useRef<boolean>(false);
  const onIdleRef = useRef(onIdle);

  // Mantener la callback siempre fresca sin re-suscribir los listeners
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    const reset = () => {
      lastActivityRef.current = Date.now();
      firedRef.current = false;
    };

    const events: Array<keyof WindowEventMap> = [
      'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click', 'wheel',
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    // Tick cada 5s — suficiente precisión para un timeout de minutos
    const interval = window.setInterval(() => {
      if (firedRef.current) return;
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= timeoutMs) {
        firedRef.current = true;
        onIdleRef.current();
      }
    }, 5000);

    // Al volver de background, si estuvo oculto más que timeout, disparar
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !firedRef.current) {
        const idleTime = Date.now() - lastActivityRef.current;
        if (idleTime >= timeoutMs) {
          firedRef.current = true;
          onIdleRef.current();
        }
      } else if (document.visibilityState === 'hidden') {
        // Marcar el timestamp para que al volver se compare contra el momento en que se ocultó
        // (el listener de activity deja lastActivityRef en el último evento real)
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timeoutMs, enabled]);
}
