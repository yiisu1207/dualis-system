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
  Cpu, Fingerprint, MessageSquare, Play, Eye, Globe, Server,
  ImageIcon, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getCountFromServer, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinary';
import Logo from './ui/Logo';

/* ═══════════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════════ */

const HERO_WORDS = ['tu inventario.', 'tus ventas.', 'tu nomina.', 'tus finanzas.', 'tu negocio.'];

const MODULES = [
  { icon: ShoppingCart, label: 'POS Detal',        desc: 'Ventas al contado, escaner, modo offline, ticket digital.',              color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: Building2,   label: 'POS Mayor',         desc: 'Terminal mayorista con credito 15/30/45 dias y precios escalonados.',    color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { icon: FileText,    label: 'CxC / Clientes',    desc: 'Cuentas por cobrar, historial completo y deudas en USD y Bs.',           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Layers,      label: 'CxP / Proveedores', desc: 'Cuentas por pagar y relacion con proveedores.',                         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: BookOpen,    label: 'Contabilidad',      desc: 'Libro diario, mayor y balance automatico integrado.',                    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Landmark,    label: 'Conciliacion',      desc: 'Conciliacion bancaria con importacion CSV.',                             color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { icon: Package,     label: 'Inventario Pro',    desc: 'Kardex, alertas de stock minimo y Smart Advisor de margen.',             color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Monitor,     label: 'Cajas / Arqueo',    desc: 'Gestion de turnos, arqueo y reporte Z por cajero.',                     color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Users,       label: 'RRHH & Nomina',     desc: 'Empleados, nomina, adelantos, vacaciones y recibos.',                   color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  { icon: Sparkles,    label: 'VisionLab IA',      desc: 'Gemini analiza tu negocio: P&L, Cash Flow, alertas.',                   color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: BarChart3,   label: 'Reportes',          desc: 'KPIs, comisiones por vendedor, P&L y exportacion Excel/PDF.',           color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { icon: History,     label: 'Rate History',       desc: 'Historial colaborativo de tasas con OCR e importacion CSV masiva.',     color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: TrendingUp,  label: 'Tasas BCV Live',    desc: 'Tasa oficial + grupo propio. Propagacion instantanea.',                  color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { icon: ShieldCheck, label: 'Audit Logs',         desc: 'Kardex de auditoria inmutable. Export PDF/CSV/Excel.',                  color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  { icon: HelpCircle,  label: 'Centro de Ayuda',   desc: 'Wiki integrada con instrucciones de cada boton y flujo.',               color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
  { icon: Sliders,     label: 'Config. Avanzada',  desc: 'IVA, IGTF, roles y permisos por usuario.',                              color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
];

const FAQ_ITEMS = [
  { q: 'Funciona para empresas venezolanas?', a: 'Si, esta disenado 100% para Venezuela. Maneja USD y bolivares, IVA 16%, IGTF 3%, tasa BCV oficial, y proximamente libros SENIAT.' },
  { q: 'Mis datos estan seguros?', a: 'Dualis usa Firebase de Google con cifrado en transito y en reposo. Tus datos estan aislados de otras empresas — nadie mas puede acceder a ellos.' },
  { q: 'Puedo usar Dualis sin internet?', a: 'El POS Detal tiene modo offline. Las ventas se guardan localmente y sincronizan al reconectar. Los demas modulos requieren conexion.' },
  { q: 'Cuantos usuarios puedo tener?', a: 'Starter: 2 usuarios. Negocio: 5 usuarios. Enterprise: ilimitados. Puedes agregar usuarios extra por $3/mes desde cualquier plan.' },
  { q: 'Puedo exportar mis datos?', a: 'Si. Inventario, CxC, reportes, auditoria y nomina se exportan en Excel, PDF o CSV desde cada modulo.' },
  { q: 'Necesito tarjeta para la prueba?', a: 'No. Los 30 dias de prueba son completamente gratis y sin tarjeta. Solo necesitas registrarte con tu email.' },
  { q: 'Que pasa al terminar los 30 dias?', a: 'Puedes elegir un plan de pago para continuar. Tus datos se conservan durante 30 dias adicionales despues de la expiracion.' },
  { q: 'Hay soporte en espanol?', a: 'Si. Soporte completo en espanol via WhatsApp y email. Los planes Negocio y Enterprise incluyen soporte prioritario.' },
];

const TICKER_ITEMS = [
  'POS Detal Cloud', 'POS Mayorista', 'Tasas BCV Live', 'RRHH & Nomina',
  'Inventario Pro', 'VisionLab IA', 'CxC & CxP', 'Conciliacion Bancaria',
  'Multi-moneda USD/VES', 'Roles & Permisos', 'Audit Logs', 'Exportar Excel/PDF',
  'Modo Offline POS', 'Webhooks Automaticos', 'Arqueo de Caja', 'Reporte Z',
];

const DEMO_PRODUCTS = [
  { id: 1, name: 'Aceite 1L',     price: 6.50, emoji: '\u{1FAD9}', color: 'amber'   },
  { id: 2, name: 'Pasta 500g',    price: 3.00, emoji: '\u{1F35D}', color: 'yellow'  },
  { id: 3, name: 'Leche 1L',      price: 4.25, emoji: '\u{1F95B}', color: 'sky'     },
  { id: 4, name: 'Pollo 1kg',     price: 7.80, emoji: '\u{1F357}', color: 'orange'  },
  { id: 5, name: 'Arroz 1kg',     price: 2.50, emoji: '\u{1F33E}', color: 'emerald' },
  { id: 6, name: 'Jabon Caja',    price: 1.75, emoji: '\u{1F9FC}', color: 'violet'  },
];

const COMPARE_ROWS = [
  { cat: 'Ventas', label: 'POS Detal (contado)',             s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'POS Mayor (credito 15/30/45d)',   s: false,      n: true,           e: true       },
  { cat: 'Ventas', label: 'Descuentos y combos',             s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'IGTF e IVA automatico',           s: true,       n: true,           e: true       },
  { cat: 'Ventas', label: 'Ticket 80mm / WhatsApp',          s: true,       n: true,           e: true       },
  { cat: 'Finanzas', label: 'CxC — Cuentas por cobrar',      s: 'basica',   n: true,           e: true       },
  { cat: 'Finanzas', label: 'CxP — Proveedores',             s: false,      n: true,           e: true       },
  { cat: 'Finanzas', label: 'Contabilidad (libro + balance)', s: false,     n: true,           e: true       },
  { cat: 'Finanzas', label: 'Conciliacion Bancaria',         s: false,      n: false,          e: true       },
  { cat: 'Inventario', label: 'Inventario + Kardex',         s: '500 prod', n: 'ilimitado',    e: 'ilimitado'},
  { cat: 'Inventario', label: 'Alertas de stock minimo',     s: true,       n: true,           e: true       },
  { cat: 'Inventario', label: 'Smart Advisor de margen',     s: false,      n: true,           e: true       },
  { cat: 'Equipo', label: 'Usuarios',                        s: '2',        n: '5',            e: 'Ilimitados'},
  { cat: 'Equipo', label: 'Sucursales',                      s: '1',        n: '2',            e: '5'        },
  { cat: 'Equipo', label: 'Roles y permisos granulares',     s: false,      n: true,           e: true       },
  { cat: 'Equipo', label: 'RRHH & Nomina',                   s: false,      n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'Tasas BCV automaticas',    s: false,      n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'Reportes KPI + P&L',      s: 'basico',   n: true,           e: true       },
  { cat: 'IA & Reportes', label: 'VisionLab IA (Gemini)',    s: false,      n: '+$19/mes',     e: true       },
  { cat: 'IA & Reportes', label: 'Comparar Libros',          s: false,      n: true,           e: true       },
  { cat: 'Seguridad', label: 'Audit Logs',                   s: false,      n: 'basico',       e: 'inmutable'},
  { cat: 'Seguridad', label: 'Webhooks & Automatizacion',    s: false,      n: false,          e: true       },
  { cat: 'Soporte', label: 'Canal de soporte',               s: 'Email',    n: 'WhatsApp',     e: 'Prioritario'},
];

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled]           = useState(false);
  const [bcvRate, setBcvRate]             = useState<string | null>(null);
  const [openFaq, setOpenFaq]             = useState<number | null>(null);
  const [pricingAnnual, setPricingAnnual] = useState(false);
  const [showCompare, setShowCompare]     = useState(false);
  const [activeCat, setActiveCat]         = useState('Todos');
  const [betaCount, setBetaCount]         = useState<number | null>(null);
  const [previewTab, setPreviewTab]       = useState<'dashboard' | 'pos' | 'inventario'>('dashboard');

  // Typewriter
  const [wordIdx, setWordIdx]   = useState(0);
  const [charIdx, setCharIdx]   = useState(0);
  const [deleting, setDeleting] = useState(false);

  // Demo POS
  const [demoCart, setDemoCart]   = useState<Record<number, number>>({});
  const [demoPaid, setDemoPaid]   = useState(false);

  // Feedback
  const [showFeedback, setShowFeedback]   = useState(false);
  const [feedbackType, setFeedbackType]   = useState<'bug' | 'idea' | 'otro'>('bug');
  const [feedbackText, setFeedbackText]   = useState('');
  const [feedbackName, setFeedbackName]   = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<File[]>([]);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent]   = useState(false);
  const feedbackFileRef = useRef<HTMLInputElement>(null);

  const heroRef     = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const modulesRef  = useRef<HTMLElement>(null);
  const pricingRef  = useRef<HTMLElement>(null);
  const faqRef      = useRef<HTMLElement>(null);
  const demoRef     = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ── Scroll & reveal ─────────────────────────────────── */
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

  /* ── BCV rate ─────────────────────────────────────────── */
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

  /* ── Real beta user counter from Firestore ────────────── */
  useEffect(() => {
    getCountFromServer(collection(db, 'users'))
      .then(snap => setBetaCount(snap.data().count))
      .catch(() => setBetaCount(null));
  }, []);

  /* ── Typewriter effect ────────────────────────────────── */
  useEffect(() => {
    const word = HERO_WORDS[wordIdx];
    const speed = deleting ? 40 : 80;
    const timeout = setTimeout(() => {
      if (!deleting && charIdx < word.length) {
        setCharIdx(c => c + 1);
      } else if (!deleting && charIdx === word.length) {
        setTimeout(() => setDeleting(true), 1800);
      } else if (deleting && charIdx > 0) {
        setCharIdx(c => c - 1);
      } else {
        setDeleting(false);
        setWordIdx(i => (i + 1) % HERO_WORDS.length);
      }
    }, speed);
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx]);

  const price = (monthly: number) =>
    pricingAnnual ? Math.round(monthly * 0.8) : monthly;

  /* ── Demo POS helpers ─────────────────────────────────── */
  const demoSubtotal = DEMO_PRODUCTS.reduce((s, p) => s + p.price * (demoCart[p.id] ?? 0), 0);
  const demoIva      = demoSubtotal * 0.16;
  const demoIgtf     = demoSubtotal * 0.03;
  const demoTotal    = demoSubtotal + demoIva + demoIgtf;
  const demoBs       = bcvRate ? demoTotal * parseFloat(bcvRate) : null;
  const demoItemCount = (Object.values(demoCart) as number[]).reduce((s, q) => s + q, 0);

  const addToDemo = (id: number) => setDemoCart(c => ({ ...c, [id]: Math.min((c[id] ?? 0) + 1, 99) }));
  const remFromDemo = (id: number) => setDemoCart(c => {
    const next = { ...c, [id]: (c[id] ?? 0) - 1 };
    if (next[id] <= 0) delete next[id];
    return next;
  });
  const resetDemo = () => { setDemoCart({}); setDemoPaid(false); };

  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    try {
      // Upload images to Cloudinary
      const imageUrls: string[] = [];
      for (const file of feedbackImages) {
        const result = await uploadToCloudinary(file, 'dualis_avatars');
        imageUrls.push(result.secure_url);
      }
      // Save to Firestore
      await addDoc(collection(db, 'feedback'), {
        type: feedbackType,
        message: feedbackText.trim(),
        name: feedbackName.trim() || undefined,
        email: feedbackEmail.trim() || undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        status: 'nuevo',
        createdAt: serverTimestamp(),
        source: 'landing',
      });
      // Also send to WhatsApp
      const typeLabel = feedbackType === 'bug' ? '🐛 Bug' : feedbackType === 'idea' ? '💡 Sugerencia' : '💬 Comentario';
      const waText = encodeURIComponent(
        `${typeLabel} — Dualis Feedback\n\n` +
        (feedbackName.trim() ? `De: ${feedbackName.trim()}\n` : '') +
        (feedbackEmail.trim() ? `Email: ${feedbackEmail.trim()}\n` : '') +
        `\n${feedbackText.trim()}` +
        (imageUrls.length > 0 ? `\n\nImagenes:\n${imageUrls.join('\n')}` : '')
      );
      window.open(`https://wa.me/584125343141?text=${waText}`, '_blank');
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setFeedbackName(''); setFeedbackEmail(''); setFeedbackImages([]); setShowFeedback(false); }, 3000);
    } catch (e) {
      console.error('Error enviando feedback:', e);
    }
    setFeedbackSending(false);
  };

  const CellVal = ({ val }: { val: boolean | string }) => {
    if (val === true)  return <Check size={15} className="text-emerald-400 mx-auto" />;
    if (val === false) return <Minus size={15} className="text-white/15 mx-auto" />;
    return <span className="text-[10px] font-black text-indigo-400 leading-tight">{val as string}</span>;
  };

  const cats = ['Todos', ...Array.from(new Set(COMPARE_ROWS.map(r => r.cat)))];
  const filteredRows = activeCat === 'Todos' ? COMPARE_ROWS : COMPARE_ROWS.filter(r => r.cat === activeCat);
  const currentWord = HERO_WORDS[wordIdx].slice(0, charIdx);

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
        @keyframes glow-pulse{ 0%,100%{box-shadow:0 0 40px -15px rgba(99,102,241,.4)} 50%{box-shadow:0 0 80px -10px rgba(99,102,241,.7)} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes orbit     { 0%{transform:rotate(0deg) translateX(140px) rotate(0deg)} 100%{transform:rotate(360deg) translateX(140px) rotate(-360deg)} }
        @keyframes count-up  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .ticker-track      { animation:ticker 55s linear infinite; }
        .ticker-track:hover{ animation-play-state:paused; }
        .animate-gradient  { background-size:200% 200%; animation:gradx 6s ease infinite; }
        .float-a           { animation:float-y  5s  ease-in-out infinite; }
        .float-b           { animation:float-y2 7s  ease-in-out infinite; animation-delay:-2.5s; }
        .float-c           { animation:float-y3 4.5s ease-in-out infinite; animation-delay:-1s; }
        .pulse-dot         { animation:pulse-dot 2s ease-in-out infinite; }
        .glow-hero         { animation:glow-pulse 4s ease-in-out infinite; }
        .cursor-blink      { animation:blink 1s step-end infinite; }

        [data-reveal]            { opacity:0; transform:translateY(28px); transition:opacity .65s ease,transform .65s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.08s}
        [data-reveal]:nth-child(3){transition-delay:.16s}
        [data-reveal]:nth-child(4){transition-delay:.24s}
        [data-reveal]:nth-child(5){transition-delay:.32s}
        [data-reveal]:nth-child(6){transition-delay:.40s}

        .glass { background:rgba(255,255,255,0.03); backdrop-filter:blur(20px); }
        .gradient-border { position:relative; }
        .gradient-border::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(99,102,241,.4),rgba(139,92,246,.15),rgba(99,102,241,.06)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .shimmer { background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.06) 50%,transparent 100%); background-size:200% 100%; animation:shimmer 3s infinite; }
        .plan-card-popular { box-shadow:0 0 0 1px rgba(99,102,241,.5), 0 30px 80px -20px rgba(99,102,241,.4); }
        .notification-card { animation:slide-in-r .6s ease .8s both; }
        .sale-card         { animation:slide-in-r .6s ease 1.1s both; }
        .ai-card           { animation:slide-in-r .6s ease 1.4s both; }
      `}</style>

      {/* ══ TOP BANNER ══════════════════════════════════════════════════════════ */}
      <div className="fixed top-0 inset-x-0 z-[110] overflow-hidden">
        <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 py-2 px-4">
          <div className="absolute inset-0 shimmer" />
          <div className="relative flex items-center justify-center gap-4 flex-wrap text-center">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70">Beta Abierta</span>
            <span className="text-white/25 hidden sm:inline">&middot;</span>
            {betaCount !== null && betaCount > 0 ? (
              <span className="text-[10px] font-black text-amber-300">
                {betaCount} {betaCount === 1 ? 'empresa probando' : 'empresas probando'} Dualis ahora
              </span>
            ) : betaCount === 0 ? (
              <span className="text-[10px] font-black text-amber-300">Se de los primeros en probar Dualis</span>
            ) : (
              <span className="text-[10px] font-black text-white">30 dias gratis &middot; Sin tarjeta &middot; Sin contrato</span>
            )}
            <span className="text-white/25 hidden sm:inline">&middot;</span>
            <span className="text-[10px] font-black text-emerald-300 hidden sm:inline">Hecho en Venezuela</span>
            <button onClick={() => navigate('/register')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-[9px] font-black uppercase tracking-widest transition-all">
              Comenzar <ArrowRight size={9} />
            </button>
          </div>
        </div>
      </div>

      {/* ══ NAVBAR ══════════════════════════════════════════════════════════════ */}
      <nav className={`fixed inset-x-0 z-[100] transition-all duration-500 top-[30px] ${
        scrolled ? 'bg-[#020710]/90 backdrop-blur-2xl border-b border-white/[0.06] py-3' : 'bg-transparent py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-7 w-auto" textClassName="text-white" />
          </div>
          <div className="hidden lg:flex items-center gap-0.5">
            {[
              { label: 'Demo', ref: demoRef },
              { label: 'Funciones', ref: featuresRef },
              { label: 'Modulos',   ref: modulesRef  },
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

      {/* ══ HERO ════════════════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative pt-44 pb-24 overflow-hidden min-h-screen flex items-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] opacity-25"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.6) 0%, rgba(139,92,246,.2) 35%, transparent 65%)' }} />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-10"
            style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,.8), transparent 70%)' }} />
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* LEFT — Copy */}
            <div>
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur mb-8"
                style={{ animation: 'fade-up .5s ease both' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">BCV en vivo</span>
                <span className="text-[10px] font-black text-emerald-400">
                  {bcvRate ? `${bcvRate} Bs/$` : 'conectando...'}
                </span>
                {betaCount !== null && betaCount > 0 && (
                  <>
                    <span className="text-white/20">&middot;</span>
                    <span className="text-[10px] font-black text-indigo-400">{betaCount} en beta</span>
                  </>
                )}
              </div>

              <h1 className="text-[clamp(2.8rem,6.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6"
                style={{ animation: 'fade-up .6s ease .1s both' }}>
                <span className="text-white">Controla</span><br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient">
                  {currentWord}
                </span>
                <span className="cursor-blink text-indigo-400">|</span>
              </h1>

              <p className="text-lg text-white/35 font-medium leading-relaxed mb-3"
                style={{ animation: 'fade-up .6s ease .2s both' }}>
                POS + Inventario + Finanzas + RRHH + IA — todo en un solo sistema.
                En bolivares y dolares. Con tasas BCV en vivo.
              </p>
              <p className="text-sm text-white/20 leading-relaxed mb-10"
                style={{ animation: 'fade-up .6s ease .25s both' }}>
                Sin servidores que administrar. Sin instalaciones. Sin sorpresas en la factura.
                <span className="text-indigo-400/50 font-bold"> Hecho en Venezuela, para Venezuela.</span>
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4 mb-14"
                style={{ animation: 'fade-up .6s ease .3s both' }}>
                <button onClick={() => navigate('/register')}
                  className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-1 active:scale-95 glow-hero"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                  Empezar 30 dias gratis <ArrowRight size={16} />
                </button>
                <button onClick={() => scrollTo(demoRef)}
                  className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-sm font-black text-white/40 border border-white/[0.08] hover:border-white/20 hover:text-white transition-all">
                  Probar el POS <Play size={14} />
                </button>
              </div>

              {/* Real stats - only things that are true */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                style={{ animation: 'fade-up .6s ease .4s both' }}>
                {[
                  { val: '16+',   label: 'Modulos' },
                  { val: '100%',  label: 'Cloud' },
                  { val: '2',     label: 'Terminales POS' },
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
              <div className="absolute inset-x-0 top-8 rounded-3xl border border-white/[0.08] bg-[#0a0e1a]/90 backdrop-blur-xl p-6 float-a shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[9px] font-black text-white/25 uppercase tracking-widest">Resumen del dia</p>
                    <p className="text-xl font-black text-white mt-0.5">Dashboard Principal</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                    <span className="text-[9px] font-black text-emerald-400">En vivo</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Ventas hoy', val: '$0.00', sub: 'Tu primera venta te espera', c: 'text-emerald-400', bg: 'bg-emerald-500/8' },
                    { label: 'Productos', val: '0', sub: 'Importa tu inventario', c: 'text-amber-400', bg: 'bg-amber-500/8' },
                    { label: 'Tasa BCV', val: bcvRate ? `${bcvRate}` : '---', sub: 'Bs/$ en vivo', c: 'text-sky-400', bg: 'bg-sky-500/8' },
                  ].map(k => (
                    <div key={k.label} className={`rounded-2xl ${k.bg} border border-white/[0.06] p-3`}>
                      <p className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-1.5">{k.label}</p>
                      <p className={`text-lg font-black ${k.c}`}>{k.val}</p>
                      <p className="text-[9px] text-white/25 mt-0.5">{k.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-1.5 h-16">
                  {[35, 58, 42, 75, 62, 88, 54, 70, 45, 92, 68, 80].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-sm"
                      style={{ height: `${h}%`, background: i === 11 ? 'linear-gradient(to top, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.06)' }} />
                  ))}
                </div>
                <p className="text-[8px] text-white/15 mt-1.5">Vista previa &middot; Tus datos reales apareceran aqui</p>
              </div>

              <div className="notification-card absolute -bottom-4 -left-6 w-64 rounded-2xl border border-indigo-500/25 bg-[#07091c]/95 backdrop-blur p-4 shadow-2xl shadow-indigo-900/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center">
                    <ShoppingCart size={14} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white">POS Detal</p>
                    <p className="text-[9px] text-white/30">Venta al contado</p>
                  </div>
                  <span className="ml-auto text-xs font-black text-emerald-400">$24.00</span>
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[8px] text-white/20 uppercase tracking-widest">Ejemplo de venta</span>
                  <span className="text-[8px] font-black text-emerald-400 uppercase">Pagado</span>
                </div>
              </div>

              <div className="sale-card absolute -right-4 top-1/3 w-52 rounded-2xl border border-amber-500/25 bg-[#100a00]/90 backdrop-blur p-4 shadow-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Tasas en vivo</p>
                </div>
                {[
                  { label: 'BCV Oficial', val: bcvRate ? `${bcvRate} Bs/$` : '...', c: 'text-amber-400' },
                  { label: 'IGTF',        val: '3%',        c: 'text-white/50' },
                  { label: 'IVA',         val: '16%',       c: 'text-white/50' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-[9px] text-white/25 uppercase tracking-widest">{r.label}</span>
                    <span className={`text-[10px] font-black ${r.c}`}>{r.val}</span>
                  </div>
                ))}
              </div>

              <div className="ai-card absolute -right-2 bottom-8 w-56 rounded-2xl border border-violet-500/25 bg-[#0c0718]/90 backdrop-blur p-4 shadow-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-violet-400" />
                  <p className="text-[9px] font-black text-violet-400">VisionLab IA</p>
                </div>
                <p className="text-[10px] text-white/50 leading-relaxed">
                  "Preguntame cualquier cosa sobre tu negocio. Analizo tus datos en tiempo real."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TICKER ══════════════════════════════════════════════════════════════ */}
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

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 block mb-4">Asi de facil</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">
              3 pasos. <span className="text-white/20">Listo.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '01', icon: Mail, title: 'Registrate', desc: 'Crea tu cuenta con email. Verificacion por codigo. 30 dias gratis, sin tarjeta.', color: 'indigo' },
              { step: '02', icon: Sliders, title: 'Configura', desc: 'Sube tu inventario, configura IVA/IGTF, agrega tu equipo. 5 minutos.', color: 'violet' },
              { step: '03', icon: ShoppingCart, title: 'Vende', desc: 'Abre el POS y registra tu primera venta. Inventario, CxC y contabilidad se actualizan solos.', color: 'emerald' },
            ].map((s, i) => (
              <div key={i} data-reveal className={`relative rounded-3xl border border-${s.color}-500/20 bg-${s.color}-500/[0.04] p-8 group hover:border-${s.color}-500/40 transition-all`}>
                <div className={`text-[80px] font-black text-${s.color}-500/[0.06] absolute top-4 right-6 leading-none select-none`}>{s.step}</div>
                <div className={`h-12 w-12 rounded-2xl bg-${s.color}-500/15 flex items-center justify-center mb-6 border border-${s.color}-500/20`}>
                  <s.icon size={22} className={`text-${s.color}-400`} />
                </div>
                <h3 className="text-xl font-black text-white mb-2">{s.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ INTERACTIVE POS DEMO ════════════════════════════════════════════════ */}
      <section ref={demoRef} className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.15) 0%, transparent 60%)' }} />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12" data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-5">
              <Play size={11} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-400">Pruebalo ahora mismo</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-4">
              Asi se ve el POS real.<br /><span className="text-white/20">Toca. Prueba. Decide.</span>
            </h2>
            <p className="text-white/30 text-sm max-w-md mx-auto">
              Agrega productos, ve el calculo en USD y bolivares con IVA + IGTF reales, y procesa la venta. Esto es exactamente lo que veras dentro del sistema.
            </p>
          </div>

          <div data-reveal className="grid lg:grid-cols-[1fr,340px] gap-5">
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
                    <button key={p.id} onClick={() => addToDemo(p.id)} disabled={demoPaid}
                      className={`relative rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 active:scale-95 group ${
                        qty > 0 ? 'border-indigo-500/40 bg-indigo-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'
                      }`}>
                      {qty > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center shadow-lg">{qty}</span>
                      )}
                      <div className="text-2xl mb-2">{p.emoji}</div>
                      <p className="text-xs font-black text-white mb-0.5">{p.name}</p>
                      <p className="text-[10px] font-black text-emerald-400">${p.price.toFixed(2)}</p>
                      {bcvRate && <p className="text-[9px] text-white/25 mt-0.5">{(p.price * parseFloat(bcvRate)).toFixed(0)} Bs</p>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-white/20 mt-4 text-center">Clic para agregar &middot; En el sistema real: escaner o codigo de barras</p>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-[#07091a] p-6 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Carrito</p>
                {demoItemCount > 0 && !demoPaid && (
                  <button onClick={resetDemo} className="text-[9px] text-white/20 hover:text-rose-400 transition-colors font-black uppercase tracking-widest">Vaciar</button>
                )}
              </div>

              {demoPaid ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Check size={28} className="text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-white text-lg mb-1">Venta procesada!</p>
                    <p className="text-[11px] text-white/30">Ticket generado &middot; Inventario actualizado</p>
                    <p className="text-[11px] text-emerald-400 font-black mt-1">${demoTotal.toFixed(2)} cobrado</p>
                  </div>
                  <button onClick={resetDemo} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">Nueva venta &rarr;</button>
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
                          <p className="text-[9px] text-white/30">${p.price.toFixed(2)} x {demoCart[p.id]}</p>
                        </div>
                        <p className="text-xs font-black text-white shrink-0">${(p.price * demoCart[p.id]).toFixed(2)}</p>
                        <button onClick={() => remFromDemo(p.id)}
                          className="w-5 h-5 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-white/30 hover:text-rose-400 flex items-center justify-center transition-all text-xs font-black shrink-0">-</button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/[0.07] pt-4 space-y-1.5 mb-5">
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">Subtotal</span><span className="text-white/60 font-bold">${demoSubtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">IVA 16%</span><span className="text-white/60 font-bold">${demoIva.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[10px]"><span className="text-white/30">IGTF 3%</span><span className="text-white/60 font-bold">${demoIgtf.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm font-black pt-1 border-t border-white/[0.07]">
                      <span className="text-white">Total USD</span><span className="text-emerald-400">${demoTotal.toFixed(2)}</span>
                    </div>
                    {demoBs && (
                      <div className="flex justify-between text-[11px] font-black">
                        <span className="text-white/30">Total Bs.</span><span className="text-amber-400">{demoBs.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setDemoPaid(true)}
                    className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                    Procesar venta &middot; ${demoTotal.toFixed(2)}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="text-center mt-8" data-reveal>
            <p className="text-[11px] text-white/20 mb-4">IVA + IGTF calculados con la tasa BCV real de hoy &middot; Esto es la interfaz real del sistema</p>
            <button onClick={() => navigate('/register')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/10 transition-all">
              Crear cuenta y usar el POS real <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* ══ BENTO FEATURES ══════════════════════════════════════════════════════ */}
      <section ref={featuresRef} className="py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Por que Dualis</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              Todo conectado.<br /><span className="text-white/18">Nada duplicado.</span>
            </h2>
            <p className="text-white/25 text-base mt-5 max-w-xl mx-auto">
              Una venta en el POS actualiza inventario, CxC, contabilidad y reportes — al mismo tiempo, sin pasos manuales.
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-5">
            {/* POS */}
            <div data-reveal className="md:col-span-8 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 to-[#020710] p-10 relative overflow-hidden group hover:border-indigo-500/35 transition-all">
              <div className="absolute right-8 top-8 opacity-50 group-hover:opacity-90 transition-opacity float-a">
                <div className="w-56 h-40 rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur p-4 text-left">
                  <div className="text-[8px] font-black text-white/25 uppercase tracking-widest mb-3">Terminal &middot; Detal</div>
                  {[['Aceite 1L x2', '$13.00'], ['Pasta 500g x4', '$12.00'], ['Leche 1L x1', '$4.25']].map(([n, v]) => (
                    <div key={n} className="flex justify-between text-[9px] mb-1.5">
                      <span className="text-white/40">{n}</span>
                      <span className="text-emerald-400 font-black">{v}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/[0.07] flex justify-between text-xs font-black">
                    <span className="text-white/25">Total</span><span className="text-white">$29.25</span>
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-6 border border-indigo-500/20">
                <ShoppingCart size={22} className="text-indigo-400" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 tracking-tight">POS Detal + Mayor</h3>
              <p className="text-white/30 text-base leading-relaxed max-w-md">
                Terminal de venta al contado y al credito. Escaner de camara, modo offline, multi-pago (Bs + USD), IGTF automatico y ticket 80mm.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Modo Offline', 'Escaner Camara', 'Multi-pago', 'Ticket 80mm', 'Credito 15/30/45d', 'IGTF Auto'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 text-[9px] font-black uppercase tracking-widest text-indigo-400">{t}</span>
                ))}
              </div>
            </div>

            {/* VisionLab */}
            <div data-reveal className="md:col-span-4 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-[#020710] p-10 flex flex-col justify-between group hover:border-violet-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mb-6 border border-violet-500/20">
                  <Brain size={22} className="text-violet-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">VisionLab IA</h3>
                <p className="text-white/30 text-sm leading-relaxed">
                  Gemini analiza tus datos y responde en espanol: "Cual fue mi mejor mes?", "Cuanto debo cobrar?", predicciones de demanda.
                </p>
              </div>
              <div className="mt-8 space-y-2">
                {["P&L automatico", "Alertas de anomalias", "Predicciones"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-violet-300/60"><Sparkles size={10} className="text-violet-400" /> {f}</div>
                ))}
              </div>
            </div>

            {/* Inventario */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <Package size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Inventario Pro</h3>
                <p className="text-white/30 text-sm leading-relaxed">Kardex en tiempo real, precios detal/mayor independientes, alertas de stock minimo y Smart Advisor de margen optimo.</p>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Kardex', 'Multi-precio', 'Alertas', 'Smart Advisor'].map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-black uppercase tracking-widest text-emerald-400">{t}</span>
                ))}
              </div>
            </div>

            {/* Finanzas */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-950/30 to-[#020710] border border-emerald-500/20 p-10 flex flex-col justify-between group hover:border-emerald-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <BadgeDollarSign size={22} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Finanzas 360</h3>
                <p className="text-white/30 text-sm leading-relaxed">CxC, CxP, Contabilidad y Conciliacion bancaria. Todo integrado y auditado.</p>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-y-1.5 gap-x-3">
                {['CxC', 'CxP', 'Contab.', 'Conciliac.', 'Comparar', 'Audit Log'].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-400"><CheckCircle2 size={9} />{t}</div>
                ))}
              </div>
            </div>

            {/* RRHH */}
            <div data-reveal className="md:col-span-4 rounded-3xl bg-gradient-to-br from-sky-950/30 to-[#020710] border border-sky-500/20 p-10 flex flex-col justify-between group hover:border-sky-500/35 transition-all">
              <div>
                <div className="h-12 w-12 rounded-2xl bg-sky-500/15 flex items-center justify-center mb-6 border border-sky-500/20">
                  <Users size={22} className="text-sky-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">RRHH & Nomina</h3>
                <p className="text-white/30 text-sm leading-relaxed">Empleados, nomina con adelantos descontados, contratos y recibos de pago en USD y Bs.</p>
              </div>
              <div className="mt-8 space-y-1.5">
                {['Adelantos descontados', 'Recibos automaticos', 'USD + Bs'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] text-sky-400/60"><Check size={10} className="text-sky-400" /> {f}</div>
                ))}
              </div>
            </div>

            {/* Tasas BCV */}
            <div data-reveal className="md:col-span-8 rounded-3xl bg-gradient-to-br from-amber-950/30 to-[#020710] border border-amber-500/20 p-10 flex flex-col md:flex-row gap-8 items-center group hover:border-amber-500/35 transition-all">
              <div className="flex-1">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mb-6 border border-amber-500/20">
                  <TrendingUp size={22} className="text-amber-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Tasas BCV en Vivo</h3>
                <p className="text-white/30 text-sm leading-relaxed max-w-md">
                  Fetch automatico desde el BCV oficial. Historial colaborativo con soporte OCR e importacion CSV masiva.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['Fetch BCV Auto', 'OCR imagenes', 'CSV masivo', 'Propagacion instant.'].map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15 text-[9px] font-black uppercase tracking-widest text-amber-400">{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-52 space-y-2 shrink-0">
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
          </div>
        </div>
      </section>

      {/* ══ SYSTEM PREVIEW ════════════════════════════════════════════════════ */}
      <section className="py-32 bg-[#020508]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-400 block mb-4">Vista Previa</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-4">
              Mira el sistema por dentro.<br /><span className="text-white/20">Sin registrarte.</span>
            </h2>
          </div>

          {/* Tab selector */}
          <div className="flex items-center justify-center gap-2 mb-8" data-reveal>
            {([
              { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart3 },
              { id: 'pos' as const, label: 'POS Detal', icon: ShoppingCart },
              { id: 'inventario' as const, label: 'Inventario', icon: Package },
            ]).map(t => (
              <button key={t.id} onClick={() => setPreviewTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  previewTab === t.id ? 'text-white shadow-lg' : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                }`}
                style={previewTab === t.id ? { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 25px -8px rgba(99,102,241,.5)' } : undefined}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Preview mockup */}
          <div data-reveal className="rounded-3xl border border-white/[0.08] bg-[#0a0e1a] overflow-hidden shadow-2xl shadow-black/50">
            {/* Top bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              </div>
              <div className="flex-1 mx-4 px-3 py-1 rounded-lg bg-white/[0.04] text-center">
                <span className="text-[9px] text-white/20 font-mono">dualis-system.vercel.app/{previewTab === 'dashboard' ? 'admin/dashboard' : previewTab === 'pos' ? 'pos/detal' : 'admin/inventario'}</span>
              </div>
            </div>

            {/* Content area */}
            <div className="p-6 min-h-[380px]">
              {previewTab === 'dashboard' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div><p className="text-lg font-black text-white">Dashboard</p><p className="text-[10px] text-white/25">Resumen general de tu negocio</p></div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" /><span className="text-[9px] font-black text-emerald-400">Tiempo real</span></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Ventas del mes', val: '$0.00', sub: 'Empieza vendiendo', c: 'text-emerald-400' },
                      { label: 'CxC pendiente', val: '$0.00', sub: '0 clientes', c: 'text-amber-400' },
                      { label: 'Productos', val: '0', sub: 'Importa tu catalogo', c: 'text-sky-400' },
                      { label: 'Tasa BCV', val: bcvRate || '---', sub: 'Bs/$ hoy', c: 'text-amber-400' },
                    ].map(k => (
                      <div key={k.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">{k.label}</p>
                        <p className={`text-xl font-black ${k.c}`}>{k.val}</p>
                        <p className="text-[9px] text-white/20 mt-1">{k.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-3">Ventas ultimos 7 dias</p>
                    <div className="flex items-end gap-2 h-24">
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
                <div className="grid md:grid-cols-[1fr,280px] gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-lg font-black text-white">POS Detal</p>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15">
                        <span className="text-[9px] font-black text-amber-400">BCV {bcvRate || '---'} Bs/$</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                        <ScanLine size={14} className="text-white/20" />
                        <span className="text-[11px] text-white/20">Buscar producto o escanear codigo...</span>
                      </div>
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
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                      <ShoppingCart size={24} className="text-white/10" />
                      <p className="text-[10px] text-white/20">Agrega productos</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/[0.06]">
                      <div className="flex justify-between text-[10px] mb-1"><span className="text-white/25">Subtotal</span><span className="text-white/40">$0.00</span></div>
                      <div className="flex justify-between text-[10px] mb-1"><span className="text-white/25">IVA 16%</span><span className="text-white/40">$0.00</span></div>
                      <div className="flex justify-between text-sm font-black pt-2 border-t border-white/[0.06]"><span className="text-white/50">Total</span><span className="text-white">$0.00</span></div>
                    </div>
                  </div>
                </div>
              )}

              {previewTab === 'inventario' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black text-white">Inventario</p>
                    <div className="flex gap-2">
                      <span className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-black text-indigo-400">+ Agregar producto</span>
                      <span className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[9px] font-black text-white/30">Importar CSV</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-0 bg-white/[0.02] border-b border-white/[0.06]">
                      {['Producto', 'Stock', 'P. Detal', 'P. Mayor', 'Estado'].map(h => (
                        <div key={h} className="px-4 py-3 text-[8px] font-black text-white/20 uppercase tracking-widest">{h}</div>
                      ))}
                    </div>
                    {[
                      { name: 'Aceite Mazeite 1L', stock: 48, pd: 6.50, pm: 5.80, status: 'ok' },
                      { name: 'Pasta Sindoni 500g', stock: 120, pd: 3.00, pm: 2.50, status: 'ok' },
                      { name: 'Leche Completa 1L', stock: 3, pd: 4.25, pm: 3.80, status: 'low' },
                      { name: 'Pollo Entero 1kg', stock: 0, pd: 7.80, pm: 7.00, status: 'out' },
                      { name: 'Arroz Mary 1kg', stock: 85, pd: 2.50, pm: 2.10, status: 'ok' },
                    ].map((p, i) => (
                      <div key={i} className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-0 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <div className="px-4 py-3 text-[11px] font-bold text-white/50">{p.name}</div>
                        <div className="px-4 py-3 text-[11px] font-black text-white/40">{p.stock}</div>
                        <div className="px-4 py-3 text-[11px] text-emerald-400 font-bold">${p.pd.toFixed(2)}</div>
                        <div className="px-4 py-3 text-[11px] text-sky-400 font-bold">${p.pm.toFixed(2)}</div>
                        <div className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            p.status === 'ok' ? 'bg-emerald-500/15 text-emerald-400' : p.status === 'low' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'
                          }`}>{p.status === 'ok' ? 'OK' : p.status === 'low' ? 'Bajo' : 'Agotado'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-white/15 text-center">Datos de ejemplo &middot; Tu inventario real aparecera aqui</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] text-white/20 text-center mt-6" data-reveal>
            Vista previa con datos de ejemplo &middot; Al registrarte veras tus datos reales
          </p>
        </div>
      </section>

      {/* ══ BEFORE vs AFTER ════════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 block mb-4">La diferencia</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white">
              Antes vs. con Dualis.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {/* ANTES */}
            <div data-reveal className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.03] p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center"><X size={16} className="text-rose-400" /></div>
                <p className="text-sm font-black text-rose-400">Sin Dualis</p>
              </div>
              <ul className="space-y-4">
                {[
                  'Cuaderno o Excel para registrar ventas',
                  'Calcular IVA e IGTF a mano',
                  'Buscar la tasa del dia en Google',
                  'No saber cuanto te deben en credito',
                  'Inventario desactualizado o inexistente',
                  'Nomina en hojas de calculo',
                  'Cero control de quien hizo que',
                  'Reportes? Ni hablar.',
                ].map(t => (
                  <li key={t} className="flex items-start gap-3">
                    <Minus size={12} className="text-rose-400/50 shrink-0 mt-0.5" />
                    <span className="text-[12px] text-white/35 leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* AHORA */}
            <div data-reveal className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.03] p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center"><Check size={16} className="text-emerald-400" /></div>
                <p className="text-sm font-black text-emerald-400">Con Dualis</p>
              </div>
              <ul className="space-y-4">
                {[
                  'POS profesional con ticket digital y escaner',
                  'IVA 16% + IGTF 3% calculados automaticamente',
                  'Tasa BCV oficial actualizada en vivo',
                  'CxC completo: quien debe, cuanto y desde cuando',
                  'Inventario en tiempo real con alertas de stock',
                  'Nomina con adelantos y recibos automaticos',
                  'Audit log inmutable — cada accion registrada',
                  'KPIs, P&L, comisiones y exportar en 1 clic',
                ].map(t => (
                  <li key={t} className="flex items-start gap-3">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-[12px] text-white/50 leading-relaxed">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ ROADMAP + CUMPLIMIENTO FISCAL ════════════════════════════════════ */}
      <section className="py-32 bg-[#070b14] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.04)_0%,transparent_70%)]" />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 block mb-4">Roadmap Publico</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              Transparencia total.<br /><span className="text-white/18">Lo que hay y lo que viene.</span>
            </h2>
            <p className="text-white/30 text-sm mt-4 max-w-xl mx-auto">Sin promesas vacias — cada feature se publica cuando esta listo. Asi sabes exactamente donde estamos.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* LISTO */}
            <div data-reveal className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <h3 className="text-lg font-black text-emerald-400">Listo y funcionando</h3>
              </div>
              <ul className="space-y-3">
                {[
                  'POS Detal — ventas al contado con ticket',
                  'POS Mayor — credito 15/30/45 dias',
                  'Inventario con Kardex y alertas',
                  'CxC y CxP completo',
                  'RRHH — empleados, nomina, adelantos',
                  'Tasas BCV en vivo + historial',
                  'VisionLab IA (Gemini)',
                  'Reportes, KPIs y P&L',
                  'Contabilidad — libro diario y balance',
                  'Audit Logs inmutables',
                  'Roles y permisos por usuario',
                  'Config fiscal — IVA 16%, IGTF 3%',
                  'Escaner de barras con camara',
                  'Centro de Ayuda integrado',
                ].map(t => (
                  <li key={t} className="flex items-center gap-2.5">
                    <Check size={13} className="text-emerald-400 shrink-0" />
                    <span className="text-[12px] text-white/45">{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* EN DESARROLLO */}
            <div data-reveal className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                  <Rocket size={16} className="text-amber-400" />
                </div>
                <h3 className="text-lg font-black text-amber-400">En desarrollo</h3>
              </div>
              <ul className="space-y-3">
                {[
                  { label: 'Limite de credito por cliente', priority: 'ALTO' },
                  { label: 'Historial completo por cliente', priority: 'ALTO' },
                  { label: 'Conciliacion bancaria con CSV', priority: 'MEDIO' },
                  { label: 'Webhooks y automatizaciones', priority: 'MEDIO' },
                  { label: 'Notificaciones push / email', priority: 'MEDIO' },
                  { label: 'Dashboard por sucursal', priority: 'MEDIO' },
                  { label: 'App movil nativa', priority: 'FUTURO' },
                  { label: 'Integracion con pasarelas de pago', priority: 'FUTURO' },
                ].map(t => (
                  <li key={t.label} className="flex items-center gap-2.5">
                    <div className={`shrink-0 h-1.5 w-1.5 rounded-full ${
                      t.priority === 'ALTO' ? 'bg-amber-400' :
                      t.priority === 'MEDIO' ? 'bg-sky-400' : 'bg-white/20'
                    }`} />
                    <span className="text-[12px] text-white/45 flex-1">{t.label}</span>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${
                      t.priority === 'ALTO' ? 'text-amber-400/70' :
                      t.priority === 'MEDIO' ? 'text-sky-400/70' : 'text-white/15'
                    }`}>{t.priority}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-4 border-t border-amber-500/10">
                <div className="flex items-center gap-2">
                  <Activity size={12} className="text-amber-400/50" />
                  <span className="text-[10px] text-white/20">Las prioridades cambian segun feedback de los beta testers</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── PRÓXIMAMENTE: CUMPLIMIENTO FISCAL Y LEGAL ── */}
          <div data-reveal className="rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.06] to-amber-500/[0.03] p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[radial-gradient(circle,rgba(244,63,94,0.08)_0%,transparent_70%)]" />
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
                    <Landmark size={20} className="text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Proximamente — Cumplimiento Fiscal y Legal</h3>
                    <p className="text-[11px] text-white/30 mt-0.5">Modulos fiscales obligatorios para operar legalmente en Venezuela</p>
                  </div>
                </div>
                <div className="sm:ml-auto flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-full px-4 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">En construccion</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    icon: Receipt,
                    title: 'Factura Legal SENIAT',
                    desc: 'Factura con numero de control, correlativo fiscal, RIF emisor/receptor, y formato segun Providencia Administrativa 0071.',
                    tag: 'CRITICO',
                  },
                  {
                    icon: BookOpen,
                    title: 'Libro de Ventas',
                    desc: 'Libro de ventas mensual con formato SENIAT para declaracion de IVA. Desglose por alicuota, exento, y base imponible.',
                    tag: 'CRITICO',
                  },
                  {
                    icon: FileText,
                    title: 'Libro de Compras',
                    desc: 'Registro de compras con retenciones de IVA aplicadas, numero de factura del proveedor y calculo automatico.',
                    tag: 'CRITICO',
                  },
                  {
                    icon: Calculator,
                    title: 'Arqueo de Caja y Reporte Z',
                    desc: 'Apertura y cierre de turno, conteo de billetes, cuadre de caja, y Reporte Z por cajero con totales fiscales.',
                    tag: 'CRITICO',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Homologacion SENIAT',
                    desc: 'Proceso de certificacion del software ante el SENIAT como sistema fiscal autorizado para emitir facturas legales.',
                    tag: 'EN PROCESO',
                  },
                  {
                    icon: Banknote,
                    title: 'Retenciones IVA e ISLR',
                    desc: 'Calculo y aplicacion automatica de retenciones de IVA (75%/100%) e ISLR segun la normativa vigente.',
                    tag: 'PLANIFICADO',
                  },
                  {
                    icon: ClipboardList,
                    title: 'Notas de Credito y Debito',
                    desc: 'Emision de notas de credito y debito fiscales con correlativo, vinculadas a la factura original.',
                    tag: 'PLANIFICADO',
                  },
                  {
                    icon: Fingerprint,
                    title: 'Validacion de RIF',
                    desc: 'Verificacion automatica del RIF de clientes y proveedores contra la base de datos del SENIAT.',
                    tag: 'PLANIFICADO',
                  },
                  {
                    icon: Server,
                    title: 'Respaldo Fiscal Inmutable',
                    desc: 'Almacenamiento inmutable de todas las facturas emitidas con hash de integridad para auditorias fiscales.',
                    tag: 'PLANIFICADO',
                  },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/15 flex items-center justify-center">
                          <Icon size={17} className="text-rose-400/80" />
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.tag === 'CRITICO' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' :
                          item.tag === 'EN PROCESO' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                          'bg-white/[0.06] text-white/30 border border-white/[0.08]'
                        }`}>{item.tag}</span>
                      </div>
                      <h4 className="text-sm font-black text-white mb-1.5">{item.title}</h4>
                      <p className="text-[11px] text-white/28 leading-relaxed">{item.desc}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-rose-500/10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <Shield size={16} className="text-rose-400/60 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/25 leading-relaxed">
                    <strong className="text-white/40">Nota legal:</strong> Dualis ERP se encuentra actualmente en fase beta. Los modulos fiscales listados estan en desarrollo activo y <strong className="text-white/40">aun no cumplen con los requisitos de homologacion del SENIAT</strong>. Hasta que estos modulos esten completos y certificados, las facturas generadas por el sistema <strong className="text-white/40">no tienen validez fiscal</strong>. Recomendamos mantener tu metodo de facturacion actual mientras completamos el proceso de certificacion.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ MULTIPLATAFORMA ═════════════════════════════════════════════════════ */}
      <section className="py-32 bg-[#020508] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.05)_0%,transparent_60%)]" />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Proximamente</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              En todas tus pantallas.<br /><span className="text-white/18">Un sistema, todas las plataformas.</span>
            </h2>
            <p className="text-white/30 text-sm mt-4 max-w-2xl mx-auto">Hoy Dualis funciona en cualquier navegador. Pronto tendras apps nativas para cada dispositivo — con la misma cuenta, los mismos datos, en tiempo real.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { platform: 'Windows', icon: '🪟', desc: 'App de escritorio nativa .exe con acceso directo y notificaciones del sistema.', status: 'EN DESARROLLO' },
              { platform: 'macOS',   icon: '🍎', desc: 'App nativa para Mac con soporte Silicon (M1/M2/M3) y Touch Bar.',              status: 'PLANIFICADO' },
              { platform: 'Linux',   icon: '🐧', desc: 'Paquete .deb/.AppImage para Ubuntu, Fedora y derivados.',                       status: 'PLANIFICADO' },
              { platform: 'Android', icon: '📱', desc: 'App en Google Play Store con POS movil, notificaciones push y modo offline.',   status: 'EN DESARROLLO' },
              { platform: 'iOS',     icon: '📲', desc: 'App en App Store para iPhone y iPad con interfaz adaptada.',                    status: 'PLANIFICADO' },
            ].map(p => (
              <div key={p.platform} data-reveal className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-center hover:bg-white/[0.05] hover:border-indigo-500/20 transition-all group">
                <div className="text-4xl mb-4">{p.icon}</div>
                <h4 className="text-sm font-black text-white mb-1">{p.platform}</h4>
                <p className="text-[10px] text-white/25 leading-relaxed mb-3">{p.desc}</p>
                <span className={`text-[8px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full inline-block ${
                  p.status === 'EN DESARROLLO'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-white/[0.06] text-white/30 border border-white/[0.08]'
                }`}>{p.status}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center" data-reveal>
            <div className="inline-flex items-center gap-3 bg-indigo-500/[0.08] border border-indigo-500/20 rounded-2xl px-6 py-4">
              <Globe size={18} className="text-indigo-400" />
              <div className="text-left">
                <p className="text-sm font-black text-white">Hoy: 100% Web</p>
                <p className="text-[11px] text-white/30">Funciona en Chrome, Firefox, Safari, Edge — cualquier dispositivo con navegador. Sin instalar nada.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ ALL MODULES ═════════════════════════════════════════════════════════ */}
      <section ref={modulesRef} className="py-32 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-400 block mb-4">Modulos del Sistema</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white">
              16 modulos.<br /><span className="text-white/18">Un solo login.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} data-reveal className={`rounded-2xl border ${m.border} ${m.bg} p-5 group hover:brightness-125 transition-all cursor-default`}>
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

      {/* ══ SECURITY ════════════════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 block mb-4">Seguridad</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">Tus datos, solo tuyos.</h2>
            <p className="text-white/22 text-sm mt-4 max-w-xl mx-auto">Infraestructura de Google Firebase con cifrado en transito y en reposo. Aislamiento total entre empresas.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Lock,          label: 'Cifrado TLS/AES',     desc: 'Datos cifrados en transito y en reposo.' },
              { icon: ShieldCheck,   label: 'Firestore Rules',      desc: 'Tu empresa no puede ver datos de otra.' },
              { icon: Fingerprint,   label: 'Auth Firebase',        desc: 'Tokens JWT de Google en cada sesion.' },
              { icon: ClipboardList, label: 'Audit Log Inmutable',  desc: 'Cada accion queda registrada para siempre.' },
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

      {/* ══ PRICING ═════════════════════════════════════════════════════════════ */}
      <section ref={pricingRef} className="py-32 bg-[#020508]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-4">Planes</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-[-0.04em] text-white mb-3">
              Precio simple.<br /><span className="text-white/18">Sin sorpresas.</span>
            </h2>
            <div className="inline-flex items-center gap-3 p-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] mt-6">
              <button onClick={() => setPricingAnnual(false)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>Mensual</button>
              <button onClick={() => setPricingAnnual(true)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>
                Anual <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Starter */}
            <div data-reveal className="rounded-3xl border border-sky-500/20 bg-gradient-to-b from-sky-950/20 to-[#020710] p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center"><Zap size={18} className="text-sky-400" /></div>
                <div><p className="text-[9px] font-black text-sky-400 uppercase tracking-[0.2em]">Starter</p><p className="text-[11px] text-white/25">Para comenzar</p></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/[0.07] border border-sky-500/15 mb-6">
                <Users size={11} className="text-sky-400 shrink-0" />
                <p className="text-[10px] text-sky-300/60 leading-snug">Ideal para 1-2 personas arrancando su negocio</p>
              </div>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-5xl font-black text-white">${price(24)}</span>
                <div className="mb-1"><span className="text-white/20 text-[9px] font-bold block">/mes</span>{pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $58/ano</span>}</div>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-8" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>Empezar Starter &mdash; gratis 30d</button>
              <ul className="space-y-3">
                {[
                  { ok: true, label: 'POS Detal completo' }, { ok: true, label: '500 productos en inventario' },
                  { ok: true, label: 'CxC basico' }, { ok: true, label: '2 usuarios &middot; 1 sucursal' },
                  { ok: true, label: 'Ticket digital / WhatsApp' }, { ok: true, label: 'Soporte por email' },
                  { ok: false, label: 'POS Mayor (credito)' }, { ok: false, label: 'CxP / Proveedores' },
                  { ok: false, label: 'RRHH & Nomina' }, { ok: false, label: 'VisionLab IA' },
                ].map(f => (
                  <li key={f.label} className="flex items-center gap-2.5">
                    {f.ok ? <Check size={12} className="text-emerald-400 shrink-0" /> : <Minus size={12} className="text-white/12 shrink-0" />}
                    <span className={`text-[11px] font-medium ${f.ok ? 'text-white/45' : 'text-white/15'}`}>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Negocio */}
            <div data-reveal className="relative rounded-3xl p-8 flex flex-col plan-card-popular" style={{ background: 'linear-gradient(160deg, rgba(79,70,229,0.12) 0%, rgba(13,20,36,1) 50%, rgba(2,7,16,1) 100%)', border: '1px solid rgba(99,102,241,0.4)' }}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <div className="px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-white" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 30px -5px rgba(99,102,241,.7)' }}>Mas Popular</div>
              </div>
              <div className="flex items-center gap-3 mb-5 mt-2">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"><Building2 size={18} className="text-indigo-400" /></div>
                <div><p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Negocio</p><p className="text-[11px] text-white/25">Para crecer en serio</p></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/[0.08] border border-indigo-500/20 mb-6">
                <Building2 size={11} className="text-indigo-400 shrink-0" />
                <p className="text-[10px] text-indigo-300/60 leading-snug">Para negocios con equipo, credito y control contable</p>
              </div>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-5xl font-black text-white">${price(49)}</span>
                <div className="mb-1"><span className="text-white/20 text-[9px] font-bold block">/mes</span>{pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $118/ano</span>}</div>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 mb-8" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 40px -10px rgba(99,102,241,.6)' }}>Activar Negocio &mdash; gratis 30d</button>
              <ul className="space-y-3">
                {[
                  { ok: true, label: 'Todo lo del Starter' }, { ok: true, label: 'POS Mayor — ventas a credito' },
                  { ok: true, label: 'Inventario ilimitado' }, { ok: true, label: 'CxC + CxP completo' },
                  { ok: true, label: 'RRHH & Nomina' }, { ok: true, label: 'Contabilidad (libro + balance)' },
                  { ok: true, label: 'Tasas BCV automaticas' }, { ok: true, label: '5 usuarios &middot; 2 sucursales' },
                  { ok: true, label: 'Reportes avanzados' }, { ok: true, label: 'Soporte WhatsApp' },
                  { ok: 'add' as any, label: 'VisionLab IA (+$19/mes)' },
                ].map(f => (
                  <li key={f.label} className="flex items-center gap-2.5">
                    {f.ok === true ? <Check size={12} className="text-emerald-400 shrink-0" /> : f.ok === 'add' ? <Sparkles size={12} className="text-violet-400 shrink-0" /> : <Minus size={12} className="text-white/12 shrink-0" />}
                    <span className={`text-[11px] font-medium ${f.ok ? 'text-white/55' : 'text-white/15'}`}>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprise */}
            <div data-reveal className="rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-950/20 to-[#020710] p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center"><Crown size={18} className="text-violet-400" /></div>
                <div><p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em]">Enterprise</p><p className="text-[11px] text-white/25">Operacion completa</p></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/[0.07] border border-violet-500/15 mb-6">
                <Crown size={11} className="text-violet-400 shrink-0" />
                <p className="text-[10px] text-violet-300/60 leading-snug">Para operaciones exigentes: sucursales, IA y automatizacion</p>
              </div>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-5xl font-black text-white">${price(89)}</span>
                <div className="mb-1"><span className="text-white/20 text-[9px] font-bold block">/mes</span>{pricingAnnual && <span className="text-emerald-400 text-[9px] font-black">Ahorras $214/ano</span>}</div>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 mb-8" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}>Activar Enterprise &mdash; gratis 30d</button>
              <ul className="space-y-3">
                {[
                  { ok: true, label: 'Todo lo del Negocio' }, { ok: true, label: 'VisionLab IA incluido' },
                  { ok: true, label: 'Conciliacion bancaria' }, { ok: true, label: 'Audit Logs inmutables' },
                  { ok: true, label: 'Webhooks (n8n/Zapier)' }, { ok: true, label: 'Usuarios ilimitados &middot; 5 sucursales' },
                  { ok: true, label: 'Personalizacion por empresa' }, { ok: true, label: 'Soporte prioritario' },
                ].map(f => (
                  <li key={f.label} className="flex items-center gap-2.5">
                    <Check size={12} className="text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-medium text-white/50">{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Compare toggle */}
          <div className="text-center mb-8" data-reveal>
            <button onClick={() => setShowCompare(p => !p)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/20 transition-all">
              <Activity size={13} />
              {showCompare ? 'Ocultar' : 'Ver'} comparativa completa
              <ChevronDown size={13} className={`transition-transform ${showCompare ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showCompare && (
            <div data-reveal className="rounded-3xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-16">
              <div className="flex items-center gap-2 p-4 border-b border-white/[0.06] overflow-x-auto">
                {cats.map(c => (
                  <button key={c} onClick={() => setActiveCat(c)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                      activeCat === c ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                    }`}>{c}</button>
                ))}
              </div>
              <div className="grid grid-cols-[1fr,80px,80px,80px] gap-0 border-b border-white/[0.07]">
                <div className="px-6 py-4" />
                {['Starter', 'Negocio', 'Enterprise'].map((p, i) => (
                  <div key={p} className={`py-4 text-center text-[10px] font-black uppercase tracking-widest ${i === 1 ? 'text-indigo-400 bg-indigo-500/[0.05]' : 'text-white/30'}`}>{p}</div>
                ))}
              </div>
              {filteredRows.map((row, i) => (
                <div key={i} className={`grid grid-cols-[1fr,80px,80px,80px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                  <div className="px-6 py-3.5"><span className="text-[10px] font-bold text-white/40">{row.label}</span><span className="ml-2 text-[8px] font-black text-white/15 uppercase tracking-widest">{row.cat}</span></div>
                  <div className="py-3.5 text-center flex items-center justify-center"><CellVal val={row.s} /></div>
                  <div className="py-3.5 text-center flex items-center justify-center bg-indigo-500/[0.03]"><CellVal val={row.n} /></div>
                  <div className="py-3.5 text-center flex items-center justify-center"><CellVal val={row.e} /></div>
                </div>
              ))}
            </div>
          )}

          <div data-reveal className="text-center py-8 rounded-3xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-white/30 text-sm">
              Todos los planes incluyen <span className="text-white font-black">30 dias de prueba gratis</span> &middot;
              Sin tarjeta de credito &middot; Cancela cuando quieras &middot;
              <span className="text-emerald-400 font-black"> Tus datos siempre son tuyos</span>
            </p>
          </div>
        </div>
      </section>

      {/* ══ MADE IN VENEZUELA + CREATOR ═════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(206,17,38,.2) 0%, transparent 50%), radial-gradient(ellipse at 70% 50%, rgba(207,160,33,.15) 0%, transparent 50%)' }} />
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div data-reveal className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
              <div className="text-5xl mb-5">&#x1F1FB;&#x1F1EA;</div>
              <h3 className="text-3xl font-black text-white mb-4 tracking-tight">Hecho en Venezuela</h3>
              <p className="text-white/30 text-sm leading-relaxed mb-6">
                Dualis nacio para resolver los retos unicos del mercado venezolano &mdash; inflacion, tasas cambiantes,
                operaciones en USD y bolivares, IGTF, IVA 16%, y la necesidad de trabajar con y sin internet.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Multi-moneda USD/VES' }, { label: 'BCV en tiempo real' },
                  { label: 'IVA + IGTF automatico' }, { label: 'Modo offline POS' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span className="text-[10px] font-black text-white/40">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div data-reveal className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-[#020710] p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-indigo-500/20">JS</div>
                <div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Creado por</p>
                  <h3 className="text-xl font-black text-white">Jesus Salazar</h3>
                  <p className="text-[11px] text-white/30">Desarrollador Full-Stack &middot; Venezuela</p>
                </div>
              </div>
              <p className="text-white/30 text-sm leading-relaxed mb-6">
                Construi Dualis porque no existia un ERP serio, accesible y disenado de verdad para Venezuela.
                Cada modulo, cada calculo y cada flujo fue pensado desde la realidad del negocio venezolano.
              </p>
              <div className="space-y-2.5">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 hover:bg-emerald-500/[0.12] transition-all group">
                  <MessageSquare size={16} className="text-emerald-400" />
                  <div className="flex-1"><p className="text-xs font-black text-emerald-400">WhatsApp directo</p><p className="text-[10px] text-white/25">+58 412-534-3141</p></div>
                  <ChevronRight size={13} className="text-white/20 group-hover:text-emerald-400 transition-colors" />
                </a>
                <a href="mailto:yisus_xd77@hotmail.com"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 hover:bg-indigo-500/[0.12] transition-all group">
                  <Mail size={16} className="text-indigo-400" />
                  <div className="flex-1"><p className="text-xs font-black text-indigo-400">Email</p><p className="text-[10px] text-white/25">yisus_xd77@hotmail.com</p></div>
                  <ChevronRight size={13} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CUSTOM DEV SERVICES ═══════════════════════════════════════════════ */}
      <section className="py-24 bg-[#020508]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 block mb-4">Desarrollo a Medida</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] text-white mb-4">
              Necesitas algo especifico?<br /><span className="text-white/20">Lo construimos para ti.</span>
            </h2>
            <p className="text-white/25 text-sm max-w-lg mx-auto">
              Ademas del ERP, ofrecemos desarrollo de software personalizado. Modulos a medida, integraciones, apps, lo que necesites.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-10">
            {[
              { icon: Cpu, title: 'Modulos a medida', desc: 'Necesitas un modulo que no existe? Lo disenamos y desarrollamos integrado a tu Dualis.', color: 'cyan' },
              { icon: Webhook, title: 'Integraciones', desc: 'Conectamos Dualis con tu sistema de facturacion, banco, delivery, WhatsApp Business, o lo que uses.', color: 'cyan' },
              { icon: Globe, title: 'Apps & Webs', desc: 'Landing pages, apps moviles, sistemas web completos. Desarrollo full-stack a tu medida.', color: 'cyan' },
            ].map((s, i) => (
              <div key={i} data-reveal className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.04] p-8 group hover:border-cyan-500/40 transition-all">
                <div className="h-12 w-12 rounded-2xl bg-cyan-500/15 flex items-center justify-center mb-6 border border-cyan-500/20">
                  <s.icon size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-lg font-black text-white mb-2">{s.title}</h3>
                <p className="text-sm text-white/30 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <div data-reveal className="rounded-3xl border border-cyan-500/25 bg-gradient-to-r from-cyan-950/30 to-[#020710] p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-[9px] font-black text-cyan-400 uppercase tracking-widest">Tarifa</span>
              </div>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-black text-white">$15</span>
                <span className="text-white/25 text-sm font-bold mb-1">/hora</span>
              </div>
              <p className="text-white/30 text-sm leading-relaxed">
                Presupuesto sin compromiso. Te digo cuanto toma, cuanto cuesta, y arrancamos cuando quieras. Pago por hora trabajada &mdash; sin sorpresas.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <a href={`https://wa.me/584125343141?text=${encodeURIComponent('Hola Jesus, necesito un desarrollo a medida. Me gustaria cotizar:')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg,#06b6d4,#0891b2)', boxShadow: '0 10px 30px -10px rgba(6,182,212,.5)' }}>
                <MessageSquare size={14} /> Cotizar por WhatsApp
              </a>
              <a href="mailto:yisus_xd77@hotmail.com?subject=Cotizacion%20desarrollo%20a%20medida"
                className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white/40 border border-white/[0.08] hover:text-white hover:border-white/20 transition-all">
                <Mail size={14} /> Enviar email
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEEDBACK CALLOUT + INCENTIVO ════════════════════════════════════════ */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div data-reveal className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-10 relative overflow-hidden">
            {/* Badge incentivo */}
            <div className="absolute top-0 right-0 px-5 py-2 rounded-bl-2xl text-[9px] font-black uppercase tracking-widest text-emerald-400"
              style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' }}>
              Gana dias gratis
            </div>

            <div className="grid md:grid-cols-[1fr,auto] gap-8 items-center">
              <div>
                <h3 className="text-2xl font-black text-white mb-3">Ayudanos a mejorar Dualis</h3>
                <p className="text-white/30 text-sm leading-relaxed mb-4">
                  Dualis esta en desarrollo activo. Cada bug que reportes o idea que sugieras nos ayuda a construir un mejor sistema para todos. Si tu reporte es util, te regalamos dias extra de prueba.
                </p>
                <div className="flex flex-wrap gap-3 mb-6">
                  {[
                    { label: 'Reporta un bug', reward: 'hasta +7 dias', color: 'rose' },
                    { label: 'Sugiere una funcion', reward: 'hasta +3 dias', color: 'violet' },
                    { label: 'Feedback general', reward: 'hasta +1 dia', color: 'indigo' },
                  ].map(r => (
                    <div key={r.label} className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-${r.color}-500/[0.08] border border-${r.color}-500/20`}>
                      <span className={`text-[10px] font-black text-${r.color}-400`}>{r.label}</span>
                      <span className="text-[9px] font-black text-emerald-400">{r.reward}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/20">Los dias se otorgan manualmente despues de verificar que el reporte es util.</p>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={() => setShowFeedback(true)}
                  className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                  Reportar un bug
                </button>
                <button onClick={() => { setFeedbackType('idea'); setShowFeedback(true); }}
                  className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white/40 border border-white/[0.08] hover:text-white hover:border-white/20 transition-all">
                  Sugerir una funcion
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FAQ ═════════════════════════════════════════════════════════════════ */}
      <section ref={faqRef} className="py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 block mb-4">Preguntas Frecuentes</span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white">Tienes dudas?</h2>
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} data-reveal className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-colors">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left">
                  <span className="text-sm font-black text-white/75 pr-4">{item.q}</span>
                  <ChevronDown size={16} className={`text-white/25 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <div className="px-6 pb-5"><p className="text-sm text-white/35 leading-relaxed">{item.a}</p></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══════════════════════════════════════════════════════════ */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,.6) 0%, transparent 60%)' }} />
        </div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div data-reveal>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8">
              <Rocket size={11} className="text-indigo-400" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-indigo-400">Sin compromiso</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black tracking-[-0.04em] text-white mb-6">
              Listo para<br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent animate-gradient">ordenar tu negocio?</span>
            </h2>
            <p className="text-white/30 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              30 dias gratis. Sin tarjeta. Sin trampa. Si no te convence, nos vamos &mdash; sin cobrar un centavo.
            </p>
            {betaCount !== null && betaCount > 0 && (
              <p className="text-[11px] text-indigo-400/60 font-black mb-6">
                {betaCount} {betaCount === 1 ? 'empresa ya esta' : 'empresas ya estan'} probando Dualis
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => navigate('/register')}
                className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black uppercase tracking-widest text-white hover:-translate-y-1 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 20px 60px -15px rgba(99,102,241,.7)' }}>
                Crear cuenta gratis <ArrowRight size={18} />
              </button>
              <a href={`https://wa.me/584125343141?text=${encodeURIComponent('Hola, quiero saber mas sobre Dualis ERP')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-black text-white/40 border border-white/[0.1] hover:text-white hover:border-white/25 transition-all">
                Hablar con un asesor <ChevronRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Logo className="h-7 w-auto mb-4" textClassName="text-white" />
              <p className="text-[11px] text-white/25 leading-relaxed mb-3">ERP Cloud hecho en Venezuela<br />USD + Bs &middot; BCV en vivo &middot; Sin servidores.</p>
              {bcvRate && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
                  <span className="text-[9px] font-black text-amber-400">BCV {bcvRate} Bs/$</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"><MessageSquare size={13} /></a>
                <a href="mailto:yisus_xd77@hotmail.com" className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-indigo-400 hover:border-indigo-500/30 transition-all"><Mail size={13} /></a>
                <a href="https://instagram.com/dualis.erp" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-pink-400 hover:border-pink-500/30 transition-all"><Eye size={13} /></a>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Producto</p>
              <ul className="space-y-3">
                {[
                  { label: 'Demo interactivo', action: () => scrollTo(demoRef) },
                  { label: 'Funcionalidades', action: () => scrollTo(featuresRef) },
                  { label: 'Modulos', action: () => scrollTo(modulesRef) },
                  { label: 'Precios', action: () => scrollTo(pricingRef) },
                ].map(l => (
                  <li key={l.label}><button onClick={l.action} className="text-[11px] text-white/30 hover:text-white/60 transition-colors text-left">{l.label}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Legal</p>
              <ul className="space-y-3">
                <li><a href="/terms" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Terminos de servicio</a></li>
                <li><a href="/privacy" className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Politica de privacidad</a></li>
                <li><button onClick={() => setShowFeedback(true)} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Reportar un bug</button></li>
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-4">Contacto</p>
              <ul className="space-y-3">
                <li><a href="mailto:yisus_xd77@hotmail.com" className="text-[11px] text-white/30 hover:text-indigo-400 transition-colors block">yisus_xd77@hotmail.com</a></li>
                <li><a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-emerald-400 transition-colors block">WhatsApp &middot; +58 412-534-3141</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-[10px] text-white/15">&copy; 2025 Dualis ERP</p>
              <span className="text-white/10">&middot;</span>
              <p className="text-[10px] text-white/15">Creado por <span className="text-indigo-400/60 font-black">Jesus Salazar</span></p>
            </div>
            <p className="text-[10px] text-white/15">Cloud &middot; Tiempo real &middot; Multi-moneda USD/VES</p>
          </div>
        </div>
      </footer>

      {/* ══ FLOATING FEEDBACK BUTTON ═══════════════════════════════════════════ */}
      <button onClick={() => setShowFeedback(true)}
        className="fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-2xl transition-all hover:-translate-y-1 hover:shadow-indigo-500/30 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 30px -8px rgba(99,102,241,.6)' }}
        title="Reportar bug o sugerir funcion">
        <MessageSquare size={14} />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {/* ══ FEEDBACK MODAL ═════════════════════════════════════════════════════ */}
      {showFeedback && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowFeedback(false); }}>
          <div className="w-full max-w-md bg-[#0d1424] border border-white/[0.1] rounded-3xl p-7 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-1">Feedback</p>
                <h3 className="text-xl font-black text-white">Cuentame que paso</h3>
              </div>
              <button onClick={() => setShowFeedback(false)} className="w-8 h-8 rounded-xl bg-white/[0.06] text-white/30 hover:text-white flex items-center justify-center transition-colors"><X size={14} /></button>
            </div>
            {feedbackSent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">{feedbackType === 'bug' ? '🐛' : feedbackType === 'idea' ? '💡' : '💬'}</div>
                <p className="font-black text-white mb-1">Recibido!</p>
                <p className="text-[11px] text-white/30">Tu feedback fue guardado y enviado. Gracias por ayudar a mejorar Dualis.</p>
                <p className="text-[10px] text-indigo-400/60 mt-2 font-bold">
                  Si tu reporte es util, recibiras dias gratis como agradecimiento
                </p>
              </div>
            ) : (
              <>
                {/* Type selector */}
                <div className="flex gap-2 mb-4">
                  {([['bug', '🐛 Bug', 'hasta +7 dias'], ['idea', '💡 Idea', 'hasta +3 dias'], ['otro', '💬 Otro', 'hasta +1 dia']] as const).map(([t, label, bonus]) => (
                    <button key={t} onClick={() => setFeedbackType(t)}
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        feedbackType === t ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400' : 'bg-white/[0.04] border border-white/[0.07] text-white/30 hover:text-white/50'
                      }`}>
                      {label}
                      <span className="block text-[7px] text-emerald-400/60 mt-0.5 normal-case tracking-normal">{bonus}</span>
                    </button>
                  ))}
                </div>

                {/* Name & Email */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input value={feedbackName} onChange={e => setFeedbackName(e.target.value)}
                    placeholder="Tu nombre (opcional)"
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  <input value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)}
                    placeholder="Tu email (opcional)"
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                </div>

                {/* Message */}
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  placeholder={feedbackType === 'bug' ? 'Describe el error: que estabas haciendo, que esperabas y que paso...' : feedbackType === 'idea' ? 'Cuentame la funcion que te gustaria ver...' : 'Tu mensaje...'}
                  rows={4} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none mb-3" />

                {/* Image upload */}
                <div className="mb-4">
                  <input ref={feedbackFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) setFeedbackImages(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => feedbackFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all">
                      <ImageIcon size={11} /> Adjuntar capturas
                    </button>
                    {feedbackImages.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <span className="text-[9px] text-indigo-400 truncate max-w-[80px]">{f.name}</span>
                        <button onClick={() => setFeedbackImages(prev => prev.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={() => setShowFeedback(false)} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">Cancelar</button>
                  <button onClick={sendFeedback} disabled={!feedbackText.trim() || feedbackSending}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                    {feedbackSending ? <><Loader2 size={12} className="animate-spin" /> Enviando...</> : 'Enviar feedback'}
                  </button>
                </div>
                <p className="text-[9px] text-white/15 text-center mt-3">Se guarda en el sistema y se envia por WhatsApp automaticamente</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
