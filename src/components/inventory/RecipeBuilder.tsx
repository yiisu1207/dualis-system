import React, { useState, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, ChefHat, Loader2, Save, DollarSign } from 'lucide-react';
import type { CustomRate } from '../../../types';

interface Product {
  id: string;
  codigo: string;
  nombre: string;
  costoUSD: number;
  stock: number;
}

export interface RecipeIngredient {
  productId?: string;
  name: string;
  qty: number;
  unit: string;
  costPerUnit: number;
}

export interface Recipe {
  id?: string;
  productId: string;
  name: string;
  yield: number;
  yieldUnit: string;
  ingredients: RecipeIngredient[];
  laborCost: number;
  overheadPct: number;
  notes: string;
}

interface RecipeBuilderProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  products: Product[];
  bcvRate: number;
  customRates: CustomRate[];
  existingRecipe?: Recipe | null;
  onSave: (recipe: Recipe, unitCost: number) => Promise<void>;
}

const UNITS = ['kg', 'g', 'ml', 'lt', 'unidad', 'docena', 'cucharada', 'taza', 'sobre'];

export default function RecipeBuilder({
  open, onClose, productId, productName, products, bcvRate, customRates,
  existingRecipe, onSave,
}: RecipeBuilderProps) {
  const [recipe, setRecipe] = useState<Recipe>(() => existingRecipe || {
    productId,
    name: productName,
    yield: 1,
    yieldUnit: 'unidad',
    ingredients: [],
    laborCost: 0,
    overheadPct: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [searchIngredient, setSearchIngredient] = useState('');
  const [showIngSearch, setShowIngSearch] = useState(false);

  const ingredientTotal = useMemo(() =>
    recipe.ingredients.reduce((sum, i) => sum + i.qty * i.costPerUnit, 0), [recipe.ingredients]);
  const laborTotal = recipe.laborCost || 0;
  const overhead = (ingredientTotal + laborTotal) * (recipe.overheadPct || 0) / 100;
  const batchCost = ingredientTotal + laborTotal + overhead;
  const unitCost = recipe.yield > 0 ? batchCost / recipe.yield : 0;

  const margins = [40, 60, 80, 100];
  const suggestions = useMemo(() => margins.map(m => ({
    margin: m,
    priceUSD: unitCost * (1 + m / 100),
    priceBs: unitCost * (1 + m / 100) * bcvRate,
    customPrices: customRates.filter(r => r.enabled).map(r => ({
      name: r.name,
      price: unitCost * (1 + m / 100) * r.value,
    })),
  })), [unitCost, bcvRate, customRates]);

  const filteredProducts = useMemo(() => {
    if (!searchIngredient.trim()) return products.slice(0, 15);
    const term = searchIngredient.toLowerCase();
    return products.filter(p => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term)).slice(0, 15);
  }, [products, searchIngredient]);

  const addIngredient = useCallback((p?: Product) => {
    const newIng: RecipeIngredient = p
      ? { productId: p.id, name: p.nombre, qty: 1, unit: 'kg', costPerUnit: p.costoUSD || 0 }
      : { name: '', qty: 1, unit: 'kg', costPerUnit: 0 };
    setRecipe(prev => ({ ...prev, ingredients: [...prev.ingredients, newIng] }));
    setShowIngSearch(false);
    setSearchIngredient('');
  }, []);

  const updateIngredient = useCallback((idx: number, updates: Partial<RecipeIngredient>) => {
    setRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === idx ? { ...ing, ...updates } : ing),
    }));
  }, []);

  const removeIngredient = useCallback((idx: number) => {
    setRecipe(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }));
  }, []);

  const handleSave = async () => {
    if (saving || recipe.ingredients.length === 0) return;
    setSaving(true);
    try {
      await onSave(recipe, parseFloat(unitCost.toFixed(4)));
      onClose();
    } catch (err) {
      console.error('Error saving recipe:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-amber-600 rounded-xl flex items-center justify-center shadow-lg">
              <ChefHat className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Receta</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Yield */}
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rendimiento</label>
              <div className="flex gap-2">
                <input
                  type="number" min={1} value={recipe.yield}
                  onChange={e => setRecipe(prev => ({ ...prev, yield: Math.max(1, Number(e.target.value)) }))}
                  className="w-24 px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <select
                  value={recipe.yieldUnit}
                  onChange={e => setRecipe(prev => ({ ...prev, yieldUnit: e.target.value }))}
                  className="px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="unidad">unidades</option>
                  <option value="porcion">porciones</option>
                  <option value="kg">kg</option>
                  <option value="docena">docenas</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ingredientes ({recipe.ingredients.length})</label>
              <div className="flex gap-2">
                <button onClick={() => setShowIngSearch(!showIngSearch)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-colors">
                  <Plus size={14} /> Del Inventario
                </button>
                <button onClick={() => addIngredient()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-white/15 transition-colors">
                  <Plus size={14} /> Manual
                </button>
              </div>
            </div>

            {/* Ingredient search */}
            {showIngSearch && (
              <div className="relative">
                <input autoFocus value={searchIngredient} onChange={e => setSearchIngredient(e.target.value)}
                  placeholder="Buscar producto del inventario..."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-amber-300 dark:border-amber-500/30 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                />
                <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addIngredient(p)}
                      className="w-full px-4 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors flex justify-between items-center border-b border-slate-100 dark:border-white/5 last:border-0">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{p.nombre}</span>
                      <span className="text-[10px] text-slate-400">${(p.costoUSD || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ingredient rows */}
            {recipe.ingredients.map((ing, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center px-3 py-2 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/5">
                <div className="col-span-12 sm:col-span-3">
                  <input value={ing.name} onChange={e => updateIngredient(idx, { name: e.target.value })}
                    className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="Ingrediente"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" step="0.01" min={0} value={ing.qty || ''}
                    onChange={e => updateIngredient(idx, { qty: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="Qty"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <select value={ing.unit} onChange={e => updateIngredient(idx, { unit: e.target.value })}
                    className="w-full px-1 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <input type="number" step="0.01" min={0} value={ing.costPerUnit || ''}
                    onChange={e => updateIngredient(idx, { costPerUnit: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-lg text-sm font-bold text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="$/u"
                  />
                </div>
                <div className="col-span-2 sm:col-span-2 text-center">
                  <span className="text-sm font-black text-slate-900 dark:text-white">${(ing.qty * ing.costPerUnit).toFixed(2)}</span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removeIngredient(idx)} className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/10">
                    <Trash2 size={14} className="text-rose-500" />
                  </button>
                </div>
              </div>
            ))}

            {recipe.ingredients.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-400">Agrega ingredientes para calcular el costo</div>
            )}
          </div>

          {/* Labor + Overhead */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mano de Obra (USD)</label>
              <input type="number" step="0.01" min={0} value={recipe.laborCost || ''}
                onChange={e => setRecipe(prev => ({ ...prev, laborCost: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gastos Generales (%)</label>
              <input type="number" step="1" min={0} max={100} value={recipe.overheadPct || ''}
                onChange={e => setRecipe(prev => ({ ...prev, overheadPct: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                placeholder="10"
              />
            </div>
          </div>

          {/* Cost summary */}
          {recipe.ingredients.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200 dark:border-amber-500/20 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Resumen de Costos</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-white/40">Ingredientes</span><span className="font-bold text-slate-900 dark:text-white">${ingredientTotal.toFixed(2)}</span></div>
                {laborTotal > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-white/40">Mano de obra</span><span className="font-bold text-slate-900 dark:text-white">${laborTotal.toFixed(2)}</span></div>}
                {overhead > 0 && <div className="flex justify-between"><span className="text-slate-500 dark:text-white/40">Gastos gen ({recipe.overheadPct}%)</span><span className="font-bold text-slate-900 dark:text-white">${overhead.toFixed(2)}</span></div>}
                <div className="flex justify-between pt-2 border-t border-amber-200 dark:border-amber-500/20"><span className="font-black text-slate-900 dark:text-white">Costo total batch</span><span className="font-black text-amber-600 dark:text-amber-400">${batchCost.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="font-black text-slate-900 dark:text-white">Costo por {recipe.yieldUnit}</span><span className="font-black text-amber-600 dark:text-amber-400 text-base">${unitCost.toFixed(4)}</span></div>
              </div>

              {/* Price suggestions */}
              <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-500/20">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                  <DollarSign size={12} /> Precio Sugerido
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {suggestions.map(s => (
                    <div key={s.margin} className="p-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-amber-100 dark:border-amber-500/10 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Margen {s.margin}%</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">${s.priceUSD.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-400">Bs {s.priceBs.toFixed(2)}</p>
                      {s.customPrices.map(cp => (
                        <p key={cp.name} className="text-[9px] text-slate-400">{cp.name}: Bs {cp.price.toFixed(2)}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas</label>
            <textarea rows={2} value={recipe.notes}
              onChange={e => setRecipe(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-amber-500 focus:outline-none"
              placeholder="Instrucciones, tips, variantes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-white/10 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || recipe.ingredients.length === 0}
            className="flex-[2] py-4 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-md shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Guardando...' : 'Guardar Receta + Actualizar Costo'}
          </button>
        </div>
      </div>
    </div>
  );
}
