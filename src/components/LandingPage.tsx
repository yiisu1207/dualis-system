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
  Layers,
  Rocket
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    const items = Array.from(document.querySelectorAll('[data-reveal]')) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    items.forEach((item) => observer.observe(item));
    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-900 selection:bg-indigo-600 selection:text-white font-inter overflow-x-hidden">
      
      {/* BACKGROUND ELEMENTS */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/40 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-50/40 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* MODERN NAVBAR */}
      <nav className={`fixed w-full z-[100] transition-all duration-500 ${scrolled ? 'bg-white/80 backdrop-blur-2xl border-b border-slate-200 py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            <Logo className="transition-transform group-hover:scale-110" />
            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hidden md:block group-hover:text-indigo-600 transition-colors">
              Hybrid ERP System
            </span>
          </div>

          <div className="flex items-center gap-8">
            <div className="hidden lg:flex items-center gap-8">
              {['Características', 'Precios', 'Seguridad'].map((item) => (
                <button key={item} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-all">
                  {item}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/login')} className="text-[10px] font-black uppercase tracking-widest text-slate-900 hover:text-indigo-600 transition-colors px-4">
                Entrar
              </button>
              <button onClick={() => navigate('/register')} className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-600 hover:-translate-y-0.5 active:scale-95 transition-all">
                Empezar Ahora
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-48 pb-32 z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div data-reveal className="reveal-up inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white border border-slate-200 shadow-xl shadow-slate-100 mb-10">
            <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Dualis v2.0: El futuro del retail ya está aquí</span>
          </div>
          
          <h1 data-reveal className="reveal-up text-6xl md:text-9xl font-black text-slate-900 leading-[0.9] tracking-tighter mb-8">
            Domina tu mercado <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 animate-gradient-x">
              sin complicaciones.
            </span>
          </h1>
          
          <p data-reveal className="reveal-up text-lg md:text-2xl text-slate-500 font-medium leading-relaxed max-w-3xl mx-auto mb-12">
            La plataforma híbrida que sincroniza tus ventas, inventario y finanzas con protección cambiaria en tiempo real. Diseñada para emprendedores que buscan control absoluto.
          </p>

          <div data-reveal className="reveal-up flex flex-col sm:flex-row items-center justify-center gap-6">
            <button onClick={() => navigate('/register')} className="w-full sm:w-auto px-12 py-6 bg-slate-900 text-white rounded-[2.5rem] text-xs font-black uppercase tracking-[0.2em] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] hover:bg-indigo-600 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-4">
              Digitalizar mi Negocio <ArrowRight size={20} />
            </button>
            <button className="w-full sm:w-auto px-12 py-6 bg-white text-slate-900 border border-slate-200 rounded-[2.5rem] text-xs font-black uppercase tracking-[0.2em] hover:bg-slate-50 hover:border-slate-300 transition-all">
              Ver Demostración
            </button>
          </div>

          <div data-reveal className="reveal-up pt-24 grid grid-cols-2 md:grid-cols-5 gap-8 opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-1000">
            {['Boutique Pro', 'Luxe Market', 'Tech Hub', 'Foodie Central', 'Mega Corp'].map((brand) => (
              <span key={brand} className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900">{brand}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURE CARDS GRID */}
      <section className="py-32 relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            
            {/* TERMINALES */}
            <div data-reveal className="reveal-up md:col-span-8 bg-slate-900 rounded-[4rem] p-16 text-white relative overflow-hidden group hover:shadow-[0_50px_100px_-20px_rgba(79,70,229,0.2)] transition-all duration-700">
              <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-1000">
                <ShoppingCart size={350} />
              </div>
              <div className="relative z-10 max-w-xl">
                <div className="h-16 w-16 rounded-[1.5rem] bg-indigo-500 flex items-center justify-center mb-10 shadow-2xl shadow-indigo-500/40">
                  <Cpu size={32} />
                </div>
                <h3 className="text-5xl font-black mb-6 tracking-tight">Terminales Inteligentes</h3>
                <p className="text-slate-400 text-xl leading-relaxed mb-10">
                  Caja Detal y Mayor en un solo ecosistema. Sincronización automática con tasas BCV y control de stock blindado por unidad.
                </p>
                <div className="flex flex-wrap gap-4">
                  {['Sincronización BCV', 'Ticket Digital', 'Multi-moneda'].map(tag => (
                    <span key={tag} className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-[0.2em]">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* INVENTARIO */}
            <div data-reveal className="reveal-up md:col-span-4 bg-[#f0fdf4] rounded-[4rem] p-12 border border-emerald-100 flex flex-col justify-between hover:shadow-2xl hover:shadow-emerald-100 transition-all duration-700">
              <div>
                <div className="h-16 w-16 rounded-[1.5rem] bg-emerald-500 text-white flex items-center justify-center mb-10 shadow-2xl shadow-emerald-500/20">
                  <Package size={32} />
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-6 tracking-tight">Inventario Pro</h3>
                <p className="text-slate-600 text-lg font-medium leading-relaxed">
                  Trazabilidad total: Marca, Proveedor y Ubicación. Analiza márgenes de ganancia antes de registrar.
                </p>
              </div>
              <div className="mt-10 pt-10 border-t border-emerald-200/50">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-3">
                  <TrendingUp size={18} /> IA DE REABASTECIMIENTO ACTIVA
                </span>
              </div>
            </div>

            {/* ANALYTICS */}
            <div data-reveal className="reveal-up md:col-span-4 bg-slate-50 rounded-[4rem] p-12 border border-slate-200 flex flex-col justify-between hover:bg-white hover:shadow-2xl transition-all duration-700 group">
              <div>
                <div className="h-16 w-16 rounded-[1.5rem] bg-indigo-600 text-white flex items-center justify-center mb-10 shadow-2xl shadow-indigo-600/20 group-hover:rotate-12 transition-transform">
                  <BarChart3 size={32} />
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-6 tracking-tight">Vision Lab</h3>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">
                  Analítica profunda en tiempo real. Recibe sugerencias estratégicas impulsadas por nuestra IA propietaria.
                </p>
              </div>
              <button onClick={() => navigate('/login')} className="mt-10 flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 group">
                Explorar Analytics <ArrowRight size={16} className="group-hover:translate-x-3 transition-transform" />
              </button>
            </div>

            {/* SEGURIDAD */}
            <div data-reveal className="reveal-up md:col-span-8 bg-white border border-slate-200 rounded-[4rem] p-16 shadow-2xl shadow-slate-200/50 flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1">
                <div className="h-16 w-16 rounded-[1.5rem] bg-slate-900 text-white flex items-center justify-center mb-10 shadow-2xl">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">Seguridad Elite</h3>
                <p className="text-slate-500 text-xl leading-relaxed">
                  Protección de grado bancario con Autenticación 2FA, PIN de Autoridad Maestro y logs de auditoría inmutables.
                </p>
              </div>
              <div className="w-full lg:w-72 space-y-4">
                {[
                  { icon: Fingerprint, label: 'PIN Maestro', color: 'text-rose-500', bg: 'bg-rose-50' },
                  { icon: Shield, label: 'Acceso 2FA', color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { icon: FileText, label: 'Audit Logs', color: 'text-emerald-500', bg: 'bg-emerald-50' }
                ].map(item => (
                  <div key={item.label} className={`p-6 rounded-3xl ${item.bg} flex items-center gap-5 transition-transform hover:scale-105 cursor-default`}>
                    <item.icon size={24} className={item.color} />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* STEPS SECTION */}
      <section className="py-40 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,#4f46e5_0%,transparent_70%)] animate-pulse"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-32">
            <h2 data-reveal className="reveal-up text-5xl md:text-7xl font-black mb-8 tracking-tighter leading-tight">Migración al futuro <br /> en tres latidos.</h2>
            <p data-reveal className="reveal-up text-slate-400 text-xl font-medium">Sin servidores locales, sin cables, sin fricción.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-20">
            {[
              { step: '01', icon: Rocket, title: 'Crea tu Espacio', desc: 'Configura tu RIF y moneda en menos de 120 segundos.' },
              { step: '02', icon: Layers, title: 'Carga tu Data', desc: 'Importa tu inventario desde Excel o vía Scan con nuestra IA.' },
              { step: '03', icon: Zap, title: 'Vende y Crece', desc: 'Abre tus terminales y escala tu rentabilidad hoy mismo.' }
            ].map((item, i) => (
              <div key={i} data-reveal className="reveal-up relative group">
                <div className="text-[12rem] font-black text-white/[0.03] absolute -top-32 -left-10 group-hover:text-indigo-500/[0.08] transition-all duration-1000 select-none">{item.step}</div>
                <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center mb-8 border border-white/10 group-hover:bg-indigo-600 transition-colors">
                  <item.icon size={28} className="text-indigo-400 group-hover:text-white" />
                </div>
                <h4 className="text-3xl font-black mb-6 relative z-10 tracking-tight">{item.title}</h4>
                <p className="text-slate-400 text-lg leading-relaxed relative z-10 font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-40 bg-white relative z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div data-reveal className="reveal-up bg-[#f8fafc] rounded-[5rem] p-20 text-center border border-slate-200 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.1)] relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] group-hover:bg-indigo-500/10 transition-colors"></div>
            <div className="relative z-10">
              <h2 className="text-5xl md:text-8xl font-black text-slate-900 mb-10 tracking-tighter">¿Listo para <br /> evolucionar?</h2>
              <p className="text-2xl text-slate-500 mb-16 max-w-2xl mx-auto font-medium">Únete a las empresas que ya están protegiendo su patrimonio con Dualis ERP.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-6">
                <button onClick={() => navigate('/register')} className="px-16 py-7 bg-slate-900 text-white rounded-[2.5rem] text-xs font-black uppercase tracking-[0.3em] hover:bg-indigo-600 hover:-translate-y-1 active:scale-95 transition-all shadow-2xl">
                  Comenzar ahora mismo
                </button>
                <button className="px-16 py-7 bg-white text-slate-900 border-2 border-slate-200 rounded-[2.5rem] text-xs font-black uppercase tracking-[0.3em] hover:bg-slate-50 hover:border-slate-900 transition-all">
                  Hablar con un asesor
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MINIMAL FOOTER */}
      <footer className="py-24 bg-white border-t border-slate-100 z-10 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-16">
            <div className="flex flex-col items-center md:items-start gap-6">
              <Logo className="h-10 w-auto" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">© 2026 Dualis ERP — Inteligencia de Negocio</p>
            </div>
            <div className="flex gap-20">
              <div className="space-y-6">
                <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900">Soluciones</h5>
                <div className="flex flex-col gap-4">
                  {['POS Cloud', 'Inventario', 'Finanzas', 'Vision AI'].map(l => <button key={l} className="text-[11px] font-black text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">{l}</button>)}
                </div>
              </div>
              <div className="space-y-6">
                <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900">Legal</h5>
                <div className="flex flex-col gap-4">
                  {['Términos', 'Privacidad', 'Cookies'].map(l => <button key={l} className="text-[11px] font-black text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">{l}</button>)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white hover:-translate-y-1 transition-all cursor-pointer"><Globe size={20} /></div>
              <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white hover:-translate-y-1 transition-all cursor-pointer"><MessageSquare size={20} /></div>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
