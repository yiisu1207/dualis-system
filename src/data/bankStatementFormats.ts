// Perfiles de parseo de estados de cuenta CSV/Excel/PDF de los principales bancos VE.
// Usado por src/utils/bankStatementParser.ts.

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY';
export type DecimalSep = ',' | '.';

export interface BankStatementProfile {
  bankCode: string;             // '0134'
  bankName: string;             // 'Banesco'
  variantLabel?: string;        // 'Personal' | 'Empresa' — mostrado en el dropdown como "Banesco — Personal"
  headerKeywords: string[];     // para detección de la fila de encabezados
  pdfDetectionKeywords?: string[]; // palabras clave para detectar el banco desde texto PDF
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

export function profileLabel(p: BankStatementProfile): string {
  return p.variantLabel ? `${p.bankName} — ${p.variantLabel}` : p.bankName;
}

// Las listas de alias de columna son intencionadamente amplias porque los bancos VE
// cambian el encabezado entre exports CSV / XLS / web / app / PDF.
// Se matchean case-insensitive con `.includes()` tras normalizar.
export const BANK_PROFILES: BankStatementProfile[] = [
  {
    bankCode: '0134',
    bankName: 'Banesco',
    variantLabel: 'Personal',
    headerKeywords: ['fecha', 'descripcion', 'referencia', 'cargos', 'abonos'],
    pdfDetectionKeywords: ['banesco banco universal', 'banesconline', 'detalle de movimientos'],
    columnMap: {
      date:        ['fecha', 'fecha de operacion', 'fecha operacion', 'dia'],
      credit:      ['credito', 'abono', 'abonos', 'monto abonado'],
      debit:       ['debito', 'cargo', 'cargos', 'monto cargado'],
      amount:      ['monto', 'importe'],
      reference:   ['referencia', 'ref', 'ref.', 'nro referencia', 'numero de referencia'],
      description: ['descripcion', 'concepto', 'detalle'],
      balance:     ['saldo', 'saldo disponible', 'saldos'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0105',
    bankName: 'Mercantil',
    variantLabel: 'Personal',
    headerKeywords: ['fecha', 'concepto', 'monto', 'cargos', 'abonos', 'referencia'],
    pdfDetectionKeywords: ['mercantil banco universal', 'mercantil en linea', 'banco mercantil'],
    columnMap: {
      date:        ['fecha', 'fecha transaccion'],
      credit:      ['credito', 'abono', 'abonos'],
      debit:       ['debito', 'cargo', 'cargos'],
      amount:      ['monto', 'importe', 'valor'],
      reference:   ['referencia', 'ref', 'num referencia', 'n° referencia', 'nro referencia', 'n referencia'],
      description: ['concepto', 'descripcion', 'detalle', 'observacion'],
      balance:     ['saldo'],
    },
    dateFormat: 'DD/MM/YYYY',
    decimalSep: ',',
  },
  {
    bankCode: '0102',
    bankName: 'Banco de Venezuela',
    variantLabel: 'Personal',
    headerKeywords: ['fecha', 'concepto', 'monto', 'referencia', 'operacion', 'saldo'],
    pdfDetectionKeywords: ['banco de venezuela', 'bdvenlinea', 'bdv'],
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
    variantLabel: 'Personal',
    headerKeywords: ['fecha', 'concepto', 'importe', 'debitos', 'creditos'],
    pdfDetectionKeywords: ['bbva provincial', 'provincial s.a.', 'provinet', 'banco provincial'],
    columnMap: {
      date:        ['fecha', 'fecha valor', 'fecha operacion'],
      credit:      ['haber', 'credito', 'creditos', 'abono'],
      debit:       ['debe', 'debito', 'debitos', 'cargo'],
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
    variantLabel: 'Personal',
    headerKeywords: ['fecha', 'descripcion', 'monto', 'debitos', 'creditos'],
    pdfDetectionKeywords: ['banco nacional de credito', 'bnc', 'bncnet'],
    columnMap: {
      date:        ['fecha'],
      credit:      ['credito', 'creditos', 'abono'],
      debit:       ['debito', 'debitos', 'cargo'],
      amount:      ['monto', 'importe'],
      reference:   ['referencia', 'ref', 'numero', 'n° documento', 'nro documento', 'numero documento', 'no. documento'],
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
    date:        ['fecha', 'date', 'dia'],
    credit:      ['credito', 'creditos', 'abono', 'abonos', 'credit', 'haber'],
    debit:       ['debito', 'debitos', 'cargo', 'cargos', 'debit', 'debe'],
    amount:      ['monto', 'importe', 'amount', 'valor'],
    reference:   ['referencia', 'ref', 'ref.', 'reference', 'numero', 'comprobante', 'n° documento', 'nro documento'],
    description: ['descripcion', 'concepto', 'description', 'detalle', 'observacion'],
    balance:     ['saldo', 'saldos', 'balance'],
  },
  dateFormat: 'DD/MM/YYYY',
  decimalSep: ',',
};

export function findBankProfile(bankCode: string): BankStatementProfile | undefined {
  return BANK_PROFILES.find(p => p.bankCode === bankCode);
}
