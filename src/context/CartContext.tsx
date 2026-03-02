import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTenant } from './TenantContext';

type PriceTier = 'detal' | 'mayor' | 'granMayor';

export type DiscountType = 'none' | 'percent' | 'fixed';

type CartItem = {
  id: string;
  codigo: string;
  nombre: string;
  qty: number;
  priceUsd: number;
  ivaRate: number;
  stock: number;
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
  rateValue: number;
  setRateValue: (value: number) => void;
  totals: CartTotals;
  discountType: DiscountType;
  discountValue: number;
  setDiscount: (type: DiscountType, value: number) => void;
  addProductByCode: (code: string, priceTier?: PriceTier) => Promise<boolean>;
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
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

  const setDiscount = useCallback((type: DiscountType, value: number) => {
    setDiscountType(type);
    setDiscountValue(value);
  }, []);

  const addProductByCode = useCallback(
    async (code: string, priceTier: PriceTier = 'detal') => {
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
      const priceUsd = resolvePrice(data, priceTier);

      const nextItem: CartItem = {
        id: foundId,
        codigo: String(data.codigo || data.codigoAlterno || normalized),
        nombre: String(data.nombre || 'Producto sin nombre'),
        qty: 1,
        priceUsd,
        ivaRate: resolveIvaRate(data),
        stock: Number(data.stock || 0),
      };

      setItems((prev) => {
        const existing = prev.find((item) => item.id === nextItem.id);
        if (!existing) return [...prev, nextItem];
        return prev.map((item) =>
          item.id === nextItem.id ? { ...item, qty: item.qty + 1 } : item
        );
      });

      return true;
    },
    [tenantId]
  );

  const updateQty = useCallback((id: string, qty: number) => {
    const nextQty = Math.max(1, Math.floor(qty || 1));
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty: nextQty } : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscountType('none');
    setDiscountValue(0);
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
      rateValue,
      setRateValue,
      totals,
      discountType,
      discountValue,
      setDiscount,
      addProductByCode,
      updateQty,
      removeItem,
      clearCart,
    }),
    [items, rateValue, totals, discountType, discountValue, setDiscount, addProductByCode, updateQty, removeItem, clearCart]
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
