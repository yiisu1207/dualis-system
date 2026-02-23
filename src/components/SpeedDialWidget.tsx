import React from 'react';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

interface SpeedDialWidgetProps {
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  onQuickExpense: () => void;
  onQuickSale: () => void;
  onNewCustomer: () => void;
  onSync: () => void;
}

const SpeedDialWidget: React.FC<SpeedDialWidgetProps> = ({
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
  onQuickExpense,
  onQuickSale,
  onNewCustomer,
  onSync,
}) => {
  const actions = [
    { label: 'Expense', icon: 'fa-solid fa-receipt', color: 'bg-rose-500', onClick: onQuickExpense },
    { label: 'Sale', icon: 'fa-solid fa-bolt', color: 'bg-emerald-500', onClick: onQuickSale },
    { label: 'Customer', icon: 'fa-solid fa-user-plus', color: 'bg-indigo-500', onClick: onNewCustomer },
    { label: 'Sync', icon: 'fa-solid fa-rotate', color: 'bg-slate-900', onClick: onSync },
  ];

  return (
    <FloatingWidgetShell
      title="Speed Dial"
      subtitle="Quick actions"
      icon="fa-solid fa-bolt"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={260}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={`h-20 rounded-2xl ${action.color} text-white flex flex-col items-center justify-center gap-2 shadow-md hover:opacity-90 transition-opacity`}
            title={action.label}
          >
            <i className={`${action.icon} text-xl`}></i>
            <span className="text-[11px] font-black uppercase">{action.label}</span>
          </button>
        ))}
      </div>
    </FloatingWidgetShell>
  );
};

export default SpeedDialWidget;
