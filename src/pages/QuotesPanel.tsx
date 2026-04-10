import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import type { Quote, QuoteItem, QuoteStatus, Customer } from '../../types';
import {
  Plus, Search, Trash2, Send, CheckCircle, XCircle, ShoppingCart, FileText,
  X, Edit3, Copy, Clock, AlertCircle,
} from 'lucide-react';

interface Props {
  businessId: string;
  currentUserId: string;
  currentUserName: string;
}

// ── Shared Tailwind tokens (match NewClientModal) ──────────────────────────
const inputCls = 'w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';
const labelCls = 'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block';
const btnGhost = 'px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all';

const STATUS_META: Record<QuoteStatus, { label: string; cls: string; dot: string }> = {
  borrador:   { label: 'Borrador',    cls: 'bg-slate-500/15 text-slate-500 border-slate-500/20',     dot: 'bg-slate-400' },
  enviada:    { label: 'Enviada',     cls: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/20', dot: 'bg-indigo-500' },
  aprobada:   { label: 'Aprobada',    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20', dot: 'bg-emerald-500' },
  rechazada:  { label: 'Rechazada',   cls: 'bg-rose-500/15 text-rose-500 border-rose-500/20',       dot: 'bg-rose-500' },
  vencida:    { label: 'Vencida',     cls: 'bg-amber-500/15 text-amber-500 border-amber-500/20',   dot: 'bg-amber-500' },
  convertida: { label: 'Convertida',  cls: 'bg-violet-500/15 text-violet-500 border-violet-500/20', dot: 'bg-violet-500' },
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function currency(n: number): string {
  return `$${(n || 0).toFixed(2)}`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function QuotesPanel({ businessId, currentUserId, currentUserName }: Props) {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [filterStatus, setFilterStatus] = useState<'todas' | QuoteStatus>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);

  // Form state
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerSearch, setFormCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [formItems, setFormItems] = useState<QuoteItem[]>([]);
  const [formValidUntil, setFormValidUntil] = useState(plusDaysISO(15));
  const [formIvaRate, setFormIvaRate] = useState(16);
  const [formDiscount, setFormDiscount] = useState(0);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Product picker state
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);

  // ── Data listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, 'quotes'), where('businessId', '==', businessId)),
        snap => setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Quote))),
      ),
      onSnapshot(
        query(collection(db, 'customers'), where('businessId', '==', businessId)),
        snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      ),
      onSnapshot(
        collection(db, `businesses/${businessId}/products`),
        snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      ),
    ];
    return () => unsubs.forEach(u => u());
  }, [businessId]);

  // ── Auto-expire check (cron-less) ─────────────────────────────────────────
  useEffect(() => {
    const today = todayISO();
    quotes
      .filter(q => q.status === 'enviada' && q.validUntil < today)
      .forEach(async q => {
        try {
          await updateDoc(doc(db, 'quotes', q.id), { status: 'vencida', expiredAt: new Date().toISOString() });
        } catch (e) { /* noop */ }
      });
  }, [quotes]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return quotes
      .filter(q => filterStatus === 'todas' || q.status === filterStatus)
      .filter(q => {
        if (!term) return true;
        return (
          q.quoteNumber.toLowerCase().includes(term) ||
          q.customerName.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [quotes, filterStatus, searchTerm]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: quotes.length };
    (Object.keys(STATUS_META) as QuoteStatus[]).forEach(s => {
      c[s] = quotes.filter(q => q.status === s).length;
    });
    return c;
  }, [quotes]);

  const customerMatches = useMemo(() => {
    const term = formCustomerSearch.trim().toLowerCase();
    const src = customers;
    if (!term) return src.slice(0, 8);
    return src.filter(c =>
      ((c as any).fullName || (c as any).nombre || '').toLowerCase().includes(term) ||
      ((c as any).cedula || '').toLowerCase().includes(term),
    ).slice(0, 8);
  }, [customers, formCustomerSearch]);

  const productMatches = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products.slice(0, 10);
    return products.filter(p =>
      (p.nombre || p.name || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term),
    ).slice(0, 10);
  }, [products, productSearch]);

  const formSubtotal = useMemo(
    () => formItems.reduce((s, it) => s + (it.qty * it.price), 0),
    [formItems],
  );
  const formIva = useMemo(
    () => ((formSubtotal - (formDiscount || 0)) * (formIvaRate || 0)) / 100,
    [formSubtotal, formDiscount, formIvaRate],
  );
  const formTotal = useMemo(
    () => formSubtotal - (formDiscount || 0) + formIva,
    [formSubtotal, formDiscount, formIva],
  );

  // ── Form helpers ───────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setEditing(null);
    setFormCustomerId('');
    setFormCustomerName('');
    setFormCustomerSearch('');
    setFormItems([]);
    setFormValidUntil(plusDaysISO(15));
    setFormIvaRate(16);
    setFormDiscount(0);
    setFormNotes('');
    setProductSearch('');
    setShowProductPicker(false);
  }, []);

  const openNew = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const openEdit = useCallback((q: Quote) => {
    setEditing(q);
    setFormCustomerId(q.customerId);
    setFormCustomerName(q.customerName);
    setFormCustomerSearch(q.customerName);
    setFormItems(q.items || []);
    setFormValidUntil(q.validUntil);
    setFormIvaRate(q.ivaRate ?? 16);
    setFormDiscount(q.discount || 0);
    setFormNotes(q.notes || '');
    setShowModal(true);
  }, []);

  const addItemFromProduct = useCallback((p: any) => {
    const price = Number(p.precioUSD || p.precio || p.price || 0);
    const name = p.nombre || p.name || 'Producto';
    setFormItems(prev => {
      // if already in list, bump qty
      const idx = prev.findIndex(it => it.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1, subtotal: (next[idx].qty + 1) * next[idx].price };
        return next;
      }
      return [...prev, {
        id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: p.id,
        nombre: name,
        qty: 1,
        price,
        subtotal: price,
      }];
    });
    setProductSearch('');
    setShowProductPicker(false);
  }, []);

  const addCustomItem = useCallback(() => {
    setFormItems(prev => [...prev, {
      id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombre: '',
      qty: 1,
      price: 0,
      subtotal: 0,
    }]);
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QuoteItem>) => {
    setFormItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const merged = { ...it, ...patch };
      merged.subtotal = (merged.qty || 0) * (merged.price || 0);
      return merged;
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setFormItems(prev => prev.filter(it => it.id !== id));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const nextQuoteNumber = useCallback(() => {
    const nums = quotes
      .map(q => parseInt((q.quoteNumber || '').replace(/[^0-9]/g, ''), 10))
      .filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `COT-${String(next).padStart(4, '0')}`;
  }, [quotes]);

  const handleSave = useCallback(async () => {
    if (!formCustomerId || !formCustomerName) {
      alert('Selecciona un cliente');
      return;
    }
    if (formItems.length === 0) {
      alert('Agrega al menos un ítem');
      return;
    }
    if (formItems.some(it => !it.nombre.trim() || it.qty <= 0 || it.price < 0)) {
      alert('Revisa los ítems: nombre, cantidad > 0 y precio ≥ 0');
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<Quote, 'id'> = {
        businessId,
        quoteNumber: editing?.quoteNumber || nextQuoteNumber(),
        customerId: formCustomerId,
        customerName: formCustomerName,
        items: formItems.map(it => ({ ...it, subtotal: it.qty * it.price })),
        subtotal: formSubtotal,
        iva: formIva,
        ivaRate: formIvaRate,
        discount: formDiscount || 0,
        total: formTotal,
        notes: formNotes || '',
        status: editing?.status || 'borrador',
        validUntil: formValidUntil,
        createdAt: editing?.createdAt || new Date().toISOString(),
        createdBy: editing?.createdBy || currentUserId,
        createdByName: editing?.createdByName || currentUserName,
        sentAt: editing?.sentAt,
        approvedAt: editing?.approvedAt,
        rejectedAt: editing?.rejectedAt,
        rejectionReason: editing?.rejectionReason,
        convertedMovementId: editing?.convertedMovementId,
        convertedAt: editing?.convertedAt,
        expiredAt: editing?.expiredAt,
      };
      // strip undefined
      Object.keys(payload).forEach(k => (payload as any)[k] === undefined && delete (payload as any)[k]);

      if (editing) {
        await updateDoc(doc(db, 'quotes', editing.id), payload as any);
      } else {
        await addDoc(collection(db, 'quotes'), payload as any);
      }
      setShowModal(false);
      resetForm();
    } catch (e: any) {
      alert('Error al guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [
    businessId, editing, formCustomerId, formCustomerName, formItems,
    formSubtotal, formIva, formIvaRate, formDiscount, formTotal, formNotes,
    formValidUntil, currentUserId, currentUserName, nextQuoteNumber, resetForm,
  ]);

  // ── Status transitions ────────────────────────────────────────────────────
  const transition = useCallback(async (q: Quote, patch: Partial<Quote>) => {
    try {
      await updateDoc(doc(db, 'quotes', q.id), patch as any);
    } catch (e: any) {
      alert('Error: ' + (e?.message || e));
    }
  }, []);

  const handleSend    = (q: Quote) => transition(q, { status: 'enviada', sentAt: new Date().toISOString() });
  const handleApprove = (q: Quote) => transition(q, { status: 'aprobada', approvedAt: new Date().toISOString() });
  const handleReject  = (q: Quote) => {
    const reason = prompt('Motivo del rechazo (opcional):') || '';
    transition(q, { status: 'rechazada', rejectedAt: new Date().toISOString(), rejectionReason: reason });
  };

  const handleDelete = async (q: Quote) => {
    if (!confirm(`¿Eliminar cotización ${q.quoteNumber}?`)) return;
    try {
      await deleteDoc(doc(db, 'quotes', q.id));
    } catch (e: any) {
      alert('Error: ' + (e?.message || e));
    }
  };

  const handleDuplicate = useCallback((q: Quote) => {
    setEditing(null);
    setFormCustomerId(q.customerId);
    setFormCustomerName(q.customerName);
    setFormCustomerSearch(q.customerName);
    setFormItems(q.items.map(it => ({
      ...it,
      id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    })));
    setFormValidUntil(plusDaysISO(15));
    setFormIvaRate(q.ivaRate ?? 16);
    setFormDiscount(q.discount || 0);
    setFormNotes(q.notes || '');
    setShowModal(true);
  }, []);

  // ── Convertir a venta (bridge a POS Detal) ────────────────────────────────
  const handleConvertToSale = useCallback((q: Quote) => {
    if (q.status === 'convertida') {
      alert('Esta cotización ya fue convertida.');
      return;
    }
    sessionStorage.setItem('dualis_pending_pos_sale', JSON.stringify({
      source: 'cotizacion',
      sourceId: q.id,
      customerId: q.customerId,
      customerName: q.customerName,
      items: q.items.map(it => ({
        id: it.productId || `q-${q.id}-${it.nombre}`,
        nombre: it.nombre,
        name: it.nombre,
        price: it.price,
        qty: it.qty,
      })),
    }));
    navigate('/admin/cajas');
  }, [navigate]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-slate-50/50 dark:bg-[#070b16]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#060a14]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" />
              Cotizaciones
            </h1>
            <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 mt-0.5 uppercase tracking-widest">
              Presupuestos y propuestas comerciales
            </p>
          </div>
          <button
            onClick={openNew}
            className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Plus size={14} /> Nueva cotización
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            onClick={() => setFilterStatus('todas')}
            className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
              filterStatus === 'todas'
                ? 'bg-indigo-500 text-white border-indigo-500'
                : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
            }`}
          >
            Todas ({counts.todas || 0})
          </button>
          {(Object.keys(STATUS_META) as QuoteStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                filterStatus === s
                  ? `${STATUS_META[s].cls} border-current`
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              {STATUS_META[s].label} ({counts[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/[0.06] flex items-center justify-center mb-4">
              <FileText size={28} className="text-indigo-300 dark:text-indigo-500/40" />
            </div>
            <p className="text-sm font-black text-slate-400 dark:text-white/20 uppercase tracking-widest">
              No hay cotizaciones
            </p>
            <p className="text-xs font-medium text-slate-400 dark:text-white/15 mt-1">
              Crea tu primera cotización para empezar
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(q => {
              const meta = STATUS_META[q.status];
              const isExpiringSoon = q.status === 'enviada' && q.validUntil && (() => {
                const days = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
                return days <= 3 && days >= 0;
              })();
              return (
                <div
                  key={q.id}
                  className="bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest">
                        {q.quoteNumber}
                      </p>
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">
                        {q.customerName}
                      </p>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${meta.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </div>
                  </div>

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400 dark:text-white/30">Ítems</span>
                      <span className="text-slate-700 dark:text-white/80">{q.items.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400 dark:text-white/30">Total</span>
                      <span className="text-slate-900 dark:text-white font-black">{currency(q.total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-400 dark:text-white/30">Válida hasta</span>
                      <span className={isExpiringSoon ? 'text-amber-500' : 'text-slate-700 dark:text-white/80'}>
                        {q.validUntil}
                      </span>
                    </div>
                  </div>

                  {isExpiringSoon && (
                    <div className="mb-3 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-widest">
                      <AlertCircle size={12} /> Próxima a vencer
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {q.status === 'borrador' && (
                      <>
                        <button
                          onClick={() => handleSend(q)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
                        >
                          <Send size={11} /> Enviar
                        </button>
                        <button onClick={() => openEdit(q)} className="p-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                          <Edit3 size={12} />
                        </button>
                      </>
                    )}
                    {q.status === 'enviada' && (
                      <>
                        <button
                          onClick={() => handleApprove(q)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
                        >
                          <CheckCircle size={11} /> Aprobar
                        </button>
                        <button
                          onClick={() => handleReject(q)}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest flex items-center gap-1"
                        >
                          <XCircle size={11} /> Rechazar
                        </button>
                      </>
                    )}
                    {q.status === 'aprobada' && (
                      <button
                        onClick={() => handleConvertToSale(q)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
                      >
                        <ShoppingCart size={11} /> Convertir a venta
                      </button>
                    )}
                    {(q.status === 'rechazada' || q.status === 'vencida') && (
                      <button
                        onClick={() => handleDuplicate(q)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
                      >
                        <Copy size={11} /> Duplicar
                      </button>
                    )}
                    {q.status === 'convertida' && q.convertedMovementId && (
                      <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                        <Clock size={11} /> Ya convertida
                      </div>
                    )}
                    {q.status !== 'convertida' && (
                      <button
                        onClick={() => handleDelete(q)}
                        className="p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modal: Crear/Editar Cotización ────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {editing ? `Editar ${editing.quoteNumber}` : 'Nueva cotización'}
                </h3>
                <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 mt-0.5 uppercase tracking-widest">
                  {editing ? 'Modifica los datos' : 'Completa los datos de la propuesta'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Customer picker */}
              <div className="relative">
                <label className={labelCls}>Cliente *</label>
                <input
                  type="text"
                  value={formCustomerSearch}
                  onChange={e => {
                    setFormCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                    if (!e.target.value) {
                      setFormCustomerId('');
                      setFormCustomerName('');
                    }
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Buscar cliente por nombre o cédula..."
                  className={inputCls}
                />
                {showCustomerDropdown && customerMatches.length > 0 && !formCustomerId && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {customerMatches.map(c => {
                      const name = (c as any).fullName || (c as any).nombre || 'Sin nombre';
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setFormCustomerId(c.id);
                            setFormCustomerName(name);
                            setFormCustomerSearch(name);
                            setShowCustomerDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-white/[0.04] border-b border-slate-100 dark:border-white/[0.04] last:border-0"
                        >
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{name}</p>
                          <p className="text-[11px] font-bold text-slate-400 dark:text-white/30">{(c as any).cedula || ''}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + ' !mb-0'}>Ítems *</label>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setShowProductPicker(true)} className={btnGhost}>
                      + Producto
                    </button>
                    <button type="button" onClick={addCustomItem} className={btnGhost}>
                      + Libre
                    </button>
                  </div>
                </div>

                {showProductPicker && (
                  <div className="mb-3 p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.03]">
                    <div className="flex items-center gap-2 mb-2">
                      <Search size={14} className="text-indigo-500" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Buscar producto..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 outline-none"
                      />
                      <button onClick={() => { setShowProductPicker(false); setProductSearch(''); }} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {productMatches.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addItemFromProduct(p)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 flex items-center justify-between"
                        >
                          <span className="text-[12px] font-bold text-slate-700 dark:text-white/80 truncate">
                            {p.nombre || p.name}
                          </span>
                          <span className="text-[11px] font-black text-indigo-500 shrink-0 ml-2">
                            {currency(Number(p.precioUSD || p.precio || p.price || 0))}
                          </span>
                        </button>
                      ))}
                      {productMatches.length === 0 && (
                        <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 text-center py-2">
                          Sin resultados
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {formItems.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl">
                    <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
                      Sin ítems. Agrega productos o ítems libres.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formItems.map(it => (
                      <div key={it.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
                        <input
                          type="text"
                          value={it.nombre}
                          onChange={e => updateItem(it.id, { nombre: e.target.value })}
                          placeholder="Descripción"
                          className="col-span-5 px-2 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={it.qty}
                          onChange={e => updateItem(it.id, { qty: Number(e.target.value) || 0 })}
                          className="col-span-2 px-2 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs font-bold text-slate-900 dark:text-white text-right outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={it.price}
                          onChange={e => updateItem(it.id, { price: Number(e.target.value) || 0 })}
                          className="col-span-2 px-2 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs font-bold text-slate-900 dark:text-white text-right outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="col-span-2 text-right text-xs font-black text-slate-900 dark:text-white">
                          {currency(it.qty * it.price)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="col-span-1 p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 justify-self-end"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals + meta */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Válida hasta *</label>
                  <input type="date" value={formValidUntil} onChange={e => setFormValidUntil(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>IVA %</label>
                  <input type="number" min={0} max={100} step={0.01} value={formIvaRate} onChange={e => setFormIvaRate(Number(e.target.value) || 0)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Descuento $</label>
                  <input type="number" min={0} step={0.01} value={formDiscount} onChange={e => setFormDiscount(Number(e.target.value) || 0)} className={inputCls} />
                </div>
                <div className="flex items-end">
                  <div className="w-full p-3 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/20">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-white/40">
                      <span>Subtotal</span><span>{currency(formSubtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-white/40">
                      <span>IVA</span><span>{currency(formIva)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-black text-slate-900 dark:text-white mt-1 pt-1 border-t border-indigo-500/20">
                      <span>Total</span><span>{currency(formTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Notas</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Condiciones, términos, observaciones..."
                  className={inputCls}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
              <button onClick={() => setShowModal(false)} className={btnGhost} disabled={saving}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear cotización')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
