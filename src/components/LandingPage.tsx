import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Zap, Sparkles, Shield,
  ShoppingCart, Package, TrendingUp,
  FileText, Layers, BookOpen, Landmark, Monitor,
  Check, Minus, Crown, Mail,
  ChevronDown, Users, Star,
  MessageSquare, X, Building2,
  History, ShieldCheck,
  Sliders, Brain, BarChart3, HelpCircle,
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

const APPS = [
  { icon: ShoppingCart, label: 'POS Detal',     color: 'from-indigo-500 to-blue-600',   bg: 'bg-indigo-500/10' },
  { icon: Building2,   label: 'POS Mayor',      color: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10' },
  { icon: Package,     label: 'Inventario',     color: 'from-sky-500 to-cyan-600',      bg: 'bg-sky-500/10'    },
  { icon: FileText,    label: 'CxC',            color: 'from-emerald-500 to-green-600', bg: 'bg-emerald-500/10'},
  { icon: Layers,      label: 'CxP',            color: 'from-teal-500 to-emerald-600',  bg: 'bg-teal-500/10'   },
  { icon: BookOpen,    label: 'Contabilidad',   color: 'from-green-500 to-emerald-600', bg: 'bg-green-500/10'  },
  { icon: Users,       label: 'RRHH',           color: 'from-pink-500 to-rose-600',     bg: 'bg-pink-500/10'   },
  { icon: Monitor,     label: 'Cajas',          color: 'from-amber-500 to-orange-600',  bg: 'bg-amber-500/10'  },
  { icon: TrendingUp,  label: 'Tasas BCV',      color: 'from-yellow-500 to-amber-600',  bg: 'bg-yellow-500/10' },
  { icon: History,     label: 'Rate History',    color: 'from-orange-500 to-red-600',    bg: 'bg-orange-500/10' },
  { icon: BarChart3,   label: 'Reportes',       color: 'from-fuchsia-500 to-pink-600',  bg: 'bg-fuchsia-500/10'},
  { icon: Landmark,    label: 'Conciliacion',   color: 'from-cyan-500 to-blue-600',     bg: 'bg-cyan-500/10'   },
  { icon: Sparkles,    label: 'VisionLab IA',   color: 'from-violet-500 to-indigo-600', bg: 'bg-violet-500/10' },
  { icon: ShieldCheck, label: 'Auditoria',      color: 'from-rose-500 to-red-600',      bg: 'bg-rose-500/10'   },
  { icon: Sliders,     label: 'Configuracion',  color: 'from-slate-500 to-gray-600',    bg: 'bg-slate-500/10'  },
  { icon: HelpCircle,  label: 'Ayuda',          color: 'from-teal-500 to-cyan-600',     bg: 'bg-teal-500/10'   },
];

const SELLING_POINTS = [
  {
    icon: Shield,
    title: 'Hecho para Venezuela',
    desc: 'USD y Bs en tiempo real. IVA 16%, IGTF 3%, tasa BCV oficial. Proximamente libros SENIAT.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    icon: Zap,
    title: 'Listo en minutos',
    desc: 'Sin servidores, sin instalacion. Crea tu cuenta y empieza a vender hoy. 100% en la nube.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
  },
  {
    icon: Brain,
    title: 'Inteligencia integrada',
    desc: 'VisionLab analiza tu negocio con IA: P&L, alertas de margen, flujo de caja y mas.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
  },
];

const FAQ_ITEMS = [
  { q: 'Funciona para empresas venezolanas?', a: 'Si. Maneja USD y bolivares, IVA 16%, IGTF 3%, tasa BCV oficial, y proximamente libros SENIAT.' },
  { q: 'Puedo usar Dualis sin internet?', a: 'El POS Detal tiene modo offline. Las ventas se sincronizan al reconectar.' },
  { q: 'Cuantos usuarios puedo tener?', a: 'Starter: 2 usuarios. Negocio: 5. Enterprise: ilimitados. Agrega extras por $3/mes.' },
  { q: 'Necesito tarjeta para la prueba?', a: 'No. 30 dias completamente gratis, sin tarjeta, sin contrato.' },
  { q: 'Puedo exportar mis datos?', a: 'Si. Excel, PDF o CSV desde inventario, CxC, reportes, auditoria y nomina.' },
  { q: 'Mis datos estan seguros?', a: 'Firebase de Google con cifrado en transito y en reposo. Tus datos estan aislados de otras empresas.' },
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
  const [betaCount, setBetaCount]         = useState<number | null>(null);

  // Typewriter
  const [wordIdx, setWordIdx]   = useState(0);
  const [charIdx, setCharIdx]   = useState(0);
  const [deleting, setDeleting] = useState(false);

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

  const appsRef    = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const faqRef     = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ── Scroll ─────────────────────────────────────────── */
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
          String(d?.fuente ?? '').toLowerCase().includes('oficial'),
        ) ?? list[0];
        const rate = Number(entry?.venta ?? entry?.promedio ?? entry?.precio ?? entry?.compra);
        if (rate && !isNaN(rate)) setBcvRate(rate.toFixed(2));
      })
      .catch(() => {});
  }, []);

  /* ── Beta count ────────────────────────────────────── */
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

  const price = (monthly: number) => pricingAnnual ? Math.round(monthly * 0.8) : monthly;
  const currentWord = HERO_WORDS[wordIdx].slice(0, charIdx);

  /* ── Feedback ─────────────────────────────────────────── */
  const sendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    try {
      const imageUrls: string[] = [];
      for (const file of feedbackImages) {
        const result = await uploadToCloudinary(file, 'dualis_avatars');
        imageUrls.push(result.secure_url);
      }
      await addDoc(collection(db, 'feedback'), {
        type: feedbackType, message: feedbackText.trim(),
        name: feedbackName.trim() || undefined, email: feedbackEmail.trim() || undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        status: 'nuevo', createdAt: serverTimestamp(), source: 'landing',
      });
      const typeLabel = feedbackType === 'bug' ? 'Bug' : feedbackType === 'idea' ? 'Sugerencia' : 'Comentario';
      const waText = encodeURIComponent(`${typeLabel} — Dualis Feedback\n\n${feedbackText.trim()}`);
      window.open(`https://wa.me/584125343141?text=${waText}`, '_blank');
      setFeedbackSent(true);
      setTimeout(() => { setFeedbackSent(false); setFeedbackText(''); setFeedbackName(''); setFeedbackEmail(''); setFeedbackImages([]); setShowFeedback(false); }, 3000);
    } catch (e) { console.error('Error enviando feedback:', e); }
    setFeedbackSending(false);
  };

  return (
    <div className="min-h-screen bg-[#020710] text-white overflow-x-hidden selection:bg-indigo-600/80">
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes glow  { 0%,100%{box-shadow:0 0 40px -15px rgba(99,102,241,.4)} 50%{box-shadow:0 0 80px -10px rgba(99,102,241,.7)} }
        .cursor-blink { animation:blink 1s step-end infinite; }
        .glow-hero    { animation:glow 4s ease-in-out infinite; }
        [data-reveal]            { opacity:0; transform:translateY(24px); transition:opacity .6s ease,transform .6s ease; }
        [data-reveal].is-visible { opacity:1; transform:translateY(0); }
        [data-reveal]:nth-child(2){transition-delay:.08s}
        [data-reveal]:nth-child(3){transition-delay:.16s}
        [data-reveal]:nth-child(4){transition-delay:.24s}
      `}</style>

      {/* ══ NAVBAR ══════════════════════════════════════════════════════════════ */}
      <nav className={`fixed inset-x-0 z-[100] transition-all duration-500 ${
        scrolled ? 'bg-[#020710]/90 backdrop-blur-2xl border-b border-white/[0.06] py-3' : 'bg-transparent py-5'
      }`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo className="h-7 w-auto" textClassName="text-white" />
          </div>
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Aplicaciones', ref: appsRef },
              { label: 'Precios', ref: pricingRef },
              { label: 'FAQ', ref: faqRef },
            ].map(item => (
              <button key={item.label} onClick={() => scrollTo(item.ref)}
                className="px-4 py-2 rounded-xl text-[11px] font-bold text-white/35 hover:text-white hover:bg-white/[0.05] transition-all">
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {bcvRate && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-black text-amber-400">BCV {bcvRate}</span>
              </div>
            )}
            <button onClick={() => navigate('/login')}
              className="hidden sm:block px-5 py-2.5 rounded-xl text-[11px] font-bold text-white/40 hover:text-white hover:bg-white/[0.06] transition-all">
              Entrar
            </button>
            <button onClick={() => navigate('/register')}
              className="px-5 py-2.5 rounded-xl text-[11px] font-black text-white transition-all hover:-translate-y-0.5 active:scale-95 bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/30">
              Empezar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        {/* Background orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] opacity-20"
            style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.6) 0%, transparent 60%)' }} />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          {/* Badge */}
          {betaCount !== null && betaCount > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/[0.06] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-black text-white/50">
                {betaCount} {betaCount === 1 ? 'empresa usa' : 'empresas usan'} Dualis
              </span>
            </div>
          )}

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-[-0.04em] leading-[1.05] mb-6">
            <span className="text-white">Administra</span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              {currentWord}
            </span>
            <span className="cursor-blink text-indigo-400">|</span>
          </h1>

          <p className="text-lg md:text-xl text-white/35 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            ERP completo en la nube para negocios en Venezuela.
            <br className="hidden sm:block" />
            POS, inventario, contabilidad, RRHH y mas — en un solo lugar.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <button onClick={() => navigate('/register')}
              className="px-8 py-4 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-2 glow-hero">
              Comenzar gratis <ArrowRight size={16} />
            </button>
            <button onClick={() => scrollTo(appsRef)}
              className="px-8 py-4 rounded-2xl text-sm font-bold text-white/40 border border-white/[0.08] hover:bg-white/[0.04] hover:text-white/60 transition-all">
              Ver aplicaciones
            </button>
          </div>

          <p className="text-[11px] text-white/20 font-medium">
            30 dias gratis &middot; Sin tarjeta &middot; Sin contrato
          </p>
        </div>
      </section>

      {/* ══ SELLING POINTS ══════════════════════════════════════════════════════ */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-5">
            {SELLING_POINTS.map((sp, i) => (
              <div key={i} data-reveal className={`rounded-2xl border ${sp.border} ${sp.bg} p-6`}>
                <sp.icon size={24} className={`${sp.color} mb-4`} />
                <h3 className="text-base font-black text-white mb-2">{sp.title}</h3>
                <p className="text-sm text-white/35 leading-relaxed">{sp.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ APPS GRID (Odoo-style) ══════════════════════════════════════════════ */}
      <section ref={appsRef} className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">Aplicaciones</span>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-3">
              Todo lo que necesitas. Un solo sistema.
            </h2>
            <p className="text-base text-white/30 max-w-xl mx-auto">
              Elige las apps que necesitas. Todas funcionan juntas.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 gap-3">
            {APPS.map((app, i) => (
              <div key={i} data-reveal
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] p-5 text-center transition-all cursor-default">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${app.color} flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                  <app.icon size={22} className="text-white" />
                </div>
                <p className="text-[12px] font-black text-white/70 group-hover:text-white transition-colors">{app.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ═════════════════════════════════════════════════════════════ */}
      <section ref={pricingRef} className="py-20 bg-[#020508]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">Planes</span>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-3">
              Precio simple. Sin sorpresas.
            </h2>
            <div className="inline-flex items-center gap-3 p-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] mt-4">
              <button onClick={() => setPricingAnnual(false)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>
                Mensual
              </button>
              <button onClick={() => setPricingAnnual(true)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${pricingAnnual ? 'bg-white/10 text-white' : 'text-white/25 hover:text-white/50'}`}>
                Anual <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[8px] font-black">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {/* Starter */}
            <div data-reveal className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-950/15 to-transparent p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center"><Zap size={18} className="text-sky-400" /></div>
                <div><p className="text-sm font-black text-white">Starter</p><p className="text-[10px] text-white/25">Para comenzar</p></div>
              </div>
              <div className="flex items-end gap-2 mb-5">
                <span className="text-4xl font-black text-white">${price(24)}</span>
                <span className="text-white/20 text-[10px] font-bold mb-1">/mes</span>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-sky-400 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 transition-all mb-6">
                Empezar gratis
              </button>
              <ul className="space-y-2.5 text-[11px]">
                {['POS Detal completo', '500 productos', 'CxC basico', '2 usuarios', 'Ticket WhatsApp', 'Soporte email'].map(f => (
                  <li key={f} className="flex items-center gap-2"><Check size={12} className="text-emerald-400 shrink-0" /><span className="text-white/40">{f}</span></li>
                ))}
              </ul>
            </div>

            {/* Negocio */}
            <div data-reveal className="relative rounded-2xl p-7 flex flex-col border border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-transparent shadow-lg shadow-indigo-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-500/40">Mas Popular</div>
              </div>
              <div className="flex items-center gap-3 mb-4 mt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"><Star size={18} className="text-indigo-400" /></div>
                <div><p className="text-sm font-black text-white">Negocio</p><p className="text-[10px] text-white/25">Para crecer</p></div>
              </div>
              <div className="flex items-end gap-2 mb-5">
                <span className="text-4xl font-black text-white">${price(49)}</span>
                <span className="text-white/20 text-[10px] font-bold mb-1">/mes</span>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-500/30 hover:-translate-y-0.5 transition-all mb-6">
                Activar Negocio
              </button>
              <ul className="space-y-2.5 text-[11px]">
                {['Todo lo del Starter', 'POS Mayor (credito)', 'Inventario ilimitado', 'CxC + CxP completo', 'RRHH y Nomina', 'Contabilidad', 'Tasas BCV auto', '5 usuarios', 'Soporte WhatsApp'].map(f => (
                  <li key={f} className="flex items-center gap-2"><Check size={12} className="text-emerald-400 shrink-0" /><span className="text-white/45">{f}</span></li>
                ))}
              </ul>
            </div>

            {/* Enterprise */}
            <div data-reveal className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/15 to-transparent p-7 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center"><Crown size={18} className="text-violet-400" /></div>
                <div><p className="text-sm font-black text-white">Enterprise</p><p className="text-[10px] text-white/25">Operacion completa</p></div>
              </div>
              <div className="flex items-end gap-2 mb-5">
                <span className="text-4xl font-black text-white">${price(89)}</span>
                <span className="text-white/20 text-[10px] font-bold mb-1">/mes</span>
              </div>
              <button onClick={() => navigate('/register')} className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20 transition-all mb-6">
                Activar Enterprise
              </button>
              <ul className="space-y-2.5 text-[11px]">
                {['Todo lo del Negocio', 'VisionLab IA incluido', 'Conciliacion bancaria', 'Audit Logs inmutables', 'Webhooks (n8n/Zapier)', 'Usuarios ilimitados', 'Soporte prioritario'].map(f => (
                  <li key={f} className="flex items-center gap-2"><Check size={12} className="text-emerald-400 shrink-0" /><span className="text-white/45">{f}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div data-reveal className="text-center py-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-white/30 text-sm">
              Todos los planes incluyen <span className="text-white font-black">30 dias de prueba gratis</span> &middot; Sin tarjeta &middot; <span className="text-emerald-400 font-black">Tus datos siempre son tuyos</span>
            </p>
          </div>
        </div>
      </section>

      {/* ══ FAQ ═════════════════════════════════════════════════════════════════ */}
      <section ref={faqRef} className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12" data-reveal>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">Preguntas frecuentes</h2>
          </div>
          <div className="space-y-3" data-reveal>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left">
                  <span className="text-sm font-bold text-white/60">{item.q}</span>
                  <ChevronDown size={16} className={`text-white/20 transition-transform shrink-0 ml-4 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-white/30 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══════════════════════════════════════════════════════════ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6 text-center" data-reveal>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-4">
            Listo para empezar?
          </h2>
          <p className="text-base text-white/30 mb-8 max-w-md mx-auto">
            Crea tu cuenta en menos de 2 minutos. Sin instalacion, sin tarjeta, sin compromisos.
          </p>
          <button onClick={() => navigate('/register')}
            className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/30 hover:-translate-y-0.5 active:scale-95 transition-all inline-flex items-center gap-2">
            Crear mi cuenta gratis <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ═════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Logo className="h-6 w-auto mb-3" textClassName="text-white" />
              <p className="text-[11px] text-white/20 leading-relaxed mb-3">ERP Cloud hecho en Venezuela<br />USD + Bs &middot; BCV en vivo</p>
              <div className="flex items-center gap-2">
                <a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/25 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"><MessageSquare size={12} /></a>
                <a href="mailto:yisus_xd77@hotmail.com" className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/25 hover:text-indigo-400 hover:border-indigo-500/30 transition-all"><Mail size={12} /></a>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Producto</p>
              <ul className="space-y-2">
                {[
                  { label: 'Aplicaciones', action: () => scrollTo(appsRef) },
                  { label: 'Precios', action: () => scrollTo(pricingRef) },
                  { label: 'FAQ', action: () => scrollTo(faqRef) },
                ].map(l => (
                  <li key={l.label}><button onClick={l.action} className="text-[11px] text-white/25 hover:text-white/50 transition-colors">{l.label}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Legal</p>
              <ul className="space-y-2">
                <li><a href="/terms" className="text-[11px] text-white/25 hover:text-white/50 transition-colors">Terminos de servicio</a></li>
                <li><a href="/privacy" className="text-[11px] text-white/25 hover:text-white/50 transition-colors">Politica de privacidad</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-3">Contacto</p>
              <ul className="space-y-2">
                <li><a href="mailto:yisus_xd77@hotmail.com" className="text-[11px] text-white/25 hover:text-indigo-400 transition-colors">yisus_xd77@hotmail.com</a></li>
                <li><a href="https://wa.me/584125343141" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/25 hover:text-emerald-400 transition-colors">WhatsApp &middot; +58 412-534-3141</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.04] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-white/15">&copy; 2026 Dualis ERP &middot; Creado por <span className="text-indigo-400/50 font-black">Jesus Salazar</span></p>
            <p className="text-[10px] text-white/10">Cloud &middot; Tiempo real &middot; Multi-moneda</p>
          </div>
        </div>
      </footer>

      {/* ══ FLOATING FEEDBACK BUTTON ═══════════════════════════════════════════ */}
      <button onClick={() => setShowFeedback(true)}
        className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-xl shadow-indigo-500/30 hover:-translate-y-1 active:scale-95 transition-all"
        title="Reportar bug o sugerir funcion">
        <MessageSquare size={14} />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {/* ══ FEEDBACK MODAL ═════════════════════════════════════════════════════ */}
      {showFeedback && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowFeedback(false); }}>
          <div className="w-full max-w-md bg-[#0d1424] border border-white/[0.1] rounded-2xl p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-1">Feedback</p>
                <h3 className="text-lg font-black text-white">Cuentame que paso</h3>
              </div>
              <button onClick={() => setShowFeedback(false)} className="w-8 h-8 rounded-xl bg-white/[0.06] text-white/30 hover:text-white flex items-center justify-center transition-colors"><X size={14} /></button>
            </div>
            {feedbackSent ? (
              <div className="text-center py-8">
                <p className="font-black text-white mb-1">Recibido!</p>
                <p className="text-[11px] text-white/30">Gracias por ayudar a mejorar Dualis.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  {([['bug', 'Bug'], ['idea', 'Idea'], ['otro', 'Otro']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setFeedbackType(t)}
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        feedbackType === t ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400' : 'bg-white/[0.04] border border-white/[0.07] text-white/30'
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input value={feedbackName} onChange={e => setFeedbackName(e.target.value)} placeholder="Tu nombre (opcional)"
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  <input value={feedbackEmail} onChange={e => setFeedbackEmail(e.target.value)} placeholder="Tu email (opcional)"
                    className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                </div>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Describe el error o sugerencia..." rows={3}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none mb-3" />
                <div className="mb-4">
                  <input ref={feedbackFileRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) setFeedbackImages(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => feedbackFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all">
                      <ImageIcon size={11} /> Adjuntar
                    </button>
                    {feedbackImages.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <span className="text-[9px] text-indigo-400 truncate max-w-[80px]">{f.name}</span>
                        <button onClick={() => setFeedbackImages(prev => prev.filter((_, j) => j !== i))} className="text-white/30 hover:text-rose-400"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowFeedback(false)} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">Cancelar</button>
                  <button onClick={sendFeedback} disabled={!feedbackText.trim() || feedbackSending}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-indigo-600 to-violet-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-all">
                    {feedbackSending ? <><Loader2 size={12} className="animate-spin" /> Enviando...</> : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
