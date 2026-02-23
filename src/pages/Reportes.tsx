import React from 'react';

export default function Reportes() {
  return (
    <div className="min-h-screen bg-slate-50 py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6 text-slate-900">Reportes</h2>
        <p className="text-slate-600 mb-6">
          Reportes financieros, inventario y rendimiento.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900">Ventas Mensuales</h4>
            <p className="text-sm text-slate-600 mt-2">Gráfico y comparativa.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900">Stock</h4>
            <p className="text-sm text-slate-600 mt-2">Alertas por ubicación.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-900">Clientes</h4>
            <p className="text-sm text-slate-600 mt-2">Top compradores y retención.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
