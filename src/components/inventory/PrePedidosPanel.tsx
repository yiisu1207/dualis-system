import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PreOrder, PreOrderStatus, PreOrderItem } from '../../../types';
import {
  Plus, Clock, CheckCircle, Package, Truck, XCircle, ChevronRight,
  Loader2, Calendar, DollarSign,
} from 'lucide-react';

interface Props {
  businessId: string;
  currentUserName: string;
}

const STATUS_FLOW: PreOrderStatus[] = ['pending', 'confirmed', 'in_progress', 'ready', 'delivered'];

const STATUS_CONFIG: Record<PreOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: 'Pendiente',    color: 'amber',   icon: Clock },
  confirmed:   { label: 'Confirmado',   color: 'indigo',  icon: CheckCircle },
  in_progress: { label: 'En proceso',   color: 'sky',     icon: Package },
  ready:       { label: 'Listo',        color: 'emerald', icon: CheckCircle },
  delivered:   { label: 'Entregado',    color: 'emerald', icon: Truck },
  cancelled:   { label: 'Cancelado',    color: 'rose',    icon: XCircle },
};

export default function PrePedidosPanel({ businessId, currentUserName }: Props) {
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formCustomer, setFormCustomer] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formDeposit, setFormDeposit] = useState(0);
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<PreOrderItem[]>([{ name: '', quantity: 1, priceUSD: 0 }]);

  // Filter
  const [statusFilter, setStatusFilter] = useState<PreOrderStatus | 'all'>('all');

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/preorders`), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as PreOrder)));
    });
    return unsub;
  }, [businessId]);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);
    return list.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders, statusFilter]);

  const addItem = () => setFormItems([...formItems, { name: '', quantity: 1, priceUSD: 0 }]);
  const removeItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<PreOrderItem>) => {
    setFormItems(formItems.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };

  const formTotal = formItems.reduce((s, it) => s + it.quantity * it.priceUSD, 0);

  const handleSave = async () => {
    if (!formCustomer || formItems.length === 0 || !formDate || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/preorders`), {
        businessId,
        customerName: formCustomer,
        customerPhone: formPhone,
        items: formItems.filter(it => it.name),
        deliveryDate: formDate,
        deliveryTime: formTime || undefined,
        totalUSD: formTotal,
        depositUSD: formDeposit,
        depositPaid: formDeposit > 0,
        status: 'pending' as PreOrderStatus,
        notes: formNotes || undefined,
        createdBy: currentUserName,
        createdAt: new Date().toISOString(),
      });
      resetForm();
    } catch (err) {
      console.error('Error saving pre-order:', err);
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (order: PreOrder) => {
    const idx = STATUS_FLOW.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    await updateDoc(doc(db, `businesses/${businessId}/preorders`, order.id), { status: next });
  };

  const cancelOrder = async (orderId: string) => {
    await updateDoc(doc(db, `businesses/${businessId}/preorders`, orderId), { status: 'cancelled' as PreOrderStatus });
  };

  const resetForm = () => {
    setShowNew(false);
    setFormCustomer('');
    setFormPhone('');
    setFormDate('');
    setFormTime('');
    setFormDeposit(0);
    setFormNotes('');
    setFormItems([{ name: '', quantity: 1, priceUSD: 0 }]);
  };

  // Stats
  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
  const todayCount = orders.filter(o => o.deliveryDate === new Date().toISOString().split('T')[0] && o.status !== 'cancelled' && o.status !== 'delivered').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Pre-Pedidos</h2>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">
            {pendingCount} pendientes — {todayCount} para hoy
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center gap-2"
        >
          <Plus size={14} /> Nuevo Pedido
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', ...STATUS_FLOW, 'cancelled'] as const).map(st => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              statusFilter === st
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'border-white/[0.08] text-white/30 hover:bg-white/[0.03]'
            }`}
          >
            {st === 'all' ? `Todos (${orders.length})` : `${STATUS_CONFIG[st].label} (${orders.filter(o => o.status === st).length})`}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-12 text-center">
          <Package size={40} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/30">Sin pre-pedidos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const cfg = STATUS_CONFIG[order.status];
            const Icon = cfg.icon;
            const isActive = order.status !== 'cancelled' && order.status !== 'delivered';
            return (
              <div key={order.id} className={`bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4 hover:border-${cfg.color}-500/20 transition-all`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-white">{order.customerName}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-white/30 mb-2">
                      <span className="flex items-center gap-1"><Calendar size={10} /> {order.deliveryDate}{order.deliveryTime && ` ${order.deliveryTime}`}</span>
                      <span className="flex items-center gap-1"><DollarSign size={10} /> ${order.totalUSD}</span>
                      {order.depositUSD > 0 && <span className="text-emerald-400">Depósito: ${order.depositUSD}</span>}
                    </div>
                    <div className="space-y-0.5">
                      {order.items.map((it, i) => (
                        <p key={i} className="text-[10px] text-white/20">
                          {it.quantity}x {it.name} — ${it.priceUSD}{it.notes && ` (${it.notes})`}
                        </p>
                      ))}
                    </div>
                    {order.notes && <p className="text-[10px] text-white/15 mt-1 italic">{order.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {isActive && (
                      <button
                        onClick={() => advanceStatus(order)}
                        className={`px-3 py-2 rounded-lg bg-${cfg.color}-500/10 text-${cfg.color}-400 text-[9px] font-bold uppercase hover:opacity-80 transition-all flex items-center gap-1`}
                      >
                        <ChevronRight size={12} /> Avanzar
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => cancelOrder(order.id)}
                        className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-[9px] font-bold uppercase hover:opacity-80 transition-all"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New order modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={resetForm}>
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white mb-5">Nuevo Pre-Pedido</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Cliente</label>
                  <input value={formCustomer} onChange={e => setFormCustomer(e.target.value)} placeholder="Nombre"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Teléfono</label>
                  <input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="04XX..."
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Fecha Entrega</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Hora Entrega</label>
                  <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2 block">Productos</label>
                <div className="space-y-2">
                  {formItems.map((it, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input value={it.name} onChange={e => updateItem(i, { name: e.target.value })} placeholder="Torta de chocolate 3 pisos"
                        className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs outline-none" />
                      <input type="number" min="1" value={it.quantity} onChange={e => updateItem(i, { quantity: +e.target.value })}
                        className="w-14 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs text-center outline-none" />
                      <input type="number" step="0.01" value={it.priceUSD || ''} onChange={e => updateItem(i, { priceUSD: +e.target.value })} placeholder="$"
                        className="w-20 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs text-center outline-none" />
                      {formItems.length > 1 && (
                        <button onClick={() => removeItem(i)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg"><XCircle size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={addItem} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <Plus size={12} /> Agregar producto
                  </button>
                </div>
              </div>

              {/* Deposit + total */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Depósito USD</label>
                  <input type="number" step="0.01" value={formDeposit || ''} onChange={e => setFormDeposit(+e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
                <div className="flex items-end">
                  <p className="text-sm font-black text-white">Total: <span className="text-indigo-400">${formTotal.toFixed(2)}</span></p>
                </div>
              </div>

              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas (decoración, sabor, etc.)" rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none" />
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={resetForm} className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest">Cancelar</button>
              <button onClick={handleSave} disabled={!formCustomer || !formDate || saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Crear Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
