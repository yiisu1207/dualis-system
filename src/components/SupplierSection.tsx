import React, { useState, useMemo } from 'react';
import {
  Supplier,
  Movement,
  AccountType,
  MovementType,
  ExchangeRates,
  PaymentCurrency,
} from '../../types';
import { formatCurrency } from '../utils/formatters';

interface SupplierSectionProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  movements: Movement[];
  onRegisterMovement: (data: any) => void;
  onUpdateSupplier: (id: string, s: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onUpdateMovement: (id: string, updated: Partial<Movement>) => void;
  onDeleteMovement: (id: string) => void;
  rates: ExchangeRates;
}

const SupplierSection: React.FC<SupplierSectionProps> = ({
  suppliers,
  setSuppliers,
  movements,
  onRegisterMovement,
  onUpdateSupplier,
  onDeleteSupplier,
  onUpdateMovement,
  onDeleteMovement,
  rates,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState({
    id: '',
    rif: '',
    contacto: '',
    categoria: 'Fábrica',
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [viewHistory, setViewHistory] = useState(false); // To toggle between Quick Action and History

  // Transaction State
  const [movData, setMovData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    concept: '',
    type: MovementType.FACTURA,
  });

  // Edit Movement State
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [editForm, setEditForm] = useState<{ amount: string }>({ amount: '' });

  const supplierStats = useMemo(() => {
    return suppliers.map((s) => {
      const sMovs = movements.filter((m) => m.entityId === s.id && m.isSupplierMovement);
      const deudas = sMovs
        .filter((m) => m.movementType === MovementType.FACTURA)
        .reduce((acc, m) => acc + m.amountInUSD, 0);
      const abonos = sMovs
        .filter((m) => m.movementType === MovementType.ABONO)
        .reduce((acc, m) => acc + m.amountInUSD, 0);
      return { ...s, balance: deudas - abonos };
    });
  }, [suppliers, movements]);

  const selectedSupplierMovements = useMemo(() => {
    if (!selectedSupplierId) return [];
    return movements
      .filter((m) => m.entityId === selectedSupplierId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, selectedSupplierId]);

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (editSupplier) {
      onUpdateSupplier(editSupplier.id, editSupplier);
      setEditSupplier(null);
    } else {
      if (!newSupplier.id) return;
      setSuppliers((prev) => [...prev, { ...newSupplier, id: newSupplier.id.toUpperCase() }]);
      setShowAdd(false);
      setNewSupplier({ id: '', rif: '', contacto: '', categoria: 'Fábrica' });
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !movData.amount) return;
    onRegisterMovement({
      customerName: selectedSupplierId,
      ...movData,
      amount: parseFloat(movData.amount),
      currency: PaymentCurrency.USD,
      rate: 1,
      isSupplierMovement: true,
      accountType: AccountType.DIVISA,
    });
    alert('Operación registrada correctamente.');
    setMovData({ ...movData, amount: '', concept: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar proveedor y sus registros?')) onDeleteSupplier(id);
  };

  const handleSaveEditMovement = () => {
    if (editingMovement && editForm.amount) {
      const val = parseFloat(editForm.amount);
      onUpdateMovement(editingMovement.id, { amount: val, amountInUSD: val }); // Simple update assuming USD for suppliers for now or same currency
      setEditingMovement(null);
    }
  };

  return (
    <div className="space-y-6 animate-in h-full flex flex-col">
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">
            Directorio de Proveedores
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Cuentas por Pagar & Fábricas
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-6 py-2 bg-[#3B82F6] text-white rounded-xl font-black text-xs uppercase hover:bg-blue-600 transition-all shadow-lg"
        >
          + Nuevo Proveedor
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        {/* TABLA PROVEEDORES */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="overflow-y-auto custom-scroll flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-widest sticky top-0">
                <tr>
                  <th className="p-4">Empresa / Fábrica</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4 text-right">Deuda Pendiente</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {supplierStats.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${
                      selectedSupplierId === s.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => setSelectedSupplierId(s.id)}
                  >
                    <td className="p-4">
                      <p className="font-bold text-slate-700 dark:text-white">{s.id}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{s.rif}</p>
                    </td>
                    <td className="p-4 text-xs font-medium text-slate-500">{s.contacto}</td>
                    <td
                      className={`p-4 text-right font-mono font-black ${
                        s.balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(s.balance)}
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditSupplier(s);
                        }}
                        className="text-indigo-500 hover:text-indigo-700"
                      >
                        <i className="fa-solid fa-pencil"></i>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PANEL DE ACCIÓN & HISTORIAL */}
        <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-md border border-slate-200 dark:border-slate-700 flex flex-col h-fit overflow-hidden max-h-full">
          {selectedSupplierId ? (
            <>
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                <h3 className="font-black text-slate-700 dark:text-white text-xs uppercase tracking-widest">
                  {viewHistory ? 'Historial Detallado' : 'Operaciones Rápidas'}
                </h3>
                <button
                  onClick={() => setViewHistory(!viewHistory)}
                  className="text-[10px] font-bold text-blue-600 underline"
                >
                  {viewHistory ? 'Registrar Nuevo' : 'Ver Historial'}
                </button>
              </div>

              <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/50">
                <h3 className="font-black text-slate-800 dark:text-white leading-none">
                  {selectedSupplierId}
                </h3>
              </div>

              {viewHistory ? (
                <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
                  {selectedSupplierMovements.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-slate-400">{m.date}</span>
                        <span
                          className={`font-mono font-black text-xs ${
                            m.movementType === 'FACTURA' ? 'text-rose-500' : 'text-emerald-500'
                          }`}
                        >
                          {m.movementType === 'FACTURA' ? '-' : '+'}
                          {formatCurrency(m.amountInUSD)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-white truncate">
                        {m.concept}
                      </p>
                      <div className="flex justify-end gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingMovement(m);
                            setEditForm({ amount: m.amountInUSD.toString() });
                          }}
                          className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-600 hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Eliminar?')) onDeleteMovement(m.id);
                          }}
                          className="text-[10px] bg-rose-50 text-rose-600 px-2 py-1 rounded font-bold hover:bg-rose-600 hover:text-white"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleRegister} className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setMovData({ ...movData, type: MovementType.FACTURA })}
                      className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                        movData.type === MovementType.FACTURA
                          ? 'bg-white shadow text-rose-600'
                          : 'text-slate-400'
                      }`}
                    >
                      Registrar Deuda
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovData({ ...movData, type: MovementType.ABONO })}
                      className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                        movData.type === MovementType.ABONO
                          ? 'bg-emerald-500 shadow text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      Registrar Pago
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-black text-lg text-slate-800 outline-none"
                      placeholder="Monto ($)"
                      value={movData.amount}
                      onChange={(e) => setMovData({ ...movData, amount: e.target.value })}
                      required
                    />
                    <input
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold text-xs text-slate-600 outline-none"
                      value={movData.concept}
                      onChange={(e) => setMovData({ ...movData, concept: e.target.value })}
                      required
                      placeholder="Nro Factura / Descripción"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-black transition-all"
                  >
                    Confirmar {movData.type}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="p-10 text-center opacity-50 flex flex-col items-center justify-center h-full">
              <i className="fa-solid fa-arrow-left text-3xl mb-2"></i>
              <p className="text-xs font-bold uppercase">Seleccione un proveedor</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL EDIT MOVEMENT */}
      {editingMovement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-4 dark:text-white">Corregir Monto</h3>
            <input
              type="number"
              step="0.01"
              value={editForm.amount}
              onChange={(e) => setEditForm({ amount: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 font-bold"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingMovement(null)}
                className="flex-1 py-2 text-slate-500 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditMovement}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADD/EDIT SUPPLIER */}
      {(showAdd || editSupplier) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in"
          >
            <h3 className="font-black text-slate-800 dark:text-white uppercase italic text-lg mb-6">
              {editSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h3>
            <div className="space-y-3">
              <input
                placeholder="Nombre Empresa"
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.id : newSupplier.id}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, id: e.target.value })
                    : setNewSupplier({ ...newSupplier, id: e.target.value })
                }
                required
              />
              <input
                placeholder="RIF"
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.rif : newSupplier.rif}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, rif: e.target.value })
                    : setNewSupplier({ ...newSupplier, rif: e.target.value })
                }
              />
              <input
                placeholder="Contacto / Tel"
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.contacto : newSupplier.contacto}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, contacto: e.target.value })
                    : setNewSupplier({ ...newSupplier, contacto: e.target.value })
                }
              />
              <input
                placeholder="Categoría (Telas, Hilos...)"
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border-none rounded-xl font-bold outline-none"
                value={editSupplier ? editSupplier.categoria : newSupplier.categoria}
                onChange={(e) =>
                  editSupplier
                    ? setEditSupplier({ ...editSupplier, categoria: e.target.value })
                    : setNewSupplier({ ...newSupplier, categoria: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setEditSupplier(null);
                }}
                className="flex-1 py-3 text-slate-500 font-bold uppercase text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SupplierSection;
