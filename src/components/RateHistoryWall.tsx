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
import { useRates } from '../context/RatesContext';
import { createExchangeRateEntry } from '../firebase/api';
import { useToast } from '../context/ToastContext';
import { Globe, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Wifi, Info, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { CustomRate } from '../../types';

interface RateHistoryWallProps {
  businessId?: string | null;
  currentUser?: {
    uid: string;
    displayName?: string | null;
    photoURL?: string | null;
  };
  customRates?: CustomRate[];
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
  customRates?: Record<string, number>;
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

// ── BCV PREVIEW STATE ─────────────────────────────────────────────────────────
type BcvPreview = {
  rate: number;
  fechaActualizacion: string;
};

const RateHistoryWall: React.FC<RateHistoryWallProps> = ({ businessId, currentUser: currentUserProp, customRates = [] }) => {
  const { userProfile } = useAuth();
  // Prefer the passed currentUser prop, fall back to the auth profile
  const currentUser = currentUserProp ?? (userProfile?.uid ? { uid: userProfile.uid, displayName: userProfile.displayName ?? null, photoURL: userProfile.photoURL ?? null } : undefined);
  const { success, error, warning } = useToast();
  const { tasaBCV, updateRates, updateCustomRates } = useRates();
  const [entries, setEntries] = useState<RateEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [customRateInputs, setCustomRateInputs] = useState<Record<string, string>>({});
  const [manualBcv, setManualBcv] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDrafts, setOcrDrafts] = useState<Array<{ date: string; bcv: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreview, setCsvPreview] = useState<Array<{ date: string; bcv: number }>>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const resolvedBusinessId = (businessId || userProfile?.businessId || '').trim();
  const RATES_PER_PAGE = 10;
  const [ratePage, setRatePage] = useState(1);
  const pagedEntries = useMemo(() => {
    const start = (ratePage - 1) * RATES_PER_PAGE;
    return entries.slice(start, start + RATES_PER_PAGE);
  }, [entries, ratePage]);
  const totalRatePages = Math.max(1, Math.ceil(entries.length / RATES_PER_PAGE));

  // ── BCV FETCH ──────────────────────────────────────────────────────────────
  const [fetchingBCV, setFetchingBCV] = useState(false);
  const [bcvPreview, setBcvPreview] = useState<BcvPreview | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleFetchBCV = async () => {
    setFetchingBCV(true);
    setFetchError(null);
    setBcvPreview(null);
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // API returns an array — find the BCV/oficial entry
      const list = Array.isArray(data) ? data : [data];
      const entry = list.find((d: any) =>
        d?.fuente === 'oficial' || d?.fuente === 'bcv' || d?.nombre?.toLowerCase().includes('oficial') || d?.nombre?.toLowerCase().includes('bcv')
      ) ?? list[0];
      const rate = Number(entry?.venta ?? entry?.promedio ?? entry?.precio ?? entry?.compra);
      if (!rate || isNaN(rate)) throw new Error('Formato inesperado');
      setBcvPreview({
        rate,
        fechaActualizacion: entry?.fechaActualizacion || new Date().toISOString(),
      });
    } catch {
      setFetchError('No se pudo obtener la tasa. Verifica tu conexión a internet.');
    } finally {
      setFetchingBCV(false);
    }
  };

  const handleConfirmBCV = async () => {
    if (!bcvPreview || !resolvedBusinessId) return;
    setIsPublishing(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Actualizar businessConfigs → se propaga en tiempo real a todos los dispositivos
      await updateRates({ tasaBCV: bcvPreview.rate });

      // 2. Guardar en historial
      await createExchangeRateEntry(
        resolvedBusinessId,
        today,
        { bcv: bcvPreview.rate, grupo: 0, divisa: 0, lastUpdated: today },
        currentUser?.uid
          ? { uid: currentUser.uid, displayName: currentUser.displayName || null, photoURL: currentUser.photoURL || null }
          : undefined,
        `Obtenida automáticamente desde BCV.ORG.VE — ${new Date(bcvPreview.fechaActualizacion).toLocaleString('es-VE')}`,
      );

      // 3. Pre-llenar formulario manual
      setManualBcv(bcvPreview.rate.toFixed(4));
      setManualDate(today);
      setBcvPreview(null);
      success(`Tasa BCV ${bcvPreview.rate.toFixed(4)} Bs/$ aplicada en todos los dispositivos.`);
    } catch {
      error('No se pudo aplicar la tasa. Revisa la conexión.');
    } finally {
      setIsPublishing(false);
    }
  };

  useEffect(() => {
    if (!resolvedBusinessId) {
      setEntries([]);
      return;
    }
    const q = query(
      collection(db, 'businesses', resolvedBusinessId, 'exchange_rates_history'),
      orderBy('date', 'desc'),
      limit(200)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          date: data.date || docSnap.id,
          bcv: Number(data.bcv) || 0,
          customRates: data.customRates && typeof data.customRates === 'object' ? data.customRates : undefined,
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
    if (!bcv) {
      warning('Ingresa una tasa BCV válida.');
      return;
    }
    setIsPublishing(true);
    try {
      // Build custom rates map from form inputs
      const customRatesMap: Record<string, number> = {};
      customRates.forEach(cr => {
        const v = Number((customRateInputs[cr.id] ?? '').replace(',', '.'));
        if (v > 0) customRatesMap[cr.id] = v;
      });

      const createdByPayload = currentUser?.uid
        ? { uid: currentUser.uid, displayName: currentUser.displayName || null, photoURL: currentUser.photoURL || null }
        : undefined;

      // 1. Guardar en historial con todos los rates
      await createExchangeRateEntry(
        resolvedBusinessId,
        manualDate,
        { bcv, grupo: 0, divisa: 0, lastUpdated: manualDate },
        createdByPayload,
        undefined,
        customRatesMap
      );

      // 2. Actualizar tasa BCV activa
      await updateRates({ tasaBCV: bcv });

      // 3. Actualizar valores de custom rates si se ingresaron
      if (Object.keys(customRatesMap).length > 0) {
        const updatedCR = customRates.map(cr => ({
          ...cr,
          value: customRatesMap[cr.id] ?? cr.value,
        }));
        await updateCustomRates(updatedCR);
      }

      const customSummary = Object.entries(customRatesMap)
        .map(([id, v]) => `${id}: ${v.toFixed(2)}`)
        .join(' · ');
      success(`Tasas publicadas: BCV ${bcv.toFixed(4)}${customSummary ? ' · ' + customSummary : ''}`);
      setManualBcv('');
      setCustomRateInputs({});
    } catch (err) {
      console.error('No se pudo publicar la tasa', err);
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
    if (ocrDrafts.length === 0) return;
    setIsPublishing(true);
    try {
      const sorted = [...ocrDrafts].sort((a, b) => b.date.localeCompare(a.date));
      for (const draft of sorted) {
        await createExchangeRateEntry(
          resolvedBusinessId,
          draft.date,
          { bcv: draft.bcv, grupo: 0, divisa: 0, lastUpdated: draft.date },
          currentUser?.uid
            ? {
                uid: currentUser.uid,
                displayName: currentUser.displayName || null,
                photoURL: currentUser.photoURL || null,
              }
            : undefined
        );
      }
      // Activar la tasa más reciente del lote
      await updateRates({ tasaBCV: sorted[0].bcv });
      setOcrDrafts([]);
    } catch (error) {
      console.error('No se pudo publicar el lote de tasas', error);
      error('No se pudo publicar el lote. Revisa la conexión y permisos.');
    } finally {
      setIsPublishing(false);
    }
  };

  const normalizeDate = (raw: string): string | null => {
    const trimmed = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
  };

  const handleImportCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) { warning('El archivo CSV está vacío.'); return; }

      // Detect delimiter (comma or semicolon)
      const delim = lines[0].includes(';') ? ';' : ',';

      // Detect header row
      const header = lines[0].toLowerCase();
      const hasFechaCol = header.includes('fecha') || header.includes('date');
      const hasBcvCol = header.includes('bcv') || header.includes('tasa');
      const dataLines = (hasFechaCol || hasBcvCol) ? lines.slice(1) : lines;

      // Detect column indices from header
      let fechaIdx = 0;
      let bcvIdx = 1;
      if (hasFechaCol || hasBcvCol) {
        const cols = lines[0].split(delim).map((c) => c.toLowerCase().trim());
        const fi = cols.findIndex((c) => c.includes('fecha') || c.includes('date'));
        const bi = cols.findIndex((c) => c.includes('bcv') || c.includes('tasa'));
        if (fi !== -1) fechaIdx = fi;
        if (bi !== -1) bcvIdx = bi;
      }

      const parsed: Array<{ date: string; bcv: number }> = [];
      for (const line of dataLines) {
        const cols = line.split(delim);
        const rawDate = cols[fechaIdx]?.replace(/"/g, '').trim() ?? '';
        const rawBcv = cols[bcvIdx]?.replace(/"/g, '').replace(',', '.').trim() ?? '';
        const date = normalizeDate(rawDate);
        const bcv = Number(rawBcv);
        if (date && Number.isFinite(bcv) && bcv > 0) parsed.push({ date, bcv });
      }

      // Deduplicate — keep first occurrence per date
      const deduped = new Map<string, number>();
      parsed.forEach(({ date, bcv }) => { if (!deduped.has(date)) deduped.set(date, bcv); });
      const final = Array.from(deduped.entries())
        .map(([date, bcv]) => ({ date, bcv }))
        .sort((a, b) => b.date.localeCompare(a.date));

      if (final.length === 0) {
        warning('No se encontraron filas válidas. Verifica el formato: fecha,bcv');
        return;
      }
      setCsvPreview(final);
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePublishCsv = async () => {
    if (!resolvedBusinessId || csvPreview.length === 0) return;
    setCsvImporting(true);
    let imported = 0;
    // csvPreview ya viene ordenado desc por fecha
    try {
      for (const row of csvPreview) {
        await createExchangeRateEntry(
          resolvedBusinessId,
          row.date,
          { bcv: row.bcv, grupo: 0, divisa: 0, lastUpdated: row.date },
          currentUser?.uid
            ? { uid: currentUser.uid, displayName: currentUser.displayName || null, photoURL: currentUser.photoURL || null }
            : undefined,
          'Importado desde CSV'
        );
        imported++;
      }
      // Activar la tasa más reciente del lote como tasa activa
      await updateRates({ tasaBCV: csvPreview[0].bcv });
      success(`${imported} tasas importadas. Tasa activa: ${csvPreview[0].bcv.toFixed(4)} Bs/$`);
      setCsvPreview([]);
    } catch {
      error(`Se importaron ${imported} de ${csvPreview.length}. Error al continuar.`);
    } finally {
      setCsvImporting(false);
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

  const inp = "mt-1.5 w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all";

  // Color palette for custom rate chips in cards
  const RATE_COLORS = [
    { bg: 'bg-violet-500/[0.12]', border: 'border-violet-500/25', text: 'text-violet-300' },
    { bg: 'bg-sky-500/[0.12]', border: 'border-sky-500/25', text: 'text-sky-300' },
    { bg: 'bg-amber-500/[0.12]', border: 'border-amber-500/25', text: 'text-amber-300' },
    { bg: 'bg-teal-500/[0.12]', border: 'border-teal-500/25', text: 'text-teal-300' },
    { bg: 'bg-pink-500/[0.12]', border: 'border-pink-500/25', text: 'text-pink-300' },
  ];

  return (
    <div className="space-y-5">
      {/* ─── HEADER: título + chips tasas activas en vivo ─────────────────── */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-violet-600/20 border border-indigo-500/25 flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white leading-tight">Tasas Cambiarias</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Historial colaborativo · actualización en tiempo real
              </p>
            </div>
          </div>

          {/* Live rate chips */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600/20 to-violet-600/10 border border-indigo-500/25">
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400/70">BCV</span>
              <span className="text-base font-black text-white">{tasaBCV > 0 ? tasaBCV.toFixed(4) : '—'}</span>
            </div>
            {customRates.filter(cr => cr.value > 0).map((cr, i) => {
              const col = RATE_COLORS[i % RATE_COLORS.length];
              return (
                <div key={cr.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${col.bg} border ${col.border}`}>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${col.text} opacity-70`}>{cr.name}</span>
                  <span className={`text-base font-black ${col.text}`}>{cr.value.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-white/50">
                Panel de Control
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/40 hover:text-white/70 text-[10px] font-black uppercase tracking-wider transition-colors"
                title="Ver instrucciones"
              >
                <Info size={10} />
                {showHelp ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                Ayuda
              </button>
            </div>
            <p className="text-xs text-white/30 font-semibold mt-0.5">
              Publica una tasa manual, búscala en BCV, escanea una imagen o importa un CSV histórico.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* ── BUSCAR TASA BCV ── */}
            <button
              type="button"
              onClick={handleFetchBCV}
              disabled={fetchingBCV}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600/80 to-violet-600/80 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {fetchingBCV
                ? <Loader2 size={13} className="animate-spin" />
                : <Globe size={13} />}
              {fetchingBCV ? 'Buscando...' : 'Buscar Tasa BCV'}
            </button>

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
            <input
              type="file"
              accept=".csv,.txt"
              ref={csvInputRef}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImportCsv(file);
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
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-xs font-black uppercase transition-colors"
            >
              📥 Importar CSV
            </button>
          </div>
        </div>

        {/* ── PANEL DE AYUDA ── */}
        {showHelp && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* BCV Auto */}
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <Globe size={13} className="text-indigo-400" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Buscar Tasa BCV</span>
              </div>
              <ol className="space-y-1.5">
                {['Haz clic en "Buscar Tasa BCV".', 'El sistema consulta la fuente oficial BCV en tiempo real.', 'Revisa el valor mostrado y confirma con "Aplicar".', 'La tasa se actualiza al instante en todos los dispositivos conectados.'].map((s, i) => (
                  <li key={i} className="flex gap-2 text-[10px] text-white/40 font-semibold leading-tight">
                    <span className="text-indigo-400/60 font-black shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Manual */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <span className="text-emerald-400 text-sm leading-none">✏️</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Registro Manual</span>
              </div>
              <ol className="space-y-1.5">
                {['Ingresa la Tasa BCV y la Tasa Grupo en los campos.', 'Selecciona la fecha (hoy por defecto).', 'Haz clic en "Publicar Tasa".', 'La entrada queda registrada en el historial para revisión del equipo.'].map((s, i) => (
                  <li key={i} className="flex gap-2 text-[10px] text-white/40 font-semibold leading-tight">
                    <span className="text-emerald-400/60 font-black shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
            </div>

            {/* OCR */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <span className="text-amber-400 text-sm leading-none">📸</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Escanear Imagen</span>
              </div>
              <ol className="space-y-1.5">
                {['Haz clic en "Escanear Imagen".', 'Sube una captura JPG o PNG del sitio del BCV (no PDF).', 'El OCR detecta automáticamente las tasas y fechas.', 'Ingresa la Tasa Grupo manualmente, luego publica el lote.'].map((s, i) => (
                  <li key={i} className="flex gap-2 text-[10px] text-white/40 font-semibold leading-tight">
                    <span className="text-amber-400/60 font-black shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
            </div>

            {/* CSV */}
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-violet-400 text-sm leading-none">📥</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-violet-400">Importar CSV</span>
              </div>
              <ol className="space-y-1.5">
                {['Crea un archivo .csv con dos columnas: fecha y bcv.', 'Fechas en formato YYYY-MM-DD o DD/MM/YYYY.', 'Haz clic en "Importar CSV" y selecciona el archivo.', 'Revisa el preview y confirma. La Tasa Grupo quedará en 0.'].map((s, i) => (
                  <li key={i} className="flex gap-2 text-[10px] text-white/40 font-semibold leading-tight">
                    <span className="text-violet-400/60 font-black shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
              <div className="mt-2.5 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-wider mb-1">Ejemplo CSV</p>
                <pre className="text-[9px] text-violet-300/50 font-mono leading-relaxed">
{`fecha,bcv
2025-01-02,68.30
2025-01-03,68.51
2025-02-10,71.20`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR DE FETCH ── */}
        {fetchError && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
            <AlertTriangle size={14} className="shrink-0" />
            {fetchError}
            <button onClick={() => setFetchError(null)} className="ml-auto text-rose-400/60 hover:text-rose-400">✕</button>
          </div>
        )}

        {/* ── CONFIRMACIÓN DE TASA ENCONTRADA ── */}
        {bcvPreview && (
          <div className="mt-4 rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-600/[0.12] to-violet-600/[0.06] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <Wifi size={18} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-400/70 mb-0.5">
                    Tasa Encontrada · BCV Oficial
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-white tracking-tight">{bcvPreview.rate.toFixed(4)}</span>
                    <span className="text-sm font-black text-white/40">Bs / $</span>
                  </div>
                  <p className="text-[10px] font-bold text-white/30 mt-0.5">
                    Actualizado por BCV: {new Date(bcvPreview.fechaActualizacion).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBcvPreview(null)}
                className="text-white/20 hover:text-white/50 transition-colors shrink-0 text-lg leading-none mt-0.5"
              >✕</button>
            </div>

            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <RefreshCw size={11} className="text-indigo-400 shrink-0" />
              <p className="text-[10px] font-bold text-white/40">
                Al aplicar, esta tasa se actualizará en <span className="text-white/70">todos los dispositivos</span> conectados y quedará registrada en el historial.
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleConfirmBCV}
                disabled={isPublishing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50"
              >
                {isPublishing
                  ? <Loader2 size={13} className="animate-spin" />
                  : <CheckCircle2 size={13} />}
                {isPublishing ? 'Aplicando...' : `Aplicar ${bcvPreview.rate.toFixed(4)} Bs`}
              </button>
              <button
                type="button"
                onClick={() => setBcvPreview(null)}
                className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/50 text-xs font-black uppercase transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {/* ── FORMULARIO UNIFICADO ── */}
        <div className="mt-4 space-y-3">
          <div className={`grid gap-3 ${customRates.length > 0 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1fr_repeat(var(--cr-count,1),1fr)_1fr]' : 'grid-cols-1 sm:grid-cols-[1fr_1fr_auto]'}`}
            style={{ '--cr-count': customRates.length } as React.CSSProperties}>
            {/* Fecha */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Fecha</label>
              <input type="date" className={inp} value={manualDate} onChange={e => setManualDate(e.target.value)} />
            </div>
            {/* BCV */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70">BCV (oficial)</label>
              <input
                type="number" step="0.0001" className={inp}
                value={manualBcv}
                onChange={e => setManualBcv(e.target.value)}
                placeholder="0.0000"
              />
            </div>
            {/* Custom rate inputs (one per custom rate) */}
            {customRates.map((cr, i) => {
              const col = RATE_COLORS[i % RATE_COLORS.length];
              return (
                <div key={cr.id}>
                  <label className={`text-[10px] font-black uppercase tracking-widest ${col.text} opacity-80`}>{cr.name}</label>
                  <input
                    type="number" step="0.01"
                    className={inp}
                    value={customRateInputs[cr.id] ?? ''}
                    onChange={e => setCustomRateInputs(prev => ({ ...prev, [cr.id]: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {isPublishing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {isPublishing ? 'Publicando...' : customRates.length > 0 ? 'Publicar todas las tasas' : 'Publicar tasa BCV'}
          </button>
        </div>
        {csvPreview.length > 0 && (
          <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70">
                  CSV Listo para Importar
                </div>
                <p className="text-xs text-white/50 font-semibold mt-0.5">
                  {csvPreview.length} tasas detectadas. Revisa antes de publicar.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCsvPreview([])}
                  className="px-3 py-2 rounded-lg text-xs font-black uppercase text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePublishCsv}
                  disabled={csvImporting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase transition-colors disabled:opacity-50"
                >
                  {csvImporting ? <Loader2 size={11} className="animate-spin" /> : null}
                  {csvImporting ? 'Importando...' : `Publicar ${csvPreview.length} tasas`}
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs font-semibold text-white/60 max-h-48 overflow-y-auto">
              {csvPreview.map((row) => (
                <div
                  key={row.date}
                  className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 border border-white/[0.07]"
                >
                  <span className="text-[10px] text-white/50">{row.date}</span>
                  <span className="font-black text-white ml-2">{row.bcv}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-dashed border-white/[0.07] text-center">
          <p className="text-sm text-white/30 font-bold">No hay tasas registradas aún.</p>
          <p className="text-[10px] text-white/20 mt-1">Publica la primera tasa usando el formulario de arriba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedEntries.map((entry) => {
            const creatorName = entry.createdBy?.displayName || 'Sin autor';
            const noteOpen = Boolean(expandedNotes[entry.id]);
            const isVerified = entry.status === 'verified';
            const isRejected = entry.status === 'rejected';
            const entryCustomRates: [string, number][] = entry.customRates
              ? (Object.entries(entry.customRates) as [string, number][]).filter(([, v]) => v > 0)
              : [];

            return (
              <div
                key={entry.id}
                className={`relative rounded-2xl border overflow-hidden transition-all ${
                  isVerified
                    ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                    : isRejected
                    ? 'border-rose-500/25 bg-rose-500/[0.04]'
                    : 'border-white/[0.07] bg-white/[0.02]'
                }`}
              >
                {/* Colored left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl ${
                  isVerified ? 'bg-emerald-500' : isRejected ? 'bg-rose-500' : 'bg-indigo-500/40'
                }`} />

                <div className="pl-4 pr-4 pt-4 pb-3">
                  {/* Row 1: avatar + author + date + status badge + delete */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      {entry.createdBy?.photoURL ? (
                        <img src={entry.createdBy.photoURL} alt={creatorName}
                          className="w-9 h-9 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 ${
                          creatorName === 'Sin autor'
                            ? 'bg-slate-600/50'
                            : 'bg-gradient-to-br from-indigo-600 to-violet-600'
                        }`}>
                          {getInitials(creatorName)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-black text-white leading-tight">{creatorName}</div>
                        <div className="text-[10px] text-white/35 font-semibold mt-0.5">
                          {entry.date} · {formatTimeShort(entry.timestamp || entry.createdBy?.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isVerified && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                          ✓ Verificado
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/25 text-rose-400 text-[9px] font-black uppercase tracking-wider">
                          ✕ Rechazado
                        </span>
                      )}
                      <button
                        type="button" onClick={() => handleDelete(entry)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all text-sm"
                        title="Eliminar"
                      >🗑</button>
                    </div>
                  </div>

                  {/* Row 2: Rate values */}
                  <div className="flex flex-wrap items-end gap-4 mb-3">
                    {/* BCV — large */}
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-indigo-400/60 mb-0.5">BCV</div>
                      <div className="text-2xl font-black text-white leading-none">{entry.bcv.toFixed(4)}</div>
                      <div className="text-[9px] text-white/25 font-semibold">Bs / $</div>
                    </div>

                    {/* Custom rates — chips */}
                    {entryCustomRates.map(([rateId, value], idx) => {
                      const label = customRates.find(cr => cr.id === rateId)?.name ?? rateId;
                      const col = RATE_COLORS[idx % RATE_COLORS.length];
                      return (
                        <div key={rateId} className={`px-3.5 py-2 rounded-xl ${col.bg} border ${col.border}`}>
                          <div className={`text-[9px] font-black uppercase tracking-widest ${col.text} opacity-60 mb-0.5`}>{label}</div>
                          <div className={`text-lg font-black ${col.text}`}>{value.toFixed(2)}</div>
                          <div className={`text-[9px] ${col.text} opacity-40`}>Bs / $</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Row 3: actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button" onClick={() => handleReaction(entry, '✅')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                          isVerified
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                        }`}
                      >✅ Verificar</button>
                      <button
                        type="button" onClick={() => handleReaction(entry, '❌')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                          isRejected
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                            : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
                        }`}
                      >❌ Rechazar</button>
                    </div>
                    {entry.notes && entry.notes.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedNotes(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                        className="text-[10px] font-bold text-white/25 hover:text-white/50 transition-colors flex items-center gap-1"
                      >
                        {noteOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {noteOpen ? 'Ocultar nota' : 'Ver nota'}
                      </button>
                    )}
                  </div>

                  {noteOpen && entry.notes && (
                    <div className="mt-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/45 font-semibold italic">
                      {entry.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalRatePages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button
            onClick={() => setRatePage(p => Math.max(1, p - 1))}
            disabled={ratePage === 1}
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-xs font-bold disabled:opacity-30 hover:bg-white/[0.1] transition-all"
          >‹</button>
          <span className="text-xs text-white/40 font-bold">{ratePage} / {totalRatePages}</span>
          <button
            onClick={() => setRatePage(p => Math.min(totalRatePages, p + 1))}
            disabled={ratePage === totalRatePages}
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-xs font-bold disabled:opacity-30 hover:bg-white/[0.1] transition-all"
          >›</button>
        </div>
      )}
    </div>
  );
};

export default RateHistoryWall;
