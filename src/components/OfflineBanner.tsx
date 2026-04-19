import React, { useEffect, useState } from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';

/**
 * Banner global que detecta:
 *  1. Offline (navigator.onLine === false)
 *  2. Quota de Firestore excedida (capturado vía window error listener)
 *  3. Permission denied por reglas Firestore mal configuradas
 *
 * Se monta en MainSystem.tsx — siempre visible cuando hay problema,
 * oculto cuando todo está bien. No bloquea la UI, solo informa.
 *
 * Fase A.5 del SUPERPLAN.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [quotaError, setQuotaError] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Intercepta errores de Firestore vía unhandledrejection
    // (Firestore lanza errores con code/name reconocibles)
    const handler = (evt: PromiseRejectionEvent) => {
      const err = evt.reason as { code?: string; message?: string } | undefined;
      if (!err) return;
      const code = err.code || '';
      const msg = err.message || '';
      // Match estricto en code; en message exigimos contexto de Firestore para
      // evitar falsos positivos por palabras sueltas en stacks ajenos.
      const isFsErr = msg.includes('FirebaseError') || code.startsWith('firestore/') || code.startsWith('functions/');
      if (code === 'resource-exhausted' || (isFsErr && msg.toLowerCase().includes('quota'))) {
        setQuotaError(true);
      }
      if (code === 'permission-denied' || (isFsErr && /missing or insufficient permissions/i.test(msg))) {
        setPermissionError(true);
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (online && !quotaError && !permissionError) return null;

  // Prioridad: offline > quota > permission (el más severo manda)
  let variant: 'offline' | 'quota' | 'permission' = 'offline';
  if (!online) variant = 'offline';
  else if (quotaError) variant = 'quota';
  else if (permissionError) variant = 'permission';

  const config = {
    offline: {
      icon: <WifiOff size={16} />,
      bg: 'bg-amber-600',
      text: 'Sin conexión a internet. Los cambios se guardarán localmente y se sincronizarán cuando vuelvas a estar en línea.',
    },
    quota: {
      icon: <AlertTriangle size={16} />,
      bg: 'bg-rose-700',
      text: 'Firestore: cuota del día excedida. Contacta al administrador.',
    },
    permission: {
      icon: <AlertTriangle size={16} />,
      bg: 'bg-rose-700',
      text: 'Permiso denegado. Verifica que tu sesión esté activa o contacta al administrador.',
    },
  }[variant];

  return (
    <div
      className={`${config.bg} text-white px-4 py-2 flex items-center gap-2 text-xs font-semibold shadow-lg`}
      role="status"
      aria-live="polite"
    >
      <span className="shrink-0">{config.icon}</span>
      <span className="flex-1">{config.text}</span>
      {(quotaError || permissionError) && (
        <button
          onClick={() => {
            setQuotaError(false);
            setPermissionError(false);
          }}
          className="ml-2 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors text-[10px] uppercase tracking-wider"
        >
          Ocultar
        </button>
      )}
    </div>
  );
}
