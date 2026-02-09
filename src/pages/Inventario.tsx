import React from 'react';
import { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function Inventario() {
  const [items, setItems] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'items'));
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as any));
        if (!mounted) return;
        setItems(all);
        setLowStock(all.filter((a) => (a.stock ?? 0) <= (a.reorder ?? 5)));
      } catch (e) {
        console.warn('Error cargando inventario', e);
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
        <h2 className="text-3xl font-black mb-6">Inventario</h2>
        <p className="text-slate-600 mb-6">Control de stock, entradas/salidas y ubicaciones.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Artículos</h4>
            {loading ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : (
              <p className="text-sm text-slate-600 mt-2">Total productos: {items.length}</p>
            )}
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Stock bajo</h4>
            {loading ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : (
              <p className="text-sm text-slate-600 mt-2">Items en alerta: {lowStock.length}</p>
            )}
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Ubicaciones</h4>
            <p className="text-sm text-slate-600 mt-2">Almacenes: 2</p>
          </div>
        </div>
      </div>
    </div>
  );
}
