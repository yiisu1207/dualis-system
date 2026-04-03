import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';

// ─── KIOSK CONTEXT (import from PosDetal) ────────────────────────────────────
import { PosKioskContext } from './PosDetal';
import { useCart, CartProvider, DiscountType, CartItem } from '../../context/CartContext';
import { useRates } from '../../context/RatesContext';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc,
  increment, getDoc, runTransaction, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { TenantProvider } from '../../context/TenantContext';
import {
  Scan, ShoppingCart, Search, Trash2, Plus, Minus, Receipt,
  Package, CheckCircle2, AlertTriangle, LogOut, X, Banknote,
  Smartphone, Layers, ArrowLeftRight, User, Clock, Camera, History,
  Tag, MessageCircle, Printer, WifiOff, Pause, Play, CreditCard, Truck, ClipboardList,
} from 'lucide-react';
import ReceiptModal from '../../components/ReceiptModal';
import NDEReceiptModal from '../../components/NDEReceiptModal';
import { getNextNroControl } from '../../utils/facturaUtils';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import SaleHistoryPanel from '../../components/SaleHistoryPanel';
import HelpTooltip from '../../components/HelpTooltip';
import { auth } from '../../firebase/config';
// Dynamic pricing imports removed — prices come directly from product fields per account type

// ─── TYPES ────────────────────────────────────────────────────────────────────
type AccountType = string; // 'BCV' or any customRate.id (dynamic)

type QuickProduct = {
  id: string;
  name: string;
  price: number;
  precioDetal: number;
  preciosCuenta: Record<string, number>;
  stock: number;
  codigo: string;
  marca?: string;
  tipoTasa?: string;
  costoUSD?: number;
  margenMayor?: number;
  margenDetal?: number;
};

type PaymentMethod = 'efectivo_usd' | 'efectivo_bs' | 'transferencia' | 'pago_movil' | 'punto' | 'mixto';

type PaymentCondition = 'contado' | string; // dynamic: 'contado' | '<days>d'

type HeldCart = {
  id: string;
  items: CartItem[];
  customer: any;
  consumidorFinal: boolean;
  discountType: DiscountType;
  discountValue: number;
  paymentCondition: PaymentCondition;
  accountType: AccountType;
  heldAt: Date;
};

// Métodos de pago permitidos cuando la cuenta no tiene tasa (solo USD)
const DIVISA_METHODS = new Set<PaymentMethod>(['efectivo_usd', 'mixto']);

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

// Payment periods — read from localStorage (set by Configuración → Períodos de Pago)
// Falls back to classic hardcoded periods if not configured
interface PaymentPeriodCfg { days: number; label: string; discountPercent: number; }
const DEFAULT_PERIODS: PaymentPeriodCfg[] = [
  { days: 0,  label: 'Contado',   discountPercent: 0 },
  { days: 15, label: 'Crédito 15d', discountPercent: 2 },
  { days: 30, label: 'Crédito 30d', discountPercent: 0 },
  { days: 45, label: 'Crédito 45d', discountPercent: 0 },
];
function loadPaymentPeriods(): PaymentPeriodCfg[] {
  try {
    const raw = localStorage.getItem('payment_periods');
    if (raw) {
      const parsed = JSON.parse(raw) as PaymentPeriodCfg[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return [{ days: 0, label: 'Contado', discountPercent: 0 }, ...parsed];
      }
    }
  } catch {}
  return DEFAULT_PERIODS;
}

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
  isDivisaMode?: boolean;
  onConfirm: (method: PaymentMethod, cashGiven: number, reference: string, mixCash: number, mixTransfer: number, igtfAmount: number) => void;
  onClose: () => void;
  loading: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ subtotalUsd, taxUsd, discountUsd, totalUsd, totalBs, rateValue, igtfEnabled, igtfRate, isDivisaMode, onConfirm, onClose, loading }) => {
  const [method, setMethod] = useState<PaymentMethod>('efectivo_usd');

  // Filter available methods: DIVISA = USD-only (no Bs methods)
  const availableMethods = isDivisaMode
    ? (Object.keys(METHOD_LABELS) as PaymentMethod[]).filter(m => DIVISA_METHODS.has(m) || m === 'transferencia')
    : (Object.keys(METHOD_LABELS) as PaymentMethod[]);
  const [cashInput, setCashInput] = useState('');
  const [reference, setReference] = useState('');
  const [mixCash, setMixCash] = useState('');
  const [mixTransfer, setMixTransfer] = useState('');

  // ── IGTF ──────────────────────────────────────────────────────────────────
  const igtfApplies  = igtfEnabled && IGTF_METHODS.has(method);
  const igtfAmount   = igtfApplies ? parseFloat((totalUsd * (igtfRate / 100)).toFixed(2)) : 0;
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
        <div className="p-6 bg-violet-900 text-white flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/60">Total a cobrar</p>
            {(igtfApplies || taxUsd > 0 || discountUsd > 0) ? (
              <div className="mt-2 space-y-1.5">
                {taxUsd > 0 && (
                  <>
                    <div className="flex justify-between items-center text-[11px] font-bold text-violet-300/60">
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
                    {!isDivisaMode && (
                      <p className="text-xs font-bold text-violet-300/60 mt-0.5">
                        {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                      </p>
                    )}
                  </div>
                )}
                {igtfApplies && (
                  <>
                    {(taxUsd > 0 || discountUsd > 0) && (
                      <div className="flex justify-between items-center text-[11px] font-bold text-violet-200">
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
                      {!isDivisaMode && (
                        <p className="text-xs font-bold text-violet-300/60 mt-0.5">
                          {grandBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="text-4xl font-black tracking-tight mt-1">
                  ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                {!isDivisaMode && (
                  <p className="text-sm font-bold text-violet-300/60 mt-0.5">
                    {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                  </p>
                )}
              </>
            )}
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Method selector */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Método de Pago</p>
            <div className="grid grid-cols-3 gap-2">
              {availableMethods.map(m => (
                <button key={m} onClick={() => { setMethod(m); setCashInput(''); setReference(''); }}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all text-center ${method === m ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:border-slate-200 dark:hover:border-white/[0.15]'}`}>
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
                <input autoFocus type="number" min="0" step="0.01"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder={`Mínimo: $${grandUsd.toFixed(2)}`}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-lg font-black focus:ring-2 focus:ring-violet-600 focus:border-violet-600 outline-none transition-all text-slate-900 dark:text-white"
                />
              </div>
              {cashVal > 0 && (
                <div className={`p-4 rounded-xl flex justify-between items-center transition-all ${missingUsd > 0.001 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className={missingUsd > 0.001 ? 'text-rose-400' : 'text-emerald-600'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {changeUsd > 0.001 ? 'Cambio a entregar' : isPaidExact ? 'Pago exacto' : 'Faltan'}
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
                <input autoFocus type="number" min="0" step="0.01"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder={`Mínimo: ${totalBs.toFixed(2)} Bs`}
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-lg font-black focus:ring-2 focus:ring-violet-600 focus:border-violet-600 outline-none transition-all text-slate-900 dark:text-white"
                />
              </div>
              {cashVal > 0 && (
                <div className={`p-4 rounded-xl flex justify-between items-center transition-all ${missingBs > 0.001 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className={missingBs > 0.001 ? 'text-rose-400' : 'text-emerald-600'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {changeBs > 0.001 ? 'Cambio a entregar' : isPaidExact ? 'Pago exacto' : 'Faltan'}
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
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-violet-600 focus:border-violet-600 outline-none transition-all text-slate-900 dark:text-white"
              />
            </div>
          )}

          {/* Mixto */}
          {method === 'mixto' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Efectivo (USD)</label>
                <input autoFocus type="number" min="0" step="0.01"
                  value={mixCash}
                  onChange={e => setMixCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-violet-600 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Transferencia (USD)</label>
                <input type="number" min="0" step="0.01"
                  value={mixTransfer}
                  onChange={e => setMixTransfer(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-violet-600 outline-none transition-all"
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
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${canConfirm && !loading ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-xl shadow-violet-500/25' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-300 cursor-not-allowed'}`}>
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
  const params = useParams();
  const empresa_id = kioskCtx?.businessId ?? params.empresa_id ?? '';
  const cajaId = kioskCtx?.cajaId ?? searchParams.get('cajaId');
  const urlToken = kioskCtx?.token ?? searchParams.get('token');
  const { userProfile } = useAuth();
  const { rates, customRates, zoherEnabled } = useRates();
  const { canAccess } = useSubscription(empresa_id);
  const hasDynamicPricing = canAccess('precios_dinamicos');

  const { items, addProductByCode, updateQty, updateItemPrices, removeItem, totals, rateValue, setRateValue, clearCart, discountType, discountValue, setDiscount, startedAt, loadCart } = useCart();

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
  const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'noStock'>('all');
  const [loading, setLoading] = useState(true);

  // Client
  const [clientQuery, setClientQuery] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [consumidorFinal, setConsumidorFinal] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Payment periods (dynamic from config)
  const [paymentPeriods] = useState<PaymentPeriodCfg[]>(loadPaymentPeriods);

  // Payment condition — now identified by days (0 = contado)
  const [paymentDays, setPaymentDays] = useState<number>(0);
  const paymentCondition: PaymentCondition = paymentDays === 0 ? 'contado' : `credito${paymentDays}`;
  const setPaymentCondition = (cond: PaymentCondition) => {
    if (cond === 'contado') { setPaymentDays(0); return; }
    const match = cond.match(/credito(\d+)/);
    if (match) { setPaymentDays(parseInt(match[1])); return; }
    setPaymentDays(0);
  };

  // Account type (BCV / GRUPO / DIVISA)
  const [accountType, setAccountType] = useState<AccountType>('BCV');
  // showAccountConfirm removed — account changes now reprice cart instead of clearing
  const [creditLimitError, setCreditLimitError] = useState('');
  const [customerCreditInfo, setCustomerCreditInfo] = useState<{ totalDebt: number; creditLimit: number } | null>(null);

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

  // Terminal info
  const [terminalInfo, setTerminalInfo] = useState<{ nombre: string; cajeroNombre: string } | null>(null);

  // Almacenes
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; activo: boolean }[]>([]);
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string>('principal');

  // NDE (Nota de Entrega) mode
  const [ndeConfig, setNdeConfig] = useState<{ enabled: boolean; defaultMode: boolean; showLogo?: boolean; showPoweredBy?: boolean; footerMessage?: string }>({ enabled: false, defaultMode: false, showLogo: true, showPoweredBy: true });
  const [commissions, setCommissions] = useState<{ enabled: boolean; perBulto: number; target: string; splitVendedor?: number; splitAlmacenista?: number }>({ enabled: false, perBulto: 0, target: 'vendedor' });
  const [modoNDE, setModoNDE] = useState(false);
  const [itemBultos, setItemBultos] = useState<Record<string, number>>({});
  const [lastNDE, setLastNDE] = useState<any>(null);

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Sync rate based on account type (dynamic from customRates)
  useEffect(() => {
    if (accountType === 'BCV') {
      if (rates.tasaBCV > 0) setRateValue(rates.tasaBCV);
    } else {
      const cr = customRates.find(r => r.id === accountType);
      if (cr && cr.value > 0) setRateValue(cr.value);
      else if (rates.tasaBCV > 0) setRateValue(rates.tasaBCV);
    }
  }, [accountType, rates.tasaBCV, customRates, setRateValue]);

  // Map accountType → CartContext priceTier
  const priceTierForAccount = (acct: AccountType) => {
    if (acct === 'BCV') return 'bcv' as const;
    return acct.toLowerCase() as any;
  };
  const currentPriceTier = priceTierForAccount(accountType);

  // Whether current account has NO rate (fixed price in USD only)
  const accountRate = accountType === 'BCV' ? rates.tasaBCV : (customRates.find(r => r.id === accountType)?.value || 0);
  const isDivisa = accountRate === 0;

  // Load terminal info
  useEffect(() => {
    if (!cajaId || !empresa_id) return;
    getDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId)).then(snap => {
      if (snap.exists()) setTerminalInfo(snap.data() as any);
    });
  }, [cajaId, empresa_id]);

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

  // Load businessConfigs (NDE config + commissions) in real-time
  useEffect(() => {
    if (!empresa_id) return;
    const unsub = onSnapshot(doc(db, 'businessConfigs', empresa_id), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.ndeConfig) {
        setNdeConfig(prev => ({ ...prev, ...data.ndeConfig }));
        if (data.ndeConfig.defaultMode) setModoNDE(true);
      }
      if (data.commissions) setCommissions(data.commissions);
    }, () => {});
    return () => unsub();
  }, [empresa_id]);

  // Load products + clients
  useEffect(() => {
    if (!empresa_id) return;
    const loadData = async () => {
      try {
        const qp = query(collection(db, `businesses/${empresa_id}/products`));
        const snap = await getDocs(qp);
        setProducts(snap.docs
          .filter(d => d.data().status !== 'pending_review')
          .map(d => {
          const data = d.data();
          const mayorPrice = Number(data.precioMayor || data.wholesalePrice || 0);
          // Merge legacy fields into preciosCuenta
          const pc: Record<string, number> = data.preciosCuenta || {};
          if (data.precioBCV && !pc.BCV) pc.BCV = Number(data.precioBCV);
          if (data.precioGrupo && !pc.GRUPO) pc.GRUPO = Number(data.precioGrupo);
          if (data.precioDivisa && !pc.DIVISA) pc.DIVISA = Number(data.precioDivisa);
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          const almacenStock = stockByAlmacen[selectedAlmacenId] ?? Number(data.stock || 0);
          return {
            id: d.id,
            name: data.name || data.nombre || 'Sin nombre',
            price: mayorPrice,
            precioDetal: Number(data.precioDetal || data.marketPrice || data.precioVenta || data.price || 0),
            preciosCuenta: pc,
            stock: almacenStock,
            codigo: data.codigo || d.id,
            marca: data.marca || '',
            tipoTasa: data.tipoTasa || 'BCV',
            costoUSD: Number(data.costoUSD || 0),
            margenMayor: Number(data.margenMayor || 0),
            margenDetal: Number(data.margenDetal || 0),
          };
        }));

        const qc = query(collection(db, 'customers'), where('businessId', '==', empresa_id));
        const snapC = await getDocs(qc);
        setClients(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setError('Error cargando datos'); }
      finally { setLoading(false); }
    };
    loadData();
  }, [empresa_id]);

  const filteredClients = useMemo(() => {
    const term = clientQuery.toLowerCase();
    if (!term) return [];
    return clients.filter(c =>
      (c.fullName || c.nombre || '').toLowerCase().includes(term) ||
      (c.rif || c.cedula || '').toLowerCase().includes(term)
    );
  }, [clientQuery, clients]);

  const displayProducts = useMemo(() => {
    let filtered = products;
    if (stockFilter === 'inStock') filtered = filtered.filter(p => p.stock > 0);
    if (stockFilter === 'noStock') filtered = filtered.filter(p => p.stock === 0);
    const q = (productFilter || searchQuery).trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.marca || '').toLowerCase().includes(q)
    );
  }, [products, productFilter, searchQuery, stockFilter]);

  const noStockCount = useMemo(() => products.filter(p => p.stock === 0).length, [products]);

  // Credit mode: force consumidorFinal off when credit is selected
  const isCredit = paymentCondition !== 'contado';
  useEffect(() => {
    if (isCredit && consumidorFinal) {
      setConsumidorFinal(false);
    }
  }, [isCredit, consumidorFinal]);

  // Proactively compute credit info when customer is selected for credit sale
  useEffect(() => {
    if (!customer || !isCredit) {
      setCustomerCreditInfo(null);
      return;
    }
    const limit = Number(customer.creditLimit || 0);
    if (limit <= 0) {
      setCustomerCreditInfo(null);
      return;
    }
    // Query movements to calculate current debt
    (async () => {
      try {
        const { getDocs, query, collection, where } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        const movQ = query(
          collection(db, 'movements'),
          where('businessId', '==', empresa_id),
          where('entityId', '==', customer.id),
        );
        const snap = await getDocs(movQ);
        let totalDebt = 0;
        snap.docs.forEach(d => {
          const m = d.data();
          if (m.anulada) return;
          if (m.movementType === 'FACTURA' && !m.pagado) {
            totalDebt += Number(m.amountInUSD || m.amount || 0);
          } else if (m.movementType === 'ABONO') {
            totalDebt -= Number(m.amountInUSD || m.amount || 0);
          }
        });
        setCustomerCreditInfo({ totalDebt: Math.max(0, totalDebt), creditLimit: limit });
      } catch {
        setCustomerCreditInfo(null);
      }
    })();
  }, [customer, isCredit, empresa_id]);

  const handleAddProduct = useCallback(async (product: QuickProduct) => {
    // Use the price for the current account type
    const price = product.preciosCuenta[accountType] || product.price;
    const priceOverride = price > 0 ? price : undefined;

    const ok = await addProductByCode(product.codigo, currentPriceTier, priceOverride);
    if (!ok) {
      setError(`Producto no encontrado: ${product.name}`);
      setTimeout(() => setError(''), 3000);
    }
  }, [addProductByCode, currentPriceTier, accountType]);

  const handleScan = async () => {
    const code = searchQuery.trim();
    if (!code) return;
    const ok = await addProductByCode(code, currentPriceTier);
    if (ok) {
      setSearchQuery('');
    } else {
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2000);
    }
  };

  const handleCameraScan = async (code: string) => {
    setShowCameraScanner(false);
    const ok = await addProductByCode(code, currentPriceTier);
    if (ok) {
      setSuccess(`Escaneado: ${code}`);
      setTimeout(() => setSuccess(''), 2000);
    } else {
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2500);
    }
  };

  // Handle account type change — reprice cart items instead of clearing
  const handleAccountChange = useCallback((newAccount: AccountType) => {
    if (newAccount === accountType) return;
    setAccountType(newAccount);

    // Reprice existing cart items based on the new account's price tier
    if (items.length > 0 && products.length > 0) {
      const priceMap: Record<string, number> = {};
      for (const item of items) {
        const prod = products.find(p => p.id === item.id);
        if (!prod) continue;
        const price = prod.preciosCuenta[newAccount] || prod.price;
        if (price > 0) priceMap[item.id] = price;
      }
      if (Object.keys(priceMap).length > 0) updateItemPrices(priceMap);
    }
  }, [accountType, items, products, updateItemPrices]);

  const holdCart = useCallback(() => {
    if (items.length === 0) return;
    setHeldCarts(prev => [...prev, {
      id: crypto.randomUUID(),
      items: [...items],
      customer,
      consumidorFinal,
      discountType,
      discountValue,
      paymentCondition,
      accountType,
      heldAt: new Date(),
    }]);
    clearCart();
    setCustomer(null);
    setClientQuery('');
    setConsumidorFinal(false);
    setPaymentCondition('contado');
  }, [items, customer, consumidorFinal, discountType, discountValue, paymentCondition, accountType, clearCart]);

  const restoreHeldCart = useCallback((held: HeldCart) => {
    loadCart(held.items, held.discountType, held.discountValue);
    setCustomer(held.customer);
    setConsumidorFinal(held.consumidorFinal);
    setPaymentCondition(held.paymentCondition);
    setAccountType(held.accountType);
    if (held.customer) setClientQuery(held.customer.fullName || held.customer.nombre || '');
    setHeldCarts(prev => prev.filter(h => h.id !== held.id));
    setShowHeld(false);
  }, [loadCart]);

  // ── CHARGE: contado sale (via payment modal) ──────────────────────────────
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
        concept: `Venta POS Mayor — ${entityLabel}`,
        amount: grandTotal,
        originalAmount: isDivisa ? null : grandTotalBs,
        amountInUSD: grandTotal,
        subtotalUSD: totals.subtotalUsd,
        ivaAmount:      totals.taxUsd      > 0 ? totals.taxUsd      : null,
        discountAmount: totals.discountUsd > 0 ? totals.discountUsd : null,
        igtfAmount:     igtfAmount         > 0 ? igtfAmount         : null,
        igtfRate:       igtfAmount         > 0 ? fiscalConfig.igtfRate / 100 : null,
        currency: isDivisa ? 'USD' : 'USD',
        date: simpleDate,
        createdAt: isoDate,
        movementType: 'FACTURA',
        accountType,
        rateUsed: isDivisa ? null : rateValue,
        metodoPago: METHOD_LABELS[method],
        esPagoMixto: method === 'mixto',
        pagos,
        referencia: reference || null,
        cashGiven: cashGiven || null,
        changeUsd: changeUsd || null,
        changeBs: isDivisa ? null : (changeBs || null),
        mixCash: method === 'mixto' ? mixCash : null,
        mixTransfer: method === 'mixto' ? mixTransfer : null,
        items: items.map(i => ({ id: i.id, nombre: i.nombre, qty: i.qty, price: i.priceUsd, subtotal: i.qty * i.priceUsd })),
        cajaId: cajaId || 'principal',
        cajaName: terminalLabel,
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        startedAt: startedAt?.toISOString() || isoDate,
        paymentCondition: 'contado',
        pagado: true,
        estadoPago: 'PAGADO',
        esVentaContado: true,
        // NDE fields
        ...(modoNDE && {
          esNotaEntrega: true,
          estadoNDE: 'pendiente_despacho',
          almacenId: selectedAlmacenId,
          bultos: totalBultos,
          comisionVendedor: calcComisionVendedor(totalBultos),
        }),
      };

      await addDoc(collection(db, 'movements'), movementPayload);

      // Update stock — floor at 0, never negative
      const almacenKey = almacenes.length > 0 ? selectedAlmacenId : 'principal';
      for (const item of items) {
        await runTransaction(db, async (txn) => {
          const ref = doc(db, `businesses/${empresa_id}/products`, item.id);
          const snap = await txn.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          if (stockByAlmacen[almacenKey] !== undefined) {
            const curAlmacen = Number(stockByAlmacen[almacenKey] ?? 0);
            const curTotal = Number(data.stock ?? 0);
            txn.update(ref, {
              [`stockByAlmacen.${almacenKey}`]: Math.max(0, curAlmacen - item.qty),
              stock: Math.max(0, curTotal - item.qty),
            });
          } else {
            const cur = Number(data.stock ?? 0);
            txn.update(ref, { stock: Math.max(0, cur - item.qty) });
          }
        });
      }

      // Update terminal stats
      if (cajaId) {
        await updateDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId), {
          totalFacturado: increment(grandTotal),
          movimientos: increment(1),
          ultimaVenta: isoDate,
        });
      }

      if (modoNDE) {
        setLastNDE(movementPayload);
      } else {
        setLastMovement(movementPayload);
      }
      clearCart();
      setItemBultos({});
      setCustomer(null);
      setClientQuery('');
      setConsumidorFinal(false);
      setPaymentCondition('contado');
      setShowPaymentModal(false);
      setSuccess(modoNDE ? 'Nota de Entrega generada!' : 'Venta registrada!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      console.error(err);
      setError('Error al procesar la venta');
      setTimeout(() => setError(''), 3000);
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── CREDIT SALE: no payment modal ─────────────────────────────────────────
  const handleCreditSale = async () => {
    if (!customer || consumidorFinal) return;
    setPaymentLoading(true);
    setCreditLimitError('');
    try {
      // ── CREDIT LIMIT VALIDATION ──────────────────────────────────────
      const creditLimit = Number(customer.creditLimit || 0);
      if (creditLimit > 0) {
        // Query ALL unpaid FACTURAs for this customer (global, all accounts)
        const movQ = query(
          collection(db, 'movements'),
          where('businessId', '==', empresa_id),
          where('entityId', '==', customer.id),
        );
        const movSnap = await getDocs(movQ);
        let totalDebt = 0;
        movSnap.docs.forEach(d => {
          const m = d.data();
          if (m.anulada) return;
          if (m.movementType === 'FACTURA' && !m.pagado) {
            totalDebt += Number(m.amountInUSD || m.amount || 0);
          } else if (m.movementType === 'ABONO') {
            totalDebt -= Number(m.amountInUSD || m.amount || 0);
          }
        });
        totalDebt = Math.max(0, totalDebt);
        if (totalDebt + totals.totalUsd > creditLimit) {
          setCreditLimitError(
            `Límite de crédito excedido. Límite: $${creditLimit.toFixed(2)} · Deuda actual: $${totalDebt.toFixed(2)} · Esta venta: $${totals.totalUsd.toFixed(2)}`
          );
          setPaymentLoading(false);
          return;
        }
      }

      const now = new Date();
      const isoDate = now.toISOString();
      const simpleDate = isoDate.split('T')[0];

      const entityId = customer.id;
      const entityLabel = customer.fullName || customer.nombre || 'Cliente';

      const { formatted: nroControl } = await getNextNroControl(empresa_id, cajaId || undefined);

      const movementPayload: any = {
        businessId: empresa_id,
        nroControl,
        entityId,
        concept: `Venta POS Mayor — ${entityLabel}`,
        amount: totals.totalUsd,
        originalAmount: isDivisa ? null : totals.totalBs,
        amountInUSD: totals.totalUsd,
        subtotalUSD: totals.subtotalUsd,
        ivaAmount:      totals.taxUsd      > 0 ? totals.taxUsd      : null,
        discountAmount: totals.discountUsd > 0 ? totals.discountUsd : null,
        igtfAmount:     null,
        igtfRate:       null,
        currency: 'USD',
        date: simpleDate,
        createdAt: isoDate,
        movementType: 'FACTURA',
        accountType,
        rateUsed: isDivisa ? null : rateValue,
        metodoPago: 'Crédito',
        esPagoMixto: false,
        pagos: {},
        referencia: null,
        cashGiven: null,
        changeUsd: null,
        changeBs: null,
        mixCash: null,
        mixTransfer: null,
        items: items.map(i => ({ id: i.id, nombre: i.nombre, qty: i.qty, price: i.priceUsd, subtotal: i.qty * i.priceUsd })),
        cajaId: cajaId || 'principal',
        cajaName: terminalLabel,
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        startedAt: startedAt?.toISOString() || isoDate,
        paymentCondition,
        // Dynamic payment period fields
        ...(paymentDays > 0 && (() => {
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + paymentDays);
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const activePeriod = paymentPeriods.find(p => p.days === paymentDays);
          const discountPct = activePeriod?.discountPercent ?? 0;
          const discountAmt = discountPct > 0 ? parseFloat((totals.totalUsd * discountPct / 100).toFixed(2)) : 0;
          return {
            paymentDays,
            dueDate: dueDateStr,
            earlyPayDiscountPct:    discountPct > 0 ? discountPct : null,
            earlyPayDiscountExpiry: discountPct > 0 ? dueDateStr  : null,
            earlyPayDiscountAmt:    discountAmt > 0 ? discountAmt : null,
          };
        })()),
        pagado: false,
        estadoPago: 'PENDIENTE',
        esVentaContado: false,
        // NDE fields
        ...(modoNDE && {
          esNotaEntrega: true,
          estadoNDE: 'pendiente_despacho',
          almacenId: selectedAlmacenId,
          bultos: totalBultos,
          comisionVendedor: calcComisionVendedor(totalBultos),
        }),
      };

      await addDoc(collection(db, 'movements'), movementPayload);

      // Update stock — floor at 0, never negative (NDE reserves stock immediately)
      const almacenKey = almacenes.length > 0 ? selectedAlmacenId : 'principal';
      for (const item of items) {
        await runTransaction(db, async (txn) => {
          const ref = doc(db, `businesses/${empresa_id}/products`, item.id);
          const snap = await txn.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const stockByAlmacen: Record<string, number> = data.stockByAlmacen || {};
          if (stockByAlmacen[almacenKey] !== undefined) {
            const curAlmacen = Number(stockByAlmacen[almacenKey] ?? 0);
            const curTotal = Number(data.stock ?? 0);
            txn.update(ref, {
              [`stockByAlmacen.${almacenKey}`]: Math.max(0, curAlmacen - item.qty),
              stock: Math.max(0, curTotal - item.qty),
            });
          } else {
            const cur = Number(data.stock ?? 0);
            txn.update(ref, { stock: Math.max(0, cur - item.qty) });
          }
        });
      }

      // Update terminal stats
      if (cajaId) {
        await updateDoc(doc(db, `businesses/${empresa_id}/terminals`, cajaId), {
          totalFacturado: increment(totals.totalUsd),
          movimientos: increment(1),
          ultimaVenta: isoDate,
        });
      }

      if (modoNDE) {
        setLastNDE(movementPayload);
      } else {
        setLastMovement(movementPayload);
      }
      clearCart();
      setItemBultos({});
      setCustomer(null);
      setClientQuery('');
      setConsumidorFinal(false);
      setPaymentCondition('contado');
      setSuccess(modoNDE ? 'Nota de Entrega (crédito) generada!' : 'Venta a crédito registrada!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      console.error(err);
      setError('Error al procesar la venta a crédito');
      setTimeout(() => setError(''), 3000);
    } finally {
      setPaymentLoading(false);
    }
  };

  const totalBultos = useMemo(() => Object.values(itemBultos).reduce((s: number, v: number) => s + (v || 0), 0), [itemBultos]);

  const calcComisionVendedor = (bultos: number): number => {
    if (!commissions.enabled || !bultos) return 0;
    if (commissions.target === 'almacenista') return 0;
    const base = bultos * commissions.perBulto;
    return commissions.target === 'both' ? base * ((commissions.splitVendedor ?? 50) / 100) : base;
  };

  const canChargeContado = items.length > 0 && (!!customer || consumidorFinal);
  const canChargeCredit  = items.length > 0 && !!customer && !consumidorFinal && isCredit;
  const cajeroLabel = terminalInfo?.cajeroNombre || userProfile?.fullName || 'Vendedor';
  const terminalLabel = terminalInfo?.nombre || cajaId || 'PRINCIPAL';

  // Token validation: block access without valid kiosk token
  if (tokenValid === null) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#070b14] gap-4">
        <div className="animate-spin h-9 w-9 border-4 border-violet-500 border-t-transparent rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Validando acceso...</p>
      </div>
    );
  }
  if (!tokenValid) return <AccessDenied />;

  if (loading && products.length === 0) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 gap-4">
        <div className="animate-spin h-9 w-9 border-4 border-violet-600 border-t-transparent rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Cargando Terminal...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-inter">

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <header className="h-14 sm:h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 shadow-sm gap-2 sm:gap-4">
        {/* Left: terminal info */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-md shadow-violet-500/25">
            <Scan size={17} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
              POS MAYOR
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
          <div className="relative flex-1">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
              placeholder="Buscar por nombre, código o escanear..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-100 dark:bg-white/[0.07] border-none rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-violet-600 focus:bg-white dark:bg-slate-800/50transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          </div>
          {fiscalConfig.scannerEnabled && (
            <HelpTooltip title="Escanear código de barras" text="Abre la cámara para leer el código de barras de un producto y añadirlo automáticamente al carrito." side="bottom">
              <button
                onClick={() => setShowCameraScanner(true)}
                className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-violet-600 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
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
              className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-violet-600 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
            >
              <History size={16} />
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

          {/* Date + time */}
          <div className="text-right hidden lg:block">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">{formatLiveDate(now)}</p>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{formatLiveTime(now)}</p>
          </div>

          {/* Rate cards */}
          <div className="hidden lg:flex items-center gap-1.5">
            <div className={`px-2.5 py-1 rounded-lg border text-center ${accountType === 'BCV' ? 'bg-sky-500/10 border-sky-500/30' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <p className="text-[7px] font-black uppercase text-sky-400">BCV</p>
              <p className="text-[11px] font-black font-mono text-white">{rates.tasaBCV.toFixed(2)}</p>
            </div>
            {hasDynamicPricing && customRates.filter(r => r.enabled && r.value > 0).map(r => (
              <div key={r.id} className={`px-2.5 py-1 rounded-lg border text-center ${accountType === r.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-white/[0.07]'}`}>
                <p className="text-[7px] font-black uppercase text-amber-400">{r.name || r.id}</p>
                <p className="text-[11px] font-black font-mono text-white">{r.value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Account badge */}
          {hasDynamicPricing && customRates.length > 0 && (
          <div className={`hidden sm:flex lg:hidden items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${accountType === 'BCV' ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/20' : 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/20'}`}>
            {accountType === 'BCV' ? 'BCV' : (customRates.find(r => r.id === accountType)?.name || accountType)}
          </div>
          )}

          {/* Rate */}
          {!isDivisa && (
            <div className="text-right hidden sm:block lg:hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">
                {accountType === 'BCV' ? 'BCV' : (customRates.find(r => r.id === accountType)?.name || accountType)}
              </p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{rateValue.toFixed(2)} Bs</p>
            </div>
          )}
          {isDivisa && (
            <div className="text-right hidden sm:block lg:hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">USD ONLY</p>
              <p className="text-sm font-black text-emerald-500">$$$</p>
            </div>
          )}

          {/* Almacén selector — only shown when 2+ almacenes */}
          {almacenes.length >= 2 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Layers size={11} className="text-violet-400 shrink-0" />
              <select value={selectedAlmacenId} onChange={e => setSelectedAlmacenId(e.target.value)}
                className="text-[9px] font-black uppercase tracking-wider bg-transparent border-none text-violet-300 outline-none cursor-pointer max-w-[100px]">
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          )}

          {/* NDE mode toggle */}
          {ndeConfig.enabled && (
            <button
              onClick={() => setModoNDE(v => !v)}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${modoNDE ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/[0.04] border-white/10 text-slate-400 hover:border-white/20'}`}
              title={modoNDE ? 'Modo Nota de Entrega activo' : 'Activar modo Nota de Entrega'}
            >
              <Truck size={11} />
              {modoNDE ? 'Modo NDE' : 'Cobro Directo'}
            </button>
          )}

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
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-100 dark:border-white/[0.07] focus:ring-2 focus:ring-violet-600 focus:bg-white dark:bg-slate-800/50outline-none transition-all"
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
                {(['all', 'inStock', 'noStock'] as const).map(f => (
                  <button key={f} onClick={() => setStockFilter(f)}
                    className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${stockFilter === f ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    {f === 'all' ? 'Todos' : f === 'inStock' ? 'Con Stock' : `Sin Stock (${noStockCount})`}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-bold text-slate-300 shrink-0">{displayProducts.length}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 custom-scroll">
            {displayProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                <Package size={40} className="text-slate-300 mb-3" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {displayProducts.map(product => {
                  const displayPrice = product.preciosCuenta[accountType] || product.price;

                  return (
                    <button key={product.id} onClick={() => handleAddProduct(product)}
                      className={`group bg-white dark:bg-white/[0.05] p-3 rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left flex flex-col h-28 justify-between ${product.stock === 0 ? 'border-amber-200 dark:border-amber-500/25' : 'border-slate-100 dark:border-white/[0.1] hover:border-violet-300 dark:hover:border-violet-500/40'}`}>
                      <div>
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-white/[0.08] text-slate-400 dark:text-slate-300 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors">
                            <Package size={12} />
                          </div>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${product.stock === 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15' : 'text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.08]'}`}>
                            {product.stock === 0 ? 'AGOTADO' : product.stock}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-700 dark:text-white/90 line-clamp-2 leading-tight">{product.name}</p>
                        {product.marca && <p className="text-[9px] font-black text-violet-400 dark:text-violet-300 uppercase mt-0.5">{product.marca}</p>}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-sm font-black text-violet-600 dark:text-violet-400">
                          ${(displayPrice || 0).toFixed(2)}
                        </p>
                        {product.precioDetal > 0 && displayPrice !== product.precioDetal && (
                          <p className="text-[9px] font-bold text-slate-400 dark:text-white/30 line-through">${product.precioDetal.toFixed(2)}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT: CART + CHECKOUT ─────────────────────────────────────────── */}
        <aside className={`${mobileTab === 'cart' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 bg-white dark:bg-slate-900`}>

          {/* Cart items table */}
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 shadow-sm">
                <tr>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07]">Producto</th>
                  <th className="px-2 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-center">Cant.</th>
                  {modoNDE && <th className="px-2 sm:px-3 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-center text-amber-400">Bultos</th>}
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right hidden sm:table-cell">P/U</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right">Total</th>
                  <th className="px-2 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 dark:border-white/[0.07] w-8 sm:w-auto" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={modoNDE ? 6 : 5} className="px-5 py-16 sm:py-24 text-center pointer-events-none select-none">
                      <div className="inline-flex h-14 w-14 sm:h-16 sm:w-16 rounded-3xl bg-slate-50 dark:bg-slate-800/50 items-center justify-center mb-3 sm:mb-4">
                        <ShoppingCart size={24} className="text-slate-300 sm:hidden" />
                        <ShoppingCart size={28} className="text-slate-300 hidden sm:block" />
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-slate-300 dark:text-white/20 uppercase tracking-widest mb-1">Carrito Vacío</h3>
                      <p className="text-[10px] sm:text-xs text-slate-300 dark:text-white/15 font-medium">Escanea un código o selecciona un producto</p>
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] group transition-colors">
                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                      <p className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 leading-none line-clamp-1">{item.nombre}</p>
                      <p className="text-[9px] sm:text-[10px] font-mono text-slate-400 dark:text-white/30 mt-0.5">
                        <span className="sm:hidden">${item.priceUsd.toFixed(2)} · </span>{item.codigo}
                      </p>
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
                            className="w-16 text-center text-sm font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.07] rounded-lg border border-slate-200 dark:border-white/[0.08] outline-none focus:ring-2 focus:ring-violet-400/20 py-1"
                          />
                          <span className="text-[9px] font-bold text-slate-400 dark:text-white/30 uppercase">{item.unitType}</span>
                        </div>
                      ) : (
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        <button onClick={() => updateQty(item.id, item.qty - 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors">
                          <Minus size={12} strokeWidth={3} />
                        </button>
                        <span className="w-5 text-center text-sm font-black text-slate-900 dark:text-white">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors">
                          <Plus size={12} strokeWidth={3} />
                        </button>
                      </div>
                      )}
                    </td>
                    {modoNDE && (
                      <td className="px-2 sm:px-3 py-2.5 sm:py-3.5">
                        <input
                          type="number" min="0" step="1"
                          value={itemBultos[item.id] ?? 0}
                          onChange={e => setItemBultos(prev => ({ ...prev, [item.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-12 text-center bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs font-black text-amber-300 outline-none focus:ring-1 focus:ring-amber-500 py-1"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-slate-500 dark:text-white/50 hidden sm:table-cell">
                      ${item.priceUsd.toFixed(2)}
                    </td>
                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right text-sm sm:text-base font-black text-slate-900 dark:text-white">
                      ${(item.qty * item.priceUsd).toFixed(2)}
                    </td>
                    <td className="px-2 sm:px-5 py-2.5 sm:py-3.5 text-center">
                      <button onClick={() => removeItem(item.id)}
                        className="h-7 w-7 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── CHECKOUT PANEL ─────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-slate-900 p-3 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-5">

            {/* Client section */}
            <div className="flex-1 space-y-3 min-w-0">

              {/* Account Type Selector — dynamic from customRates */}
              {hasDynamicPricing && customRates.filter(r => r.enabled).length > 0 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-2 block">Tipo de Cuenta</label>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl p-1 border border-slate-200 dark:border-white/[0.08]">
                  <button onClick={() => handleAccountChange('BCV')}
                    className={`flex-1 px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center ${accountType === 'BCV' ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white/70'}`}>
                    BCV
                  </button>
                  {customRates.filter(r => r.enabled).map(rate => (
                    <button key={rate.id} onClick={() => handleAccountChange(rate.id)}
                      className={`flex-1 px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center ${accountType === rate.id ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white/70'}`}>
                      {rate.name}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Payment Condition Selector — dynamic from config.paymentPeriods */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-2 block">Condición de Pago</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {paymentPeriods.map(period => {
                    const isActive = paymentDays === period.days;
                    return (
                      <button
                        key={period.days}
                        onClick={() => setPaymentDays(period.days)}
                        className={`flex flex-col items-center px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                          isActive
                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/25 border-transparent'
                            : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/[0.08] hover:border-violet-400/50'
                        }`}
                      >
                        <span>{period.label}</span>
                        {period.discountPercent > 0 && (
                          <span className={`text-[8px] font-bold mt-0.5 ${isActive ? 'text-violet-200' : 'text-emerald-500'}`}>
                            -{period.discountPercent}% desc.
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Discount preview */}
                {paymentDays > 0 && (() => {
                  const period = paymentPeriods.find(p => p.days === paymentDays);
                  if (!period || period.discountPercent <= 0) return null;
                  const dueDate = new Date();
                  dueDate.setDate(dueDate.getDate() + paymentDays);
                  const discountAmt = (totals.totalUsd * period.discountPercent / 100).toFixed(2);
                  return (
                    <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                      <p className="text-[10px] font-bold text-emerald-400">
                        Paga antes del {dueDate.toLocaleDateString('es-VE')} y ahorra ${discountAmt}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Consumidor Final toggle — hidden for credit */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest">Cliente</label>
                {!isCredit && (
                  <button
                    onClick={() => { setConsumidorFinal(!consumidorFinal); setCustomer(null); setClientQuery(''); }}
                    className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-all border ${consumidorFinal ? 'bg-sky-500 text-white border-sky-500' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15'}`}>
                    <User size={10} />
                    Cons. Final
                  </button>
                )}
                {isCredit && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 px-2.5 py-1.5">
                    Requiere cliente registrado
                  </span>
                )}
              </div>

              {consumidorFinal && !isCredit ? (
                <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-sky-500 text-white flex items-center justify-center font-black text-sm shrink-0">CF</div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white">Consumidor Final</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-sky-300/70 uppercase">Venta sin cliente registrado</p>
                  </div>
                </div>
              ) : !customer ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                    <input
                      value={clientQuery}
                      onChange={e => setClientQuery(e.target.value)}
                      placeholder="Buscar cliente (nombre, RIF, cédula)..."
                      className="w-full pl-9 pr-4 py-3 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:ring-2 focus:ring-violet-600 dark:focus:ring-violet-500 outline-none shadow-sm transition-all"
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
                  <button onClick={() => setShowNewClientModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-violet-500/30 text-[10px] font-black uppercase tracking-wider text-violet-400 hover:bg-violet-500/10 transition-all">
                    <Plus size={12} /> Nuevo cliente
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
                  <div className="h-9 w-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-black text-sm shrink-0">
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

              {/* Mini stats */}
              <div className={`grid ${isDivisa ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                <div className="bg-white dark:bg-white/[0.06] p-3 rounded-xl border border-slate-100 dark:border-white/[0.1] shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 mb-1 tracking-widest">Items</p>
                  <p className="text-xl font-black text-slate-800 dark:text-white">{items.reduce((a, i) => a + i.qty, 0)}</p>
                </div>
                {!isDivisa && (
                  <div className="bg-white dark:bg-white/[0.06] p-3 rounded-xl border border-slate-100 dark:border-white/[0.1] shadow-sm">
                    <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/40 mb-1 tracking-widest">Total Bs</p>
                    <p className="text-xl font-black text-slate-800 dark:text-white truncate">
                      {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
              </div>

              {/* Credit info display (proactive) */}
              {customerCreditInfo && isCredit && (
                <div className={`rounded-xl p-3.5 border shadow-sm ${
                  (customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100 > 90
                    ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
                    : (customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100 > 70
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Crédito Disponible</p>
                    <span className={`text-base font-black font-mono ${
                      customerCreditInfo.creditLimit - customerCreditInfo.totalDebt <= 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      ${Math.max(0, customerCreditInfo.creditLimit - customerCreditInfo.totalDebt).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                    <span>Deuda: ${customerCreditInfo.totalDebt.toFixed(2)}</span>
                    <span>Límite: ${customerCreditInfo.creditLimit.toFixed(2)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-white/[0.1] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100 > 90
                          ? 'bg-rose-500'
                          : (customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100 > 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 mt-1 text-right">
                    {((customerCreditInfo.totalDebt / customerCreditInfo.creditLimit) * 100).toFixed(0)}% utilizado
                  </p>
                </div>
              )}

              {/* Credit limit error */}
              {creditLimitError && (
                <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl p-3.5 flex items-start gap-3">
                  <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-rose-600 dark:text-rose-400">Crédito bloqueado</p>
                    <p className="text-[10px] font-bold text-rose-500/80 dark:text-rose-300/70 mt-0.5">{creditLimitError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Total + pay button */}
            <div className="w-full sm:w-[38%] bg-gradient-to-br from-violet-900 to-purple-900 rounded-2xl sm:rounded-[1.8rem] p-4 sm:p-6 flex flex-col justify-between shadow-2xl shadow-violet-900/40 text-white relative overflow-hidden shrink-0">
              <div className="absolute -right-8 -top-8 h-36 w-36 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Total a Pagar</p>
                  {isCredit && (
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-amber-400/20 text-amber-300 rounded-lg">
                      {paymentPeriods.find(p => p.days === paymentDays)?.label ?? paymentCondition}
                    </span>
                  )}
                </div>
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
                {!isDivisa && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-baseline justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Bs</span>
                    <span className="text-lg sm:text-2xl font-black text-white/80 tracking-tight">
                      {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} <span className="text-sm sm:text-base text-white/40">Bs</span>
                    </span>
                  </div>
                )}
                {isDivisa && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70 px-2 py-1 bg-emerald-500/10 rounded-lg">Solo USD</span>
                  </div>
                )}
              </div>

              {/* NDE mode indicator */}
              {modoNDE && (
                <div className="rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 mb-1">
                  <Truck size={12} className="text-amber-400 shrink-0" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Modo Nota de Entrega</p>
                    {totalBultos > 0 && <p className="text-[9px] text-amber-300/70">{totalBultos} bulto{totalBultos !== 1 ? 's' : ''} · Stock se reserva ahora</p>}
                  </div>
                </div>
              )}

              {/* Action buttons: Cobrar (contado) or Registrar Crédito */}
              {isCredit ? (
                <button
                  disabled={!canChargeCredit || paymentLoading}
                  onClick={handleCreditSale}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all ${canChargeCredit && !paymentLoading ? (modoNDE ? 'bg-amber-400 text-slate-900 hover:bg-amber-300 shadow-xl hover:scale-[1.02]' : 'bg-white text-violet-900 hover:bg-amber-400 hover:text-slate-900 shadow-xl hover:scale-[1.02]') : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                  {paymentLoading ? 'Procesando...' : modoNDE ? <><ClipboardList size={16} />Generar NDE a Crédito</> : <><CreditCard size={16} />Registrar Venta a Crédito</>}
                </button>
              ) : (
                <button
                  disabled={!canChargeContado}
                  onClick={() => setShowPaymentModal(true)}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all ${canChargeContado ? (modoNDE ? 'bg-amber-400 text-slate-900 hover:bg-amber-300 shadow-xl hover:scale-[1.02]' : 'bg-white text-violet-900 hover:bg-emerald-400 hover:text-white shadow-xl hover:scale-[1.02]') : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                  {modoNDE ? <><ClipboardList size={16} />Generar NDE</> : <><Receipt size={16} />Cobrar</>}
                </button>
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
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all ${mobileTab === 'products' ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/[0.08]' : 'text-slate-400'}`}
        >
          <Package size={18} />
          Productos
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all relative ${mobileTab === 'cart' ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/[0.08]' : 'text-slate-400'}`}
        >
          <ShoppingCart size={18} />
          Carrito
          {items.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-18px)] w-4 h-4 bg-violet-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
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
          isDivisaMode={isDivisa}
          loading={paymentLoading}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleCharge}
        />
      )}

      {/* ── RECEIPT MODAL ──────────────────────────────────────────────────── */}
      {lastMovement && (
        <ReceiptModal
          movement={lastMovement}
          config={{ companyName: userProfile?.fullName || 'Mi Negocio' } as any}
          customerPhone={!consumidorFinal ? (customer?.telefono || customer?.phone || '') : ''}
          onClose={() => setLastMovement(null)}
        />
      )}

      {/* ── NDE RECEIPT MODAL ──────────────────────────────────────────────── */}
      {lastNDE && (
        <NDEReceiptModal
          movement={lastNDE}
          businessId={empresa_id}
          customerPhone={customer?.telefono || customer?.phone || ''}
          ndeConfig={ndeConfig}
          onClose={() => setLastNDE(null)}
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
          accentColor="violet"
          readOnly={userProfile?.role !== 'owner' && userProfile?.role !== 'admin'}
          onClose={() => setShowHistory(false)}
        />
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[9px] text-slate-300 flex items-center gap-1">
                          <Clock size={9} />
                          En espera desde {held.heldAt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${held.accountType === 'BCV' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'}`}>
                          {held.accountType === 'BCV' ? 'BCV' : (customRates.find(r => r.id === held.accountType)?.name || held.accountType)}
                        </span>
                        {held.paymentCondition !== 'contado' && (
                          <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 rounded">
                            {held.paymentCondition === 'contado' ? 'Contado' : held.paymentCondition}
                          </span>
                        )}
                      </div>
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

      {/* Account change confirmation removed — now reprices cart instead */}

      {/* ── NEW CLIENT MODAL ───────────────────────────────────────────────── */}
      {showNewClientModal && (
        <NewClientModal
          businessId={empresa_id!}
          onClose={() => setShowNewClientModal(false)}
          onCreated={(newClient) => {
            setClients(prev => [...prev, newClient]);
            setCustomer(newClient);
            setShowNewClientModal(false);
          }}
        />
      )}
    </div>
  );
};

// ─── NEW CLIENT MODAL ─────────────────────────────────────────────────────────
function NewClientModal({ businessId, onClose, onCreated }: {
  businessId: string;
  onClose: () => void;
  onCreated: (customer: any) => void;
}) {
  const [tipoDoc, setTipoDoc] = useState('V');
  const [cedula, setCedula] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [telefono2, setTelefono2] = useState('');
  const [direccion, setDireccion] = useState('');
  const [email, setEmail] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, any> = {
        businessId,
        nombre: nombre.trim(),
        fullName: nombre.trim(),
        cedula: cedula ? `${tipoDoc}-${cedula.trim()}` : '',
        rif: cedula ? `${tipoDoc}-${cedula.trim()}` : '',
        telefono: telefono.trim(),
        telefono2: telefono2.trim(),
        direccion: direccion.trim(),
        email: email.trim(),
        creditLimit: Number(creditLimit) || 0,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, 'customers'), data);
      onCreated({ id: ref.id, ...data });
    } catch (err) {
      console.error('Error creating customer:', err);
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/25 focus:ring-2 focus:ring-violet-500 outline-none transition-all";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md bg-white dark:bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-slate-200 dark:border-white/[0.07] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <User size={15} className="text-violet-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-white">Nuevo Cliente</h3>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all">
            <X size={14} className="text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Nombre */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Nombre completo *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Nombre completo" className={inp} />
          </div>
          {/* Documento */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Documento</label>
            <div className="flex gap-2">
              <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}
                className="px-3 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] rounded-xl text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none w-20">
                <option value="V">V-</option>
                <option value="J">J-</option>
                <option value="E">E-</option>
                <option value="G">G-</option>
                <option value="P">P-</option>
              </select>
              <input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="12345678" className={`${inp} flex-1`} />
            </div>
          </div>
          {/* Teléfonos */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+584241234567" className={inp} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Teléfono 2</label>
              <input value={telefono2} onChange={e => setTelefono2(e.target.value)} placeholder="Opcional" className={inp} />
            </div>
          </div>
          {/* Dirección */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Dirección</label>
            <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección de entrega" className={inp} />
          </div>
          {/* Email + Crédito */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className={inp} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1 block">Límite crédito $</label>
              <input type="number" min="0" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="0.00" className={inp} />
            </div>
          </div>
        </form>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 text-xs font-bold hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button type="submit" form="new-client-form" onClick={handleSubmit as any} disabled={!nombre.trim() || saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25">
            {saving ? <span className="animate-spin">⏳</span> : <Plus size={13} />}
            Crear cliente
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export default function PosMayor() {
  const kioskCtx = useContext(PosKioskContext);

  // Kiosk mode: KioskGate already provides TenantProvider + CartProvider + PosKioskContext
  if (kioskCtx) {
    return <PosContent />;
  }

  // Normal mode: TenantGuard already provides TenantProvider, PosLayout provides CartProvider
  return <CartProvider><PosContent /></CartProvider>;
}
