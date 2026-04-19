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
  unitType?: string; // 'unidad' | 'kg' | 'g' | 'ton' | 'lt' | 'ml' | 'lb'
  // Fase B — venta por bulto
  unidadesPorBulto?: number; // >= 1; default 1. Cuántas unidades reales trae 1 bulto
  sellMode?: 'unidad' | 'bulto'; // default 'unidad'. Si 'bulto', qty representa bultos, precio se multiplica
  // Fase B — código de barras
  barcode?: string;
  // Fase 9.4 — variantes
  variantId?: string;       // id de la variante seleccionada
  variantLabel?: string;    // ej: "M / Rojo" — para display
  // H.23 — nota por item
  note?: string;            // ej: "sin azúcar", "color rojo"
};

// Unidades reales descontadas del stock según modo de venta
export function effectiveStockQty(item: CartItem): number {
  if (item.sellMode === 'bulto') {
    const per = Math.max(1, item.unidadesPorBulto || 1);
    return item.qty * per;
  }
  return item.qty;
}

// Precio efectivo considerando modo de venta
export function effectiveLinePrice(item: CartItem): number {
  if (item.sellMode === 'bulto') {
    const per = Math.max(1, item.unidadesPorBulto || 1);
    return item.priceUsd * per;
  }
  return item.priceUsd;
}

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
  addProductByBarcode: (barcode: string, priceTier?: PriceTier) => Promise<boolean>;
  setItemSellMode: (id: string, mode: 'unidad' | 'bulto') => void;
  updateQty: (id: string, qty: number) => void;
  updateItemPrices: (priceMap: Record<string, number>) => void;
  setItemNote: (id: string, note: string) => void;
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

      // Fase 9.4 — si no encontramos el código en productos, buscar en variantes
      if (!foundId || !foundData) {
        const allSnap = await getDocs(productsCol);
        for (const d of allSnap.docs) {
          const pd = d.data() as any;
          if (!pd.hasVariants || !Array.isArray(pd.variants)) continue;
          const matchedVariant = pd.variants.find((v: any) =>
            v.sku === normalized || v.barcode === normalized
          );
          if (matchedVariant) {
            foundId = d.id;
            foundData = pd;
            // attach matched variant for downstream use
            (foundData as any).__matchedVariant = matchedVariant;
            break;
          }
        }
      }

      if (!foundId || !foundData) return false;

      const data = foundData;
      const productTipoTasa = String(data.tipoTasa || 'BCV');
      const matchedVar = (data as any).__matchedVariant as { id: string; sku: string; values: Record<string, string>; stock: number; precioDetal?: number; precioMayor?: number; costoUSD?: number; barcode?: string } | undefined;

      let priceUsd: number;
      if (priceOverride != null) {
        priceUsd = priceOverride;
      } else if (matchedVar) {
        // variant price override or fallback to parent
        const varPrice = priceTier === 'mayor' ? matchedVar.precioMayor : matchedVar.precioDetal;
        priceUsd = varPrice != null ? varPrice : resolvePrice(data, priceTier);
      } else {
        priceUsd = resolvePrice(data, priceTier);
      }

      const variantLabel = matchedVar ? Object.values(matchedVar.values).filter(Boolean).join(' / ') : undefined;
      const cartKey = matchedVar ? `${foundId}__v_${matchedVar.id}` : foundId;

      const nextItem: CartItem = {
        id: cartKey,
        codigo: matchedVar?.sku || String(data.codigo || data.codigoAlterno || normalized),
        nombre: matchedVar
          ? `${String(data.nombre || 'Producto')} — ${variantLabel}`
          : String(data.nombre || 'Producto sin nombre'),
        qty: 1,
        priceUsd,
        ivaRate: resolveIvaRate(data),
        stock: matchedVar ? (matchedVar.stock || 0) : Number(data.stock || 0),
        tipoTasa: productTipoTasa,
        unitType: String(data.unitType || 'unidad'),
        unidadesPorBulto: Math.max(1, Number(data.unidadesPorBulto) || 1),
        sellMode: 'unidad',
        barcode: matchedVar?.barcode || (data.barcode ? String(data.barcode) : undefined),
        variantId: matchedVar?.id,
        variantLabel,
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

  const addProductByBarcode = useCallback(
    async (barcode: string, priceTier: PriceTier = 'detal') => {
      if (!tenantId) return false;
      const normalized = barcode.trim();
      if (!normalized) return false;
      const productsCol = collection(db, `businesses/${tenantId}/products`);
      const snap = await getDocs(query(productsCol, where('barcode', '==', normalized)));
      if (snap.empty) {
        // fallback a búsqueda por código
        return addProductByCode(normalized, priceTier);
      }
      const found = snap.docs[0];
      const data = found.data() as Record<string, unknown>;
      const productTipoTasa = String(data.tipoTasa || 'BCV');
      const priceUsd = resolvePrice(data, priceTier);
      const nextItem: CartItem = {
        id: found.id,
        codigo: String(data.codigo || normalized),
        nombre: String(data.nombre || 'Producto sin nombre'),
        qty: 1,
        priceUsd,
        ivaRate: resolveIvaRate(data),
        stock: Number(data.stock || 0),
        tipoTasa: productTipoTasa,
        unitType: String(data.unitType || 'unidad'),
        unidadesPorBulto: Math.max(1, Number(data.unidadesPorBulto) || 1),
        sellMode: 'unidad',
        barcode: normalized,
      };
      if (itemsRef.current.length === 0) {
        setStartedAt(new Date());
        setCartTipoTasa(productTipoTasa);
      }
      setItems((prev) => {
        const existing = prev.find((it) => it.id === nextItem.id);
        if (!existing) return [...prev, nextItem];
        return prev.map((it) => (it.id === nextItem.id ? { ...it, qty: it.qty + 1 } : it));
      });
      return true;
    },
    [tenantId, addProductByCode],
  );

  const setItemSellMode = useCallback((id: string, mode: 'unidad' | 'bulto') => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, sellMode: mode } : item)));
  }, []);

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

  const setItemNote = useCallback((id: string, note: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, note } : item));
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
    const subtotalUsd = items.reduce((sum, item) => sum + item.qty * effectiveLinePrice(item), 0);
    const taxUsd = items.reduce(
      (sum, item) => sum + item.qty * effectiveLinePrice(item) * item.ivaRate,
      0
    );
    const preTotalUsd = subtotalUsd + taxUsd;
    const safeDiscount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
    const discountUsd =
      discountType === 'percent'
        ? parseFloat((preTotalUsd * (Math.min(safeDiscount, 100) / 100)).toFixed(2))
        : discountType === 'fixed'
        ? Math.min(safeDiscount, preTotalUsd)
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
      addProductByBarcode,
      setItemSellMode,
      updateQty,
      updateItemPrices,
      setItemNote,
      removeItem,
      clearCart,
      loadCart,
    }),
    [items, startedAt, rateValue, totals, discountType, discountValue, cartTipoTasa, setDiscount, addProductByCode, addProductByBarcode, setItemSellMode, updateQty, updateItemPrices, setItemNote, removeItem, clearCart, loadCart]
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
