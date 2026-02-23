import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ModeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="relative w-10 h-10 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 transition-all flex items-center justify-center"
    >
      <span
        className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-90 opacity-0'
        }`}
      >
        🌙
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ${
          isDark ? 'rotate-90 scale-90 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
      >
        ☀️
      </span>
    </button>
  );
}
