import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { Clock, MessageCircle, Mail, CheckCircle2, LogOut, Loader2, RefreshCw } from 'lucide-react';

const WHATSAPP_NUMBER = '584125343141'; // 58 = Venezuela, 0412-534-3141 sin el 0
const CONTACT_EMAIL   = 'soporte@dualis.app';

export default function PendingApprovalWall() {
  const { user, userProfile, loading } = useAuth();
  const navigate                       = useNavigate();
  const { empresa_id }                 = useParams<{ empresa_id: string }>();
  const [checking, setChecking]        = useState(false);
  const [justChecked, setJustChecked]  = useState(false);

  const redirectIfActive = useCallback((status: string | undefined, bid: string | undefined) => {
    if (status === 'ACTIVE' && bid) {
      navigate(`/${bid}/admin/dashboard`, { replace: true });
    }
  }, [navigate]);

  // Tiempo real: cuando el SuperAdmin activa → redirige automáticamente
  useEffect(() => {
    if (!loading) {
      redirectIfActive(userProfile?.status, empresa_id || userProfile?.businessId);
    }
  }, [userProfile?.status, loading, empresa_id, userProfile?.businessId, redirectIfActive]);

  // Verificación manual: consulta Firestore directamente (fallback si onSnapshot falla)
  const handleManualCheck = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        const bid = data.businessId || data.empresa_id || empresa_id || '';
        if (data.status === 'ACTIVE') {
          redirectIfActive('ACTIVE', bid);
          return;
        }
      }
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 3000);
    } catch (e) {
      console.error('Error al verificar estado:', e);
    } finally {
      setChecking(false);
    }
  };

  const email   = userProfile?.email || userProfile?.displayName || '';
  const msgText = `Hola, mi cuenta en Dualis ERP está pendiente de activación. Mi correo es: ${email}`;
  const waUrl   = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msgText)}`;
  const mailUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Activación de cuenta Dualis')}&body=${encodeURIComponent(msgText)}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07091a] flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07091a] flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[10%]  w-[60%] h-[60%] rounded-full bg-amber-600/10  blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[5%] w-[50%] h-[50%] rounded-full bg-indigo-600/15 blur-[100px]" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative z-10 w-full max-w-md text-center animate-in fade-in-0 slide-in-from-bottom-4 duration-500">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-600/30">
            <span className="text-white font-black text-lg">D</span>
          </div>
          <span className="text-white font-black text-xl tracking-tight">Dualis ERP</span>
        </div>

        {/* Pulsing clock icon */}
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
          <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center">
            <Clock size={36} className="text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-3">
          Cuenta en revisión
        </h1>
        <p className="text-white/40 text-sm leading-relaxed mb-2">
          Tu registro fue recibido correctamente.
        </p>
        <p className="text-white/60 text-sm leading-relaxed mb-8">
          Un administrador de Dualis debe <strong className="text-white/80">activar tu cuenta</strong> antes de que puedas acceder al sistema.
          Este proceso suele tardar menos de <strong className="text-white/80">24 horas</strong>.
        </p>

        {/* Contact cards */}
        <div className="space-y-3 mb-8">
          {/* WhatsApp */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 w-full p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all group"
          >
            <div className="h-11 w-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/30 transition-all">
              <MessageCircle size={20} className="text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">WhatsApp</p>
              <p className="text-sm font-bold text-white mt-0.5">0412-534-3141</p>
              <p className="text-[10px] text-white/30 mt-0.5">Toca para escribir directo</p>
            </div>
            <div className="ml-auto text-emerald-500/40 group-hover:text-emerald-400 transition-colors">→</div>
          </a>

          {/* Email */}
          <a
            href={mailUrl}
            className="flex items-center gap-4 w-full p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all group"
          >
            <div className="h-11 w-11 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/30 transition-all">
              <Mail size={20} className="text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Correo electrónico</p>
              <p className="text-sm font-bold text-white mt-0.5">{CONTACT_EMAIL}</p>
              <p className="text-[10px] text-white/30 mt-0.5">Te responderemos a la brevedad</p>
            </div>
            <div className="ml-auto text-indigo-500/40 group-hover:text-indigo-400 transition-colors">→</div>
          </a>
        </div>

        {/* Auto-activation notice */}
        <div className="flex items-center gap-2.5 p-3.5 bg-white/[0.04] border border-white/[0.07] rounded-2xl mb-5">
          <CheckCircle2 size={14} className="text-indigo-400 shrink-0" />
          <p className="text-xs text-white/40 text-left">
            Cuando tu cuenta sea activada, <strong className="text-white/60">accederás automáticamente</strong> sin necesidad de volver a iniciar sesión.
          </p>
        </div>

        {/* Manual check button */}
        <button
          onClick={handleManualCheck}
          disabled={checking}
          className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/50 hover:text-white/80 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40"
        >
          {checking
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} className={justChecked ? 'text-emerald-400' : ''} />
          }
          {checking ? 'Verificando...' : justChecked ? 'Cuenta aún pendiente' : '¿Ya te activaron? Verificar ahora'}
        </button>

        {/* Logout */}
        <button
          onClick={() => auth.signOut()}
          className="flex items-center gap-2 mx-auto text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors"
        >
          <LogOut size={12} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
