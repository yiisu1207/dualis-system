import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ManualBatchItem } from '../../utils/processReceiptBatch';

export interface ManualAccountOption {
  id: string;            // bankAccountId (requerido para matching por pool)
  label: string;
  bankName?: string;
}

interface ManualBatchEntryModalProps {
  accounts: ManualAccountOption[];
  onCancel: () => void;
  onConfirm: (name: string, item: ManualBatchItem) => void;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ManualBatchEntryModal({ accounts, onCancel, onConfirm }: ManualBatchEntryModalProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [bankAccountId, setBankAccountId] = useState(accounts[0]?.id || '');
  const [cedula, setCedula] = useState('');
  const [clientName, setClientName] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const validName = trimmed.length >= 3 && trimmed.length <= 40;
  const amt = parseFloat(amount);
  const validAmount = Number.isFinite(amt) && amt > 0;
  const validRef = reference.trim().length > 0;
  const validDate = !!date;
  const validAccount = !!bankAccountId;
  const canSubmit = validName && validAmount && validRef && validDate && validAccount && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const item: ManualBatchItem = {
      id: `man_${Date.now().toString(36)}`,
      kind: 'manual',
      amount: amt,
      date,
      reference: reference.trim(),
      bankAccountId,
      cedula: cedula.trim() || undefined,
      clientName: clientName.trim() || undefined,
      note: note.trim() || undefined,
    };
    onConfirm(trimmed, item);
  };

  const noAccounts = accounts.length === 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Pago sin captura</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Crea un lote con un abono manual (sin imagen)</div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {noAccounts && (
            <div className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-amber-800 dark:text-amber-200 rounded p-2">
              No hay cuentas bancarias con bankAccountId mapeado. Sube un EdeC con la cuenta asignada antes de agregar manuales.
            </div>
          )}

          <label className="block text-xs">
            <span className="text-slate-600 dark:text-slate-300">Nombre del lote *</span>
            <input
              ref={firstRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Pago Pedro sin recibo"
              maxLength={40}
              className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded text-sm"
            />
            <div className="text-[10px] text-slate-400 mt-0.5">3–40 caracteres</div>
          </label>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label>
              <span className="text-slate-600 dark:text-slate-300">Monto USD *</span>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded font-mono" />
            </label>
            <label>
              <span className="text-slate-600 dark:text-slate-300">Fecha *</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
            </label>
            <label className="col-span-2">
              <span className="text-slate-600 dark:text-slate-300">Referencia *</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="123456"
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded font-mono" />
            </label>
            <label className="col-span-2">
              <span className="text-slate-600 dark:text-slate-300">Cuenta destino *</span>
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} disabled={noAccounts}
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded disabled:opacity-50">
                <option value="">— elegir —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.bankName ? `${a.bankName} · ` : ''}{a.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-slate-600 dark:text-slate-300">Cédula</span>
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="V-12345678"
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
            </label>
            <label>
              <span className="text-slate-600 dark:text-slate-300">Cliente</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)}
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
            </label>
            <label className="col-span-2">
              <span className="text-slate-600 dark:text-slate-300">Nota</span>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                className="w-full mt-1 px-2 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">Cancelar</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Crear lote y procesar
          </button>
        </div>
      </div>
    </div>
  );
}
