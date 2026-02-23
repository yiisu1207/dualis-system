import React, { useEffect, useMemo, useState } from 'react';

const CONFETTI_PIECES = Array.from({ length: 14 }, (_, index) => ({
  id: `confetti-${index}`,
  left: `${(index * 7) % 90}%`,
  top: `${(index * 11) % 55}%`,
  delay: `${(index % 5) * 0.12}s`,
  rotate: `${index * 22}deg`,
  color: `hsl(${(index * 36) % 360} 70% 55%)`,
}));

type Task = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  auto?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

interface OnboardingChecklistProps {
  storageKey: string;
  hasFirstInvoice: boolean;
  onCreateInvoice?: () => void;
  onOpenCustomers?: () => void;
  onOpenConfig?: () => void;
  onOpenHelp?: () => void;
}

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  storageKey,
  hasFirstInvoice,
  onCreateInvoice,
  onOpenCustomers,
  onOpenConfig,
  onOpenHelp,
}) => {
  const [manualDone, setManualDone] = useState<Record<string, boolean>>({});
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setManualDone(parsed);
    } catch (error) {
      console.warn('No se pudo leer el checklist', error);
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(manualDone));
  }, [storageKey, manualDone]);

  useEffect(() => {
    if (!showConfetti) return undefined;
    const timer = window.setTimeout(() => setShowConfetti(false), 1200);
    return () => window.clearTimeout(timer);
  }, [showConfetti]);

  const tasks = useMemo<Task[]>(
    () => [
      {
        id: 'first-invoice',
        label: 'Crea tu primera factura',
        description: 'Registra una venta desde Panorama.',
        done: hasFirstInvoice,
        auto: true,
        actionLabel: 'Crear factura',
        onAction: onCreateInvoice,
      },
      {
        id: 'client-profile',
        label: 'Visita la hoja de vida de un cliente',
        description: 'Revisa historial, pagos y estado.',
        done: manualDone['client-profile'] || false,
        actionLabel: 'Ver clientes',
        onAction: onOpenCustomers,
      },
      {
        id: 'workspace-code',
        label: 'Copia tu codigo de espacio',
        description: 'Invita socios desde Configuracion.',
        done: manualDone['workspace-code'] || false,
        actionLabel: 'Ir a configuracion',
        onAction: onOpenConfig,
      },
    ],
    [hasFirstInvoice, manualDone, onCreateInvoice, onOpenCustomers, onOpenConfig]
  );

  const completedCount = tasks.filter((task) => task.done).length;

  const toggleTask = (task: Task) => {
    if (task.auto) return;
    const nextValue = !task.done;
    setManualDone((prev) => ({ ...prev, [task.id]: nextValue }));
    if (nextValue) setShowConfetti(true);
  };

  return (
    <div className="app-panel p-5 relative overflow-hidden">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {CONFETTI_PIECES.map((piece) => (
            <span
              key={piece.id}
              className="absolute text-lg animate-bounce"
              style={{
                left: piece.left,
                top: piece.top,
                animationDelay: piece.delay,
                transform: `rotate(${piece.rotate})`,
                color: piece.color,
              }}
            >
              ✦
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            Tus primeros pasos
          </div>
          <div className="text-sm font-black text-slate-800 dark:text-slate-100">Checklist de novato</div>
        </div>
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-300">
          {completedCount}/{tasks.length} completado
        </div>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${(completedCount / tasks.length) * 100}%` }}
        ></div>
      </div>

      <div className="mt-4 space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
              task.done
                ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/70 dark:bg-emerald-900/25'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => toggleTask(task)}
                className="flex items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-black ${
                    task.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 text-slate-300 dark:border-slate-600 dark:text-slate-600'
                  }`}
                >
                  {task.done ? '✓' : ''}
                </span>
                <div>
                  <div className="text-xs font-black text-slate-700 dark:text-slate-100 uppercase">
                    {task.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-300">
                    {task.description}
                  </div>
                </div>
              </button>
              {task.auto && (
                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
                  Auto
                </span>
              )}
            </div>
            {task.actionLabel && task.onAction && !task.done && (
              <button
                type="button"
                onClick={task.onAction}
                className="self-start px-3 py-1 rounded-full text-[10px] font-black bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                {task.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          Completa tareas y desbloquea confeti.
        </div>
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            Ver guia rapida
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingChecklist;
