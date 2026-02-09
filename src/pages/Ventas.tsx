import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import SimpleTable from '../components/SimpleTable';

export default function Ventas() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        if (!mounted) return;
        setSales(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch (e) {
        console.warn('Error loading sales', e);
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
        <h2 className="text-3xl font-black mb-6">Ventas</h2>
        <p className="text-slate-600 mb-6">POS, facturación y gestión de clientes.</p>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold mb-4">Ventas recientes</h4>
            {loading ? (
              <div className="text-sm text-slate-500">Cargando...</div>
            ) : (
              <SimpleTable columns={['ID', 'amount', 'customer', 'createdAt']} rows={sales} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
