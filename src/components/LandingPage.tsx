import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, Zap, Sparkles, Shield, Globe,
  ShoppingCart, Package, Cpu, Fingerprint, TrendingUp,
  FileText, Layers, Rocket, Users, BookOpen, Landmark, Monitor,
  MessageSquare, CheckCircle2, Lock, RefreshCw, Star,
  ChevronRight, BadgeDollarSign, Building2,
  Activity, PieChart, Play, X, WifiOff,
  History, ShieldCheck, Wifi, FileSpreadsheet,
  ScanLine, ArrowUpRight, Check, Minus, Crown, MapPin, Mail,
  HelpCircle, Webhook, Sliders, Brain, DollarSign, Receipt,
  ChevronDown, Banknote, Calculator, ClipboardList, Bell,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

// ─── DATA ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: '14+',    label: 'Módulos integrados' },
  { value: '100%',   label: 'Cloud & tiempo real' },
  { value: '$0',     label: 'Infraestructura propia' },
  { value: '30d',    label: 'Prueba sin tarjeta' },
];

const MODULES = [
  { icon: ShoppingCart, label: 'POS Detal',         desc: 'Ventas físicas con escáner, multi-pago, modo offline y ticket digital.',          color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: Building2,    label: 'POS Mayor',          desc: 'Terminal mayorista con crédito 15/30/45 días y precios escalonados.',              color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  { icon: FileText,     label: 'CxC / Clientes',     desc: 'Cuentas por cobrar, historial completo y seguimiento de deudas en USD y Bs.',     color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,       label: 'CxP / Proveedores',  desc: 'Cuentas por pagar, gastos y relación completa con tus proveedores.',             color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,     label: 'Contabilidad',        desc: 'Libro diario, mayor y balance automático integrado con todas las operaciones.',   color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark,     label: 'Conciliación',        desc: 'Conciliación bancaria con importación CSV y exportación de reportes.',           color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,      label: 'Inventario Pro',      desc: 'Kardex, alertas de stock mínimo, paginación y Smart Advisor de margen.',         color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Monitor,      label: 'Cajas / Terminales',  desc: 'Gestión de turnos, arqueo con reporte Z y auditoría por cajero.',               color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Users,        label: 'RRHH & Nómina',       desc: 'Empleados, nómina, adelantos, vacaciones y recibos de pago automáticos.',        color: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  { icon: Sparkles,     label: 'VisionLab IA',        desc: 'Gemini analiza tu negocio: P&L, Cash Flow, alertas y predicciones.',            color: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: BarChart3,    label: 'Reportes',            desc: 'KPIs, comisiones por vendedor, P&L y exportación Excel/PDF.',                   color: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  { icon: History,      label: 'Rate History Wall',   desc: 'Historial colaborativo de tasas con fetch BCV, OCR e importación CSV masiva.',   color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  { icon: TrendingUp,   label: 'Tasas BCV Live',      desc: 'Tasa oficial + grupo propio. Propagación instantánea a todos los terminales.',   color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  { icon: ShieldCheck,  label: 'Audit Logs',          desc: 'Kardex de auditoría inmutable: quién hizo qué y cuándo. Export PDF/CSV/Excel.', color: 'text-rose-400',   bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  { icon: HelpCircle,   label: 'Centro de Ayuda',     desc: 'Wiki integrado con instrucciones de cada botón, flujo y concepto del sistema.',  color: 'text-teal-400',   bg: 'bg-teal-500/10',    border: 'border-teal-500/20' },
  { icon: Sliders,      label: 'Config. Avanzada',    desc: 'IVA, IGTF, roles y permisos por usuario, apariencia y módulos activables.',     color: 'text-slate-400',  bg: 'bg-slate-500/10',   border: 'border-slate-500/20' },
];

const NEW_FEATURES = [
  {
    icon: Users,
    color: 'indigo',
    title: 'Roles y Permisos Configurables',
    desc: 'Define exactamente qué secciones puede ver cada rol: Cajero, Vendedor, Contador, Auditor. Presets listos o configura cada toggle manualmente.',
    tags: ['Ventas', 'Auditor', 'Staff', 'Cajero', 'Presets'],
  },
  {
    icon: Webhook,
    color: 'violet',
    title: 'Webhooks & Automatización',
    desc: 'Conecta Dualis con n8n, Zapier o tu backend. Dispara eventos automáticos en ventas, anulaciones, pagos, clientes nuevos y cierres de turno.',
    tags: ['sale.created', 'shift.closed', 'payment.received', 'n8n', 'Zapier'],
  },
  {
    icon: Sliders,
    color: 'sky',
    title: 'Personalización por Empresa',
    desc: 'CSS personalizado, configuración declarativa y code registry para añadir funciones exclusivas a un cliente sin tocar el resto del sistema.',
    tags: ['CSS Inject', 'UI Config', 'Per-company', 'Registry'],
  },
  {
    icon: HelpCircle,
    color: 'teal',
    title: 'Centro de Ayuda Integrado',
    desc: 'Wiki completa con 14 categorías: instrucciones de cada botón, estados vacíos, conceptos y flujos. Hasta un niño puede llevar las cuentas.',
    tags: ['14 categorías', 'Búsqueda', 'FAQ', 'Flujos guiados'],
  },
  {
    icon: Calculator,
    color: 'amber',
    title: 'Arqueo de Caja (Reporte Z)',
    desc: 'Conteo físico por denominaciones, comparación con el sistema y generación automática del Reporte Z al cierre de turno.',
    tags: ['Reporte Z', 'Varianza', 'Por turno', 'PDF'],
  },
  {
    icon: Brain,
    color: 'purple',
    title: 'Chat con IA en Español',
    desc: 'Hazle preguntas directas a Gemini sobre tu negocio: ventas del día, clientes con más deuda, productos más vendidos y predicciones.',
    tags: ['Gemini', 'Español', 'P&L', 'Predicciones'],
  },
];

const FAQ_ITEMS = [
  { q: '¿Funciona para empresas venezolanas?', a: 'Sí, está diseñado 100% para Venezuela. Maneja USD y bolívares, IVA 16%, IGTF 3%, tasa BCV oficial, y próximamente libros SENIAT.' },
  { q: '¿Mis datos están seguros?', a: 'Dualis usa Firebase de Google con cifrado en tránsito y en reposo. Tus datos están aislados de otras empresas — nadie más puede acceder a ellos.' },
  { q: '¿Puedo usar Dualis sin internet?', a: 'El POS Detal tiene modo offline. Las ventas se guardan localmente y sincronizan al reconectar. Los demás módulos requieren conexión.' },
  { q: '¿Cuántos usuarios puedo tener?', a: 'Depende del plan. Starter incluye 2 usuarios, Negocio 5 y Enterprise ilimitados. Puedes agregar usuarios extra por $3/mes cada uno.' },
  { q: '¿Puedo exportar mis datos?', a: 'Sí. Casi todos los módulos permiten exportar en Excel, PDF o CSV: inventario, CxC, reportes, auditoría, nómina y más.' },
  { q: '¿Necesito tarjeta para la prueba?', a: 'No. Los 30 días de prueba son completamente gratis y sin tarjeta de crédito. Solo necesitas registrarte con tu email.' },
  { q: '¿Qué pasa al terminar los 30 días?', a: 'Puedes elegir un plan de pago para continuar. Tus datos se conservan durante 30 días adicionales después de la expiración.' },
  { q: '¿Hay soporte en español?', a: 'Sí. Soporte completo en español vía WhatsApp y email. Los planes Negocio y Enterprise incluyen soporte prioritario.' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nómina',
  'Inventario Pro', 'VisionLab IA', 'CxC & CxP', 'Conciliación Bancaria',
  'Multi-moneda USD/VES', 'Roles & Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Modo Offline POS', 'Webhooks Automáticos', 'Arqueo de Caja', 'Reporte Z',
  'Centro de Ayuda', 'Smart Advisor', 'Google Gemini IA', 'Config por empresa',
];

const COLOR_MAP: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  indigo: { text: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25',  glow: 'rgba(99,102,241,.3)'  },
  violet: { text: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  glow: 'rgba(139,92,246,.3)'  },
  sky:    { text: 'text-sky-400',    bg: 'bg-sky-500/10',     border: 'border-sky-500/25',     glow: 'rgba(14,165,233,.25)' },
  teal:   { text: 'text-teal-400',   bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    glow: 'rgba(20,184,166,.25)' },
  amber:  { text: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   glow: 'rgba(245,158,11,.25)' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  glow: 'rgba(168,85,247,.25)' },
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [bcvRate, setBcvRate]   = useState<string | null>(null);
  const [openFaq, setOpenFaq]   = useState<number | null>(null);
  const [pricingAnnual, setPricingAnnual] = useState(false);

  // Custom plan builder
  const [customBase, setCustomBase]                   = useState<'starter' | 'negocio' | 'enterprise'>('negocio');
  const [customExtraUsers, setCustomExtraUsers]       = useState(0);
  const [customExtraProducts, setCustomExtraProducts] = useState(0);
  const [customExtraSucursales, setCustomExtraSucursales] = useState(0);
  const [customVision, setCustomVision]       = useState(false);
  const [customConciliacion, setCustomConciliacion] = useState(false);
  const [customRRHH, setCustomRRHH]           = useState(false);
  const [customTasas, setCustomTasas]         = useState(false);
  const [customWhatsapp, setCustomWhatsapp]   = useState(false);
  const [customBackup, setCustomBackup]       = useState(false);

  const BASE_PRICES = { starter: 24, negocio: 49, enterprise: 89 } as const;
  const customTotal = (() => {
    const base  = pricingAnnual ? Math.round(BASE_PRICES[customBase] * 0.8) : BASE_PRICES[customBase];
    const extra = customExtraUsers * 3 + customExtraProducts * 5 + customExtraSucursales * 9
                + (customVision        && customBase !== 'enterprise' ? 19 : 0)
                + (customConciliacion  && customBase !== 'enterprise' ? 12 : 0)
                + (customRRHH         && customBase !== 'enterprise' ? 15 : 0)
                + (customTasas        ? 4 : 0)
                + (customWhatsapp     ? 6 : 0)
                + (customBackup       ? 3 : 0);
    return base + extra;
  })();

  const heroRef     = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef  = useRef<HTMLElement>(null);
  const pricingRef  = useRef<HTMLElement>(null);
  const faqRef      = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }),
      { threshold: 0.07 }
    );
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); };
  }, []);

  useEffect(() => {
    fetch('https://ve.dolarapi.com/v1/dolares')
      .then(r => r.json())
      .then((data: any) => {
        const list  = Array.isArray(data) ? data : [data];
        const entry = list.find((d: any) =>
          d?.fuente === 'oficial' || d?.fuente === 'bcv' ||
          String(d?.fuente ?? '').toLowerCase().includes('oficial') ||
          String(d?.nombre ?? '').toLowerCase().includes('bcv')
        ) ?? list[0];
        const rate = Number(entry?.venta ?? entry?.promedio ?? entry?.precio ?? entry?.compra);
        if (rate && !isNaN(rate)) setBcvRate(rate.toFixed(2));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#020710] text-white overflow-x-hidden selection:bg-indigo-600/80">
      <style>{`
        @keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes gradx     { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float-y   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes shimmer   { from{background-position:-200% 0} to{background-position:200% 0} }
        @keyframes fade-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }

        .ticker-track      { animation:ticker 50s linear infinite; }
        .ticker-track:hover{ animation-play-state:paused; }
        .animate-gradient  { background-size:200% 200%; animation:gradx 6s ease infinite; }
        .float-a           { animation:float-y 5s ease-in-out infinite; }
        .float-b           { animation:float-y 6.5s ease-in-out infinite; animation-delay:-2s; }
        .float-c           { animation:float-y 4.5s ease-in-out infinite; animation-delay:-1s; }
        .pulse-dot         { animation:pulse-dot 2s ease-in-out infinite; }

        [data-reveal]            { opacity:0; transform:translateY(24px); transition:opacity .6s ease,transform .6s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.07s}
        [data-reveal]:nth-child(3){transition-delay:.14s}
        [data-reveal]:nth-child(4){transition-delay:.21s}
        [data-reveal]:nth-child(5){transition-delay:.28s}
        [data-reveal]:nth-child(6){transition-delay:.35s}

        .glass { background:rgba(255,255,255,0.03); backdrop-filter:blur(20px); }
        .glow-indigo { box-shadow:0 0 100px -30px rgba(99,102,241,.4); }
        .gradient-border { position:relative; }
        .gradient-border::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(99,102,241,.35),rgba(139,92,246,.1),rgba(99,102,241,.05)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .shimmer { background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 3s infinite; }
      `}</style>

      {/* ── TOP BANNER ──────────────────────────────────────────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-[110] bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 py-2 px-4">
        <div className="flex items-center justify-center gap-3 flex-wrap text-center">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70">🚀 Lanzamiento Beta</span>
          <span className="text-white/30 hidden sm:inline">·</span>
          <span className="text-[10px] font-black text-white">30 días gratis · Sin tarjeta de crédito</span>
          <span className="text-white/30 hidden sm:inline">·</span>
          <span className="text-[10px] font-black text-amber-300 hidden sm:inline">Desarrollo a medida desde $25/hr</span>
          <button
            onClick={() => navigate('/register')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[9px] font-black uppercase tracking-widest transition-all"
          >
            Registrarme <ArrowRight size={10} />
          </button>
        </div>
      </div>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────────── */}
      <nav className={`fixed inset-x-0 z-[100] transition-all duration-500 top-[30px] ${
        scrolled ? 'bg-[#020710]/85 backdrop-blur-2xl border-b border-white/[0.06] py-3' : 'bg-transparent py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-7 w-auto" textClassName="text-white" />
          </div>

          <div className="hidden lg:flex items-center gap-0.5">
            {[
              { label: 'Funcionalidades', ref: featuresRef },
              { label: 'Módulos',         ref: modulesRef  },
              { label: 'Precios',         ref: pricingRef  },
              { label: 'FAQ',             ref: faqRef      },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => scrollTo(item.ref)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white hover:bg-white/[0.05] transition-all"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:block px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              Entrar
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 30px -8px rgba(99,102,241,.6)' }}
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-40 pb-24 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,.5) 0%, rgba(139,92,246,.2) 40%, transparent 70%)' }} />
          <div className="absolute top-32 right-[10%] w-64 h-64 rounded-full opacity-10"
            style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,.8), transparent 70%)' }} />
        </div>

        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          {/* Live BCV badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur mb-8"
            style={{ animation: 'fade-up .6s ease both' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">BCV en vivo</span>
            <span className="text-[10px] font-black text-emerald-400">
              {bcvRate ? `${bcvRate} Bs/$` : 'cargando...'}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-black text-white/40">Multi-moneda USD/VES</span>
          </div>

          {/* Heading */}
          <h1 className="text-6xl md:text-8xl font-black tracking-[-0.04em] leading-[0.9] mb-6"
            style={{ animation: 'fade-up .7s ease .1s both' }}>
            <span className="text-white">El ERP que</span><br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent animate-gradient">
              Venezuela necesitaba
            </span>
          </h1>

          <p className="text-lg text-white/35 font-medium max-w-2xl mx-auto leading-relaxed mb-10"
            style={{ animation: 'fade-up .7s ease .2s both' }}>
            POS Detal + Mayor, inventario, CxC, CxP, RRHH, contabilidad, tasas BCV en vivo e IA —
            todo integrado en un solo sistema. En bolívares y dólares.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
            style={{ animation: 'fade-up .7s ease .3s both' }}>
            <button
              onClick={() => navigate('/register')}
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-1 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 20px 60px -15px rgba(99,102,241,.6)' }}
            >
              Empezar 30 días gratis <ArrowRight size={16} />
            </button>
            <button
              onClick={() => scrollTo(featuresRef)}
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white/40 hover:text-white border border-white/[0.08] hover:border-white/[0.2] transition-all"
            >
              Ver funciones <ChevronRight size={16} />
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto"
            style={{ animation: 'fade-up .7s ease .4s both' }}>
            {STATS.map(s => (
              <div key={s.label} className="px-4 py-3 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-[9px] font-bold text-white/25 uppercase tracking-widest mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER ──────────────────────────────────────────────────────────────── */}
      <div className="py-5 border-y border-white/[0.05] overflow-hidden select-none">
        <div className="ticker-track flex gap-8" style={{ width: 'max-content' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span key={i} className="flex items-center gap-8 whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20">{t}</span>
              <span className="w-1 h-1 rounded-full bg-indigo-500/40" />
            </span>
          ))}
        </div>
      </div>

      {/* ── BENTO FEATURES ──────────────────────────────────────────────────────── */}
      <section ref={featuresRef} className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Por qué Dualis</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              Todo lo que tu negocio<br />
              <span className="text-white/20">necesita, conectado.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-12 gap-5">

            {/* POS — col 8 */}
            <div data-reveal className="md:col-span-8 rounded-3xl border border-indigo-500/20 bg-[#07091a] p-10 relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
              <div className="absolute right-8 top-8 opacity-60 group-hover:opacity-100 transition-opacity float-a">
                <div className="w-52 h-36 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur p-4 text-left">
                  <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Venta registrada</div>
                  {[['Producto A x2', '$12.00'],['Producto B x1', '$8.50']].map(([n, v]) => (
                    <div key={n} className="flex justify-between text-[10px] mb-1.5">
                      <span className="text-white/50">{n}</span>
                      <span className="text-emerald-400 font-black">{v}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/[0.07] flex justify-between text-xs font-black">
                    <span className="text-white/30">Total</span>
                    <span className="text-white">$20.50</span>
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-6 border border-indigo-500/20">
                <ShoppingCart size={22} className="text-indigo-400" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 tracking-tight">POS Detal + Mayor</h3>
              <p className="text-white/30 text-base leading-relaxed max-w-md">
                Terminal de venta al contado y al crédito. Escáner de códigos de barras por cámara, modo offline, multi-pago, IGTF automático y ticket digital.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Offline Mode', 'Escáner QR', 'Multi-pago', 'Ticket 80mm', 'Crédito 15/30/45d'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 text-[9px] font-black uppercase tracking-widest text-indigo-400">{t}</span>
                ))}
              </div>
            </div>

            {/* VisionLab — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl border border-violet-500/20 bg-[#0d0718] p-10 flex flex-col justify-between group hover:border-violet-500/40 transition-colors">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-6 border border-violet-500/20">
                  <Brain size={22} className="text-violet-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">VisionLab IA</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Gemini analiza tus datos y responde preguntas en español: "¿Cuál fue mi mejor día de ventas?", P&L automático, alertas de anomalías.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-2 text-[10px] font-black text-violet-400 uppercase tracking-widest">
                <Sparkles size={13} /> Powered by Google Gemini
              </div>
            </div>

            {/* Inventario — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-[#071309] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <Package size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Kardex en tiempo real, precios detal/mayor independientes, alertas de stock y Smart Advisor de margen óptimo.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Alertas', 'Smart Advisor'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-black uppercase tracking-widest text-emerald-400">{t}</span>
                ))}
              </div>
            </div>

            {/* Finanzas — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-[#071309] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/40 transition-colors">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <BadgeDollarSign size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Finanzas 360°</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  CxC, CxP, Contabilidad, Conciliación bancaria y Comparación de libros. Todo conectado y auditado.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                {['CxC', 'CxP', 'Contab.', 'Conciliac.'].map(t => (
                  <div key={t} className="flex items-center gap-1.5"><CheckCircle2 size={10} />{t}</div>
                ))}
              </div>
            </div>

            {/* RRHH — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-[#04101a] border border-sky-500/20 p-10 flex flex-col justify-between group hover:border-sky-500/40 transition-colors">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center mb-6 border border-sky-500/20">
                  <Users size={22} className="text-sky-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">RRHH & Nómina</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Empleados, nómina con adelantos descontados automáticamente, contratos y recibos en USD y Bs.
                </p>
              </div>
              <div className="mt-8 flex items-center gap-2 text-[10px] font-black text-sky-400 uppercase tracking-widest">
                <Users size={13} /> Equipo sin límites
              </div>
            </div>

            {/* Tasas BCV — col 8 */}
            <div data-reveal className="md:col-span-8 rounded-3xl bg-[#130e02] border border-amber-500/20 p-10 flex flex-col md:flex-row gap-8 items-center group hover:border-amber-500/40 transition-colors">
              <div className="flex-1">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-6 border border-amber-500/20">
                  <TrendingUp size={22} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/30 text-sm leading-relaxed max-w-md">
                  Fetch automático desde el BCV oficial, historial colaborativo con soporte OCR e importación CSV masiva para meses de históricos.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Fetch Automático', 'OCR Imágenes', 'CSV Import', 'Propagación Instant.'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15 text-[9px] font-black uppercase tracking-widest text-amber-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-52 space-y-2 shrink-0">
                {[
                  { label: 'BCV Oficial', value: bcvRate ? `${bcvRate} Bs/$` : '...', c: 'text-amber-400',   bg: 'bg-amber-500/10',   b: 'border-amber-500/20'   },
                  { label: 'Grupo',       value: '— Bs/$',  c: 'text-orange-400',  bg: 'bg-orange-500/10',  b: 'border-orange-500/20'  },
                  { label: 'Fuente',      value: 'BCV.ORG', c: 'text-emerald-400', bg: 'bg-emerald-500/10', b: 'border-emerald-500/20' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${r.bg} border ${r.b}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{r.label}</span>
                    <span className={`text-xs font-black ${r.c}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── NOVEDADES ───────────────────────────────────────────────────────────── */}
      <section className="py-32 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-5">
              <Zap size={11} className="text-violet-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-violet-400">Lo más nuevo</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              Nuevas funciones<br />
              <span className="text-white/20">que cambian el juego.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {NEW_FEATURES.map((f, i) => {
              const c = COLOR_MAP[f.color];
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  data-reveal
                  className={`rounded-3xl border ${c.border} p-8 flex flex-col gap-5 group hover:shadow-lg transition-all`}
                  style={{ background: 'rgba(255,255,255,0.02)', transition: 'box-shadow .3s', boxShadow: `0 0 0 0 ${c.glow}` }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 60px -20px ${c.glow}`)}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 0 0 0 ${c.glow}`)}
                >
                  <div className={`h-11 w-11 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center`}>
                    <Icon size={20} className={c.text} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white mb-2 tracking-tight">{f.title}</h3>
                    <p className="text-white/30 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {f.tags.map(t => (
                      <span key={t} className={`px-2.5 py-1 rounded-lg ${c.bg} border ${c.border} text-[9px] font-black uppercase tracking-widest ${c.text}`}>{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ALL MODULES ─────────────────────────────────────────────────────────── */}
      <section ref={modulesRef} className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 block mb-4">Módulos del Sistema</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              16 módulos.<br /><span className="text-white/20">Un solo login.</span>
            </h2>
            <p className="text-white/25 text-base mt-5 max-w-lg mx-auto">Todos integrados y sincronizados en tiempo real. Cada acción en un módulo actualiza automáticamente los demás.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              return (
                <div
                  key={i}
                  data-reveal
                  className={`rounded-2xl border ${m.border} ${m.bg} p-5 group hover:brightness-125 transition-all cursor-default`}
                >
                  <div className={`h-9 w-9 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center mb-4`}>
                    <Icon size={17} className={m.color} />
                  </div>
                  <h4 className="text-sm font-black text-white mb-1.5">{m.label}</h4>
                  <p className="text-[11px] text-white/30 leading-relaxed">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECURITY ────────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-[#020508]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 block mb-4">Seguridad</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">Tus datos, solo tuyos.</h2>
            <p className="text-white/25 text-sm mt-4 max-w-xl mx-auto">Infraestructura de Google Firebase con cifrado en tránsito y en reposo. Reglas Firestore que aíslan completamente cada empresa.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Lock,         label: 'Cifrado TLS/AES',      desc: 'Todos los datos viajan y se guardan cifrados.' },
              { icon: ShieldCheck,  label: 'Reglas Firestore',     desc: 'Tu empresa no puede ver datos de otra nunca.' },
              { icon: Fingerprint,  label: 'Auth por Firebase',    desc: 'Autenticación segura con tokens JWT de Google.' },
              { icon: ClipboardList,label: 'Audit Log Inmutable',  desc: 'Cada acción queda registrada y no puede borrarse.' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} data-reveal className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] p-5 text-center">
                  <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/15 flex items-center justify-center mx-auto mb-4">
                    <Icon size={18} className="text-rose-400" />
                  </div>
                  <h4 className="text-xs font-black text-white mb-1.5">{item.label}</h4>
                  <p className="text-[10px] text-white/25 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────────── */}
      <section ref={pricingRef} className="py-32">
        <div className="max-w-7xl mx-auto px-6">

          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Planes</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white mb-6">
              Precio simple.<br /><span className="text-white/20">Sin sorpresas.</span>
            </h2>

            {/* Toggle anual/mensual */}
            <div className="inline-flex items-center gap-3 p-1 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <button
                onClick={() => setPricingAnnual(false)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  !pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'
                }`}
              >Mensual</button>
              <button
                onClick={() => setPricingAnnual(true)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'
                }`}
              >
                Anual
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black">−20%</span>
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-5 mb-16">
            {[
              {
                name: 'Starter', desc: 'Para comenzar y validar tu negocio.',
                priceMonthly: 24, fakeMonthly: 49,
                color: 'text-sky-400', border: 'border-sky-500/20', bg: 'bg-sky-500/[0.04]', glow: '',
                badge: null,
                features: [
                  { label: 'POS Detal completo', ok: true },
                  { label: 'Inventario básico (500 productos)', ok: true },
                  { label: 'CxC básica', ok: true },
                  { label: 'Tasas BCV manual', ok: true },
                  { label: '2 usuarios · 1 Sucursal', ok: true },
                  { label: 'Soporte por email', ok: true },
                  { label: 'POS Mayor', ok: false },
                  { label: 'RRHH & Nómina', ok: false },
                  { label: 'VisionLab IA', ok: false },
                ],
                cta: 'Empezar Starter',
                ctaStyle: { background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' },
              },
              {
                name: 'Negocio', desc: 'La mejor opción para la mayoría.',
                priceMonthly: 49, fakeMonthly: 99,
                color: 'text-indigo-400', border: 'border-indigo-500/40', bg: 'bg-indigo-500/[0.06]',
                glow: '0 0 80px -20px rgba(99,102,241,.35)',
                badge: 'Más Popular',
                features: [
                  { label: 'Todo lo del Starter', ok: true },
                  { label: 'POS Mayor (crédito 15/30/45d)', ok: true },
                  { label: 'Inventario Pro ilimitado', ok: true },
                  { label: 'CxC & CxP completo', ok: true },
                  { label: 'RRHH & Nómina básica', ok: true },
                  { label: 'Reportes + comisiones', ok: true },
                  { label: 'Tasas BCV automáticas', ok: true },
                  { label: '5 usuarios · 1 Sucursal extra', ok: true },
                  { label: 'VisionLab IA (add-on +$19)', ok: false },
                ],
                cta: 'Activar Negocio',
                ctaStyle: { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 40px -10px rgba(99,102,241,.5)' },
              },
              {
                name: 'Enterprise', desc: 'Poder total para operaciones exigentes.',
                priceMonthly: 89, fakeMonthly: 179,
                color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/[0.04]', glow: '',
                badge: null,
                features: [
                  { label: 'Todo lo del Negocio', ok: true },
                  { label: 'VisionLab IA (Gemini) incluido', ok: true },
                  { label: 'Contabilidad 360° + Conciliación', ok: true },
                  { label: 'Backup exportable (próximamente)', ok: true },
                  { label: 'Audit Logs inmutables', ok: true },
                  { label: '3 Sucursales + Usuarios ilimitados', ok: true },
                  { label: 'WhatsApp en recibos incluido', ok: true },
                  { label: 'Soporte prioritario 24/7', ok: true },
                  { label: 'Webhooks & automatización', ok: true },
                ],
                cta: 'Activar Enterprise',
                ctaStyle: { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' },
              },
            ].map(plan => {
              const price = pricingAnnual ? Math.round(plan.priceMonthly * 0.8) : plan.priceMonthly;
              const fake  = pricingAnnual ? Math.round(plan.fakeMonthly  * 0.8) : plan.fakeMonthly;
              return (
                <div
                  key={plan.name}
                  data-reveal
                  className={`relative rounded-3xl border ${plan.border} ${plan.bg} p-8 flex flex-col gradient-border`}
                  style={plan.glow ? { boxShadow: plan.glow } : undefined}
                >
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <div className="px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 30px -5px rgba(99,102,241,.6)' }}>
                        {plan.badge}
                      </div>
                    </div>
                  )}
                  <div className="mb-8">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.25em] ${plan.color} mb-3`}>{plan.name}</h3>
                    <p className="text-[11px] text-white/25 font-medium mb-6">{plan.desc}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-black text-white">${price}</span>
                      <div className="mb-1.5">
                        <span className="text-white/20 text-sm line-through block">${fake}</span>
                        <span className="text-white/25 text-[9px] font-bold">/mes</span>
                      </div>
                    </div>
                    {pricingAnnual && (
                      <p className="text-[10px] text-emerald-400 font-black mt-1.5">Ahorras ${(plan.fakeMonthly - price) * 12}/año</p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/register')}
                    className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 active:scale-95 mb-8"
                    style={plan.ctaStyle as React.CSSProperties}
                  >
                    {plan.cta}
                  </button>
                  <div className="flex flex-col gap-2.5 flex-1">
                    {plan.features.map(f => (
                      <div key={f.label} className="flex items-start gap-2.5">
                        {f.ok
                          ? <Check size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                          : <Minus size={12} className="text-white/15 mt-0.5 shrink-0" />}
                        <span className={`text-[11px] font-medium leading-tight ${f.ok ? 'text-white/50' : 'text-white/18'}`}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Custom Plan Builder ──────────────────────────────────────────────── */}
          <div data-reveal>
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-5">
                <Sparkles size={11} className="text-violet-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-400">Arma tu plan</span>
              </div>
              <h3 className="text-4xl font-black text-white tracking-tight">¿Necesitas algo diferente?</h3>
              <p className="text-white/25 text-sm mt-3">Elige tu base y agrega exactamente lo que necesitas.</p>
            </div>

            <div className="gradient-border rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 md:p-10">
              <div className="grid lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                  {/* Base */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Plan base</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'starter',    label: 'Starter',    price: pricingAnnual ? 19 : 24 },
                        { id: 'negocio',    label: 'Negocio',    price: pricingAnnual ? 39 : 49 },
                        { id: 'enterprise', label: 'Enterprise', price: pricingAnnual ? 71 : 89 },
                      ] as const).map(b => (
                        <button
                          key={b.id}
                          onClick={() => setCustomBase(b.id)}
                          className={`py-3 px-2 rounded-xl border text-center transition-all ${
                            customBase === b.id ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                          }`}
                        >
                          <p className={`text-[9px] font-black uppercase tracking-widest ${customBase === b.id ? 'text-indigo-400' : 'text-white/25'}`}>{b.label}</p>
                          <p className={`text-base font-black mt-0.5 ${customBase === b.id ? 'text-white' : 'text-white/20'}`}>${b.price}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sliders */}
                  {[
                    { label: 'Usuarios extra', value: customExtraUsers,       set: setCustomExtraUsers,       max: 20, price: 3,  base: 'Base: 2/5/∞' },
                    { label: 'Productos extra (bloques 1K)', value: customExtraProducts, set: setCustomExtraProducts, max: 10, price: 5, base: 'Base: 2,000' },
                    { label: 'Sucursales extra', value: customExtraSucursales, set: setCustomExtraSucursales,  max: 5,  price: 9,  base: 'Base: 1' },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25">{s.label}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-white/20">{s.base}</span>
                          <span className="text-xs font-black text-white/50">+{s.value} (+${s.value * s.price}/mes)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => s.set(Math.max(0, s.value - 1))}
                          className="w-7 h-7 rounded-lg border border-white/[0.1] bg-white/[0.04] text-white/40 hover:text-white transition-colors text-sm font-black flex items-center justify-center">−</button>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                            style={{ width: `${(s.value / s.max) * 100}%` }} />
                        </div>
                        <button onClick={() => s.set(Math.min(s.max, s.value + 1))}
                          className="w-7 h-7 rounded-lg border border-white/[0.1] bg-white/[0.04] text-white/40 hover:text-white transition-colors text-sm font-black flex items-center justify-center">+</button>
                      </div>
                    </div>
                  ))}

                  {/* Módulos */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Módulos adicionales</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Tasas BCV Automáticas',     state: customTasas,        set: setCustomTasas,        price: 4,  always: false },
                        { label: 'VisionLab IA (Gemini)',     state: customVision,       set: setCustomVision,       price: 19, always: customBase === 'enterprise' },
                        { label: 'Conciliación Bancaria',     state: customConciliacion, set: setCustomConciliacion, price: 12, always: customBase === 'enterprise' },
                        { label: 'RRHH & Nómina Pro',        state: customRRHH,         set: setCustomRRHH,         price: 15, always: customBase === 'enterprise' },
                        { label: 'WhatsApp en Recibos',       state: customWhatsapp,     set: setCustomWhatsapp,     price: 0,  always: true },
                        { label: 'Backup Exportable (próx.)', state: customBackup,       set: setCustomBackup,       price: 3,  always: false },
                      ].map(m => (
                        <div
                          key={m.label}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                            m.always || m.state ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                          onClick={() => !m.always && m.set(!m.state)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                              m.always || m.state ? 'border-indigo-400 bg-indigo-400' : 'border-white/20'
                            }`}>
                              {(m.always || m.state) && <Check size={8} className="text-white" />}
                            </div>
                            <span className={`text-[11px] font-bold ${m.always || m.state ? 'text-white/70' : 'text-white/30'}`}>{m.label}</span>
                          </div>
                          <span className={`text-[10px] font-black ${m.always ? 'text-emerald-400' : 'text-white/25'}`}>
                            {m.always ? 'incluido' : `+$${m.price}/MES`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="flex flex-col justify-between">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-white/[0.07]">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-1">Resumen de tu plan</p>
                        <p className="text-xl font-black text-white capitalize">{`Plan ${customBase}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-white/20 uppercase tracking-widest">/mes</p>
                        <p className="text-4xl font-black text-white">${customTotal}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-[11px]">
                      <div className="flex justify-between"><span className="text-white/30">Usuarios</span><span className="text-white/60 font-bold">{customBase === 'starter' ? 2 : customBase === 'negocio' ? 5 : '∞'} + {customExtraUsers} extra</span></div>
                      <div className="flex justify-between"><span className="text-white/30">Productos</span><span className="text-white/60 font-bold">{2000 + customExtraProducts * 1000}</span></div>
                      <div className="flex justify-between"><span className="text-white/30">Sucursales</span><span className="text-white/60 font-bold">{(customBase === 'enterprise' ? 3 : customBase === 'negocio' ? 2 : 1) + customExtraSucursales}</span></div>
                    </div>
                    <button
                      onClick={() => navigate('/register')}
                      className="w-full py-4 mt-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
                      style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 40px -10px rgba(99,102,241,.5)' }}
                    >
                      Empezar con este plan
                    </button>
                    <p className="text-center text-[10px] text-white/20 mt-2">14 días gratis · Sin tarjeta</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────────── */}
      <section ref={faqRef} className="py-32 bg-[#020508]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 block mb-4">FAQ</span>
            <h2 className="text-5xl font-black tracking-tight text-white">Preguntas frecuentes</h2>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                data-reveal
                className={`rounded-2xl border transition-all cursor-pointer ${
                  openFaq === i ? 'border-indigo-500/30 bg-indigo-500/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                }`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-sm font-bold text-white/70">{item.q}</span>
                  <ChevronDown size={16} className={`text-white/25 shrink-0 ml-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </div>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-white/40 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div data-reveal className="relative rounded-3xl border border-indigo-500/20 bg-[#07091a] p-16 overflow-hidden glow-indigo">
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,.15) 0%, transparent 65%)' }} />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-5">Empieza hoy</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white mb-6">
              Tu negocio merece<br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                herramientas reales.
              </span>
            </h2>
            <p className="text-white/30 text-base mb-10 max-w-xl mx-auto">
              30 días gratis. Sin tarjeta de crédito. Sin contratos. Cancela cuando quieras.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate('/register')}
                className="flex items-center gap-2.5 px-10 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-1 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 20px 60px -15px rgba(99,102,241,.7)' }}
              >
                Crear cuenta gratis <ArrowRight size={16} />
              </button>
              <a
                href="mailto:contacto@dualis.app"
                className="flex items-center gap-2.5 px-10 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white/35 hover:text-white border border-white/[0.08] hover:border-white/[0.2] transition-all"
              >
                <Mail size={15} /> Contactar ventas
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo className="h-7 w-auto mb-4" textClassName="text-white" />
              <p className="text-[11px] text-white/25 leading-relaxed">
                ERP para empresas venezolanas.<br />USD + VES · Firebase · IA integrada.
              </p>
            </div>
            {[
              {
                title: 'Producto',
                links: [
                  { label: 'Funcionalidades', action: () => scrollTo(featuresRef) },
                  { label: 'Módulos',         action: () => scrollTo(modulesRef)  },
                  { label: 'Precios',         action: () => scrollTo(pricingRef)  },
                  { label: 'Changelog',       action: () => {}                    },
                ],
              },
              {
                title: 'Empresa',
                links: [
                  { label: 'Acerca de',  action: () => {} },
                  { label: 'Contacto',   action: () => {} },
                  { label: 'Seguridad',  action: () => {} },
                ],
              },
              {
                title: 'Legal',
                links: [
                  { label: 'Términos de uso',    action: () => navigate('/terms')   },
                  { label: 'Privacidad',         action: () => navigate('/privacy') },
                ],
              },
            ].map(col => (
              <div key={col.title}>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-4">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l.label}>
                      <button onClick={l.action} className="text-[11px] text-white/30 hover:text-white transition-colors">{l.label}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-white/[0.05] gap-4">
            <p className="text-[10px] text-white/20">© 2025 Dualis ERP · Hecho con ♥ en Venezuela</p>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-white/15">Powered by</span>
              <span className="text-[10px] font-black text-white/25">Firebase</span>
              <span className="text-white/10">·</span>
              <span className="text-[10px] font-black text-white/25">Google Gemini</span>
              <span className="text-white/10">·</span>
              <span className="text-[10px] font-black text-white/25">Vercel</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
