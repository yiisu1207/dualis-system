import React, { useState, useEffect, useMemo } from 'react';
import { usePortal } from './PortalGuard';
import { usePortalData } from './usePortalData';
import { collection, query, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AccountType } from '../../types';
import { getTotalStock } from '../utils/stockHelpers';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Send, Check,
  Package, ChevronDown, X, Loader2, Filter,
} from 'lucide-react';

interface CatalogProduct {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  marca: string;
  precioDetal: number;
  precioMayor: number;
  stock: number;                              // legacy global stock
  stockByAlmacen?: Record<string, number>;    // dual-model
  descripcion: string;
  unidad: string;
  unitType?: string;
  iva: number;
}

interface CartItem {
  product: CatalogProduct;
  qty: number;
  price: number;
}

const CUSTOM_COLORS = ['violet', 'emerald', 'amber'] as const;

export default function PortalCatalog() {
  const { businessId, customerId, customerName } = usePortal();
  const { rates, creditLimit, creditAvailable } = usePortalData(businessId, customerId);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>(AccountType.BCV);
  const [creditDays, setCreditDays] = useState(0);
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load products
  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, `businesses/${businessId}/products`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => {
          const raw = { id: d.id, ...d.data() } as CatalogProduct;
          // Normalize stock so the rest of the file (display, cart caps) reads
          // the dual-model total instead of the legacy `stock` field directly.
          return { ...raw, stock: getTotalStock(raw) };
        })
        .filter((p) => p.stock > 0 && p.precioDetal > 0);
      setProducts(data);
      setLoading(false);
    });
    return unsub;
  }, [businessId]);

  // Account options
  const accountOptions = useMemo(() => {
    const opts: { value: AccountType; label: string; color: string }[] = [
      { value: AccountType.BCV, label: 'BCV', color: 'sky' },
    ];
    const customRates = rates.customRates || [];
    customRates
      .filter((r) => r.enabled && r.value > 0)
      .forEach((r, i) => {
        opts.push({
          value: r.id as AccountType,
          label: r.name,
          color: CUSTOM_COLORS[i % CUSTOM_COLORS.length],
        });
      });
    return opts;
  }, [rates]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.categoria).filter(Boolean));
    return ['ALL', ...Array.from(cats).sort()];
  }, [products]);

  // Filtered products
  const filtered = useMemo(() => {
    let result = products;
    if (catFilter !== 'ALL') result = result.filter((p) => p.categoria === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          p.marca?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, catFilter, search]);

  // Cart helpers
  const cartTotal = useMemo(
    () => cart.reduce((s, item) => s + item.qty * item.price, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((s, item) => s + item.qty, 0), [cart]);

  const addToCart = (product: CatalogProduct) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: Math.min(i.qty + 1, product.stock) } : i
        );
      }
      return [...prev, { product, qty: 1, price: product.precioDetal }];
    });
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, qty: Math.min(qty, i.product.stock) } : i
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  // Submit order
  const handleSubmitOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const order = {
        customerId,
        customerName,
        accountType,
        creditDays,
        note: orderNote || undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          productName: item.product.nombre,
          codigo: item.product.codigo,
          qty: item.qty,
          unitPrice: item.price,
          total: item.qty * item.price,
          unidad: item.product.unidad || 'und',
        })),
        totalUSD: cartTotal,
        status: 'pendiente_aprobacion',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, `businesses/${businessId}/portalOrders`), order);
      setSubmitted(true);
      setCart([]);
      setCartOpen(false);
    } catch (err) {
      console.error('Order submit error:', err);
      alert('Error al enviar pedido. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center animate-in">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-5">
          <Check size={28} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Pedido Enviado</h2>
        <p className="text-sm text-white/40 mb-2 leading-relaxed">
          Tu pedido ha sido enviado y está pendiente de aprobación.
        </p>
        <p className="text-xs text-white/30 mb-6">
          Recibirás una notificación cuando sea procesado y cargado a tu cuenta.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/[0.1] active:scale-[0.97] transition-all"
        >
          Hacer otro pedido
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Catálogo</h1>
          <p className="text-xs text-white/40 font-bold mt-1">
            {products.length} producto{products.length !== 1 ? 's' : ''} disponible{products.length !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Cart button */}
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.97] shrink-0"
        >
          <ShoppingCart size={14} />
          <span className="hidden sm:inline">Carrito</span>
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full pl-9 pr-3 py-2.5 bg-[#0d1424] border border-white/[0.07] rounded-xl text-xs text-white placeholder:text-white/20 outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        {categories.length > 2 && (
          <div className="relative">
            <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="pl-8 pr-8 py-2.5 bg-[#0d1424] border border-white/[0.07] rounded-xl text-xs text-white outline-none appearance-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'Todas las categorías' : c}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Product Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Package size={40} className="mx-auto text-white/10 mb-3" />
          <p className="text-xs font-black uppercase tracking-widest text-white/20">Sin productos</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {filtered.map((p) => {
            const inCart = cart.find((i) => i.product.id === p.id);
            return (
              <div
                key={p.id}
                className={`bg-[#0d1424] rounded-xl border overflow-hidden transition-all ${
                  inCart
                    ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                    : 'border-white/[0.07] hover:border-white/[0.12]'
                }`}
              >
                <div className="p-3 sm:p-4">
                  {/* Category tag */}
                  {p.categoria && (
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 mb-2 inline-block">
                      {p.categoria}
                    </span>
                  )}
                  <p className="text-xs sm:text-sm font-black text-white leading-tight mb-0.5 line-clamp-2">
                    {p.nombre}
                  </p>
                  <p className="text-[9px] text-white/30 font-bold mb-2">
                    {p.codigo} {p.marca ? `· ${p.marca}` : ''}
                  </p>

                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                        ${p.precioDetal.toFixed(2)}
                      </p>
                      <p className="text-[8px] text-white/20 font-bold">
                        Stock: {p.stock} {p.unidad || 'und'}
                      </p>
                    </div>

                    {inCart ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(p.id, inCart.qty - 1)}
                          className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/60 flex items-center justify-center hover:bg-white/[0.1] active:scale-90 transition-all"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-7 text-center text-xs font-black text-white">
                          {inCart.qty}
                        </span>
                        <button
                          onClick={() => updateQty(p.id, inCart.qty + 1)}
                          disabled={inCart.qty >= p.stock}
                          className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 active:scale-90 transition-all disabled:opacity-30"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 active:scale-90 transition-all shadow-md shadow-indigo-500/25"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart Slide-over */}
      {cartOpen && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-[#0d1424] border-l border-white/[0.07] flex flex-col animate-in slide-in-from-right duration-200">
            {/* Cart Header */}
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-indigo-400" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest">
                  Carrito ({cartCount})
                </h2>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.06] text-white/40 flex items-center justify-center hover:bg-white/[0.1]"
              >
                <X size={14} />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingCart size={32} className="mx-auto text-white/10 mb-3" />
                  <p className="text-xs font-bold text-white/20">Carrito vacío</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="bg-white/[0.03] rounded-xl border border-white/[0.07] p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-white truncate">{item.product.nombre}</p>
                        <p className="text-[9px] text-white/30">{item.product.codigo}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-white/20 hover:text-rose-400 transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(item.product.id, item.qty - 1)}
                          className="w-6 h-6 rounded bg-white/[0.06] text-white/60 flex items-center justify-center hover:bg-white/[0.1]"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-8 text-center text-xs font-black text-white">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.product.id, item.qty + 1)}
                          disabled={item.qty >= item.product.stock}
                          className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 disabled:opacity-30"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                      <p className="text-sm font-black text-emerald-400 font-mono">
                        ${(item.qty * item.price).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer — Order Config + Submit */}
            {cart.length > 0 && (
              <div className="border-t border-white/[0.07] p-4 space-y-3">
                {/* Account Type */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1.5">
                    Cuenta
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {accountOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAccountType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                          accountType === opt.value
                            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:border-white/[0.15]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Credit Days */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block mb-1.5">
                    Condición de pago
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 15, 30, 60].map((d) => (
                      <button
                        key={d}
                        onClick={() => setCreditDays(d)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                          creditDays === d
                            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                            : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:border-white/[0.15]'
                        }`}
                      >
                        {d === 0 ? 'Contado' : `${d} días`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  placeholder="Nota para el negocio (opcional)..."
                  rows={2}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-white placeholder:text-white/20 outline-none resize-none focus:ring-2 focus:ring-indigo-500/40"
                />

                {/* Total + Submit */}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.07]">
                  <div>
                    <p className="text-[9px] font-black uppercase text-white/30">Total</p>
                    <p className="text-lg font-black text-white font-mono">${cartTotal.toFixed(2)}</p>
                  </div>
                  <button
                    onClick={handleSubmitOrder}
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Enviar Pedido
                  </button>
                </div>

                {creditLimit > 0 && (
                  <p className="text-[9px] text-white/25 text-center">
                    Crédito disponible: ${creditAvailable.toFixed(2)} de ${creditLimit.toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
