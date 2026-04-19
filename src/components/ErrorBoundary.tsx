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

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { error, errorId, copied } = this.state;
    const message = error?.message || 'Error desconocido';

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600/20 to-rose-600/10 border-b border-red-500/20 px-6 py-5 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={22} className="text-red-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-0.5">
                Ocurrió un error inesperado
              </p>
              <h2 className="text-base font-black">Dualis ERP detectó un problema</h2>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Algo salió mal al renderizar la pantalla. Tu información está a salvo — no perdiste nada.
              Puedes reintentar, recargar la página, o copiar el error para reportarlo al soporte.
            </p>

            <div className="bg-slate-950/60 border border-red-500/20 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400/70 mb-1.5">
                Mensaje
              </p>
              <pre className="text-xs text-red-300 font-mono break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                {message}
              </pre>
            </div>

            {errorId && (
              <div className="text-[10px] text-slate-500">
                ID del error: <span className="font-mono text-slate-400">{errorId}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex flex-col sm:flex-row gap-2">
            <button
              onClick={this.handleReset}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              Reintentar
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Home size={14} />
              Recargar
            </button>
            <button
              onClick={this.handleCopy}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Copy size={14} />
              {copied ? 'Copiado ✓' : 'Copiar error'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
