import React, { useState } from 'react';
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Building2, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../firebase/api';

export default function Register() {
  const [formData, setFormData] = useState({
    businessName: '',
    fullName: '',
    email: '',
    password: '',
    workspaceCode: '',
    createNewWorkspace: false,
  });
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false); // Nuevo estado para animaciones

  const nav = useNavigate();
  const { user } = useAuth();

  React.useEffect(() => {
    if (user) nav('/');
  }, [user, nav]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const uid = userCredential.user.uid;

      let businessId = formData.workspaceCode;

      if (formData.createNewWorkspace) {
        // Crear un nuevo espacio de trabajo
        businessId = `biz_${Date.now()}`;
        await setDoc(doc(db, 'businesses', businessId), {
          name: formData.businessName,
          ownerId: uid,
          createdAt: new Date().toISOString(),
          plan: 'free_tier',
        });
        // Audit
        try { await logAudit(uid, 'create_workspace', { businessId, name: formData.businessName }); } catch (e) {}
      } else {
        // Verificar si el espacio de trabajo existe
        const workspaceRef = doc(db, 'businesses', businessId);
        const workspaceSnap = await getDoc(workspaceRef); // Reemplazamos `get` por `getDoc`
        if (!workspaceSnap.exists()) {
          throw new Error('El código del espacio de trabajo no es válido.');
        }
      }

      // Crear el perfil del usuario
      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        email: formData.email,
        fullName: formData.fullName,
        businessId: businessId,
        role: formData.createNewWorkspace ? 'admin' : 'member',
      });
      try { await logAudit(uid, 'create_user', { businessId, email: formData.email }); } catch (e) {}
    } catch (error: any) {
      console.error(error);
      alert('Error al registrar: ' + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center p-4 font-sans">
      <div
        className={`bg-white w-full max-w-md rounded-2xl shadow-xl p-8 border border-slate-100 transition-transform duration-300 ${hovered ? 'scale-105' : 'scale-100'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 mb-4 animate-bounce">
            <Building2 size={24} />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900">Crea o Únete a un Espacio</h2>
          <p className="text-slate-500 text-sm mt-2">
            Digitaliza tu negocio en segundos. Datos seguros y encriptados.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              ¿Crear un nuevo espacio?
            </label>
            <input
              type="checkbox"
              checked={formData.createNewWorkspace}
              onChange={(e) => setFormData({ ...formData, createNewWorkspace: e.target.checked })}
              className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded-full transition-transform duration-300 hover:scale-125"
            />
          </div>

          {formData.createNewWorkspace ? (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Nombre del Nuevo Espacio
              </label>
              <input
                required
                type="text"
                placeholder="Ej. Boutique Los Ángeles"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 shadow-sm hover:shadow-md"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Código del Espacio
              </label>
              <input
                required
                type="text"
                placeholder="Ej. biz_123456789"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 shadow-sm hover:shadow-md"
                value={formData.workspaceCode}
                onChange={(e) => setFormData({ ...formData, workspaceCode: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700">Tu Nombre Completo</label>
            <input
              required
              type="text"
              placeholder="Ej. Jesús Salazar"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 shadow-sm hover:shadow-md"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email Profesional</label>
            <input
              required
              type="email"
              placeholder="jesus@miempresa.com"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 shadow-sm hover:shadow-md"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Contraseña Segura</label>
            <input
              required
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-slate-900 shadow-sm hover:shadow-md"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                Crear Mi Cuenta Gratis <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-slate-100">
          <button
            onClick={() => nav('/login')}
            className="text-sm text-slate-500 hover:text-indigo-600 transition-colors"
          >
            ¿Ya tienes un espacio? <span className="font-bold">Iniciar Sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
}
