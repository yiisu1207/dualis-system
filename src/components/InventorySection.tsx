import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { formatCurrency } from '../utils/formatters';

interface InventorySectionProps {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

const InventorySection: React.FC<InventorySectionProps> = ({ inventory, setInventory }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Ropa',
    costPrice: '',
    salePrice: '',
    stock: '',
    minStock: '5',
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const item: InventoryItem = {
      id: crypto.randomUUID(),
      name: newItem.name,
      category: newItem.category,
      costPrice: parseFloat(newItem.costPrice),
      salePrice: parseFloat(newItem.salePrice),
      stock: parseInt(newItem.stock),
      minStock: parseInt(newItem.minStock),
    };
    setInventory((prev) => [...prev, item]);
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
      setInventory((prev) => prev.filter((i) => i.id !== id));
    }
  };

  return (
    <div className="space-y-8 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Stock</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Inventario de Mercancía Boutique
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
        >
          {showAdd ? 'Cerrar Panel' : '+ Nuevo Producto'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="glass-panel p-8 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-3 gap-4 border-2 border-indigo-100 animate-in"
        >
          <input
            required
            placeholder="Nombre del Producto"
            className="p-4 border rounded-2xl"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <select
            className="p-4 border rounded-2xl"
            value={newItem.category}
            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
          >
            <option>Pantalones</option>
            <option>Camisas</option>
            <option>Accesorios</option>
            <option>Calzado</option>
          </select>
          <div className="flex gap-2">
            <input
              required
              type="number"
              placeholder="Costo $"
              className="flex-1 p-4 border rounded-2xl"
              value={newItem.costPrice}
              onChange={(e) => setNewItem({ ...newItem, costPrice: e.target.value })}
            />
            <input
              required
              type="number"
              placeholder="Venta $"
              className="flex-1 p-4 border rounded-2xl"
              value={newItem.salePrice}
              onChange={(e) => setNewItem({ ...newItem, salePrice: e.target.value })}
            />
          </div>
          <input
            required
            type="number"
            placeholder="Stock Inicial"
            className="p-4 border rounded-2xl"
            value={newItem.stock}
            onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })}
          />
          <input
            required
            type="number"
            placeholder="Stock Mínimo"
            className="p-4 border rounded-2xl"
            value={newItem.minStock}
            onChange={(e) => setNewItem({ ...newItem, minStock: e.target.value })}
          />
          <button
            type="submit"
            className="bg-emerald-600 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest"
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
            <div
              key={item.id}
              className="glass-panel p-6 rounded-[2rem] flex flex-col relative group"
            >
              <span className="absolute top-4 right-4 text-[8px] font-black px-2 py-1 bg-slate-100 rounded-md text-slate-500">
                {item.category}
              </span>
              <h3 className="font-black text-slate-800 text-lg mb-4">{item.name}</h3>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Precio Venta</p>
                  <p className="text-xl font-black text-indigo-600">
                    {formatCurrency(item.salePrice)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Stock</p>
                  <p
                    className={`text-xl font-black ${
                      item.stock <= item.minStock ? 'text-rose-500 animate-pulse' : 'text-slate-700'
                    }`}
                  >
                    {item.stock} un.
                  </p>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => deleteItem(item.id)}
                  className="flex-1 py-2 bg-rose-50 text-rose-500 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
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
