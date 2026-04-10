import React, { useState, useEffect } from 'react';
import { X, Landmark, Save, Trash2 } from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { BusinessBankAccount, BankAccountType } from '../../../types';
import { BANCOS_VE, getBancoByCode, isBancoVE, normalizeCedula, CEDULA_VE_REGEX } from '../../data/bancosVE';

interface Props {
  businessId: string;
  account?: BusinessBankAccount | null;
  onClose: () => void;
  onSaved?: (account: BusinessBankAccount) => void;
}

const TYPE_OPTIONS: { id: BankAccountType; label: string; needsBank: boolean }[] = [
  { id: 'corriente',  label: 'Cta. Corriente',  needsBank: true  },
  { id: 'ahorro',     label: 'Cta. Ahorro',     needsBank: true  },
  { id: 'pago_movil', label: 'Pago Móvil',      needsBank: true  },
  { id: 'zelle',      label: 'Zelle (USD)',     needsBank: false },
  { id: 'binance',    label: 'Binance Pay',     needsBank: false },
  { id: 'paypal',     label: 'PayPal',          needsBank: false },
  { id: 'efectivo',   label: 'Efectivo USD',    needsBank: false },
];

const TYPE_TO_FIXED_BANK: Partial<Record<BankAccountType, string>> = {
  zelle: 'ZELLE',
  binance: 'BINANCE',
  paypal: 'PAYPAL',
  efectivo: 'EFECTIVO',
};

export default function BankAccountModal({ businessId, account, onClose, onSaved }: Props) {
  const isEdit = !!account?.id;
  const [accountType, setAccountType] = useState<BankAccountType>(account?.accountType || 'corriente');
  const [bankCode, setBankCode] = useState<string>(account?.bankCode || '0134');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber || '');
  const [holderName, setHolderName] = useState(account?.holderName || '');
  const [holderDocument, setHolderDocument] = useState(account?.holderDocument || '');
  const [enabled, setEnabled] = useState(account?.enabled ?? true);
  const [instructions, setInstructions] = useState(account?.instructions || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-fija el bankCode para tipos no-banco
  useEffect(() => {
    const fixed = TYPE_TO_FIXED_BANK[accountType];
    if (fixed && bankCode !== fixed) setBankCode(fixed);
    if (!fixed && !isBancoVE(bankCode)) setBankCode('0134');
  }, [accountType]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUSDType = accountType === 'zelle' || accountType === 'binance' || accountType === 'paypal' || accountType === 'efectivo';
  const needsBank = accountType !== 'zelle' && accountType !== 'binance' && accountType !== 'paypal' && accountType !== 'efectivo';
  const needsCedula = accountType !== 'efectivo' && accountType !== 'paypal';

  const handleSave = async () => {
    setError('');
    if (!holderName.trim()) { setError('Falta el titular'); return; }
    if (accountType !== 'efectivo' && !accountNumber.trim()) { setError('Falta el número de cuenta / contacto'); return; }
    if (needsCedula) {
      const norm = normalizeCedula(holderDocument);
      if (!CEDULA_VE_REGEX.test(norm)) { setError('Cédula/RIF inválido — formato V-12345678'); return; }
    }
    setSaving(true);
    try {
      const banco = getBancoByCode(bankCode);
      const data: Omit<BusinessBankAccount, 'id'> = {
        businessId,
        bankCode,
        bankName: banco?.name || bankCode,
        accountType,
        accountNumber: accountNumber.trim(),
        holderName: holderName.trim(),
        holderDocument: needsCedula ? normalizeCedula(holderDocument) : holderDocument.trim(),
        currency: isUSDType ? 'USD' : 'VES',
        enabled,
        instructions: instructions.trim() || undefined,
        createdAt: account?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (isEdit && account) {
        await setDoc(doc(db, `businesses/${businessId}/bankAccounts`, account.id), data, { merge: true });
        onSaved?.({ ...data, id: account.id } as BusinessBankAccount);
      } else {
        const ref = await addDoc(collection(db, `businesses/${businessId}/bankAccounts`), { ...data, createdAt: serverTimestamp() });
        onSaved?.({ ...data, id: ref.id } as BusinessBankAccount);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!account?.id) return;
    if (!confirm(`¿Eliminar la cuenta ${account.bankName}? Los movimientos vinculados quedan intactos.`)) return;
    setSaving(true);
    try {
      // Soft delete: solo deshabilitar para preservar histórico
      await setDoc(doc(db, `businesses/${businessId}/bankAccounts`, account.id), { enabled: false, updatedAt: new Date().toISOString() }, { merge: true });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  const banco = getBancoByCode(bankCode);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-lg pointer-events-auto max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${banco?.color || '#4f6ef7'}20`, color: banco?.color || '#4f6ef7' }}>
                <Landmark size={18} />
              </div>
              <div>
                <h2 className="font-black text-slate-900 dark:text-white text-[15px]">{isEdit ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
                <p className="text-[11px] text-slate-400 font-medium">{banco?.name || 'Selecciona el banco'}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.12] flex items-center justify-center text-slate-400">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-4">
            {/* Tipo */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Tipo de cuenta</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAccountType(opt.id)}
                    className={`px-3 py-2.5 rounded-xl text-[11px] font-black transition-all ${
                      accountType === opt.id
                        ? 'bg-indigo-500 text-white shadow-md'
                        : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Banco */}
            {needsBank && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Banco</label>
                <select
                  value={bankCode}
                  onChange={e => setBankCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {BANCOS_VE.filter(b => isBancoVE(b.code)).map(b => (
                    <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Cuenta / contacto */}
            {accountType !== 'efectivo' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
                  {accountType === 'pago_movil' ? 'Teléfono' :
                   accountType === 'zelle' || accountType === 'paypal' ? 'Email' :
                   accountType === 'binance' ? 'Binance Pay ID' :
                   'Número de cuenta'}
                </label>
                <input
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder={
                    accountType === 'pago_movil' ? '04141234567' :
                    accountType === 'zelle' ? 'usuario@email.com' :
                    accountType === 'binance' ? '123456789' :
                    '01340000000000000000'
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Titular */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Titular</label>
              <input
                value={holderName}
                onChange={e => setHolderName(e.target.value)}
                placeholder="Nombre completo del titular"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Cédula */}
            {needsCedula && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">C.I. / RIF</label>
                <input
                  value={holderDocument}
                  onChange={e => setHolderDocument(e.target.value.toUpperCase())}
                  placeholder="V-12345678"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Instrucciones (opcional) */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Instrucciones para el cliente (opcional)</label>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Override del template automático — déjalo vacío para usar el predeterminado"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Enabled */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Activa en el portal del cliente</p>
                <p className="text-[10px] text-slate-400">Si la deshabilitas, deja de aparecer en el selector pero el histórico se preserva.</p>
              </div>
            </label>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                <p className="text-xs font-bold text-rose-500">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.07] shrink-0 flex items-center justify-between gap-3">
            {isEdit ? (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-rose-500 hover:bg-rose-500/10 text-xs font-black flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Trash2 size={13} /> Deshabilitar
              </button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 text-xs font-black hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-black flex items-center gap-2 hover:bg-indigo-600 transition-all disabled:opacity-50"
              >
                <Save size={13} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
