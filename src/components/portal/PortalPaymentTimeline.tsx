import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PortalPayment } from '../../../types';
import { Clock, Eye, CheckCircle2, XCircle, X as XIcon, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  businessId: string;
  payments: PortalPayment[];
}

const SEVEN_DAYS_MS = 7 * 86_400_000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export default function PortalPaymentTimeline({ businessId, payments }: Props) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Solo mostrar pagos creados en últimos 7 días que no estén entregados/cancelados ya
  const visible = payments
    .filter(p => {
      const age = Date.now() - new Date(p.createdAt).getTime();
      return age < SEVEN_DAYS_MS && p.status !== 'cancelled';
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (visible.length === 0) return null;

  const handleCancel = async (p: PortalPayment) => {
    if (!p.id) return;
    if (!confirm('¿Cancelar este pago? Esta acción no se puede deshacer pero puedes registrar uno nuevo.')) return;
    setCancelling(p.id);
    setError('');
    try {
      await updateDoc(doc(db, `businesses/${businessId}/portalPayments`, p.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer',
        // Liberar fingerprint para permitir reintento con misma referencia
        fingerprint: null,
      });
    } catch (err: any) {
      setError(err?.message || 'No se pudo cancelar');
    } finally {
      setCancelling(null);
    }
  };

  const canCancel = (p: PortalPayment) => {
    if (p.status !== 'pending') return false;
    return Date.now() - new Date(p.createdAt).getTime() < TWO_HOURS_MS;
  };

  return (
    <div className="bg-[#0d1424] rounded-2xl border border-white/[0.07] shadow-lg overflow-hidden">
      <div className="px-4 sm:px-6 py-3 border-b border-white/[0.07] flex items-center justify-between">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">
          Mis Pagos en Curso
        </h3>
        <span className="text-[9px] font-bold text-white/30">{visible.length} activo{visible.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {visible.map(p => {
          const isCancellable = canCancel(p);
          const isProcessingCancel = cancelling === p.id;

          // Estados de la línea
          const sentDone = true;
          const reviewActive = p.status === 'pending';
          const finalDone = p.status === 'approved' || p.status === 'rejected';
          const finalRejected = p.status === 'rejected';

          return (
            <div key={p.id} className="px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white truncate">
                    ${p.amount.toFixed(2)} · {p.metodoPago}
                  </p>
                  <p className="text-[9px] text-white/30 font-bold">
                    Ref {p.referencia} · {new Date(p.createdAt).toLocaleString('es-VE')}
                  </p>
                </div>
                {isCancellable && (
                  <button
                    onClick={() => handleCancel(p)}
                    disabled={isProcessingCancel}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[9px] font-black uppercase transition-all disabled:opacity-50"
                    title="Cancelar pago (disponible 2h tras envío)"
                  >
                    {isProcessingCancel ? <Loader2 size={10} className="animate-spin" /> : <XIcon size={10} />}
                    Cancelar
                  </button>
                )}
              </div>

              {/* Timeline horizontal: Enviado → Revisión → Aprobado/Rechazado */}
              <div className="flex items-center gap-2">
                {/* Step 1: Enviado */}
                <Step
                  icon={<Eye size={11} />}
                  label="Enviado"
                  done={sentDone}
                  active={!reviewActive && !finalDone ? false : sentDone && !finalDone}
                />
                <Connector active={reviewActive || finalDone} />

                {/* Step 2: Revisión */}
                <Step
                  icon={<Clock size={11} />}
                  label="En revisión"
                  done={finalDone}
                  active={reviewActive}
                  pulse={reviewActive}
                />
                <Connector active={finalDone} />

                {/* Step 3: Final */}
                <Step
                  icon={finalRejected ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                  label={finalRejected ? 'Rechazado' : 'Aprobado'}
                  done={finalDone}
                  active={finalDone}
                  variant={finalDone ? (finalRejected ? 'rose' : 'emerald') : 'idle'}
                />
              </div>

              {p.status === 'rejected' && p.reviewNote && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/20 flex items-start gap-2">
                  <AlertCircle size={11} className="text-rose-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-rose-300 font-bold leading-relaxed">
                    {p.reviewNote}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20">
          <p className="text-[10px] font-bold text-rose-400">{error}</p>
        </div>
      )}
    </div>
  );
}

interface StepProps {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  active: boolean;
  pulse?: boolean;
  variant?: 'idle' | 'emerald' | 'rose' | 'indigo' | 'amber';
}

function Step({ icon, label, done, active, pulse, variant }: StepProps) {
  let color = variant;
  if (!color) {
    if (done) color = 'indigo';
    else if (active) color = 'amber';
    else color = 'idle';
  }
  const colorMap = {
    idle:    { bg: 'bg-white/[0.04]',         text: 'text-white/30',    ring: '' },
    indigo:  { bg: 'bg-indigo-500/15',        text: 'text-indigo-300',  ring: 'ring-1 ring-indigo-500/30' },
    amber:   { bg: 'bg-amber-500/15',         text: 'text-amber-300',   ring: 'ring-1 ring-amber-500/30' },
    emerald: { bg: 'bg-emerald-500/15',       text: 'text-emerald-300', ring: 'ring-1 ring-emerald-500/30' },
    rose:    { bg: 'bg-rose-500/15',          text: 'text-rose-300',    ring: 'ring-1 ring-rose-500/30' },
  } as const;
  const c = colorMap[color];

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className={`w-7 h-7 rounded-full ${c.bg} ${c.text} ${c.ring} flex items-center justify-center ${pulse ? 'animate-pulse' : ''}`}>
        {icon}
      </div>
      <p className={`text-[8px] font-black uppercase tracking-wide ${c.text}`}>{label}</p>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className={`flex-1 h-0.5 ${active ? 'bg-indigo-500/40' : 'bg-white/[0.08]'} rounded-full mt-3`} />
  );
}
