import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { signInWithEmailAndPassword, signInWithCustomToken, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { startAuthentication } from '@simplewebauthn/browser';
import { LogIn, Mail, Lock, Loader2, ArrowLeft, Building2 } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './ui/Logo';

export default function Login() {
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [recentUsers, setRecentUsers] = useState<Array<{ email: string; lastUsed: string }>>(() => {
    try {
      const raw = localStorage.getItem('erp_login_users');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const captchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

  const RATE_LIMIT_KEY = 'login_rate_limit_v1';
  const MAX_ATTEMPTS = 5;
  const WINDOW_MS = 10 * 60 * 1000;
  const LOCK_MS = 10 * 60 * 1000;

  const sanitizeEmail = (value: string) => value.replace(/[<>]/g, '').trim();

  const readRateLimit = () => {
    try {
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { count: number; firstAttempt: number; lockedUntil?: number };
    } catch {
      return null;
    }
  };

  const writeRateLimit = (next: { count: number; firstAttempt: number; lockedUntil?: number }) => {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(next));
  };

  // Redirige si el usuario ya está autenticado antes de que llegue al login
  React.useEffect(() => {
    if (user && !authLoading) nav('/');
  }, [user, authLoading, nav]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!workspaceCode) {
      setError('El Código de Espacio es obligatorio.');
      setLoading(false);
      return;
    }

    if (captchaKey && !captchaToken) {
      setError('Completa el captcha antes de continuar.');
      setLoading(false);
      return;
    }
    if (!captchaKey) {
      console.info('Modo Dev: Captcha omitido');
    }

    const now = Date.now();
    const current = readRateLimit();
    if (current?.lockedUntil && now < current.lockedUntil) {
      const waitMs = current.lockedUntil - now;
      setError(`Demasiados intentos. Intenta de nuevo en ${Math.ceil(waitMs / 60000)} min.`);
      setLoading(false);
      return;
    }

    const safeEmail = sanitizeEmail(email);

    try {
      // 1. Iniciar sesión normal
      const cred = await signInWithEmailAndPassword(auth, safeEmail, pass);
      
      // 2. Validar empresa_id con paciencia (evitar carrera con AuthContext)
      let userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      
      // Re-intento corto si el documento aún no existe (para registros recién hechos)
      if (!userDoc.exists()) {
        await new Promise(r => setTimeout(r, 1000));
        userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      }

      if (!userDoc.exists()) {
        // Si el documento NO existe, informamos pero NO deslogueamos. 
        // El TenantGuard eventualmente lo enviará a /onboarding.
        setError('Tu perfil está siendo procesado. Si el problema persiste, contacta a soporte.');
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const userBusinessId = userData.businessId || userData.empresa_id;

      // VALIDACIÓN ESTRICTA DE CÓDIGO DE ESPACIO
      if (userBusinessId && userBusinessId !== workspaceCode.trim()) {
        await auth.signOut();
        setError('Acceso Denegado: El Código de Espacio no coincide con esta cuenta.');
        setLoading(false);
        return;
      }

      // 3. Guardar usuario reciente y limpiar rate limit
      const next = [
        { email: safeEmail.toLowerCase(), lastUsed: new Date().toISOString() },
        ...recentUsers.filter((u) => u.email.toLowerCase() !== safeEmail.toLowerCase()),
      ].slice(0, 8);
      setRecentUsers(next);
      localStorage.setItem('erp_login_users', JSON.stringify(next));
      localStorage.removeItem(RATE_LIMIT_KEY);
      setCaptchaToken(null);

      // 4. Navegar directamente al destino correcto según el estado del perfil
      const effectiveBusinessId = userBusinessId || workspaceCode.trim();
      const userStatus = userData.status || 'ACTIVE';
      if (userStatus === 'ACTIVE' && effectiveBusinessId) {
        nav(`/${effectiveBusinessId}/admin/dashboard`, { replace: true });
      } else {
        // PENDING_SETUP u otro estado → onboarding
        nav('/onboarding', { replace: true });
      }
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      const nextWindow = current && now - current.firstAttempt <= WINDOW_MS
        ? current
        : { count: 0, firstAttempt: now };
      const nextCount = nextWindow.count + 1;
      const shouldLock = nextCount >= MAX_ATTEMPTS;
      const lockedUntil = shouldLock ? now + LOCK_MS : undefined;
      writeRateLimit({ count: nextCount, firstAttempt: nextWindow.firstAttempt, lockedUntil });
      if (shouldLock && lockedUntil) {
        setError('Demasiados intentos. Intenta de nuevo en 10 min.');
      } else {
        setError(err.message || 'Correo, contraseña o código incorrectos.');
      }
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      setPasskeyLoading(true);
      const optionsRes = await fetch('/api/passkey-auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!optionsRes.ok) throw new Error('No se pudieron crear opciones de acceso.');
      const { options, challengeId } = await optionsRes.json();
      const assertionResponse = await startAuthentication(options);

      const verifyRes = await fetch('/api/passkey-auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertionResponse, challengeId }),
      });
      if (!verifyRes.ok) throw new Error('No se pudo verificar la llave de acceso.');
      const { token } = await verifyRes.json();
      await signInWithCustomToken(auth, token);
    } catch (e) {
      console.error(e);
      setError('No se pudo iniciar sesion con llave de acceso.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const safeEmail = sanitizeEmail(email);
    if (!safeEmail) {
      setError('Ingresa tu correo para restablecer la contrasena.');
      return;
    }

    try {
      setResetLoading(true);
      setError('');
      await sendPasswordResetEmail(auth, safeEmail);
      alert('Revisa tu correo para restablecer la contrasena.');
    } catch (e) {
      console.error(e);
      setError('No se pudo enviar el correo de restablecimiento.');
    } finally {
      setResetLoading(false);
    }
  };

  const inputClasses = "w-full px-4 py-3 bg-white border border-slate-300 text-slate-900 rounded-xl placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 focus:border-slate-900 focus:outline-none text-sm transition-all";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12 relative overflow-y-auto custom-scroll">
      <button
        onClick={() => nav('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
      >
        <ArrowLeft size={16} /> Volver al inicio
      </button>

      <div className="w-full max-w-md">
        <div
          className={`bg-white shadow-xl rounded-[2rem] border border-slate-100 p-8 transition-transform duration-300 ${
            hovered ? 'scale-[1.02]' : 'scale-100'
          }`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="flex flex-col items-center text-center">
            <Logo className="h-12 w-auto" textClassName="text-slate-900" />
            <p className="text-xs text-slate-500 mt-2">
              Acceso seguro y moderno
            </p>
          </div>

          {error && (
            <div className="mt-6 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 text-center font-bold animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 mb-2 block">
                Código de Espacio
              </label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  required
                  type="text"
                  className={`${inputClasses} pl-11 font-mono`}
                  placeholder="key_..."
                  value={workspaceCode}
                  onChange={e => setWorkspaceCode(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between ml-1 mb-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Correo electrónico
                </label>
                <button
                  type="button"
                  onClick={() => setShowUserPicker(true)}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800"
                >
                  Usuarios Recientes
                </button>
              </div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  required
                  type="email"
                  className={`${inputClasses} pl-11`}
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={e => setEmail(sanitizeEmail(e.target.value))}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between ml-1 mb-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  required
                  type="password"
                  className={`${inputClasses} pl-11`}
                  placeholder="••••••••"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Entrar al Sistema'}
            </button>

            <div className="flex justify-center pt-2">
              {captchaKey ? (
                <ReCAPTCHA sitekey={captchaKey} onChange={value => setCaptchaToken(value)} />
              ) : (
                <div className="text-[10px] font-mono text-slate-300">MODO_DEV: CAPTCHA_BYPASS</div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              className="w-full py-3 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all"
            >
              {passkeyLoading ? 'Validando...' : 'Usar llave de acceso (Passkey)'}
            </button>
          </form>

          {showUserPicker && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
              <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                    Usuarios Guardados
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowUserPicker(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {recentUsers.length === 0 ? (
                    <div className="px-6 py-10 text-xs font-bold text-slate-400 text-center uppercase tracking-widest">
                      Sin usuarios recientes
                    </div>
                  ) : (
                    recentUsers.map((u) => (
                      <div
                        key={u.email}
                        className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 border-b border-slate-50 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEmail(u.email);
                            setShowUserPicker(false);
                          }}
                          className="text-left flex-1"
                        >
                          <div className="text-sm font-black text-slate-800">{u.email}</div>
                          <div className="text-[9px] font-black uppercase text-slate-300 mt-0.5 tracking-tighter">
                            Visto: {new Date(u.lastUsed).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = recentUsers.filter((x) => x.email !== u.email);
                            setRecentUsers(next);
                            localStorage.setItem('erp_login_users', JSON.stringify(next));
                          }}
                          className="text-[10px] font-black text-rose-400 hover:text-rose-600 uppercase"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setRecentUsers([]);
                      localStorage.removeItem('erp_login_users');
                      setShowUserPicker(false);
                    }}
                    className="w-full text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    Limpiar Todo
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <button 
              onClick={() => nav('/register')} 
              className="text-xs font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest"
            >
              ¿Eres nuevo? Crea una cuenta
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            Dualis ERP &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
