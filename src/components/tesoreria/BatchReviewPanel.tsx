import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, RefreshCw,
  Loader2, Image as ImageIcon, ArrowLeft, Download, Plus,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, query, where, setDoc, getDocs, collectionGroup,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { findMatches, type DraftAbono } from '../../utils/bankReconciliation';
import { loadGlobalPool, type PooledRow } from '../../utils/globalBankPool';
import { claimReference } from '../../utils/reconciliationGuards';
import type { ReconciliationBatch, SessionAbonoCandidate } from '../../../types';
import type { SessionAbono } from '../conciliacion/ReconciliationReport';
import { exportBatchCSV } from '../../utils/batchExports';

interface BatchReviewPanelProps {
  businessId: string;
  batchId: string;
  currentUserId: string;
  currentUserName?: string;
  onBack: () => void;
}

interface AbonoEntry extends SessionAbono {
  monthKey: string;            // YYYY-MM al que pertenece (para path Firestore al actualizar)
}

export default function BatchReviewPanel({
  businessId, batchId, currentUserId, currentUserName, onBack,
}: BatchReviewPanelProps) {
  const [batch, setBatch] = useState<ReconciliationBatch | null>(null);
  const [abonos, setAbonos] = useState<AbonoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<PooledRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [openSection, setOpenSection] = useState<{ confirmed: boolean; review: boolean; notFound: boolean }>({
    confirmed: false, review: true, notFound: true,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const confirmados = useMemo(() => abonos.filter(a => a.status === 'confirmado'), [abonos]);
  const revisar = useMemo(() => abonos.filter(a => a.status === 'revisar'), [abonos]);
  const noEncontrado = useMemo(() => abonos.filter(a => a.status === 'no_encontrado'), [abonos]);

  const updateAbono = async (entry: AbonoEntry, patch: Partial<SessionAbono>) => {
    const ref = doc(db, `businesses/${businessId}/bankStatements/${entry.monthKey}/abonos/${entry.id}`);
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    await setDoc(ref, clean, { merge: true });
  };

  const handleConfirmCandidate = async (entry: AbonoEntry, cand: SessionAbonoCandidate) => {
    setError(null);
    setBusyId(entry.id);
    try {
      if (!cand.bankAccountId || !cand.rowRef) {
        setError('Candidato sin bankAccountId o referencia — no se puede claim atómico.');
        return;
      }
      const claim = await claimReference(db, businessId, {
        bankAccountId: cand.bankAccountId,
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
        setError(`Esta referencia ya fue conciliada por ${ex.claimedByName || ex.claimedByUid} el ${new Date(ex.claimedAt).toLocaleString()}`);
        // Remover del top-3 local del abono
        await updateAbono(entry, {
          candidateMatches: (entry.candidateMatches || []).filter(c => c.rowId !== cand.rowId),
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
      const candidateMatches: SessionAbonoCandidate[] = matches.slice(0, 3).map(m => ({
        rowId: m.row.rowId, bankAccountId: m.row.bankAccountId, accountAlias: m.row.accountAlias,
        bankName: m.row.bankName, monthKey: m.row.monthKey, score: m.score, confidence: m.confidence,
        rowDate: m.row.date, rowAmount: m.row.amount, rowRef: m.row.reference, rowDescription: m.row.description,
      }));
      const newStatus = candidateMatches.length ? 'revisar' : 'no_encontrado';
      await updateAbono(entry, { candidateMatches, status: newStatus as any });
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
        <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
          <Stat color="emerald" label="Confirmados" value={confirmados.length} />
          <Stat color="amber" label="Revisar" value={revisar.length} />
          <Stat color="rose" label="No encontrado" value={noEncontrado.length} />
          <Stat color="slate" label="Total" value={abonos.length} />
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
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-1">Fecha</th>
                <th className="text-left py-1">Monto</th>
                <th className="text-left py-1">Ref</th>
                <th className="text-left py-1">Cliente</th>
                <th className="text-left py-1">Cuenta matched</th>
              </tr>
            </thead>
            <tbody>
              {confirmados.map(a => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-1">{a.date}</td>
                  <td className="py-1 font-mono">${a.amount.toFixed(2)}</td>
                  <td className="py-1 font-mono">{a.reference || '—'}</td>
                  <td className="py-1 truncate max-w-[150px]">{a.clientName || a.cedula || '—'}</td>
                  <td className="py-1 text-slate-600 dark:text-slate-300">{a.matchBankName || a.matchAccountAlias || '—'}</td>
                </tr>
              ))}
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
}

const ReviewCard: React.FC<ReviewCardProps> = ({ entry, busy, onConfirm, onRejectAll, onRebuscar }) => {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-900/40">
      <div className="flex gap-3">
        {entry.receiptUrl ? (
          <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <img src={entry.receiptUrl} alt="receipt" className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-700" />
          </a>
        ) : (
          <div className="w-16 h-16 rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <ImageIcon size={20} className="text-slate-400" />
          </div>
        )}
        <div className="flex-1 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div><span className="text-slate-400">Monto:</span> <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">${entry.amount.toFixed(2)}</span></div>
            <div><span className="text-slate-400">Ref:</span> <span className="font-mono text-slate-700 dark:text-slate-200">{entry.reference || '—'}</span></div>
            <div><span className="text-slate-400">Fecha:</span> <span className="text-slate-700 dark:text-slate-200">{entry.date}</span></div>
            {entry.cedula && <div><span className="text-slate-400">Céd:</span> <span className="text-slate-700 dark:text-slate-200">{entry.cedula}</span></div>}
            {entry.clientName && <div className="col-span-2"><span className="text-slate-400">Nombre:</span> <span className="text-slate-700 dark:text-slate-200">{entry.clientName}</span></div>}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Candidatos top-3:</div>
        {(entry.candidateMatches || []).map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs">
            <div className="flex-1 truncate">
              <span className="text-slate-500 dark:text-slate-400">{c.bankName || c.accountAlias}</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="text-slate-700 dark:text-slate-200">{c.rowDate}</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-200">${c.rowAmount.toFixed(2)}</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="font-mono text-slate-500">{c.rowRef || '—'}</span>
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${badgeColor(c.confidence)}`}>{c.confidence} {c.score}</span>
            </div>
            <button
              onClick={() => onConfirm(c)}
              disabled={busy}
              className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        ))}
        {!(entry.candidateMatches || []).length && (
          <div className="text-[11px] text-slate-400">Sin candidatos vivos. Re-busca o rechaza.</div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onRebuscar} disabled={busy} className="text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 disabled:opacity-40">
          <RefreshCw size={10} /> Re-buscar
        </button>
        <button onClick={onRejectAll} disabled={busy} className="text-[11px] text-rose-600 hover:text-rose-700 disabled:opacity-40">
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
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-rose-50/30 dark:bg-rose-900/10 flex items-center justify-between">
      <div className="text-xs">
        <div className="font-mono text-slate-700 dark:text-slate-200">${entry.amount.toFixed(2)} · Ref {entry.reference || '—'} · {entry.date}</div>
        <div className="text-slate-500 dark:text-slate-400">{entry.clientName || entry.cedula || 'Sin datos del cliente'}</div>
      </div>
      <button onClick={onRebuscar} disabled={busy} className="text-xs px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded hover:bg-white dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-40">
        <RefreshCw size={12} /> Re-buscar
      </button>
    </div>
  );
};

function badgeColor(c: string): string {
  if (c === 'exact') return 'bg-emerald-100 text-emerald-700';
  if (c === 'high') return 'bg-emerald-50 text-emerald-700';
  if (c === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}
