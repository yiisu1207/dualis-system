import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { db } from '../../firebase/config';
import { useRates } from '../../context/RatesContext';
import { useToast } from '../../context/ToastContext';
import { createExchangeRateEntry } from '../../firebase/api';
import { backfillMissingRatesUpTo } from '../../utils/rateBackfill';
import type { CustomRate } from '../../../types';

type FallbackPolicy = 'prior' | 'posterior' | 'ask';

interface Props {
  businessId?: string | null;
  currentUser?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  };
  customRates: CustomRate[];
}

type RateEntry = {
  id: string;
  date: string;
  bcv: number;
  customRates?: Record<string, number>;
  status?: 'pending' | 'verified' | 'rejected';
  createdBy?: { uid: string; displayName?: string | null; photoURL?: string | null };
  notes?: string;
  timestamp?: any;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtTime = (v: any) => {
  if (!v) return '--';
  const d = v.toDate ? v.toDate() : new Date(v);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (v: string) => {
  if (!v) return '';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

const initials = (name?: string | null) => {
  if (!name) return 'SI';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'SI';
};

const TasasPageRedesign: React.FC<Props> = ({ businessId, currentUser, customRates }) => {
  const { rates, updateCustomRates, usingStaleRate, lastFetchAttempt, forceRefreshBCV } = useRates();
  const toast = useToast();

  const [entries, setEntries] = useState<RateEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fallbackPolicy, setFallbackPolicy] = useState<FallbackPolicy>('prior');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [mgmtSaving, setMgmtSaving] = useState(false);

  // Listen to rate history
  useEffect(() => {
    if (!businessId) { setEntries([]); return; }
    const q = query(
      collection(db, 'businesses', businessId, 'exchange_rates_history'),
      orderBy('date', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: RateEntry[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          date: data.date || d.id,
          bcv: Number(data.bcv) || 0,
          customRates: data.customRates && typeof data.customRates === 'object' ? data.customRates : undefined,
          status: data.status || 'pending',
          createdBy: data.createdBy,
          notes: data.notes,
          timestamp: data.timestamp,
        };
      });
      next.sort((a, b) => {
        const dc = String(b.date).localeCompare(String(a.date));
        if (dc !== 0) return dc;
        const at = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const bt = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return bt - at;
      });
      setEntries(next);
    });
    return () => unsub();
  }, [businessId]);

  // Listen to fallback policy
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(doc(db, 'businessConfigs', businessId), (snap) => {
      const data = snap.data() as any;
      const p = data?.ratePolicy?.missingDateFallback;
      if (p === 'prior' || p === 'posterior' || p === 'ask') setFallbackPolicy(p);
    });
    return () => unsub();
  }, [businessId]);

  const savePolicy = async (v: FallbackPolicy) => {
    if (!businessId) return;
    const prev = fallbackPolicy;
    setFallbackPolicy(v);
    setSavingPolicy(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), { ratePolicy: { missingDateFallback: v } }, { merge: true });
    } catch {
      setFallbackPolicy(prev);
      toast.error('No se pudo guardar la política.');
    } finally {
      setSavingPolicy(false);
    }
  };

  // BCV hero data
  const bcvToday = rates.tasaBCV;
  const prevBcvEntry = useMemo(() => entries.find(e => e.bcv > 0 && e.date < todayISO()), [entries]);
  const bcvDelta = prevBcvEntry && prevBcvEntry.bcv > 0
    ? ((bcvToday - prevBcvEntry.bcv) / prevBcvEntry.bcv) * 100
    : 0;

  const spark = useMemo(() => {
    const last = entries.filter(e => e.bcv > 0).slice(0, 14).reverse();
    if (last.length < 2) return null;
    const vals = last.map(e => e.bcv);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const w = 140, h = 32;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return { pts, w, h, up: vals[vals.length - 1] >= vals[0] };
  }, [entries]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await forceRefreshBCV();
      if (r) toast.success(`BCV actualizado: ${r.toFixed(4)} Bs/$`);
      else toast.error('No se pudo obtener la tasa BCV.');
    } finally {
      setRefreshing(false);
    }
  };

  // Get last published value for a custom rate
  const lastCustomFor = (rateId: string): { value: number; entry?: RateEntry } => {
    for (const e of entries) {
      const v = e.customRates?.[rateId];
      if (typeof v === 'number' && v > 0) return { value: v, entry: e };
    }
    return { value: 0 };
  };

  const handlePublishRate = async (cr: CustomRate) => {
    if (!businessId) return;
    const raw = (inputs[cr.id] ?? '').trim().replace(',', '.');
    const v = Number(raw);
    if (!(v > 0)) { toast.error('Ingresa un valor válido.'); return; }

    setPublishingId(cr.id);
    try {
      const createdBy = currentUser?.uid
        ? { uid: currentUser.uid, displayName: currentUser.displayName || null, photoURL: currentUser.photoURL || null }
        : undefined;

      await createExchangeRateEntry(
        businessId,
        todayISO(),
        { bcv: bcvToday, grupo: 0, divisa: 0, lastUpdated: todayISO() },
        createdBy,
        undefined,
        { [cr.id]: v },
      );

      const updated = customRates.map(x => x.id === cr.id ? { ...x, value: v } : x);
      await updateCustomRates(updated);

      try {
        await backfillMissingRatesUpTo(
          businessId,
          todayISO(),
          bcvToday,
          'manual',
          currentUser?.uid ? { uid: currentUser.uid, displayName: currentUser.displayName || 'Admin' } : undefined,
        );
      } catch (e) {
        console.error('[Tasas] backfill post-publish falló:', e);
      }

      setInputs(prev => { const n = { ...prev }; delete n[cr.id]; return n; });
      toast.success(`${cr.name} publicada: ${v.toFixed(4)} Bs/$`);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo publicar la tasa.');
    } finally {
      setPublishingId(null);
    }
  };

  const handleVerify = async (entry: RateEntry, status: 'verified' | 'rejected') => {
    if (!businessId) return;
    try {
      await updateDoc(
        doc(db, 'businesses', businessId, 'exchange_rates_history', entry.id),
        { status },
      );
    } catch {
      toast.error('No se pudo actualizar el estado.');
    }
  };

  const handleDelete = async (entry: RateEntry) => {
    if (!businessId) return;
    if (!window.confirm('¿Eliminar esta entrada del historial?')) return;
    try {
      await deleteDoc(doc(db, 'businesses', businessId, 'exchange_rates_history', entry.id));
      toast.success('Entrada eliminada.');
    } catch {
      toast.error('No se pudo eliminar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── BCV HERO (read-only, auto) ───────────────────────────── */}
      <div className="relative bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        {usingStaleRate && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} />
            No se pudo obtener la tasa BCV de hoy. Mostrando última conocida.
          </div>
        )}
        <div className="p-6 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Globe size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Tasa BCV</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Auto
                </span>
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-4xl font-black text-slate-900 dark:text-white tabular-nums">
                  {bcvToday > 0 ? bcvToday.toFixed(4) : '—'}
                </span>
                <span className="text-xs font-bold text-slate-400 dark:text-white/30">Bs/$</span>
                {bcvDelta !== 0 && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-black ${bcvDelta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {bcvDelta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {bcvDelta > 0 ? '+' : ''}{bcvDelta.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-white/25 mt-1">
                Última actualización: {fmtTime(lastFetchAttempt || rates.lastUpdated)} · Auto-fetch diario + backfill
              </div>
            </div>
          </div>

          {spark && (
            <div className="shrink-0 flex flex-col items-center gap-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
                Tendencia 14d
              </span>
              <svg viewBox={`0 0 ${spark.w} ${spark.h}`} width={spark.w} height={spark.h}>
                <polyline
                  points={spark.pts}
                  fill="none"
                  stroke={spark.up ? '#10b981' : '#ef4444'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-11 px-4 rounded-xl text-xs font-black text-white flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-md shrink-0"
            style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualizar ahora
          </button>
        </div>
      </div>

      {/* ─── DYNAMIC RATES TABLE (only manual section) ────────────── */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">Tasas Dinámicas</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
              Publica manualmente. La tasa BCV arriba se actualiza sola.
            </p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
            {customRates.length} {customRates.length === 1 ? 'tasa' : 'tasas'}
          </span>
        </div>

        {customRates.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-xs font-bold text-slate-400 dark:text-white/25">
              No hay tasas dinámicas configuradas.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-white/20 mt-1">
              Agrega cuentas desde "Gestión de Cuentas" abajo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 border-b border-slate-100 dark:border-white/[0.04]">
                  <th className="px-6 py-3 text-left">Divisa</th>
                  <th className="px-4 py-3 text-right">Valor actual</th>
                  <th className="px-4 py-3 text-right">Δ vs BCV</th>
                  <th className="px-4 py-3 text-left">Última publicación</th>
                  <th className="px-4 py-3 text-right">Nuevo valor</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {customRates.map((cr) => {
                  const last = lastCustomFor(cr.id);
                  const current = cr.value || last.value;
                  const delta = bcvToday > 0 && current > 0 ? ((current - bcvToday) / bcvToday) * 100 : 0;
                  const busy = publishingId === cr.id;
                  return (
                    <tr key={cr.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-[10px] font-black text-white shadow-md shadow-violet-500/20">
                            {cr.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-black text-slate-800 dark:text-white">{cr.name}</div>
                            <div className="text-[9px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-widest">{cr.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-base font-black tabular-nums text-slate-800 dark:text-white">
                          {current > 0 ? current.toFixed(4) : '—'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-white/25 ml-1">Bs</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {delta !== 0 ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-black ${delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300 dark:text-white/15">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {last.entry ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[8px] font-black text-white">
                              {initials(last.entry.createdBy?.displayName)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-600 dark:text-white/60 truncate max-w-[140px]">
                                {last.entry.createdBy?.displayName || 'Sin autor'}
                              </div>
                              <div className="text-[9px] font-bold text-slate-400 dark:text-white/25">
                                {fmtDate(last.entry.date)} · {fmtTime(last.entry.timestamp)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 dark:text-white/15">Nunca publicada</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={inputs[cr.id] ?? ''}
                          onChange={(e) => setInputs(prev => ({ ...prev, [cr.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handlePublishRate(cr); }}
                          placeholder={current > 0 ? current.toFixed(4) : '0.0000'}
                          className="w-28 px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-lg text-sm font-bold text-right tabular-nums text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/15 focus:ring-2 focus:ring-violet-400/20 focus:border-violet-400/40 outline-none transition-all"
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => handlePublishRate(cr)}
                          disabled={busy || !(Number((inputs[cr.id] ?? '').replace(',', '.')) > 0)}
                          className="h-9 px-3 rounded-lg text-[11px] font-black text-white flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md ml-auto"
                          style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Publicar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── FALLBACK POLICY ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        <button
          onClick={() => setPolicyOpen(o => !o)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
        >
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">
              Política de fallback
            </h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
              Cuando un vale tiene fecha sin tasa publicada · Actual: {fallbackPolicy === 'prior' ? 'Día anterior' : fallbackPolicy === 'posterior' ? 'Día posterior' : 'Preguntar'}
            </p>
          </div>
          {policyOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {policyOpen && (
        <div className="p-5 space-y-2 border-t border-slate-100 dark:border-white/[0.06]">
          {([
            { v: 'prior' as const, t: 'Usar la BCV del día hábil anterior más cercano', sub: 'Recomendado (comportamiento BCV real)' },
            { v: 'posterior' as const, t: 'Usar la BCV del día posterior más cercano', sub: 'Si publican retroactivo' },
            { v: 'ask' as const, t: 'Preguntar cada vez', sub: 'Modal con ambas opciones al registrar' },
          ]).map((opt) => {
            const active = fallbackPolicy === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => savePolicy(opt.v)}
                disabled={savingPolicy}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${active
                  ? 'bg-violet-500/5 border-violet-400/40 dark:bg-violet-500/10'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-violet-500 bg-violet-500' : 'border-slate-300 dark:border-white/20'}`}>
                    {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-black text-slate-800 dark:text-white">{opt.t}</div>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-white/25 mt-0.5">{opt.sub}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* ─── HISTORY (collapsed) ──────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
        >
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">Historial de tasas</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
              {entries.length} {entries.length === 1 ? 'registro' : 'registros'} · BCV + dinámicas
            </p>
          </div>
          {historyOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {historyOpen && (
          <div className="border-t border-slate-100 dark:border-white/[0.06] max-h-[480px] overflow-y-auto">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400 dark:text-white/20">
                Aún no hay historial.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-[#0d1424]">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25 border-b border-slate-100 dark:border-white/[0.04]">
                    <th className="px-6 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-right">BCV</th>
                    <th className="px-4 py-3 text-left">Dinámicas</th>
                    <th className="px-4 py-3 text-left">Autor</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-6 py-3 text-xs font-bold text-slate-700 dark:text-white/70 tabular-nums">
                        {fmtDate(e.date)}
                        <div className="text-[9px] font-bold text-slate-400 dark:text-white/20">{fmtTime(e.timestamp)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-slate-800 dark:text-white">
                        {e.bcv > 0 ? e.bcv.toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {e.customRates && Object.keys(e.customRates).filter(k => k.toLowerCase() !== 'bcv').length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(e.customRates).filter(([k]) => k.toLowerCase() !== 'bcv').map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                                {k} · {Number(v).toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 dark:text-white/15">Solo BCV</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[8px] font-black text-white">
                            {initials(e.createdBy?.displayName)}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-white/40 truncate max-w-[120px]">
                            {e.createdBy?.displayName || 'Sistema'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          e.status === 'verified'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : e.status === 'rejected'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-500 dark:text-white/40 border-slate-500/20'
                        }`}>
                          {e.status === 'verified' ? 'Verificada' : e.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleVerify(e, 'verified')}
                            title="Verificar"
                            className="h-7 w-7 rounded-lg hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500 transition-colors flex items-center justify-center"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => handleVerify(e, 'rejected')}
                            title="Rechazar"
                            className="h-7 w-7 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center"
                          >
                            <X size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            title="Eliminar"
                            className="h-7 px-2 rounded-lg hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 dark:hover:text-white/60 text-[10px] font-black transition-colors"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ─── GESTIÓN DE CUENTAS (collapsed) ─────────────────────── */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
        <button
          onClick={() => setMgmtOpen(o => !o)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
        >
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">Gestión de Cuentas</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
              {customRates.length} {customRates.length === 1 ? 'cuenta adicional' : 'cuentas adicionales'} · Agregar o eliminar tasas
            </p>
          </div>
          {mgmtOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {mgmtOpen && (
          <div className="p-5 space-y-3 border-t border-slate-100 dark:border-white/[0.06]">
            {customRates.map(account => (
              <div key={account.id} className="flex items-center gap-3 group">
                <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl">
                  <span className="text-xs font-black text-slate-500 dark:text-white/30 uppercase tracking-wider min-w-[80px]">
                    {account.name}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-widest">{account.id}</span>
                  {account.value > 0 && (
                    <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-white/30 whitespace-nowrap tabular-nums">
                      Bs.{account.value.toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const updated = customRates.filter(a => a.id !== account.id);
                    setMgmtSaving(true);
                    try {
                      await updateCustomRates(updated);
                      toast.success('Cuenta eliminada');
                    } catch {
                      toast.error('Error al eliminar');
                    } finally {
                      setMgmtSaving(false);
                    }
                  }}
                  disabled={mgmtSaving}
                  className="h-10 w-10 rounded-xl border border-transparent hover:border-rose-500/20 hover:bg-rose-500/10 flex items-center justify-center text-slate-300 dark:text-white/10 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-20"
                  title="Eliminar cuenta"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {customRates.length === 0 && (
              <p className="text-center text-xs font-bold text-slate-400 dark:text-white/15 py-4">
                No hay cuentas adicionales configuradas
              </p>
            )}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key !== 'Enter') return;
                  const name = newName.trim();
                  if (!name) return;
                  const id = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
                  if (customRates.some(a => a.id === id)) {
                    toast.error('Ya existe una cuenta con ese nombre');
                    return;
                  }
                  const updated: CustomRate[] = [...customRates, { id, name, value: 0, enabled: true }];
                  setMgmtSaving(true);
                  try {
                    await updateCustomRates(updated);
                    setNewName('');
                    toast.success(`Cuenta ${name} agregada`);
                  } catch {
                    toast.error('Error al guardar');
                  } finally {
                    setMgmtSaving(false);
                  }
                }}
                placeholder="Nombre de nueva cuenta (ej: PARALELA)..."
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/15 focus:ring-2 focus:ring-violet-400/20 outline-none transition-all"
              />
              <button
                onClick={async () => {
                  const name = newName.trim();
                  if (!name) return;
                  const id = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
                  if (customRates.some(a => a.id === id)) {
                    toast.error('Ya existe una cuenta con ese nombre');
                    return;
                  }
                  const updated: CustomRate[] = [...customRates, { id, name, value: 0, enabled: true }];
                  setMgmtSaving(true);
                  try {
                    await updateCustomRates(updated);
                    setNewName('');
                    toast.success(`Cuenta ${name} agregada`);
                  } catch {
                    toast.error('Error al guardar');
                  } finally {
                    setMgmtSaving(false);
                  }
                }}
                disabled={!newName.trim() || mgmtSaving}
                className="h-11 px-4 rounded-xl text-xs font-black text-white flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-20 shadow-md"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
              >
                {mgmtSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasasPageRedesign;
