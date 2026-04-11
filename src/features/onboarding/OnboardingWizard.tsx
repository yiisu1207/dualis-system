import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { doc, setDoc, addDoc, collection, getDoc } from 'firebase/firestore';
import {
  Banknote, Monitor, ArrowRight, CheckCircle2, Loader2,
  Store, Factory, Building2, Phone, Hash, Fingerprint, MapPin,
} from 'lucide-react';

const SETUP_STEPS_META = [
  { icon: Building2,   label: 'Datos del Negocio',   desc: 'Nombre, RIF y dirección',          cls: 'bg-indigo-50  dark:bg-indigo-500/10  text-indigo-600  dark:text-indigo-400'  },
  { icon: Banknote,    label: 'Finanzas',             desc: 'Tasa BCV, IVA e IGTF referencial', cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { icon: Monitor,     label: 'Terminal POS',         desc: 'Tu primera caja de ventas',        cls: 'bg-sky-50     dark:bg-sky-500/10     text-sky-600     dark:text-sky-400'     },
  { icon: Fingerprint, label: 'PIN de Seguridad',     desc: 'Crea y confirma tu PIN secreto',   cls: 'bg-rose-50    dark:bg-rose-500/10    text-rose-600    dark:text-rose-400'    },
];

export default function OnboardingWizard() {
  const { user, userProfile, updateUserProfile } = useAuth();
  const tenantId = userProfile?.businessId;

  const [step,         setStep]        = useState(0);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState('');
  const [businessName, setBusinessName] = useState('');
  const pinInputRef        = useRef<HTMLInputElement>(null);
  const pinConfirmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tid = tenantId || userProfile?.businessId;
    if (!tid) return;
    getDoc(doc(db, 'businesses', tid))
      .then(snap => { if (snap.exists()) setBusinessName(snap.data().name || ''); })
      .catch(() => {});
  }, [tenantId, userProfile]);

  const [formData, setFormData] = useState({
    companyName:       '',
    rif:               '',
    address:           '',
    phone:             '',
    mainCurrency:      'USD',
    exchangeRate:      '36.50',
    iva:               '16',
    igtfEnabled:       true,
    igtfRate:          '3',
    fiscalMediumType:  'maquina_fiscal' as 'maquina_fiscal' | 'imprenta' | 'digital_homologado' | 'ninguno',
    terminalName:      'Caja Principal 01',
    terminalType:      'detal' as 'detal' | 'mayor',
    pin:               '',
    pinConfirm:        '',
  });

  const f = (key: string, val: unknown) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  // ── Formateadores venezolanos ──────────────────────────────────────────────
  const formatRif = (raw: string): string => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!clean) return '';
    const first = clean[0];
    if (!/[JVGECPF]/.test(first)) return clean.slice(0, 9); // solo dígitos
    const digits = clean.slice(1).replace(/\D/g, '').slice(0, 9);
    if (digits.length === 0) return first;
    if (digits.length < 9) return `${first}-${digits}`;
    return `${first}-${digits.slice(0, 8)}-${digits.slice(8, 9)}`;
  };

  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    if (digits.startsWith('58')) return `+${digits}`;
    if (digits.startsWith('04') || digits.startsWith('02')) return `+58${digits.slice(1)}`;
    if (digits.startsWith('4') || digits.startsWith('2')) return `+58${digits}`;
    return raw;
  };

  // Pre-fill company name if business already has one
  useEffect(() => {
    if (businessName && !formData.companyName) {
      f('companyName', businessName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName]);

  // Auto-focus confirm input when PIN is complete
  useEffect(() => {
    if (formData.pin.length === 4 && step === 4) {
      setTimeout(() => pinConfirmInputRef.current?.focus(), 120);
    }
  }, [formData.pin, step]);

  const validate = (atStep: number): string | null => {
    if (atStep === 1 && !formData.companyName.trim())
      return 'El nombre del negocio es obligatorio.';
    if (atStep === 4) {
      if (formData.pin.length < 4) return 'El PIN debe tener 4 dígitos.';
      if (formData.pin !== formData.pinConfirm) return 'Los PINs no coinciden. Vuelve a intentarlo.';
    }
    return null;
  };

  const tryNext = (next: number) => {
    const err = validate(step);
    if (err) { setError(err); return; }
    setError('');
    setStep(next);
  };

  const handleFinish = async () => {
    const err = validate(4);
    if (err) { setError(err); return; }

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
        const generatedId = prefix + Array.from({ length: 20 }, () =>
          alphabet[Math.floor(Math.random() * alphabet.length)]
        ).join('');
        await setDoc(doc(db, 'users', user.uid), { businessId: generatedId, role: 'owner' }, { merge: true });
        await setDoc(doc(db, 'businesses', generatedId), {
          name: formData.companyName.trim() || userProfile?.fullName || user.email || 'Mi Negocio',
          ownerId: user.uid,
          createdAt: new Date().toISOString(),
        });
        currentTenantId = generatedId;
      }

      if (!currentTenantId) throw new Error('No se pudo obtener el ID del negocio.');

      // Update businesses doc with name + fiscal summary
      await setDoc(doc(db, 'businesses', currentTenantId), {
        name: formData.companyName.trim() || userProfile?.fullName || user?.email || 'Mi Negocio',
        tasaBCV: parseFloat(formData.exchangeRate) || 36.5,
        tasaGrupo: parseFloat(formData.exchangeRate) || 36.5,
        setupCompleted: true,
      }, { merge: true });

      // Full business config
      await setDoc(doc(db, 'businessConfigs', currentTenantId), {
        companyName:    formData.companyName.trim(),
        companyRif:     formData.rif.trim(),
        companyPhone:   formData.phone.trim(),
        companyAddress: formData.address.trim(),
        mainCurrency:   formData.mainCurrency,
        defaultIva:     parseFloat(formData.iva),
        tasaBCV:        parseFloat(formData.exchangeRate) || 36.5,
        tasaGrupo:      parseFloat(formData.exchangeRate) || 36.5,
        igtfEnabled:    formData.igtfEnabled,
        igtfRate:       parseFloat(formData.igtfRate) || 3,
        fiscalMediumType: formData.fiscalMediumType,
        setupCompleted: true,
        updatedAt:      new Date().toISOString(),
      });

      // Persist fiscal config to localStorage so POS reads it immediately on first open
      localStorage.setItem('fiscal_igtf_enabled',  String(formData.igtfEnabled));
      localStorage.setItem('fiscal_igtf_rate',      formData.igtfRate || '3');
      localStorage.setItem('fiscal_iva_enabled',    String(formData.iva !== '0'));
      localStorage.setItem('fiscal_scanner_enabled','true');

      // Create first terminal
      if (formData.terminalName.trim()) {
        await addDoc(collection(db, `businesses/${currentTenantId}/terminals`), {
          nombre:          formData.terminalName.trim(),
          tipo:            formData.terminalType,
          estado:          'cerrada',
          cajeroNombre:    null,
          apertura:        null,
          cierreAt:        null,
          totalFacturado:  0,
          movimientos:     0,
          createdAt:       new Date().toISOString(),
        });
      }

      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          pin:        formData.pin,
          status:     'PENDING_APPROVAL',
          businessId: currentTenantId,
        }, { merge: true });

        updateUserProfile({
          pin:        formData.pin,
          status:     'PENDING_APPROVAL',
          businessId: currentTenantId,
        });
      }

      // Redirect to pending approval wall — account must be activated by SuperAdmin.
      setTimeout(() => {
        window.location.replace(`/${currentTenantId}/pending`);
      }, 600);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error al guardar la configuración. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-5 py-4 bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-2xl text-sm font-bold focus:ring-4 focus:ring-slate-900/5 dark:focus:ring-white/10 focus:border-slate-900 dark:focus:border-white/30 transition-all outline-none shadow-inner dark:shadow-none placeholder:text-slate-400 dark:placeholder:text-white/20";

  const pinBoxClass = (entered: boolean, valid: boolean) =>
    `h-14 w-12 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${
      entered
        ? valid
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500 bg-rose-500/10 text-rose-400'
        : 'border-white/10 bg-white dark:bg-[#0d1424]/5 text-white/20'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0f1e] flex items-center justify-center p-6 font-inter">
      <div className="w-full max-w-2xl">

        {/* Progress bar */}
        {step > 0 && (
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="flex items-center gap-1.5 flex-1">
              {[1,2,3,4].map(i => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'}`} />
              ))}
            </div>
            <span className="text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest shrink-0">
              {step} / 4
            </span>
          </div>
        )}

        <div className="bg-white dark:bg-[#0d1424]rounded-[3rem] border border-slate-100 dark:border-white/[0.08] shadow-2xl dark:shadow-black/40 relative overflow-hidden p-10 md:p-12">

          {/* Error banner */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-bold">
              {error}
            </div>
          )}

          {/* ── STEP 0: WELCOME ─────────────────────────── */}
          {step === 0 && (
            <div className="space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-600">
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-[0.35em] px-4 py-2 rounded-full">
                  ✦ Configuración Inicial
                </div>
              </div>

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
                  Completa 4 pasos rápidos para activar tu sistema.
                </p>
              </div>

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

              <button
                onClick={() => setStep(1)}
                className="w-full py-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all group"
              >
                Comenzar configuración
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <p className="text-center text-[10px] font-bold text-slate-300 dark:text-white/20 uppercase tracking-widest">
                Proceso de ~2 minutos · 4 pasos simples
              </p>
            </div>
          )}

          {/* ── STEP 1: DATOS DEL NEGOCIO ─────────────────── */}
          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-inner">
                  <Building2 size={24} />
                </div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Datos del Negocio</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Completa los datos de tu negocio para comenzar.</p>
              </header>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">
                    Nombre del Negocio <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className={inputClasses}
                    placeholder="Ej. Distribuidora Pérez C.A."
                    value={formData.companyName}
                    onChange={e => f('companyName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">RIF / Registro Fiscal</label>
                  <div className="relative">
                    <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      className={`${inputClasses} pl-14`}
                      placeholder="J-12345678-0"
                      value={formData.rif}
                      onChange={e => f('rif', formatRif(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Teléfono</label>
                    <div className="relative">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input
                        className={`${inputClasses} pl-14`}
                        placeholder="04XX-0000000"
                        value={formData.phone}
                        onChange={e => f('phone', formatPhone(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Dirección</label>
                    <div className="relative">
                      <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                      <input
                        className={`${inputClasses} pl-14`}
                        placeholder="Av. Principal, Local 1"
                        value={formData.address}
                        onChange={e => f('address', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => tryNext(2)}
                className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-3 group"
              >
                Siguiente Paso <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {/* ── STEP 2: FINANZAS Y FISCAL ─────────────────── */}
          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 shadow-inner">
                  <Banknote size={24} />
                </div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Finanzas y Fiscal</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Define las tasas y contribuciones de tu operación.</p>
              </header>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Moneda Principal</label>
                    <select className={inputClasses} value={formData.mainCurrency} onChange={e => f('mainCurrency', e.target.value)}>
                      <option value="USD">Dólares ($)</option>
                      <option value="BS">Bolívares (VES)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">IVA General</label>
                    <select className={inputClasses} value={formData.iva} onChange={e => f('iva', e.target.value)}>
                      <option value="16">16% (Estándar)</option>
                      <option value="8">8% (Reducido)</option>
                      <option value="0">Exento (0%)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Tasa de Cambio BCV (Bs / USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputClasses} text-2xl text-center`}
                    value={formData.exchangeRate}
                    onChange={e => f('exchangeRate', e.target.value)}
                  />
                </div>
                {/* IGTF toggle */}
                <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">IGTF</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Impuesto a Grandes Transacciones Financieras</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => f('igtfEnabled', !formData.igtfEnabled)}
                      className={`relative h-7 w-12 rounded-full transition-colors ${formData.igtfEnabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white dark:bg-[#0d1424]shadow-sm transition-all duration-200 ${formData.igtfEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  {formData.igtfEnabled && (
                    <div className="flex items-center gap-4 pt-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">Tasa (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        className={`${inputClasses} w-28 text-center`}
                        value={formData.igtfRate}
                        onChange={e => f('igtfRate', e.target.value)}
                      />
                      <span className="text-xs text-slate-400 dark:text-slate-500">Estándar: 3%</span>
                    </div>
                  )}
                </div>

                {/* Fiscal medium selector — external document system */}
                <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-3xl p-6 space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Medio Fiscal Externo</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">¿Cómo emites tus facturas fiscales?</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Dualis es un sistema administrativo <strong>NO homologado</strong> por el SENIAT. Debes mantener tu medio fiscal externo (máquina fiscal, imprenta autorizada o sistema digital homologado) conforme a la Providencia SNAT/2011/00071.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'maquina_fiscal',     label: 'Máquina Fiscal',              desc: 'Tipo I, II o III homologada' },
                      { id: 'imprenta',           label: 'Imprenta Autorizada',         desc: 'Facturas forma libre preimpresas' },
                      { id: 'digital_homologado', label: 'Sistema Digital Homologado',  desc: 'Proveedor con RIF en lista SENIAT' },
                      { id: 'ninguno',            label: 'Aún no tengo',                desc: 'Debo gestionarlo antes de emitir facturas fiscales' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => f('fiscalMediumType', opt.id)}
                        className={`text-left px-4 py-3 rounded-2xl border transition-all ${
                          formData.fiscalMediumType === opt.id
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-white dark:bg-[#0d1424]/40 border-slate-200 dark:border-white/10 hover:border-amber-500/30'
                        }`}
                      >
                        <p className="text-xs font-black text-slate-900 dark:text-white">{opt.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  Volver
                </button>
                <button onClick={() => tryNext(3)} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: TERMINAL ─────────────────────────── */}
          {step === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-6 shadow-inner">
                  <Monitor size={24} />
                </div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Tu Primera Terminal</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Configura tu primer punto de venta físico.</p>
              </header>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Nombre de la Caja</label>
                  <input
                    className={inputClasses}
                    placeholder="Ej. Caja Principal PB"
                    value={formData.terminalName}
                    onChange={e => f('terminalName', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => f('terminalType', 'detal')}
                    className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'detal' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}
                  >
                    <Store size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Sucursal Detal</span>
                    <p className="text-[9px] opacity-60 font-bold">Ventas al consumidor final</p>
                  </button>
                  <button
                    onClick={() => f('terminalType', 'mayor')}
                    className={`py-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${formData.terminalType === 'mayor' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500'}`}
                  >
                    <Factory size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Venta al Mayor</span>
                    <p className="text-[9px] opacity-60 font-bold">Clientes con crédito y abonos</p>
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  Volver
                </button>
                <button onClick={() => tryNext(4)} className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: PIN ──────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <header>
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-6 shadow-inner">
                  <Fingerprint size={24} />
                </div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">PIN de Autoridad</h1>
                <p className="text-slate-400 dark:text-slate-500 font-medium mt-2">Crea y confirma tu llave secreta para acciones críticas.</p>
              </header>

              {/* PIN entry */}
              <div
                className={`bg-slate-900 rounded-[2rem] p-8 flex flex-col items-center text-center transition-colors ${formData.pin.length < 4 ? 'cursor-pointer hover:bg-slate-800' : ''}`}
                onClick={() => formData.pin.length < 4 && pinInputRef.current?.focus()}
              >
                <label className={`text-[10px] font-black uppercase tracking-[0.4em] mb-5 ${formData.pin.length === 4 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                  {formData.pin.length === 4 ? '✓ PIN establecido' : 'Ingresa tu PIN (4 dígitos)'}
                </label>
                <div className="flex gap-3 mb-4">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={pinBoxClass(formData.pin.length > i, true)}>
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
                  onChange={e => { f('pin', e.target.value.replace(/\D/g, '')); f('pinConfirm', ''); }}
                />
                {formData.pin.length < 4 && (
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Haz clic aquí para escribir</p>
                )}
              </div>

              {/* PIN confirm */}
              <div
                className={`rounded-[2rem] p-8 flex flex-col items-center text-center transition-all ${
                  formData.pin.length === 4
                    ? 'bg-slate-800 cursor-pointer hover:bg-slate-700'
                    : 'bg-slate-900/30 opacity-40 cursor-not-allowed'
                }`}
                onClick={() => formData.pin.length === 4 && pinConfirmInputRef.current?.focus()}
              >
                <label className={`text-[10px] font-black uppercase tracking-[0.4em] mb-5 transition-colors ${
                  formData.pinConfirm.length === 4 && formData.pinConfirm === formData.pin
                    ? 'text-emerald-400'
                    : formData.pinConfirm.length > 0 && formData.pin.slice(0, formData.pinConfirm.length) !== formData.pinConfirm
                    ? 'text-rose-400'
                    : 'text-slate-500'
                }`}>
                  {formData.pinConfirm.length === 4 && formData.pinConfirm === formData.pin
                    ? '✓ Confirmado'
                    : 'Confirma tu PIN'}
                </label>
                <div className="flex gap-3 mb-4">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={pinBoxClass(
                      formData.pinConfirm.length > i,
                      formData.pin.slice(0, formData.pinConfirm.length) === formData.pinConfirm
                    )}>
                      {formData.pinConfirm.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                <input
                  ref={pinConfirmInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  className="absolute opacity-0 h-0 w-0 overflow-hidden"
                  value={formData.pinConfirm}
                  onChange={e => f('pinConfirm', e.target.value.replace(/\D/g, ''))}
                />
                {formData.pin.length === 4 && formData.pinConfirm.length < 4 && (
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Haz clic para confirmar</p>
                )}
              </div>

              <div className="flex gap-4 pt-2">
                <button onClick={() => setStep(3)} className="flex-1 py-5 bg-slate-50 dark:bg-white/[0.05] text-slate-400 dark:text-white/40 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  Volver
                </button>
                <button
                  disabled={loading || formData.pin.length < 4 || formData.pin !== formData.pinConfirm}
                  onClick={handleFinish}
                  className="flex-[2] py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                >
                  {loading
                    ? <Loader2 className="animate-spin" size={18} />
                    : <><CheckCircle2 size={18} /> Lanzar Sistema</>
                  }
                </button>
              </div>
            </div>
          )}

        </div>
        <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-white/20 mt-10">
          Dualis ERP Config Tool © 2026
        </p>
      </div>
    </div>
  );
}
