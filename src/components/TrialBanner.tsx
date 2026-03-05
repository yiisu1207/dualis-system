import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, Clock, Zap } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useNavigate, useParams } from 'react-router-dom';

interface Props {
  businessId: string;
}

export default function TrialBanner({ businessId }: Props) {
  const { subscription, trialDaysLeft, isExpired } = useSubscription(businessId);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const { empresa_id } = useParams<{ empresa_id: string }>();
  const billingPath = `/${empresa_id ?? businessId}/billing`;

  // Nothing to show if active paid plan or user dismissed
  if (!subscription || dismissed) return null;
  if (subscription.status === 'active') return null;

  // ── Expired ────────────────────────────────────────────────────────────────
  if (isExpired) {
    return (
      <div className="relative z-40 flex items-center justify-center gap-4 px-5 py-3 bg-rose-950/60 border-b border-rose-500/30 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={14} className="text-rose-400 shrink-0" />
          <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest">
            Tu período de prueba ha expirado — el acceso está limitado
          </p>
        </div>
        <button
          onClick={() => navigate(billingPath)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 shrink-0"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
        >
          Activar plan <ArrowRight size={11} />
        </button>
      </div>
    );
  }

  // ── Trial active — show when ≤ 10 days left (30-day trial) ──────────────
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
