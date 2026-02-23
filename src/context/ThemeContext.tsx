import React from 'react';

type ThemeMode = 'light';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: 'light';
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const applyThemeClass = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark');
  root.style.colorScheme = 'light';
};

export const ThemeProvider: React.FC<{ children: React.FC<any> | React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    applyThemeClass();
  }, []);

  const handleSetMode = React.useCallback(() => undefined, []);
  const toggle = React.useCallback(() => undefined, []);

  const value = React.useMemo(
    () => ({ 
      mode: 'light' as const, 
      resolvedTheme: 'light' as const, 
      setMode: handleSetMode, 
      toggle 
    }),
    [handleSetMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
