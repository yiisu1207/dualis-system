import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen app-shell px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-xs font-black uppercase text-slate-500 hover:text-slate-900"
        >
          Volver al inicio
        </button>
        <h1 className="mt-4 text-3xl font-black text-slate-900">Terminos de Uso</h1>
        <p className="mt-2 text-sm text-slate-500">
          Ultima actualizacion: 18 de febrero de 2026
        </p>

        <div className="mt-8 space-y-6 text-sm text-slate-600">
          <section>
            <h2 className="text-lg font-black text-slate-800">1. Uso del servicio</h2>
            <p className="mt-2">
              DUALIS ERP proporciona herramientas para la gestion operativa y financiera. El usuario
              acepta utilizar el sistema de forma legal y responsable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">2. Responsabilidad</h2>
            <p className="mt-2">
              El servicio se ofrece "tal cual". No garantizamos resultados especificos ni nos hacemos
              responsables por perdidas derivadas de uso incorrecto, configuraciones inadecuadas o
              datos mal ingresados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">3. Acceso y seguridad</h2>
            <p className="mt-2">
              El usuario es responsable de mantener sus credenciales seguras y de cualquier actividad
              que se realice en su cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">4. Cambios en el servicio</h2>
            <p className="mt-2">
              Podemos actualizar funcionalidades, precios o condiciones en cualquier momento. Cuando
              haya cambios relevantes, los notificaremos dentro de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">5. Contacto</h2>
            <p className="mt-2">
              Si tienes dudas sobre estos terminos, escribe a contacto@dualis.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
