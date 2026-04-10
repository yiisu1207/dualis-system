import React, { useEffect, useRef, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Max height as vh on mobile. Default 90. */
  maxHeightVh?: number;
}

export default function BottomSheet({ open, onClose, title, children, maxHeightVh = 90 }: BottomSheetProps) {
  const isMobile = useIsMobile();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [translateY, setTranslateY] = useState(0);
  const dragStartY = useRef(0);
  const dragging = useRef(false);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  // Reset translate when opening
  useEffect(() => {
    if (open) setTranslateY(0);
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setTranslateY(dy); // only allow drag down
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (translateY > 80) {
      onClose();
    }
    setTranslateY(0);
  }, [translateY, onClose]);

  if (!open) return null;

  // Desktop: centered modal
  if (!isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-slate-200 dark:border-white/10"
          onClick={e => e.stopPropagation()}
        >
          {title && (
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 rounded-t-2xl">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
          )}
          <div className="p-5">{children}</div>
        </div>
      </div>
    );
  }

  // Mobile: bottom sheet with drag handle
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl border-t border-slate-200 dark:border-white/10 overflow-hidden"
        style={{
          maxHeight: `${maxHeightVh}vh`,
          transform: `translateY(${translateY}px)`,
          transition: dragging.current ? 'none' : 'transform 200ms ease-out',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20" />
        </div>

        {title && (
          <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-200 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
        )}

        <div className="overflow-y-auto p-4" style={{ maxHeight: `calc(${maxHeightVh}vh - 80px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
