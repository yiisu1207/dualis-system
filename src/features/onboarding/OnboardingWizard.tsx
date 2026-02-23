import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { doc, setDoc, addDoc, collection, getDoc, updateDoc } from 'firebase/firestore';
import { 
  Banknote, 
  Monitor, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Loader2, 
  Store, 
  Factory,
  ShieldCheck,
  Building2,
  Phone,
  Hash,
  Palette,
  Fingerprint,
  Layout
} from 'lucide-react';

const BRAND_COLORS = [
  { id: 'indigo', hex: 'bg-indigo-600', text: 'text-indigo-600', label: 'Corporativo' },
  { id: 'emerald', hex: 'bg-emerald-600', text: 'text-emerald-600', label: 'Ecológico' },
  { id: 'rose', hex: 'bg-rose-600', text: 'text-rose-600', label: 'Boutique' },
  { id: 'slate', hex: 'bg-slate-900', text: 'text-slate-900', label: 'Moderno' },
  { id: 'amber', hex: 'bg-amber-500', text: 'text-amber-500', label: 'Energía' },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user, userProfile, updateUserProfile } = useAuth();
  const tenantId = userProfile?.businessId;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- STATE ---
  const [formData, setFormData] = useState({
    rif: '',
    phone: '',
    mainCurrency: 'USD',
    exchangeRate: '36.50',
    iva: '16',
    terminalName: 'Caja Principal 01',
    terminalType: 'detal' as 'detal' | 'mayor',
    pin: '',
    brandColor: 'indigo',
    uiVersion: 'editorial' as 'classic' | 'editorial'
  });

  const handleFinish = async () => {
    let currentTenantId = tenantId;
    setLoading(true);
    setError('');

    try {
      if (!currentTenantId && user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          currentTenantId = data.businessId || data.empresa_id;
        }
      }

      if (!currentTenantId && user) {
        const prefix = 'key_';
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const generatedId = prefix + Array.from({length: 20}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        await updateDoc(doc(db, 'users', user.uid), { businessId: generatedId, role: 'owner' });
        await setDoc(doc(db, 'businesses', generatedId), {
          name: userProfile?.fullName || user.email || 'Mi Negocio',
          ownerId: user.uid,
          createdAt: new Date().toISOString()
        });
        currentTenantId = generatedId;
      }

      if (!currentTenantId) throw new Error('No Workspace ID');

      await setDoc(doc(db, 'businessConfigs', currentTenantId), {
        companyRif: formData.rif,
        companyPhone: formData.phone,
        mainCurrency: formData.mainCurrency,
        defaultIva: parseFloat(formData.iva),
        theme: {
          primaryColor: formData.brandColor,
          uiVersion: formData.uiVersion,
          borderRadius: '1.5rem'
        },
        setupCompleted: true,
        updatedAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'businesses', currentTenantId), {
        tasaBCV: parseFloat(formData.exchangeRate),
        tasaGrupo: parseFloat(formData.exchangeRate),
        setupCompleted: true
      });

      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          pin: formData.pin,
          status: 'ACTIVE'
        });
        updateUserProfile({ pin: formData.pin, status: 'ACTIVE' });
      }

      await addDoc(collection(db, 'businesses', currentTenantId, 'terminals'), {
        nombre: formData.terminalName,
        tipo: formData.terminalType,
        estado: 'cerrada',
        totalFacturado: 0,
        movimientos: 0,
        cajeroId: user?.uid || '',
        cajeroNombre: userProfile?.fullName || 'Admin',
        createdAt: new Date().toISOString()
      });

      navigate(`/${currentTenantId}/admin/dashboard`);
    } catch (err: any) {
      console.error(err);
      setError('Error al guardar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all outline-none shadow-inner";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-inter">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between gap-2 mb-8 px-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
          ))}
        </div>

        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl p-10 md:p-12 relative overflow-hidden">
          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-inner"><Building2 size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Identidad Fiscal</h1>
                <p className="text-slate-400 font-medium mt-2">¿Cómo aparecerá tu negocio en las facturas?</p>
              </header>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">RIF / Registro Fiscal</label>
                  <div className="relative">
                    <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input className={`${inputClasses} pl-14`} placeholder="J-12345678-0" value={formData.rif} onChange={e => setFormData({...formData, rif: e.target.value.toUpperCase()})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Teléfono Corporativo</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input className={`${inputClasses} pl-14`} placeholder="+58 412 0000000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>
              </div>
              <button onClick={() => setStep(2)} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 group">Siguiente Paso <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 shadow-inner"><Banknote size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Finanzas y Moneda</h1>
                <p className="text-slate-400 font-medium mt-2">Define tu motor económico inicial.</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Moneda de Visualización</label>
                  <select className={inputClasses} value={formData.mainCurrency} onChange={e => setFormData({...formData, mainCurrency: e.target.value})}>
                    <option value="USD">Dólares ($)</option>
                    <option value="BS">Bolívares (VES)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">IVA General (%)</label>
                  <select className={inputClasses} value={formData.iva} onChange={e => setFormData({...formData, iva: e.target.value})}>
                    <option value="16">16% (Estándar)</option>
                    <option value="8">8% (Reducido)</option>
                    <option value="0">Exento (0%)</option>
                  </select>
                </div>
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Tasa de Cambio Inicial (BCV)</label>
                  <input type="number" step="0.01" className={`${inputClasses} text-2xl text-center`} value={formData.exchangeRate} onChange={e => setFormData({...formData, exchangeRate: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black text-xs uppercase tracking-widest">Volver</button>
                <button onClick={() => setStep(3)} className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Continuar</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-6 shadow-inner"><Monitor size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tu Primera Terminal</h1>
                <p className="text-slate-400 font-medium mt-2">Configura tu primer punto de venta físico.</p>
              </header>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Nombre de la Caja</label>
                  <input className={inputClasses} placeholder="Ej. Caja Principal PB" value={formData.terminalName} onChange={e => setFormData({...formData, terminalName: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setFormData({...formData, terminalType: 'detal'})} className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'detal' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                    <Store size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Sucursal Detal</span>
                  </button>
                  <button onClick={() => setFormData({...formData, terminalType: 'mayor'})} className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'mayor' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                    <Factory size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Venta al Mayor</span>
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="flex-1 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black text-xs uppercase tracking-widest">Volver</button>
                <button onClick={() => setStep(4)} className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Continuar</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-6 shadow-inner"><Fingerprint size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">PIN de Autoridad</h1>
                <p className="text-slate-400 font-medium mt-2">Crea una llave secreta para acciones críticas.</p>
              </header>
              <div className="bg-slate-900 rounded-[2.5rem] p-10 flex flex-col items-center text-center">
                <label className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-6">4 DÍGITOS REQUERIDOS</label>
                <div className="flex gap-4 mb-8">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`h-16 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${formData.pin.length > i ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                      {formData.pin.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                <input type="password" maxLength={4} className="absolute opacity-0 pointer-events-none" autoFocus value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Este PIN será necesario para borrar facturas o clientes.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(3)} className="flex-1 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black text-xs uppercase tracking-widest">Volver</button>
                <button disabled={formData.pin.length < 4} onClick={() => setStep(5)} className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl disabled:opacity-50">Establecer PIN</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 shadow-inner"><Palette size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Estilo Visual</h1>
                <p className="text-slate-400 font-medium mt-2">Personaliza la estética de tu panel de control.</p>
              </header>
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Color de Marca</label>
                  <div className="flex justify-between gap-2 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    {BRAND_COLORS.map(c => (
                      <button key={c.id} onClick={() => setFormData({...formData, brandColor: c.id})} className={`h-12 w-12 rounded-2xl transition-all ${c.hex} ${formData.brandColor === c.id ? 'ring-4 ring-offset-4 ring-slate-900 scale-110' : 'opacity-40 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Versión de Interfaz</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setFormData({...formData, uiVersion: 'editorial'})} className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-2 ${formData.uiVersion === 'editorial' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                      <Layout size={20} />
                      <span className="text-xs font-black uppercase">Editorial</span>
                      <p className="text-[9px] font-bold opacity-60">Diseño espaciado y moderno</p>
                    </button>
                    <button onClick={() => setFormData({...formData, uiVersion: 'classic'})} className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-2 ${formData.uiVersion === 'classic' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                      <Monitor size={20} />
                      <span className="text-xs font-black uppercase">Clásico</span>
                      <p className="text-[9px] font-bold opacity-60">Compacto y tradicional</p>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(4)} className="flex-1 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black text-xs uppercase tracking-widest">Volver</button>
                <button disabled={loading} onClick={handleFinish} className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3">
                  {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> Lanzar Sistema</>}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 mt-10">Dualis ERP Config Tool &copy; 2026</p>
      </div>
    </div>
  );
}
