import React from 'react';
import { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs } from 'firebase/firestore';

export default function Cuentas() {
  const [clients, setClients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const cSnap = await getDocs(collection(db, 'clients'));
        const sSnap = await getDocs(collection(db, 'suppliers'));
        if (!mounted) return;
        setClients(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSuppliers(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Error fetching cuentas data', e);
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
    <div className="min-h-screen bg-slate-50 py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6">Cuentas</h2>
        <p className="text-slate-600 mb-6">
          Gestión de proveedores y clientes. Seguimiento de facturas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Clientes con saldo</h4>
            {loading ? (
              <div className="text-sm text-slate-500 mt-3">Cargando clientes...</div>
            ) : (
              <ul className="mt-3 text-sm text-slate-600 space-y-2">
                {clients.length === 0 && (
                  <li className="text-slate-400">No hay clientes registrados.</li>
                )}
                {clients.map((c) => (
                  <li key={c.id}>
                    {c.name || c.email} — {c.balance ?? '$0.00'}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Proveedores</h4>
            {loading ? (
              <div className="text-sm text-slate-500 mt-3">Cargando proveedores...</div>
            ) : (
              <ul className="mt-3 text-sm text-slate-600 space-y-2">
                {suppliers.length === 0 && (
                  <li className="text-slate-400">No hay proveedores registrados.</li>
                )}
                {suppliers.map((s) => (
                  <li key={s.id}>
                    {s.name} — Vencimiento {s.dueDays ?? 'N/A'} días
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
