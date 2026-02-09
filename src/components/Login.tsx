import React, { useState } from 'react';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LogIn, Mail, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(false); // Nuevo estado para animaciones
  const nav = useNavigate();
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) nav('/');
  }, [user, nav]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // El sistema detectará el login automáticamente y te llevará al Dashboard
    } catch (err: any) {
      console.error(err);
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center p-4 font-sans relative overflow-y-auto custom-scroll">
      <button
        onClick={() => nav('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors text-sm font-medium"
      >
        <ArrowLeft size={16} /> Volver al inicio
      </button>

      <div
        className={`bg-white w-full max-w-md rounded-2xl shadow-xl p-8 border border-slate-100 transition-transform duration-300 ${hovered ? 'scale-105' : 'scale-100'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 mb-4 animate-bounce">
            <LogIn size={24} />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900">Bienvenido de nuevo</h2>
          <p className="text-slate-500 text-sm mt-2">Accede a tu espacio de trabajo</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center font-medium animate-pulse">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email Profesional</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                required
                type="email"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 placeholder-slate-400 shadow-sm hover:shadow-md"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-slate-700">Contraseña</label>
              <button
                type="button"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                ¿Olvidaste tu clave?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                required
                type="password"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 placeholder-slate-400 shadow-sm hover:shadow-md"
                placeholder="••••••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Ingresar al Sistema'}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            ¿No tienes cuenta?{' '}
            <button
              onClick={() => nav('/register')}
              className="text-indigo-600 font-bold hover:underline"
            >
              Crear cuenta gratis
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
