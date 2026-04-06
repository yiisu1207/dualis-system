import React, { useState, useMemo, useCallback } from 'react';
import { X, Search, Plus, Trash2, Truck, Loader2 } from 'lucide-react';
import type { Supplier, Movement, CustomRate, ExchangeRates } from '../../../types';
import { MovementType } from '../../../types';

interface Product {
  id: string;
  codigo: string;
  nombre: string;
  costoUSD: number;
  stock: number;
  categoria: string;
}

interface RecepcionLine {
  productId: string;
  productName: string;
  qty: number;
  costPerUnit: number;
  oldStock: number;
  oldCost: number;
}

interface RecepcionModalProps {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  products: Product[];
  bcvRate: number;
  customRates: CustomRate[];
  businessId: string;
  currentUserId: string;
  currentUserName: string;
  onSaveMovement: (data: Partial<Movement>) => Promise<void>;
  onAdjustStock: (productId: string, qty: number, newCosto: number, proveedorId: string, proveedorNombre: string, nroFactura: string) => Promise<void>;
}

export default function RecepcionModal({
  open, onClose, suppliers, products, bcvRate, customRates,
  businessId, currentUserId, currentUserName,
  onSaveMovement, onAdjustStock,
}: RecepcionModalProps) {
  const [supplierId, setSupplierId] = useState('');
  const [nroFactura, setNroFactura] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountType, setAccountType] = useState('BCV');
  const [lines, setLines] = useState<RecepcionLine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoCxP, setAutoCxP] = useState(true);

  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === supplierId), [suppliers, supplierId]);

  // Products not yet added
  const availableProducts = useMemo(() => {
    const addedIds = new Set(lines.map(l => l.productId));
    return products.filter(p => !addedIds.has(p.id));
  }, [products, lines]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return availableProducts.slice(0, 20);
    const term = searchTerm.toLowerCase();
    return availableProducts.filter(p =>
      p.nombre.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term)
    ).slice(0, 20);
  }, [availableProducts, searchTerm]);

  const totalUSD = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.costPerUnit, 0), [lines]);
  const totalBs = totalUSD * bcvRate;

  const addProduct = useCallback((p: Product) => {
    setLines(prev => [...prev, {
      productId: p.id,
      productName: p.nombre,
      qty: 1,
      costPerUnit: p.costoUSD || 0,
      oldStock: p.stock,
      oldCost: p.costoUSD || 0,
    }]);
    setShowSearch(false);
    setSearchTerm('');
  }, []);

  const updateLine = useCallback((idx: number, field: keyof RecepcionLine, value: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const canSubmit = supplierId && lines.length > 0 && lines.every(l => l.qty > 0 && l.costPerUnit > 0);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const provNombre = selectedSupplier?.contacto || selectedSupplier?.rif || '';

      // 1. Update stock + weighted avg cost for each product
      for (const line of lines) {
        const totalStock = line.oldStock + line.qty;
        const weightedCost = totalStock > 0
          ? parseFloat(((line.oldStock * line.oldCost + line.qty * line.costPerUnit) / totalStock).toFixed(4))
          : line.costPerUnit;
        await onAdjustStock(line.productId, line.qty, weightedCost, supplierId, provNombre, nroFactura);
      }

      // 2. Create CxP invoice if enabled
      if (autoCxP) {
        const rate = accountType === 'BCV' ? bcvRate : (customRates.find(r => r.id === accountType)?.value || bcvRate);
        const conceptItems = lines.map(l => `${l.productName} (${l.qty}u)`).join(', ');
        await onSaveMovement({
          entityId: supplierId,
          date: fecha,
          concept: `Recepción${nroFactura ? ` #${nroFactura}` : ''} — ${lines.length} producto(s): ${conceptItems}`,
          amountInUSD: totalUSD,
          amount: totalUSD * rate,
          currency: 'USD',
          movementType: MovementType.FACTURA,
          accountType,
          rateUsed: rate,
          nroControl: nroFactura || undefined,
          isSupplierMovement: true,
          items: lines.map(l => ({ id: l.productId, nombre: l.productName, qty: l.qty, price: l.costPerUnit, subtotal: l.qty * l.costPerUnit })),
        } as Partial<Movement>);
      }

      onClose();
      // Reset
      setSupplierId('');
      setNroFactura('');
      setLines([]);
      setAutoCxP(true);
    } catch (err) {
      console.error('Error en recepción:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <Truck className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Recepcion de Mercancia</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Ingreso multi-producto con factura CxP</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Row 1: Proveedor + Factura + Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proveedor *</label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full px-3 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">Seleccionar...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.contacto || s.rif}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nro Factura</label>
              <input
                value={nroFactura}
                onChange={e => setNroFactura(e.target.value)}
                className="w-full px-3 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="Ej: FAC-001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Products section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Productos ({lines.length})</label>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            {/* Product search dropdown */}
            {showSearch && (
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/[0.06] border border-emerald-300 dark:border-emerald-500/30 rounded-xl">
                  <Search size={14} className="text-slate-400" />
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, codigo o categoria..."
                    className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-white outline-none"
                  />
                  <button onClick={() => { setShowSearch(false); setSearchTerm(''); }} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                </div>
                {filteredProducts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full px-4 py-2.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex items-center justify-between border-b border-slate-100 dark:border-white/5 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{p.nombre}</p>
                          <p className="text-[10px] text-slate-400">{p.codigo} | Stock: {p.stock} | ${(p.costoUSD || 0).toFixed(2)}</p>
                        </div>
                        <Plus size={16} className="text-emerald-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {filteredProducts.length === 0 && searchTerm.trim() && (
                  <div className="absolute z-10 mt-1 w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl">
                    <p className="text-sm text-slate-400">No se encontraron productos</p>
                  </div>
                )}
              </div>
            )}

            {/* Lines table */}
            {lines.length > 0 && (
              <div className="space-y-2">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <div className="col-span-4">Producto</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-center">Costo/u</div>
                  <div className="col-span-2 text-center">Subtotal</div>
                  <div className="col-span-1 text-center">Nuevo Costo</div>
                  <div className="col-span-1"></div>
                </div>
                {lines.map((line, idx) => {
                  const subtotal = line.qty * line.costPerUnit;
                  const totalStock = line.oldStock + line.qty;
                  const newWeightedCost = totalStock > 0
                    ? (line.oldStock * line.oldCost + line.qty * line.costPerUnit) / totalStock
                    : line.costPerUnit;
                  return (
                    <div key={line.productId} className="grid grid-cols-12 gap-2 items-center px-3 py-2 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/5">
                      <div className="col-span-12 sm:col-span-4">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{line.productName}</p>
                        <p className="text-[10px] text-slate-400">Stock: {line.oldStock} | Costo actual: ${line.oldCost.toFixed(2)}</p>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={e => updateLine(idx, 'qty', Math.max(1, Number(e.target.value)))}
                          className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={line.costPerUnit || ''}
                          onChange={e => updateLine(idx, 'costPerUnit', Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          placeholder="$0.00"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2 text-center">
                        <p className="text-sm font-black text-slate-900 dark:text-white">${subtotal.toFixed(2)}</p>
                      </div>
                      <div className="col-span-1 text-center hidden sm:block">
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">${newWeightedCost.toFixed(2)}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        <button onClick={() => removeLine(idx)} className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/10 transition-colors">
                          <Trash2 size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {lines.length === 0 && (
              <div className="py-8 text-center">
                <Truck size={32} className="mx-auto text-slate-300 dark:text-white/10 mb-3" />
                <p className="text-sm text-slate-400">Agrega productos a esta recepcion</p>
              </div>
            )}
          </div>

          {/* Totals + Account */}
          {lines.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-300">Total USD</span>
                <span className="text-xl font-black text-slate-900 dark:text-white">${totalUSD.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total Bs (BCV {bcvRate.toFixed(2)})</span>
                <span className="font-bold text-slate-600 dark:text-slate-300">Bs {totalBs.toFixed(2)}</span>
              </div>

              {/* Account type for CxP */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cuenta CxP</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setAccountType('BCV')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${accountType === 'BCV' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400'}`}
                  >BCV</button>
                  {customRates.filter(r => r.enabled).map(r => (
                    <button
                      key={r.id}
                      onClick={() => setAccountType(r.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${accountType === r.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400'}`}
                    >{r.name}</button>
                  ))}
                </div>
              </div>

              {/* Auto CxP toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCxP}
                  onChange={e => setAutoCxP(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest">Crear factura en CxP automaticamente</span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-white/10 flex gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
          >Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex-[2] py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-md shadow-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Procesando...' : `Confirmar Recepcion (${lines.length} producto${lines.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}
