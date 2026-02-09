import React from 'react';
import { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs } from 'firebase/firestore';

export default function Finanzas() {
  const [businesses, setBusinesses] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'businesses'));
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (mounted) setBusinesses(items);
      } catch (e) {
        console.warn('No se pudieron obtener businesses', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6">Finanzas</h2>
        <p className="text-slate-600 mb-6">
          Panel financiero con saldos, conciliaciones y reportes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100">
            <div className="text-sm text-indigo-600 font-bold">Balance General</div>
            <div className="text-2xl font-black mt-4">$ 12,450.00</div>
            <div className="text-xs text-slate-500 mt-2">Actualizado hace 2 horas</div>
          </div>
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100">
            <div className="text-sm text-emerald-600 font-bold">Flujo de Caja</div>
            <div className="text-2xl font-black mt-4">$ 3,200.00</div>
            <div className="text-xs text-slate-500 mt-2">Proyección semanal</div>
          </div>
          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100">
            <div className="text-sm text-amber-600 font-bold">Cuentas por Cobrar</div>
            <div className="text-2xl font-black mt-4">$ 8,900.00</div>
            <div className="text-xs text-slate-500 mt-2">Pendientes: 12 facturas</div>
          </div>
        </div>

        <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-lg font-bold mb-4">Negocios detectados</h3>
          {loading && <div className="text-sm text-slate-500">Cargando negocios...</div>}
          {!loading && businesses.length === 0 && (
            <div className="text-sm text-slate-400">
              No hay negocios visibles (requiere acceso).
            </div>
          )}
          <ul className="space-y-3">
            {businesses.map((b) => (
              <li key={b.id} className="p-3 bg-white rounded-lg border border-slate-100">
                <div className="font-bold">{b.name || '(sin nombre)'}</div>
                <div className="text-xs text-slate-500">ID: {b.id}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
