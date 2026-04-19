import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  ShoppingCart, Package, TrendingUp, Wallet, Receipt, BookOpen,
  Users, BarChart3, Brain, Globe, Landmark, Shield, Zap,
  MessageSquare, Star, Sparkles, Crown, Building2, Rocket,
  Send, Loader2, CheckCircle2, Award, Lock,
  Scan, Printer, Calculator, Tag, FileText, CalendarDays,
  Wrench, Heart, Bell, Search, RefreshCw, CreditCard,
  Smartphone, QrCode, ClipboardCheck, Truck, RotateCcw,
  PenTool, LayoutGrid, Layers, KeyRound, Activity, Eye,
  PieChart, Banknote, Download, Upload, Palette, Moon,
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import SEO from './SEO';
import {
  DUALIS_WHATSAPP, buildQuoteWhatsApp,
} from '../utils/planConfig';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useInView(threshold = 0.12) {
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

const HERO_WORDS = ['tu inventario.', 'tus ventas.', 'tu nomina.', 'tus finanzas.', 'tu negocio.'];

// ─── Feature categories with ALL v1 features ─────────────────────────────────

const FEATURE_CATEGORIES = [
  {
    id: 'pos',
    icon: ShoppingCart,
    color: 'indigo',
    title: 'Punto de Venta',
    subtitle: 'Mayor y Detal',
    features: [
      { icon: Building2, text: 'POS Mayor con plazos de credito configurables (7-60 dias)' },
      { icon: ShoppingCart, text: 'POS Detal con grid de favoritos y modo venta continua' },
      { icon: Scan, text: 'Scanner de codigos de barras USB + camara del movil' },
      { icon: Calculator, text: 'Descuento ficticio por pronto pago (auto-calculo de markup)' },
      { icon: Printer, text: 'Impresion termica 80mm + recibos A4 con QR' },
      { icon: ClipboardCheck, text: 'Arqueo de caja fisico con grid de denominaciones USD/VES' },
      { icon: RotateCcw, text: 'Devoluciones parciales o totales con saldo a favor' },
      { icon: PenTool, text: 'Firma digital del cliente al despachar mercancia' },
      { icon: LayoutGrid, text: 'Modo kiosco fullscreen para tablets de mostrador' },
      { icon: Layers, text: 'Bultos y unidades (1 bulto = N unidades, stock real)' },
    ],
  },
  {
    id: 'inv',
    icon: Package,
    color: 'emerald',
    title: 'Inventario',
    subtitle: 'Multi-almacen avanzado',
    features: [
      { icon: Package, text: 'Multi-almacen con stock por ubicacion y transferencias' },
      { icon: Layers, text: 'Variantes de producto (talla, color, modelo)' },
      { icon: Tag, text: 'Kits y combos con descuento de componentes automatico' },
      { icon: Scan, text: 'Codigos de barras con generacion y scanner integrado' },
      { icon: Calculator, text: 'Costo promedio ponderado automatico al recibir mercancia' },
      { icon: TrendingUp, text: 'Alertas de reposicion inteligente basadas en velocidad de venta' },
      { icon: CalendarDays, text: 'Lotes con vencimiento y despacho FEFO automatico' },
      { icon: ClipboardCheck, text: 'Conteo fisico con ajuste de merma automatico' },
      { icon: Truck, text: 'Transferencias entre almacenes con estados' },
      { icon: Eye, text: 'Galeria de fotos por producto con Cloudinary optimizado' },
    ],
  },
  {
    id: 'finanzas',
    icon: Wallet,
    color: 'sky',
    title: 'Finanzas',
    subtitle: 'CxC, CxP y Tesoreria',
    features: [
      { icon: Wallet, text: 'Cuentas por Cobrar con quorum de aprobacion multi-firma' },
      { icon: Receipt, text: 'Cuentas por Pagar con layout dual (proveedores + ledger)' },
      { icon: Landmark, text: 'Tesoreria con 27 bancos venezolanos + Zelle + Binance' },
      { icon: CreditCard, text: 'Verificacion de llegada al banco por cada cobro' },
      { icon: FileText, text: 'Cotizaciones con PDF, envio por email y conversion a venta' },
      { icon: RefreshCw, text: 'Ventas recurrentes automaticas (semanal/mensual/anual)' },
      { icon: TrendingUp, text: 'Tasas BCV automaticas + tasas personalizadas en tiempo real' },
      { icon: PieChart, text: 'Flujo de caja proyectado a 30/60/90 dias' },
      { icon: BarChart3, text: 'Analisis Pareto 80/20 de productos y clientes' },
      { icon: Banknote, text: 'Conciliacion bancaria rapida con CSV del banco' },
    ],
  },
  {
    id: 'portal',
    icon: Globe,
    color: 'violet',
    title: 'Portal de Clientes',
    subtitle: 'Tu negocio 24/7 online',
    features: [
      { icon: Globe, text: 'Portal white-label con logo y colores de tu negocio' },
      { icon: CreditCard, text: 'Pagos online con voucher, dedupe automatico y validaciones' },
      { icon: QrCode, text: 'QR en recibos que abre el portal directo en la factura' },
      { icon: MessageSquare, text: 'Chat en tiempo real entre cliente y administrador' },
      { icon: Heart, text: 'Panel de fidelidad con puntos, tier y beneficios visibles' },
      { icon: FileText, text: 'Estado de cuenta PDF descargable por el cliente' },
      { icon: ShoppingCart, text: 'Auto-pedidos desde catalogo del portal' },
      { icon: KeyRound, text: 'Acceso seguro con OTP por email (sin passwords)' },
      { icon: Smartphone, text: 'Mobile-first: funciona perfecto desde cualquier celular' },
    ],
  },
  {
    id: 'crm',
    icon: Heart,
    color: 'rose',
    title: 'CRM y Fidelidad',
    subtitle: 'Clientes que vuelven',
    features: [
      { icon: Crown, text: 'Tiers de fidelidad Bronce a Elite con beneficios reales' },
      { icon: Tag, text: 'Listas de precios automaticas por tier del cliente' },
      { icon: Heart, text: 'Bonificacion extra por pronto pago (puntos loyalty)' },
      { icon: CalendarDays, text: 'Auto-felicitacion de cumpleanos por email' },
      { icon: MessageSquare, text: 'Historial de comunicaciones (llamadas, visitas, WhatsApp)' },
      { icon: Bell, text: 'Recordatorios de cobranza progresivos (5d, dia, +5, +15, +30)' },
      { icon: CalendarDays, text: 'Agenda de cobranza con calendario de vencimientos' },
      { icon: Tag, text: 'Segmentacion por tags (#VIP, #moroso, #mayorista)' },
      { icon: MessageSquare, text: 'Click-to-WhatsApp con plantillas por cliente' },
      { icon: Activity, text: 'Score de riesgo crediticio automatico' },
    ],
  },
  {
    id: 'operaciones',
    icon: CalendarDays,
    color: 'amber',
    title: 'Operaciones',
    subtitle: 'Herramientas operativas',
    features: [
      { icon: Users, text: 'RRHH completo: nomina, vales, cortes, historial salarial' },
      { icon: Truck, text: 'Panel de despacho con firma digital del receptor' },
      { icon: Calculator, text: 'Reporte de comisiones por empleado y servicio' },
      { icon: BarChart3, text: 'Estadisticas y KPIs del negocio en tiempo real' },
      { icon: BookOpen, text: 'Libro de movimientos con filtros avanzados' },
      { icon: Download, text: 'Backup completo descargable en ZIP (CSVs)' },
      { icon: Upload, text: 'Migrador Excel robusto con mapeo de columnas y validacion' },
    ],
  },
  {
    id: 'seguridad',
    icon: Shield,
    color: 'teal',
    title: 'Seguridad Enterprise',
    subtitle: 'Tu data protegida',
    features: [
      { icon: Shield, text: 'Firestore Security Rules con aislamiento por negocio' },
      { icon: Lock, text: 'Permisos granulares por rol (owner, admin, cajero, vendedor)' },
      { icon: KeyRound, text: 'Bloqueo rapido con PIN (Ctrl+L) sin cerrar sesion' },
      { icon: Activity, text: 'Audit log completo con diff de cada cambio critico' },
      { icon: Eye, text: 'Rate limiting contra fuerza bruta (login, OTP, PIN)' },
      { icon: Shield, text: 'CSP headers grado A + HSTS + X-Frame-Options DENY' },
      { icon: Lock, text: 'Timeout de sesion configurable (5-30 min)' },
      { icon: Download, text: 'Derecho al olvido: elimina tu cuenta y todos tus datos' },
      { icon: Activity, text: 'ErrorBoundary global + Sentry para monitoreo de errores' },
      { icon: RefreshCw, text: 'PWA instalable con Service Worker y modo offline basico' },
    ],
  },
  {
    id: 'ux',
    icon: Palette,
    color: 'pink',
    title: 'Experiencia de Usuario',
    subtitle: 'Bonito y rapido',
    features: [
      { icon: Smartphone, text: 'Mobile-first: 100% responsive en Android, iOS y tablets' },
      { icon: Search, text: 'Busqueda global Cmd+K en toda la app (clientes, productos, ventas)' },
      { icon: Bell, text: 'Centro de notificaciones en tiempo real (stock, vencimientos, pagos)' },
      { icon: Palette, text: 'Tema oscuro y claro con selector + escala de fuente accesible' },
      { icon: LayoutGrid, text: 'Tour guiado interactivo para nuevos usuarios' },
      { icon: Moon, text: 'Atajos de teclado configurables (F9 cobrar, Ctrl+N nuevo...)' },
      { icon: Building2, text: 'Multi-empresa: cambia de negocio sin cerrar sesion' },
      { icon: Brain, text: 'Auditoria IA: preguntale al sistema sobre tus datos' },
      { icon: TrendingUp, text: 'Calculadora de rentabilidad al crear producto' },
      { icon: Globe, text: 'Onboarding inteligente con presets por tipo de negocio' },
    ],
  },
];

const STATS = [
  { value: '70+', label: 'Funciones' },
  { value: '27', label: 'Bancos VE' },
  { value: '6', label: 'Tiers fidelidad' },
  { value: '24/7', label: 'Portal online' },
];

const STEPS = [
  { num: '01', title: 'Crea tu cuenta', desc: 'Registro en 2 minutos. Sin tarjeta. 30 dias de acceso completo.' },
  { num: '02', title: 'Configura tu negocio', desc: 'Elige tu tipo de negocio y el sistema carga categorias, unidades e IVA automaticamente.' },
  { num: '03', title: 'Empieza a vender', desc: 'POS funcionando desde el primer dia. Datos en la nube, acceso desde cualquier dispositivo.' },
];

const FAQS = [
  {
    q: 'Necesito tarjeta de credito para el trial?',
    a: 'No. Los 30 dias son completamente gratis, sin tarjeta. Al vencer puedes elegir el plan que mas te convenga o quedarte en el plan Gratis con funciones basicas.',
  },
  {
    q: 'Como activo un plan de pago?',
    a: 'Por ahora el proceso es manual. Contactanos por WhatsApp, acuerda el metodo de pago (Pagomovil, Zelle, Binance) y activamos tu plan en cuestion de minutos.',
  },
  {
    q: 'Mis datos estan seguros?',
    a: 'Si. Todo esta almacenado en Firebase (Google) con encriptacion en transito y en reposo. Firestore Security Rules aislan cada negocio. Tu informacion nunca se comparte.',
  },
  {
    q: 'Funciona en el telefono?',
    a: 'Si. Dualis es mobile-first y funciona perfecto en Android, iOS y tablets. Ademas es una PWA instalable: agregala a tu pantalla de inicio y usala como app nativa.',
  },
  {
    q: 'Puedo tener varias sucursales?',
    a: 'Si. Desde el Plan Negocio tienes 1 sucursal incluida. Con el Plan Pro tienes 3, y con Enterprise puedes tener ilimitadas.',
  },
  {
    q: 'Que es el Programa Embajador?',
    a: 'Puedes activarlo en Configuracion. Tus comunicaciones con clientes incluiran un enlace discreto a Dualis. Si un cliente tuyo se registra y paga su primer plan, tu recibes un descuento permanente en tu suscripcion.',
  },
  {
    q: 'Puedo agregar funciones extra sin cambiar de plan?',
    a: 'Si. Tenemos add-ons individuales: Portal de Clientes, Tienda Publica, WhatsApp Automatico, Auditoria IA, entre otros. Pagas solo lo que necesitas.',
  },
  {
    q: 'Dualis emite facturas fiscales ante el SENIAT?',
    a: 'No. Dualis es un sistema administrativo y de gestion interna, NO es un sistema de facturacion homologado por el SENIAT. Los comprobantes que genera son documentos internos sin valor fiscal. Tu negocio debe mantener su medio de emision fiscal externo.',
  },
  {
    q: 'Puedo importar mis datos desde Excel?',
    a: 'Si. El migrador Excel te permite importar clientes, productos, proveedores y movimientos historicos con mapeo de columnas, validacion fila por fila y preview antes de confirmar.',
  },
  {
    q: 'Que pasa si se me va el internet?',
    a: 'Dualis detecta la desconexion y muestra un banner informativo. Al reconectar, Firebase sincroniza automaticamente. Estamos desarrollando el modo offline completo para proximas versiones.',
  },
];

// ─── Contact form ─────────────────────────────────────────────────────────────

function ContactForm() {
  const [form, setForm]       = useState({ name: '', company: '', phone: '', needs: '' });
  const [honeypot, setHoneypot] = useState('');
  const formMountedAtRef = React.useRef(Date.now());
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    // Honeypot: si el campo oculto trae texto, lo llenó un bot.
    if (honeypot.trim().length > 0) {
      setSent(true); // fake-success para no dar señal
      return;
    }
    // Anti-spam temporal: bots típicamente envían en <1500ms desde el mount.
    if (Date.now() - formMountedAtRef.current < 1500) {
      setSent(true);
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'contactRequests'), { ...form, createdAt: serverTimestamp() });
      setSent(true);
    } catch {
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
        <h3 className="text-lg font-black text-white">Mensaje enviado!</h3>
        <p className="text-sm text-white/40 max-w-xs">Te contactamos en menos de 24 horas.</p>
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
      {/* Honeypot — invisible para humanos, los bots lo llenan */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', opacity: 0 }}
      />
      {[
        { key: 'name',    label: 'Tu nombre*',       placeholder: 'Juan Garcia',        span: false },
        { key: 'company', label: 'Empresa',           placeholder: 'Distribuidora XYZ',  span: false },
        { key: 'phone',   label: 'WhatsApp*',         placeholder: '+58 412 000 0000',   span: false },
        { key: 'needs',   label: 'Que necesitas?',   placeholder: 'Describe brevemente...', span: true },
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
          {sending ? 'Enviando...' : 'Enviar mensaje'}
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

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { icon: string; bg: string; border: string; glow: string; gradient: string }> = {
  indigo:  { icon: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  glow: 'shadow-indigo-500/10',  gradient: 'from-indigo-500 to-blue-600' },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10', gradient: 'from-emerald-500 to-teal-600' },
  sky:     { icon: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     glow: 'shadow-sky-500/10',     gradient: 'from-sky-500 to-cyan-600' },
  violet:  { icon: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  glow: 'shadow-violet-500/10',  gradient: 'from-violet-500 to-purple-600' },
  rose:    { icon: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    glow: 'shadow-rose-500/10',    gradient: 'from-rose-500 to-pink-600' },
  amber:   { icon: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   glow: 'shadow-amber-500/10',   gradient: 'from-amber-500 to-orange-600' },
  teal:    { icon: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    glow: 'shadow-teal-500/10',    gradient: 'from-teal-500 to-cyan-600' },
  pink:    { icon: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    glow: 'shadow-pink-500/10',    gradient: 'from-pink-500 to-rose-600' },
};

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

  // Feature expand
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // FAQ accordion
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#060a13] text-white font-sans overflow-x-hidden">
      <SEO
        title="Dualis — Sistema ERP para negocios venezolanos"
        description="POS, Inventario, CxC, CxP, Tesoreria, RRHH, Portal de Clientes, Fidelidad y 70+ funciones. 30 dias gratis."
      />

      {/* ── TOPBAR ───────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.05] bg-[#060a13]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Dualis" className="w-8 h-8 rounded-xl object-contain" />
            <span className="font-black text-[15px] tracking-tight">Dualis</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {[
              { label: 'Funciones', href: '#funciones' },
              { label: 'Planes', href: '#planes' },
              { label: 'Embajador', href: '#embajador' },
              { label: 'FAQ', href: '#faq' },
              { label: 'Contacto', href: '#contacto' },
            ].map(n => (
              <a key={n.label} href={n.href} className="text-[12px] font-bold text-white/40 hover:text-white/80 transition-colors">{n.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-[12px] font-black text-white/40 hover:text-white transition-colors">
              Iniciar sesion
            </button>
            <button
              onClick={() => navigate('/register')}
              className="h-9 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[12px] font-black shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-all"
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-28 px-4 overflow-hidden">
        {/* Ambient orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-indigo-600/[0.07] rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-32 right-0 w-[400px] h-[400px] bg-violet-600/[0.05] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-sky-600/[0.04] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-black uppercase tracking-widest mb-8">
            <Sparkles size={11} /> 30 dias gratis &middot; Sin tarjeta &middot; 70+ funciones
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] mb-6 tracking-tight">
            El ERP que controla
            <br />
            <span
              className={`bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent transition-all duration-300 inline-block ${heroFade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}
            >
              {HERO_WORDS[heroIdx]}
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/40 max-w-3xl mx-auto mb-10 leading-relaxed">
            POS, inventario, finanzas, tesoreria, portal de clientes, fidelidad, RRHH
            y mucho mas. Disenado para la realidad del negocio venezolano.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto h-14 px-10 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[15px] shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
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

          <p className="text-[11px] text-white/20">
            Plan Pro completo por 30 dias &middot; No se requiere tarjeta &middot; Cancela cuando quieras
          </p>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────── */}
      <section className="border-y border-white/[0.05] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(s => (
              <FadeIn key={s.label}>
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">{s.value}</p>
                  <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mt-1">{s.label}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES MEGA SECTION ────────────────────────────── */}
      <section id="funciones" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <FadeIn>
            <div className="text-center mb-16">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Todo lo que necesitas</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
                70+ funciones en un solo sistema
              </h2>
              <p className="text-white/40 mt-4 text-base sm:text-lg max-w-2xl mx-auto">
                Desde el punto de venta hasta la tesoreria. Cada modulo esta conectado
                con los demas: cero datos aislados, cero duplicacion.
              </p>
            </div>
          </FadeIn>

          {/* Category cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {FEATURE_CATEGORIES.map((cat, ci) => {
              const c = COLOR_MAP[cat.color];
              const isOpen = expandedCat === cat.id;

              return (
                <FadeIn key={cat.id} delay={ci * 50} className={isOpen ? 'md:col-span-2 xl:col-span-4' : ''}>
                  <div
                    className={`rounded-2xl border transition-all duration-300 cursor-pointer group ${
                      isOpen
                        ? `${c.bg} ${c.border} shadow-lg ${c.glow}`
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]'
                    }`}
                    onClick={() => setExpandedCat(isOpen ? null : cat.id)}
                  >
                    {/* Header */}
                    <div className="p-6 flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${c.icon} ${c.bg} ${c.border}`}>
                        <cat.icon size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-[16px] text-white">{cat.title}</h3>
                        <p className="text-[12px] text-white/40 mt-0.5">{cat.subtitle}</p>
                        <p className="text-[11px] text-white/20 mt-2">{cat.features.length} funciones</p>
                      </div>
                      <ChevronDown size={16} className={`text-white/20 shrink-0 mt-1 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded features */}
                    {isOpen && (
                      <div className="px-6 pb-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                          {cat.features.map((f, fi) => (
                            <div key={fi} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                              <f.icon size={15} className={`${c.icon} shrink-0 mt-0.5`} />
                              <span className="text-[12px] text-white/60 leading-relaxed">{f.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>

          {/* Quick module badges */}
          <FadeIn delay={300}>
            <div className="mt-10 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-5">Modulos incluidos</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {[
                  { Icon: ShoppingCart, label: 'POS Detal' },
                  { Icon: Building2,    label: 'POS Mayor' },
                  { Icon: Package,      label: 'Inventario' },
                  { Icon: Wallet,       label: 'CxC' },
                  { Icon: Receipt,      label: 'CxP' },
                  { Icon: Landmark,     label: 'Tesoreria' },
                  { Icon: TrendingUp,   label: 'Tasas BCV' },
                  { Icon: Users,        label: 'RRHH' },
                  { Icon: Globe,        label: 'Portal' },
                  { Icon: Heart,        label: 'Fidelidad' },
                  { Icon: BarChart3,    label: 'Estadisticas' },
                  { Icon: Brain,        label: 'Auditoria IA' },
                  { Icon: FileText,     label: 'Cotizaciones' },
                  { Icon: Truck,        label: 'Despacho' },
                  { Icon: Shield,       label: 'Seguridad' },
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

      {/* ── HIGHLIGHT FEATURES (top 3 unique) ────────────────── */}
      <section className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Lo que nos diferencia</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Hecho para Venezuela</h2>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: TrendingUp, color: 'sky',
                title: 'Tasas BCV automaticas',
                desc: 'El sistema actualiza la tasa BCV solo. Soporta tasas paralelas y personalizadas. Reportes con conversion multi-tasa historica para que tus numeros tengan sentido a pesar de la inflacion.',
              },
              {
                icon: Globe, color: 'violet',
                title: 'Portal de clientes 24/7',
                desc: 'Tu cliente consulta su estado de cuenta, sube comprobantes de pago con voucher, chatea contigo en tiempo real y descarga PDFs. Con tu logo y colores. Funciona perfecto desde el celular.',
              },
              {
                icon: Landmark, color: 'emerald',
                title: 'Tesoreria con 27 bancos VE',
                desc: 'Banesco, Mercantil, BDV, Provincial y todos los demas. Pago movil, Zelle, Binance. Verificacion de llegada al banco, conciliacion rapida y saldo virtual por cuenta.',
              },
            ].map((f, i) => {
              const c = COLOR_MAP[f.color];
              return (
                <FadeIn key={f.title} delay={i * 80}>
                  <div className={`p-7 rounded-2xl border transition-all hover:scale-[1.02] ${c.bg} ${c.border}`}>
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-5 ${c.icon} ${c.bg} ${c.border}`}>
                      <f.icon size={22} />
                    </div>
                    <h3 className="font-black text-[17px] text-white mb-3">{f.title}</h3>
                    <p className="text-[13px] text-white/50 leading-relaxed">{f.desc}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-14">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Arrancar es facil</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">3 pasos y estas vendiendo</h2>
            </div>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <FadeIn key={s.num} delay={i * 100}>
                <div className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-indigo-500/20 transition-all">
                  <div className="text-[56px] font-black text-white/[0.03] leading-none mb-3 select-none">{s.num}</div>
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
      <section id="planes" className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="text-center mb-10">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Precios transparentes</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Planes desde $12/mes</h2>
              <p className="text-white/40 mt-3 text-sm max-w-xl mx-auto">
                Planes que escalan contigo, desde gratis hasta enterprise.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {[
              { name: 'Gratis',     price: '$0',    desc: '1 usuario, 50 productos, POS basico', gradient: 'from-slate-400 to-slate-500' },
              { name: 'Negocio',    price: '$35',   desc: 'CxC, CxP, tesoreria, multi-cuenta, portal', gradient: 'from-indigo-500 to-violet-600', popular: true },
              { name: 'Pro',        price: '$65',   desc: 'Vision IA, embajador, 3 sucursales, todo', gradient: 'from-violet-500 to-purple-600' },
            ].map(p => (
              <FadeIn key={p.name}>
                <div className={`relative p-5 rounded-2xl border h-full ${(p as any).popular ? 'bg-gradient-to-b from-indigo-600/[0.12] to-violet-600/[0.06] border-indigo-500/30' : 'bg-white/[0.02] border-white/[0.07]'}`}>
                  {(p as any).popular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[8px] font-black uppercase tracking-widest whitespace-nowrap">Mas popular</div>
                  )}
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.gradient} mb-3`} />
                  <h3 className="font-black text-sm text-white">{p.name}</h3>
                  <p className="text-xl font-black text-white mt-1">{p.price}<span className="text-[10px] text-white/30 font-bold ml-1">{p.price !== '$0' ? '/mes' : ''}</span></p>
                  <p className="text-[10px] text-white/40 mt-2 leading-relaxed">{p.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

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
      <section id="embajador" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 mb-3">Crecimiento viral</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Gana mientras usas el sistema</h2>
              <p className="text-white/40 mt-3 text-sm max-w-xl mx-auto">
                Activa el Programa Embajador y cada comunicacion tuya con tus clientes le presenta Dualis a nuevos negocios.
              </p>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FadeIn>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'Activas el programa', desc: 'Un toggle en Configuracion. Tu negocio empieza a aparecer en las comunicaciones.' },
                  { step: '2', title: 'Tu cliente descubre Dualis', desc: 'Nota de entrega, portal, emails: todo incluye un link de referido.' },
                  { step: '3', title: 'Se registra y paga su primer plan', desc: 'Despues de 30 dias activos, se activa tu beneficio.' },
                  { step: '4', title: 'Ganas descuento permanente', desc: '5% por referido activo, acumulable hasta 25%. 10 referidos = mes gratis cada trimestre.' },
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
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ──────────────────────────────────────── */}
      <section className="py-16 px-4 bg-white/[0.01]">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <div className="p-8 rounded-2xl bg-indigo-500/[0.04] border border-indigo-500/[0.10] text-center">
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={16} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-lg text-white/60 font-bold italic max-w-xl mx-auto mb-4">
                "Dualis transformo la manera en que manejamos nuestras cuentas por cobrar.
                El portal de clientes nos ahorro horas de WhatsApp cada semana."
              </p>
              <p className="text-[12px] font-black text-white/30 uppercase tracking-widest">
                Beta tester — Distribuidora Caracas
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <div className="text-center mb-12">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Tienes dudas?</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Preguntas frecuentes</h2>
            </div>
          </FadeIn>

          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <FadeIn key={i} delay={i * 30}>
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
      <section id="contacto" className="py-20 px-4 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <FadeIn>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-3">Hablemos</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
                  Necesitas una cotizacion o tienes preguntas?
                </h2>
                <p className="text-white/40 text-sm leading-relaxed mb-8">
                  Escribenos y te respondemos en menos de 24 horas.
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
                <p className="text-[13px] font-black text-white/60 mb-5">Envianos un mensaje</p>
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
            <div className="relative p-10 sm:p-14 rounded-3xl bg-gradient-to-b from-indigo-600/[0.12] to-violet-600/[0.06] border border-indigo-500/20 overflow-hidden">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-56 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
              <Rocket size={32} className="text-indigo-400 mx-auto mb-5 relative" />
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4 relative">
                Empieza hoy. Es gratis.
              </h2>
              <p className="text-white/40 text-sm mb-8 relative max-w-lg mx-auto">
                30 dias de acceso completo al Plan Pro con las 70+ funciones.
                Sin tarjeta, sin compromiso. Cancela o cambia de plan cuando quieras.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
                <button
                  onClick={() => navigate('/register')}
                  className="w-full sm:w-auto h-14 px-10 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[15px] shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
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
            {[
              { label: 'Funciones', href: '#funciones' },
              { label: 'Planes', href: '#planes' },
              { label: 'Embajador', href: '#embajador' },
              { label: 'FAQ', href: '#faq' },
              { label: 'Contacto', href: '#contacto' },
            ].map(n => (
              <a key={n.label} href={n.href} className="text-[11px] font-bold text-white/30 hover:text-white/60 transition-colors">{n.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <a href="mailto:hola@dualis.app" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">hola@dualis.app</a>
            <span className="text-white/10">&middot;</span>
            <a href={`https://wa.me/${DUALIS_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">WhatsApp</a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] text-white/15">&copy; {new Date().getFullYear()} Dualis. Todos los derechos reservados.</p>
          <div className="flex gap-4">
            <a href="/terms" className="text-[10px] text-white/15 hover:text-white/30 transition-colors">Terminos</a>
            <a href="/privacy" className="text-[10px] text-white/15 hover:text-white/30 transition-colors">Privacidad</a>
            <a href="/changelog" className="text-[10px] text-white/15 hover:text-white/30 transition-colors">Changelog</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
