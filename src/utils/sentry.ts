/**
 * Sentry wrapper — Fase A.6 del SUPERPLAN.
 *
 * Objetivo: tener la integración lista sin bloquear el build si el paquete
 * `@sentry/react` no está instalado o si el DSN no está configurado. Todo
 * funciona como no-op mientras no haya DSN. Cuando el usuario:
 *   1. `npm i @sentry/react`
 *   2. Define `VITE_SENTRY_DSN` en su `.env.local`
 * …el wrapper activa automáticamente el init, el captureException y el
 * setUser. Sin DSN, todos los métodos son no-op silenciosos.
 *
 * Import dinámico: usamos `import(/* @vite-ignore * / ...)` para que Vite
 * NO intente resolver el módulo en build si no está en node_modules. Esto
 * evita romper `npm run build` cuando el paquete no existe todavía.
 *
 * Pattern: ErrorBoundary.componentDidCatch llama a `captureException` —
 * si Sentry está inicializado, el error llega al dashboard; si no, nada
 * pasa (y el log a Firestore de errorLogs sigue funcionando como backup).
 */

type SentryModule = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, context?: Record<string, unknown>) => void;
  setUser: (user: { id?: string; email?: string } | null) => void;
  withScope: (cb: (scope: unknown) => void) => void;
};

let sentryInstance: SentryModule | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Intenta cargar e inicializar Sentry. Safe to call multiple times —
 * idempotente. Si el DSN no está, no hace nada. Si el paquete no está,
 * swallow el error silenciosamente.
 */
export async function initSentry(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
    if (!dsn) return; // no DSN → no-op

    try {
      // Import indirecto via variable: así TypeScript no intenta resolver
      // el specifier (evita TS2307 cuando @sentry/react no está instalado)
      // y Vite lo trata como dinámico externo. Si el paquete no existe en
      // runtime, el catch devuelve null y el wrapper queda no-op.
      const specifier = '@sentry/react';
      const mod = await import(/* @vite-ignore */ specifier).catch(() => null);
      if (!mod || !mod.init) return;

      mod.init({
        dsn,
        // Sampling bajo — somos un SaaS chico, no queremos quemar la cuota free
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.5,
        environment: (import.meta as any).env?.MODE || 'production',
        // Filtrar errores ruidosos conocidos del browser
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          'Non-Error promise rejection captured',
          'Network request failed',
        ],
      });

      sentryInstance = mod as unknown as SentryModule;
      // eslint-disable-next-line no-console
      console.info('[Sentry] initialized');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] init failed (ignored):', e);
    }
  })();

  return initPromise;
}

/**
 * Captura una excepción. No-op si Sentry no está inicializado.
 * Usar desde ErrorBoundary.componentDidCatch y handlers async críticos.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryInstance) return;
  try {
    sentryInstance.captureException(err, context);
  } catch {
    // swallow — no queremos que reportar un error cause otro error
  }
}

/**
 * Asocia el user actual con los eventos de Sentry. Llamar después de login
 * y al logout (con null). No-op si Sentry no está inicializado.
 */
export function setSentryUser(user: { id?: string; email?: string } | null): void {
  if (!sentryInstance) return;
  try {
    sentryInstance.setUser(user);
  } catch {
    // swallow
  }
}

/**
 * Helper para saber si Sentry está activo (útil en dev tools / debug).
 */
export function isSentryActive(): boolean {
  return sentryInstance !== null;
}
