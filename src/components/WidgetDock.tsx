import React from 'react';
import { useWidgetManager } from '../context/WidgetContext';
import { useTranslation } from 'react-i18next';

const WidgetDock: React.FC = () => {
  const { widgets, openWidget, unreadCounts } = useWidgetManager();
  const { t } = useTranslation();

  const items = [
    {
      key: 'calculator',
      label: t('widgets.calc'),
      tooltip: t('tooltips.calc'),
      icon: 'fa-solid fa-calculator',
    },
    {
      key: 'converter',
      label: t('widgets.fx'),
      tooltip: t('tooltips.fx'),
      icon: 'fa-solid fa-arrows-rotate',
    },
    {
      key: 'priceChecker',
      label: t('widgets.price'),
      tooltip: t('tooltips.price'),
      icon: 'fa-solid fa-tag',
    },
    {
      key: 'speedDial',
      label: t('widgets.quick'),
      tooltip: t('tooltips.quick'),
      icon: 'fa-solid fa-bolt',
    },
  ] as const;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[110]">
      <div className="flex items-center gap-3 rounded-2xl border border-white/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/90 px-4 py-2 shadow-2xl backdrop-blur-xl">
        {items.map((item) => {
          const state = widgets[item.key];
          const unread = unreadCounts[item.key] || 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => openWidget(item.key)}
              className="group relative flex flex-col items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-full bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.tooltip}
              </span>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <i className={item.icon}></i>
              </div>
              <span className="text-[10px] font-bold uppercase">{item.label}</span>
              {state.isOpen && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              )}
              {!state.isOpen && unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WidgetDock;
