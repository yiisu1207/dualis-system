// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PRODUCTO EDIT — Pantalla dedicada full-screen (Plade-killer)            ║
// ║                                                                          ║
// ║  Reemplaza el modal mini con una pantalla completa estilo Plade pero     ║
// ║  ordenada y moderna. Layout dual:                                        ║
// ║                                                                          ║
// ║   IZQUIERDA (sticky, 360px): panel de PRICING en vivo                    ║
// ║     · Costo USD + costo Bs (auto desde tasa)                             ║
// ║     · Costo promedio (snapshot del weighted avg)                         ║
// ║     · Estrategia de pricing (5 modos como Plade):                        ║
// ║         1. Costo + % ganancia sin IVA                                    ║
// ║         2. Costo + % ganancia con IVA incluido                           ║
// ║         3. Precio directo en $ sin IVA                                   ║
// ║         4. Precio directo en $ con IVA                                   ║
// ║         5. Precio en Bs fijo                                             ║
// ║     · Precio venta sin IVA + con IVA (ambos en $ y Bs en vivo)           ║
// ║     · % descuento especial → precio descuento                            ║
// ║                                                                          ║
// ║   DERECHA (scroll): secciones colapsables ordenadas por importancia      ║
// ║     1. ✅ Identificación (código, nombre, descripción) — siempre abierta ║
// ║     2. 🏷️ Categorización (categoría, subcategoría, marca, tipo, estatus) ║
// ║     3. 💰 Precios adicionales (mayor, menor, descuento, cliente especial)║
// ║     4. 📐 Inventario (stock min/max, lotes, vencimiento, presentación)   ║
// ║     5. 📸 Imágenes y código de barras                                    ║
// ║     6. 🧩 Componentes/kit + variantes                                    ║
// ║     7. 🌐 Web/Mercado libre + alertas + comisiones (avanzado)            ║
// ║     8. 📦 Dimensiones físicas (peso, ancho, largo, profundidad)          ║
// ║                                                                          ║
// ║  Features clave que ningún competidor en VE tiene tan ordenado:          ║
// ║   · Auto-cálculo de margen con feedback de color (verde/ámbar/rojo)      ║
// ║   · Sugerencia de código (auto-numerado por categoría)                   ║
// ║   · Vista previa instantánea como aparece en POS                         ║
// ║   · Múltiples imágenes drag-drop con preview                             ║
// ║   · Detección de código duplicado al guardar                             ║
// ║   · Modo "duplicar" para clonar producto existente                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  collection, addDoc, doc, setDoc, getDoc, onSnapshot, query, where,
  serverTimestamp, getDocs, limit as fbLimit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useRates } from '../../context/RatesContext';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { lookupProductByBarcode, type LookupResult } from '../../utils/productLookup';
import {
  ArrowLeft, Save, Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Tag, Boxes, ImageIcon, X, CheckCircle2, Hash, Eye,
  Camera, Calculator, Barcode, ToggleLeft, ToggleRight,
  Star, ShoppingCart, Search, Globe, Sparkles,
} from 'lucide-react';

// ─── TYPES ────────────────────────────────────────────────────────────────

interface Product {
  id?: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  marca?: string;
  proveedor?: string;
  categoria?: string;
  subcategoria?: string;
  ubicacion?: string;
  costoUSD: number;
  precioDetal: number;
  precioMayor: number;
  precioMenor?: number;
  precioDescuento?: number;
  precioClienteEspecial?: number;
  precioBCV?: number;
  precioGrupo?: number;
  precioDivisa?: number;
  preciosCuenta?: Record<string, number>;
  stock: number;
  stockByAlmacen?: Record<string, number>;
  stockMinimo: number;
  stockMaximo?: number;
  iva: number;
  ivaTipo: 'GENERAL' | 'REDUCIDO' | 'EXENTO';
  unidad: string;
  unitType?: string;
  unidadesPorBulto?: number;
  peso?: number;
  imageUrl?: string;
  images?: string[];
  barcode?: string;
  esServicio?: boolean;
  isKit?: boolean;
  hasVariants?: boolean;
  fechaVencimiento?: string;
  lote?: string;
  margenDetal?: number;
  margenMayor?: number;
  // POS quick-wins
  favorito?: boolean;
  permitirPrecioCero?: boolean;
  status?: 'active' | 'pending_review' | 'archived';
  createdAt?: any;
  updatedAt?: any;
}

type PricingStrategy =
  | 'COST_PLUS_MARGIN'      // 1. Costo + % ganancia sin IVA
  | 'COST_PLUS_MARGIN_IVA'  // 2. Costo + % ganancia con IVA incluido
  | 'DIRECT_USD'            // 3. Precio directo en $ sin IVA
  | 'DIRECT_USD_IVA'        // 4. Precio directo en $ con IVA
  | 'DIRECT_BS';            // 5. Precio en Bs fijo

const STRATEGY_LABELS: Record<PricingStrategy, string> = {
  COST_PLUS_MARGIN: '1) Costo + % ganancia sin IVA',
  COST_PLUS_MARGIN_IVA: '2) Costo + % ganancia con IVA incluido',
  DIRECT_USD: '3) Precio directo en $ sin IVA',
  DIRECT_USD_IVA: '4) Precio directo en $ con IVA',
  DIRECT_BS: '5) Precio en Bs fijo',
};

interface ProductoEditPageProps {
  productId?: string | null;  // null = nuevo
  duplicateFromId?: string | null;
  onClose: () => void;
}

// ─── COMPONENT ─────────────────────────────────────────────────────────────

export default function ProductoEditPage({ productId, duplicateFromId, onClose }: ProductoEditPageProps) {
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const businessId = userProfile?.businessId;
  const isEdit = !!productId;
  const tasaBCV = rates.tasaBCV || 1;

  // Estado del producto
  const [product, setProduct] = useState<Product>(getInitialProduct());
  const [loading, setLoading] = useState(isEdit || !!duplicateFromId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [duplicateCodeWarning, setDuplicateCodeWarning] = useState<string | null>(null);

  // Pricing
  const [strategy, setStrategy] = useState<PricingStrategy>('COST_PLUS_MARGIN');
  const [margenPct, setMargenPct] = useState<number>(30);
  const [precioInputBs, setPrecioInputBs] = useState<number>(0);
  const [descuentoEspecialPct, setDescuentoEspecialPct] = useState<number>(0);

  // Catálogo de categorías existentes
  const [allCategories, setAllCategories] = useState<{ cat: string; subcats: Set<string> }[]>([]);
  const [allCodes, setAllCodes] = useState<Set<string>>(new Set());

  // Lookup por código de barras
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Tracking: ¿el usuario tocó manualmente el barcode? Si NO, se mantiene
  // sincronizado con el SKU (caso típico: SKU = barcode del producto).
  // Una vez editado manualmente, deja de auto-sincronizar.
  const [barcodeManuallyEdited, setBarcodeManuallyEdited] = useState(false);

  // Auto-sync barcode ← código mientras no se haya tocado manualmente
  useEffect(() => {
    if (barcodeManuallyEdited) return;
    if (product.codigo && product.codigo !== product.barcode) {
      setProduct(p => ({ ...p, barcode: p.codigo }));
    }
  }, [product.codigo, barcodeManuallyEdited]);

  // Las secciones se muestran siempre abiertas (no colapsables) — el usuario
  // pidió ver todas las opciones de un vistazo en lugar de tener que hacer click.

  // Scroll-reset al montar y al cerrar — evita que el viewport quede en
  // posición "intermedia" que daba sensación de UI paralizada.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    return () => { window.scrollTo({ top: 0, behavior: 'auto' }); };
  }, []);

  // Cargar producto existente o duplicado
  useEffect(() => {
    if (!businessId) return;
    const sourceId = productId || duplicateFromId;
    if (!sourceId) { setLoading(false); return; }

    (async () => {
      try {
        const snap = await getDoc(doc(db, `businesses/${businessId}/products`, sourceId));
        if (!snap.exists()) {
          setError('Producto no encontrado');
          setLoading(false);
          return;
        }
        const data = snap.data() as any;
        const loaded: Product = {
          ...getInitialProduct(),
          ...data,
          ...(duplicateFromId ? { codigo: '', nombre: data.nombre + ' (copia)' } : {}),
        };
        setProduct(loaded);
        // Si el producto cargado ya tiene barcode distinto al SKU, asumimos
        // que el usuario lo editó intencionalmente y no debemos sobreescribir.
        if (loaded.barcode && loaded.barcode !== loaded.codigo) {
          setBarcodeManuallyEdited(true);
        }
        if (data.margenDetal && data.margenDetal > 0) setMargenPct(data.margenDetal);
        else if (data.costoUSD > 0 && data.precioDetal > 0) {
          setMargenPct(((data.precioDetal - data.costoUSD) / data.costoUSD) * 100);
        }
      } catch (e: any) {
        setError(e?.message || 'Error cargando producto');
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId, productId, duplicateFromId]);

  // Cargar catálogos UNA SOLA VEZ con getDocs (no necesitamos suscripción
  // real-time mientras se edita un producto; tener onSnapshot abierto sobre
  // el catálogo completo causa re-renders en cada cambio de Firestore).
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const snap = await getDocs(collection(db, `businesses/${businessId}/products`));
      if (cancelled) return;
      const cats = new Map<string, Set<string>>();
      const codes = new Set<string>();
      snap.docs.forEach(d => {
        const p = d.data() as any;
        if (p.codigo && d.id !== productId) codes.add(String(p.codigo).toLowerCase());
        if (p.categoria) {
          if (!cats.has(p.categoria)) cats.set(p.categoria, new Set());
          if (p.subcategoria) cats.get(p.categoria)!.add(p.subcategoria);
        }
      });
      setAllCategories(Array.from(cats.entries()).map(([cat, subcats]) => ({ cat, subcats })));
      setAllCodes(codes);
    })();
    return () => { cancelled = true; };
  }, [businessId, productId]);

  // Detección código duplicado — con debounce 300ms para no chequear en cada tecla
  useEffect(() => {
    const c = (product.codigo || '').trim().toLowerCase();
    if (!c) { setDuplicateCodeWarning(null); return; }
    const t = setTimeout(() => {
      if (allCodes.has(c)) setDuplicateCodeWarning(`Ya existe un producto con código "${product.codigo}"`);
      else setDuplicateCodeWarning(null);
    }, 300);
    return () => clearTimeout(t);
  }, [product.codigo, allCodes]);

  // ─── PRICING EN VIVO ──────────────────────────────────────────────────

  // Calcula precios derivados según estrategia
  const pricing = useMemo(() => {
    const cost = Number(product.costoUSD || 0);
    const ivaRate = product.ivaTipo === 'EXENTO' ? 0 : (product.iva || 16) / 100;
    let priceSinIVA = 0;

    switch (strategy) {
      case 'COST_PLUS_MARGIN':
        priceSinIVA = cost * (1 + margenPct / 100);
        break;
      case 'COST_PLUS_MARGIN_IVA': {
        const conIva = cost * (1 + margenPct / 100);
        priceSinIVA = conIva / (1 + ivaRate);
        break;
      }
      case 'DIRECT_USD':
        priceSinIVA = product.precioDetal || 0;
        break;
      case 'DIRECT_USD_IVA':
        priceSinIVA = (product.precioDetal || 0) / (1 + ivaRate);
        break;
      case 'DIRECT_BS':
        priceSinIVA = (precioInputBs / tasaBCV) / (1 + ivaRate);
        break;
    }

    const priceConIVA = priceSinIVA * (1 + ivaRate);
    const priceSinIVABs = priceSinIVA * tasaBCV;
    const priceConIVABs = priceConIVA * tasaBCV;
    const margin = cost > 0 ? ((priceSinIVA - cost) / cost) * 100 : 0;
    const profit = priceSinIVA - cost;

    const priceWithDiscount = priceSinIVA * (1 - descuentoEspecialPct / 100);
    const priceWithDiscountBs = priceWithDiscount * tasaBCV;

    return {
      priceSinIVA,
      priceConIVA,
      priceSinIVABs,
      priceConIVABs,
      margin,
      profit,
      costBs: cost * tasaBCV,
      priceWithDiscount,
      priceWithDiscountBs,
    };
  }, [product.costoUSD, product.iva, product.ivaTipo, product.precioDetal, strategy, margenPct, precioInputBs, descuentoEspecialPct, tasaBCV]);

  // ─── HANDLERS ─────────────────────────────────────────────────────────

  const update = (patch: Partial<Product>) => setProduct(p => ({ ...p, ...patch }));


  const generateCode = () => {
    const cat = product.categoria || 'GEN';
    const prefix = cat.slice(0, 2).toUpperCase();
    const num = Math.floor(Math.random() * 9000 + 1000);
    update({ codigo: `${prefix}-${num}` });
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    try {
      const result = await uploadToCloudinary(file, 'dualis_products');
      const url = result.secure_url;
      const next = [...(product.images || []), url];
      update({ images: next, imageUrl: product.imageUrl || url });
    } catch (e: any) {
      setError(e?.message || 'Error subiendo imagen');
    }
  };

  const removeImage = (idx: number) => {
    const next = [...(product.images || [])];
    next.splice(idx, 1);
    update({ images: next, imageUrl: next[0] });
  };

  // Busca info del producto en Open Food Facts / UPC ItemDB / etc.
  const handleLookupBarcode = async () => {
    const code = (product.barcode || '').trim();
    if (!code) { setLookupError('Ingresa primero el código de barras'); return; }
    setLookupBusy(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const data = await lookupProductByBarcode(code);
      if (!data.ok) {
        setLookupError(data.error || 'Producto no encontrado en ninguna base de datos');
      } else {
        setLookupResult(data);
      }
    } catch (e: any) {
      setLookupError(e?.message || 'Error consultando bases de datos');
    } finally {
      setLookupBusy(false);
    }
  };

  // Aplica los datos del resultado al producto actual (el usuario decide qué)
  const applyLookup = (opts: { name: boolean; brand: boolean; category: boolean; description: boolean; image: boolean }) => {
    if (!lookupResult?.product) return;
    const p = lookupResult.product;
    const patch: Partial<Product> = {};
    if (opts.name && p.name && !product.nombre.trim()) patch.nombre = p.name;
    if (opts.brand && p.brand && !product.marca) patch.marca = p.brand;
    if (opts.category && p.category && !product.categoria) patch.categoria = capitalize(p.category);
    if (opts.description && p.description && !product.descripcion) patch.descripcion = p.description;
    if (opts.image && p.image) {
      const next = [p.image, ...(product.images || []).filter(u => u !== p.image)];
      patch.images = next;
      patch.imageUrl = p.image;
    }
    update(patch);
    setLookupResult(null);
  };

  const handleSave = async () => {
    if (!businessId || !userProfile) return;
    if (!product.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (duplicateCodeWarning && !isEdit) { setError(duplicateCodeWarning); return; }

    setSaving(true); setError(null);
    try {
      const payload: any = {
        ...product,
        nombre: product.nombre.trim(),
        codigo: (product.codigo || '').trim() || `SKU-${Date.now().toString(36).toUpperCase()}`,
        precioDetal: parseFloat(pricing.priceSinIVA.toFixed(4)),
        precioMayor: product.precioMayor || parseFloat((pricing.priceSinIVA * 0.9).toFixed(4)),
        margenDetal: margenPct,
        updatedAt: new Date().toISOString(),
      };

      if (isEdit && productId) {
        await setDoc(doc(db, `businesses/${businessId}/products`, productId), payload, { merge: true });
      } else {
        payload.createdAt = serverTimestamp();
        payload.status = payload.status || 'active';
        await addDoc(collection(db, `businesses/${businessId}/products`), payload);
      }

      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 1200);
    } catch (e: any) {
      setError(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header estático (no sticky para no chocar con el sticky de los tabs del orchestrator) */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 sm:px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-white/60 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]"
        >
          <ArrowLeft size={14} /> Volver al catálogo
        </button>
        <span className="text-slate-300 dark:text-white/20">/</span>
        <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate flex-1">
          {isEdit ? `Editar: ${product.nombre || '...'}` : duplicateFromId ? 'Duplicar producto' : 'Nuevo producto'}
        </h1>
        {success && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <CheckCircle2 size={12} /> Guardado
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !product.nombre.trim() || !!duplicateCodeWarning}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* PANEL IZQUIERDO: Pricing en vivo (sticky bajo el header de tabs) */}
        <aside className="lg:sticky lg:top-16 lg:self-start space-y-3">
          <PricingPanel
            product={product}
            update={update}
            pricing={pricing}
            strategy={strategy}
            setStrategy={setStrategy}
            margenPct={margenPct}
            setMargenPct={setMargenPct}
            precioInputBs={precioInputBs}
            setPrecioInputBs={setPrecioInputBs}
            descuentoEspecialPct={descuentoEspecialPct}
            setDescuentoEspecialPct={setDescuentoEspecialPct}
            tasaBCV={tasaBCV}
          />

          {/* Vista previa POS */}
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2 inline-flex items-center gap-1">
              <Eye size={11} /> Vista previa en POS
            </p>
            <div className="rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 p-3 text-white">
              <p className="text-xs font-bold truncate">{product.nombre || 'Sin nombre'}</p>
              <p className="text-[10px] text-white/50 font-mono">{product.codigo || '—'}</p>
              <div className="flex items-end justify-between mt-2">
                <div>
                  <p className="text-[10px] text-white/40">Precio</p>
                  <p className="text-lg font-bold tabular-nums">${pricing.priceConIVA.toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-white/50 tabular-nums">Bs. {pricing.priceConIVABs.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* PANEL DERECHO: Secciones colapsables */}
        <main className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 sm:p-6 space-y-6">
          {/* 1. Identificación */}
          <Section
            id="identificacion"
            title="Identificación"
            icon={<Hash size={14} className="text-indigo-500" />}
            required
          >
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
              <div>
                <Label>Código / SKU</Label>
                <div className="relative">
                  <input
                    value={product.codigo}
                    onChange={e => update({ codigo: e.target.value })}
                    placeholder="Auto si vacío"
                    className={`w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border text-sm font-semibold tabular-nums ${
                      duplicateCodeWarning ? 'border-rose-400 text-rose-600' : 'border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-white/90'
                    } outline-none focus:ring-2 focus:ring-indigo-500/20`}
                  />
                </div>
                <button onClick={generateCode} className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                  ✨ Generar código
                </button>
                {duplicateCodeWarning && <p className="text-[11px] text-rose-600 mt-0.5">{duplicateCodeWarning}</p>}
              </div>

              <div>
                <Label required>Nombre del producto</Label>
                <input
                  autoFocus
                  value={product.nombre}
                  onChange={e => update({ nombre: e.target.value })}
                  placeholder="Ej: Coca Cola 2L"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div className="mt-3">
              <Label>Código de barras (EAN/UPC) — opcional</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={product.barcode || ''}
                    onChange={e => { setBarcodeManuallyEdited(true); update({ barcode: e.target.value }); }}
                    placeholder="Mismo que el SKU si no se edita (ej: 7591057046101)"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-mono text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                  />
                </div>
                <button
                  onClick={handleLookupBarcode}
                  disabled={lookupBusy || !(product.barcode || '').trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 shadow-sm whitespace-nowrap"
                  title="Busca info del producto en Open Food Facts, UPC ItemDB y otras bases de datos gratuitas"
                >
                  {lookupBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Buscar info
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                El <span className="font-semibold">SKU</span> es tu código interno; el <span className="font-semibold">código de barras</span> es el de fábrica que lee el escáner. <span className="text-violet-600 dark:text-violet-400">"Buscar info"</span> consulta bases de datos gratuitas para autocompletar nombre, marca e imagen.
              </p>
              {lookupError && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]">
                  <AlertTriangle size={11} /> {lookupError}
                </div>
              )}
            </div>

            <div className="mt-3">
              <Label>Descripción (opcional)</Label>
              <textarea
                value={product.descripcion || ''}
                onChange={e => update({ descripcion: e.target.value })}
                rows={2}
                placeholder="Descripción detallada del producto…"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <ToggleField
                label="Es un servicio (no descuenta stock)"
                value={!!product.esServicio}
                onChange={v => update({ esServicio: v })}
              />
              <ToggleField
                label="Es un kit (compuesto por componentes)"
                value={!!product.isKit}
                onChange={v => update({ isKit: v })}
              />
              <ToggleField
                label="Tiene variantes (talla, color…)"
                value={!!product.hasVariants}
                onChange={v => update({ hasVariants: v })}
              />
            </div>
          </Section>

          {/* 2. Categorización */}
          <Section
            id="categorizacion"
            title="Categorización"
            icon={<Tag size={14} className="text-violet-500" />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Categoría</Label>
                <input
                  list="dl-cats"
                  value={product.categoria || ''}
                  onChange={e => update({ categoria: e.target.value })}
                  placeholder="Ej: Bebidas"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
                <datalist id="dl-cats">{allCategories.map(c => <option key={c.cat} value={c.cat} />)}</datalist>
              </div>
              <div>
                <Label>Subcategoría</Label>
                <input
                  list="dl-subcats"
                  value={product.subcategoria || ''}
                  onChange={e => update({ subcategoria: e.target.value })}
                  placeholder="Ej: Refrescos"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
                <datalist id="dl-subcats">
                  {Array.from(allCategories.find(c => c.cat === product.categoria)?.subcats || []).map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Marca</Label>
                <input
                  value={product.marca || ''}
                  onChange={e => update({ marca: e.target.value })}
                  placeholder="Ej: Coca-Cola"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <Label>Proveedor preferido</Label>
                <input
                  value={product.proveedor || ''}
                  onChange={e => update({ proveedor: e.target.value })}
                  placeholder="Ej: Distribuidora XYZ"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <Label>Ubicación física</Label>
                <input
                  value={product.ubicacion || ''}
                  onChange={e => update({ ubicacion: e.target.value })}
                  placeholder="Ej: Pasillo 3 / Estante B"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <Label>Tipo de IVA</Label>
                <select
                  value={product.ivaTipo}
                  onChange={e => {
                    const tipo = e.target.value as Product['ivaTipo'];
                    update({ ivaTipo: tipo, iva: tipo === 'EXENTO' ? 0 : tipo === 'REDUCIDO' ? 8 : 16 });
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                >
                  <option value="GENERAL">General (16%)</option>
                  <option value="REDUCIDO">Reducido (8%)</option>
                  <option value="EXENTO">Exento (0%)</option>
                </select>
              </div>
            </div>
          </Section>

          {/* 3. Inventario */}
          <Section
            id="inventario"
            title="Stock e inventario"
            icon={<Boxes size={14} className="text-amber-500" />}
            badge={product.esServicio ? 'No aplica (servicio)' : undefined}
            disabled={product.esServicio}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label>Stock inicial</Label>
                <NumInput value={product.stock} onChange={v => update({ stock: v })} disabled={product.esServicio || isEdit} />
                {isEdit && <p className="text-[10px] text-slate-400 mt-0.5">Edita stock desde Recepción o Ajustes</p>}
              </div>
              <div>
                <Label>Stock mínimo</Label>
                <NumInput value={product.stockMinimo} onChange={v => update({ stockMinimo: v })} disabled={product.esServicio} />
                <p className="text-[10px] text-slate-400 mt-0.5">Para alertas de reposición</p>
              </div>
              <div>
                <Label>Stock máximo</Label>
                <NumInput value={product.stockMaximo || 0} onChange={v => update({ stockMaximo: v })} disabled={product.esServicio} />
                <p className="text-[10px] text-slate-400 mt-0.5">Punto de reorden</p>
              </div>
              <div>
                <Label>Unidades por bulto</Label>
                <NumInput value={product.unidadesPorBulto || 1} onChange={v => update({ unidadesPorBulto: v })} />
                <p className="text-[10px] text-slate-400 mt-0.5">1 = unidad simple</p>
              </div>
              <div>
                <Label>Presentación</Label>
                <select
                  value={product.unitType || 'unidad'}
                  onChange={e => update({ unitType: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                >
                  <option value="unidad">Unidad (UND)</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="ton">Tonelada (ton)</option>
                  <option value="lt">Litro (L)</option>
                  <option value="ml">Mililitro (mL)</option>
                  <option value="lb">Libra (lb)</option>
                </select>
              </div>
              <div>
                <Label>Lote (opcional)</Label>
                <input
                  value={product.lote || ''}
                  onChange={e => update({ lote: e.target.value })}
                  placeholder="Ej: L20260415"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <Label>Vencimiento (opcional)</Label>
                <input
                  type="date"
                  value={product.fechaVencimiento || ''}
                  onChange={e => update({ fechaVencimiento: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          </Section>

          {/* 4. Imágenes */}
          <Section
            id="imagenes"
            title="Imágenes del producto"
            icon={<ImageIcon size={14} className="text-pink-500" />}
          >
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(product.images || []).map((url, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
                      <img src={url} alt={`Producto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 p-1 rounded bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-indigo-500/90 text-white text-[9px] font-bold">PRINCIPAL</span>
                      )}
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-white/[0.1] hover:border-indigo-400 dark:hover:border-indigo-500/50 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-indigo-500 transition-colors">
                    <Camera size={20} />
                    <span className="text-[10px] mt-1 font-semibold">Agregar</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                      }}
                    />
                  </label>
                </div>
              <p className="text-[10px] text-slate-400 mt-1">La primera imagen es la principal · Cloudinary CDN</p>
            </div>
          </Section>

          {/* 5. Punto de venta */}
          <Section
            id="pos"
            title="Punto de venta"
            icon={<ShoppingCart size={14} className="text-emerald-500" />}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ToggleField
                  label="⭐ Marcar como favorito (aparece en grid rápido del POS)"
                  value={!!product.favorito}
                  onChange={v => update({ favorito: v })}
                />
                <ToggleField
                  label="$ Permitir vender en precio 0 (regalos, promos, granel)"
                  value={!!product.permitirPrecioCero}
                  onChange={v => update({ permitirPrecioCero: v })}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-white/40 px-1">
                <span className="font-semibold">Favorito</span>: el cajero lo encuentra de un click en lugar de buscarlo. Útil para los 20-30 productos que más vendes.
                <br />
                <span className="font-semibold">Precio 0</span>: por defecto el sistema bloquea ventas en $0. Activa esto para muestras gratis, regalos promocionales o productos pesados que se cobran después.
              </p>
            </div>
          </Section>

        </main>
      </div>

      {/* Modal de resultado de lookup por código de barras */}
      {lookupResult?.product && (
        <LookupResultModal
          result={lookupResult}
          existing={product}
          onApply={applyLookup}
          onClose={() => setLookupResult(null)}
        />
      )}
    </div>
  );
}

// ─── MODAL DE RESULTADO DE LOOKUP ──────────────────────────────────────────

function LookupResultModal({ result, existing, onApply, onClose }: {
  result: LookupResult;
  existing: Product;
  onApply: (opts: { name: boolean; brand: boolean; category: boolean; description: boolean; image: boolean }) => void;
  onClose: () => void;
}) {
  const p = result.product!;
  // El usuario decide qué campos sobrescribir. Por defecto se aplican los
  // campos que vienen del lookup Y que el producto NO tiene aún.
  const [applyName, setApplyName] = useState(!existing.nombre.trim() && !!p.name);
  const [applyBrand, setApplyBrand] = useState(!existing.marca && !!p.brand);
  const [applyCategory, setApplyCategory] = useState(!existing.categoria && !!p.category);
  const [applyDescription, setApplyDescription] = useState(!existing.descripcion && !!p.description);
  const [applyImage, setApplyImage] = useState(!!p.image);
  const [selectedImage, setSelectedImage] = useState(p.image || p.allImages[0] || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <Sparkles size={16} className="text-violet-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Producto encontrado</h3>
              <p className="text-[11px] text-slate-500 dark:text-white/50 inline-flex items-center gap-1">
                <Globe size={11} /> Fuente: <span className="font-semibold">{result.sourceLabel || result.source}</span> · barcode {result.barcode}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
            {/* Galería de imágenes */}
            <div>
              {selectedImage ? (
                <img src={selectedImage} alt={p.name} className="w-full aspect-square object-contain rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white" />
              ) : (
                <div className="w-full aspect-square rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] flex items-center justify-center text-slate-300">
                  <ImageIcon size={28} />
                </div>
              )}
              {p.allImages.length > 1 && (
                <div className="flex gap-1 mt-2 overflow-x-auto">
                  {p.allImages.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(url)}
                      className={`shrink-0 w-12 h-12 rounded border-2 overflow-hidden ${selectedImage === url ? 'border-violet-500' : 'border-slate-200 dark:border-white/[0.08]'}`}
                    >
                      <img src={url} alt="" className="w-full h-full object-contain bg-white" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Datos encontrados */}
            <div className="space-y-2">
              {p.name && (
                <FieldRow
                  label="Nombre"
                  value={p.name}
                  apply={applyName}
                  setApply={setApplyName}
                  current={existing.nombre}
                />
              )}
              {p.brand && (
                <FieldRow
                  label="Marca"
                  value={p.brand}
                  apply={applyBrand}
                  setApply={setApplyBrand}
                  current={existing.marca}
                />
              )}
              {p.category && (
                <FieldRow
                  label="Categoría"
                  value={capitalize(p.category)}
                  apply={applyCategory}
                  setApply={setApplyCategory}
                  current={existing.categoria}
                />
              )}
              {p.description && (
                <FieldRow
                  label="Descripción"
                  value={p.description}
                  apply={applyDescription}
                  setApply={setApplyDescription}
                  current={existing.descripcion}
                />
              )}
              {p.image && (
                <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyImage}
                    onChange={e => setApplyImage(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Imagen</p>
                    <p className="text-xs text-slate-700 dark:text-white/80">Agregar al catálogo de imágenes del producto</p>
                  </div>
                </label>
              )}
            </div>
          </div>

          {result.attempts && result.attempts.length > 1 && (
            <p className="text-[10px] text-slate-400 dark:text-white/30">
              Bases consultadas: {result.attempts.map(a => `${a.provider}${a.found ? ' ✓' : ''}`).join(' · ')}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04]">Cancelar</button>
          <button
            onClick={() => onApply({
              name: applyName,
              brand: applyBrand,
              category: applyCategory,
              description: applyDescription,
              image: applyImage,
            })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700"
          >
            <CheckCircle2 size={12} /> Aplicar selección
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, apply, setApply, current }: {
  label: string; value: string; apply: boolean; setApply: (v: boolean) => void; current?: string;
}) {
  const willOverwrite = !!current && current.trim() !== '';
  return (
    <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer">
      <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} className="mt-0.5 rounded" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
          {label}
          {willOverwrite && apply && <span className="ml-1.5 text-amber-600">⚠ sobrescribe "{current}"</span>}
        </p>
        <p className="text-xs text-slate-800 dark:text-white/80 break-words">{value}</p>
      </div>
    </label>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── PRICING PANEL (sticky a la izquierda) ─────────────────────────────────

function PricingPanel({
  product, update, pricing, strategy, setStrategy, margenPct, setMargenPct,
  precioInputBs, setPrecioInputBs, descuentoEspecialPct, setDescuentoEspecialPct, tasaBCV,
}: any) {
  const marginColor = pricing.margin >= 30 ? 'text-emerald-600 dark:text-emerald-400'
    : pricing.margin >= 10 ? 'text-amber-600 dark:text-amber-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-pink-500/10 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
            <Calculator size={12} className="text-indigo-500" /> Pricing en vivo
          </h3>
          <span className="text-[10px] text-slate-500 dark:text-white/40">Tasa BCV: <span className="font-bold tabular-nums">{tasaBCV.toFixed(2)}</span></span>
        </div>
      </div>

      {/* Costos */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Costos</p>
        <div>
          <Label small>Costo unitario USD</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              value={product.costoUSD}
              onChange={e => update({ costoUSD: parseFloat(e.target.value) || 0 })}
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-bold tabular-nums text-slate-900 dark:text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Costo en Bs (auto)</span>
          <span className="font-bold tabular-nums text-slate-700 dark:text-white/70">Bs. {pricing.costBs.toFixed(2)}</span>
        </div>
      </div>

      {/* Estrategia */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Estrategia de pricing</p>
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
        >
          {Object.entries(STRATEGY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {(strategy === 'COST_PLUS_MARGIN' || strategy === 'COST_PLUS_MARGIN_IVA') && (
          <div>
            <Label small>% Ganancia (margen)</Label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                value={margenPct}
                onChange={e => setMargenPct(parseFloat(e.target.value) || 0)}
                className="w-full pl-3 pr-8 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-bold tabular-nums outline-none focus:border-indigo-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
          </div>
        )}

        {(strategy === 'DIRECT_USD' || strategy === 'DIRECT_USD_IVA') && (
          <div>
            <Label small>Precio venta USD ({strategy === 'DIRECT_USD' ? 'sin IVA' : 'con IVA'})</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                value={product.precioDetal}
                onChange={e => update({ precioDetal: parseFloat(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-bold tabular-nums outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        )}

        {strategy === 'DIRECT_BS' && (
          <div>
            <Label small>Precio venta Bs (con IVA)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Bs.</span>
              <input
                type="number"
                step="0.01"
                value={precioInputBs}
                onChange={e => setPrecioInputBs(parseFloat(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm font-bold tabular-nums outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Precios derivados (highlight visual) */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Precios calculados</p>

        <div className="grid grid-cols-2 gap-2">
          <PriceTile label="Sin IVA" valueUSD={pricing.priceSinIVA} valueBs={pricing.priceSinIVABs} />
          <PriceTile label="Con IVA" valueUSD={pricing.priceConIVA} valueBs={pricing.priceConIVABs} highlight />
        </div>

        <div className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded bg-slate-50 dark:bg-white/[0.03]">
          <span className="text-slate-500">Margen real</span>
          <span className={`font-bold tabular-nums ${marginColor}`}>
            {pricing.margin.toFixed(1)}% · ${pricing.profit.toFixed(2)} de ganancia
          </span>
        </div>
      </div>

      {/* Descuento especial */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">Descuento especial</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="number"
              step="0.5"
              value={descuentoEspecialPct}
              onChange={e => setDescuentoEspecialPct(parseFloat(e.target.value) || 0)}
              className="w-full pl-3 pr-8 py-1.5 rounded bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold tabular-nums outline-none focus:border-indigo-400"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
          </div>
          <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
            ${pricing.priceWithDiscount.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceTile({ label, valueUSD, valueBs, highlight }: { label: string; valueUSD: number; valueBs: number; highlight?: boolean }) {
  return (
    <div className={`px-2.5 py-2 rounded-lg ${highlight ? 'bg-gradient-to-br from-indigo-500/15 to-violet-500/10 border border-indigo-200 dark:border-indigo-500/30' : 'bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">{label}</p>
      <p className={`text-base font-bold tabular-nums ${highlight ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>${valueUSD.toFixed(2)}</p>
      <p className="text-[10px] text-slate-500 dark:text-white/50 tabular-nums">Bs. {valueBs.toFixed(2)}</p>
    </div>
  );
}

// ─── SECTION ───────────────────────────────────────────────────────────────

// Subhead estilo Plade/Odoo: barra slim con título centrado en mayúsculas
// + línea horizontal arriba/abajo. Sin cards envolventes ni bordes gruesos.
function Section({ title, icon, required, badge, disabled, children }: {
  id?: string; title: string; icon: React.ReactNode;
  // props legacy ignorados
  open?: boolean; onToggle?: () => void;
  required?: boolean; badge?: string; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={disabled ? 'opacity-60' : ''}>
      <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-slate-200 dark:border-white/[0.06]">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-white/80">{title}</span>
        {required && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[9px] font-bold">REQUERIDO</span>}
        {badge && <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 text-[10px] font-semibold">{badge}</span>}
        <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.04]" />
      </div>
      {!disabled && <div className="pb-2">{children}</div>}
    </div>
  );
}

// ─── HELPERS UI ────────────────────────────────────────────────────────────

function Label({ children, required, small }: { children: React.ReactNode; required?: boolean; small?: boolean }) {
  return (
    <label className={`block ${small ? 'text-[10px]' : 'text-[10px]'} font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1`}>
      {children} {required && <span className="text-rose-500">*</span>}
    </label>
  );
}

function NumInput({ value, onChange, disabled, step = 1 }: { value: number; onChange: (v: number) => void; disabled?: boolean; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm tabular-nums text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 disabled:opacity-50"
    />
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
        value
          ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60'
      }`}
    >
      {value ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
      {label}
    </button>
  );
}

// ─── INITIAL ───────────────────────────────────────────────────────────────

function getInitialProduct(): Product {
  return {
    codigo: '',
    nombre: '',
    descripcion: '',
    marca: '',
    proveedor: '',
    categoria: '',
    subcategoria: '',
    ubicacion: '',
    costoUSD: 0,
    precioDetal: 0,
    precioMayor: 0,
    stock: 0,
    stockMinimo: 5,
    iva: 16,
    ivaTipo: 'GENERAL',
    unidad: 'UND',
    unitType: 'unidad',
    unidadesPorBulto: 1,
    barcode: '',
    images: [],
    esServicio: false,
    isKit: false,
    hasVariants: false,
    status: 'active',
  };
}

// `Section` ya no necesita `disabled` prop separado pero lo dejo en signature.

