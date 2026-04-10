
export interface User {
  username: string;
  role: 'owner' | 'admin' | 'ventas' | 'auditor' | 'pending' | 'staff' | 'member' | 'almacenista' | 'inventario';
  name: string;
  pin?: string;
  phone?: string;
  phoneCountryCode?: string;
}

// BCV es la única cuenta fija. Todo lo demás viene de customRates[].id
export type AccountType = 'BCV' | string;
// Constantes de compatibilidad (los nuevos componentes NO las usan)
export const AccountType = { BCV: 'BCV' as const, GRUPO: 'GRUPO' as const, DIVISA: 'DIVISA' as const };

export enum MovementType {
  FACTURA = 'FACTURA',
  ABONO = 'ABONO',
  SALDO_INICIAL = 'SALDO_INICIAL'
}

export enum PaymentCurrency {
  USD = 'USD',
  BS = 'BS'
}

export type DeviceMode = 'pc' | 'tablet' | 'mobile';

export interface ExchangeRates {
  bcv: number;
  grupo?: number;   // @deprecated — usar customRates[].value
  divisa?: number;  // @deprecated — usar customRates[].value
  lastUpdated?: string;
}

export type CreditScore = 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'RIESGO';

export interface Customer {
  id: string;
  nombre?: string;
  fullName?: string;
  rif?: string;
  cedula: string;
  telefono: string;
  direccion: string;
  email?: string;
  createdAt?: string;
  businessId?: string;
  ownerId?: string;
  creditLimit?: number;
  defaultAccountType?: AccountType;
  // Credit management
  creditApproved?: boolean;
  defaultPaymentDays?: number;
  creditScore?: CreditScore;
  internalNotes?: string;
  // Portal de clientes
  portalEnabled?: boolean;
  portalEmail?: string;
  portalUserId?: string;
  portalActivatedAt?: string;
  // KYC
  cedulaFrontalUrl?: string;
  cedulaTraseraUrl?: string;
  kycStatus?: 'pending' | 'verified' | 'rejected';
  kycVerifiedAt?: string;
  kycSubmittedAt?: string;
  termsAcceptedAt?: string;
  // Fidelidad
  loyaltyTier?: LoyaltyTier;
  loyaltyPoints?: number;
  segments?: CustomerSegment[];
  priceListId?: string;
  // CRM
  tags?: string[];
  birthday?: string; // YYYY-MM-DD
  lastBirthdayGreetingYear?: number;
}

export interface Supplier {
  id: string;
  rif: string;
  contacto: string;
  categoria: string;
  businessId?: string;
  ownerId?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
}

export type UnitType = 'unidad' | 'kg' | 'g' | 'ton' | 'lt' | 'ml' | 'lb';

export interface Movement {
  id: string;
  entityId: string;
  entityName?: string;
  date: string;
  createdAt?: string;
  startedAt?: string;
  businessId?: string;
  ownerId?: string;
  concept: string;
  amount: number;
  amountInUSD: number;
  originalAmount?: number;
  subtotalUSD?: number;
  ivaAmount?: number;
  igtfAmount?: number;
  igtfRate?: number;
  discountAmount?: number;
  currency: PaymentCurrency | string;
  movementType: MovementType | string;
  accountType: AccountType | string;
  rateUsed: number;
  reference?: string;
  referencia?: string;
  nroControl?: string;
  productId?: string;
  isSupplierMovement?: boolean;
  expenseCategory?: string;
  invoiceImage?: string;
  metodoPago?: 'Efectivo' | 'Transferencia' | string;
  montoCalculado?: number;
  // POS fields
  pagado?: boolean;
  estadoPago?: 'PAGADO' | 'PENDIENTE' | string;
  esVentaContado?: boolean;
  anulada?: boolean;
  cajaId?: string;
  vendedorId?: string;
  vendedorNombre?: string;
  paymentCondition?: string;   // legacy: 'credito15' | 'credito30' | 'credito45'
  items?: { id: string; nombre: string; qty: number; price: number; subtotal: number }[];
  pagos?: Record<string, number>;
  esPagoMixto?: boolean;
  // Credit period + early pay discount (new)
  paymentDays?: number;              // e.g. 30
  dueDate?: string;                  // ISO date: date + paymentDays
  earlyPayDiscountPct?: number;      // e.g. 1.0 (%)
  earlyPayDiscountExpiry?: string;   // = dueDate
  earlyPayDiscountAmt?: number;      // USD amount saved if paid on time
  // Portal payment confirmation
  portalComprobante?: string;        // URL comprobante subido por cliente
  portalComprobanteAt?: string;
  portalPaymentStatus?: 'pending_review' | 'confirmed' | 'rejected';
  // Nota de Entrega
  esNotaEntrega?: boolean;
  estadoNDE?: 'pendiente_despacho' | 'despachado' | 'parcial' | 'rechazado';
  almacenId?: string;
  bultos?: number;
  comisionVendedor?: number;
  comisionAlmacenista?: number;
  despachoPor?: string;
  despachoAt?: string;
  despachoNotas?: string;
  despachoItems?: {
    id: string;
    nombre: string;
    qtyPedida: number;
    qtyDespachada: number;
  }[];
  // Hybrid signature: in-person at delivery OR portal-confirmed later
  clienteSignature?: string;            // dataURL PNG de la firma
  clienteSignedAt?: string;
  clienteSignedBy?: string;             // nombre del receptor
  clienteSignedCedula?: string;         // cédula del receptor
  signatureMethod?: 'in_person' | 'portal';
  awaitingPortalConfirmation?: boolean; // marca que el receptor pidió confirmar luego desde portal
  portalConfirmRequestedAt?: string;
  // Tesorería / pagos manuales (P6)
  bankAccountId?: string;
  voucherUrl?: string;
  payerCedula?: string;
  payerPhone?: string;
  paymentDate?: string;
  portalPaymentId?: string;
  reconciledAt?: string;
  reconciledBy?: string;
  receiptPdfUrl?: string;
  anuladaAt?: string;
  anuladaBy?: string;
  anuladaReason?: string;
  createdBy?: string;
  // Disputas (cliente reporta error/daño desde portal)
  disputeStatus?: 'open' | 'investigating' | 'resolved' | 'rejected';
  disputeId?: string;
  // ── Fase D.0 — Quórum de aprobación ───────────────────────────────────────
  // Los movements legacy sin `status` se leen como 'committed' (fallback).
  status?: 'committed' | 'pendingApproval';
  approvalFlowId?: string;              // ref al pendingMovement del que nació
  approvedBy?: string[];                // uids que firmaron
  migratedFromHistorical?: boolean;     // bypass de quórum (import histórico)
  // ── Fase D.0.1 — Verificación de llegada al banco ─────────────────────────
  // Solo aplica a movements con metodoPago != Efectivo/Tarjeta.
  // Campos 100% informativos — no afectan contabilidad ni saldos.
  verificationStatus?: 'unverified' | 'verified' | 'not_arrived';
  verifiedAt?: string;
  verifiedBy?: string;                  // uid
  verifiedByName?: string;              // denormalizado
  verificationNote?: string;            // "Apareció en estado BDV del 15-abr"
  // ── Fase D.5 — Compensación entre cuentas multi-tasa ─────────────────────
  // Identifica el par FACTURA↔ABONO generado al rebalancear saldos entre
  // cuentas (BCV / Paralela / etc.). Ambos lados comparten el mismo id.
  compensationPairId?: string;
  /** True when this movement belongs to CxP (accounts payable) rather than CxC */
  isCxP?: boolean;
  // ── Fase G — Ventas recurrentes ───────────────────────────────────────────
  recurring?: {
    enabled: boolean;
    frequency: 'weekly' | 'monthly' | 'yearly';
    nextDate: string;       // ISO date of next auto-generation
    count?: number;         // total repetitions (undefined = infinite)
    generated?: number;     // how many have been generated so far
  };
  // ── Fase G — Backorders / pedidos pendientes ──────────────────────────────
  backorder?: boolean;       // true when sold without enough stock
  backorderQty?: number;     // units still owed (stock was insufficient)
  // ── Fase B — Devoluciones ─────────────────────────────────────────────────
  devueltoParcial?: boolean;
  devueltoTotal?: boolean;
  saldoAFavor?: number;     // USD credit for future purchases
}

// ── Fase D.0 — Quórum multi-firma para movimientos sensibles ───────────────
// Los movimientos manuales de CxC/CxP pasan por una cola de aprobación
// cuando approvalConfig.enabled === true Y hay ≥2 validadores. POS realtime
// y imports históricos bypass siempre. El creador NUNCA puede aprobar su
// propio movimiento. Quórum = número fijo configurable (default 2).

export type ApprovalMovementKind =
  | 'FACTURA_CXC' | 'ABONO_CXC' | 'AJUSTE_CXC' | 'ANULACION_CXC'
  | 'FACTURA_CXP' | 'ABONO_CXP' | 'AJUSTE_CXP' | 'ANULACION_CXP';

export interface ApprovalConfig {
  enabled: boolean;                     // default false (compat Usuario A/B)
  quorumRequired: number;               // default 2, mínimo 2
  appliesTo: ApprovalMovementKind[];    // default: todos los manuales CxC/CxP
  exemptPortalPayments: boolean;        // default true
  exemptPosRealtime: boolean;           // default true
}

export interface PendingMovementApproval {
  userId: string;
  userName: string;
  at: string;
  note?: string;
}

export interface PendingMovementRejection {
  userId: string;
  userName: string;
  at: string;
  reason: string;
}

export interface PendingMovement {
  id: string;
  businessId: string;
  // Draft del movement a commitear — mismo shape que Movement sin id/createdAt.
  movementDraft: Omit<Movement, 'id' | 'createdAt'>;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvals: PendingMovementApproval[];
  rejections: PendingMovementRejection[];
  quorumRequired: number;               // snapshot al crear
  quorumSnapshot: {
    validatorIds: string[];
    validatorCount: number;
  };
  committedMovementId?: string;
  committedAt?: string;
  cancelledAt?: string;
}

// ── Fase G — Cotizaciones / presupuestos ───────────────────────────────────
// Documento que el cliente puede aprobar/rechazar antes de convertirse en
// venta. Al convertir, se abre PosDetal pre-poblado y al cerrar la venta
// marca `status='convertida'` + `convertedMovementId`.

export type QuoteStatus =
  | 'borrador'
  | 'enviada'
  | 'aprobada'
  | 'rechazada'
  | 'vencida'
  | 'convertida';

export interface QuoteItem {
  id: string;
  nombre: string;
  qty: number;
  price: number;
  subtotal: number;
  productId?: string;
}

export interface Quote {
  id: string;
  businessId: string;
  quoteNumber: string;           // correlativo visible tipo "COT-0001"
  customerId: string;
  customerName: string;
  items: QuoteItem[];
  subtotal: number;
  iva: number;
  ivaRate?: number;              // snapshot del % al crear
  discount?: number;
  total: number;
  notes?: string;
  status: QuoteStatus;
  validUntil: string;            // ISO date
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  sentAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  convertedMovementId?: string;
  convertedAt?: string;
  expiredAt?: string;
}

// ── Disputas / reclamos del portal ─────────────────────────────────────────

export interface Dispute {
  id?: string;
  businessId: string;
  customerId: string;
  customerName?: string;
  movementId: string;
  movementRef?: string;          // nroControl o concepto del movement
  type: 'wrong_items' | 'missing_items' | 'damaged' | 'billing_error' | 'other';
  description: string;
  photos?: string[];             // Cloudinary URLs
  status: 'open' | 'investigating' | 'resolved' | 'rejected';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ── Períodos de pago configurables ─────────────────────────────────────────

export interface PaymentPeriod {
  days: number;
  label: string;
  discountPercent: number;  // 0 = no discount
  // ── Fase B.4 dual config ────────────────────────────────────────────────
  // 'fictitious' → el sistema INFLA el precio (markup invisible) y luego
  //                 "descuenta" hasta el neto original. El cliente siente
  //                 que le hicieron un descuento pero el negocio no pierde
  //                 margen. Fórmula: precioMostrado = neto / (1 - pct/100).
  // 'real'       → descuento REAL sobre el total. El negocio sí deja de
  //                 cobrar ese %. Útil para pronto pago genuino / promos.
  // undefined    → legacy, se interpreta como 'fictitious' (compat).
  mode?: 'fictitious' | 'real';
}

// ── Portal de Invitación ────────────────────────────────────────────────────

export interface PortalInvite {
  id?: string;
  customerId: string;
  customerName: string;
  businessId: string;
  email: string;
  token: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

// ── Programa Embajador ──────────────────────────────────────────────────────

export interface Referral {
  id?: string;
  referrerId: string;          // businessId del referidor
  refereeBusinessId?: string;  // businessId del nuevo negocio
  referralSlug: string;        // slug usado en el link
  refereeEmail?: string;
  registeredAt: string;
  firstPurchaseAt?: string;    // cuando compra su primer plan
  activatedAt?: string;        // 30d activos + pagó → descuento activo
  status: 'pending' | 'qualified' | 'active' | 'churned';
}

export interface CommissionConfig {
  enabled: boolean;
  perBulto: number;
  target: 'vendedor' | 'almacenista' | 'both';
  splitVendedor?: number;
  splitAlmacenista?: number;
}

export interface NDEConfig {
  enabled: boolean;
  defaultMode: boolean;
  footerMessage?: string;
  showLogo: boolean;
  rejectionReasons: string[];
  requireRejectionReason: boolean;
  autoNotifyVendedor: boolean;
}

export interface AppConfig {
  companyName: string;
  companyRif?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  companyLogo?: string;
  receiptMessage?: string;
  defaultIva?: number;
  mainCurrency?: 'USD' | 'BS';
  invoicePrefix?: string;
  ticketFooter?: string;
  currency: string;
  language: string;
  theme: {
    primaryColor: string;
    fontFamily: string;
    borderRadius: string;
    // darkMode eliminado: solo modo claro
    deviceMode: DeviceMode;
    uiVersion?: 'classic' | 'editorial';
    accentFrom?: string;    // CSS var --accent-from (e.g. '#4f46e5')
    accentTo?: string;      // CSS var --accent-to   (e.g. '#7c3aed')
    density?: 'compact' | 'normal' | 'spacious';
  };
  system: { // Nuevo bloque de sistema
    alertThreshold: number; // Días para alerta de deuda
    enableAudit: boolean;
  };
  notifications?: {
    cxc: boolean;
    inventory: boolean;
    nomina: boolean;
    ventas: boolean;
    finanzas: boolean;
    reportes: boolean;
  };
  modules: {
    dashboard: boolean;
    cxc: boolean;
    cxp: boolean;
    statement: boolean;
    ledger: boolean;
    expenses: boolean;
    vision: boolean;
    reconciliation: boolean;
    nomina: boolean;
  };
  fiscal?: {
    igtfEnabled: boolean;
    igtfRate: number;       // porcentaje, ej: 3 para 3%
    ivaEnabled: boolean;
    scannerEnabled: boolean;
    zoherEnabled?: boolean; // Extensión de tasas personalizadas con precios dinámicos
  };
  creditPolicy?: CreditPolicy;
  paymentPeriods?: PaymentPeriod[];  // configurable credit terms for POS Mayor
  operation?: {
    isolationMode: 'individual' | 'shared';  // individual = libros aislados, shared = libro compartido
  };
  messageTemplates?: MessageTemplate[];
  authorizedUsers?: User[]; // Nuevo: Gestión de usuarios
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

export interface EarlyPaymentTier {
  maxDays: number;
  discountPercent: number;
  label: string;
}

export interface CreditPolicy {
  enabled: boolean;
  defaultCreditLimit: number;
  earlyPaymentTiers: EarlyPaymentTier[];
  gracePeriodDays: number;
  requireAbonoApproval: boolean;
}

export interface PaymentRequest {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  accountType: AccountType;
  amount: number;
  currency: 'USD' | 'BS';
  metodoPago: string;
  referencia: string;
  nota?: string;
  vendedorId: string;
  vendedorNombre: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface OperationalRecord {
  id: string;
  date: string;
  concept: string;
  amount: number;
  accountSource: AccountType;
  type: 'GASTO' | 'NOMINA' | 'COSTO';
  businessId?: string;
  ownerId?: string;
}

export interface ReconciliationRecord {
  id: string;
  businessId: string;
  ownerId?: string;
  account: AccountType;
  system: number;
  physical: number;
  difference: number;
  userName: string;
  userId?: string;
  createdAt: string;
}

// SISTEMA RRHH PRO
export type PayFrequency = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
export type SanctionLevel = 'LEVE' | 'GRAVE' | 'CRITICA';

export interface Employee {
  id: string;
  name: string;
  lastName: string;
  idNumber: string;
  address: string;
  phone: string;
  position: string;
  salary: number; // Base Salary in USD
  frequency: PayFrequency;
  hiredDate: string;
  status: 'ACTIVO' | 'VACACIONES' | 'SUSPENDIDO';
  cvFile?: string; 
  email?: string;
}

export interface Sanction {
  id: string;
  employeeId: string;
  date: string;
  level: SanctionLevel;
  reason: string;
  notifiedBy: string;
}

export interface CashAdvance {
  id: string;
  employeeId: string;
  date: string;
  amount: number; 
  originalAmount: number; 
  currency: PaymentCurrency; 
  exchangeRate: number; 
  reason: string;
  status: 'PENDIENTE' | 'DESCONTADO';
}

export interface PayrollReceipt {
  id: string;
  date: string;
  period: string; 
  totalPaid: number;
  details: {
    employeeId: string;
    employeeName: string;
    baseSalary: number;
    totalAdvances: number; 
    missedDays: number;
    deductionAmount: number;
    netPay: number;
  }[];
}

export interface AuditLog {
  id: string;
  date: string;
  user: string;
  action: 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'LOGIN' | 'AJUSTE';
  module: string;
  detail: string;
}

// ── Tasas Personalizadas (Precios Dinámicos) ────────────────────────────────

export interface CustomRate {
  id: string;          // 'GRUPO', 'DIVISA', o generado como 'RATE_xxx'
  name: string;        // nombre display: 'Zoher', 'Divisa', 'Paralela'
  value: number;       // valor actual de la tasa
  enabled: boolean;
}

// ── Portal de Clientes ──────────────────────────────────────────────────────

export interface PortalAccessToken {
  id?: string;
  customerId: string;
  customerName: string;
  pin: string;
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  active: boolean;
  lastAccessAt?: string;
}

export interface PortalPayment {
  id?: string;
  businessId: string;
  customerId: string;
  customerName: string;
  invoiceIds: string[];
  accountType: AccountType;
  amount: number;
  metodoPago: string;
  referencia: string;
  nota?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  // Tesorería extensions (P6)
  bankAccountId?: string;
  voucherUrl?: string;
  payerCedula?: string;
  payerPhone?: string;
  paymentDate?: string;
  fingerprint?: string | null;
  cancelledAt?: string;
  cancelledBy?: 'customer' | 'admin';
  vendedorId?: string;
  vendedorNombre?: string;
}

// ─── Tesorería: Cuentas bancarias del negocio (P6) ────────────────────────────

export type BankAccountType =
  | 'corriente'
  | 'ahorro'
  | 'pago_movil'
  | 'zelle'
  | 'binance'
  | 'paypal'
  | 'efectivo';

export interface BusinessBankAccount {
  id: string;
  businessId?: string;
  bankCode: string;
  bankName: string;
  accountType: BankAccountType;
  accountNumber: string;
  holderName: string;
  holderDocument: string;
  currency: 'VES' | 'USD';
  enabled: boolean;
  instructions?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BankWithdrawal {
  id: string;
  accountId: string;
  amount: number;       // USD
  concept: string;
  date: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

// ─── Appointments (Citas) ─────────────────────────────────────────────────────

export interface Service {
  id: string;
  name: string;
  duration: number;          // minutos
  price: number;             // USD
  staffIds: string[];
  category?: string;
  imageUrl?: string;
  requiresDeposit?: boolean;
  depositAmount?: number;
  active?: boolean;
  businessId?: string;
}

export interface StaffSchedule {
  staffId: string;
  staffName: string;
  weeklyHours: Record<number, { start: string; end: string } | null>; // 0=dom...6=sáb
  breaks: { start: string; end: string }[];
  bufferMinutes: number;
  daysOff: string[];         // ISO dates
  businessId?: string;
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentSource = 'portal' | 'walk_in' | 'manual';

export interface Appointment {
  id: string;
  businessId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  date: string;              // ISO date YYYY-MM-DD
  startTime: string;         // "10:30"
  endTime: string;           // "11:00"
  status: AppointmentStatus;
  source: AppointmentSource;
  notes?: string;
  depositPaid?: boolean;
  recurrenceId?: string;     // for recurring appointments
  createdAt: string;
}

// ─── Pre-orders (Panadería/Repostería) ────────────────────────────────────────

export type PreOrderStatus = 'pending' | 'confirmed' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';

export interface PreOrder {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string;
  customerId?: string;
  items: PreOrderItem[];
  deliveryDate: string;       // ISO date
  deliveryTime?: string;      // "14:00"
  totalUSD: number;
  depositUSD: number;
  depositPaid: boolean;
  status: PreOrderStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface PreOrderItem {
  productId?: string;
  name: string;
  quantity: number;
  priceUSD: number;
  notes?: string;             // "con chispas de chocolate"
}

// ─── Repair Tickets (Tecnología) ──────────────────────────────────────────────

export type TicketStatus = 'received' | 'diagnosing' | 'waiting_parts' | 'in_repair' | 'ready' | 'delivered' | 'cancelled';

export interface RepairTicket {
  id: string;
  businessId: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  customerId?: string;
  deviceType: string;         // "Laptop", "Teléfono", "Impresora"
  deviceBrand?: string;
  deviceModel?: string;
  serialNumber?: string;
  issueDescription: string;
  diagnosis?: string;
  estimatedCostUSD?: number;
  finalCostUSD?: number;
  status: TicketStatus;
  receivedBy: string;
  assignedTo?: string;
  receivedAt: string;
  estimatedReadyDate?: string;
  deliveredAt?: string;
  createdAt: string;
}

// ─── Loyalty / Fidelidad ────────────────────────────────────────────���─────────

export type LoyaltyTier = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante' | 'elite';

export interface LoyaltyConfig {
  enabled: boolean;
  pointsPerDollar: number;         // puntos por cada $1 facturado y pagado
  earlyPaymentBonus: number;       // puntos extra por pagar antes del vencimiento
  tierThresholds: Record<LoyaltyTier, number>; // puntos acumulados para subir de tier
  tierBenefits: Record<LoyaltyTier, TierBenefit>;
}

export interface TierBenefit {
  creditLimitBonus: number;        // % extra de límite de crédito
  graceDaysBonus: number;          // días extra de gracia
  discountPercent: number;         // % descuento general
  badge: string;                   // emoji o ícono
}

export interface LoyaltyAccount {
  customerId: string;
  businessId: string;
  totalPoints: number;             // puntos acumulados históricamente
  currentPoints: number;           // puntos disponibles (sin canjear)
  tier: LoyaltyTier;
  tierUpdatedAt: string;
  lastEarnedAt?: string;
}

export type LoyaltyEventType = 'earn_purchase' | 'earn_early_payment' | 'earn_bonus' | 'redeem' | 'expire' | 'adjust';

export interface LoyaltyEvent {
  id: string;
  customerId: string;
  businessId: string;
  type: LoyaltyEventType;
  points: number;                  // positivo = ganó, negativo = gastó/expiró
  description: string;
  movementId?: string;             // referencia al movimiento CxC
  createdAt: string;
}

export type CustomerSegment = 'vip' | 'mayorista' | 'moroso' | 'nuevo' | 'recurrente' | 'inactivo';

export interface PriceList {
  id: string;
  businessId: string;
  name: string;                    // "Lista VIP", "Precios Mayorista"
  type: 'tier' | 'segment' | 'custom';
  targetTier?: LoyaltyTier;
  targetSegment?: CustomerSegment;
  discountPercent?: number;        // descuento global
  productOverrides?: Record<string, number>; // productId → precio especial USD
  active: boolean;
  createdAt: string;
}

// ── Fase K — Transferencias entre almacenes ────────────────────────────────
export interface StockTransferItem {
  productId: string;
  productName: string;
  qty: number;
}

export interface StockTransfer {
  id: string;
  businessId: string;
  fromAlmacenId: string;
  fromAlmacenName: string;
  toAlmacenId: string;
  toAlmacenName: string;
  items: StockTransferItem[];
  status: 'pendiente' | 'en_transito' | 'completada' | 'cancelada';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

// ── Fase F — Historial de comunicaciones con clientes ──────────────────────
export type CommunicationType = 'llamada' | 'visita' | 'whatsapp' | 'email' | 'sms' | 'nota';
export type CommunicationOutcome = 'promesa_pago' | 'no_contesto' | 'rechazo' | 'acuerdo' | 'informativo';

export interface Communication {
  id: string;
  type: CommunicationType;
  content: string;
  date: string;
  userId: string;
  userName: string;
  outcome?: CommunicationOutcome;
  promiseDate?: string;           // solo si outcome === 'promesa_pago'
  promiseAmount?: number;
}
