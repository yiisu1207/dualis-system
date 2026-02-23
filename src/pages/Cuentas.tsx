import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Customer, Movement, MovementType, Supplier } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import { isDemoMode, loadDemoData } from '../utils/demoStore';

export default function Cuentas() {
  const { userProfile } = useAuth();
  const [clients, setClients] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        if (isDemoMode()) {
          const demo = loadDemoData();
          setClients((demo?.customers || []) as Customer[]);
          setSuppliers((demo?.suppliers || []) as Supplier[]);
          setMovements((demo?.movements || []) as Movement[]);
          return;
        }
        if (!userProfile?.businessId) return;
        const cSnap = await getDocs(
          query(collection(db, 'customers'), where('businessId', '==', userProfile.businessId))
        );
        const sSnap = await getDocs(
          query(collection(db, 'suppliers'), where('businessId', '==', userProfile.businessId))
        );
        const mSnap = await getDocs(
          query(collection(db, 'movements'), where('businessId', '==', userProfile.businessId))
        );
        if (!mounted) return;
        setClients(cSnap.docs.map((d) => d.data() as Customer));
        setSuppliers(sSnap.docs.map((d) => d.data() as Supplier));
        setMovements(mSnap.docs.map((d) => d.data() as Movement));
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
  }, [userProfile?.businessId]);

  const clientBalances = useMemo(() => {
    const map = new Map<string, number>();
    movements
      .filter((m) => !m.isSupplierMovement)
      .forEach((m) => {
        const amount = getMovementUsdAmount(m);
        const delta = m.movementType === MovementType.FACTURA ? amount : -amount;
        map.set(m.entityId, (map.get(m.entityId) || 0) + delta);
      });
    return map;
  }, [movements]);

  const supplierBalances = useMemo(() => {
    const map = new Map<string, number>();
    movements
      .filter((m) => m.isSupplierMovement)
      .forEach((m) => {
        const amount = getMovementUsdAmount(m);
        const delta = m.movementType === MovementType.FACTURA ? amount : -amount;
        map.set(m.entityId, (map.get(m.entityId) || 0) + delta);
      });
    return map;
  }, [movements]);

  return (
    <div className="min-h-screen bg-slate-50 py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6 text-slate-900">Cuentas</h2>
        <p className="text-slate-600 mb-6">
          Gestión de proveedores y clientes. Seguimiento de facturas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900">Clientes con saldo</h4>
            {loading ? (
              <div className="text-sm text-slate-500 mt-3">Cargando clientes...</div>
            ) : (
              <ul className="mt-3 text-sm text-slate-600 space-y-2">
                {clients.length === 0 && (
                  <li className="text-slate-400">No hay clientes registrados.</li>
                )}
                {clients.map((c) => (
                  <li key={c.id}>
                    {c.id} — {formatCurrency(clientBalances.get(c.id) || 0)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900">Proveedores</h4>
            {loading ? (
              <div className="text-sm text-slate-500 mt-3">Cargando proveedores...</div>
            ) : (
              <ul className="mt-3 text-sm text-slate-600 space-y-2">
                {suppliers.length === 0 && (
                  <li className="text-slate-400">No hay proveedores registrados.</li>
                )}
                {suppliers.map((s) => (
                  <li key={s.id}>
                    {s.id} — {formatCurrency(supplierBalances.get(s.id) || 0)}
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
