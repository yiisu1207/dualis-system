import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ArrowRight, Loader2, Chrome, Github, ShieldCheck } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../firebase/api';
import Logo from './ui/Logo';

export default function Register() {
  const [formData, setFormData] = useState({
    businessName: '',
    fullName: '',
    displayName: '',
    email: '',
    password: '',
    nationalId: '',
    country: '',
    workspaceCode: '',
  });
  const [workspaceMode, setWorkspaceMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  const nav = useNavigate();
  const { user } = useAuth();
  const captchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

  React.useEffect(() => {
    if (user) nav('/');
  }, [user, nav]);

  const countryOptions = ['Venezuela', 'Colombia', 'Panama', 'Republica Dominicana', 'USA'];

  const generateWorkspaceId = () => {
    const prefix = 'key_';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!';
    const size = 28;
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${prefix}${token}`;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!acceptedTerms) {
      alert('Debes aceptar los términos para continuar.');
      setLoading(false);
      return;
    }

    if (captchaKey && !captchaToken) {
      alert('Completa el captcha antes de continuar.');
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      const uid = userCredential.user.uid;

      let businessId = formData.workspaceCode;

      if (workspaceMode === 'join' && !businessId) {
        throw new Error('Debes ingresar el código del espacio de trabajo.');
      }

      if (workspaceMode === 'create') {
        let attempts = 0;
        let generatedId = generateWorkspaceId();
        while (attempts < 3) {
          const existsSnap = await getDoc(doc(db, 'businesses', generatedId));
          if (!existsSnap.exists()) break;
          generatedId = generateWorkspaceId();
          attempts += 1;
        }

        businessId = generatedId;
        await setDoc(doc(db, 'businesses', businessId), {
          name: formData.businessName,
          ownerId: uid,
          createdAt: new Date().toISOString(),
          plan: 'free_tier',
        });
        try {
          await logAudit(uid, 'create_workspace', { businessId, name: formData.businessName });
        } catch (e) {}
      } else {
        const workspaceRef = doc(db, 'businesses', businessId);
        const workspaceSnap = await getDoc(workspaceRef);
        if (!workspaceSnap.exists()) {
          throw new Error('El código del espacio de trabajo no es válido.');
        }
      }

      const role = workspaceMode === 'create' ? 'owner' : 'employee';
      const status = workspaceMode === 'create' ? 'ACTIVE' : 'PENDING';
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: formData.email,
        fullName: formData.fullName,
        displayName: formData.displayName,
        businessId: businessId,
        role,
        status,
        nationalId: formData.nationalId,
        country: formData.country,
        uiVersion: 'editorial',
      });

      try {
        await setDoc(doc(db, 'businesses', businessId, 'members', uid), {
          uid,
          email: formData.email,
          fullName: formData.fullName,
          displayName: formData.displayName,
          role,
          status,
          joinedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        console.warn('Failed to write members subcollection', e);
      }
      try { await logAudit(uid, 'create_user', { businessId, email: formData.email }); } catch (e) {}
      
      setCaptchaToken(null);
      
      if (workspaceMode === 'create') {
        setSuccessCode(businessId);
      } else {
        nav('/login');
      }
    } catch (error: any) {
      console.error(error);
      alert('Error al registrar: ' + error.message);
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-white border border-slate-300 text-slate-900 rounded-xl placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none text-sm transition-all";

  // PANTALLA DE ÉXITO (BÓVEDA DE SEGURIDAD)
  if (successCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-slate-900 overflow-hidden relative">
        {/* Decoración de fondo de seguridad */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#4f46e5_0%,transparent_50%)]"></div>
        </div>

        <div className="bg-white rounded-[3rem] w-full max-w-lg p-12 flex flex-col items-center text-center shadow-[0_0_100px_rgba(79,70,229,0.3)] relative z-10 animate-in zoom-in duration-500">
          <div className="h-20 w-20 bg-rose-50 text-rose-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-rose-100 animate-pulse">
            <ShieldCheck size={40} />
          </div>
          
          <h2 className="text-3xl font-black mb-4 text-slate-900 tracking-tight">¡ACCIÓN REQUERIDA!</h2>
          <p className="mb-8 text-slate-500 text-sm leading-relaxed">
            Tu empresa ha sido creada, pero tu acceso está **encriptado**. <br/>
            Guarda este código ahora mismo. Sin él, **perderás tu cuenta para siempre**.
          </p>

          <div className="bg-slate-50 border-2 border-dashed border-rose-200 rounded-3xl p-8 mb-8 w-full group relative overflow-hidden">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-400 mb-4">Código de Espacio Único</p>
            <div className="text-2xl font-mono font-black text-slate-900 break-all select-all tracking-wider mb-2">
              {successCode}
            </div>
            <div className="text-[9px] font-bold text-slate-400 uppercase">Haz clic para seleccionar y copiar</div>
          </div>

          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 mb-10">
            <p className="text-xs font-bold text-rose-700 leading-relaxed uppercase tracking-tight">
              ⚠️ NADIE de nuestro equipo te pedirá este código. Es tu llave privada. Si la pierdes, no podemos recuperarla.
            </p>
          </div>

          <button
            className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
            onClick={() => nav('/login')}
          >
            ENTENDIDO, IR AL LOGIN <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // PANTALLA DE REGISTRO PRINCIPAL
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div
        className={`bg-white border border-slate-100 shadow-2xl rounded-[2.5rem] w-full max-w-lg p-10 transition-transform duration-300 ${
          hovered ? 'scale-[1.01]' : 'scale-100'
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="h-12 w-auto" textClassName="text-slate-900" />
          <p className="text-sm font-bold text-slate-400 mt-3 uppercase tracking-widest">
            Crea tu espacio de trabajo en minutos
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5 bg-white">
          
          {/* SELECTOR DE MODO */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-2xl p-1.5 mb-2">
            <button
              type="button"
              onClick={() => setWorkspaceMode('create')}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                workspaceMode === 'create'
                  ? 'bg-white shadow-md text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Crear Empresa
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('join')}
              className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                workspaceMode === 'join'
                  ? 'bg-white shadow-md text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Unirme a Equipo
            </button>
          </div>

          {/* CAMPOS DINÁMICOS */}
          {workspaceMode === 'create' ? (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Nombre de la Empresa</label>
              <input
                required
                type="text"
                placeholder="Ej. Boutique Los Ángeles C.A."
                className={inputClasses}
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Código del Espacio</label>
              <input
                required
                type="text"
                placeholder="Pega el código aquí (key_...)"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClasses} font-mono`}
                value={formData.workspaceCode}
                onChange={(e) => setFormData({ ...formData, workspaceCode: e.target.value })}
              />
            </div>
          )}

          {/* DATOS PERSONALES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Nombre Completo</label>
              <input
                required
                type="text"
                placeholder="Ej. Jesús Salazar"
                className={inputClasses}
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Nombre Público</label>
              <input
                required
                type="text"
                placeholder="Ej. Jesús"
                className={inputClasses}
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Correo Electrónico</label>
            <input
              required
              type="email"
              placeholder="jesus@miempresa.com"
              className={inputClasses}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Contraseña Segura</label>
            <input
              required
              type="password"
              placeholder="••••••••"
              className={inputClasses}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Cédula / RIF</label>
              <input
                required
                type="text"
                placeholder="V-12345678"
                className={inputClasses}
                value={formData.nationalId}
                onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">País</label>
              <select
                required
                className={inputClasses}
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              >
                <option value="">Seleccionar</option>
                {countryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TÉRMINOS */}
          <div className="pt-2">
            <label className="flex items-start gap-4 text-xs text-slate-500 font-medium">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-5 w-5 rounded-lg border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="leading-relaxed">
                Acepto los{' '}
                <button type="button" onClick={() => nav('/terms')} className="font-black text-slate-900 underline hover:text-indigo-600 transition-colors">
                  Términos de Servicio
                </button>{' '}
                y la{' '}
                <button type="button" onClick={() => nav('/privacy')} className="font-black text-slate-900 underline hover:text-indigo-600 transition-colors">
                  Política de Privacidad
                </button>.
              </span>
            </label>
          </div>

          <div className="flex justify-center pt-2">
            {captchaKey ? (
              <ReCAPTCHA sitekey={captchaKey} onChange={(value) => setCaptchaToken(value)} />
            ) : (
              <div className="text-[10px] font-mono text-slate-300 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 uppercase tracking-widest">Captcha Omitido</div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !acceptedTerms || (captchaKey ? !captchaToken : false)}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            {loading ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <>
                {workspaceMode === 'create' ? 'Crear Mi Empresa' : 'Unirme al Equipo'} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

        </form>

        <div className="mt-8 text-center text-sm text-slate-400 font-bold border-t border-slate-50 pt-8">
          ¿Ya tienes una cuenta?{' '}
          <button
            onClick={() => nav('/login')}
            className="text-indigo-600 hover:text-indigo-800 uppercase tracking-widest"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

// Para que no falte la importación de CheckCircle2 que usé en la pantalla de éxito
import { CheckCircle2 } from 'lucide-react';
