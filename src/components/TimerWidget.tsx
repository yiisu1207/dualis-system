import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

interface TimerWidgetProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  currentUserId?: string;
}

const STORAGE_KEY = 'widget_timer_v1';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const TimerWidget: React.FC<TimerWidgetProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
  currentUserId,
}) => {
  const [remaining, setRemaining] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastTick, setLastTick] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || loaded) return;
    if (!currentUserId) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const data = JSON.parse(raw) as {
            remaining: number;
            isRunning: boolean;
            lastTick: number | null;
          };
          if (typeof data.remaining === 'number') setRemaining(data.remaining);
          if (typeof data.isRunning === 'boolean') setIsRunning(data.isRunning);
          setLastTick(data.lastTick ?? null);
        } catch (err) {
          console.warn('Timer storage parse failed', err);
        }
      }
      setLoaded(true);
      return;
    }

    const ref = doc(db, 'users', currentUserId, 'widgets', 'timer');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.data() as {
        remaining?: number;
        isRunning?: boolean;
        lastTick?: number | null;
      };
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
      if (typeof data.isRunning === 'boolean') setIsRunning(data.isRunning);
      setLastTick(data.lastTick ?? null);
    });
    setLoaded(true);
    return () => unsubscribe();
  }, [isOpen, loaded, currentUserId]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ remaining, isRunning, lastTick })
    );
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId, 'widgets', 'timer');
    setDoc(
      ref,
      {
        remaining,
        isRunning,
        lastTick,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [remaining, isRunning, lastTick, loaded, currentUserId]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || lastTick === null) return;
    const delta = Math.floor((Date.now() - lastTick) / 1000);
    if (delta > 0) {
      setRemaining((prev) => Math.max(prev - delta, 0));
      setLastTick(Date.now());
    }
  }, [isRunning, lastTick]);

  useEffect(() => {
    if (!isRunning) return;
    setLastTick(Date.now());
  }, [isRunning]);

  const progress = useMemo(() => {
    const total = 25 * 60;
    return Math.round(((total - remaining) / total) * 100);
  }, [remaining]);

  return (
    <FloatingWidgetShell
      title="Task Timer"
      subtitle="Focus mode"
      icon="fa-regular fa-clock"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={260}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <div className="flex flex-col items-center">
        <div className="text-4xl font-black text-slate-900 dark:text-slate-100">
          {formatTime(remaining)}
        </div>
        <div className="mt-2 w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setIsRunning((prev) => !prev)}
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-black"
          >
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRunning(false);
              setRemaining(25 * 60);
            }}
            className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-xs font-black"
          >
            Reset
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 w-full">
          {[
            { label: '25', value: 25 * 60 },
            { label: '15', value: 15 * 60 },
            { label: '5', value: 5 * 60 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setIsRunning(false);
                setRemaining(preset.value);
              }}
              className="py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200 text-xs font-black"
            >
              {preset.label}m
            </button>
          ))}
        </div>
      </div>
    </FloatingWidgetShell>
  );
};

export default TimerWidget;
