import React, { useState } from 'react';
// Corrected import from missing Entity to existing Customer
import { Customer, Movement, MovementType } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';

interface DirectorySectionProps {
  // Use Customer interface for list of entities
  entities: Customer[];
  movements: Movement[];
  onViewHistory: (id: string) => void;
  title: string;
}

const DirectorySection: React.FC<DirectorySectionProps> = ({
  entities,
  movements,
  onViewHistory,
  title,
}) => {
  const [filter, setFilter] = useState('');

  const calculateBalance = (entityId: string) => {
    const entityMovs = movements.filter((m) => m.entityId === entityId);
    const totalFacturado = entityMovs
      .filter((m) => m.movementType === MovementType.FACTURA)
      .reduce((sum, m) => sum + getMovementUsdAmount(m), 0);
    const totalAbonado = entityMovs
      .filter((m) => m.movementType === MovementType.ABONO)
      .reduce((sum, m) => sum + getMovementUsdAmount(m), 0);
    return totalFacturado - totalAbonado;
  };

  const getLastMovementDate = (entityId: string) => {
    const entityMovs = movements.filter((m) => m.entityId === entityId);
    if (entityMovs.length === 0) return 'Sin movimientos';

    // Sort by date descending
    const sorted = [...entityMovs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return sorted[0].date;
  };

  const filteredEntities = entities.filter(
    (e) =>
      (e.id || '').toLowerCase().includes(filter.toLowerCase().trim()) ||
      (e.cedula || '').toLowerCase().includes(filter.toLowerCase().trim())
  );

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="px-6 py-5 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="font-black text-slate-700 uppercase text-xs tracking-widest">{title}</h3>
          <p className="text-[10px] text-slate-400 font-bold">
            {filteredEntities.length} registros encontrados
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Buscar por nombre o ID..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b">
            <tr>
              <th className="px-6 py-4 text-left">Nombre / Entidad</th>
              <th className="px-6 py-4 text-left">Cédula / RIF</th>
              <th className="px-6 py-4 text-left">Contacto</th>
              <th className="px-6 py-4 text-center">Último Mov.</th>
              <th className="px-6 py-4 text-right">Saldo Pendiente ($)</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.07]">
            {filteredEntities.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-slate-400 italic font-medium"
                >
                  No se encontraron resultados para "{filter}"
                </td>
              </tr>
            ) : (
              filteredEntities.map((e) => {
                const balance = calculateBalance(e.id);
                const lastDate = getLastMovementDate(e.id);
                return (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-700">{e.id}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                        {e.direccion}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-bold text-xs">{e.cedula}</td>
                    <td className="px-6 py-4 text-slate-600 font-bold text-xs">{e.telefono}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                          lastDate === 'Sin movimientos'
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {lastDate}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-black text-xs ${
                        balance > 0.01 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(balance)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => onViewHistory(e.id)}
                        className="bg-slate-100 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-slate-600 font-black text-[10px] uppercase tracking-tighter transition-all"
                      >
                        VER ESTADO
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DirectorySection;
