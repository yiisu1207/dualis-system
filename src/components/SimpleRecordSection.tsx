import React, { useState } from 'react';
import { AccountType, OperationalRecord } from '../../types';

interface SimpleRecordSectionProps {
  title: string;
  type: 'GASTO' | 'NOMINA';
  records: OperationalRecord[];
  onAdd: (record: Omit<OperationalRecord, 'id'>) => void;
}

const SimpleRecordSection: React.FC<SimpleRecordSectionProps> = ({
  title,
  type,
  records,
  onAdd,
}) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<AccountType>(AccountType.DIVISA);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept || !amount) return;
    onAdd({ date, concept, amount: parseFloat(amount), accountSource: source, type });
    setConcept('');
    setAmount('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <h1 className="text-3xl font-extrabold text-slate-800">{title}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100">
          <h2 className="font-bold text-slate-700 mb-4 text-lg">Nuevo Registro</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Concepto</label>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej: Alquiler Local"
                className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase">Origen</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as AccountType)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={AccountType.BCV}>BCV</option>
                  <option value={AccountType.GRUPO}>GRUPO</option>
                  <option value={AccountType.DIVISA}>DIVISA</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition-colors"
            >
              Guardar {type === 'GASTO' ? 'Gasto' : 'Nómina'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b bg-slate-50 font-bold text-slate-600">
            Historial Reciente
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 text-left">Fecha</th>
                  <th className="px-6 py-3 text-left">Concepto</th>
                  <th className="px-6 py-3 text-left">Cuenta</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.filter((r) => r.type === type).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
                      Sin registros aún
                    </td>
                  </tr>
                ) : (
                  records
                    .filter((r) => r.type === type)
                    .map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">{r.date}</td>
                        <td className="px-6 py-4 font-medium text-slate-700">{r.concept}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              r.accountSource === AccountType.BCV
                                ? 'bg-blue-100 text-blue-700'
                                : r.accountSource === AccountType.GRUPO
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {r.accountSource}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-red-600">
                          ${r.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleRecordSection;
