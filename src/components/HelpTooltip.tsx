/**
 * HelpTooltip — inline ? badge that shows a floating explanation on hover/click.
 *
 * Usage:
 *   <HelpTooltip text="Registra un nuevo movimiento de caja." />
 *   <HelpTooltip title="Anular Venta" text="Marca la venta como anulada y restaura el stock." side="left" />
 *   <HelpTooltip text="..." asChild><button>Guardar</button></HelpTooltip>
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface HelpTooltipProps {
  /** Short explanation shown in the tooltip body (required) */
  text: string;
  /** Optional bold heading inside the tooltip */
  title?: string;
  /** Where the tooltip appears relative to the trigger (default: top) */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Extra class names applied to the outer wrapper */
  className?: string;
  /** If true, wraps a single child element as the trigger instead of rendering the ? badge */
  asChild?: boolean;
  children?: React.ReactNode;
}

// ─── Positioning helpers ───────────────────────────────────────────────────────
function getTooltipPosition(
  side: string,
  rect: DOMRect,
  tooltipEl: HTMLDivElement,
): { top: number; left: number } {
  const gap = 8;
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;

  let top = 0;
  let left = 0;

  switch (side) {
    case 'top':
      top = rect.top - th - gap + window.scrollY;
      left = rect.left + rect.width / 2 - tw / 2 + window.scrollX;
      break;
    case 'bottom':
      top = rect.bottom + gap + window.scrollY;
      left = rect.left + rect.width / 2 - tw / 2 + window.scrollX;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - th / 2 + window.scrollY;
      left = rect.left - tw - gap + window.scrollX;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - th / 2 + window.scrollY;
      left = rect.right + gap + window.scrollX;
      break;
  }

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight + window.scrollY;
  left = Math.max(8, Math.min(left, vw - tw - 8));
  top  = Math.max(8, Math.min(top, vh - th - 8));

  return { top, left };
}

// ─── Component ────────────────────────────────────────────────────────────────
const HelpTooltip: React.FC<HelpTooltipProps> = ({
  text,
  title,
  side = 'top',
  className = '',
  asChild = false,
  children,
}) => {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const hideTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), 100);
  }, []);

  // Re-calculate position whenever visible becomes true
  useEffect(() => {
    if (!visible) return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const rect = trigger.getBoundingClientRect();
    setPos(getTooltipPosition(side, rect, tooltip));
  }, [visible, side]);

  // Hide on Escape
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisible(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  const arrowClass: Record<string, string> = {
    top:    'bottom-[-6px] left-1/2 -translate-x-1/2 border-t-[6px] border-t-slate-800 dark:border-t-slate-700 border-x-transparent border-x-[6px] border-b-0',
    bottom: 'top-[-6px] left-1/2 -translate-x-1/2 border-b-[6px] border-b-slate-800 dark:border-b-slate-700 border-x-transparent border-x-[6px] border-t-0',
    left:   'right-[-6px] top-1/2 -translate-y-1/2 border-l-[6px] border-l-slate-800 dark:border-l-slate-700 border-y-transparent border-y-[6px] border-r-0',
    right:  'left-[-6px] top-1/2 -translate-y-1/2 border-r-[6px] border-r-slate-800 dark:border-r-slate-700 border-y-transparent border-y-[6px] border-l-0',
  };

  const clonedChild =
    asChild && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
          ref: triggerRef as any,
          onMouseEnter: show,
          onMouseLeave: hide,
          onFocus: show,
          onBlur: hide,
        })
      : null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {/* When asChild, render the cloned child as the trigger */}
      {asChild ? clonedChild : children}

      {/* Default ? badge trigger (when not asChild) */}
      {!asChild && (
        <span
          ref={triggerRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          onClick={() => setVisible(v => !v)}
          role="button"
          tabIndex={0}
          aria-label="Ayuda"
          className="inline-flex items-center justify-center rounded-full text-indigo-400 hover:text-indigo-300 cursor-help transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-offset-1"
        >
          <HelpCircle size={14} />
        </span>
      )}

      {/* Floating tooltip */}
      {visible && (
        <div
          ref={tooltipRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="pointer-events-auto max-w-[260px] rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-2xl shadow-black/40 px-3 py-2.5 border border-white/10"
          role="tooltip"
        >
          {title && <p className="font-semibold text-white mb-0.5">{title}</p>}
          <p className="text-slate-300 leading-relaxed">{text}</p>
          <span className={`absolute w-0 h-0 border-solid ${arrowClass[side]}`} />
        </div>
      )}
    </span>
  );
};

export default HelpTooltip;
