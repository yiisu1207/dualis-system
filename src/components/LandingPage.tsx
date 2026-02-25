import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, ShieldCheck, Zap, Sparkles, Shield, Globe,
  ShoppingCart, Package, Cpu, Fingerprint, TrendingUp, Receipt, FileText,
  Layers, Rocket, Users, BookOpen, Landmark, Monitor, LayoutGrid,
  ArrowLeftRight, MessageSquare, CheckCircle2, Lock, RefreshCw, Star,
  ChevronRight, BadgeDollarSign, CreditCard, Building2, Banknote,
  Activity, PieChart, Settings2, HelpCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

// ─── DATA ────────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  { icon: ShoppingCart, label: 'POS Detal',       desc: 'Punto de venta para tiendas físicas con scanner, multi-pago y ticket digital.', color: 'text-indigo-400',  bg: 'bg-indigo-500/10',   border: 'border-indigo-500/20' },
  { icon: Building2,    label: 'POS Mayor',        desc: 'Terminal mayorista con precios escalonados, crédito a 15/30/45 días y despacho.', color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: FileText,     label: 'CxC / Clientes',   desc: 'Gestión de cuentas por cobrar, historial de clientes y seguimiento de deudas.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,       label: 'CxP / Proveedores',desc: 'Control de cuentas por pagar, pagos pendientes y relación con proveedores.', color: 'text-emerald-400',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,     label: 'Contabilidad',     desc: 'Libro diario, mayor y balance automático integrado con todas las operaciones.', color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20' },
  { icon: Landmark,     label: 'Conciliación',     desc: 'Conciliación bancaria con importación de estados de cuenta CSV y export.', color: 'text-emerald-400',   bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,      label: 'Inventario',       desc: 'Kardex, movimientos, alertas de stock mínimo y precios detal/mayor separados.', color: 'text-sky-400',   bg: 'bg-sky-500/10',      border: 'border-sky-500/20' },
  { icon: Monitor,      label: 'Cajas / Terminales',desc: 'Gestión de turnos de caja, apertura/cierre y auditoría por cajero.', color: 'text-sky-400',             bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Users,        label: 'RRHH & Nómina',    desc: 'Gestión de empleados, cálculo de nómina, vacaciones y contratos.', color: 'text-sky-400',              bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Sparkles,     label: 'VisionLab IA',     desc: 'Análisis con Google Gemini: flujo de caja, P&L, alertas y predicciones.', color: 'text-violet-400',    bg: 'bg-violet-500/10',   border: 'border-violet-500/20' },
  { icon: BarChart3,    label: 'Reportes',         desc: 'KPIs históricos, exportación Excel/PDF y gráficos por período.', color: 'text-violet-400',              bg: 'bg-violet-500/10',   border: 'border-violet-500/20' },
  { icon: TrendingUp,   label: 'Tasas BCV Live',   desc: 'Sincronización automática de la tasa oficial BCV + tasa de grupo del negocio.', color: 'text-amber-400', bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
];

const STATS = [
  { value: '12+', label: 'Módulos Integrados' },
  { value: '∞', label: 'Transacciones/mes' },
  { value: 'BCV', label: 'Tasa en tiempo real' },
  { value: '100%', label: 'En la nube' },
  { value: '3', label: 'Idiomas (ES/EN/AR)' },
  { value: '99.9%', label: 'Uptime garantizado' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nómina',
  'Inventario Inteligente', 'VisionLab IA', 'CxC & CxP', 'Conciliación Bancaria',
  'Multi-moneda USD/VES', 'Roles y Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Facturación Digital', 'Cajas Multi-Terminal', 'Google Gemini IA',
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef  = useRef<HTMLElement>(null);
  const securityRef = useRef<HTMLElement>(null);
  const stepsRef    = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);

    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); observer.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));

    return () => { window.removeEventListener('scroll', onScroll); observer.disconnect(); };
  }, []);

  return (
    <div className="min-h-screen bg-[#030711] text-white font-inter overflow-x-hidden selection:bg-indigo-600 selection:text-white">

      {/* ── GLOBAL STYLES ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track { animation: ticker 30s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
        .float { animation: float 6s ease-in-out infinite; }
        @keyframes gradient-x { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        .animate-gradient { background-size: 200% 200%; animation: gradient-x 4s ease infinite; }
        [data-reveal] { opacity:0; transform:translateY(28px); transition:opacity .7s ease,transform .7s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2) { transition-delay:.1s; }
        [data-reveal]:nth-child(3) { transition-delay:.2s; }
        [data-reveal]:nth-child(4) { transition-delay:.3s; }
      `}</style>

      {/* ── NAVBAR ────────────────────────────────────────────────────── */}
      <nav className={`fixed w-full z-[100] transition-all duration-500 ${scrolled ? 'bg-[#030711]/90 backdrop-blur-2xl border-b border-white/[0.06] py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-8 w-auto" textClassName="text-white" />
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {[
              { label: 'Características', ref: featuresRef },
              { label: 'Módulos', ref: modulesRef },
              { label: 'Seguridad', ref: securityRef },
              { label: 'Pasos', ref: stepsRef },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => scrollTo(item.ref)}
                className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors"
            >
              Entrar
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              Empezar Gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-20 overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-violet-600/10 rounded-full blur-[150px]" />
          <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-emerald-600/5 rounded-full blur-[120px]" />
          {/* Grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
          {/* Badge */}
          <div data-reveal className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm mb-10">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">ERP Híbrido · Venezuela-First · Multi-moneda</span>
          </div>

          {/* H1 */}
          <h1 data-reveal className="text-6xl md:text-8xl lg:text-[7.5rem] font-black leading-[0.88] tracking-[-0.04em] mb-8">
            <span className="text-white">El sistema que</span><br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 animate-gradient">
              mueve tu negocio.
            </span>
          </h1>

          {/* Subtitle */}
          <p data-reveal className="text-lg md:text-xl text-white/40 font-medium leading-relaxed max-w-2xl mx-auto mb-12">
            POS, Inventario, Finanzas, RRHH, Nómina, IA — todo integrado con protección cambiaria BCV en tiempo real. Diseñado para PYMEs venezolanas.
          </p>

          {/* CTAs */}
          <div data-reveal className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_20px_60px_-15px_rgba(99,102,241,0.5)] hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              Digitalizar mi Negocio <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo(featuresRef)}
              className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all"
            >
              Ver el Sistema
            </button>
          </div>

          {/* Stats */}
          <div data-reveal className="grid grid-cols-3 md:grid-cols-6 gap-6 max-w-4xl mx-auto">
            {STATS.map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-white">{s.value}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ────────────────────────────────────────────────────── */}
      <div className="border-y border-white/[0.05] bg-white/[0.02] py-5 overflow-hidden">
        <div className="ticker-track flex gap-0 whitespace-nowrap">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-4 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
              <span className="w-1 h-1 rounded-full bg-indigo-500 inline-block shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── FEATURES BENTO ────────────────────────────────────────────── */}
      <section ref={featuresRef} className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 block">Funcionalidades</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-tight">
              Todo en un solo<br />
              <span className="text-white/30">ecosistema.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

            {/* POS HERO CARD */}
            <div data-reveal className="md:col-span-8 relative rounded-[3rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 p-12 overflow-hidden group cursor-default">
              <div className="absolute top-0 right-0 p-8 opacity-[0.08] group-hover:scale-110 group-hover:rotate-6 transition-all duration-1000">
                <ShoppingCart size={280} />
              </div>
              {/* Glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-[3rem]" />
              <div className="relative z-10">
                <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-8 border border-white/20">
                  <Cpu size={28} className="text-white" />
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-6">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Activo en tiempo real</span>
                </div>
                <h3 className="text-4xl md:text-5xl font-black text-white mb-5 tracking-tight leading-tight">
                  Terminales POS<br />Detal & Mayor
                </h3>
                <p className="text-white/60 text-lg leading-relaxed mb-8 max-w-md">
                  Scanner de códigos, multi-pago (USD/BS/Transferencia/Mixto), cambio automático, consumidor final y recibos digitales.
                </p>
                <div className="flex flex-wrap gap-3">
                  {['BCV Automático', 'Multi-pago', 'Ticket Digital', 'Sin conexión'].map(tag => (
                    <span key={tag} className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* VISIONLAB */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#0d0f1e] border border-violet-500/20 p-10 flex flex-col justify-between group hover:border-violet-500/40 transition-colors">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-8 border border-violet-500/20">
                  <Sparkles size={26} className="text-violet-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">VisionLab IA</h3>
                <p className="text-white/40 text-base leading-relaxed">
                  Google Gemini analiza tu negocio y genera insights automáticos: P&L, Cash Flow, alertas de stock y proyecciones.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-3 text-[10px] font-black text-violet-400 uppercase tracking-widest group-hover:gap-5 transition-all">
                <PieChart size={16} />
                IA Predictiva activa
              </div>
            </div>

            {/* INVENTARIO */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#0d1a14] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-8 border border-emerald-500/20">
                  <Package size={26} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-white/40 text-base leading-relaxed">
                  Kardex en tiempo real, precios detal/mayor independientes, alertas de stock mínimo y movimientos auditables.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Alertas'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/15">{t}</span>
                ))}
              </div>
            </div>

            {/* CxC / FINANZAS */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#0d1a14] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-8 border border-emerald-500/20">
                  <BadgeDollarSign size={26} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Finanzas 360°</h3>
                <p className="text-white/40 text-base leading-relaxed">
                  CxC, CxP, Contabilidad, Conciliación bancaria y Comparación de libros. Todo conectado y auditado.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                {['CxC', 'CxP', 'Contab.', 'Conciliac.'].map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <CheckCircle2 size={12} /> {t}
                  </div>
                ))}
              </div>
            </div>

            {/* RRHH */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#0d1520] border border-sky-500/20 p-10 flex flex-col justify-between group hover:border-sky-500/40 transition-colors">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-sky-500/15 flex items-center justify-center mb-8 border border-sky-500/20">
                  <Users size={26} className="text-sky-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">RRHH & Nómina</h3>
                <p className="text-white/40 text-base leading-relaxed">
                  Gestión completa de empleados, cálculo de nómina, vacaciones, contratos y recibos de pago.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-3 text-[10px] font-black text-sky-400 uppercase tracking-widest">
                <Users size={14} /> Equipo sin límites
              </div>
            </div>

            {/* TASAS BCV */}
            <div data-reveal className="md:col-span-8 rounded-[3rem] bg-[#1a1200] border border-amber-500/20 p-12 flex flex-col md:flex-row gap-10 items-center group hover:border-amber-500/40 transition-colors">
              <div className="flex-1">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-8 border border-amber-500/20">
                  <TrendingUp size={26} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/40 text-base leading-relaxed max-w-md">
                  Sincronización automática diaria con el Banco Central de Venezuela. Tasa oficial + tasa de grupo propia del negocio.
                </p>
              </div>
              <div className="w-full md:w-64 space-y-4 shrink-0">
                {[
                  { label: 'Tasa BCV', value: '36.50 Bs/$', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                  { label: 'Tasa Grupo', value: '38.00 Bs/$', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                  { label: 'Último update', value: 'Hoy, 08:00', color: 'text-white/30', bg: 'bg-white/5', border: 'border-white/10' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-5 py-4 rounded-2xl ${r.bg} border ${r.border}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{r.label}</span>
                    <span className={`text-sm font-black ${r.color}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── ALL MODULES GRID ──────────────────────────────────────────── */}
      <section ref={modulesRef} className="py-32 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 mb-4 block">Módulos del Sistema</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-tight">
              12 módulos.<br />
              <span className="text-white/20">Un solo login.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ALL_MODULES.map((mod, i) => (
              <div
                key={mod.label}
                data-reveal
                className={`p-6 rounded-3xl border ${mod.border} ${mod.bg} group hover:scale-[1.02] transition-all duration-200 cursor-default`}
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-5 border ${mod.border} bg-black/20`}>
                  <mod.icon size={20} className={mod.color} />
                </div>
                <h4 className="text-sm font-black text-white mb-2 tracking-tight">{mod.label}</h4>
                <p className="text-[11px] text-white/30 leading-relaxed font-medium">{mod.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section ref={stepsRef} className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-24" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 block">Cómo Empezar</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white">
              Listo en<br />
              <span className="text-white/20">3 pasos.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01', icon: Rocket, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20',
                title: 'Crea tu Espacio',
                desc: 'Registra tu empresa en 2 minutos. Ingresa tu RIF, moneda principal y tasa BCV inicial. Recibes tu código de espacio único.',
                tags: ['RIF / Registro', 'Código único', '< 2 minutos'],
              },
              {
                step: '02', icon: Package, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
                title: 'Carga tu Catálogo',
                desc: 'Agrega tus productos con precios detal y mayor, stock inicial y margen de ganancia. Importa desde Excel con un clic.',
                tags: ['Excel Import', 'Precios Detal/Mayor', 'Stock inicial'],
              },
              {
                step: '03', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20',
                title: 'Vende y Crece',
                desc: 'Abre tus terminales, asigna cajeros y empieza a vender. El sistema sincroniza stock, finanzas y tasas automáticamente.',
                tags: ['Multi-terminal', 'Cajeros', 'Sync Automático'],
              },
            ].map((item, i) => (
              <div key={i} data-reveal className="relative group">
                <div className={`relative rounded-[2.5rem] border ${item.border} ${item.bg} p-10 h-full flex flex-col`}>
                  {/* Big step number */}
                  <div className={`absolute top-6 right-8 text-[5rem] font-black ${item.color} opacity-10 group-hover:opacity-20 transition-opacity leading-none select-none`}>
                    {item.step}
                  </div>

                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-8 border ${item.border} bg-black/20`}>
                    <item.icon size={26} className={item.color} />
                  </div>

                  <h4 className="text-2xl font-black text-white mb-4 tracking-tight">{item.title}</h4>
                  <p className="text-white/40 leading-relaxed text-sm mb-8 flex-1">{item.desc}</p>

                  <div className="flex flex-wrap gap-2">
                    {item.tags.map(t => (
                      <span key={t} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.color} bg-black/20 border ${item.border}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Connector arrow */}
                {i < 2 && (
                  <ChevronRight
                    size={28}
                    className="hidden md:block absolute top-1/2 -right-6 -translate-y-1/2 text-white/10 z-10"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY SECTION ──────────────────────────────────────────── */}
      <section ref={securityRef} className="py-32 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div data-reveal>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 mb-6 block">Seguridad</span>
              <h2 className="text-5xl md:text-6xl font-black text-white tracking-tight leading-tight mb-8">
                Protección de<br />
                <span className="text-white/30">grado bancario.</span>
              </h2>
              <p className="text-white/40 text-lg leading-relaxed mb-10">
                Cada acción en el sistema queda registrada en logs de auditoría inmutables. Control de roles granular para que cada empleado vea solo lo que necesita.
              </p>
              <button
                onClick={() => navigate('/register')}
                className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors"
              >
                Crear cuenta segura <ArrowRight size={16} />
              </button>
            </div>

            <div data-reveal className="grid grid-cols-2 gap-4">
              {[
                { icon: Fingerprint, title: 'PIN de Autoridad',  desc: 'PIN maestro para acciones críticas e irreversibles.', color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
                { icon: Shield,      title: 'Roles y Permisos',  desc: 'Owner, Admin, Ventas, Auditor y más. Acceso granular.', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
                { icon: Activity,    title: 'Audit Logs',        desc: 'Historial inmutable de todas las operaciones con timestamp.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { icon: Lock,        title: 'Acceso Seguro',     desc: 'Código de espacio único + email + contraseña por sesión.', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
                { icon: RefreshCw,   title: 'Sync en la Nube',   desc: 'Firebase con backup automático. Sin pérdida de datos.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
                { icon: Globe,       title: 'Acceso Remoto',     desc: 'Entra desde cualquier dispositivo con tu código de espacio.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              ].map(item => (
                <div key={item.title} className={`p-6 rounded-2xl border ${item.border} ${item.bg} group hover:scale-[1.02] transition-all cursor-default`}>
                  <item.icon size={20} className={`${item.color} mb-4`} />
                  <h5 className="text-[12px] font-black text-white mb-2 uppercase tracking-wide">{item.title}</h5>
                  <p className="text-[11px] text-white/30 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ROLES SECTION ─────────────────────────────────────────────── */}
      <section className="py-24 border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 block">Control de Acceso</span>
            <h3 className="text-4xl font-black text-white tracking-tight">Jerarquía de Roles</h3>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-3" data-reveal>
            {[
              { role: 'Owner', desc: 'Acceso total', color: 'bg-indigo-600', glow: 'shadow-indigo-500/30' },
              { role: 'Admin', desc: 'Gestión completa', color: 'bg-violet-600', glow: 'shadow-violet-500/30' },
              { role: 'Ventas', desc: 'Solo POS', color: 'bg-sky-600', glow: 'shadow-sky-500/30' },
              { role: 'Auditor', desc: 'Solo lectura', color: 'bg-emerald-600', glow: 'shadow-emerald-500/30' },
              { role: 'Staff', desc: 'Limitado', color: 'bg-amber-600', glow: 'shadow-amber-500/30' },
              { role: 'Miembro', desc: 'Pendiente', color: 'bg-slate-700', glow: '' },
            ].map((r, i, arr) => (
              <React.Fragment key={r.role}>
                <div className={`px-6 py-4 rounded-2xl ${r.color} shadow-lg ${r.glow} flex flex-col items-center gap-1 min-w-[120px]`}>
                  <span className="text-xs font-black text-white uppercase tracking-widest">{r.role}</span>
                  <span className="text-[9px] text-white/60 font-bold">{r.desc}</span>
                </div>
                {i < arr.length - 1 && <ChevronRight size={16} className="text-white/20 hidden md:block" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="py-40 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-[#030711] to-violet-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)]" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div data-reveal>
            <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 mb-10">
              <Star size={14} className="text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Empieza gratis hoy</span>
            </div>
            <h2 className="text-6xl md:text-8xl font-black text-white tracking-tight leading-tight mb-8">
              Tu negocio<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400">
                merece el mejor
              </span>
              <br />sistema.
            </h2>
            <p className="text-white/30 text-xl mb-14 max-w-xl mx-auto leading-relaxed">
              Crea tu espacio en 2 minutos. Sin tarjeta de crédito. Sin configuraciones complicadas.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => navigate('/register')}
                className="px-14 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_25px_60px_-15px_rgba(99,102,241,0.5)] hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Crear mi Cuenta <ArrowRight size={18} />
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-14 py-6 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all"
              >
                Ya tengo cuenta
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] py-20 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
            {/* Brand */}
            <div className="md:col-span-2 flex flex-col gap-6">
              <Logo className="h-8 w-auto" textClassName="text-white" />
              <p className="text-[12px] text-white/30 leading-relaxed max-w-xs font-medium">
                ERP híbrido diseñado para PYMEs venezolanas. Control total de ventas, inventario y finanzas en la nube.
              </p>
              <div className="flex gap-3">
                <button className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:bg-white/10 hover:text-white transition-all">
                  <Globe size={16} />
                </button>
                <button className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:bg-white/10 hover:text-white transition-all">
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>

            {/* Soluciones */}
            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Soluciones</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'POS Cloud', action: () => scrollTo(featuresRef) },
                  { label: 'Inventario', action: () => scrollTo(featuresRef) },
                  { label: 'Finanzas', action: () => scrollTo(modulesRef) },
                  { label: 'RRHH & Nómina', action: () => scrollTo(modulesRef) },
                  { label: 'VisionLab IA', action: () => scrollTo(featuresRef) },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sistema */}
            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Sistema</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Seguridad', action: () => scrollTo(securityRef) },
                  { label: 'Cómo funciona', action: () => scrollTo(stepsRef) },
                  { label: 'Todos los módulos', action: () => scrollTo(modulesRef) },
                  { label: 'Entrar', action: () => navigate('/login') },
                  { label: 'Registrarse', action: () => navigate('/register') },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Legal</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Términos de Uso', action: () => navigate('/terms') },
                  { label: 'Privacidad', action: () => navigate('/privacy') },
                  { label: 'Soporte', action: () => navigate('/login') },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
              © 2026 Dualis ERP — Inteligencia de Negocio para Venezuela
            </p>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-500/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Todos los sistemas operativos
              </span>
              <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">v2.0</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
