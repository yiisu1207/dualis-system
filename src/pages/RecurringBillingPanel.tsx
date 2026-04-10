import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, doc, query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Plus, Search, X, Clock, Pause, Play, Trash2, RefreshCw,
  FileText, Calendar, DollarSign, User as UserIcon, XCircle,
  CheckCircle2, AlertTriangle, Repeat,
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────────────────────────────
type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
type RIStatus = 'active' | 'paused' | 'cancelled';

interface RecurringItem {
  nombre: string;
  qty: number;
  price: number;
}

interface RecurringInvoice {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  items: RecurringItem[];
  subtotal: number;
  iva: number;
  ivaRate: number;
  total: number;
  frequency: Frequency;
  startDate: string;      // ISO YYYY-MM-DD
  endDate?: string;        // optional end date
  lastGeneratedDate?: string; // last date a movement was auto-generated
  nextDueDate: string;     // next date to generate
  concept: string;
  notes?: string;
  status: RIStatus;
  createdAt: string;
  createdBy: string;
  pausedAt?: string;
  cancelledAt?: string;
  generatedCount: number;  // how many invoices have been auto-created
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};
const FREQ_OPTIONS: Frequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

const STATUS_META: Record<RIStatus, { label: string; cls: string }> = {
  active:    { label: 'Activa',    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' },
  paused:    { label: 'Pausada',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  cancelled: { label: 'Cancelada', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function addFrequency(dateStr: string, freq: Frequency): string {
  const d = new Date(dateStr + 'T12:00:00');
  switch (freq) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'biweekly':  d.setDate(d.getDate() + 14); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

function currency(n: number) { return `$${n.toFixed(2)}`; }

const inputCls = 'w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';
const labelCls = 'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block';

// ─── COMPONENT ──────────────────────────────────────────────────────────────
interface Props {
  businessId: string;
  currentUserId: string;
  currentUserName: string;
}

export default function RecurringBillingPanel({ businessId, currentUserId, currentUserName }: Props) {
  const [templates, setTemplates] = useState<RecurringInvoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<RIStatus | 'all'>('all');
  const [generating, setGenerating] = useState(false);

  // ── Data listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const unsubs = [
      onSnapshot(collection(db, `businesses/${businessId}/recurringInvoices`), snap => {
        setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringInvoice)));
      }),
      onSnapshot(query(collection(db, 'customers'), where('businessId', '==', businessId)), snap => {
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [businessId]);

  // ── Cron-less auto-generate ──────────────────────────────────────────────
  // On mount + whenever templates change, generate pending invoices
  useEffect(() => {
    if (generating) return;
    const today = todayISO();
    const pending = templates.filter(t =>
      t.status === 'active' && t.nextDueDate <= today &&
      (!t.endDate || t.nextDueDate <= t.endDate)
    );
    if (pending.length === 0) return;

    setGenerating(true);
    (async () => {
      for (const t of pending) {
        let currentDue = t.nextDueDate;
        let count = t.generatedCount || 0;
        // Generate all overdue invoices (could be multiple if paused for a while)
        while (currentDue <= today && (!t.endDate || currentDue <= t.endDate)) {
          try {
            await addDoc(collection(db, 'movements'), {
              businessId,
              entityId: t.customerId,
              entityName: t.customerName,
              date: currentDue,
              createdAt: new Date().toISOString(),
              concept: t.concept || `Factura recurrente — ${FREQ_LABELS[t.frequency]}`,
              amount: t.total,
              amountInUSD: t.total,
              currency: 'USD',
              movementType: 'FACTURA',
              accountType: 'BCV',
              rateUsed: 1,
              pagado: false,
              estadoPago: 'PENDIENTE',
              esVentaContado: false,
              paymentDays: 0,
              dueDate: currentDue,
              recurringInvoiceId: t.id,
              items: t.items.map(it => ({
                id: `ri-${t.id}-${it.nombre}`,
                nombre: it.nombre,
                qty: it.qty,
                price: it.price,
                subtotal: it.qty * it.price,
              })),
            });
            count++;
          } catch (err) {
            console.error('[recurring] error generating invoice', err);
            break;
          }
          currentDue = addFrequency(currentDue, t.frequency);
        }
        // Update template with new nextDueDate
        await updateDoc(doc(db, `businesses/${businessId}/recurringInvoices`, t.id), {
          nextDueDate: currentDue,
          lastGeneratedDate: today,
          generatedCount: count,
        });
      }
      setGenerating(false);
    })();
  }, [templates, businessId]);

  // ── Filters ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = templates;
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        t.customerName.toLowerCase().includes(q) || t.concept.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, [templates, filterStatus, search]);

  // ── Status transitions ────────────────────────────────────────────────────
  const handlePause = async (t: RecurringInvoice) => {
    await updateDoc(doc(db, `businesses/${businessId}/recurringInvoices`, t.id), {
      status: 'paused', pausedAt: new Date().toISOString(),
    });
  };
  const handleResume = async (t: RecurringInvoice) => {
    // On resume, advance nextDueDate to the next future occurrence
    let next = t.nextDueDate;
    const today = todayISO();
    while (next < today) next = addFrequency(next, t.frequency);
    await updateDoc(doc(db, `businesses/${businessId}/recurringInvoices`, t.id), {
      status: 'active', nextDueDate: next, pausedAt: null,
    });
  };
  const handleCancel = async (t: RecurringInvoice) => {
    if (!window.confirm('¿Cancelar esta facturación recurrente? No se generarán más facturas.')) return;
    await updateDoc(doc(db, `businesses/${businessId}/recurringInvoices`, t.id), {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
    });
  };

  // ── Form state ────────────────────────────────────────────────────────────
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerSearch, setFormCustomerSearch] = useState('');
  const [showCustomerDD, setShowCustomerDD] = useState(false);
  const [formItems, setFormItems] = useState<RecurringItem[]>([{ nombre: '', qty: 1, price: 0 }]);
  const [formFrequency, setFormFrequency] = useState<Frequency>('monthly');
  const [formStartDate, setFormStartDate] = useState(todayISO());
  const [formEndDate, setFormEndDate] = useState('');
  const [formConcept, setFormConcept] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIvaRate, setFormIvaRate] = useState(16);
  const [saving, setSaving] = useState(false);

  const customerMatches = useMemo(() => {
    const q = formCustomerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter(c =>
      (c.fullName || c.nombre || '').toLowerCase().includes(q) ||
      (c.cedula || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customers, formCustomerSearch]);

  const pickCustomer = (c: any) => {
    setFormCustomerId(c.id);
    setFormCustomerName(c.fullName || c.nombre || '');
    setFormCustomerSearch(c.fullName || c.nombre || '');
    setShowCustomerDD(false);
  };

  const formSubtotal = formItems.reduce((s, it) => s + it.qty * it.price, 0);
  const formIva = formSubtotal * formIvaRate / 100;
  const formTotal = formSubtotal + formIva;

  const resetForm = () => {
    setShowModal(false);
    setFormCustomerId('');
    setFormCustomerName('');
    setFormCustomerSearch('');
    setFormItems([{ nombre: '', qty: 1, price: 0 }]);
    setFormFrequency('monthly');
    setFormStartDate(todayISO());
    setFormEndDate('');
    setFormConcept('');
    setFormNotes('');
    setFormIvaRate(16);
  };

  const handleSave = async () => {
    if (!formCustomerId || formItems.length === 0 || !formStartDate || saving) return;
    const validItems = formItems.filter(it => it.nombre.trim());
    if (validItems.length === 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/recurringInvoices`), {
        businessId,
        customerId: formCustomerId,
        customerName: formCustomerName,
        items: validItems,
        subtotal: formSubtotal,
        iva: formIva,
        ivaRate: formIvaRate,
        total: formTotal,
        frequency: formFrequency,
        startDate: formStartDate,
        endDate: formEndDate || null,
        nextDueDate: formStartDate,
        concept: formConcept || `Factura recurrente — ${FREQ_LABELS[formFrequency]}`,
        notes: formNotes || null,
        status: 'active' as RIStatus,
        createdAt: new Date().toISOString(),
        createdBy: currentUserName,
        generatedCount: 0,
      });
      resetForm();
    } catch (err) {
      console.error('[recurring] save error', err);
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Repeat size={20} className="text-indigo-500" /> Facturación Recurrente
          </h2>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">
            {templates.filter(t => t.status === 'active').length} activas · {generating ? 'Generando facturas pendientes...' : `${templates.reduce((s, t) => s + (t.generatedCount || 0), 0)} generadas`}
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center gap-2">
          <Plus size={14} /> Nueva Recurrente
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente o concepto..."
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'paused', 'cancelled'] as const).map(st => (
            <button key={st} onClick={() => setFilterStatus(st)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${
                filterStatus === st
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}>
              {st === 'all' ? `Todas (${templates.length})` : `${STATUS_META[st].label} (${templates.filter(t => t.status === st).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-12 text-center">
          <Repeat size={40} className="text-slate-200 dark:text-white/10 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 dark:text-white/30">No hay facturas recurrentes</p>
          <p className="text-xs text-slate-300 dark:text-white/15 mt-1">Crea una para generar facturas automáticamente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(t => {
            const sm = STATUS_META[t.status];
            const daysUntil = Math.ceil((new Date(t.nextDueDate + 'T12:00:00').getTime() - Date.now()) / 86400000);
            return (
              <div key={t.id} className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{t.customerName}</p>
                    <p className="text-[10px] text-slate-400 dark:text-white/30 truncate">{t.concept}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${sm.cls}`}>
                    {sm.label}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-white/30 mb-2">
                  <span className="flex items-center gap-1"><Repeat size={10} /> {FREQ_LABELS[t.frequency]}</span>
                  <span className="flex items-center gap-1"><DollarSign size={10} /> {currency(t.total)}</span>
                  <span className="flex items-center gap-1"><FileText size={10} /> {t.generatedCount || 0} gen.</span>
                </div>

                <div className="flex items-center gap-2 text-[10px] mb-3">
                  <Calendar size={10} className="text-indigo-400" />
                  <span className="text-slate-500 dark:text-white/40">Próxima: {t.nextDueDate}</span>
                  {t.status === 'active' && daysUntil <= 3 && daysUntil >= 0 && (
                    <span className="text-amber-400 font-bold">En {daysUntil}d</span>
                  )}
                  {t.endDate && <span className="text-slate-300 dark:text-white/20">· Fin: {t.endDate}</span>}
                </div>

                <div className="space-y-0.5 mb-3">
                  {t.items.slice(0, 3).map((it, i) => (
                    <p key={i} className="text-[9px] text-slate-400 dark:text-white/20">
                      {it.qty}x {it.nombre} — {currency(it.price)}
                    </p>
                  ))}
                  {t.items.length > 3 && (
                    <p className="text-[9px] text-slate-300 dark:text-white/15">+{t.items.length - 3} más</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  {t.status === 'active' && (
                    <button onClick={() => handlePause(t)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase hover:opacity-80 flex items-center gap-1">
                      <Pause size={10} /> Pausar
                    </button>
                  )}
                  {t.status === 'paused' && (
                    <button onClick={() => handleResume(t)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase hover:opacity-80 flex items-center gap-1">
                      <Play size={10} /> Reanudar
                    </button>
                  )}
                  {t.status !== 'cancelled' && (
                    <button onClick={() => handleCancel(t)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[9px] font-bold uppercase hover:opacity-80 flex items-center gap-1">
                      <XCircle size={10} /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE MODAL ─────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={resetForm}>
          <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.07] p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Nueva Factura Recurrente</h3>
              <button onClick={resetForm} className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-all"><X size={14} /></button>
            </div>

            <div className="space-y-4">
              {/* Customer picker */}
              <div className="relative">
                <label className={labelCls}>Cliente</label>
                {formCustomerId ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <UserIcon size={14} className="text-emerald-400" />
                      <p className="text-xs font-black text-slate-900 dark:text-white">{formCustomerName}</p>
                    </div>
                    <button type="button" onClick={() => { setFormCustomerId(''); setFormCustomerName(''); setFormCustomerSearch(''); }}
                      className="text-rose-400 hover:bg-rose-500/10 rounded-lg p-1"><XCircle size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/30" />
                      <input value={formCustomerSearch}
                        onChange={e => { setFormCustomerSearch(e.target.value); setShowCustomerDD(true); }}
                        onFocus={() => setShowCustomerDD(true)}
                        placeholder="Buscar cliente..."
                        className={`${inputCls} pl-8`} />
                    </div>
                    {showCustomerDD && customerMatches.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-[#0f1828] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {customerMatches.map(c => (
                          <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.05] border-b border-slate-50 dark:border-white/[0.04] last:border-b-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{c.fullName || c.nombre}</p>
                            <p className="text-[9px] text-slate-400 dark:text-white/30">{c.cedula || c.telefono || ''}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Frequency + dates */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Frecuencia</label>
                  <select value={formFrequency} onChange={e => setFormFrequency(e.target.value as Frequency)}
                    className={inputCls}>
                    {FREQ_OPTIONS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Inicio</label>
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fin (opcional)</label>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)}
                    className={inputCls} />
                </div>
              </div>

              {/* Concept */}
              <div>
                <label className={labelCls}>Concepto</label>
                <input value={formConcept} onChange={e => setFormConcept(e.target.value)}
                  placeholder="Ej: Alquiler local, Mensualidad servicio..."
                  className={inputCls} />
              </div>

              {/* Items */}
              <div>
                <label className={labelCls}>Ítems</label>
                <div className="space-y-2">
                  {formItems.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={it.nombre} onChange={e => {
                        const items = [...formItems]; items[i] = { ...items[i], nombre: e.target.value }; setFormItems(items);
                      }} placeholder="Descripción" className={`flex-1 ${inputCls}`} />
                      <input type="number" min="1" value={it.qty} onChange={e => {
                        const items = [...formItems]; items[i] = { ...items[i], qty: +e.target.value }; setFormItems(items);
                      }} className={`w-14 text-center ${inputCls}`} />
                      <input type="number" step="0.01" value={it.price || ''} onChange={e => {
                        const items = [...formItems]; items[i] = { ...items[i], price: +e.target.value }; setFormItems(items);
                      }} placeholder="$" className={`w-20 text-center ${inputCls}`} />
                      {formItems.length > 1 && (
                        <button onClick={() => setFormItems(formItems.filter((_, idx) => idx !== i))}
                          className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setFormItems([...formItems, { nombre: '', qty: 1, price: 0 }])}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <Plus size={12} /> Agregar ítem
                  </button>
                </div>
              </div>

              {/* IVA + Totals */}
              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className={labelCls}>IVA %</label>
                  <input type="number" min="0" max="100" value={formIvaRate} onChange={e => setFormIvaRate(+e.target.value)}
                    className={inputCls} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 dark:text-white/30">Subtotal: {currency(formSubtotal)}</p>
                  <p className="text-[10px] text-slate-400 dark:text-white/30">IVA: {currency(formIva)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{currency(formTotal)}</p>
                  <p className="text-[9px] text-slate-400 dark:text-white/20">cada {FREQ_LABELS[formFrequency].toLowerCase()}</p>
                </div>
              </div>

              {/* Notes */}
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)}
                placeholder="Notas (opcional)" rows={2}
                className={`${inputCls} resize-none`} />
            </div>

            {/* Footer */}
            <div className="flex gap-3 mt-6">
              <button onClick={resetForm}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={!formCustomerId || formItems.filter(i => i.nombre.trim()).length === 0 || saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                <Plus size={14} /> Crear Recurrente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
