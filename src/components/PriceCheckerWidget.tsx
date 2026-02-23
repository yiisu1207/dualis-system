import React, { useMemo, useState } from 'react';
import { ExchangeRates, InventoryItem } from '../../types';
import { formatCurrency } from '../utils/formatters';
import FloatingWidgetShell from './FloatingWidgetShell';

type WidgetPosition = {
  x: number;
  y: number;
};

interface PriceCheckerWidgetProps {
  inventory: InventoryItem[];
  rates: ExchangeRates;
  isOpen: boolean;
  isMinimized: boolean;
  position: WidgetPosition;
  onClose: () => void;
  onMinimize: () => void;
  onPositionChange: (position: WidgetPosition) => void;
  onAddToInvoice?: (item: InventoryItem) => void;
}

const PriceCheckerWidget: React.FC<PriceCheckerWidgetProps> = ({
  inventory,
  rates,
  isOpen,
  isMinimized,
  position,
  onClose,
  onMinimize,
  onPositionChange,
  onAddToInvoice,
}) => {
  const [query, setQuery] = useState('');
  const [rateSource, setRateSource] = useState<'BCV' | 'GRUPO'>('BCV');

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 3) return [];
    return inventory
      .filter((item) =>
        `${item.name} ${item.id}`.toLowerCase().includes(trimmed)
      )
      .slice(0, 5);
  }, [query, inventory]);

  const rate = rateSource === 'BCV' ? rates.bcv : rates.grupo;

  return (
    <FloatingWidgetShell
      title="Price Checker"
      subtitle="Instant lookup"
      icon="fa-solid fa-tag"
      isOpen={isOpen}
      isMinimized={isMinimized}
      position={position}
      width={340}
      onClose={onClose}
      onMinimize={onMinimize}
      onPositionChange={onPositionChange}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-xs"></i>
          <input
            type="text"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
            placeholder="Search product..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRateSource('BCV')}
            className={`px-2 py-1 rounded-lg text-[10px] font-black ${
              rateSource === 'BCV'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            BCV
          </button>
          <button
            type="button"
            onClick={() => setRateSource('GRUPO')}
            className={`px-2 py-1 rounded-lg text-[10px] font-black ${
              rateSource === 'GRUPO'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            Grupo
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {query.trim().length < 3 && (
          <div className="text-[11px] text-slate-400">Type at least 3 characters.</div>
        )}
        {query.trim().length >= 3 && matches.length === 0 && (
          <div className="text-[11px] text-slate-400">No matches found.</div>
        )}
        {matches.map((item) => {
          const priceBs = item.salePrice * rate;
          const lowStock = item.stock <= item.minStock;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-black text-slate-600">
                {item.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-black text-slate-800">{item.name}</div>
                <div className="text-[11px] text-slate-500">{item.category}</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="text-xs font-black text-indigo-600">
                    {formatCurrency(item.salePrice)}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {formatCurrency(priceBs, 'Bs')}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-[11px] font-black ${
                    lowStock ? 'text-rose-500' : 'text-emerald-600'
                  }`}
                >
                  {item.stock} in
                </div>
                <button
                  type="button"
                  onClick={() => onAddToInvoice && onAddToInvoice(item)}
                  className="mt-2 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-black"
                >
                  Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </FloatingWidgetShell>
  );
};

export default PriceCheckerWidget;
