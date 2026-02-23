import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTenant } from './TenantContext';

type PriceTier = 'detal' | 'mayor' | 'granMayor';

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
  totalUsd: number;
  totalBs: number;
};

type CartContextValue = {
  items: CartItem[];
  rateValue: number;
  setRateValue: (value: number) => void;
  totals: CartTotals;
  addProductByCode: (code: string, priceTier?: PriceTier) => Promise<boolean>;
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function resolvePrice(data: Record<string, unknown>, priceTier: PriceTier) {
  const detal = Number(data.precioDetal);
  const mayor = Number(data.precioMayor);
  const granMayor = Number(data.precioGranMayor ?? data.precioPromo);
  if (priceTier === 'mayor') {
    return Number.isFinite(mayor) ? mayor : Number.isFinite(detal) ? detal : 0;
  }
  if (priceTier === 'granMayor') {
    if (Number.isFinite(granMayor)) return granMayor;
    if (Number.isFinite(mayor)) return mayor;
    return Number.isFinite(detal) ? detal : 0;
  }
  return Number.isFinite(detal) ? detal : 0;
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

  const addProductByCode = useCallback(
    async (code: string, priceTier: PriceTier = 'detal') => {
      if (!tenantId) return false;
      const normalized = code.trim();
      if (!normalized) return false;


      // Legacy: productos están en businesses/{empresaId}/products
      const baseQuery = (field: 'codigo' | 'codigoAlterno') =>
        query(
          collection(db, `businesses/${tenantId}/products`),
          where(field, '==', normalized)
        );

      let snap = await getDocs(baseQuery('codigo'));
      if (snap.empty) {
        snap = await getDocs(baseQuery('codigoAlterno'));
      }
      if (snap.empty) return false;

      const docSnap = snap.docs[0];

      const data = docSnap.data() as Record<string, unknown>;
      // Adaptador retrocompatible: si solo hay price, úsalo como detal
      let priceUsd = resolvePrice(data, priceTier);
      if (!('precioDetal' in data) && 'price' in data) {
        priceUsd = Number(data.price) || 0;
      }
      const nextItem: CartItem = {
        id: docSnap.id,
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
  }, []);

  const totals = useMemo<CartTotals>(() => {
    const subtotalUsd = items.reduce((sum, item) => sum + item.qty * item.priceUsd, 0);
    const taxUsd = items.reduce(
      (sum, item) => sum + item.qty * item.priceUsd * item.ivaRate,
      0
    );
    const totalUsd = subtotalUsd + taxUsd;
    const totalBs = totalUsd * rateValue;
    return { subtotalUsd, taxUsd, totalUsd, totalBs };
  }, [items, rateValue]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      rateValue,
      setRateValue,
      totals,
      addProductByCode,
      updateQty,
      removeItem,
      clearCart,
    }),
    [items, rateValue, totals, addProductByCode, updateQty, removeItem, clearCart]
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
