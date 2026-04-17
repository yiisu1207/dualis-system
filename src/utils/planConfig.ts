// ─── Dualis System — Plan & Pricing Configuration ──────────────────────────
// Single source of truth for all plans, pricing, features, and module access.
// Used by: useSubscription, LandingPage, SubscriptionWall, BillingPage, SuperAdminPanel.

export type PlanId = 'trial' | 'gratis' | 'basico' | 'vertical' | 'negocio' | 'pro' | 'enterprise' | 'custom'
  // Legacy aliases — kept for backward compat with existing Firestore docs
  | 'starter';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

// ─── Pricing (USD/month) ─────────────────────────────────────────────────────

export const PLAN_PRICES: Record<Exclude<PlanId, 'trial' | 'gratis' | 'enterprise' | 'custom'>, number> = {
  basico:    15,
  vertical:  15,
  negocio:   35,
  pro:       65,
  // Legacy
  starter:   15,
};

export const ANNUAL_DISCOUNT = 0.20;

// ─── Subscription Periods ────────────────────────────────────────────────────

export type SubscriptionPeriod = 'triplePlay' | 'mensual' | 'semestral' | 'anual';

export const PERIOD_CONFIG: Record<SubscriptionPeriod, {
  months: number;
  payMonths: number;
  label: string;
  badge: string | null;
  discount: number | null;
}> = {
  triplePlay: { months: 3,  payMonths: 2,  label: 'Triple Play', badge: 'PROMO',    discount: null },
  mensual:    { months: 1,  payMonths: 1,  label: 'Mensual',     badge: null,       discount: null },
  semestral:  { months: 6,  payMonths: 6,  label: 'Semestral',   badge: '20% OFF',  discount: 0.20 },
  anual:      { months: 12, payMonths: 12, label: 'Anual',       badge: '30% OFF',  discount: 0.30 },
};

export function computePeriodPrice(monthlyPrice: number, period: SubscriptionPeriod) {
  const cfg = PERIOD_CONFIG[period];
  if (period === 'triplePlay') {
    const total = monthlyPrice * 2;
    return { total, perMonth: +(total / 3).toFixed(2), savings: monthlyPrice };
  }
  const discount = cfg.discount || 0;
  const total    = +(monthlyPrice * cfg.months * (1 - discount)).toFixed(2);
  return {
    total,
    perMonth: +(total / cfg.months).toFixed(2),
    savings:  +(monthlyPrice * cfg.months - total).toFixed(2),
  };
}

// ─── Add-on prices (USD/month) ───────────────────────────────────────────────

export const ADDON_PRICES = {
  // Legacy
  extraUsers:       3,
  extraProducts:    5,
  extraSucursales:  9,
  visionLab:        18,
  conciliacion:     12,
  rrhhPro:          15,
  preciosDinamicos: 14,
  // New add-ons
  portal:           10,   // Portal de clientes
  tienda:           15,   // Tienda pública
  dualisPay:         8,   // Link de cobro universal
  whatsappAuto:     12,   // WhatsApp/Email cobranza automática
  auditoria_ia:     18,   // Auditoría IA (Anthropic)
  sucursalExtra:    10,   // Sucursal adicional
  usuariosExtra:     8,   // Paquete de 5 usuarios
  recurrentes:      10,   // Servicios recurrentes / suscripciones clientes
} as const;

// ─── Plan limits ─────────────────────────────────────────────────────────────

export interface PlanLimits {
  users:      number;    // -1 = unlimited
  products:   number;    // -1 = unlimited
  sucursales: number;    // -1 = unlimited
  modules:    string[];  // '*' = all modules
}

// Module IDs used throughout the system
export const ALL_MODULES = [
  'pos_detal', 'pos_mayor', 'inventario', 'tasas', 'clientes', 'proveedores',
  'cajas', 'rrhh', 'reportes', 'sucursales', 'contabilidad', 'comparar',
  'libro_ventas', 'cxc', 'cxp', 'portal_clientes', 'precios_dinamicos',
  'vision', 'conciliacion', 'catalogo', 'tienda', 'dualis_pay', 'whatsapp_auto',
  'embajador', 'api_publica', 'white_label', 'franquicias',
] as const;

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial:      { users: 25, products: -1,   sucursales: 3,  modules: ['*'] },
  gratis:     { users: 1,  products: 50,   sucursales: 0,  modules: ['pos_detal', 'inventario', 'libro_ventas'] },
  basico:     { users: 3,  products: 500,  sucursales: 0,  modules: ['pos_detal', 'inventario', 'libro_ventas', 'reportes', 'rrhh', 'cajas', 'tesoreria'] },
  vertical:   { users: 5,  products: 500,  sucursales: 0,  modules: ['pos_detal', 'inventario', 'libro_ventas', 'reportes', 'rrhh', 'cajas', 'tesoreria'] },
  negocio:    { users: 10, products: 2000, sucursales: 1,  modules: ['pos_detal', 'pos_mayor', 'inventario', 'tasas', 'clientes', 'proveedores', 'cajas', 'rrhh', 'reportes', 'sucursales', 'contabilidad', 'comparar', 'libro_ventas', 'cxc', 'cxp', 'precios_dinamicos', 'tesoreria'] },
  pro:        { users: 25, products: -1,   sucursales: 3,  modules: ['pos_detal', 'pos_mayor', 'inventario', 'tasas', 'clientes', 'proveedores', 'cajas', 'rrhh', 'reportes', 'sucursales', 'contabilidad', 'comparar', 'libro_ventas', 'cxc', 'cxp', 'precios_dinamicos', 'portal_clientes', 'embajador', 'vision', 'catalogo', 'conciliacion', 'tesoreria'] },
  enterprise: { users: -1, products: -1,   sucursales: -1, modules: ['*'] },
  custom:     { users: -1, products: -1,   sucursales: -1, modules: ['*'] },
  // Legacy alias
  starter:    { users: 3,  products: 500,  sucursales: 0,  modules: ['pos_detal', 'inventario', 'libro_ventas', 'reportes', 'rrhh', 'cajas', 'clientes', 'contabilidad', 'portal_clientes'] },
};

// ─── Feature descriptions (for upgrade prompts) ──────────────────────────────

export const FEATURE_LABELS: Record<string, { name: string; minPlan: string; addonKey?: string; addonPrice?: number }> = {
  pos_mayor:        { name: 'POS Mayor (crédito)',        minPlan: 'Negocio' },
  cxc:              { name: 'Deudores / CxC',             minPlan: 'Negocio' },
  cxp:              { name: 'Gastos / CxP',               minPlan: 'Negocio' },
  contabilidad:     { name: 'Contabilidad',               minPlan: 'Negocio' },
  sucursales:       { name: 'Sucursales',                  minPlan: 'Negocio' },
  rrhh:             { name: 'RRHH / Nómina',              minPlan: 'Básico'  },
  portal_clientes:  { name: 'Portal de Clientes',          minPlan: 'Pro',     addonKey: 'portal',       addonPrice: ADDON_PRICES.portal       },
  vision:           { name: 'Auditoría IA',               minPlan: 'Pro',     addonKey: 'auditoria_ia', addonPrice: ADDON_PRICES.auditoria_ia },
  conciliacion:     { name: 'Conciliación Bancaria',      minPlan: 'Pro',     addonKey: 'conciliacion', addonPrice: ADDON_PRICES.conciliacion  },
  catalogo:         { name: 'Catálogo Digital',           minPlan: 'Pro'      },
  tienda:           { name: 'Tienda Pública',             minPlan: 'Add-on',  addonKey: 'tienda',       addonPrice: ADDON_PRICES.tienda       },
  dualis_pay:       { name: 'Dualis Pay',                 minPlan: 'Add-on',  addonKey: 'dualisPay',    addonPrice: ADDON_PRICES.dualisPay    },
  whatsapp_auto:    { name: 'WhatsApp/Email Automático',  minPlan: 'Add-on',  addonKey: 'whatsappAuto', addonPrice: ADDON_PRICES.whatsappAuto },
  precios_dinamicos:{ name: 'Precios Dinámicos',          minPlan: 'Negocio' },
  embajador:        { name: 'Programa Embajador',         minPlan: 'Pro'      },
  api_publica:      { name: 'API Pública',                minPlan: 'Enterprise' },
  white_label:      { name: 'Portal white-label (logo/colores propios)', minPlan: 'Enterprise' },
};

// ─── Feature lists per plan (for UI display) ─────────────────────────────────

export interface PlanInfo {
  id: Exclude<PlanId, 'trial' | 'custom' | 'starter'>;
  name: string;
  tagline: string;
  price: number | null;  // null = cotización
  features: string[];
  popular?: boolean;
  isEnterprise?: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    id: 'gratis',
    name: 'Gratis',
    tagline: 'Para empezar',
    price: 0,
    features: [
      '1 usuario',
      'Hasta 50 productos',
      'POS Detal básico',
      'Inventario',
      'Reporte de Ventas',
    ],
  },
  {
    id: 'basico',
    name: 'Básico',
    tagline: 'Para comenzar en serio',
    price: 15,
    features: [
      '3 usuarios',
      '500 productos',
      'Todo del plan Gratis',
      'POS Detal completo',
      'Reportes y estadísticas',
      'RRHH básico',
      'Configuración completa',
      'IVA + IGTF automático',
      'Ticket digital + WhatsApp',
    ],
  },
  {
    id: 'negocio',
    name: 'Negocio',
    tagline: 'Para crecer',
    price: 35,
    popular: true,
    features: [
      '10 usuarios',
      '2,000 productos',
      'Todo del plan Básico',
      'POS Mayor con crédito',
      'Períodos de pago configurables',
      'Descuentos por pronto pago',
      'CxC + CxP completo',
      'Tasas cambiarias multi-cuenta',
      'Precios dinámicos por tasa',
      'Contabilidad completa',
      '1 sucursal',
      'Soporte WhatsApp',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para escalar',
    price: 65,
    features: [
      '25 usuarios',
      'Productos ilimitados',
      'Todo del plan Negocio',
      'Portal de clientes',
      'Catálogo digital',
      'Conciliación bancaria',
      'Auditoría IA',
      'Programa Embajador',
      '3 sucursales',
      'Soporte prioritario',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Operación completa',
    price: null,
    isEnterprise: true,
    features: [
      'Usuarios ilimitados',
      'Productos ilimitados',
      'Todo del plan Pro',
      'Sucursales ilimitadas',
      'API pública + webhooks',
      'Portal white-label (logo y colores propios)',
      'Gestión de franquicias',
      'Soporte dedicado 24/7',
      'SLA personalizado',
      'Onboarding asistido',
    ],
  },
];

// ─── Comparison table rows ────────────────────────────────────────────────────

export interface CompareRow {
  cat: string;
  label: string;
  g: boolean | string;   // gratis
  b: boolean | string;   // basico
  n: boolean | string;   // negocio
  p: boolean | string;   // pro
  e: boolean | string;   // enterprise
  // Legacy aliases (kept for backward compat)
  s?: boolean | string;
}

export const COMPARE_ROWS: CompareRow[] = [
  // Ventas
  { cat: 'Ventas',      label: 'POS Detal (contado)',             g: 'básico', b: true,        n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'POS Mayor (crédito)',             g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Períodos de pago configurables',  g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Descuento por pronto pago',       g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Tasas multi-cuenta (BCV+custom)', g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'IGTF e IVA automático',           g: true,     b: true,        n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Ticket 80mm / WhatsApp',          g: true,     b: true,        n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Reporte de Ventas',                 g: true,     b: true,        n: true,       p: true,       e: true },
  { cat: 'Ventas',      label: 'Catálogo digital compartible',    g: false,    b: false,       n: false,      p: true,       e: true },
  // Finanzas
  { cat: 'Finanzas',    label: 'CxC — Cuentas por cobrar',        g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Finanzas',    label: 'CxP — Proveedores',               g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Finanzas',    label: 'Límite de crédito por cliente',   g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Finanzas',    label: 'Contabilidad (P&G + Balance)',     g: false,    b: false,       n: true,       p: true,       e: true },
  { cat: 'Finanzas',    label: 'Conciliación Bancaria',            g: false,    b: false,       n: false,      p: true,       e: true },
  { cat: 'Finanzas',    label: 'Portal de clientes',               g: false,    b: false,       n: `+$${ADDON_PRICES.portal}/mes`, p: true, e: true },
  // Inventario
  { cat: 'Inventario',  label: 'Inventario + Kardex',             g: '50 prod', b: '500',      n: '2,000',    p: 'ilimitado', e: 'ilimitado' },
  { cat: 'Inventario',  label: 'Precios dinámicos por tasa',       g: false,    b: false,       n: true,       p: true,       e: true },
  // Equipo
  { cat: 'Equipo',      label: 'Usuarios',                        g: '1',      b: '3',         n: '10',       p: '25',       e: 'Ilimitados' },
  { cat: 'Equipo',      label: 'Sucursales',                      g: '0',      b: '0',         n: '1',        p: '3',        e: 'Ilimitadas' },
  { cat: 'Equipo',      label: 'RRHH y Nómina',                   g: false,    b: 'básico',    n: true,       p: true,       e: true },
  { cat: 'Equipo',      label: 'Roles y permisos',                g: true,     b: true,        n: true,       p: true,       e: true },
  // IA & Reportes
  { cat: 'IA & Reportes', label: 'Auditoría IA (Anthropic)',     g: false,    b: false,       n: `+$${ADDON_PRICES.auditoria_ia}/mes`, p: true, e: true },
  { cat: 'IA & Reportes', label: 'Reportes KPI + Estadísticas',  g: false,    b: 'básico',    n: true,       p: true,       e: true },
  { cat: 'IA & Reportes', label: 'Predicción de flujo de caja',  g: false,    b: false,       n: false,      p: true,       e: true },
  // Crecimiento
  { cat: 'Crecimiento', label: 'Programa Embajador',             g: true,     b: true,        n: true,       p: true,       e: true },
  { cat: 'Crecimiento', label: 'Tienda pública',                  g: false,    b: false,       n: `+$${ADDON_PRICES.tienda}/mes`, p: `+$${ADDON_PRICES.tienda}/mes`, e: true },
  { cat: 'Crecimiento', label: 'API pública + webhooks',          g: false,    b: false,       n: false,      p: false,      e: true },
  { cat: 'Crecimiento', label: 'Portal white-label',              g: false,    b: false,       n: false,      p: false,      e: true },
  // Soporte
  { cat: 'Soporte',     label: 'Canal de soporte',               g: 'Email',  b: 'Email',     n: 'WhatsApp', p: 'Prioritario', e: 'Dedicado 24/7' },
  { cat: 'Soporte',     label: 'Trial 30 días Plan Pro',          g: true,     b: true,        n: true,       p: true,       e: true },
];

// ─── Payment info (manual verification) ──────────────────────────────────────

export const PAYMENT_INFO = {
  binance: {
    label: 'Binance Pay',
    id: '1110745526',
    note: 'Envía USDT (BEP20 o Binance Pay directo)',
  },
  pago_movil: {
    label: 'Pago Móvil',
    banco: 'Bancamiga (0172)',
    cedula: 'V-32477241',
    telefono: '04125343141',
    note: 'Concepto: Dualis + nombre de tu empresa',
  },
  transferencia: {
    label: 'Transferencia',
    banco: 'Bancamiga (0172)',
    nombre: 'Jesús Miguel Alexander Salazar Álvarez',
    cedula: 'V-32477241',
    cuenta: '01720702427025760104',
    tipo: 'Cuenta Corriente Amiga',
  },
  paypal: {
    label: 'PayPal',
    email: 'svillarroel154@gmail.com',
    note: 'Enviar como "Amigos y familiares"',
  },
} as const;

export type PayMethod = keyof typeof PAYMENT_INFO;

// ─── WhatsApp contact for upgrades/quotes ────────────────────────────────────

export const DUALIS_WHATSAPP = '584125343141';
export const DUALIS_EMAIL    = 'hola@dualis.app';

export function buildUpgradeWhatsApp(planName: string, businessName?: string): string {
  const msg = encodeURIComponent(
    `Hola, quiero contratar el Plan ${planName} para ${businessName || 'mi negocio'} en Dualis.`
  );
  return `https://wa.me/${DUALIS_WHATSAPP}?text=${msg}`;
}

export function buildQuoteWhatsApp(businessName?: string): string {
  const msg = encodeURIComponent(
    `Hola, quiero cotizar Dualis Enterprise para ${businessName || 'mi empresa'}.`
  );
  return `https://wa.me/${DUALIS_WHATSAPP}?text=${msg}`;
}

