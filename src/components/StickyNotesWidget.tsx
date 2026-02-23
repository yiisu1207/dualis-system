import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

interface StickyNotesWidgetProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  currentUserId?: string;
}

const STORAGE_KEY = 'widget_notes_v1';

const StickyNotesWidget: React.FC<StickyNotesWidgetProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
  currentUserId,
}) => {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || loaded) return;
    if (!currentUserId) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setNote(stored);
      setLoaded(true);
      return;
    }

    const ref = doc(db, 'users', currentUserId, 'widgets', 'notes');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.data() as { note?: string };
      if (typeof data.note === 'string') setNote(data.note);
    });
    setLoaded(true);
    return () => unsubscribe();
  }, [isOpen, loaded, currentUserId]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, note);
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId, 'widgets', 'notes');
    setDoc(
      ref,
      {
        note,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [note, loaded, currentUserId]);

  return (
    <FloatingWidgetShell
      title="Sticky Notes"
      subtitle="Quick reminders"
      icon="fa-regular fa-note-sticky"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={300}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <textarea
        className="w-full min-h-[220px] rounded-2xl border border-yellow-200 bg-yellow-100/80 p-3 text-sm font-semibold text-slate-700 focus:outline-none"
        placeholder="Write a quick note..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </FloatingWidgetShell>
  );
};

export default StickyNotesWidget;
