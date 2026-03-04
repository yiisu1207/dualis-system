import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { createExchangeRateEntry } from '../firebase/api';
import { useToast } from '../context/ToastContext';

interface RateHistoryWallProps {
  businessId?: string | null;
  currentUser?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  };
}

type RateReaction = {
  uid: string;
  emoji: string;
  timestamp: string;
};

type RateEntry = {
  id: string;
  date: string;
  bcv: number;
  parallel: number;
  status?: 'pending' | 'verified' | 'rejected';
  createdBy?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
    timestamp?: any;
  };
  notes?: string;
  reactions?: RateReaction[];
  timestamp?: any;
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

const formatTimeShort = (value: any) => {
  if (!value) return '--:--';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const normalizeOcrText = (value: string) =>
  value.replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const monthMap: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const parseSpanishDate = (value: string) => {
  const normalized = stripAccents(value.toLowerCase());
  const match = normalized.match(/(\d{1,2})\s*de\s*([a-z]+)\s*de\s*(\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthName = match[2];
  const year = Number(match[3]);
  const month = monthMap[monthName];
  if (!month || !day || !year) return null;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
};

const parseBcvFromBlock = (value: string) => {
  const match = value.match(/bs\s*\/?\s*usd\s*([0-9.,]+)/i);
  if (!match) return null;
  const raw = match[1].replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOcrEntries = (value: string) => {
  const normalized = normalizeOcrText(value);
  const segments = normalized.split(/fecha\s*valor/gi);
  if (segments.length <= 1) return [] as Array<{ date: string; bcv: number }>;

  const results: Array<{ date: string; bcv: number }> = [];
  segments.slice(1).forEach((segment) => {
    const date = parseSpanishDate(segment);
    const bcv = parseBcvFromBlock(segment);
    if (date && bcv) {
      results.push({ date, bcv });
    }
  });

  const unique = new Map<string, number>();
  results.forEach((item) => {
    if (!unique.has(item.date)) unique.set(item.date, item.bcv);
  });

  return Array.from(unique.entries()).map(([date, bcv]) => ({ date, bcv }));
};

const parseOcrEntriesFromPairs = (value: string) => {
  const normalized = normalizeOcrText(value);
  const regex = /fecha\s*valor[^\d]*([\d]{1,2}\s*de\s*[a-z]+\s*de\s*\d{4})[\s\S]*?bs\s*\/?\s*usd\s*([0-9.,]+)/gi;
  const results: Array<{ date: string; bcv: number }> = [];
  for (const match of normalized.matchAll(regex)) {
    const date = parseSpanishDate(match[1] || '');
    const bcvRaw = (match[2] || '').replace(',', '.');
    const bcv = Number(bcvRaw);
    if (date && Number.isFinite(bcv)) {
      results.push({ date, bcv });
    }
  }
  return results;
};

const RateHistoryWall: React.FC<RateHistoryWallProps> = ({ businessId, currentUser }) => {
  const { userProfile } = useAuth();
  const { success, error, warning } = useToast();
  const [entries, setEntries] = useState<RateEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [manualBcv, setManualBcv] = useState('');
  const [manualGrupo, setManualGrupo] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDrafts, setOcrDrafts] = useState<Array<{ date: string; bcv: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedBusinessId = (businessId || userProfile?.businessId || '').trim();

  useEffect(() => {
    if (!resolvedBusinessId) {
      setEntries([]);
      return;
    }
    const q = query(
      collection(db, 'businesses', resolvedBusinessId, 'exchange_rates_history'),
      orderBy('date', 'desc'),
      limit(60)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          date: data.date || docSnap.id,
          bcv: Number(data.bcv) || 0,
          parallel: Number(data.parallel ?? data.grupo) || 0,
          status: (data.status as RateEntry['status']) || 'pending',
          createdBy: data.createdBy,
          notes: data.notes,
          reactions: Array.isArray(data.reactions) ? data.reactions : [],
          timestamp: data.timestamp,
        } as RateEntry;
      });
      next.sort((a, b) => {
        const dateCompare = String(b.date).localeCompare(String(a.date));
        if (dateCompare !== 0) return dateCompare;
        const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setEntries(next);
    });

    return () => unsubscribe();
  }, [resolvedBusinessId]);

  const handleReaction = async (entry: RateEntry, emoji: string) => {
    if (!resolvedBusinessId || !currentUser?.uid) return;
    const nextStatus: RateEntry['status'] = emoji === '✅' ? 'verified' : 'rejected';
    await updateDoc(
      doc(db, 'businesses', resolvedBusinessId, 'exchange_rates_history', entry.id),
      { status: nextStatus }
    );
  };

  const handleDelete = async (entry: RateEntry) => {
    if (!resolvedBusinessId) return;
    const confirmed = window.confirm('Eliminar esta tasa?');
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'businesses', resolvedBusinessId, 'exchange_rates_history', entry.id));
    } catch (error) {
      console.error('No se pudo eliminar la tasa', error);
      error('No se pudo eliminar la tasa. Revisa permisos.');
    }
  };

  const handlePublish = async () => {
    if (!resolvedBusinessId) {
      warning('No hay un espacio de trabajo activo.');
      return;
    }
    const bcv = Number(String(manualBcv).replace(',', '.'));
    const grupo = Number(String(manualGrupo).replace(',', '.'));
    if (!bcv || !grupo) {
      warning('Ingresa BCV y Grupo válidos.');
      return;
    }
    setIsPublishing(true);
    try {
      await createExchangeRateEntry(
        resolvedBusinessId,
        manualDate,
        { bcv, grupo, lastUpdated: manualDate },
        currentUser?.uid
          ? {
              uid: currentUser.uid,
              displayName: currentUser.displayName || null,
              photoURL: currentUser.photoURL || null,
            }
          : undefined
      );
      setManualBcv('');
      setManualGrupo('');
    } catch (error) {
      console.error('No se pudo publicar la tasa', error);
      error('No se pudo publicar la tasa. Revisa la conexión y permisos.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishBatch = async () => {
    if (!resolvedBusinessId) {
      warning('No hay un espacio de trabajo activo.');
      return;
    }
    const grupo = Number(String(manualGrupo).replace(',', '.'));
    if (!grupo) {
      warning('Ingresa una tasa Grupo válida para publicar en lote.');
      return;
    }
    if (ocrDrafts.length === 0) return;
    setIsPublishing(true);
    try {
      for (const draft of ocrDrafts) {
        await createExchangeRateEntry(
          resolvedBusinessId,
          draft.date,
          { bcv: draft.bcv, grupo, lastUpdated: draft.date },
          currentUser?.uid
            ? {
                uid: currentUser.uid,
                displayName: currentUser.displayName || null,
                photoURL: currentUser.photoURL || null,
              }
            : undefined
        );
      }
      setOcrDrafts([]);
    } catch (error) {
      console.error('No se pudo publicar el lote de tasas', error);
      error('No se pudo publicar el lote. Revisa la conexión y permisos.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleScanImage = async (file: File) => {
    if (file.type === 'application/pdf') {
      warning('Sube una imagen JPG/PNG. Los PDF no son compatibles con el OCR.');
      return;
    }
    setOcrLoading(true);
    try {
      const mod = await import('tesseract.js');
      const result = await mod.recognize(file, 'spa+eng');
      const text = result?.data?.text || '';
      const batch = [...parseOcrEntries(text), ...parseOcrEntriesFromPairs(text)];
      const deduped = new Map<string, number>();
      batch.forEach((item) => {
        if (!deduped.has(item.date)) deduped.set(item.date, item.bcv);
      });
      const finalBatch = Array.from(deduped.entries()).map(([date, bcv]) => ({ date, bcv }));
      if (finalBatch.length > 0) {
        setOcrDrafts(finalBatch);
        setManualBcv(String(finalBatch[0].bcv));
        setManualDate(finalBatch[0].date);
      } else {
        warning('No se pudieron detectar tasas en la imagen.');
      }
    } catch (error) {
      console.warn('OCR failed', error);
      error('No se pudo leer la imagen.');
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const summary = useMemo(() => {
    if (entries.length === 0) return null;
    const latest = entries[0];
    return {
      bcv: latest.bcv,
      parallel: latest.parallel,
      date: latest.date,
    };
  }, [entries]);

  if (!resolvedBusinessId) {
    return (
      <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-sm text-slate-400">
        Primero configura tu espacio de trabajo para ver el historial de tasas.
      </div>
    );
  }

  const inp = "mt-2 w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10 transition-all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">Rate Wall</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-white/40">
            Historial colaborativo de tasas
          </p>
        </div>
        {summary && (
          <div className="inline-flex items-center gap-6 px-5 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            <div>
              <div className="text-[9px] uppercase font-bold text-white/40">BCV</div>
              <div className="text-lg font-black text-white">{summary.bcv}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase font-bold text-white/40">Grupo</div>
              <div className="text-lg font-black text-white">{summary.parallel}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase font-bold text-white/40">Fecha</div>
              <div className="text-sm font-bold text-white/60">{summary.date}</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-white/50">
              Panel de Control
            </h3>
            <p className="text-xs text-white/30 font-semibold mt-0.5">
              Publica una tasa manual o carga una imagen para autocompletar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleScanImage(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-xs font-black uppercase transition-colors"
              disabled={ocrLoading}
            >
              {ocrLoading ? 'Leyendo...' : '📸 Escanear Imagen'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
              Tasa BCV
            </label>
            <input
              type="number"
              step="0.01"
              className={inp}
              value={manualBcv}
              onChange={(event) => setManualBcv(event.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
              Tasa Grupo
            </label>
            <input
              type="number"
              step="0.01"
              className={inp}
              value={manualGrupo}
              onChange={(event) => setManualGrupo(event.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
              Fecha
            </label>
            <input
              type="date"
              className={inp}
              value={manualDate}
              onChange={(event) => setManualDate(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePublish}
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase transition-colors shadow-lg shadow-emerald-500/20"
              disabled={isPublishing}
            >
              {isPublishing ? 'Publicando...' : 'Publicar Tasa'}
            </button>
          </div>
        </div>
        {ocrDrafts.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  OCR Detectado
                </div>
                <p className="text-xs text-white/50 font-semibold mt-0.5">
                  {ocrDrafts.length} tasas encontradas. Se usara la tasa Grupo manual.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOcrDrafts([])}
                  className="px-3 py-2 rounded-lg text-xs font-black uppercase text-white/40 hover:text-white/60 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={handlePublishBatch}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase transition-colors"
                  disabled={isPublishing}
                >
                  Publicar {ocrDrafts.length} tasas
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-semibold text-white/60">
              {ocrDrafts.map((draft) => (
                <div
                  key={draft.date}
                  className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 border border-white/[0.07]"
                >
                  <span>{draft.date}</span>
                  <span className="font-black text-white">{draft.bcv}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-sm text-white/40">
          No hay tasas registradas aun.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const creatorName = entry.createdBy?.displayName || 'Sin autor';
            const noteOpen = Boolean(expandedNotes[entry.id]);
            const isVerified = entry.status === 'verified';
            const isRejected = entry.status === 'rejected';
            const verifyCount = isVerified ? 1 : 0;
            const rejectCount = isRejected ? 1 : 0;

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
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {entry.createdBy?.photoURL ? (
                      <img
                        src={entry.createdBy.photoURL}
                        alt={creatorName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 text-white/60 flex items-center justify-center text-xs font-black">
                        {getInitials(creatorName)}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-black text-white">{creatorName}</div>
                      <div className="text-[10px] font-bold text-white/40">
                        {entry.date}
                        {entry.createdBy?.timestamp &&
                          ` • ${formatTimestamp(entry.createdBy.timestamp)}`}
                      </div>
                      <div className="text-[10px] font-bold text-white/40">
                        Hora: {formatTimeShort(entry.timestamp || entry.createdBy?.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-[9px] uppercase font-bold text-white/40">BCV</div>
                      <div className="text-lg font-black text-white">{entry.bcv}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase font-bold text-white/40">Grupo</div>
                      <div className="text-lg font-black text-white">{entry.parallel}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className="text-white/20 hover:text-rose-400 text-sm transition-colors"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>

                <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReaction(entry, '✅')}
                      className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${
                        isVerified
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      ✅ Verificar {verifyCount > 0 ? `(${verifyCount})` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReaction(entry, '❌')}
                      className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${
                        isRejected ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                      }`}
                    >
                      ❌ Rechazar {rejectCount > 0 ? `(${rejectCount})` : ''}
                    </button>
                  </div>
                  {entry.notes && entry.notes.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNotes((prev) => ({
                          ...prev,
                          [entry.id]: !prev[entry.id],
                        }))
                      }
                      className="text-xs font-bold text-white/30 hover:text-white/60 transition-colors"
                    >
                      {noteOpen ? 'Ocultar nota' : 'Ver nota'}
                    </button>
                  )}
                </div>

                {noteOpen && entry.notes && (
                  <div className="mt-3 p-3 rounded-xl bg-white/[0.05] text-xs text-white/50 font-semibold">
                    {entry.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RateHistoryWall;
