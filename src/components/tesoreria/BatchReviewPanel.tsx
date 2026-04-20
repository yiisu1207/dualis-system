import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, RefreshCw,
  Loader2, Image as ImageIcon, ArrowLeft, Download, Plus, ExternalLink, Copy,
  Upload, Search, X,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, query, where, setDoc, getDoc, getDocs, collectionGroup, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { findMatches, type DraftAbono } from '../../utils/bankReconciliation';
import { loadGlobalPool, type PooledRow } from '../../utils/globalBankPool';
import { claimReference } from '../../utils/reconciliationGuards';
import { topCandidatesSnapshot, stripUndefined, appendImagesToBatch } from '../../utils/processReceiptBatch';
import type { ReconciliationBatch, SessionAbonoCandidate } from '../../../types';
import type { SessionAbono } from '../conciliacion/ReconciliationReport';
import { exportBatchCSV } from '../../utils/batchExports';

interface BatchReviewPanelProps {
  businessId: string;
  batchId: string;
  currentUserId: string;
  currentUserName?: string;
  highlightAbonoId?: string;
  onOpenAccountRow?: (accountAlias: string, rowId: string) => void;
  onBack: () => void;
}

interface AbonoEntry extends SessionAbono {
  monthKey: string;            // YYYY-MM al que pertenece (para path Firestore al actualizar)
}

export default function BatchReviewPanel({
  businessId, batchId, currentUserId, currentUserName, highlightAbonoId, onOpenAccountRow, onBack,
}: BatchReviewPanelProps) {
  const [batch, setBatch] = useState<ReconciliationBatch | null>(null);
  const [abonos, setAbonos] = useState<AbonoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<PooledRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [openSection, setOpenSection] = useState<{ confirmed: boolean; review: boolean; notFound: boolean; duplicates: boolean }>({
    confirmed: false, review: true, notFound: true, duplicates: false,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [appending, setAppending] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Cargar batch
  useEffect(() => {
    if (!businessId || !batchId) return;
    const ref = doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setBatch({ id: snap.id, ...(snap.data() as any) });
    });
    return () => unsub();
  }, [businessId, batchId]);

  // Cargar abonos del batch (collectionGroup query)
  // Skip si el batch existe pero stats.total === 0 (lote vacío — sin OCR exitoso)
  useEffect(() => {
    if (!businessId || !batchId) return;
    if (batch && (batch.stats?.total ?? 0) === 0) {
      setAbonos([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const q = query(collectionGroup(db, 'abonos'), where('batchId', '==', batchId));
    const unsub = onSnapshot(q, (snap) => {
      const list: AbonoEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as SessionAbono;
        // Path: businesses/{bid}/bankStatements/{monthKey}/abonos/{id} → monthKey = parent.parent.id
        const monthKey = d.ref.parent.parent?.id || '';
        list.push({ ...data, id: d.id, monthKey });
      });
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setAbonos(list);
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error('[BatchReview] abonos query error', err);
      setLoading(false);
      const raw = err?.message || '';
      if (/index is not ready yet|requires a COLLECTION_GROUP/i.test(raw)) {
        setError('Firestore aún está construyendo el índice (puede tardar 1–5 min después del primer despliegue). Recarga en un minuto.');
      } else {
        setError('Error cargando abonos del lote: ' + raw);
      }
    });
    return () => unsub();
  }, [businessId, batchId, batch?.stats?.total]);

  // Cargar pool global (lazy, on-demand para acciones)
  const ensurePool = async (): Promise<PooledRow[]> => {
    if (pool.length) return pool;
    setPoolLoading(true);
    try {
      const p = await loadGlobalPool(db, businessId, {
        periodFrom: batch?.periodFrom,
        periodTo: batch?.periodTo,
        accountIds: batch?.accountIds,
        excludeUsed: true,
      });
      setPool(p);
      return p;
    } finally {
      setPoolLoading(false);
    }
  };

  const filteredAbonos = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const tokens = norm(itemQuery).split(/\s+/).filter(Boolean);
    if (!tokens.length) return abonos;
    return abonos.filter(a => {
      const hay = norm([
        a.reference || '',
        a.clientName || '',
        a.cedula || '',
        a.phone || '',
        a.date || '',
        String(a.amount ?? ''),
        a.matchAccountAlias || '',
        a.matchBankName || '',
        a.note || '',
      ].join(' '));
      return tokens.every(t => hay.includes(t));
    });
  }, [abonos, itemQuery]);

  const confirmados = useMemo(() => filteredAbonos.filter(a => a.status === 'confirmado'), [filteredAbonos]);
  const revisar = useMemo(() => filteredAbonos.filter(a => a.status === 'revisar'), [filteredAbonos]);
  const noEncontrado = useMemo(() => filteredAbonos.filter(a => a.status === 'no_encontrado'), [filteredAbonos]);
  const duplicados = useMemo(() => filteredAbonos.filter(a => a.status === 'duplicado'), [filteredAbonos]);

  // Si se vino desde "Ver lote" de una fila usada del EdeC, abre la sección
  // correspondiente y scrollea al abono resaltado.
  useEffect(() => {
    if (!highlightAbonoId || !abonos.length) return;
    const target = abonos.find(a => a.id === highlightAbonoId);
    if (!target) return;
    setOpenSection(s => ({
      confirmed: target.status === 'confirmado' ? true : s.confirmed,
      review: target.status === 'revisar' ? true : s.review,
      notFound: target.status === 'no_encontrado' ? true : s.notFound,
      duplicates: target.status === 'duplicado' ? true : s.duplicates,
    }));
    const t = setTimeout(() => {
      if (highlightRef.current) highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [highlightAbonoId, abonos]);

  // Sincroniza batch.stats cuando cambian los abonos. Antes los contadores del batch
  // quedaban "congelados" al momento del procesamiento inicial: si confirmabas manualmente
  // un item "revisar", el detalle mostraba "3 confirmados" pero la lista seguía con "3 revisar".
  // Nota: stats siempre refleja el set completo de abonos, nunca el filtrado del buscador.
  useEffect(() => {
    if (!batch || loading) return;
    if (!abonos.length && (batch.stats?.total ?? 0) === 0) return;
    const manual = abonos.filter(a => !a.receiptUrl && a.status !== 'duplicado').length;
    const allConfirmed = abonos.filter(a => a.status === 'confirmado').length;
    const allReview = abonos.filter(a => a.status === 'revisar').length;
    const allNotFound = abonos.filter(a => a.status === 'no_encontrado').length;
    const allDuplicates = abonos.filter(a => a.status === 'duplicado').length;
    const nextStats = {
      total: abonos.length,
      confirmed: allConfirmed,
      review: allReview,
      notFound: allNotFound,
      manual,
      duplicates: allDuplicates,
    };
    const prev = batch.stats || { total: 0, confirmed: 0, review: 0, notFound: 0, manual: 0, duplicates: 0 };
    const same = (
      prev.total === nextStats.total &&
      prev.confirmed === nextStats.confirmed &&
      prev.review === nextStats.review &&
      prev.notFound === nextStats.notFound &&
      prev.manual === nextStats.manual &&
      (prev.duplicates ?? 0) === nextStats.duplicates
    );
    if (same) return;
    const ref = doc(db, `businesses/${businessId}/reconciliationBatches/${batchId}`);
    updateDoc(ref, { stats: nextStats }).catch(err => {
      console.warn('[BatchReview] stats sync failed', err);
    });
  }, [abonos, batch, loading, businessId, batchId]);

  const updateAbono = async (entry: AbonoEntry, patch: Partial<SessionAbono>) => {
    const ref = doc(db, `businesses/${businessId}/bankStatements/${entry.monthKey}/abonos/${entry.id}`);
    await setDoc(ref, stripUndefined(patch), { merge: true });
  };

  const handleConfirmCandidate = async (entry: AbonoEntry, cand: SessionAbonoCandidate) => {
    setError(null);
    setBusyId(entry.id);
    try {
      const identity = cand.bankAccountId || cand.accountAlias;
      if (!identity || !cand.rowRef) {
        setError('Candidato sin cuenta/alias o referencia — no se puede claim atómico.');
        return;
      }
      const claim = await claimReference(db, businessId, {
        bankAccountId: cand.bankAccountId,
        accountAlias: cand.accountAlias,
        reference: cand.rowRef,
        amount: cand.rowAmount,
        abonoId: entry.id,
        batchId,
        bankRowId: cand.rowId,
        monthKey: cand.monthKey,
        claimedByUid: currentUserId,
        claimedByName: currentUserName,
      });
      if (claim.ok === false) {
        const ex = claim.existing;
        // Zombie claim recovery directo: si la entrada existente es del propio abono.
        if (ex.abonoId === entry.id) {
          await updateAbono(entry, {
            status: 'confirmado',
            matchRowId: cand.rowId,
            matchAccountAlias: cand.accountAlias,
            matchBankAccountId: cand.bankAccountId,
            matchBankName: cand.bankName,
            matchMonthKey: cand.monthKey,
          });
          return;
        }
        // Steal orphan claim: si la entrada apunta a un abono que NO existe o que
        // NO está confirmado (típicamente quedó del bug viejo donde processReceiptBatch
        // generaba abonoIds distintos para claim vs. abono persistido), apropiarse
        // del fingerprint y completar el confirm.
        let canSteal = false;
        if (ex.monthKey && ex.abonoId) {
          try {
            const origRef = doc(db, `businesses/${businessId}/bankStatements/${ex.monthKey}/abonos/${ex.abonoId}`);
            const origSnap = await getDoc(origRef);
            if (!origSnap.exists()) {
              canSteal = true;
            } else {
              const origStatus = (origSnap.data() as any)?.status;
              if (origStatus !== 'confirmado') canSteal = true;
            }
          } catch {
            // Si no podemos verificar, no robamos — fail safe.
          }
        }
        if (canSteal) {
          // setDoc con merge sobrescribe abonoId/monthKey/batchId del usedReferences
          // — el fingerprint sigue siendo el mismo (cuenta+ref+monto), solo cambia
          // a quién pertenece la conciliación.
          const fpRef = doc(db, `businesses/${businessId}/usedReferences/${ex.fingerprint}`);
          await setDoc(fpRef, stripUndefined({
            abonoId: entry.id,
            batchId,
            bankRowId: cand.rowId,
            monthKey: cand.monthKey,
            claimedAt: new Date().toISOString(),
            claimedByUid: currentUserId,
            claimedByName: currentUserName,
          }), { merge: true });
          await updateAbono(entry, {
            status: 'confirmado',
            matchRowId: cand.rowId,
            matchAccountAlias: cand.accountAlias,
            matchBankAccountId: cand.bankAccountId,
            matchBankName: cand.bankName,
            matchMonthKey: cand.monthKey,
          });
          return;
        }
        const reason = `Esta referencia ya fue conciliada por ${ex.claimedByName || ex.claimedByUid} el ${new Date(ex.claimedAt).toLocaleString()}`;
        setError(reason);
        // Choque definitivo (no es zombie del propio abono ni claim huérfano
        // recuperable) → archivar como duplicado lógico enlazando al original.
        await updateAbono(entry, {
          status: 'duplicado',
          matchRowId: null,
          candidateMatches: [],
          reviewReason: reason,
          duplicateOfAbonoId: ex.abonoId,
          duplicateOfBatchId: ex.batchId,
          duplicateOfMonthKey: ex.monthKey,
        });
        return;
      }
      await updateAbono(entry, {
        status: 'confirmado',
        matchRowId: cand.rowId,
        matchAccountAlias: cand.accountAlias,
        matchBankAccountId: cand.bankAccountId,
        matchBankName: cand.bankName,
        matchMonthKey: cand.monthKey,
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectAll = async (entry: AbonoEntry) => {
    setBusyId(entry.id);
    try {
      await updateAbono(entry, { status: 'no_encontrado', matchRowId: null });
    } finally { setBusyId(null); }
  };

  // Para abonos viejos que quedaron en revisar tras chocar con un claim ajeno
  // (típico antes del fix automático): permite archivarlos manualmente.
  const handleArchiveDuplicate = async (entry: AbonoEntry) => {
    setBusyId(entry.id);
    try {
      await updateAbono(entry, {
        status: 'duplicado',
        matchRowId: null,
        candidateMatches: [],
        reviewReason: 'Archivado manualmente como duplicado.',
      });
    } finally { setBusyId(null); }
  };

  const handleRebuscar = async (entry: AbonoEntry) => {
    setBusyId(entry.id);
    try {
      const p = await ensurePool();
      const draft: DraftAbono = {
        amount: entry.amount, date: entry.date, reference: entry.reference,
        cedula: entry.cedula, phone: entry.phone, clientName: entry.clientName,
        operationType: entry.operationType,
      };
      const matches = findMatches(draft, p);
      const candidateMatches: SessionAbonoCandidate[] = topCandidatesSnapshot(matches);
      const newStatus = candidateMatches.length ? 'revisar' : 'no_encontrado';
      const reviewReason = candidateMatches.length
        ? `${candidateMatches.length} candidato(s). Top: ${candidateMatches[0].confidence} (score ${candidateMatches[0].score}).`
        : 'No se encontraron filas en el pool actual que coincidan con monto y fecha (±3 días).';
      await updateAbono(entry, { candidateMatches, status: newStatus as any, reviewReason });
    } finally { setBusyId(null); }
  };

  const handleConfirmAllHigh = async () => {
    const targets = revisar.filter(a => {
      const top = (a.candidateMatches || [])[0];
      return top && (top.confidence === 'high' || top.confidence === 'exact');
    });
    if (!targets.length) return;
    if (!confirm(`Confirmar automáticamente ${targets.length} candidatos top-1 con score high+?`)) return;
    for (const t of targets) {
      const top = t.candidateMatches![0];
      await handleConfirmCandidate(t, top);
    }
  };

  const handleExportCSV = () => {
    if (!batch) return;
    exportBatchCSV(batch, abonos);
  };

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_BATCH_ADD = 20;
  const ACCEPTED = /^image\/(png|jpeg|jpg|webp)$/i;

  const handleAppendFiles = useCallback(async (rawFiles: File[] | FileList) => {
    if (!batch || appending) return;
    const arr = Array.from(rawFiles || []);
    const valid: File[] = [];
    let rejected = 0;
    for (const f of arr) {
      if (!ACCEPTED.test(f.type) || f.size > MAX_BYTES) { rejected += 1; continue; }
      valid.push(f);
      if (valid.length >= MAX_BATCH_ADD) break;
    }
    if (!valid.length) {
      setError(rejected ? `Archivos rechazados (solo PNG/JPG/WEBP ≤ 5MB).` : 'No hay archivos válidos.');
      return;
    }
    setError(null);
    setAppending({ done: 0, total: valid.length });
    try {
      await appendImagesToBatch({
        db,
        businessId,
        batch,
        files: valid,
        currentUserId,
        currentUserName,
        onProgress: (done, total) => setAppending({ done, total }),
      });
      // Pool invalidada — forzar recarga en la próxima acción.
      setPool([]);
    } catch (e: any) {
      setError('Error agregando capturas: ' + (e?.message || String(e)));
    } finally {
      setAppending(null);
    }
  }, [batch, appending, businessId, currentUserId, currentUserName]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) handleAppendFiles(e.dataTransfer.files);
  }, [handleAppendFiles]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleAppendFiles(e.target.files);
    e.target.value = '';
  }, [handleAppendFiles]);

  if (!batch) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <Loader2 className="animate-spin mx-auto mb-2" size={20} />
        Cargando lote...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
          <ArrowLeft size={14} /> Volver a lotes
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirmAllHigh}
            disabled={!revisar.some(a => (a.candidateMatches || [])[0]?.confidence === 'high' || (a.candidateMatches || [])[0]?.confidence === 'exact')}
            className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          >
            Confirmar todos los high+
          </button>
          <button onClick={handleExportCSV} className="text-xs px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1">
            <Download size={12} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{batch.name}</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {batch.periodFrom && batch.periodTo ? `${batch.periodFrom} → ${batch.periodTo}` : 'Sin período definido'} · creado {new Date(batch.createdAt).toLocaleString()} por {batch.createdByName || batch.createdBy}
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${batch.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{batch.status}</span>
        </div>
        <div className="grid grid-cols-5 gap-2 mt-3 text-center text-xs">
          <Stat color="emerald" label="Confirmados" value={abonos.filter(a => a.status === 'confirmado').length} />
          <Stat color="amber" label="Revisar" value={abonos.filter(a => a.status === 'revisar').length} />
          <Stat color="rose" label="No encontrado" value={abonos.filter(a => a.status === 'no_encontrado').length} />
          <Stat color="violet" label="Duplicados" value={abonos.filter(a => a.status === 'duplicado').length} />
          <Stat color="slate" label="Total" value={abonos.length} />
        </div>

        {/* Buscador + DropZone para añadir capturas a este lote */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Buscar por monto, ref, cliente, cédula, fecha…"
              className="w-full pl-7 pr-7 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
            />
            {itemQuery && (
              <button
                onClick={() => setItemQuery('')}
                title="Limpiar"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {itemQuery.trim() && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {filteredAbonos.length}/{abonos.length} coinciden
            </div>
          )}
        </div>

        <div
          onDragEnter={(e) => { e.preventDefault(); if (!appending) setDragActive(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`mt-3 rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
            appending
              ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 opacity-70'
              : dragActive
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500'
                : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-300 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500'
          }`}
        >
          {appending ? (
            <div className="flex items-center justify-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
              <Loader2 size={14} className="animate-spin" />
              Agregando capturas al lote {appending.done}/{appending.total}…
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Upload size={12} className="text-slate-400" />
              <span>Arrastra capturas faltantes aquí para agregarlas a este lote</span>
              <label className="inline-block">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={onPickFiles}
                />
                <span className="text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">o haz clic</span>
              </label>
              <span className="text-slate-400">· máx 20, 5MB c/u</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700/50 text-rose-800 dark:text-rose-300 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading && <div className="text-center text-slate-500 dark:text-slate-400 py-4 text-sm"><Loader2 className="animate-spin inline mr-1" size={14} /> Cargando abonos…</div>}

      {/* Sección Revisar */}
      <Section
        title="Por revisar"
        count={revisar.length}
        color="amber"
        icon={<AlertTriangle size={16} />}
        open={openSection.review}
        onToggle={() => setOpenSection(s => ({ ...s, review: !s.review }))}
      >
        {revisar.map(a => (
          <ReviewCard
            key={a.id} entry={a} busy={busyId === a.id || poolLoading}
            onConfirm={(c) => handleConfirmCandidate(a, c)}
            onRejectAll={() => handleRejectAll(a)}
            onRebuscar={() => handleRebuscar(a)}
            onArchiveDuplicate={() => handleArchiveDuplicate(a)}
          />
        ))}
        {!revisar.length && <Empty msg="No hay items por revisar." />}
      </Section>

      {/* Sección No encontrado */}
      <Section
        title="No encontrado"
        count={noEncontrado.length}
        color="rose"
        icon={<XCircle size={16} />}
        open={openSection.notFound}
        onToggle={() => setOpenSection(s => ({ ...s, notFound: !s.notFound }))}
      >
        {noEncontrado.map(a => (
          <NotFoundCard
            key={a.id} entry={a} busy={busyId === a.id || poolLoading}
            onRebuscar={() => handleRebuscar(a)}
          />
        ))}
        {!noEncontrado.length && <Empty msg="Sin items sin match." />}
      </Section>

      {/* Sección Duplicados archivados */}
      <Section
        title="Duplicados archivados"
        count={duplicados.length}
        color="violet"
        icon={<Copy size={16} />}
        open={openSection.duplicates}
        onToggle={() => setOpenSection(s => ({ ...s, duplicates: !s.duplicates }))}
      >
        {duplicados.map(a => (
          <DuplicateCard
            key={a.id}
            entry={a}
            onOpenOriginal={onOpenAccountRow ? undefined : undefined}
          />
        ))}
        {!duplicados.length && <Empty msg="No hay capturas duplicadas en este lote." />}
      </Section>

      {/* Sección Confirmados */}
      <Section
        title="Confirmados"
        count={confirmados.length}
        color="emerald"
        icon={<CheckCircle2 size={16} />}
        open={openSection.confirmed}
        onToggle={() => setOpenSection(s => ({ ...s, confirmed: !s.confirmed }))}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-2">Fecha</th>
                <th className="text-left py-2">Monto</th>
                <th className="text-left py-2">Ref</th>
                <th className="text-left py-2">Cliente</th>
                <th className="text-left py-2">Cuenta matched</th>
              </tr>
            </thead>
            <tbody>
              {confirmados.map(a => {
                const isHl = a.id === highlightAbonoId;
                const canJump = !!(a.matchAccountAlias && a.matchRowId && onOpenAccountRow);
                return (
                  <tr
                    key={a.id}
                    ref={isHl ? highlightRef : undefined}
                    className={`border-t border-slate-100 dark:border-slate-700 transition-colors ${
                      isHl ? 'bg-amber-100 dark:bg-amber-900/30' : ''
                    }`}
                  >
                    <td className="py-2">{a.date}</td>
                    <td className="py-2 font-mono">${a.amount.toFixed(2)}</td>
                    <td className="py-2 font-mono">{a.reference || '—'}</td>
                    <td className="py-2 truncate max-w-[200px]">{a.clientName || a.cedula || '—'}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-300">
                      {canJump ? (
                        <button
                          type="button"
                          onClick={() => onOpenAccountRow!(a.matchAccountAlias!, a.matchRowId!)}
                          className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300 hover:underline"
                          title="Ver fila en el EdeC"
                        >
                          {a.matchBankName || a.matchAccountAlias} <ExternalLink size={12} />
                        </button>
                      ) : (
                        a.matchBankName || a.matchAccountAlias || '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!confirmados.length && <Empty msg="Aún no hay confirmados." />}
      </Section>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function Section({ title, count, color, icon, open, onToggle, children }: any) {
  const cls: Record<string, string> = {
    emerald: 'border-emerald-200 dark:border-emerald-700/50',
    amber: 'border-amber-200 dark:border-amber-700/50',
    rose: 'border-rose-200 dark:border-rose-700/50',
    violet: 'border-violet-200 dark:border-violet-700/50',
  };
  return (
    <div className={`bg-white dark:bg-slate-800 border ${cls[color] || 'border-slate-200 dark:border-slate-700'} rounded-xl overflow-hidden`}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          {icon} {title} <span className="text-slate-400 text-xs">({count})</span>
        </div>
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: number }) {
  const cls: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
    violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
    slate: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300',
  };
  return (
    <div className={`rounded-lg py-2 ${cls[color]}`}>
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-center text-xs text-slate-400 py-3">{msg}</div>;
}

interface ReviewCardProps {
  entry: AbonoEntry;
  busy: boolean;
  onConfirm: (c: SessionAbonoCandidate) => void;
  onRejectAll: () => void;
  onRebuscar: () => void;
  onArchiveDuplicate: () => void;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ entry, busy, onConfirm, onRejectAll, onRebuscar, onArchiveDuplicate }) => {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/40">
      <div className="flex gap-4">
        {entry.receiptUrl ? (
          <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img src={entry.receiptUrl} alt="receipt" className="w-24 h-24 object-cover rounded border border-slate-200 dark:border-slate-700" />
          </a>
        ) : (
          <div className="w-24 h-24 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <ImageIcon size={28} className="text-slate-400" />
          </div>
        )}
        <div className="flex-1 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <div><span className="text-slate-400">Monto:</span> <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">${entry.amount.toFixed(2)}</span></div>
            <div><span className="text-slate-400">Ref:</span> <span className="font-mono text-slate-700 dark:text-slate-200">{entry.reference || '—'}</span></div>
            <div><span className="text-slate-400">Fecha:</span> <span className="text-slate-700 dark:text-slate-200">{entry.date}</span></div>
            {entry.cedula && <div><span className="text-slate-400">Céd:</span> <span className="text-slate-700 dark:text-slate-200">{entry.cedula}</span></div>}
            {entry.clientName && <div className="col-span-2"><span className="text-slate-400">Nombre:</span> <span className="text-slate-700 dark:text-slate-200">{entry.clientName}</span></div>}
          </div>
        </div>
      </div>

      {entry.reviewReason && (
        <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-800 dark:text-amber-200">
          <span className="font-medium">Razón:</span> {entry.reviewReason}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Candidatos top-3:</div>
        {(entry.candidateMatches || []).map((c, i) => (
          <div key={i} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 truncate">
                <span className="text-slate-500 dark:text-slate-400">{c.bankName || c.accountAlias}</span>
                <span className="mx-1 text-slate-400">·</span>
                <span className="text-slate-700 dark:text-slate-200">{c.rowDate}</span>
                <span className="mx-1 text-slate-400">·</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">${c.rowAmount.toFixed(2)}</span>
                <span className="mx-1 text-slate-400">·</span>
                <span className="font-mono text-slate-500">{c.rowRef || '—'}</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${badgeColor(c.confidence)}`}>{c.confidence} {c.score}</span>
              </div>
              <button
                onClick={() => onConfirm(c)}
                disabled={busy}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : 'Confirmar'}
              </button>
            </div>
            {c.reasons && c.reasons.length > 0 && (
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {c.reasons.join(' · ')}
              </div>
            )}
          </div>
        ))}
        {!(entry.candidateMatches || []).length && (
          <div className="text-sm text-slate-400">Sin candidatos vivos. Re-busca o rechaza.</div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 mt-3">
        <button onClick={onRebuscar} disabled={busy} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 disabled:opacity-40">
          <RefreshCw size={12} /> Re-buscar
        </button>
        <button onClick={onArchiveDuplicate} disabled={busy} className="text-sm text-violet-600 hover:text-violet-700 inline-flex items-center gap-1 disabled:opacity-40" title="Mover a Duplicados archivados">
          <Copy size={12} /> Archivar como duplicado
        </button>
        <button onClick={onRejectAll} disabled={busy} className="text-sm text-rose-600 hover:text-rose-700 disabled:opacity-40">
          Rechazar todos
        </button>
      </div>
    </div>
  );
}

interface NotFoundCardProps {
  entry: AbonoEntry;
  busy: boolean;
  onRebuscar: () => void;
}

const NotFoundCard: React.FC<NotFoundCardProps> = ({ entry, busy, onRebuscar }) => {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-rose-50/30 dark:bg-rose-900/10 flex items-center justify-between gap-3">
      <div className="text-sm">
        <div className="font-mono text-slate-700 dark:text-slate-200">${entry.amount.toFixed(2)} · Ref {entry.reference || '—'} · {entry.date}</div>
        <div className="text-slate-500 dark:text-slate-400 mt-0.5">{entry.clientName || entry.cedula || 'Sin datos del cliente'}</div>
      </div>
      <button onClick={onRebuscar} disabled={busy} className="text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded hover:bg-white dark:hover:bg-slate-800 inline-flex items-center gap-1.5 disabled:opacity-40">
        <RefreshCw size={14} /> Re-buscar
      </button>
    </div>
  );
};

interface DuplicateCardProps {
  entry: AbonoEntry;
  onOpenOriginal?: () => void;
}

const DuplicateCard: React.FC<DuplicateCardProps> = ({ entry }) => {
  return (
    <div className="border border-violet-200 dark:border-violet-700/50 rounded-lg p-4 bg-violet-50/40 dark:bg-violet-900/10 flex items-start gap-3">
      <Copy size={18} className="text-violet-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="text-slate-700 dark:text-slate-200">
          Captura archivada como duplicado.
        </div>
        <div className="text-slate-500 dark:text-slate-400 mt-1">
          {entry.note || 'La misma imagen ya existe en otro abono del negocio.'}
        </div>
        {entry.duplicateOfAbonoId && (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
            Original: <span className="text-violet-700 dark:text-violet-300">{entry.duplicateOfAbonoId}</span>
            {entry.duplicateOfBatchId && <> · lote {entry.duplicateOfBatchId}</>}
            {entry.duplicateOfMonthKey && <> · período {entry.duplicateOfMonthKey}</>}
          </div>
        )}
      </div>
    </div>
  );
};

function badgeColor(c: string): string {
  if (c === 'exact') return 'bg-emerald-100 text-emerald-700';
  if (c === 'high') return 'bg-emerald-50 text-emerald-700';
  if (c === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}
