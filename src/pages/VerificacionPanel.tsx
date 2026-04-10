/**
 * Fase D.0.1 — Panel de verificación de llegada al banco.
 *
 * Cola unificada de todos los Movements verificables (ABONO/FACTURA con
 * metodoPago bancario) filtrados por status. Permite al admin marcar
 * fila por fila si el dinero entró realmente al banco.
 *
 * IMPORTANTE: la verificación es puramente informativa. NO afecta saldos,
 * NO recalcula reportes, NO bloquea nada. Es un control paralelo para que
 * el admin concilie contra el estado de cuenta bancario.
 */

import React, { useMemo, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, Clock, CheckCircle2, XCircle, Search, Filter } from 'lucide-react';
import { db } from '../firebase/config';
import type { Movement } from '../../types';
import {
  isVerifiable,
  resolveVerificationStatus,
  type VerificationStatus,
} from '../utils/movementHelpers';
import VerificationBadge from '../components/VerificationBadge';
import VerificationActionMenu, { type VerificationUpdatePayload } from '../components/VerificationActionMenu';

interface Props {
  movements: Movement[];
  businessId: string;
  currentUserId: string;
  currentUserName: string;
  /** Fase C.5 — si el usuario no tiene aprobarPagos, ve solo lectura. */
  canVerify?: boolean;
}

type TabKey = 'unverified' | 'verified' | 'not_arrived' | 'all';

const TAB_LABEL: Record<TabKey, string> = {
  unverified: 'Sin verificar',
  verified:   'Verificados',
  not_arrived:'No llegaron',
  all:        'Todos',
};

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const VerificacionPanel: React.FC<Props> = ({ movements, businessId, currentUserId, currentUserName, canVerify = true }) => {
  const [tab, setTab] = useState<TabKey>('unverified');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const verifiableMovements = useMemo(
    () => movements.filter(isVerifiable),
    [movements]
  );

  const counts = useMemo(() => {
    let unv = 0, ver = 0, nna = 0;
    for (const m of verifiableMovements) {
      const s = resolveVerificationStatus(m);
      if (s === 'verified') ver++;
      else if (s === 'not_arrived') nna++;
      else unv++;
    }
    return { unverified: unv, verified: ver, not_arrived: nna, all: verifiableMovements.length };
  }, [verifiableMovements]);

  const filtered = useMemo(() => {
    let result = verifiableMovements;
    if (tab !== 'all') {
      result = result.filter((m) => resolveVerificationStatus(m) === (tab as VerificationStatus));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((m) =>
        (m.concept || '').toLowerCase().includes(q) ||
        (m.reference || '').toLowerCase().includes(q) ||
        (m.referencia || '').toLowerCase().includes(q) ||
        (m.entityId || '').toLowerCase().includes(q) ||
        (m.metodoPago || '').toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const ad = new Date(a.createdAt || a.date || 0).getTime();
      const bd = new Date(b.createdAt || b.date || 0).getTime();
      return bd - ad;
    });
  }, [verifiableMovements, tab, search]);

  const handleUpdate = async (movement: Movement, payload: VerificationUpdatePayload) => {
    setBusyId(movement.id);
    try {
      const ref = doc(db, 'businesses', businessId, 'movements', movement.id);
      const update: Record<string, any> = {
        verificationStatus: payload.status,
      };
      if (payload.status === 'verified') {
        update.verifiedAt = new Date().toISOString();
        update.verifiedByUid = currentUserId;
        update.verifiedByName = currentUserName;
        update.verificationNote = null;
      } else if (payload.status === 'not_arrived') {
        update.verifiedAt = new Date().toISOString();
        update.verifiedByUid = currentUserId;
        update.verifiedByName = currentUserName;
        update.verificationNote = payload.note || null;
      } else {
        update.verifiedAt = null;
        update.verifiedByUid = null;
        update.verifiedByName = null;
        update.verificationNote = null;
      }
      update.verificationUpdatedAt = serverTimestamp();
      await updateDoc(ref, update);
    } catch (err) {
      console.error('[VerificacionPanel] update failed', err);
      alert('No se pudo actualizar el estado de verificación.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="text-indigo-500" size={24} />
            Verificación bancaria
          </h2>
          <p className="text-xs text-slate-500 dark:text-white/40 font-bold mt-1">
            Marca fila por fila si cada cobro/pago apareció realmente en tu estado de cuenta.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['unverified', 'verified', 'not_arrived', 'all'] as TabKey[]).map((t) => {
          const active = tab === t;
          const count = counts[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                active
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
              }`}
            >
              {t === 'unverified' && <Clock size={12} />}
              {t === 'verified' && <CheckCircle2 size={12} />}
              {t === 'not_arrived' && <XCircle size={12} />}
              {t === 'all' && <Filter size={12} />}
              {TAB_LABEL[t]}
              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${active ? 'bg-white/20' : 'bg-slate-200 dark:bg-white/[0.06]'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por concepto, referencia, método…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.07] text-xs font-bold text-slate-700 dark:text-white/70 outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Ref.</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <ShieldCheck className="mx-auto text-slate-300 dark:text-white/10 mb-2" size={32} />
                    <p className="text-sm font-black text-slate-400 dark:text-white/20">
                      No hay movimientos en esta cola
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const type = (m.movementType || '').toString();
                  const amount = Number(m.amountInUSD || m.amount || 0);
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                        {fmtDate(m.createdAt || m.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          type === 'FACTURA'
                            ? 'bg-rose-500/15 text-rose-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}>
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-white/70 font-bold max-w-[260px] truncate">
                        {m.concept || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{m.metodoPago || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono">{m.reference || m.referencia || '—'}</td>
                      <td className="px-4 py-3 text-right font-black font-mono text-slate-900 dark:text-white">
                        ${amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <VerificationBadge movement={m} size="xs" />
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        {canVerify ? (
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                            disabled={busyId === m.id}
                            className="px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500/25 text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            {busyId === m.id ? '…' : 'Cambiar'}
                          </button>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 dark:text-white/25">Solo lectura</span>
                        )}
                        {canVerify && openMenuId === m.id && (
                          <div className="absolute right-4 top-full mt-2 z-20">
                            <VerificationActionMenu
                              movement={m}
                              busy={busyId === m.id}
                              onUpdate={(p) => handleUpdate(m, p)}
                              onClose={() => setOpenMenuId(null)}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VerificacionPanel;
