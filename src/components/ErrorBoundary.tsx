import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Home } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { captureException as sentryCapture } from '../utils/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  copied: boolean;
}

// Heurística: detecta errores causados por un deploy nuevo donde el index viejo
// (cacheado en el navegador del usuario) intenta importar un chunk con hash que
// ya no existe en el servidor. Vercel responde el index.html como fallback SPA,
// lo que dispara un MIME mismatch o un "Failed to fetch dynamically imported
// module". Patrones observados en Chrome/Firefox/Safari.
function isStaleChunkError(err: Error): boolean {
  const m = (err?.message || '').toLowerCase();
  return (
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('failed to load module script') ||
    m.includes('importing a module script failed') ||
    m.includes("expected a javascript-or-wasm module script") ||
    // Chunk loading failures de webpack/vite también caen aquí
    (m.includes('chunkloadError'.toLowerCase())) ||
    m.includes('loading chunk') ||
    m.includes('loading css chunk')
  );
}

const RELOAD_FLAG_KEY = '__dualis_stale_chunk_reload_at';

/**
 * ErrorBoundary global. Montar en el root — envuelve <App />.
 *
 * Captura errores de rendering, ciclo de vida y constructores de los
 * componentes hijos. NO captura errores asíncronos (setTimeout, fetch, etc.) —
 * ésos los toma el window.onerror / unhandledrejection handler (ver index.tsx).
 *
 * Al capturar un error:
 *   1. Muestra fallback UI con acciones (Reintentar / Copiar / Recargar)
 *   2. Escribe a Firestore errorLogs/{id} con stack + contexto
 *   3. Permite al usuario copiar el error al portapapeles para reportarlo
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Auto-reload si el error es un chunk obsoleto tras un deploy.
    // Guardamos timestamp en sessionStorage — si ya reloadeamos en los últimos
    // 30s, NO volvemos a hacerlo (evita loop infinito si el chunk realmente
    // no existe y no es un deploy reciente).
    if (isStaleChunkError(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || 0);
        const now = Date.now();
        if (!last || now - last > 30_000) {
          sessionStorage.setItem(RELOAD_FLAG_KEY, String(now));
          // Log best-effort antes de recargar (fire-and-forget)
          void this.logToFirestore(error, errorInfo);
          // Pequeño delay para no interrumpir el log; el usuario ve el fallback
          // por <200ms y luego la página se recarga limpia.
          setTimeout(() => window.location.reload(), 150);
          return;
        }
      } catch {
        // sessionStorage podría estar bloqueado — seguimos con el flujo normal
      }
    }

    // Best-effort log a Firestore — NO bloquear la UI si falla
    void this.logToFirestore(error, errorInfo);

    // Sentry (no-op si DSN no está configurado)
    try {
      sentryCapture(error, {
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : null,
      });
    } catch {}

    // También a consola para DX local
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  private async logToFirestore(error: Error, errorInfo: ErrorInfo) {
    try {
      const user = auth.currentUser;
      const docRef = await addDoc(collection(db, 'errorLogs'), {
        message: error.message || 'Unknown error',
        stack: (error.stack || '').slice(0, 10000),
        componentStack: (errorInfo.componentStack || '').slice(0, 10000),
        userId: user?.uid || null,
        userEmail: user?.email || null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        createdAt: serverTimestamp(),
      });
      this.setState({ errorId: docRef.id });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.warn('[ErrorBoundary] No se pudo escribir errorLog:', logErr);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorId: null, copied: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = async () => {
    const { error, errorInfo, errorId } = this.state;
    const text = [
      `Error ID: ${errorId || 'n/a'}`,
      `Message: ${error?.message || 'unknown'}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'n/a'}`,
      `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`,
      '',
      '--- Stack ---',
      error?.stack || 'no stack',
      '',
      '--- Component Stack ---',
      errorInfo?.componentStack || 'no component stack',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      // Fallback: seleccionar un textarea temporal
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }
  };

  /** Heurística amigable: traduce un error técnico a una causa probable
   *  legible para el usuario, con una acción sugerida. */
  private diagnose(message: string): { title: string; hint: string; suggested: 'retry' | 'reload' | 'home' } {
    const m = message.toLowerCase();
    if (m.includes('useState') && m.includes('null')) {
      return {
        title: 'Conflicto de carga del módulo',
        hint: 'Probablemente quedó una versión vieja en caché. Recarga la página para que el sistema cargue limpio.',
        suggested: 'reload',
      };
    }
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
      return {
        title: 'Sin conexión',
        hint: 'No pudimos contactar al servidor. Revisa tu internet y reintenta.',
        suggested: 'retry',
      };
    }
    if (m.includes('permission-denied') || m.includes('insufficient permissions')) {
      return {
        title: 'Permisos insuficientes',
        hint: 'Tu cuenta no tiene acceso a ese recurso. Contacta al administrador del negocio.',
        suggested: 'home',
      };
    }
    if (m.includes('quota') || m.includes('rate limit')) {
      return {
        title: 'Límite alcanzado',
        hint: 'Tu negocio alcanzó un límite de uso. Espera unos minutos o contacta a soporte.',
        suggested: 'retry',
      };
    }
    if (m.includes('cannot read') || m.includes('undefined') || m.includes('null')) {
      return {
        title: 'Dato inesperado',
        hint: 'Encontramos un valor faltante donde esperábamos uno. Reintentar suele resolverlo.',
        suggested: 'retry',
      };
    }
    return {
      title: 'Error inesperado',
      hint: 'Algo salió mal pero tus datos están a salvo. Reintenta o copia el error para reportarlo.',
      suggested: 'retry',
    };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { error, errorId, copied } = this.state;
    const message = error?.message || 'Error desconocido';
    const diag = this.diagnose(message);
    const ts = new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'medium' });

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#070b14] via-[#0a1024] to-[#070b14] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Glow ambiente */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-rose-500/[0.08] blur-3xl" />
        </div>

        <div className="relative w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-rose-500/25 rounded-2xl shadow-2xl shadow-rose-500/10 overflow-hidden">
          {/* Header con marca */}
          <div className="bg-gradient-to-r from-rose-600/15 via-rose-500/10 to-transparent border-b border-rose-500/20 px-6 py-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/30">
              <AlertTriangle size={24} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300/80 mb-0.5">
                Dualis ERP · {ts}
              </p>
              <h2 className="text-lg font-black text-white">{diag.title}</h2>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Hint legible */}
            <div className="rounded-xl bg-rose-500/[0.08] border border-rose-500/20 px-4 py-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-rose-300 text-sm font-black">i</span>
              </div>
              <p className="text-sm text-rose-100/90 leading-relaxed">
                {diag.hint}
              </p>
            </div>

            <p className="text-[12px] text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-300">Tu información está a salvo</span> — no perdiste nada.
              Puedes reintentar (mantiene tu sesión), recargar la página, o copiar el error para reportarlo al soporte.
            </p>

            {/* Detalle técnico colapsable */}
            <details className="group rounded-xl bg-slate-950/60 border border-slate-800/80 overflow-hidden">
              <summary className="cursor-pointer px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 flex items-center justify-between">
                <span>Detalle técnico</span>
                <span className="text-[10px] text-slate-500 group-open:hidden">click para expandir</span>
              </summary>
              <div className="border-t border-slate-800/80 px-4 py-3 space-y-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Mensaje</p>
                  <pre className="text-[11px] text-rose-300 font-mono break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {message}
                  </pre>
                </div>
                {errorId && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">ID del error</p>
                    <p className="font-mono text-[11px] text-slate-400 select-all">{errorId}</p>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">URL</p>
                  <p className="font-mono text-[11px] text-slate-400 break-all">{typeof window !== 'undefined' ? window.location.href : '—'}</p>
                </div>
              </div>
            </details>
          </div>

          {/* Actions — orden adaptado al diagnóstico */}
          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-2">
            <button
              onClick={diag.suggested === 'reload' ? this.handleReload : this.handleReset}
              className="flex-1 py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              {diag.suggested === 'reload' ? 'Recargar página' : 'Reintentar'}
            </button>
            {diag.suggested !== 'reload' && (
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
              >
                <Home size={14} />
                Recargar
              </button>
            )}
            <button
              onClick={this.handleCopy}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Copy size={14} />
              {copied ? 'Copiado ✓' : 'Copiar error'}
            </button>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500">
            <span className="font-mono">Dualis ERP</span>
            <a
              href="mailto:soporte@dualisystem.com?subject=Error en Dualis ERP"
              className="text-slate-400 hover:text-indigo-400 font-semibold uppercase tracking-wider"
            >
              Contactar soporte →
            </a>
          </div>
        </div>
      </div>
    );
  }
}
