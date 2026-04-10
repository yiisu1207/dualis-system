import React, { useEffect, useRef, useCallback, useState } from 'react';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Width of the drawer. Default 280px */
  width?: number;
  /** Side: left or right. Default left */
  side?: 'left' | 'right';
}

export default function MobileDrawer({ open, onClose, children, width = 280, side = 'left' }: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const dragStartX = useRef(0);
  const dragging = useRef(false);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (open) setTranslateX(0);
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - dragStartX.current;
    // Left drawer: only allow drag left (negative). Right drawer: only drag right (positive)
    if (side === 'left' && dx < 0) setTranslateX(dx);
    if (side === 'right' && dx > 0) setTranslateX(dx);
  }, [side]);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (Math.abs(translateX) > 80) {
      onClose();
    }
    setTranslateX(0);
  }, [translateX, onClose]);

  if (!open) return null;

  const closedOffset = side === 'left' ? -width : width;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        style={{ transition: 'opacity 200ms ease-out' }}
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute top-0 bottom-0 bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto"
        style={{
          width,
          [side]: 0,
          transform: `translateX(${translateX}px)`,
          transition: dragging.current ? 'none' : 'transform 200ms ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
