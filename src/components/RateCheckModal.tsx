import React, { useEffect, useState } from 'react';
import { ExchangeRates } from '../../types';

interface RateCheckModalProps {
  currentRates: ExchangeRates;
  onConfirm: (payload: { rates: ExchangeRates; notes?: string }) => void;
  onSkip?: () => void;
  canEditRates?: boolean;
}

const RateCheckModal: React.FC<RateCheckModalProps> = ({
  currentRates,
  onConfirm,
  onSkip,
  canEditRates,
}) => {
  const [bcv, setBcv] = useState(currentRates.bcv.toString());
  const [grupo, setGrupo] = useState(currentRates.grupo.toString());
  const [notes, setNotes] = useState('');
  const canEdit = canEditRates !== false;
  const bcvValue = parseFloat(bcv);
  const grupoValue = parseFloat(grupo);
  const ratesUnchanged =
    !Number.isNaN(bcvValue) &&
    !Number.isNaN(grupoValue) &&
    bcvValue === currentRates.bcv &&
    grupoValue === currentRates.grupo;
  const canSkip = Boolean(onSkip) && (!canEdit || ratesUnchanged);

  useEffect(() => {
    setBcv(currentRates.bcv.toString());
    setGrupo(currentRates.grupo.toString());
  }, [currentRates.bcv, currentRates.grupo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      onConfirm({ rates: currentRates, notes: notes.trim() });
      return;
    }
    const newRates: ExchangeRates = {
      bcv: bcvValue || 0,
      grupo: grupoValue || 0,
      lastUpdated: new Date().toLocaleString(),
    };
    onConfirm({ rates: newRates, notes: notes.trim() });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-in fade-in duration-500">
      <div className="app-panel w-full max-w-lg overflow-hidden relative">
        {canSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/80 text-slate-500 hover:text-slate-900 hover:bg-white shadow-sm border border-slate-200 transition"
            aria-label="Omitir verificacion de tasas"
            title="Omitir"
          >
            <span className="text-lg font-black">×</span>
          </button>
        )}
        {/* Header Friendly */}
        <div className="bg-slate-50 p-8 text-center border-b border-slate-100">
          <div className="text-4xl mb-4 animate-bounce">☀️</div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            ¡Buenos dias, Equipo!
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-2">
            Antes de comenzar a operar, por favor verifiquemos las tasas de cambio de hoy.
          </p>
          {!canEdit && (
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-3">
              Solo lectura para tu rol
            </p>
          )}
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
                disabled={!canEdit}
                className={`w-full pl-12 pr-4 py-4 bg-blue-50 border-2 border-transparent focus:border-blue-500 rounded-2xl text-2xl font-black text-slate-800 outline-none transition-all text-center ${
                  canEdit ? '' : 'opacity-60 cursor-not-allowed'
                }`}
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
                disabled={!canEdit}
                className={`w-full pl-12 pr-4 py-4 bg-orange-50 border-2 border-transparent focus:border-orange-500 rounded-2xl text-2xl font-black text-slate-800 outline-none transition-all text-center ${
                  canEdit ? '' : 'opacity-60 cursor-not-allowed'
                }`}
              />
            </div>
          </div>

          <div className="relative group">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Nota opcional
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej: Tasa de cierre 4 PM"
              className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 dark:ring-white/10"
            />
          </div>

          <button
            type="submit"
            className="w-full py-5 app-btn app-btn-primary text-xs shadow-xl hover:scale-[1.02] active:scale-95 transition-all mt-4"
          >
            Confirmar y Entrar al Sistema
          </button>
        </form>

        <div className="bg-slate-50 p-4 text-center">
          <p className="text-[9px] font-black text-slate-300 uppercase">
            Seguridad Operativa • DUALIS
          </p>
        </div>
      </div>
    </div>
  );
};

export default RateCheckModal;
