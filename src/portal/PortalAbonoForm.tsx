import React, { useState, useMemo, useEffect } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { formatCurrency } from '../utils/formatters';
import { AccountType, MovementType, PortalPayment, BusinessBankAccount } from '../../types';
import { addDoc, collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendPaymentPendingEmail } from '../utils/emailService';
import {
  CreditCard,
  Check,
  AlertCircle,
  ArrowUpDown,
  Info,
  Download,
  Loader2,
  Search,
  Copy,
  CheckCircle2,
  Image as ImageIcon,
  X,
  Calendar,
  Phone,
  AlertTriangle,
  Landmark,
} from 'lucide-react';
import {
  getBancoByCode,
  getInstructionsTemplate,
  CEDULA_VE_REGEX,
  PHONE_VE_REGEX,
  REFERENCE_6_REGEX,
} from '../data/bancosVE';

const CUSTOM_COLORS = ['violet', 'emerald', 'amber'] as const;

// SHA-256 fingerprint via SubtleCrypto
async function buildFingerprint(bankAccountId: string, reference: string, amount: number): Promise<string> {
  const raw = `${bankAccountId}|${reference.trim()}|${amount.toFixed(2)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function PortalAbonoForm() {
  const { businessId, customerId, customerName, businessName, currencySymbol } = usePortal();
  const { movements, portalPayments, loading, balances, rates } = usePortalData(businessId, customerId);

  // ── Bank accounts del negocio ──────────────────────────────────────────────
  const [bankAccounts, setBankAccounts] = useState<BusinessBankAccount[]>([]);
  const [adminEmail, setAdminEmail] = useState<string>('');

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      collection(db, `businesses/${businessId}/bankAccounts`),
      snap => {
        const rows: BusinessBankAccount[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        // Solo cuentas habilitadas y NO efectivo (caja chica no es para portal)
        setBankAccounts(rows.filter(a => a.enabled && a.accountType !== 'efectivo'));
      },
      err => console.error('[portal] bankAccounts', err),
    );
    return unsub;
  }, [businessId]);

  // Cargar email del admin para notificación
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'businesses', businessId));
        if (snap.exists()) {
          const data = snap.data() as any;
          setAdminEmail(data?.ownerEmail || data?.adminEmail || data?.email || '');
        }
      } catch { /* swallow */ }
    })();
  }, [businessId]);

  // Account options dinámicas (BCV + custom rates) — para FILTRAR FACTURAS
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
    if (customRates.length === 0) {
      if (rates.grupo > 0) opts.push({ value: AccountType.GRUPO, label: 'Grupo', color: 'violet', rate: rates.grupo });
      if (rates.divisa > 0) opts.push({ value: AccountType.DIVISA, label: 'Divisa', color: 'emerald', rate: rates.divisa });
    }
    return opts;
  }, [rates]);

  // ── State del formulario ───────────────────────────────────────────────────
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [accountType, setAccountType] = useState<AccountType>(AccountType.BCV);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState<BusinessBankAccount | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [payerCedula, setPayerCedula] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherPreview, setVoucherPreview] = useState<string | null>(null);
  const [voucherUploading, setVoucherUploading] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastPayment, setLastPayment] = useState<{ amount: number; method: string; reference: string; account: string; date: string } | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');

  // Cuando cambia la cuenta seleccionada, limpiar el teléfono si ya no aplica
  useEffect(() => {
    if (selectedBankAccount?.accountType !== 'pago_movil') {
      setPayerPhone('');
    }
  }, [selectedBankAccount]);

  // ── Filtrado de bancos por búsqueda ────────────────────────────────────────
  const filteredBankAccounts = useMemo(() => {
    if (!bankSearch.trim()) return bankAccounts;
    const q = bankSearch.toLowerCase();
    return bankAccounts.filter(acc => {
      const banco = getBancoByCode(acc.bankCode);
      return (
        (banco?.shortName || '').toLowerCase().includes(q) ||
        (banco?.name || '').toLowerCase().includes(q) ||
        acc.accountNumber.toLowerCase().includes(q) ||
        acc.holderName.toLowerCase().includes(q)
      );
    });
  }, [bankAccounts, bankSearch]);

  // Agrupar cuentas por banco para visual
  const groupedBankAccounts = useMemo(() => {
    const groups: Record<string, BusinessBankAccount[]> = {};
    filteredBankAccounts.forEach(a => {
      if (!groups[a.bankCode]) groups[a.bankCode] = [];
      groups[a.bankCode].push(a);
    });
    return groups;
  }, [filteredBankAccounts]);

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

  // ── Voucher upload ─────────────────────────────────────────────────────────
  const handleVoucherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setValidationError('El comprobante debe ser una imagen (JPG, PNG)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('El archivo no puede superar 5 MB');
      return;
    }
    setValidationError('');
    setVoucherFile(file);
    setVoucherPreview(URL.createObjectURL(file));
  };

  const handleClearVoucher = () => {
    if (voucherPreview) URL.revokeObjectURL(voucherPreview);
    setVoucherFile(null);
    setVoucherPreview(null);
  };

  // ── Copiar al portapapeles ─────────────────────────────────────────────────
  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => { /* swallow */ });
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    if (submitting) return;

    // Validaciones
    if (!selectedBankAccount) {
      setValidationError('Selecciona una cuenta destino');
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setValidationError('Monto inválido');
      return;
    }
    if (!REFERENCE_6_REGEX.test(reference.trim())) {
      setValidationError('La referencia debe tener exactamente 6 dígitos');
      return;
    }
    if (!CEDULA_VE_REGEX.test(payerCedula.trim().toUpperCase())) {
      setValidationError('Cédula inválida (formato: V-12345678)');
      return;
    }
    // Fecha de pago: no futuro, no más de 7 días atrás
    const payDateMs = new Date(paymentDate).getTime();
    const nowMs = Date.now();
    if (payDateMs > nowMs + 86_400_000) {
      setValidationError('La fecha de pago no puede ser futura');
      return;
    }
    if (nowMs - payDateMs > 7 * 86_400_000) {
      setValidationError('La fecha de pago no puede ser mayor a 7 días atrás');
      return;
    }
    // Pago móvil: teléfono obligatorio
    if (selectedBankAccount.accountType === 'pago_movil') {
      const cleanPhone = payerPhone.replace(/[^\d]/g, '');
      if (!PHONE_VE_REGEX.test(cleanPhone)) {
        setValidationError('Teléfono del pagador inválido (formato VE: 04XX-XXXXXXX)');
        return;
      }
    }
    if (!voucherFile) {
      setValidationError('Debes subir el comprobante (foto)');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Calcular fingerprint y pre-check duplicado
      const fingerprint = await buildFingerprint(selectedBankAccount.id, reference.trim(), amt);
      const dupSnap = await getDocs(query(
        collection(db, `businesses/${businessId}/portalPayments`),
        where('fingerprint', '==', fingerprint),
      ));
      const hasActiveDup = dupSnap.docs.some(d => {
        const status = (d.data() as any).status;
        return status === 'pending' || status === 'approved';
      });
      if (hasActiveDup) {
        setValidationError('Esta referencia ya fue registrada anteriormente. Si crees que es un error, contacta al negocio.');
        setSubmitting(false);
        return;
      }

      // 2. Subir voucher a Cloudinary
      setVoucherUploading(true);
      const uploaded = await uploadToCloudinary(voucherFile, 'dualis_payments');
      setVoucherUploading(false);

      // 3. Crear PortalPayment
      const cleanPhone = payerPhone.replace(/[^\d]/g, '');
      const methodLabel = selectedBankAccount.accountType === 'pago_movil'
        ? 'Pago Móvil'
        : selectedBankAccount.accountType === 'zelle'
        ? 'Zelle'
        : selectedBankAccount.accountType === 'binance'
        ? 'Binance'
        : selectedBankAccount.accountType === 'paypal'
        ? 'PayPal'
        : 'Transferencia';

      const payment: Omit<PortalPayment, 'id'> = {
        businessId,
        customerId,
        customerName,
        invoiceIds: Array.from(selectedInvoices),
        accountType,
        amount: amt,
        metodoPago: methodLabel,
        referencia: reference.trim(),
        nota: note || undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
        bankAccountId: selectedBankAccount.id,
        voucherUrl: uploaded.secure_url,
        payerCedula: payerCedula.trim().toUpperCase(),
        payerPhone: cleanPhone || undefined,
        paymentDate,
        fingerprint,
      };
      await addDoc(collection(db, 'businesses', businessId, 'portalPayments'), payment);

      // 4. Notificar al admin (no bloqueante)
      if (adminEmail) {
        sendPaymentPendingEmail(adminEmail, {
          customerName,
          amount: amt,
          bankName: selectedBankAccount.bankName,
          reference: reference.trim(),
          businessName: businessName || 'Mi Negocio',
        }).catch(() => { /* swallow */ });
      }

      setLastPayment({ amount: amt, method: methodLabel, reference: reference.trim(), account: accountType, date: new Date().toLocaleString('es-VE') });
      setSubmitted(true);
    } catch (err: any) {
      console.error(err);
      setValidationError(err?.message || 'Error al enviar el pago. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
      setVoucherUploading(false);
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
      const pdf = new jsPDF({ unit: 'mm', format: [80, 160] });

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
      row('MONTO', `${currencySymbol}${lastPayment.amount.toFixed(2)}`);
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
        <p className="text-sm text-white/40 mb-2 leading-relaxed">
          Tu pago ha sido enviado para aprobación.
        </p>
        <p className="text-[11px] text-amber-400/80 mb-4 leading-relaxed">
          ⓘ El procesamiento es <strong>manual</strong>. Recibirás notificación cuando sea revisado.
        </p>
        {lastPayment && (
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 mb-4 text-left space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-white/30 font-bold">Monto</span>
              <span className="text-emerald-400 font-black font-mono">{currencySymbol}{lastPayment.amount.toFixed(2)}</span>
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
              setSelectedBankAccount(null);
              setAmount('');
              setReference('');
              setNote('');
              setPayerCedula('');
              setPayerPhone('');
              setPaymentDate(new Date().toISOString().split('T')[0]);
              handleClearVoucher();
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
  const showPhoneField = selectedBankAccount?.accountType === 'pago_movil';

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Registrar Pago</h1>
        <p className="text-xs sm:text-sm text-white/40 font-bold mt-1">
          Selecciona la cuenta destino, sube el comprobante y envía
        </p>
      </div>

      {/* Banner manual processing */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] font-black text-amber-300 leading-snug">
            Los pagos del portal se procesan <span className="underline">manualmente</span>.
          </p>
          <p className="text-[10px] text-amber-300/70 mt-1 leading-relaxed">
            Tu pago aparecerá como <strong>pendiente</strong> hasta que el administrador lo confirme contra su banco. Recibirás notificación cuando sea aprobado o rechazado.
          </p>
        </div>
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
              Total: {formatCurrency(pendingPayments.reduce((s, p) => s + p.amount, 0), currencySymbol)}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Selector de cuenta destino ─────────────────────────────────── */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Cuenta destino
            </h3>
            {bankAccounts.length > 0 && (
              <span className="text-[9px] text-white/30 font-bold">
                {bankAccounts.length} cuenta{bankAccounts.length !== 1 ? 's' : ''} disponible{bankAccounts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {bankAccounts.length === 0 ? (
            <div className="py-8 text-center px-3 bg-rose-500/5 border border-rose-500/20 rounded-xl">
              <AlertCircle size={20} className="text-rose-400 mx-auto mb-2" />
              <p className="text-[11px] font-black text-rose-300">El negocio aún no ha configurado cuentas de cobro.</p>
              <p className="text-[10px] text-rose-300/60 mt-1">Contacta al administrador para registrar un pago.</p>
            </div>
          ) : (
            <>
              {/* Búsqueda */}
              {bankAccounts.length > 3 && (
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={bankSearch}
                    onChange={e => setBankSearch(e.target.value)}
                    placeholder="Buscar banco o cuenta..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-white/20"
                  />
                </div>
              )}

              {/* Grid agrupado por banco */}
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {(Object.entries(groupedBankAccounts) as [string, BusinessBankAccount[]][]).map(([bankCode, accs]) => {
                  const banco = getBancoByCode(bankCode);
                  return (
                    <div key={bankCode}>
                      {accs.length > 1 && (
                        <p
                          className="text-[9px] font-black uppercase tracking-widest mb-1.5"
                          style={{ color: banco?.color || '#94a3b8' }}
                        >
                          {banco?.name || bankCode}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {accs.map(acc => {
                          const isActive = selectedBankAccount?.id === acc.id;
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => setSelectedBankAccount(acc)}
                              className={`rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                                isActive
                                  ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                                  : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                  style={{ background: `${banco?.color || '#4f6ef7'}20`, color: banco?.color || '#4f6ef7' }}
                                >
                                  <Landmark size={13} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-black text-white truncate">{banco?.shortName || acc.bankName}</p>
                                  <p className="text-[9px] text-white/40 font-bold mt-0.5 truncate">
                                    {acc.accountType === 'pago_movil' ? 'Pago Móvil' :
                                     acc.accountType === 'zelle' ? 'Zelle' :
                                     acc.accountType === 'binance' ? 'Binance' :
                                     acc.accountType === 'paypal' ? 'PayPal' :
                                     acc.accountType === 'corriente' ? 'Corriente' : 'Ahorro'}
                                    {' · '}
                                    {acc.accountNumber.length > 8 ? `…${acc.accountNumber.slice(-4)}` : acc.accountNumber}
                                  </p>
                                </div>
                                {isActive && <CheckCircle2 size={14} className="text-indigo-400 shrink-0" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {filteredBankAccounts.length === 0 && bankSearch && (
                  <p className="text-[10px] text-white/30 text-center py-4">No hay cuentas que coincidan con "{bankSearch}"</p>
                )}
              </div>

              {/* Instrucciones de la cuenta seleccionada */}
              {selectedBankAccount && (
                <div className="mt-3 bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Instrucciones de pago</p>
                  <pre className="text-[11px] text-white/70 font-mono whitespace-pre-wrap leading-relaxed">{getInstructionsTemplate(selectedBankAccount)}</pre>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCopy('account', selectedBankAccount.accountNumber)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-black text-white/60 transition-all"
                    >
                      {copiedField === 'account' ? <Check size={10} /> : <Copy size={10} />}
                      {copiedField === 'account' ? 'Copiado' : 'Cuenta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('holder', selectedBankAccount.holderName)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-black text-white/60 transition-all"
                    >
                      {copiedField === 'holder' ? <Check size={10} /> : <Copy size={10} />}
                      Titular
                    </button>
                    {selectedBankAccount.holderDocument && (
                      <button
                        type="button"
                        onClick={() => handleCopy('doc', selectedBankAccount.holderDocument)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[9px] font-black text-white/60 transition-all"
                      >
                        {copiedField === 'doc' ? <Check size={10} /> : <Copy size={10} />}
                        C.I./RIF
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Selector de tipo de cuenta (BCV / Custom) — para FACTURAS ─── */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-5 shadow-lg">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
            Cuenta a Abonar (saldo)
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
                    {currencySymbol}{bal > 0 ? bal.toFixed(2) : '0.00'}
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
              Documentos {accountType} (opcional)
            </h3>
            {selectedInvoices.size > 0 && (
              <span className="text-[9px] font-black text-indigo-400">
                {selectedInvoices.size} sel. · {formatCurrency(selectedTotal, currencySymbol)}
              </span>
            )}
          </div>

          {unpaidInvoices.length === 0 ? (
            <div className="py-10 text-center px-4">
              <p className="text-xs font-bold text-white/20">
                No hay documentos pendientes en {accountType}
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
                      {formatCurrency(inv.amountInUSD || inv.amount, currencySymbol)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Datos del pago */}
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-4 sm:p-6 shadow-lg space-y-4">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">
            Datos del Pago
          </h3>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Monto (USD) *
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
                Usar total seleccionado: {currencySymbol}{selectedTotal.toFixed(2)}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
                Referencia (6 dígitos) *
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                required
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/15 font-mono tracking-widest"
              />
              <p className="text-[9px] text-white/30 mt-1">{reference.length}/6 dígitos</p>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
                Cédula del pagador *
              </label>
              <input
                value={payerCedula}
                onChange={(e) => setPayerCedula(e.target.value.toUpperCase())}
                placeholder="V-12345678"
                required
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-white/15"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              <Calendar size={10} className="inline mr-1" />
              Fecha del pago *
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              min={new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]}
              required
              className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Teléfono del pagador — SOLO si pago móvil */}
          {showPhoneField && (
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-amber-300 mb-1.5 block">
                <Phone size={10} className="inline mr-1" />
                Teléfono del pagador * (Pago Móvil)
              </label>
              <input
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                placeholder="04141234567"
                inputMode="tel"
                required
                className="w-full px-4 py-3 bg-amber-500/5 border border-amber-500/30 rounded-xl text-sm font-bold text-white focus:ring-2 focus:ring-amber-500 outline-none placeholder:text-white/15 font-mono"
              />
              <p className="text-[9px] text-amber-300/60 mt-1">
                El banco identifica el pago móvil por teléfono. Usa el número desde el cual hiciste el pago.
              </p>
            </div>
          )}

          {/* Voucher upload */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Comprobante (foto) *
            </label>
            {!voucherPreview ? (
              <label className="flex flex-col items-center justify-center gap-2 w-full py-6 bg-white/[0.04] border-2 border-dashed border-white/[0.1] rounded-xl cursor-pointer hover:bg-white/[0.06] transition-all">
                <ImageIcon size={20} className="text-white/30" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Subir foto</span>
                <span className="text-[9px] text-white/20">JPG/PNG · máx 5 MB</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleVoucherChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="relative inline-block">
                <img src={voucherPreview} alt="voucher" className="w-32 h-32 object-cover rounded-xl border border-white/[0.08]" />
                <button
                  type="button"
                  onClick={handleClearVoucher}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg"
                >
                  <X size={11} />
                </button>
              </div>
            )}
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
              {currencySymbol}{parseFloat(amount).toFixed(2)} USD × {rateForAccount.toFixed(2)} = <span className="text-indigo-300 font-mono">Bs {(parseFloat(amount) * rateForAccount).toFixed(2)}</span>
            </p>
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-rose-300">{validationError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            voucherUploading ||
            !selectedBankAccount ||
            !amount ||
            parseFloat(amount) <= 0 ||
            !reference ||
            !payerCedula ||
            !voucherFile ||
            (showPhoneField && !payerPhone)
          }
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {submitting || voucherUploading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
          {voucherUploading ? 'Subiendo comprobante...' : submitting ? 'Enviando...' : 'Enviar Pago para Aprobación'}
        </button>
      </form>
    </div>
  );
}
