import React, { useState, useMemo } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { AccountType, MovementType, PortalPayment } from '../../types';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CreditCard, Check, AlertCircle, ArrowUpDown, Info, Download, Loader2 } from 'lucide-react';

const CUSTOM_COLORS = ['violet', 'emerald', 'amber'] as const;

export default function PortalAbonoForm() {
  const { businessId, customerId, customerName, businessName } = usePortal();
  const { movements, portalPayments, loading, balances, rates } = usePortalData(businessId, customerId);

  // Build account options dynamically: BCV + enabled custom rates
  const accountOptions = useMemo(() => {
    const opts: { value: AccountType; label: string; color: string; rate: number }[] = [
      { value: AccountType.BCV, label: 'BCV', color: 'sky', rate: rates.bcv },
    ];
    const customRates = rates.customRates || [];
    customRates
      .filter(r => r.enabled && r.value > 0)
      .forEach((r, i) => {
        const acctType = r.id as AccountType;
        opts.push({
          value: acctType,
          label: r.name,
          color: CUSTOM_COLORS[i % CUSTOM_COLORS.length],
          rate: r.value,
        });
      });
    // Fallback: if no customRates but legacy grupo/divisa exist
    if (customRates.length === 0) {
      if (rates.grupo > 0) opts.push({ value: AccountType.GRUPO, label: 'Grupo', color: 'violet', rate: rates.grupo });
      if (rates.divisa > 0) opts.push({ value: AccountType.DIVISA, label: 'Divisa', color: 'emerald', rate: rates.divisa });
    }
    return opts;
  }, [rates]);

  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [accountType, setAccountType] = useState<AccountType>(AccountType.BCV);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Transferencia');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastPayment, setLastPayment] = useState<{ amount: number; method: string; reference: string; account: string; date: string } | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  const unpaidInvoices = useMemo(
    () =>
      movements
        .filter(
          (m) =>
            m.movementType === MovementType.FACTURA &&
            !(m as any).pagado &&
            !(m as any).anulada &&
            m.accountType === accountType
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [movements, accountType]
  );

  const pendingPayments = useMemo(
    () => portalPayments.filter((p) => p.status === 'pending'),
    [portalPayments]
  );

  const selectedTotal = useMemo(() => {
    let total = 0;
    selectedInvoices.forEach((id) => {
      const inv = unpaidInvoices.find((m) => m.id === id);
      if (inv) total += inv.amountInUSD || inv.amount;
    });
    return total;
  }, [selectedInvoices, unpaidInvoices]);

  const toggleInvoice = (id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAccountChange = (acct: AccountType) => {
    setAccountType(acct);
    setSelectedInvoices(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSubmitting(true);
    try {
      const payment: Omit<PortalPayment, 'id'> = {
        businessId,
        customerId,
        customerName,
        invoiceIds: Array.from(selectedInvoices),
        accountType,
        amount: amt,
        metodoPago: method,
        referencia: reference,
        nota: note || undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'businesses', businessId, 'portalPayments'), payment);
      setLastPayment({ amount: amt, method, reference, account: accountType, date: new Date().toLocaleString('es-VE') });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert('Error al enviar el pago. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleDownloadReceipt = async () => {
    if (!lastPayment) return;
    setGeneratingReceipt(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: [80, 160] }); // receipt-size

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(businessName || 'Recibo de Pago', 40, 14, { align: 'center' });

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Comprobante de Pago — Portal de Clientes', 40, 20, { align: 'center' });

      pdf.setDrawColor(200);
      pdf.line(8, 24, 72, 24);

      let y = 30;
      const row = (label: string, value: string) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.text(label, 10, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(value, 10, y + 4);
        y += 10;
      };

      row('CLIENTE', customerName);
      row('FECHA', lastPayment.date);
      row('MONTO', `$${lastPayment.amount.toFixed(2)}`);
      row('CUENTA', lastPayment.account);
      row('MÉTODO', lastPayment.method);
      if (lastPayment.reference) row('REFERENCIA', lastPayment.reference);

      pdf.line(8, y, 72, y);
      y += 6;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text('ESTADO: PENDIENTE DE APROBACIÓN', 40, y, { align: 'center' });
      y += 8;
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(150);
      pdf.text('Generado desde Portal de Clientes', 40, y, { align: 'center' });

      pdf.save(`Recibo_${customerName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Receipt PDF error:', err);
    } finally {
      setGeneratingReceipt(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center animate-in">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-5">
          <Check size={28} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Pago Registrado</h2>
        <p className="text-sm text-white/40 mb-4 leading-relaxed">
          Tu pago ha sido enviado para aprobación. Recibirás una notificación cuando sea procesado.
        </p>
        {lastPayment && (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 mb-4 text-left space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-white/30 font-bold">Monto</span>
              <span className="text-emerald-400 font-black font-mono">${lastPayment.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/30 font-bold">Método</span>
              <span className="text-white/60 font-bold">{lastPayment.method}</span>
            </div>
            {lastPayment.reference && (
              <div className="flex justify-between text-xs">
                <span className="text-white/30 font-bold">Ref.</span>
                <span className="text-white/60 font-mono">{lastPayment.reference}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {lastPayment && (
            <button
              onClick={handleDownloadReceipt}
              disabled={generatingReceipt}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-50"
            >
              {generatingReceipt ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Descargar Recibo PDF
            </button>
          )}
          <button
            onClick={() => {
              setSubmitted(false);
              setSelectedInvoices(new Set());
              setAmount('');
              setReference('');
              setNote('');
              setLastPayment(null);
            }}
            className="w-full px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/[0.1] active:scale-[0.97] transition-all"
          >
            Registrar otro pago
          </button>
        </div>
      </div>
    );
  }

  const currentAcctOpt = accountOptions.find(a => a.value === accountType);
  const rateForAccount = currentAcctOpt?.rate || 0;
  const balanceForAccount = accountType === AccountType.BCV ? balances.bcv
    : accountType === AccountType.GRUPO ? balances.grupo
    : accountType === AccountType.DIVISA ? balances.divisa
    : 0;

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Registrar Pago</h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">
          Selecciona la cuenta, las facturas y envía tu comprobante
        </p>
      </div>

      {/* Pending payments warning */}
      {pendingPayments.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black text-amber-400">
              {pendingPayments.length} pago{pendingPayments.length !== 1 ? 's' : ''} pendiente{pendingPayments.length !== 1 ? 's' : ''} de aprobación
            </p>
            <p className="text-[9px] text-amber-400/60 mt-0.5">
              Total: {formatCurrency(pendingPayments.reduce((s, p) => s + p.amount, 0), '$')}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Account selector */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
            Cuenta a Abonar
          </h3>
          <div className={`grid gap-2 ${accountOptions.length <= 2 ? 'grid-cols-2' : accountOptions.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {accountOptions.map((acct) => {
              const bal = acct.value === AccountType.BCV ? balances.bcv
                : acct.value === AccountType.GRUPO ? balances.grupo
                : acct.value === AccountType.DIVISA ? balances.divisa
                : 0;
              const isActive = accountType === acct.value;

              return (
                <button
                  key={acct.value}
                  type="button"
                  onClick={() => handleAccountChange(acct.value)}
                  className={`rounded-xl p-3 sm:p-4 border text-center transition-all active:scale-[0.97] ${
                    isActive
                      ? `border-${acct.color}-500/40 bg-${acct.color}-500/10 ring-1 ring-${acct.color}-500/30`
                      : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <p className={`text-[9px] font-black uppercase tracking-widest ${
                    isActive ? `text-${acct.color}-400` : 'text-white/40'
                  }`}>
                    {acct.label}
                  </p>
                  <p className={`text-base sm:text-lg font-black mt-1 font-mono ${
                    bal > 0 ? (isActive ? `text-${acct.color}-400` : 'text-white/60') : 'text-white/15'
                  }`}>
                    ${bal > 0 ? bal.toFixed(2) : '0.00'}
                  </p>
                  {acct.rate > 0 && (
                    <p className="text-[8px] font-bold text-white/20 mt-0.5">
                      {acct.rate.toFixed(2)} Bs/$
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Current rate info */}
          {rateForAccount > 0 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-white/[0.03] rounded-lg">
              <ArrowUpDown size={11} className="text-white/30" />
              <span className="text-[9px] font-bold text-white/30">
                Tasa {accountType}: <span className="text-white/60 font-mono">{rateForAccount.toFixed(2)} Bs/$</span>
              </span>
              {parseFloat(amount) > 0 && (
                <span className="text-[9px] font-bold text-white/30 ml-auto">
                  ≈ <span className="text-white/60 font-mono">Bs {(parseFloat(amount) * rateForAccount).toFixed(2)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Select invoices */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] overflow-hidden shadow-lg">
          <div className="px-4 sm:px-6 py-3 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Facturas {accountType} (opcional)
            </h3>
            {selectedInvoices.size > 0 && (
              <span className="text-[9px] font-black text-indigo-400">
                {selectedInvoices.size} sel. · {formatCurrency(selectedTotal, '$')}
              </span>
            )}
          </div>

          {unpaidInvoices.length === 0 ? (
            <div className="py-10 text-center px-4">
              <p className="text-xs font-bold text-white/20">
                No hay facturas pendientes en {accountType}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05] max-h-[240px] overflow-y-auto overscroll-contain">
              {unpaidInvoices.map((inv) => {
                const isSelected = selectedInvoices.has(inv.id);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => toggleInvoice(inv.id)}
                    className={`w-full px-4 sm:px-6 py-3 flex items-center gap-3 text-left transition-colors active:bg-white/[0.04] ${
                      isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-white/20'
                      }`}
                    >
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white/70 truncate">{inv.concept}</p>
                      <p className="text-[9px] text-white/30">
                        {inv.date} · {(inv as any).nroControl || ''}
                      </p>
                    </div>
                    <span className="text-sm font-black text-white/60 font-mono shrink-0">
                      {formatCurrency(inv.amountInUSD || inv.amount, '$')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment details */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg space-y-4">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
            Datos del Pago
          </h3>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Monto (USD)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white/30">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedTotal > 0 ? selectedTotal.toFixed(2) : '0.00'}
                required
                className="flex-1 px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-lg font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/10"
              />
            </div>
            {selectedTotal > 0 && !amount && (
              <button
                type="button"
                onClick={() => setAmount(selectedTotal.toFixed(2))}
                className="mt-1.5 text-[9px] font-black text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Usar total seleccionado: ${selectedTotal.toFixed(2)}
              </button>
            )}
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Método de Pago
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
            >
              <option value="Transferencia">Transferencia Bancaria</option>
              <option value="Pago Móvil">Pago Móvil</option>
              <option value="Zelle">Zelle</option>
              <option value="Binance">Binance Pay</option>
              <option value="PayPal">PayPal</option>
              <option value="Efectivo USD">Efectivo USD</option>
              <option value="Efectivo Bs">Efectivo Bs</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Referencia / Comprobante
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nro. de referencia o comprobante"
              required
              className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/15"
            />
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Nota (opcional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Comentario adicional"
              className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/15"
            />
          </div>
        </div>

        {/* Conversion helper */}
        {rateForAccount > 0 && parseFloat(amount) > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
            <Info size={12} className="text-indigo-400 shrink-0" />
            <p className="text-[10px] font-bold text-indigo-300/70">
              ${parseFloat(amount).toFixed(2)} USD × {rateForAccount.toFixed(2)} = <span className="text-indigo-300 font-mono">Bs {(parseFloat(amount) * rateForAccount).toFixed(2)}</span>
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !amount || parseFloat(amount) <= 0 || !reference}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CreditCard size={14} />
          {submitting ? 'Enviando...' : 'Enviar Pago para Aprobación'}
        </button>
      </form>
    </div>
  );
}
