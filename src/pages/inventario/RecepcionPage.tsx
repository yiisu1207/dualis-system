// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  RECEPCIÓN DE MERCANCÍA — Pantalla dedicada (Odoo/Plade-killer)          ║
// ║                                                                          ║
// ║  Wizard de 3 pasos full-screen con feedback en vivo:                     ║
// ║                                                                          ║
// ║   1. Proveedor & Factura                                                 ║
// ║      · Selector proveedor con búsqueda (creación inline si no existe)    ║
// ║      · Nro factura, fecha, condición de pago, tasa BCV/Grupo/Divisa      ║
// ║      · Detección automática de duplicado (proveedor + nro factura)       ║
// ║                                                                          ║
// ║   2. Productos & Costos                                                  ║
// ║      · Buscador con scanner-friendly (foco automático, Enter agrega)     ║
// ║      · Soporta agregar productos NUEVOS al vuelo                         ║
// ║      · Por línea: cantidad, costo unit, lote, vencimiento                ║
// ║      · Cálculo en vivo de:                                               ║
// ║          - Costo promedio ponderado (vs costo actual)                    ║
// ║          - Δ% del costo (alerta si subió >20%)                           ║
// ║          - Sugerencia de margen → precio detal nuevo                     ║
// ║      · Establecer utilidad inline (estilo Plade)                         ║
// ║      · Checkbox "actualizar costo permanente del producto"               ║
// ║      · Subtotales y total con IVA + IGTF si aplica                       ║
// ║                                                                          ║
// ║   3. Confirmar & Procesar                                                ║
// ║      · Resumen ANTES/DESPUÉS por producto (costo, stock, precio)         ║
// ║      · "Días de retraso de carga" si fecha factura < hoy                 ║
// ║      · Auto-CxP toggle (genera factura en libro mayor del proveedor)     ║
// ║      · Procesamiento atómico con barra de progreso en vivo               ║
// ║      · Pantalla de éxito con accesos a la factura, kardex, etiquetas     ║
// ║                                                                          ║
// ║  Conecta a: products (write), stock_movements (mirror legacy),           ║
// ║  inventoryMovements (mirror nuevo), movements (auto-CxP root collection) ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, addDoc, doc, setDoc, onSnapshot, query, where, orderBy,
  serverTimestamp, getDocs, limit as fbLimit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useRates } from '../../context/RatesContext';
import { weightedAverageCost } from '../../utils/costAveraging';
import {
  Truck, Search, Plus, X, Check, ChevronRight, ChevronLeft, AlertTriangle,
  Loader2, Package, FileText, DollarSign, Percent, Calendar,
  ArrowRight, Building2, CheckCircle2, TrendingUp, TrendingDown, Hash,
  Sparkles, ClipboardCheck, Zap, RotateCcw, Trash2, Tag,
} from 'lucide-react';
import { MovementType } from '../../../types';
import type { Supplier, Movement, CustomRate } from '../../../types';

// ─── TYPES ────────────────────────────────────────────────────────────────

interface ProductLite {
  id: string;
  codigo?: string;
  nombre: string;
  costoUSD?: number;
  precioDetal?: number;
  precioMayor?: number;
  stock?: number;
  categoria?: string;
  barcode?: string;
}

interface Line {
  rowId: string;
  productId: string | null; // null si es producto nuevo aún sin guardar
  productName: string;
  productCode?: string;
  qty: number;
  costPerUnit: number;
  oldStock: number;
  oldCost: number;
  lote: string;
  fechaVencimiento: string;
  // Sugerencia de venta
  suggestedMargin: number;   // %
  newPrecioDetal: number;    // calculado
  applyNewPrice: boolean;    // si actualiza precio del catálogo al procesar
  isNew?: boolean;           // producto nuevo a crear
}

type Step = 1 | 2 | 3 | 4;
type AccountType = string; // 'BCV' | customRate.id

const PAYMENT_CONDITIONS = [
  { value: 'CONTADO', label: 'Contado', days: 0 },
  { value: 'CREDITO15', label: 'Crédito 15 días', days: 15 },
  { value: 'CREDITO30', label: 'Crédito 30 días', days: 30 },
  { value: 'CREDITO45', label: 'Crédito 45 días', days: 45 },
  { value: 'CREDITO60', label: 'Crédito 60 días', days: 60 },
];

// ─── COMPONENT ─────────────────────────────────────────────────────────────

export default function RecepcionPage() {
  const { userProfile } = useAuth();
  const { rates, customRates } = useRates();
  const businessId = userProfile?.businessId;

  // Wizard
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [savedMovementId, setSavedMovementId] = useState<string | null>(null);

  // Step 1 data
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [nroFactura, setNroFactura] = useState('');
  const [fechaFactura, setFechaFactura] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentCondition, setPaymentCondition] = useState('CONTADO');
  const [accountType, setAccountType] = useState<AccountType>('BCV');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Step 2 data
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Step 3 options
  const [autoCxP, setAutoCxP] = useState(true);
  const [updateCatalogCosts, setUpdateCatalogCosts] = useState(true);

  // Data subscriptions
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  useEffect(() => {
    if (!businessId) return;
    const u1 = onSnapshot(query(collection(db, 'suppliers'), where('businessId', '==', businessId)), snap => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const u2 = onSnapshot(collection(db, `businesses/${businessId}/products`), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => { u1(); u2(); };
  }, [businessId]);

  // Detección de duplicado
  useEffect(() => {
    if (!supplierId || !nroFactura.trim() || !businessId) { setDuplicateWarning(null); return; }
    const t = setTimeout(async () => {
      const q = query(
        collection(db, 'movements'),
        where('businessId', '==', businessId),
        where('entityId', '==', supplierId),
        where('nroControl', '==', nroFactura.trim()),
        fbLimit(1),
      );
      const snap = await getDocs(q);
      if (!snap.empty) setDuplicateWarning(`Ya existe una factura #${nroFactura} de este proveedor. Verifica antes de continuar.`);
      else setDuplicateWarning(null);
    }, 400);
    return () => clearTimeout(t);
  }, [supplierId, nroFactura, businessId]);

  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId]);
  const filteredSuppliers = useMemo(() => {
    const s = supplierSearch.trim().toLowerCase();
    if (!s) return suppliers.slice(0, 30);
    return suppliers.filter(sup => {
      const txt = `${(sup as any).nombre || sup.id || ''} ${sup.rif || ''} ${sup.contacto || ''}`.toLowerCase();
      return txt.includes(s);
    }).slice(0, 30);
  }, [suppliers, supplierSearch]);

  const filteredProducts = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    const addedIds = new Set(lines.map(l => l.productId).filter(Boolean));
    const pool = products.filter(p => !addedIds.has(p.id));
    if (!s) return pool.slice(0, 20);
    return pool.filter(p =>
      (p.nombre || '').toLowerCase().includes(s) ||
      (p.codigo || '').toLowerCase().includes(s) ||
      (p.barcode || '').toLowerCase().includes(s)
    ).slice(0, 20);
  }, [products, productSearch, lines]);

  const tasaActual = useMemo(() => {
    if (accountType === 'BCV') return rates.tasaBCV || 1;
    const cr = customRates.find(r => r.id === accountType);
    return cr?.value || rates.tasaBCV || 1;
  }, [accountType, rates, customRates]);

  // Totales
  const totalUSD = useMemo(() => lines.reduce((s, l) => s + l.qty * l.costPerUnit, 0), [lines]);
  const totalBs = totalUSD * tasaActual;
  const totalUnits = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  // Cambios de costo significativos
  const costAlerts = useMemo(() => {
    return lines
      .map(l => {
        const newAvg = weightedAverageCost(l.oldStock, l.oldCost, l.qty, l.costPerUnit);
        const oldC = l.oldCost || 0;
        const deltaPct = oldC > 0 ? ((newAvg - oldC) / oldC) * 100 : 0;
        return { ...l, newAvgCost: newAvg, deltaPct };
      });
  }, [lines]);

  // Días de retraso de carga
  const diasRetraso = useMemo(() => {
    const f = new Date(fechaFactura).getTime();
    const hoy = new Date().setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((hoy - f) / (1000 * 60 * 60 * 24)));
  }, [fechaFactura]);

  // ─── Acciones ─────────────────────────────────────────────────────────

  const addProduct = (p: ProductLite) => {
    setLines(prev => [...prev, {
      rowId: `r_${Date.now().toString(36)}_${prev.length}`,
      productId: p.id,
      productName: p.nombre,
      productCode: p.codigo,
      qty: 1,
      costPerUnit: p.costoUSD || 0,
      oldStock: Number(p.stock || 0),
      oldCost: Number(p.costoUSD || 0),
      lote: '',
      fechaVencimiento: '',
      suggestedMargin: p.precioDetal && p.costoUSD ? ((p.precioDetal - p.costoUSD) / p.costoUSD * 100) : 30,
      newPrecioDetal: p.precioDetal || 0,
      applyNewPrice: false,
    }]);
    setProductSearch('');
    setShowProductPicker(false);
    setTimeout(() => productSearchRef.current?.focus(), 50);
  };

  const addNewProduct = (name: string) => {
    setLines(prev => [...prev, {
      rowId: `r_new_${Date.now().toString(36)}`,
      productId: null,
      productName: name,
      qty: 1,
      costPerUnit: 0,
      oldStock: 0,
      oldCost: 0,
      lote: '',
      fechaVencimiento: '',
      suggestedMargin: 30,
      newPrecioDetal: 0,
      applyNewPrice: true,
      isNew: true,
    }]);
    setProductSearch('');
    setShowProductPicker(false);
  };

  const updateLine = (rowId: string, patch: Partial<Line>) => {
    setLines(prev => prev.map(l => {
      if (l.rowId !== rowId) return l;
      const next = { ...l, ...patch };
      // recalcula precio detal sugerido si cambió costo o margen
      if (patch.costPerUnit !== undefined || patch.suggestedMargin !== undefined) {
        next.newPrecioDetal = next.costPerUnit * (1 + (next.suggestedMargin || 0) / 100);
      }
      return next;
    }));
  };

  const removeLine = (rowId: string) => setLines(prev => prev.filter(l => l.rowId !== rowId));

  // Validaciones por paso
  const canStep1 = supplierId && nroFactura.trim().length > 0 && fechaFactura;
  const canStep2 = lines.length > 0 && lines.every(l => l.qty > 0 && l.costPerUnit > 0 && l.productName.trim().length > 0);
  const canProcess = canStep1 && canStep2 && !busy;

  // ─── Procesamiento ────────────────────────────────────────────────────

  const handleProcess = async () => {
    if (!canProcess || !businessId || !userProfile) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: lines.length + (autoCxP ? 1 : 0) });

    try {
      const adjusted: { name: string; oldCost: number; newCost: number }[] = [];

      // 1. Para cada línea: actualizar/crear producto, escribir kardex
      for (const line of lines) {
        let productId = line.productId;
        let productNameFinal = line.productName;

        // Crear producto nuevo si aplica
        if (!productId) {
          const newDoc = await addDoc(collection(db, `businesses/${businessId}/products`), {
            nombre: line.productName.trim(),
            codigo: line.productCode || `SKU-${Date.now().toString(36).toUpperCase()}`,
            categoria: 'General',
            costoUSD: line.costPerUnit,
            precioDetal: line.applyNewPrice ? line.newPrecioDetal : line.costPerUnit * 1.3,
            precioMayor: line.applyNewPrice ? line.newPrecioDetal * 0.95 : line.costPerUnit * 1.2,
            stock: line.qty,
            stockMinimo: 5,
            iva: 16,
            ivaTipo: 'GENERAL',
            unitType: 'unidad',
            unidad: 'UND',
            stockByAlmacen: { principal: line.qty },
            ...(line.lote ? { lote: line.lote } : {}),
            ...(line.fechaVencimiento ? { fechaVencimiento: line.fechaVencimiento } : {}),
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: new Date().toISOString(),
          });
          productId = newDoc.id;
        } else {
          // Actualizar producto existente: stock + costo promedio
          const existing = products.find(p => p.id === productId);
          if (!existing) throw new Error(`Producto no encontrado: ${line.productName}`);
          const newAvgCost = updateCatalogCosts
            ? parseFloat(weightedAverageCost(line.oldStock, line.oldCost, line.qty, line.costPerUnit).toFixed(4))
            : existing.costoUSD || 0;
          const newStock = (existing.stock || 0) + line.qty;
          const stockMap = (existing as any).stockByAlmacen || {};
          const baseAlmacenStock = Object.prototype.hasOwnProperty.call(stockMap, 'principal')
            ? Number(stockMap.principal || 0)
            : Number(existing.stock || 0);
          const newAlmacenStock = baseAlmacenStock + line.qty;

          const updatePayload: Record<string, any> = {
            stock: newStock,
            stockByAlmacen: { ...stockMap, principal: newAlmacenStock },
            updatedAt: new Date().toISOString(),
          };
          if (updateCatalogCosts) {
            updatePayload.costoUSD = newAvgCost;
            updatePayload.previousCostoUSD = existing.costoUSD || 0;
          }
          if (line.applyNewPrice && line.newPrecioDetal > 0) {
            updatePayload.precioDetal = parseFloat(line.newPrecioDetal.toFixed(2));
          }
          if (line.lote) updatePayload.lote = line.lote;
          if (line.fechaVencimiento) updatePayload.fechaVencimiento = line.fechaVencimiento;

          await setDoc(doc(db, `businesses/${businessId}/products`, productId), updatePayload, { merge: true });

          if (Math.abs(newAvgCost - (line.oldCost || 0)) >= 0.01) {
            adjusted.push({ name: line.productName, oldCost: line.oldCost, newCost: newAvgCost });
          }
        }

        // 2. Mirror al kardex legacy + nuevo
        const kardexBase = {
          productId,
          productName: productNameFinal,
          type: 'COMPRA',
          quantity: line.qty,
          unitCostUSD: line.costPerUnit,
          reason: `Recepción${nroFactura ? ` #${nroFactura}` : ''}${selectedSupplier ? ` — ${(selectedSupplier as any).nombre || selectedSupplier.id}` : ''}`,
          proveedorId: supplierId,
          proveedorNombre: (selectedSupplier as any)?.nombre || selectedSupplier?.id || '',
          warehouseId: 'principal',
          warehouseName: 'Principal',
          ...(line.lote ? { lote: line.lote } : {}),
          ...(line.fechaVencimiento ? { fechaVencimiento: line.fechaVencimiento } : {}),
          userName: userProfile.fullName || 'Admin',
          createdBy: userProfile.uid,
          createdByName: userProfile.fullName || userProfile.email || 'Admin',
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, `businesses/${businessId}/stock_movements`), kardexBase);
        await addDoc(collection(db, `businesses/${businessId}/inventoryMovements`), kardexBase);

        setProgress(p => ({ ...p, done: p.done + 1 }));
      }

      // 3. Auto-CxP: factura en libro mayor del proveedor
      if (autoCxP) {
        const condDays = PAYMENT_CONDITIONS.find(c => c.value === paymentCondition)?.days || 0;
        const dueDate = condDays > 0
          ? new Date(new Date(fechaFactura).getTime() + condDays * 86400000).toISOString().slice(0, 10)
          : fechaFactura;

        const movDoc = await addDoc(collection(db, 'movements'), {
          entityId: supplierId,
          entityName: (selectedSupplier as any)?.nombre || selectedSupplier?.id || '',
          businessId,
          ownerId: userProfile.uid,
          vendedorId: userProfile.uid,
          vendedorNombre: userProfile.fullName || 'Admin',
          date: fechaFactura,
          concept: `Recepción${nroFactura ? ` #${nroFactura}` : ''} — ${lines.length} producto${lines.length !== 1 ? 's' : ''}, ${totalUnits} unidades`,
          amountInUSD: parseFloat(totalUSD.toFixed(2)),
          amount: parseFloat(totalBs.toFixed(2)),
          currency: 'USD',
          movementType: MovementType.FACTURA,
          accountType,
          rateUsed: tasaActual,
          nroControl: nroFactura.trim(),
          isSupplierMovement: true,
          paymentCondition,
          paymentDays: condDays,
          dueDate,
          items: lines.map(l => ({ id: l.productId || `new_${l.rowId}`, nombre: l.productName, qty: l.qty, price: l.costPerUnit, subtotal: l.qty * l.costPerUnit })),
          createdAt: new Date().toISOString(),
        });
        setSavedMovementId(movDoc.id);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }

      setStep(4); // Pantalla de éxito
    } catch (e: any) {
      console.error('[Recepción] error:', e);
      setError(e?.message || 'Error procesando recepción.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep(1);
    setSupplierId('');
    setNroFactura('');
    setLines([]);
    setSavedMovementId(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
  };

  // ─── RENDER ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <Stepper step={step} />

      {/* Hero compacto con resumen vivo */}
      {step !== 4 && (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/30 dark:from-emerald-500/[0.04] dark:via-white/[0.02] dark:to-emerald-500/[0.04] p-3 flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow">
            <Truck size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Recepción de mercancía</p>
            <p className="text-[11px] text-slate-500 dark:text-white/40">
              {selectedSupplier ? <>De <span className="font-semibold">{(selectedSupplier as any).nombre || selectedSupplier.id}</span></> : 'Sin proveedor seleccionado'}
              {nroFactura && <> · Factura #{nroFactura}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] tabular-nums">
            {lines.length > 0 && (
              <>
                <Stat label="Líneas" value={lines.length} />
                <Stat label="Unidades" value={totalUnits} />
                <Stat label="Total USD" value={`$${totalUSD.toFixed(2)}`} highlight />
              </>
            )}
          </div>
        </div>
      )}

      {/* Contenido por paso */}
      {step === 1 && (
        <Step1
          suppliers={suppliers}
          supplierId={supplierId}
          setSupplierId={setSupplierId}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          showSupplierPicker={showSupplierPicker}
          setShowSupplierPicker={setShowSupplierPicker}
          filteredSuppliers={filteredSuppliers}
          nroFactura={nroFactura}
          setNroFactura={setNroFactura}
          fechaFactura={fechaFactura}
          setFechaFactura={setFechaFactura}
          paymentCondition={paymentCondition}
          setPaymentCondition={setPaymentCondition}
          accountType={accountType}
          setAccountType={setAccountType}
          customRates={customRates}
          rates={rates}
          tasaActual={tasaActual}
          duplicateWarning={duplicateWarning}
          diasRetraso={diasRetraso}
        />
      )}

      {step === 2 && (
        <Step2
          lines={lines}
          updateLine={updateLine}
          removeLine={removeLine}
          showProductPicker={showProductPicker}
          setShowProductPicker={setShowProductPicker}
          productSearch={productSearch}
          setProductSearch={setProductSearch}
          productSearchRef={productSearchRef}
          filteredProducts={filteredProducts}
          addProduct={addProduct}
          addNewProduct={addNewProduct}
          costAlerts={costAlerts}
          tasaActual={tasaActual}
          totalBs={totalBs}
        />
      )}

      {step === 3 && (
        <Step3
          lines={lines}
          costAlerts={costAlerts}
          autoCxP={autoCxP}
          setAutoCxP={setAutoCxP}
          updateCatalogCosts={updateCatalogCosts}
          setUpdateCatalogCosts={setUpdateCatalogCosts}
          totalUSD={totalUSD}
          totalBs={totalBs}
          tasaActual={tasaActual}
          accountType={accountType}
          paymentCondition={paymentCondition}
          fechaFactura={fechaFactura}
          diasRetraso={diasRetraso}
          supplier={selectedSupplier}
          nroFactura={nroFactura}
          busy={busy}
          progress={progress}
          error={error}
        />
      )}

      {step === 4 && (
        <Step4Success
          adjustedCount={lines.length}
          totalUSD={totalUSD}
          movementId={savedMovementId}
          autoCxP={autoCxP}
          onReset={reset}
        />
      )}

      {/* Nav buttons */}
      {step !== 4 && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setStep(s => (s > 1 ? (s - 1) as Step : s))}
            disabled={step === 1 || busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.04] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <ChevronLeft size={14} /> Atrás
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={(step === 1 && !canStep1) || (step === 2 && !canStep2)}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
            >
              Continuar <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleProcess}
              disabled={!canProcess}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
            >
              {busy ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : <><CheckCircle2 size={14} /> Procesar recepción</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STEPPER ───────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: 'Proveedor & Factura', icon: Building2 },
    { n: 2, label: 'Productos & Costos', icon: Package },
    { n: 3, label: 'Confirmar', icon: ClipboardCheck },
  ];
  return (
    <div className="flex items-center gap-2 text-xs overflow-x-auto pb-1">
      {items.map((it, i) => {
        const Icon = it.icon;
        const isActive = step === it.n;
        const isDone = step > it.n || step === 4;
        return (
          <React.Fragment key={it.n}>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${
              isDone ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : isActive ? 'bg-indigo-500 text-white shadow'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/40'
            }`}>
              {isDone ? <Check size={12} /> : <Icon size={12} />}
              <span className="font-semibold whitespace-nowrap">{it.label}</span>
            </div>
            {i < items.length - 1 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="px-2.5 py-1 rounded-md bg-white/70 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06]">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-xs font-bold ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>{value}</p>
    </div>
  );
}

// ─── STEP 1 ────────────────────────────────────────────────────────────────

function Step1(props: any) {
  const {
    suppliers, supplierId, setSupplierId, supplierSearch, setSupplierSearch,
    showSupplierPicker, setShowSupplierPicker, filteredSuppliers,
    nroFactura, setNroFactura, fechaFactura, setFechaFactura,
    paymentCondition, setPaymentCondition, accountType, setAccountType,
    customRates, rates, tasaActual, duplicateWarning, diasRetraso,
  } = props;

  const selected = suppliers.find((s: any) => s.id === supplierId);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-2">
          <Building2 size={14} className="text-indigo-500" />
          Datos del proveedor y factura
        </h3>

        {/* Selector de proveedor */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
            Proveedor <span className="text-rose-500">*</span>
          </label>
          {selected && !showSupplierPicker ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                {((selected as any).nombre || selected.id || 'P').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{(selected as any).nombre || selected.id}</p>
                <p className="text-[11px] text-slate-500 dark:text-white/50">{selected.rif || '—'} · {selected.contacto || ''}</p>
              </div>
              <button onClick={() => { setSupplierId(''); setShowSupplierPicker(true); }} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={supplierSearch}
                onChange={e => { setSupplierSearch(e.target.value); setShowSupplierPicker(true); }}
                onFocus={() => setShowSupplierPicker(true)}
                placeholder="Buscar proveedor por nombre, RIF o contacto…"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              {showSupplierPicker && filteredSuppliers.length > 0 && (
                <div className="absolute z-20 mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg">
                  {filteredSuppliers.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => { setSupplierId(s.id); setShowSupplierPicker(false); setSupplierSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border-b border-slate-100 dark:border-white/[0.04] last:border-0"
                    >
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.nombre || s.id}</p>
                      <p className="text-[11px] text-slate-500 dark:text-white/40">{s.rif || '—'} · {s.contacto || ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
            Nro de factura <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={nroFactura}
              onChange={e => setNroFactura(e.target.value)}
              placeholder="Ej: 00012345"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {duplicateWarning && (
            <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]">
              <AlertTriangle size={11} /> {duplicateWarning}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
            Fecha factura
          </label>
          <div className="relative">
            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={fechaFactura}
              onChange={e => setFechaFactura(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
            />
          </div>
          {diasRetraso > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-white/40">
              Cargada {diasRetraso} día{diasRetraso !== 1 ? 's' : ''} después de su recepción
            </p>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
            Condición de pago
          </label>
          <select
            value={paymentCondition}
            onChange={e => setPaymentCondition(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
          >
            {PAYMENT_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
            Tasa de cambio (USD → Bs)
          </label>
          <select
            value={accountType}
            onChange={e => setAccountType(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400"
          >
            <option value="BCV">BCV — Bs. {(rates.tasaBCV || 0).toFixed(2)}</option>
            {customRates.filter((r: CustomRate) => r.enabled).map((r: CustomRate) => (
              <option key={r.id} value={r.id}>{r.name} — Bs. {r.value.toFixed(2)}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/40">Usando: <span className="font-semibold text-slate-700 dark:text-white/70">Bs. {tasaActual.toFixed(2)}</span></p>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 2 ────────────────────────────────────────────────────────────────

function Step2(props: any) {
  const {
    lines, updateLine, removeLine, showProductPicker, setShowProductPicker,
    productSearch, setProductSearch, productSearchRef, filteredProducts,
    addProduct, addNewProduct, costAlerts, tasaActual, totalBs,
  } = props;

  return (
    <div className="space-y-3">
      {/* Buscador / agregar producto */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={productSearchRef}
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setShowProductPicker(true); }}
              onFocus={() => setShowProductPicker(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredProducts.length === 1) addProduct(filteredProducts[0]);
              }}
              placeholder="Escanea barcode o busca por nombre/código… (Enter agrega si hay 1 resultado)"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-800 dark:text-white/90 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {productSearch.trim() && filteredProducts.length === 0 && (
            <button
              onClick={() => addNewProduct(productSearch.trim())}
              className="px-3 py-2 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-violet-200 dark:hover:bg-violet-500/25"
            >
              <Sparkles size={12} /> Crear "{productSearch.trim().slice(0, 20)}"
            </button>
          )}
        </div>

        {showProductPicker && filteredProducts.length > 0 && (
          <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/[0.06] divide-y divide-slate-100 dark:divide-white/[0.04]">
            {filteredProducts.map((p: ProductLite) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 flex items-center gap-2"
              >
                <Package size={12} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{p.nombre}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{p.codigo} · stock {p.stock || 0} · ${(p.costoUSD || 0).toFixed(2)}</p>
                </div>
                <Plus size={12} className="text-emerald-500" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Líneas */}
      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/[0.1] p-12 text-center bg-slate-50/50 dark:bg-white/[0.01]">
          <Package size={32} className="mx-auto text-slate-300 dark:text-white/15 mb-2" />
          <p className="text-sm font-semibold text-slate-500 dark:text-white/40">Sin productos agregados</p>
          <p className="text-[11px] text-slate-400 mt-1">Busca arriba para agregar productos a esta recepción.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[920px]">
              <thead className="bg-slate-50 dark:bg-white/[0.02]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-white/40">Producto</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-20">Cantidad</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">Costo unit USD</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">Subtotal</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-20">Margen %</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">→ Detal sug.</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-24">Lote</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500 dark:text-white/40 w-28">Vencimiento</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {lines.map((l: Line) => {
                  const alert = costAlerts.find((a: any) => a.rowId === l.rowId);
                  const subtotal = l.qty * l.costPerUnit;
                  return (
                    <tr key={l.rowId} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {l.isNew && <span className="px-1 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-400 text-[9px] font-bold">NUEVO</span>}
                          <input
                            value={l.productName}
                            onChange={e => updateLine(l.rowId, { productName: e.target.value })}
                            disabled={!l.isNew}
                            className="bg-transparent text-xs font-semibold text-slate-800 dark:text-white outline-none disabled:cursor-default border-b border-transparent focus:border-indigo-400 w-full max-w-[200px]"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">{l.productCode || '—'} · stock actual: {l.oldStock}</p>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={l.qty}
                          onChange={e => updateLine(l.rowId, { qty: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-right tabular-nums font-semibold text-xs"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.costPerUnit}
                          onChange={e => updateLine(l.rowId, { costPerUnit: parseFloat(e.target.value) || 0 })}
                          className={`w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border text-right tabular-nums font-semibold text-xs ${
                            alert && Math.abs(alert.deltaPct) > 20 ? 'border-amber-400' : 'border-slate-200 dark:border-white/[0.08]'
                          }`}
                        />
                        {alert && l.oldCost > 0 && Math.abs(alert.deltaPct) > 0.5 && (
                          <p className={`text-[9px] mt-0.5 tabular-nums text-right font-semibold ${
                            alert.deltaPct > 20 ? 'text-rose-600' : alert.deltaPct > 0 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {alert.deltaPct > 0 ? '↑' : '↓'} {Math.abs(alert.deltaPct).toFixed(1)}%
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-xs font-bold tabular-nums text-slate-800 dark:text-white">
                        ${subtotal.toFixed(2)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.suggestedMargin}
                            onChange={e => updateLine(l.rowId, { suggestedMargin: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-right tabular-nums text-xs pr-5"
                          />
                          <Percent size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs tabular-nums font-semibold text-emerald-600">${l.newPrecioDetal.toFixed(2)}</span>
                          <input
                            type="checkbox"
                            checked={l.applyNewPrice}
                            onChange={e => updateLine(l.rowId, { applyNewPrice: e.target.checked })}
                            title="Aplicar este precio al catálogo"
                            className="rounded shrink-0"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={l.lote}
                          onChange={e => updateLine(l.rowId, { lote: e.target.value })}
                          placeholder="—"
                          className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={l.fechaVencimiento}
                          onChange={e => updateLine(l.rowId, { fechaVencimiento: e.target.value })}
                          className="w-full px-2 py-1 rounded bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeLine(l.rowId)} className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/[0.06]">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-[11px] font-semibold text-slate-500 dark:text-white/40">Total</td>
                  <td className="px-2 py-2 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                    ${lines.reduce((s: number, l: Line) => s + l.qty * l.costPerUnit, 0).toFixed(2)}
                  </td>
                  <td colSpan={5} className="px-2 py-2 text-right text-[11px] text-slate-500 dark:text-white/40">
                    Bs. {totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STEP 3 ────────────────────────────────────────────────────────────────

function Step3(props: any) {
  const {
    lines, costAlerts, autoCxP, setAutoCxP, updateCatalogCosts, setUpdateCatalogCosts,
    totalUSD, totalBs, tasaActual, accountType, paymentCondition, fechaFactura,
    diasRetraso, supplier, nroFactura, busy, progress, error,
  } = props;

  const cond = PAYMENT_CONDITIONS.find(c => c.value === paymentCondition);
  const dueDate = cond && cond.days > 0
    ? new Date(new Date(fechaFactura).getTime() + cond.days * 86400000).toISOString().slice(0, 10)
    : fechaFactura;

  const significantChanges = costAlerts.filter((a: any) => a.oldCost > 0 && Math.abs(a.deltaPct) > 0.5);

  return (
    <div className="space-y-4">
      {/* Resumen factura */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 inline-flex items-center gap-2">
          <FileText size={14} className="text-indigo-500" /> Resumen de la factura
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCell label="Proveedor" value={(supplier as any)?.nombre || supplier?.id || '—'} />
          <SummaryCell label="Nro factura" value={`#${nroFactura}`} />
          <SummaryCell label="Fecha" value={fechaFactura} />
          <SummaryCell label="Vence" value={dueDate} />
          <SummaryCell label="Líneas / Unidades" value={`${lines.length} / ${lines.reduce((s: number, l: Line) => s + l.qty, 0)}`} />
          <SummaryCell label="Subtotal USD" value={`$${totalUSD.toFixed(2)}`} />
          <SummaryCell label="Tasa" value={`Bs. ${tasaActual.toFixed(2)} (${accountType})`} />
          <SummaryCell label="Total Bs" value={`Bs. ${totalBs.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`} highlight />
        </div>
        {diasRetraso > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-white/50 text-[11px]">
            <Calendar size={11} /> Esta factura se está cargando {diasRetraso} día{diasRetraso !== 1 ? 's' : ''} después de su recepción
          </div>
        )}
      </div>

      {/* Cambios de costo */}
      {significantChanges.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-4">
          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2 inline-flex items-center gap-2">
            <TrendingUp size={14} /> Cambios de costo detectados ({significantChanges.length})
          </h3>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-3">
            El costo promedio ponderado va a actualizarse para estos productos:
          </p>
          <div className="space-y-1">
            {significantChanges.slice(0, 8).map((a: any) => (
              <div key={a.rowId} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/60 dark:bg-white/[0.03]">
                <span className="text-slate-700 dark:text-white/80 truncate flex-1">{a.productName}</span>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-slate-400">${a.oldCost.toFixed(4)}</span>
                  <ArrowRight size={10} className="text-slate-400" />
                  <span className="font-bold text-slate-800 dark:text-white">${a.newAvgCost.toFixed(4)}</span>
                  <span className={`text-[10px] font-bold ${a.deltaPct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {a.deltaPct > 0 ? '+' : ''}{a.deltaPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opciones */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
          <Zap size={14} className="text-indigo-500" /> Opciones de procesamiento
        </h3>

        <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer">
          <input type="checkbox" checked={autoCxP} onChange={e => setAutoCxP(e.target.checked)} className="mt-0.5 rounded" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">Generar factura en CxP automáticamente</p>
            <p className="text-[11px] text-slate-500 dark:text-white/40 mt-0.5">
              Crea una factura por <span className="font-semibold tabular-nums">${totalUSD.toFixed(2)}</span> en el libro mayor del proveedor con condición {cond?.label.toLowerCase()}.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer">
          <input type="checkbox" checked={updateCatalogCosts} onChange={e => setUpdateCatalogCosts(e.target.checked)} className="mt-0.5 rounded" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">Actualizar costo permanente del producto</p>
            <p className="text-[11px] text-slate-500 dark:text-white/40 mt-0.5">
              Aplica el costo promedio ponderado al catálogo. Si no marcas, solo se registra esta compra puntual sin tocar los costos.
            </p>
          </div>
        </label>
      </div>

      {/* Progress / Error */}
      {busy && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin text-indigo-600" />
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Procesando recepción ({progress.done}/{progress.total})</p>
          </div>
          <div className="h-1.5 rounded-full bg-indigo-200/50 dark:bg-indigo-500/20 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">{label}</p>
      <p className={`text-sm font-bold tabular-nums truncate ${highlight ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

// ─── STEP 4: ÉXITO ─────────────────────────────────────────────────────────

function Step4Success({ adjustedCount, totalUSD, movementId, autoCxP, onReset }: {
  adjustedCount: number; totalUSD: number; movementId: string | null; autoCxP: boolean; onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-500/40 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-emerald-500/[0.08] dark:via-white/[0.02] dark:to-emerald-500/[0.06] p-8 text-center">
      <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500 text-white items-center justify-center mb-3 shadow-lg">
        <CheckCircle2 size={32} />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recepción procesada</h2>
      <p className="text-sm text-slate-600 dark:text-white/70 mt-1">
        {adjustedCount} producto{adjustedCount !== 1 ? 's' : ''} actualizado{adjustedCount !== 1 ? 's' : ''} · Total <span className="font-bold text-emerald-700 dark:text-emerald-400">${totalUSD.toFixed(2)}</span>
      </p>
      {autoCxP && (
        <p className="text-xs text-slate-500 dark:text-white/50 mt-2">
          Factura registrada en el libro mayor del proveedor.
        </p>
      )}
      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        <button onClick={onReset} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
          <RotateCcw size={13} /> Nueva recepción
        </button>
      </div>
    </div>
  );
}
