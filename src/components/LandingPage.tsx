import React from 'react';
import { ArrowRight, BarChart3, ShieldCheck, Zap, LayoutDashboard, Store } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const handleModuleClick = (key: string) => {
    const id = key.toLowerCase().replace(/\s+/g, '-');
    const el = document.getElementById(id);
    if (el) return el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // si no hay ancla, navegamos a la ruta correspondiente
    const k = key.toLowerCase();
    const mapping: Record<string, string> = {
      login: '/login',
      register: '/register',
      finanzas: '/finanzas',
      cuentas: '/cuentas',
      'recursos humanos': '/recursos-humanos',
      inventario: '/inventario',
      ventas: '/ventas',
      reportes: '/reportes',
      configuración: '/configuracion',
      configuracion: '/configuracion',
    };
    navigate(mapping[k] || `/${k.replace(/\s+/g, '-')}`);
  };

  const location = useLocation();
  const routeFor = (t: string) => {
    const k = t.toLowerCase();
    return k === 'recursos humanos' ? '/recursos-humanos' : `/${k.replace(/\s+/g, '-')}`;
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* --- NAVBAR (Menú Superior) --- */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo(0, 0)}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-xl">
              <Store className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                ERP <span className="text-indigo-600">System</span>
              </span>
              <span className="text-xs text-indigo-600 font-bold">
                Versión de prueba (desarrollo)
              </span>
            </div>
          </div>

          {/* Botones Derecha */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors hidden sm:block"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-full hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              Comenzar Gratis
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION (Portada) --- */}
      <header className="pt-32 pb-20 px-6 text-center max-w-6xl mx-auto">
        {/* Etiqueta "Nuevo" */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-8 animate-fade-in-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          Nueva Versión 2.0 Disponible
        </div>

        {/* Título Principal */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 text-slate-900 leading-[1.05]">
          ERP System
          <div className="mt-4 text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
            Gestiona tu empresa como un imperio
          </div>
        </h1>

        {/* Subtítulo */}
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          El único sistema creado por comerciantes, para comerciantes. Controla inventario, ventas,
          cajas y equipo en una sola plataforma en la nube.
        </p>

        {/* Botones de Acción */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
          <button
            onClick={() => navigate('/register')}
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-2xl hover:shadow-2xl transform-gpu hover:-translate-y-1 transition-all flex items-center justify-center gap-2 animate-float"
          >
            Crear Cuenta Gratis <ArrowRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
          >
            Iniciar Sesión
          </button>
        </div>

        {/* --- PESTAÑAS / MÓDULOS DEL SISTEMA --- */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {[
            'Finanzas',
            'Cuentas',
            'Recursos Humanos',
            'Inventario',
            'Ventas',
            'Reportes',
            'Configuración',
          ].map((t) => {
            const route = routeFor(t);
            const active = location.pathname.startsWith(route);
            return (
              <button
                key={t}
                onClick={() => handleModuleClick(t)}
                aria-label={`Ir a ${t}`}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all transform-gpu ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg scale-105'
                    : 'bg-white border border-slate-100 text-slate-700 hover:shadow-md hover:-translate-y-1 hover:scale-[1.02]'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {/* Imagen del Dashboard (Simulada por ahora) */}
        <div className="relative mx-auto max-w-5xl group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shadow-2xl aspect-[16/9] flex items-center justify-center">
            {/* 📸 AQUÍ IRÁ TU CAPTURA DE PANTALLA REAL */}
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm mx-auto flex items-center justify-center mb-4">
                <LayoutDashboard className="text-indigo-500 w-8 h-8" />
              </div>
              <p className="text-slate-400 font-medium">Vista Previa del Dashboard</p>
              <p className="text-slate-300 text-sm">(Captura de pantalla pendiente)</p>
            </div>
          </div>
        </div>
      </header>

      {/* --- CARACTERÍSTICAS (Grid) --- */}
      <section className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Todo lo que necesitas para crecer
            </h2>
            <p className="text-slate-500 text-lg">
              Dejamos fuera lo complicado. Nos enfocamos en las herramientas que realmente te hacen
              ganar dinero.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Zap className="text-amber-500" />}
              title="Ventas Rápidas"
              desc="Sistema de Punto de Venta (POS) optimizado. Cobra en segundos, imprime tickets y actualiza el stock al instante."
            />
            <FeatureCard
              icon={<BarChart3 className="text-indigo-600" />}
              title="Finanzas Claras"
              desc="Olvídate de las cuentas manuales. Tu dashboard te dice cuánto vendiste, cuánto ganaste y qué producto es el rey."
            />
            <FeatureCard
              icon={<ShieldCheck className="text-emerald-500" />}
              title="Datos Seguros"
              desc="Tu información está encriptada y respaldada en la nube de Google. Accesible solo por ti, desde cualquier lugar."
            />
          </div>
        </div>
      </section>
      {/* --- SECCIONES/MÓDULOS (anclas) --- */}
      <section id="finanzas" className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Finanzas</h3>
          <p className="text-slate-500">
            Panel de finanzas: cuentas, conciliaciones, reportes de flujo.
          </p>
        </div>
      </section>

      <section id="cuentas" className="py-16 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Cuentas</h3>
          <p className="text-slate-500">
            Cuentas por pagar y por cobrar, gestión de proveedores y clientes.
          </p>
        </div>
      </section>

      <section id="recursos-humanos" className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Recursos Humanos</h3>
          <p className="text-slate-500">Gestión de personal, nómina y permisos.</p>
        </div>
      </section>

      <section id="inventario" className="py-16 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Inventario</h3>
          <p className="text-slate-500">Control de stock, entradas/salidas y ubicaciones.</p>
        </div>
      </section>

      <section id="ventas" className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Ventas</h3>
          <p className="text-slate-500">POS, facturación y gestión de clientes.</p>
        </div>
      </section>

      <section id="reportes" className="py-16 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Reportes</h3>
          <p className="text-slate-500">Reportes financieros, inventario y rendimiento.</p>
        </div>
      </section>

      <section id="configuración" className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4">Configuración</h3>
          <p className="text-slate-500">Ajustes del sistema, usuarios y permisos.</p>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-white border-t border-slate-100 py-12 text-center">
        <p className="text-slate-400 text-sm">
          © 2026 ERP System. Todos los derechos reservados. Desarrollado por Jxsuu ❤️ — Para
          emprendedores. Versión en desarrollo.
        </p>
      </footer>
    </div>
  );
}

// Componente pequeño para las tarjetas
function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-slate-100 hover:shadow-xl hover:-translate-y-2 transition-transform duration-300 group">
      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6 transform transition-transform duration-300 group-hover:scale-110">
        {React.cloneElement(icon, { size: 24, className: 'transition-transform duration-300' })}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}
