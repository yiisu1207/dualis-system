import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Building2, Package, FileText, Layers, BookOpen,
  Landmark, Globe, Monitor, Users, Sparkles, BarChart3, History,
  TrendingUp, ShieldCheck, Receipt, HelpCircle, Sliders, BadgeDollarSign,
  ArrowRight, Check,
} from 'lucide-react';
import SEO from '../../components/SEO';

const MODULES = [
  {
    icon: ShoppingCart, label: 'POS Detal', color: 'text-indigo-400', bg: 'bg-indigo-500/10',
    desc: 'Punto de venta para ventas al contado. Escáner de código de barras, modo offline, ticket digital, múltiples métodos de pago (efectivo, transferencia, Pago Móvil, mixto). IVA 16% e IGTF 3% integrados.',
    keywords: ['ventas al contado', 'punto de venta Venezuela', 'POS offline', 'ticket digital', 'IVA 16%', 'IGTF 3%'],
  },
  {
    icon: Building2, label: 'POS Mayor', color: 'text-indigo-400', bg: 'bg-indigo-500/10',
    desc: 'Terminal de ventas al mayor con crédito a 15, 30 o 45 días. Numeración correlativa interna de comprobantes, múltiples tasas de cambio (BCV, Grupo, personalizada), descuentos y condiciones especiales por cliente. Campo opcional para vincular con tu factura fiscal externa.',
    keywords: ['venta al mayor', 'crédito 15 días', 'POS Venezuela', 'control administrativo'],
  },
  {
    icon: BadgeDollarSign, label: 'Precios Dinámicos', color: 'text-amber-400', bg: 'bg-amber-500/10',
    desc: 'Los precios se recalculan automáticamente al cambiar la tasa de cambio. Define costo + margen y el sistema calcula el precio en USD y bolívares en tiempo real.',
    keywords: ['precios en dólares Venezuela', 'precios automáticos tasa BCV', 'gestión de precios'],
  },
  {
    icon: FileText, label: 'CxC / Clientes', color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    desc: 'Cuentas por cobrar completo. Historial de cargos y abonos por cliente, balances en USD y bolívares, perfil de cliente con estado de cuenta, aging de cartera (0-30, 31-60, 61-90, 90+ días).',
    keywords: ['cuentas por cobrar Venezuela', 'cartera de clientes', 'estado de cuenta', 'cobros'],
  },
  {
    icon: Layers, label: 'CxP / Proveedores', color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    desc: 'Control de cuentas por pagar. Registro de facturas de proveedores, historial de pagos, balance pendiente por proveedor en USD y bolívares.',
    keywords: ['cuentas por pagar', 'control de proveedores', 'pagos Venezuela'],
  },
  {
    icon: BookOpen, label: 'Contabilidad', color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    desc: 'Libro diario, mayor y balance automático generado desde las operaciones. Estado de resultados (P&L) con ventas brutas, IVA, IGTF, gastos y utilidad.',
    keywords: ['contabilidad Venezuela', 'libro diario', 'balance general', 'estado de resultados'],
  },
  {
    icon: Landmark, label: 'Conciliación Bancaria', color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    desc: 'Importa tu estado de cuenta bancario en CSV y concilia automáticamente con los movimientos registrados en el sistema.',
    keywords: ['conciliación bancaria Venezuela', 'estado de cuenta bancario', 'control bancario'],
  },
  {
    icon: Globe, label: 'Portal de Clientes', color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    desc: 'Tus clientes acceden a su estado de cuenta por internet con un enlace personalizado. Pueden ver sus movimientos pendientes, su balance y registrar pagos administrativos.',
    keywords: ['portal clientes Venezuela', 'autogestión clientes', 'cobros en línea'],
  },
  {
    icon: Package, label: 'Inventario Pro', color: 'text-sky-400', bg: 'bg-sky-500/10',
    desc: 'Kardex completo, alertas de stock mínimo, control de márgenes y Smart Advisor con recomendaciones IA. Exporta en Excel o PDF. Soporte para productos por peso (kg, litros, etc.).',
    keywords: ['inventario Venezuela', 'kardex', 'control de stock', 'alertas stock mínimo'],
  },
  {
    icon: Monitor, label: 'Cajas y Arqueo', color: 'text-sky-400', bg: 'bg-sky-500/10',
    desc: 'Gestión de turnos de caja, apertura y cierre, arqueo de caja con diferencias, reporte Z. Múltiples cajas por sucursal.',
    keywords: ['arqueo de caja Venezuela', 'turno caja', 'reporte Z', 'cierres de caja'],
  },
  {
    icon: Users, label: 'RRHH y Nómina', color: 'text-sky-400', bg: 'bg-sky-500/10',
    desc: 'Registro de empleados, cálculo de nómina en bolívares y dólares, adelantos de sueldo, vales de caja chica, recibos de pago imprimibles con logo de la empresa.',
    keywords: ['nómina Venezuela', 'RRHH Venezuela', 'gestión empleados', 'adelanto sueldo'],
  },
  {
    icon: Sparkles, label: 'VisionLab IA', color: 'text-violet-400', bg: 'bg-violet-500/10',
    desc: 'Inteligencia artificial powered by Google Gemini que analiza tu negocio en tiempo real. Responde preguntas sobre ventas, inventario, clientes y finanzas en lenguaje natural.',
    keywords: ['IA para negocios Venezuela', 'inteligencia artificial ERP', 'Gemini AI negocio'],
  },
  {
    icon: BarChart3, label: 'Dashboard BI', color: 'text-violet-400', bg: 'bg-violet-500/10',
    desc: 'Panel de control con KPIs en tiempo real: ventas del día, producto estrella, alertas predictivas, gráficos de tendencias y estado de resultados (P&L) integrado.',
    keywords: ['dashboard Venezuela', 'KPIs negocio', 'business intelligence Venezuela'],
  },
  {
    icon: History, label: 'Historial de Tasas', color: 'text-amber-400', bg: 'bg-amber-500/10',
    desc: 'Muro colaborativo de tasas de cambio BCV con verificación en equipo. OCR para leer tasas desde imágenes, importación masiva CSV, historial completo paginado.',
    keywords: ['tasa BCV Venezuela', 'dólar BCV hoy', 'historial tipo de cambio Venezuela'],
  },
  {
    icon: TrendingUp, label: 'Tasas Custom', color: 'text-amber-400', bg: 'bg-amber-500/10',
    desc: 'Agrega hasta 3 tasas de cambio personalizadas (ej. Zoher, Grupo, Paralela) además del BCV. Los productos asignados a cada tasa actualizan su precio automáticamente.',
    keywords: ['tasa paralela Venezuela', 'tasa Zoher', 'tipo de cambio personalizado'],
  },
  {
    icon: ShieldCheck, label: 'Audit Logs', color: 'text-rose-400', bg: 'bg-rose-500/10',
    desc: 'Auditoría inmutable de todas las acciones del sistema. Quién hizo qué y cuándo. Exporta en PDF, CSV o Excel para control interno o requerimientos legales.',
    keywords: ['auditoría interna Venezuela', 'control de acceso', 'trazabilidad operaciones'],
  },
  {
    icon: Receipt, label: 'Reporte de Ventas', color: 'text-rose-400', bg: 'bg-rose-500/10',
    desc: 'Reporte interno administrativo de todas las ventas registradas. Filtros por fecha, método de pago, vendedor y estado. Totales en USD y bolívares. Exportar CSV para tus registros internos o para tu contador.',
    keywords: ['reporte de ventas Venezuela', 'reporte administrativo', 'control de ventas'],
  },
  {
    icon: Sliders, label: 'Configuración Avanzada', color: 'text-slate-400', bg: 'bg-slate-500/10',
    desc: 'Control total: IVA referencial, IGTF referencial, roles y permisos de usuarios, invitaciones por email, tasas personalizadas, prefijo de comprobantes internos, configuración de nómina y mucho más.',
    keywords: ['configuración ERP Venezuela', 'roles y permisos', 'multi-usuario Venezuela'],
  },
];

const funcsSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Funciones de Dualis ERP',
  description: 'Módulos y funciones del sistema ERP para empresas venezolanas: POS, inventario, contabilidad, RRHH, CxC, CxP y más.',
  url: 'https://dualis.online/funciones',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'Dualis ERP',
    featureList: MODULES.map(m => m.label),
  },
};

export default function FuncionesPage() {
  const navigate = useNavigate();

  return (
    <>
      <SEO
        title="Funciones y Módulos — Dualis ERP | 19+ módulos para Venezuela"
        description="Conoce todos los módulos de Dualis ERP: POS Detal y Mayor, inventario, CxC, CxP, RRHH, contabilidad, tasas BCV, VisionLab IA y más. Sistema diseñado para empresas venezolanas."
        url="https://dualis.online/funciones"
        jsonLd={funcsSchema}
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
          <div className="text-center mb-16">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3">FUNCIONES</span>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
              Todo lo que tu negocio<br />venezolano necesita
            </h1>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              19+ módulos integrados en un solo sistema. Desde el POS hasta la nómina, pasando por contabilidad, tasas BCV y VisionLab IA.
            </p>
          </div>

          {/* Módulos */}
          <div className="grid md:grid-cols-2 gap-6 mb-20">
            {MODULES.map(mod => {
              const Icon = mod.icon;
              return (
                <article
                  key={mod.label}
                  className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${mod.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${mod.color}`} />
                    </div>
                    <div>
                      <h2 className="font-black text-white text-lg mb-2">{mod.label}</h2>
                      <p className="text-white/50 text-sm leading-relaxed mb-3">{mod.desc}</p>
                      <div className="flex flex-wrap gap-1">
                        {mod.keywords.map(k => (
                          <span key={k} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/[0.05] text-white/30 border border-white/[0.06]">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Ventajas Venezuela */}
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] p-8 mb-16">
            <h2 className="text-2xl font-black text-white mb-6 text-center">
              Diseñado 100% para Venezuela
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                'IVA 16% e IGTF 3% calculados automáticamente',
                'Tasa BCV oficial en tiempo real',
                'Tasas personalizadas (Zoher, Grupo, Paralela)',
                'Precios en USD y bolívares simultáneamente',
                'Pago Móvil, Zelle, Transferencia, Binance Pay',
                'Modo offline en POS Detal',
                'Soporte completo en español vía WhatsApp',
                'Alojado en Google Cloud — sin servidores propios',
              ].map(v => (
                <div key={v} className="flex items-center gap-3 text-sm text-white/70">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  {v}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-2xl font-black text-white mb-3">¿Listo para ordenar tu negocio?</h2>
            <p className="text-white/50 mb-8">30 días gratis. Sin tarjeta. Sin trampa.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate('/register')}
                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl font-black text-lg shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center gap-2"
              >
                Crear cuenta gratis <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate('/precios')}
                className="px-8 py-4 rounded-2xl font-black text-lg border border-white/10 text-white/70 hover:bg-white/[0.04] transition-all"
              >
                Ver precios →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
