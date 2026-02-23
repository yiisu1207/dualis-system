import React from 'react';
import { Link } from 'react-router-dom';

export default function NotAuthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
      <h1 className="text-2xl font-black">Acceso no autorizado</h1>
      <p className="text-sm text-slate-500">No tienes permisos para esta empresa.</p>
      <Link to="/login" className="text-sm font-semibold text-slate-700 underline">
        Volver a iniciar sesion
      </Link>
    </div>
  );
}
