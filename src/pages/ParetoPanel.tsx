import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Cell } from 'recharts';
import { Download, Calendar, TrendingUp, Package, Users, BarChart3 } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface MovementItem {
  id: string;
  nombre: string;
  qty: number;
  price: number;
  subtotal: number;
}

interface Movement {
  id: string;
  movementType: string;
  date: string;
  anulada?: boolean;
  entityId?: string;
  entityName?: string;
  amountInUSD?: number;
  items?: MovementItem[];
}

interface Props {
  businessId: string;
}

type ViewMode = 'products' | 'clients';
type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: '3 meses' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
];

function getStartDate(p: Period): string | null {
  const now = new Date();
  if (p === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; }
  if (p === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (p === 'quarter') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]; }
  if (p === 'year') return `${now.getFullYear()}-01-01`;
  return null;
}

function fmt(n: number) { return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── COMPONENT ──────────────────────────────────────────────────────────────
export default function ParetoPanel({ businessId }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [view, setView] = useState<ViewMode>('products');

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'movements'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, snap => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [businessId]);

  const startDate = useMemo(() => getStartDate(period), [period]);

  const filtered = useMemo(() =>
    movements.filter(m => {
      if (m.anulada) return false;
      if (m.movementType !== 'FACTURA') return false;
      if (startDate && (m.date || '') < startDate) return false;
      return true;
    }), [movements, startDate]);

  // Aggregate by product or client
  const { rows, totalRevenue, count80, count20 } = useMemo(() => {
    const map = new Map<string, { key: string; label: string; revenue: number }>();

    for (const m of filtered) {
      if (view === 'products') {
        for (const it of m.items || []) {
          const key = it.id || it.nombre;
          const prev = map.get(key) || { key, label: it.nombre || key, revenue: 0 };
          prev.revenue += (it.qty || 0) * (it.price || 0);
          map.set(key, prev);
        }
      } else {
        const key = m.entityId || m.entityName || 'Sin cliente';
        const label = m.entityName || key;
        const rev = m.amountInUSD || (m.items || []).reduce((s, i) => s + (i.qty || 0) * (i.price || 0), 0);
        const prev = map.get(key) || { key, label, revenue: 0 };
        prev.revenue += rev;
        map.set(key, prev);
      }
    }

    const sorted = [...map.values()].sort((a, b) => b.revenue - a.revenue);
    const total = sorted.reduce((s, r) => s + r.revenue, 0);
    let cum = 0;
    let c80 = 0;
    const enriched = sorted.map((r, i) => {
      cum += r.revenue;
      const cumPct = total > 0 ? (cum / total) * 100 : 0;
      if (cumPct <= 80 || (c80 === 0 && cumPct > 80)) c80 = i + 1;
      return { ...r, cumPct, rank: i + 1 };
    });

    return { rows: enriched, totalRevenue: total, count80: c80, count20: sorted.length - c80 };
  }, [filtered, view]);

  const chartData = useMemo(() => rows.slice(0, 30).map(r => ({
    name: r.label.length > 14 ? r.label.slice(0, 12) + '…' : r.label,
    revenue: +r.revenue.toFixed(2),
    cumPct: +r.cumPct.toFixed(1),
    is80: r.rank <= count80,
  })), [rows, count80]);

  const exportCSV = useCallback(() => {
    const header = view === 'products'
      ? 'Rank,Producto,Ingreso USD,% Acumulado'
      : 'Rank,Cliente,Ingreso USD,% Acumulado';
    const lines = rows.map(r => `${r.rank},"${r.label}",${r.revenue.toFixed(2)},${r.cumPct.toFixed(1)}%`);
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `pareto_${view}_${period}.csv`; a.click();
  }, [rows, view, period]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-white/40">Cargando datos...</div>
  );

  const labelEntity = view === 'products' ? 'productos' : 'clientes';

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold text-white">Pareto 80/20</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/[0.07] overflow-hidden text-xs">
            {([['products', 'Productos', Package], ['clients', 'Clientes', Users]] as const).map(([v, l, Icon]) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1 px-3 py-1.5 transition ${view === v ? 'bg-amber-500/20 text-amber-300' : 'text-white/50 hover:text-white/70'}`}>
                <Icon className="w-3.5 h-3.5" />{l}
              </button>
            ))}
          </div>
          {/* Period */}
          <div className="flex rounded-lg border border-white/[0.07] overflow-hidden text-xs">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1.5 transition ${period === p.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.07] text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Ingreso total', value: `$${fmt(totalRevenue)}`, icon: TrendingUp, color: 'text-emerald-400' },
          { label: `${labelEntity} que generan 80%`, value: `${count80}`, icon: Package, color: 'text-amber-400' },
          { label: `${labelEntity} restantes (20%)`, value: `${count20}`, icon: Package, color: 'text-white/40' },
        ].map(k => (
          <div key={k.label} className="bg-slate-900 border border-white/[0.07] rounded-xl p-4 flex items-center gap-3">
            <k.icon className={`w-5 h-5 ${k.color}`} />
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-wide">{k.label}</p>
              <p className="text-lg font-bold text-white">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Insight */}
      {rows.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-200">
          Los primeros <span className="font-bold text-amber-300">{count80}</span> {labelEntity} generan el 80% de tus ventas
          ({((count80 / rows.length) * 100).toFixed(0)}% del catálogo).
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-4">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
              <XAxis dataKey="name" tick={{ fill: '#ffffff60', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis yAxisId="rev" tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fill: '#ffffff40', fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                formatter={(v: number, name: string) => [name === 'cumPct' ? `${v}%` : `$${fmt(v)}`, name === 'cumPct' ? '% Acumulado' : 'Ingreso']} />
              <ReferenceLine yAxisId="pct" y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '80%', fill: '#f59e0b', fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.is80 ? '#f59e0b' : '#334155'} />
                ))}
              </Bar>
              <Line yAxisId="pct" dataKey="cumPct" type="monotone" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800/90 backdrop-blur">
              <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">{view === 'products' ? 'Producto' : 'Cliente'}</th>
                <th className="text-right px-4 py-2.5">Ingreso USD</th>
                <th className="text-right px-4 py-2.5">% Acum.</th>
                <th className="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className={`border-t border-white/[0.04] transition hover:bg-white/[0.02] ${r.rank === count80 ? 'border-b-2 border-b-amber-500/40' : ''}`}>
                  <td className="px-4 py-2 text-white/30 text-xs">{r.rank}</td>
                  <td className="px-4 py-2 text-white/80 truncate max-w-[200px]">{r.label}</td>
                  <td className="px-4 py-2 text-right text-white/70 font-mono text-xs">${fmt(r.revenue)}</td>
                  <td className="px-4 py-2 text-right text-white/50 text-xs">{r.cumPct.toFixed(1)}%</td>
                  <td className="px-4 py-2">
                    <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${r.cumPct <= 80 ? 'bg-amber-500' : 'bg-slate-600'}`}
                        style={{ width: `${Math.min(r.cumPct, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-white/30">Sin datos para este período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
