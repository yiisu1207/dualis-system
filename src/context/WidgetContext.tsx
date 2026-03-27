import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type WidgetKey =
  | 'calculator'
  | 'converter'
  | 'priceChecker'
  | 'speedDial';

type WidgetPosition = {
  x: number;
  y: number;
};

type WidgetState = {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
};

type WidgetManager = {
  widgets: Record<WidgetKey, WidgetState>;
  unreadCounts: Partial<Record<WidgetKey, number>>;
  openWidget: (key: WidgetKey) => void;
  toggleWidget: (key: WidgetKey) => void;
  closeWidget: (key: WidgetKey) => void;
  setMinimized: (key: WidgetKey, minimized: boolean) => void;
  setPosition: (key: WidgetKey, position: WidgetPosition) => void;
  setUnreadCount: (key: WidgetKey, count: number) => void;
};

const STORAGE_KEY = 'widget_state_v1';

const defaultState: Record<WidgetKey, WidgetState> = {
  calculator: { isOpen: false, isMinimized: false, position: { x: 80, y: 120 } },
  converter: { isOpen: false, isMinimized: false, position: { x: 200, y: 200 } },
  priceChecker: { isOpen: false, isMinimized: false, position: { x: 320, y: 280 } },
  speedDial: { isOpen: false, isMinimized: false, position: { x: 440, y: 360 } },
};

const WidgetContext = createContext<WidgetManager | undefined>(undefined);

const safeParse = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<WidgetKey, WidgetState>;
  } catch (err) {
    console.warn('Failed to parse widget storage', err);
    return null;
  }
};

export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [widgets, setWidgets] = useState<Record<WidgetKey, WidgetState>>(() => {
    const stored = safeParse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return defaultState;
    return {
      calculator: { ...defaultState.calculator, ...stored.calculator },
      converter: { ...defaultState.converter, ...stored.converter },
      priceChecker: { ...defaultState.priceChecker, ...stored.priceChecker },
      speedDial: { ...defaultState.speedDial, ...stored.speedDial },
    };
  });
  const [unreadCounts, setUnreadCounts] = useState<Partial<Record<WidgetKey, number>>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const manager = useMemo<WidgetManager>(() => {
    const updateWidget = (key: WidgetKey, patch: Partial<WidgetState>) => {
      setWidgets((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    };

    return {
      widgets,
      unreadCounts,
      openWidget: (key) => updateWidget(key, { isOpen: true, isMinimized: false }),
      toggleWidget: (key) =>
        updateWidget(key, {
          isOpen: !widgets[key].isOpen,
          isMinimized: false,
        }),
      closeWidget: (key) => updateWidget(key, { isOpen: false, isMinimized: false }),
      setMinimized: (key, minimized) => updateWidget(key, { isMinimized: minimized }),
      setPosition: (key, position) => updateWidget(key, { position }),
      setUnreadCount: (key, count) =>
        setUnreadCounts((prev) =>
          prev[key] === count
            ? prev
            : {
                ...prev,
                [key]: count,
              }
        ),
    };
  }, [widgets, unreadCounts]);

  return <WidgetContext.Provider value={manager}>{children}</WidgetContext.Provider>;
};

export const useWidgetManager = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error('useWidgetManager must be used within WidgetProvider');
  }
  return context;
};
