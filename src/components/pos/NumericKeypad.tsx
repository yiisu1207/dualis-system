import React, { useCallback } from 'react';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  /** Called when user taps a key */
  onKey: (key: string) => void;
  /** Whether to show the keypad */
  visible?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'] as const;

/**
 * H.20 — Numeric keypad for POS Detal on tablets without physical keyboard.
 * Renders a 3×4 grid of large tappable buttons.
 */
export default function NumericKeypad({ onKey, visible = true }: NumericKeypadProps) {
  const handleTap = useCallback((key: string) => {
    // Haptic feedback on supported devices
    if (navigator.vibrate) navigator.vibrate(10);
    onKey(key);
  }, [onKey]);

  if (!visible) return null;

  return (
    <div className="grid grid-cols-3 gap-1 p-2">
      {KEYS.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => handleTap(k)}
          className="flex items-center justify-center h-14 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-lg font-black text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/[0.1] active:scale-95 transition-all select-none"
        >
          {k === 'DEL' ? <Delete size={20} className="text-rose-400" /> : k}
        </button>
      ))}
    </div>
  );
}
