import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useCart, CartProvider, DiscountType } from '../../context/CartContext';
import { useRates } from '../../context/RatesContext';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc,
  increment, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { TenantProvider } from '../../context/TenantContext';
import {
  Scan, ShoppingCart, Search, Trash2, Plus, Minus, Receipt,
  Package, CheckCircle2, AlertTriangle, LogOut, X, Banknote,
  Smartphone, Layers, ArrowLeftRight, User, Clock, Camera, History,
  Tag, MessageCircle, Printer, WifiOff,
} from 'lucide-react';
import ReceiptModal from '../../components/ReceiptModal';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import SaleHistoryPanel from '../../components/SaleHistoryPanel';
import { auth } from '../../firebase/config';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type QuickProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  codigo: string;
  marca?: string;
};

type PaymentMethod = 'efectivo_usd' | 'efectivo_bs' | 'transferencia' | 'mixto';

// ── IGTF (Impuesto a las Grandes Transacciones Financieras) ────────────────────
// Ley venezolana: 3 % sobre pagos en divisas o criptomonedas
const IGTF_RATE = 0.03;
const IGTF_METHODS = new Set<PaymentMethod>(['efectivo_usd', 'mixto']);

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
  efectivo_bs: 'Efectivo BS',
  transferencia: 'Transferencia / Pago Móvil',
  mixto: 'Mixto (Efectivo + Transf.)',
};
const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  efectivo_usd: <Banknote size={15} />,
  efectivo_bs: <Banknote size={15} />,
  transferencia: <Smartphone size={15} />,
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
    if (method === 'transferencia') return reference.trim().length > 0;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
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
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map(m => (
                <button key={m} onClick={() => { setMethod(m); setCashInput(''); setReference(''); }}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${method === m ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:border-slate-200 dark:border-white/10'}`}>
                  {METHOD_ICONS[m]}
                  <span className="text-left leading-tight">{METHOD_LABELS[m]}</span>
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
                <input autoFocus type="number" min="0" step="0.01"
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

          {/* Transferencia */}
          {method === 'transferencia' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Número de Referencia</label>
              <input autoFocus
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Ej. 00123456789"
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all"
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
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Transferencia (USD)</label>
                <input type="number" min="0" step="0.01"
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

// ─── POS CONTENT ──────────────────────────────────────────────────────────────
const PosContent = () => {
  const [searchParams] = useSearchParams();
  const { empresa_id } = useParams();
  const cajaId = searchParams.get('cajaId');
  const { userProfile } = useAuth();
  const { rates } = useRates();

  const { items, addProductByCode, updateQty, removeItem, totals, rateValue, setRateValue, clearCart, discountType, discountValue, setDiscount } = useCart();

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
  const [loading, setLoading] = useState(true);

  // Client
  const [clientQuery, setClientQuery] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [consumidorFinal, setConsumidorFinal] = useState(false);

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

  // Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Receipt
  const [lastMovement, setLastMovement] = useState<any>(null);

  // History panel
  const [showHistory, setShowHistory] = useState(false);

  // Terminal info
  const [terminalInfo, setTerminalInfo] = useState<{ nombre: string; cajeroNombre: string } | null>(null);

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
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

  // Load products + clients
  useEffect(() => {
    if (!empresa_id) return;
    const loadData = async () => {
      try {
        const qp = query(collection(db, `businesses/${empresa_id}/products`), where('stock', '>', 0));
        const snap = await getDocs(qp);
        setProducts(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.nombre || 'Sin nombre',
            price: Number(data.precioDetal || data.marketPrice || data.precioVenta || data.salePrice || data.price || 0),
            stock: Number(data.stock || 0),
            codigo: data.codigo || d.id,
            marca: data.marca || '',
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
    const q = (productFilter || searchQuery).trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.marca || '').toLowerCase().includes(q)
    );
  }, [products, productFilter, searchQuery]);

  const handleAddProduct = useCallback(async (product: QuickProduct) => {
    const ok = await addProductByCode(product.codigo, 'detal');
    if (!ok) {
      setError(`Sin stock: ${product.name}`);
      setTimeout(() => setError(''), 2000);
    }
  }, [addProductByCode]);

  const handleScan = async () => {
    const code = searchQuery.trim();
    if (!code) return;
    const ok = await addProductByCode(code, 'detal');
    if (ok) {
      setSearchQuery('');
    } else {
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2000);
    }
  };

  const handleCameraScan = async (code: string) => {
    setShowCameraScanner(false);
    const ok = await addProductByCode(code, 'detal');
    if (ok) {
      setSuccess(`Escaneado: ${code}`);
      setTimeout(() => setSuccess(''), 2000);
    } else {
      setError(`Código no encontrado: ${code}`);
      setTimeout(() => setError(''), 2500);
    }
  };

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

      const movementPayload: any = {
        businessId: empresa_id,
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
        referencia: reference || null,
        cashGiven: cashGiven || null,
        changeUsd: changeUsd || null,
        changeBs: changeBs || null,
        mixCash: method === 'mixto' ? mixCash : null,
        mixTransfer: method === 'mixto' ? mixTransfer : null,
        items: items.map(i => ({ id: i.id, nombre: i.nombre, qty: i.qty, price: i.priceUsd, subtotal: i.qty * i.priceUsd })),
        cajaId: cajaId || 'principal',
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
        // Venta Detal es siempre de contado — no genera CxC pendiente
        pagado: true,
        estadoPago: 'PAGADO',
        esVentaContado: true,
      };

      await addDoc(collection(db, 'movements'), movementPayload);

      // Update stock
      for (const item of items) {
        await updateDoc(doc(db, `businesses/${empresa_id}/products`, item.id), {
          stock: increment(-item.qty),
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

      setLastMovement(movementPayload);
      clearCart();
      setCustomer(null);
      setClientQuery('');
      setConsumidorFinal(false);
      setShowPaymentModal(false);
      setSuccess('¡Venta registrada!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      console.error(err);
      setError('Error al procesar la venta');
      setTimeout(() => setError(''), 3000);
    } finally {
      setPaymentLoading(false);
    }
  };

  const canCharge = items.length > 0 && (!!customer || consumidorFinal);
  const cajeroLabel = terminalInfo?.cajeroNombre || userProfile?.fullName || 'Vendedor';
  const terminalLabel = terminalInfo?.nombre || cajaId || 'PRINCIPAL';

  if (loading && products.length === 0) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 gap-4">
        <div className="animate-spin h-9 w-9 border-4 border-slate-900 border-t-transparent rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Cargando Terminal...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-inter">

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 px-5 flex items-center justify-between shrink-0 z-30 shadow-sm gap-4">
        {/* Left: terminal info */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
            <Scan size={19} />
          </div>
          <div>
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
        <div className="flex-1 max-w-xl flex items-center gap-2">
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
              className="w-full pl-11 pr-4 py-2.5 bg-slate-100 dark:bg-white/[0.07] border-none rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-slate-900 focus:bg-white dark:bg-slate-800 transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          </div>
          {fiscalConfig.scannerEnabled && (
            <button
              onClick={() => setShowCameraScanner(true)}
              title="Escanear con cámara"
              className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
            >
              <Camera size={16} />
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            title="Historial de ventas"
            className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all shrink-0 border border-slate-200 dark:border-white/10"
          >
            <History size={16} />
          </button>
        </div>

        {/* Right: date/time, rate, logout */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Notifications */}
          {success && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black">
              <CheckCircle2 size={13} />{success}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-black">
              <AlertTriangle size={13} />{error}
            </div>
          )}

          {/* Date + time */}
          <div className="text-right hidden lg:block">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">{formatLiveDate(now)}</p>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{formatLiveTime(now)}</p>
          </div>

          {/* Rate */}
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">BCV</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">{rates.tasaBCV.toFixed(2)} Bs</p>
          </div>

          <div className="w-px h-8 bg-slate-100 dark:bg-white/[0.07]" />

          <button
            onClick={() => auth.signOut()}
            className="h-9 w-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-rose-100"
            title="Cerrar Sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: PRODUCT GRID ─────────────────────────────────────────────── */}
        <section className="w-[35%] min-w-[280px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-white/[0.07] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.07]">
            <div className="relative">
              <input
                value={productFilter}
                onChange={e => setProductFilter(e.target.value)}
                placeholder="Filtrar productos..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-100 dark:border-white/[0.07] focus:ring-2 focus:ring-slate-900 focus:bg-white dark:bg-slate-800 outline-none transition-all"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              {productFilter && (
                <button onClick={() => setProductFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex justify-between items-center mt-2 px-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Acceso Rápido</span>
              <span className="text-[9px] font-bold text-slate-300">{displayProducts.length} productos</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 custom-scroll">
            {displayProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                <Package size={40} className="text-slate-300 mb-3" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
                {displayProducts.map(product => (
                  <button key={product.id} onClick={() => handleAddProduct(product)}
                    className="group bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-sm hover:shadow-md hover:border-slate-300 dark:border-white/15 hover:-translate-y-0.5 transition-all text-left flex flex-col h-28 justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                          <Package size={12} />
                        </div>
                        <span className="text-[9px] font-black text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-md">{product.stock}</span>
                      </div>
                      <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 line-clamp-2 leading-tight">{product.name}</p>
                      {product.marca && <p className="text-[8px] font-black text-indigo-400 uppercase mt-0.5">{product.marca}</p>}
                    </div>
                    <p className="text-sm font-black text-emerald-600">${product.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT: CART + CHECKOUT ─────────────────────────────────────────── */}
        <aside className="flex-1 flex flex-col bg-white dark:bg-slate-900">

          {/* Cart items table */}
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-sm">
                <tr>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07]">Producto</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-center">Cant.</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right">P/U</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] text-right">Total</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-24 text-center pointer-events-none select-none">
                      <div className="inline-flex h-16 w-16 rounded-3xl bg-slate-50 dark:bg-slate-800/50 items-center justify-center mb-4">
                        <ShoppingCart size={28} className="text-slate-300" />
                      </div>
                      <h3 className="text-base font-black text-slate-300 uppercase tracking-widest mb-1">Carrito Vacío</h3>
                      <p className="text-xs text-slate-300 font-medium">Escanea un código o selecciona un producto</p>
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] group transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-black text-slate-800 dark:text-slate-200 leading-none">{item.nombre}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{item.codigo}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
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
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-slate-500">
                      ${item.priceUsd.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-base font-black text-slate-900 dark:text-white">
                      ${(item.qty * item.priceUsd).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button onClick={() => removeItem(item.id)}
                        className="h-7 w-7 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── CHECKOUT PANEL ─────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-[#0d1424] p-5 flex gap-5">

            {/* Client section */}
            <div className="flex-1 space-y-3 min-w-0">
              {/* Consumidor Final toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente</label>
                <button
                  onClick={() => { setConsumidorFinal(!consumidorFinal); setCustomer(null); setClientQuery(''); }}
                  className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-all border ${consumidorFinal ? 'bg-sky-500 text-white border-sky-500' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/15'}`}>
                  <User size={10} />
                  Cons. Final
                </button>
              </div>

              {consumidorFinal ? (
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-sky-500 text-white flex items-center justify-center font-black text-sm shrink-0">CF</div>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-200">Consumidor Final</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Venta sin cliente registrado</p>
                  </div>
                </div>
              ) : !customer ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    value={clientQuery}
                    onChange={e => setClientQuery(e.target.value)}
                    placeholder="Buscar cliente (nombre, RIF, cédula)..."
                    className="w-full pl-9 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold focus:ring-2 focus:ring-slate-900 outline-none shadow-sm transition-all"
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
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
                  <div className="h-9 w-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {(customer.fullName || customer.nombre || 'C').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{customer.fullName || customer.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{customer.rif || customer.cedula || 'Consumidor Final'}</p>
                  </div>
                  <button onClick={() => { setCustomer(null); setClientQuery(''); }}
                    className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600 shrink-0">
                    Cambiar
                  </button>
                </div>
              )}

              {/* Mini stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-white/[0.07] shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-300 mb-1">Items</p>
                  <p className="text-xl font-black text-slate-800 dark:text-slate-200">{items.reduce((a, i) => a + i.qty, 0)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-white/[0.07] shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-300 mb-1">Total Bs</p>
                  <p className="text-xl font-black text-slate-800 dark:text-slate-200 truncate">
                    {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Total + pay button */}
            <div className="w-[38%] bg-slate-900 rounded-[1.8rem] p-6 flex flex-col justify-between shadow-2xl text-white relative overflow-hidden shrink-0">
              <div className="absolute -right-8 -top-8 h-36 w-36 bg-white dark:bg-slate-900/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total a Pagar</p>
                {totals.taxUsd > 0 && (
                  <div className="mt-2 space-y-0.5 mb-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
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
                  <Tag size={11} className="text-slate-500 shrink-0" />
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

                <div className="text-4xl font-black tracking-tight flex items-start gap-1 mt-1">
                  <span className="text-xl mt-0.5 opacity-40">$</span>
                  {totals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  {totals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                </p>
              </div>

              <button
                disabled={!canCharge}
                onClick={() => setShowPaymentModal(true)}
                className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all ${canCharge ? 'bg-white text-slate-900 hover:bg-emerald-400 hover:text-white shadow-xl hover:scale-[1.02]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                <Receipt size={15} />Cobrar
              </button>
            </div>
          </div>
        </aside>
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

      {/* ── RECEIPT MODAL ──────────────────────────────────────────────────── */}
      {lastMovement && (
        <ReceiptModal
          movement={lastMovement}
          config={{ companyName: userProfile?.fullName || 'Mi Negocio' } as any}
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
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export default function PosDetal() {
  const { empresa_id } = useParams();
  if (!empresa_id) {
    return <div className="h-screen flex items-center justify-center text-slate-400 font-black uppercase tracking-widest text-xs">Error: empresa no identificada.</div>;
  }
  return (
    <TenantProvider tenantId={empresa_id}>
      <CartProvider>
        <PosContent />
      </CartProvider>
    </TenantProvider>
  );
}
