import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, doc,
  runTransaction, updateDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  Truck, Clock, CheckCircle2, XCircle, AlertTriangle, Package,
  ChevronDown, ChevronUp, Filter, X, Download, Search,
} from 'lucide-react';

type NDEEstado = 'pendiente_despacho' | 'despachado' | 'parcial' | 'rechazado';

interface NDE {
  id: string;
  nroControl?: string;
  concept: string;
  entityId: string;
  vendedorNombre?: string;
  vendedorId?: string;
  accountType: string;
  amount: number;
  amountInUSD: number;
  date: string;
  createdAt: string;
  estadoNDE: NDEEstado;
  almacenId?: string;
  bultos?: number;
  paymentCondition?: string;
  items?: { id: string; nombre: string; qty: number; price: number; subtotal: number }[];
  despachoPor?: string;
  despachoAt?: string;
  despachoNotas?: string;
  despachoItems?: { id: string; nombre: string; qtyPedida: number; qtyDespachada: number }[];
  comisionVendedor?: number;
  comisionAlmacenista?: number;
}

const ESTADO_CONFIG: Record<NDEEstado, { label: string; color: string; bg: string; border: string }> = {
  pendiente_despacho: { label: 'Pendiente',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  despachado:         { label: 'Despachado', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  parcial:            { label: 'Parcial',    color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  rechazado:          { label: 'Rechazado',  color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
};

interface DespachoModalProps {
  nde: NDE;
  businessId: string;
  currentUser: { uid: string; name: string };
  commissions?: { enabled: boolean; perBulto: number; target: string; splitAlmacenista?: number };
  rejectionReasons?: string[];
  requireRejectionReason?: boolean;
  onDone: () => void;
  onClose: () => void;
}

// ── MODAL DESPACHO COMPLETO ────────────────────────────────────────────────────
const DespachoCompletoModal: React.FC<DespachoModalProps> = ({ nde, businessId, currentUser, commissions, onDone, onClose }) => {
  const [loading, setLoading] = useState(false);

  const calcComisionAlmacenista = (bultos: number): number => {
    if (!commissions?.enabled || !bultos) return 0;
    if (commissions.target === 'vendedor') return 0;
    const base = bultos * commissions.perBulto;
    return commissions.target === 'both' ? base * ((commissions.splitAlmacenista ?? 50) / 100) : base;
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const iso = new Date().toISOString();
      const comAlm = calcComisionAlmacenista(nde.bultos ?? 0);
      await updateDoc(doc(db, 'movements', nde.id), {
        estadoNDE: 'despachado',
        despachoPor: currentUser.uid,
        despachoAt: iso,
        ...(comAlm > 0 && { comisionAlmacenista: comAlm }),
      });
      onDone();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Confirmar Despacho</h3>
            <p className="text-[10px] font-bold text-slate-400">{nde.nroControl || nde.id}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
          Confirmar despacho completo de <strong className="text-slate-900 dark:text-white">{nde.concept?.replace('Venta POS Mayor — ', '')}</strong>
        </p>
        {nde.bultos ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4">
            <p className="text-xs font-black text-emerald-400">{nde.bultos} bultos entregados</p>
          </div>
        ) : null}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">Cancelar</button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50">
            {loading ? 'Procesando...' : '✓ Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MODAL DESPACHO PARCIAL ─────────────────────────────────────────────────────
const DespachoParialModal: React.FC<DespachoModalProps> = ({ nde, businessId, currentUser, commissions, onDone, onClose }) => {
  const items = nde.items || [];
  const [parcialQtys, setParcialQtys] = useState<Record<string, number>>(
    Object.fromEntries(items.map(i => [i.id, i.qty]))
  );
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const calcComisionAlmacenista = (bultos: number): number => {
    if (!commissions?.enabled || !bultos) return 0;
    if (commissions.target === 'vendedor') return 0;
    const base = bultos * commissions.perBulto;
    return commissions.target === 'both' ? base * ((commissions.splitAlmacenista ?? 50) / 100) : base;
  };

  const handleConfirm = async () => {
    const allZero = items.every(i => (parcialQtys[i.id] ?? i.qty) === 0);
    if (allZero) { setError('No puedes despachar 0 unidades en todos los productos'); return; }
    setLoading(true);
    try {
      const iso = new Date().toISOString();
      const despachoItems = items.map(i => ({
        id: i.id,
        nombre: i.nombre,
        qtyPedida: i.qty,
        qtyDespachada: parcialQtys[i.id] ?? i.qty,
      }));
      // Restore stock for un-dispatched qty
      const itemsToRestore = despachoItems.filter(di => di.qtyDespachada < di.qtyPedida);
      for (const di of itemsToRestore) {
        const diff = di.qtyPedida - di.qtyDespachada;
        await runTransaction(db, async txn => {
          const ref = doc(db, `businesses/${businessId}/products`, di.id);
          const snap = await txn.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const almacenKey = nde.almacenId || 'principal';
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          if (stockByAlmacen[almacenKey] !== undefined) {
            txn.update(ref, {
              [`stockByAlmacen.${almacenKey}`]: (Number(stockByAlmacen[almacenKey]) + diff),
              stock: Math.max(0, Number(data.stock ?? 0) + diff),
            });
          } else {
            txn.update(ref, { stock: Math.max(0, Number(data.stock ?? 0) + diff) });
          }
        });
      }
      // Calculate real bultos ratio
      const bultosReales = Math.round((nde.bultos ?? 0) * (despachoItems.reduce((s, di) => s + di.qtyDespachada, 0) / Math.max(1, despachoItems.reduce((s, di) => s + di.qtyPedida, 0))));
      const comAlm = calcComisionAlmacenista(bultosReales);
      await updateDoc(doc(db, 'movements', nde.id), {
        estadoNDE: 'parcial',
        despachoPor: currentUser.uid,
        despachoAt: iso,
        despachoNotas: notas || null,
        despachoItems,
        ...(comAlm > 0 && { comisionAlmacenista: comAlm }),
      });
      onDone();
    } catch (err) {
      console.error(err);
      setError('Error al procesar despacho parcial');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <AlertTriangle size={16} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Despacho Parcial</h3>
              <p className="text-[10px] font-bold text-slate-400">{nde.nroControl || nde.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Indica cuántas unidades se despacharon realmente. El stock restante se restaurará.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
                <th className="text-left py-2">Producto</th>
                <th className="text-center py-2">Pedido</th>
                <th className="text-center py-2">Despachado</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t border-slate-50 dark:border-white/[0.05]">
                  <td className="py-2.5 font-bold text-slate-700 dark:text-slate-300">{item.nombre}</td>
                  <td className="py-2.5 text-center font-black text-slate-500">{item.qty}</td>
                  <td className="py-2.5 text-center">
                    <input
                      type="number" min="0" max={item.qty} step="1"
                      value={parcialQtys[item.id] ?? item.qty}
                      onChange={e => setParcialQtys(prev => ({ ...prev, [item.id]: Math.min(item.qty, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-16 text-center bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-2 py-1 font-black text-indigo-300 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2 block">Notas / Razón</label>
            <textarea
              value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Ej: Faltante en bodega, avería en transporte..."
              rows={2}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
        </div>
        <div className="flex gap-3 p-4 border-t border-slate-100 dark:border-white/[0.07]">
          <button onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest">Cancelar</button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50">
            {loading ? 'Procesando...' : '⚠ Despacho Parcial'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MODAL RECHAZO ──────────────────────────────────────────────────────────────
const RechazarModal: React.FC<DespachoModalProps> = ({ nde, businessId, currentUser, rejectionReasons = [], requireRejectionReason, onDone, onClose }) => {
  const [motivo, setMotivo] = useState('');
  const [customMotivo, setCustomMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const finalMotivo = motivo === '__custom__' ? customMotivo : motivo;

  const handleConfirm = async () => {
    if (requireRejectionReason && !finalMotivo.trim()) {
      setError('Debes indicar un motivo de rechazo'); return;
    }
    setLoading(true);
    try {
      // Restore ALL stock
      const items = nde.items || [];
      for (const item of items) {
        await runTransaction(db, async txn => {
          const ref = doc(db, `businesses/${businessId}/products`, item.id);
          const snap = await txn.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const almacenKey = nde.almacenId || 'principal';
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          if (stockByAlmacen[almacenKey] !== undefined) {
            txn.update(ref, {
              [`stockByAlmacen.${almacenKey}`]: (Number(stockByAlmacen[almacenKey]) + item.qty),
              stock: Math.max(0, Number(data.stock ?? 0) + item.qty),
            });
          } else {
            txn.update(ref, { stock: Math.max(0, Number(data.stock ?? 0) + item.qty) });
          }
        });
      }
      const iso = new Date().toISOString();
      await updateDoc(doc(db, 'movements', nde.id), {
        estadoNDE: 'rechazado',
        despachoPor: currentUser.uid,
        despachoAt: iso,
        despachoNotas: finalMotivo || null,
        comisionVendedor: 0,
      });
      onDone();
    } catch (err) {
      console.error(err);
      setError('Error al procesar el rechazo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <XCircle size={18} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Rechazar Despacho</h3>
            <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Stock se restaurará</p>
          </div>
        </div>
        <div className="space-y-3 mb-4">
          {rejectionReasons.length > 0 && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2 block">Motivo</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500">
                <option value="">Seleccionar motivo...</option>
                {rejectionReasons.map((r, i) => <option key={i} value={r}>{r}</option>)}
                <option value="__custom__">Otro (especificar)</option>
              </select>
            </div>
          )}
          {(motivo === '__custom__' || rejectionReasons.length === 0) && (
            <textarea
              value={customMotivo} onChange={e => setCustomMotivo(e.target.value)}
              placeholder="Describe el motivo del rechazo..."
              rows={3}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          )}
          {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest">Cancelar</button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-600 transition-all disabled:opacity-50">
            {loading ? 'Procesando...' : '✕ Rechazar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── NDE CARD ───────────────────────────────────────────────────────────────────
const NDECard: React.FC<{
  nde: NDE;
  businessId: string;
  currentUser: { uid: string; name: string };
  commissions?: any;
  ndeConfig?: any;
  onRefresh: () => void;
}> = ({ nde, businessId, currentUser, commissions, ndeConfig, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<'completo' | 'parcial' | 'rechazar' | null>(null);

  const estado = ESTADO_CONFIG[nde.estadoNDE] || ESTADO_CONFIG.pendiente_despacho;
  const isPending = nde.estadoNDE === 'pendiente_despacho';
  const clientName = nde.concept?.replace('Venta POS Mayor — ', '') || 'Cliente';
  const dateFormatted = nde.date ? nde.date.split('-').reverse().join('/') : '-';
  const createdTime = nde.createdAt ? new Date(nde.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <>
      <div className={`bg-white dark:bg-[#0d1424] rounded-2xl border shadow-sm overflow-hidden transition-all ${isPending ? 'border-amber-500/20 dark:border-amber-500/15' : 'border-slate-100 dark:border-white/[0.07]'}`}>
        {/* Card header */}
        <div className="p-4 flex items-start gap-3">
          <div className={`h-10 w-10 rounded-xl ${estado.bg} border ${estado.border} flex items-center justify-center shrink-0`}>
            <Truck size={16} className={estado.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">{clientName}</p>
              <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${estado.bg} ${estado.color} border ${estado.border}`}>
                {estado.label}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400">{nde.nroControl || nde.id}</span>
              <span className="text-[9px] text-slate-300 dark:text-white/20">·</span>
              <span className="text-[10px] font-bold text-slate-400">{dateFormatted} {createdTime}</span>
              {nde.vendedorNombre && <>
                <span className="text-[9px] text-slate-300 dark:text-white/20">·</span>
                <span className="text-[10px] font-bold text-slate-400">Vend: {nde.vendedorNombre}</span>
              </>}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {nde.bultos != null && (
                <div className="flex items-center gap-1 text-[10px] font-black text-amber-400">
                  <Package size={10} /> {nde.bultos} bulto{nde.bultos !== 1 ? 's' : ''}
                </div>
              )}
              <div className="text-sm font-black text-slate-900 dark:text-white">
                ${(nde.amountInUSD ?? nde.amount ?? 0).toFixed(2)}
              </div>
              <div className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${nde.accountType === 'BCV' ? 'bg-sky-500/10 text-sky-400' : 'bg-violet-500/10 text-violet-400'}`}>
                {nde.accountType}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded items */}
        <div className={`overflow-hidden transition-all ${expanded ? 'max-h-96' : 'max-h-0'}`}>
          <div className="px-4 pb-3 border-t border-slate-50 dark:border-white/[0.05]">
            <div className="mt-3 space-y-1">
              {(nde.items || []).map((item, i) => {
                const despachoItem = nde.despachoItems?.find(di => di.id === item.id);
                return (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-600 dark:text-slate-400 flex-1 truncate">{item.nombre}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-black text-slate-500 dark:text-white/40">x{item.qty}</span>
                      {despachoItem && despachoItem.qtyDespachada !== item.qty && (
                        <span className="text-[9px] font-black text-indigo-400">→ {despachoItem.qtyDespachada}</span>
                      )}
                      <span className="font-black text-slate-900 dark:text-white">${(item.subtotal ?? item.qty * item.price).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {nde.despachoNotas && (
              <div className="mt-2 p-2 bg-slate-50 dark:bg-white/[0.04] rounded-lg">
                <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest mb-0.5">Notas</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{nde.despachoNotas}</p>
              </div>
            )}
            {nde.despachoPor && (
              <p className="text-[9px] text-slate-400 dark:text-white/20 mt-2">
                Despachado por: {nde.despachoPor} · {nde.despachoAt ? new Date(nde.despachoAt).toLocaleString('es-VE') : ''}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-3 flex items-center justify-between gap-2">
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white/60 transition-all">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {(nde.items || []).length} producto{(nde.items || []).length !== 1 ? 's' : ''}
          </button>
          {isPending && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setModal('completo')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                <CheckCircle2 size={11} /> Completo
              </button>
              <button onClick={() => setModal('parcial')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                <AlertTriangle size={11} /> Parcial
              </button>
              <button onClick={() => setModal('rechazar')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                <XCircle size={11} /> Rechazar
              </button>
            </div>
          )}
        </div>
      </div>

      {modal === 'completo' && (
        <DespachoCompletoModal nde={nde} businessId={businessId} currentUser={currentUser} commissions={commissions}
          rejectionReasons={[]} onDone={() => { setModal(null); onRefresh(); }} onClose={() => setModal(null)} />
      )}
      {modal === 'parcial' && (
        <DespachoParialModal nde={nde} businessId={businessId} currentUser={currentUser} commissions={commissions}
          rejectionReasons={[]} onDone={() => { setModal(null); onRefresh(); }} onClose={() => setModal(null)} />
      )}
      {modal === 'rechazar' && (
        <RechazarModal nde={nde} businessId={businessId} currentUser={currentUser}
          rejectionReasons={ndeConfig?.rejectionReasons || []}
          requireRejectionReason={ndeConfig?.requireRejectionReason}
          onDone={() => { setModal(null); onRefresh(); }} onClose={() => setModal(null)} />
      )}
    </>
  );
};

// ── MAIN PANEL ─────────────────────────────────────────────────────────────────
interface DespachoProps {
  businessId: string;
}

const DespachoPanel: React.FC<DespachoProps> = ({ businessId }) => {
  const { userProfile } = useAuth();
  const [ndes, setNdes] = useState<NDE[]>([]);
  const [tab, setTab] = useState<'cola' | 'historial'>('cola');
  const [filterEstado, setFilterEstado] = useState<NDEEstado | 'todos'>('todos');
  const [search, setSearch] = useState('');
  const [ndeConfig, setNdeConfig] = useState<any>({});
  const [commissions, setCommissions] = useState<any>({});

  const currentUser = { uid: userProfile?.uid || '', name: userProfile?.fullName || 'Usuario' };

  // Load businessConfigs
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(doc(db, 'businessConfigs', businessId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.ndeConfig) setNdeConfig(d.ndeConfig);
      if (d.commissions) setCommissions(d.commissions);
    }, () => {});
    return () => unsub();
  }, [businessId]);

  // Load NDEs in real-time
  useEffect(() => {
    if (!businessId) return;
    const q = query(
      collection(db, 'movements'),
      where('businessId', '==', businessId),
      where('esNotaEntrega', '==', true),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setNdes(snap.docs.map(d => ({ id: d.id, ...d.data() } as NDE)));
    }, () => {});
    return () => unsub();
  }, [businessId]);

  const pendientes = useMemo(() => ndes.filter(n => n.estadoNDE === 'pendiente_despacho'), [ndes]);

  const historialFiltered = useMemo(() => {
    let list = ndes;
    if (filterEstado !== 'todos') list = list.filter(n => n.estadoNDE === filterEstado);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        (n.concept || '').toLowerCase().includes(q) ||
        (n.nroControl || '').toLowerCase().includes(q) ||
        (n.vendedorNombre || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [ndes, filterEstado, search]);

  const canDispatch = userProfile?.role === 'owner' || userProfile?.role === 'admin' || userProfile?.role === 'almacenista' || userProfile?.role === 'inventario';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Panel de Despacho</h1>
            <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
              {pendientes.length} NDE{pendientes.length !== 1 ? 's' : ''} pendiente{pendientes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl border border-slate-200 dark:border-white/[0.08] mb-6 w-fit">
        {(['cola', 'historial'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${tab === t ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white/70'}`}>
            {t === 'cola' ? <><Truck size={12} />Cola activa {pendientes.length > 0 && `(${pendientes.length})`}</> : <><Clock size={12} />Historial</>}
          </button>
        ))}
      </div>

      {/* Cola activa */}
      {tab === 'cola' && (
        <div className="space-y-4">
          {pendientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-3xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center mb-4">
                <CheckCircle2 size={28} className="text-slate-300 dark:text-white/20" />
              </div>
              <h3 className="text-base font-black text-slate-300 dark:text-white/20 uppercase tracking-widest mb-1">Cola vacía</h3>
              <p className="text-xs text-slate-300 dark:text-white/15 font-medium">No hay NDEs pendientes de despacho</p>
            </div>
          ) : pendientes.map(nde => (
            <NDECard
              key={nde.id}
              nde={nde}
              businessId={businessId}
              currentUser={currentUser}
              commissions={commissions}
              ndeConfig={ndeConfig}
              onRefresh={() => {}}
            />
          ))}
        </div>
      )}

      {/* Historial */}
      {tab === 'historial' && (
        <div>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente, NDE..."
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl border border-slate-200 dark:border-white/[0.08]">
              {(['todos', 'pendiente_despacho', 'despachado', 'parcial', 'rechazado'] as const).map(f => {
                const label = f === 'todos' ? 'Todos' : ESTADO_CONFIG[f as NDEEstado]?.label || f;
                return (
                  <button key={f} onClick={() => setFilterEstado(f as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filterEstado === f ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white/60'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            {historialFiltered.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-12 font-bold">Sin resultados</p>
            ) : historialFiltered.map(nde => (
              <NDECard
                key={nde.id}
                nde={nde}
                businessId={businessId}
                currentUser={currentUser}
                commissions={commissions}
                ndeConfig={ndeConfig}
                onRefresh={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DespachoPanel;
