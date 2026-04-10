import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  TrendingUp, DollarSign, Package, BarChart3,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Award,
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  costoUSD: number;
  precioDetal: number;
  precioMayor: number;
  categoria: string;
}

interface ProductProfit {
  productId: string;
  productName: string;
  codigo: string;
  categoria: string;
  costoUSD: number;
  avgSalePrice: number;
  totalQtySold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPct: number;
  abcClass: 'A' | 'B' | 'C';
  cumProfitPct: number;
}

type SortField = 'totalProfit' | 'totalRevenue' | 'marginPct' | 'totalQtySold';
type TimePeriod = '7d' | '30d' | '90d' | 'all';

const PERIOD_LABELS: Record<TimePeriod, string> = { '7d': '7 días', '30d': '30 días', '90d': '90 días', 'all': 'Todo' };

function currency(n: number) { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

// ─── COMPONENT ──────────────────────────────────────────────────────────────
interface Props {
  businessId: string;
  products: Product[];
}

export default function ProfitabilityReport({ businessId, products }: Props) {
  const [salesMap, setSalesMap] = useState<Record<string, { qty: number; revenue: number }>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [sortBy, setSortBy] = useState<SortField>('totalProfit');

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);

    const cutoff = period === 'all' ? '2000-01-01' : (() => {
      const d = new Date();
      d.setDate(d.getDate() - (period === '7d' ? 7 : period === '30d' ? 30 : 90));
      return d.toISOString().slice(0, 10);
    })();

    (async () => {
      try {
        const q = query(
          collection(db, 'movements'),
          where('businessId', '==', businessId),
          where('movementType', '==', 'FACTURA'),
        );
        const snap = await getDocs(q);
        const map: Record<string, { qty: number; revenue: number }> = {};
        for (const d of snap.docs) {
          const data = d.data();
          if (data.anulada) continue;
          if (data.date < cutoff) continue;
          if (!Array.isArray(data.items)) continue;
          for (const item of data.items) {
            const key = item.id || item.nombre;
            if (!map[key]) map[key] = { qty: 0, revenue: 0 };
            const qty = item.qty || 1;
            const price = item.price || item.subtotal / qty || 0;
            map[key].qty += qty;
            map[key].revenue += qty * price;
          }
        }
        setSalesMap(map);
      } catch (err) {
        console.error('[profitability] error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId, period]);

  const analysis = useMemo((): ProductProfit[] => {
    const results: ProductProfit[] = [];
    for (const p of products) {
      const sales = salesMap[p.id] || salesMap[p.codigo || ''] || { qty: 0, revenue: 0 };
      if (sales.qty === 0) continue;

      const avgSalePrice = sales.revenue / sales.qty;
      const totalCost = p.costoUSD * sales.qty;
      const totalProfit = sales.revenue - totalCost;
      const marginPct = sales.revenue > 0 ? (totalProfit / sales.revenue) * 100 : 0;

      results.push({
        productId: p.id,
        productName: p.nombre,
        codigo: p.codigo || '',
        categoria: p.categoria,
        costoUSD: p.costoUSD,
        avgSalePrice,
        totalQtySold: sales.qty,
        totalRevenue: sales.revenue,
        totalCost,
        totalProfit,
        marginPct,
        abcClass: 'C', // will be computed below
        cumProfitPct: 0,
      });
    }

    // Sort by profit descending for ABC classification
    results.sort((a, b) => b.totalProfit - a.totalProfit);

    // Calculate cumulative profit percentages
    const totalProfit = results.reduce((s, r) => s + Math.max(0, r.totalProfit), 0);
    let cumulative = 0;
    for (const r of results) {
      cumulative += Math.max(0, r.totalProfit);
      r.cumProfitPct = totalProfit > 0 ? (cumulative / totalProfit) * 100 : 0;
      // ABC classification: A = top 80% of profit, B = next 15%, C = last 5%
      if (r.cumProfitPct <= 80) r.abcClass = 'A';
      else if (r.cumProfitPct <= 95) r.abcClass = 'B';
      else r.abcClass = 'C';
    }

    // Re-sort by selected field
    results.sort((a, b) => {
      switch (sortBy) {
        case 'totalRevenue': return b.totalRevenue - a.totalRevenue;
        case 'marginPct': return b.marginPct - a.marginPct;
        case 'totalQtySold': return b.totalQtySold - a.totalQtySold;
        default: return b.totalProfit - a.totalProfit;
      }
    });

    return results;
  }, [products, salesMap, sortBy]);

  const totals = useMemo(() => {
    const totalRevenue = analysis.reduce((s, a) => s + a.totalRevenue, 0);
    const totalCost = analysis.reduce((s, a) => s + a.totalCost, 0);
    const totalProfit = analysis.reduce((s, a) => s + a.totalProfit, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const aCount = analysis.filter(a => a.abcClass === 'A').length;
    const bCount = analysis.filter(a => a.abcClass === 'B').length;
    const cCount = analysis.filter(a => a.abcClass === 'C').length;
    const negativeMarginCount = analysis.filter(a => a.marginPct < 0).length;
    return { totalRevenue, totalCost, totalProfit, avgMargin, aCount, bCount, cCount, negativeMarginCount };
  }, [analysis]);

  const ABC_COLORS = {
    A: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
    B: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    C: 'bg-slate-200/50 dark:bg-white/[0.06] text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/[0.08]',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Award size={18} className="text-indigo-500" /> Rentabilidad por Producto
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">
            {analysis.length} productos con ventas · Análisis ABC (Pareto)
          </p>
        </div>
        <div className="flex gap-1.5">
          {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                period === p
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30'
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 dark:text-white/30 text-sm">Cargando datos de ventas...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
              <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Ingresos</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">{currency(totals.totalRevenue)}</p>
            </div>
            <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
              <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Costo</p>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400">{currency(totals.totalCost)}</p>
            </div>
            <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
              <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Ganancia</p>
              <p className={`text-lg font-black ${totals.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {currency(totals.totalProfit)}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
              <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Margen Promedio</p>
              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{totals.avgMargin.toFixed(1)}%</p>
              {totals.negativeMarginCount > 0 && (
                <p className="text-[9px] text-rose-500 font-bold mt-0.5 flex items-center gap-1">
                  <AlertTriangle size={10} /> {totals.negativeMarginCount} con margen negativo
                </p>
              )}
            </div>
          </div>

          {/* ABC Summary */}
          <div className="flex gap-2 text-[10px]">
            <span className={`px-2.5 py-1 rounded-lg font-black uppercase border ${ABC_COLORS.A}`}>
              A: {totals.aCount} productos (80% ganancia)
            </span>
            <span className={`px-2.5 py-1 rounded-lg font-black uppercase border ${ABC_COLORS.B}`}>
              B: {totals.bCount} productos (15% ganancia)
            </span>
            <span className={`px-2.5 py-1 rounded-lg font-black uppercase border ${ABC_COLORS.C}`}>
              C: {totals.cCount} productos (5% ganancia)
            </span>
          </div>

          {/* Sort controls */}
          <div className="flex gap-1.5 text-[9px]">
            {([
              ['totalProfit', 'Ganancia'],
              ['totalRevenue', 'Ingresos'],
              ['marginPct', 'Margen %'],
              ['totalQtySold', 'Cantidad'],
            ] as [SortField, string][]).map(([field, label]) => (
              <button key={field} onClick={() => setSortBy(field)}
                className={`px-2.5 py-1.5 rounded-lg font-bold border transition-all ${
                  sortBy === field
                    ? 'bg-slate-900 dark:bg-white/[0.12] text-white border-slate-900 dark:border-white/20'
                    : 'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Product table */}
          {analysis.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-white/30">
              <Package size={32} className="mx-auto mb-2 text-slate-200 dark:text-white/10" />
              <p className="text-sm font-bold">Sin ventas en el período seleccionado</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                      <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Producto</th>
                      <th className="text-right px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Vendidos</th>
                      <th className="text-right px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Ingresos</th>
                      <th className="text-right px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Costo</th>
                      <th className="text-right px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Ganancia</th>
                      <th className="text-right px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Margen</th>
                      <th className="text-center px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">ABC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.slice(0, 50).map((a, i) => (
                      <tr key={a.productId} className="border-b border-slate-50 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate max-w-[200px]">{a.productName}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/20 font-mono">{a.codigo}</p>
                        </td>
                        <td className="text-right px-3 py-2.5 text-[11px] font-black text-slate-600 dark:text-white/50">{a.totalQtySold}</td>
                        <td className="text-right px-3 py-2.5 text-[11px] font-black text-slate-900 dark:text-white">{currency(a.totalRevenue)}</td>
                        <td className="text-right px-3 py-2.5 text-[11px] font-bold text-slate-400 dark:text-white/30">{currency(a.totalCost)}</td>
                        <td className={`text-right px-3 py-2.5 text-[11px] font-black ${a.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                          {currency(a.totalProfit)}
                        </td>
                        <td className={`text-right px-3 py-2.5 text-[11px] font-black ${
                          a.marginPct >= 30 ? 'text-emerald-600 dark:text-emerald-400' :
                          a.marginPct >= 15 ? 'text-amber-500' : 'text-rose-500'
                        }`}>
                          {a.marginPct.toFixed(1)}%
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black border ${ABC_COLORS[a.abcClass]}`}>
                            {a.abcClass}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.length > 50 && (
                <div className="px-4 py-2 text-center text-[10px] text-slate-400 dark:text-white/20 border-t border-slate-50 dark:border-white/[0.03]">
                  Mostrando top 50 de {analysis.length} productos
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
