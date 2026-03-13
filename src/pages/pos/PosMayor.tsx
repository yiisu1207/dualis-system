import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Factory, Wrench, AlertTriangle, LogOut } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

// ─── ACCESS DENIED SCREEN ────────────────────────────────────────────────────
const AccessDenied = () => (
  <div className="h-screen bg-[#070b14] flex items-center justify-center p-8">
    <div className="text-center max-w-md">
      <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-red-600/20 to-rose-600/20 border border-red-500/20 mb-8">
        <AlertTriangle size={40} className="text-red-400" />
      </div>
      <h1 className="text-3xl font-black text-white mb-3 tracking-tight">Acceso Denegado</h1>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
        <LogOut size={14} className="text-red-400" />
        <span className="text-sm font-bold text-red-400">Sin autorizacion</span>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed mb-4">
        Este punto de venta requiere un enlace seguro generado por el administrador.
        Solicita el enlace kiosco al dueno o administrador del sistema.
      </p>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 text-left">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">Como acceder</p>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
          <li>El administrador abre el turno desde <strong className="text-white/60">Cajas</strong></li>
          <li>Copia o envia el <strong className="text-white/60">enlace kiosco</strong> al dispositivo</li>
          <li>Abre el enlace en este dispositivo para usar la caja</li>
        </ol>
      </div>
    </div>
  </div>
);

function PosMayorContent() {
  const [searchParams] = useSearchParams();
  const { empresa_id } = useParams();
  const cajaId = searchParams.get('cajaId');
  const urlToken = searchParams.get('token');

  // Token validation
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!cajaId || !empresa_id || !urlToken) {
      setTokenValid(false);
      return;
    }
    getDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId)).then(snap => {
      if (!snap.exists()) { setTokenValid(false); return; }
      const data = snap.data();
      setTokenValid(data.sessionToken === urlToken && data.estado === 'abierta');
    }).catch(() => setTokenValid(false));
  }, [cajaId, empresa_id, urlToken]);

  if (tokenValid === null) {
    return (
      <div className="h-screen bg-[#070b14] flex items-center justify-center">
        <div className="animate-spin h-9 w-9 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!tokenValid) return <AccessDenied />;

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
