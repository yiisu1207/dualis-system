import React, { useState } from 'react';
import { X, ArrowDownToLine, Save } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { BusinessBankAccount } from '../../../types';

interface Props {
  businessId: string;
  account: BusinessBankAccount;
  currentBalance: number;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function WithdrawalModal({ businessId, account, currentBalance, currentUserId, currentUserName, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) { setError('Monto inválido'); return; }
    if (!concept.trim()) { setError('Falta el concepto'); return; }
    if (amt > currentBalance) {
      if (!confirm(`El monto excede el saldo actual ($${currentBalance.toFixed(2)}). ¿Continuar igual? Esto puede dejar el saldo en negativo.`)) return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/bankAccounts/${account.id}/withdrawals`), {
        accountId: account.id,
        amount: amt,
        concept: concept.trim(),
        date,
        createdBy: currentUserId,
        createdByName: currentUserName,
        createdAt: serverTimestamp(),
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al registrar retiro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-md pointer-events-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
                <ArrowDownToLine size={18} />
              </div>
              <div>
                <h2 className="font-black text-slate-900 dark:text-white text-[15px]">Registrar retiro</h2>
                <p className="text-[11px] text-slate-400 font-medium">{account.bankName}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.12] flex items-center justify-center text-slate-400">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-2xl px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo virtual actual</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">${currentBalance.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 mt-1">Informativo, no contable.</p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Monto USD</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-lg font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Concepto</label>
              <input
                value={concept}
                onChange={e => setConcept(e.target.value)}
                placeholder="Retiro a banco real, pago a proveedor..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                <p className="text-xs font-bold text-rose-500">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-black flex items-center gap-2 hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              <Save size={13} /> {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
