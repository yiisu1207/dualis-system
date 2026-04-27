import React, { useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantSafe } from '../../context/TenantContext';

// ─── KIOSK CONTEXT (for clean /caja/:token URL) ────────────────────────────────
export { PosKioskContext } from '../../context/PosKioskContext';
import { PosKioskContext } from '../../context/PosKioskContext';
import { useCart, CartProvider, DiscountType, CartItem, effectiveLinePrice, effectiveStockQty } from '../../context/CartContext';
import { useRates } from '../../context/RatesContext';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc,
  increment, getDoc, runTransaction, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { TenantProvider } from '../../context/TenantContext';
import {
  Scan, ShoppingCart, Search, Trash2, Plus, Minus, Receipt,
  Package, CheckCircle2, AlertTriangle, LogOut, X, Banknote,
  Smartphone, Layers, ArrowLeftRight, User, Clock, Camera, History,
  Tag, MessageCircle, Printer, WifiOff, Pause, Play, CreditCard, FileText, Hash,
  Maximize2, Minimize2, Keyboard, Sparkles,
} from 'lucide-react';
import ReceiptModal from '../../components/ReceiptModal';
import { getNextNroControl } from '../../utils/facturaUtils';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import SaleHistoryPanel from '../../components/SaleHistoryPanel';
import HelpTooltip from '../../components/HelpTooltip';
import QuickSaleGrid, { type QuickSaleProduct } from '../../components/pos/QuickSaleGrid';
import NumericKeypad from '../../components/pos/NumericKeypad';
import TurnKpiBar from '../../components/pos/TurnKpiBar';
import { auth } from '../../firebase/config';
import { getEffectiveCreditMode, sumByAccount, getDistinctAccounts } from '../../components/cxc/cxcHelpers';
import { applyAbonoAllocations, computeFifoAllocations, getInvoiceRemaining } from '../../utils/invoiceAllocations';
import { fuzzyFilter } from '../../utils/fuzzySearch';
import { type HotkeyDef, loadHotkeys, hasOnboarded } from '../../utils/posHotkeys';
import HotkeysModal from '../../components/pos/HotkeysModal';
import { runTour } from '../../components/DriverTour';
import { POS_TOUR_STEPS, posTourSeen, markPosTourSeen } from '../../components/tours/posTour';
// Dynamic pricing imports removed — detal uses simple product.price

// ─── TYPES ────────────────────────────────────────────────────────────────────
type ProductVariant = {
  id: string;
  sku: string;
  values: Record<string, string>;
  stock: number;
  precioDetal?: number;
  precioMayor?: number;
  costoUSD?: number;
  barcode?: string;
};

type QuickProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  codigo: string;
  marca?: string;
  tipoTasa?: string;
  costoUSD?: number;
  margenDetal?: number;
  hasVariants?: boolean;
  variantAttributes?: string[];
  variants?: ProductVariant[];
  pricesByTier?: Record<string, { precioDetal?: number; precioMayor?: number }>;
  favorito?: boolean;
};

type PaymentMethod = 'efectivo_usd' | 'efectivo_bs' | 'transferencia' | 'pago_movil' | 'punto' | 'mixto';

type HeldCart = {
  id: string;
  items: CartItem[];
  customer: any;
  consumidorFinal: boolean;
  discountType: DiscountType;
  discountValue: number;
  heldAt: Date;
};

// ── IGTF (Impuesto a las Grandes Transacciones Financieras) ────────────────────
// Ley venezolana: 3 % sobre pagos en divisas o criptomonedas
const IGTF_RATE = 0.03;
const IGTF_METHODS = new Set<PaymentMethod>(['efectivo_usd', 'mixto']);
// Punto de venta y pago móvil no aplican IGTF (operaciones en Bs)

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatLiveDate(d: Date) {
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function formatLiveTime(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo_usd: 'Efectivo USD',
  efectivo_bs: 'Efectivo Bs',
  transferencia: 'Transferencia',
  pago_movil: 'Pago Móvil',
  punto: 'Punto de Venta',
  mixto: 'Mixto (Efectivo + Transf.)',
};
const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  efectivo_usd: <Banknote size={15} />,
  efectivo_bs: <Banknote size={15} />,
  transferencia: <Smartphone size={15} />,
  pago_movil: <Smartphone size={15} />,
  punto: <CreditCard size={15} />,
  mixto: <Layers size={15} />,
};

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
interface PaymentModalProps {
  subtotalUsd: number;
  taxUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalBs: number;
  rateValue: number;
  igtfEnabled: boolean;
  igtfRate: number;
  onConfirm: (method: PaymentMethod, cashGiven: number, reference: string, mixCash: number, mixTransfer: number, igtfAmount: number) => void;
  onClose: () => void;
  loading: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ subtotalUsd, taxUsd, discountUsd, totalUsd, totalBs, rateValue, igtfEnabled, igtfRate, onConfirm, onClose, loading }) => {
  const [method, setMethod] = useState<PaymentMethod>('efectivo_usd');
  const [cashInput, setCashInput] = useState('');
  const [reference, setReference] = useState('');
  const [mixCash, setMixCash] = useState('');
  const [mixTransfer, setMixTransfer] = useState('');

  // ── IGTF ──────────────────────────────────────────────────────────────────
  // En método mixto, IGTF aplica SOLO sobre la porción de efectivo USD,
  // no sobre toda la venta (la transferencia no se grava).
  const igtfApplies  = igtfEnabled && IGTF_METHODS.has(method);
  const igtfBaseUsd  = method === 'mixto' ? Math.min(totalUsd, parseFloat(mixCash || '0')) : totalUsd;
  const igtfAmount   = igtfApplies ? parseFloat((igtfBaseUsd * (igtfRate / 100)).toFixed(2)) : 0;
  const grandUsd     = totalUsd + igtfAmount;
  const grandBs      = totalBs  + igtfAmount * rateValue;

  const cashVal    = parseFloat(cashInput || '0');
  const diffUsd    = method === 'efectivo_usd' ? cashVal - grandUsd : 0;
  const diffBs     = method === 'efectivo_bs'  ? cashVal - grandBs  : 0;
  const changeUsd  = Math.max(0,  diffUsd);
  const missingUsd = Math.max(0, -diffUsd);
  const changeBs   = Math.max(0,  diffBs);
  const missingBs  = Math.max(0, -diffBs);
  const hasChange    = changeUsd > 0.001 || changeBs > 0.001;
  const isPaidExact  =
    (method === 'efectivo_usd' && cashVal > 0 && missingUsd < 0.001 && changeUsd < 0.001) ||
    (method === 'efectivo_bs'  && cashVal > 0 && missingBs  < 0.001 && changeBs  < 0.001);

  const canConfirm = (() => {
    if (method === 'efectivo_usd') return parseFloat(cashInput || '0') >= grandUsd;
    if (method === 'efectivo_bs')  return parseFloat(cashInput || '0') >= totalBs;
    if (method === 'transferencia' || method === 'pago_movil' || method === 'punto') return reference.trim().length > 0;
    if (method === 'mixto') {
      const c = parseFloat(mixCash || '0');
      const t = parseFloat(mixTransfer || '0');
      return c + t >= grandUsd - 0.001;
    }
    return false;
  })();

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(
      method,
      parseFloat(cashInput || '0'),
      reference,
      parseFloat(mixCash || '0'),
      parseFloat(mixTransfer || '0'),
      igtfAmount,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden overflow-y-auto max-h-[95vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total a cobrar</p>
            {(igtfApplies || taxUsd > 0 || discountUsd > 0) ? (
              <div className="mt-2 space-y-1.5">
                {taxUsd > 0 && (
                  <>
                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-400">
                      <span>Base</span>
                      <span>${subtotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] font-black text-sky-300">
                      <span className="px-1.5 py-0.5 bg-sky-400/20 rounded text-[9px] uppercase tracking-widest">
                        IVA {((taxUsd / subtotalUsd) * 100).toFixed(0)}%
                      </span>
                      <span>+${taxUsd.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {discountUsd > 0 && (
                  <div className="flex justify-between items-center text-[11px] font-black text-emerald-300">
                    <span className="px-1.5 py-0.5 bg-emerald-400/20 rounded text-[9px] uppercase tracking-widest">Descuento</span>
                    <span>-${discountUsd.toFixed(2)}</span>
                  </div>
                )}
                {!igtfApplies && (taxUsd > 0 || discountUsd > 0) && (
                  <div className="border-t border-white/10 pt-1">
                    <p className="text-3xl font-black tracking-tight">${totalUsd.toFixed(2)}</p>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                    </p>
                  </div>
                )}
                {igtfApplies && (
                  <>
                    {(taxUsd > 0 || discountUsd > 0) && (
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
                        <span>Sub-total</span>
                        <span>${totalUsd.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-[11px] font-black text-yellow-300">
                      <span className="px-1.5 py-0.5 bg-yellow-400/20 rounded text-[9px] uppercase tracking-widest">IGTF {igtfRate.toFixed(0)}%</span>
                      <span>+${igtfAmount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-2">
                      <p className="text-3xl font-black tracking-tight">${grandUsd.toFixed(2)}</p>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">
                        {grandBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                      </p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="text-4xl font-black tracking-tight mt-1">
                  ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-sm font-bold text-slate-400 mt-0.5">
                  {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-white dark:bg-slate-900/10 flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 dark:bg-slate-900/20 transition-all shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Method selector */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Método de Pago</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map(m => (
                <button key={m} onClick={() => { setMethod(m); setCashInput(''); setReference(''); }}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all text-center ${method === m ? 'border-slate-900 dark:border-indigo-500 bg-slate-900 dark:bg-indigo-600 text-white' : 'border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:border-slate-200 dark:hover:border-white/[0.15]'}`}>
                  {METHOD_ICONS[m]}
                  <span className="leading-tight">{METHOD_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Efectivo USD */}
          {method === 'efectivo_usd' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Monto Entregado (USD)</label>
                <input autoFocus type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder={`Mínimo: $${grandUsd.toFixed(2)}`}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-lg font-black focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all text-slate-900 dark:text-white"
                />
              </div>
              {cashVal > 0 && (
                <div className={`p-4 rounded-xl flex justify-between items-center transition-all ${missingUsd > 0.001 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className={missingUsd > 0.001 ? 'text-rose-400' : 'text-emerald-600'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {changeUsd > 0.001 ? 'Cambio a entregar' : isPaidExact ? 'Pago exacto ✓' : 'Faltan'}
                    </span>
                  </div>
                  <span className={`text-lg font-black ${missingUsd > 0.001 ? 'text-rose-500' : 'text-emerald-700'}`}>
                    {missingUsd > 0.001 ? `$${missingUsd.toFixed(2)}` : changeUsd > 0.001 ? `$${changeUsd.toFixed(2)}` : '—'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Efectivo BS */}
          {method === 'efectivo_bs' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Monto Entregado (BS)</label>
                <input autoFocus type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder={`Mínimo: ${totalBs.toFixed(2)} Bs`}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-lg font-black focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all text-slate-900 dark:text-white"
                />
              </div>
              {cashVal > 0 && (
                <div className={`p-4 rounded-xl flex justify-between items-center transition-all ${missingBs > 0.001 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className={missingBs > 0.001 ? 'text-rose-400' : 'text-emerald-600'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {changeBs > 0.001 ? 'Cambio a entregar' : isPaidExact ? 'Pago exacto ✓' : 'Faltan'}
                    </span>
                  </div>
                  <span className={`text-lg font-black ${missingBs > 0.001 ? 'text-rose-500' : 'text-emerald-700'}`}>
                    {missingBs > 0.001 ? `Bs ${missingBs.toFixed(2)}` : changeBs > 0.001 ? `Bs ${changeBs.toFixed(2)}` : '—'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Transferencia / Pago Móvil / Punto */}
          {(method === 'transferencia' || method === 'pago_movil' || method === 'punto') && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                {method === 'punto' ? 'Últimos 4 dígitos / Lote' : 'Número de Referencia'}
              </label>
              <input autoFocus
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder={method === 'punto' ? 'Ej. 1234' : method === 'pago_movil' ? 'Ej. C2C-0001' : 'Ej. 00123456789'}
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all text-slate-900 dark:text-white"
              />
            </div>
          )}

          {/* Mixto */}
          {method === 'mixto' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Efectivo (USD)</label>
                <input autoFocus type="number" inputMode="decimal" enterKeyHint="next" min="0" step="0.01"
                  value={mixCash}
                  onChange={e => setMixCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Transferencia (USD)</label>
                <input type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01"
                  value={mixTransfer}
                  onChange={e => setMixTransfer(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                />
              </div>
              {(parseFloat(mixCash || '0') + parseFloat(mixTransfer || '0')) > 0 && (
                <div className={`p-3 rounded-xl flex justify-between items-center text-sm font-black ${parseFloat(mixCash || '0') + parseFloat(mixTransfer || '0') >= grandUsd ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-500'}`}>
                  <span>Total ingresado</span>
                  <span>${(parseFloat(mixCash || '0') + parseFloat(mixTransfer || '0')).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Confirm */}
          <button
            disabled={!canConfirm || loading}
            onClick={handleConfirm}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${canConfirm && !loading ? 'bg-slate-900 text-white hover:bg-emerald-600 shadow-xl' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-300 cursor-not-allowed'}`}>
            {loading ? 'Procesando...' : <><Receipt size={16} />Confirmar Venta</>}
          </button>
        </div>
      </div>
    </div>
  );
};

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

// ─── POS CONTENT ──────────────────────────────────────────────────────────────
const PosContent = () => {
  const [searchParams] = useSearchParams();
  const kioskCtx = useContext(PosKioskContext);
  const { tenantId } = useTenantSafe();
  const empresa_id = kioskCtx?.businessId ?? tenantId ?? '';
  const cajaId = kioskCtx?.cajaId ?? searchParams.get('cajaId');
  const urlToken = kioskCtx?.token ?? searchParams.get('token');
  const { userProfile } = useAuth();
  const { rates, customRates, zoherEnabled } = useRates();

  const { items, addProductByCode, addProductByBarcode, setItemSellMode, updateQty, removeItem, setItemNote, totals, rateValue, setRateValue, clearCart, discountType, discountValue, setDiscount, startedAt, loadCart } = useCart();

  // ─── Token validation (kiosk mode) ────────────────────────────────────────
  const [tokenValid, setTokenValid] = useState<boolean | null>(null); // null = loading
  useEffect(() => {
    if (!cajaId || !empresa_id || !urlToken) {
      setTokenValid(false);
      return;
    }
    getDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId)).then(snap => {
      if (!snap.exists()) { setTokenValid(false); return; }
      const data = snap.data();
      // Token must match AND terminal must be open
      setTokenValid(data.sessionToken === urlToken && data.estado === 'abierta');
    }).catch(() => setTokenValid(false));
  }, [cajaId, empresa_id, urlToken]);

  // Offline indicator
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Product grid
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [productFilter, setProductFilter] = useState('');
  // Debounce: el filtro real (que dispara recálculo del array de 800+) se
  // actualiza 200ms después de que el usuario para de tipear. Evita el lag
  // visible al teclear rápido.
  const [productFilterDebounced, setProductFilterDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setProductFilterDebounced(productFilter), 200);
    return () => clearTimeout(t);
  }, [productFilter]);
  const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'noStock' | 'favoritos'>('all');
  const [loading, setLoading] = useState(true);
  // Fase 9.4 — variant picker
  const [variantPickerProduct, setVariantPickerProduct] = useState<QuickProduct | null>(null);

  // Client
  const [clientQuery, setClientQuery] = useState('');
  // Hotkeys configurables por terminal
  const [hotkeys, setHotkeys] = useState<HotkeyDef[]>([]);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [hotkeysOnboarding, setHotkeysOnboarding] = useState(false);

  // Modal para crear cliente nuevo desde el POS sin salir del flujo de venta
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCedula, setNewClientCedula] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [consumidorFinal, setConsumidorFinal] = useState(false);

  // Abono rápido a CxC (monto acumulado — las facturas individuales vendrán después)
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  const [showAbonoForm, setShowAbonoForm] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoMethod, setAbonoMethod] = useState<Exclude<PaymentMethod, 'mixto'>>('efectivo_usd');
  const [abonoReference, setAbonoReference] = useState('');
  const [abonoDate, setAbonoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [abonoNote, setAbonoNote] = useState('');
  const [submittingAbono, setSubmittingAbono] = useState(false);
  const [abonoFeedback, setAbonoFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Venta a CRÉDITO: cobra el carrito actual generando una factura en CxC
  // (movementType=FACTURA, pagado=false) en lugar de venta de contado.
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditDays, setCreditDays] = useState(30);
  const [creditNote, setCreditNote] = useState('');
  const [submittingCredit, setSubmittingCredit] = useState(false);
  const [creditFeedback, setCreditFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Modo de crédito del negocio (override por cliente arriba). Determina si el
  // form de "Abonar" expone selección por factura o solo monto acumulado.
  const [businessCreditMode, setBusinessCreditMode] = useState<'accumulated' | 'invoiceLinked' | null>(null);
  // Facturas abiertas del cliente seleccionado (para modo invoiceLinked).
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  // Allocations manuales que escribe el usuario (invoiceId → monto string).
  const [allocInputs, setAllocInputs] = useState<Record<string, string>>({});

  // Fiscal config (read from localStorage, set by Configuración → Fiscal/POS)
  const [fiscalConfig] = useState(() => ({
    igtfEnabled: localStorage.getItem('fiscal_igtf_enabled') !== 'false',
    igtfRate: parseFloat(localStorage.getItem('fiscal_igtf_rate') || '3'),
    ivaEnabled: localStorage.getItem('fiscal_iva_enabled') !== 'false',
    scannerEnabled: localStorage.getItem('fiscal_scanner_enabled') !== 'false',
  }));

  // Scanner
  const [searchQuery, setSearchQuery] = useState('');
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mobile tab mode
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');

  // Quick Sale Grid
  const [showQuickGrid, setShowQuickGrid] = useState(true);

  // Numeric Keypad (tablets)
  const [showKeypad, setShowKeypad] = useState(false);

  // Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receipt
  const [lastMovement, setLastMovement] = useState<any>(null);

  // History panel
  const [showHistory, setShowHistory] = useState(false);

  // Ventas en espera
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);

  // Modo venta continua
  const [continuousMode, setContinuousMode] = useState(() => localStorage.getItem('posDetal_continuousMode') === 'true');
  const [turnSaleCount, setTurnSaleCount] = useState(0);
  const [turnTotal, setTurnTotal] = useState(0);
  useEffect(() => { localStorage.setItem('posDetal_continuousMode', String(continuousMode)); }, [continuousMode]);

  // Auto-print toggle
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem('posDetal_autoPrint') === 'true');
  useEffect(() => { localStorage.setItem('posDetal_autoPrint', String(autoPrint)); }, [autoPrint]);

  // Terminal info
  const [terminalInfo, setTerminalInfo] = useState<{ nombre: string; cajeroNombre: string } | null>(null);
  const [ticketFooter, setTicketFooter] = useState<string>('');

  // Almacenes
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; activo: boolean }[]>([]);
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string>('principal');

  // Bridge meta from another module
  const [bridgeMeta, setBridgeMeta] = useState<{
    source: string;
    sourceId: string;
    customerId?: string;
    customerName?: string;
    staffId?: string;
    staffName?: string;
    serviceId?: string;
    serviceName?: string;
  } | null>(null);

  // Commissions config (loaded from businessConfigs)
  const [commissionsCfg, setCommissionsCfg] = useState<{
    salesCommissionEnabled?: boolean;
    salesCommissionPct?: number;
    salesCommissionTarget?: 'vendedor' | 'almacenista' | 'both';
  }>({});

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Fullscreen / Kiosk mode listener
  useEffect(() => {
    const onFsChange = () => setIsKiosk(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleKiosk = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // ── Bridge: auto-load a pending sale from another module ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('dualis_pending_pos_sale');
      if (!raw) return;
      const payload = JSON.parse(raw);
      sessionStorage.removeItem('dualis_pending_pos_sale');
      if (Array.isArray(payload?.items) && payload.items.length > 0) {
        const cartItems = payload.items.map((it: any) => ({
          id: it.id || `bridge-${Date.now()}`,
          codigo: it.codigo || it.id || 'SVC',
          nombre: it.nombre || it.name || 'Servicio',
          qty: Number(it.qty || 1),
          priceUsd: Number(it.price || it.priceUsd || 0),
          ivaRate: 0,
          stock: 9999,
        }));
        loadCart(cartItems, 'none' as DiscountType, 0);
        if (payload.source && payload.sourceId) {
          setBridgeMeta({
            source: payload.source,
            sourceId: payload.sourceId,
            customerId: payload.customerId,
            customerName: payload.customerName,
            staffId: payload.staffId,
            staffName: payload.staffName,
            serviceId: payload.serviceId,
            serviceName: payload.items?.[0]?.nombre || payload.items?.[0]?.name,
          });
        }
        const sourceLabel =
          payload.source === 'cotizacion' ? 'Cotización' :
          'módulo';
        setSuccess(`Cargado desde ${sourceLabel}: ${payload.customerName || ''}`);
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch {
      // Ignore malformed payload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync BCV rate
  useEffect(() => {
    if (rates.tasaBCV > 0) setRateValue(rates.tasaBCV);
  }, [rates.tasaBCV, setRateValue]);

  // Load terminal info
  useEffect(() => {
    if (!cajaId || !empresa_id) return;
    getDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId)).then(snap => {
      if (snap.exists()) setTerminalInfo(snap.data() as any);
    });
  }, [cajaId, empresa_id]);

  // Load businessConfigs (ticketFooter + commissions) — one-time read, no real-time needed
  useEffect(() => {
    if (!empresa_id) return;
    getDoc(doc(db, 'businessConfigs', empresa_id)).then(snap => {
      const data = snap.data();
      if (data && typeof data.ticketFooter === 'string') setTicketFooter(data.ticketFooter);
      if (data && data.commissions) setCommissionsCfg(data.commissions);
    }).catch(() => {});
  }, [empresa_id]);

  // Load almacenes
  useEffect(() => {
    if (!empresa_id) return;
    getDocs(query(collection(db, `businesses/${empresa_id}/almacenes`))).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, nombre: d.data().nombre as string, activo: d.data().activo as boolean }))
        .filter(a => a.activo);
      setAlmacenes(list);
      if (list.length > 0 && !list.find(a => a.id === selectedAlmacenId)) {
        setSelectedAlmacenId(list[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa_id]);

  // Productos — listener reactivo. El stock baja en vivo tras cada venta en cualquier caja.
  useEffect(() => {
    if (!empresa_id) return;
    const qp = query(collection(db, `businesses/${empresa_id}/products`));
    const unsub = onSnapshot(qp, snap => {
      setProducts(snap.docs
        .filter(d => d.data().status !== 'pending_review' && !d.data().archived)
        .map(d => {
          const data = d.data();
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          const almacenStock = stockByAlmacen[selectedAlmacenId] ?? Number(data.stock || 0);
          return {
            id: d.id,
            name: data.name || data.nombre || 'Sin nombre',
            price: Number(data.precioDetal || data.marketPrice || data.precioVenta || data.salePrice || data.price || 0),
            stock: almacenStock,
            codigo: data.codigo || d.id,
            marca: data.marca || '',
            tipoTasa: data.tipoTasa || 'BCV',
            costoUSD: Number(data.costoUSD || 0),
            margenDetal: Number(data.margenDetal || 0),
            hasVariants: !!data.hasVariants,
            variantAttributes: data.variantAttributes || [],
            variants: data.variants || [],
            pricesByTier: data.pricesByTier || undefined,
            favorito: !!data.favorito,
          };
        }));
      setLoading(false);
    }, err => {
      console.error('[pos detal] productos listener', err);
      setError('Error cargando datos');
      setLoading(false);
    });
    return () => unsub();
  }, [empresa_id, selectedAlmacenId]);

  // Clientes — listener reactivo (aparecen en vivo al crearse en Deudores/CxC).
  useEffect(() => {
    if (!empresa_id) return;
    const qc = query(collection(db, 'customers'), where('businessId', '==', empresa_id));
    const unsub = onSnapshot(qc, snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('[pos detal] clientes listener', err));
    return () => unsub();
  }, [empresa_id]);

  // Movements del cliente seleccionado — fuente de verdad para balance,
  // facturas abiertas y allocations. Se mantienen aquí para que la lógica
  // del balance, lista de facturas y abonos use el MISMO snapshot que CxC.
  const [customerMovs, setCustomerMovs] = useState<any[]>([]);
  useEffect(() => {
    if (!customer?.id || !empresa_id) {
      setCustomerMovs([]);
      setCustomerBalance(null);
      return;
    }
    const movQ = query(
      collection(db, 'movements'),
      where('businessId', '==', empresa_id),
      where('entityId', '==', customer.id),
    );
    const unsub = onSnapshot(movQ, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setCustomerMovs(arr);
    }, err => {
      console.error('[pos detal] movements listener', err);
      setCustomerMovs([]);
      setCustomerBalance(null);
    });
    return () => unsub();
  }, [customer, empresa_id]);

  // Modo de crédito global del negocio (override por cliente cuando aplica).
  // Se carga una sola vez por empresa. Si no existe doc, queda en null y el
  // efectivo cae a 'accumulated' por default.
  useEffect(() => {
    if (!empresa_id) return;
    getDoc(doc(db, 'businessConfigs', empresa_id)).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as any;
      if (d.creditMode === 'invoiceLinked' || d.creditMode === 'accumulated') {
        setBusinessCreditMode(d.creditMode);
      }
    }).catch(() => {});
  }, [empresa_id]);

  // Modo efectivo: override del cliente > config del negocio > 'accumulated'
  const effectiveCreditMode = useMemo(
    () => getEffectiveCreditMode(customer as any, { creditMode: businessCreditMode ?? undefined }),
    [customer, businessCreditMode]
  );

  // Balance del cliente — usa `sumByAccount` (la misma función que CxC) sumando
  // TODAS las cuentas del cliente. Respeta `effectiveCreditMode` y la tasa de
  // cambio de cada cuenta. Antes el POS hacía un cálculo simplista que no
  // contemplaba conversión de monedas ni allocations.
  useEffect(() => {
    if (!customer?.id) { setCustomerBalance(null); return; }
    if (customerMovs.length === 0) { setCustomerBalance(0); return; }
    try {
      const accounts = getDistinctAccounts(customerMovs as any);
      let total = 0;
      for (const acc of accounts) {
        total += sumByAccount(customerMovs as any, acc as any, rates as any, effectiveCreditMode);
      }
      setCustomerBalance(total);
    } catch (e) {
      console.warn('[pos detal] balance calc failed', e);
      setCustomerBalance(null);
    }
  }, [customerMovs, customer?.id, rates, effectiveCreditMode]);

  // Facturas abiertas del cliente (derivadas del snapshot global de movements).
  useEffect(() => {
    if (!customer?.id) { setOpenInvoices([]); return; }
    const arr = customerMovs
      .filter((m: any) => m.movementType === 'FACTURA' && !m.anulada && !m.pagado && getInvoiceRemaining(m as any) > 0.009)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setOpenInvoices(arr);
  }, [customerMovs, customer?.id]);

  // Al cambiar de cliente, reset del form de abono y allocations
  useEffect(() => {
    setShowAbonoForm(false);
    setAbonoAmount('');
    setAbonoReference('');
    setAbonoNote('');
    setAbonoFeedback(null);
    setAllocInputs({});
    setShowCreditModal(false);
    setCreditFeedback(null);
  }, [customer?.id]);

  const filteredClients = useMemo(() => {
    const term = clientQuery.toLowerCase();
    if (!term) return [];
    return clients.filter(c =>
      (c.fullName || c.nombre || '').toLowerCase().includes(term) ||
      (c.rif || c.cedula || '').toLowerCase().includes(term)
    );
  }, [clientQuery, clients]);

  // Filtrado completo (sin paginar) — base para count y para slice de visibles.
  // Usa el filtro DEBOUNCED + fuzzy match con tolerancia a typos (cocacola →
  // Coca Cola, pepss → Pepsi). El fuzzy ordena por relevancia.
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (stockFilter === 'inStock') filtered = filtered.filter(p => p.stock > 0);
    if (stockFilter === 'noStock') filtered = filtered.filter(p => p.stock === 0);
    if (stockFilter === 'favoritos') filtered = filtered.filter(p => p.favorito);
    const q = (productFilterDebounced || searchQuery).trim();
    if (!q) return filtered;
    return fuzzyFilter(
      filtered,
      q,
      p => `${p.name || ''} ${p.codigo || ''} ${p.marca || ''}`,
      { minScore: 40 },
    );
  }, [products, productFilterDebounced, searchQuery, stockFilter]);

  // Render virtualizado simple: solo mostramos los primeros N productos para
  // evitar montar 800+ <button> al mismo tiempo (causaba lag al teclear y al
  // hacer scroll). El usuario hace click en "Ver más" para cargar más.
  const [visibleCount, setVisibleCount] = useState(60);
  // Reset del contador cuando cambia el filtro/búsqueda
  useEffect(() => { setVisibleCount(60); }, [productFilterDebounced, searchQuery, stockFilter]);
  const displayProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const noStockCount = useMemo(() => products.filter(p => p.stock === 0).length, [products]);

  // Quick Sale Grid products: prioriza FAVORITOS marcados; si hay <8 favoritos
  // con stock, complementa con los demás productos con stock para no quedar
  // vacío al inicio.
  const quickGridProducts = useMemo<QuickSaleProduct[]>(() => {
    const conStock = products.filter(p => p.stock > 0);
    const favs = conStock.filter(p => p.favorito);
    const resto = conStock.filter(p => !p.favorito);
    const ordered = [...favs, ...resto];
    return ordered.map(p => ({
      id: p.id, codigo: p.codigo, name: p.name, price: p.price, stock: p.stock,
    }));
  }, [products]);

  // ── Loyalty tier pricing helper ─────────────────────────────────
  const getDetalTierPrice = useCallback((product: QuickProduct): { price: number; tierLabel: string | null } => {
    const tier = (customer as any)?.loyaltyTier as string | undefined;
    if (tier && product.pricesByTier?.[tier]?.precioDetal) {
      return { price: product.pricesByTier[tier].precioDetal!, tierLabel: tier };
    }
    return { price: product.price, tierLabel: null };
  }, [customer]);

  const handleAddProduct = useCallback(async (product: QuickProduct) => {
    // Fase 9.4: si tiene variantes, abrir picker en vez de agregar directo
    if (product.hasVariants && (product.variants || []).length > 0) {
      setVariantPickerProduct(product);
      return;
    }
    const { price: tierPrice, tierLabel } = getDetalTierPrice(product);
    const priceOverride = tierLabel ? tierPrice : undefined;
    const ok = await addProductByCode(product.codigo, 'detal', priceOverride);
    if (!ok) {
      setError(`Producto no encontrado: ${product.name}`);
      setTimeout(() => setError(''), 3000);
    }
  }, [addProductByCode, getDetalTierPrice]);

  // Quick Sale Grid select handler
  const handleQuickSelect = useCallback((qp: QuickSaleProduct) => {
    const full = products.find(p => p.id === qp.id);
    if (full) handleAddProduct(full);
  }, [products, handleAddProduct]);

  // Numeric keypad handler — sends keys to the focused input
  const handleKeypadKey = useCallback((key: string) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    if (key === 'DEL') {
      const v = el.value;
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSet) {
        nativeSet.call(el, v.slice(0, -1));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSet) {
        nativeSet.call(el, el.value + key);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, []);

  const handleAddVariant = useCallback(async (product: QuickProduct, variant: ProductVariant) => {
    setVariantPickerProduct(null);
    const { price: tierPrice, tierLabel } = getDetalTierPrice(product);
    const basePrice = variant.precioDetal ?? (tierLabel ? tierPrice : product.price);
    const ok = await addProductByCode(variant.sku || product.codigo, 'detal', basePrice);
    if (!ok) {
      setError(`Variante no encontrada: ${variant.sku}`);
      setTimeout(() => setError(''), 3000);
    }
  }, [addProductByCode, getDetalTierPrice]);

  // Fase B.6: beep audible (WebAudio, sin assets). Mismo patrón que PosMayor.
  const playBeep = useCallback((kind: 'ok' | 'err') => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = kind === 'ok' ? 1000 : 300;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (kind === 'ok' ? 0.06 : 0.15));
      osc.start();
      osc.stop(ctx.currentTime + (kind === 'ok' ? 0.08 : 0.18));
      osc.onended = () => ctx.close();
    } catch { /* silent */ }
  }, []);

  const handleScan = async () => {
    const code = searchQuery.trim();
    if (!code) return;
    const ok = await addProductByBarcode(code, 'detal');
    if (ok) {
      playBeep('ok');
      setSearchQuery('');
    } else {
      playBeep('err');
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2000);
    }
  };

  const handleCameraScan = async (code: string) => {
    setShowCameraScanner(false);
    const ok = await addProductByCode(code, 'detal');
    if (ok) {
      playBeep('ok');
      setSuccess(`Escaneado: ${code}`);
      setTimeout(() => setSuccess(''), 2000);
    } else {
      playBeep('err');
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2500);
    }
  };

  // Fase B.6: listener global de scanner USB — mismo patrón que PosMayor.
  // Buffer de teclas rápidas + Enter → addProductByBarcode. Ignora si foco
  // está en input/textarea (para no competir con el search manual).
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      const now = Date.now();
      if (now - lastKeyTime > 80) buffer = '';
      lastKeyTime = now;
      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          const code = buffer;
          buffer = '';
          e.preventDefault();
          addProductByBarcode(code, 'detal').then(ok => {
            if (ok) {
              playBeep('ok');
              setSuccess(`Escaneado: ${code}`);
              setTimeout(() => setSuccess(''), 1500);
            } else {
              playBeep('err');
              setError(`Código no encontrado: ${code}`);
              setTimeout(() => setError(''), 2000);
            }
          });
        } else {
          buffer = '';
        }
        return;
      }
      if (e.key.length === 1 && /[\w\-]/.test(e.key)) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addProductByBarcode, playBeep]);

  // Carga las hotkeys del terminal y dispara onboarding la primera vez
  useEffect(() => {
    if (!cajaId) return;
    const loaded = loadHotkeys(cajaId);
    setHotkeys(loaded);
    if (!hasOnboarded(cajaId)) {
      setTimeout(() => {
        setHotkeysOnboarding(true);
        setShowHotkeysModal(true);
      }, 600);
    }
  }, [cajaId]);

  // Tour de introducción del POS — primera vez por terminal.
  // Se dispara después del onboarding de hotkeys (espera 5s para no saturar).
  useEffect(() => {
    if (!cajaId) return;
    if (posTourSeen(cajaId)) return;
    const t = setTimeout(() => {
      // Si el modal de hotkeys está abierto, esperamos a que se cierre
      if (showHotkeysModal) return;
      runTour(POS_TOUR_STEPS).then(() => markPosTourSeen(cajaId));
    }, 5000);
    return () => clearTimeout(t);
  }, [cajaId, showHotkeysModal]);

  const launchPosTourManual = useCallback(() => {
    runTour(POS_TOUR_STEPS);
  }, []);

  const holdCart = useCallback(() => {
    if (items.length === 0) return;
    setHeldCarts(prev => [...prev, {
      id: crypto.randomUUID(),
      items: [...items],
      customer,
      consumidorFinal,
      discountType,
      discountValue,
      heldAt: new Date(),
    }]);
    clearCart();
    setCustomer(null);
    setClientQuery('');
    setConsumidorFinal(false);
  }, [items, customer, consumidorFinal, discountType, discountValue, clearCart]);

  const restoreHeldCart = useCallback((held: HeldCart) => {
    loadCart(held.items, held.discountType, held.discountValue);
    setCustomer(held.customer);
    setConsumidorFinal(held.consumidorFinal);
    if (held.customer) setClientQuery(held.customer.fullName || held.customer.nombre || '');
    setHeldCarts(prev => prev.filter(h => h.id !== held.id));
    setShowHeld(false);
  }, [loadCart]);

  // Listener global de hotkeys configuradas
  useEffect(() => {
    if (hotkeys.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping && e.key !== 'Escape') return;
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.shiftKey && e.key.length > 1) parts.push('shift');
      if (e.altKey) parts.push('alt');
      let key = e.key;
      if (key.length === 1) key = key.toLowerCase();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
      parts.push(key);
      const combo = parts.join('+');

      const hk = hotkeys.find(h => h.combo === combo);
      if (!hk) return;
      e.preventDefault();
      switch (hk.action) {
        case 'cobrar':
          if (items.length > 0 && (customer || consumidorFinal)) setShowPaymentModal(true);
          break;
        case 'credito':
          if (items.length > 0 && customer && !consumidorFinal) setShowCreditModal(true);
          break;
        case 'cliente':
          (document.querySelector('input[placeholder*="Buscar cliente"]') as HTMLInputElement | null)?.focus();
          break;
        case 'descuento':
          alert('Atajo: Aplicar descuento (próximamente)');
          break;
        case 'retener':
          if (items.length > 0) holdCart();
          break;
        case 'nuevoCliente':
          setShowNewClientModal(true);
          break;
        case 'limpiarCarrito':
          if (items.length > 0 && confirm('¿Vaciar el carrito?')) clearCart();
          break;
        case 'consumidorFinal':
          setConsumidorFinal(v => !v);
          if (!consumidorFinal) { setCustomer(null); setClientQuery(''); }
          break;
        case 'verHistorial':
          setShowHistory(true);
          break;
        case 'escanear':
          setShowCameraScanner(true);
          break;
        case 'repetirVenta':
          alert('Atajo: Repetir última venta (próximamente)');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys, items, customer, consumidorFinal, holdCart, clearCart]);

  const handleCharge = async (
    method: PaymentMethod,
    cashGiven: number,
    reference: string,
    mixCash: number,
    mixTransfer: number,
    igtfAmount: number,
  ) => {
    setPaymentLoading(true);
    try {
      const now = new Date();
      const isoDate = now.toISOString();
      const simpleDate = isoDate.split('T')[0];

      const entityId = consumidorFinal ? 'CONSUMIDOR_FINAL' : customer?.id;
      const entityLabel = consumidorFinal ? 'Consumidor Final' : (customer?.fullName || customer?.nombre || 'Cliente');

      const grandTotal   = totals.totalUsd + igtfAmount;
      const grandTotalBs = totals.totalBs  + igtfAmount * rateValue;
      const changeUsd = method === 'efectivo_usd' ? Math.max(0, cashGiven - grandTotal)   : 0;
      const changeBs  = method === 'efectivo_bs'  ? Math.max(0, cashGiven - totals.totalBs) : 0;

      const { formatted: nroControl } = await getNextNroControl(empresa_id, cajaId || undefined);

      // Build pagos breakdown for audit
      const pagos: Record<string, number> = {};
      if (method === 'mixto') {
        if (mixCash > 0) pagos['Efectivo USD'] = mixCash;
        if (mixTransfer > 0) pagos['Transferencia'] = mixTransfer;
      } else {
        pagos[METHOD_LABELS[method]] = grandTotal;
      }

      const movementPayload: any = {
        businessId: empresa_id,
        nroControl,
        entityId,
        concept: `Venta POS Detal — ${entityLabel}`,
        amount: grandTotal,
        originalAmount: grandTotalBs,
        amountInUSD: grandTotal,
        subtotalUSD: totals.subtotalUsd,
        ivaAmount:      totals.taxUsd      > 0 ? totals.taxUsd      : null,
        discountAmount: totals.discountUsd > 0 ? totals.discountUsd : null,
        igtfAmount:     igtfAmount         > 0 ? igtfAmount         : null,
        igtfRate:       igtfAmount         > 0 ? fiscalConfig.igtfRate / 100 : null,
        currency: 'USD',
        date: simpleDate,
        createdAt: isoDate,
        movementType: 'FACTURA',
        accountType: 'BCV',
        rateUsed: rateValue,
        metodoPago: METHOD_LABELS[method],
        esPagoMixto: method === 'mixto',
        // K.9 — vincular ventas Efectivo USD a la caja chica para que aparezcan en Tesorería
        ...(method === 'efectivo_usd' && { bankAccountId: 'efectivo_usd_default' }),
        pagos,
        referencia: reference || null,
        cashGiven: cashGiven || null,
        changeUsd: changeUsd || null,
        changeBs: changeBs || null,
        mixCash: method === 'mixto' ? mixCash : null,
        mixTransfer: method === 'mixto' ? mixTransfer : null,
        items: items.map(i => {
          const realQty = effectiveStockQty(i);
          return { id: i.id, nombre: i.nombre, qty: realQty, price: i.priceUsd, subtotal: realQty * i.priceUsd, sellMode: i.sellMode || 'unidad', unidadesPorBulto: i.unidadesPorBulto || 1, ...(i.note ? { note: i.note } : {}) };
        }),
        cajaId: cajaId || 'principal',
        cajaName: terminalLabel,
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        startedAt: startedAt?.toISOString() || isoDate,
        // Venta Detal es siempre de contado — no genera CxC pendiente
        pagado: true,
        estadoPago: 'PAGADO',
        esVentaContado: true,
      };

      // Wire bridge metadata if this sale was loaded from another module
      if (bridgeMeta) {
        if (bridgeMeta.source === 'cotizacion') movementPayload.quoteId = bridgeMeta.sourceId;
        if (bridgeMeta.customerId && !movementPayload.entityId) {
          movementPayload.entityId = bridgeMeta.customerId;
        }
      }

      const movRef = await addDoc(collection(db, 'movements'), movementPayload);

      // Back-fill the source document so it can't be re-billed and the user can trace the link
      if (bridgeMeta) {
        try {
          if (bridgeMeta.source === 'cotizacion') {
            await updateDoc(doc(db, `businesses/${empresa_id}/quotes`, bridgeMeta.sourceId), {
              convertedMovementId: movRef.id,
              convertedAt: isoDate,
              status: 'convertida',
            });
          }

          // Generate commission record if enabled and we know the staff
          if (
            commissionsCfg.salesCommissionEnabled &&
            (commissionsCfg.salesCommissionPct ?? 0) > 0 &&
            bridgeMeta.staffId
          ) {
            const pct = Number(commissionsCfg.salesCommissionPct || 0);
            const amount = (grandTotal * pct) / 100;
            await addDoc(collection(db, `businesses/${empresa_id}/commissions`), {
              type: bridgeMeta.source,
              staffId: bridgeMeta.staffId,
              staffName: bridgeMeta.staffName || '',
              source: bridgeMeta.source,
              sourceId: bridgeMeta.sourceId,
              movementId: movRef.id,
              serviceId: bridgeMeta.serviceId || null,
              serviceName: bridgeMeta.serviceName || null,
              customerId: bridgeMeta.customerId || null,
              customerName: bridgeMeta.customerName || null,
              baseAmount: grandTotal,
              percent: pct,
              amount,
              date: simpleDate,
              createdAt: isoDate,
            });
          }
        } catch (err) {
          console.warn('[pos detal] could not back-fill bridge source', err);
        }
        setBridgeMeta(null);
      }

      // Update stock — floor at 0, never negative. Bulto: effectiveStockQty returns qty × unidadesPorBulto
      const almacenKey = almacenes.length > 0 ? selectedAlmacenId : 'principal';
      for (const item of items) {
        const qtyToDecrement = effectiveStockQty(item); // Fase B: bulto-aware
        // Fase 9.4: variant items have id = "productId__v_variantId"
        const isVariantItem = item.id.includes('__v_');
        const realProductId = isVariantItem ? item.id.split('__v_')[0] : item.id;
        const variantId = isVariantItem ? item.id.split('__v_')[1] : null;

        await runTransaction(db, async (txn) => {
          const ref = doc(db, `businesses/${empresa_id}/products`, realProductId);
          const snap = await txn.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();

          // Kit expansion: decrement each component, not the kit itself
          if (data.isKit && Array.isArray(data.kitComponents) && data.kitComponents.length > 0) {
            const compRefs = data.kitComponents.map((c: any) =>
              doc(db, `businesses/${empresa_id}/products`, c.productId),
            );
            const compSnaps = await Promise.all(compRefs.map((r: any) => txn.get(r)));
            compSnaps.forEach((cSnap: any, i: number) => {
              if (!cSnap.exists()) return;
              const cData = cSnap.data();
              const compQty = Number(data.kitComponents[i].qty || 1) * qtyToDecrement;
              const cStockByAlm: Record<string, number> = cData.stockByAlmacen || {};
              if (cStockByAlm[almacenKey] !== undefined) {
                const curA = Number(cStockByAlm[almacenKey] ?? 0);
                const curT = Number(cData.stock ?? 0);
                txn.update(compRefs[i], {
                  [`stockByAlmacen.${almacenKey}`]: Math.max(0, curA - compQty),
                  stock: Math.max(0, curT - compQty),
                });
              } else {
                const cur = Number(cData.stock ?? 0);
                txn.update(compRefs[i], { stock: Math.max(0, cur - compQty) });
              }
            });
            return; // No tocar el stock del kit
          }

          // Fase 9.4: variant stock decrement — update the variant's stock inside the array
          if (variantId && data.hasVariants && Array.isArray(data.variants)) {
            const updatedVariants = data.variants.map((v: any) => {
              if (v.id === variantId) {
                return { ...v, stock: Math.max(0, (v.stock || 0) - qtyToDecrement) };
              }
              return v;
            });
            txn.update(ref, { variants: updatedVariants });
            return;
          }

          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          if (stockByAlmacen[almacenKey] !== undefined) {
            // Multi-almacén path
            const curAlmacen = Number(stockByAlmacen[almacenKey] ?? 0);
            const curTotal = Number(data.stock ?? 0);
            txn.update(ref, {
              [`stockByAlmacen.${almacenKey}`]: Math.max(0, curAlmacen - qtyToDecrement),
              stock: Math.max(0, curTotal - qtyToDecrement),
            });
          } else {
            // Legacy single-stock path
            const cur = Number(data.stock ?? 0);
            txn.update(ref, { stock: Math.max(0, cur - qtyToDecrement) });
          }
        });
      }

      // ── KARDEX: registrar cada item como movimiento de salida tipo VENTA ─────
      // Esto alimenta la vista Movimientos del módulo Inventario y permite
      // auditar cada venta a nivel SKU. No bloquea: si falla, la venta ya
      // está registrada en `movements` y el stock ya bajó. Best-effort.
      try {
        const kardexWrites = items.map(item => {
          const isVariantItem = item.id.includes('__v_');
          const realProductId = isVariantItem ? item.id.split('__v_')[0] : item.id;
          const qty = effectiveStockQty(item);
          // Buscar el costo desde la lista de productos cargada en POS
          const prod = products.find(p => p.id === realProductId);
          const unitCost = Number(prod?.costoUSD || 0);
          return addDoc(collection(db, `businesses/${empresa_id}/inventoryMovements`), {
            productId: realProductId,
            productName: item.nombre,
            productCode: (prod as any)?.codigo || (prod as any)?.barcode || null,
            type: 'VENTA',
            quantity: -qty, // negativo por convención de salidas en el schema nuevo
            unitCostUSD: unitCost,
            warehouseId: almacenes.length > 0 ? selectedAlmacenId : 'principal',
            warehouseName: 'Principal',
            reason: `Venta POS Detal #${nroControl}`,
            sourceDocType: 'movement',
            sourceDocId: movRef.id,
            createdAt: isoDate,
            createdBy: userProfile?.uid || 'sistema',
            createdByName: userProfile?.fullName || 'Vendedor',
          });
        });
        await Promise.all(kardexWrites);
      } catch (kardexErr) {
        console.warn('[POS Detal] kardex write failed (no-bloqueante)', kardexErr);
      }

      // Update terminal stats
      if (cajaId) {
        await updateDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId), {
          totalFacturado: increment(grandTotal),
          movimientos: increment(1),
          ultimaVenta: isoDate,
        });
      }

      clearCart();
      setCustomer(null);
      setClientQuery('');
      setConsumidorFinal(false);
      setShowPaymentModal(false);
      setTurnSaleCount(prev => prev + 1);
      setTurnTotal(prev => prev + movementPayload.totalUsd);

      if (continuousMode) {
        // In continuous mode: skip receipt, show brief toast, focus search
        setSuccess(`Venta #${turnSaleCount + 1} — $${movementPayload.totalUsd.toFixed(2)}`);
        setTimeout(() => setSuccess(''), 2500);
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"], input[placeholder*="Filtrar"]');
          el?.focus();
        }, 100);
      } else {
        setLastMovement(movementPayload);
        setSuccess('¡Venta registrada!');
        setTimeout(() => setSuccess(''), 3500);
        if (autoPrint) {
          setTimeout(() => window.print(), 600);
        }
      }
    } catch (err: any) {
      console.error(err);
      const code = err?.code || '';
      if (code === 'resource-exhausted') {
        setError('Cuota de Firestore agotada — espera unos minutos e intenta de nuevo');
        setTimeout(() => setError(''), 8000);
      } else if (code === 'permission-denied') {
        setError('Sin permisos para procesar la venta — contacta al administrador');
        setTimeout(() => setError(''), 5000);
      } else {
        setError('Error al procesar la venta');
        setTimeout(() => setError(''), 3000);
      }
    } finally {
      setPaymentLoading(false);
    }
  };

  const canCharge = items.length > 0 && (!!customer || consumidorFinal);
  const cajeroLabel = terminalInfo?.cajeroNombre || userProfile?.fullName || 'Vendedor';
  const terminalLabel = terminalInfo?.nombre || cajaId || 'PRINCIPAL';

  const handleAbonoSubmit = async () => {
    if (!customer?.id) return;
    const amountNum = parseFloat(abonoAmount.replace(',', '.'));
    if (!isFinite(amountNum) || amountNum <= 0) {
      setAbonoFeedback({ ok: false, msg: 'Monto inválido' });
      return;
    }
    setSubmittingAbono(true);
    setAbonoFeedback(null);
    try {
      const now = new Date();
      const isoDate = now.toISOString();
      const entityLabel = customer.fullName || customer.nombre || 'Cliente';
      const payload: any = {
        businessId: empresa_id,
        entityId: customer.id,
        entityName: entityLabel,
        movementType: 'ABONO',
        amount: amountNum,
        amountInUSD: amountNum,
        currency: 'USD',
        accountType: customer.defaultAccountType || 'BCV',
        date: abonoDate,
        createdAt: isoDate,
        concept: `Abono desde POS Detal — ${entityLabel}${abonoNote ? ` (${abonoNote})` : ''}`,
        metodoPago: METHOD_LABELS[abonoMethod],
        referencia: abonoReference.trim() || null,
        cajaId: cajaId || 'principal',
        cajaName: terminalLabel,
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        origen: 'pos_detal_abono',
      };
      if (abonoMethod === 'efectivo_usd') payload.bankAccountId = 'efectivo_usd_default';

      // Si el cliente está en modo invoiceLinked, calculamos las allocations
      // ANTES de crear el ABONO para guardar el snapshot inicial en el doc.
      let allocsForAbono: { invoiceId: string; invoiceRef?: string; amount: number }[] = [];
      if (effectiveCreditMode === 'invoiceLinked') {
        const manual: { invoiceId: string; invoiceRef?: string; amount: number }[] = [];
        for (const [invoiceId, v] of Object.entries(allocInputs)) {
          const n = parseFloat(String(v).replace(',', '.')) || 0;
          const inv = openInvoices.find(i => i.id === invoiceId);
          if (n > 0 && inv) {
            manual.push({
              invoiceId,
              invoiceRef: inv.nroControl || inv.concept || undefined,
              amount: Number(n.toFixed(2)),
            });
          }
        }
        allocsForAbono = manual.length > 0
          ? manual
          : computeFifoAllocations(openInvoices as any, amountNum);
      }

      const movRef = await addDoc(collection(db, 'movements'), payload);

      // Aplicamos las allocations: actualiza el ABONO + cada FACTURA afectada.
      if (effectiveCreditMode === 'invoiceLinked' && allocsForAbono.length > 0) {
        try {
          await applyAbonoAllocations(db, movRef.id, amountNum, allocsForAbono);
        } catch (e) {
          console.warn('[pos detal] applyAbonoAllocations failed', e);
        }
      }

      const allocMsg = effectiveCreditMode === 'invoiceLinked' && allocsForAbono.length > 0
        ? ` (aplicado a ${allocsForAbono.length} factura${allocsForAbono.length > 1 ? 's' : ''})`
        : '';
      setAbonoFeedback({ ok: true, msg: `Abono de $${amountNum.toFixed(2)} registrado${allocMsg}` });
      setAbonoAmount('');
      setAbonoReference('');
      setAbonoNote('');
      setAllocInputs({});
      setShowAbonoForm(false);
      setTimeout(() => setAbonoFeedback(null), 4000);
    } catch (err: any) {
      console.error('[pos detal] abono fail', err);
      setAbonoFeedback({ ok: false, msg: `Error: ${err?.message || 'no se pudo registrar'}` });
    } finally {
      setSubmittingAbono(false);
    }
  };

  // Crea un cliente nuevo en root collection `customers` y lo selecciona
  // automáticamente en el POS para no romper el flujo de venta del cajero.
  const handleCreateClient = async () => {
    const name = newClientName.trim();
    if (!name || name.length < 2) {
      setNewClientError('Nombre obligatorio (mínimo 2 caracteres)');
      return;
    }
    setCreatingClient(true);
    setNewClientError(null);
    try {
      const ced = newClientCedula.trim();
      const ref = await addDoc(collection(db, 'customers'), {
        businessId: empresa_id,
        fullName: name,
        cedula: ced || null,
        rif: ced || null,
        telefono: newClientPhone.trim() || null,
        createdAt: new Date().toISOString(),
        createdBy: userProfile?.uid || 'sistema',
        defaultAccountType: 'BCV',
        creditMode: null,
        origen: 'pos_detal',
      });
      // Seleccionar inmediatamente el cliente recién creado
      setCustomer({ id: ref.id, fullName: name, cedula: ced, rif: ced, telefono: newClientPhone.trim() });
      setClientQuery('');
      setNewClientName('');
      setNewClientCedula('');
      setNewClientPhone('');
      setShowNewClientModal(false);
    } catch (err: any) {
      console.error('[pos detal] create client fail', err);
      setNewClientError(err?.message || 'No se pudo crear el cliente');
    } finally {
      setCreatingClient(false);
    }
  };

  // Venta a CRÉDITO: cobra el carrito completo generando una FACTURA con
  // `pagado: false` y `paymentDays`/`dueDate` para que aparezca en CxC del
  // cliente. Espejo simplificado de handleCharge pero sin tocar caja, sin
  // método de pago, sin generar abono.
  const handleCreditSale = async () => {
    if (!customer?.id) {
      setCreditFeedback({ ok: false, msg: 'Selecciona un cliente para vender a crédito' });
      return;
    }
    if (items.length === 0) {
      setCreditFeedback({ ok: false, msg: 'Carrito vacío' });
      return;
    }
    const days = Math.max(0, Math.floor(creditDays || 0));
    setSubmittingCredit(true);
    setCreditFeedback(null);
    try {
      const now = new Date();
      const isoDate = now.toISOString();
      const simpleDate = isoDate.split('T')[0];
      const dueDate = days > 0
        ? new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10)
        : simpleDate;

      const { formatted: nroControl } = await getNextNroControl(empresa_id, cajaId || undefined);
      const entityLabel = customer.fullName || customer.nombre || 'Cliente';
      const grandTotal = totals.totalUsd;
      const grandTotalBs = totals.totalBs;

      const movementPayload: any = {
        businessId: empresa_id,
        nroControl,
        entityId: customer.id,
        entityName: entityLabel,
        concept: `Venta a crédito POS Detal — ${entityLabel}${creditNote ? ` (${creditNote})` : ''}`,
        amount: grandTotal,
        originalAmount: grandTotalBs,
        amountInUSD: grandTotal,
        subtotalUSD: totals.subtotalUsd,
        ivaAmount: totals.taxUsd > 0 ? totals.taxUsd : null,
        discountAmount: totals.discountUsd > 0 ? totals.discountUsd : null,
        currency: 'USD',
        date: simpleDate,
        createdAt: isoDate,
        movementType: 'FACTURA',
        accountType: customer.defaultAccountType || 'BCV',
        rateUsed: rateValue,
        items: items.map(i => {
          const realQty = effectiveStockQty(i);
          return { id: i.id, nombre: i.nombre, qty: realQty, price: i.priceUsd, subtotal: realQty * i.priceUsd, sellMode: i.sellMode || 'unidad', unidadesPorBulto: i.unidadesPorBulto || 1, ...(i.note ? { note: i.note } : {}) };
        }),
        cajaId: cajaId || 'principal',
        cajaName: terminalLabel,
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        startedAt: startedAt?.toISOString() || isoDate,
        // Marca de venta a crédito — abre saldo en CxC, sin descontar caja
        pagado: false,
        estadoPago: 'PENDIENTE',
        esVentaContado: false,
        paymentCondition: days === 0 ? 'CONTADO' : `CREDITO${days}`,
        paymentDays: days,
        dueDate,
        invoiceStatus: 'OPEN',
        allocations: [],
        allocatedTotal: 0,
        origen: 'pos_detal_credito',
      };

      // Descontar stock igual que una venta normal (la mercancía sale del almacén
      // aunque no se cobre todavía).
      const movRef = await addDoc(collection(db, 'movements'), movementPayload);
      for (const item of items) {
        const realProductId = item.id.includes('__v_') ? item.id.split('__v_')[0] : item.id;
        const realQty = effectiveStockQty(item);
        try {
          const ref = doc(db, `businesses/${empresa_id}/products`, realProductId);
          await updateDoc(ref, { stock: increment(-realQty) });
        } catch (e) {
          console.warn('[pos detal] no se pudo descontar stock', item.id, e);
        }
      }

      // KARDEX: registrar cada item como movimiento VENTA (best-effort).
      try {
        const kardexWrites = items.map(item => {
          const isVariantItem = item.id.includes('__v_');
          const realProductId = isVariantItem ? item.id.split('__v_')[0] : item.id;
          const qty = effectiveStockQty(item);
          const prod = products.find(p => p.id === realProductId);
          const unitCost = Number(prod?.costoUSD || 0);
          return addDoc(collection(db, `businesses/${empresa_id}/inventoryMovements`), {
            productId: realProductId,
            productName: item.nombre,
            productCode: (prod as any)?.codigo || (prod as any)?.barcode || null,
            type: 'VENTA',
            quantity: -qty,
            unitCostUSD: unitCost,
            warehouseId: 'principal',
            warehouseName: 'Principal',
            reason: `Venta crédito #${nroControl}`,
            sourceDocType: 'movement',
            sourceDocId: movRef.id,
            createdAt: isoDate,
            createdBy: userProfile?.uid || 'sistema',
            createdByName: userProfile?.fullName || 'Vendedor',
          });
        });
        await Promise.all(kardexWrites);
      } catch (kardexErr) {
        console.warn('[POS Detal credit] kardex write failed (no-bloqueante)', kardexErr);
      }

      setCreditFeedback({ ok: true, msg: `Factura ${nroControl} a crédito ($${grandTotal.toFixed(2)}, vence ${dueDate}) creada en CxC` });
      clearCart();
      setShowCreditModal(false);
      setCreditNote('');
      setTimeout(() => setCreditFeedback(null), 5000);
    } catch (err: any) {
      console.error('[pos detal] credit sale fail', err);
      setCreditFeedback({ ok: false, msg: `Error: ${err?.message || 'no se pudo registrar la venta a crédito'}` });
    } finally {
      setSubmittingCredit(false);
    }
  };

  // Token validation: block access without valid kiosk token
  if (tokenValid === null) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#070b14] gap-4">
        <div className="animate-spin h-9 w-9 border-4 border-indigo-500 border-t-transparent rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Validando acceso...</p>
      </div>
    );
  }
  if (!tokenValid) return <AccessDenied />;

  if (loading && products.length === 0) {
    return (
      <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-800/50">
        {/* Skeleton header */}
        <div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-5 flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
            <div className="h-2 w-16 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
          </div>
        </div>
        {/* Skeleton product grid */}
        <div className="flex-1 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white dark:bg-white/[0.05] border border-slate-100 dark:border-white/[0.07] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-inter">

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <header data-tour="pos-hero" className="h-14 sm:h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 shadow-sm gap-2 sm:gap-4">
        {/* Left: terminal info */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
            <Scan size={17} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
              {terminalLabel}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <User size={10} className="text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400">{cajeroLabel}</p>
            </div>
          </div>
        </div>

        {/* Center: barcode scanner input + camera button */}
        <div className="flex-1 flex items-center gap-2">
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0">
              <WifiOff size={11} /> Offline
            </div>
          )}
          <div className="relative flex-1" data-tour="pos-search">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
              placeholder="Buscar por nombre, código o escanear..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-100 dark:bg-white/[0.07] border-none rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-slate-900 focus:bg-white dark:bg-slate-900 transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          </div>
          {fiscalConfig.scannerEnabled && (
            <HelpTooltip title="Escanear código de barras" text="Abre la cámara para leer el código de barras de un producto y añadirlo automáticamente al carrito." side="bottom">
              <button
                onClick={() => setShowCameraScanner(true)}
                className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
              >
                <Camera size={16} />
              </button>
            </HelpTooltip>
          )}
          {heldCarts.length > 0 && (
            <button
              onClick={() => setShowHeld(true)}
              className="relative h-10 px-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 flex items-center gap-1.5 transition-all shrink-0 border border-amber-200 dark:border-amber-500/20"
              title="Ventas en espera"
            >
              <Pause size={14} />
              <span className="text-[10px] font-black">{heldCarts.length}</span>
            </button>
          )}
          <HelpTooltip title="Historial de Ventas" text="Muestra las últimas 30 ventas del día. Desde aquí puedes ver el detalle de cada venta y anularla si fue un error." side="bottom">
            <button
              onClick={() => setShowHistory(true)}
              className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
            >
              <History size={16} />
            </button>
          </HelpTooltip>
          <HelpTooltip title="Atajos de teclado" text="Configura las teclas rápidas para vender más rápido. Cada terminal tiene su propio set." side="bottom">
            <button
              onClick={() => { setHotkeysOnboarding(false); setShowHotkeysModal(true); }}
              data-tour="pos-hotkeys-btn"
              className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
            >
              <Keyboard size={16} />
            </button>
          </HelpTooltip>
          <HelpTooltip title="Tour del POS" text="Te muestra paso a paso cómo usar las features nuevas del POS." side="bottom">
            <button
              onClick={launchPosTourManual}
              className="h-10 w-10 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center transition-all shrink-0 border border-violet-500/30"
              title="Ver tour del POS"
            >
              <Sparkles size={16} />
            </button>
          </HelpTooltip>
        </div>

        {/* Right: date/time, rate, logout */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Notifications */}
          {success && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black">
              <CheckCircle2 size={13} />{success}
            </div>
          )}
          {error && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-black">
              <AlertTriangle size={13} />{error}
            </div>
          )}

          {/* Almacén selector — only shown when 2+ almacenes */}
          {almacenes.length >= 2 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Layers size={11} className="text-indigo-400 shrink-0" />
              <select value={selectedAlmacenId} onChange={e => setSelectedAlmacenId(e.target.value)}
                className="text-[9px] font-black uppercase tracking-wider bg-transparent border-none text-indigo-300 outline-none cursor-pointer max-w-[100px]">
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          )}

          {/* Continuous mode toggle + turn KPIs */}
          <div className="hidden sm:flex items-center gap-2">
            {turnSaleCount > 0 && (
              <span className="text-[9px] font-black text-slate-400 dark:text-white/30 uppercase tracking-wider">
                {turnSaleCount} venta{turnSaleCount !== 1 ? 's' : ''} · ${turnTotal.toFixed(2)}
              </span>
            )}
            <button
              onClick={() => setContinuousMode(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                continuousMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/30'
              }`}
              title={continuousMode ? 'Modo continuo activado' : 'Activar modo continuo'}
            >
              {continuousMode ? <Play size={10} /> : <Pause size={10} />}
              Continuo
            </button>
            <button
              onClick={() => setAutoPrint(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                autoPrint ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/30'
              }`}
              title={autoPrint ? 'Auto-print activado' : 'Activar impresión automática'}
            >
              <Printer size={10} />
              Auto
            </button>
            <button
              onClick={() => setShowKeypad(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                showKeypad ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/30'
              }`}
              title={showKeypad ? 'Ocultar teclado numérico' : 'Mostrar teclado numérico'}
            >
              <Hash size={10} />
              Keypad
            </button>
          </div>

          {/* Date + time */}
          <div className="text-right hidden lg:block">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">{formatLiveDate(now)}</p>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{formatLiveTime(now)}</p>
          </div>

          {/* Rate cards */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="px-2.5 py-1 rounded-lg border bg-sky-500/10 border-sky-500/30 text-center">
              <p className="text-[7px] font-black uppercase text-sky-400">BCV</p>
              <p className="text-[11px] font-black font-mono text-slate-900 dark:text-white">{rates.tasaBCV.toFixed(2)}</p>
            </div>
            {zoherEnabled && customRates.filter(r => r.enabled && r.value > 0).map(r => (
              <div key={r.id} className="px-2.5 py-1 rounded-lg border bg-white/[0.03] border-white/[0.07] text-center">
                <p className="text-[7px] font-black uppercase text-amber-400">{r.name || r.id}</p>
                <p className="text-[11px] font-black font-mono text-slate-900 dark:text-white">{r.value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Kiosk fullscreen toggle */}
          <button
            onClick={toggleKiosk}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${isKiosk ? 'bg-slate-700/40 border-slate-500/40 text-slate-300' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:border-white/20'}`}
            title={isKiosk ? 'Salir de pantalla completa (Esc)' : 'Modo Kiosco — pantalla completa'}
          >
            {isKiosk ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            {isKiosk ? 'Salir' : 'Kiosco'}
          </button>

        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: PRODUCT GRID ─────────────────────────────────────────────── */}
        <section className={`${mobileTab === 'products' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[35%] lg:min-w-[280px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-white/[0.07]`}>
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.07]">
            <div className="relative">
              <input
                value={productFilter}
                onChange={e => setProductFilter(e.target.value)}
                placeholder="Filtrar productos..."
                inputMode="search"
                enterKeyHint="search"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-100 dark:border-white/[0.07] focus:ring-2 focus:ring-slate-900 focus:bg-white dark:bg-slate-900 outline-none transition-all"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              {productFilter && (
                <button onClick={() => setProductFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 px-0.5 gap-1">
              <div className="flex items-center gap-1">
                {(['all', 'inStock', 'noStock', 'favoritos'] as const).map(f => {
                  const favCount = products.filter(p => p.favorito).length;
                  return (
                    <button key={f} onClick={() => setStockFilter(f)}
                      className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${stockFilter === f ? 'bg-slate-900 dark:bg-white/[0.15] text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                      {f === 'all' ? 'Todos' : f === 'inStock' ? 'Con Stock' : f === 'noStock' ? `Sin Stock (${noStockCount})` : `★ Fav (${favCount})`}
                    </button>
                  );
                })}
              </div>
              <span className="text-[9px] font-bold text-slate-300 shrink-0 tabular-nums">
                {filteredProducts.length > visibleCount ? `${displayProducts.length}/${filteredProducts.length}` : filteredProducts.length}
              </span>
            </div>
          </div>

          {/* Quick Sale Grid — top sellers / pinned */}
          <QuickSaleGrid
            products={quickGridProducts}
            onSelect={handleQuickSelect}
            visible={showQuickGrid && !productFilter && !searchQuery}
            maxItems={8}
          />

          <div className="flex-1 overflow-y-auto p-3 custom-scroll">
            {displayProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                <Package size={40} className="text-slate-300 mb-3" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {displayProducts.map(product => {
                  const { price: tierPrice, tierLabel } = getDetalTierPrice(product);
                  return (
                    <button key={product.id} onClick={() => handleAddProduct(product)}
                      className={`group bg-white dark:bg-white/[0.05] p-3 rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left flex flex-col h-28 justify-between ${product.stock === 0 ? 'border-amber-200 dark:border-amber-500/25' : 'border-slate-100 dark:border-white/[0.1] hover:border-slate-300 dark:hover:border-white/20'}`}>
                      <div>
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-white/[0.08] text-slate-400 dark:text-slate-300 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                            <Package size={12} />
                          </div>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${product.stock === 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15' : 'text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.08]'}`}>
                            {product.stock === 0 ? 'AGOTADO' : product.stock}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-700 dark:text-white/90 line-clamp-2 leading-tight">{product.name}</p>
                        {product.marca && <p className="text-[9px] font-black text-indigo-400 dark:text-indigo-300 uppercase mt-0.5">{product.marca}</p>}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          ${tierPrice.toFixed(2)}
                        </p>
                        {tierLabel && (
                          <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1 py-0.5 rounded capitalize">
                            {tierLabel}
                          </span>
                        )}
                        {tierLabel && tierPrice !== product.price && (
                          <p className="text-[9px] font-bold text-slate-400 line-through">${product.price.toFixed(2)}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {/* Cargar más: aparece solo si quedan productos por mostrar */}
                {filteredProducts.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount(c => c + 60)}
                    className="col-span-full mt-2 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-white/70 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.06]"
                  >
                    Ver {Math.min(60, filteredProducts.length - visibleCount)} más ({filteredProducts.length - visibleCount} restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT: CART + CHECKOUT ─────────────────────────────────────────── */}
        <aside data-tour="pos-cart" className={`${mobileTab === 'cart' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 bg-white dark:bg-slate-900`}>

          {/* Cart items table */}
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 shadow-sm">
                <tr>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07]">Producto</th>
                  <th className="px-2 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-center">Cant.</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right hidden sm:table-cell">P/U</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right">Total</th>
                  <th className="px-2 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] w-8 sm:w-auto" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 dark:divide-white/[0.04]">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 sm:py-24 text-center pointer-events-none select-none">
                      <div className="inline-flex h-14 w-14 sm:h-16 sm:w-16 rounded-3xl bg-slate-50 dark:bg-slate-800/50 items-center justify-center mb-3 sm:mb-4">
                        <ShoppingCart size={24} className="text-slate-300 sm:hidden" />
                        <ShoppingCart size={28} className="text-slate-300 hidden sm:block" />
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-slate-300 dark:text-white/20 uppercase tracking-widest mb-1">Carrito Vacío</h3>
                      <p className="text-[10px] sm:text-xs text-slate-300 dark:text-white/15 font-medium">Escanea un código o selecciona un producto</p>
                    </td>
                  </tr>
                ) : items.map(item => {
                  const hasBulto = (item.unidadesPorBulto || 1) > 1;
                  const isBultoMode = item.sellMode === 'bulto';
                  const perBulto = item.unidadesPorBulto || 1;
                  const effectivePrice = effectiveLinePrice(item);
                  return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] group transition-colors">
                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                      <div className="flex items-start gap-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 leading-none line-clamp-1">{item.nombre}</p>
                          <p className="text-[9px] sm:text-[10px] font-mono text-slate-400 dark:text-white/30 mt-0.5">
                            <span className="sm:hidden">${effectivePrice.toFixed(2)} · </span>{item.codigo}
                          </p>
                          {item.note && <p className="text-[9px] text-amber-500 dark:text-amber-400 mt-0.5 italic truncate">{item.note}</p>}
                          {hasBulto && (
                            <div className="mt-1 flex items-center gap-1">
                              <button type="button" onClick={() => setItemSellMode(item.id, 'unidad')}
                                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${!isBultoMode ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40'}`}
                              >Unid</button>
                              <button type="button" onClick={() => setItemSellMode(item.id, 'bulto')}
                                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${isBultoMode ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40'}`}
                              >Bulto</button>
                              <span className="text-[9px] font-mono text-slate-400 dark:text-white/30">= {perBulto} unid</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const note = prompt('Nota para este producto:', item.note || '');
                            if (note !== null) setItemNote(item.id, note);
                          }}
                          className={`shrink-0 p-1 rounded transition-colors ${item.note ? 'text-amber-500' : 'text-slate-300 dark:text-white/15 hover:text-slate-500'}`}
                          title="Agregar nota"
                        >
                          <FileText size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 sm:px-5 py-2.5 sm:py-3.5">
                      {item.unitType && item.unitType !== 'unidad' ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={item.qty}
                            onChange={e => { const v = parseFloat(e.target.value); if (v > 0) updateQty(item.id, v); }}
                            className="w-16 text-center text-sm font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.07] rounded-lg border border-slate-200 dark:border-white/[0.08] outline-none focus:ring-2 focus:ring-indigo-400/20 py-1"
                          />
                          <span className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase">{item.unitType}</span>
                        </div>
                      ) : (
                      <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                        <button
                          onClick={() => updateQty(item.id, item.qty - 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.12] flex items-center justify-center transition-colors"
                        >
                          <Minus size={12} strokeWidth={3} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.qty}
                          onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v > 0) updateQty(item.id, v);
                          }}
                          onFocus={e => e.target.select()}
                          className="w-12 text-center text-sm font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-md py-0.5 outline-none focus:ring-2 focus:ring-indigo-400/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          title="Edita la cantidad directamente"
                        />
                        <button
                          onClick={() => updateQty(item.id, item.qty + 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.12] flex items-center justify-center transition-colors"
                        >
                          <Plus size={12} strokeWidth={3} />
                        </button>
                      </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right hidden sm:table-cell">
                      <p className="text-sm font-bold text-slate-700 dark:text-white/70 tabular-nums">${effectivePrice.toFixed(2)}</p>
                      <p className="text-[10px] font-medium text-slate-400 dark:text-white/30 tabular-nums">Bs {(effectivePrice * rateValue).toLocaleString('es-VE', { maximumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right">
                      <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white tabular-nums">${(item.qty * effectivePrice).toFixed(2)}</p>
                      <p className="text-[10px] font-medium text-slate-400 dark:text-white/30 tabular-nums">Bs {(item.qty * effectivePrice * rateValue).toLocaleString('es-VE', { maximumFractionDigits: 2 })}</p>
                    </td>
                    <td className="px-2 sm:px-5 py-2.5 sm:py-3.5 text-center">
                      <button onClick={() => removeItem(item.id)}
                        className="h-7 w-7 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Numeric Keypad (tablet mode) */}
          <NumericKeypad onKey={handleKeypadKey} visible={showKeypad} />

          {/* ── CHECKOUT PANEL ─────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-slate-900 p-3 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-5">

            {/* Client section */}
            <div className="flex-1 space-y-3 min-w-0" data-tour="pos-customer">
              {/* Consumidor Final toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">Cliente</label>
                <button
                  onClick={() => { setConsumidorFinal(!consumidorFinal); setCustomer(null); setClientQuery(''); }}
                  className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-all border ${consumidorFinal ? 'bg-sky-500 text-white border-sky-500' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15'}`}>
                  <User size={10} />
                  Cons. Final
                </button>
              </div>

              {consumidorFinal ? (
                <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-sky-500 text-white flex items-center justify-center font-black text-sm shrink-0">CF</div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white">Consumidor Final</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-sky-300/70 uppercase">Venta sin cliente registrado</p>
                  </div>
                </div>
              ) : !customer ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                    <input
                      value={clientQuery}
                      onChange={e => setClientQuery(e.target.value)}
                      placeholder="Buscar cliente (nombre, RIF, cédula)..."
                      className="w-full pl-9 pr-4 py-3 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:ring-2 focus:ring-slate-900 dark:focus:ring-indigo-500 outline-none shadow-sm transition-all"
                    />
                    {filteredClients.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 max-h-36 overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-white/[0.07] z-50 p-1">
                        {filteredClients.map(c => (
                          <button key={c.id} onClick={() => { setCustomer(c); setClientQuery(''); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50 rounded-lg flex justify-between items-center group">
                            <div>
                              <p className="text-xs font-black text-slate-800 dark:text-slate-200">{c.fullName || c.nombre || 'Sin Nombre'}</p>
                              <p className="text-[10px] font-bold text-slate-400">{c.rif || c.cedula}</p>
                            </div>
                            <CheckCircle2 size={13} className="text-emerald-500 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      // Si el usuario tipeó algo en el buscador, lo pasamos al form
                      if (clientQuery.trim()) setNewClientName(clientQuery.trim());
                      setShowNewClientModal(true);
                    }}
                    title="Crear cliente nuevo"
                    className="shrink-0 h-[42px] w-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition-colors"
                  >
                    <Plus size={16} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
                  <div className="h-9 w-9 rounded-full bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {(customer.fullName || customer.nombre || 'C').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{customer.fullName || customer.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">{customer.rif || customer.cedula || 'Consumidor Final'}</p>
                  </div>
                  <button onClick={() => { setCustomer(null); setClientQuery(''); }}
                    className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 shrink-0">
                    Cambiar
                  </button>
                </div>
              )}

              {/* Saldo pendiente + abono rápido — visible solo cuando hay cliente seleccionado */}
              {customer && customerBalance !== null && (
                <div className={`rounded-xl p-3 border shadow-sm ${
                  customerBalance > 0.01
                    ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                    : customerBalance < -0.01
                      ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/50">
                          {customerBalance > 0.01 ? 'Debe' : customerBalance < -0.01 ? 'Crédito a favor' : 'Al día'}
                        </p>
                        {effectiveCreditMode === 'invoiceLinked' && (
                          <span className="px-1 py-0 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[8px] font-black uppercase tracking-widest">por factura</span>
                        )}
                        {openInvoices.length > 0 && (
                          <span className="px-1 py-0 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[8px] font-black uppercase tracking-widest">{openInvoices.length} fact.</span>
                        )}
                      </div>
                      <p className={`text-lg font-black ${
                        customerBalance > 0.01
                          ? 'text-rose-600 dark:text-rose-300'
                          : customerBalance < -0.01
                            ? 'text-sky-600 dark:text-sky-300'
                            : 'text-emerald-600 dark:text-emerald-300'
                      }`}>
                        ${Math.abs(customerBalance).toFixed(2)}
                      </p>
                    </div>
                    {!showAbonoForm && (
                      <button
                        onClick={() => { setShowAbonoForm(true); setAbonoFeedback(null); }}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow"
                      >
                        <Banknote size={12} /> Abonar
                      </button>
                    )}
                  </div>

                  {showAbonoForm && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-white/50 mb-1">Monto USD</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={abonoAmount}
                            onChange={e => setAbonoAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-white/50 mb-1">Fecha</label>
                          <input
                            type="date"
                            value={abonoDate}
                            onChange={e => setAbonoDate(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-white/50 mb-1">Método</label>
                        <select
                          value={abonoMethod}
                          onChange={e => setAbonoMethod(e.target.value as Exclude<PaymentMethod, 'mixto'>)}
                          className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="efectivo_usd">Efectivo USD</option>
                          <option value="efectivo_bs">Efectivo Bs</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="pago_movil">Pago Móvil</option>
                          <option value="punto">Punto de Venta</option>
                        </select>
                      </div>
                      {(abonoMethod === 'transferencia' || abonoMethod === 'pago_movil' || abonoMethod === 'punto') && (
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-white/50 mb-1">Referencia</label>
                          <input
                            type="text"
                            value={abonoReference}
                            onChange={e => setAbonoReference(e.target.value)}
                            placeholder="Número de ref"
                            className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-white/50 mb-1">Nota (opcional)</label>
                        <input
                          type="text"
                          value={abonoNote}
                          onChange={e => setAbonoNote(e.target.value)}
                          placeholder="Ej: pago parcial factura vieja"
                          className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Distribución por factura: solo cuando el modo del cliente es invoiceLinked */}
                      {effectiveCreditMode === 'invoiceLinked' && (
                        <div className="rounded-md border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-500/[0.05] p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-widest">Aplicar a facturas</p>
                            {openInvoices.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  // Auto-FIFO: distribuye el monto del abono sobre las facturas más viejas
                                  const amt = parseFloat(abonoAmount.replace(',', '.')) || 0;
                                  if (amt <= 0) return;
                                  const fifo = computeFifoAllocations(openInvoices as any, amt);
                                  const next: Record<string, string> = {};
                                  fifo.forEach(a => { next[a.invoiceId] = a.amount.toFixed(2); });
                                  setAllocInputs(next);
                                }}
                                className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300 hover:underline"
                              >
                                Auto FIFO
                              </button>
                            )}
                          </div>
                          {openInvoices.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">Sin facturas abiertas. El abono quedará como saldo a favor.</p>
                          ) : (
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {openInvoices.map((inv) => {
                                const remaining = getInvoiceRemaining(inv as any);
                                const v = allocInputs[inv.id] || '';
                                return (
                                  <div key={inv.id} className="flex items-center gap-1.5 text-[10px]">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-slate-700 dark:text-white/80 truncate">
                                        {inv.nroControl || `#${inv.id.slice(0, 6)}`}
                                      </p>
                                      <p className="text-[9px] text-slate-400 tabular-nums">
                                        {inv.date} · saldo ${remaining.toFixed(2)}
                                      </p>
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={remaining}
                                      value={v}
                                      onChange={e => setAllocInputs(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                      placeholder="0.00"
                                      className="w-16 px-1.5 py-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 text-[10px] font-bold text-right tabular-nums outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                );
                              })}
                              <div className="border-t border-indigo-200 dark:border-indigo-500/20 mt-1 pt-1 flex items-center justify-between text-[10px]">
                                <span className="text-slate-500 dark:text-white/50">Distribuido:</span>
                                <span className="font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                                  ${Object.values(allocInputs).reduce((s, v) => s + (parseFloat(String(v).replace(',', '.')) || 0), 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                          <p className="text-[9px] text-slate-400 mt-1">
                            Si dejas vacío, el sistema usa <span className="font-bold">FIFO</span> (paga las más viejas primero).
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { setShowAbonoForm(false); setAbonoFeedback(null); }}
                          disabled={submittingAbono}
                          className="flex-1 px-2 py-2 rounded-md bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white/70 text-[10px] font-black uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-white/20 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAbonoSubmit}
                          disabled={submittingAbono || !abonoAmount}
                          className="flex-[2] px-2 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          {submittingAbono ? 'Registrando...' : (<><CheckCircle2 size={12} /> Registrar abono</>)}
                        </button>
                      </div>
                    </div>
                  )}

                  {abonoFeedback && (
                    <div className={`mt-2 text-[10px] font-bold px-2 py-1.5 rounded-md ${
                      abonoFeedback.ok
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200'
                    }`}>
                      {abonoFeedback.msg}
                    </div>
                  )}
                </div>
              )}

              {/* Mini stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-white/[0.06] p-3 rounded-xl border border-slate-100 dark:border-white/[0.1] shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 mb-1 tracking-widest">Items</p>
                  <p className="text-xl font-black text-slate-800 dark:text-white">{items.reduce((a, i) => a + i.qty, 0)}</p>
                </div>
                <div className="bg-white dark:bg-white/[0.06] p-3 rounded-xl border border-slate-100 dark:border-white/[0.1] shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 mb-1 tracking-widest">Total Bs</p>
                  <p className="text-xl font-black text-slate-800 dark:text-white truncate">
                    {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Total + pay button */}
            <div className="w-full sm:w-[38%] bg-slate-900 rounded-2xl sm:rounded-[1.8rem] p-4 sm:p-6 flex flex-col justify-between shadow-2xl text-white relative overflow-hidden shrink-0">
              <div className="absolute -right-8 -top-8 h-36 w-36 bg-white dark:bg-slate-900/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Total a Pagar</p>
                {totals.taxUsd > 0 && (
                  <div className="mt-2 space-y-0.5 mb-1">
                    <div className="flex justify-between text-[10px] font-bold text-white/50">
                      <span>Base</span>
                      <span>${totals.subtotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-sky-400">
                      <span>IVA</span>
                      <span>+${totals.taxUsd.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* ── Descuento ── */}
                <div className="mt-2 flex items-center gap-1.5">
                  <Tag size={11} className="text-white/40 shrink-0" />
                  <HelpTooltip
                    title="Descuento"
                    text="Aplica un descuento a toda la venta. Elige % para porcentaje o $ para monto fijo en dólares. El descuento se resta del total antes de cobrar."
                    side="right"
                  />
                  <select
                    value={discountType}
                    onChange={e => setDiscount(e.target.value as DiscountType, discountValue)}
                    className="flex-1 bg-white/[0.08] text-white text-[9px] font-black rounded-lg px-2 py-1 border border-white/10 appearance-none cursor-pointer"
                  >
                    <option value="none" className="text-slate-900">Sin descuento</option>
                    <option value="percent" className="text-slate-900">Descuento %</option>
                    <option value="fixed" className="text-slate-900">Descuento $</option>
                  </select>
                  {discountType !== 'none' && (
                    <input
                      type="number" min="0" step="any"
                      value={discountValue || ''}
                      onChange={e => setDiscount(discountType, parseFloat(e.target.value) || 0)}
                      placeholder={discountType === 'percent' ? '%' : '$'}
                      className="w-16 bg-white/[0.08] text-white text-[10px] font-black rounded-lg px-2 py-1 border border-white/10 text-center"
                    />
                  )}
                </div>
                {totals.discountUsd > 0 && (
                  <div className="flex justify-between text-[10px] font-black text-emerald-400 mt-1">
                    <span>Descuento</span>
                    <span>-${totals.discountUsd.toFixed(2)}</span>
                  </div>
                )}

                <div className="text-2xl sm:text-4xl font-black tracking-tight flex items-start gap-1 mt-1">
                  <span className="text-base sm:text-xl mt-0.5 opacity-40">$</span>
                  {totals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-baseline justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Bs</span>
                  <span className="text-lg sm:text-2xl font-black text-white/80 tracking-tight">
                    {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} <span className="text-sm sm:text-base text-white/40">Bs</span>
                  </span>
                </div>
              </div>

              <button
                disabled={!canCharge}
                onClick={() => setShowPaymentModal(true)}
                data-tour="pos-pay"
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all ${canCharge ? 'bg-white text-slate-900 hover:bg-emerald-400 hover:text-white shadow-xl hover:scale-[1.02]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                <Receipt size={16} />Cobrar
              </button>
              {/* Botón Crédito: solo cuando hay cliente seleccionado (consumidor final no aplica) */}
              {(() => {
                const canCredit = items.length > 0 && !!customer && !consumidorFinal;
                const reasonDisabled = items.length === 0
                  ? 'Agrega productos al carrito'
                  : consumidorFinal
                    ? 'Quita "Consumidor Final" y elige un cliente'
                    : !customer
                      ? 'Selecciona un cliente para vender a crédito'
                      : '';
                return (
                  <button
                    disabled={!canCredit}
                    onClick={() => setShowCreditModal(true)}
                    data-tour="pos-credit"
                    title={canCredit ? 'Vender a crédito (genera factura en CxC)' : reasonDisabled}
                    className={`w-full mt-2 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all ${canCredit ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-500/40' : 'bg-white/[0.03] text-white/20 cursor-not-allowed border border-white/[0.06]'}`}
                  >
                    <CreditCard size={13} />
                    {canCredit ? 'Crédito' : `Crédito · ${reasonDisabled}`}
                  </button>
                );
              })()}
              {creditFeedback && (
                <div className={`mt-2 text-[10px] font-bold px-3 py-2 rounded-lg ${creditFeedback.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
                  {creditFeedback.msg}
                </div>
              )}
              {items.length > 0 && (
                <button
                  onClick={holdCart}
                  className="w-full mt-2 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 text-white/50 hover:text-white hover:bg-white/10 transition-all border border-white/10"
                >
                  <Pause size={13} /> Poner en Espera
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── MOBILE BOTTOM TAB BAR ─────────────────────────────────────────── */}
      <div className="lg:hidden h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 flex shrink-0 z-20">
        <button
          onClick={() => setMobileTab('products')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${mobileTab === 'products' ? 'text-slate-900 dark:text-white bg-slate-50 dark:bg-white/[0.05]' : 'text-slate-400'}`}
        >
          <Package size={18} />
          Productos
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all relative ${mobileTab === 'cart' ? 'text-slate-900 dark:text-white bg-slate-50 dark:bg-white/[0.05]' : 'text-slate-400'}`}
        >
          <ShoppingCart size={18} />
          Carrito
          {items.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
              {items.reduce((a, i) => a + i.qty, 0)}
            </span>
          )}
        </button>
      </div>

      {/* ── PAYMENT MODAL ──────────────────────────────────────────────────── */}
      {showPaymentModal && (
        <PaymentModal
          subtotalUsd={totals.subtotalUsd}
          taxUsd={totals.taxUsd}
          discountUsd={totals.discountUsd}
          totalUsd={totals.totalUsd}
          totalBs={totals.totalBs}
          rateValue={rateValue}
          igtfEnabled={fiscalConfig.igtfEnabled}
          igtfRate={fiscalConfig.igtfRate}
          loading={paymentLoading}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleCharge}
        />
      )}

      {/* ── CREDIT SALE MODAL — venta a crédito (factura abierta en CxC) ─────── */}
      {/* ── HOTKEYS MODAL — onboarding/configuración ─────────────────────── */}
      {showHotkeysModal && cajaId && (
        <HotkeysModal
          cajaId={cajaId}
          initial={hotkeys}
          isOnboarding={hotkeysOnboarding}
          onSaved={(next) => setHotkeys(next)}
          onClose={() => { setShowHotkeysModal(false); setHotkeysOnboarding(false); }}
        />
      )}

      {/* ── NEW CLIENT MODAL — crear cliente sin salir del POS ─────────────── */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowNewClientModal(false); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-md flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                  <User size={16} className="text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nuevo cliente</h3>
                  <p className="text-[11px] text-slate-500 dark:text-white/50">Se selecciona automáticamente al crearlo</p>
                </div>
              </div>
              <button onClick={() => setShowNewClientModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Nombre completo *</label>
                <input
                  autoFocus
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Cédula / RIF</label>
                  <input
                    value={newClientCedula}
                    onChange={e => setNewClientCedula(e.target.value)}
                    placeholder="V-12345678"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-mono text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Teléfono</label>
                  <input
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(e.target.value)}
                    placeholder="+58 412..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              {newClientError && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs p-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {newClientError}
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-white/40">
                Después podrás completar más datos desde <span className="font-bold">Deudores / CxC</span>.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
              <button
                onClick={() => setShowNewClientModal(false)}
                disabled={creatingClient}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creatingClient || newClientName.trim().length < 2}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {creatingClient ? 'Creando…' : (<><CheckCircle2 size={12} /> Crear y seleccionar</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreditModal && customer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreditModal(false); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-md flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <CreditCard size={16} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Venta a crédito</h3>
                  <p className="text-[11px] text-slate-500 dark:text-white/50">Genera factura abierta en CxC del cliente</p>
                </div>
              </div>
              <button onClick={() => setShowCreditModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Cliente</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{customer.fullName || customer.nombre}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Total</p>
                  <p className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">${totals.totalUsd.toFixed(2)}</p>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Días de crédito</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[15, 30, 45, 60, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => setCreditDays(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${creditDays === d ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-white/70 hover:bg-amber-100 dark:hover:bg-amber-500/20'}`}
                    >
                      {d}d
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0"
                    value={creditDays}
                    onChange={e => setCreditDays(parseInt(e.target.value) || 0)}
                    className="w-20 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold tabular-nums text-right outline-none focus:border-amber-400"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Vence el <span className="font-bold tabular-nums text-slate-600 dark:text-white/60">
                    {new Date(Date.now() + creditDays * 86400000).toISOString().slice(0, 10)}
                  </span>
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1">Nota (opcional)</label>
                <input
                  value={creditNote}
                  onChange={e => setCreditNote(e.target.value)}
                  placeholder="Ej: pedido para boda, paga el sábado"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm outline-none focus:border-amber-400"
                />
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>El stock se descuenta inmediatamente. La factura queda <span className="font-bold">PENDIENTE</span> en CxC hasta que el cliente abone.</span>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
              <button
                onClick={() => setShowCreditModal(false)}
                disabled={submittingCredit}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreditSale}
                disabled={submittingCredit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {submittingCredit ? 'Generando…' : (<><CheckCircle2 size={12} /> Confirmar crédito</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT MODAL ──────────────────────────────────────────────────── */}
      {lastMovement && (
        <ReceiptModal
          movement={lastMovement}
          config={{ companyName: userProfile?.fullName || 'Mi Negocio', ticketFooter } as any}
          customerPhone={!consumidorFinal ? (customer?.telefono || customer?.phone || '') : ''}
          onClose={() => setLastMovement(null)}
        />
      )}

      {/* ── CAMERA SCANNER MODAL ───────────────────────────────────────────── */}
      {showCameraScanner && (
        <BarcodeScannerModal
          onScan={handleCameraScan}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* ── HISTORY PANEL ──────────────────────────────────────────────────── */}
      {showHistory && (
        <SaleHistoryPanel
          tenantId={empresa_id!}
          cajaId={cajaId}
          accentColor="slate"
          readOnly={userProfile?.role !== 'owner' && userProfile?.role !== 'admin'}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── VARIANT PICKER (Fase 9.4) ───────────────────────────────────── */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setVariantPickerProduct(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.07]">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white">{variantPickerProduct.name}</h3>
                <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">Selecciona una variante</p>
              </div>
              <button onClick={() => setVariantPickerProduct(null)} className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-3 space-y-1.5">
              {(variantPickerProduct.variants || []).map(v => {
                const label = Object.values(v.values).filter(Boolean).join(' / ');
                const varPrice = v.precioDetal ?? variantPickerProduct.price;
                const outOfStock = (v.stock || 0) <= 0;
                return (
                  <button
                    key={v.id}
                    disabled={outOfStock}
                    onClick={() => handleAddVariant(variantPickerProduct, v)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                      outOfStock
                        ? 'border-slate-100 dark:border-white/[0.05] opacity-40 cursor-not-allowed'
                        : 'border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/[0.06]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 dark:text-white">{label || v.sku || 'Sin nombre'}</p>
                      <p className="text-[9px] text-slate-400 dark:text-white/30 mt-0.5">
                        SKU: {v.sku || '—'} · Stock: {v.stock || 0}
                      </p>
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0 ml-3">
                      ${varPrice.toFixed(2)}
                    </span>
                  </button>
                );
              })}
              {(variantPickerProduct.variants || []).length === 0 && (
                <p className="text-center text-xs text-slate-400 dark:text-white/30 py-6">Sin variantes configuradas</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VENTAS EN ESPERA PANEL ─────────────────────────────────────────── */}
      {showHeld && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setShowHeld(false)} />
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 h-full flex flex-col shadow-2xl shadow-black/30 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-white/[0.07]">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Pause size={16} /> Ventas en Espera
                </h2>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{heldCarts.length} carrito{heldCarts.length !== 1 ? 's' : ''} guardado{heldCarts.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowHeld(false)} className="h-9 w-9 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-3">
              {heldCarts.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-12 font-bold">No hay ventas en espera.</p>
              ) : heldCarts.map(held => (
                <div key={held.id} className="bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-white/[0.07] rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                        {held.consumidorFinal ? 'Consumidor Final' : held.customer?.fullName || held.customer?.nombre || 'Sin cliente'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {held.items.length} producto{held.items.length !== 1 ? 's' : ''} · <span className="font-black text-slate-700 dark:text-slate-300">${held.items.reduce((s, i) => s + i.qty * i.priceUsd, 0).toFixed(2)}</span>
                      </p>
                      <p className="text-[9px] text-slate-300 mt-0.5 flex items-center gap-1">
                        <Clock size={9} />
                        En espera desde {held.heldAt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => restoreHeldCart(held)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-xl text-[10px] font-black uppercase transition-all"
                      >
                        <Play size={11} /> Retomar
                      </button>
                      <button
                        onClick={() => setHeldCarts(prev => prev.filter(h => h.id !== held.id))}
                        className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl text-[10px] font-black uppercase transition-all"
                      >
                        <X size={11} /> Descartar
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-50 dark:border-white/[0.05] space-y-1">
                    {held.items.slice(0, 3).map(item => (
                      <div key={item.id} className="flex justify-between text-[10px] text-slate-500">
                        <span className="truncate flex-1">{item.nombre}</span>
                        <span className="font-black ml-2 shrink-0">x{item.qty} · ${(item.qty * item.priceUsd).toFixed(2)}</span>
                      </div>
                    ))}
                    {held.items.length > 3 && (
                      <p className="text-[9px] text-slate-300">+{held.items.length - 3} más...</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating kiosk exit button */}
      {isKiosk && (
        <button
          onClick={toggleKiosk}
          className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 backdrop-blur text-white text-[10px] font-black uppercase tracking-wider shadow-lg hover:bg-black/90 transition-all"
          title="Salir de pantalla completa"
        >
          <Minimize2 size={12} />
          Salir (Esc)
        </button>
      )}
    </div>
  );
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export default function PosDetal() {
  const kioskCtx = useContext(PosKioskContext);

  // Kiosk mode: KioskGate already provides TenantProvider + CartProvider + PosKioskContext
  if (kioskCtx) {
    return <PosContent />;
  }

  // Normal mode: TenantGuard already provides TenantProvider, PosLayout provides CartProvider
  return <CartProvider><PosContent /></CartProvider>;
}
