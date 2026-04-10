import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, Clock, Zap, CreditCard, ShieldAlert } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useNavigate } from 'react-router-dom';

interface Props {
  businessId: string;
}

export default function TrialBanner({ businessId }: Props) {
  const {
    subscription, trialDaysLeft, planDaysLeft,
    graceDaysLeft, inGracePeriod, isExpired,
  } = useSubscription(businessId);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const billingPath = '/billing';

  if (!subscription || dismissed) return null;

  // ── Fully blocked (grace period exhausted) ────────────────────────────────
  // Data is NEVER deleted — only access is blocked until they renew.
  if (isExpired) {
    const wasTrial = subscription.status === 'trial' || (!subscription.currentPeriodEnd && subscription.trialEndsAt);
    return (
      <div className="relative z-40 flex items-center justify-center gap-4 px-5 py-3 bg-rose-950/60 border-b border-rose-500/30 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={14} className="text-rose-400 shrink-0" />
          <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest">
            {wasTrial
              ? 'Tu período de prueba ha expirado — acceso bloqueado'
              : 'Tu licencia ha expirado — acceso bloqueado hasta renovar'}
          </p>
        </div>
        <button
          onClick={() => navigate(billingPath)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 shrink-0"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
        >
          {wasTrial ? 'Activar plan' : 'Renovar licencia'} <ArrowRight size={11} />
        </button>
      </div>
    );
  }

  // ── Grace period (expired but 7-day window active) ────────────────────────
  // System still works but shows urgent non-dismissible warning.
  if (inGracePeriod && graceDaysLeft !== null) {
    return (
      <div className="relative z-40 flex items-center justify-between gap-4 px-5 py-3 border-b backdrop-blur-sm bg-rose-950/50 border-rose-500/25">
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle size={14} className="text-rose-400 shrink-0 animate-pulse" />
          <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest truncate">
            {graceDaysLeft === 0
              ? 'Último día de gracia — el acceso se bloqueará mañana'
              : `Licencia vencida — ${graceDaysLeft} día${graceDaysLeft !== 1 ? 's' : ''} de gracia antes de bloqueo`}
          </p>
          <span className="text-[9px] text-rose-400/60 font-bold hidden sm:inline">(tus datos están seguros)</span>
        </div>
        <button
          onClick={() => navigate(billingPath)}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 shrink-0 shadow-lg shadow-rose-500/20"
          style={{ background: 'linear-gradient(135deg,#e11d48,#be123c)' }}
        >
          <Zap size={10} className="fill-white" /> Renovar ahora <ArrowRight size={11} />
        </button>
      </div>
    );
  }

  // ── Active paid plan — show remaining days ────────────────────────────────
  if (subscription.status === 'active' && planDaysLeft !== null) {
    const urgent = planDaysLeft <= 5;
    const warning = planDaysLeft <= 15;
    const planName = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);

    if (!warning) return null;

    return (
      <div className={`relative z-40 flex items-center justify-between gap-4 px-5 py-2.5 border-b backdrop-blur-sm ${
        urgent
          ? 'bg-rose-950/50 border-rose-500/25'
          : 'bg-indigo-950/40 border-indigo-500/20'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {urgent
            ? <AlertTriangle size={13} className="text-rose-400 shrink-0" />
            : <CreditCard size={13} className="text-indigo-400 shrink-0" />}
          <p className={`text-[11px] font-black uppercase tracking-widest truncate ${urgent ? 'text-rose-300' : 'text-indigo-300'}`}>
            Licencia {planName} — {planDaysLeft === 0
              ? 'vence hoy'
              : `${planDaysLeft} día${planDaysLeft !== 1 ? 's' : ''} restante${planDaysLeft !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(billingPath)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
          >
            <Zap size={10} className="fill-white" /> Renovar
          </button>
          <button
            onClick={() => setDismissed(true)}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
              urgent ? 'text-rose-400/50 hover:bg-rose-500/10' : 'text-indigo-400/50 hover:bg-indigo-500/10'
            }`}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  // ── Trial active — show when ≤ 10 days left ──────────────────────────────
  if (subscription.status !== 'trial' || trialDaysLeft === null || trialDaysLeft > 10) return null;

  const urgent = trialDaysLeft <= 2;

  return (
    <div className={`relative z-40 flex items-center justify-between gap-4 px-5 py-2.5 border-b backdrop-blur-sm ${
      urgent
        ? 'bg-rose-950/50 border-rose-500/25'
        : 'bg-amber-950/40 border-amber-500/20'
    }`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {urgent
          ? <AlertTriangle size={13} className="text-rose-400 shrink-0" />
          : <Clock size={13} className="text-amber-400 shrink-0" />}
        <p className={`text-[11px] font-black uppercase tracking-widest truncate ${urgent ? 'text-rose-300' : 'text-amber-300'}`}>
          {trialDaysLeft === 0
            ? 'Tu período de prueba termina hoy'
            : `${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''} restante${trialDaysLeft !== 1 ? 's' : ''} de prueba gratuita`}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate(billingPath)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
        >
          <Zap size={10} className="fill-white" /> Activar ahora
        </button>
        <button
          onClick={() => setDismissed(true)}
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
            urgent ? 'text-rose-400/50 hover:bg-rose-500/10' : 'text-amber-400/50 hover:bg-amber-500/10'
          }`}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
