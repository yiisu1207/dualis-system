import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
      <h1 className="text-2xl font-black">Ruta no encontrada</h1>
      <p className="text-sm text-slate-500">La pagina solicitada no existe.</p>
      <Link to="/" className="text-sm font-semibold text-slate-700 underline">
        Ir al inicio
      </Link>
    </div>
  );
}
