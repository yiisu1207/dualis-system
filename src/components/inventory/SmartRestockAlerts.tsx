import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  AlertTriangle, TrendingDown, Package, Clock,
  ArrowRight, ShoppingCart, ChevronDown,
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  stock: number;
  stockMinimo: number;
  costoUSD?: number;
  hasVariants?: boolean;
  variants?: Array<{ id: string; sku: string; values: Record<string, string>; stock: number }>;
}

interface RestockAlert {
  productId: string;
  productName: string;
  codigo: string;
  currentStock: number;
  stockMinimo: number;
  avgDailySales: number;     // average units sold per day (last 30d)
  daysOfStock: number;       // estimated days until stock runs out (Infinity if no sales)
  suggestedQty: number;      // suggested reorder qty (30 days of supply - current)
  severity: 'critical' | 'warning' | 'info';
  variantLabel?: string;
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
interface Props {
  businessId: string;
  products: Product[];
}

export default function SmartRestockAlerts({ businessId, products }: Props) {
  const [salesData, setSalesData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Load sales from last 30 days to calculate velocity
  useEffect(() => {
    if (!businessId) return;
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const cutoff = thirtyAgo.toISOString().slice(0, 10);

    (async () => {
      try {
        const q = query(
          collection(db, 'movements'),
          where('businessId', '==', businessId),
          where('movementType', '==', 'FACTURA'),
        );
        const snap = await getDocs(q);
        const counts: Record<string, number> = {};
        for (const d of snap.docs) {
          const data = d.data();
          if (data.anulada) continue;
          if (data.date < cutoff) continue;
          if (!Array.isArray(data.items)) continue;
          for (const item of data.items) {
            const key = item.id || item.nombre;
            counts[key] = (counts[key] || 0) + (item.qty || 1);
          }
        }
        setSalesData(counts);
      } catch (err) {
        console.error('[restock] error loading sales data', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId]);

  const alerts = useMemo((): RestockAlert[] => {
    const result: RestockAlert[] = [];
    const DAYS_WINDOW = 30;

    for (const p of products) {
      // If product has variants, analyze each variant
      if (p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          const key = `${p.id}__v_${v.id}`;
          const sold30d = salesData[key] || salesData[v.sku] || 0;
          const avgDaily = sold30d / DAYS_WINDOW;
          const daysOfStock = avgDaily > 0 ? v.stock / avgDaily : Infinity;
          const suggested = Math.max(0, Math.ceil(avgDaily * 30) - v.stock);
          const label = Object.values(v.values).filter(Boolean).join(' / ');

          if (v.stock <= 0 || daysOfStock <= 7 || v.stock < (p.stockMinimo || 5)) {
            result.push({
              productId: p.id,
              productName: p.nombre,
              codigo: v.sku || p.codigo || '',
              currentStock: v.stock,
              stockMinimo: p.stockMinimo || 5,
              avgDailySales: avgDaily,
              daysOfStock,
              suggestedQty: suggested || Math.max(5, p.stockMinimo || 5),
              severity: v.stock <= 0 ? 'critical' : daysOfStock <= 7 ? 'warning' : 'info',
              variantLabel: label,
            });
          }
        }
        continue;
      }

      // Regular product
      const sold30d = salesData[p.id] || salesData[p.codigo || ''] || 0;
      const avgDaily = sold30d / DAYS_WINDOW;
      const daysOfStock = avgDaily > 0 ? p.stock / avgDaily : Infinity;
      const suggested = Math.max(0, Math.ceil(avgDaily * 30) - p.stock);

      if (p.stock <= 0 || daysOfStock <= 14 || p.stock < p.stockMinimo) {
        result.push({
          productId: p.id,
          productName: p.nombre,
          codigo: p.codigo || '',
          currentStock: p.stock,
          stockMinimo: p.stockMinimo,
          avgDailySales: avgDaily,
          daysOfStock,
          suggestedQty: suggested || Math.max(5, p.stockMinimo),
          severity: p.stock <= 0 ? 'critical' : daysOfStock <= 7 ? 'warning' : 'info',
        });
      }
    }

    // Sort by severity then days of stock
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return a.daysOfStock - b.daysOfStock;
    });
  }, [products, salesData]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-amber-200 dark:border-amber-500/20 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 dark:hover:bg-amber-500/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div className="text-left">
            <p className="text-xs font-black text-slate-900 dark:text-white">Alertas de Reposición</p>
            <p className="text-[9px] text-slate-400 dark:text-white/30">
              {critical > 0 && <span className="text-rose-500 font-bold">{critical} agotado{critical !== 1 ? 's' : ''}</span>}
              {critical > 0 && warning > 0 && ' · '}
              {warning > 0 && <span className="text-amber-400 font-bold">{warning} próximo{warning !== 1 ? 's' : ''} a agotarse</span>}
              {critical === 0 && warning === 0 && <span>{alerts.length} producto{alerts.length !== 1 ? 's' : ''} bajo mínimo</span>}
            </p>
          </div>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-amber-100 dark:border-amber-500/10 max-h-80 overflow-y-auto">
          {alerts.map((a, i) => (
            <div key={`${a.productId}-${a.variantLabel || ''}-${i}`}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-white/[0.03] last:border-b-0 ${
                a.severity === 'critical' ? 'bg-rose-50/50 dark:bg-rose-500/[0.03]' :
                a.severity === 'warning' ? 'bg-amber-50/30 dark:bg-amber-500/[0.02]' : ''
              }`}
            >
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                a.severity === 'critical' ? 'bg-rose-500/15 text-rose-500' :
                a.severity === 'warning' ? 'bg-amber-500/15 text-amber-500' :
                'bg-slate-100 dark:bg-white/[0.06] text-slate-400'
              }`}>
                {a.severity === 'critical' ? <Package size={12} /> : <TrendingDown size={12} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-black text-slate-800 dark:text-white truncate">
                    {a.productName}
                    {a.variantLabel && <span className="text-sky-500 ml-1">({a.variantLabel})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-slate-400 dark:text-white/25">
                  <span>Stock: <span className={`font-bold ${a.currentStock <= 0 ? 'text-rose-500' : 'text-amber-400'}`}>{a.currentStock}</span></span>
                  {a.avgDailySales > 0 && (
                    <>
                      <span>· Venta: {a.avgDailySales.toFixed(1)}/día</span>
                      <span>· <Clock size={8} className="inline" /> {a.daysOfStock === Infinity ? '∞' : `${Math.round(a.daysOfStock)}d`} restantes</span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/20">Pedir</p>
                <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                  <ShoppingCart size={10} /> {a.suggestedQty}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
