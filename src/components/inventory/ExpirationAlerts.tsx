import React, { useMemo } from 'react';
import { AlertTriangle, Calendar, Clock } from 'lucide-react';

interface Product {
  id: string;
  nombre: string;
  codigo?: string;
  stock: number;
  fechaVencimiento?: string;
  lote?: string;
}

interface Props {
  products: Product[];
  warningDays?: number;  // days before expiry to start warning (default 90)
}

export default function ExpirationAlerts({ products, warningDays = 90 }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = useMemo(() => {
    const expired: Product[] = [];
    const expiringSoon: (Product & { daysLeft: number })[] = [];

    for (const p of products) {
      if (!p.fechaVencimiento || p.stock <= 0) continue;
      const expDate = new Date(p.fechaVencimiento + 'T00:00:00');
      const diffMs = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expired.push(p);
      } else if (diffDays <= warningDays) {
        expiringSoon.push({ ...p, daysLeft: diffDays });
      }
    }

    expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);
    return { expired, expiringSoon };
  }, [products, warningDays]);

  if (alerts.expired.length === 0 && alerts.expiringSoon.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Expired */}
      {alerts.expired.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-rose-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">
              {alerts.expired.length} producto{alerts.expired.length > 1 ? 's' : ''} vencido{alerts.expired.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-1.5">
            {alerts.expired.slice(0, 10).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-rose-500/5 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-rose-300">{p.nombre}</p>
                  <p className="text-[10px] text-rose-400/50">
                    {p.codigo && `${p.codigo} — `}
                    {p.lote && `Lote: ${p.lote} — `}
                    Stock: {p.stock}
                  </p>
                </div>
                <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-2 py-1 rounded-lg">
                  Venció {p.fechaVencimiento}
                </span>
              </div>
            ))}
            {alerts.expired.length > 10 && (
              <p className="text-[10px] text-rose-400/40 text-center">+{alerts.expired.length - 10} más</p>
            )}
          </div>
        </div>
      )}

      {/* Expiring soon */}
      {alerts.expiringSoon.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-amber-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              {alerts.expiringSoon.length} producto{alerts.expiringSoon.length > 1 ? 's' : ''} por vencer
            </p>
          </div>
          <div className="space-y-1.5">
            {alerts.expiringSoon.slice(0, 10).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-amber-500/5 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-amber-300">{p.nombre}</p>
                  <p className="text-[10px] text-amber-400/50">
                    {p.codigo && `${p.codigo} — `}
                    {p.lote && `Lote: ${p.lote} — `}
                    Stock: {p.stock}
                  </p>
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                  p.daysLeft <= 7
                    ? 'text-rose-400 bg-rose-500/10'
                    : p.daysLeft <= 30
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-yellow-400 bg-yellow-500/10'
                }`}>
                  {p.daysLeft === 0 ? 'Hoy' : p.daysLeft === 1 ? 'Mañana' : `${p.daysLeft} días`}
                </span>
              </div>
            ))}
            {alerts.expiringSoon.length > 10 && (
              <p className="text-[10px] text-amber-400/40 text-center">+{alerts.expiringSoon.length - 10} más</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
