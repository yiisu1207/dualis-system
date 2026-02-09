import React, { useState } from 'react';
import { ExchangeRates } from '../../types';

interface RateCheckModalProps {
  currentRates: ExchangeRates;
  onConfirm: (rates: ExchangeRates) => void;
}

const RateCheckModal: React.FC<RateCheckModalProps> = ({ currentRates, onConfirm }) => {
  const [bcv, setBcv] = useState(currentRates.bcv.toString());
  const [grupo, setGrupo] = useState(currentRates.grupo.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRates: ExchangeRates = {
      bcv: parseFloat(bcv) || 0,
      grupo: parseFloat(grupo) || 0,
      lastUpdated: new Date().toLocaleString(),
    };
    onConfirm(newRates);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header Friendly */}
        <div className="bg-slate-50 dark:bg-slate-800 p-8 text-center border-b border-slate-100 dark:border-slate-700">
          <div className="text-4xl mb-4 animate-bounce">☀️</div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            ¡Buenos días, Equipo!
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-2">
            Antes de comenzar a operar, por favor verifiquemos las tasas de cambio de hoy.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* TASA BCV */}
          <div className="relative group">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                Tasa Oficial BCV
              </label>
              <a
                href="https://www.instagram.com/bcv.org.ve/"
                target="_blank"
                rel="noreferrer"
                className="text-[9px] font-bold text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors"
              >
                <i className="fa-brands fa-instagram"></i> Verificar Fuente
              </a>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">
                Bs.
              </span>
              <input
                type="number"
                step="0.01"
                required
                value={bcv}
                onChange={(e) => setBcv(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-blue-50 dark:bg-blue-900/10 border-2 border-transparent focus:border-blue-500 rounded-2xl text-2xl font-black text-slate-800 dark:text-white outline-none transition-all text-center"
              />
            </div>
          </div>

          {/* TASA GRUPO */}
          <div className="relative group">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest">
                Tasa Grupo / Paralelo
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">
                Bs.
              </span>
              <input
                type="number"
                step="0.01"
                required
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-orange-50 dark:bg-orange-900/10 border-2 border-transparent focus:border-orange-500 rounded-2xl text-2xl font-black text-slate-800 dark:text-white outline-none transition-all text-center"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black hover:scale-[1.02] active:scale-95 transition-all mt-4"
          >
            Confirmar y Entrar al Sistema
          </button>
        </form>

        <div className="bg-slate-50 dark:bg-slate-800 p-4 text-center">
          <p className="text-[9px] font-black text-slate-300 uppercase">
            Seguridad Operativa • Boutique L.A.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RateCheckModal;
