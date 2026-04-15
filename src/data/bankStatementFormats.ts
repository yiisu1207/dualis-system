// Perfiles de parseo de estados de cuenta CSV/Excel de los principales bancos VE.
// Usado por src/utils/bankStatementParser.ts.

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY';
export type DecimalSep = ',' | '.';

export interface BankStatementProfile {
  bankCode: string;             // '0134'
  bankName: string;             // 'Banesco'
  headerKeywords: string[];     // para detección de la fila de encabezados
  columnMap: {
    date: string[];
    amount?: string[];          // si el banco usa una sola columna firmada
    credit?: string[];          // o separadas
    debit?: string[];
    reference?: string[];
    description?: string[];
    balance?: string[];
  };
  dateFormat: DateFormat;
  decimalSep: DecimalSep;
}

// Las listas de alias de columna son intencionadamente amplias porque los bancos VE
// cambian el encabezado entre exports CSV / XLS / web / app. Se matchean case-insensitive
// con `.includes()` tras normalizar.
export const BANK_PROFILES: BankStatementProfile[] = [
  {
    bankCode: '0134',
    bankName: 'Banesco',
    headerKeywords: ['fecha', 'descripcion', 'referencia'],
    columnMap: {
      date:        ['fecha', 'fecha de operacion', 'fecha operacion'],
      credit:      ['credito', 'abono', 'monto abonado'],
      debit:       ['debito', 'cargo', 'monto cargado'],
      amount:      ['monto', 'importe'],
      reference:   ['referencia', 'ref', 'nro referencia', 'numero de referencia'],
      description: ['descripcion', 'concepto', 'detalle'],
      balance:     ['saldo', 'saldo disponible'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0105',
    bankName: 'Mercantil',
    headerKeywords: ['fecha', 'concepto', 'monto'],
    columnMap: {
      date:        ['fecha', 'fecha transaccion'],
      credit:      ['credito', 'abono'],
      debit:       ['debito', 'cargo'],
      amount:      ['monto', 'importe', 'valor'],
      reference:   ['referencia', 'ref', 'num referencia'],
      description: ['concepto', 'descripcion', 'detalle', 'observacion'],
      balance:     ['saldo'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0102',
    bankName: 'Banco de Venezuela',
    headerKeywords: ['fecha', 'descripcion', 'monto'],
    columnMap: {
      date:        ['fecha', 'fecha operacion'],
      credit:      ['credito', 'abono', 'haber'],
      debit:       ['debito', 'cargo', 'debe'],
      amount:      ['monto', 'importe'],
      reference:   ['referencia', 'ref', 'comprobante'],
      description: ['descripcion', 'concepto', 'detalle'],
      balance:     ['saldo'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0108',
    bankName: 'Provincial (BBVA)',
    headerKeywords: ['fecha', 'concepto', 'importe'],
    columnMap: {
      date:        ['fecha', 'fecha valor', 'fecha operacion'],
      credit:      ['haber', 'credito', 'abono'],
      debit:       ['debe', 'debito', 'cargo'],
      amount:      ['importe', 'monto'],
      reference:   ['referencia', 'ref'],
      description: ['concepto', 'descripcion', 'detalle'],
      balance:     ['saldo'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0191',
    bankName: 'BNC',
    headerKeywords: ['fecha', 'descripcion', 'monto'],
    columnMap: {
      date:        ['fecha'],
      credit:      ['credito', 'abono'],
      debit:       ['debito', 'cargo'],
      amount:      ['monto', 'importe'],
      reference:   ['referencia', 'ref', 'numero'],
      description: ['descripcion', 'concepto'],
      balance:     ['saldo'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
];

// Perfil "Genérico" — se usa cuando ninguno matchea. El parser intenta heurística por alias común.
export const GENERIC_PROFILE: BankStatementProfile = {
  bankCode: '0000',
  bankName: 'Genérico',
  headerKeywords: ['fecha', 'monto', 'descripcion', 'referencia', 'concepto', 'credito', 'debito'],
  columnMap: {
    date:        ['fecha', 'date'],
    credit:      ['credito', 'abono', 'credit', 'haber'],
    debit:       ['debito', 'cargo', 'debit', 'debe'],
    amount:      ['monto', 'importe', 'amount', 'valor'],
    reference:   ['referencia', 'ref', 'reference', 'numero', 'comprobante'],
    description: ['descripcion', 'concepto', 'description', 'detalle', 'observacion'],
    balance:     ['saldo', 'balance'],
  },
  dateFormat: 'DD/MM/YYYY',
  decimalSep: ',',
};

export function findBankProfile(bankCode: string): BankStatementProfile | undefined {
  return BANK_PROFILES.find(p => p.bankCode === bankCode);
}
