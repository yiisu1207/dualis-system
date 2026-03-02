import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc, increment, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useTenant, TenantProvider } from '../../context/TenantContext';
import { useCart, CartProvider } from '../../context/CartContext';
import { useRates } from '../../context/RatesContext';
import { useAuth } from '../../context/AuthContext';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Factory, Search, ShoppingCart, Trash2, Plus, Minus, Receipt,
  Package, X, CheckCircle2, AlertTriangle, User, LogOut,
  Banknote, Smartphone, Layers, ArrowLeftRight, Calendar, Clock,
} from 'lucide-react';
import { auth } from '../../firebase/config';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type RateMode = 'bcv' | 'grupo' | 'divisas';

type QuickProduct = {
  id: string;
  name: string;
  price: number;
  priceDisplay: string;
  stock: number;
  codigo: string;
  marca?: string;
};

type ClientRecord = {
  id: string;
  rif: string;
  nombre: string;
  telefono: string;
  direccion: string;
};

type PaymentMethod = 'efectivo_usd' | 'transferencia' | 'credito';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatLiveDate(d: Date) {
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function formatLiveTime(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo_usd: 'Efectivo / Divisas',
  transferencia: 'Transferencia / Pago Móvil',
  credito: 'Crédito',
};

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
interface PaymentModalProps {
  totalUsd: number;
  totalBs: number;
  rateLabel: string;
  paymentCondition: string;
  loading: boolean;
  onConfirm: (method: PaymentMethod, reference: string) => void;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  totalUsd, totalBs, rateLabel, paymentCondition, loading, onConfirm, onClose,
}) => {
  const [method, setMethod] = useState<PaymentMethod>(
    paymentCondition !== 'contado' ? 'credito' : 'efectivo_usd'
  );
  const [cashInput, setCashInput] = useState('');
  const [reference, setReference] = useState('');

  const changeUsd = method === 'efectivo_usd'
    ? Math.max(0, parseFloat(cashInput || '0') - totalUsd) : 0;

  const canConfirm = (() => {
    if (method === 'efectivo_usd') return parseFloat(cashInput || '0') >= totalUsd;
    if (method === 'transferencia') return reference.trim().length > 0;
    if (method === 'credito') return true;
    return false;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 bg-violet-900 text-white flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Total del pedido</p>
            <p className="text-4xl font-black tracking-tight mt-1">
              ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm font-bold text-violet-300 mt-0.5">
              {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs · {rateLabel}
            </p>
          </div>
          <button onClick={onClose}
            className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Forma de Pago</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest transition-all ${method === m ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}>
                  {m === 'efectivo_usd' ? <Banknote size={18} /> : m === 'transferencia' ? <Smartphone size={18} /> : <Layers size={18} />}
                  <span className="text-center leading-tight">{PAYMENT_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>

          {method === 'efectivo_usd' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Monto Entregado (USD)</label>
                <input autoFocus type="number" min="0" step="0.01"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder={`Mínimo: $${totalUsd.toFixed(2)}`}
                  className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-lg font-black focus:ring-2 focus:ring-violet-700 focus:border-violet-700 outline-none transition-all"
                />
              </div>
              {parseFloat(cashInput || '0') > 0 && (
                <div className={`p-4 rounded-xl flex justify-between items-center ${changeUsd > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-100'}`}>
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className={changeUsd > 0 ? 'text-emerald-600' : 'text-rose-400'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {changeUsd > 0 ? 'Cambio a entregar' : 'Monto insuficiente'}
                    </span>
                  </div>
                  <span className={`text-lg font-black ${changeUsd > 0 ? 'text-emerald-700' : 'text-rose-500'}`}>
                    ${changeUsd.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {method === 'transferencia' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Número de Referencia</label>
              <input autoFocus value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Ej. 00123456789"
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-violet-700 focus:border-violet-700 outline-none transition-all"
              />
            </div>
          )}

          {method === 'credito' && (
            <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
              <p className="text-xs font-black text-violet-700">Condición: <span className="uppercase">{paymentCondition.replace('credito', 'Crédito ')}</span></p>
              <p className="text-[10px] text-violet-500 mt-1 font-medium">La factura quedará registrada como crédito pendiente.</p>
            </div>
          )}

          <button
            disabled={!canConfirm || loading}
            onClick={() => onConfirm(method, reference)}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${canConfirm && !loading ? 'bg-violet-700 text-white hover:bg-violet-800 shadow-xl shadow-violet-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
            {loading ? 'Procesando...' : <><Receipt size={16} />Registrar Pedido</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── POS MAYOR CONTENT ────────────────────────────────────────────────────────
const PosMayorContent = () => {
  const { tenantId } = useTenant();
  const [searchParams] = useSearchParams();
  const cajaId = searchParams.get('cajaId');
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const { items, addProductByCode, updateQty, removeItem, totals: cartTotals, setRateValue, rateValue, clearCart } = useCart();

  const [rateMode, setRateMode] = useState<RateMode>('bcv');
  const [paymentCondition, setPaymentCondition] = useState('contado');
  const [customer, setCustomer] = useState<ClientRecord | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [products, setProducts] = useState<QuickProduct[]>([]);
  const [productFilter, setProductFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showClientModal, setShowClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({ rif: '', nombre: '', telefono: '', direccion: '' });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [terminalInfo, setTerminalInfo] = useState<{ nombre: string; cajeroNombre: string } | null>(null);
  const [now, setNow] = useState(new Date());

  // Rate map from real Firebase data
  const rateValues = useMemo<Record<RateMode, number>>(() => ({
    bcv: rates.tasaBCV || 0,
    grupo: rates.tasaGrupo || rates.tasaBCV || 0,
    divisas: 0,
  }), [rates]);

  const rateModeLabel = useMemo(() => ({
    bcv: `BCV · ${(rates.tasaBCV || 0).toFixed(2)} Bs`,
    grupo: `Grupo · ${(rates.tasaGrupo || 0).toFixed(2)} Bs`,
    divisas: 'Divisas (USD)',
  }), [rates]);

  // Sync rate
  useEffect(() => {
    setRateValue(rateValues[rateMode]);
  }, [rateMode, rateValues, setRateValue]);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load terminal info
  useEffect(() => {
    if (!cajaId || !tenantId) return;
    getDoc(doc(db, `businesses/${tenantId}/terminals`, cajaId)).then(snap => {
      if (snap.exists()) setTerminalInfo(snap.data() as any);
    });
  }, [cajaId, tenantId]);

  // Load products
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      try {
        const q = query(collection(db, `businesses/${tenantId}/products`));
        const snap = await getDocs(q);
        setProducts(snap.docs.map(d => {
          const data = d.data();
          const price = Number(data.precioMayor || data.marketPrice || data.precioVenta || data.salePrice || data.price || 0);
          return {
            id: d.id,
            name: data.name || data.nombre || 'Producto sin nombre',
            price,
            priceDisplay: `$${price.toFixed(2)}`,
            stock: Number(data.stock || 0),
            codigo: data.codigo || d.id,
            marca: data.marca || '',
          };
        }));

        const qc = query(collection(db, 'customers'), where('businessId', '==', tenantId));
        const snapC = await getDocs(qc);
        setAllClients(snapC.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            rif: data.rif || '',
            nombre: data.nombre || data.fullName || '',
            telefono: data.telefono || '',
            direccion: data.direccion || '',
          };
        }));
      } catch { setError('Error cargando datos.'); }
      finally { setLoading(false); }
    };
    load();
  }, [tenantId]);

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim().toLowerCase();
    if (!term) return [];
    return allClients.filter(c =>
      (c.nombre || '').toLowerCase().includes(term) ||
      (c.rif || '').toLowerCase().includes(term)
    );
  }, [clientQuery, allClients]);

  const displayProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.marca || '').toLowerCase().includes(q)
    );
  }, [products, productFilter]);

  const handleScan = async () => {
    const code = searchQuery.trim();
    if (!code) return;
    const ok = await addProductByCode(code, 'mayor');
    if (ok) { setSearchQuery(''); }
    else {
      setError(`Producto no encontrado: ${code}`);
      setTimeout(() => setError(''), 2500);
    }
  };

  const handleAddProduct = useCallback(async (product: QuickProduct) => {
    const ok = await addProductByCode(product.codigo, 'mayor');
    if (!ok) {
      setError(`Sin stock o no encontrado: ${product.name}`);
      setTimeout(() => setError(''), 2500);
    }
  }, [addProductByCode]);

  const saveClient = async () => {
    if (!clientForm.nombre.trim() || !clientForm.rif.trim() || !tenantId) return;
    try {
      const ref = await addDoc(collection(db, 'customers'), {
        ...clientForm,
        businessId: tenantId,
        createdAt: new Date().toISOString(),
      });
      const newClient: ClientRecord = { id: ref.id, ...clientForm };
      setAllClients(prev => [newClient, ...prev]);
      setCustomer(newClient);
      setClientQuery('');
      setShowClientModal(false);
      setClientForm({ rif: '', nombre: '', telefono: '', direccion: '' });
      setSuccess('Cliente creado');
      setTimeout(() => setSuccess(''), 2000);
    } catch { setError('No se pudo guardar el cliente.'); }
  };

  const handleCharge = async (method: PaymentMethod, reference: string) => {
    if (!customer || items.length === 0) return;
    setPaymentLoading(true);
    try {
      const now = new Date();
      const isoDate = now.toISOString();

      const movementPayload: any = {
        businessId: tenantId,
        entityId: customer.id,
        concept: `Venta Mayor — ${customer.nombre}`,
        amount: cartTotals.totalUsd,
        amountInUSD: cartTotals.totalUsd,
        originalAmount: rateMode !== 'divisas' ? cartTotals.totalBs : cartTotals.totalUsd,
        currency: rateMode === 'divisas' ? 'USD' : 'BS',
        date: isoDate.split('T')[0],
        createdAt: isoDate,
        movementType: 'FACTURA',
        accountType: rateMode === 'bcv' ? 'BCV' : rateMode === 'grupo' ? 'GRUPO' : 'DIVISA',
        rateUsed: rateValue,
        metodoPago: PAYMENT_LABELS[method],
        referencia: reference || null,
        paymentCondition,
        items: items.map(i => ({ id: i.id, nombre: i.nombre, qty: i.qty, price: i.priceUsd, subtotal: i.qty * i.priceUsd })),
        cajaId: cajaId || 'principal',
        vendedorId: userProfile?.uid || 'sistema',
        vendedorNombre: userProfile?.fullName || 'Vendedor',
      };

      await addDoc(collection(db, 'movements'), movementPayload);

      // Descontar stock de cada producto vendido
      for (const item of items) {
        await updateDoc(doc(db, `businesses/${tenantId}/products`, item.id), {
          stock: increment(-item.qty),
        });
      }

      // Update terminal stats
      if (cajaId && tenantId) {
        await updateDoc(doc(db, `businesses/${tenantId}/terminals`, cajaId), {
          totalFacturado: increment(cartTotals.totalUsd),
          movimientos: increment(1),
          ultimaVenta: isoDate,
        });
      }

      clearCart();
      setCustomer(null);
      setClientQuery('');
      setShowPaymentModal(false);
      setSuccess('Pedido registrado correctamente');
      setTimeout(() => setSuccess(''), 3500);
    } catch { setError('Error al procesar el pedido'); }
    finally { setPaymentLoading(false); }
  };

  const cajeroLabel = terminalInfo?.cajeroNombre || userProfile?.fullName || 'Vendedor';
  const terminalLabel = terminalInfo?.nombre || cajaId || 'MAYOR';

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin h-9 w-9 border-4 border-violet-700 border-t-transparent rounded-full" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Cargando Terminal Mayor...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-inter">

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <header className="h-16 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-30 shadow-sm gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-violet-700 text-white flex items-center justify-center shadow-md shadow-violet-200">
            <Factory size={19} />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">{terminalLabel}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <User size={10} className="text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400">{cajeroLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-xl relative">
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
            placeholder="Buscar producto o escanear código..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-violet-700 focus:bg-white transition-all shadow-inner"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
        </div>

        <div className="flex items-center gap-4 shrink-0">
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
          <div className="text-right hidden lg:block">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">{formatLiveDate(now)}</p>
            <p className="text-sm font-black text-slate-700">{formatLiveTime(now)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Tasa</p>
            <p className="text-sm font-black text-violet-700">{rateValue.toFixed(2)} Bs</p>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <button onClick={() => auth.signOut()}
            className="h-9 w-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-rose-100">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── CONTROLS BAR ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 bg-white border-b border-slate-100 flex gap-3 items-center z-20 shadow-sm">
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1 block">Tasa</label>
          <select value={rateMode} onChange={e => setRateMode(e.target.value as RateMode)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-700">
            <option value="bcv">BCV · {(rates.tasaBCV || 0).toFixed(2)} Bs</option>
            <option value="grupo">Grupo · {(rates.tasaGrupo || 0).toFixed(2)} Bs</option>
            <option value="divisas">Divisas (USD)</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1 block">Condición</label>
          <select value={paymentCondition} onChange={e => setPaymentCondition(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-700">
            <option value="contado">Contado</option>
            <option value="credito15">Crédito 15 Días</option>
            <option value="credito30">Crédito 30 Días</option>
            <option value="credito45">Crédito 45 Días</option>
          </select>
        </div>
        {!customer && (
          <div className="ml-auto flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
            <AlertTriangle size={13} />
            <span className="text-[10px] font-black uppercase tracking-widest">Sin cliente seleccionado</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: CATALOG ────────────────────────────────────────────────────── */}
        <section className="w-[32%] min-w-[260px] border-r border-slate-100 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <input
                value={productFilter}
                onChange={e => setProductFilter(e.target.value)}
                placeholder="Filtrar catálogo..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 border border-slate-100 focus:ring-2 focus:ring-violet-700 outline-none transition-all"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
              {productFilter && (
                <button onClick={() => setProductFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex justify-between items-center mt-2 px-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Catálogo Mayor</span>
              <span className="text-[9px] font-bold text-slate-300">{displayProducts.length} productos</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 custom-scroll space-y-2">
            {displayProducts.map(product => (
              <button key={product.id} onClick={() => handleAddProduct(product)}
                className="group w-full bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm hover:border-violet-300 hover:shadow-md transition-all text-left flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[8px] font-mono text-slate-400 truncate">{product.codigo}</span>
                    {product.marca && <span className="text-[8px] font-black text-violet-500 uppercase">[{product.marca}]</span>}
                  </div>
                  <p className="text-xs font-black text-slate-800 group-hover:text-violet-700 transition-colors">{product.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-violet-700">{product.priceDisplay}</p>
                  <p className="text-[9px] font-bold text-slate-300">Stock: {product.stock}</p>
                </div>
              </button>
            ))}
            {displayProducts.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center py-16 opacity-40">
                <Package size={40} className="text-slate-300 mb-3" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados</p>
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT: CART + CHECKOUT ─────────────────────────────────────────── */}
        <aside className="flex-1 flex flex-col bg-white">

          {/* Cart table */}
          <div className="flex-1 overflow-y-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10 text-[10px] font-black uppercase tracking-widest text-slate-400 shadow-sm">
                <tr>
                  <th className="px-5 py-3.5 border-b border-slate-100">Producto</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 text-center">Cant.</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 text-right">P/U</th>
                  <th className="px-5 py-3.5 border-b border-slate-100 text-right">Total</th>
                  <th className="px-5 py-3.5 border-b border-slate-100" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-24 text-center pointer-events-none select-none">
                      <div className="inline-flex h-16 w-16 rounded-3xl bg-slate-50 items-center justify-center mb-4">
                        <ShoppingCart size={28} className="text-slate-300" />
                      </div>
                      <h3 className="text-base font-black text-slate-300 uppercase tracking-widest mb-1">Orden Vacía</h3>
                      <p className="text-xs text-slate-300">Añade productos del catálogo o escanea un código</p>
                    </td>
                  </tr>
                ) : items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-black text-slate-800 leading-none">{item.nombre}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{item.codigo}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => updateQty(item.id, item.qty - 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                          <Minus size={12} strokeWidth={3} />
                        </button>
                        <span className="w-8 text-center text-sm font-black text-slate-900">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)}
                          className="h-7 w-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                          <Plus size={12} strokeWidth={3} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold text-slate-500">${item.priceUsd.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right text-base font-black text-slate-900">${(item.qty * item.priceUsd).toFixed(2)}</td>
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

          {/* ── CHECKOUT PANEL ──────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 bg-slate-50/60 p-5 flex gap-5">
            <div className="flex-1 space-y-3 min-w-0">
              {/* Client */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente Mayorista</label>
                <div className="flex items-center gap-2">
                  {customer && (
                    <button onClick={() => { setCustomer(null); setClientQuery(''); }}
                      className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-600">Cambiar</button>
                  )}
                  <button onClick={() => setShowClientModal(true)}
                    className="text-[9px] font-black uppercase text-violet-600 hover:text-violet-800 px-2 py-1 bg-violet-50 rounded-lg">
                    + Nuevo
                  </button>
                </div>
              </div>

              {!customer ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input value={clientQuery} onChange={e => setClientQuery(e.target.value)}
                    placeholder="Buscar cliente (nombre, RIF)..."
                    className="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-violet-700 outline-none shadow-sm transition-all"
                  />
                  {filteredClients.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 max-h-40 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-1">
                      {filteredClients.map(c => (
                        <button key={c.id} onClick={() => { setCustomer(c); setClientQuery(''); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-violet-50 rounded-lg flex justify-between items-center group">
                          <div>
                            <p className="text-xs font-black text-slate-800">{c.nombre}</p>
                            <p className="text-[10px] font-bold text-slate-400">{c.rif}</p>
                          </div>
                          <CheckCircle2 size={13} className="text-violet-500 opacity-0 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-violet-100 rounded-xl p-3.5 flex items-center gap-3 shadow-sm ring-1 ring-violet-200/50">
                  <div className="h-9 w-9 rounded-full bg-violet-700 text-white flex items-center justify-center font-black text-sm shrink-0">
                    {customer.nombre.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">{customer.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{customer.rif}</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-300 mb-1">Items</p>
                  <p className="text-xl font-black text-slate-800">{items.reduce((a, i) => a + i.qty, 0)}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <p className="text-[9px] font-black uppercase text-slate-300 mb-1">
                    {rateMode === 'divisas' ? 'Total USD' : 'Total BS'}
                  </p>
                  <p className="text-xl font-black text-slate-800 truncate">
                    {rateMode === 'divisas'
                      ? `$${cartTotals.totalUsd.toFixed(2)}`
                      : cartTotals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 0 })
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Total + pay */}
            <div className="w-[38%] bg-violet-900 rounded-[1.8rem] p-6 flex flex-col justify-between shadow-2xl shadow-violet-200 text-white relative overflow-hidden shrink-0">
              <div className="absolute -right-8 -top-8 h-36 w-36 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Total Pedido</p>
                <div className="text-4xl font-black tracking-tight flex items-start gap-1 mt-1">
                  <span className="text-xl mt-0.5 opacity-40">$</span>
                  {cartTotals.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                {rateMode !== 'divisas' && (
                  <p className="text-xs font-bold text-violet-400 mt-1">
                    {cartTotals.totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs
                  </p>
                )}
              </div>

              <button
                disabled={!customer || items.length === 0}
                onClick={() => setShowPaymentModal(true)}
                className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all ${customer && items.length > 0 ? 'bg-white text-violet-900 hover:bg-violet-400 hover:text-white shadow-xl hover:scale-[1.02]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                <Receipt size={15} />Procesar Pedido
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── PAYMENT MODAL ──────────────────────────────────────────────────────── */}
      {showPaymentModal && (
        <PaymentModal
          totalUsd={cartTotals.totalUsd}
          totalBs={cartTotals.totalBs}
          rateLabel={rateModeLabel[rateMode]}
          paymentCondition={paymentCondition}
          loading={paymentLoading}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handleCharge}
        />
      )}

      {/* ── NEW CLIENT MODAL ────────────────────────────────────────────────── */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-black uppercase text-violet-600 mb-1 tracking-widest">Nuevo Mayorista</p>
                <h3 className="text-xl font-black text-slate-900">Registro Rápido</h3>
              </div>
              <button onClick={() => setShowClientModal(false)} className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              {(['rif', 'nombre', 'telefono', 'direccion'] as const).map(field => (
                <div key={field}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">{field}</label>
                  <input
                    value={clientForm[field]}
                    onChange={e => setClientForm({ ...clientForm, [field]: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-700 transition-all"
                  />
                </div>
              ))}
            </div>
            <div className="mt-7 flex gap-3">
              <button onClick={() => setShowClientModal(false)}
                className="flex-1 py-3.5 text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 rounded-xl transition-all">
                Cancelar
              </button>
              <button onClick={saveClient}
                disabled={!clientForm.nombre.trim() || !clientForm.rif.trim()}
                className="flex-[2] py-3.5 rounded-xl bg-violet-700 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-violet-800 transition-all disabled:opacity-50">
                Guardar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────
export default function PosMayor() {
  const { empresa_id } = useParams();
  if (!empresa_id) {
    return <div className="h-screen flex items-center justify-center text-slate-400 font-black uppercase tracking-widest text-xs">Error: empresa no identificada.</div>;
  }
  return (
    <TenantProvider tenantId={empresa_id}>
      <CartProvider>
        <PosMayorContent />
      </CartProvider>
    </TenantProvider>
  );
}
