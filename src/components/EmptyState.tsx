import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '✨',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="text-center py-8 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-wide"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
