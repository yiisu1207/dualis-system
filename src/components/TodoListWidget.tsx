import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

interface TodoListWidgetProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  currentUserId?: string;
}

const STORAGE_KEY = 'widget_todo_v1';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const playCheckSound = () => {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.onended = () => context.close();
  } catch (err) {
    console.warn('Audio not available', err);
  }
};

const TodoListWidget: React.FC<TodoListWidgetProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
  currentUserId,
}) => {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || loaded) return;
    if (!currentUserId) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const data = JSON.parse(raw) as TodoItem[];
          if (Array.isArray(data)) setItems(data);
        } catch (err) {
          console.warn('Todo storage parse failed', err);
        }
      }
      setLoaded(true);
      return;
    }

    const ref = doc(db, 'users', currentUserId, 'widgets', 'todo');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.data() as { items?: TodoItem[] };
      if (Array.isArray(data.items)) setItems(data.items);
    });
    setLoaded(true);
    return () => unsubscribe();
  }, [isOpen, loaded, currentUserId]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId, 'widgets', 'todo');
    setDoc(
      ref,
      {
        items,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [items, loaded, currentUserId]);

  const addItem = () => {
    const text = input.trim();
    if (!text) return;
    setItems((prev) => [{ id: createId(), text, done: false }, ...prev]);
    setInput('');
  };

  const toggleItem = (id: string) => {
    setItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      );
      const sorted = [...updated].sort((a, b) => Number(a.done) - Number(b.done));
      return sorted;
    });
    playCheckSound();
  };

  const clearDone = () => {
    setItems((prev) => prev.filter((item) => !item.done));
  };

  return (
    <FloatingWidgetShell
      title="Daily Tasks"
      subtitle="Focus list"
      icon="fa-regular fa-circle-check"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={300}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          placeholder="New task..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addItem();
          }}
        />
        <button
          type="button"
          onClick={addItem}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
        >
          Add
        </button>
      </div>

      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="text-[11px] text-slate-400">No tasks yet.</div>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggleItem(item.id)}
            className="w-full flex items-center gap-2 text-left"
          >
            <span
              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                item.done
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-slate-300 text-transparent'
              }`}
            >
              <i className="fa-solid fa-check text-[10px]"></i>
            </span>
            <span
              className={`text-sm font-semibold transition-all ${
                item.done ? 'line-through text-slate-400' : 'text-slate-700'
              }`}
            >
              {item.text}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{items.length} total</span>
        <button
          type="button"
          onClick={clearDone}
          className="text-[11px] font-black text-rose-500 hover:text-rose-600"
        >
          Clear done
        </button>
      </div>
    </FloatingWidgetShell>
  );
};

export default TodoListWidget;
