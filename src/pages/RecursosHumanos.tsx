import React from 'react';

export default function RecursosHumanos() {
  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6">Recursos Humanos</h2>
        <p className="text-slate-600 mb-6">Gestión de personal, nómina y permisos.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Empleados</h4>
            <p className="text-sm text-slate-600 mt-2">Total: 12</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Nómina</h4>
            <p className="text-sm text-slate-600 mt-2">Próxima fecha de pago: 2026-02-28</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Permisos</h4>
            <p className="text-sm text-slate-600 mt-2">Solicitudes abiertas: 2</p>
          </div>
        </div>
      </div>
    </div>
  );
}
