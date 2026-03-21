import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  collection, query, where, orderBy, getDocs, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTenant } from '../context/TenantContext';
import {
  Search, Calendar, Filter, ChevronDown, ChevronUp, Loader2,
  FileText, Download, Printer, Package, CreditCard, DollarSign,
  Hash, Clock, User, Monitor, RotateCcw, TrendingUp, X,
  ArrowUpDown, Eye,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaleItem {
  id: string;
  nombre: string;
  qty: number;
  price: number;
  subtotal: number;
  ivaRate?: number;
}

interface SaleMovement {
  id: string;
  nroControl?: string;
  entityId: string;
  concept: string;
  amount: number;
  amountInUSD: number;
  originalAmount?: number;
  subtotalUSD?: number;
  ivaAmount?: number;
  igtfAmount?: number;
  igtfRate?: number;
  discountAmount?: number;
  currency: string;
  date: string;
  createdAt: string;
  startedAt?: string;
  movementType: string;
  rateUsed?: number;
  metodoPago?: string;
  referencia?: string;
  pagos?: Record<string, number>;
  esPagoMixto?: boolean;
  items?: SaleItem[];
  cajaId?: string;
  vendedorNombre?: string;
  vendedorId?: string;
  anulada?: boolean;
  pagado?: boolean;
  estadoPago?: string;
  esVentaContado?: boolean;
  cashGiven?: number;
  changeUsd?: number;
  changeBs?: number;
  mixCash?: number;
  mixTransfer?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso?: string) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}
function fmtBs(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TODAY = new Date().toISOString().split('T')[0];
const MONTH_START = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })();

// ─── Component ────────────────────────────────────────────────────────────────
export default function LibroVentasSection() {
  const { tenantId } = useTenant();
  const [allMovements, setAllMovements] = useState<SaleMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState(MONTH_START);
  const [dateTo, setDateTo] = useState(TODAY);
  const [searchText, setSearchText] = useState('');
  const [methodFilter, setMethodFilter] = useState('TODOS');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'anulada'>('all');
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Detail
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'movements'),
        where('businessId', '==', tenantId),
        where('movementType', '==', 'FACTURA'),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SaleMovement));
      setAllMovements(data);
    } catch {
      // Fallback: simple query without orderBy (no composite index)
      try {
        const q2 = query(
          collection(db, 'movements'),
          where('businessId', '==', tenantId),
        );
        const snap2 = await getDocs(q2);
        const data = snap2.docs
          .map(d => ({ id: d.id, ...d.data() } as SaleMovement))
          .filter(m => m.movementType === 'FACTURA')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllMovements(data);
      } catch {
        setAllMovements([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Unique methods for filter dropdown ──────────────────────────────────
  const availableMethods = useMemo(() => {
    const set = new Set<string>();
    allMovements.forEach(m => { if (m.metodoPago) set.add(m.metodoPago); });
    return ['TODOS', ...Array.from(set).sort()];
  }, [allMovements]);

  // ── Filtered + sorted ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allMovements;

    // Date range
    if (dateFrom) list = list.filter(m => (m.date || m.createdAt.split('T')[0]) >= dateFrom);
    if (dateTo) list = list.filter(m => (m.date || m.createdAt.split('T')[0]) <= dateTo);

    // Status
    if (statusFilter === 'valid') list = list.filter(m => !m.anulada);
    if (statusFilter === 'anulada') list = list.filter(m => m.anulada);

    // Method
    if (methodFilter !== 'TODOS') list = list.filter(m => m.metodoPago === methodFilter);

    // Text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(m =>
        (m.entityId || '').toLowerCase().includes(q) ||
        (m.concept || '').toLowerCase().includes(q) ||
        (m.nroControl || '').includes(q) ||
        (m.vendedorNombre || '').toLowerCase().includes(q) ||
        (m.items || []).some(i => i.nombre.toLowerCase().includes(q))
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortField === 'date') {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return sortDir === 'desc' ? -diff : diff;
      }
      const diff = (a.amountInUSD || 0) - (b.amountInUSD || 0);
      return sortDir === 'desc' ? -diff : diff;
    });

    return list;
  }, [allMovements, dateFrom, dateTo, searchText, methodFilter, statusFilter, sortField, sortDir]);

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const valid = filtered.filter(m => !m.anulada);
    const totalUsd = valid.reduce((s, m) => s + (m.amountInUSD || 0), 0);
    const totalSubtotal = valid.reduce((s, m) => s + (m.subtotalUSD || m.amountInUSD || 0), 0);
    const totalIva = valid.reduce((s, m) => s + (m.ivaAmount || 0), 0);
    const totalIgtf = valid.reduce((s, m) => s + (m.igtfAmount || 0), 0);
    const totalDiscount = valid.reduce((s, m) => s + (m.discountAmount || 0), 0);
    const count = valid.length;
    const anuladas = filtered.filter(m => m.anulada).length;
    // Avg rate from valid sales with known rate
    const withRate = valid.filter(m => m.rateUsed && m.rateUsed > 0);
    const avgRate = withRate.length > 0 ? withRate.reduce((s, m) => s + (m.rateUsed || 0), 0) / withRate.length : 0;
    const totalBs = totalUsd * avgRate;
    return { totalUsd, totalSubtotal, totalIva, totalIgtf, totalDiscount, count, anuladas, avgRate, totalBs };
  }, [filtered]);

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Export CSV ──────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Fecha', 'Hora', 'Nro Control', 'Cliente', 'Método', 'Subtotal USD', 'IVA USD', 'IGTF USD', 'Descuento USD', 'Total USD', 'Total Bs', 'Tasa', 'Vendedor', 'Caja', 'Estado'];
    const rows = filtered.map(m => {
      const bsTotal = m.originalAmount || (m.amountInUSD && m.rateUsed ? m.amountInUSD * m.rateUsed : 0);
      return [
        m.date || m.createdAt.split('T')[0],
        fmtTime(m.createdAt),
        m.nroControl || '',
        m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : m.entityId,
        m.metodoPago || '',
        (m.subtotalUSD || 0).toFixed(2),
        (m.ivaAmount || 0).toFixed(2),
        (m.igtfAmount || 0).toFixed(2),
        (m.discountAmount || 0).toFixed(2),
        (m.amountInUSD || 0).toFixed(2),
        bsTotal.toFixed(2),
        (m.rateUsed || 0).toFixed(2),
        m.vendedorNombre || '',
        m.cajaId || '',
        m.anulada ? 'ANULADA' : 'VÁLIDA',
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libro-ventas-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <FileText size={20} className="text-indigo-500" />
            Libro de Ventas
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Reporte completo de facturación — doble moneda</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.1] transition-all">
            <Download size={13} /> <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={() => setShowFilters(p => !p)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${showFilters ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-white/[0.06] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.1]'}`}>
            <Filter size={13} /> Filtros
          </button>
          <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black shadow-md shadow-indigo-500/25 hover:-translate-y-0.5 transition-all disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] p-3 sm:p-5 shadow-lg shadow-black/5 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:outline-none" />
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Método de Pago</label>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:outline-none">
              {availableMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Estado</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:outline-none">
              <option value="all">Todas</option>
              <option value="valid">Válidas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-1">Buscar</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="Cliente, producto, vendedor..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-700 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] p-4 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">Operaciones</p>
          <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{totals.count}</p>
          {totals.anuladas > 0 && <p className="text-[9px] font-bold text-rose-400 mt-0.5">{totals.anuladas} anuladas</p>}
        </div>
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-emerald-100 dark:border-emerald-500/20 p-4 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/60">Total USD</p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">${totals.totalUsd.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-violet-100 dark:border-violet-500/20 p-4 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-violet-500/60">Total Bs</p>
          <p className="text-xl font-black text-violet-600 dark:text-violet-400 mt-1">Bs {fmtBs(totals.totalBs)}</p>
        </div>
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-sky-100 dark:border-sky-500/20 p-4 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-sky-500/60">IVA</p>
          <p className="text-xl font-black text-sky-600 dark:text-sky-400 mt-1">${totals.totalIva.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-amber-100 dark:border-amber-500/20 p-4 shadow-sm hidden sm:block">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/60">IGTF</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">${totals.totalIgtf.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] p-4 shadow-sm hidden sm:block">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">Tasa Prom.</p>
          <p className="text-xl font-black text-slate-800 dark:text-white mt-1">{totals.avgRate > 0 ? totals.avgRate.toFixed(2) : '—'}</p>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText size={32} className="mx-auto text-slate-300 dark:text-white/10 mb-3" />
            <p className="text-sm font-bold text-slate-400 dark:text-white/30">No hay ventas en este rango</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs hidden md:table">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.06]">
                  <th className="px-4 py-3 text-left font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">#</th>
                  <th className="px-4 py-3 text-left font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px] cursor-pointer select-none" onClick={() => toggleSort('date')}>
                    <span className="flex items-center gap-1">Fecha <ArrowUpDown size={9} /></span>
                  </th>
                  <th className="px-4 py-3 text-left font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Cliente</th>
                  <th className="px-4 py-3 text-left font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Método</th>
                  <th className="px-4 py-3 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Base $</th>
                  <th className="px-4 py-3 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">IVA $</th>
                  <th className="px-4 py-3 text-right font-black text-emerald-400/50 uppercase tracking-widest text-[9px] cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                    <span className="flex items-center gap-1 justify-end">Total $ <ArrowUpDown size={9} /></span>
                  </th>
                  <th className="px-4 py-3 text-right font-black text-violet-400/50 uppercase tracking-widest text-[9px]">Total Bs</th>
                  <th className="px-4 py-3 text-center font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]">Tasa</th>
                  <th className="px-4 py-3 text-center font-black text-slate-400 dark:text-white/30 uppercase tracking-widest text-[9px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => {
                  const isExp = expanded.has(m.id);
                  const bsTotal = m.originalAmount || (m.amountInUSD && m.rateUsed ? m.amountInUSD * m.rateUsed : 0);
                  const subtotal = m.subtotalUSD || m.amountInUSD || 0;
                  const iva = m.ivaAmount || 0;

                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        onClick={() => toggleExpanded(m.id)}
                        className={`border-b border-slate-50 dark:border-white/[0.04] cursor-pointer transition-colors ${
                          m.anulada
                            ? 'bg-rose-50/50 dark:bg-rose-500/[0.03] opacity-60'
                            : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400 dark:text-white/20">{idx + 1}</span>
                            {m.nroControl && (
                              <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/[0.06] text-[8px] font-mono font-bold text-slate-500 dark:text-white/40 rounded">
                                {m.nroControl}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-700 dark:text-white/80 text-[11px]">{fmtDate(m.createdAt)}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/25 font-mono">{fmtTime(m.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-700 dark:text-white/80 truncate max-w-[140px]">
                            {m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : m.entityId}
                          </p>
                          {m.vendedorNombre && (
                            <p className="text-[9px] text-slate-400 dark:text-white/25 flex items-center gap-1 mt-0.5">
                              <User size={8} /> {m.vendedorNombre}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                            m.anulada
                              ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          }`}>
                            <CreditCard size={8} />
                            {m.anulada ? 'Anulada' : (m.metodoPago || 'N/A')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span className="font-bold text-slate-600 dark:text-white/50">${subtotal.toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span className={`font-bold ${iva > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-slate-300 dark:text-white/15'}`}>
                            {iva > 0 ? `$${iva.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span className="font-black text-emerald-600 dark:text-emerald-400">${(m.amountInUSD || 0).toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span className="font-bold text-violet-600 dark:text-violet-400">
                            {bsTotal > 0 ? `Bs ${fmtBs(bsTotal)}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-white/25">
                            {m.rateUsed ? m.rateUsed.toFixed(2) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-slate-300 dark:text-white/15">
                            {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        </td>
                      </tr>

                      {/* ── Expanded Detail Row ── */}
                      {isExp && (
                        <tr>
                          <td colSpan={10} className="bg-slate-50/50 dark:bg-white/[0.02] px-4 py-4 border-b border-slate-100 dark:border-white/[0.06]">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl">

                              {/* Items table */}
                              {m.items && m.items.length > 0 && (
                                <div className="lg:col-span-2">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-2 flex items-center gap-1">
                                    <Package size={10} /> Productos ({m.items.length})
                                  </p>
                                  <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/[0.07]">
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="bg-white dark:bg-white/[0.04]">
                                          <th className="px-3 py-2 text-left font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">Producto</th>
                                          <th className="px-3 py-2 text-center font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">Cant</th>
                                          <th className="px-3 py-2 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">P/U $</th>
                                          <th className="px-3 py-2 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">P/U Bs</th>
                                          <th className="px-3 py-2 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">Sub $</th>
                                          <th className="px-3 py-2 text-right font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">IVA</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {m.items.map(item => {
                                          const priceBs = item.price * (m.rateUsed || 0);
                                          const itemIva = item.ivaRate != null ? `${(item.ivaRate * 100).toFixed(0)}%` : '—';
                                          return (
                                            <tr key={item.id} className="border-t border-slate-50 dark:border-white/[0.04]">
                                              <td className="px-3 py-2 font-bold text-slate-700 dark:text-white/70 max-w-[180px] truncate">{item.nombre}</td>
                                              <td className="px-3 py-2 text-center font-black text-slate-500 dark:text-white/50">{item.qty}</td>
                                              <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-white/60">${item.price.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right font-mono text-violet-500 dark:text-violet-400">{m.rateUsed ? `Bs ${fmtBs(priceBs)}` : '—'}</td>
                                              <td className="px-3 py-2 text-right font-black font-mono text-slate-800 dark:text-white/80">${item.subtotal.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right font-mono text-sky-500">{itemIva}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Financial + Payment detail */}
                              <div className="space-y-3">
                                {/* Financial breakdown */}
                                <div className="rounded-xl bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07] p-3 space-y-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-2 flex items-center gap-1">
                                    <DollarSign size={10} /> Desglose financiero
                                  </p>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-500 dark:text-white/40">Subtotal</span>
                                    <div className="text-right">
                                      <span className="font-black text-slate-700 dark:text-white/70">${subtotal.toFixed(2)}</span>
                                      {m.rateUsed ? <span className="text-violet-400 ml-2 font-mono">Bs {fmtBs(subtotal * m.rateUsed)}</span> : null}
                                    </div>
                                  </div>
                                  {iva > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-sky-500">IVA</span>
                                      <div className="text-right">
                                        <span className="font-black text-sky-500">+${iva.toFixed(2)}</span>
                                        {m.rateUsed ? <span className="text-sky-400/60 ml-2 font-mono">Bs {fmtBs(iva * m.rateUsed)}</span> : null}
                                      </div>
                                    </div>
                                  )}
                                  {(m.igtfAmount || 0) > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-amber-500">IGTF ({m.igtfRate || 3}%)</span>
                                      <span className="font-black text-amber-500">+${(m.igtfAmount || 0).toFixed(2)}</span>
                                    </div>
                                  )}
                                  {(m.discountAmount || 0) > 0 && (
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-emerald-500">Descuento</span>
                                      <span className="font-black text-emerald-500">-${(m.discountAmount || 0).toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="border-t border-slate-100 dark:border-white/[0.06] pt-1.5 flex justify-between text-[11px]">
                                    <span className="font-black text-slate-700 dark:text-white/70">Total</span>
                                    <div className="text-right">
                                      <span className="font-black text-emerald-600 dark:text-emerald-400">${(m.amountInUSD || 0).toFixed(2)}</span>
                                      {bsTotal > 0 && <span className="text-violet-400 ml-2 font-black font-mono">Bs {fmtBs(bsTotal)}</span>}
                                    </div>
                                  </div>
                                  {m.rateUsed && (
                                    <div className="flex justify-between text-[9px] text-slate-400 dark:text-white/20 pt-0.5">
                                      <span>Tasa aplicada</span>
                                      <span className="font-mono font-bold">1$ = Bs {m.rateUsed.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Payment detail */}
                                <div className="rounded-xl bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07] p-3 space-y-1.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 mb-2 flex items-center gap-1">
                                    <CreditCard size={10} /> Pago
                                  </p>
                                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-white/40">
                                    <span>Método</span>
                                    <span className="font-black text-slate-700 dark:text-white/70">{m.metodoPago || 'N/A'}</span>
                                  </div>
                                  {m.referencia && (
                                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-white/40">
                                      <span>Referencia</span>
                                      <span className="font-mono font-bold text-slate-700 dark:text-white/70">{m.referencia}</span>
                                    </div>
                                  )}
                                  {/* Structured pagos breakdown */}
                                  {m.pagos && Object.keys(m.pagos).length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-white/[0.06] pt-1.5 mt-1.5 space-y-1">
                                      <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60">Desglose pagos</p>
                                      {Object.entries(m.pagos).map(([method, amount]) => (
                                        <div key={method} className="flex justify-between text-[10px]">
                                          <span className="text-slate-500 dark:text-white/40">{method}</span>
                                          <span className="font-black text-slate-700 dark:text-white/70">${(amount as number).toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {m.cashGiven != null && m.cashGiven > 0 && (
                                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-white/40">
                                      <span>Entregado</span>
                                      <span className="font-black">${m.cashGiven.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {m.changeUsd != null && m.changeUsd > 0 && (
                                    <div className="flex justify-between text-[10px] text-emerald-500">
                                      <span>Cambio</span>
                                      <span className="font-black">${m.changeUsd.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Timing */}
                                {m.startedAt && (
                                  <div className="rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.07] border border-indigo-100 dark:border-indigo-500/20 p-3 space-y-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1">
                                      <Clock size={10} /> Cronología
                                    </p>
                                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-indigo-300/60">
                                      <span>Inicio</span>
                                      <span className="font-bold">{fmtTime(m.startedAt)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-indigo-300/60">
                                      <span>Cobro</span>
                                      <span className="font-bold">{fmtTime(m.createdAt)}</span>
                                    </div>
                                    {(() => {
                                      const ms = new Date(m.createdAt).getTime() - new Date(m.startedAt).getTime();
                                      if (ms <= 0) return null;
                                      const mins = Math.floor(ms / 60000);
                                      const secs = Math.floor((ms % 60000) / 1000);
                                      return (
                                        <div className="flex justify-between text-[10px] text-indigo-500">
                                          <span className="font-bold">Duración</span>
                                          <span className="font-black">{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Meta */}
                                <div className="flex items-center gap-3 text-[9px] text-slate-400 dark:text-white/20 flex-wrap">
                                  {m.cajaId && <span className="flex items-center gap-1"><Monitor size={8} /> {m.cajaId}</span>}
                                  {m.vendedorNombre && <span className="flex items-center gap-1"><User size={8} /> {m.vendedorNombre}</span>}
                                  <span className="font-mono">{m.id.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* ── Mobile Card View ─────────────────────────────────────── */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-white/[0.06]">
              {filtered.map((m, idx) => {
                const bsTotal = m.originalAmount || (m.amountInUSD && m.rateUsed ? m.amountInUSD * m.rateUsed : 0);
                const isExp = expanded.has(m.id);
                return (
                  <div key={m.id} className={`p-3.5 ${m.anulada ? 'opacity-50' : ''}`}>
                    <button onClick={() => toggleExpanded(m.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400 dark:text-white/20">{idx + 1}</span>
                            <p className="text-xs font-black text-slate-700 dark:text-white/80 truncate">
                              {m.entityId === 'CONSUMIDOR_FINAL' ? 'Cons. Final' : m.entityId}
                            </p>
                            {m.anulada && <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/10 text-rose-500 text-[8px] font-black rounded uppercase">Anulada</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-white/30">
                            <span>{fmtDate(m.createdAt)}</span>
                            <span>{fmtTime(m.createdAt)}</span>
                            <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded text-[8px] font-black">{m.metodoPago || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${(m.amountInUSD || 0).toFixed(2)}</p>
                          {bsTotal > 0 && <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400">Bs {fmtBs(bsTotal)}</p>}
                          <span className="text-slate-300 dark:text-white/15 mt-0.5 inline-block">{isExp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                        </div>
                      </div>
                    </button>
                    {isExp && (
                      <div className="mt-3 space-y-2">
                        {/* Items */}
                        {m.items && m.items.length > 0 && (
                          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] p-2.5 space-y-1">
                            {m.items.map(item => (
                              <div key={item.id} className="flex justify-between text-[10px]">
                                <span className="text-slate-600 dark:text-white/60 truncate flex-1">{item.qty}× {item.nombre}</span>
                                <span className="font-black text-slate-700 dark:text-white/70 ml-2">${item.subtotal.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Financial */}
                        <div className="rounded-xl bg-white dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-2.5 space-y-1">
                          {(m.subtotalUSD || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-slate-400">Subtotal</span><span className="font-black text-slate-600 dark:text-white/60">${(m.subtotalUSD || 0).toFixed(2)}</span></div>}
                          {(m.ivaAmount || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-sky-500">IVA</span><span className="font-black text-sky-500">+${(m.ivaAmount || 0).toFixed(2)}</span></div>}
                          {(m.igtfAmount || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-amber-500">IGTF</span><span className="font-black text-amber-500">+${(m.igtfAmount || 0).toFixed(2)}</span></div>}
                          {m.rateUsed && <div className="flex justify-between text-[9px] text-slate-400 dark:text-white/20"><span>Tasa</span><span className="font-mono">1$ = Bs {m.rateUsed.toFixed(2)}</span></div>}
                        </div>
                        {/* Meta */}
                        <div className="flex items-center gap-3 text-[9px] text-slate-400 dark:text-white/20 flex-wrap">
                          {m.vendedorNombre && <span className="flex items-center gap-1"><User size={8} /> {m.vendedorNombre}</span>}
                          {m.cajaId && <span className="flex items-center gap-1"><Monitor size={8} /> {m.cajaId}</span>}
                          {m.nroControl && <span className="font-mono">#{m.nroControl}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Table Footer Totals ───────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.03] px-3 sm:px-4 py-3 flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-white/25">
              {filtered.length} reg. · {totals.count} válidas
            </span>
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">Total USD</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${totals.totalUsd.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">Total Bs</p>
                <p className="text-sm font-black text-violet-600 dark:text-violet-400">Bs {fmtBs(totals.totalBs)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
