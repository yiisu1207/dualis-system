
export interface User {
  username: string;
  role: 'owner' | 'admin' | 'ventas' | 'auditor' | 'pending' | 'staff' | 'member';
  name: string;
  pin?: string;
  phone?: string;
  phoneCountryCode?: string;
}

export enum AccountType {
  BCV = 'BCV',
  GRUPO = 'GRUPO',
  DIVISA = 'DIVISA'
}

export enum MovementType {
  FACTURA = 'FACTURA',
  ABONO = 'ABONO'
}

export enum PaymentCurrency {
  USD = 'USD',
  BS = 'BS'
}

export type DeviceMode = 'pc' | 'tablet' | 'mobile';

export interface ExchangeRates {
  bcv: number;
  grupo: number;
  divisa: number;
  lastUpdated?: string;
}

export interface Customer {
  id: string;
  cedula: string;
  telefono: string;
  direccion: string;
  email?: string;
  createdAt?: string;
  businessId?: string;
  ownerId?: string;
  creditLimit?: number;
  defaultAccountType?: AccountType;
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

export interface Movement {
  id: string;
  entityId: string;
  date: string;
  createdAt?: string;
  businessId?: string;
  ownerId?: string;
  concept: string;
  amount: number;
  amountInUSD: number;
  currency: PaymentCurrency | string;
  movementType: MovementType;
  accountType: AccountType;
  rateUsed: number;
  reference?: string; 
  productId?: string;
  isSupplierMovement?: boolean;
  expenseCategory?: string;
  invoiceImage?: string;
  metodoPago?: 'Efectivo' | 'Transferencia' | string;
  montoCalculado?: number;
  originalAmount?: number;
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
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}
