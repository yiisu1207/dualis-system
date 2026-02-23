import React, { useMemo, useState } from 'react';

type Slide = {
  title: string;
  description: string;
  icon: string;
};

const SLIDES: Slide[] = [
  {
    title: 'Bienvenido a tu ERP Colaborativo',
    description: 'Todo tu equipo trabajando en la misma nube, sin perder el control.',
    icon: 'fa-solid fa-people-group',
  },
  {
    title: 'Nuevo Chat de Equipo',
    description: 'Coordina pagos y decisiones sin salir del tablero.',
    icon: 'fa-regular fa-comments',
  },
  {
    title: 'Widgets Flotantes',
    description: 'Calculadora, notas y conversor siempre a la mano.',
    icon: 'fa-solid fa-layer-group',
  },
  {
    title: 'Auditoria Segura',
    description: 'Compara libros con privacidad total y trazabilidad.',
    icon: 'fa-solid fa-shield-halved',
  },
];

interface WelcomeTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToGuide?: () => void;
}

const WelcomeTourModal: React.FC<WelcomeTourModalProps> = ({ isOpen, onClose, onGoToGuide }) => {
  const [index, setIndex] = useState(0);

  const current = useMemo(() => SLIDES[index], [index]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/20 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-2xl p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500 font-black">
            Tour de bienvenida
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl shadow-lg">
            <i className={current.icon}></i>
          </div>
          <h2 className="mt-4 text-2xl font-black text-slate-900 dark:text-slate-100">
            {current.title}
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            {current.description}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i === index ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            ></span>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIndex((prev) => Math.max(prev - 1, 0))}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 dark:text-slate-300"
            disabled={index === 0}
          >
            Anterior
          </button>
          {index < SLIDES.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((prev) => Math.min(prev + 1, SLIDES.length - 1))}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-black"
            >
              Siguiente
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (onGoToGuide ? onGoToGuide() : onClose())}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300"
              >
                Ir a la guia de inicio rapido
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-xs font-black"
              >
                Empezar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WelcomeTourModal;
