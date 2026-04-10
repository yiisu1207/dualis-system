import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, doc,
  runTransaction, updateDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  Truck, Clock, CheckCircle2, XCircle, AlertTriangle, Package,
  ChevronDown, ChevronUp, Filter, X, Download, Search, PenTool, Smartphone,
  Printer, Zap, MessageCircle, Camera, MapPin, ScanLine, ListChecks, User as UserIcon,
  CheckSquare, Square,
} from 'lucide-react';
import SignaturePad, { SignaturePadHandle } from '../components/SignaturePad';
import NDEReceiptModal from '../components/NDEReceiptModal';
import { uploadToCloudinary } from '../utils/cloudinary';

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
  items?: { id: string; nombre: string; qty: number; price: number; subtotal: number; sku?: string; barcode?: string; ubicacion?: string }[];
  despachoPor?: string;
  despachoPorNombre?: string;
  despachoAt?: string;
  despachoNotas?: string;
  despachoItems?: { id: string; nombre: string; qtyPedida: number; qtyDespachada: number }[];
  comisionVendedor?: number;
  comisionAlmacenista?: number;
  // ── Fase B+ Despacho mejorado ────────────────────────────────
  conductorNombre?: string;     // nombre del conductor/repartidor
  rutaNombre?: string;          // ruta o zona asignada
  despachoFoto?: string;        // URL Cloudinary — prueba de entrega
  despachoGeo?: { lat: number; lng: number; accuracy?: number };
  despachoBarcodeVerified?: boolean; // true si se escaneó todo antes de marcar despachado
}

/**
 * Captura geolocation con timeout corto. Non-blocking: si el usuario
 * niega el permiso o tarda más de 3s, devuelve null sin romper el flujo.
 */
const tryCaptureGeo = (): Promise<{ lat: number; lng: number; accuracy?: number } | null> => {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 3000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
    );
  });
};

/** Normaliza un teléfono VE a formato wa.me (E.164 sin + ni ceros). */
const normalizePhoneForWA = (raw: string): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Venezuela: 04xxxxxxxxx (11) → 584xxxxxxxxx
  if (digits.length === 11 && digits.startsWith('0')) return '58' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('4')) return '58' + digits;
  if (digits.startsWith('58')) return digits;
  return digits;
};

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
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'choose' | 'sign' | 'portal'>('choose');
  const [receptorName, setReceptorName] = useState('');
  const [receptorCedula, setReceptorCedula] = useState('');
  const sigRef = useRef<SignaturePadHandle>(null);
  // Metadata logística: conductor, ruta, prueba de entrega, geo
  const [conductor, setConductor] = useState(nde.conductorNombre || '');
  const [ruta, setRuta] = useState(nde.rutaNombre || '');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [photoUploading, setPhotoUploading] = useState(false);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setError('');
    try {
      const url = await uploadToCloudinary(file, 'dualis_payments');
      setPhotoUrl(url);
    } catch (err) {
      console.error(err);
      setError('No se pudo subir la foto');
    } finally {
      setPhotoUploading(false);
    }
  };

  const calcComisionAlmacenista = (bultos: number): number => {
    if (!commissions?.enabled || !bultos) return 0;
    if (commissions.target === 'vendedor') return 0;
    const base = bultos * commissions.perBulto;
    return commissions.target === 'both' ? base * ((commissions.splitAlmacenista ?? 50) / 100) : base;
  };

  /**
   * Persist el despacho. signaturePayload puede ser:
   *  - { method: 'in_person', dataUrl, name, cedula }
   *  - { method: 'portal' }  → marca awaitingPortalConfirmation, sin firma
   *  - null → despacho sin captura de firma (legacy)
   */
  const persistDispatch = async (signaturePayload: null | {
    method: 'in_person' | 'portal';
    dataUrl?: string;
    name?: string;
    cedula?: string;
  }) => {
    setError('');
    setLoading(true);
    try {
      const iso = new Date().toISOString();
      const comAlm = calcComisionAlmacenista(nde.bultos ?? 0);
      // Geo captura best-effort — si falla o el usuario no da permiso,
      // seguimos sin romper el flujo (tryCaptureGeo devuelve null).
      const geo = await tryCaptureGeo();
      const update: Record<string, any> = {
        estadoNDE: 'despachado',
        despachoPor: currentUser.uid,
        despachoPorNombre: currentUser.name, // legible en historial
        despachoAt: iso,
        ...(comAlm > 0 && { comisionAlmacenista: comAlm }),
        ...(conductor.trim() && { conductorNombre: conductor.trim() }),
        ...(ruta.trim() && { rutaNombre: ruta.trim() }),
        ...(photoUrl && { despachoFoto: photoUrl }),
        ...(geo && { despachoGeo: geo }),
      };
      if (signaturePayload?.method === 'in_person' && signaturePayload.dataUrl) {
        update.clienteSignature = signaturePayload.dataUrl;
        update.clienteSignedAt = iso;
        update.clienteSignedBy = signaturePayload.name || '';
        update.clienteSignedCedula = signaturePayload.cedula || '';
        update.signatureMethod = 'in_person';
        update.awaitingPortalConfirmation = false;
      } else if (signaturePayload?.method === 'portal') {
        update.signatureMethod = 'portal';
        update.awaitingPortalConfirmation = true;
        update.portalConfirmRequestedAt = iso;
      }
      await updateDoc(doc(db, 'movements', nde.id), update);
      onDone();
    } catch (err) {
      console.error(err);
      setError('Error al guardar el despacho');
    } finally {
      setLoading(false);
    }
  };

  const handleInPersonSign = async () => {
    const dataUrl = sigRef.current?.toDataURL();
    if (!dataUrl) {
      setError('La firma está vacía');
      return;
    }
    if (!receptorName.trim()) {
      setError('Falta el nombre del receptor');
      return;
    }
    await persistDispatch({
      method: 'in_person',
      dataUrl,
      name: receptorName.trim(),
      cedula: receptorCedula.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Confirmar Despacho</h3>
            <p className="text-[10px] font-bold text-slate-400">{nde.nroControl || nde.id}</p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          Despacho completo de <strong className="text-slate-900 dark:text-white">{nde.concept?.replace('Venta POS Mayor — ', '')}</strong>
        </p>
        {nde.bultos ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4">
            <p className="text-xs font-black text-emerald-400">{nde.bultos} bultos entregados</p>
          </div>
        ) : null}

        {/* Paso 1: elegir método de confirmación */}
        {mode === 'choose' && (
          <>
            {/* Metadata logística: conductor + ruta + prueba de entrega.
                Son opcionales pero se persisten en el Movement si el usuario
                los llena. El valor añadido real está en historial / auditoría
                / reportes de comisiones por conductor. */}
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Logística</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="relative">
                <UserIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" value={conductor} onChange={e => setConductor(e.target.value)}
                  placeholder="Conductor"
                  className="w-full pl-7 pr-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div className="relative">
                <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" value={ruta} onChange={e => setRuta(e.target.value)}
                  placeholder="Ruta / zona"
                  className="w-full pl-7 pr-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            {/* Prueba de entrega con foto — mismo preset que vouchers (dualis_payments) */}
            <div className="mb-4">
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer transition-all">
                <Camera size={14} className="text-slate-500 dark:text-white/50" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-white/50 flex-1">
                  {photoUploading ? 'Subiendo...' : photoUrl ? 'Foto lista ✓' : 'Foto de prueba de entrega (opcional)'}
                </span>
                {photoUrl && (
                  <img src={photoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                )}
                <input type="file" accept="image/*" capture="environment"
                  onChange={handlePhotoSelect} disabled={photoUploading}
                  className="hidden" />
              </label>
            </div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              ¿Cómo confirma el cliente la recepción?
            </p>
            <div className="grid grid-cols-1 gap-2 mb-4">
              <button
                type="button"
                onClick={() => { setError(''); setMode('sign'); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-left transition-all"
              >
                <PenTool size={16} className="text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Firma en sitio</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">El receptor firma ahora en este dispositivo</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setError(''); setMode('portal'); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-left transition-all"
              >
                <Smartphone size={16} className="text-violet-400 shrink-0" />
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Confirmar luego desde el portal</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">El cliente confirma desde su portal con su PIN</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => persistDispatch(null)}
                disabled={loading}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04] text-left transition-all disabled:opacity-50"
              >
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Sin captura de firma</p>
                  <p className="text-[10px] text-slate-500 dark:text-white/50">Marcar despachado sin firma (legacy)</p>
                </div>
              </button>
            </div>
            {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
          </>
        )}

        {/* Paso 2a: firma en sitio */}
        {mode === 'sign' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={receptorName}
                onChange={e => setReceptorName(e.target.value)}
                placeholder="Nombre del receptor"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={receptorCedula}
                onChange={e => setReceptorCedula(e.target.value)}
                placeholder="C.I. (opcional)"
                inputMode="numeric"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-xs text-slate-900 dark:text-white"
              />
            </div>
            <SignaturePad ref={sigRef} height={180} placeholder="Firma del receptor" />
            {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setMode('choose'); setError(''); }} disabled={loading} className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                Atrás
              </button>
              <button onClick={() => sigRef.current?.clear()} disabled={loading} className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                Limpiar
              </button>
              <button onClick={handleInPersonSign} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 disabled:opacity-50">
                {loading ? 'Procesando...' : '✓ Firmar y despachar'}
              </button>
            </div>
          </div>
        )}

        {/* Paso 2b: confirmación diferida vía portal */}
        {mode === 'portal' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="text-[11px] text-slate-600 dark:text-white/60 leading-relaxed">
                Se marcará como <strong className="text-violet-400">despachado pendiente de confirmación</strong>.
                El cliente verá un aviso en su portal y podrá confirmar la recepción o reportar una disputa.
              </p>
            </div>
            {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setMode('choose'); setError(''); }} disabled={loading} className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                Atrás
              </button>
              <button onClick={() => persistDispatch({ method: 'portal' })} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-violet-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-violet-600 disabled:opacity-50">
                {loading ? 'Procesando...' : 'Despachar y notificar'}
              </button>
            </div>
          </div>
        )}
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
        despachoPorNombre: currentUser.name,
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
        despachoPorNombre: currentUser.name,
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

// ── PICKING LIST MODAL ─────────────────────────────────────────────────────────
// Imprime una lista de picking agrupada/ordenada por ubicación del almacén.
// Soporta A4 (default) y 80mm térmica (toggle). Usa window.print() con CSS
// @page inyectado dinámicamente — misma técnica que NDEReceiptModal.
const PickingListModal: React.FC<{ nde: NDE; onClose: () => void }> = ({ nde, onClose }) => {
  const [paper, setPaper] = useState<'a4' | '80mm'>('a4');
  const items = nde.items || [];
  // Orden por ubicación (alfabético); items sin ubicación van al final.
  const sorted = [...items].sort((a, b) => {
    const ua = (a.ubicacion || '').toLowerCase();
    const ub = (b.ubicacion || '').toLowerCase();
    if (!ua && ub) return 1;
    if (ua && !ub) return -1;
    return ua.localeCompare(ub);
  });

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { alert('Permite popups para imprimir'); return; }
    const rowsHtml = sorted.map(it => `
      <tr>
        <td style="border-bottom:1px dashed #ccc;padding:6px 4px;font-weight:800">${it.ubicacion || '—'}</td>
        <td style="border-bottom:1px dashed #ccc;padding:6px 4px">${it.nombre}${it.sku ? ` <small>(${it.sku})</small>` : ''}</td>
        <td style="border-bottom:1px dashed #ccc;padding:6px 4px;text-align:center;font-weight:900">x${it.qty}</td>
        <td style="border-bottom:1px dashed #ccc;padding:6px 4px;text-align:center">☐</td>
      </tr>
    `).join('');
    const pageSize = paper === '80mm' ? '80mm auto' : 'A4';
    const bodyStyle = paper === '80mm'
      ? 'font-family:monospace;font-size:11px;width:72mm;margin:0 auto;padding:4mm'
      : 'font-family:system-ui,Arial,sans-serif;font-size:12px;padding:20mm';
    w.document.write(`<!doctype html><html><head><title>Picking ${nde.nroControl || nde.id}</title>
      <style>
        @page { size: ${pageSize}; margin: ${paper === '80mm' ? '0' : '15mm'}; }
        body { ${bodyStyle}; color:#111 }
        h1 { font-size: ${paper === '80mm' ? '13px' : '18px'}; margin: 0 0 8px 0; text-transform:uppercase; letter-spacing:1px }
        table { width:100%; border-collapse:collapse; margin-top:8px }
        th { text-align:left; border-bottom:2px solid #111; padding:4px; font-size:${paper === '80mm' ? '10px' : '11px'}; text-transform:uppercase }
        .meta { display:flex; gap:12px; flex-wrap:wrap; font-size:${paper === '80mm' ? '10px' : '11px'}; margin-bottom:6px }
        .meta b { font-weight:900 }
      </style></head><body>
      <h1>Lista de Picking</h1>
      <div class="meta">
        <span><b>NDE:</b> ${nde.nroControl || nde.id}</span>
        <span><b>Cliente:</b> ${(nde.concept || '').replace('Venta POS Mayor — ', '')}</span>
        <span><b>Fecha:</b> ${nde.date || ''}</span>
        ${nde.bultos ? `<span><b>Bultos:</b> ${nde.bultos}</span>` : ''}
      </div>
      <table>
        <thead><tr>
          <th style="width:22%">Ubicación</th>
          <th>Producto</th>
          <th style="width:12%;text-align:center">Cant</th>
          <th style="width:10%;text-align:center">✓</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top:16px;font-size:10px;color:#666">Armado por: ______________________  Firma: ______________________</p>
      <script>window.onload=function(){setTimeout(function(){window.print();},100);}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <ListChecks size={18} className="text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Lista de Picking</h3>
              <p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">Ordenada por ubicación</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 max-h-[50vh] overflow-y-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl border border-slate-200 dark:border-white/[0.08] mb-4 w-fit">
            {(['a4', '80mm'] as const).map(p => (
              <button key={p} onClick={() => setPaper(p)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${paper === p ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400'}`}>
                {p === 'a4' ? 'A4' : '80mm Térmica'}
              </button>
            ))}
          </div>
          <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-white/[0.04] px-3 py-2 grid grid-cols-[80px_1fr_48px] gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40">
              <span>Ubicación</span>
              <span>Producto</span>
              <span className="text-center">Cant</span>
            </div>
            {sorted.map((it, i) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[80px_1fr_48px] gap-2 text-xs border-t border-slate-100 dark:border-white/[0.05]">
                <span className="font-black text-slate-900 dark:text-white">{it.ubicacion || '—'}</span>
                <span className="text-slate-600 dark:text-slate-400 truncate">{it.nombre}</span>
                <span className="text-center font-black text-slate-900 dark:text-white">x{it.qty}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100 dark:border-white/[0.06]">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest">Cerrar</button>
          <button onClick={handlePrint} className="flex-1 py-3 rounded-xl bg-sky-500 text-white text-xs font-black uppercase tracking-widest hover:bg-sky-600 transition-all flex items-center justify-center gap-2">
            <Printer size={12} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
};

// ── BARCODE VERIFY MODAL ───────────────────────────────────────────────────────
// Captura cada código de barras (o SKU) escaneado y lo marca como verificado.
// Cuando TODOS los items están verificados, permite confirmar y setea
// despachoBarcodeVerified:true en el Movement. Input global con auto-focus
// y listener de Enter — compatible con scanners USB (tipo teclado).
const BarcodeVerifyModal: React.FC<{ nde: NDE; onClose: () => void; onVerified: () => void }> = ({ nde, onClose, onVerified }) => {
  const items = nde.items || [];
  // Key por item: cantidad escaneada vs cantidad pedida
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const code = input.trim();
    if (!code) return;
    // Buscar item que matchee por barcode O sku O id
    const item = items.find(i => i.barcode === code || i.sku === code || i.id === code);
    if (!item) {
      setError(`Código no encontrado: ${code}`);
      setInput('');
      return;
    }
    const already = scanned[item.id] || 0;
    if (already >= item.qty) {
      setError(`${item.nombre}: ya escaneado completo (${item.qty})`);
      setInput('');
      return;
    }
    setScanned(s => ({ ...s, [item.id]: already + 1 }));
    setInput('');
    // Beep audible
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 80);
    } catch {}
  };

  const allVerified = items.every(i => (scanned[i.id] || 0) >= i.qty);
  const progress = items.reduce((acc, i) => acc + Math.min(scanned[i.id] || 0, i.qty), 0);
  const total = items.reduce((acc, i) => acc + i.qty, 0);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <ScanLine size={18} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Verificar por escáner</h3>
              <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">
                {progress} / {total} items escaneados
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escanea o escribe código..."
            className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-violet-500 outline-none"
            autoFocus
          />
          {error && <p className="text-xs text-rose-400 font-bold mt-2">{error}</p>}
        </form>
        <div className="px-5 pb-5 max-h-[40vh] overflow-y-auto">
          <div className="space-y-1.5">
            {items.map((it, i) => {
              const count = scanned[it.id] || 0;
              const done = count >= it.qty;
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06]'}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {done ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <Square size={12} className="text-slate-300 dark:text-white/20 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{it.nombre}</p>
                      {(it.barcode || it.sku) && (
                        <p className="text-[9px] font-mono text-slate-400 truncate">{it.barcode || it.sku}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-black shrink-0 ${done ? 'text-emerald-500' : 'text-slate-400'}`}>{count}/{it.qty}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100 dark:border-white/[0.06]">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 text-xs font-black uppercase tracking-widest">Cancelar</button>
          <button onClick={onVerified} disabled={!allVerified}
            className="flex-1 py-3 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <CheckCircle2 size={12} /> {allVerified ? 'Confirmar' : 'Faltan items'}
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
  canDispatch: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showSelect?: boolean;
}> = ({ nde, businessId, currentUser, commissions, ndeConfig, onRefresh, canDispatch, selected, onToggleSelect, showSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<'completo' | 'parcial' | 'rechazar' | 'picking' | 'verify' | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);

  // WhatsApp click-to-chat: busca teléfono del cliente y abre wa.me
  const handleWhatsApp = async () => {
    try {
      const snap = await getDoc(doc(db, 'customers', nde.entityId));
      const data = snap.exists() ? (snap.data() as any) : null;
      const phone = data?.phone || data?.telefono || data?.celular || '';
      const norm = normalizePhoneForWA(phone);
      if (!norm) { alert('Cliente sin teléfono registrado'); return; }
      const msg = encodeURIComponent(`Hola ${data?.fullName || data?.nombre || ''}, tu pedido ${nde.nroControl || ''} por $${(nde.amountInUSD ?? nde.amount ?? 0).toFixed(2)} está listo para despacho. ¡Gracias!`);
      window.open(`https://wa.me/${norm}?text=${msg}`, '_blank');
    } catch (err) {
      console.error(err);
      alert('Error al abrir WhatsApp');
    }
  };

  // Quick dispatch: despachar en 1 clic sin abrir modal, ideal para
  // operaciones de alto volumen donde la firma no aplica. Respeta
  // ndeConfig.requireClientSignature: si está activado, forzamos el
  // modal completo (que pedirá firma). Si no, commit directo.
  const handleQuickDispatch = async () => {
    if (ndeConfig?.requireClientSignature) { setModal('completo'); return; }
    if (!confirm('¿Marcar como despachado sin firma?')) return;
    setQuickLoading(true);
    try {
      const iso = new Date().toISOString();
      const comAlm = (() => {
        if (!commissions?.enabled || !nde.bultos) return 0;
        if (commissions.target === 'vendedor') return 0;
        const base = nde.bultos * commissions.perBulto;
        return commissions.target === 'both' ? base * ((commissions.splitAlmacenista ?? 50) / 100) : base;
      })();
      // Geo best-effort — no bloquea si falla/niega
      const geo = await tryCaptureGeo();
      await updateDoc(doc(db, 'movements', nde.id), {
        estadoNDE: 'despachado',
        despachoPor: currentUser.uid,
        despachoPorNombre: currentUser.name,
        despachoAt: iso,
        ...(comAlm > 0 && { comisionAlmacenista: comAlm }),
        ...(geo && { despachoGeo: geo }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Error al despachar');
    } finally {
      setQuickLoading(false);
    }
  };

  const estado = ESTADO_CONFIG[nde.estadoNDE] || ESTADO_CONFIG.pendiente_despacho;
  const isPending = nde.estadoNDE === 'pendiente_despacho';
  const clientName = nde.concept?.replace('Venta POS Mayor — ', '') || 'Cliente';
  const dateFormatted = nde.date ? nde.date.split('-').reverse().join('/') : '-';
  const createdTime = nde.createdAt ? new Date(nde.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
  // SLA: pendiente >24h → badge rojo visible
  const ageHours = nde.createdAt ? (Date.now() - new Date(nde.createdAt).getTime()) / 3600000 : 0;
  const slaOverdue = isPending && ageHours > 24;

  return (
    <>
      <div className={`bg-white dark:bg-[#0d1424] rounded-2xl border shadow-sm overflow-hidden transition-all ${selected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : slaOverdue ? 'border-rose-500/40 dark:border-rose-500/30' : isPending ? 'border-amber-500/20 dark:border-amber-500/15' : 'border-slate-100 dark:border-white/[0.07]'}`}>
        {/* Card header */}
        <div className="p-4 flex items-start gap-3">
          {showSelect && isPending && canDispatch && (
            <button onClick={onToggleSelect} className="shrink-0 mt-0.5 text-indigo-500 hover:text-indigo-600 transition-all">
              {selected ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-300 dark:text-white/20" />}
            </button>
          )}
          <div className={`h-10 w-10 rounded-xl ${estado.bg} border ${estado.border} flex items-center justify-center shrink-0`}>
            <Truck size={16} className={estado.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">{clientName}</p>
              <div className="flex items-center gap-1 shrink-0">
                {slaOverdue && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-rose-500 text-white shadow-sm shadow-rose-500/40 animate-pulse">
                    SLA +{Math.floor(ageHours)}h
                  </span>
                )}
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${estado.bg} ${estado.color} border ${estado.border}`}>
                  {estado.label}
                </span>
              </div>
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
                Despachado por: {nde.despachoPorNombre || nde.despachoPor} · {nde.despachoAt ? new Date(nde.despachoAt).toLocaleString('es-VE') : ''}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white/60 transition-all">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {(nde.items || []).length} producto{(nde.items || []).length !== 1 ? 's' : ''}
          </button>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Reimprimir — disponible siempre, reusa NDEReceiptModal */}
            <button onClick={() => setReprintOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/[0.1] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
              <Printer size={11} /> Ver / Imprimir
            </button>
            {/* Picking list — lista ordenada por ubicación del almacén */}
            {isPending && (
              <button onClick={() => setModal('picking')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                <ListChecks size={11} /> Picking
              </button>
            )}
            {/* WhatsApp al cliente */}
            <button onClick={handleWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
              <MessageCircle size={11} /> WA
            </button>
            {/* Verificar por código de barras */}
            {isPending && canDispatch && (nde.items || []).some(i => i.barcode || i.sku) && (
              <button onClick={() => setModal('verify')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${nde.despachoBarcodeVerified ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500' : 'bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20'}`}>
                <ScanLine size={11} /> {nde.despachoBarcodeVerified ? 'Verificado ✓' : 'Escanear'}
              </button>
            )}
            {isPending && canDispatch && (
              <>
                {/* Despacho rápido: 1 clic → despachado sin firma
                    (salvo que ndeConfig.requireClientSignature fuerce el modal). */}
                <button onClick={handleQuickDispatch} disabled={quickLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-sm shadow-emerald-500/30">
                  <Zap size={11} /> {quickLoading ? '...' : 'Rápido'}
                </button>
                <button onClick={() => setModal('completo')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                  <CheckCircle2 size={11} /> Con firma
                </button>
                <button onClick={() => setModal('parcial')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                  <AlertTriangle size={11} /> Parcial
                </button>
                <button onClick={() => setModal('rechazar')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">
                  <XCircle size={11} /> Rechazar
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal reimpresión — reusa NDEReceiptModal (tiene botón Imprimir
          interno con window.print + CSS A4/80mm). */}
      {reprintOpen && (
        <NDEReceiptModal
          movement={nde as any}
          businessId={businessId}
          onClose={() => setReprintOpen(false)}
        />
      )}

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
      {modal === 'picking' && (
        <PickingListModal nde={nde} onClose={() => setModal(null)} />
      )}
      {modal === 'verify' && (
        <BarcodeVerifyModal nde={nde} onClose={() => setModal(null)} onVerified={async () => {
          try {
            await updateDoc(doc(db, 'movements', nde.id), { despachoBarcodeVerified: true });
            setModal(null);
            onRefresh();
          } catch (err) { console.error(err); }
        }} />
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

  // Stats del día
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const despachadosHoy = ndes.filter(n =>
      (n.estadoNDE === 'despachado' || n.estadoNDE === 'parcial') &&
      (n.despachoAt || '').slice(0, 10) === todayStr
    );
    const bultosPendientes = pendientes.reduce((acc, n) => acc + (Number(n.bultos) || 0), 0);
    const montoPendiente = pendientes.reduce((acc, n) => acc + (Number(n.amountInUSD) || 0), 0);
    return {
      despachadosHoy: despachadosHoy.length,
      bultosPendientes,
      montoPendiente,
    };
  }, [ndes, pendientes]);

  // Toast feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Batch dispatch: multi-select de NDEs pendientes para despachar en lote
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const clearSelection = useCallback(() => { setSelectedIds(new Set()); setSelectMode(false); }, []);

  // ── Filtro historial por almacenista
  const [filterAlmacenista, setFilterAlmacenista] = useState<string>('');
  const uniqueAlmacenistas = useMemo(() => {
    const map = new Map<string, string>();
    ndes.forEach(n => {
      if (n.despachoPor) map.set(n.despachoPor, n.despachoPorNombre || n.despachoPor);
    });
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [ndes]);

  const historialFiltered = useMemo(() => {
    // Por defecto historial excluye pendientes (ya tienen su propia cola)
    let list = filterEstado === 'todos'
      ? ndes.filter(n => n.estadoNDE !== 'pendiente_despacho')
      : ndes.filter(n => n.estadoNDE === filterEstado);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        (n.concept || '').toLowerCase().includes(q) ||
        (n.nroControl || '').toLowerCase().includes(q) ||
        (n.vendedorNombre || '').toLowerCase().includes(q)
      );
    }
    if (filterAlmacenista) list = list.filter(n => n.despachoPor === filterAlmacenista);
    return list;
  }, [ndes, filterEstado, search, filterAlmacenista]);

  const canDispatch = userProfile?.role === 'owner' || userProfile?.role === 'admin' || userProfile?.role === 'almacenista' || userProfile?.role === 'inventario';

  // Despacho en lote: itera sobre selectedIds y hace updateDoc por cada NDE
  // pendiente. Geo se captura una sola vez al inicio (reusada para todos).
  // Si requireClientSignature está activo, bloquea el batch (no tiene sentido
  // firmar N entregas en masa) y sugiere usar el modal individual.
  const handleBatchDispatch = async () => {
    if (ndeConfig?.requireClientSignature) {
      showToast('error', 'La config exige firma del cliente — despacha uno por uno');
      return;
    }
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Despachar ${selectedIds.size} comprobantes en lote?`)) return;
    setBatchLoading(true);
    try {
      const iso = new Date().toISOString();
      const geo = await tryCaptureGeo();
      const targets = ndes.filter(n => selectedIds.has(n.id) && n.estadoNDE === 'pendiente_despacho');
      let ok = 0;
      for (const nde of targets) {
        const comAlm = (() => {
          if (!commissions?.enabled || !nde.bultos) return 0;
          if (commissions.target === 'vendedor') return 0;
          const base = nde.bultos * commissions.perBulto;
          return commissions.target === 'both' ? base * ((commissions.splitAlmacenista ?? 50) / 100) : base;
        })();
        try {
          await updateDoc(doc(db, 'movements', nde.id), {
            estadoNDE: 'despachado',
            despachoPor: currentUser.uid,
            despachoPorNombre: currentUser.name,
            despachoAt: iso,
            ...(comAlm > 0 && { comisionAlmacenista: comAlm }),
            ...(geo && { despachoGeo: geo }),
          });
          ok++;
        } catch (err) { console.error('batch dispatch error', nde.id, err); }
      }
      showToast('success', `${ok}/${targets.length} despachados en lote`);
      clearSelection();
    } catch (err) {
      console.error(err);
      showToast('error', 'Error en despacho por lote');
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Panel de Despacho</h1>
            <p className="text-[11px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
              {pendientes.length} comprobante{pendientes.length !== 1 ? 's' : ''} pendiente{pendientes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 mb-0.5">Pendientes</p>
          <p className="text-lg font-black text-slate-900 dark:text-white">{pendientes.length}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/40">{stats.bultosPendientes} bultos · ${stats.montoPendiente.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 dark:text-emerald-400 mb-0.5">Hoy</p>
          <p className="text-lg font-black text-slate-900 dark:text-white">{stats.despachadosHoy}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/40">despachados</p>
        </div>
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-0.5">Total</p>
          <p className="text-lg font-black text-slate-900 dark:text-white">{ndes.length}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/40">en sistema</p>
        </div>
      </div>

      {/* Toast feedback */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl shadow-2xl border text-xs font-black uppercase tracking-widest flex items-center gap-2 animate-in slide-in-from-bottom-4 ${
          toast.type === 'success'
            ? 'bg-emerald-500 border-emerald-400 text-white'
            : 'bg-rose-500 border-rose-400 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {toast.msg}
        </div>
      )}

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
          {pendientes.length > 0 && canDispatch && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
              <button onClick={() => { setSelectMode(v => !v); if (selectMode) clearSelection(); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectMode ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60'}`}>
                <CheckSquare size={12} /> {selectMode ? 'Cancelar selección' : 'Seleccionar múltiples'}
              </button>
              {selectMode && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIds(new Set(pendientes.map(p => p.id)))}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.1]">
                    Todos ({pendientes.length})
                  </button>
                  <span className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">{selectedIds.size} sel.</span>
                  <button onClick={handleBatchDispatch} disabled={batchLoading || selectedIds.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/30 transition-all">
                    <Zap size={12} /> {batchLoading ? '...' : `Despachar ${selectedIds.size}`}
                  </button>
                </div>
              )}
            </div>
          )}
          {pendientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-3xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center mb-4">
                <CheckCircle2 size={28} className="text-slate-300 dark:text-white/20" />
              </div>
              <h3 className="text-base font-black text-slate-300 dark:text-white/20 uppercase tracking-widest mb-1">Cola vacía</h3>
              <p className="text-xs text-slate-300 dark:text-white/15 font-medium">No hay comprobantes pendientes de despacho</p>
            </div>
          ) : pendientes.map(nde => (
            <NDECard
              key={nde.id}
              nde={nde}
              businessId={businessId}
              currentUser={currentUser}
              commissions={commissions}
              ndeConfig={ndeConfig}
              canDispatch={canDispatch}
              showSelect={selectMode}
              selected={selectedIds.has(nde.id)}
              onToggleSelect={() => toggleSelect(nde.id)}
              onRefresh={() => showToast('success', `Comprobante ${nde.nroControl || ''} actualizado`)}
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
                placeholder="Buscar cliente, comprobante..."
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
            {uniqueAlmacenistas.length > 0 && (
              <div className="flex items-center gap-2">
                <UserIcon size={13} className="text-slate-400" />
                <select value={filterAlmacenista} onChange={e => setFilterAlmacenista(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-white/60 focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">Todos los almacenistas</option>
                  {uniqueAlmacenistas.map(a => (
                    <option key={a.uid} value={a.uid}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
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
                canDispatch={canDispatch}
                onRefresh={() => showToast('success', `Comprobante ${nde.nroControl || ''} actualizado`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DespachoPanel;
