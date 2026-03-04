import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, Zap, Sparkles, Shield, Globe,
  ShoppingCart, Package, Cpu, Fingerprint, TrendingUp,
  FileText, Layers, Rocket, Users, BookOpen, Landmark, Monitor,
  MessageSquare, CheckCircle2, Lock, RefreshCw, Star,
  ChevronRight, BadgeDollarSign, Building2,
  Activity, PieChart, Play, X, WifiOff,
  History, ShieldCheck, Wifi, FileSpreadsheet,
  ScanLine, ArrowUpRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

// ─── DATA ─────────────────────────────────────────────────────────────────────

const MODULES = [
  { icon: ShoppingCart, label: 'POS Detal',         desc: 'Ventas físicas con scanner, multi-pago, modo offline y ticket digital.',           color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: Building2,    label: 'POS Mayor',          desc: 'Terminal mayorista con crédito 15/30/45 días y precios escalonados.',               color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: FileText,     label: 'CxC / Clientes',     desc: 'Cuentas por cobrar, historial de clientes y seguimiento de deudas.',               color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,       label: 'CxP / Proveedores',  desc: 'Cuentas por pagar, pagos pendientes y relación con proveedores.',                  color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,     label: 'Contabilidad',        desc: 'Libro diario, mayor y balance automático integrado con todas las operaciones.',    color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark,     label: 'Conciliación',        desc: 'Conciliación bancaria con importación de estados CSV y exportación.',             color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,      label: 'Inventario Pro',      desc: 'Kardex, alertas de stock, paginación avanzada y Smart Advisor de margen.',        color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Monitor,      label: 'Cajas / Terminales',  desc: 'Gestión de turnos, apertura/cierre y auditoría por cajero.',                     color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Users,        label: 'RRHH & Nómina',       desc: 'Empleados, nómina, vacaciones, contratos y recibos de pago.',                    color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Sparkles,     label: 'VisionLab IA',        desc: 'Gemini analiza tu negocio: P&L, Cash Flow, alertas y predicciones.',             color: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: BarChart3,    label: 'Reportes',            desc: 'KPIs, exportación Excel/PDF y gráficos por período.',                            color: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: History,      label: 'Rate History Wall',   desc: 'Historial colaborativo de tasas: fetch BCV, OCR e importación CSV masiva.',       color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  { icon: TrendingUp,   label: 'Tasas BCV Live',      desc: 'Tasa oficial + grupo propio. Propagación instantánea a todos los dispositivos.',  color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  { icon: ShieldCheck,  label: 'Audit Logs',          desc: 'Kardex de auditoría inmutable con filtros, export PDF/CSV/Excel.',               color: 'text-rose-400',   bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
];

const NOVEDADES = [
  { icon: WifiOff,         label: 'Modo Offline POS',      desc: 'Vende sin internet. Sincroniza al reconectar.',              color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  { icon: Globe,           label: 'Fetch BCV Automático',  desc: 'Obtén la tasa oficial en 1 clic y aplícala al instante.',    color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: FileSpreadsheet, label: 'CSV Import Tasas',      desc: 'Importa meses de historial BCV en segundos.',               color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: ScanLine,        label: 'OCR de Imágenes BCV',   desc: 'Escanea capturas de pantalla del BCV, el sistema lee todo.',color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  { icon: Package,         label: 'Paginación Inventario', desc: '25 productos por página con navegación rápida.',            color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
  { icon: Sparkles,        label: 'Smart Advisor Precios', desc: 'Sugerencia de precio con margen óptimo calculado al instante.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nómina',
  'Inventario Inteligente', 'VisionLab IA', 'CxC & CxP', 'Conciliación Bancaria',
  'Multi-moneda USD/VES', 'Roles y Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Modo Offline POS', 'CSV Import Tasas', 'OCR Tasas BCV', 'Paginación Inventario',
  'Sidebar Premium', 'Smart Advisor', 'Google Gemini IA', 'Facturación Digital',
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate  = useNavigate();
  const [scrolled, setScrolled]   = useState(false);
  const [demoOpen, setDemoOpen]   = useState(false);

  const heroRef     = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef  = useRef<HTMLElement>(null);
  const securityRef = useRef<HTMLElement>(null);
  const stepsRef    = useRef<HTMLElement>(null);
  const demoRef     = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }),
      { threshold: 0.07 }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); };
  }, []);

  return (
    <div className="min-h-screen bg-[#020710] text-white overflow-x-hidden selection:bg-indigo-600/80 selection:text-white">
      <style>{`
        @keyframes ticker  { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes gradx   { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes pulse-glow { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes float-y { 0%,100%{transform:translateY(0) rotate(var(--r,0deg))} 50%{transform:translateY(-14px) rotate(var(--r,0deg))} }
        @keyframes spin-slow { to{transform:rotate(360deg)} }
        @keyframes bar-in  { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        @keyframes fade-up { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .ticker-track   { animation:ticker 40s linear infinite; }
        .ticker-track:hover { animation-play-state:paused; }
        .animate-gradient { background-size:200% 200%; animation:gradx 5s ease infinite; }
        .float-card     { animation:float-y 5s ease-in-out infinite; }
        .float-card-2   { animation:float-y 6s ease-in-out infinite; animation-delay:-2s; }
        .float-card-3   { animation:float-y 4.5s ease-in-out infinite; animation-delay:-1s; }
        .bar-in         { transform-origin:bottom; animation:bar-in 1s cubic-bezier(.22,1,.36,1) both; }
        [data-reveal]   { opacity:0; transform:translateY(26px); transition:opacity .65s ease,transform .65s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.08s}
        [data-reveal]:nth-child(3){transition-delay:.16s}
        [data-reveal]:nth-child(4){transition-delay:.24s}
        [data-reveal]:nth-child(5){transition-delay:.32s}
        .glow-indigo { box-shadow:0 0 80px -20px rgba(99,102,241,.45); }
        .glow-violet { box-shadow:0 0 80px -20px rgba(139,92,246,.35); }
        .gradient-border { position:relative; }
        .gradient-border::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(99,102,241,.4),rgba(139,92,246,.15),rgba(99,102,241,.1)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .noise::after { content:''; position:absolute; inset:0; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"); pointer-events:none; border-radius:inherit; }
      `}</style>

      {/* ── NAVBAR ───────────────────────────────────────────────────────────── */}
      <nav className={`fixed w-full z-[100] transition-all duration-500 ${
        scrolled
          ? 'bg-[#020710]/80 backdrop-blur-2xl border-b border-white/[0.07] py-3.5'
          : 'bg-transparent py-6'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}>
            <Logo className="h-8 w-auto" textClassName="text-white" />
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {[
              { label:'Demo',           ref: demoRef },
              { label:'Funcionalidades', ref: featuresRef },
              { label:'Módulos',         ref: modulesRef },
              { label:'Seguridad',       ref: securityRef },
              { label:'Inicio rápido',   ref: stepsRef },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => scrollTo(item.ref)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white hover:bg-white/[0.06] transition-all"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
              Entrar
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow:'0 0 30px -8px rgba(99,102,241,.6)' }}
            >
              Empezar Gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center pt-28 pb-16 overflow-hidden noise">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-15%] left-[-5%] w-[65%] h-[65%] rounded-full bg-indigo-600/[0.12] blur-[130px]" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[55%] h-[55%] rounded-full bg-violet-600/[0.1] blur-[130px]" />
          <div className="absolute top-[50%] left-[45%] w-[25%] h-[25%] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
          {/* Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
          {/* Fade bottom */}
          <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#020710] to-transparent" />
        </div>

        {/* Floating metric cards */}
        <div className="float-card hidden xl:block absolute left-[6%] top-[38%]" style={{'--r':'-6deg'} as React.CSSProperties}>
          <div className="px-5 py-4 rounded-2xl bg-[#0d1424]/90 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/50">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-1.5">Tasa BCV</p>
            <p className="text-2xl font-black text-amber-400 tracking-tight">36.50 <span className="text-sm text-white/30">Bs/$</span></p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-bold text-white/25 uppercase tracking-widest">En vivo</span>
            </div>
          </div>
        </div>

        <div className="float-card-2 hidden xl:block absolute right-[6%] top-[32%]" style={{'--r':'7deg'} as React.CSSProperties}>
          <div className="px-5 py-4 rounded-2xl bg-[#0d1424]/90 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/50">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-1.5">Ventas Hoy</p>
            <p className="text-2xl font-black text-indigo-400 tracking-tight">$1,240</p>
            <p className="text-[8px] font-black text-emerald-400 mt-1.5">↑ +12% vs ayer</p>
          </div>
        </div>

        <div className="float-card-3 hidden xl:block absolute right-[8%] bottom-[22%]" style={{'--r':'-4deg'} as React.CSSProperties}>
          <div className="px-5 py-4 rounded-2xl bg-[#0d1424]/90 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/50">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-1.5">Stock</p>
            <p className="text-lg font-black text-emerald-400 tracking-tight">348 <span className="text-xs text-white/30">productos</span></p>
            <p className="text-[8px] font-black text-white/25 mt-1.5 uppercase tracking-wider">⚡ Sync en vivo</p>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div data-reveal className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full mb-10 cursor-default"
            style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)' }}>
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-300">ERP Venezuela-First · Multi-moneda · Gemini IA · v2.1</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-wider border border-emerald-500/30">Nuevo</span>
          </div>

          {/* H1 */}
          <h1 data-reveal className="font-black leading-[0.85] tracking-[-0.05em] mb-8"
            style={{ fontSize: 'clamp(3.5rem, 10vw, 8rem)' }}>
            <span className="block text-white">El sistema que</span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 animate-gradient">
              mueve tu negocio.
            </span>
          </h1>

          {/* Subtitle */}
          <p data-reveal className="text-lg md:text-xl text-white/35 font-medium leading-relaxed max-w-2xl mx-auto mb-14">
            POS · Inventario · Finanzas · RRHH · IA — todo integrado con{' '}
            <span className="text-amber-400 font-bold">protección cambiaria BCV</span>{' '}
            en tiempo real. Diseñado para PYMEs venezolanas.
          </p>

          {/* CTAs */}
          <div data-reveal className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <button
              onClick={() => navigate('/register')}
              className="group w-full sm:w-auto px-10 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
              style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow:'0 20px 60px -15px rgba(99,102,241,.55)' }}
            >
              Digitalizar mi Negocio
              <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => scrollTo(demoRef)}
              className="group w-full sm:w-auto px-10 py-5 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1] rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-3"
            >
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
                <Play size={12} className="fill-white text-white ml-0.5" />
              </div>
              Ver Demo
            </button>
          </div>

          {/* Stats strip */}
          <div data-reveal className="inline-flex flex-wrap items-center justify-center gap-x-10 gap-y-5 px-10 py-6 rounded-3xl bg-white/[0.03] border border-white/[0.07]">
            {[
              { value: '14+',    label: 'Módulos' },
              { value: '∞',      label: 'Transacciones' },
              { value: 'BCV',    label: 'Tasa oficial' },
              { value: 'Offline', label: 'Sin internet' },
              { value: '100%',   label: 'En la nube' },
              { value: '99.9%',  label: 'Uptime' },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <span className="hidden sm:block w-px h-8 bg-white/[0.08]" />}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xl font-black text-white tracking-tight">{s.value}</span>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">{s.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────────── */}
      <div className="relative py-5 overflow-hidden border-y border-white/[0.05]"
        style={{ background:'linear-gradient(90deg,rgba(79,70,229,.06) 0%,rgba(124,58,237,.04) 50%,rgba(79,70,229,.06) 100%)' }}>
        <div className="ticker-track flex whitespace-nowrap">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-4 px-8 text-[10px] font-black uppercase tracking-[0.2em] text-white/25">
              <span className="w-1 h-1 rounded-full bg-indigo-500/60 inline-block shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── DEMO ─────────────────────────────────────────────────────────────── */}
      <section ref={demoRef} className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.12),transparent)]" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/25 mb-6">
              <Play size={10} className="text-violet-400 fill-violet-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-400">Demostración del Sistema</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white leading-tight">
              Míralo en acción.
            </h2>
            <p className="text-white/30 text-lg mt-5 max-w-lg mx-auto leading-relaxed">
              Así se ve Dualis en el día a día de una PYME venezolana.
            </p>
          </div>

          {/* Mockup container */}
          <div data-reveal className="relative max-w-5xl mx-auto group cursor-pointer" onClick={() => setDemoOpen(true)}>

            {/* Multi-layer glow */}
            <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-r from-indigo-600/30 via-violet-600/20 to-indigo-600/30 blur-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute -inset-4 rounded-[3rem] bg-gradient-to-r from-indigo-600/10 via-violet-600/10 to-emerald-600/10 blur-3xl opacity-50" />

            {/* Browser chrome */}
            <div className="relative rounded-[2rem] overflow-hidden border border-white/[0.12] shadow-[0_80px_160px_-30px_rgba(0,0,0,0.95)]">
              {/* Top bar */}
              <div className="flex items-center gap-3 px-5 py-4 bg-[#0f1629] border-b border-white/[0.07]">
                <div className="flex gap-1.5 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28ca41]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07] max-w-xs w-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500/70 shrink-0" />
                    <span className="text-[10px] font-mono text-white/20 truncate">app.dualis.erp</span>
                  </div>
                </div>
                <div className="w-16 shrink-0 flex justify-end gap-1">
                  {[...Array(3)].map((_, i) => <div key={i} className="w-4 h-4 rounded bg-white/[0.05]" />)}
                </div>
              </div>

              {/* App shell */}
              <div className="flex bg-[#070c18]" style={{ height: 'clamp(320px,50vw,560px)' }}>

                {/* Sidebar */}
                <div className="flex flex-col shrink-0 bg-[#080d1b] border-r border-white/[0.05]"
                  style={{ width: 'clamp(56px,12vw,196px)' }}>
                  {/* Logo */}
                  <div className="flex items-center gap-2.5 p-4 border-b border-white/[0.05] mb-2">
                    <div className="w-7 h-7 rounded-xl shrink-0" style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }} />
                    <div className="hidden md:block h-2 w-14 rounded-full bg-white/10" />
                  </div>
                  {/* Group label */}
                  <div className="hidden md:block px-4 mb-1">
                    <div className="h-1.5 w-10 rounded-full bg-white/[0.07]" />
                  </div>
                  {[
                    { active:true,  color:'bg-indigo-500/25 border-indigo-500/30', dot:'bg-indigo-400/70', bar:true },
                    { active:false, color:'', dot:'bg-white/10', bar:false },
                    { active:false, color:'', dot:'bg-white/10', bar:false },
                    { active:false, color:'', dot:'bg-sky-400/30', bar:false },
                    { active:false, color:'', dot:'bg-white/10', bar:false },
                    { active:false, color:'', dot:'bg-emerald-400/30', bar:false },
                  ].map((item, i) => (
                    <div key={i} className={`relative mx-2 mb-1 h-8 rounded-lg border ${item.active ? item.color : 'border-transparent'} flex items-center gap-2 px-2`}>
                      {item.bar && <div className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-400" />}
                      <div className={`w-3.5 h-3.5 rounded-md shrink-0 ${item.dot}`} />
                      <div className={`hidden md:block h-1.5 rounded-full flex-1 ${item.active ? 'bg-indigo-400/30' : 'bg-white/[0.05]'}`} />
                    </div>
                  ))}
                  <div className="my-2 mx-2 border-t border-white/[0.05]" />
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="mx-2 mb-1 h-8 rounded-lg flex items-center gap-2 px-2">
                      <div className="w-3.5 h-3.5 rounded-md shrink-0 bg-white/[0.06]" />
                      <div className="hidden md:block h-1.5 rounded-full flex-1 bg-white/[0.04]" />
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 overflow-hidden flex flex-col p-3 md:p-5 gap-3 min-w-0">

                  {/* Topbar */}
                  <div className="flex items-center justify-between shrink-0 gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="h-2.5 w-32 rounded-full bg-white/10" />
                      <div className="h-1.5 w-20 rounded-full bg-white/[0.05]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="hidden sm:block text-[8px] font-black text-amber-400 uppercase tracking-wider">36.50 Bs/$</span>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08]" />
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/25" />
                    </div>
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 shrink-0">
                    {[
                      { label:'Ventas', val:'$1,240', sub:'+12%', g:'from-indigo-600/20 to-indigo-900/10', b:'border-indigo-500/25', v:'text-indigo-400' },
                      { label:'Stock',  val:'348 u.',  sub:'-2%',  g:'from-emerald-600/20 to-emerald-900/10',b:'border-emerald-500/25',v:'text-emerald-400' },
                      { label:'CxC',    val:'$3,820', sub:'+7%',  g:'from-amber-600/20 to-amber-900/10',  b:'border-amber-500/25',  v:'text-amber-400' },
                      { label:'CxP',    val:'$890',   sub:'−',    g:'from-rose-600/20 to-rose-900/10',    b:'border-rose-500/25',   v:'text-rose-400' },
                    ].map(k => (
                      <div key={k.label} className={`rounded-xl border ${k.b} bg-gradient-to-br ${k.g} p-2.5 md:p-3`}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-white/25">{k.label}</span>
                          <span className={`text-[7px] font-black ${k.v}`}>{k.sub}</span>
                        </div>
                        <span className="text-xs md:text-base font-black text-white leading-none">{k.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart + table */}
                  <div className="flex-1 grid grid-cols-5 gap-2 md:gap-3 min-h-0">
                    {/* Bar chart */}
                    <div className="col-span-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 md:p-3.5 flex flex-col">
                      <div className="flex items-center justify-between mb-2 shrink-0">
                        <div className="space-y-1">
                          <div className="h-2 w-20 rounded-full bg-white/10" />
                          <div className="h-1.5 w-14 rounded-full bg-white/[0.05]" />
                        </div>
                        <div className="flex gap-1">
                          {[1,0,0].map((a,i) => <div key={i} className={`h-5 w-8 rounded-md border ${a ? 'bg-indigo-500/20 border-indigo-500/25' : 'bg-white/[0.04] border-white/[0.07]'}`} />)}
                        </div>
                      </div>
                      <div className="flex items-end gap-1 flex-1">
                        {[30,55,40,70,48,82,60,44,68,52,88,45].map((h, i) => (
                          <div key={i} className="flex-1 bar-in rounded-sm"
                            style={{
                              height:`${h}%`,
                              background: i === 6 ? 'linear-gradient(to top,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.07)',
                              animationDelay:`${i * 0.06}s`
                            }} />
                        ))}
                      </div>
                      <div className="flex mt-1.5 shrink-0">
                        {['E','F','M','A','M','J','J','A','S','O','N','D'].map(m => (
                          <div key={m} className="flex-1 text-center text-[6px] font-black text-white/10">{m}</div>
                        ))}
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="col-span-2 flex flex-col gap-2">
                      {/* Donut */}
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 flex items-center gap-3">
                        <svg viewBox="0 0 36 36" className="w-10 h-10 shrink-0 -rotate-90">
                          <circle cx="18" cy="18" r="13" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="5" />
                          <circle cx="18" cy="18" r="13" fill="none" stroke="#4f46e5" strokeWidth="5" strokeDasharray="52 48" />
                          <circle cx="18" cy="18" r="13" fill="none" stroke="#7c3aed" strokeWidth="5" strokeDasharray="28 72" strokeDashoffset="-52" />
                          <circle cx="18" cy="18" r="13" fill="none" stroke="#10b981" strokeWidth="5" strokeDasharray="20 80" strokeDashoffset="-80" />
                        </svg>
                        <div className="space-y-1 flex-1 min-w-0">
                          {[['#4f46e5','Detal','52%'],['#7c3aed','Mayor','28%'],['#10b981','Otro','20%']].map(([c,l,p]) => (
                            <div key={l} className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background:c }} />
                              <span className="text-[7px] text-white/20 font-bold">{l}</span>
                              <span className="text-[7px] font-black text-white/40 ml-auto">{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Table rows */}
                      <div className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                        <div className="px-2.5 py-2 border-b border-white/[0.05] bg-white/[0.02] flex gap-2">
                          {[32,18,22].map((w,i) => <div key={i} className="h-1.5 rounded-full bg-white/10" style={{ width:w }} />)}
                        </div>
                        {[
                          ['bg-indigo-400/60','bg-emerald-500/40'],
                          ['bg-violet-400/50','bg-emerald-500/30'],
                          ['bg-sky-400/50',   'bg-amber-500/40'],
                          ['bg-amber-400/50', 'bg-rose-500/40'],
                        ].map((cols, i) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.04]">
                            <div className={`w-3.5 h-3.5 rounded-md shrink-0 ${cols[0]}`} />
                            <div className="h-1.5 rounded-full flex-1 bg-white/[0.06]" />
                            <div className={`h-4 w-9 rounded-md ${cols[1]}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Play overlay */}
            <div className="absolute inset-0 rounded-[2rem] flex flex-col items-center justify-center bg-black/35 backdrop-blur-[2px] group-hover:bg-black/45 transition-all duration-300">
              <div className="flex flex-col items-center gap-5">
                <div
                  className="w-20 h-20 md:w-28 md:h-28 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                  style={{ background:'rgba(255,255,255,0.1)', boxShadow:'0 0 80px rgba(99,102,241,0.5)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.2)' }}
                >
                  <Play size={28} className="text-white fill-white ml-2" />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/85">Ver Demostración</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-1">Haz clic para reproducir</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pills */}
          <div data-reveal className="flex flex-wrap justify-center gap-2.5 mt-10">
            {['POS en acción','BCV en tiempo real','Modo Offline','Dashboard IA','Historial de Tasas','Inventario Paginado','CSV Import','OCR Automático'].map(f => (
              <span key={f} className="px-4 py-2 rounded-full border border-white/[0.07] bg-white/[0.025] text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 hover:border-white/[0.15] transition-all cursor-default">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Modal */}
        {demoOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl" onClick={() => setDemoOpen(false)}>
            <div
              className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden border border-white/[0.1] shadow-[0_60px_120px_-20px_rgba(0,0,0,1)]"
              style={{ background:'#0d1424' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,rgba(99,102,241,0.1),transparent)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10">
                <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.4)' }}>
                  <Play size={28} className="text-indigo-400 fill-indigo-400 ml-1" />
                </div>
                <div className="text-center">
                  <p className="text-white font-black text-2xl tracking-tight mb-3">Demo en preparación</p>
                  <p className="text-white/30 text-sm max-w-xs mx-auto leading-relaxed">Estamos grabando el video oficial del sistema. Disponible muy pronto.</p>
                </div>
                <button
                  onClick={() => navigate('/register')}
                  className="mt-1 px-8 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2 transition-all hover:-translate-y-0.5"
                  style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  Probar Gratis Ahora <ArrowRight size={14} />
                </button>
              </div>
              <button
                onClick={() => setDemoOpen(false)}
                className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all z-20"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── NOVEDADES ────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-[#020509] border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12" data-reveal>
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 mb-4">
                <Zap size={11} className="text-emerald-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-400">Últimas Actualizaciones — v2.1</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">Lo que hay de nuevo.</h2>
            </div>
            <button
              onClick={() => navigate('/register')}
              className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
            >
              Ver todo <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {NOVEDADES.map((n, i) => (
              <div
                key={n.label}
                data-reveal
                style={{ transitionDelay:`${i*60}ms` }}
                className={`gradient-border flex items-start gap-4 p-5 rounded-2xl border ${n.border} ${n.bg} hover:scale-[1.02] transition-all duration-200 cursor-default`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${n.border} bg-black/20`}>
                  <n.icon size={18} className={n.color} />
                </div>
                <div>
                  <p className="text-sm font-black text-white mb-1 tracking-tight">{n.label}</p>
                  <p className="text-[11px] text-white/30 leading-relaxed font-medium">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES BENTO ───────────────────────────────────────────────────── */}
      <section ref={featuresRef} className="py-32 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(99,102,241,0.06),transparent)]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 block">Funcionalidades Clave</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white leading-tight">
              Todo en un solo<br />
              <span className="text-white/20">ecosistema.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

            {/* POS — wide hero */}
            <div data-reveal className="md:col-span-8 relative rounded-[3rem] overflow-hidden group cursor-default"
              style={{ background:'linear-gradient(135deg,#3730a3,#4f46e5,#6d28d9)' }}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
              <div className="absolute top-0 right-0 p-10 opacity-[0.07] group-hover:scale-110 group-hover:rotate-6 transition-all duration-[1.2s]">
                <ShoppingCart size={300} />
              </div>
              <div className="relative z-10 p-12">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    <Cpu size={26} className="text-white" />
                  </div>
                  <div className="px-4 py-2 rounded-full bg-white/10 border border-white/15">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/70">En tiempo real</span>
                    </div>
                  </div>
                </div>
                <h3 className="text-4xl md:text-5xl font-black text-white mb-5 tracking-tight leading-tight">
                  Terminales POS<br />Detal & Mayor
                </h3>
                <p className="text-white/55 text-base md:text-lg leading-relaxed mb-8 max-w-md">
                  Scanner por cámara, multi-pago (USD/Bs/Transferencia/Mixto), cambio automático, consumidor final, recibos WhatsApp y modo offline.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {['BCV Automático','Multi-pago','Ticket Digital','Modo Offline','Búsqueda por nombre','Sin conexión'].map(tag => (
                    <span key={tag} className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/65">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* VisionLab */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#0c0e22] border border-violet-500/25 p-10 flex flex-col justify-between group hover:border-violet-500/45 transition-colors cursor-default">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-8 border border-violet-500/25">
                  <Sparkles size={24} className="text-violet-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">VisionLab IA</h3>
                <p className="text-white/35 text-base leading-relaxed">
                  Google Gemini analiza tu negocio: P&L, Cash Flow, alertas de stock y proyecciones automáticas.
                </p>
              </div>
              <div className="mt-8 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-[10px] font-black text-violet-400 uppercase tracking-widest">
                  <PieChart size={15} /> IA Predictiva activa
                </div>
                <ArrowUpRight size={16} className="text-violet-400/40 group-hover:text-violet-400 transition-colors" />
              </div>
            </div>

            {/* Inventario */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#091610] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors cursor-default">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-8 border border-emerald-500/20">
                  <Package size={24} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-white/35 text-base leading-relaxed">
                  Kardex en tiempo real, precios detal/mayor independientes, alertas de stock mínimo, paginación y Smart Advisor de margen.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex','Multi-precio','Alertas','Smart Advisor'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/15">{t}</span>
                ))}
              </div>
            </div>

            {/* Finanzas */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#091610] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors cursor-default">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-8 border border-emerald-500/20">
                  <BadgeDollarSign size={24} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Finanzas 360°</h3>
                <p className="text-white/35 text-base leading-relaxed">
                  CxC, CxP, Contabilidad, Conciliación bancaria y Comparación de libros. Todo conectado y auditado.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                {['CxC','CxP','Contab.','Conciliac.'].map(t => (
                  <div key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 size={11} /> {t}
                  </div>
                ))}
              </div>
            </div>

            {/* RRHH */}
            <div data-reveal className="md:col-span-4 rounded-[3rem] bg-[#09121a] border border-sky-500/20 p-10 flex flex-col justify-between group hover:border-sky-500/40 transition-colors cursor-default">
              <div>
                <div className="h-14 w-14 rounded-2xl bg-sky-500/15 flex items-center justify-center mb-8 border border-sky-500/20">
                  <Users size={24} className="text-sky-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">RRHH & Nómina</h3>
                <p className="text-white/35 text-base leading-relaxed">
                  Gestión completa de empleados, nómina, vacaciones, contratos y recibos de pago.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-2.5 text-[10px] font-black text-sky-400 uppercase tracking-widest">
                <Users size={14} /> Equipo sin límites
              </div>
            </div>

            {/* Tasas BCV — wide */}
            <div data-reveal className="md:col-span-8 rounded-[3rem] bg-[#160f00] border border-amber-500/20 p-12 flex flex-col md:flex-row gap-10 items-center group hover:border-amber-500/40 transition-colors cursor-default">
              <div className="flex-1">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-8 border border-amber-500/20">
                  <TrendingUp size={24} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/35 text-base leading-relaxed max-w-md">
                  Fetch automático desde BCV oficial, historial colaborativo con soporte OCR e importación CSV masiva para meses de datos históricos.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Fetch Automático','OCR Imágenes','CSV Import','Propagación Instantánea'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest border border-amber-500/15">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-60 space-y-3 shrink-0">
                {[
                  { label:'BCV Oficial', value:'36.50 Bs/$', c:'text-amber-400',   bg:'bg-amber-500/10',   b:'border-amber-500/20' },
                  { label:'Grupo',       value:'38.00 Bs/$', c:'text-orange-400',  bg:'bg-orange-500/10',  b:'border-orange-500/20' },
                  { label:'Fuente',      value:'BCV.ORG.VE', c:'text-emerald-400', bg:'bg-emerald-500/10', b:'border-emerald-500/20' },
                  { label:'Update',      value:'Hoy 08:00',  c:'text-white/25',    bg:'bg-white/[0.04]',   b:'border-white/[0.08]' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-4 py-3.5 rounded-2xl ${r.bg} border ${r.b}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{r.label}</span>
                    <span className={`text-sm font-black ${r.c}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── ALL MODULES ──────────────────────────────────────────────────────── */}
      <section ref={modulesRef} className="py-32 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 mb-4 block">Módulos del Sistema</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white leading-tight">
              14 módulos.<br /><span className="text-white/20">Un solo login.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MODULES.map((mod, i) => (
              <div
                key={mod.label}
                data-reveal
                style={{ transitionDelay:`${i*35}ms` }}
                className={`gradient-border p-6 rounded-3xl border ${mod.border} ${mod.bg} group hover:scale-[1.03] transition-all duration-200 cursor-default`}
              >
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center mb-5 border ${mod.border} bg-black/20`}>
                  <mod.icon size={19} className={mod.color} />
                </div>
                <h4 className="text-sm font-black text-white mb-2 tracking-tight">{mod.label}</h4>
                <p className="text-[11px] text-white/25 leading-relaxed font-medium">{mod.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section ref={stepsRef} className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.07)_0%,transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-24" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 block">Inicio Rápido</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white">
              Listo en<br /><span className="text-white/20">3 pasos.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step:'01', icon:Rocket, color:'text-indigo-400', bg:'bg-indigo-500/10', border:'border-indigo-500/20', title:'Crea tu Espacio', desc:'Registra tu empresa en 2 minutos. Ingresa tu RIF, moneda principal y tasa BCV inicial. Recibes tu código de espacio único.', tags:['RIF / Registro','Código único','< 2 minutos'] },
              { step:'02', icon:Package, color:'text-emerald-400', bg:'bg-emerald-500/10', border:'border-emerald-500/20', title:'Carga tu Catálogo', desc:'Agrega productos con precios detal y mayor, stock inicial y margen de ganancia. Importa desde Excel con un clic.', tags:['Excel Import','Precios Detal/Mayor','Stock inicial'] },
              { step:'03', icon:Zap, color:'text-amber-400', bg:'bg-amber-500/10', border:'border-amber-500/20', title:'Vende y Crece', desc:'Abre tus terminales, asigna cajeros y empieza a vender. El sistema sincroniza stock, finanzas y tasas automáticamente.', tags:['Multi-terminal','Cajeros','Sync Automático'] },
            ].map((item, i) => (
              <div key={i} data-reveal className="relative group">
                <div className={`relative rounded-[2.5rem] border ${item.border} ${item.bg} p-10 h-full flex flex-col`}>
                  <div className={`absolute top-6 right-8 text-[5.5rem] font-black ${item.color} opacity-[0.08] group-hover:opacity-20 transition-opacity leading-none select-none`}>{item.step}</div>
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-8 border ${item.border} bg-black/20`}>
                    <item.icon size={26} className={item.color} />
                  </div>
                  <h4 className="text-2xl font-black text-white mb-4 tracking-tight">{item.title}</h4>
                  <p className="text-white/35 leading-relaxed text-sm mb-8 flex-1">{item.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map(t => (
                      <span key={t} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.color} bg-black/20 border ${item.border}`}>{t}</span>
                    ))}
                  </div>
                </div>
                {i < 2 && <ChevronRight size={26} className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 text-white/10 z-10" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY ─────────────────────────────────────────────────────────── */}
      <section ref={securityRef} className="py-32 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div data-reveal>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 mb-8">
                <Shield size={11} className="text-rose-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-rose-400">Seguridad</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-black text-white tracking-tight leading-[0.9] mb-8">
                Protección de<br /><span className="text-white/25">grado bancario.</span>
              </h2>
              <p className="text-white/35 text-lg leading-relaxed mb-10">
                Cada acción queda registrada en logs de auditoría inmutables. Control de roles granular para que cada empleado vea solo lo que necesita.
              </p>
              <button
                onClick={() => navigate('/register')}
                className="flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors group"
              >
                Crear cuenta segura <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            <div data-reveal className="grid grid-cols-2 gap-4">
              {[
                { icon:Fingerprint, title:'PIN de Autoridad', desc:'PIN maestro para acciones críticas e irreversibles.', color:'text-rose-400', bg:'bg-rose-500/10', border:'border-rose-500/20' },
                { icon:Shield, title:'Roles y Permisos', desc:'Owner, Admin, Ventas, Auditor y más. Acceso granular.', color:'text-indigo-400', bg:'bg-indigo-500/10', border:'border-indigo-500/20' },
                { icon:Activity, title:'Audit Logs', desc:'Historial inmutable de todas las operaciones.', color:'text-emerald-400', bg:'bg-emerald-500/10', border:'border-emerald-500/20' },
                { icon:Lock, title:'Acceso Seguro', desc:'Código de espacio único + email + contraseña.', color:'text-sky-400', bg:'bg-sky-500/10', border:'border-sky-500/20' },
                { icon:RefreshCw, title:'Sync en la Nube', desc:'Firebase con backup automático. Sin pérdida de datos.', color:'text-violet-400', bg:'bg-violet-500/10', border:'border-violet-500/20' },
                { icon:Globe, title:'Acceso Remoto', desc:'Cualquier dispositivo con tu código de espacio.', color:'text-amber-400', bg:'bg-amber-500/10', border:'border-amber-500/20' },
              ].map(item => (
                <div key={item.title} className={`gradient-border p-6 rounded-2xl border ${item.border} ${item.bg} group hover:scale-[1.03] transition-all cursor-default`}>
                  <item.icon size={19} className={`${item.color} mb-4`} />
                  <h5 className="text-[11px] font-black text-white mb-2 uppercase tracking-wide">{item.title}</h5>
                  <p className="text-[10px] text-white/25 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ROLES ────────────────────────────────────────────────────────────── */}
      <section className="py-24 border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 block">Control de Acceso</span>
            <h3 className="text-4xl font-black text-white tracking-tight">Jerarquía de Roles</h3>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-3" data-reveal>
            {[
              { role:'Owner',   desc:'Acceso total',     c:'from-indigo-600 to-indigo-700', glow:'shadow-indigo-500/30' },
              { role:'Admin',   desc:'Gestión completa', c:'from-violet-600 to-violet-700', glow:'shadow-violet-500/30' },
              { role:'Ventas',  desc:'Solo POS',         c:'from-sky-600 to-sky-700',       glow:'shadow-sky-500/30' },
              { role:'Auditor', desc:'Solo lectura',     c:'from-emerald-600 to-emerald-700',glow:'shadow-emerald-500/30' },
              { role:'Staff',   desc:'Limitado',         c:'from-amber-600 to-amber-700',   glow:'shadow-amber-500/30' },
              { role:'Miembro', desc:'Pendiente',        c:'from-slate-700 to-slate-800',   glow:'' },
            ].map((r, i, arr) => (
              <React.Fragment key={r.role}>
                <div className={`px-6 py-4 rounded-2xl bg-gradient-to-br ${r.c} shadow-lg ${r.glow} flex flex-col items-center gap-1 min-w-[120px]`}>
                  <span className="text-xs font-black text-white uppercase tracking-widest">{r.role}</span>
                  <span className="text-[9px] text-white/50 font-bold">{r.desc}</span>
                </div>
                {i < arr.length - 1 && <ChevronRight size={16} className="text-white/15 hidden md:block" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="relative py-44 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(99,102,241,0.18),transparent)]" />
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[150px]" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div data-reveal>
            <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.05] border border-white/[0.1] mb-12">
              <Star size={13} className="text-amber-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/50">Empieza gratis hoy · Sin tarjeta de crédito</span>
            </div>
            <h2 className="font-black text-white tracking-[-0.05em] leading-[0.85] mb-10"
              style={{ fontSize:'clamp(3rem,9vw,7rem)' }}>
              Tu negocio<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 animate-gradient">
                merece el mejor
              </span>
              <br />sistema.
            </h2>
            <p className="text-white/25 text-xl mb-14 max-w-lg mx-auto leading-relaxed">
              Crea tu espacio en 2 minutos. Sin configuraciones complicadas. Todo listo para vender.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => navigate('/register')}
                className="group px-14 py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] text-white transition-all hover:-translate-y-1.5 active:scale-95 flex items-center justify-center gap-3"
                style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow:'0 30px 80px -15px rgba(99,102,241,.55)' }}
              >
                Crear mi Cuenta <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => scrollTo(demoRef)}
                className="group px-14 py-6 bg-white/[0.05] hover:bg-white/[0.09] text-white border border-white/[0.1] rounded-2xl text-[11px] font-black uppercase tracking-[0.18em] transition-all flex items-center justify-center gap-3"
              >
                <Play size={15} className="fill-white" /> Ver Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] pt-20 pb-10 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
            <div className="md:col-span-2 flex flex-col gap-6">
              <Logo className="h-8 w-auto" textClassName="text-white" />
              <p className="text-[12px] text-white/25 leading-relaxed max-w-xs font-medium">
                ERP híbrido diseñado para PYMEs venezolanas. Control total de ventas, inventario y finanzas en la nube.
              </p>
              <div className="flex gap-2.5">
                {[Globe, MessageSquare].map((Icon, i) => (
                  <button key={i} className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/25 hover:bg-white/[0.09] hover:text-white transition-all">
                    <Icon size={15} />
                  </button>
                ))}
              </div>
            </div>

            {[
              {
                title: 'Soluciones',
                links: [
                  { label:'POS Cloud',      action:() => scrollTo(featuresRef) },
                  { label:'Inventario',      action:() => scrollTo(featuresRef) },
                  { label:'Finanzas',        action:() => scrollTo(modulesRef) },
                  { label:'RRHH & Nómina',  action:() => scrollTo(modulesRef) },
                  { label:'VisionLab IA',   action:() => scrollTo(featuresRef) },
                  { label:'Tasas BCV Live', action:() => scrollTo(featuresRef) },
                ],
              },
              {
                title: 'Sistema',
                links: [
                  { label:'Demo',              action:() => scrollTo(demoRef) },
                  { label:'Novedades v2.1',    action:() => scrollTo(featuresRef) },
                  { label:'Seguridad',         action:() => scrollTo(securityRef) },
                  { label:'Todos los módulos', action:() => scrollTo(modulesRef) },
                  { label:'Entrar',            action:() => navigate('/login') },
                  { label:'Registrarse',       action:() => navigate('/register') },
                ],
              },
              {
                title: 'Legal',
                links: [
                  { label:'Términos de Uso', action:() => navigate('/terms') },
                  { label:'Privacidad',      action:() => navigate('/privacy') },
                  { label:'Soporte',         action:() => navigate('/login') },
                ],
              },
            ].map(col => (
              <div key={col.title} className="flex flex-col gap-5">
                <h5 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{col.title}</h5>
                <div className="flex flex-col gap-3">
                  {col.links.map(item => (
                    <button key={item.label} onClick={item.action} className="text-[11px] font-bold text-white/25 hover:text-white transition-colors text-left uppercase tracking-widest">
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/15">
              © 2026 Dualis ERP — Inteligencia de Negocio para Venezuela
            </p>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-[9px] font-black text-emerald-500/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Todos los sistemas operativos
              </span>
              <span className="text-[9px] font-black text-white/15 uppercase tracking-widest">v2.1</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
