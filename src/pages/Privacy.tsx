import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
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
        <h1 className="mt-4 text-3xl font-black text-slate-900">Politica de Privacidad</h1>
        <p className="mt-2 text-sm text-slate-500">
          Ultima actualizacion: 18 de febrero de 2026
        </p>

        <div className="mt-8 space-y-6 text-sm text-slate-600">
          <section>
            <h2 className="text-lg font-black text-slate-800">1. Datos que recopilamos</h2>
            <p className="mt-2">
              Recopilamos los datos necesarios para operar el sistema (cuentas de usuario, inventario,
              movimientos y configuraciones). No vendemos informacion a terceros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">2. Uso de la informacion</h2>
            <p className="mt-2">
              Usamos los datos para brindar el servicio, soporte, mejoras de producto y analitica interna.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">3. Seguridad</h2>
            <p className="mt-2">
              Aplicamos medidas tecnicas para proteger la informacion. Ningun sistema es 100% infalible,
              por lo que recomendamos buenas practicas de seguridad a los usuarios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-800">4. Derechos del usuario</h2>
            <p className="mt-2">
              Puedes solicitar acceso, correccion o eliminacion de datos escribiendo a contacto@dualis.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
