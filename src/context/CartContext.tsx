import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTenant } from './TenantContext';

type PriceTier = 'detal' | 'mayor' | 'granMayor' | 'bcv' | 'grupo' | 'divisa';

export type DiscountType = 'none' | 'percent' | 'fixed';

export type CartItem = {
  id: string;
  codigo: string;
  nombre: string;
  qty: number;
  priceUsd: number;
  ivaRate: number;
  stock: number;
  tipoTasa?: string; // 'BCV' | customRate.id
};

type CartTotals = {
  subtotalUsd: number;
  taxUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalBs: number;
};

type CartContextValue = {
  items: CartItem[];
  startedAt: Date | null;
  rateValue: number;
  setRateValue: (value: number) => void;
  totals: CartTotals;
  discountType: DiscountType;
  discountValue: number;
  cartTipoTasa: string | null; // tipo de tasa del carrito actual (null = vacío)
  setDiscount: (type: DiscountType, value: number) => void;
  addProductByCode: (code: string, priceTier?: PriceTier, priceOverride?: number) => Promise<boolean>;
  updateQty: (id: string, qty: number) => void;
  updateItemPrices: (priceMap: Record<string, number>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  loadCart: (items: CartItem[], discountType: DiscountType, discountValue: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function resolvePrice(data: Record<string, unknown>, priceTier: PriceTier) {
  if (priceTier === 'mayor') {
    const mayor = Number(data.precioMayor);
    return Number.isFinite(mayor) && mayor > 0 ? mayor : 0;
  }
  if (priceTier === 'granMayor') {
    const granMayor = Number(data.precioGranMayor ?? data.precioPromo);
    return Number.isFinite(granMayor) && granMayor > 0 ? granMayor : 0;
  }
  if (priceTier === 'bcv') {
    const bcv = Number(data.precioBCV);
    const fallback = Number(data.precioMayor);
    return Number.isFinite(bcv) && bcv > 0 ? bcv : (Number.isFinite(fallback) && fallback > 0 ? fallback : 0);
  }
  if (priceTier === 'grupo') {
    const grupo = Number(data.precioGrupo);
    const fallback = Number(data.precioMayor);
    return Number.isFinite(grupo) && grupo > 0 ? grupo : (Number.isFinite(fallback) && fallback > 0 ? fallback : 0);
  }
  if (priceTier === 'divisa') {
    const divisa = Number(data.precioDivisa);
    const fallback = Number(data.precioMayor);
    return Number.isFinite(divisa) && divisa > 0 ? divisa : (Number.isFinite(fallback) && fallback > 0 ? fallback : 0);
  }
  const detal = Number(data.precioDetal ?? data.marketPrice ?? data.precioVenta ?? data.salePrice ?? data.price);
  return Number.isFinite(detal) && detal > 0 ? detal : 0;
}

function resolveIvaRate(data: Record<string, unknown>) {
  const ivaRaw = Number(data.iva);
  if (!Number.isFinite(ivaRaw)) return 0;
  return ivaRaw / 100;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { tenantId } = useTenant();
  const [items, setItems] = useState<CartItem[]>([]);
  const [rateValue, setRateValue] = useState(36.5);
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [cartTipoTasa, setCartTipoTasa] = useState<string | null>(null);
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const setDiscount = useCallback((type: DiscountType, value: number) => {
    setDiscountType(type);
    setDiscountValue(value);
  }, []);

  const addProductByCode = useCallback(
    async (code: string, priceTier: PriceTier = 'detal', priceOverride?: number) => {
      if (!tenantId) return false;
      const normalized = code.trim();
      if (!normalized) return false;

      const productsCol = collection(db, `businesses/${tenantId}/products`);

      let foundId: string | null = null;
      let foundData: Record<string, unknown> | null = null;

      const snap1 = await getDocs(query(productsCol, where('codigo', '==', normalized)));
      if (!snap1.empty) {
        foundId = snap1.docs[0].id;
        foundData = snap1.docs[0].data() as Record<string, unknown>;
      } else {
        const snap2 = await getDocs(query(productsCol, where('codigoAlterno', '==', normalized)));
        if (!snap2.empty) {
          foundId = snap2.docs[0].id;
          foundData = snap2.docs[0].data() as Record<string, unknown>;
        } else {
          const directSnap = await getDoc(doc(productsCol, normalized));
          if (directSnap.exists()) {
            foundId = directSnap.id;
            foundData = directSnap.data() as Record<string, unknown>;
          }
        }
      }

      if (!foundId || !foundData) return false;

      const data = foundData;
      const productTipoTasa = String(data.tipoTasa || 'BCV');

      const priceUsd = priceOverride != null ? priceOverride : resolvePrice(data, priceTier);

      const nextItem: CartItem = {
        id: foundId,
        codigo: String(data.codigo || data.codigoAlterno || normalized),
        nombre: String(data.nombre || 'Producto sin nombre'),
        qty: 1,
        priceUsd,
        ivaRate: resolveIvaRate(data),
        stock: Number(data.stock || 0),
        tipoTasa: productTipoTasa,
      };

      if (itemsRef.current.length === 0) {
        setStartedAt(new Date());
        setCartTipoTasa(productTipoTasa);
      }
      setItems((prev) => {
        const existing = prev.find((item) => item.id === nextItem.id);
        if (!existing) return [...prev, nextItem];
        return prev.map((item) =>
          item.id === nextItem.id ? { ...item, qty: item.qty + 1 } : item
        );
      });

      return true;
    },
    [tenantId, cartTipoTasa]
  );

  const updateQty = useCallback((id: string, qty: number) => {
    const nextQty = Math.max(1, Math.floor(qty || 1));
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty: nextQty } : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItemPrices = useCallback((priceMap: Record<string, number>) => {
    setItems(prev => prev.map(item => {
      const newPrice = priceMap[item.id];
      if (newPrice != null && newPrice > 0) return { ...item, priceUsd: newPrice };
      return item;
    }));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscountType('none');
    setDiscountValue(0);
    setStartedAt(null);
    setCartTipoTasa(null);
  }, []);

  const loadCart = useCallback((newItems: CartItem[], dType: DiscountType, dValue: number) => {
    setItems(newItems);
    setDiscountType(dType);
    setDiscountValue(dValue);
    setStartedAt(new Date());
  }, []);

  const totals = useMemo<CartTotals>(() => {
    const subtotalUsd = items.reduce((sum, item) => sum + item.qty * item.priceUsd, 0);
    const taxUsd = items.reduce(
      (sum, item) => sum + item.qty * item.priceUsd * item.ivaRate,
      0
    );
    const preTotalUsd = subtotalUsd + taxUsd;
    const discountUsd =
      discountType === 'percent'
        ? parseFloat((preTotalUsd * (discountValue / 100)).toFixed(2))
        : discountType === 'fixed'
        ? Math.min(discountValue, preTotalUsd)
        : 0;
    const totalUsd = Math.max(0, preTotalUsd - discountUsd);
    const totalBs = totalUsd * rateValue;
    return { subtotalUsd, taxUsd, discountUsd, totalUsd, totalBs };
  }, [items, rateValue, discountType, discountValue]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      startedAt,
      rateValue,
      setRateValue,
      totals,
      discountType,
      discountValue,
      cartTipoTasa,
      setDiscount,
      addProductByCode,
      updateQty,
      updateItemPrices,
      removeItem,
      clearCart,
      loadCart,
    }),
    [items, startedAt, rateValue, totals, discountType, discountValue, cartTipoTasa, setDiscount, addProductByCode, updateQty, updateItemPrices, removeItem, clearCart, loadCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
