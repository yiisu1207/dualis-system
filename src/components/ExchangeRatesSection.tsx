import React, { useState } from 'react';
import { ExchangeRates } from '../../types';

interface ExchangeRatesSectionProps {
  rates: ExchangeRates;
  onUpdateRates: (newRates: ExchangeRates) => void;
}

const ExchangeRatesSection: React.FC<ExchangeRatesSectionProps> = ({ rates, onUpdateRates }) => {
  const [bcv, setBcv] = useState(rates.bcv.toString());
  const [grupo, setGrupo] = useState(rates.grupo.toString());

  const handleUpdate = () => {
    const newRates: ExchangeRates = {
      bcv: parseFloat(bcv) || 0,
      grupo: parseFloat(grupo) || 0,
      lastUpdated: new Date().toLocaleString(),
    };
    onUpdateRates(newRates);
    alert('¡Tasas actualizadas exitosamente!');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Tasas de Cambio del Día
          </h1>
          <p className="text-slate-400 font-medium uppercase text-[10px] tracking-[0.2em] mt-1">
            Configuración Central de Precios
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Última Actualización
          </p>
          <p className="text-xs font-bold text-slate-600">{rates.lastUpdated}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* BCV CARD */}
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden group hover:shadow-2xl transition-all">
          <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
            <span className="font-black tracking-widest text-xs uppercase">Tasa Oficial BCV</span>
            <span className="text-2xl">🏛️</span>
          </div>
          <div className="p-10 text-center">
            <div className="relative inline-block w-full">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">
                Bs.
              </span>
              <input
                type="number"
                step="0.01"
                value={bcv}
                onChange={(e) => setBcv(e.target.value)}
                className="w-full pl-20 pr-8 py-6 text-5xl font-black text-slate-800 bg-slate-50 border-none rounded-3xl text-center focus:ring-4 focus:ring-blue-100 outline-none transition-all"
              />
            </div>
            <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
              Utilizada para pagos en bolívares (BCV)
            </p>
          </div>
        </div>

        {/* GRUPO CARD */}
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden group hover:shadow-2xl transition-all">
          <div className="bg-orange-500 p-6 text-white flex justify-between items-center">
            <span className="font-black tracking-widest text-xs uppercase">
              Tasa Grupo / Paralelo
            </span>
            <span className="text-2xl">📈</span>
          </div>
          <div className="p-10 text-center">
            <div className="relative inline-block w-full">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">
                Bs.
              </span>
              <input
                type="number"
                step="0.01"
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                className="w-full pl-20 pr-8 py-6 text-5xl font-black text-slate-800 bg-slate-50 border-none rounded-3xl text-center focus:ring-4 focus:ring-orange-100 outline-none transition-all"
              />
            </div>
            <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
              Utilizada para mercado paralelo y efectivo
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <button
          onClick={handleUpdate}
          className="px-12 py-5 bg-slate-900 text-white rounded-full font-black text-lg tracking-widest shadow-2xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-4"
        >
          <span>💾</span> ACTUALIZAR TASAS DEL DÍA
        </button>
      </div>
    </div>
  );
};

export default ExchangeRatesSection;
