import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import {
  FileCheck,
  Loader2,
  Landmark,
  ShieldCheck,
  Layers,
  Upload,
  Camera,
  Plus,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import type { BankRow } from '../utils/bankReconciliation';
import { processReceiptBatch, type ImageBatchItem } from '../utils/processReceiptBatch';
import { isVerifiable, resolveVerificationStatus } from '../utils/movementHelpers';
import AccountChips, { type AccountChipData } from '../components/conciliacion/AccountChips';
import AccountRowsModal from '../components/conciliacion/AccountRowsModal';
import BankUploadModal from '../components/conciliacion/BankUploadModal';
import ReceiptDropZone from '../components/conciliacion/ReceiptDropZone';
import BatchNamePromptModal from '../components/conciliacion/BatchNamePromptModal';
import ManualVerificationTab from '../components/conciliacion/ManualVerificationTab';
import MultiBankUploadModal from '../components/tesoreria/MultiBankUploadModal';
import ReceiptBatchModal from '../components/tesoreria/ReceiptBatchModal';
import BatchReviewPanel from '../components/tesoreria/BatchReviewPanel';
import type { Movement, ReconciliationBatch } from '../../types';

interface ConciliacionProps {
  businessId: string;
  currentUserId: string;
  userRole: string;
  movements?: Movement[];
  currentUserName?: string;
  canVerify?: boolean;
}

interface BankStatementAccountDoc {
  accountAlias: string;
  accountLabel: string;
  bankCode?: string;
  bankName?: string;
  bankAccountId?: string;
  amountTolerancePct?: number;
  sourceFilename: string;
  fileUrl?: string;
  filePublicId?: string;
  uploadedAt: any;
  uploadedBy: string;
  rows: BankRow[];
  rowCount: number;
  totalCredit: number;
  totalDebit: number;
  extractedMeta?: import('../../types').BankStatementExtractedMeta;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Conciliacion({ businessId, currentUserId, userRole, movements = [], currentUserName = 'Usuario', canVerify }: ConciliacionProps) {
  const toast = useToast();
  const canEdit = userRole === 'owner' || userRole === 'admin';
  const effectiveCanVerify = canVerify ?? canEdit;

  // Única vista de conciliación. La antigua tab 'auto' escribía abonos sin
  // reclamar referencia atómicamente — se fusionó al flujo de lotes (un abono
  // individual ahora es un lote ad-hoc de 1 item).
  const [view, setView] = useState<'lotes' | 'manual'>('lotes');
  const monthKey = currentMonthKey();
  const [accounts, setAccounts] = useState<BankStatementAccountDoc[]>([]);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMultiUpload, setShowMultiUpload] = useState(false);
  const [showReceiptBatch, setShowReceiptBatch] = useState(false);
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [pendingBatchFiles, setPendingBatchFiles] = useState<File[] | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number } | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [viewingAccountAlias, setViewingAccountAlias] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const ref = collection(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list: BankStatementAccountDoc[] = [];
        snap.forEach((d) => list.push(d.data() as BankStatementAccountDoc));
        list.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel));
        setAccounts(list);
      },
      (err) => {
        console.error('[Conciliacion] accounts onSnapshot error', err);
        toast.error('Error cargando cuentas: ' + (err?.message || 'desconocido'));
      }
    );
    return () => unsub();
  }, [businessId, monthKey, toast]);

  useEffect(() => {
    if (!businessId) return;
    const ref = collection(db, `businesses/${businessId}/reconciliationBatches`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list: ReconciliationBatch[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setBatches(list);
      },
      (err) => {
        console.error('[Conciliacion] batches onSnapshot error', err);
      }
    );
    return () => unsub();
  }, [businessId]);

  const accountChips = useMemo<AccountChipData[]>(
    () =>
      accounts.map((a) => ({
        accountAlias: a.accountAlias,
        accountLabel: a.accountLabel,
        bankName: a.bankName,
        rowCount: a.rowCount,
        totalCredit: a.totalCredit,
        fileUrl: a.fileUrl,
      })),
    [accounts]
  );

  const existingAliases = useMemo(() => accounts.map((a) => a.accountAlias), [accounts]);

  const handleUploadAccount = async (data: {
    accountAlias: string;
    accountLabel: string;
    bankCode?: string;
    bankName?: string;
    amountTolerancePct?: number;
    sourceFilename: string;
    rows: BankRow[];
    file?: File;
  }) => {
    if (!canEdit) {
      toast.error('Solo owner/admin pueden subir estados de cuenta');
      return;
    }
    const totalCredit = data.rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const totalDebit = data.rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);

    // Sanitizar filename: caracteres raros rompen URLs firmadas en algunos CDNs.
    const safeFilename = (() => {
      const name = data.sourceFilename || 'archivo';
      const dotIdx = name.lastIndexOf('.');
      const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
      const cleanBase = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'archivo';
      const cleanExt = ext.toLowerCase().replace(/[^a-z0-9.]+/g, '');
      return `${cleanBase}${cleanExt}`;
    })();
    // Firebase Storage no se usa (bucket no provisionado, Blaze inaccesible desde VE).
    let fileUrl: string | undefined;
    let filePublicId: string | undefined;
    if (data.file) {
      try {
        const result = await uploadToCloudinary(data.file, 'dualis_payments', 'raw', safeFilename);
        fileUrl = result.secure_url;
        filePublicId = result.public_id;
      } catch (err: any) {
        console.warn('[Conciliacion] Cloudinary upload failed; guardando sin fileUrl', err);
        toast.error(`Subida del archivo falló (${err?.message || 'error'}). Guardando cuenta sin archivo adjunto.`);
      }
    }

    const payload: BankStatementAccountDoc = {
      accountAlias: data.accountAlias,
      accountLabel: data.accountLabel,
      bankCode: data.bankCode,
      bankName: data.bankName,
      amountTolerancePct: data.amountTolerancePct || 0,
      sourceFilename: safeFilename,
      ...(fileUrl ? { fileUrl } : {}),
      ...(filePublicId ? { filePublicId } : {}),
      uploadedAt: Timestamp.now(),
      uploadedBy: currentUserId,
      rows: data.rows.map((r) => {
        const clean: Record<string, any> = { matched: false };
        for (const [k, v] of Object.entries(r)) {
          if (v !== undefined) clean[k] = v;
        }
        return clean as BankRow & { matched: boolean };
      }),
      rowCount: data.rows.length,
      totalCredit,
      totalDebit,
    };
    const docRef = doc(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts', data.accountAlias);
    await setDoc(docRef, payload);
    toast.success(`Cuenta "${data.accountLabel}" guardada (${data.rows.length} filas)`);
  };

  const handleDeleteAccount = async (alias: string) => {
    if (!canEdit) return;
    const acc = accounts.find((a) => a.accountAlias === alias);
    if (!acc) return;
    if (!confirm(`¿Borrar la cuenta "${acc.accountLabel}" y sus ${acc.rowCount} filas del ${monthKey}?`)) return;
    // Cloudinary unsigned upload preset no permite delete desde cliente: asset queda huérfano.
    const ref = doc(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts', alias);
    await deleteDoc(ref);
    toast.success(`Cuenta "${acc.accountLabel}" eliminada`);
  };

  // Multi-drop → pide nombre y crea un ReconciliationBatch (mismo flujo que la pestaña Lotes).
  const handleDropBatch = (files: File[]) => {
    setPendingBatchFiles(files);
  };

  const handleConfirmBatchName = async (name: string) => {
    const files = pendingBatchFiles || [];
    if (!files.length) {
      setPendingBatchFiles(null);
      return;
    }
    setPendingBatchFiles(null);
    try {
      setOcrBusy(true);
      setOcrProgress({ done: 0, total: files.length });
      const items: ImageBatchItem[] = files.map((f, i) => ({
        id: `img_${Date.now().toString(36)}_${i}`,
        kind: 'image',
        file: f,
      }));
      let lastError: string | null = null;
      const outcome = await processReceiptBatch({
        db,
        businessId,
        name,
        currentUserId,
        currentUserName,
        items,
        onProgress: (done, total) => setOcrProgress({ done, total }),
        onResultsChange: (results) => {
          const errored = results.find(r => r.status === 'error' && r.errorMsg);
          if (errored?.errorMsg) lastError = errored.errorMsg;
        },
      });
      if (outcome.stats.notFound > 0 && outcome.stats.confirmed === 0 && outcome.stats.review === 0 && lastError) {
        toast.error(`OCR falló (${outcome.stats.notFound}/${outcome.stats.total}): ${lastError.slice(0, 400)}`, { duration: 12000 });
      } else if (lastError) {
        toast.error(`Hay items con error en el lote: ${lastError.slice(0, 400)}`, { duration: 10000 });
        toast.success(`Lote "${name}" procesado · ${outcome.stats.confirmed} auto · ${outcome.stats.review} a revisar · ${outcome.stats.notFound} sin match`);
      } else {
        toast.success(`Lote "${name}" procesado · ${outcome.stats.confirmed} auto · ${outcome.stats.review} a revisar · ${outcome.stats.notFound} sin match`);
      }
      setView('lotes');
      setSelectedBatchId(outcome.batchId);
    } catch (err: any) {
      toast.error('Error procesando lote: ' + (err?.message || String(err)));
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

  const handleDeleteBatch = async (batch: ReconciliationBatch) => {
    if (!confirm(`¿Eliminar el lote "${batch.name}" y todos sus abonos? Esta acción no se puede deshacer.`)) return;
    try {
      const abonosSnap = await getDocs(query(collectionGroup(db, 'abonos'), where('batchId', '==', batch.id)));
      const docs = abonosSnap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const wb = writeBatch(db);
        docs.slice(i, i + 400).forEach(d => wb.delete(d.ref));
        await wb.commit();
      }
      await deleteDoc(doc(db, `businesses/${businessId}/reconciliationBatches/${batch.id}`));
      toast.success(`Lote "${batch.name}" eliminado · ${docs.length} abono${docs.length === 1 ? '' : 's'} también borrado${docs.length === 1 ? '' : 's'}`);
      if (selectedBatchId === batch.id) setSelectedBatchId(null);
    } catch (err: any) {
      toast.error('Error eliminando lote: ' + (err?.message || String(err)));
    }
  };

  const unverifiedCount = useMemo(
    () => movements.filter((m) => isVerifiable(m) && resolveVerificationStatus(m) === 'unverified').length,
    [movements]
  );

  if (!businessId) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <FileCheck size={20} className="text-indigo-700 dark:text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Conciliación Bancaria</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {view === 'lotes'
                  ? `${batches.length} lote${batches.length !== 1 ? 's' : ''} · ${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''} · pool global cross-cuenta`
                  : `Verificación fila por fila · ${unverifiedCount} sin verificar`}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs: Conciliación (lotes, principal) · Verificar movimientos (CxC/CxP) */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/[0.04] p-1 gap-1">
          <button
            type="button"
            onClick={() => { setView('lotes'); setSelectedBatchId(null); }}
            className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              view === 'lotes'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60'
            }`}
          >
            <Layers size={12} /> Conciliación
            {batches.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
                {batches.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setView('manual')}
            className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              view === 'manual'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60'
            }`}
          >
            <ShieldCheck size={12} /> Verificar movimientos
            {unverifiedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-300">
                {unverifiedCount}
              </span>
            )}
          </button>
        </div>

        {view === 'manual' ? (
          <ManualVerificationTab
            movements={movements}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            canVerify={effectiveCanVerify}
          />
        ) : selectedBatchId ? (
          <BatchReviewPanel
            businessId={businessId}
            batchId={selectedBatchId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onBack={() => setSelectedBatchId(null)}
          />
        ) : (
          <BatchList
            batches={batches}
            accountChips={accountChips}
            onOpen={setSelectedBatchId}
            onNewBatch={() => setShowReceiptBatch(true)}
            onUploadEdec={() => setShowMultiUpload(true)}
            onAddSingleAccount={() => setShowUploadModal(true)}
            onDeleteAccount={canEdit ? handleDeleteAccount : undefined}
            onViewAccount={setViewingAccountAlias}
            onDelete={handleDeleteBatch}
            canEdit={canEdit}
            ocrBusy={ocrBusy}
            ocrProgress={ocrProgress}
            onDropBatch={handleDropBatch}
          />
        )}
      </div>

      {showUploadModal && (
        <BankUploadModal
          existingAliases={existingAliases}
          onClose={() => setShowUploadModal(false)}
          onConfirm={handleUploadAccount}
        />
      )}

      {pendingBatchFiles && pendingBatchFiles.length > 0 && (
        <BatchNamePromptModal
          files={pendingBatchFiles}
          defaultName={`Lote ${new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} ${new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
          onCancel={() => setPendingBatchFiles(null)}
          onConfirm={handleConfirmBatchName}
        />
      )}

      {showMultiUpload && (
        <MultiBankUploadModal
          businessId={businessId}
          monthKey={monthKey}
          uploadedByUid={currentUserId}
          existingAliases={existingAliases}
          onClose={() => setShowMultiUpload(false)}
          onDone={() => setShowMultiUpload(false)}
        />
      )}

      {showReceiptBatch && (
        <ReceiptBatchModal
          businessId={businessId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setShowReceiptBatch(false)}
          onCreated={(batchId) => {
            setShowReceiptBatch(false);
            setView('lotes');
            setSelectedBatchId(batchId);
          }}
        />
      )}

      {viewingAccountAlias && (() => {
        const acc = accounts.find(a => a.accountAlias === viewingAccountAlias);
        if (!acc) return null;
        return (
          <AccountRowsModal
            accountLabel={acc.accountLabel}
            bankName={acc.bankName}
            rowCount={acc.rowCount}
            totalCredit={acc.totalCredit}
            totalDebit={acc.totalDebit}
            fileUrl={acc.fileUrl}
            periodFrom={acc.extractedMeta?.periodFrom}
            periodTo={acc.extractedMeta?.periodTo}
            rows={acc.rows || []}
            onClose={() => setViewingAccountAlias(null)}
          />
        );
      })()}
    </div>
  );
}

// ── BatchList: lista de ReconciliationBatch con acciones ─────────────────
interface BatchListProps {
  batches: ReconciliationBatch[];
  accountChips: AccountChipData[];
  onOpen: (id: string) => void;
  onNewBatch: () => void;
  onUploadEdec: () => void;
  onAddSingleAccount: () => void;
  onDeleteAccount?: (alias: string) => void;
  onViewAccount?: (alias: string) => void;
  onDelete: (batch: ReconciliationBatch) => void;
  canEdit: boolean;
  ocrBusy: boolean;
  ocrProgress: { done: number; total: number } | null;
  onDropBatch: (files: File[]) => void;
}

const BatchList: React.FC<BatchListProps> = ({
  batches, accountChips, onOpen, onNewBatch, onUploadEdec, onAddSingleAccount,
  onDeleteAccount, onViewAccount, onDelete, canEdit, ocrBusy, ocrProgress, onDropBatch,
}) => {
  return (
    <div className="space-y-4">
      {/* CTAs principales — una sola fila, jerarquía clara: lote (primario) / EdeC / individual */}
      {canEdit && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={onNewBatch}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm"
          >
            <Camera size={15} /> Nuevo lote de capturas
          </button>
          <button
            onClick={onUploadEdec}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Upload size={14} /> Subir EdeC
          </button>
          <div className="flex-1" />
          {ocrBusy && ocrProgress && (
            <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Procesando {ocrProgress.done}/{ocrProgress.total}…
            </div>
          )}
        </div>
      )}

      {/* Quick drop zone para crear un lote directo desde drag-drop (sin abrir modal) */}
      {canEdit && (
        <ReceiptDropZone
          disabled={ocrBusy}
          progress={ocrProgress}
          onDropSingle={(file) => onDropBatch([file])}
          onDropBatch={onDropBatch}
        />
      )}

      {/* Cuentas bancarias cargadas — strip compacto, no es tab separada */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Landmark size={13} /> Cuentas bancarias cargadas ({accountChips.length})
          </div>
          {canEdit && (
            <button
              onClick={onAddSingleAccount}
              className="text-[11px] px-2 py-1 rounded text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 inline-flex items-center gap-1"
            >
              <Plus size={11} /> Agregar cuenta (sola)
            </button>
          )}
        </div>
        {accountChips.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">Sin cuentas aún. Usa "Subir EdeC" para cargar varias a la vez.</div>
        ) : (
          <AccountChips
            accounts={accountChips}
            onAdd={canEdit ? onAddSingleAccount : undefined}
            onDelete={onDeleteAccount}
            onSelect={onViewAccount}
          />
        )}
      </div>

      {/* Lista de lotes */}
      {batches.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
          <Layers size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Aún no hay lotes creados</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Crea un lote para procesar múltiples capturas de pago contra el pool global de estados de cuenta.
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Período</th>
                <th className="text-center px-4 py-2">Total</th>
                <th className="text-center px-4 py-2">Confirmados</th>
                <th className="text-center px-4 py-2">Revisar</th>
                <th className="text-center px-4 py-2">Sin match</th>
                <th className="text-left px-4 py-2">Creado</th>
                <th className="text-center px-4 py-2">Estado</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{b.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {b.periodFrom && b.periodTo ? `${b.periodFrom} → ${b.periodTo}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-center font-mono">{b.stats?.total ?? 0}</td>
                  <td className="px-4 py-2 text-center font-mono text-emerald-600">{b.stats?.confirmed ?? 0}</td>
                  <td className="px-4 py-2 text-center font-mono text-amber-600">{b.stats?.review ?? 0}</td>
                  <td className="px-4 py-2 text-center font-mono text-rose-600">{b.stats?.notFound ?? 0}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '—'}
                    <div className="text-[10px] text-slate-400">{b.createdByName || '—'}</div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      b.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'archived' ? 'bg-slate-100 text-slate-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => onOpen(b.id)}
                        className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Abrir
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => onDelete(b)}
                          title="Eliminar lote"
                          className="text-xs p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
