// Lookup de bancos venezolanos (SUDEBAN) + medios USD.
// Usado por Tesorería y PortalAbonoForm.

import type { BusinessBankAccount } from '../../types';

export interface BancoVE {
  code: string;       // código IBP de 4 dígitos para bancos VE; tag para no-bancarios
  name: string;       // nombre comercial
  shortName: string;  // alias para chips
  color: string;      // hex brand para UI cards
  isUSD?: boolean;    // true para Zelle/Binance/PayPal/Efectivo
}

export const BANCOS_VE: BancoVE[] = [
  // Bancos universales VE (SUDEBAN)
  { code: '0102', name: 'Banco de Venezuela',          shortName: 'BDV',         color: '#E30613' },
  { code: '0104', name: 'Banco Venezolano de Crédito', shortName: 'BVC',         color: '#003087' },
  { code: '0105', name: 'Banco Mercantil',             shortName: 'Mercantil',   color: '#0070C0' },
  { code: '0108', name: 'Banco Provincial (BBVA)',     shortName: 'Provincial',  color: '#1464A5' },
  { code: '0114', name: 'Bancaribe',                   shortName: 'Bancaribe',   color: '#00A651' },
  { code: '0115', name: 'Banco Exterior',              shortName: 'Exterior',    color: '#003F87' },
  { code: '0128', name: 'Banco Caroní',                shortName: 'Caroní',      color: '#005DAB' },
  { code: '0134', name: 'Banesco',                     shortName: 'Banesco',     color: '#00874E' },
  { code: '0137', name: 'Sofitasa',                    shortName: 'Sofitasa',    color: '#1D4F91' },
  { code: '0138', name: 'Banco Plaza',                 shortName: 'Plaza',       color: '#0066B3' },
  { code: '0151', name: 'BFC Banco Fondo Común',       shortName: 'BFC',         color: '#E30613' },
  { code: '0156', name: '100% Banco',                  shortName: '100%',        color: '#FF6B00' },
  { code: '0157', name: 'DelSur',                      shortName: 'DelSur',      color: '#1F3864' },
  { code: '0163', name: 'Banco del Tesoro',            shortName: 'Tesoro',      color: '#7B2D8E' },
  { code: '0166', name: 'Banco Agrícola de Venezuela', shortName: 'Agrícola',    color: '#006837' },
  { code: '0168', name: 'Bancrecer',                   shortName: 'Bancrecer',   color: '#E30613' },
  { code: '0169', name: 'Mi Banco',                    shortName: 'Mi Banco',    color: '#F58220' },
  { code: '0171', name: 'Banco Activo',                shortName: 'Activo',      color: '#FF6B00' },
  { code: '0172', name: 'Bancamiga',                   shortName: 'Bancamiga',   color: '#003087' },
  { code: '0174', name: 'Banplus',                     shortName: 'Banplus',     color: '#003087' },
  { code: '0175', name: 'Banco Bicentenario',          shortName: 'Bicentenario',color: '#FFC72C' },
  { code: '0177', name: 'BANFANB',                     shortName: 'BANFANB',     color: '#006837' },
  { code: '0191', name: 'Banco Nacional de Crédito',   shortName: 'BNC',         color: '#0066B3' },
  // Medios USD / no-bancarios
  { code: 'ZELLE',    name: 'Zelle',         shortName: 'Zelle',    color: '#6D1ED4', isUSD: true },
  { code: 'BINANCE',  name: 'Binance Pay',   shortName: 'Binance',  color: '#F0B90B', isUSD: true },
  { code: 'PAYPAL',   name: 'PayPal',        shortName: 'PayPal',   color: '#003087', isUSD: true },
  { code: 'EFECTIVO', name: 'Efectivo USD',  shortName: 'Cash',     color: '#10B981', isUSD: true },
];

export const getBancoByCode = (code: string): BancoVE | undefined =>
  BANCOS_VE.find(b => b.code === code);

export const isBancoVE = (code: string): boolean => /^\d{4}$/.test(code);

// Genera instrucciones legibles para que el cliente sepa cómo pagar.
// Si la cuenta tiene `instructions` propio, ese override gana.
export const getInstructionsTemplate = (account: BusinessBankAccount): string => {
  if (account.instructions && account.instructions.trim().length > 0) {
    return account.instructions.trim();
  }
  const bank = getBancoByCode(account.bankCode);
  const bankLabel = bank ? `${bank.shortName} (${bank.code})` : account.bankCode;

  switch (account.accountType) {
    case 'pago_movil':
      return [
        `Pago Móvil`,
        `Banco: ${bankLabel}`,
        `Teléfono: ${account.accountNumber}`,
        `C.I./RIF: ${account.holderDocument}`,
        `Titular: ${account.holderName}`,
        `Monto en Bs según tasa BCV vigente.`,
      ].join('\n');
    case 'zelle':
      return [
        `Zelle (USD)`,
        `Email: ${account.accountNumber}`,
        `Nombre: ${account.holderName}`,
        `Monto exacto en USD.`,
      ].join('\n');
    case 'binance':
      return [
        `Binance Pay (USD)`,
        `Pay ID: ${account.accountNumber}`,
        `Usuario: ${account.holderName}`,
      ].join('\n');
    case 'paypal':
      return [
        `PayPal (USD)`,
        `Cuenta: ${account.accountNumber}`,
        `Nombre: ${account.holderName}`,
      ].join('\n');
    case 'efectivo':
      return `Efectivo USD entregado en caja.`;
    case 'ahorro':
    case 'corriente':
    default:
      return [
        `Transferencia ${account.accountType === 'ahorro' ? 'Ahorro' : 'Corriente'}`,
        `Banco: ${bankLabel}`,
        `Cuenta: ${account.accountNumber}`,
        `Titular: ${account.holderName}`,
        `C.I./RIF: ${account.holderDocument}`,
      ].join('\n');
  }
};

// Validaciones de formato
export const CEDULA_REGEX = /^[VEJGPvejgp]-?\d{6,9}$/;
export const CEDULA_VE_REGEX = /^[VEJG]-\d{6,9}$/;
export const PHONE_VE_REGEX = /^04(12|14|16|24|26)\d{7}$/;
export const REFERENCE_6_REGEX = /^\d{6}$/;

export const normalizeCedula = (raw: string): string => {
  const trimmed = (raw || '').trim().toUpperCase();
  if (!trimmed) return '';
  if (/^[VEJG]\d/.test(trimmed)) return `${trimmed[0]}-${trimmed.slice(1)}`;
  return trimmed;
};

export const normalizePhone = (raw: string): string =>
  (raw || '').replace(/[\s-]/g, '');
