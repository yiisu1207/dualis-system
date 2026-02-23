import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { AccountType, MovementType, PaymentCurrency, Customer } from '../../types';
import { scanInvoiceImage } from '../lib/ai-scanner';
import Autocomplete from './Autocomplete';

interface ParsedRow {
  name: string;
  cedula?: string;
  telefono?: string;
}

interface ParsedMovement {
  customerName: string;
  date: string;
  concept: string;
  amount: number;
  accountType: AccountType;
  movementType: MovementType;
  currency: PaymentCurrency | string;
  rate?: number;
  originalAmount?: number;
}

interface DataImporterProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ParsedRow[] | any) => void;
  onImportMovements?: (rows: ParsedMovement[]) => void;
  customers?: Customer[];
  onCreateCustomer?: (c: Customer) => void;
}

const DataImporter: React.FC<DataImporterProps> = ({
  open,
  onClose,
  onImport,
  onImportMovements,
  customers,
  onCreateCustomer,
}) => {
  const [rawCsv, setRawCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [movementPaste, setMovementPaste] = useState('');
  const [movementCustomer, setMovementCustomer] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    id: '',
    cedula: '',
    telefonoCountry: '+58',
    telefono: '',
    direccion: '',
  });
  const [movementAccount, setMovementAccount] = useState<AccountType>(AccountType.BCV);
  const [movementType, setMovementType] = useState<MovementType | 'AUTO'>('AUTO');
  const [movementCurrency, setMovementCurrency] = useState<PaymentCurrency>(PaymentCurrency.USD);
  const [movementRate, setMovementRate] = useState('1');

  if (!open) return null;

  const handleProcess = () => {
    try {
      const lines = rawCsv
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setError('Pega al menos una línea de datos.');
        return;
      }

      // Soportamos encabezado opcional
      const dataLines =
        lines[0].toLowerCase().includes('nombre') && lines[0].includes(',')
          ? lines.slice(1)
          : lines;

      const rows: ParsedRow[] = dataLines.map((line) => {
        const [name = '', cedula = '', telefono = ''] = line.split(',').map((p) => p.trim());
        return { name, cedula, telefono };
      });

      onImport(rows);
      setError(null);
      setRawCsv('');
      onClose();
    } catch (e) {
      console.error(e);
      setError('No se pudo procesar el CSV. Revisa el formato.');
    }
  };

  const handleFile = (f: File | null) => {
    setImage(f);
  };

  const getCellValue = (value: any) => {
    if (value == null) return '';
    if (typeof value === 'object') {
      if (value.text) return value.text;
      if (value.result != null) return value.result;
      if (value.richText) {
        return value.richText.map((part: any) => part.text || '').join('');
      }
    }
    return value;
  };

  const parseAmount = (value: any) => {
    const normalized = getCellValue(value);
    if (value == null) return 0;
    if (typeof normalized === 'number') return Number.isFinite(normalized) ? normalized : 0;
    const raw = String(normalized).trim();
    if (!raw) return 0;
    const isNegative = raw.includes('(') && raw.includes(')');
    const cleaned = raw
      .replace(/[\$\s]/g, '')
      .replace(/\(|\)/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return 0;
    return isNegative ? -Math.abs(parsed) : parsed;
  };

  const normalizeCell = (value: any) => String(getCellValue(value) || '').trim().toUpperCase();

  const parseDateCell = (value: any) => {
    if (!value) return '';
    const normalized = getCellValue(value);
    if (normalized instanceof Date) {
      return normalized.toISOString().split('T')[0];
    }
    const raw = String(normalized).trim();
    const parts = raw.split('/').map((p) => p.trim());
    if (parts.length === 3) {
      const [dd, mm, yy] = parts;
      const year = yy.length === 2 ? `20${yy}` : yy;
      return `${year.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
  };

  const splitPasteLine = (line: string) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (line.includes(',')) return line.split(',').map((c) => c.trim());
    return line.split(/\s{2,}/).map((c) => c.trim());
  };

  const handlePasteImport = () => {
    if (!onImportMovements) {
      setError('No hay un manejador para importar movimientos.');
      return;
    }
    if (!movementCustomer.trim()) {
      setError('Indica el nombre del cliente.');
      return;
    }
    const lines = movementPaste
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (!lines.length) {
      setError('Pega al menos una línea de movimientos.');
      return;
    }

    const rows: ParsedMovement[] = [];
    const rateValue = Number(movementRate) || 1;

    lines.forEach((line) => {
      const cols = splitPasteLine(line);
      if (!cols.length) return;
      if (normalizeCell(cols[0]) === 'FECHA') return;

      const dateValue = cols[0];
      const descValue = cols[1] || '';
      const importeValue = cols[2] || '';
      const pagoValue = cols[3] || '';

      const concept = String(descValue || '').trim();
      const normalizedConcept = normalizeCell(concept);
      const detectedType = normalizedConcept.includes('ABONO')
        ? MovementType.ABONO
        : MovementType.FACTURA;
      const resolvedType = movementType === 'AUTO' ? detectedType : movementType;

      const importe = parseAmount(importeValue);
      const pago = parseAmount(pagoValue);
      const amount = resolvedType === MovementType.ABONO
        ? Math.abs(pago || importe)
        : Math.abs(importe || pago);

      if (!amount || Number.isNaN(amount)) return;
      const parsedDate = parseDateCell(dateValue);
      if (!parsedDate) return;

      rows.push({
        customerName: movementCustomer.trim().toUpperCase(),
        date: parsedDate,
        concept: concept || resolvedType,
        amount,
        accountType: movementAccount,
        movementType: resolvedType,
        currency: movementCurrency,
        rate: rateValue,
        originalAmount: amount,
      });
    });

    if (!rows.length) {
      setError('No se encontraron filas validas en el pegado.');
      return;
    }

    onImportMovements(rows);
    setMovementPaste('');
    setMovementCustomer('');
    setError(null);
    onClose();
  };

  const parseMovementsFromSheet = (rows: any[][]) => {
    const tables = [
      { label: 'TASA BCV', accountType: AccountType.BCV },
      { label: 'TASA GRUPO', accountType: AccountType.GRUPO },
      { label: 'TASA DIVISAS', accountType: AccountType.DIVISA },
    ];

    const movements: ParsedMovement[] = [];

    const findCell = (needle: string) => {
      const target = needle.toUpperCase();
      for (let r = 0; r < rows.length; r += 1) {
        const row = rows[r] || [];
        for (let c = 0; c < row.length; c += 1) {
          const value = normalizeCell(row[c]);
          if (value.includes(target)) return { r, c };
        }
      }
      return null;
    };

    const isHeaderRow = (row: any[]) => {
      const cells = row.map(normalizeCell);
      return cells.includes('FECHA') && cells.includes('DESCRIPCION');
    };

    const findHeaderRow = (startRow: number) => {
      for (let r = startRow; r < Math.min(startRow + 12, rows.length); r += 1) {
        if (isHeaderRow(rows[r] || [])) return r;
      }
      return -1;
    };

    const findCustomerName = (headerRow: number, baseCol: number) => {
      for (let r = headerRow - 1; r >= 0; r -= 1) {
        const value = normalizeCell(rows[r]?.[baseCol]);
        if (!value) continue;
        if (value.includes('COMPANIA') || value.includes('COMPANIA/CLIENTE')) continue;
        if (value.includes('TASA')) continue;
        return String(rows[r]?.[baseCol]).trim();
      }
      return '';
    };

    tables.forEach((table) => {
      const tagCell = findCell(table.label);
      if (!tagCell) return;

      const headerRow = findHeaderRow(tagCell.r);
      if (headerRow === -1) return;

      const header = rows[headerRow] || [];
      const fechaCol = header.findIndex((cell) => normalizeCell(cell) === 'FECHA');
      const descCol = header.findIndex((cell) => normalizeCell(cell) === 'DESCRIPCION');
      const importeCol = header.findIndex((cell) => normalizeCell(cell).includes('IMPORTE'));
      const pagoCol = header.findIndex((cell) => normalizeCell(cell) === 'PAGO');

      if (fechaCol === -1 || descCol === -1) return;

      const customerName = findCustomerName(headerRow, fechaCol);
      if (!customerName) return;

      let emptyStreak = 0;
      for (let r = headerRow + 1; r < rows.length; r += 1) {
        const row = rows[r] || [];
        const dateValue = row[fechaCol];
        const descValue = row[descCol];
        const importeValue = importeCol >= 0 ? row[importeCol] : '';
        const pagoValue = pagoCol >= 0 ? row[pagoCol] : '';

        if (!dateValue && !descValue && !importeValue && !pagoValue) {
          emptyStreak += 1;
          if (emptyStreak >= 2) break;
          continue;
        }
        emptyStreak = 0;

        const concept = String(getCellValue(descValue) || '').trim();
        const normalizedConcept = normalizeCell(concept);
        const movementType = normalizedConcept.includes('ABONO')
          ? MovementType.ABONO
          : MovementType.FACTURA;

        const importe = parseAmount(importeValue);
        const pago = parseAmount(pagoValue);
        const amount = movementType === MovementType.ABONO
          ? Math.abs(pago || importe)
          : Math.abs(importe || pago);

        if (!amount || Number.isNaN(amount)) continue;

        const parsedDate = parseDateCell(dateValue);
        if (!parsedDate) continue;

        movements.push({
          customerName: customerName.toUpperCase(),
          date: parsedDate,
          concept: concept || movementType,
          amount,
          accountType: table.accountType,
          movementType,
          currency: PaymentCurrency.USD,
          rate: 1,
          originalAmount: amount,
        });
      }
    });

    return movements;
  };

  const handleExcelFile = (f: File | null) => {
    setExcelFile(f);
  };

  const handleExcelImport = async () => {
    if (!excelFile) {
      setError('Selecciona un archivo Excel primero.');
      return;
    }
    if (!onImportMovements) {
      setError('No hay un manejador para importar movimientos.');
      return;
    }
    setExcelLoading(true);
    setError(null);
    try {
      const buffer = await excelFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const sheet =
        workbook.worksheets.find((ws) =>
          normalizeCell(ws.name).includes('MOVIMIENTOS CUENTAS')
        ) || workbook.worksheets[0];

      if (!sheet) throw new Error('No se encontro la hoja de movimientos.');

      const rows: any[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        rows.push(values);
      });
      const movements = parseMovementsFromSheet(rows);

      if (!movements.length) {
        throw new Error('No se encontraron movimientos en la hoja.');
      }

      onImportMovements(movements);
      setExcelFile(null);
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'No se pudo procesar el Excel.');
    } finally {
      setExcelLoading(false);
    }
  };

  const handleOCR = async () => {
    if (!image) return setError('Selecciona una imagen primero');
    setOcrLoading(true);
    setError(null);
    try {
      const result = await scanInvoiceImage(image, 'CUSTOMER');

      if (!result) throw new Error('No se pudieron extraer datos de la imagen.');

      const invoice: any = {
        ...result,
        source: 'AI_SCAN',
        raw: JSON.stringify(result),
      };

      onImport(invoice);
      setImage(null);
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Error en OCR con IA.');
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-xl app-panel overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Importar Clientes / Movimientos</h2>
            <p className="text-xs text-slate-500">
              Pega CSV, pega movimientos, sube Excel o usa OCR.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <textarea
            value={rawCsv}
            onChange={(e) => setRawCsv(e.target.value)}
            rows={6}
            className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-900 p-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]/40"
            placeholder={`Nombre, Cédula, Teléfono\nJuan Pérez, V-12345678, 0412-1234567`}
          />

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Pegar movimientos (clientes)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div className="md:col-span-2">
                <Autocomplete
                  items={customers || []}
                  stringify={(c: Customer) => c.id}
                  secondary={(c: Customer) =>
                    [c.cedula, c.telefono].filter((value) => value && value !== 'N/A').join(' | ')
                  }
                  placeholder="Cliente (buscar o crear)"
                  value={movementCustomer}
                  onChange={setMovementCustomer}
                  onSelect={(c: Customer) => setMovementCustomer(c.id)}
                  onCreate={(name) => {
                    setCreatingCustomer(true);
                    setNewCustomer((prev) => ({ ...prev, id: name }));
                    setMovementCustomer(name.toUpperCase());
                  }}
                />
              </div>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as MovementType | 'AUTO')}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value="AUTO">Auto</option>
                <option value={MovementType.FACTURA}>Factura</option>
                <option value={MovementType.ABONO}>Abono</option>
              </select>
              <select
                value={movementAccount}
                onChange={(e) => setMovementAccount(e.target.value as AccountType)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value={AccountType.BCV}>BCV</option>
                <option value={AccountType.GRUPO}>Grupo</option>
                <option value={AccountType.DIVISA}>Divisa</option>
              </select>
              <select
                value={movementCurrency}
                onChange={(e) => setMovementCurrency(e.target.value as PaymentCurrency)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value={PaymentCurrency.USD}>USD</option>
                <option value={PaymentCurrency.BS}>BS</option>
              </select>
            </div>
            {creatingCustomer && (
              <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <input
                    className="w-full p-2 bg-white border border-slate-200 rounded text-xs font-bold"
                    value={newCustomer.id}
                    onChange={(e) => setNewCustomer({ ...newCustomer, id: e.target.value })}
                    placeholder="Nombre del cliente"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="col-span-1 p-2 rounded border border-slate-200 text-xs font-bold"
                      value={newCustomer.telefonoCountry}
                      onChange={(e) =>
                        setNewCustomer({ ...newCustomer, telefonoCountry: e.target.value })
                      }
                    >
                      <option value="+58">+58</option>
                      <option value="+1">+1</option>
                      <option value="+52">+52</option>
                    </select>
                    <input
                      className="col-span-2 p-2 rounded border border-slate-200 text-xs font-bold"
                      placeholder="Telefono"
                      value={newCustomer.telefono}
                      onChange={(e) => setNewCustomer({ ...newCustomer, telefono: e.target.value })}
                    />
                  </div>
                  <input
                    className="w-full p-2 rounded border border-slate-200 text-xs font-bold"
                    placeholder="Cedula / RIF"
                    value={newCustomer.cedula}
                    onChange={(e) => setNewCustomer({ ...newCustomer, cedula: e.target.value })}
                  />
                  <input
                    className="w-full p-2 rounded border border-slate-200 text-xs font-bold"
                    placeholder="Direccion"
                    value={newCustomer.direccion}
                    onChange={(e) => setNewCustomer({ ...newCustomer, direccion: e.target.value })}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingCustomer(false);
                        setNewCustomer({
                          id: '',
                          cedula: '',
                          telefonoCountry: '+58',
                          telefono: '',
                          direccion: '',
                        });
                      }}
                      className="px-3 py-1 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newCustomer.id) return;
                        const payload: Customer = {
                          id: newCustomer.id.toUpperCase(),
                          cedula: newCustomer.cedula || 'N/A',
                          telefono:
                            (newCustomer.telefonoCountry || '') + (newCustomer.telefono || ''),
                          direccion: newCustomer.direccion || '',
                        };
                        if (typeof onCreateCustomer === 'function') onCreateCustomer(payload);
                        setMovementCustomer(payload.id);
                        setCreatingCustomer(false);
                        setNewCustomer({
                          id: '',
                          cedula: '',
                          telefonoCountry: '+58',
                          telefono: '',
                          direccion: '',
                        });
                      }}
                      className="px-3 py-1 bg-emerald-600 text-white rounded text-xs"
                    >
                      Crear y Seleccionar
                    </button>
                  </div>
                </div>
              </div>
            )}
            <input
              value={movementRate}
              onChange={(e) => setMovementRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 mb-3"
              placeholder="Tasa (solo si moneda es BS)"
            />
            <textarea
              value={movementPaste}
              onChange={(e) => setMovementPaste(e.target.value)}
              rows={6}
              className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 p-3 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]/40"
              placeholder={`Fecha\tDescripcion\tImporte total\tPago\tSaldo adeudado\n01/02/25\tFACTURA\t473,50\t\t473,50`}
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Copia desde Excel y pega aqui. En "Auto" se detecta por la descripcion.
            </p>
          </div>

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Subir imagen (factura / abono)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
            {image && <p className="text-xs text-slate-500 mt-2">Imagen seleccionada: {image.name}</p>}
          </div>

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Subir Excel (movimientos clientes)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleExcelFile(e.target.files?.[0] || null)}
            />
            {excelFile && (
              <p className="text-xs text-slate-500 mt-2">
                Excel seleccionado: {excelFile.name}
              </p>
            )}
            <p className="text-[11px] text-slate-500 mt-2">
              La hoja debe llamarse "MOVIMIENTOS CUENTAS" y contener las tablas BCV, GRUPO y
              DIVISAS.
            </p>
          </div>

          {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}

          <p className="text-[11px] text-slate-500">
            Estos datos se procesaran en memoria y se enviaran a Firebase desde el sistema principal.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50/60">
          <button onClick={onClose} className="px-4 py-2 text-[10px] app-btn app-btn-ghost">
            Cancelar
          </button>
          <button onClick={handleProcess} className="px-4 py-2 text-[10px] app-btn app-btn-primary">
            Procesar CSV
          </button>
          <button
            onClick={handlePasteImport}
            className="px-4 py-2 text-[10px] app-btn app-btn-primary"
          >
            Procesar Pegado
          </button>
          <button
            onClick={handleExcelImport}
            disabled={excelLoading}
            className="px-4 py-2 text-[10px] app-btn app-btn-primary"
          >
            {excelLoading ? 'Importando...' : 'Procesar Excel'}
          </button>
          <button
            onClick={handleOCR}
            disabled={ocrLoading}
            className="px-4 py-2 text-[10px] app-btn app-btn-primary"
          >
            {ocrLoading ? 'Analizando...' : 'Analizar Imagen (OCR)'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataImporter;
