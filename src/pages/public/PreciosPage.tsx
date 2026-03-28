import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, ArrowRight, Zap } from 'lucide-react';
import SEO from '../../components/SEO';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 19,
    annual: 15,
    desc: 'Ideal para negocios pequeños que arrancan.',
    features: [
      '2 usuarios', '100 productos', '1 terminal POS', 'POS Detal',
      'Inventario básico', 'Libro de ventas', 'Soporte por email',
    ],
    missing: ['POS Mayor', 'CxC / CxP', 'RRHH', 'VisionLab IA', 'Tasas custom'],
    color: 'border-white/10',
    badge: null,
  },
  {
    id: 'negocio',
    name: 'Negocio',
    monthly: 39,
    annual: 31,
    desc: 'El más popular. Todo lo que necesita tu empresa.',
    features: [
      '5 usuarios', '500 productos', '2 terminales POS', 'POS Detal + Mayor',
      'Inventario Pro', 'CxC / CxP', 'RRHH & Nómina', 'Contabilidad',
      'Tasas BCV + Custom', 'Portal de Clientes', 'Dashboard BI',
      'Soporte WhatsApp',
    ],
    missing: ['VisionLab IA', 'Multi-sucursal ilimitada'],
    color: 'border-indigo-500/50',
    badge: 'Más popular',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: 79,
    annual: 63,
    desc: 'Escala sin límites. Todo incluido.',
    features: [
      'Usuarios ilimitados', 'Productos ilimitados', 'POS ilimitados',
      'Todo lo del plan Negocio', 'VisionLab IA', 'Multi-sucursal',
      'Conciliación bancaria', 'Audit logs avanzados', 'Soporte prioritario',
    ],
    missing: [],
    color: 'border-violet-500/50',
    badge: 'Todo incluido',
  },
];

const pricingSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Dualis ERP',
  description: 'Sistema ERP Cloud para empresas venezolanas.',
  url: 'https://dualis.online/precios',
  offers: PLANS.map(p => ({
    '@type': 'Offer',
    name: p.name,
    price: p.monthly,
    priceCurrency: 'USD',
    description: p.desc,
    eligibleDuration: 'P1M',
    url: 'https://dualis.online/register',
  })),
};

export default function PreciosPage() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <SEO
        title="Precios — Dualis ERP | Desde $19/mes"
        description="Planes de Dualis ERP para empresas venezolanas. Starter desde $19/mes, Negocio $39/mes, Enterprise $79/mes. 30 días gratis, sin tarjeta. POS, inventario, finanzas y más."
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
              30 días gratis en cualquier plan. Sin tarjeta de crédito. Cancela cuando quieras.
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
                Anual <span className="text-emerald-400 text-xs font-black">-20%</span>
              </span>
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {PLANS.map(plan => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-8 bg-white/[0.03] ${plan.color} ${plan.badge ? 'ring-1 ring-indigo-500/30' : ''}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full text-[10px] font-black uppercase tracking-widest text-white">
                      {plan.badge}
                    </span>
                  </div>
                )}
                <h2 className="text-xl font-black text-white mb-1">{plan.name}</h2>
                <p className="text-white/40 text-sm mb-6">{plan.desc}</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-white">${annual ? plan.annual : plan.monthly}</span>
                  <span className="text-white/40 text-sm mb-1">/mes</span>
                </div>
                <button
                  onClick={() => navigate('/register')}
                  className="w-full py-3 rounded-xl font-black text-sm mb-8 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2"
                >
                  Empezar 30 días gratis <ArrowRight className="w-4 h-4" />
                </button>
                <ul className="space-y-3">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                  {plan.missing.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/25">
                      <Minus className="w-4 h-4 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* FAQs precios */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-black text-white text-center mb-8">Preguntas frecuentes sobre precios</h2>
            {[
              { q: '¿Necesito tarjeta para la prueba gratuita?', a: 'No. Los 30 días de prueba son completamente gratuitos y no requieren tarjeta de crédito.' },
              { q: '¿Qué pasa cuando termina el período de prueba?', a: 'Puedes elegir un plan de pago. Tus datos se conservan 30 días adicionales antes de ser eliminados.' },
              { q: '¿Puedo cambiar de plan?', a: 'Sí, puedes subir o bajar de plan en cualquier momento desde Configuración > Suscripción.' },
              { q: '¿Cómo se paga?', a: 'Aceptamos Binance Pay, Pago Móvil, Transferencia bancaria y PayPal.' },
              { q: '¿Hay descuento para ONG o educación?', a: 'Contáctanos por WhatsApp para consultar planes especiales.' },
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
