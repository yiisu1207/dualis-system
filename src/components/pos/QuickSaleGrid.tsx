import React, { useMemo } from 'react';
import { Star, Package } from 'lucide-react';

export interface QuickSaleProduct {
  id: string;
  codigo: string;
  name: string;
  price: number;
  imageUrl?: string;
  stock?: number;
}

interface QuickSaleGridProps {
  /** All products available */
  products: QuickSaleProduct[];
  /** Recent movements to compute top sellers */
  recentSales?: Array<{ items?: Array<{ productId?: string; codigo?: string }> }>;
  /** IDs of manually pinned favorites */
  pinnedIds?: string[];
  /** Called when user taps a product */
  onSelect: (product: QuickSaleProduct) => void;
  /** Max items to show (default 8) */
  maxItems?: number;
  /** Whether to show the grid */
  visible?: boolean;
}

/**
 * H.19 — Quick Sale Grid for POS Detal.
 * Shows top-selling / pinned products as large tappable cards.
 */
export default function QuickSaleGrid({
  products,
  recentSales = [],
  pinnedIds = [],
  onSelect,
  maxItems = 8,
  visible = true,
}: QuickSaleGridProps) {
  const quickProducts = useMemo(() => {
    // Count frequency of each product in recent sales
    const freq: Record<string, number> = {};
    for (const sale of recentSales) {
      for (const item of sale.items || []) {
        const key = item.productId || item.codigo || '';
        if (key) freq[key] = (freq[key] || 0) + 1;
      }
    }

    // Score: pinned get +1000, then frequency, +1 baseline so all show when no sales
    const hasSalesOrPins = recentSales.length > 0 || pinnedIds.length > 0;
    const scored = products.map(p => ({
      product: p,
      score: (pinnedIds.includes(p.id) ? 1000 : 0)
        + (freq[p.id] || 0) + (freq[p.codigo] || 0)
        + (hasSalesOrPins ? 0 : 1),
    }));

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map(s => s.product);
  }, [products, recentSales, pinnedIds, maxItems]);

  if (!visible || quickProducts.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="flex items-center gap-2 mb-2">
        <Star size={12} className="text-amber-400" />
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
          Rápidos
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {quickProducts.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:bg-indigo-50 dark:hover:bg-indigo-500/10 active:scale-95 transition-all min-h-[64px]"
          >
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt={p.name}
                className="w-8 h-8 rounded-lg object-cover mb-1"
                loading="lazy"
              />
            ) : (
              <Package size={16} className="text-slate-300 dark:text-white/20 mb-1" />
            )}
            <span className="text-[10px] font-bold text-slate-700 dark:text-white/70 leading-tight text-center line-clamp-2">
              {p.name}
            </span>
            <span className="text-[9px] font-mono text-emerald-500 mt-0.5">
              ${p.price.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
