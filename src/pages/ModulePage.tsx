import React from 'react';
import { Link } from 'react-router-dom';

export default function ModulePage({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="min-h-screen app-shell py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="app-panel p-10">
          <p className="app-subtitle">Modulo en desarrollo</p>
          <h1 className="app-title mb-4">{title}</h1>
          <p className="text-slate-600 mb-6">
            {desc || 'Contenido del modulo en desarrollo.'}
          </p>
          <div className="space-x-2">
            <Link to="/" className="px-4 py-2 app-btn app-btn-primary">
              Volver al Landing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
