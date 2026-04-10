import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CheckCircle2, XCircle, Clock, ShieldCheck, Building2 } from 'lucide-react';

interface VerifyState {
  status: 'loading' | 'found' | 'notfound';
  payment?: any;
  business?: { name: string; logoUrl?: string };
  bankName?: string;
}

export default function PortalPaymentVerify() {
  const { slug, paymentId } = useParams<{ slug: string; paymentId: string }>();
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug || !paymentId) {
        setState({ status: 'notfound' });
        return;
      }
      try {
        // Resolve businessId from slug (tenants collection or direct id)
        let bid = slug;
        let bName = '';
        let bLogo = '';
        try {
          const tenantSnap = await getDocs(
            query(collection(db, 'tenants'), where('__name__', '==', slug))
          );
          if (!tenantSnap.empty) {
            const tenantData = tenantSnap.docs[0].data() as any;
            bid = tenantData.businessId || slug;
            bName = tenantData.businessName || '';
            bLogo = tenantData.logoUrl || '';
          }
        } catch {}

        try {
          const bizSnap = await getDoc(doc(db, 'businesses', bid));
          if (bizSnap.exists()) {
            const d = bizSnap.data() as any;
            if (!bName && d.name) bName = d.name;
            if (!bLogo && d.logoUrl) bLogo = d.logoUrl;
          }
        } catch {}

        // Read payment
        const paySnap = await getDoc(doc(db, `businesses/${bid}/portalPayments`, paymentId));
        if (!paySnap.exists()) {
          if (!cancelled) setState({ status: 'notfound' });
          return;
        }
        const payment = { id: paySnap.id, ...(paySnap.data() as any) };

        // Bank name (optional)
        let bankName: string | undefined;
        if (payment.bankAccountId) {
          try {
            const accSnap = await getDoc(
              doc(db, `businesses/${bid}/bankAccounts`, payment.bankAccountId)
            );
            if (accSnap.exists()) {
              bankName = (accSnap.data() as any).bankName;
            }
          } catch {}
        }

        if (!cancelled) {
          setState({
            status: 'found',
            payment,
            business: { name: bName || 'Negocio', logoUrl: bLogo },
            bankName,
          });
        }
      } catch (err) {
        console.error('[PortalPaymentVerify] error:', err);
        if (!cancelled) setState({ status: 'notfound' });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, paymentId]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950">
        <div className="w-8 h-8 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === 'notfound' || !state.payment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 px-4">
        <div className="max-w-sm w-full bg-[#0d1424] border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-black text-white mb-2">Pago no encontrado</h1>
          <p className="text-white/40 text-sm">
            Este enlace no corresponde a ningún pago registrado.
          </p>
        </div>
      </div>
    );
  }

  const p = state.payment;
  const isApproved = p.status === 'approved';
  const isRejected = p.status === 'rejected';
  const isCancelled = p.status === 'cancelled';

  const badge = isApproved
    ? { label: 'APROBADO', color: 'emerald', icon: CheckCircle2 }
    : isRejected
    ? { label: 'RECHAZADO', color: 'rose', icon: XCircle }
    : isCancelled
    ? { label: 'CANCELADO', color: 'slate', icon: XCircle }
    : { label: 'PENDIENTE', color: 'amber', icon: Clock };

  const colorClasses = {
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose:    'bg-rose-500/15 text-rose-300 border-rose-500/30',
    slate:   'bg-slate-500/15 text-slate-300 border-slate-500/30',
    amber:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  } as const;

  const Icon = badge.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 px-4 py-12">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <ShieldCheck size={12} className="text-indigo-300" />
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">
              Verificación de Pago
            </span>
          </div>
          {state.business?.logoUrl ? (
            <img
              src={state.business.logoUrl}
              alt={state.business.name}
              className="w-16 h-16 mx-auto rounded-2xl object-cover mb-3"
            />
          ) : (
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
              <Building2 className="w-7 h-7 text-white/30" />
            </div>
          )}
          <h1 className="text-lg font-black text-white">{state.business?.name}</h1>
        </div>

        {/* Card principal */}
        <div className="bg-[#0d1424] border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Status badge */}
          <div className="flex justify-center mb-6">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${colorClasses[badge.color]}`}>
              <Icon size={16} />
              <span className="text-xs font-black uppercase tracking-widest">{badge.label}</span>
            </div>
          </div>

          {/* Monto */}
          <div className="text-center mb-6">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Monto</p>
            <p className="text-5xl font-black text-white">${Number(p.amount).toFixed(2)}</p>
          </div>

          {/* Detalles */}
          <div className="space-y-3 border-t border-white/[0.07] pt-5">
            <Row label="Método" value={p.metodoPago || '—'} />
            {state.bankName && <Row label="Banco" value={state.bankName} />}
            <Row label="Fecha de pago" value={formatDate(p.paymentDate)} />
            {isApproved && <Row label="Aprobado el" value={formatDate(p.reviewedAt)} />}
            {isRejected && <Row label="Rechazado el" value={formatDate(p.reviewedAt)} />}
          </div>

          {/* Footer info */}
          <div className="mt-6 pt-5 border-t border-white/[0.07] text-center">
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-wide">
              ID: {p.id.slice(0, 16)}…
            </p>
          </div>
        </div>

        {/* Powered */}
        <p className="text-center text-[9px] font-bold text-white/20 uppercase tracking-widest mt-6">
          Verificado por Dualis ERP
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-black uppercase tracking-wide text-white/40">{label}</span>
      <span className="text-xs font-bold text-white text-right">{value}</span>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return iso;
  }
}
