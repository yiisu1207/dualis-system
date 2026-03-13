import React from 'react';
import { useParams } from 'react-router-dom';
import { Factory, Wrench } from 'lucide-react';

function PosMayorContent() {
  return (
    <div className="h-screen bg-[#070b14] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20 mb-8">
          <Factory size={40} className="text-violet-400" />
        </div>
        <h1 className="text-3xl font-black text-white mb-3 tracking-tight">POS al Mayor</h1>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
          <Wrench size={14} className="text-amber-400" />
          <span className="text-sm font-bold text-amber-400">En desarrollo</span>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          Estamos trabajando en el punto de venta al mayor con soporte para ventas a credito,
          condiciones de pago, precios mayoristas y mas. Disponible muy pronto.
        </p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-bold text-white hover:bg-white/[0.1] transition-all"
        >
          Volver al sistema
        </button>
      </div>
    </div>
  );
}

export default function PosMayor() {
  const { empresa_id } = useParams();
  if (!empresa_id) {
    return <div className="h-screen flex items-center justify-center text-slate-400 font-black uppercase tracking-widest text-xs">Error: empresa no identificada.</div>;
  }
  return <PosMayorContent />;
}
