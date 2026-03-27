// ─── Dualis System — Plan & Pricing Configuration ──────────────────────────
// Single source of truth for all plans, pricing, features, and module access.
// Used by: useSubscription, LandingPage, SubscriptionWall, BillingPage, SuperAdminPanel.

export type PlanId = 'trial' | 'starter' | 'negocio' | 'enterprise' | 'custom';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const PLAN_PRICES: Record<Exclude<PlanId, 'trial' | 'custom'>, number> = {
  starter:    29,
  negocio:    59,
  enterprise: 99,
};

export const ANNUAL_DISCOUNT = 0.20; // 20% off (legacy)

// ─── Subscription Periods ────────────────────────────────────────────────────

export type SubscriptionPeriod = 'triplePlay' | 'mensual' | 'semestral' | 'anual';

export const PERIOD_CONFIG: Record<SubscriptionPeriod, {
  months: number;
  payMonths: number;
  label: string;
  badge: string | null;
  discount: number | null;
}> = {
  triplePlay: { months: 3, payMonths: 2, label: 'Triple Play', badge: 'PROMO', discount: null },
  mensual:    { months: 1, payMonths: 1, label: 'Mensual', badge: null, discount: null },
  semestral:  { months: 6, payMonths: 6, label: 'Semestral', badge: '20% OFF', discount: 0.20 },
  anual:      { months: 12, payMonths: 12, label: 'Anual', badge: '30% OFF', discount: 0.30 },
};

export function computePeriodPrice(monthlyPrice: number, period: SubscriptionPeriod) {
  const cfg = PERIOD_CONFIG[period];
  if (period === 'triplePlay') {
    const total = monthlyPrice * 2;
    return { total, perMonth: +(total / 3).toFixed(2), savings: monthlyPrice };
  }
  const discount = cfg.discount || 0;
  const total = +(monthlyPrice * cfg.months * (1 - discount)).toFixed(2);
  return {
    total,
    perMonth: +(total / cfg.months).toFixed(2),
    savings: +(monthlyPrice * cfg.months - total).toFixed(2),
  };
}

// ─── Add-on prices (USD/month) ───────────────────────────────────────────────

export const ADDON_PRICES = {
  extraUsers:      3,   // per user
  extraProducts:   5,   // per 1,000 products
  extraSucursales: 9,   // per branch
  visionLab:       19,  // VisionLab IA
  conciliacion:    12,  // Bank reconciliation
  rrhhPro:         15,  // RRHH Pro
  preciosDinamicos: 14, // Dynamic pricing / custom rates
} as const;

// ─── Plan limits ─────────────────────────────────────────────────────────────

export interface PlanLimits {
  users: number;       // -1 = unlimited
  products: number;    // -1 = unlimited
  sucursales: number;  // -1 = unlimited
  modules: string[];   // '*' = all modules
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial:      { users: 2,  products: 500,  sucursales: 0,  modules: ['*'] },
  starter:    { users: 2,  products: 500,  sucursales: 0,  modules: ['pos_detal', 'inventario', 'tasas', 'clientes', 'cajas', 'reportes', 'contabilidad', 'libro_ventas', 'portal_clientes'] },
  negocio:    { users: 5,  products: 2000, sucursales: 1,  modules: ['pos_detal', 'pos_mayor', 'inventario', 'tasas', 'clientes', 'proveedores', 'cajas', 'rrhh', 'reportes', 'sucursales', 'contabilidad', 'comparar', 'libro_ventas', 'cxc', 'cxp', 'solicitudes', 'portal_clientes', 'precios_dinamicos'] },
  enterprise: { users: -1, products: -1,   sucursales: 3,  modules: ['*'] },
  custom:     { users: -1, products: -1,   sucursales: -1, modules: ['*'] },
};

// ─── Feature lists per plan (for UI display) ─────────────────────────────────

export interface PlanInfo {
  id: Exclude<PlanId, 'trial' | 'custom'>;
  name: string;
  tagline: string;
  price: number;
  features: string[];
  popular?: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para comenzar',
    price: PLAN_PRICES.starter,
    features: [
      '2 usuarios',
      '500 productos',
      'POS Detal (contado)',
      'Inventario + Kardex',
      'CxC basico',
      'Libro de Ventas',
      'Ticket digital + WhatsApp',
      'IVA + IGTF automatico',
      'Tasas BCV en vivo',
      'Portal de clientes',
      'Centro de ayuda integrado',
    ],
  },
  {
    id: 'negocio',
    name: 'Negocio',
    tagline: 'Para crecer',
    price: PLAN_PRICES.negocio,
    popular: true,
    features: [
      'Todo lo del Starter',
      '5 usuarios',
      '2,000 productos',
      'POS Mayor (credito 15/30/45d)',
      'Multi-cuenta (BCV + tasas custom)',
      'Precios dinamicos por tasa',
      'Limite de credito por cliente',
      'CxC + CxP completo',
      'Solicitudes de abono',
      'Pronto pago (descuento)',
      'RRHH y Nomina',
      'Contabilidad completa',
      'Comparar libros',
      '1 sucursal',
      'Soporte WhatsApp',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Operación completa',
    price: PLAN_PRICES.enterprise,
    features: [
      'Todo lo del Negocio',
      'Usuarios ilimitados',
      'Productos ilimitados',
      '3 sucursales',
      'Precios dinamicos incluido',
      'VisionLab IA incluido',
      'Conciliacion bancaria',
      'Audit Logs inmutables',
      'Dashboard BI avanzado',
      'Soporte prioritario',
    ],
  },
];

// ─── Comparison table rows (for LandingPage + SubscriptionWall) ──────────────

export interface CompareRow {
  cat: string;
  label: string;
  s: boolean | string;
  n: boolean | string;
  e: boolean | string;
}

export const COMPARE_ROWS: CompareRow[] = [
  // Ventas
  { cat: 'Ventas',      label: 'POS Detal (contado)',                s: true,     n: true,       e: true },
  { cat: 'Ventas',      label: 'POS Mayor (crédito 15/30/45d)',     s: false,    n: true,       e: true },
  { cat: 'Ventas',      label: 'Multi-cuenta (BCV + custom)',       s: false,    n: true,       e: true },
  { cat: 'Ventas',      label: 'IGTF e IVA automático',             s: true,     n: true,       e: true },
  { cat: 'Ventas',      label: 'Ticket 80mm / WhatsApp',            s: true,     n: true,       e: true },
  { cat: 'Ventas',      label: 'Libro de Ventas',                   s: true,     n: true,       e: true },
  { cat: 'Ventas',      label: 'Precios dinamicos por tasa',          s: false,    n: true,       e: true },
  { cat: 'Ventas',      label: 'Tasas custom configurables',          s: false,    n: 'hasta 3',  e: 'hasta 3' },
  { cat: 'Ventas',      label: 'Portal de clientes (CxC)',            s: true,     n: true,       e: true },
  // Finanzas
  { cat: 'Finanzas',    label: 'CxC — Cuentas por cobrar',          s: 'básico', n: true,       e: true },
  { cat: 'Finanzas',    label: 'CxP — Proveedores',                 s: false,    n: true,       e: true },
  { cat: 'Finanzas',    label: 'Límite de crédito por cliente',     s: false,    n: true,       e: true },
  { cat: 'Finanzas',    label: 'Solicitudes de abono',              s: false,    n: true,       e: true },
  { cat: 'Finanzas',    label: 'Pronto pago (descuento)',           s: false,    n: true,       e: true },
  { cat: 'Finanzas',    label: 'Contabilidad (libro + balance)',    s: false,    n: true,       e: true },
  { cat: 'Finanzas',    label: 'Conciliación Bancaria',             s: false,    n: false,      e: true },
  // Inventario
  { cat: 'Inventario',  label: 'Inventario + Kardex',               s: '500 prod', n: '2,000',  e: 'ilimitado' },
  { cat: 'Inventario',  label: 'Precios multi-cuenta por producto', s: false,    n: true,       e: true },
  // Equipo
  { cat: 'Equipo',      label: 'Usuarios',                          s: '2',      n: '5',        e: 'Ilimitados' },
  { cat: 'Equipo',      label: 'Sucursales',                        s: '0',      n: '1',        e: '3' },
  { cat: 'Equipo',      label: 'RRHH y Nómina',                    s: false,    n: true,       e: true },
  { cat: 'Equipo',      label: 'Roles y permisos',                  s: true,     n: true,       e: true },
  // IA & Reportes
  { cat: 'IA & Reportes', label: 'VisionLab IA (Gemini)',           s: false,    n: `+$${ADDON_PRICES.visionLab}/mes`, e: true },
  { cat: 'IA & Reportes', label: 'Reportes KPI + P&L',             s: 'básico', n: true,       e: true },
  { cat: 'IA & Reportes', label: 'Dashboard BI (estrella, alertas)', s: 'basico', n: true,       e: true },
  // Seguridad
  { cat: 'Seguridad',   label: 'Audit Logs',                        s: false,    n: 'básico',   e: 'inmutable' },
  { cat: 'Seguridad',   label: 'Centro de Ayuda',                   s: true,     n: true,       e: true },
  { cat: 'Seguridad',   label: 'Tooltips de ayuda contextual',       s: true,     n: true,       e: true },
  // Soporte
  { cat: 'Soporte',     label: 'Canal de soporte',                  s: 'Email',  n: 'WhatsApp', e: 'Prioritario' },
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
