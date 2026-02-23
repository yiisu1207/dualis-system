import React from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';

export default function AdminLayout() {
  const { empresa_id } = useParams();
  const base = `/${empresa_id || ''}/admin`;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="w-64 border-r border-slate-200 bg-white p-4">
        <div className="text-xs font-black uppercase text-slate-400">Dualis Admin</div>
        <nav className="mt-4 space-y-2 text-sm font-semibold">
          <Link to={base} className="block rounded-lg px-3 py-2 hover:bg-slate-100">
            Dashboard
          </Link>
          <Link to={`${base}/inventario`} className="block rounded-lg px-3 py-2 hover:bg-slate-100">
            Inventario
          </Link>
          <Link to={`${base}/finanzas`} className="block rounded-lg px-3 py-2 hover:bg-slate-100">
            Finanzas
          </Link>
          <Link to={`${base}/facturacion`} className="block rounded-lg px-3 py-2 hover:bg-slate-100">
            Planes y Facturacion
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
