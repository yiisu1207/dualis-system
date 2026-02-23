import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Zap,
  MessageSquare,
  Sparkles,
  Shield,
  Globe,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReCAPTCHA from 'react-google-recaptcha';
import { releaseNotes } from '../data/releaseNotes';
import Logo from './ui/Logo';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showAnnouncement, setShowAnnouncement] = useState(() => {
    return localStorage.getItem('release_announcement_v1') !== 'hidden';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactCaptcha, setContactCaptcha] = useState<string | null>(null);
  const captchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const items = Array.from(document.querySelectorAll('[data-reveal]')) as HTMLElement[];
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18 }
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme_mode', next ? 'dark' : 'light');
  };
  const announcementText =
    '¡Bienvenidos al nuevo DUALIS! 🚀 Hemos activado la protección de tasas por devaluación, el historial colaborativo con emojis y notas, y la sincronización total en la nube. Por favor, haz clic en el botón para actualizar.';
  

  return (
    <div className="min-h-screen app-shell landing-shell text-slate-900 selection:bg-amber-100 selection:text-amber-900">
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo(0, 0)}
          >
            <div className="flex flex-col leading-tight">
              <Logo />
              <span className="text-xs text-slate-500 font-bold">
                Suite financiera colaborativa
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="px-3 py-2 rounded-full border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 hover:border-slate-300"
            >
              {isDarkMode ? 'Modo Claro' : 'Modo Oscuro'}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors hidden sm:block"
            >
              Iniciar Sesion
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-5 py-2.5 app-btn app-btn-primary"
            >
              Comenzar Gratis
            </button>
          </div>
        </div>
      </nav>

      {showAnnouncement && (
        <div className="w-full pt-24">
          <div
            data-reveal
            className="reveal-up max-w-5xl mx-auto px-6"
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-slate-800 p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-amber-700">
                  Bienvenidos al nuevo DUALIS
                </div>
                <div className="mt-2 text-sm font-semibold">{announcementText}</div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase"
                >
                  Actualizar ahora
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('release_announcement_v1', 'hidden');
                    setShowAnnouncement(false);
                  }}
                  className="text-xs font-black uppercase text-amber-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <section className="w-full pt-24">
        <div
          data-reveal
          className="reveal-up max-w-6xl mx-auto px-6"
        >
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/70 backdrop-blur-sm p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                  Historial de cambios
                </div>
                <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
                  {releaseNotes[0].version} — {releaseNotes[0].date}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {releaseNotes[0].summary}
                </div>
              </div>
              <div className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
                Ultima actualizacion
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {releaseNotes.map((note) => (
                <div
                  key={note.version}
                  className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                        Version
                      </div>
                      <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">
                        {note.version} — {note.date}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        {note.summary}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {note.highlights.map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="w-full pt-6">
        <div
          data-reveal
          className="reveal-up max-w-6xl mx-auto px-6"
        >
          <div className="rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 via-white to-sky-50 dark:from-emerald-950/60 dark:via-slate-950 dark:to-slate-900 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                ¡Se un pionero!
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Estamos en Beta Publica. Los primeros 30 usuarios que se registren y nos den feedback
                reciben 1 mes gratis del Plan Pro en el lanzamiento.
              </div>
            </div>
            <div className="text-xs font-black uppercase text-slate-500 dark:text-slate-300">
              Cupos restantes: 12/30
            </div>
          </div>
          </div>
        </div>
      </section>

      <header className="relative w-full pt-32 pb-24 overflow-hidden">
        <div className="hero-aurora"></div>
        <div className="hero-grid"></div>
        <div className="absolute -top-16 -left-16 w-72 h-72 bg-amber-200/50 rounded-full blur-[90px]"></div>
        <div className="absolute top-10 right-0 w-80 h-80 bg-sky-200/60 rounded-full blur-[110px]"></div>
        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-emerald-200/50 rounded-full blur-[120px]"></div>

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div data-reveal className="reveal-up space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
                V2.0 colaborativo
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-[1.05]">
                El Sistema Operativo
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-emerald-500 to-amber-500">
                  para negocios hibridos
                </span>
              </h1>
              <p className="text-lg text-slate-600 max-w-xl">
                DUALIS no es solo un ERP. Es tu escudo contra la devaluacion. Sincroniza inventario,
                facturacion y tasas (BCV/Paralelo) en tiempo real. Disenado para quienes facturan en
                dos monedas y piensan en una sola: crecimiento.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/register')}
                  className="px-10 py-4 app-btn cta-primary text-base text-white font-black flex items-center justify-center gap-2"
                >
                  Comenzar Prueba Gratis <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-8 py-4 app-btn cta-secondary text-base font-black"
                >
                  Ver Caracteristicas
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/80 border border-slate-200">
                  <MessageSquare className="w-4 h-4 text-sky-600" /> Chat interno
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/80 border border-slate-200">
                  <Sparkles className="w-4 h-4 text-emerald-500" /> Widgets inteligentes
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/80 border border-slate-200">
                  <ShieldCheck className="w-4 h-4 text-amber-500" /> Auditoria segura
                </span>
              </div>
            </div>

            <div data-reveal className="reveal-up relative">
              <div className="hero-tilt rounded-3xl border border-white/40 bg-white/10 backdrop-blur-2xl shadow-[0_40px_120px_rgba(15,23,42,0.25)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-950/80"></div>
                <div className="relative z-10 p-10 flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl border border-white/30 bg-white/10 flex items-center justify-center animate-pulse">
                    <i className="fa-solid fa-film text-2xl text-white/80"></i>
                  </div>
                  <div className="text-sm font-black uppercase tracking-widest text-white/70">
                    Demostracion interactiva: muy pronto
                  </div>
                  <p className="text-xs text-white/60 max-w-xs">
                    Estamos preparando un recorrido visual por la potencia de DUALIS.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="w-full py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div data-reveal className="reveal-up rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-6 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400 text-center">
                        Empresas que confian en nosotros
                      </div>
                      <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-black text-slate-400">
                        {['Boutique X', 'Inversiones Y', 'Grupo Orion', 'Comercial 360', 'Mercado Nexus'].map(
                          (label) => (
                            <div
                              key={label}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center"
                            >
                              {label}
                            </div>
                          )
                        )}
                      </div>
          </div>
        </div>
      </section>

      <section id="features" className="w-full py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal className="reveal-up text-center max-w-3xl mx-auto mb-12">
                      <h2 className="text-3xl md:text-4xl font-black text-slate-900">
                        Tu centro de comando financiero
                      </h2>
                      <p className="text-slate-500 text-lg mt-3">
                        Herramientas potentes para empresarios que no tienen tiempo que perder.
                      </p>
                    </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:auto-rows-[180px]">
            <div data-reveal className="reveal-up md:col-span-2 md:row-span-2 rounded-3xl bg-white border border-slate-200 p-6 shadow-xl flex flex-col justify-between">
                        <div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase">
                            Punto de venta rapido
                          </div>
                          <h3 className="mt-4 text-2xl font-black text-slate-900">Ventas en segundos</h3>
                          <p className="mt-2 text-sm text-slate-500 max-w-lg">
                            Cobra, imprime y actualiza stock sin fricciones. El flujo mas rapido para tu equipo.
                          </p>
                        </div>
                        <div className="mt-6 grid grid-cols-4 gap-3">
                          {['Combo Express', 'Caja Rapida', 'Cliente Frecuente'].map((label) => (
                            <div
                              key={label}
                              className="col-span-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm"
                            >
                              <div className="text-[10px] font-black uppercase text-slate-400">
                                Producto
                              </div>
                              <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700">
                                {label}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl bg-white border border-slate-200 p-5 shadow-lg flex flex-col justify-between">
                        <div className="flex items-center gap-3">
                          <MessageSquare className="w-6 h-6 text-sky-500" />
                          <span className="text-sm font-black text-slate-800">Chat de equipo</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="max-w-[80%] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                            Nuevo pedido listo para cobrar.
                          </div>
                          <div className="ml-auto max-w-[75%] rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-700">
                            Listo, lo despacho en 2 min.
                          </div>
                        </div>
                        <div className="mt-3 text-[11px] text-slate-400">Canales + DMs con adjuntos.</div>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl bg-white border border-slate-200 p-5 shadow-lg flex flex-col justify-between">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-6 h-6 text-emerald-500" />
                          <span className="text-sm font-black text-slate-800">Auditoria blindada</span>
                        </div>
                        <div className="mt-4 h-20 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-emerald-50 flex items-center justify-center">
                          <ShieldCheck className="w-8 h-8 text-emerald-600" />
                        </div>
                        <div className="mt-3 text-[11px] text-slate-400">Control y trazabilidad total.</div>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl bg-white border border-slate-200 p-5 shadow-lg flex flex-col justify-between">
                        <div className="flex items-center gap-3">
                          <Sparkles className="w-6 h-6 text-amber-500" />
                          <span className="text-sm font-black text-slate-800">Widgets inteligentes</span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {['Calc', 'FX', 'Notas'].map((label) => (
                            <div key={label} className="rounded-xl bg-slate-100 px-2 py-3 text-[11px] font-bold text-slate-600 text-center">
                              {label}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-[11px] text-slate-400">Siempre listos para decidir.</div>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl bg-white border border-slate-200 p-5 shadow-lg flex flex-col justify-between">
                        <div className="flex items-center gap-3">
                          <BarChart3 className="w-6 h-6 text-emerald-600" />
                          <span className="text-sm font-black text-slate-800">
                            Control cambiario inteligente
                          </span>
                        </div>
                        <div className="mt-4 h-20 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 flex items-center justify-center">
                          <div className="flex items-center gap-2 text-slate-200 text-xs font-black">
                            <span className="px-2 py-1 rounded-lg bg-white/10">BCV</span>
                            <span className="px-2 py-1 rounded-lg bg-white/10">Paralelo</span>
                            <span className="px-2 py-1 rounded-lg bg-white/10">USD</span>
                          </div>
                        </div>
                        <div className="mt-3 text-[11px] text-slate-400">
                          Sincroniza tasas del dia y protege tu margen.
                        </div>
                      </div>
          </div>
        </div>
      </section>

      <section className="w-full py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal className="reveal-up text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              Como funciona DUALIS
            </h2>
            <p className="text-slate-500 text-lg mt-3">
              Tres pasos simples para activar tu operacion inteligente.
            </p>
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="absolute left-1/2 top-8 hidden md:block h-[240px] w-px bg-gradient-to-b from-transparent via-emerald-200 to-transparent"></div>
            {[
              {
                step: '01',
                title: 'Crea tu espacio',
                desc: 'Configura tu empresa, usuarios y moneda en minutos.',
              },
              {
                step: '02',
                title: 'Sincroniza todo',
                desc: 'Inventario, tasas y ventas conectadas en tiempo real.',
              },
              {
                step: '03',
                title: 'Cobra y decide',
                desc: 'Reportes, alertas y chat para moverte rapido.',
              },
            ].map((item) => (
              <div
                key={item.step}
                data-reveal
                className="reveal-up rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
              >
                <div className="text-xs font-black uppercase tracking-[0.4em] text-emerald-500">
                  {item.step}
                </div>
                <h3 className="mt-4 text-xl font-black text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal className="reveal-up text-center max-w-3xl mx-auto mb-12">
                      <h2 className="text-3xl md:text-4xl font-black text-slate-900">
                        Planes flexibles para tu crecimiento
                      </h2>
                      <p className="text-slate-500 text-lg mt-3">
                        Elige mensual o anual. El plan anual tiene 20% de descuento.
                      </p>
                      <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setBillingCycle('monthly')}
                          className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wide transition-colors ${
                            billingCycle === 'monthly'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Mensual
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillingCycle('yearly')}
                          className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wide transition-colors ${
                            billingCycle === 'yearly'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Anual
                        </button>
                      </div>
                    </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div data-reveal className="reveal-up rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Starter</div>
                        <h3 className="mt-3 text-2xl font-black text-slate-900">Gratis</h3>
                        <p className="mt-2 text-sm text-slate-500">Para probar el sistema.</p>
                        <ul className="mt-6 space-y-2 text-sm text-slate-600">
                          <li>10 facturas al mes</li>
                          <li>Acceso basico</li>
                          <li>Soporte por email</li>
                        </ul>
                        <button
                          onClick={() => navigate('/register')}
                          className="mt-6 w-full py-3 rounded-full cta-secondary text-xs font-black uppercase text-slate-700"
                        >
                          Probar Demo
                        </button>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-lg">
                        <div className="text-xs font-black uppercase tracking-widest text-emerald-600">Pro</div>
                        <h3 className="mt-3 text-2xl font-black text-slate-900">
                          {billingCycle === 'monthly' ? '$15/mes' : '$144/anual'}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">Para comerciantes activos.</p>
                        <ul className="mt-6 space-y-2 text-sm text-slate-700">
                          <li>Facturacion ilimitada</li>
                          <li>Multimoneda BCV/Paralelo</li>
                          <li>1 usuario</li>
                        </ul>
                        <button
                          onClick={() => navigate('/register')}
                          className="mt-6 w-full py-3 rounded-full cta-primary text-white text-xs font-black uppercase"
                        >
                          Empezar Ahora
                        </button>
                      </div>
            <div data-reveal className="reveal-up rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Empresa</div>
                        <h3 className="mt-3 text-2xl font-black text-slate-900">
                          {billingCycle === 'monthly' ? '$40/mes' : '$384/anual'}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">Para equipos grandes.</p>
                        <ul className="mt-6 space-y-2 text-sm text-slate-600">
                          <li>Usuarios ilimitados</li>
                          <li>Auditoria avanzada</li>
                          <li>Soporte VIP</li>
                        </ul>
                        <button
                          onClick={() => navigate('/login')}
                          className="mt-6 w-full py-3 rounded-full cta-secondary text-xs font-black uppercase text-slate-700"
                        >
                          Contactar Ventas
                        </button>
                      </div>
          </div>
        </div>
      </section>

      <section className="w-full py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal className="reveal-up text-center max-w-3xl mx-auto mb-12">
                      <h2 className="text-3xl md:text-4xl font-black text-slate-900">
                        Por que elegirnos
                      </h2>
                      <p className="text-slate-500 text-lg mt-3">
                        Un sistema serio para equipos ambiciosos.
                      </p>
                    </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div data-reveal className="reveal-up app-card p-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                          <Globe className="w-6 h-6" />
                        </div>
                        <h3 className="mt-4 text-lg font-black text-slate-800">Sin instalaciones</h3>
                        <p className="mt-2 text-sm text-slate-500">Listo para usar en cualquier dispositivo.</p>
                      </div>
            <div data-reveal className="reveal-up app-card p-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                          <Shield className="w-6 h-6" />
                        </div>
                        <h3 className="mt-4 text-lg font-black text-slate-800">Seguridad bancaria</h3>
                        <p className="mt-2 text-sm text-slate-500">Reglas estrictas y respaldos continuos.</p>
                      </div>
            <div data-reveal className="reveal-up app-card p-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                          <Zap className="w-6 h-6" />
                        </div>
                        <h3 className="mt-4 text-lg font-black text-slate-800">Soporte 24/7</h3>
                        <p className="mt-2 text-sm text-slate-500">Tu equipo siempre acompañado.</p>
                      </div>
          </div>
        </div>
      </section>

      <section className="w-full py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal className="reveal-up rounded-3xl border border-slate-200 bg-white p-8 grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6">
                      <div>
                        <h3 className="text-2xl font-black text-slate-900">
                          ¿Quieres formar parte o tienes dudas?
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          Conversemos. Respondemos en menos de 24 horas.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                          <a
                            href="https://wa.me/584121234567"
                            className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-black uppercase"
                          >
                            WhatsApp
                          </a>
                          <a
                            href="https://instagram.com/dualis.app"
                            className="px-4 py-2 rounded-full border border-slate-200 text-slate-700 text-xs font-black uppercase"
                          >
                            Instagram
                          </a>
                          <a
                            href="mailto:contacto@dualis.app"
                            className="px-4 py-2 rounded-full border border-slate-200 text-slate-700 text-xs font-black uppercase"
                          >
                            Email
                          </a>
                        </div>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (captchaKey && !contactCaptcha) return;
                          if (!captchaKey) {
                            console.info('Modo Dev: Captcha omitido');
                          }
                          setContactSent(true);
                          setContactForm({ name: '', email: '', message: '' });
                          setContactCaptcha(null);
                        }}
                        className="space-y-3"
                      >
                        <input
                          required
                          className="app-input"
                          placeholder="Tu nombre"
                          value={contactForm.name}
                          onChange={(event) =>
                            setContactForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                        <input
                          required
                          type="email"
                          className="app-input"
                          placeholder="Tu correo"
                          value={contactForm.email}
                          onChange={(event) =>
                            setContactForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                        <textarea
                          required
                          className="app-input min-h-[120px]"
                          placeholder="Cuentanos que necesitas"
                          value={contactForm.message}
                          onChange={(event) =>
                            setContactForm((prev) => ({ ...prev, message: event.target.value }))
                          }
                        />
                        <div className="flex justify-center">
                          {captchaKey ? (
                            <ReCAPTCHA
                              sitekey={captchaKey}
                              onChange={(value) => setContactCaptcha(value)}
                            />
                          ) : (
                            <div className="text-[10px] text-slate-400">Modo Dev: Captcha omitido</div>
                          )}
                        </div>
                        <button
                          type="submit"
                          className="w-full py-3 rounded-full bg-slate-900 text-white text-xs font-black uppercase"
                        >
                          Enviar mensaje
                        </button>
                        {contactSent && (
                          <div className="text-[11px] text-emerald-600 font-bold text-center">
                            Mensaje enviado. Te contactaremos pronto.
                          </div>
                        )}
                      </form>
          </div>
        </div>
      </section>

                <footer className="bg-slate-900 text-white py-12">
                  <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <Logo textClassName="text-white" subTextClassName="text-slate-300" />
                      </div>
                      <p className="mt-3 text-sm text-slate-300">
                        Plataforma financiera colaborativa para equipos que venden en serio.
                      </p>
                    </div>
                    <div className="text-sm text-slate-300">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-black">Legal</div>
                      <div className="mt-3 flex flex-col gap-2">
                        <button className="text-left hover:text-white" onClick={() => navigate('/terms')}>
                          Terminos de Uso
                        </button>
                        <button className="text-left hover:text-white" onClick={() => navigate('/privacy')}>
                          Politica de Privacidad
                        </button>
                        <button className="text-left hover:text-white" onClick={() => navigate('/help')}>
                          Soporte
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-300">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-black">Contacto</div>
                      <div className="mt-3 flex flex-col gap-2">
                        <span>contacto@dualis.app</span>
                        <span>+58 412 000 0000</span>
                        <span>Caracas, VE</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-10 text-center text-xs text-slate-400">
                    © 2026 DUALIS ERP. Hecho en Venezuela. Todos los derechos reservados.
                  </div>
                </footer>
    </div>
  );
}
