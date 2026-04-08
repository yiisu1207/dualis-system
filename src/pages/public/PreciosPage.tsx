import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Minus, ArrowRight, Zap, ChevronDown, Sparkles, Crown,
  Building2, Rocket, Star, ShieldCheck, MessageSquare, TrendingUp,
  Award, Globe, ShoppingCart, Brain, Users, Activity, Wallet,
  Scissors, Pill, Wrench, Cake, Wine, Flower2, Hammer, Cpu,
  Stethoscope, UtensilsCrossed, Shirt, Store, Briefcase, Package,
} from 'lucide-react';
import SEO from '../../components/SEO';
import {
  PLANS, COMPARE_ROWS, ADDON_PRICES,
  VERTICAL_PRICES, ANNUAL_DISCOUNT,
  buildQuoteWhatsApp, DUALIS_WHATSAPP,
} from '../../utils/planConfig';

// ─── Verticales con iconos ──────────────────────────────────────────────────
const VERTICAL_OPTIONS: { value: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }[] = [
  { value: 'general',     label: 'General',     icon: Briefcase,        color: 'from-slate-500 to-slate-600'   },
  { value: 'peluqueria',  label: 'Peluquería',  icon: Scissors,         color: 'from-pink-500 to-rose-500'     },
  { value: 'barberia',    label: 'Barbería',    icon: Scissors,         color: 'from-amber-500 to-orange-600'  },
  { value: 'boutique',    label: 'Boutique',    icon: Shirt,            color: 'from-fuchsia-500 to-pink-600'  },
  { value: 'bodega',      label: 'Bodega',      icon: Store,            color: 'from-emerald-500 to-teal-600'  },
  { value: 'floristeria', label: 'Floristería', icon: Flower2,          color: 'from-rose-400 to-pink-500'     },
  { value: 'licoreria',   label: 'Licorería',   icon: Wine,             color: 'from-red-500 to-rose-700'      },
  { value: 'ferreteria',  label: 'Ferretería',  icon: Hammer,           color: 'from-slate-500 to-zinc-700'    },
  { value: 'panaderia',   label: 'Panadería',   icon: Cake,             color: 'from-amber-400 to-yellow-600'  },
  { value: 'reposteria',  label: 'Repostería',  icon: Cake,             color: 'from-pink-400 to-amber-500'    },
  { value: 'tecnologia',  label: 'Tecnología',  icon: Cpu,              color: 'from-cyan-500 to-blue-600'     },
  { value: 'servicios',   label: 'Servicios',   icon: Wrench,           color: 'from-indigo-500 to-violet-600' },
  { value: 'veterinaria', label: 'Veterinaria', icon: Stethoscope,      color: 'from-teal-500 to-emerald-600'  },
  { value: 'farmacia',    label: 'Farmacia',    icon: Pill,             color: 'from-emerald-500 to-green-700' },
  { value: 'restaurant',  label: 'Restaurant',  icon: UtensilsCrossed,  color: 'from-orange-500 to-red-600'    },
];

// ─── Iconos por plan ───────────────────────────────────────────────────────
const PLAN_ICONS: Record<string, { Icon: React.ComponentType<{ size?: number; className?: string }>; gradient: string; glow: string }> = {
  gratis:     { Icon: Sparkles,  gradient: 'from-slate-400 to-slate-600',     glow: 'shadow-slate-500/20'  },
  vertical:   { Icon: Star,      gradient: 'from-emerald-400 to-teal-600',    glow: 'shadow-emerald-500/30' },
  basico:     { Icon: Zap,       gradient: 'from-sky-400 to-blue-600',        glow: 'shadow-sky-500/20'    },
  negocio:    { Icon: Building2, gradient: 'from-indigo-500 to-violet-600',   glow: 'shadow-indigo-500/40' },
  pro:        { Icon: Crown,     gradient: 'from-violet-500 to-fuchsia-600',  glow: 'shadow-violet-500/30' },
  enterprise: { Icon: Rocket,    gradient: 'from-amber-400 to-orange-600',    glow: 'shadow-amber-500/25'  },
};

const pricingSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Dualis ERP',
  description: 'Sistema ERP Cloud para empresas venezolanas.',
  url: 'https://dualis.online/precios',
  offers: PLANS.filter(p => typeof p.price === 'number' && p.price !== null && p.price > 0).map(p => ({
    '@type': 'Offer',
    name: p.name,
    price: p.price === -1 ? 12 : p.price,
    priceCurrency: 'USD',
    description: p.tagline,
    eligibleDuration: 'P1M',
    url: 'https://dualis.online/register',
  })),
};

export default function PreciosPage() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [vertical, setVertical] = useState<string>('general');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(['Ventas', 'Finanzas']));

  const cats = useMemo(() => [...new Set(COMPARE_ROWS.map(r => r.cat))], []);
  const verticalPrice = VERTICAL_PRICES[vertical] ?? 15;
  const verticalLabel = VERTICAL_OPTIONS.find(v => v.value === vertical)?.label ?? 'General';

  const toggleCat = (cat: string) => setOpenCats(prev => {
    const n = new Set(prev);
    n.has(cat) ? n.delete(cat) : n.add(cat);
    return n;
  });

  const computePrice = (price: number | null) => {
    if (price === null) return null;
    if (price === 0)    return 0;
    if (price === -1)   return annual ? +(verticalPrice * (1 - ANNUAL_DISCOUNT)).toFixed(0) : verticalPrice;
    return annual ? +(price * (1 - ANNUAL_DISCOUNT)).toFixed(0) : price;
  };

  const monthlyToAnnualSavings = (price: number) => +(price * 12 * ANNUAL_DISCOUNT).toFixed(0);

  return (
    <>
      <SEO
        title="Precios — Dualis ERP | Desde $12/mes"
        description="Planes de Dualis ERP para empresas venezolanas. Plan vertical desde $12/mes según tu rubro, Negocio $35, Pro $65. 30 días gratis sin tarjeta. POS, inventario, CxC, RRHH y más."
        url="https://dualis.online/precios"
        jsonLd={pricingSchema}
      />
      <div className="min-h-screen bg-[#020710] text-white relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-96 right-0 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-[800px] left-0 w-[400px] h-[400px] bg-emerald-600/8 rounded-full blur-[120px] pointer-events-none" />

        {/* ── NAV ─────────────────────────────────────────── */}
        <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#020710]/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Dualis" className="w-8 h-8 rounded-xl object-contain" />
              <span className="text-white font-black text-lg tracking-tight">
                Dualis<span className="text-indigo-400">.</span>
              </span>
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => navigate('/')} className="hidden sm:block text-sm text-white/50 hover:text-white transition-colors font-bold">← Inicio</button>
              <button
                onClick={() => navigate('/register')}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl text-xs sm:text-sm font-black hover:opacity-90 transition-all shadow-lg shadow-indigo-500/25"
              >
                Empezar gratis
              </button>
            </div>
          </div>
        </nav>

        <div className="relative pt-28 pb-20 max-w-6xl mx-auto px-4 sm:px-6">
          {/* ── HERO ──────────────────────────────────────── */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-[0.25em] mb-6">
              <Sparkles className="w-3 h-3" />
              30 días gratis · Sin tarjeta
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-5">
              Precios{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                honestos
              </span>
              <br />para tu negocio
            </h1>
            <p className="text-white/50 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Elige el plan que se adapta a tu rubro. Empieza gratis, escala cuando lo necesites.
              <br className="hidden sm:block" />
              <span className="text-white/70 font-bold">Cancela cuando quieras.</span>
            </p>

            {/* Toggle anual/mensual */}
            <div className="flex items-center justify-center gap-4 mt-10">
              <span className={`text-sm font-black transition-colors ${!annual ? 'text-white' : 'text-white/30'}`}>Mensual</span>
              <button
                onClick={() => setAnnual(v => !v)}
                className={`relative w-14 h-7 rounded-full transition-all ${annual ? 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/40' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all ${annual ? 'left-8' : 'left-1'}`} />
              </button>
              <span className={`text-sm font-black transition-colors flex items-center gap-2 ${annual ? 'text-white' : 'text-white/30'}`}>
                Anual
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  Ahorra {Math.round(ANNUAL_DISCOUNT * 100)}%
                </span>
              </span>
            </div>
          </div>

          {/* ── VERTICAL SELECTOR ─────────────────────────── */}
          <div className="mb-16">
            <div className="text-center mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Elige tu rubro</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white">¿Qué tipo de negocio tienes?</h2>
              <p className="text-white/40 text-sm mt-2">El plan vertical incluye módulos hechos a medida para ti</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2.5">
              {VERTICAL_OPTIONS.map(opt => {
                const isActive = vertical === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setVertical(opt.value)}
                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-white/[0.08] border-indigo-500/50 ring-2 ring-indigo-500/30 scale-105'
                        : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.05] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${opt.color} shadow-lg flex items-center justify-center`}>
                      <opt.icon size={16} className="text-white" />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── PLAN CARDS ────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-16">
            {PLANS.map(plan => {
              const price = computePrice(plan.price);
              const meta = PLAN_ICONS[plan.id] ?? PLAN_ICONS.basico;
              const isPopular = plan.popular;
              const isVertical = plan.isVertical;
              const isEnterprise = plan.isEnterprise;
              const monthlyForSavings = plan.price === -1 ? verticalPrice : (typeof plan.price === 'number' ? plan.price : 0);
              const savings = monthlyForSavings > 0 && annual ? monthlyToAnnualSavings(monthlyForSavings) : 0;

              return (
                <div
                  key={plan.id}
                  className={`group relative flex flex-col rounded-3xl border p-6 transition-all hover:-translate-y-1 ${
                    isPopular
                      ? 'bg-gradient-to-b from-indigo-600/[0.18] via-violet-600/[0.08] to-transparent border-indigo-500/40 ring-1 ring-indigo-500/30 shadow-2xl shadow-indigo-500/10'
                      : isVertical
                        ? 'bg-gradient-to-b from-emerald-600/[0.12] via-teal-600/[0.04] to-transparent border-emerald-500/30 ring-1 ring-emerald-500/20'
                        : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15]'
                  }`}
                >
                  {/* Badge */}
                  {(isPopular || isVertical) && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap shadow-lg ${
                        isPopular
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/40'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/40'
                      }`}>
                        {isPopular ? '⭐ Más popular' : `Para tu ${verticalLabel}`}
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.gradient} ${meta.glow} shadow-xl flex items-center justify-center mb-4`}>
                    <meta.Icon size={20} className="text-white" />
                  </div>

                  <h3 className="font-black text-xl text-white mb-1">{plan.name}</h3>
                  <p className="text-white/40 text-xs mb-5 leading-relaxed min-h-[32px]">{plan.tagline}</p>

                  {/* Price */}
                  <div className="mb-5 min-h-[64px]">
                    {isEnterprise ? (
                      <>
                        <p className="text-3xl font-black text-white">Cotización</p>
                        <p className="text-[11px] text-white/40 mt-1">Precio personalizado</p>
                      </>
                    ) : price === 0 ? (
                      <>
                        <p className="text-4xl font-black text-white">$0</p>
                        <p className="text-[11px] text-white/40 mt-1">Para siempre</p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-4xl font-black text-white">${price}</span>
                          <span className="text-white/40 text-xs font-bold">/mes</span>
                        </div>
                        {annual && savings > 0 && (
                          <p className="text-[11px] text-emerald-400 font-black mt-1">
                            Ahorras ${savings}/año
                          </p>
                        )}
                        {!annual && monthlyForSavings > 0 && (
                          <p className="text-[11px] text-white/40 mt-1">
                            o ${Math.round(monthlyForSavings * (1 - ANNUAL_DISCOUNT))}/mes anual
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() =>
                      isEnterprise
                        ? window.open(buildQuoteWhatsApp(), '_blank')
                        : navigate('/register')
                    }
                    className={`w-full py-3 rounded-xl font-black text-xs mb-6 flex items-center justify-center gap-1.5 transition-all ${
                      isPopular
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:opacity-95'
                        : isVertical
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:opacity-95'
                          : 'bg-white/[0.08] border border-white/[0.1] text-white/80 hover:bg-white/[0.12] hover:text-white'
                    }`}
                  >
                    {isEnterprise ? 'Cotizar' : plan.id === 'gratis' ? 'Empezar gratis' : 'Empezar trial'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Features */}
                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-[12px] text-white/65 leading-relaxed">
                        <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
                        </div>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* ── TRUST STRIP ───────────────────────────────── */}
          <div className="mb-16 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[
                { icon: ShieldCheck, label: 'Datos seguros',     desc: 'Firebase + cifrado'  },
                { icon: Globe,       label: 'Cloud 24/7',         desc: 'Acceso desde donde sea'  },
                { icon: TrendingUp,  label: 'Sin tarjeta',         desc: '30 días de prueba'   },
                { icon: Award,       label: 'Hecho en Venezuela',  desc: 'Soporte local'        },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white">{label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ADD-ONS ────────────────────────────────────── */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Add-ons</p>
              <h2 className="text-3xl font-black text-white">Agrega solo lo que necesitas</h2>
              <p className="text-white/40 text-sm mt-2">Funciones extra que puedes activar en cualquier plan</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Portal de Clientes',     desc: 'Estado de cuenta + pagos',     price: ADDON_PRICES.portal,        icon: Globe,         color: 'from-emerald-500 to-teal-600'   },
                { label: 'Tienda Pública',         desc: 'Catálogo + tienda online',     price: ADDON_PRICES.tienda,        icon: ShoppingCart,  color: 'from-pink-500 to-rose-600'      },
                { label: 'Dualis Pay',             desc: 'Link de cobro universal',       price: ADDON_PRICES.dualisPay,     icon: Wallet,        color: 'from-amber-500 to-orange-600'   },
                { label: 'WA/Email Auto',          desc: 'Cobranza automática',           price: ADDON_PRICES.whatsappAuto,  icon: MessageSquare, color: 'from-green-500 to-emerald-600'  },
                { label: 'Auditoría IA',           desc: 'Análisis con Claude',           price: ADDON_PRICES.auditoria_ia,  icon: Brain,         color: 'from-violet-500 to-fuchsia-600' },
                { label: 'Conciliación',           desc: 'Bancaria automática',           price: ADDON_PRICES.conciliacion,  icon: Activity,      color: 'from-sky-500 to-blue-600'       },
                { label: 'Sucursal +1',            desc: 'Ubicación adicional',           price: ADDON_PRICES.sucursalExtra, icon: Building2,     color: 'from-indigo-500 to-violet-600'  },
                { label: 'Pack 5 Usuarios',        desc: 'Más miembros del equipo',        price: ADDON_PRICES.usuariosExtra, icon: Users,         color: 'from-cyan-500 to-sky-600'       },
              ].map(({ label, desc, price, icon: Icon, color }) => (
                <div key={label} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} shadow-lg flex items-center justify-center shrink-0`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white truncate">{label}</p>
                    <p className="text-[10px] text-white/40 truncate">{desc}</p>
                  </div>
                  <span className="text-xs font-black text-indigo-400 shrink-0">+${price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── COMPARATIVA DETALLADA ──────────────────────── */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Comparativa</p>
              <h2 className="text-3xl font-black text-white">Todo lo que incluye cada plan</h2>
              <p className="text-white/40 text-sm mt-2">Click en cada categoría para expandir</p>
            </div>
            <div className="rounded-3xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
              <div className="grid grid-cols-7 bg-white/[0.04] border-b border-white/[0.07]">
                <div className="col-span-2 p-4" />
                {['Gratis', 'Básico', 'Negocio', 'Pro', 'Ent.'].map(n => (
                  <div key={n} className="p-4 text-center">
                    <span className={`text-[11px] font-black uppercase tracking-widest ${n === 'Negocio' ? 'text-indigo-400' : 'text-white/40'}`}>{n}</span>
                  </div>
                ))}
              </div>

              {cats.map(cat => (
                <div key={cat}>
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full grid grid-cols-7 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] transition-all border-b border-white/[0.04]"
                  >
                    <div className="col-span-2 flex items-center gap-2">
                      <ChevronDown size={12} className={`text-white/30 transition-transform ${openCats.has(cat) ? 'rotate-0' : '-rotate-90'}`} />
                      <span className="text-[11px] font-black uppercase tracking-widest text-white/60">{cat}</span>
                    </div>
                  </button>
                  {openCats.has(cat) && COMPARE_ROWS.filter(r => r.cat === cat).map((row, ri) => (
                    <div key={ri} className="grid grid-cols-7 border-b border-white/[0.03] hover:bg-white/[0.02] transition-all">
                      <div className="col-span-2 px-5 py-3">
                        <span className="text-[12px] text-white/55">{row.label}</span>
                      </div>
                      {([row.g, row.b, row.n, row.p, row.e] as (boolean | string)[]).map((val, vi) => (
                        <div key={vi} className="flex items-center justify-center py-3">
                          {val === true ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                              <Check size={11} className="text-emerald-400" strokeWidth={3} />
                            </div>
                          ) : val === false ? (
                            <Minus size={12} className="text-white/15" />
                          ) : (
                            <span className="text-[10px] font-black text-indigo-300 text-center px-1">{val}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── FAQs ──────────────────────────────────────── */}
          <div className="max-w-3xl mx-auto mb-16">
            <div className="text-center mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-2">Preguntas frecuentes</p>
              <h2 className="text-3xl font-black text-white">¿Tienes dudas?</h2>
            </div>
            <div className="space-y-3">
              {[
                { q: '¿Necesito tarjeta de crédito para empezar?', a: 'No. Los 30 días de prueba del Plan Pro son gratuitos y no requieren tarjeta. Después puedes elegir el plan que prefieras.' },
                { q: '¿Qué pasa cuando termina el período de prueba?', a: 'Puedes elegir un plan de pago en cualquier momento. Tus datos se conservan 30 días adicionales antes de eliminarse, así nunca pierdes información.' },
                { q: '¿Puedo cambiar de plan?', a: 'Sí, puedes subir o bajar de plan cuando quieras desde Configuración → Suscripción. La diferencia se prorratea automáticamente.' },
                { q: '¿Qué es el Plan Vertical?', a: 'Es un plan diseñado para tu tipo específico de negocio. Por ejemplo: si tienes una barbería, incluye sistema de citas y comisiones. Si tienes una farmacia, incluye control de vencimientos. Cada rubro tiene módulos hechos a medida.' },
                { q: '¿Cómo se paga?', a: 'Aceptamos Binance Pay (USDT), Pago Móvil, Transferencia bancaria a cuenta venezolana, y PayPal.' },
                { q: '¿Qué pasa si supero el límite de productos o usuarios?', a: 'Te avisamos antes de que llegues al límite. Puedes subir de plan o agregar add-ons como "Pack 5 Usuarios" sin necesidad de cambiar todo el plan.' },
                { q: '¿Hay descuento por pago anual?', a: 'Sí, ahorras 20% pagando anualmente. También tenemos planes semestrales con 20% off y la promo "Triple Play": pagas 2 meses y obtienes 3.' },
              ].map((item, i) => (
                <details key={i} className="group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05] transition-all cursor-pointer">
                  <summary className="flex items-center justify-between gap-3 list-none">
                    <h3 className="font-black text-white text-sm">{item.q}</h3>
                    <ChevronDown className="w-4 h-4 text-white/40 transition-transform group-open:rotate-180 shrink-0" />
                  </summary>
                  <p className="text-white/55 text-sm leading-relaxed mt-3">{item.a}</p>
                </details>
              ))}
            </div>
          </div>

          {/* ── CTA FINAL ─────────────────────────────────── */}
          <div className="relative rounded-3xl overflow-hidden border border-indigo-500/30 bg-gradient-to-br from-indigo-600/20 via-violet-600/15 to-fuchsia-600/10 p-10 sm:p-14 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-[10px] font-black uppercase tracking-[0.25em] mb-6">
                <Zap className="w-3 h-3 text-amber-400" />
                30 días gratis del Plan Pro
              </div>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
                Empieza ahora,<br />paga después
              </h2>
              <p className="text-white/60 text-base sm:text-lg max-w-xl mx-auto mb-8">
                Sin tarjeta de crédito. Sin compromiso. Cancela cuando quieras y conserva tu información.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/register')}
                  className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl font-black text-base shadow-2xl shadow-indigo-500/40 hover:opacity-90 transition-all flex items-center gap-2"
                >
                  Crear mi cuenta gratis <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href={`https://wa.me/${DUALIS_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl font-black text-base text-emerald-300 hover:bg-emerald-500/25 transition-all flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" /> Hablar por WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer mini */}
        <footer className="border-t border-white/[0.06] py-8 text-center">
          <p className="text-[11px] text-white/30 font-bold">
            © {new Date().getFullYear()} Dualis · Hecho en Venezuela 🇻🇪
          </p>
        </footer>
      </div>
    </>
  );
}
