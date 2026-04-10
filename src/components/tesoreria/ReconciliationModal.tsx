import React, { useMemo, useState } from 'react';
import { X, CheckSquare, XSquare, Eye, AlertTriangle } from 'lucide-react';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { BusinessBankAccount, Movement } from '../../../types';
import { sendPaymentRevertedEmail } from '../../utils/emailService';

interface Props {
  businessId: string;
  account: BusinessBankAccount;
  movements: Movement[];
  customers: { id: string; name: string; email?: string }[];
  businessName: string;
  currentUserId: string;
  onClose: () => void;
  onViewVoucher: (url: string, caption: string) => void;
}

export default function ReconciliationModal({ businessId, account, movements, customers, businessName, currentUserId, onClose, onViewVoucher }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const monthMovements = useMemo(() => {
    return movements
      .filter(m =>
        m.bankAccountId === account.id &&
        (m.movementType === 'ABONO' || m.movementType === 'FACTURA') &&
        !m.anulada
      )
      .filter(m => {
        const d = new Date(m.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [movements, account.id, year, month]);

  const totalMonth = monthMovements.reduce((s, m) => s + Number(m.amountInUSD || 0), 0);
  const reconciledCount = monthMovements.filter(m => m.reconciledAt).length;

  const handleMarkReconciled = async (m: Movement) => {
    setBusyId(m.id);
    setError('');
    try {
      await updateDoc(doc(db, 'movements', m.id), {
        reconciledAt: new Date().toISOString(),
        reconciledBy: currentUserId,
      });
    } catch (err: any) {
      setError(err?.message || 'Error al conciliar');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevert = async (m: Movement) => {
    const reason = prompt('Motivo del rechazo (visible para el cliente):', 'Pago no recibido en banco');
    if (!reason || !reason.trim()) return;
    if (!confirm(`Esto anulará el abono y desmarcará las facturas pagadas. ¿Continuar?`)) return;
    setBusyId(m.id);
    setError('');
    try {
      // Anular el movement
      await updateDoc(doc(db, 'movements', m.id), {
        anulada: true,
        anuladaAt: new Date().toISOString(),
        anuladaBy: currentUserId,
        anuladaReason: reason.trim(),
      });

      // Cascade: desmarcar facturas pagadas que tenían este abono
      try {
        const facsSnap = await getDocs(query(
          collection(db, 'movements'),
          where('businessId', '==', businessId),
          where('entityId', '==', m.entityId),
          where('movementType', '==', 'FACTURA'),
        ));
        const recalcRows = facsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        for (const fac of recalcRows) {
          if (fac.pagado || fac.estadoPago === 'PAGADO') {
            // Marcar como pendiente — el panel CxC recalculará el saldo real
            await updateDoc(doc(db, 'movements', fac.id), {
              pagado: false,
              estadoPago: 'PENDIENTE',
            });
          }
        }
      } catch (err) {
        console.error('[reconciliation] cascade failed', err);
      }

      // Notificar al cliente
      const cust = customers.find(c => c.id === m.entityId);
      if (cust?.email) {
        try {
          await sendPaymentRevertedEmail(cust.email, {
            customerName: cust.name,
            amount: Number(m.amountInUSD || 0),
            businessName,
            reason: reason.trim(),
          });
        } catch { /* swallow */ }
      }
    } catch (err: any) {
      setError(err?.message || 'Error al revertir');
    } finally {
      setBusyId(null);
    }
  };

  const monthOptions = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const yearOptions = [today.getFullYear(), today.getFullYear() - 1];

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-3xl pointer-events-auto max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <CheckSquare size={18} />
              </div>
              <div>
                <h2 className="font-black text-slate-900 dark:text-white text-[15px]">Conciliar mes</h2>
                <p className="text-[11px] text-slate-400 font-medium">{account.bankName}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.12] flex items-center justify-center text-slate-400">
              <X size={14} />
            </button>
          </div>

          {/* Filters + Stats */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-xs font-bold text-slate-900 dark:text-white outline-none"
              >
                {monthOptions.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] text-xs font-bold text-slate-900 dark:text-white outline-none"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <span className="text-slate-400">Total: <strong className="text-slate-900 dark:text-white">${totalMonth.toFixed(2)}</strong></span>
              <span className="text-slate-400">Conciliados: <strong className="text-emerald-500">{reconciledCount}/{monthMovements.length}</strong></span>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
            {monthMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3 opacity-50">
                <CheckSquare size={32} className="text-slate-400" />
                <p className="text-xs font-bold text-slate-400">Sin movimientos en este mes</p>
              </div>
            ) : monthMovements.map(m => {
              const reconciled = !!m.reconciledAt;
              const cust = customers.find(c => c.id === m.entityId);
              return (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-3 flex items-center gap-3 ${
                    reconciled
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.05]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-slate-900 dark:text-white truncate">{cust?.name || m.concept}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      {new Date(m.date).toLocaleDateString('es-VE')} · Ref {m.reference || m.referencia || '—'}
                    </p>
                  </div>
                  <p className="text-base font-black text-slate-900 dark:text-white">${Number(m.amountInUSD || 0).toFixed(2)}</p>
                  <div className="flex items-center gap-1">
                    {m.voucherUrl && (
                      <button
                        onClick={() => onViewVoucher(m.voucherUrl!, `${cust?.name || m.concept} · $${Number(m.amountInUSD || 0).toFixed(2)}`)}
                        className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-blue-500/10 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all border border-slate-200 dark:border-white/[0.05]"
                        title="Ver voucher"
                      >
                        <Eye size={13} />
                      </button>
                    )}
                    {!reconciled ? (
                      <>
                        <button
                          onClick={() => handleMarkReconciled(m)}
                          disabled={busyId === m.id}
                          className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-emerald-500/15 text-slate-400 hover:text-emerald-500 flex items-center justify-center transition-all border border-slate-200 dark:border-white/[0.05] disabled:opacity-50"
                          title="Visto en banco"
                        >
                          <CheckSquare size={13} />
                        </button>
                        <button
                          onClick={() => handleRevert(m)}
                          disabled={busyId === m.id}
                          className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.05] hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all border border-slate-200 dark:border-white/[0.05] disabled:opacity-50"
                          title="No llegó — revertir"
                        >
                          <XSquare size={13} />
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 px-2 py-1 bg-emerald-500/10 rounded-lg">OK</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="px-6 py-3 bg-rose-500/10 border-t border-rose-500/30 flex items-center gap-2">
              <AlertTriangle size={14} className="text-rose-500" />
              <p className="text-xs font-bold text-rose-500">{error}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
