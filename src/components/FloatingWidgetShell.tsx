import React, { useEffect, useRef } from 'react';

type WidgetPosition = {
  x: number;
  y: number;
};

interface FloatingWidgetShellProps {
  title: string;
  subtitle?: string;
  icon: string;
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  width?: number;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  children: React.ReactNode;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const FloatingWidgetShell: React.FC<FloatingWidgetShellProps> = ({
  title,
  subtitle,
  icon,
  isOpen,
  isMinimized,
  position,
  width = 320,
  onClose,
  onMinimize,
  onPositionChange,
  children,
}) => {
  const dragState = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current.dragging) return;
      const maxX = window.innerWidth - width - 16;
      const maxY = window.innerHeight - 120;
      onPositionChange({
        x: clamp(event.clientX - dragState.current.offsetX, 16, maxX),
        y: clamp(event.clientY - dragState.current.offsetY, 16, maxY),
      });
    };

    const handlePointerUp = () => {
      dragState.current.dragging = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isOpen, onPositionChange, width]);

  if (!isOpen) return null;

  const handlePointerDown = (event: React.PointerEvent) => {
    dragState.current.dragging = true;
    dragState.current.offsetX = event.clientX - position.x;
    dragState.current.offsetY = event.clientY - position.y;
  };

  return (
    <div className="fixed z-[120]" style={{ left: position.x, top: position.y }}>
      {isMinimized ? (
        <div
          className="flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 shadow-xl backdrop-blur-xl"
          onPointerDown={handlePointerDown}
        >
          <button
            type="button"
            onClick={onMinimize}
            className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center"
            title="Restore"
          >
            <i className={icon}></i>
          </button>
          <span className="text-xs font-bold text-slate-700">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
            title="Close"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 cursor-move"
            onPointerDown={handlePointerDown}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">
                <i className={icon}></i>
              </div>
              <div>
                <p className="text-[11px] uppercase font-black text-slate-600">{title}</p>
                {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onMinimize}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                title="Minimize"
              >
                <i className="fa-solid fa-window-minimize"></i>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                title="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div className="p-4" style={{ width }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingWidgetShell;
