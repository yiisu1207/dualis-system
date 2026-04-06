import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { RepairTicket, TicketStatus } from '../../../types';
import {
  Plus, Wrench, Clock, CheckCircle, Package, Truck, XCircle,
  ChevronRight, Loader2, Search, Smartphone, Monitor, Printer,
} from 'lucide-react';

interface Props {
  businessId: string;
  currentUserName: string;
}

const STATUS_FLOW: TicketStatus[] = ['received', 'diagnosing', 'waiting_parts', 'in_repair', 'ready', 'delivered'];

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  received:      { label: 'Recibido',       color: 'amber'   },
  diagnosing:    { label: 'Diagnosticando', color: 'sky'     },
  waiting_parts: { label: 'Esperando piezas', color: 'violet' },
  in_repair:     { label: 'En reparación',  color: 'indigo'  },
  ready:         { label: 'Listo',          color: 'emerald' },
  delivered:     { label: 'Entregado',      color: 'emerald' },
  cancelled:     { label: 'Cancelado',      color: 'rose'    },
};

const DEVICE_TYPES = ['Laptop', 'PC', 'Teléfono', 'Tablet', 'Impresora', 'Monitor', 'Consola', 'Otro'];

export default function RepairTicketsPanel({ businessId, currentUserName }: Props) {
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  // Form
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', deviceType: 'Teléfono',
    deviceBrand: '', deviceModel: '', serialNumber: '',
    issueDescription: '', estimatedCostUSD: 0,
  });

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(collection(db, `businesses/${businessId}/repair_tickets`), snap => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
    });
    return unsub;
  }, [businessId]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter(t =>
        t.customerName.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.deviceBrand?.toLowerCase().includes(q) ||
        t.deviceModel?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [tickets, statusFilter, searchQ]);

  const generateTicketNumber = () => {
    const num = String(tickets.length + 1).padStart(4, '0');
    return `TK-${num}`;
  };

  const handleSave = async () => {
    if (!form.customerName || !form.issueDescription || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/repair_tickets`), {
        businessId,
        ticketNumber: generateTicketNumber(),
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deviceType: form.deviceType,
        deviceBrand: form.deviceBrand || undefined,
        deviceModel: form.deviceModel || undefined,
        serialNumber: form.serialNumber || undefined,
        issueDescription: form.issueDescription,
        estimatedCostUSD: form.estimatedCostUSD || undefined,
        status: 'received' as TicketStatus,
        receivedBy: currentUserName,
        receivedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      setShowNew(false);
      setForm({ customerName: '', customerPhone: '', deviceType: 'Teléfono', deviceBrand: '', deviceModel: '', serialNumber: '', issueDescription: '', estimatedCostUSD: 0 });
    } catch (err) {
      console.error('Error saving ticket:', err);
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (ticket: RepairTicket) => {
    const idx = STATUS_FLOW.indexOf(ticket.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    const update: any = { status: next };
    if (next === 'delivered') update.deliveredAt = new Date().toISOString();
    await updateDoc(doc(db, `businesses/${businessId}/repair_tickets`, ticket.id), update);
  };

  const activeCount = tickets.filter(t => !['delivered', 'cancelled'].includes(t.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Tickets de Reparación</h2>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-0.5">{activeCount} activos</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 flex items-center gap-2">
          <Plus size={14} /> Nuevo Ticket
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar por nombre, ticket, marca..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs outline-none" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', ...STATUS_FLOW, 'cancelled'] as const).map(st => (
          <button key={st} onClick={() => setStatusFilter(st)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
              statusFilter === st ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'border-white/[0.08] text-white/30 hover:bg-white/[0.03]'
            }`}>
            {st === 'all' ? `Todos (${tickets.length})` : `${STATUS_CONFIG[st].label} (${tickets.filter(t => t.status === st).length})`}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-12 text-center">
          <Wrench size={40} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/30">Sin tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => {
            const cfg = STATUS_CONFIG[ticket.status];
            const isActive = !['delivered', 'cancelled'].includes(ticket.status);
            return (
              <div key={ticket.id} className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold text-indigo-400">{ticket.ticketNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-white">{ticket.customerName}</p>
                    <div className="flex items-center gap-3 text-[10px] text-white/30 mt-1">
                      <span>{ticket.deviceType}{ticket.deviceBrand && ` ${ticket.deviceBrand}`}{ticket.deviceModel && ` ${ticket.deviceModel}`}</span>
                      {ticket.serialNumber && <span className="font-mono">S/N: {ticket.serialNumber}</span>}
                    </div>
                    <p className="text-[10px] text-white/20 mt-1">{ticket.issueDescription}</p>
                    {ticket.diagnosis && <p className="text-[10px] text-sky-400/60 mt-0.5">Dx: {ticket.diagnosis}</p>}
                    {ticket.estimatedCostUSD && (
                      <p className="text-[10px] text-emerald-400 mt-0.5">Estimado: ${ticket.estimatedCostUSD}</p>
                    )}
                  </div>
                  {isActive && (
                    <button onClick={() => advanceStatus(ticket)}
                      className={`px-3 py-2 rounded-lg bg-${cfg.color}-500/10 text-${cfg.color}-400 text-[9px] font-bold uppercase hover:opacity-80 transition-all flex items-center gap-1 shrink-0`}>
                      <ChevronRight size={12} /> Avanzar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New ticket modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white mb-5">Nuevo Ticket</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Cliente</label>
                  <input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Teléfono</label>
                  <input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Tipo</label>
                  <select value={form.deviceType} onChange={e => setForm({ ...form, deviceType: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none">
                    {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Marca</label>
                  <input value={form.deviceBrand} onChange={e => setForm({ ...form, deviceBrand: e.target.value })} placeholder="Samsung"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Modelo</label>
                  <input value={form.deviceModel} onChange={e => setForm({ ...form, deviceModel: e.target.value })} placeholder="Galaxy S24"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Serial</label>
                <input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Problema Reportado</label>
                <textarea value={form.issueDescription} onChange={e => setForm({ ...form, issueDescription: e.target.value })} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none" />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1 block">Costo Estimado USD</label>
                <input type="number" step="0.01" value={form.estimatedCostUSD || ''} onChange={e => setForm({ ...form, estimatedCostUSD: +e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNew(false)} className="flex-1 py-3 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest">Cancelar</button>
              <button onClick={handleSave} disabled={!form.customerName || !form.issueDescription || saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                Crear Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
