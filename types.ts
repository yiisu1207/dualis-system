
export interface User {
  username: string;
  role: 'owner' | 'admin' | 'ventas' | 'auditor' | 'pending' | 'staff' | 'member';
  name: string;
  pin?: string; // Nuevo para acceso rápido
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
  messageTemplates?: MessageTemplate[];
  authorizedUsers?: User[]; // Nuevo: Gestión de usuarios
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
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
