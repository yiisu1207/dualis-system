import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { 
  Banknote, 
  Monitor, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Loader2, 
  Store, 
  Factory,
  ShieldCheck
} from 'lucide-react';

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const tenantId = userProfile?.businessId;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Finanzas
  const [exchangeRate, setExchangeRate] = useState('36.50');

  // Step 2: Terminal
  const [terminalName, setTerminalName] = useState('Caja Principal 01');
  const [terminalType, setTerminalType] = useState<'detal' | 'mayor'>('detal');

  const handleFinish = async () => {
    if (!tenantId) {
      setError('No se detectó un espacio de trabajo válido.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Guardar Tasa Inicial en businessConfigs
      await setDoc(doc(db, 'businessConfigs', tenantId), {
        currency: 'BS',
        exchangeRate: parseFloat(exchangeRate),
        updatedAt: new Date().toISOString(),
        setupCompleted: true
      }, { merge: true });

      // 2. Crear Primera Terminal (Caja)
      await addDoc(collection(db, 'businesses', tenantId, 'terminals'), {
        nombre: terminalName,
        tipo: terminalType,
        estado: 'cerrada',
        totalFacturado: 0,
        movimientos: 0,
        cajeroId: '',
        cajeroNombre: 'Sin asignar',
        createdAt: new Date().toISOString()
      });

      // 3. Redirigir al Dashboard
      navigate(`/${tenantId}/admin/dashboard`);
    } catch (err: any) {
      console.error(err);
      setError('Hubo un problema al guardar la configuración inicial.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black text-slate-900 focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all outline-none shadow-inner";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-inter">
      <div className="w-full max-w-xl">
        
        {/* PROGRESS INDICATOR */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className={`h-2 w-12 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
          <div className={`h-2 w-12 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
        </div>

        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/60 p-10 md:p-12 animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
          
          {/* DECORATIVE ELEMENT */}
          <div className="absolute -top-24 -right-24 h-48 w-48 bg-slate-50 rounded-full blur-3xl opacity-50"></div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl shadow-slate-200">
                <ShieldCheck size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Configuración Final</span>
            </div>

            {/* STEP 1: FINANCE */}
            {step === 1 && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">Establece tu moneda</h1>
                  <p className="text-slate-400 font-medium mt-2">Define la tasa de cambio base para tus operaciones en Bolívares.</p>
                </div>

                <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100 space-y-6">
                  <div className="flex items-center gap-4 text-emerald-600 mb-2">
                    <Banknote size={24} />
                    <span className="text-xs font-black uppercase tracking-widest">Tasa de Cambio (BS x USD)</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      className={inputClasses}
                      placeholder="0.00"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-slate-300">VES</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed uppercase tracking-wider text-center">Podrás actualizar esta tasa diariamente desde tu panel principal.</p>
                </div>

                <button 
                  onClick={() => setStep(2)}
                  className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 group"
                >
                  Siguiente Paso <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            {/* STEP 2: TERMINAL */}
            {step === 2 && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tu primer punto de venta</h1>
                  <p className="text-slate-400 font-medium mt-2">Crea tu terminal inicial para comenzar a facturar de inmediato.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Nombre de la Terminal</label>
                    <div className="relative">
                      <Monitor className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                      <input 
                        value={terminalName}
                        onChange={(e) => setTerminalName(e.target.value)}
                        className={`${inputClasses} pl-14`}
                        placeholder="Ej. Caja Principal"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Tipo de Operación</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setTerminalType('detal')}
                        className={`py-5 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${terminalType === 'detal' ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                      >
                        <Store size={24} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Detal / Retail</span>
                      </button>
                      <button 
                        onClick={() => setTerminalType('mayor')}
                        className={`py-5 rounded-[1.5rem] border-2 transition-all flex flex-col items-center gap-2 ${terminalType === 'mayor' ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                      >
                        <Factory size={24} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Venta al Mayor</span>
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold text-center animate-pulse">
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep(1)}
                    className="flex-1 py-5 bg-white border border-slate-200 text-slate-400 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={18} /> Volver
                  </button>
                  <button 
                    disabled={loading || !terminalName.trim()}
                    onClick={handleFinish}
                    className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> Finalizar Setup</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 mt-10">Dualis ERP &copy; 2026</p>
      </div>
    </div>
  );
}
