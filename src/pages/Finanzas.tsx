import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Movement, MovementType } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { isDemoMode, loadDemoData } from '../utils/demoStore';

export default function Finanzas() {
  const { userProfile } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!userProfile?.businessId) return;
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'movements'), where('businessId', '==', userProfile.businessId), orderBy('date', 'desc'))
        );
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movement));
        if (mounted) setMovements(items);
      } catch (e) {
        console.warn('No se pudieron obtener movimientos', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [userProfile?.businessId]);

  const summary = useMemo(() => {
    const customerMovs = movements.filter((m) => !m.isSupplierMovement);
    const totalDebt = customerMovs
      .filter((m) => m.movementType === MovementType.FACTURA)
      .reduce((sum, m) => sum + getMovementUsdAmount(m), 0);
    const totalPaid = customerMovs
      .filter((m) => m.movementType === MovementType.ABONO)
      .reduce((sum, m) => sum + getMovementUsdAmount(m), 0);
    const balance = totalDebt - totalPaid;
    const lastMovement = movements
      .map((m) => m.createdAt || m.date)
      .sort()
      .slice(-1)[0];

    return {
      totalDebt,
      totalPaid,
      balance,
      lastMovement,
      recentMovements: [...movements]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    };
  }, [movements]);

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6 text-slate-900">Finanzas</h2>
        <p className="text-slate-600 mb-6">
          Panel financiero con saldos, conciliaciones y reportes.
        </p>

        {!userProfile?.businessId && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-semibold mb-6">
            No hay espacio de trabajo activo. Inicia sesion con un usuario vinculado.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100">
            <div className="text-sm text-indigo-600 font-bold">Balance General</div>
            <div className="text-2xl font-black mt-4">
              {formatCurrency(summary.balance)}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Ultimo movimiento: {summary.lastMovement || 'Sin datos'}
            </div>
          </div>
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
            <div className="text-sm text-emerald-600 font-bold">Flujo de Caja</div>
            <div className="text-2xl font-black mt-4">
              {formatCurrency(summary.totalPaid)}
            </div>
            <div className="text-xs text-slate-500 mt-2">Ingresos reales cobrados</div>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100">
            <div className="text-sm text-amber-600 font-bold">Cuentas por Cobrar</div>
            <div className="text-2xl font-black mt-4">
              {formatCurrency(summary.totalDebt)}
            </div>
            <div className="text-xs text-slate-500 mt-2">Cartera pendiente clientes</div>
          </div>
        </div>

        <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-lg font-bold mb-4 text-slate-900">Movimientos recientes</h3>
          {loading && <div className="text-sm text-slate-500">Cargando movimientos...</div>}
          {!loading && summary.recentMovements.length === 0 && (
            <div className="text-sm text-slate-400">No hay movimientos registrados.</div>
          )}
          <ul className="space-y-3">
            {summary.recentMovements.map((m) => (
              <li key={m.id} className="p-3 bg-white rounded-lg border border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-slate-900">{m.entityId}</div>
                    <div className="text-xs text-slate-500">
                      {m.date} • {m.concept}
                    </div>
                  </div>
                  <div className="text-right text-sm font-black text-slate-900">
                    {formatCurrency(getMovementUsdAmount(m))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
