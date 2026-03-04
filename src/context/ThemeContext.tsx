import React from 'react';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const STORAGE_KEY = 'dualis_theme';

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const applyThemeClass = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
};

const getInitialMode = (): ThemeMode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* SSR safety */ }
  return 'dark'; // Dualis default: dark mode
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = React.useState<ThemeMode>(getInitialMode);

  // Aplicar clase al montar y cada vez que cambia el modo
  React.useEffect(() => {
    applyThemeClass(mode);
  }, [mode]);

  const setMode = React.useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try { localStorage.setItem(STORAGE_KEY, newMode); } catch { /* noop */ }
    applyThemeClass(newMode);
  }, []);

  const toggle = React.useCallback(() => {
    setModeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
      applyThemeClass(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ mode, resolvedTheme: mode, setMode, toggle }),
    [mode, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
