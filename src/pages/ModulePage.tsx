import React from 'react';
import { Link } from 'react-router-dom';

export default function ModulePage({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-3xl font-black mb-4">{title}</h1>
        <p className="text-slate-600 mb-6">{desc || 'Contenido del módulo en desarrollo.'}</p>
        <div className="space-x-2">
          <Link to="/" className="px-4 py-2 bg-indigo-600 text-white rounded">
            Volver al Landing
          </Link>
        </div>
      </div>
    </div>
  );
}
