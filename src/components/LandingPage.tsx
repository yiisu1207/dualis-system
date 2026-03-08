import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, Zap, Sparkles, Shield,
  ShoppingCart, Package, TrendingUp,
  FileText, Layers, Rocket, Users, BookOpen, Landmark, Monitor,
  CheckCircle2, Lock, RefreshCw, Star,
  ChevronRight, BadgeDollarSign, Building2,
  Activity, PieChart,
  History, ShieldCheck, Wifi, WifiOff,
  ScanLine, ArrowUpRight, Check, Minus, Crown, MapPin, Mail,
  HelpCircle, Webhook, Sliders, Brain, DollarSign, Receipt,
  ChevronDown, Banknote, Calculator, ClipboardList, Bell, X,
  Cpu, Fingerprint, MessageSquare, Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';

// ─── DATA ─────────────────────────────────────────────────────────────────────

const MODULES = [
  { icon: ShoppingCart, label: 'POS Detal',        desc: 'Ventas al contado, escáner, modo offline, ticket digital.',              color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: Building2,   label: 'POS Mayor',         desc: 'Terminal mayorista con crédito 15/30/45 días y precios escalonados.',    color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: FileText,    label: 'CxC / Clientes',    desc: 'Cuentas por cobrar, historial completo y deudas en USD y Bs.',           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,      label: 'CxP / Proveedores', desc: 'Cuentas por pagar y relación con proveedores.',                         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,    label: 'Contabilidad',      desc: 'Libro diario, mayor y balance automático integrado.',                    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark,    label: 'Conciliación',      desc: 'Conciliación bancaria con importación CSV.',                             color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,     label: 'Inventario Pro',    desc: 'Kardex, alertas de stock mínimo y Smart Advisor de margen.',             color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Monitor,     label: 'Cajas / Arqueo',    desc: 'Gestión de turnos, arqueo y reporte Z por cajero.',                     color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Users,       label: 'RRHH & Nómina',    desc: 'Empleados, nómina, adelantos, vacaciones y recibos.',                   color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Sparkles,    label: 'VisionLab IA',      desc: 'Gemini analiza tu negocio: P&L, Cash Flow, alertas.',                   color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: BarChart3,   label: 'Reportes',          desc: 'KPIs, comisiones por vendedor, P&L y exportación Excel/PDF.',           color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: History,     label: 'Rate History',      desc: 'Historial colaborativo de tasas con OCR e importación CSV masiva.',     color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: TrendingUp,  label: 'Tasas BCV Live',   desc: 'Tasa oficial + grupo propio. Propagación instantánea.',                  color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: ShieldCheck, label: 'Audit Logs',        desc: 'Kardex de auditoría inmutable. Export PDF/CSV/Excel.',                  color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  { icon: HelpCircle,  label: 'Centro de Ayuda',  desc: 'Wiki integrada con instrucciones de cada botón y flujo.',               color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
  { icon: Sliders,     label: 'Config. Avanzada', desc: 'IVA, IGTF, roles y permisos por usuario.',                              color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
];

const FAQ_ITEMS = [
  { q: '¿Funciona para empresas venezolanas?', a: 'Sí, está diseñado 100% para Venezuela. Maneja USD y bolívares, IVA 16%, IGTF 3%, tasa BCV oficial, y próximamente libros SENIAT.' },
  { q: '¿Mis datos están seguros?', a: 'Dualis usa Firebase de Google con cifrado en tránsito y en reposo. Tus datos están aislados de otras empresas — nadie más puede acceder a ellos.' },
  { q: '¿Puedo usar Dualis sin internet?', a: 'El POS Detal tiene modo offline. Las ventas se guardan localmente y sincronizan al reconectar. Los demás módulos requieren conexión.' },
  { q: '¿Cuántos usuarios puedo tener?', a: 'Starter: 2 usuarios. Negocio: 5 usuarios. Enterprise: ilimitados. Puedes agregar usuarios extra por $3/mes desde cualquier plan.' },
  { q: '¿Puedo exportar mis datos?', a: 'Sí. Inventario, CxC, reportes, auditoría y nómina se exportan en Excel, PDF o CSV desde cada módulo.' },
  { q: '¿Necesito tarjeta para la prueba?', a: 'No. Los 30 días de prueba son completamente gratis y sin tarjeta. Solo necesitas registrarte con tu email.' },
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

// ─── DEMO POS PRODUCTS ───────────────────────────────────────────────────────
const DEMO_PRODUCTS = [
  { id: 1, name: 'Aceite 1L',     price: 6.50, emoji: '🫙', color: 'amber'   },
  { id: 2, name: 'Pasta 500g',    price: 3.00, emoji: '🍝', color: 'yellow'  },
  { id: 3, name: 'Leche 1L',      price: 4.25, emoji: '🥛', color: 'sky'     },
  { id: 4, name: 'Pollo 1kg',     price: 7.80, emoji: '🍗', color: 'orange'  },
  { id: 5, name: 'Arroz 1kg',     price: 2.50, emoji: '🌾', color: 'emerald' },
  { id: 6, name: 'Jabón Caja',    price: 1.75, emoji: '🧼', color: 'violet'  },
];

// ─── PLAN COMPARISON TABLE ───────────────────────────────────────────────────
const COMPARE_ROWS = [
  { cat: 'Ventas', label: 'POS Detal (contado)',             s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'POS Mayor (crédito 15/30/45d)',   s: false,      n: true,           e: true       },
  { cat: 'Ventas', label: 'Descuentos y combos',             s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'IGTF e IVA automático',           s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'Ticket 80mm / WhatsApp',          s: true,       n: true,           e: true       },
  { cat: 'Finanzas', label: 'CxC — Cuentas por cobrar',      s: 'básica',   n: true,           e: true       },
  { cat: 'Finanzas', label: 'CxP — Proveedores',             s: false,      n: true,           e: true       },
  { cat: 'Finanzas', label: 'Contabilidad (libro + balance)', s: false,     n: true,           e: true       },
  { cat: 'Finanzas', label: 'Conciliación Bancaria',         s: false,      n: false,          e: true       },
  { cat: 'Inventario', label: 'Inventario + Kardex',         s: '500 prod', n: 'ilimitado',    e: 'ilimitado'},
  { cat: 'Inventario', label: 'Alertas de stock mínimo',     s: true,       n: true,           e: true       },
  { cat: 'Inventario', label: 'Smart Advisor de margen',     s: false,      n: true,           e: true       },
  { cat: 'Equipo', label: 'Usuarios',                        s: '2',        n: '5',            e: 'Ilimitados'},
  { cat: 'Equipo', label: 'Sucursales',                      s: '1',        n: '2',            e: '5'        },
  { cat: 'Equipo', label: 'Roles y permisos granulares',     s: false,      n: true,           e: true       },
  { cat: 'Equipo', label: 'RRHH & Nómina',                  s: false,      n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'Tasas BCV automáticas',   s: false,      n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'Reportes KPI + P&L',      s: 'básico',   n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'VisionLab IA (Gemini)',    s: false,      n: '+$19/mes',     e: true       },
  { cat: 'IA & Reportes', label: 'Comparar Libros',         s: false,      n: true,           e: true       },
  { cat: 'Seguridad', label: 'Audit Logs',                   s: false,      n: 'básico',       e: 'inmutable'},
  { cat: 'Seguridad', label: 'Webhooks & Automatización',    s: false,      n: false,          e: true       },
  { cat: 'Soporte', label: 'Canal de soporte',               s: 'Email',    n: 'WhatsApp',     e: 'Prioritario'},
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled]           = useState(false);
  const [bcvRate, setBcvRate]             = useState<string | null>(null);
  const [openFaq, setOpenFaq]             = useState<number | null>(null);
  const [pricingAnnual, setPricingAnnual] = useState(false);
  const [showCompare, setShowCompare]     = useState(false);
  const [activeCat, setActiveCat]         = useState('Todos');

  // Demo POS
  const [demoCart, setDemoCart]   = useState<Record<number, number>>({});
  const [demoPaid, setDemoPaid]   = useState(false);

  // Feedback
  const [showFeedback, setShowFeedback]   = useState(false);
  const [feedbackType, setFeedbackType]   = useState<'bug' | 'idea' | 'otro'>('bug');
  const [feedbackText, setFeedbackText]   = useState('');
  const [feedbackSent, setFeedbackSent]   = useState(false);

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
      { threshold: 0.07 },
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
          String(d?.nombre ?? '').toLowerCase().includes('bcv'),
        ) ?? list[0];
        const rate = Number(entry?.venta ?? entry?.promedio ?? entry?.precio ?? entry?.compra);
        if (rate && !isNaN(rate)) setBcvRate(rate.toFixed(2));
      })
      .catch(() => {});
  }, []);

  const price = (monthly: number) =>
    pricingAnnual ? Math.round(monthly * 0.8) : monthly;

  // Demo POS helpers
  const demoSubtotal = DEMO_PRODUCTS.reduce((s, p) => s + p.price * (demoCart[p.id] ?? 0), 0);
  const demoIva      = demoSubtotal * 0.16;
  const demoIgtf     = demoSubtotal * 0.03;
  const demoTotal    = demoSubtotal + demoIva + demoIgtf;
  const demoBs       = bcvRate ? demoTotal * parseFloat(bcvRate) : null;
  const demoItemCount = Object.values(demoCart).reduce((s, q) => s + q, 0);

  const addToDemo = (id: number) => setDemoCart(c => ({ ...c, [id]: Math.min((c[id] ?? 0) + 1, 99) }));
  const remFromDemo = (id: number) => setDemoCart(c => {
    const next = { ...c, [id]: (c[id] ?? 0) - 1 };
    if (next[id] <= 0) delete next[id];
    return next;
  });
  const resetDemo = () => { setDemoCart({}); setDemoPaid(false); };

  // Feedback submit — mailto fallback
  const sendFeedback = () => {
    if (!feedbackText.trim()) return;
    const subject = feedbackType === 'bug' ? '🐛 Bug en Dualis' : feedbackType === 'idea' ? '💡 Idea para Dualis' : '📩 Feedback Dualis';
    window.open(`mailto:yisus_xd77@hotmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackText)}`, '_blank');
    setFeedbackSent(true);
    setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setShowFeedback(false); }, 3000);
  };

  const CellVal = ({ val }: { val: boolean | string }) => {
    if (val === true)  return <Check size={15} className="text-emerald-400 mx-auto" />;
    if (val === false) return <Minus size={15} className="text-white/15 mx-auto" />;
    return <span className="text-[10px] font-black text-indigo-400 leading-tight">{val as string}</span>;
  };

  const cats = ['Todos', ...Array.from(new Set(COMPARE_ROWS.map(r => r.cat)))];
  const filteredRows = activeCat === 'Todos' ? COMPARE_ROWS : COMPARE_ROWS.filter(r => r.cat === activeCat);

  return (
    <div className="min-h-screen bg-[#020710] text-white overflow-x-hidden selection:bg-indigo-600/80">
      <style>{`
        @keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes gradx     { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float-y   { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(.5deg)} }
        @keyframes float-y2  { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-10px) rotate(-.4deg)} }
        @keyframes float-y3  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes shimmer   { from{background-position:-200% 0} to{background-position:200% 0} }
        @keyframes fade-up   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.6)} }
        @keyframes slide-in-r{ from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        @keyframes count-up  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow-pulse{ 0%,100%{box-shadow:0 0 40px -15px rgba(99,102,241,.4)} 50%{box-shadow:0 0 80px -10px rgba(99,102,241,.7)} }

        .ticker-track      { animation:ticker 55s linear infinite; }
        .ticker-track:hover{ animation-play-state:paused; }
        .animate-gradient  { background-size:200% 200%; animation:gradx 6s ease infinite; }
        .float-a           { animation:float-y  5s  ease-in-out infinite; }
        .float-b           { animation:float-y2 7s  ease-in-out infinite; animation-delay:-2.5s; }
        .float-c           { animation:float-y3 4.5s ease-in-out infinite; animation-delay:-1s; }
        .pulse-dot         { animation:pulse-dot 2s ease-in-out infinite; }
        .glow-hero         { animation:glow-pulse 4s ease-in-out infinite; }

        [data-reveal]            { opacity:0; transform:translateY(28px); transition:opacity .65s ease,transform .65s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.08s}
        [data-reveal]:nth-child(3){transition-delay:.16s}
        [data-reveal]:nth-child(4){transition-delay:.24s}
        [data-reveal]:nth-child(5){transition-delay:.32s}
        [data-reveal]:nth-child(6){transition-delay:.40s}

        .glass { background:rgba(255,255,255,0.03); backdrop-filter:blur(20px); }
        .glass-dark { background:rgba(2,7,16,0.7); backdrop-filter:blur(20px); }
        .gradient-border { position:relative; }
        .gradient-border::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(99,102,241,.4),rgba(139,92,246,.15),rgba(99,102,241,.06)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .shimmer { background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.06) 50%,transparent 100%); background-size:200% 100%; animation:shimmer 3s infinite; }

        .plan-card-popular { box-shadow:0 0 0 1px rgba(99,102,241,.5), 0 30px 80px -20px rgba(99,102,241,.4); }
        .notification-card { animation:slide-in-r .6s ease .8s both; }
        .sale-card         { animation:slide-in-r .6s ease 1.1s both; }
        .ai-card           { animation:slide-in-r .6s ease 1.4s both; }
      `}</style>

      {/* ── TOP BANNER ──────────────────────────────────────────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-[110] overflow-hidden">
        <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 py-2 px-4">
          <div className="absolute inset-0 shimmer" />
          <div className="relative flex items-center justify-center gap-4 flex-wrap text-center">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70">🚀 Beta Abierta</span>
            <span className="text-white/25 hidden sm:inline">·</span>
            <span className="text-[10px] font-black text-white">30 días gratis · Sin tarjeta · Sin contrato</span>
            <span className="text-white/25 hidden sm:inline">·</span>
            <span className="text-[10px] font-black text-amber-300 hidden sm:inline">Diseñado para Venezuela 🇻🇪</span>
            <button onClick={() => navigate('/register')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[9px] font-black uppercase tracking-widest transition-all">
              Comenzar <ArrowRight size={9} />
            </button>
          </div>
        </div>
      </div>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────────── */}
      <nav className={`fixed inset-x-0 z-[100] transition-all duration-500 top-[30px] ${
        scrolled ? 'bg-[#020710]/90 backdrop-blur-2xl border-b border-white/[0.06] py-3' : 'bg-transparent py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-7 w-auto" textClassName="text-white" />
          </div>

          <div className="hidden lg:flex items-center gap-0.5">
            {[
              { label: 'Funciones', ref: featuresRef },
              { label: 'Módulos',   ref: modulesRef  },
              { label: 'Precios',   ref: pricingRef  },
              { label: 'FAQ',       ref: faqRef      },
            ].map(item => (
              <button key={item.label} onClick={() => scrollTo(item.ref)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white hover:bg-white/[0.05] transition-all">
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {bcvRate && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                <span className="text-[9px] font-black text-amber-400">BCV {bcvRate}</span>
              </div>
            )}
            <button onClick={() => navigate('/login')}
              className="hidden sm:block px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/[0.06] transition-all">
              Entrar
            </button>
            <button onClick={() => navigate('/register')}
              className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 30px -8px rgba(99,102,241,.6)' }}>
              Empezar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-44 pb-24 overflow-hidden min-h-screen flex items-center">

        {/* Deep ambient */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] opacity-25"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.6) 0%, rgba(139,92,246,.2) 35%, transparent 65%)' }} />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-10"
            style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,.8), transparent 70%)' }} />
          <div className="absolute top-1/3 left-0 w-[400px] h-[400px] opacity-8"
            style={{ background: 'radial-gradient(ellipse, rgba(14,165,233,.5), transparent 70%)' }} />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* LEFT — Copy */}
            <div>
              {/* BCV live badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur mb-8"
                style={{ animation: 'fade-up .5s ease both' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">BCV en vivo</span>
                <span className="text-[10px] font-black text-emerald-400">
                  {bcvRate ? `${bcvRate} Bs/$` : 'conectando...'}
                </span>
                <span className="text-white/20">·</span>
                <span className="text-[10px] font-black text-white/30">Multi-moneda USD/VES</span>
              </div>

              <h1 className="text-[clamp(3rem,7vw,5.5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-6"
                style={{ animation: 'fade-up .6s ease .1s both' }}>
                <span className="text-white">El ERP que</span><br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient block">
                  Venezuela necesitaba.
                </span>
              </h1>

              <p className="text-lg text-white/35 font-medium leading-relaxed mb-3"
                style={{ animation: 'fade-up .6s ease .2s both' }}>
                POS + Inventario + Finanzas + RRHH + IA — todo en un solo sistema.
                En bolívares y dólares. Con tasas BCV en vivo.
              </p>
              <p className="text-sm text-white/20 leading-relaxed mb-10"
                style={{ animation: 'fade-up .6s ease .25s both' }}>
                Sin servidores que administrar. Sin instalaciones. Sin sorpresas en la factura.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4 mb-14"
                style={{ animation: 'fade-up .6s ease .3s both' }}>
                <button onClick={() => navigate('/register')}
                  className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-1 active:scale-95 glow-hero"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                  Empezar 30 días gratis <ArrowRight size={16} />
                </button>
                <button onClick={() => scrollTo(pricingRef)}
                  className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black text-white/40 border border-white/[0.08] hover:border-white/20 hover:text-white transition-all">
                  Ver precios <ChevronRight size={16} />
                </button>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                style={{ animation: 'fade-up .6s ease .4s both' }}>
                {[
                  { val: '16+',   label: 'Módulos' },
                  { val: '100%',  label: 'Cloud' },
                  { val: '$0',    label: 'Infra propia' },
                  { val: '30d',   label: 'Prueba gratis' },
                ].map(s => (
                  <div key={s.label} className="px-4 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center">
                    <div className="text-2xl font-black text-white">{s.val}</div>
                    <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — Floating cards mockup */}
            <div className="hidden lg:block relative h-[520px]">

              {/* Main dashboard card */}
              <div className="absolute inset-x-0 top-8 rounded-3xl border border-white/[0.08] bg-[#0a0e1a]/90 backdrop-blur-xl p-6 float-a shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[9px] font-black text-white/25 uppercase tracking-widest">Resumen del día</p>
                    <p className="text-xl font-black text-white mt-0.5">Dashboard Principal</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                    <span className="text-[9px] font-black text-emerald-400">En vivo</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Ventas hoy', val: '$1,240.50', sub: '+18% vs ayer', c: 'text-emerald-400', bg: 'bg-emerald-500/8' },
                    { label: 'CxC pendiente', val: '$3,800.00', sub: '12 clientes', c: 'text-amber-400', bg: 'bg-amber-500/8' },
                    { label: 'Stock bajo', val: '4 items', sub: 'Reabastecer ya', c: 'text-rose-400', bg: 'bg-rose-500/8' },
                  ].map(k => (
                    <div key={k.label} className={`rounded-2xl ${k.bg} border border-white/[0.06] p-3`}>
                      <p className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-1.5">{k.label}</p>
                      <p className={`text-lg font-black ${k.c}`}>{k.val}</p>
                      <p className="text-[9px] text-white/25 mt-0.5">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Fake chart bars */}
                <div className="flex items-end gap-1.5 h-16">
                  {[35, 58, 42, 75, 62, 88, 54, 70, 45, 92, 68, 80].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-sm"
                      style={{ height: `${h}%`, background: i === 11 ? 'linear-gradient(to top, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.06)' }} />
                  ))}
                </div>
                <p className="text-[8px] text-white/15 mt-1.5">Últimas 12 horas · Actualizado hace 2 min</p>
              </div>

              {/* Floating: Venta reciente */}
              <div className="notification-card absolute -bottom-4 -left-6 w-64 rounded-2xl border border-indigo-500/25 bg-[#07091c]/95 backdrop-blur p-4 shadow-2xl shadow-indigo-900/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center">
                    <ShoppingCart size={14} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white">Venta registrada</p>
                    <p className="text-[9px] text-white/30">POS Detal · hace 2 min</p>
                  </div>
                  <span className="ml-auto text-xs font-black text-emerald-400">$24.00</span>
                </div>
                <div className="space-y-1.5">
                  {[['Aceite 1L x2', '$12.00'], ['Pasta 500g x4', '$12.00']].map(([n, v]) => (
                    <div key={n} className="flex justify-between text-[9px]">
                      <span className="text-white/30">{n}</span>
                      <span className="text-white/60 font-bold">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[8px] text-white/20 uppercase tracking-widest">Pago móvil · 1 seg</span>
                  <span className="text-[8px] font-black text-emerald-400 uppercase">✓ Pagado</span>
                </div>
              </div>

              {/* Floating: BCV card */}
              <div className="sale-card absolute -right-4 top-1/3 w-52 rounded-2xl border border-amber-500/25 bg-[#100a00]/90 backdrop-blur p-4 shadow-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Tasas en vivo</p>
                </div>
                {[
                  { label: 'BCV Oficial', val: bcvRate ? `${bcvRate} Bs/$` : '...', c: 'text-amber-400' },
                  { label: 'Grupo',       val: '+0.8%',     c: 'text-orange-300' },
                  { label: 'IGTF',        val: '3%',        c: 'text-white/50' },
                  { label: 'IVA',         val: '16%',       c: 'text-white/50' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-[9px] text-white/25 uppercase tracking-widest">{r.label}</span>
                    <span className={`text-[10px] font-black ${r.c}`}>{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Floating: AI message */}
              <div className="ai-card absolute -right-2 bottom-8 w-56 rounded-2xl border border-violet-500/25 bg-[#0c0718]/90 backdrop-blur p-4 shadow-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-violet-400" />
                  <p className="text-[9px] font-black text-violet-400">VisionLab IA</p>
                </div>
                <p className="text-[10px] text-white/50 leading-relaxed">
                  "Tu producto más rentable hoy es <span className="text-violet-300 font-bold">Aceite</span> con 42% de margen. Considera reabastecer."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TICKER ──────────────────────────────────────────────────────────────── */}
      <div className="py-5 border-y border-white/[0.04] overflow-hidden select-none">
        <div className="ticker-track flex gap-8" style={{ width: 'max-content' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span key={i} className="flex items-center gap-8 whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/15">{t}</span>
              <span className="w-1 h-1 rounded-full bg-indigo-500/30 shrink-0" />
            </span>
          ))}
        </div>
      </div>

      {/* ── INTERACTIVE POS DEMO ────────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.15) 0%, transparent 60%)' }} />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12" data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-5">
              <Play size={11} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-400">Pruébalo ahora mismo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-4">
              El POS más rápido<br /><span className="text-white/20">de Venezuela.</span>
            </h2>
            <p className="text-white/30 text-sm max-w-md mx-auto">
              Esta es la interfaz real. Agrega productos, ve el cálculo en USD y bolívares, y procesa la venta.
            </p>
          </div>

          <div data-reveal className="grid lg:grid-cols-[1fr,340px] gap-5">

            {/* Products grid */}
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Productos disponibles</p>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                  <span className="text-[9px] font-black text-amber-400">
                    {bcvRate ? `BCV ${bcvRate} Bs/$` : 'Cargando tasa...'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DEMO_PRODUCTS.map(p => {
                  const qty = demoCart[p.id] ?? 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToDemo(p.id)}
                      disabled={demoPaid}
                      className={`relative rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 active:scale-95 group ${
                        qty > 0
                          ? 'border-indigo-500/40 bg-indigo-500/[0.08]'
                          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'
                      }`}
                    >
                      {qty > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center shadow-lg">
                          {qty}
                        </span>
                      )}
                      <div className="text-2xl mb-2">{p.emoji}</div>
                      <p className="text-xs font-black text-white mb-0.5">{p.name}</p>
                      <p className="text-[10px] font-black text-emerald-400">${p.price.toFixed(2)}</p>
                      {bcvRate && (
                        <p className="text-[9px] text-white/25 mt-0.5">
                          {(p.price * parseFloat(bcvRate)).toFixed(0)} Bs
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-white/20 mt-4 text-center">
                Clic para agregar · En el sistema real: escáner o código de barras
              </p>
            </div>

            {/* Cart */}
            <div className="rounded-3xl border border-white/[0.07] bg-[#07091a] p-6 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Carrito</p>
                {demoItemCount > 0 && !demoPaid && (
                  <button onClick={resetDemo} className="text-[9px] text-white/20 hover:text-rose-400 transition-colors font-black uppercase tracking-widest">
                    Vaciar
                  </button>
                )}
              </div>

              {demoPaid ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Check size={28} className="text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-white text-lg mb-1">¡Venta procesada!</p>
                    <p className="text-[11px] text-white/30">Ticket generado · Inventario actualizado</p>
                    <p className="text-[11px] text-emerald-400 font-black mt-1">${demoTotal.toFixed(2)} cobrado</p>
                  </div>
                  <button onClick={resetDemo}
                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">
                    Nueva venta →
                  </button>
                </div>
              ) : demoItemCount === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  <ShoppingCart size={32} className="text-white/10" />
                  <p className="text-xs text-white/20">Agrega productos<br />desde la izquierda</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 space-y-2 mb-4 overflow-y-auto max-h-52">
                    {DEMO_PRODUCTS.filter(p => demoCart[p.id] > 0).map(p => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-lg">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white/70 truncate">{p.name}</p>
                          <p className="text-[9px] text-white/30">${p.price.toFixed(2)} × {demoCart[p.id]}</p>
                        </div>
                        <p className="text-xs font-black text-white shrink-0">${(p.price * demoCart[p.id]).toFixed(2)}</p>
                        <button onClick={() => remFromDemo(p.id)}
                          className="w-5 h-5 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-white/30 hover:text-rose-400 flex items-center justify-center transition-all text-xs font-black shrink-0">
                          −
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-white/[0.07] pt-4 space-y-1.5 mb-5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/30">Subtotal</span>
                      <span className="text-white/60 font-bold">${demoSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/30">IVA 16%</span>
                      <span className="text-white/60 font-bold">${demoIva.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-white/30">IGTF 3%</span>
                      <span className="text-white/60 font-bold">${demoIgtf.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black pt-1 border-t border-white/[0.07]">
                      <span className="text-white">Total USD</span>
                      <span className="text-emerald-400">${demoTotal.toFixed(2)}</span>
                    </div>
                    {demoBs && (
                      <div className="flex justify-between text-[11px] font-black">
                        <span className="text-white/30">Total Bs.</span>
                        <span className="text-amber-400">{demoBs.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setDemoPaid(true)}
                    className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                    Procesar venta · ${demoTotal.toFixed(2)}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="text-center mt-8" data-reveal>
            <p className="text-[11px] text-white/20 mb-4">
              Esto es exactamente lo que verás dentro del sistema · IVA + IGTF calculados con la tasa BCV real de hoy
            </p>
            <button onClick={() => navigate('/register')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/10 transition-all">
              Crear cuenta y usar el POS real <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* ── BENTO FEATURES ──────────────────────────────────────────────────────── */}
      <section ref={featuresRef} className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Por qué Dualis</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              Todo conectado.<br />
              <span className="text-white/18">Nada duplicado.</span>
            </h2>
            <p className="text-white/25 text-base mt-5 max-w-xl mx-auto">
              Una venta en el POS actualiza inventario, CxC, contabilidad y reportes — al mismo tiempo, sin pasos manuales.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-5">

            {/* POS — col 8 */}
            <div data-reveal className="md:col-span-8 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 to-[#020710] p-10 relative overflow-hidden group hover:border-indigo-500/35 transition-all">
              <div className="absolute right-8 top-8 opacity-50 group-hover:opacity-90 transition-opacity float-a">
                <div className="w-56 h-40 rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur p-4 text-left">
                  <div className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-3">Terminal · Detal</div>
                  {[['Caja Cereal x3', '$9.00'], ['Leche 1L x2', '$6.50'], ['Pan Integral x1', '$3.00']].map(([n, v]) => (
                    <div key={n} className="flex justify-between text-[9px] mb-1.5">
                      <span className="text-white/40">{n}</span>
                      <span className="text-emerald-400 font-black">{v}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/[0.07] flex justify-between text-xs font-black">
                    <span className="text-white/25">Total</span>
                    <span className="text-white">$18.50</span>
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-6 border border-indigo-500/20">
                <ShoppingCart size={22} className="text-indigo-400" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 tracking-tight">POS Detal + Mayor</h3>
              <p className="text-white/30 text-base leading-relaxed max-w-md">
                Terminal de venta al contado y al crédito. Escáner de cámara, modo offline, multi-pago (Bs + USD), IGTF automático y ticket 80mm.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Modo Offline', 'Escáner Cámara', 'Multi-pago', 'Ticket 80mm', 'Crédito 15/30/45d', 'IGTF Auto'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 text-[9px] font-black uppercase tracking-widest text-indigo-400">{t}</span>
                ))}
              </div>
            </div>

            {/* VisionLab — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-[#020710] p-10 flex flex-col justify-between group hover:border-violet-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-6 border border-violet-500/20">
                  <Brain size={22} className="text-violet-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">VisionLab IA</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Gemini analiza tus datos y responde en español: "¿Cuál fue mi mejor mes?", "¿Cuánto debo cobrar?", predicciones de demanda.
                </p>
              </div>
              <div className="mt-8 space-y-2">
                {["P&L automático", "Alertas de anomalías", "Predicciones"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-violet-300/60">
                    <Sparkles size={10} className="text-violet-400" /> {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Inventario — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <Package size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Kardex en tiempo real, precios detal/mayor independientes, alertas de stock mínimo y Smart Advisor de margen óptimo.
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Alertas', 'Smart Advisor'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-black uppercase tracking-widest text-emerald-400">{t}</span>
                ))}
              </div>
            </div>

            {/* Finanzas — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <BadgeDollarSign size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Finanzas 360°</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  CxC, CxP, Contabilidad y Conciliación bancaria. Todo integrado y auditado sin trabajo manual.
                </p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-y-1.5 gap-x-3">
                {['CxC', 'CxP', 'Contab.', 'Conciliac.', 'Comparar', 'Audit Log'].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                    <CheckCircle2 size={9} />{t}
                  </div>
                ))}
              </div>
            </div>

            {/* RRHH — col 4 */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-sky-950/30 to-[#020710] border border-sky-500/20 p-10 flex flex-col justify-between group hover:border-sky-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center mb-6 border border-sky-500/20">
                  <Users size={22} className="text-sky-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">RRHH & Nómina</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Empleados, nómina con adelantos descontados automáticamente, contratos y recibos de pago en USD y Bs.
                </p>
              </div>
              <div className="mt-8 space-y-1.5">
                {['Adelantos descontados', 'Recibos automáticos', 'USD + Bs'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-sky-400/60">
                    <Check size={10} className="text-sky-400" /> {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Tasas BCV — col 8 */}
            <div data-reveal className="md:col-span-8 rounded-3xl bg-gradient-to-br from-amber-950/30 to-[#020710] border border-amber-500/20 p-10 flex flex-col md:flex-row gap-8 items-center group hover:border-amber-500/35 transition-all">
              <div className="flex-1">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-6 border border-amber-500/20">
                  <TrendingUp size={22} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/30 text-sm leading-relaxed max-w-md">
                  Fetch automático desde el BCV oficial. Historial colaborativo con soporte OCR e importación CSV masiva para cargar meses de histórico en segundos.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Fetch BCV Automático', 'OCR de imágenes', 'CSV masivo', 'Propagación instant.'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15 text-[9px] font-black uppercase tracking-widest text-amber-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-52 space-y-2 shrink-0">
                {[
                  { label: 'BCV Oficial', value: bcvRate ? `${bcvRate} Bs/$` : '---', c: 'text-amber-400', bg: 'bg-amber-500/10', b: 'border-amber-500/20' },
                  { label: 'Paralelo',    value: '--- Bs/$',  c: 'text-orange-400', bg: 'bg-orange-500/10', b: 'border-orange-500/20' },
                  { label: 'Fuente',      value: 'BCV.ORG',   c: 'text-emerald-400', bg: 'bg-emerald-500/10', b: 'border-emerald-500/20' },
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

      {/* ── ALL MODULES ─────────────────────────────────────────────────────────── */}
      <section ref={modulesRef} className="py-32 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 block mb-4">Módulos del Sistema</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              16 módulos.<br /><span className="text-white/18">Un solo login.</span>
            </h2>
            <p className="text-white/22 text-base mt-5 max-w-lg mx-auto">
              Todos integrados y sincronizados en tiempo real. Cada acción actualiza el resto automáticamente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} data-reveal
                  className={`rounded-2xl border ${m.border} ${m.bg} p-5 group hover:brightness-125 transition-all cursor-default`}>
                  <div className={`h-9 w-9 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center mb-4`}>
                    <Icon size={17} className={m.color} />
                  </div>
                  <h4 className="text-sm font-black text-white mb-1.5">{m.label}</h4>
                  <p className="text-[11px] text-white/28 leading-relaxed">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECURITY ────────────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 block mb-4">Seguridad</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">Tus datos, solo tuyos.</h2>
            <p className="text-white/22 text-sm mt-4 max-w-xl mx-auto">
              Infraestructura de Google Firebase con cifrado en tránsito y en reposo. Aislamiento total entre empresas.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Lock,          label: 'Cifrado TLS/AES',     desc: 'Datos cifrados en tránsito y en reposo.' },
              { icon: ShieldCheck,   label: 'Firestore Rules',      desc: 'Tu empresa no puede ver datos de otra.' },
              { icon: Fingerprint,   label: 'Auth Firebase',        desc: 'Tokens JWT de Google en cada sesión.' },
              { icon: ClipboardList, label: 'Audit Log Inmutable',  desc: 'Cada acción queda registrada para siempre.' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} data-reveal className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] p-5 text-center">
                  <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/15 flex items-center justify-center mx-auto mb-4">
                    <Icon size={18} className="text-rose-400" />
                  </div>
                  <h4 className="text-xs font-black text-white mb-1.5">{item.label}</h4>
                  <p className="text-[10px] text-white/22 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────────── */}
      <section ref={pricingRef} className="py-32 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">

          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Planes</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white mb-3">
              Precio simple.<br /><span className="text-white/18">Sin sorpresas.</span>
            </h2>
            <p className="text-white/25 text-sm max-w-lg mx-auto mb-8">
              Cada plan incluye TODO lo que necesitas para ese tamaño de operación. Sin add-ons ocultos.
            </p>
            <div className="inline-flex items-center gap-3 p-1 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              <button onClick={() => setPricingAnnual(false)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  !pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'
                }`}>Mensual</button>
              <button onClick={() => setPricingAnnual(true)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'
                }`}>
                Anual <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black">−20%</span>
              </button>
            </div>
          </div>

          {/* ── PLAN CARDS ── */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">

            {/* ── STARTER ── */}
            <div data-reveal className="relative rounded-3xl border border-sky-500/20 bg-gradient-to-b from-sky-950/20 to-[#020710] p-8 flex flex-col">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center">
                    <Zap size={18} className="text-sky-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-sky-400 uppercase tracking-[0.2em]">Starter</p>
                    <p className="text-[11px] text-white/25">Para comenzar</p>
                  </div>
                </div>

                {/* Persona tag */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/[0.07] border border-sky-500/15 mb-6">
                  <Users size={11} className="text-sky-400 shrink-0" />
                  <p className="text-[10px] text-sky-300/60 leading-snug">Ideal para una o dos personas que arrancan su primer negocio</p>
                </div>

                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-black text-white">${price(24)}</span>
                  <div className="mb-1">
                    <span className="text-white/20 text-[9px] font-bold block">/mes</span>
                    {pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $58/año</span>}
                  </div>
                </div>

                <button onClick={() => navigate('/register')}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-8"
                  style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
                  Empezar Starter — gratis 30d
                </button>

                <ul className="space-y-3">
                  {[
                    { ok: true,  label: 'POS Detal completo' },
                    { ok: true,  label: '500 productos en inventario' },
                    { ok: true,  label: 'CxC — cobros básicos' },
                    { ok: true,  label: '2 usuarios · 1 sucursal' },
                    { ok: true,  label: 'Ticket digital / WhatsApp' },
                    { ok: true,  label: 'Soporte por email' },
                    { ok: false, label: 'POS Mayor (crédito)' },
                    { ok: false, label: 'CxP / Proveedores' },
                    { ok: false, label: 'RRHH & Nómina' },
                    { ok: false, label: 'Tasas BCV automáticas' },
                    { ok: false, label: 'Contabilidad' },
                    { ok: false, label: 'VisionLab IA' },
                  ].map(f => (
                    <li key={f.label} className="flex items-center gap-2.5">
                      {f.ok
                        ? <Check size={12} className="text-emerald-400 shrink-0" />
                        : <Minus size={12} className="text-white/12 shrink-0" />}
                      <span className={`text-[11px] font-medium ${f.ok ? 'text-white/45' : 'text-white/15'}`}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── NEGOCIO ── */}
            <div data-reveal className="relative rounded-3xl p-8 flex flex-col plan-card-popular"
              style={{ background: 'linear-gradient(160deg, rgba(79,70,229,0.12) 0%, rgba(13,20,36,1) 50%, rgba(2,7,16,1) 100%)', border: '1px solid rgba(99,102,241,0.4)' }}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <div className="px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-white"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 30px -5px rgba(99,102,241,.7)' }}>
                  ⭐ Más Popular
                </div>
              </div>

              <div className="mb-8 mt-2">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <Building2 size={18} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Negocio</p>
                    <p className="text-[11px] text-white/25">Para crecer en serio</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/[0.08] border border-indigo-500/20 mb-6">
                  <Building2 size={11} className="text-indigo-400 shrink-0" />
                  <p className="text-[10px] text-indigo-300/60 leading-snug">Para negocios con equipo, vendedores a crédito y control contable real</p>
                </div>

                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-black text-white">${price(49)}</span>
                  <div className="mb-1">
                    <span className="text-white/20 text-[9px] font-bold block">/mes</span>
                    {pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $118/año</span>}
                  </div>
                </div>

                <button onClick={() => navigate('/register')}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 mb-8"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 40px -10px rgba(99,102,241,.6)' }}>
                  Activar Negocio — gratis 30d
                </button>

                <ul className="space-y-3">
                  {[
                    { ok: true,  label: 'Todo lo del Starter' },
                    { ok: true,  label: 'POS Mayor — ventas a crédito' },
                    { ok: true,  label: 'Inventario ilimitado de productos' },
                    { ok: true,  label: 'CxC + CxP completo' },
                    { ok: true,  label: 'RRHH & Nómina' },
                    { ok: true,  label: 'Contabilidad (libro + balance)' },
                    { ok: true,  label: 'Tasas BCV automáticas' },
                    { ok: true,  label: '5 usuarios · 2 sucursales' },
                    { ok: true,  label: 'Reportes avanzados + comisiones' },
                    { ok: true,  label: 'Comparar libros' },
                    { ok: true,  label: 'Soporte WhatsApp' },
                    { ok: 'add', label: 'VisionLab IA (+$19/mes)' },
                  ].map(f => (
                    <li key={f.label} className="flex items-center gap-2.5">
                      {f.ok === true  ? <Check size={12} className="text-emerald-400 shrink-0" />
                      : f.ok === 'add' ? <Sparkles size={12} className="text-violet-400 shrink-0" />
                      :                  <Minus size={12} className="text-white/12 shrink-0" />}
                      <span className={`text-[11px] font-medium ${f.ok ? 'text-white/55' : 'text-white/15'}`}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── ENTERPRISE ── */}
            <div data-reveal className="relative rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-950/20 to-[#020710] p-8 flex flex-col">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                    <Crown size={18} className="text-violet-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em]">Enterprise</p>
                    <p className="text-[11px] text-white/25">Operación completa</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/[0.07] border border-violet-500/15 mb-6">
                  <Crown size={11} className="text-violet-400 shrink-0" />
                  <p className="text-[10px] text-violet-300/60 leading-snug">Para operaciones exigentes: sucursales, IA, conciliación y automatización</p>
                </div>

                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-black text-white">${price(89)}</span>
                  <div className="mb-1">
                    <span className="text-white/20 text-[9px] font-bold block">/mes</span>
                    {pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $214/año</span>}
                  </div>
                </div>

                <button onClick={() => navigate('/register')}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-8"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}>
                  Activar Enterprise — gratis 30d
                </button>

                <ul className="space-y-3">
                  {[
                    { ok: true, label: 'Todo lo del Negocio' },
                    { ok: true, label: 'VisionLab IA (Gemini) incluido' },
                    { ok: true, label: 'Conciliación bancaria completa' },
                    { ok: true, label: 'Audit Logs inmutables' },
                    { ok: true, label: 'Webhooks & automatización (n8n/Zapier)' },
                    { ok: true, label: 'Usuarios ilimitados · 5 sucursales' },
                    { ok: true, label: 'Personalización por empresa' },
                    { ok: true, label: 'Soporte prioritario 24/7' },
                  ].map(f => (
                    <li key={f.label} className="flex items-center gap-2.5">
                      <Check size={12} className="text-emerald-400 shrink-0" />
                      <span className="text-[11px] font-medium text-white/50">{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── COMPARE TOGGLE ── */}
          <div className="text-center mb-8" data-reveal>
            <button
              onClick={() => setShowCompare(p => !p)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/20 transition-all">
              <Activity size={13} />
              {showCompare ? 'Ocultar' : 'Ver'} comparativa completa de funciones
              <ChevronDown size={13} className={`transition-transform ${showCompare ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* ── COMPARE TABLE ── */}
          {showCompare && (
            <div data-reveal className="rounded-3xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-16">

              {/* Category filter */}
              <div className="flex items-center gap-2 p-4 border-b border-white/[0.06] overflow-x-auto">
                {cats.map(c => (
                  <button key={c} onClick={() => setActiveCat(c)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                      activeCat === c
                        ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400'
                        : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[1fr,80px,80px,80px] gap-0 border-b border-white/[0.07]">
                <div className="px-6 py-4" />
                {['Starter', 'Negocio', 'Enterprise'].map((p, i) => (
                  <div key={p} className={`py-4 text-center text-[10px] font-black uppercase tracking-widest ${
                    i === 1 ? 'text-indigo-400 bg-indigo-500/[0.05]' : 'text-white/30'
                  }`}>{p}</div>
                ))}
              </div>

              {filteredRows.map((row, i) => (
                <div key={i} className={`grid grid-cols-[1fr,80px,80px,80px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                  i % 2 === 0 ? '' : 'bg-white/[0.01]'
                }`}>
                  <div className="px-6 py-3.5">
                    <span className="text-[10px] font-bold text-white/40">{row.label}</span>
                    <span className="ml-2 text-[8px] font-black text-white/15 uppercase tracking-widest">{row.cat}</span>
                  </div>
                  <div className="py-3.5 text-center flex items-center justify-center"><CellVal val={row.s} /></div>
                  <div className="py-3.5 text-center flex items-center justify-center bg-indigo-500/[0.03]"><CellVal val={row.n} /></div>
                  <div className="py-3.5 text-center flex items-center justify-center"><CellVal val={row.e} /></div>
                </div>
              ))}

              {/* Footer row — Prices */}
              <div className="grid grid-cols-[1fr,80px,80px,80px] bg-white/[0.02]">
                <div className="px-6 py-5">
                  <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Precio mensual</p>
                </div>
                {[{ p: price(24), c: 'text-sky-400' }, { p: price(49), c: 'text-indigo-400' }, { p: price(89), c: 'text-violet-400' }].map(({ p: pl, c }, i) => (
                  <div key={i} className={`py-5 text-center ${i === 1 ? 'bg-indigo-500/[0.05]' : ''}`}>
                    <p className={`text-lg font-black ${c}`}>${pl}</p>
                    <p className="text-[8px] text-white/20">/mes</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trial note */}
          <div data-reveal className="text-center py-8 rounded-3xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-white/30 text-sm">
              Todos los planes incluyen <span className="text-white font-black">30 días de prueba gratis</span> ·
              Sin tarjeta de crédito · Cancela cuando quieras ·
              <span className="text-emerald-400 font-black"> Tus datos siempre son tuyos</span>
            </p>
          </div>

        </div>
      </section>

      {/* ── MADE IN VENEZUELA + CREATOR ─────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(206,17,38,.2) 0%, transparent 50%), radial-gradient(ellipse at 70% 50%, rgba(207,160,33,.15) 0%, transparent 50%)' }} />

        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8 items-center">

            {/* Venezuela */}
            <div data-reveal className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
              <div className="text-5xl mb-5">🇻🇪</div>
              <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Hecho en Venezuela</h3>
              <p className="text-white/30 text-sm leading-relaxed mb-6">
                Dualis nació para resolver los retos únicos del mercado venezolano — inflación, tasas cambiantes,
                operaciones en USD y bolívares, IGTF, IVA 16%, y la necesidad de trabajar con y sin internet.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { emoji: '💱', label: 'Multi-moneda USD/VES' },
                  { emoji: '📡', label: 'BCV en tiempo real' },
                  { emoji: '🧾', label: 'IVA + IGTF automático' },
                  { emoji: '📶', label: 'Modo offline POS' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left">
                    <span className="text-base">{f.emoji}</span>
                    <span className="text-[10px] font-black text-white/40">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Creator */}
            <div data-reveal className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-[#020710] p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-indigo-500/20">
                  JS
                </div>
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Creado por</p>
                  <h3 className="text-xl font-black text-white">Jesús Salazar</h3>
                  <p className="text-[11px] text-white/30">Desarrollador Full-Stack · Venezuela 🇻🇪</p>
                </div>
              </div>
              <p className="text-white/30 text-sm leading-relaxed mb-6">
                Construí Dualis porque no existía un ERP serio, accesible y diseñado de verdad para Venezuela.
                Cada módulo, cada cálculo y cada flujo fue pensado desde la realidad del negocio venezolano.
              </p>
              <div className="space-y-2.5">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 hover:bg-emerald-500/[0.12] transition-all group">
                  <span className="text-lg">💬</span>
                  <div className="flex-1">
                    <p className="text-xs font-black text-emerald-400">WhatsApp directo</p>
                    <p className="text-[10px] text-white/25">+58 412-534-3141</p>
                  </div>
                  <ChevronRight size={13} className="text-white/20 group-hover:text-emerald-400 transition-colors" />
                </a>
                <a href="mailto:yisus_xd77@hotmail.com"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 hover:bg-indigo-500/[0.12] transition-all group">
                  <span className="text-lg">📧</span>
                  <div className="flex-1">
                    <p className="text-xs font-black text-indigo-400">Email personal</p>
                    <p className="text-[10px] text-white/25">yisus_xd77@hotmail.com</p>
                  </div>
                  <ChevronRight size={13} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEEDBACK CALLOUT ─────────────────────────────────────────────────────── */}
      <section className="py-16 bg-[#020508]">
        <div className="max-w-3xl mx-auto px-6">
          <div data-reveal className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-10 text-center">
            <div className="text-4xl mb-4">🐛</div>
            <h3 className="text-2xl font-black text-white mb-3">¿Algo no funciona?</h3>
            <p className="text-white/30 text-sm leading-relaxed mb-6 max-w-xl mx-auto">
              Dualis está en desarrollo activo. Si encuentras un bug, un flujo que no tiene sentido,
              o tienes una idea para mejorar — me ayudas mucho reportándolo. No hay nada pequeño ni insignificante.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setShowFeedback(true)}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                🐛 Reportar un bug
              </button>
              <button
                onClick={() => { setFeedbackType('idea'); setShowFeedback(true); }}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white/40 border border-white/[0.08] hover:text-white hover:border-white/20 transition-all">
                💡 Sugerir una función
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────────── */}
      <section ref={faqRef} className="py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 block mb-4">Preguntas Frecuentes</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">¿Tienes dudas?</h2>
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} data-reveal
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-colors">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left">
                  <span className="text-sm font-black text-white/75 pr-4">{item.q}</span>
                  <ChevronDown size={16} className={`text-white/25 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-white/35 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20"
            style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,.6) 0%, transparent 60%)' }} />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8">
              <Rocket size={11} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-400">Sin compromiso</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white mb-6">
              ¿Listo para<br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient">
                ordenar tu negocio?
              </span>
            </h2>
            <p className="text-white/30 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              30 días gratis. Sin tarjeta. Sin trampa. Si no te convence, nos vamos — sin cobrar un centavo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => navigate('/register')}
                className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black uppercase tracking-widest text-white hover:-translate-y-1 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 20px 60px -15px rgba(99,102,241,.7)' }}>
                Crear cuenta gratis <ArrowRight size={18} />
              </button>
              <a href={`https://wa.me/584125343141?text=${encodeURIComponent('Hola, quiero saber más sobre Dualis ERP')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black text-white/40 border border-white/[0.1] hover:text-white hover:border-white/25 transition-all">
                Hablar con un asesor <ChevronRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo className="h-7 w-auto mb-4" textClassName="text-white" />
              <p className="text-[11px] text-white/25 leading-relaxed mb-3">
                ERP Cloud hecho en Venezuela 🇻🇪<br />USD + Bs · BCV en vivo · Sin servidores.
              </p>
              {bcvRate && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                  <span className="text-[9px] font-black text-amber-400">BCV {bcvRate} Bs/$</span>
                </div>
              )}
              {/* Social links */}
              <div className="flex items-center gap-2 mt-2">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-emerald-400 hover:border-emerald-500/30 transition-all text-xs">
                  💬
                </a>
                <a href="mailto:yisus_xd77@hotmail.com"
                  className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-indigo-400 hover:border-indigo-500/30 transition-all text-xs">
                  ✉️
                </a>
                <a href="https://instagram.com/yisus_xd77" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-pink-400 hover:border-pink-500/30 transition-all text-xs">
                  📸
                </a>
              </div>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Producto</p>
              <ul className="space-y-3">
                {[
                  { label: 'Funcionalidades', action: () => featuresRef.current?.scrollIntoView({ behavior: 'smooth' }) },
                  { label: 'Módulos',         action: () => modulesRef.current?.scrollIntoView({ behavior: 'smooth' }) },
                  { label: 'Precios',         action: () => pricingRef.current?.scrollIntoView({ behavior: 'smooth' }) },
                  { label: 'POS Interactivo', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
                ].map(l => (
                  <li key={l.label}>
                    <button onClick={l.action} className="text-[11px] text-white/30 hover:text-white/60 transition-colors text-left">{l.label}</button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Legal</p>
              <ul className="space-y-3">
                <li><a href="/terms" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Términos de servicio</a></li>
                <li><a href="/privacy" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Política de privacidad</a></li>
                <li><button onClick={() => setShowFeedback(true)} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Reportar un bug 🐛</button></li>
              </ul>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Contacto</p>
              <ul className="space-y-3">
                <li>
                  <a href="mailto:yisus_xd77@hotmail.com" className="text-[11px] text-white/30 hover:text-indigo-400 transition-colors block">
                    yisus_xd77@hotmail.com
                  </a>
                </li>
                <li>
                  <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-white/30 hover:text-emerald-400 transition-colors block">
                    WhatsApp · +58 412-534-3141
                  </a>
                </li>
                <li>
                  <a href={`https://wa.me/584125343141?text=${encodeURIComponent('Hola Jesús, vi Dualis y tengo una pregunta:')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-white/30 hover:text-white/60 transition-colors block">
                    Hablar con Jesús →
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.05] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-[10px] text-white/15">© 2025 Dualis ERP</p>
              <span className="text-white/10">·</span>
              <p className="text-[10px] text-white/15">Creado por <span className="text-indigo-400/60 font-black">Jesús Salazar</span> 🇻🇪</p>
            </div>
            <p className="text-[10px] text-white/15">Cloud · Tiempo real · Multi-moneda USD/VES</p>
          </div>
        </div>
      </footer>

      {/* ── FLOATING FEEDBACK BUTTON ─────────────────────────────────────────────── */}
      <button
        onClick={() => setShowFeedback(true)}
        className="fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-2xl transition-all hover:-translate-y-1 hover:shadow-indigo-500/30 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 30px -8px rgba(99,102,241,.6)' }}
        title="Reportar bug o sugerir función"
      >
        <span className="text-sm">🐛</span>
        <span className="hidden sm:inline">¿Algo falla?</span>
      </button>

      {/* ── FEEDBACK MODAL ───────────────────────────────────────────────────────── */}
      {showFeedback && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowFeedback(false); }}>
          <div className="w-full max-w-md bg-[#0d1424] border border-white/[0.1] rounded-3xl p-7 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-1">Feedback</p>
                <h3 className="text-xl font-black text-white">Cuéntame qué pasó</h3>
              </div>
              <button onClick={() => setShowFeedback(false)}
                className="w-8 h-8 rounded-xl bg-white/[0.06] text-white/30 hover:text-white flex items-center justify-center transition-colors text-sm font-black">
                ✕
              </button>
            </div>

            {feedbackSent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🙌</div>
                <p className="font-black text-white mb-1">¡Gracias!</p>
                <p className="text-[11px] text-white/30">Se abrirá tu cliente de correo. Si no, escríbeme al WhatsApp.</p>
              </div>
            ) : (
              <>
                {/* Type selector */}
                <div className="flex gap-2 mb-4">
                  {([['bug', '🐛 Bug'], ['idea', '💡 Idea'], ['otro', '💬 Otro']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setFeedbackType(t)}
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        feedbackType === t
                          ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400'
                          : 'bg-white/[0.04] border border-white/[0.07] text-white/30 hover:text-white/50'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder={
                    feedbackType === 'bug' ? 'Qué estabas haciendo cuando ocurrió el error...'
                    : feedbackType === 'idea' ? 'Cuéntame la función que te gustaría ver...'
                    : 'Tu mensaje...'
                  }
                  rows={5}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none mb-4"
                />

                <div className="flex gap-3">
                  <button onClick={() => setShowFeedback(false)}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button onClick={sendFeedback} disabled={!feedbackText.trim()}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                    Enviar →
                  </button>
                </div>

                <p className="text-[9px] text-white/20 text-center mt-3">
                  Se enviará a yisus_xd77@hotmail.com · O escribe al WhatsApp si lo prefieres
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
