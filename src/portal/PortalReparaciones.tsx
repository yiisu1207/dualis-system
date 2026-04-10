import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { usePortal } from './PortalGuard';
import { RepairTicket, TicketStatus } from '../../types';
import { Wrench, Clock, CheckCircle, Truck, XCircle, Package, DollarSign } from 'lucide-react';

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: React.ElementType }> = {
  received:      { label: 'Recibido',         color: 'amber',   icon: Clock },
  diagnosing:    { label: 'Diagnosticando',   color: 'sky',     icon: Wrench },
  waiting_parts: { label: 'Esperando piezas', color: 'violet',  icon: Package },
  in_repair:     { label: 'En reparación',    color: 'indigo',  icon: Wrench },
  ready:         { label: 'Listo',            color: 'emerald', icon: CheckCircle },
  delivered:     { label: 'Entregado',        color: 'emerald', icon: Truck },
  cancelled:     { label: 'Cancelado',        color: 'rose',    icon: XCircle },
};

export default function PortalReparaciones() {
  const { businessId, customerId } = usePortal();
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId || !customerId) return;
    const q = query(
      collection(db, `businesses/${businessId}/repair_tickets`),
      where('customerId', '==', customerId),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [businessId, customerId]);

  const sorted = useMemo(
    () => [...tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [tickets],
  );

  const active = sorted.filter(t => t.status !== 'delivered' && t.status !== 'cancelled');
  const history = sorted.filter(t => t.status === 'delivered' || t.status === 'cancelled');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-20">
        <Wrench size={48} className="text-white/10 mx-auto mb-4" />
        <h2 className="text-lg font-black text-white mb-1">Sin tickets de reparación</h2>
        <p className="text-xs text-white/30">Tus equipos en reparación aparecerán aquí.</p>
      </div>
    );
  }

  const renderTicket = (ticket: RepairTicket) => {
    const cfg = STATUS_CONFIG[ticket.status];
    const Icon = cfg.icon;
    const cost = ticket.finalCostUSD ?? ticket.estimatedCostUSD ?? 0;
    return (
      <div key={ticket.id} className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-sm font-black text-white">{ticket.ticketNumber}</p>
              <p className="text-[10px] text-white/30">
                {ticket.deviceType}{ticket.deviceBrand && ` ${ticket.deviceBrand}`}{ticket.deviceModel && ` ${ticket.deviceModel}`}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
            {cfg.label}
          </span>
        </div>

        <div className="space-y-1 mb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Problema</p>
          <p className="text-[11px] text-white/60">{ticket.issueDescription}</p>
          {ticket.diagnosis && (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mt-2">Diagnóstico</p>
              <p className="text-[11px] text-sky-400/70">{ticket.diagnosis}</p>
            </>
          )}
        </div>

        <div className="border-t border-white/[0.05] pt-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">
              {ticket.finalCostUSD ? 'Costo final' : 'Costo estimado'}
            </p>
            <p className="text-sm font-black text-emerald-400 flex items-center gap-1">
              <DollarSign size={12} /> {cost.toFixed(2)}
            </p>
          </div>
          {(ticket as any).invoiceMovementId && (
            <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
              Cobrado
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-black text-white tracking-tight">Mis Reparaciones</h1>
        <p className="text-xs text-white/30 mt-1">{sorted.length} ticket{sorted.length === 1 ? '' : 's'}</p>
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
            <Clock size={12} /> En proceso ({active.length})
          </p>
          {active.map(renderTicket)}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
            <CheckCircle size={12} /> Historial ({history.length})
          </p>
          {history.map(renderTicket)}
        </div>
      )}
    </div>
  );
}
