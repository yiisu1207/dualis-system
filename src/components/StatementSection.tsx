import React, { useState, useMemo } from 'react';
import { Customer, Movement, MovementType } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';

interface StatementSectionProps {
  customers: Customer[];
  movements: Movement[];
}

const StatementSection: React.FC<StatementSectionProps> = ({ customers, movements }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return [];
    return customers.filter(
      (c) => (c.id || '').toLowerCase().includes(searchTerm.toLowerCase()) || (c.cedula || '').includes(searchTerm)
    );
  }, [customers, searchTerm]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Lógica de cálculo de saldo progresivo (cronológico)
  const statementData = useMemo(() => {
    if (!selectedCustomerId) return [];

    const customerMovs = movements
      .filter((m) => m.entityId === selectedCustomerId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    return customerMovs
      .map((m) => {
        const isCharge = m.movementType === MovementType.FACTURA;
        const amountUsd = getMovementUsdAmount(m);
        if (isCharge) {
          runningBalance += amountUsd;
        } else {
          runningBalance -= amountUsd;
        }
        return { ...m, currentBalance: runningBalance };
      })
      .reverse(); // Mostramos los más nuevos arriba para visualización rápida
  }, [movements, selectedCustomerId]);

  return (
    <div className="space-y-8 animate-section">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight italic">
            ESTADOS DE CUENTA
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Auditoría Individual de Clientes
          </p>
        </div>

        <div className="relative w-full md:w-[400px]">
          <input
            type="text"
            placeholder="🔍 Buscar cliente por nombre o cédula..."
            className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && filteredCustomers.length > 0 && !selectedCustomerId && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 max-h-60 overflow-y-auto overflow-x-hidden">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setSearchTerm(c.id);
                  }}
                  className="w-full px-6 py-4 text-left hover:bg-indigo-50 border-b last:border-0 transition-colors flex justify-between items-center"
                >
                  <span className="font-black text-slate-700">{c.id}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase">
                    {c.cedula}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedCustomer ? (
        <div className="glass-panel rounded-[2.5rem] overflow-hidden border-2 border-indigo-50 shadow-2xl animate-in">
          <div className="bg-white p-8 text-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                Registro del Cliente
              </p>
              <h2 className="text-2xl font-black uppercase tracking-tight">
                {selectedCustomer.id}
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-bold">
                {selectedCustomer.cedula} • {selectedCustomer.telefono}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Deuda Total Consolidada
              </p>
              <p
                className={`text-4xl font-black ${
                  statementData[0]?.currentBalance > 0.1 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatCurrency(statementData[0]?.currentBalance || 0)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                <tr>
                  <th className="px-8 py-4 text-left">Fecha</th>
                  <th className="px-8 py-4 text-left">Descripción / Glosa</th>
                  <th className="px-8 py-4 text-right">Cargo (Venta)</th>
                  <th className="px-8 py-4 text-right">Abono (Pago)</th>
                  <th className="px-8 py-4 text-right bg-indigo-50/30">Saldo Adeudado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-20 text-center text-slate-300 font-black italic uppercase tracking-widest"
                    >
                      Este cliente no posee movimientos registrados
                    </td>
                  </tr>
                ) : (
                  statementData.map((m) => (
                    <tr key={m.id} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="px-8 py-4 font-bold text-slate-500">{m.date}</td>
                      <td className="px-8 py-4 text-slate-700 font-semibold">{m.concept}</td>
                      <td className="px-8 py-4 text-right font-black text-rose-500">
                        {m.movementType === MovementType.FACTURA
                          ? formatCurrency(getMovementUsdAmount(m))
                          : '-'}
                      </td>
                      <td className="px-8 py-4 text-right font-black text-emerald-500">
                        {m.movementType === MovementType.ABONO
                          ? formatCurrency(getMovementUsdAmount(m))
                          : '-'}
                      </td>
                      <td className="px-8 py-4 text-right font-black bg-indigo-50/20 text-slate-800">
                        {formatCurrency(m.currentBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
            Fin del Reporte • DUALIS V1.0
          </div>
        </div>
      ) : (
        <div className="py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
          <div className="text-8xl mb-6 opacity-10">📖</div>
          <p className="font-black text-slate-300 uppercase tracking-widest text-sm">
            Selecciona un cliente para generar su historial contable
          </p>
        </div>
      )}

      {/* Botón flotante para limpiar selección */}
      {selectedCustomerId && (
        <button
          onClick={() => {
            setSelectedCustomerId(null);
            setSearchTerm('');
          }}
          className="fixed bottom-8 right-8 bg-white text-slate-900 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl hover:scale-110 transition-all z-40"
        >
          Limpiar Auditoría
        </button>
      )}
    </div>
  );
};

export default StatementSection;
