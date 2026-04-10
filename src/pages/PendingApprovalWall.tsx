import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { Clock, CheckCircle2, LogOut, Loader2, RefreshCw, Building2, Users } from 'lucide-react';

export default function PendingApprovalWall() {
  const { user, userProfile, loading } = useAuth();
  const navigate                       = useNavigate();
  const [checking, setChecking]        = useState(false);
  const [justChecked, setJustChecked]  = useState(false);
  const [businessName, setBusinessName] = useState<string>('');
  const [loadingBiz, setLoadingBiz]    = useState(true);

  const bid = userProfile?.businessId || userProfile?.empresa_id || '';

  const redirectIfActive = useCallback((status: string | undefined, businessId: string | undefined) => {
    if (status === 'ACTIVE' && businessId) {
      navigate('/admin/dashboard', { replace: true });
    }
    if (status === 'REJECTED') {
      // Stay on page but update UI
    }
  }, [navigate]);

  // Auto-redirect when status changes to ACTIVE
  useEffect(() => {
    if (!loading) {
      redirectIfActive(userProfile?.status, bid);
    }
  }, [userProfile?.status, loading, bid, redirectIfActive]);

  // Fetch business name
  useEffect(() => {
    if (!bid) { setLoadingBiz(false); return; }
    getDoc(doc(db, 'businesses', bid))
      .then(snap => {
        if (snap.exists()) setBusinessName(snap.data().name || '');
      })
      .catch(() => {})
      .finally(() => setLoadingBiz(false));
  }, [bid]);

  // Manual check
  const handleManualCheck = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        const b = data.businessId || data.empresa_id || bid;
        if (data.status === 'ACTIVE') {
          redirectIfActive('ACTIVE', b);
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

  const isRejected = userProfile?.status === 'REJECTED';

  if (loading || loadingBiz) {
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
        <div className={`absolute top-[-20%] left-[10%] w-[60%] h-[60%] rounded-full ${isRejected ? 'bg-red-600/10' : 'bg-amber-600/10'} blur-[120px]`} />
        <div className="absolute bottom-[-15%] right-[5%] w-[50%] h-[50%] rounded-full bg-indigo-600/15 blur-[100px]" />
      </div>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative z-10 w-full max-w-md text-center animate-in fade-in-0 slide-in-from-bottom-4 duration-500">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <img src="/logo.png" alt="Dualis" className="h-10 w-auto" />
          <span className="text-white font-black text-xl tracking-tight">Dualis ERP</span>
        </div>

        {isRejected ? (
          /* ── REJECTED state ── */
          <>
            <div className="relative mx-auto mb-8 w-24 h-24">
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center">
                <span className="text-4xl">✕</span>
              </div>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-3">
              Solicitud rechazada
            </h1>
            <p className="text-white/50 text-sm leading-relaxed mb-8">
              Tu solicitud de acceso al espacio <strong className="text-white/80">{businessName || bid}</strong> fue rechazada por el administrador.
              Contacta directamente con el administrador si crees que es un error.
            </p>
          </>
        ) : (
          /* ── PENDING state ── */
          <>
            {/* Pulsing clock icon */}
            <div className="relative mx-auto mb-8 w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center">
                <Clock size={36} className="text-amber-400" />
              </div>
            </div>

            <h1 className="text-3xl font-black text-white tracking-tight leading-tight mb-3">
              Esperando aprobación
            </h1>

            {/* Business card */}
            {(businessName || bid) && (
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-3.5 mb-4 text-left">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Espacio solicitado</p>
                  <p className="text-sm font-black text-white">{businessName || bid}</p>
                </div>
              </div>
            )}

            <p className="text-white/50 text-sm leading-relaxed mb-8">
              El <strong className="text-white/80">dueño o administrador</strong> del espacio debe aprobar tu acceso.
              Te notificaremos automáticamente cuando seas aprobado.
            </p>

            {/* What happens next */}
            <div className="space-y-2.5 mb-8 text-left">
              {[
                { icon: Users, text: 'Tu solicitud ya está en el panel del administrador', color: 'indigo' },
                { icon: CheckCircle2, text: 'Cuando te aprueben, accederás automáticamente', color: 'emerald' },
                { icon: Clock, text: 'Si no recibes respuesta, contáctalo directamente', color: 'amber' },
              ].map(({ icon: Icon, text, color }, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 bg-${color}-500/[0.05] border border-${color}-500/15 rounded-xl`}>
                  <Icon size={14} className={`text-${color}-400 shrink-0`} />
                  <p className="text-xs text-white/50">{text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Auto-activation notice */}
        {!isRejected && (
          <div className="flex items-center gap-2.5 p-3.5 bg-white/[0.04] border border-white/[0.07] rounded-2xl mb-5">
            <CheckCircle2 size={14} className="text-indigo-400 shrink-0" />
            <p className="text-xs text-white/40 text-left">
              Cuando tu cuenta sea activada, <strong className="text-white/60">accederás automáticamente</strong> sin necesidad de volver a iniciar sesión.
            </p>
          </div>
        )}

        {/* Manual check button */}
        {!isRejected && (
          <button
            onClick={handleManualCheck}
            disabled={checking}
            className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/50 hover:text-white/80 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-40"
          >
            {checking
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} className={justChecked ? 'text-emerald-400' : ''} />
            }
            {checking ? 'Verificando...' : justChecked ? 'Aún pendiente de aprobación' : '¿Ya te aprobaron? Verificar ahora'}
          </button>
        )}

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
