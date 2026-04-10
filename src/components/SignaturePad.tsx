import React, { useCallback, useImperativeHandle, useRef } from 'react';

/**
 * SignaturePad — componente reusable de firma digital.
 * Fase B.2 — extraído del patrón en PortalInvoices para uso en DespachoPanel,
 * CashCountModal, ReturnSaleModal, etc.
 *
 * Uso:
 *   const ref = useRef<SignaturePadHandle>(null);
 *   <SignaturePad ref={ref} />
 *   ref.current?.toDataURL() // retorna base64 PNG o null si está vacío
 *   ref.current?.clear()
 *   ref.current?.isEmpty()
 */
export type SignaturePadHandle = {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
};

type Props = {
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
  placeholder?: string;
};

const SignaturePad = React.forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { width = 600, height = 220, strokeColor = '#0f172a', strokeWidth = 2.5, className = '', placeholder = 'Firma aquí' },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d') || null;

  const pointFromEvent = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    drawingRef.current = true;
    hasDrawnRef.current = true;
    const ctx = getCtx();
    const p = pointFromEvent(e);
    if (!ctx || !p) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, []);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingRef.current) return;
    const ctx = getCtx();
    const p = pointFromEvent(e);
    if (!ctx || !p) return;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }, [strokeColor, strokeWidth]);

  const stopDraw = useCallback(() => { drawingRef.current = false; }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    toDataURL: () => {
      if (!canvasRef.current || !hasDrawnRef.current) return null;
      return canvasRef.current.toDataURL('image/png');
    },
    clear,
    isEmpty: () => !hasDrawnRef.current,
  }), [clear]);

  return (
    <div className={`relative rounded-xl border-2 border-dashed border-slate-300 dark:border-white/20 bg-white dark:bg-white/[0.02] overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full touch-none cursor-crosshair"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {placeholder && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-black uppercase tracking-widest text-slate-300 dark:text-white/20 select-none">
          {hasDrawnRef.current ? '' : placeholder}
        </span>
      )}
    </div>
  );
});

export default SignaturePad;
