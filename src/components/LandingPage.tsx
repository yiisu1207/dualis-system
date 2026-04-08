import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, Minus, ChevronDown, ChevronRight,
  ShoppingCart, Package, TrendingUp, Wallet, Receipt, BookOpen,
  Users, BarChart3, Brain, Globe, Landmark, Shield, Zap,
  MessageSquare, Star, Sparkles, Crown, Building2, Rocket,
  Send, Loader2, CheckCircle2, Award, Activity, Lock, X,
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import SEO from './SEO';
import {
  DUALIS_WHATSAPP, buildQuoteWhatsApp,
} from '../utils/planConfig';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string; key?: React.Key }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const HERO_WORDS = ['tu inventario.', 'tus ventas.', 'tu nómina.', 'tus finanzas.', 'tu negocio.'];

const FEATURES = [
  {
    icon: Globe, color: 'emerald',
    title: 'Portal de Clientes',
    desc: 'Tus clientes consultan su estado de cuenta, descargan facturas y reportan pagos sin llamarte.',
  },
  {
    icon: Award, color: 'amber',
    title: 'Programa Embajador',
    desc: 'Tu sistema promociona Dualis a tus propios clientes y tú ganas descuento en tu suscripción por cada referido activo.',
  },
  {
    icon: ShoppingCart, color: 'indigo',
    title: 'POS Mayor con Crédito',
    desc: 'Plazos configurables (7, 15, 30, 45, 60 días) con descuentos automáticos por pronto pago que expiran solos.',
  },
  {
    icon: Brain, color: 'violet',
    title: 'Auditoría IA',
    desc: 'Detecta anomalías, ventas inusuales y patrones sospechosos. Pregúntale al sistema: "¿por qué bajaron las ventas?"',
  },
  {
    icon: TrendingUp, color: 'sky',
    title: 'Tasas en tiempo real',
    desc: 'BCV automático + tasas personalizadas. Los precios se recalculan solos en el POS Mayor.',
  },
  {
    icon: Landmark, color: 'rose',
    title: 'Conciliación Bancaria',
    desc: 'Importa tu estado de cuenta y el sistema concilia automáticamente contra tus cobros registrados.',
  },
];

const STEPS = [
  { num: '01', title: 'Crea tu cuenta', desc: 'Registro en 2 minutos. Sin tarjeta. 30 días de acceso completo al Plan Pro.' },
  { num: '02', title: 'Configura tu negocio', desc: 'Agrega tu logo, tasas, productos y el sistema está listo para vender.' },
  { num: '03', title: 'Empieza a vender', desc: 'POS funcionando desde el primer día. Datos en la nube, acceso desde cualquier dispositivo.' },
];

const FAQS = [
  {
    q: '¿Necesito tarjeta de crédito para el trial?',
    a: 'No. Los 30 días son completamente gratis, sin tarjeta. Al vencer puedes elegir el plan que más te convenga o quedarte en el plan Gratis con funciones básicas.',
  },
  {
    q: '¿Cómo activo un plan de pago?',
    a: 'Por ahora el proceso es manual. Contáctanos por WhatsApp, acuerda el método de pago (Pagomovil, Zelle, Binance) y activamos tu plan en cuestión de minutos.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Todo está almacenado en Firebase (Google) con encriptación en tránsito y en reposo. Tu información nunca se comparte ni se elimina aunque tu plan venza.',
  },
  {
    q: '¿Funciona sin internet?',
    a: 'Estamos desarrollando el Modo Offline (PWA) que permitirá al POS funcionar sin conexión y sincronizar al reconectar. Muy próximamente.',
  },
  {
    q: '¿Puedo tener varias sucursales?',
    a: 'Sí. Desde el Plan Negocio tienes 1 sucursal incluida. Con el Plan Pro tienes 3, y con Enterprise puedes tener ilimitadas.',
  },
  {
    q: '¿Qué es el Programa Embajador?',
    a: 'Puedes activarlo en Configuración. Tus comunicaciones con clientes incluirán un enlace discreto a Dualis. Si un cliente tuyo se registra y paga su primer plan, tú recibes un descuento permanente en tu suscripción.',
  },
  {
    q: '¿Puedo agregar funciones extra sin cambiar de plan?',
    a: 'Sí. Tenemos add-ons individuales: Portal de Clientes, Tienda Pública, WhatsApp Automático, Auditoría IA, entre otros. Pagas solo lo que necesitas.',
  },
  {
    q: '¿Cómo es la facturación legal para SENIAT?',
    a: 'Estamos desarrollando la Factura Legal SENIAT (RIF emisor/receptor, número de control oficial, retenciones IVA/ISLR para contribuyentes especiales). Disponible muy pronto.',
  },
];

const PLAN_ICONS = [
  { Icon: Zap,       gradient: 'from-slate-400 to-slate-500',   shadow: 'shadow-slate-500/20'   },
  { Icon: Zap,       gradient: 'from-sky-400 to-blue-500',      shadow: 'shadow-sky-500/20'     },
  { Icon: Building2, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/20'  },
  { Icon: Crown,     gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/20'  },
  { Icon: Crown,     gradient: 'from-amber-400 to-orange-500',  shadow: 'shadow-amber-500/20'   },
];

// ─── Contact form ─────────────────────────────────────────────────────────────

function ContactForm() {
  const [form, setForm]       = useState({ name: '', company: '', phone: '', needs: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'contactRequests'), { ...form, createdAt: serverTimestamp() });
      setSent(true);
    } catch {
      // Fallback to WhatsApp
      const msg = encodeURIComponent(`Hola, soy ${form.name} de ${form.company}. ${form.needs}`);
      window.open(`https://wa.me/${DUALIS_WHATSAPP}?text=${msg}`, '_blank');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h3 className="text-lg font-black text-white">¡Mensaje enviado!</h3>
        <p className="text-sm text-white/40 max-w-xs">Te contactamos en menos de 24 horas. También puedes escribirnos directamente por WhatsApp.</p>
        <a
          href={`https://wa.me/${DUALIS_WHATSAPP}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-black hover:bg-emerald-500/20 transition-all"
        >
          <MessageSquare size={15} /> Abrir WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[
        { key: 'name',    label: 'Tu nombre*',       placeholder: 'Juan García',        span: false },
        { key: 'company', label: 'Empresa',           placeholder: 'Distribuidora XYZ',  span: false },
        { key: 'phone',   label: 'WhatsApp*',         placeholder: '+58 412 000 0000',   span: false },
        { key: 'needs',   label: '¿Qué necesitas?',  placeholder: 'Describe brevemente...', span: true },
      ].map(({ key, label, placeholder, span }) => (
        <div key={key} className={span ? 'sm:col-span-2' : ''}>
          <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">{label}</label>
          {span ? (
            <textarea
              rows={3}
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/20 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-all resize-none"
            />
          ) : (
            <input
              type="text"
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/20 outline-none focus:border-indigo-500/40 focus:bg-white/[0.06] transition-all"
            />
          )}
        </div>
      ))}
      <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
        <button
          type="submit"
          disabled={sending || !form.name || !form.phone}
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-black disabled:opacity-40 hover:opacity-90 transition-all shadow-lg shadow-indigo-500/25"
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {sending ? 'Enviando…' : 'Enviar mensaje'}
        </button>
        <a
          href={`https://wa.me/${DUALIS_WHATSAPP}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-black hover:bg-emerald-500/20 transition-all"
        >
          <MessageSquare size={15} /> WhatsApp directo
        </a>
      </div>
    </form>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();

  // Hero word cycling
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroFade, setHeroFade] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setHeroFade(false);
      setTimeout(() => {
        setHeroIdx(i => (i + 1) % HERO_WORDS.length);
        setHeroFade(true);
      }, 300);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  // FAQ accordion
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#070b14] text-white font-sans overflow-x-hidden">
      <SEO
        title="Dualis — Sistema ERP para negocios venezolanos"
        description="POS, Inventario, CxC, CxP, RRHH, Portal de Clientes y más. 30 días gratis sin tarjeta."
      />

      {/* ── TOPBAR ───────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.05] bg-[#070b14]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Dualis" className="w-8 h-8 rounded-xl object-contain" />
            <span className="font-black text-[15px] tracking-tight">Dualis</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {['Características', 'Planes', 'Embajador', 'FAQ', 'Contacto'].map(label => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                className="text-[12px] font-bold text-white/40 hover:text-white/80 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="text-[12px] font-black text-white/40 hover:text-white transition-colors"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => navigate('/register')}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[12px] font-black shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-all"
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        {/* BG orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-violet-600/6 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-black uppercase tracking-widest mb-8">
            <Sparkles size={11} /> 30 días gratis · Sin tarjeta · Sin compromiso
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight mb-4 tracking-tight">
            Dualis controla
            <br />
            <span
              className={`bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent transition-all duration-300 ${heroFade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
            >
              {HERO_WORDS[heroIdx]}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-white/40 max-w-2xl mx-auto mb-10 leading-relaxed">
            El sistema de gestión empresarial más completo para negocios venezolanos. POS, inventario, finanzas, nómina, portal de clientes y mucho más — todo en uno.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto h-14 px-8 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[15px] shadow-xl shadow-indigo-500/30 hover:opacity-90 hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              Comenzar gratis <ArrowRight size={18} />
            </button>
            <a
              href={`https://wa.me/${DUALIS_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto h-14 px-8 rounded-2xl border border-white/[0.1] text-white/60 font-black text-[15px] hover:bg-white/[0.05] hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <MessageSquare size={17} /> Hablar con ventas
            </a>
          </div>

          <p className="text-[11px] text-white/20 mt-5">
            Plan Pro completo por 30 días · No se requiere tarjeta · Cancela cuando quieras
          </p>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <section id="características" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Lo que nos diferencia</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                Funciones que nadie más tiene
              </h2>
              <p className="text-white/40 mt-3 text-base max-w-xl mx-auto">
                Diseñado específicamente para la realidad del negocio venezolano.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const colorMap: Record<string, string> = {
                emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                amber:   'text-amber-400   bg-amber-500/10   border-amber-500/20',
                indigo:  'text-indigo-400  bg-indigo-500/10  border-indigo-500/20',
                violet:  'text-violet-400  bg-violet-500/10  border-violet-500/20',
                sky:     'text-sky-400     bg-sky-500/10     border-sky-500/20',
                rose:    'text-rose-400    bg-rose-500/10    border-rose-500/20',
              };
              const cls = colorMap[f.color];
              return (
                <FadeIn key={f.title} delay={i * 60}>
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.04] transition-all group">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${cls}`}>
                      <f.icon size={19} />
                    </div>
                    <h3 className="font-black text-[15px] text-white mb-2">{f.title}</h3>
                    <p className="text-[13px] text-white/40 leading-relaxed">{f.desc}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>

          {/* Module grid */}
          <FadeIn delay={200}>
            <div className="mt-10 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-5">Todos los módulos incluidos</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { Icon: ShoppingCart, label: 'POS Detal' },
                  { Icon: Building2,   label: 'POS Mayor' },
                  { Icon: Package,     label: 'Inventario' },
                  { Icon: Wallet,      label: 'CxC' },
                  { Icon: Receipt,     label: 'CxP' },
                  { Icon: BookOpen,    label: 'Contabilidad' },
                  { Icon: TrendingUp,  label: 'Tasas' },
                  { Icon: Users,       label: 'RRHH' },
                  { Icon: BarChart3,   label: 'Estadísticas' },
                  { Icon: Globe,       label: 'Portal Clientes' },
                  { Icon: Landmark,    label: 'Conciliación' },
                  { Icon: Brain,       label: 'Auditoría IA' },
                ].map(({ Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-all">
                    <Icon size={16} className="text-white/30" />
                    <span className="text-[10px] font-bold text-white/30 text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Arrancar es fácil</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                3 pasos y estás vendiendo
              </h2>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <FadeIn key={s.num} delay={i * 100}>
                <div className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[48px] font-black text-white/[0.04] leading-none mb-4 select-none">{s.num}</div>
                  <h3 className="font-black text-white text-[16px] mb-2">{s.title}</h3>
                  <p className="text-[13px] text-white/40 leading-relaxed">{s.desc}</p>
                  {i < STEPS.length - 1 && (
                    <ChevronRight size={18} className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-white/10 z-10" />
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANS SUMMARY ───────────────────────────────────── */}
      <section id="planes" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-10">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Precios transparentes</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Planes desde $12/mes</h2>
              <p className="text-white/40 mt-3 text-sm max-w-xl mx-auto">
                Plan vertical hecho para tu tipo de negocio, o planes generales que escalan contigo. 30 días gratis del Plan Pro.
              </p>
            </div>
          </FadeIn>

          {/* Resumen 4 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[
              { name: 'Gratis',     price: '$0',    desc: '1 usuario · 50 productos', gradient: 'from-slate-400 to-slate-500' },
              { name: 'Tu Negocio', price: 'desde $12', desc: 'Plan vertical · módulos de tu rubro', gradient: 'from-sky-400 to-blue-500' },
              { name: 'Negocio',    price: '$35',   desc: 'CxC, CxP, contabilidad, multi-cuenta', gradient: 'from-indigo-500 to-violet-600', popular: true },
              { name: 'Pro',        price: '$65',   desc: 'Portal, Vision IA, embajador, 3 sucursales', gradient: 'from-violet-500 to-purple-600' },
            ].map(p => (
              <div key={p.name} className={`relative p-5 rounded-2xl border ${p.popular ? 'bg-gradient-to-b from-indigo-600/[0.12] to-violet-600/[0.06] border-indigo-500/30' : 'bg-white/[0.02] border-white/[0.07]'}`}>
                {p.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[8px] font-black uppercase tracking-widest whitespace-nowrap">Más popular</div>
                )}
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.gradient} mb-3`} />
                <h3 className="font-black text-sm text-white">{p.name}</h3>
                <p className="text-xl font-black text-white mt-1">{p.price}<span className="text-[10px] text-white/30 font-bold ml-1">{p.price !== '$0' ? '/mes' : ''}</span></p>
                <p className="text-[10px] text-white/40 mt-2 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA a /precios */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/precios')}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-black shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-all flex items-center gap-2"
            >
              Ver todos los planes y comparativa <ArrowRight size={14} />
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/70 text-sm font-black hover:bg-white/[0.1] hover:text-white transition-all"
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </section>

      {/* ── PROGRAMA EMBAJADOR ───────────────────────────────── */}
      <section id="embajador" className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 mb-3">Crecimiento viral</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                Gana mientras usas el sistema
              </h2>
              <p className="text-white/40 mt-3 text-sm max-w-xl mx-auto">
                Activa el Programa Embajador y cada comunicación tuya con tus clientes le presenta Dualis a nuevos negocios. Tú ganas descuento, ellos ganan el mejor sistema de Venezuela.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* Flow */}
            <FadeIn>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'Activas el programa', desc: 'Un toggle en Configuración. Tu negocio empieza a aparecer en las comunicaciones.' },
                  { step: '2', title: 'Tu cliente descubre Dualis', desc: 'Nota de entrega, portal, emails — todo incluye un link de referido con tu nombre.' },
                  { step: '3', title: 'Se registra y paga su primer plan', desc: 'Después de 30 días activos y su primera compra, se activa tu beneficio.' },
                  { step: '4', title: 'Ganas descuento permanente', desc: '5% por cada referido activo, acumulable hasta 25%. 10 referidos = mes gratis cada trimestre.' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-4">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-black text-[12px] shrink-0">
                      {step}
                    </div>
                    <div>
                      <p className="font-black text-[14px] text-white">{title}</p>
                      <p className="text-[12px] text-white/40 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* Rewards */}
            <FadeIn delay={100}>
              <div className="p-6 rounded-2xl bg-amber-500/[0.04] border border-amber-500/[0.12]">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/60 mb-5">Beneficios por referidos activos</p>
                <div className="space-y-3">
                  {[
                    { qty: '1 referido',    discount: '5% descuento permanente' },
                    { qty: '3 referidos',   discount: '15% descuento permanente' },
                    { qty: '5 referidos',   discount: '25% descuento permanente' },
                    { qty: '10 referidos',  discount: 'Mes gratis cada trimestre' },
                  ].map(({ qty, discount }) => (
                    <div key={qty} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-2">
                        <Award size={13} className="text-amber-400" />
                        <span className="text-[13px] font-bold text-white/70">{qty}</span>
                      </div>
                      <span className="text-[12px] font-black text-amber-400">{discount}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/15">
                  <p className="text-[11px] text-amber-400/80 font-bold">
                    El referido debe tener 30 días activos <strong>y</strong> haber realizado su primera compra de plan para activar tu beneficio.
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS placeholder ─────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="p-8 rounded-2xl bg-indigo-500/[0.04] border border-indigo-500/[0.10] text-center">
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={16} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-lg text-white/60 font-bold italic max-w-xl mx-auto mb-4">
                "Dualis transformó la manera en que manejamos nuestras cuentas por cobrar. El portal de clientes nos ahorró horas de WhatsApp cada semana."
              </p>
              <p className="text-[12px] font-black text-white/30 uppercase tracking-widest">
                Beta tester — Distribuidora Caracas
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">¿Tienes dudas?</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Preguntas frecuentes</h2>
            </div>
          </FadeIn>

          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <FadeIn key={i} delay={i * 40}>
                <div className={`rounded-xl border transition-all ${openFaq === i ? 'border-indigo-500/20 bg-indigo-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="font-bold text-[14px] text-white/80 pr-4">{faq.q}</span>
                    <ChevronDown size={15} className={`text-white/30 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-4">
                      <p className="text-[13px] text-white/40 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ──────────────────────────────────────────── */}
      <section id="contacto" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <FadeIn>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Hablemos</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
                  ¿Necesitas una cotización o tienes preguntas?
                </h2>
                <p className="text-white/40 text-sm leading-relaxed mb-8">
                  Escríbenos y te respondemos en menos de 24 horas. También puedes escribirnos directamente por WhatsApp para una respuesta inmediata.
                </p>

                <div className="space-y-4">
                  {[
                    { icon: MessageSquare, label: 'WhatsApp', value: `+${DUALIS_WHATSAPP}`, href: `https://wa.me/${DUALIS_WHATSAPP}` },
                    { icon: Send,          label: 'Email',    value: 'hola@dualis.app',     href: 'mailto:hola@dualis.app' },
                  ].map(({ icon: Icon, label, value, href }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-indigo-500/20 hover:bg-indigo-500/[0.04] transition-all group"
                    >
                      <Icon size={17} className="text-indigo-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/25">{label}</p>
                        <p className="text-[13px] font-bold text-white/60 group-hover:text-white/80 transition-colors">{value}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.07]">
                <p className="text-[13px] font-black text-white/60 mb-5">Envíanos un mensaje</p>
                <ContactForm />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <div className="relative p-10 rounded-3xl bg-gradient-to-b from-indigo-600/[0.12] to-violet-600/[0.06] border border-indigo-500/20 overflow-hidden">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
              <Rocket size={28} className="text-indigo-400 mx-auto mb-4 relative" />
              <h2 className="text-3xl font-black tracking-tight mb-3 relative">
                Empieza hoy — es gratis
              </h2>
              <p className="text-white/40 text-sm mb-8 relative max-w-lg mx-auto">
                30 días de acceso completo al Plan Pro. Sin tarjeta, sin compromiso. Cancela o cambia de plan en cualquier momento.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
                <button
                  onClick={() => navigate('/register')}
                  className="w-full sm:w-auto h-14 px-10 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[15px] shadow-xl shadow-indigo-500/30 hover:opacity-90 hover:scale-105 transition-all flex items-center justify-center gap-2"
                >
                  Crear cuenta gratis <ArrowRight size={18} />
                </button>
                <a
                  href={buildQuoteWhatsApp()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto h-14 px-8 rounded-2xl border border-white/[0.1] text-white/60 font-black text-[14px] hover:bg-white/[0.05] hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  Cotizar Enterprise
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Dualis" className="w-7 h-7 rounded-lg object-contain" />
            <div>
              <p className="font-black text-[13px] text-white leading-none">Dualis</p>
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Sistema ERP</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6">
            {['Características', 'Planes', 'Embajador', 'FAQ', 'Contacto'].map(label => (
              <a key={label} href={`#${label.toLowerCase()}`} className="text-[11px] font-bold text-white/30 hover:text-white/60 transition-colors">
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <a href="mailto:hola@dualis.app" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">hola@dualis.app</a>
            <span className="text-white/10">·</span>
            <a href={`https://wa.me/${DUALIS_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">WhatsApp</a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] text-white/15">© {new Date().getFullYear()} Dualis. Todos los derechos reservados.</p>
          <div className="flex gap-4">
            <a href="/terminos" className="text-[10px] text-white/15 hover:text-white/30 transition-colors">Términos</a>
            <a href="/privacidad" className="text-[10px] text-white/15 hover:text-white/30 transition-colors">Privacidad</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
