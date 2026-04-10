import React from 'react';

interface SkeletonProps {
  className?: string;
  /** Number of skeleton lines to render. Default 1. */
  count?: number;
  /** Height of each line. Default '16px'. */
  height?: string | number;
  /** Width of each line. Default '100%'. */
  width?: string | number;
  /** Render as circle (avatar). Default false. */
  circle?: boolean;
}

export default function Skeleton({ className = '', count = 1, height = 16, width = '100%', circle }: SkeletonProps) {
  const h = typeof height === 'number' ? `${height}px` : height;
  const w = circle ? h : typeof width === 'number' ? `${width}px` : width;

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`skeleton ${className}`}
          style={{
            height: h,
            width: w,
            borderRadius: circle ? '50%' : undefined,
            marginBottom: count > 1 && i < count - 1 ? '8px' : undefined,
          }}
        />
      ))}
    </>
  );
}

/** Pre-built skeleton for a list of cards */
export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="skeleton" style={{ height: 40, width: 40, borderRadius: '50%' }} />
            <div className="flex-1">
              <div className="skeleton" style={{ height: 14, width: '60%' }} />
              <div className="skeleton mt-2" style={{ height: 10, width: '40%' }} />
            </div>
          </div>
          <Skeleton height={12} count={2} />
        </div>
      ))}
    </div>
  );
}

/** Pre-built skeleton for a table */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-slate-200 dark:border-white/10">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 12, width: `${100 / cols}%` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="skeleton" style={{ height: 14, width: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
