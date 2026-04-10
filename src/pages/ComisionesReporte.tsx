import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Award, Filter, Calendar, Users, TrendingUp, Download } from 'lucide-react';

interface CommissionRecord {
  id: string;
  type: 'cita' | 'venta' | 'despacho' | string;
  staffId?: string;
  staffName?: string;
  appointmentId?: string;
  movementId?: string;
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
  amount?: number;
  customerName?: string;
  date?: string;
  createdAt?: string;
}

interface ComisionesReporteProps {
  businessId: string;
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
];

function getStartDate(period: Period): string | null {
  const now = new Date();
  if (period === 'today') return now.toISOString().split('T')[0];
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }
  if (period === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (period === 'year') return `${now.getFullYear()}-01-01`;
  return null;
}

export default function ComisionesReporte({ businessId }: ComisionesReporteProps) {
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [staffFilter, setStaffFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CommissionRecord['type']>('ALL');

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/commissions`), snap => {
      const rows: CommissionRecord[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setRecords(rows);
      setLoading(false);
    }, err => {
      console.error('[comisiones] error', err);
      setLoading(false);
    });
    return () => unsub();
  }, [businessId]);

  const startDate = useMemo(() => getStartDate(period), [period]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (startDate) {
        const d = r.date || r.createdAt?.slice(0, 10) || '';
        if (d < startDate) return false;
      }
      if (staffFilter !== 'ALL' && r.staffId !== staffFilter) return false;
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      return true;
    });
  }, [records, startDate, staffFilter, typeFilter]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.amount ?? r.servicePrice ?? 0), 0);
    const byStaff: Record<string, { name: string; total: number; count: number }> = {};
    filtered.forEach(r => {
      const key = r.staffId || r.staffName || 'sin_asignar';
      if (!byStaff[key]) byStaff[key] = { name: r.staffName || 'Sin asignar', total: 0, count: 0 };
      byStaff[key].total += Number(r.amount ?? r.servicePrice ?? 0);
      byStaff[key].count += 1;
    });
    return { total, byStaff, count: filtered.length };
  }, [filtered]);

  const staffList = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach(r => {
      if (r.staffId) map.set(r.staffId, r.staffName || r.staffId);
    });
    return Array.from(map.entries());
  }, [records]);

  const typeList = useMemo(() => Array.from(new Set(records.map(r => r.type).filter(Boolean))), [records]);

  const exportCsv = () => {
    const headers = ['Fecha', 'Tipo', 'Staff', 'Cliente', 'Concepto', 'Monto'];
    const rows = filtered.map(r => [
      r.date || r.createdAt?.slice(0, 10) || '',
      r.type,
      r.staffName || '',
      r.customerName || '',
      r.serviceName || '',
      (r.amount ?? r.servicePrice ?? 0).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comisiones_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Award className="text-amber-500" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Reporte de Comisiones</h1>
            <p className="text-[11px] text-slate-500 dark:text-white/40">Ganancias acumuladas por personal</p>
          </div>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 dark:bg-white/10 text-white hover:bg-slate-800 dark:hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04]">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                period === p.id ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-white/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {staffList.length > 0 && (
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] border-none text-xs font-bold text-slate-700 dark:text-white/70"
          >
            <option value="ALL">Todo el personal</option>
            {staffList.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        {typeList.length > 1 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] border-none text-xs font-bold text-slate-700 dark:text-white/70"
          >
            <option value="ALL">Todos los tipos</option>
            {typeList.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Total acumulado</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">${totals.total.toFixed(2)}</p>
          <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">{totals.count} transacciones</p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-indigo-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Personal activo</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{Object.keys(totals.byStaff).length}</p>
          <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">con comisiones en el período</p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-violet-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Promedio por staff</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            ${(Object.keys(totals.byStaff).length > 0 ? totals.total / Object.keys(totals.byStaff).length : 0).toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">en el período</p>
        </div>
      </div>

      {/* By-staff breakdown */}
      {Object.keys(totals.byStaff).length > 0 && (
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-white/[0.07]">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <Filter size={14} /> Por personal
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
            {(Object.values(totals.byStaff) as { name: string; total: number; count: number }[])
              .sort((a, b) => b.total - a.total)
              .map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-black">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{s.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/30">{s.count} transacciones</p>
                    </div>
                  </div>
                  <p className="text-lg font-black text-emerald-500">${s.total.toFixed(2)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Raw log */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-white/[0.07]">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Detalle ({filtered.length})</h3>
        </div>
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400 dark:text-white/30">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 dark:text-white/30">
            Sin comisiones registradas en el período.
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
                <tr>
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Tipo</th>
                  <th className="text-left px-4 py-2">Staff</th>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-right px-4 py-2">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {filtered
                  .slice()
                  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                  .map(r => (
                    <tr key={r.id} className="text-slate-700 dark:text-white/70">
                      <td className="px-4 py-2 font-medium">{r.date || r.createdAt?.slice(0, 10) || ''}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black uppercase tracking-wider">
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-bold">{r.staffName || '—'}</td>
                      <td className="px-4 py-2">{r.customerName || '—'}</td>
                      <td className="px-4 py-2">{r.serviceName || '—'}</td>
                      <td className="px-4 py-2 text-right font-black text-emerald-500">
                        ${Number(r.amount ?? r.servicePrice ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
