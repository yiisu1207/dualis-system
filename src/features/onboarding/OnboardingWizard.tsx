import React, { useState, useEffect } from 'react';
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

const SETUP_STEPS_META = [
  { icon: Building2,  label: 'Identidad Fiscal',   desc: 'RIF y teléfono corporativo',   cls: 'bg-indigo-50  dark:bg-indigo-500/10  text-indigo-600  dark:text-indigo-400'  },
  { icon: Banknote,   label: 'Finanzas y Moneda',   desc: 'Tasa BCV e IVA inicial',        cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { icon: Monitor,    label: 'Terminal POS',         desc: 'Tu primera caja de ventas',     cls: 'bg-sky-50     dark:bg-sky-500/10     text-sky-600     dark:text-sky-400'     },
  { icon: Fingerprint,label: 'PIN de Seguridad',     desc: 'Llave de acciones críticas',    cls: 'bg-rose-50    dark:bg-rose-500/10    text-rose-600    dark:text-rose-400'    },
  { icon: Palette,    label: 'Estilo Visual',         desc: 'Personaliza tu interfaz',       cls: 'bg-amber-50   dark:bg-amber-500/10   text-amber-600   dark:text-amber-400'  },
];

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

  const [step,         setStep]        = useState(0);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState('');
  const [businessName, setBusinessName] = useState('');
  const pinInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch business name to display in welcome screen
  useEffect(() => {
    const tid = tenantId || userProfile?.businessId;
    if (!tid) return;
    getDoc(doc(db, 'businesses', tid))
      .then(snap => { if (snap.exists()) setBusinessName(snap.data().name || ''); })
      .catch(() => {});
  }, [tenantId, userProfile]);

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
        tasaBCV: parseFloat(formData.exchangeRate),
        tasaGrupo: parseFloat(formData.exchangeRate),
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

      // Crear la primera terminal configurada en paso 3
      if (formData.terminalName) {
        await addDoc(collection(db, `businesses/${currentTenantId}/terminals`), {
          nombre: formData.terminalName,
          tipo: formData.terminalType,
          estado: 'cerrada',
          cajeroNombre: null,
          apertura: null,
          cierreAt: null,
          totalFacturado: 0,
          movimientos: 0,
          createdAt: new Date().toISOString(),
        });
      }

      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          pin: formData.pin,
          status: 'ACTIVE',
          businessId: currentTenantId
        });

        // Actualización atómica local para evitar el loop del router
        updateUserProfile({
          pin: formData.pin,
          status: 'ACTIVE',
          businessId: currentTenantId
        });
      }

      // Pequeña espera para que el estado de Firebase se propague
      setTimeout(() => {
        navigate(`/${currentTenantId}/admin/dashboard`, { replace: true });
      }, 500);
    } catch (err: any) {
      console.error(err);
      setError('Error al guardar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-5 py-4 bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl text-sm font-bold focus:ring-4 focus:ring-slate-900/5 dark:focus:ring-white/10 focus:border-slate-900 dark:focus:border-white/30 transition-all outline-none shadow-inner dark:shadow-none placeholder:text-slate-400 dark:placeholder:text-white/20";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0f1e] flex items-center justify-center p-6 font-inter">
      <div className="w-full max-w-2xl">
        {step > 0 && (
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="flex items-center gap-1.5 flex-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-white/10'}`} />
              ))}
            </div>
            <span className="text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest shrink-0">
              {step} / 5
            </span>
          </div>
        )}

        <div className={`bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/[0.08] shadow-2xl dark:shadow-black/40 relative overflow-hidden ${step === 0 ? 'p-10 md:p-12' : 'p-10 md:p-12'}`}>

          {/* ── STEP 0: WELCOME ─────────────────────────── */}
          {step === 0 && (
            <div className="space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-600">
              {/* Badge */}
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-[0.35em] px-4 py-2 rounded-full">
                  ✦ Configuración Inicial
                </div>
              </div>

              {/* Greeting */}
              <div className="text-center">
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  ¡Hola,{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
                    {userProfile?.displayName || userProfile?.fullName || 'bienvenido'}!
                  </span>
                </h1>
                {businessName ? (
                  <p className="text-slate-500 dark:text-slate-400 mt-3 text-base">
                    <span className="font-black text-slate-800 dark:text-white">{businessName}</span> está casi lista para operar.
                  </p>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 mt-3 text-base">Tu espacio está casi listo.</p>
                )}
                <p className="text-slate-400 dark:text-slate-500 mt-1.5 text-sm">
                  Completa 5 pasos rápidos para activar tu sistema.
                </p>
              </div>

              {/* Setup steps preview */}
              <div className="space-y-2.5">
                {SETUP_STEPS_META.map(({ icon: Icon, label, desc, cls }, i) => (
                  <div key={label} className="flex items-center gap-4 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] rounded-2xl px-5 py-3.5 hover:border-slate-200 dark:hover:border-white/[0.12] transition-colors">
                    <div className={`h-9 w-9 rounded-xl ${cls} flex items-center justify-center shrink-0`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{label}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{desc}</p>
                    </div>
                    <div className="h-6 w-6 rounded-full border-2 border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-slate-400 dark:text-white/30">{i + 1}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* User info card */}
              {userProfile && (
                <div className="flex items-center gap-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl px-5 py-4">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/20 shrink-0">
                    {(userProfile.displayName || userProfile.fullName || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {userProfile.fullName || userProfile.displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userProfile.email}</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 px-3 py-1.5 rounded-full shrink-0">
                    {userProfile.role}
                  </span>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={() => setStep(1)}
                className="w-full py-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all group"
              >
                Comenzar configuración
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <p className="text-center text-[10px] font-bold text-slate-300 dark:text-white/20 uppercase tracking-widest">
                Proceso de ~2 minutos · 5 pasos simples
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-inner"><Building2 size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Identidad Fiscal</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">¿Cómo aparecerá tu negocio en las facturas?</p>
              </header>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">RIF / Registro Fiscal</label>
                  <div className="relative">
                    <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input className={`${inputClasses} pl-14`} placeholder="J-12345678-0" value={formData.rif} onChange={e => setFormData({...formData, rif: e.target.value.toUpperCase()})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Teléfono Corporativo</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input className={`${inputClasses} pl-14`} placeholder="+58 412 0000000" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>
              </div>
              <button onClick={() => setStep(2)} className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-3 group">Siguiente Paso <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 shadow-inner"><Banknote size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Finanzas y Moneda</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Define tu motor económico inicial.</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Moneda de Visualización</label>
                  <select className={inputClasses} value={formData.mainCurrency} onChange={e => setFormData({...formData, mainCurrency: e.target.value})}>
                    <option value="USD">Dólares ($)</option>
                    <option value="BS">Bolívares (VES)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">IVA General (%)</label>
                  <select className={inputClasses} value={formData.iva} onChange={e => setFormData({...formData, iva: e.target.value})}>
                    <option value="16">16% (Estándar)</option>
                    <option value="8">8% (Reducido)</option>
                    <option value="0">Exento (0%)</option>
                  </select>
                </div>
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Tasa de Cambio Inicial (BCV)</label>
                  <input type="number" step="0.01" className={`${inputClasses} text-2xl text-center`} value={formData.exchangeRate} onChange={e => setFormData({...formData, exchangeRate: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">Volver</button>
                <button onClick={() => setStep(3)} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Continuar</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-6 shadow-inner"><Monitor size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Tu Primera Terminal</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Configura tu primer punto de venta físico.</p>
              </header>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Nombre de la Caja</label>
                  <input className={inputClasses} placeholder="Ej. Caja Principal PB" value={formData.terminalName} onChange={e => setFormData({...formData, terminalName: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setFormData({...formData, terminalType: 'detal'})} className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'detal' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}>
                    <Store size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Sucursal Detal</span>
                  </button>
                  <button onClick={() => setFormData({...formData, terminalType: 'mayor'})} className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'mayor' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}>
                    <Factory size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Venta al Mayor</span>
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">Volver</button>
                <button onClick={() => setStep(4)} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">Continuar</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-6 shadow-inner"><Fingerprint size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">PIN de Autoridad</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Crea una llave secreta para acciones críticas.</p>
              </header>
              <div 
                className="bg-slate-900 rounded-[2.5rem] p-10 flex flex-col items-center text-center cursor-pointer hover:bg-slate-800 transition-colors"
                onClick={() => pinInputRef.current?.focus()}
              >
                <label className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-6">4 DÍGITOS REQUERIDOS</label>
                <div className="flex gap-4 mb-8">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`h-16 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${formData.pin.length > i ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                      {formData.pin.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                <input 
                  ref={pinInputRef}
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4} 
                  className="absolute opacity-0 h-0 w-0 overflow-hidden" 
                  autoFocus 
                  value={formData.pin} 
                  onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} 
                />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Haz clic aquí para escribir tu PIN.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(3)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">Volver</button>
                <button disabled={formData.pin.length < 4} onClick={() => setStep(5)} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl disabled:opacity-50">Establecer PIN</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 shadow-inner"><Palette size={24} /></div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Estilo Visual</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Personaliza la estética de tu panel de control.</p>
              </header>
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Color de Marca</label>
                  <div className="flex justify-between gap-2 bg-slate-50 dark:bg-white/[0.03] p-4 rounded-3xl border border-slate-100 dark:border-white/[0.06]">
                    {BRAND_COLORS.map(c => (
                      <button key={c.id} onClick={() => setFormData({...formData, brandColor: c.id})} className={`h-12 w-12 rounded-2xl transition-all ${c.hex} ${formData.brandColor === c.id ? 'ring-4 ring-offset-4 ring-slate-900 scale-110' : 'opacity-40 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Versión de Interfaz</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setFormData({...formData, uiVersion: 'editorial'})} className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-2 ${formData.uiVersion === 'editorial' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}>
                      <Layout size={20} />
                      <span className="text-xs font-black uppercase">Editorial</span>
                      <p className="text-[9px] font-bold opacity-60">Diseño espaciado y moderno</p>
                    </button>
                    <button onClick={() => setFormData({...formData, uiVersion: 'classic'})} className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-2 ${formData.uiVersion === 'classic' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}>
                      <Monitor size={20} />
                      <span className="text-xs font-black uppercase">Clásico</span>
                      <p className="text-[9px] font-bold opacity-60">Compacto y tradicional</p>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(4)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">Volver</button>
                <button disabled={loading} onClick={handleFinish} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl disabled:opacity-50 flex items-center justify-center gap-3">
                  {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> Lanzar Sistema</>}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-white/20 mt-10">Dualis ERP Config Tool &copy; 2026</p>
      </div>
    </div>
  );
}
