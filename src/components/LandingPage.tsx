import React, { useEffect, useRef, useState } from 'react';
import SEO from './SEO';
import {
  ArrowRight, BarChart3, Zap, Sparkles, Shield,
  ShoppingCart, Package, TrendingUp,
  FileText, Layers, Rocket, Users, BookOpen, Landmark, Monitor,
  CheckCircle2, Lock,
  ChevronRight, BadgeDollarSign, Building2,
  Activity,
  History, ShieldCheck,
  ScanLine, Check, Minus, Crown, Mail,
  HelpCircle, Sliders, Brain, Receipt,
  ChevronDown, Banknote, Calculator, ClipboardList, X,
  Fingerprint, MessageSquare, Play, Eye, Globe, Server,
  ImageIcon, Loader2, Send,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getCountFromServer, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import Logo from './ui/Logo';
import { PLANS as PLAN_CONFIG, COMPARE_ROWS, PLAN_PRICES, ANNUAL_DISCOUNT, ADDON_PRICES } from '../utils/planConfig';

/* ═══════════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════════ */

const HERO_WORDS = ['tu inventario.', 'tus ventas.', 'tu nomina.', 'tus finanzas.', 'tu negocio.'];

const MODULES = [
  { icon: ShoppingCart, label: 'POS Detal', desc: 'Ventas al contado, escaner, modo offline, ticket digital.', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: Building2, label: 'POS Mayor', desc: 'Terminal mayorista con credito 15/30/45 dias.', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: BadgeDollarSign, label: 'Precios Dinamicos', desc: 'Precios que se recalculan automaticamente segun las tasas de cambio.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: FileText, label: 'CxC / Clientes', desc: 'Cuentas por cobrar, historial y deudas USD/Bs.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers, label: 'CxP / Proveedores', desc: 'Cuentas por pagar y proveedores.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen, label: 'Contabilidad', desc: 'Libro diario, mayor y balance automatico.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark, label: 'Conciliacion', desc: 'Conciliacion bancaria con CSV.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Globe, label: 'Portal Clientes', desc: 'Tus clientes consultan su estado de cuenta y registran pagos.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package, label: 'Inventario Pro', desc: 'Kardex, alertas stock, margenes y Smart Advisor.', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Monitor, label: 'Cajas / Arqueo', desc: 'Turnos, arqueo y reporte Z.', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Users, label: 'RRHH & Nomina', desc: 'Empleados, nomina, adelantos y recibos.', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Sparkles, label: 'VisionLab IA', desc: 'Gemini analiza tu negocio en tiempo real.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: BarChart3, label: 'Dashboard BI', desc: 'KPIs, producto estrella, alertas predictivas y P&L.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: History, label: 'Rate History', desc: 'Historial de tasas con OCR y CSV masivo.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: TrendingUp, label: 'Tasas Custom', desc: 'BCV + hasta 3 tasas extra configurables con precios automaticos.', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: ShieldCheck, label: 'Audit Logs', desc: 'Auditoria inmutable. Export PDF/CSV/Excel.', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  { icon: Receipt, label: 'Libro de Ventas', desc: 'Reporte fiscal con filtros, dual currency y export CSV.', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  { icon: HelpCircle, label: 'Centro de Ayuda', desc: 'Wiki integrada con tooltips contextuales en cada seccion.', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
  { icon: Sliders, label: 'Config. Avanzada', desc: 'IVA, IGTF, roles, permisos y tasas personalizadas.', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
];

const FAQ_ITEMS = [
  { q: 'Funciona para empresas venezolanas?', a: 'Si, esta disenado 100% para Venezuela. Maneja USD y bolivares, IVA 16%, IGTF 3%, tasa BCV oficial, y proximamente libros SENIAT.' },
  { q: 'Mis datos estan seguros?', a: 'Dualis usa Firebase de Google con cifrado en transito y en reposo. Tus datos estan aislados de otras empresas.' },
  { q: 'Puedo usar Dualis sin internet?', a: 'El POS Detal tiene modo offline. Las ventas se guardan localmente y sincronizan al reconectar.' },
  { q: 'Cuantos usuarios puedo tener?', a: 'Starter: 2 usuarios. Negocio: 5 usuarios. Enterprise: ilimitados. Puedes agregar usuarios extra por $3/mes.' },
  { q: 'Puedo exportar mis datos?', a: 'Si. Inventario, CxC, reportes, auditoria y nomina se exportan en Excel, PDF o CSV.' },
  { q: 'Necesito tarjeta para la prueba?', a: 'No. Los 30 dias de prueba son completamente gratis y sin tarjeta.' },
  { q: 'Que pasa al terminar los 30 dias?', a: 'Puedes elegir un plan de pago. Tus datos se conservan 30 dias adicionales.' },
  { q: 'Hay soporte en espanol?', a: 'Si. Soporte completo en espanol via WhatsApp y email.' },
  { q: 'Que son los precios dinamicos?', a: 'Los productos clasificados bajo una tasa custom (ej. Zoher, Grupo) se recalculan automaticamente al cambiar la tasa. Defines costo + margen y el sistema calcula todo.' },
  { q: 'Mis clientes pueden ver su estado de cuenta?', a: 'Si. Con el Portal de Clientes, tus deudores acceden a su balance, registran pagos y ven sus facturas pendientes.' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nomina',
  'Inventario Pro', 'VisionLab IA', 'CxC & CxP', 'Conciliacion Bancaria',
  'Multi-moneda USD/VES', 'Roles & Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Modo Offline POS', 'Precios Dinamicos', 'Portal Clientes',
  'Dashboard BI', 'Tasas Custom', 'Libro de Ventas', 'Tooltips de Ayuda',
];

const DEMO_PRODUCTS = [
  { id: 1, name: 'Aceite 1L', price: 6.50, emoji: '\u{1FAD9}' },
  { id: 2, name: 'Pasta 500g', price: 3.00, emoji: '\u{1F35D}' },
  { id: 3, name: 'Leche 1L', price: 4.25, emoji: '\u{1F95B}' },
  { id: 4, name: 'Pollo 1kg', price: 7.80, emoji: '\u{1F357}' },
  { id: 5, name: 'Arroz 1kg', price: 2.50, emoji: '\u{1F33E}' },
  { id: 6, name: 'Jabon Caja', price: 1.75, emoji: '\u{1F9FC}' },
];

// COMPARE_ROWS imported from planConfig.ts

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [bcvRate, setBcvRate] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pricingAnnual, setPricingAnnual] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showAddons, setShowAddons] = useState(false);
  const [activeCat, setActiveCat] = useState('Todos');
  const [betaCount, setBetaCount] = useState<number | null>(null);
  const [previewTab, setPreviewTab] = useState<'dashboard' | 'pos' | 'inventario'>('dashboard');

  // Typewriter
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  // Demo POS
  const [demoCart, setDemoCart] = useState<Record<number, number>>({});
  const [demoPaid, setDemoPaid] = useState(false);

  // Feedback
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'idea' | 'otro'>('bug');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<File[]>([]);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const feedbackFileRef = useRef<HTMLInputElement>(null);

  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const faqRef = useRef<HTMLElement>(null);
  const demoRef = useRef<HTMLElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ── Effects ────────────────────────────────────────── */
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
        const list = Array.isArray(data) ? data : [data];
        const entry = list.find((d: any) => d?.fuente === 'oficial' || d?.fuente === 'bcv' || String(d?.fuente ?? '').toLowerCase().includes('oficial') || String(d?.nombre ?? '').toLowerCase().includes('bcv')) ?? list[0];
        const rate = Number(entry?.venta ?? entry?.promedio ?? entry?.precio ?? entry?.compra);
        if (rate && !isNaN(rate)) setBcvRate(rate.toFixed(2));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    getCountFromServer(collection(db, 'users'))
      .then(snap => setBetaCount(snap.data().count))
      .catch(() => setBetaCount(null));
  }, []);

  useEffect(() => {
    const word = HERO_WORDS[wordIdx];
    const speed = deleting ? 40 : 80;
    const timeout = setTimeout(() => {
      if (!deleting && charIdx < word.length) setCharIdx(c => c + 1);
      else if (!deleting && charIdx === word.length) setTimeout(() => setDeleting(true), 1800);
      else if (deleting && charIdx > 0) setCharIdx(c => c - 1);
      else { setDeleting(false); setWordIdx(i => (i + 1) % HERO_WORDS.length); }
    }, speed);
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx]);

  const price = (monthly: number) => pricingAnnual ? Math.round(monthly * (1 - ANNUAL_DISCOUNT)) : monthly;

  /* ── Demo POS ───────────────────────────────────────── */
  const demoSubtotal = DEMO_PRODUCTS.reduce((s, p) => s + p.price * (demoCart[p.id] ?? 0), 0);
  const demoIva = demoSubtotal * 0.16;
  const demoIgtf = demoSubtotal * 0.03;
  const demoTotal = demoSubtotal + demoIva + demoIgtf;
  const demoBs = bcvRate ? demoTotal * parseFloat(bcvRate) : null;
  const demoItemCount = (Object.values(demoCart) as number[]).reduce((s, q) => s + q, 0);
  const addToDemo = (id: number) => setDemoCart(c => ({ ...c, [id]: Math.min((c[id] ?? 0) + 1, 99) }));
  const remFromDemo = (id: number) => setDemoCart(c => { const next = { ...c, [id]: (c[id] ?? 0) - 1 }; if (next[id] <= 0) delete next[id]; return next; });
  const resetDemo = () => { setDemoCart({}); setDemoPaid(false); };

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    try {
      const imageUrls: string[] = [];
      for (const file of feedbackImages) { const result = await uploadToCloudinary(file, 'dualis_avatars'); imageUrls.push(result.secure_url); }
      await addDoc(collection(db, 'feedback'), { type: feedbackType, message: feedbackText.trim(), name: feedbackName.trim() || undefined, email: feedbackEmail.trim() || undefined, imageUrls: imageUrls.length > 0 ? imageUrls : undefined, status: 'nuevo', createdAt: serverTimestamp(), source: 'landing' });
      const typeLabel = feedbackType === 'bug' ? 'Bug' : feedbackType === 'idea' ? 'Sugerencia' : 'Comentario';
      const waText = encodeURIComponent(`${typeLabel} — Dualis Feedback\n\n${feedbackName.trim() ? `De: ${feedbackName.trim()}\n` : ''}${feedbackEmail.trim() ? `Email: ${feedbackEmail.trim()}\n` : ''}\n${feedbackText.trim()}${imageUrls.length > 0 ? `\n\nImagenes:\n${imageUrls.join('\n')}` : ''}`);
      window.open(`https://wa.me/584125343141?text=${waText}`, '_blank');
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setFeedbackName(''); setFeedbackEmail(''); setFeedbackImages([]); setShowFeedback(false); }, 3000);
    } catch (e) { console.error('Error enviando feedback:', e); }
    setFeedbackSending(false);
  };

  const CellVal = ({ val }: { val: boolean | string }) => {
    if (val === true) return <Check size={15} className="text-emerald-400 mx-auto" />;
    if (val === false) return <Minus size={15} className="text-white/15 mx-auto" />;
    return <span className="text-[10px] font-black text-indigo-400 leading-tight">{val as string}</span>;
  };

  const cats = ['Todos', ...Array.from(new Set(COMPARE_ROWS.map(r => r.cat)))];
  const filteredRows = activeCat === 'Todos' ? COMPARE_ROWS : COMPARE_ROWS.filter(r => r.cat === activeCat);
  const currentWord = HERO_WORDS[wordIdx].slice(0, charIdx);

  /* ═══════════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════════ */
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: `¿${item.q}`,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Dualis ERP',
    url: 'https://dualis.online',
    logo: 'https://dualis.online/logo.png',
    description: 'Sistema ERP Cloud diseñado para empresas venezolanas.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: 'Spanish',
    },
    sameAs: ['https://dualis.online'],
  };

  const webSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Dualis ERP',
    url: 'https://dualis.online',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://dualis.online/?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
    <SEO
      title="Dualis ERP — El sistema que Venezuela necesitaba"
      description="ERP Cloud para Venezuela. POS Detal + Mayor, inventario, CxC, CxP, RRHH, contabilidad, tasas BCV en vivo e IA. Multi-moneda USD/Bolívares. 30 días gratis, sin tarjeta."
      url="https://dualis.online"
      jsonLd={[faqSchema, orgSchema, webSiteSchema]}
    />
    <div className="min-h-screen bg-[#020710] text-white overflow-x-hidden selection:bg-indigo-600/80 antialiased">
      <style>{`
        @keyframes ticker    { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes gradx     { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float-y   { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(.5deg)} }
        @keyframes fade-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
        .ticker-track      { animation:ticker 55s linear infinite; }
        .ticker-track:hover{ animation-play-state:paused; }
        .animate-gradient  { background-size:200% 200%; animation:gradx 5s ease infinite; }
        .float-a           { animation:float-y 6s cubic-bezier(.45,.05,.55,.95) infinite; }
        .pulse-dot         { animation:pulse-dot 2s ease-in-out infinite; }
        .cursor-blink      { animation:blink 1s step-end infinite; }
        [data-reveal]            { opacity:0; transform:translateY(22px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.06s}
        [data-reveal]:nth-child(3){transition-delay:.12s}
        [data-reveal]:nth-child(4){transition-delay:.18s}
        .gradient-border::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(99,102,241,.35),rgba(139,92,246,.12),rgba(99,102,241,.04)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .plan-card-popular { box-shadow:0 0 0 1px rgba(99,102,241,.45), 0 25px 70px -20px rgba(99,102,241,.3), 0 0 120px -40px rgba(99,102,241,.2); }
      `}</style>

      {/* ══ TOP BANNER ═══════════════════════════════════════════════════════════ */}
      <div className="fixed top-0 inset-x-0 z-[110]">
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 py-2 px-4">
          <div className="flex items-center justify-center gap-4 flex-wrap text-center">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70">Beta Abierta</span>
            <span className="text-white/25 hidden sm:inline">&middot;</span>
            {betaCount !== null && betaCount > 0 ? (
              <span className="text-[10px] font-black text-amber-300">{betaCount} empresas probando Dualis</span>
            ) : (
              <span className="text-[10px] font-black text-white">30 dias gratis &middot; Sin tarjeta</span>
            )}
            <button onClick={() => navigate('/register')} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[9px] font-black uppercase tracking-widest transition-all">
              Comenzar <ArrowRight size={9} />
            </button>
          </div>
        </div>
      </div>

      {/* ══ NAVBAR ════════════════════════════════════════════════════════════════ */}
      <nav className={`fixed inset-x-0 z-[100] transition-all duration-700 top-[30px] ${scrolled ? 'py-3' : 'bg-transparent py-5'}`}
        style={scrolled ? { background: 'rgba(2,7,16,.88)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', borderBottom: '1px solid rgba(255,255,255,.06)' } : undefined}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-7 w-auto" textClassName="text-white" />
          </div>
          <div className="hidden lg:flex items-center gap-0.5">
            {[
              { label: 'Demo', ref: demoRef },
              { label: 'Funciones', ref: featuresRef },
              { label: 'Modulos', ref: modulesRef },
              { label: 'Precios', ref: pricingRef },
              { label: 'FAQ', ref: faqRef },
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
            <button onClick={() => navigate('/register')} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 25px -6px rgba(99,102,241,.55)' }}>Empezar gratis</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ═════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-36 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] opacity-[0.22]" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.55) 0%, rgba(139,92,246,.18) 40%, transparent 70%)' }} />
        </div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.1] bg-white/[0.04] mb-8" style={{ animation: 'fade-up .5s ease both' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">BCV en vivo</span>
                <span className="text-[10px] font-black text-emerald-400">{bcvRate ? `${bcvRate} Bs/$` : 'conectando...'}</span>
                {betaCount !== null && betaCount > 0 && (<><span className="text-white/20">&middot;</span><span className="text-[10px] font-black text-indigo-400">{betaCount} en beta</span></>)}
              </div>

              <h1 className="text-[clamp(2.8rem,6.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6" style={{ animation: 'fade-up .6s ease .1s both' }}>
                <span className="text-white">Controla</span><br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient">{currentWord}</span>
                <span className="cursor-blink text-indigo-400">|</span>
              </h1>

              <p className="text-lg text-white/35 font-medium leading-relaxed mb-3" style={{ animation: 'fade-up .6s ease .2s both' }}>
                El sistema administrativo pensado 100% para el negocio venezolano.
              </p>
              <p className="text-sm text-white/20 leading-relaxed mb-10" style={{ animation: 'fade-up .6s ease .25s both' }}>
                POS + Inventario + Finanzas + RRHH + IA + Portal Clientes. Con precios dinamicos, tasas custom y BCV en vivo.
                <span className="text-indigo-400/50 font-bold"> Hecho en Venezuela, para Venezuela.</span>
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4 mb-8" style={{ animation: 'fade-up .6s ease .3s both' }}>
                <button onClick={() => navigate('/register')} className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-1 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>Empezar 30 dias gratis <ArrowRight size={16} /></button>
                <button onClick={() => scrollTo(demoRef)} className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black text-white/40 border border-white/[0.08] hover:border-white/20 hover:text-white transition-all">
                  Probar el POS <Play size={14} /></button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ animation: 'fade-up .6s ease .4s both' }}>
                {[{ val: '19+', label: 'Modulos' }, { val: '100%', label: 'Cloud' }, { val: '2', label: 'Terminales POS' }, { val: '30d', label: 'Prueba gratis' }].map(s => (
                  <div key={s.label} className="px-4 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300">
                    <div className="text-2xl font-black text-white">{s.val}</div>
                    <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — Laptop + Phone Mockup */}
            <div className="hidden lg:flex flex-col items-center justify-center relative h-[420px]">
              <div className="relative">
                <div className="w-[340px] h-[220px] rounded-xl border-2 border-white/[0.12] bg-[#0a0e1a] overflow-hidden shadow-2xl shadow-indigo-900/20">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                    <span className="w-2 h-2 rounded-full bg-rose-500/60" /><span className="w-2 h-2 rounded-full bg-amber-500/60" /><span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                    <span className="ml-2 text-[7px] text-white/15 font-mono">dualis-system.vercel.app</span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[{ l: 'Ventas', v: '$1,240', c: 'text-emerald-400' }, { l: 'Productos', v: '128', c: 'text-amber-400' }, { l: 'BCV', v: bcvRate || '---', c: 'text-sky-400' }].map(k => (
                        <div key={k.l} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2">
                          <p className="text-[6px] font-black text-white/20 uppercase tracking-widest">{k.l}</p>
                          <p className={`text-[11px] font-black ${k.c}`}>{k.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {[35, 58, 42, 75, 62, 88, 54, 70, 45, 92].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: i === 9 ? 'linear-gradient(to top, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.06)' }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="w-[380px] h-3 bg-white/[0.06] rounded-b-xl mx-auto border-x border-b border-white/[0.08]" />
              </div>
              <div className="absolute -right-4 bottom-12 w-[100px] h-[180px] rounded-2xl border-2 border-white/[0.12] bg-[#0a0e1a] overflow-hidden shadow-2xl shadow-violet-900/20">
                <div className="w-10 h-1 rounded-full bg-white/[0.1] mx-auto mt-1.5" />
                <div className="p-2 mt-1">
                  <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-1.5 mb-1.5">
                    <p className="text-[5px] font-black text-indigo-400 uppercase">POS Detal</p>
                    <p className="text-[7px] font-black text-white">$24.00</p>
                  </div>
                  <div className="space-y-1">
                    {['Aceite', 'Pasta', 'Leche'].map(n => (
                      <div key={n} className="flex justify-between text-[5px]"><span className="text-white/30">{n}</span><span className="text-emerald-400 font-black">$</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TICKER ════════════════════════════════════════════════════════════════ */}
      <div className="py-4 border-y border-white/[0.04] overflow-hidden select-none bg-[#020710]">
        <div className="ticker-track flex gap-8" style={{ width: 'max-content' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span key={i} className="flex items-center gap-8 whitespace-nowrap">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/15">{t}</span>
              <span className="w-1 h-1 rounded-full bg-indigo-500/30 shrink-0" />
            </span>
          ))}
        </div>
      </div>

      {/* ══ HOW IT WORKS ══════════════════════════════════════════════════════════ */}
      <section className="py-14 bg-[#020710]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 block mb-3">Asi de facil</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">3 pasos. <span className="text-white/20">Listo.</span></h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { step: '01', icon: Mail, title: 'Registrate', desc: 'Crea tu cuenta con email. 30 dias gratis, sin tarjeta.', color: 'indigo' },
              { step: '02', icon: Sliders, title: 'Configura', desc: 'Sube inventario, configura IVA/IGTF, agrega equipo.', color: 'violet' },
              { step: '03', icon: ShoppingCart, title: 'Vende', desc: 'Abre el POS y registra tu primera venta.', color: 'emerald' },
            ].map((s, i) => (
              <div key={i} data-reveal className={`relative rounded-2xl border border-${s.color}-500/20 bg-${s.color}-500/[0.04] p-7 group hover:border-${s.color}-500/40 transition-all`}>
                <div className={`text-[72px] font-black text-${s.color}-500/[0.06] absolute top-3 right-5 leading-none select-none`}>{s.step}</div>
                <div className={`h-11 w-11 rounded-xl bg-${s.color}-500/15 flex items-center justify-center mb-5 border border-${s.color}-500/20`}>
                  <s.icon size={20} className={`text-${s.color}-400`} />
                </div>
                <h3 className="text-lg font-black text-white mb-2">{s.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ INTERACTIVE POS DEMO ══════════════════════════════════════════════════ */}
      <section ref={demoRef} className="py-14 bg-[#030915] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.15) 0%, transparent 60%)' }} />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-4">
              <Play size={11} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-400">Pruebalo ahora mismo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-3">
              Asi se ve el POS real.<br /><span className="text-white/20">Toca. Prueba. Decide.</span>
            </h2>
            <p className="text-white/30 text-sm max-w-md mx-auto">Agrega productos, ve el calculo con IVA + IGTF reales, y procesa la venta.</p>
          </div>

          <div data-reveal className="grid lg:grid-cols-[1fr,340px] gap-4">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Productos</p>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-[9px] font-black text-amber-400">{bcvRate ? `BCV ${bcvRate} Bs/$` : 'Cargando...'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DEMO_PRODUCTS.map(p => {
                  const qty = demoCart[p.id] ?? 0;
                  return (
                    <button key={p.id} onClick={() => addToDemo(p.id)} disabled={demoPaid}
                      className={`relative rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 active:scale-95 ${qty > 0 ? 'border-indigo-500/40 bg-indigo-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'}`}>
                      {qty > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center shadow-lg">{qty}</span>}
                      <div className="text-2xl mb-2">{p.emoji}</div>
                      <p className="text-xs font-black text-white mb-0.5">{p.name}</p>
                      <p className="text-[10px] font-black text-emerald-400">${p.price.toFixed(2)}</p>
                      {bcvRate && <p className="text-[9px] text-white/25 mt-0.5">{(p.price * parseFloat(bcvRate)).toFixed(0)} Bs</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-[#07091a] p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Carrito</p>
                {demoItemCount > 0 && !demoPaid && <button onClick={resetDemo} className="text-[9px] text-white/20 hover:text-rose-400 transition-colors font-black uppercase tracking-widest">Vaciar</button>}
              </div>
              {demoPaid ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><Check size={24} className="text-emerald-400" /></div>
                  <p className="font-black text-white text-lg">Venta procesada!</p>
                  <p className="text-[11px] text-white/30">Ticket generado &middot; Inventario actualizado</p>
                  <p className="text-[11px] text-emerald-400 font-black">${demoTotal.toFixed(2)} cobrado</p>
                  <button onClick={resetDemo} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">Nueva venta &rarr;</button>
                </div>
              ) : demoItemCount === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-8">
                  <ShoppingCart size={28} className="text-white/10" />
                  <p className="text-xs text-white/20">Agrega productos</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 space-y-2 mb-4 overflow-y-auto max-h-48">
                    {DEMO_PRODUCTS.filter(p => demoCart[p.id] > 0).map(p => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="text-lg">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white/70 truncate">{p.name}</p>
                          <p className="text-[9px] text-white/30">${p.price.toFixed(2)} x {demoCart[p.id]}</p>
                        </div>
                        <p className="text-xs font-black text-white shrink-0">${(p.price * demoCart[p.id]).toFixed(2)}</p>
                        <button onClick={() => remFromDemo(p.id)} className="w-5 h-5 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-white/30 hover:text-rose-400 flex items-center justify-center text-xs font-black shrink-0">-</button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/[0.07] pt-3 space-y-1.5 mb-4">
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">Subtotal</span><span className="text-white/60 font-bold">${demoSubtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">IVA 16%</span><span className="text-white/60 font-bold">${demoIva.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">IGTF 3%</span><span className="text-white/60 font-bold">${demoIgtf.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm font-black pt-1 border-t border-white/[0.07]"><span className="text-white">Total USD</span><span className="text-emerald-400">${demoTotal.toFixed(2)}</span></div>
                    {demoBs && <div className="flex justify-between text-[11px] font-black"><span className="text-white/30">Total Bs.</span><span className="text-amber-400">{demoBs.toFixed(2)}</span></div>}
                  </div>
                  <button onClick={() => setDemoPaid(true)} className="w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                    Procesar venta &middot; ${demoTotal.toFixed(2)}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="text-center mt-6" data-reveal>
            <button onClick={() => navigate('/register')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/10 transition-all">
              Crear cuenta y usar el POS real <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* ══ FEATURES BENTO ════════════════════════════════════════════════════════ */}
      <section ref={featuresRef} className="py-14 bg-[#020710]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">Por que Dualis</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">Todo conectado. <span className="text-white/[0.18]">Nada duplicado.</span></h2>
            <p className="text-white/25 text-sm mt-4 max-w-xl mx-auto">Una venta en el POS actualiza inventario, CxC, contabilidad y reportes — al mismo tiempo.</p>
          </div>

          <div className="grid md:grid-cols-12 gap-4">
            {/* POS */}
            <div data-reveal className="md:col-span-8 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 to-[#020710] p-8 relative overflow-hidden group hover:border-indigo-500/35 transition-all">
              <div className="absolute right-6 top-6 opacity-50 group-hover:opacity-90 transition-opacity float-a hidden md:block">
                <div className="w-48 h-36 rounded-xl border border-white/[0.08] bg-[#0a0e1a] p-3 text-left">
                  <div className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-2">Terminal &middot; Detal</div>
                  {[['Aceite 1L x2', '$13.00'], ['Pasta 500g x4', '$12.00'], ['Leche 1L x1', '$4.25']].map(([n, v]) => (
                    <div key={n} className="flex justify-between text-[9px] mb-1"><span className="text-white/40">{n}</span><span className="text-emerald-400 font-black">{v}</span></div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/[0.07] flex justify-between text-xs font-black"><span className="text-white/25">Total</span><span className="text-white">$29.25</span></div>
                </div>
              </div>
              <div className="h-11 w-11 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-5 border border-indigo-500/20"><ShoppingCart size={20} className="text-indigo-400" /></div>
              <h3 className="text-3xl font-black text-white mb-3 tracking-tight">POS Detal + Mayor</h3>
              <p className="text-white/30 text-sm leading-relaxed max-w-md">Terminal de venta al contado y al credito. Escaner de camara, precios dinamicos por tasa, multi-pago, IGTF automatico y ticket 80mm.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Modo Offline', 'Escaner Camara', 'Precios Dinamicos', 'Multi-pago', 'Ticket 80mm', 'Credito 15/30/45d'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 text-[9px] font-black uppercase tracking-widest text-indigo-400">{t}</span>
                ))}
              </div>
            </div>

            {/* VisionLab */}
            <div data-reveal className="md:col-span-4 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-[#020710] p-8 flex flex-col justify-between group hover:border-violet-500/35 transition-all">
              <div>
                <div className="h-11 w-11 rounded-xl bg-violet-500/15 flex items-center justify-center mb-5 border border-violet-500/20"><Brain size={20} className="text-violet-400" /></div>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">VisionLab IA</h3>
                <p className="text-white/30 text-sm leading-relaxed">Gemini analiza tus datos y responde en espanol. P&L automatico, alertas y predicciones.</p>
              </div>
              <div className="mt-6 space-y-1.5">
                {["P&L automatico", "Alertas de anomalias", "Predicciones"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-violet-300/60"><Sparkles size={10} className="text-violet-400" /> {f}</div>
                ))}
              </div>
            </div>

            {/* Inventario */}
            <div data-reveal className="md:col-span-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-8 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-11 w-11 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-5 border border-emerald-500/20"><Package size={20} className="text-emerald-400" /></div>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Inventario Pro</h3>
                <p className="text-white/30 text-sm leading-relaxed">Kardex en tiempo real, multi-precio, margenes por tasa, alertas de stock y clasificacion BCV/custom.</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Margenes', 'Alertas', 'BCV/Custom'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-black uppercase tracking-widest text-emerald-400">{t}</span>
                ))}
              </div>
            </div>

            {/* Finanzas */}
            <div data-reveal className="md:col-span-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-8 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-11 w-11 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-5 border border-emerald-500/20"><BadgeDollarSign size={20} className="text-emerald-400" /></div>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Finanzas 360</h3>
                <p className="text-white/30 text-sm leading-relaxed">CxC, CxP, Contabilidad y Conciliacion bancaria. Todo integrado.</p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-y-1.5 gap-x-3">
                {['CxC', 'CxP', 'Contab.', 'Conciliac.', 'Comparar', 'Audit Log'].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400"><CheckCircle2 size={9} />{t}</div>
                ))}
              </div>
            </div>

            {/* RRHH */}
            <div data-reveal className="md:col-span-4 rounded-2xl bg-gradient-to-br from-sky-950/30 to-[#020710] border border-sky-500/20 p-8 flex flex-col justify-between group hover:border-sky-500/35 transition-all">
              <div>
                <div className="h-11 w-11 rounded-xl bg-sky-500/15 flex items-center justify-center mb-5 border border-sky-500/20"><Users size={20} className="text-sky-400" /></div>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">RRHH & Nomina</h3>
                <p className="text-white/30 text-sm leading-relaxed">Empleados, nomina con adelantos, contratos y recibos en USD y Bs.</p>
              </div>
              <div className="mt-6 space-y-1.5">
                {['Adelantos descontados', 'Recibos automaticos', 'USD + Bs'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-sky-400/60"><Check size={10} className="text-sky-400" /> {f}</div>
                ))}
              </div>
            </div>

            {/* Tasas BCV */}
            <div data-reveal className="md:col-span-8 rounded-2xl bg-gradient-to-br from-amber-950/30 to-[#020710] border border-amber-500/20 p-8 flex flex-col md:flex-row gap-6 items-center group hover:border-amber-500/35 transition-all">
              <div className="flex-1">
                <div className="h-11 w-11 rounded-xl bg-amber-500/15 flex items-center justify-center mb-5 border border-amber-500/20"><TrendingUp size={20} className="text-amber-400" /></div>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Tasas BCV + Custom</h3>
                <p className="text-white/30 text-sm leading-relaxed max-w-md">BCV oficial en vivo + hasta 3 tasas custom configurables. Los precios se recalculan automaticamente al cambiar las tasas.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['Fetch BCV Auto', 'Tasas Custom', 'Precios Dinamicos', 'OCR imagenes'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15 text-[9px] font-black uppercase tracking-widest text-amber-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-48 space-y-2 shrink-0">
                {[
                  { label: 'BCV Oficial', value: bcvRate ? `${bcvRate} Bs/$` : '---', c: 'text-amber-400', bg: 'bg-amber-500/10', b: 'border-amber-500/20' },
                  { label: 'Fuente', value: 'BCV.ORG', c: 'text-emerald-400', bg: 'bg-emerald-500/10', b: 'border-emerald-500/20' },
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${r.bg} border ${r.b}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{r.label}</span>
                    <span className={`text-xs font-black ${r.c}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Before vs After — inline */}
            <div data-reveal className="md:col-span-6 rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center"><X size={14} className="text-rose-400" /></div>
                <p className="text-sm font-black text-rose-400">Sin Dualis</p>
              </div>
              <ul className="space-y-3">
                {['Cuaderno o Excel para ventas', 'Calcular IVA e IGTF a mano', 'Buscar la tasa en Google', 'Inventario desactualizado', 'Cero control de operaciones'].map(t => (
                  <li key={t} className="flex items-start gap-2.5"><Minus size={11} className="text-rose-400/50 shrink-0 mt-0.5" /><span className="text-[11px] text-white/35">{t}</span></li>
                ))}
              </ul>
            </div>
            <div data-reveal className="md:col-span-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center"><Check size={14} className="text-emerald-400" /></div>
                <p className="text-sm font-black text-emerald-400">Con Dualis</p>
              </div>
              <ul className="space-y-3">
                {['POS profesional con ticket y escaner', 'IVA + IGTF calculados automaticamente', 'Tasas BCV + custom con precios dinamicos', 'Inventario en tiempo real con alertas', 'Portal de clientes con estado de cuenta', 'Dashboard BI con alertas predictivas'].map(t => (
                  <li key={t} className="flex items-start gap-2.5"><CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" /><span className="text-[11px] text-white/50">{t}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SYSTEM PREVIEW ════════════════════════════════════════════════════════ */}
      <section className="py-14 bg-[#020508]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-400 block mb-3">Vista Previa</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-3">Mira el sistema por dentro.</h2>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6" data-reveal>
            {([
              { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart3 },
              { id: 'pos' as const, label: 'POS Detal', icon: ShoppingCart },
              { id: 'inventario' as const, label: 'Inventario', icon: Package },
            ]).map(t => (
              <button key={t.id} onClick={() => setPreviewTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${previewTab === t.id ? 'text-white shadow-lg' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'}`}
                style={previewTab === t.id ? { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' } : undefined}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          <div ref={mockupRef} data-reveal className="rounded-2xl border border-white/[0.08] bg-[#0a0e1a] overflow-hidden shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" /></div>
              <div className="flex-1 mx-4 px-3 py-1 rounded-lg bg-white/[0.04] text-center">
                <span className="text-[9px] text-white/20 font-mono">dualis-system.vercel.app/{previewTab === 'dashboard' ? 'admin/dashboard' : previewTab === 'pos' ? 'pos/detal' : 'admin/inventario'}</span>
              </div>
            </div>
            <div className="p-5 min-h-[340px]">
              {previewTab === 'dashboard' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between"><div><p className="text-lg font-black text-white">Dashboard</p><p className="text-[10px] text-white/25">Resumen general</p></div></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[{ label: 'Ventas del mes', val: '$0.00', c: 'text-emerald-400' }, { label: 'CxC pendiente', val: '$0.00', c: 'text-amber-400' }, { label: 'Productos', val: '0', c: 'text-sky-400' }, { label: 'Tasa BCV', val: bcvRate || '---', c: 'text-amber-400' }].map(k => (
                      <div key={k.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5">{k.label}</p>
                        <p className={`text-xl font-black ${k.c}`}>{k.val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-3">Ventas ultimos 7 dias</p>
                    <div className="flex items-end gap-2 h-20">
                      {[15, 35, 25, 55, 40, 70, 50].map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full rounded-t" style={{ height: `${h}%`, background: i === 6 ? 'linear-gradient(to top, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.06)' }} />
                          <span className="text-[7px] text-white/15">{['L','M','X','J','V','S','D'][i]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {previewTab === 'pos' && (
                <div className="grid md:grid-cols-[1fr,260px] gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-3"><p className="text-lg font-black text-white">POS Detal</p></div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]"><ScanLine size={14} className="text-white/20" /><span className="text-[11px] text-white/20">Buscar producto...</span></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {DEMO_PRODUCTS.slice(0, 6).map(p => (
                        <div key={p.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                          <div className="text-xl mb-1">{p.emoji}</div>
                          <p className="text-[10px] font-bold text-white/60">{p.name}</p>
                          <p className="text-[9px] font-black text-emerald-400">${p.price.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#060a16] p-4">
                    <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-3">Carrito</p>
                    <div className="flex flex-col items-center justify-center gap-2 py-6"><ShoppingCart size={24} className="text-white/10" /><p className="text-[10px] text-white/20">Agrega productos</p></div>
                    <div className="mt-3 pt-3 border-t border-white/[0.06]">
                      <div className="flex justify-between text-[10px] mb-1"><span className="text-white/25">Subtotal</span><span className="text-white/40">$0.00</span></div>
                      <div className="flex justify-between text-sm font-black pt-2 border-t border-white/[0.06]"><span className="text-white/50">Total</span><span className="text-white">$0.00</span></div>
                    </div>
                  </div>
                </div>
              )}
              {previewTab === 'inventario' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between"><p className="text-lg font-black text-white">Inventario</p></div>
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] bg-white/[0.02] border-b border-white/[0.06]">
                      {['Producto', 'Stock', 'P. Detal', 'P. Mayor', 'Estado'].map(h => (
                        <div key={h} className="px-4 py-2.5 text-[8px] font-black text-white/20 uppercase tracking-widest">{h}</div>
                      ))}
                    </div>
                    {[
                      { name: 'Aceite Mazeite 1L', stock: 48, pd: 6.50, pm: 5.80, status: 'ok' },
                      { name: 'Pasta Sindoni 500g', stock: 120, pd: 3.00, pm: 2.50, status: 'ok' },
                      { name: 'Leche Completa 1L', stock: 3, pd: 4.25, pm: 3.80, status: 'low' },
                      { name: 'Pollo Entero 1kg', stock: 0, pd: 7.80, pm: 7.00, status: 'out' },
                    ].map((p, i) => (
                      <div key={i} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <div className="px-4 py-2.5 text-[11px] font-bold text-white/50">{p.name}</div>
                        <div className="px-4 py-2.5 text-[11px] font-black text-white/40">{p.stock}</div>
                        <div className="px-4 py-2.5 text-[11px] text-emerald-400 font-bold">${p.pd.toFixed(2)}</div>
                        <div className="px-4 py-2.5 text-[11px] text-sky-400 font-bold">${p.pm.toFixed(2)}</div>
                        <div className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${p.status === 'ok' ? 'bg-emerald-500/15 text-emerald-400' : p.status === 'low' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                            {p.status === 'ok' ? 'OK' : p.status === 'low' ? 'Bajo' : 'Agotado'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ ALL MODULES ═══════════════════════════════════════════════════════════ */}
      <section ref={modulesRef} className="py-14 bg-[#020710]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 block mb-3">Modulos del Sistema</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">19 modulos. <span className="text-white/[0.18]">Una sola plataforma.</span></h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} data-reveal className={`rounded-xl border ${m.border} ${m.bg} p-4 group hover:brightness-125 transition-all duration-300`}>
                  <div className={`h-8 w-8 rounded-lg ${m.bg} border ${m.border} flex items-center justify-center mb-3`}><Icon size={15} className={m.color} /></div>
                  <h4 className="text-sm font-black text-white mb-1">{m.label}</h4>
                  <p className="text-[10px] text-white/[0.28] leading-relaxed">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ ROADMAP + FISCAL ══════════════════════════════════════════════════════ */}
      <section className="py-14 bg-[#030915]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 block mb-3">Roadmap</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">Transparencia total.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-8">
            <div data-reveal className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center"><CheckCircle2 size={15} className="text-emerald-400" /></div>
                <h3 className="text-base font-black text-emerald-400">Listo y funcionando</h3>
              </div>
              <ul className="space-y-2.5">
                {['POS Detal + Mayor', 'Multi-cuenta (BCV + custom)', 'Precios dinamicos por tasa', 'Tasas custom configurables (hasta 3)', 'Inventario con Kardex y margenes', 'CxC y CxP completo', 'Portal de clientes', 'Limite de credito por cliente', 'Solicitudes de abono', 'Pronto pago (descuento)', 'RRHH & Nomina', 'Tasas BCV en vivo', 'VisionLab IA (Gemini)', 'Dashboard BI con alertas predictivas', 'Reportes y P&L', 'Libro de Ventas', 'Contabilidad', 'Audit Logs', 'Roles y permisos', 'IVA 16% + IGTF 3%', 'URL personalizada', 'Centro de Ayuda con tooltips', 'Tooltips contextuales en cada seccion'].map(t => (
                  <li key={t} className="flex items-center gap-2"><Check size={12} className="text-emerald-400 shrink-0" /><span className="text-[11px] text-white/45">{t}</span></li>
                ))}
              </ul>
            </div>

            <div data-reveal className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center"><Rocket size={15} className="text-amber-400" /></div>
                <h3 className="text-base font-black text-amber-400">En desarrollo</h3>
              </div>
              <ul className="space-y-2.5">
                {[
                  { label: 'Factura Legal SENIAT', p: 'CRITICO' }, { label: 'Arqueo de Caja + Reporte Z', p: 'CRITICO' },
                  { label: 'Cotizaciones y presupuestos', p: 'ALTO' }, { label: 'Historial completo por cliente', p: 'ALTO' },
                  { label: 'Conciliación bancaria CSV', p: 'MEDIO' }, { label: 'Notificaciones push', p: 'MEDIO' },
                  { label: 'App móvil nativa', p: 'FUTURO' },
                ].map(t => (
                  <li key={t.label} className="flex items-center gap-2">
                    <div className={`shrink-0 h-1.5 w-1.5 rounded-full ${t.p === 'CRITICO' ? 'bg-rose-400' : t.p === 'ALTO' ? 'bg-amber-400' : t.p === 'MEDIO' ? 'bg-sky-400' : 'bg-white/20'}`} />
                    <span className="text-[11px] text-white/45 flex-1">{t.label}</span>
                    <span className={`text-[8px] font-black uppercase tracking-wider ${t.p === 'CRITICO' ? 'text-rose-400/70' : t.p === 'ALTO' ? 'text-amber-400/70' : t.p === 'MEDIO' ? 'text-sky-400/70' : 'text-white/15'}`}>{t.p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Beta timeline */}
          <div data-reveal className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 mb-6">
            <div className="flex items-center gap-3 mb-4"><Rocket size={14} className="text-indigo-400" /><p className="text-sm font-black text-white">Fase Beta Abierta</p></div>
            <div className="relative">
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" style={{ width: '40%' }} /></div>
              <div className="flex justify-between mt-3">
                {[{ label: 'Alpha', done: true }, { label: 'Beta Abierta', done: true }, { label: 'Fiscal SENIAT', done: false }, { label: 'v1.0', done: false }].map((phase, i) => (
                  <div key={i} className="flex flex-col items-center gap-1"><div className={`w-3 h-3 rounded-full border-2 ${phase.done ? 'bg-indigo-500 border-indigo-400' : 'bg-transparent border-white/20'}`} /><span className={`text-[9px] font-black uppercase tracking-widest ${phase.done ? 'text-indigo-400' : 'text-white/20'}`}>{phase.label}</span></div>
                ))}
              </div>
            </div>
          </div>

          {/* Legal disclaimer */}
          <div data-reveal className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] to-rose-500/[0.06] p-5 flex items-start gap-4">
            <Shield size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">IMPORTANTE</p>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Dualis ERP esta en fase <strong className="text-amber-400">BETA</strong> y actualmente <strong className="text-rose-400">NO esta homologado por el SENIAT</strong>. Las facturas generadas <strong className="text-rose-400">no tienen validez fiscal</strong> hasta completar la certificacion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SECURITY ══════════════════════════════════════════════════════════════ */}
      <section className="py-14 bg-[#020710]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 block mb-3">Seguridad</span>
            <h2 className="text-4xl font-black tracking-tight text-white">Tus datos, solo tuyos.</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Lock, label: 'Cifrado TLS/AES', desc: 'Datos cifrados en transito y en reposo.' },
              { icon: ShieldCheck, label: 'Firestore Rules', desc: 'Aislamiento total entre empresas.' },
              { icon: Fingerprint, label: 'Auth Firebase', desc: 'Tokens JWT de Google.' },
              { icon: ClipboardList, label: 'Audit Log', desc: 'Cada accion queda registrada.' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} data-reveal className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] p-4 text-center">
                  <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/15 flex items-center justify-center mx-auto mb-3"><Icon size={16} className="text-rose-400" /></div>
                  <h4 className="text-xs font-black text-white mb-1">{item.label}</h4>
                  <p className="text-[10px] text-white/[0.22] leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ PRICING ═══════════════════════════════════════════════════════════════ */}
      <section ref={pricingRef} className="py-14 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">Planes</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-3">Precio simple. <span className="text-white/[0.18]">Sin sorpresas.</span></h2>
            <div className="inline-flex items-center gap-3 p-1 rounded-xl border border-white/[0.08] bg-white/[0.03] mt-5">
              <button onClick={() => setPricingAnnual(false)} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25'}`}>Mensual</button>
              <button onClick={() => setPricingAnnual(true)} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25'}`}>
                Anual <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-6">
            {/* Starter */}
            <div data-reveal className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-950/20 to-[#020710] p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center"><Zap size={16} className="text-sky-400" /></div>
                <div><p className="text-[9px] font-black text-sky-400 uppercase tracking-[0.2em]">{PLAN_CONFIG[0].name}</p><p className="text-[10px] text-white/25">{PLAN_CONFIG[0].tagline}</p></div>
              </div>
              <div className="flex items-end gap-2 mb-1"><span className="text-5xl font-black text-white">${price(PLAN_CONFIG[0].price)}</span><span className="text-white/20 text-[9px] font-bold mb-1">/mes</span></div>
              {bcvRate && <p className="text-[10px] text-white/15 font-bold mb-4">Bs. {(price(PLAN_CONFIG[0].price) * parseFloat(bcvRate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + IVA</p>}
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-6" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>Empezar gratis 30d</button>
              <ul className="space-y-2.5">
                {PLAN_CONFIG[0].features.map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <Check size={11} className="text-emerald-400 shrink-0" />
                    <span className="text-[11px] text-white/45">{f}</span>
                  </li>
                ))}
                {['POS Mayor', 'Precios dinamicos', 'RRHH', 'VisionLab IA'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <Minus size={11} className="text-white/[0.12] shrink-0" />
                    <span className="text-[11px] text-white/15">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Negocio */}
            <div data-reveal className="relative rounded-2xl p-7 flex flex-col plan-card-popular" style={{ background: 'linear-gradient(160deg, rgba(79,70,229,0.12) 0%, rgba(13,20,36,1) 50%, rgba(2,7,16,1) 100%)', border: '1px solid rgba(99,102,241,0.4)' }}>
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <div className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>Más Popular</div>
              </div>
              <div className="flex items-center gap-3 mb-4 mt-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"><Building2 size={16} className="text-indigo-400" /></div>
                <div><p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">{PLAN_CONFIG[1].name}</p><p className="text-[10px] text-white/25">{PLAN_CONFIG[1].tagline}</p></div>
              </div>
              <div className="flex items-end gap-2 mb-1"><span className="text-5xl font-black text-white">${price(PLAN_CONFIG[1].price)}</span><span className="text-white/20 text-[9px] font-bold mb-1">/mes</span></div>
              {bcvRate && <p className="text-[10px] text-white/15 font-bold mb-4">Bs. {(price(PLAN_CONFIG[1].price) * parseFloat(bcvRate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + IVA</p>}
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 mb-6" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>Activar gratis 30d</button>
              <ul className="space-y-2.5">
                {PLAN_CONFIG[1].features.map(f => (
                  <li key={f} className="flex items-center gap-2"><Check size={11} className="text-emerald-400 shrink-0" /><span className="text-[11px] text-white/55">{f}</span></li>
                ))}
              </ul>
            </div>

            {/* Enterprise */}
            <div data-reveal className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/20 to-[#020710] p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center"><Crown size={16} className="text-violet-400" /></div>
                <div><p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em]">{PLAN_CONFIG[2].name}</p><p className="text-[10px] text-white/25">{PLAN_CONFIG[2].tagline}</p></div>
              </div>
              <div className="flex items-end gap-2 mb-1"><span className="text-5xl font-black text-white">${price(PLAN_CONFIG[2].price)}</span><span className="text-white/20 text-[9px] font-bold mb-1">/mes</span></div>
              {bcvRate && <p className="text-[10px] text-white/15 font-bold mb-4">Bs. {(price(PLAN_CONFIG[2].price) * parseFloat(bcvRate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + IVA</p>}
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-6" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}>Activar gratis 30d</button>
              <ul className="space-y-2.5">
                {PLAN_CONFIG[2].features.map(f => (
                  <li key={f} className="flex items-center gap-2"><Check size={11} className="text-emerald-400 shrink-0" /><span className="text-[11px] text-white/50">{f}</span></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Compare toggle */}
          <div className="text-center mb-6" data-reveal>
            <button onClick={() => setShowCompare(p => !p)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
              <Activity size={12} /> {showCompare ? 'Ocultar' : 'Ver'} comparativa <ChevronDown size={12} className={`transition-transform ${showCompare ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showCompare && (
            <div data-reveal className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-6">
              <div className="flex items-center gap-2 p-3 border-b border-white/[0.06] overflow-x-auto">
                {cats.map(c => (
                  <button key={c} onClick={() => setActiveCat(c)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeCat === c ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400' : 'text-white/25 hover:text-white/50'}`}>{c}</button>
                ))}
              </div>
              <div className="grid grid-cols-[1fr,80px,80px,80px] border-b border-white/[0.07]">
                <div className="px-5 py-3" />
                {['Starter', 'Negocio', 'Enterprise'].map((p, i) => (
                  <div key={p} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${i === 1 ? 'text-indigo-400 bg-indigo-500/[0.05]' : 'text-white/30'}`}>{p}</div>
                ))}
              </div>
              {filteredRows.map((row, i) => (
                <div key={i} className={`grid grid-cols-[1fr,80px,80px,80px] border-b border-white/[0.04] hover:bg-white/[0.02] ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                  <div className="px-5 py-3"><span className="text-[10px] font-bold text-white/40">{row.label}</span></div>
                  <div className="py-3 text-center flex items-center justify-center"><CellVal val={row.s} /></div>
                  <div className="py-3 text-center flex items-center justify-center bg-indigo-500/[0.03]"><CellVal val={row.n} /></div>
                  <div className="py-3 text-center flex items-center justify-center"><CellVal val={row.e} /></div>
                </div>
              ))}
            </div>
          )}

          <div data-reveal className="text-center py-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-white/30 text-sm">
              Todos incluyen <span className="text-white font-black">30 dias gratis</span> &middot; Sin tarjeta &middot; <span className="text-emerald-400 font-black">Tus datos siempre son tuyos</span>
            </p>
          </div>

          {/* ── Ver más: Add-ons & Extras ─────────────────────────── */}
          <div className="text-center mt-6" data-reveal>
            <button onClick={() => setShowAddons(p => !p)} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/20 transition-all">
              <Package size={12} /> {showAddons ? 'Ocultar' : 'Ver más'}: Extras y complementos <ChevronDown size={12} className={`transition-transform ${showAddons ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showAddons && (
            <div data-reveal className="mt-6 space-y-4">
              <div className="text-center mb-2">
                <h3 className="text-2xl font-black text-white mb-1">Complementos disponibles</h3>
                <p className="text-sm text-white/25">Potencia tu plan con módulos adicionales</p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: 'Usuarios extra', price: ADDON_PRICES.extraUsers, unit: '/usuario/mes', desc: 'Agrega usuarios ilimitados a cualquier plan.', border: 'border-sky-500/20 hover:border-sky-500/40', bg: 'bg-sky-500/[0.04]', accent: 'text-sky-400' },
                  { label: 'Productos extra', price: ADDON_PRICES.extraProducts, unit: '/1,000 prod/mes', desc: 'Expande tu catálogo sin límites.', border: 'border-emerald-500/20 hover:border-emerald-500/40', bg: 'bg-emerald-500/[0.04]', accent: 'text-emerald-400' },
                  { label: 'Sucursal extra', price: ADDON_PRICES.extraSucursales, unit: '/sucursal/mes', desc: 'Gestiona más puntos de venta.', border: 'border-amber-500/20 hover:border-amber-500/40', bg: 'bg-amber-500/[0.04]', accent: 'text-amber-400' },
                  { label: 'VisionLab IA', price: ADDON_PRICES.visionLab, unit: '/mes', desc: 'Inteligencia artificial con Gemini para tu negocio.', border: 'border-violet-500/20 hover:border-violet-500/40', bg: 'bg-violet-500/[0.04]', accent: 'text-violet-400' },
                  { label: 'Conciliación bancaria', price: ADDON_PRICES.conciliacion, unit: '/mes', desc: 'Importa CSV bancario y concilia automáticamente.', border: 'border-indigo-500/20 hover:border-indigo-500/40', bg: 'bg-indigo-500/[0.04]', accent: 'text-indigo-400' },
                  { label: 'RRHH Pro', price: ADDON_PRICES.rrhhPro, unit: '/mes', desc: 'Nomina avanzada, prestamos y reportes.', border: 'border-rose-500/20 hover:border-rose-500/40', bg: 'bg-rose-500/[0.04]', accent: 'text-rose-400' },
                  { label: 'Precios Dinamicos', price: ADDON_PRICES.preciosDinamicos, unit: '/mes', desc: 'Tasas custom + precios que se recalculan automaticamente. Incluido en Enterprise.', border: 'border-amber-500/20 hover:border-amber-500/40', bg: 'bg-amber-500/[0.04]', accent: 'text-amber-400' },
                ].map(addon => (
                  <div key={addon.label} className={`rounded-xl border ${addon.border} ${addon.bg} p-5 transition-all`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-black text-white">{addon.label}</h4>
                      <span className={`${addon.accent} font-black text-sm`}>+${addon.price}</span>
                    </div>
                    <p className="text-[10px] text-white/25 font-bold uppercase tracking-widest mb-2">{addon.unit}</p>
                    <p className="text-[11px] text-white/35 leading-relaxed">{addon.desc}</p>
                    {bcvRate && <p className="text-[9px] text-white/15 font-bold mt-2">Bs. {(addon.price * parseFloat(bcvRate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                  </div>
                ))}
              </div>

              {/* Payment methods */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-4 text-center">Métodos de pago aceptados</p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {[
                    { name: 'Binance Pay', detail: 'USDT' },
                    { name: 'Pago Móvil', detail: 'Bancamiga' },
                    { name: 'Transferencia', detail: 'Bancamiga' },
                    { name: 'PayPal', detail: 'USD' },
                  ].map(m => (
                    <div key={m.name} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <Banknote size={13} className="text-emerald-400/60" />
                      <div>
                        <p className="text-[11px] font-black text-white/50">{m.name}</p>
                        <p className="text-[8px] text-white/20 font-bold">{m.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-white/15 mt-4">Verificación manual en menos de 24 horas · Sin tarjeta de crédito requerida</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══ FAQ ═══════════════════════════════════════════════════════════════════ */}
      <section ref={faqRef} className="py-14 bg-[#020710]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-8" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 block mb-3">FAQ</span>
            <h2 className="text-4xl font-black tracking-tight text-white">Preguntas Frecuentes</h2>
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} data-reveal className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-all">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                  <span className="text-sm font-black text-white/75 pr-4">{item.q}</span>
                  <ChevronDown size={15} className={`text-white/25 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <div className="px-5 pb-4"><p className="text-sm text-white/35 leading-relaxed">{item.a}</p></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ════════════════════════════════════════════════════════════ */}
      <section className="py-16 bg-[#020508] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.18]" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,.55) 0%, rgba(139,92,246,.2) 35%, transparent 65%)' }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10" data-reveal>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
            <Rocket size={11} className="text-indigo-400" /><span className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-400">Sin compromiso</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-[-0.04em] text-white mb-5">
            Listo para<br /><span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient">ordenar tu negocio?</span>
          </h2>
          <p className="text-white/30 text-lg mb-8 max-w-xl mx-auto">30 dias gratis. Sin tarjeta. Sin trampa.</p>
          {betaCount !== null && betaCount > 0 && <p className="text-[11px] text-indigo-400/60 font-black mb-5">{betaCount} empresas ya estan probando Dualis</p>}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => navigate('/register')} className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black uppercase tracking-widest text-white hover:-translate-y-1 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 20px 60px -12px rgba(99,102,241,.65)' }}>
              Crear cuenta gratis <ArrowRight size={18} />
            </button>
            <a href={`https://wa.me/584125343141?text=${encodeURIComponent('Hola, quiero saber mas sobre Dualis ERP')}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black text-white/40 border border-white/[0.1] hover:text-white hover:border-white/25 transition-all">
              Hablar con un asesor <ChevronRight size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ══ ALREADY HAVE AN ACCOUNT BANNER ═════════════════════════════════════ */}
      <section className="py-14 bg-gradient-to-r from-indigo-950/40 via-[#070b14] to-violet-950/40 border-y border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Building2 size={28} className="text-indigo-400/60 mx-auto mb-3" />
          <h3 className="text-xl md:text-2xl font-black text-white mb-2">¿Ya tienes cuenta?</h3>
          <p className="text-white/30 text-sm mb-4">Accede a tu sistema desde el link personalizado de tu empresa.</p>
          <div className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <Globe size={14} className="text-indigo-400/60" />
            <span className="text-sm font-mono font-bold text-indigo-400">tuempresa.dualis.online</span>
          </div>
          <p className="text-[10px] text-white/15 mt-3">Todos los miembros acceden desde el subdominio de su empresa.</p>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.06] py-10 bg-[#020710]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Logo className="h-7 w-auto mb-3" textClassName="text-white" />
              <p className="text-[11px] text-white/25 leading-relaxed mb-3">ERP Cloud hecho en Venezuela<br />USD + Bs &middot; BCV en vivo</p>
              {bcvRate && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-[9px] font-black text-amber-400">BCV {bcvRate} Bs/$</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-emerald-400 transition-all"><MessageSquare size={13} /></a>
                <a href="https://t.me/+584125343141" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-sky-400 transition-all"><Send size={13} /></a>
                <a href="mailto:yisus_xd77@hotmail.com" className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-indigo-400 transition-all"><Mail size={13} /></a>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-3">Producto</p>
              <ul className="space-y-2.5">
                {[{ label: 'Demo', action: () => scrollTo(demoRef) }, { label: 'Funciones', action: () => scrollTo(featuresRef) }, { label: 'Modulos', action: () => scrollTo(modulesRef) }, { label: 'Precios', action: () => scrollTo(pricingRef) }].map(l => (
                  <li key={l.label}><button onClick={l.action} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">{l.label}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-3">Legal</p>
              <ul className="space-y-2.5">
                <li><a href="/terms" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Terminos</a></li>
                <li><a href="/privacy" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Privacidad</a></li>
                <li><button onClick={() => setShowFeedback(true)} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Reportar bug</button></li>
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-3">Contacto</p>
              <ul className="space-y-2.5">
                <li><a href="mailto:yisus_xd77@hotmail.com" className="text-[11px] text-white/30 hover:text-indigo-400 transition-colors">yisus_xd77@hotmail.com</a></li>
                <li><a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-emerald-400 transition-colors">WhatsApp &middot; +58 412-534-3141</a></li>
              </ul>
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="text-[9px] font-black text-white/15 uppercase tracking-widest mb-1">Creado por</p>
                <p className="text-[11px] text-indigo-400/60 font-black">Jesus Salazar</p>
                <p className="text-[10px] text-white/20">Full-Stack Developer &middot; Venezuela</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-white/15">&copy; 2025 Dualis ERP &middot; Hecho en Venezuela &#x1F1FB;&#x1F1EA;</p>
            <p className="text-[10px] text-white/15">Cloud &middot; Tiempo real &middot; Multi-moneda USD/VES</p>
          </div>
        </div>
      </footer>

      {/* ══ FLOATING FEEDBACK BUTTON ═════════════════════════════════════════════ */}
      <button onClick={() => setShowFeedback(true)}
        className="fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-2xl transition-all hover:-translate-y-1 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 30px -8px rgba(99,102,241,.6)' }}>
        <MessageSquare size={14} /><span className="hidden sm:inline">Feedback</span>
      </button>

      {/* ══ FEEDBACK MODAL ═══════════════════════════════════════════════════════ */}
      {showFeedback && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowFeedback(false); }}>
          <div className="w-full max-w-md bg-[#0d1424] border border-white/[0.1] rounded-2xl p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <div><p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-1">Feedback</p><h3 className="text-lg font-black text-white">Cuentame que paso</h3></div>
              <button onClick={() => setShowFeedback(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] text-white/30 hover:text-white flex items-center justify-center"><X size={14} /></button>
            </div>
            {feedbackSent ? (
              <div className="text-center py-6">
                <p className="font-black text-white mb-1">Recibido!</p>
                <p className="text-[11px] text-white/30">Tu feedback fue guardado y enviado.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  {([['bug', 'Bug'], ['idea', 'Idea'], ['otro', 'Otro']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setFeedbackType(t)}
                      className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${feedbackType === t ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400' : 'bg-white/[0.04] border border-white/[0.07] text-white/30'}`}>{label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input value={feedbackName} onChange={e => setFeedbackName(e.target.value)} placeholder="Nombre (opcional)" className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  <input value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)} placeholder="Email (opcional)" className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                </div>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="Describe el problema o sugerencia..." rows={3}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none mb-3" />
                <div className="mb-4">
                  <input ref={feedbackFileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) setFeedbackImages(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => feedbackFileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all"><ImageIcon size={11} /> Adjuntar</button>
                    {feedbackImages.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <span className="text-[9px] text-indigo-400 truncate max-w-[80px]">{f.name}</span>
                        <button onClick={() => setFeedbackImages(prev => prev.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowFeedback(false)} className="flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">Cancelar</button>
                  <button onClick={sendFeedback} disabled={!feedbackText.trim() || feedbackSending}
                    className="flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                    {feedbackSending ? <><Loader2 size={12} className="animate-spin" /> Enviando...</> : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
