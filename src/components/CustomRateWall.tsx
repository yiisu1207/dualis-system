import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRates } from '../context/RatesContext';

interface CustomRateWallProps {
  businessId: string;
  rateId: string;
  rateName: string;
  currentUser?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  };
}

type RateEntry = {
  id: string;
  rateId: string;
  value: number;
  date: string;
  createdAt: any;
  createdBy?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  };
  status?: 'pending' | 'verified' | 'rejected';
  notes?: string;
};

const getInitials = (name?: string | null) => {
  if (!name) return 'US';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'US';
};

const formatTimestamp = (value: any) => {
  if (!value) return '';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const RATES_PER_PAGE = 10;

const CustomRateWall: React.FC<CustomRateWallProps> = ({ businessId, rateId, rateName, currentUser }) => {
  const { userProfile } = useAuth();
  const { success, error } = useToast();
  const { customRates, updateCustomRates } = useRates();

  const [entries, setEntries] = useState<RateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateValue, setRateValue] = useState('');
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [page, setPage] = useState(1);

  const resolvedUser = currentUser || (userProfile ? {
    uid: userProfile.uid,
    displayName: userProfile.displayName || null,
    photoURL: userProfile.photoURL || null,
  } : undefined);

  // Load history from Firestore
  useEffect(() => {
    if (!businessId) return;
    const q = query(
      collection(db, 'businesses', businessId, 'customRateHistory'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as RateEntry))
        .filter((e) => e.rateId === rateId);
      setEntries(all);
      setLoading(false);
    });
    return () => unsub();
  }, [businessId, rateId]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(entries.length / RATES_PER_PAGE));
  const pagedEntries = useMemo(() => {
    const start = (page - 1) * RATES_PER_PAGE;
    return entries.slice(start, start + RATES_PER_PAGE);
  }, [entries, page]);

  // Publish new rate value
  const handlePublish = async () => {
    const val = parseFloat(rateValue);
    if (!rateValue.trim() || isNaN(val) || val <= 0) {
      error(`Falta el valor de la tasa ${rateName}`);
      return;
    }
    if (!businessId || !resolvedUser) return;
    setPublishing(true);
    try {
      // Save to history
      await addDoc(collection(db, 'businesses', businessId, 'customRateHistory'), {
        rateId,
        value: val,
        date: rateDate,
        createdAt: serverTimestamp(),
        createdBy: {
          uid: resolvedUser.uid,
          displayName: resolvedUser.displayName || null,
          photoURL: resolvedUser.photoURL || null,
        },
        status: 'pending',
        notes: notes.trim() || null,
      });
      // Update current value in customRates
      const updated = customRates.map((r) => r.id === rateId ? { ...r, value: val } : r);
      await updateCustomRates(updated);
      setRateValue('');
      setNotes('');
      setPage(1);
      success(`Tasa ${rateName} publicada: Bs.${val.toFixed(2)}`);
    } catch (e) {
      error('Error al publicar la tasa');
    } finally {
      setPublishing(false);
    }
  };

  const handleReaction = async (entry: RateEntry, newStatus: 'verified' | 'rejected') => {
    if (!businessId) return;
    try {
      const status = entry.status === newStatus ? 'pending' : newStatus;
      await updateDoc(doc(db, 'businesses', businessId, 'customRateHistory', entry.id), { status });
      if (status === 'verified') {
        // Update active value when verified
        const updated = customRates.map((r) => r.id === rateId ? { ...r, value: entry.value } : r);
        await updateCustomRates(updated);
      }
    } catch {
      error('Error al actualizar estado');
    }
  };

  const currentValue = customRates.find((r) => r.id === rateId)?.value ?? 0;

  return (
    <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-700 dark:text-white/80 uppercase tracking-widest">
            Tasa {rateName}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/20 mt-0.5">
            Historial colaborativo · Actual: Bs.{currentValue.toFixed(2)}
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <span className="text-xs font-black text-violet-400">{rateId}</span>
        </div>
      </div>

      {/* Publish panel */}
      <div className="p-5 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
        <p className="text-[10px] font-black text-slate-400 dark:text-white/25 uppercase tracking-widest mb-3">
          Publicar tasa {rateName}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[140px] px-4 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 dark:text-white/25 whitespace-nowrap">Bs.</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-sm font-bold text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-white/15 min-w-0"
            />
          </div>
          <input
            type="date"
            value={rateDate}
            onChange={(e) => setRateDate(e.target.value)}
            className="px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-violet-400/20"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota opcional..."
            className="flex-1 min-w-[120px] px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-700 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-white/15 focus:ring-2 focus:ring-violet-400/20"
          />
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-5 py-2.5 rounded-xl text-xs font-black text-white flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 shadow-md shadow-violet-500/20 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
          >
            {publishing ? (
              <span className="animate-spin">⟳</span>
            ) : '+ Publicar'}
          </button>
        </div>
      </div>

      {/* History list */}
      <div className="p-5 space-y-3">
        {loading ? (
          <p className="text-center text-xs text-white/30 py-4">Cargando historial...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-xs font-bold text-slate-400 dark:text-white/20 py-4">
            Sin historial para {rateName}
          </p>
        ) : (
          <>
            {pagedEntries.map((entry) => {
              const isVerified = entry.status === 'verified';
              const isRejected = entry.status === 'rejected';
              const creatorName = entry.createdBy?.displayName || 'Sin autor';

              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-2xl border transition-colors ${
                    isVerified
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : isRejected
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-white/[0.07] bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: author avatar + info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {entry.createdBy?.photoURL ? (
                        <img
                          src={entry.createdBy.photoURL}
                          alt={creatorName}
                          className="w-8 h-8 rounded-full object-cover border-2 border-white/10 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white flex-shrink-0">
                          {getInitials(creatorName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-white/70 truncate">{creatorName}</p>
                        <p className="text-[9px] text-white/25">{formatTimestamp(entry.createdAt)}</p>
                      </div>
                    </div>

                    {/* Right: value + date + status */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-black text-white">Bs.{entry.value.toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-white/30">{entry.date}</p>
                      {isVerified && <span className="text-[9px] font-black text-emerald-400">✓ Verificado</span>}
                      {isRejected && <span className="text-[9px] font-black text-rose-400">✗ Rechazado</span>}
                    </div>
                  </div>

                  {entry.notes && (
                    <p className="mt-2 px-3 py-2 rounded-xl bg-white/[0.05] text-[11px] text-white/40 font-semibold">
                      {entry.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/[0.05]">
                    <button
                      onClick={() => handleReaction(entry, 'verified')}
                      className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-all ${
                        isVerified
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-emerald-500/10 hover:text-emerald-400'
                      }`}
                    >
                      ✅ Verificar
                    </button>
                    <button
                      onClick={() => handleReaction(entry, 'rejected')}
                      className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-all ${
                        isRejected
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:bg-rose-500/10 hover:text-rose-400'
                      }`}
                    >
                      ❌ Rechazar
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-xs font-bold disabled:opacity-30 hover:bg-white/[0.1] transition-all"
                >‹</button>
                <span className="text-xs text-white/40 font-bold">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-xs font-bold disabled:opacity-30 hover:bg-white/[0.1] transition-all"
                >›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CustomRateWall;
