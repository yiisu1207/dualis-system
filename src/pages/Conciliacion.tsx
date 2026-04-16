import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FileCheck, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  findMatches,
  findDuplicateAbono,
  classifyAbono,
  type BankRow,
  type DraftAbono,
  type RankedMatch,
} from '../utils/bankReconciliation';
import { extractReceipt, extractReceiptsBatch, hashFile, type BatchItem } from '../utils/receiptOcr';
import AccountChips, { type AccountChipData } from '../components/conciliacion/AccountChips';
import AbonoForm from '../components/conciliacion/AbonoForm';
import LiveMatchList from '../components/conciliacion/LiveMatchList';
import BankUploadModal from '../components/conciliacion/BankUploadModal';
import ReceiptDropZone from '../components/conciliacion/ReceiptDropZone';
import BatchReviewModal from '../components/conciliacion/BatchReviewModal';
import ReconciliationReport, {
  type SessionAbono,
  type AbonoStatus,
} from '../components/conciliacion/ReconciliationReport';

interface ConciliacionProps {
  businessId: string;
  currentUserId: string;
  userRole: string;
}

interface BankStatementAccountDoc {
  accountAlias: string;
  accountLabel: string;
  bankCode?: string;
  bankName?: string;
  amountTolerancePct?: number;
  sourceFilename: string;
  uploadedAt: any;
  uploadedBy: string;
  rows: BankRow[];
  rowCount: number;
  totalCredit: number;
  totalDebit: number;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function emptyDraft(): DraftAbono {
  return {
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
  };
}

function makeId(): string {
  return `ab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Conciliacion({ businessId, currentUserId, userRole }: ConciliacionProps) {
  const toast = useToast();
  const canEdit = userRole === 'owner' || userRole === 'admin';

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [accounts, setAccounts] = useState<BankStatementAccountDoc[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [abonos, setAbonos] = useState<SessionAbono[]>([]);
  const [draft, setDraft] = useState<DraftAbono>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMatchRowId, setSelectedMatchRowId] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[] | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number } | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  const processedHashesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!businessId) return;
    setLoadingAccounts(true);
    const ref = collection(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list: BankStatementAccountDoc[] = [];
        snap.forEach((d) => list.push(d.data() as BankStatementAccountDoc));
        list.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel));
        setAccounts(list);
        setLoadingAccounts(false);
      },
      (err) => {
        console.error('[Conciliacion] accounts onSnapshot error', err);
        toast.error('Error cargando cuentas: ' + (err?.message || 'desconocido'));
        setLoadingAccounts(false);
      }
    );
    return () => unsub();
  }, [businessId, monthKey, toast]);

  useEffect(() => {
    setAbonos([]);
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedMatchRowId(null);
    processedHashesRef.current.clear();
  }, [monthKey]);

  const pool = useMemo<BankRow[]>(() => {
    const matchedMap = new Map<string, string>();
    for (const a of abonos) {
      if (a.matchRowId) matchedMap.set(a.matchRowId, a.id);
    }
    const flat: BankRow[] = [];
    for (const acc of accounts) {
      for (const row of acc.rows || []) {
        const matchedAbonoId = matchedMap.get(row.rowId);
        flat.push({
          ...row,
          accountAlias: acc.accountAlias,
          accountLabel: acc.accountLabel,
          bankCode: acc.bankCode,
          bankName: acc.bankName,
          amountTolerancePct: acc.amountTolerancePct,
          matched: !!matchedAbonoId,
          matchedAbonoId,
        });
      }
    }
    return flat;
  }, [accounts, abonos]);

  const accountChips = useMemo<AccountChipData[]>(
    () =>
      accounts.map((a) => ({
        accountAlias: a.accountAlias,
        accountLabel: a.accountLabel,
        bankName: a.bankName,
        rowCount: a.rowCount,
        totalCredit: a.totalCredit,
      })),
    [accounts]
  );

  const existingAliases = useMemo(() => accounts.map((a) => a.accountAlias), [accounts]);

  const liveMatches = useMemo<RankedMatch[]>(() => {
    if (!(draft.amount > 0) || !draft.date) return [];
    return findMatches(draft, pool);
  }, [draft, pool]);

  const duplicateAbonoId = useMemo(() => {
    if (!(draft.amount > 0) || !draft.date) return null;
    const others = editingId ? abonos.filter((a) => a.id !== editingId) : abonos;
    return findDuplicateAbono(draft, others);
  }, [draft, abonos, editingId]);

  const duplicateWarning = duplicateAbonoId
    ? `Posible duplicado del abono #${abonos.findIndex((a) => a.id === duplicateAbonoId) + 1}`
    : null;

  const selectedMatchInfo = useMemo(() => {
    if (!selectedMatchRowId) return null;
    const row = pool.find((r) => r.rowId === selectedMatchRowId);
    if (!row) return null;
    return `${row.accountLabel || row.accountAlias} · $${row.amount.toFixed(2)} · ${row.date}`;
  }, [selectedMatchRowId, pool]);

  const handleUploadAccount = async (data: {
    accountAlias: string;
    accountLabel: string;
    bankCode?: string;
    bankName?: string;
    amountTolerancePct?: number;
    sourceFilename: string;
    rows: BankRow[];
  }) => {
    if (!canEdit) {
      toast.error('Solo owner/admin pueden subir estados de cuenta');
      return;
    }
    const totalCredit = data.rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const totalDebit = data.rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const payload: BankStatementAccountDoc = {
      accountAlias: data.accountAlias,
      accountLabel: data.accountLabel,
      bankCode: data.bankCode,
      bankName: data.bankName,
      amountTolerancePct: data.amountTolerancePct || 0,
      sourceFilename: data.sourceFilename,
      uploadedAt: Timestamp.now(),
      uploadedBy: currentUserId,
      rows: data.rows.map((r) => ({ ...r, matched: false, matchedAbonoId: undefined })),
      rowCount: data.rows.length,
      totalCredit,
      totalDebit,
    };
    const ref = doc(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts', data.accountAlias);
    await setDoc(ref, payload);
    toast.success(`Cuenta "${data.accountLabel}" guardada (${data.rows.length} filas)`);
  };

  const handleDeleteAccount = async (alias: string) => {
    if (!canEdit) return;
    const acc = accounts.find((a) => a.accountAlias === alias);
    if (!acc) return;
    if (!confirm(`¿Borrar la cuenta "${acc.accountLabel}" y sus ${acc.rowCount} filas del ${monthKey}?`)) return;
    const ref = doc(db, 'businesses', businessId, 'bankStatements', monthKey, 'accounts', alias);
    await deleteDoc(ref);
    toast.success(`Cuenta "${acc.accountLabel}" eliminada`);
  };

  const addOrUpdateAbono = (base: DraftAbono, matchRowId: string | null) => {
    const matches = findMatches(base, pool);
    const status: AbonoStatus = classifyAbono(base, matches, matchRowId || undefined);
    const matchAccountAlias = matchRowId ? pool.find((r) => r.rowId === matchRowId)?.accountAlias : undefined;
    if (editingId) {
      setAbonos((prev) =>
        prev.map((a) =>
          a.id === editingId
            ? {
                ...a,
                ...base,
                id: editingId,
                status,
                matchRowId,
                matchAccountAlias,
              }
            : a
        )
      );
    } else {
      const id = base.id || makeId();
      setAbonos((prev) => [
        ...prev,
        {
          ...base,
          id,
          status,
          matchRowId,
          matchAccountAlias,
        },
      ]);
    }
  };

  const handleSubmitAbono = () => {
    if (!(draft.amount > 0) || !draft.date) return;
    if (duplicateAbonoId && !confirm('Hay un posible duplicado con estos datos. ¿Continuar igualmente?')) {
      return;
    }
    addOrUpdateAbono(draft, selectedMatchRowId);
    toast.success(editingId ? 'Abono actualizado' : 'Abono agregado');
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedMatchRowId(null);
  };

  const handleClearEdit = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedMatchRowId(null);
  };

  const handleEditAbono = (id: string) => {
    const a = abonos.find((x) => x.id === id);
    if (!a) return;
    setDraft({
      id: a.id,
      amount: a.amount,
      date: a.date,
      operationType: a.operationType,
      reference: a.reference,
      cedula: a.cedula,
      phone: a.phone,
      clientName: a.clientName,
      note: a.note,
    });
    setEditingId(id);
    setSelectedMatchRowId(a.matchRowId);
  };

  const handleDeleteAbono = (id: string) => {
    if (!confirm('¿Borrar este abono?')) return;
    setAbonos((prev) => prev.filter((a) => a.id !== id));
    if (editingId === id) handleClearEdit();
  };

  const mapExtractedToDraft = (r: ExtractedToDraftInput): DraftAbono => ({
    amount: r.amount && r.amount > 0 ? r.amount : 0,
    date: r.date || new Date().toISOString().slice(0, 10),
    reference: r.reference || undefined,
    cedula: r.cedula || undefined,
    phone: r.phone || undefined,
    operationType: r.operationType || undefined,
    clientName: r.senderName || undefined,
    note: r.notes || undefined,
  });

  const handleDropSingle = async (file: File) => {
    try {
      const hash = await hashFile(file);
      if (processedHashesRef.current.has(hash)) {
        toast.warning('Esta imagen ya fue procesada en esta sesión');
        return;
      }
      setOcrBusy(true);
      setOcrProgress({ done: 0, total: 1 });
      const result = await extractReceipt(file);
      processedHashesRef.current.set(hash, 'form');
      setOcrProgress({ done: 1, total: 1 });
      if (!result.amount || result.amount <= 0) {
        toast.warning('No se pudo extraer el monto de la imagen');
      } else {
        toast.success('Comprobante extraído — revisa el form');
      }
      setDraft((prev) => ({ ...prev, ...mapExtractedToDraft(result as any) }));
      setEditingId(null);
    } catch (err: any) {
      toast.error('OCR falló: ' + (err?.message || String(err)));
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

  const handleDropBatch = async (files: File[]) => {
    try {
      setOcrBusy(true);
      setOcrProgress({ done: 0, total: files.length });
      const items = await extractReceiptsBatch(files, (done, total) => setOcrProgress({ done, total }));
      for (const it of items) {
        if (!it.error) processedHashesRef.current.set(it.imageHash, 'batch');
      }
      setBatchItems(items);
    } catch (err: any) {
      toast.error('Batch OCR falló: ' + (err?.message || String(err)));
    } finally {
      setOcrBusy(false);
      setOcrProgress(null);
    }
  };

  const handleBatchConfirm = (confirmed: Array<{ abono: DraftAbono; matchRowId: string | null }>) => {
    const newAbonos: SessionAbono[] = confirmed.map(({ abono, matchRowId }) => {
      const matches = findMatches(abono, pool);
      const status = classifyAbono(abono, matches, matchRowId || undefined);
      const matchAccountAlias = matchRowId ? pool.find((r) => r.rowId === matchRowId)?.accountAlias : undefined;
      return {
        ...abono,
        id: abono.id || makeId(),
        status,
        matchRowId,
        matchAccountAlias,
      };
    });
    setAbonos((prev) => [...prev, ...newAbonos]);
    setBatchItems(null);
    toast.success(`${newAbonos.length} abono${newAbonos.length !== 1 ? 's' : ''} agregado${newAbonos.length !== 1 ? 's' : ''}`);
  };

  const poolTotalCredit = useMemo(() => pool.reduce((s, r) => s + Math.max(0, r.amount), 0), [pool]);

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
                Pool: {pool.length} filas · {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} · $
                {poolTotalCredit.toFixed(2)} crédito · {abonos.length} abono{abonos.length !== 1 ? 's' : ''} en sesión
              </p>
            </div>
          </div>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value || currentMonthKey())}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
          />
        </div>

        <AccountChips
          accounts={accountChips}
          onAdd={() => setShowUploadModal(true)}
          onDelete={canEdit ? handleDeleteAccount : undefined}
        />

        {loadingAccounts ? (
          <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" /> Cargando cuentas del mes...
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
            <FileCheck size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Sube el primer estado de cuenta del mes</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Agrega una cuenta bancaria para empezar a conciliar abonos
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <ReceiptDropZone
                disabled={ocrBusy}
                progress={ocrProgress}
                onDropSingle={handleDropSingle}
                onDropBatch={handleDropBatch}
              />
              <AbonoForm
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmitAbono}
                onClear={handleClearEdit}
                selectedMatchInfo={selectedMatchInfo}
                duplicateWarning={duplicateWarning}
                editingId={editingId}
              />
            </div>
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">Coincidencias en el pool</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {liveMatches.length} match{liveMatches.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <LiveMatchList
                  matches={liveMatches}
                  selectedRowId={selectedMatchRowId}
                  onSelect={setSelectedMatchRowId}
                  emptyMessage={
                    draft.amount > 0 && draft.date
                      ? 'Sin coincidencias en el pool — el abono quedará como "No encontrado".'
                      : 'Ingresa monto y fecha para ver coincidencias.'
                  }
                />
              </div>
            </div>
          </div>
        )}

        {accounts.length > 0 && (
          <ReconciliationReport
            abonos={abonos}
            pool={pool}
            onEditAbono={handleEditAbono}
            onDeleteAbono={handleDeleteAbono}
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

      {batchItems && (
        <BatchReviewModal
          items={batchItems}
          pool={pool}
          existingAbonos={abonos}
          onClose={() => setBatchItems(null)}
          onConfirm={handleBatchConfirm}
        />
      )}
    </div>
  );
}

interface ExtractedToDraftInput {
  amount: number | null;
  date: string | null;
  reference: string | null;
  cedula: string | null;
  phone: string | null;
  operationType: DraftAbono['operationType'] | null;
  senderName: string | null;
  notes: string | null;
}
