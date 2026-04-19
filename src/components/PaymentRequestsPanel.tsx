import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { PaymentRequest, AccountType, MovementType, BusinessBankAccount } from '../../types';
import {
  CheckCircle2, XCircle, Clock, Search, Receipt,
  ChevronDown, Banknote, Globe, Eye, ShieldCheck, ShieldAlert,
  Phone, IdCard, Calendar as CalendarIcon, Landmark,
} from 'lucide-react';
import { PortalPayment } from '../../types';
import VoucherViewer from './tesoreria/VoucherViewer';
import { getBancoByCode, CEDULA_VE_REGEX, REFERENCE_6_REGEX } from '../data/bancosVE';
import { sendPaymentApprovedEmail, sendPaymentRejectedEmail } from '../utils/emailService';
import { uploadToCloudinary } from '../utils/cloudinary';
import { applyLoyaltyForMovement } from '../utils/loyaltyEngine';
import { applyAbonoAllocations, computeFifoAllocations } from '../utils/invoiceAllocations';

interface PaymentRequestsPanelProps {
  businessId: string;
  businessName?: string;
  userRole: string;
  userId: string;
  userName: string;
  rates: { bcv: number; grupo: number; divisa: number };
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  approved: { label: 'Aprobado',  color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  rejected: { label: 'Rechazado', color: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' },
};

const ACCOUNT_COLORS: Record<string, string> = {
  BCV:    'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400',
  GRUPO:  'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400',
  DIVISA: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

// Extended PaymentRequest with portal fields
type PortalReq = PaymentRequest & {
  _source: 'vendedor' | 'portal';
  voucherUrl?: string;
  payerCedula?: string;
  payerPhone?: string;
  paymentDate?: string;
  bankAccountId?: string;
  fingerprint?: string;
  invoiceIds?: string[];
};

const PaymentRequestsPanel: React.FC<PaymentRequestsPanelProps> = ({
  businessId, businessName = 'tu negocio', userRole, userId, userName, rates,
}) => {
  const [requests, setRequests] = useState<PortalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voucherView, setVoucherView] = useState<{ url: string; caption?: string } | null>(null);
  const [bankAccountsMap, setBankAccountsMap] = useState<Record<string, BusinessBankAccount>>({});
  const [customerEmails, setCustomerEmails] = useState<Record<string, string>>({});

  // New request form (for vendors)
  const [showNewForm, setShowNewForm] = useState(false);
  const [newReq, setNewReq] = useState({
    customerId: '', customerName: '', accountType: AccountType.BCV,
    amount: '', metodoPago: 'Transferencia', referencia: '', nota: '',
  });
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const isAdmin = userRole === 'owner' || userRole === 'admin';

  // Load requests realtime (vendedor + portal)
  useEffect(() => {
    if (!businessId) return;
    let vendorRows: PortalReq[] = [];
    let portalRows: PortalReq[] = [];

    const merge = () => {
      const all = [...vendorRows, ...portalRows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRequests(all);
      setLoading(false);
    };

    const unsubVendor = onSnapshot(
      query(collection(db, `businesses/${businessId}/paymentRequests`), orderBy('createdAt', 'desc')),
      snap => {
        vendorRows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any), _source: 'vendedor' as const } as PortalReq));
        merge();
      },
      err => { console.error('Error loading vendor requests:', err); setLoading(false); },
    );

    const unsubPortal = onSnapshot(
      query(collection(db, `businesses/${businessId}/portalPayments`), orderBy('createdAt', 'desc')),
      snap => {
        portalRows = snap.docs.map(d => {
          const data = d.data() as PortalPayment;
          return {
            id: d.id!,
            businessId: data.businessId,
            customerId: data.customerId,
            customerName: data.customerName,
            accountType: data.accountType,
            amount: data.amount,
            currency: 'USD' as const,
            metodoPago: data.metodoPago,
            referencia: data.referencia,
            nota: data.nota,
            status: data.status,
            createdAt: data.createdAt,
            reviewedAt: data.reviewedAt,
            reviewedBy: data.reviewedBy,
            reviewNote: data.reviewNote,
            vendedorId: '__portal__',
            vendedorNombre: 'Portal Cliente',
            _source: 'portal' as const,
            voucherUrl: data.voucherUrl,
            payerCedula: data.payerCedula,
            payerPhone: data.payerPhone,
            paymentDate: data.paymentDate,
            bankAccountId: data.bankAccountId,
            fingerprint: data.fingerprint || undefined,
            invoiceIds: data.invoiceIds,
          } as PortalReq;
        });
        merge();
      },
      err => { console.error('Error loading portal requests:', err); setLoading(false); },
    );

    return () => { unsubVendor(); unsubPortal(); };
  }, [businessId]);

  // Load bank accounts for the business (for badge validation)
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      collection(db, `businesses/${businessId}/bankAccounts`),
      snap => {
        const map: Record<string, BusinessBankAccount> = {};
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...(d.data() as any) }; });
        setBankAccountsMap(map);
      },
    );
    return unsub;
  }, [businessId]);

  // Load customers for vendor form (and capture emails for notifications)
  useEffect(() => {
    if (!businessId) return;
    const load = async () => {
      const snap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)));
      const list: { id: string; name: string }[] = [];
      const emails: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data() as any;
        const name = data.fullName || data.nombre || d.id;
        list.push({ id: d.id, name });
        if (data.email) emails[d.id] = data.email;
      });
      setCustomers(list);
      setCustomerEmails(emails);
    };
    load();
  }, [businessId]);

  // ── Fingerprint match index ────────────────────────────────────────────────
  const fingerprintIndex = useMemo(() => {
    const idx: Record<string, { approved: number; rejected: number; pending: number }> = {};
    requests.forEach(r => {
      if (!r.fingerprint) return;
      if (!idx[r.fingerprint]) idx[r.fingerprint] = { approved: 0, rejected: 0, pending: 0 };
      if (r.status === 'approved') idx[r.fingerprint].approved += 1;
      else if (r.status === 'rejected') idx[r.fingerprint].rejected += 1;
      else if (r.status === 'pending') idx[r.fingerprint].pending += 1;
    });
    return idx;
  }, [requests]);

  const filtered = useMemo(() => {
    let list = requests;
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    if (!isAdmin) list = list.filter(r => r.vendedorId === userId);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(r =>
        r.customerName.toLowerCase().includes(s) ||
        r.referencia?.toLowerCase().includes(s) ||
        r.vendedorNombre?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [requests, statusFilter, searchTerm, isAdmin, userId]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Approve request → create ABONO movement (with portal extras + back-fill)
  const handleApprove = async (req: PortalReq) => {
    setProcessing(req.id);
    try {
      const now = new Date();
      const rateForAccount = req.accountType === AccountType.BCV ? rates.bcv
        : req.accountType === AccountType.GRUPO ? rates.grupo : rates.divisa;
      const isDivisaAcct = req.accountType === AccountType.DIVISA;
      const isPortal = req._source === 'portal';

      // Build movement payload — inject portal fields if applicable
      const movementPayload: any = {
        businessId,
        entityId: req.customerId,
        concept: `Abono — ${req.metodoPago}${req.nota ? ` — ${req.nota}` : ''}`,
        amount: req.amount,
        amountInUSD: req.amount,
        currency: 'USD',
        date: req.paymentDate || now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        createdBy: userId,
        movementType: MovementType.ABONO,
        accountType: req.accountType,
        rateUsed: isDivisaAcct ? 0 : rateForAccount,
        reference: req.referencia || null,
        metodoPago: req.metodoPago,
        pagado: true,
        estadoPago: 'PAGADO',
      };
      if (isPortal) {
        if (req.bankAccountId) movementPayload.bankAccountId = req.bankAccountId;
        if (req.voucherUrl)    movementPayload.voucherUrl    = req.voucherUrl;
        if (req.payerCedula)   movementPayload.payerCedula   = req.payerCedula;
        if (req.payerPhone)    movementPayload.payerPhone    = req.payerPhone;
        if (req.paymentDate)   movementPayload.paymentDate   = req.paymentDate;
        movementPayload.portalPaymentId = req.id;
      }
      const movementRef = await addDoc(collection(db, 'movements'), movementPayload);

      // Loyalty: otorgar puntos al aprobar abono (fire-and-forget, mismo helper que MainSystem)
      applyLoyaltyForMovement(db, businessId, movementPayload, movementRef.id)
        .catch(err => console.error('[loyalty] portal-approve failed', err));

      // invoiceLinked — si el PortalPayment trae allocations, aplicarlas al ABONO
      // recién creado. Esto escribe per-factura `allocations` / `invoiceStatus` /
      // `allocatedTotal` y también setea `pagado:true` en facturas completamente
      // cubiertas, reemplazando el legacy back-fill en ese caso.
      const portalAllocs = (req as any).allocations as Array<{ invoiceId: string; invoiceRef?: string; amount: number }> | undefined;
      if (isPortal && Array.isArray(portalAllocs) && portalAllocs.length > 0) {
        try {
          await applyAbonoAllocations(db, movementRef.id, Number(req.amount), portalAllocs);
        } catch (err) {
          console.error('[paymentRequests] applyAbonoAllocations failed', err);
        }
      } else if (isPortal && Array.isArray(req.invoiceIds) && req.invoiceIds.length > 0) {
        // Legacy back-fill: si el monto del abono cubre la suma de las facturas,
        // marcarlas como PAGADO. Si parcial, dejar como está (solo el ABONO suma).
        try {
          let invoicesTotal = 0;
          const invoiceDocs = await Promise.all(
            req.invoiceIds.map(id => getDocs(query(
              collection(db, 'movements'),
              where('__name__', '==', id),
            )).then(s => s.docs[0])),
          );
          const validInvoices = invoiceDocs.filter(Boolean);
          validInvoices.forEach(d => {
            const data: any = d!.data();
            invoicesTotal += Number(data.amountInUSD || data.amount || 0);
          });
          // Si todas las facturas están en invoiceLinked (tienen invoiceStatus), aplicar FIFO
          const allInvoiceLinked = validInvoices.length > 0 && validInvoices.every(d => !!(d!.data() as any).invoiceStatus);
          if (allInvoiceLinked) {
            const fifoAllocs = computeFifoAllocations(
              validInvoices.map(d => ({ id: d!.id, ...(d!.data() as any) })) as any,
              Number(req.amount),
            );
            if (fifoAllocs.length > 0) {
              await applyAbonoAllocations(db, movementRef.id, Number(req.amount), fifoAllocs);
            }
          } else if (req.amount + 0.5 >= invoicesTotal) {
            // Tolerancia ±$0.50 — legacy accumulated
            await Promise.all(
              validInvoices.map(d => updateDoc(doc(db, 'movements', d!.id), {
                pagado: true,
                estadoPago: 'PAGADO',
              })),
            );
          }
        } catch (err) {
          console.error('[paymentRequests] back-fill facturas failed', err);
        }
      }

      // Update request status (in correct collection based on source)
      const collectionPath = isPortal
        ? `businesses/${businessId}/portalPayments`
        : `businesses/${businessId}/paymentRequests`;
      await updateDoc(doc(db, collectionPath, req.id), {
        status: 'approved',
        reviewedAt: now.toISOString(),
        reviewedBy: userId,
        reviewNote: reviewNote || null,
      });

      // Generar PDF de comprobante (lazy import) — solo para pagos del portal
      let receiptPdfUrl: string | undefined;
      if (isPortal) {
        try {
          const { generatePaymentReceiptPDF } = await import('../utils/paymentReceiptPdf');
          const bankAcct = req.bankAccountId ? bankAccountsMap[req.bankAccountId] : undefined;
          const pdfBlob = await generatePaymentReceiptPDF({
            payment: { ...req, status: 'approved', reviewedAt: now.toISOString() } as any,
            business: { id: businessId, name: businessName },
            customer: { name: req.customerName, cedula: req.payerCedula },
            bankName: bankAcct?.bankName,
            approvedAt: now.toISOString(),
          });
          const upload = await uploadToCloudinary(
            pdfBlob,
            'dualis_payments',
            'auto',
            `recibo-${req.id}.pdf`,
          );
          receiptPdfUrl = upload.secure_url;
          await updateDoc(doc(db, 'movements', movementRef.id), { receiptPdfUrl });
        } catch (err) {
          console.warn('[paymentRequests] PDF generation failed (non-blocking)', err);
        }
      }

      // Notificar al cliente (no bloqueante)
      const customerEmail = customerEmails[req.customerId];
      if (customerEmail) {
        sendPaymentApprovedEmail(customerEmail, {
          customerName: req.customerName,
          amount: req.amount,
          businessName,
          reviewNote: reviewNote || undefined,
          receiptPdfUrl,
        }).catch(() => { /* swallow */ });
      }

      setExpandedId(null);
      setReviewNote('');
      showToast('Abono aprobado y registrado');
    } catch (err) {
      console.error(err);
      showToast('Error al aprobar');
    } finally {
      setProcessing(null);
    }
  };

  // Reject request
  const handleReject = async (req: PortalReq) => {
    if (!reviewNote.trim()) {
      const reason = window.prompt('Motivo del rechazo (visible para el cliente):', 'Pago no recibido en banco');
      if (!reason || !reason.trim()) return;
      setReviewNote(reason.trim());
    }
    setProcessing(req.id);
    try {
      const collPath = req._source === 'portal'
        ? `businesses/${businessId}/portalPayments`
        : `businesses/${businessId}/paymentRequests`;
      const reasonText = reviewNote || 'Sin motivo especificado';
      await updateDoc(doc(db, collPath, req.id), {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: userId,
        reviewNote: reasonText,
      });

      // Notificar al cliente
      const customerEmail = customerEmails[req.customerId];
      if (customerEmail) {
        sendPaymentRejectedEmail(customerEmail, {
          customerName: req.customerName,
          amount: req.amount,
          businessName,
          reason: reasonText,
        }).catch(() => { /* swallow */ });
      }

      setExpandedId(null);
      setReviewNote('');
      showToast('Solicitud rechazada');
    } catch (err) {
      console.error(err);
      showToast('Error al rechazar');
    } finally {
      setProcessing(null);
    }
  };

  // Submit new request (vendor)
  const handleSubmitRequest = async () => {
    if (!newReq.customerId || !newReq.amount || parseFloat(newReq.amount) <= 0) return;
    setSubmitting(true);
    try {
      const payload: Omit<PaymentRequest, 'id'> = {
        businessId,
        customerId: newReq.customerId,
        customerName: newReq.customerName,
        accountType: newReq.accountType,
        amount: parseFloat(newReq.amount),
        currency: 'USD',
        metodoPago: newReq.metodoPago,
        referencia: newReq.referencia,
        nota: newReq.nota || undefined,
        vendedorId: userId,
        vendedorNombre: userName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      const docRef = await addDoc(collection(db, `businesses/${businessId}/paymentRequests`), payload);
      setRequests(prev => [{ id: docRef.id, ...payload } as PortalReq, ...prev]);
      setNewReq({ customerId: '', customerName: '', accountType: AccountType.BCV as any, amount: '', metodoPago: 'Transferencia', referencia: '', nota: '' });
      setShowNewForm(false);
      setCustomerSearch('');
      showToast('Solicitud de abono enviada');
    } catch (err) {
      console.error(err);
      showToast('Error al enviar solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const s = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)).slice(0, 8);
  }, [customerSearch, customers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in zoom-in-95 duration-300">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[400] px-5 py-3 bg-emerald-600 text-white text-xs font-black rounded-xl shadow-xl animate-in slide-in-from-top duration-300">
          <CheckCircle2 size={14} className="inline mr-2" />{toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/25">
              <Receipt size={18} />
            </div>
            Solicitudes de Abono
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin ? 'Revisa y aprueba los pagos registrados por vendedores' : 'Registra pagos de clientes para aprobación del administrador'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="px-3 py-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest">
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[10px] font-black uppercase tracking-widest hover:from-violet-700 hover:to-purple-700 shadow-md shadow-violet-500/25 transition-all flex items-center gap-2"
          >
            <Banknote size={14} /> Nueva Solicitud
          </button>
        </div>
      </div>

      {/* New request form */}
      {showNewForm && (
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] shadow-lg">
          <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Banknote size={16} className="text-violet-500" /> Registrar Pago de Cliente
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer search */}
            <div className="relative sm:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Cliente</label>
              {newReq.customerId ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl">
                  <span className="text-sm font-black text-violet-700 dark:text-violet-300 flex-1">{newReq.customerName}</span>
                  <button onClick={() => { setNewReq(p => ({ ...p, customerId: '', customerName: '' })); setCustomerSearch(''); }}
                    className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600">Cambiar</button>
                </div>
              ) : (
                <>
                  <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Buscar cliente..."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
                  {filteredCustomers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-white/[0.07] z-50 max-h-48 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button key={c.id} onClick={() => { setNewReq(p => ({ ...p, customerId: c.id, customerName: c.name })); setCustomerSearch(''); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.04] text-xs font-bold text-slate-700 dark:text-slate-300">
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Account type */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Cuenta</label>
              <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl p-1 border border-slate-200 dark:border-white/[0.08]">
                {([AccountType.BCV, AccountType.GRUPO, AccountType.DIVISA]).map(acct => (
                  <button key={acct} onClick={() => setNewReq(p => ({ ...p, accountType: acct as any }))}
                    className={`flex-1 px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center ${newReq.accountType === acct ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>
                    {acct}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Monto (USD)</label>
              <input type="number" min="0" step="0.01" value={newReq.amount} onChange={e => setNewReq(p => ({ ...p, amount: e.target.value }))} placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>

            {/* Method */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Método</label>
              <select value={newReq.metodoPago} onChange={e => setNewReq(p => ({ ...p, metodoPago: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white">
                <option>Transferencia</option>
                <option>Pago Móvil</option>
                <option>Efectivo USD</option>
                <option>Efectivo Bs</option>
                <option>Zelle</option>
                <option>Binance</option>
              </select>
            </div>

            {/* Reference */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Referencia</label>
              <input value={newReq.referencia} onChange={e => setNewReq(p => ({ ...p, referencia: e.target.value }))} placeholder="Nro. comprobante"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>

            {/* Note */}
            <div className="sm:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Nota (opcional)</label>
              <input value={newReq.nota} onChange={e => setNewReq(p => ({ ...p, nota: e.target.value }))} placeholder="Descripción del pago"
                className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowNewForm(false)}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">
              Cancelar
            </button>
            <button onClick={handleSubmitRequest} disabled={!newReq.customerId || !newReq.amount || parseFloat(newReq.amount) <= 0 || submitting}
              className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${newReq.customerId && parseFloat(newReq.amount || '0') > 0 && !submitting ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-300 cursor-not-allowed'}`}>
              {submitting ? 'Enviando...' : <><Receipt size={14} /> Enviar Solicitud</>}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por cliente, referencia..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl p-1 border border-slate-200 dark:border-white/[0.08]">
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>
              {s === 'all' ? 'Todos' : STATUS_CONFIG[s].label}
              {s === 'pending' && pendingCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500 text-white rounded-md text-[8px]">{pendingCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Requests list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-16 w-16 rounded-3xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center mb-4">
            <Receipt size={28} className="text-slate-300" />
          </div>
          <p className="text-sm font-black text-slate-300 dark:text-white/20 uppercase tracking-widest">Sin solicitudes</p>
          <p className="text-xs text-slate-300 dark:text-white/15 mt-1">
            {statusFilter === 'pending' ? 'No hay abonos pendientes de aprobación' : 'No se encontraron solicitudes con este filtro'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isExpanded = expandedId === req.id;
            const isPending = req.status === 'pending';
            const isProcessing = processing === req.id;

            return (
              <div key={req.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm transition-all ${isPending ? 'border-amber-200 dark:border-amber-500/20' : 'border-slate-100 dark:border-white/[0.07]'}`}>
                <div className="p-4 sm:p-5 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : req.id)}>
                  {/* Status icon */}
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isPending ? 'bg-amber-50 dark:bg-amber-500/10' : req.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                    {isPending ? <Clock size={18} className="text-amber-500" /> : req.status === 'approved' ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800 dark:text-white truncate">{req.customerName}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase border ${STATUS_CONFIG[req.status].color}`}>
                        {STATUS_CONFIG[req.status].label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${ACCOUNT_COLORS[req.accountType] || ''}`}>
                        {req.accountType}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400 font-bold">
                      <span>{req.metodoPago}</span>
                      {req.referencia && <span>Ref: {req.referencia}</span>}
                      <span>{new Date(req.createdAt).toLocaleDateString('es-VE')}</span>
                      {isAdmin && (req as any)._source === 'portal' ? (
                        <span className="inline-flex items-center gap-1 text-indigo-400"><Globe size={9} /> Portal</span>
                      ) : isAdmin && (
                        <span className="text-violet-400">por {req.vendedorNombre}</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-800 dark:text-white">${req.amount.toFixed(2)}</p>
                  </div>

                  {/* Expand */}
                  <ChevronDown size={16} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>

                {/* Expanded: admin actions */}
                {isExpanded && (() => {
                  const isPortalReq = req._source === 'portal';
                  const linkedAccount = req.bankAccountId ? bankAccountsMap[req.bankAccountId] : undefined;
                  const banco = linkedAccount ? getBancoByCode(linkedAccount.bankCode) : undefined;

                  // Auto-validations (portal only)
                  const refOk     = req.referencia ? REFERENCE_6_REGEX.test(req.referencia) : false;
                  const cedulaOk  = req.payerCedula ? CEDULA_VE_REGEX.test(req.payerCedula) : false;
                  const dateOk    = req.paymentDate
                    ? (() => {
                        const d = new Date(req.paymentDate).getTime();
                        const now = Date.now();
                        return d <= now + 86_400_000 && now - d <= 7 * 86_400_000;
                      })()
                    : false;
                  const bankOk    = !!linkedAccount;
                  const phoneOk   = linkedAccount?.accountType === 'pago_movil'
                    ? !!req.payerPhone && /^04(12|14|16|24|26)\d{7}$/.test(req.payerPhone)
                    : true;

                  // Fingerprint state
                  const fpStats = req.fingerprint ? fingerprintIndex[req.fingerprint] : undefined;
                  const fpOtherApproved = fpStats && (fpStats.approved - (req.status === 'approved' ? 1 : 0)) > 0;
                  const fpOtherRejected = fpStats && fpStats.rejected > 0;

                  return (
                    <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t border-slate-100 dark:border-white/[0.05]">
                      <div className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Left: voucher */}
                        {isPortalReq && req.voucherUrl ? (
                          <button
                            type="button"
                            onClick={() => setVoucherView({ url: req.voucherUrl!, caption: `${req.customerName} · $${req.amount.toFixed(2)}` })}
                            className="relative group rounded-2xl border border-slate-200 dark:border-white/[0.07] overflow-hidden bg-slate-50 dark:bg-white/[0.03] hover:border-indigo-400 dark:hover:border-indigo-500/40 transition-all"
                          >
                            <img src={req.voucherUrl} alt="voucher" className="w-full h-56 object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 text-slate-900 text-[10px] font-black">
                                <Eye size={12} /> Ver voucher completo
                              </div>
                            </div>
                          </button>
                        ) : isPortalReq ? (
                          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-center h-56">
                            <p className="text-[10px] font-bold text-slate-400">Sin voucher adjunto</p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-center h-56">
                            <p className="text-[10px] font-bold text-slate-400">Solicitud manual del vendedor</p>
                          </div>
                        )}

                        {/* Right: details + validations */}
                        <div className="space-y-3">
                          {isPortalReq && (
                            <div className="space-y-2">
                              {linkedAccount && (
                                <div className="flex items-start gap-2 text-[11px]">
                                  <Landmark size={12} className="text-slate-400 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-700 dark:text-slate-300">{banco?.shortName || linkedAccount.bankName}</p>
                                    <p className="text-[10px] text-slate-400 truncate font-mono">{linkedAccount.accountNumber}</p>
                                  </div>
                                </div>
                              )}
                              {req.payerCedula && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <IdCard size={12} className="text-slate-400" />
                                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{req.payerCedula}</span>
                                </div>
                              )}
                              {req.payerPhone && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <Phone size={12} className="text-slate-400" />
                                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{req.payerPhone}</span>
                                </div>
                              )}
                              {req.paymentDate && (
                                <div className="flex items-center gap-2 text-[11px]">
                                  <CalendarIcon size={12} className="text-slate-400" />
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{new Date(req.paymentDate).toLocaleDateString('es-VE')}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Auto-validation badges (portal only) */}
                          {isPortalReq && (
                            <div className="flex flex-wrap gap-1.5">
                              <ValidationBadge ok={refOk} label="Ref 6 dígitos" />
                              <ValidationBadge ok={cedulaOk} label="Cédula válida" />
                              <ValidationBadge ok={dateOk} label="Fecha válida" />
                              <ValidationBadge ok={bankOk} label="Cuenta vinculada" />
                              {linkedAccount?.accountType === 'pago_movil' && (
                                <ValidationBadge ok={phoneOk} label="Teléfono OK" />
                              )}
                            </div>
                          )}

                          {/* Fingerprint warnings */}
                          {req.fingerprint && (
                            <div>
                              {fpOtherApproved ? (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
                                  <ShieldAlert size={12} className="text-rose-500" />
                                  <p className="text-[10px] font-black text-rose-600 dark:text-rose-400">Posible duplicado: ya hay un pago aprobado con esta misma referencia</p>
                                </div>
                              ) : fpOtherRejected ? (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                                  <ShieldAlert size={12} className="text-amber-500" />
                                  <p className="text-[10px] font-black text-amber-600 dark:text-amber-400">Referencia previamente rechazada</p>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                                  <ShieldCheck size={12} className="text-emerald-500" />
                                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">Referencia única</p>
                                </div>
                              )}
                            </div>
                          )}

                          {req.nota && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400"><strong>Nota:</strong> {req.nota}</p>
                          )}
                          {req.reviewNote && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400"><strong>Revisión:</strong> {req.reviewNote}</p>
                          )}
                          {req.reviewedAt && (
                            <p className="text-[9px] text-slate-400">Revisado: {new Date(req.reviewedAt).toLocaleString('es-VE')}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {isAdmin && isPending && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nota de revisión (opcional)</label>
                            <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Comentario al aprobar/rechazar..."
                              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => handleReject(req)} disabled={isProcessing}
                              className="flex-1 py-3 rounded-xl border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2">
                              <XCircle size={14} /> Rechazar
                            </button>
                            <button onClick={() => handleApprove(req)} disabled={isProcessing}
                              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-black uppercase tracking-widest shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center justify-center gap-2">
                              {isProcessing ? 'Procesando...' : <><CheckCircle2 size={14} /> Aprobar</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {voucherView && (
        <VoucherViewer
          url={voucherView.url}
          caption={voucherView.caption}
          onClose={() => setVoucherView(null)}
        />
      )}
    </div>
  );
};

const ValidationBadge: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black ${
      ok
        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
    }`}
  >
    {ok ? '✓' : '✗'} {label}
  </span>
);

export default PaymentRequestsPanel;
