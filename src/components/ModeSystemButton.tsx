import React from 'react';
import { useTheme } from '../context/ThemeContext';

type ModeSystemButtonProps = {
  className?: string;
};

export default function ModeSystemButton({ className = '' }: ModeSystemButtonProps) {
  const { mode, setMode } = useTheme();
  const isSystem = mode === 'system';

  return (
    <button
      type="button"
      onClick={() => setMode('system')}
      title="Usar modo del sistema"
      className={`h-10 px-3 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
        isSystem
          ? 'border-sky-400/70 bg-sky-500/10 text-sky-600 dark:text-sky-300'
          : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
      } ${className}`}
    >
      Auto
    </button>
  );
}
