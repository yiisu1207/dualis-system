import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { usePortal } from './PortalGuard';
import { PreOrder, PreOrderStatus } from '../../types';
import { Package, Clock, CheckCircle, Truck, XCircle, Calendar, DollarSign } from 'lucide-react';

const STATUS_CONFIG: Record<PreOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:     { label: 'Pendiente',  color: 'amber',   icon: Clock },
  confirmed:   { label: 'Confirmado', color: 'indigo',  icon: CheckCircle },
  in_progress: { label: 'En proceso', color: 'sky',     icon: Package },
  ready:       { label: 'Listo',      color: 'emerald', icon: CheckCircle },
  delivered:   { label: 'Entregado',  color: 'emerald', icon: Truck },
  cancelled:   { label: 'Cancelado',  color: 'rose',    icon: XCircle },
};

export default function PortalPedidos() {
  const { businessId, customerId } = usePortal();
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId || !customerId) return;
    const q = query(
      collection(db, `businesses/${businessId}/preorders`),
      where('customerId', '==', customerId),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as PreOrder)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [businessId, customerId]);

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [orders],
  );

  const active = sorted.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const history = sorted.filter(o => o.status === 'delivered' || o.status === 'cancelled');

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
        <Package size={48} className="text-white/10 mx-auto mb-4" />
        <h2 className="text-lg font-black text-white mb-1">Sin pre-pedidos</h2>
        <p className="text-xs text-white/30">Cuando reserves un pedido aparecerá aquí.</p>
      </div>
    );
  }

  const renderOrder = (order: PreOrder) => {
    const cfg = STATUS_CONFIG[order.status];
    const Icon = cfg.icon;
    const balance = Number(order.totalUSD || 0) - Number(order.depositUSD || 0);
    return (
      <div key={order.id} className="bg-[#0d1424] rounded-2xl border border-white/[0.06] p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-sm font-black text-white">Pedido #{order.id.slice(0, 6).toUpperCase()}</p>
              <p className="text-[10px] text-white/30 flex items-center gap-1 mt-0.5">
                <Calendar size={10} /> {order.deliveryDate}{order.deliveryTime && ` ${order.deliveryTime}`}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-${cfg.color}-500/10 text-${cfg.color}-400`}>
            {cfg.label}
          </span>
        </div>

        <div className="space-y-1 mb-3">
          {order.items.map((it, i) => (
            <p key={i} className="text-[11px] text-white/50">
              {it.quantity}x {it.name}
              <span className="text-white/30"> — ${(it.quantity * it.priceUSD).toFixed(2)}</span>
            </p>
          ))}
        </div>

        <div className="border-t border-white/[0.05] pt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">Total</p>
            <p className="text-sm font-black text-white">${Number(order.totalUSD || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">Depósito</p>
            <p className="text-sm font-black text-emerald-400">${Number(order.depositUSD || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">Saldo</p>
            <p className={`text-sm font-black ${balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              ${balance.toFixed(2)}
            </p>
          </div>
        </div>

        {order.notes && (
          <p className="text-[10px] text-white/30 italic mt-2 pt-2 border-t border-white/[0.04]">
            {order.notes}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-black text-white tracking-tight">Mis Pre-Pedidos</h1>
        <p className="text-xs text-white/30 mt-1">{sorted.length} pedido{sorted.length === 1 ? '' : 's'} en tu historial</p>
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
            <Clock size={12} /> Activos ({active.length})
          </p>
          {active.map(renderOrder)}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
            <CheckCircle size={12} /> Historial ({history.length})
          </p>
          {history.map(renderOrder)}
        </div>
      )}
    </div>
  );
}
