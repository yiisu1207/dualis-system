import React, { useMemo, useState } from 'react';
import { ExchangeRates, InventoryItem } from '../../types';
import { formatCurrency } from '../utils/formatters';
import { useToast } from '../context/ToastContext';

interface InventorySectionProps {
  inventory: InventoryItem[];
  rates: ExchangeRates;
  onAddItem: (item: InventoryItem) => Promise<void> | void;
  onDeleteItem: (id: string) => Promise<void> | void;
}

const InventorySection: React.FC<InventorySectionProps> = ({
  inventory,
  rates,
  onAddItem,
  onDeleteItem,
}) => {
  const { warning } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Ropa',
    costPrice: '',
    salePrice: '',
    stock: '',
    minStock: '5',
  });

  const sanitizeText = (value: string) => value.replace(/[<>]/g, '').trim();

  const previewSaleBs = useMemo(() => {
    const value = parseFloat(newItem.salePrice);
    if (!Number.isFinite(value)) return 0;
    return value * (rates.bcv || 0);
  }, [newItem.salePrice, rates.bcv]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = sanitizeText(newItem.name);
    if (!safeName) {
      warning('Nombre del producto requerido.');
      return;
    }
    const item: InventoryItem = {
      id: crypto.randomUUID(),
      name: safeName,
      category: newItem.category,
      costPrice: parseFloat(newItem.costPrice),
      salePrice: parseFloat(newItem.salePrice),
      stock: parseInt(newItem.stock),
      minStock: parseInt(newItem.minStock),
    };
    onAddItem(item);
    setShowAdd(false);
    setNewItem({
      name: '',
      category: 'Ropa',
      costPrice: '',
      salePrice: '',
      stock: '',
      minStock: '5',
    });
  };

  const deleteItem = (id: string) => {
    if (confirm('¿Eliminar este producto?')) {
      onDeleteItem(id);
    }
  };

  return (
    <div className="app-section space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="app-section-header">
          <p className="app-subtitle">Inventario de Mercancia</p>
          <h1 className="app-title">Gestion de Stock</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-6 py-3 text-[10px] app-btn app-btn-primary"
        >
          {showAdd ? 'Cerrar Panel' : '+ Nuevo Producto'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="glass-panel p-8 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in"
        >
          <input
            required
            placeholder="Nombre del Producto"
            className="app-input"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <select
            className="app-input"
            value={newItem.category}
            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
          >
            <option>Pantalones</option>
            <option>Camisas</option>
            <option>Accesorios</option>
            <option>Calzado</option>
          </select>
          <div className="flex flex-col gap-2">
            <input
              required
              type="number"
              placeholder="Costo en divisa ($)"
              className="app-input flex-1"
              value={newItem.costPrice}
              onChange={(e) => setNewItem({ ...newItem, costPrice: e.target.value })}
            />
            <input
              required
              type="number"
              placeholder="Precio en divisa ($)"
              className="app-input flex-1"
              value={newItem.salePrice}
              onChange={(e) => setNewItem({ ...newItem, salePrice: e.target.value })}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
              Precio en Bs (BCV): {previewSaleBs ? formatCurrency(previewSaleBs, 'Bs') : '—'}
            </div>
          </div>
          <input
            required
            type="number"
            placeholder="Stock Inicial"
            className="app-input"
            value={newItem.stock}
            onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })}
          />
          <input
            required
            type="number"
            placeholder="Stock Mínimo"
            className="app-input"
            value={newItem.minStock}
            onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })}
          />
          <button
            type="submit"
            className="app-btn app-btn-primary"
          >
            Registrar en Almacén
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {inventory.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic border-2 border-dashed rounded-3xl">
            No hay mercancía registrada
          </div>
        ) : (
          inventory.map((item) => (
            <div key={item.id} className="app-card p-6 flex flex-col relative group">
              <span className="absolute top-4 right-4 text-[8px] font-black px-2 py-1 app-chip rounded-md">
                {item.category}
              </span>
              <h3 className="font-black text-slate-800 text-lg mb-4">{item.name}</h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Costo USD</p>
                  <p className="text-lg font-black text-slate-800">
                    {formatCurrency(item.costPrice, '$')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Precio Bs (BCV)</p>
                  <p className="text-lg font-black text-indigo-600">
                    {formatCurrency(item.salePrice * (rates.bcv || 0), 'Bs')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Stock</p>
                  <p
                    className={`text-xl font-black ${
                      item.stock <= item.minStock ? 'text-rose-500 animate-pulse' : 'text-slate-700'
                    }`}
                  >
                    {item.stock} un.
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Minimo</p>
                  <p className="text-xl font-black text-slate-700">{item.minStock}</p>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => deleteItem(item.id)}
                  className="flex-1 py-2 bg-rose-50 text-rose-500 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-slate-900 transition-all"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InventorySection;
