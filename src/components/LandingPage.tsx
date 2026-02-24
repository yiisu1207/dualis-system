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
  ShoppingCart,
  Package,
  Cpu,
  Fingerprint,
  TrendingUp,
  Receipt,
  FileText,
  MousePointer2,
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

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 font-inter overflow-x-hidden">
      
      {/* MODERN NAVBAR */}
      <nav className="fixed w-full z-[100] bg-white/70 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            <Logo />
            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hidden md:block">
              Hybrid ERP System
            </span>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-6">
              {['Características', 'Precios', 'Seguridad', 'Soporte'].map((item) => (
                <button key={item} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                  {item}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 border-l border-slate-100 pl-8">
              <button onClick={() => navigate('/login')} className="text-xs font-black uppercase tracking-widest text-slate-900 hover:opacity-70 transition-opacity">
                Entrar
              </button>
              <button onClick={() => navigate('/register')} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all">
                Prueba Gratis
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION: THE FUTURE OF BUSINESS */}
      <section className="relative pt-40 pb-32 overflow-hidden bg-slate-50/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-200/50 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <div data-reveal className="reveal-up inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Nueva Versión 2.0: Ahora con Vision AI</span>
            </div>
            
            <h1 data-reveal className="reveal-up text-5xl md:text-8xl font-black text-slate-900 leading-[0.95] tracking-tight">
              Control total para <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-500 to-emerald-500">
                negocios que no paran.
              </span>
            </h1>
            
            <p data-reveal className="reveal-up text-lg md:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl mx-auto">
              Sincroniza tus ventas, inventario y finanzas en tiempo real. La única plataforma diseñada para mercados híbridos con protección cambiaria inteligente.
            </p>

            <div data-reveal className="reveal-up flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button onClick={() => navigate('/register')} className="w-full sm:w-auto px-10 py-5 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:bg-indigo-600 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3">
                Digitalizar mi Negocio <ArrowRight size={18} />
              </button>
              <button className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 border border-slate-200 rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] hover:bg-slate-50 transition-all">
                Ver Demostración
              </button>
            </div>

            {/* TRUST INDICATORS */}
            <div data-reveal className="reveal-up pt-16 flex flex-wrap justify-center items-center gap-12 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-700">
              {['Boutique Pro', 'Luxe Market', 'Tech Hub', 'Foodie Central', 'Mega Corp'].map((brand) => (
                <span key={brand} className="text-sm font-black uppercase tracking-widest text-slate-400">{brand}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CORE FEATURES GRID */}
      <section className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* FEATURE 1: DUAL POS */}
            <div data-reveal className="reveal-up md:col-span-2 bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-700">
                <ShoppingCart size={200} />
              </div>
              <div className="relative z-10 max-w-lg">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500 flex items-center justify-center mb-8 shadow-xl shadow-indigo-500/20">
                  <Cpu size={24} />
                </div>
                <h3 className="text-4xl font-black mb-4 tracking-tight">Terminales Inteligentes</h3>
                <p className="text-slate-400 text-lg leading-relaxed mb-8">
                  Caja Detal y Caja Mayor en un solo sistema. Precios diferenciados automáticos, control de stock por unidad y reportes de cierre blindados.
                </p>
                <div className="flex flex-wrap gap-3">
                  {['Sincronización BCV', 'Ticket Digital', 'Multi-moneda'].map(tag => (
                    <span key={tag} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* FEATURE 2: ERP INVENTORY */}
            <div data-reveal className="reveal-up bg-emerald-50 rounded-[3rem] p-12 border border-emerald-100 flex flex-col justify-between hover:shadow-2xl hover:shadow-emerald-100 transition-all duration-500">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/20">
                  <Package size={24} />
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-slate-600 font-medium leading-relaxed">
                  Trazabilidad total: Marca, Proveedor y Ubicación física. Analiza tus márgenes de ganancia antes de registrar.
                </p>
              </div>
              <div className="mt-8 pt-8 border-t border-emerald-200/50">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                  <TrendingUp size={14} /> Optimización de Stock Activa
                </span>
              </div>
            </div>

            {/* FEATURE 3: VISION LAB */}
            <div data-reveal className="reveal-up bg-slate-50 rounded-[3rem] p-12 border border-slate-200 flex flex-col justify-between hover:bg-white hover:shadow-2xl transition-all duration-500">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-8">
                  <BarChart3 size={24} />
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Vision Lab</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Analítica en tiempo real. Conoce la salud de tu negocio, tu índice de actividad y recibe sugerencias impulsadas por IA.
                </p>
              </div>
              <button className="mt-8 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 group">
                Explorar Analytics <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </div>

            {/* FEATURE 4: SECURITY */}
            <div data-reveal className="reveal-up md:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-12 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1">
                <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-8">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Seguridad de Grado Bancario</h3>
                <p className="text-slate-500 text-lg leading-relaxed">
                  Protege tu información con Autenticación 2FA, PIN de Autoridad Maestro para operaciones críticas y registros de auditoría detallados por usuario.
                </p>
              </div>
              <div className="w-full md:w-64 space-y-4">
                {[
                  { icon: Fingerprint, label: 'PIN Maestro' },
                  { icon: Shield, label: 'Acceso 2FA' },
                  { icon: FileText, label: 'Audit Logs' }
                ].map(item => (
                  <div key={item.label} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4">
                    <item.icon size={20} className="text-indigo-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section className="py-32 bg-slate-900 text-white relative overflow-hidden">
        <div className="hero-aurora opacity-20"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-24">
            <h2 data-reveal className="reveal-up text-4xl md:text-6xl font-black mb-6">Tu migración al futuro <br /> es en tres pasos.</h2>
            <p data-reveal className="reveal-up text-slate-400 text-lg">Sin configuraciones complejas ni servidores locales.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            {[
              { step: '01', title: 'Crea tu Espacio', desc: 'Configura tu RIF, moneda y logo en menos de 2 minutos.' },
              { step: '02', title: 'Carga tu Data', desc: 'Importa tu inventario desde Excel o regístralo con nuestra IA.' },
              { step: '03', title: 'Vende y Crece', desc: 'Abre tus cajas y empieza a recibir pagos con total control.' }
            ].map((item, i) => (
              <div key={i} data-reveal className="reveal-up relative group">
                <div className="text-8xl font-black text-white/5 absolute -top-12 -left-4 group-hover:text-indigo-500/10 transition-colors">{item.step}</div>
                <h4 className="text-2xl font-black mb-4 relative z-10">{item.title}</h4>
                <p className="text-slate-400 leading-relaxed relative z-10">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT & CTA */}
      <section className="py-32 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div data-reveal className="reveal-up bg-slate-50 rounded-[4rem] p-16 text-center border border-slate-100 shadow-2xl shadow-slate-200/50">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-8 tracking-tight">¿Listo para el siguiente nivel?</h2>
            <p className="text-xl text-slate-500 mb-12 max-w-2xl mx-auto">Únete a las empresas que ya están protegiendo su patrimonio con Dualis ERP.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button onClick={() => navigate('/register')} className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] hover:scale-105 active:scale-95 transition-all shadow-2xl">
                Comenzar ahora mismo
              </button>
              <button className="px-12 py-6 bg-white text-slate-900 border border-slate-200 rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] hover:bg-slate-50 transition-all">
                Hablar con un asesor
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* MINIMAL FOOTER */}
      <footer className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="flex flex-col items-center md:items-start gap-4">
              <Logo />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">© 2026 Dualis ERP — Inteligencia de Negocio</p>
            </div>
            <div className="flex gap-12">
              <div className="space-y-4 text-center md:text-left">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Producto</h5>
                <div className="flex flex-col gap-2">
                  {['POS', 'Inventario', 'Finanzas', 'Seguridad'].map(l => <button key={l} className="text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase">{l}</button>)}
                </div>
              </div>
              <div className="space-y-4 text-center md:text-left">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Legal</h5>
                <div className="flex flex-col gap-2">
                  {['Términos', 'Privacidad', 'Cookies'].map(l => <button key={l} className="text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase">{l}</button>)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"><Globe size={18} /></div>
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"><MessageSquare size={18} /></div>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
