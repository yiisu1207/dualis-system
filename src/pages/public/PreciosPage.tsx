import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, ArrowRight, Zap, ChevronDown, Crown, Building2 } from 'lucide-react';
import SEO from '../../components/SEO';
import {
  PLANS, COMPARE_ROWS, ADDON_PRICES,
  VERTICAL_PRICES, ANNUAL_DISCOUNT,
  buildQuoteWhatsApp,
} from '../../utils/planConfig';

const VERTICAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'general',     label: 'General / Otro' },
  { value: 'peluqueria',  label: 'Peluquería' },
  { value: 'barberia',    label: 'Barbería' },
  { value: 'boutique',    label: 'Boutique' },
  { value: 'bodega',      label: 'Bodega' },
  { value: 'floristeria', label: 'Floristería' },
  { value: 'licoreria',   label: 'Licorería' },
  { value: 'ferreteria',  label: 'Ferretería' },
  { value: 'panaderia',   label: 'Panadería' },
  { value: 'reposteria',  label: 'Repostería' },
  { value: 'tecnologia',  label: 'Tecnología' },
  { value: 'servicios',   label: 'Servicios' },
  { value: 'veterinaria', label: 'Veterinaria' },
  { value: 'farmacia',    label: 'Farmacia' },
  { value: 'restaurant',  label: 'Restaurant' },
];

const pricingSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Dualis ERP',
  description: 'Sistema ERP Cloud para empresas venezolanas.',
  url: 'https://dualis.online/precios',
  offers: PLANS.filter(p => typeof p.price === 'number' && p.price !== null && p.price > 0).map(p => ({
    '@type': 'Offer',
    name: p.name,
    price: p.price,
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

  const toggleCat = (cat: string) => setOpenCats(prev => {
    const n = new Set(prev);
    n.has(cat) ? n.delete(cat) : n.add(cat);
    return n;
  });

  const verticalPrice = VERTICAL_PRICES[vertical] ?? 15;

  const computePrice = (price: number | null) => {
    if (price === null) return null;
    if (price === 0)    return 0;
    if (price === -1)   return annual ? +(verticalPrice * (1 - ANNUAL_DISCOUNT)).toFixed(0) : verticalPrice;
    return annual ? +(price * (1 - ANNUAL_DISCOUNT)).toFixed(0) : price;
  };

  return (
    <>
      <SEO
        title="Precios — Dualis ERP | Desde $12/mes"
        description="Planes de Dualis ERP para empresas venezolanas. Plan vertical desde $12/mes según tu rubro, Negocio $35, Pro $65. 30 días gratis sin tarjeta. POS, inventario, CxC, RRHH y más."
        url="https://dualis.online/precios"
        jsonLd={pricingSchema}
      />
      <div className="min-h-screen bg-[#020710] text-white">
        {/* Nav */}
        <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#020710]/90 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-white font-black text-lg tracking-tight">
              Dualis<span className="text-indigo-400">.</span>
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="text-sm text-white/50 hover:text-white transition-colors">← Volver</button>
              <button
                onClick={() => navigate('/register')}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl text-sm font-black"
              >
                Empezar gratis
              </button>
            </div>
          </div>
        </nav>

        <div className="pt-24 pb-20 max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">PRECIOS</span>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
              Simple. Transparente.<br />Sin sorpresas.
            </h1>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              30 días gratis del Plan Pro. Sin tarjeta de crédito. Cancela cuando quieras.
            </p>

            {/* Toggle anual/mensual */}
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-bold ${!annual ? 'text-white' : 'text-white/40'}`}>Mensual</span>
              <button
                onClick={() => setAnnual(v => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${annual ? 'bg-indigo-600' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${annual ? 'left-7' : 'left-1'}`} />
              </button>
              <span className={`text-sm font-bold ${annual ? 'text-white' : 'text-white/40'}`}>
                Anual <span className="text-emerald-400 text-xs font-black">-{Math.round(ANNUAL_DISCOUNT * 100)}%</span>
              </span>
            </div>

            {/* Vertical selector */}
            <div className="mt-6 inline-flex flex-col items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">¿Qué tipo de negocio tienes?</span>
              <select
                value={vertical}
                onChange={e => setVertical(e.target.value)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-bold outline-none focus:border-indigo-500/40"
              >
                {VERTICAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="bg-[#020710]">{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards de planes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-16">
            {PLANS.map(plan => {
              const price = computePrice(plan.price);
              const isPopular = plan.popular;
              const isVertical = plan.isVertical;
              const isEnterprise = plan.isEnterprise;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 ${
                    isPopular
                      ? 'bg-gradient-to-b from-indigo-600/[0.12] to-violet-600/[0.06] border-indigo-500/30 ring-1 ring-indigo-500/30'
                      : 'bg-white/[0.03] border-white/10'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                        Más popular
                      </span>
                    </div>
                  )}
                  {isVertical && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 bg-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                        Para tu rubro
                      </span>
                    </div>
                  )}

                  <h2 className="text-lg font-black text-white">{plan.name}</h2>
                  <p className="text-white/40 text-[11px] mb-4 leading-relaxed">{plan.tagline}</p>

                  <div className="mb-5">
                    {isEnterprise ? (
                      <p className="text-3xl font-black text-white">Cotización</p>
                    ) : price === 0 ? (
                      <p className="text-3xl font-black text-white">Gratis</p>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white">${price}</span>
                        <span className="text-white/40 text-xs">/mes</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() =>
                      isEnterprise
                        ? window.open(buildQuoteWhatsApp(), '_blank')
                        : navigate('/register')
                    }
                    className={`w-full py-2.5 rounded-xl font-black text-xs mb-5 flex items-center justify-center gap-1.5 transition-all ${
                      isPopular
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:opacity-90'
                        : 'bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {isEnterprise ? 'Cotizar' : plan.id === 'gratis' ? 'Empezar gratis' : 'Empezar trial'}
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  <ul className="space-y-2 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-[11px] text-white/60">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Add-ons */}
          <div className="mb-16 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-5">Add-ons — agrega solo lo que necesitas</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'Portal de Clientes',     price: ADDON_PRICES.portal       },
                { label: 'Tienda Pública',         price: ADDON_PRICES.tienda       },
                { label: 'Dualis Pay',             price: ADDON_PRICES.dualisPay    },
                { label: 'WA/Email Automático',    price: ADDON_PRICES.whatsappAuto },
                { label: 'Auditoría IA',           price: ADDON_PRICES.auditoria_ia },
                { label: 'Conciliación bancaria',  price: ADDON_PRICES.conciliacion },
                { label: 'Sucursal adicional',     price: ADDON_PRICES.sucursalExtra },
                { label: 'Pack 5 usuarios',        price: ADDON_PRICES.usuariosExtra },
              ].map(({ label, price }) => (
                <div key={label} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <span className="text-[11px] font-bold text-white/70 truncate">{label}</span>
                  <span className="text-[11px] font-black text-indigo-400 shrink-0">+${price}/mes</span>
                </div>
              ))}
            </div>
          </div>

          {/* Comparativa detallada */}
          <div className="mb-16">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Comparativa detallada</p>
            <div className="rounded-2xl overflow-hidden border border-white/[0.07]">
              <div className="grid grid-cols-7 bg-white/[0.03] border-b border-white/[0.07]">
                <div className="col-span-2 p-3" />
                {['Gratis', 'Básico', 'Negocio', 'Pro', 'Ent.'].map(n => (
                  <div key={n} className="p-3 text-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${n === 'Negocio' ? 'text-indigo-400' : 'text-white/30'}`}>{n}</span>
                  </div>
                ))}
              </div>

              {cats.map(cat => (
                <div key={cat}>
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full grid grid-cols-7 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-all border-b border-white/[0.04]"
                  >
                    <div className="col-span-2 flex items-center gap-2">
                      <ChevronDown size={11} className={`text-white/20 transition-transform ${openCats.has(cat) ? 'rotate-0' : '-rotate-90'}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{cat}</span>
                    </div>
                  </button>
                  {openCats.has(cat) && COMPARE_ROWS.filter(r => r.cat === cat).map((row, ri) => (
                    <div key={ri} className="grid grid-cols-7 border-b border-white/[0.03] hover:bg-white/[0.01] transition-all">
                      <div className="col-span-2 px-4 py-2.5">
                        <span className="text-[11px] text-white/50">{row.label}</span>
                      </div>
                      {([row.g, row.b, row.n, row.p, row.e] as (boolean | string)[]).map((val, vi) => (
                        <div key={vi} className="flex items-center justify-center py-2.5">
                          {val === true ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : val === false ? (
                            <Minus size={11} className="text-white/15" />
                          ) : (
                            <span className="text-[10px] font-bold text-white/40 text-center px-1">{val}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* FAQs precios */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-black text-white text-center mb-8">Preguntas frecuentes</h2>
            {[
              { q: '¿Necesito tarjeta para la prueba gratuita?', a: 'No. Los 30 días de prueba son completamente gratuitos y no requieren tarjeta de crédito.' },
              { q: '¿Qué pasa cuando termina el período de prueba?', a: 'Puedes elegir un plan de pago. Tus datos se conservan 30 días adicionales antes de ser eliminados.' },
              { q: '¿Puedo cambiar de plan?', a: 'Sí, puedes subir o bajar de plan en cualquier momento desde Configuración → Suscripción.' },
              { q: '¿Qué es el Plan Vertical?', a: 'Es un plan diseñado para tu tipo específico de negocio (barbería, panadería, farmacia, etc.). Incluye los módulos que más vas a usar a un precio especial desde $12/mes.' },
              { q: '¿Cómo se paga?', a: 'Aceptamos Binance Pay, Pago Móvil, Transferencia bancaria y PayPal.' },
            ].map((item, i) => (
              <div key={i} className="border-b border-white/[0.07] py-5">
                <h3 className="font-black text-white mb-2">{item.q}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-2 text-indigo-300 text-sm font-bold mb-6">
              <Zap className="w-4 h-4" />
              Sin tarjeta · Sin compromiso · Cancela cuando quieras
            </div>
            <br />
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl font-black text-lg shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all"
            >
              Crear cuenta gratis →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
