import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, ShieldCheck, Zap, Sparkles, Shield, Globe,
  ShoppingCart, Package, Cpu, Fingerprint, TrendingUp, Receipt, FileText,
  Layers, Rocket, Users, BookOpen, Landmark, Monitor, LayoutGrid,
  ArrowLeftRight, MessageSquare, CheckCircle2, Lock, RefreshCw, Star,
  ChevronRight, BadgeDollarSign, CreditCard, Building2, Banknote,
  Activity, PieChart, Settings2, HelpCircle, Play, X, WifiOff,
  FileSpreadsheet, ScanLine, History,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

// ─── DATA ────────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  { icon: ShoppingCart,    label: 'POS Detal',          desc: 'Punto de venta para tiendas físicas con scanner, multi-pago, modo offline y ticket digital.', color: 'text-indigo-400',  bg: 'bg-indigo-500/10',   border: 'border-indigo-500/20' },
  { icon: Building2,       label: 'POS Mayor',           desc: 'Terminal mayorista con precios escalonados, crédito a 15/30/45 días y despacho.', color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: FileText,        label: 'CxC / Clientes',      desc: 'Gestión de cuentas por cobrar, historial de clientes y seguimiento de deudas.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,          label: 'CxP / Proveedores',   desc: 'Control de cuentas por pagar, pagos pendientes y relación con proveedores.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,        label: 'Contabilidad',        desc: 'Libro diario, mayor y balance automático integrado con todas las operaciones.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark,        label: 'Conciliación',        desc: 'Conciliación bancaria con importación de estados de cuenta CSV y export.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,         label: 'Inventario Pro',      desc: 'Kardex, alertas de stock, paginación avanzada y precios detal/mayor separados.', color: 'text-sky-400',   bg: 'bg-sky-500/10',      border: 'border-sky-500/20' },
  { icon: Monitor,         label: 'Cajas / Terminales',  desc: 'Gestión de turnos de caja, apertura/cierre y auditoría por cajero.', color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Users,           label: 'RRHH & Nómina',       desc: 'Gestión de empleados, cálculo de nómina, vacaciones y contratos.', color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Sparkles,        label: 'VisionLab IA',        desc: 'Análisis con Google Gemini: flujo de caja, P&L, alertas y predicciones.', color: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: BarChart3,       label: 'Reportes',            desc: 'KPIs históricos, exportación Excel/PDF y gráficos por período.', color: 'text-violet-400', bg: 'bg-violet-500/10',   border: 'border-violet-500/20' },
  { icon: History,         label: 'Rate History Wall',   desc: 'Historial colaborativo de tasas BCV con OCR, CSV import y fetch automático desde BCV.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: TrendingUp,      label: 'Tasas BCV Live',      desc: 'Tasa oficial BCV en tiempo real + tasa de grupo. Propagación instantánea a todos los dispositivos.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: ShieldCheck,     label: 'Audit Logs',          desc: 'Kardex de auditoría inmutable con filtros por fecha, acción y usuario. Export PDF/CSV/Excel.', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
];

const STATS = [
  { value: '14+', label: 'Módulos Integrados' },
  { value: '∞',   label: 'Transacciones/mes' },
  { value: 'Live', label: 'Tasa BCV oficial' },
  { value: '100%', label: 'En la nube' },
  { value: 'Offline', label: 'Modo sin conexión' },
  { value: '99.9%', label: 'Uptime garantizado' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nómina',
  'Inventario Inteligente', 'VisionLab IA', 'CxC & CxP', 'Conciliación Bancaria',
  'Multi-moneda USD/VES', 'Roles y Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Facturación Digital', 'Modo Offline POS', 'CSV Import Tasas', 'OCR Tasas BCV',
  'Sidebar Premium', 'Paginación Inventario', 'Google Gemini IA',
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef  = useRef<HTMLElement>(null);
  const securityRef = useRef<HTMLElement>(null);
  const stepsRef    = useRef<HTMLElement>(null);
  const demoRef     = useRef<HTMLElement>(null);

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
        .ticker-track { animation: ticker 36s linear infinite; }
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
        @keyframes bar-rise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .bar-rise { transform-origin: bottom; animation: bar-rise 1.2s cubic-bezier(.22,1,.36,1) forwards; }
      `}</style>

      {/* ── NAVBAR ────────────────────────────────────────────────────── */}
      <nav className={`fixed w-full z-[100] transition-all duration-500 ${scrolled ? 'bg-[#030711]/90 backdrop-blur-2xl border-b border-white/[0.06] py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-8 w-auto" textClassName="text-white" />
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {[
              { label: 'Demo',          ref: demoRef },
              { label: 'Características', ref: featuresRef },
              { label: 'Módulos',       ref: modulesRef },
              { label: 'Seguridad',     ref: securityRef },
              { label: 'Pasos',         ref: stepsRef },
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
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[150px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-violet-600/10 rounded-full blur-[150px]" />
          <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-emerald-600/5 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
          <div data-reveal className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm mb-10">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">ERP Híbrido · Venezuela-First · Multi-moneda · v2.1</span>
          </div>

          <h1 data-reveal className="text-6xl md:text-8xl lg:text-[7.5rem] font-black leading-[0.88] tracking-[-0.04em] mb-8">
            <span className="text-white">El sistema que</span><br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 animate-gradient">
              mueve tu negocio.
            </span>
          </h1>

          <p data-reveal className="text-lg md:text-xl text-white/40 font-medium leading-relaxed max-w-2xl mx-auto mb-12">
            POS, Inventario, Finanzas, RRHH, Nómina, IA — todo integrado con protección cambiaria BCV en tiempo real. Diseñado para PYMEs venezolanas.
          </p>

          <div data-reveal className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_20px_60px_-15px_rgba(99,102,241,0.5)] hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              Digitalizar mi Negocio <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo(demoRef)}
              className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
            >
              <Play size={16} className="fill-white" /> Ver Demo
            </button>
          </div>

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

      {/* ── DEMO SECTION ──────────────────────────────────────────────── */}
      <section ref={demoRef} className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.1)_0%,transparent_65%)]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">

          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 mb-4 block">Demostración</span>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-tight">
              Míralo en<br />
              <span className="text-white/20">acción.</span>
            </h2>
            <p className="text-white/30 text-lg mt-5 max-w-xl mx-auto leading-relaxed">
              Un vistazo real al sistema que PYMEs venezolanas usan cada día para vender, controlar y crecer.
            </p>
          </div>

          {/* Browser mockup */}
          <div
            data-reveal
            className="relative max-w-5xl mx-auto group cursor-pointer"
            onClick={() => setDemoOpen(true)}
          >
            {/* Ambient glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-600/20 via-violet-600/15 to-indigo-600/20 blur-3xl rounded-[3rem] opacity-80" />

            {/* Browser frame */}
            <div className="relative rounded-[2rem] overflow-hidden border border-white/[0.1] shadow-[0_60px_120px_-20px_rgba(0,0,0,0.9)]">
              {/* Browser chrome */}
              <div className="bg-[#111827] px-5 py-3.5 flex items-center gap-4 border-b border-white/[0.06]">
                <div className="flex gap-2 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="px-5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center gap-2 max-w-xs w-full">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60 shrink-0" />
                    <span className="text-[10px] font-mono text-white/25 truncate">app.dualis.erp / dashboard</span>
                  </div>
                </div>
                <div className="w-16 shrink-0" />
              </div>

              {/* App preview */}
              <div className="bg-[#070b14] flex h-[380px] md:h-[520px]">
                {/* Sidebar mock */}
                <div className="w-[60px] md:w-[190px] bg-[#090d1a] border-r border-white/[0.05] flex flex-col p-3 gap-1.5 shrink-0">
                  {/* Logo */}
                  <div className="h-8 mb-3 flex items-center gap-2.5 px-1">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 shrink-0" />
                    <div className="hidden md:block h-2 w-14 rounded-full bg-white/10" />
                  </div>
                  {/* Nav items */}
                  {[
                    { active: true, color: 'bg-indigo-500/20 border-indigo-500/25', dot: 'bg-indigo-400/60' },
                    { active: false, color: 'bg-transparent', dot: 'bg-white/10' },
                    { active: false, color: 'bg-transparent', dot: 'bg-white/10' },
                    { active: false, color: 'bg-transparent', dot: 'bg-white/10' },
                    { active: false, color: 'bg-transparent', dot: 'bg-white/10' },
                    { active: false, color: 'bg-transparent', dot: 'bg-white/10' },
                  ].map((item, i) => (
                    <div key={i} className={`h-8 rounded-lg border ${item.active ? 'border-indigo-500/25' : 'border-transparent'} ${item.color} flex items-center gap-2 px-2`}>
                      <div className={`w-3.5 h-3.5 rounded-md shrink-0 ${item.dot}`} />
                      <div className={`hidden md:block h-1.5 rounded-full flex-1 ${item.active ? 'bg-indigo-400/30' : 'bg-white/[0.05]'}`} />
                    </div>
                  ))}
                  {/* Separator */}
                  <div className="my-1 border-t border-white/[0.05]" />
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-8 rounded-lg flex items-center gap-2 px-2">
                      <div className="w-3.5 h-3.5 rounded-md bg-white/[0.06] shrink-0" />
                      <div className="hidden md:block h-1.5 rounded-full flex-1 bg-white/[0.04]" />
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 p-4 md:p-5 overflow-hidden flex flex-col gap-3.5">
                  {/* Topbar */}
                  <div className="flex items-center justify-between shrink-0">
                    <div className="h-2.5 w-28 rounded-full bg-white/10" />
                    <div className="flex gap-2">
                      <div className="h-7 w-7 rounded-lg bg-white/[0.05] border border-white/[0.07]" />
                      <div className="h-7 w-7 rounded-lg bg-white/[0.05] border border-white/[0.07]" />
                      <div className="h-7 w-16 rounded-lg bg-indigo-500/20 border border-indigo-500/25" />
                    </div>
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
                    {[
                      { label: 'Ventas Hoy', value: '$1,240', pct: '+12%', grad: 'from-indigo-500/15 to-indigo-600/5', border: 'border-indigo-500/20', dot: 'bg-indigo-400', up: true },
                      { label: 'Inventario', value: '348 u.', pct: '-4%',  grad: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/20', dot: 'bg-emerald-400', up: false },
                      { label: 'CxC',        value: '$3,820', pct: '+7%',  grad: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/20', dot: 'bg-amber-400', up: true },
                      { label: 'Tasa BCV',   value: '36.50 Bs', pct: '=0', grad: 'from-violet-500/15 to-violet-600/5', border: 'border-violet-500/20', dot: 'bg-violet-400', up: true },
                    ].map(k => (
                      <div key={k.label} className={`rounded-xl border ${k.border} bg-gradient-to-br ${k.grad} p-3`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/25">{k.label}</span>
                          </div>
                          <span className={`text-[8px] font-black ${k.up ? 'text-emerald-400' : 'text-rose-400'}`}>{k.pct}</span>
                        </div>
                        <span className="text-sm md:text-base font-black text-white">{k.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart + table row */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3 min-h-0">
                    {/* Bar chart */}
                    <div className="md:col-span-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 flex flex-col">
                      <div className="flex items-center justify-between mb-3 shrink-0">
                        <div>
                          <div className="h-2 w-24 rounded-full bg-white/10 mb-1" />
                          <div className="h-1.5 w-16 rounded-full bg-white/[0.05]" />
                        </div>
                        <div className="flex gap-1.5">
                          {['bg-indigo-500/20', 'bg-white/[0.04]', 'bg-white/[0.04]'].map((c, i) => (
                            <div key={i} className={`h-5 w-10 rounded-lg ${c} border border-white/[0.07]`} />
                          ))}
                        </div>
                      </div>
                      {/* Bars */}
                      <div className="flex items-end gap-1.5 flex-1">
                        {[35, 60, 42, 78, 52, 88, 65, 45, 70, 55, 92, 48].map((h, i) => (
                          <div key={i} className="flex-1 flex flex-col gap-1">
                            <div
                              className={`w-full rounded-t-sm bar-rise ${i === 6 ? 'bg-gradient-to-t from-indigo-600 to-violet-500' : 'bg-white/[0.07]'}`}
                              style={{ height: `${h}%`, animationDelay: `${i * 0.07}s` }}
                            />
                          </div>
                        ))}
                      </div>
                      {/* X axis */}
                      <div className="flex gap-1.5 mt-1.5 shrink-0">
                        {['E','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => (
                          <div key={i} className="flex-1 text-center">
                            <span className="text-[7px] font-black text-white/15">{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right column: mini pie + table rows */}
                    <div className="md:col-span-2 flex flex-col gap-3">
                      {/* Mini pie donut placeholder */}
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 flex items-center gap-3">
                        <div className="relative w-12 h-12 shrink-0">
                          <svg viewBox="0 0 36 36" className="rotate-[-90deg]">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#4f46e5" strokeWidth="5" strokeDasharray="55 45" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#8b5cf6" strokeWidth="5" strokeDasharray="25 75" strokeDashoffset="-55" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" strokeWidth="5" strokeDasharray="20 80" strokeDashoffset="-80" />
                          </svg>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          {[
                            { label: 'Detal', w: 'w-14', color: 'bg-indigo-500' },
                            { label: 'Mayor', w: 'w-9',  color: 'bg-violet-500' },
                            { label: 'CxC',   w: 'w-7',  color: 'bg-emerald-500' },
                          ].map(r => (
                            <div key={r.label} className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${r.color} shrink-0`} />
                              <span className="text-[8px] text-white/20 font-bold">{r.label}</span>
                              <div className={`h-1 rounded-full ${r.color}/30 ${r.w}`} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rows table mock */}
                      <div className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/[0.05] bg-white/[0.02] flex gap-2">
                          {[40, 20, 24].map((w, i) => <div key={i} className="h-1.5 rounded-full bg-white/10" style={{ width: w }} />)}
                        </div>
                        {[
                          ['bg-indigo-400/60', 'bg-white/[0.06]', 'bg-emerald-500/40'],
                          ['bg-violet-400/60', 'bg-white/[0.06]', 'bg-emerald-500/40'],
                          ['bg-sky-400/60',    'bg-white/[0.06]', 'bg-amber-500/40'],
                          ['bg-amber-400/60',  'bg-white/[0.06]', 'bg-rose-500/40'],
                        ].map((cols, i) => (
                          <div key={i} className="px-3 py-2 border-b border-white/[0.04] flex gap-2 items-center">
                            <div className={`w-4 h-4 rounded-md ${cols[0]} shrink-0`} />
                            <div className={`h-1.5 rounded-full flex-1 ${cols[1]}`} />
                            <div className={`h-4 w-10 rounded-md ${cols[2]}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Play overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-black/40 backdrop-blur-[3px] group-hover:bg-black/50 transition-all">
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.4)] group-hover:scale-110 group-hover:shadow-[0_0_80px_rgba(99,102,241,0.6)] transition-all duration-300">
                  <Play size={30} className="text-white ml-1.5 fill-white" />
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/80">Ver Demostración</p>
                  <p className="text-[9px] font-bold text-white/30 mt-1 uppercase tracking-widest">Clic para reproducir</p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature pills */}
          <div data-reveal className="flex flex-wrap justify-center gap-3 mt-10">
            {['POS en acción', 'BCV en tiempo real', 'Modo Offline', 'Inventario Paginado', 'Dashboard IA', 'CSV Import Tasas', 'OCR Automático', 'Historial Colaborativo'].map(f => (
              <span key={f} className="px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-white/30">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Demo modal */}
        {demoOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={() => setDemoOpen(false)}
          >
            <div
              className="relative w-full max-w-4xl aspect-video bg-[#0d1424] rounded-3xl border border-white/10 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)]"
              onClick={e => e.stopPropagation()}
            >
              {/* Glow */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 relative z-10">
                <div className="w-20 h-20 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <Play size={28} className="text-indigo-400 ml-1 fill-indigo-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-black text-2xl mb-3 tracking-tight">Demo en preparación</p>
                  <p className="text-white/30 text-sm max-w-sm leading-relaxed">
                    Estamos grabando el video demostrativo oficial del sistema.<br />
                    Estará disponible muy pronto.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/register')}
                  className="mt-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
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

            {/* POS HERO */}
            <div data-reveal className="md:col-span-8 relative rounded-[3rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 p-12 overflow-hidden group cursor-default">
              <div className="absolute top-0 right-0 p-8 opacity-[0.08] group-hover:scale-110 group-hover:rotate-6 transition-all duration-1000">
                <ShoppingCart size={280} />
              </div>
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
                  Scanner de códigos por cámara, multi-pago (USD/BS/Transferencia/Mixto), cambio automático, consumidor final, recibos digitales y <strong className="text-white/80">modo offline</strong>.
                </p>
                <div className="flex flex-wrap gap-3">
                  {['BCV Automático', 'Multi-pago', 'Ticket Digital', 'Modo Offline', 'Búsqueda por nombre'].map(tag => (
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
                  Kardex en tiempo real, precios detal/mayor independientes, alertas de stock mínimo, paginación y Sugerencia Dualis de margen.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Alertas', 'Smart Advisor'].map(t => (
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

            {/* TASAS BCV — WIDE */}
            <div data-reveal className="md:col-span-8 rounded-[3rem] bg-[#1a1200] border border-amber-500/20 p-12 flex flex-col md:flex-row gap-10 items-center group hover:border-amber-500/40 transition-colors">
              <div className="flex-1">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-8 border border-amber-500/20">
                  <TrendingUp size={26} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/40 text-base leading-relaxed max-w-md">
                  Búsqueda automática desde el BCV oficial con confirmación del usuario. Historial colaborativo con soporte OCR e importación CSV masiva para datos históricos.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Fetch Automático', 'OCR de Imágenes', 'CSV Import', 'Propagación Instantánea'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest border border-amber-500/15">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-64 space-y-3.5 shrink-0">
                {[
                  { label: 'Tasa BCV Oficial', value: '36.50 Bs/$', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                  { label: 'Tasa Grupo',        value: '38.00 Bs/$', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                  { label: 'Fuente',            value: 'BCV.ORG.VE', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                  { label: 'Último update',     value: 'Hoy, 08:00', color: 'text-white/30', bg: 'bg-white/5', border: 'border-white/10' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-5 py-3.5 rounded-2xl ${r.bg} border ${r.border}`}>
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
              14 módulos.<br />
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
                {i < 2 && <ChevronRight size={28} className="hidden md:block absolute top-1/2 -right-6 -translate-y-1/2 text-white/10 z-10" />}
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
              { role: 'Owner',   desc: 'Acceso total',      color: 'bg-indigo-600',  glow: 'shadow-indigo-500/30' },
              { role: 'Admin',   desc: 'Gestión completa',  color: 'bg-violet-600',  glow: 'shadow-violet-500/30' },
              { role: 'Ventas',  desc: 'Solo POS',          color: 'bg-sky-600',     glow: 'shadow-sky-500/30' },
              { role: 'Auditor', desc: 'Solo lectura',      color: 'bg-emerald-600', glow: 'shadow-emerald-500/30' },
              { role: 'Staff',   desc: 'Limitado',          color: 'bg-amber-600',   glow: 'shadow-amber-500/30' },
              { role: 'Miembro', desc: 'Pendiente',         color: 'bg-slate-700',   glow: '' },
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
                onClick={() => scrollTo(demoRef)}
                className="px-14 py-6 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
              >
                <Play size={16} className="fill-white" /> Ver Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] py-20 bg-[#020509]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
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

            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Soluciones</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'POS Cloud',       action: () => scrollTo(featuresRef) },
                  { label: 'Inventario',       action: () => scrollTo(featuresRef) },
                  { label: 'Finanzas',         action: () => scrollTo(modulesRef) },
                  { label: 'RRHH & Nómina',   action: () => scrollTo(modulesRef) },
                  { label: 'VisionLab IA',    action: () => scrollTo(featuresRef) },
                  { label: 'Tasas BCV Live',  action: () => scrollTo(featuresRef) },
                ].map(item => (
                  <button key={item.label} onClick={item.action} className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Sistema</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Demo',              action: () => scrollTo(demoRef) },
                  { label: 'Seguridad',         action: () => scrollTo(securityRef) },
                  { label: 'Cómo funciona',     action: () => scrollTo(stepsRef) },
                  { label: 'Todos los módulos', action: () => scrollTo(modulesRef) },
                  { label: 'Entrar',            action: () => navigate('/login') },
                  { label: 'Registrarse',       action: () => navigate('/register') },
                ].map(item => (
                  <button key={item.label} onClick={item.action} className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Legal</h5>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Términos de Uso', action: () => navigate('/terms') },
                  { label: 'Privacidad',      action: () => navigate('/privacy') },
                  { label: 'Soporte',         action: () => navigate('/login') },
                ].map(item => (
                  <button key={item.label} onClick={item.action} className="text-[11px] font-bold text-white/30 hover:text-white transition-colors text-left uppercase tracking-widest">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
              © 2026 Dualis ERP — Inteligencia de Negocio para Venezuela
            </p>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-500/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                Todos los sistemas operativos
              </span>
              <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">v2.1</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
