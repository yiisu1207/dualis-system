import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import {
  BadgeDollarSign,
  Barcode,
  Package,
  Pencil,
  Search,
  Trash2,
  Plus,
  TrendingUp,
  AlertTriangle,
  History,
  FileSpreadsheet,
  Settings2,
  X,
  User,
  Tags,
  Download,
  Upload,
  Printer,
  CheckSquare,
  Square,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Shuffle,
  Eye,
  Loader2,
  FileText,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
  Tag,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  proveedor: string;
  categoria: string;
  ubicacion: string;
  costoUSD: number;
  precioDetal: number;
  precioMayor: number;
  stock: number;
  stockMinimo: number;
  iva: number;
  ivaTipo: 'GENERAL' | 'REDUCIDO' | 'EXENTO';
  unidad: string;
  peso: number;
  descripcion: string;
};

type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  type: 'VENTA' | 'COMPRA' | 'AJUSTE' | 'MERMA';
  quantity: number;
  reason: string;
  userName: string;
  createdAt: any;
};

type TabType = 'catalog' | 'kardex' | 'tools';

const initialProduct: Omit<Product, 'id'> = {
  codigo: '',
  nombre: '',
  marca: '',
  proveedor: '',
  categoria: 'General',
  ubicacion: '',
  costoUSD: 0,
  precioDetal: 0,
  precioMayor: 0,
  stock: 0,
  stockMinimo: 5,
  iva: 16,
  ivaTipo: 'GENERAL',
  unidad: 'UND',
  peso: 0,
  descripcion: '',
};

// ─── IMPORT AUTO-DETECTION ────────────────────────────────────────────────────
const FIELD_ALIASES: Record<keyof Omit<Product, 'id' | 'ivaTipo'>, string[]> = {
  codigo:       ['código','codigo','code','sku','barcode','cod','upc','ean','referencia','ref'],
  nombre:       ['nombre','name','producto','descripción','descripcion','description','item','artículo','articulo','denominacion'],
  categoria:    ['categoría','categoria','category','grupo','tipo','type','familia','rubro'],
  marca:        ['marca','brand','fabricante','manufacturer','maker'],
  proveedor:    ['proveedor','supplier','vendor','distribuidor','suplidor','proveedor principal'],
  ubicacion:    ['ubicación','ubicacion','location','pasillo','almacen','deposito','bodega','shelf'],
  costoUSD:     ['costo','cost','precio_costo','costousd','precio base','base price','costo usd','costo $','precio compra'],
  precioDetal:  ['detal','retail','precio_detal','precio detal','venta','sale price','pvp','precio venta','precio minorista','minorista'],
  precioMayor:  ['mayor','wholesale','precio_mayor','precio mayor','wholesale price','precio mayorista','mayorista'],
  stock:        ['stock','cantidad','quantity','existencia','inventario','qty','disponible','unidades'],
  stockMinimo:  ['mínimo','minimo','minimum','stock_minimo','stock minimo','min stock','alerta','stock alerta'],
  iva:          ['iva','tax','impuesto','vat','tasa iva','%iva'],
  unidad:       ['unidad','unit','um','measure','unidad medida','u/m'],
  peso:         ['peso','weight','kg','gramos'],
  descripcion:  ['descripcion','descripción','detalle','notes','notas','obs','observaciones'],
};

function scoreMatch(header: string, aliases: string[]): number {
  const h = header.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
  let best = 0;
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    if (h === a) return 100;
    if (h.startsWith(a) || a.startsWith(h)) { best = Math.max(best, 85); continue; }
    if (h.includes(a) || a.includes(h)) { best = Math.max(best, 70); continue; }
    const words = h.split(' ');
    if (words.some(w => a.includes(w) && w.length > 2)) best = Math.max(best, 50);
  }
  return best;
}

function autoDetectMapping(headers: string[]): Record<string, { field: string; confidence: number } | null> {
  const result: Record<string, { field: string; confidence: number } | null> = {};
  const usedFields = new Set<string>();

  const candidates: { header: string; field: string; score: number }[] = [];
  for (const header of headers) {
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      const score = scoreMatch(header, aliases);
      if (score >= 50) candidates.push({ header, field, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const header of headers) result[header] = null;
  for (const { header, field, score } of candidates) {
    if (!usedFields.has(field) && result[header] === null) {
      result[header] = { field, confidence: score };
      usedFields.add(field);
    }
  }
  return result;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
const KPICard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-6 hover:shadow-2xl transition-all flex-1 min-w-[280px] group">
    <div className={`h-14 w-14 rounded-3xl flex items-center justify-center transition-transform group-hover:scale-110 ${colorClass}`}>
      <Icon size={28} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{subtext}</p>}
    </div>
  </div>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Inventario() {
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const tenantId = userProfile?.businessId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog states
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialProduct);

  // Stock adjustment states
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjData, setAdjData] = useState({ type: 'AJUSTE', quantity: 0, reason: '' });

  // ── EXPORT states ──────────────────────────────────────────────────────────
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpts, setExportOpts] = useState({
    margins: true, priceBS: true, filter: 'all' as 'all' | 'low_stock',
  });

  // ── IMPORT states ──────────────────────────────────────────────────────────
  const [importModal, setImportModal] = useState(false);
  const [importStep, setImportStep] = useState(0); // 0=upload 1=map 2=preview 3=result
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [detectedMap, setDetectedMap] = useState<Record<string, { field: string; confidence: number } | null>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<'flexible' | 'strict'>('flexible');
  const [dupMode, setDupMode] = useState<'skip' | 'overwrite'>('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; skip: number; errors: string[] }>({ ok: 0, skip: 0, errors: [] });
  const [importDragOver, setImportDragOver] = useState(false);

  // ── BARCODE states ─────────────────────────────────────────────────────────
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [barSelected, setBarSelected] = useState<Set<string>>(new Set());
  const [barOpts, setBarOpts] = useState({
    labelW: 63, labelH: 38, cols: 3,
    showName: true, showPrice: true, showBrand: false, showSku: true,
    priceType: 'detal' as 'detal' | 'mayor' | 'both',
    copies: 1,
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // 1. DATA LISTENERS
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const qProd = query(collection(db, `businesses/${tenantId}/products`));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    const qMov = query(collection(db, `businesses/${tenantId}/stock_movements`), orderBy('createdAt', 'desc'), limit(50));
    const unsubMov = onSnapshot(qMov, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockMovement)));
    });
    return () => { unsubProd(); unsubMov(); };
  }, [tenantId]);

  // 2. METRICS
  const metrics = useMemo(() => {
    const totalCapital = products.reduce((acc, p) => acc + (p.costoUSD * p.stock), 0);
    const lowStockCount = products.filter(p => p.stock < p.stockMinimo).length;
    const catMap: Record<string, number> = {};
    products.forEach(p => catMap[p.categoria] = (catMap[p.categoria] || 0) + (p.costoUSD * p.stock));
    const chartData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    return { totalCapital, lowStockCount, totalItems: products.reduce((acc, p) => acc + p.stock, 0), chartData };
  }, [products]);

  // 3. PRODUCT HANDLERS
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const payload = { ...form, updatedAt: new Date().toISOString() };
    if (editingId) {
      await setDoc(doc(db, `businesses/${tenantId}/products`, editingId), payload, { merge: true });
    } else {
      await addDoc(collection(db, `businesses/${tenantId}/products`), payload);
    }
    setModalOpen(false);
    setForm(initialProduct);
    setEditingId(null);
  };

  const handleAdjustStock = async () => {
    if (!tenantId || !selectedProduct) return;
    const newStock = selectedProduct.stock + Number(adjData.quantity);
    await setDoc(doc(db, `businesses/${tenantId}/products`, selectedProduct.id), { stock: newStock }, { merge: true });
    await addDoc(collection(db, `businesses/${tenantId}/stock_movements`), {
      productId: selectedProduct.id,
      productName: selectedProduct.nombre,
      type: adjData.type,
      quantity: Number(adjData.quantity),
      reason: adjData.reason,
      userName: userProfile?.fullName || 'Admin',
      createdAt: serverTimestamp()
    });
    setAdjModalOpen(false);
    setSelectedProduct(null);
    setAdjData({ type: 'AJUSTE', quantity: 0, reason: '' });
  };

  // 4. EXPORT HANDLER
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Inventario');
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const cols: any[] = [
        { header: 'Código SKU', key: 'codigo', width: 20 },
        { header: 'Producto', key: 'nombre', width: 38 },
        { header: 'Categoría', key: 'categoria', width: 20 },
        { header: 'Marca', key: 'marca', width: 18 },
        { header: 'Proveedor', key: 'proveedor', width: 25 },
        { header: 'Ubicación', key: 'ubicacion', width: 20 },
        { header: 'Costo USD', key: 'costoUSD', width: 14, style: { numFmt: '"$"#,##0.00' } },
        { header: 'Precio Detal', key: 'precioDetal', width: 14, style: { numFmt: '"$"#,##0.00' } },
        ...(exportOpts.margins ? [{ header: 'Margen Detal %', key: 'margenDetal', width: 14 }] : []),
        { header: 'Precio Mayor', key: 'precioMayor', width: 14, style: { numFmt: '"$"#,##0.00' } },
        ...(exportOpts.margins ? [{ header: 'Margen Mayor %', key: 'margenMayor', width: 14 }] : []),
        ...(exportOpts.priceBS ? [
          { header: `Detal BS (BCV ${rates.tasaBCV.toFixed(2)})`, key: 'detalBS', width: 20 },
          { header: `Mayor BS (BCV ${rates.tasaBCV.toFixed(2)})`, key: 'mayorBS', width: 20 },
        ] : []),
        { header: 'IVA %', key: 'iva', width: 10 },
        { header: 'Tipo IVA', key: 'ivaTipo', width: 14 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Stock Mínimo', key: 'stockMinimo', width: 14 },
        { header: 'Unidad', key: 'unidad', width: 12 },
        { header: 'Estado', key: 'estado', width: 15 },
      ];
      ws.columns = cols;

      const hRow = ws.getRow(1);
      hRow.height = 28;
      hRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } } as any;
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF4338CA' } } } as any;
      });

      const list = exportOpts.filter === 'low_stock' ? products.filter(p => p.stock < p.stockMinimo) : products;
      list.forEach((p, idx) => {
        const isAlert = p.stock < p.stockMinimo;
        const mD = p.costoUSD > 0 ? `${(((p.precioDetal - p.costoUSD) / p.costoUSD) * 100).toFixed(1)}%` : '0%';
        const mM = p.costoUSD > 0 ? `${(((p.precioMayor - p.costoUSD) / p.costoUSD) * 100).toFixed(1)}%` : '0%';
        const row: any = {
          codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, marca: p.marca,
          proveedor: p.proveedor, ubicacion: p.ubicacion, costoUSD: p.costoUSD,
          precioDetal: p.precioDetal, precioMayor: p.precioMayor, iva: p.iva, ivaTipo: p.ivaTipo,
          stock: p.stock, stockMinimo: p.stockMinimo, unidad: p.unidad,
          estado: isAlert ? '⚠ ALERTA' : '✓ NORMAL',
        };
        if (exportOpts.margins) { row.margenDetal = mD; row.margenMayor = mM; }
        if (exportOpts.priceBS) {
          row.detalBS = (p.precioDetal * rates.tasaBCV).toFixed(2);
          row.mayorBS = (p.precioMayor * rates.tasaBCV).toFixed(2);
        }
        const r = ws.addRow(row);
        r.height = 22;
        r.eachCell(cell => {
          cell.alignment = { vertical: 'middle' };
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' }
          } as any;
        });
        if (isAlert) {
          r.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } } as any;
          r.getCell('estado').font = { color: { argb: 'FFDC2626' }, bold: true, size: 10 };
        }
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `inventario_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
      setExportModal(false);
    } catch (e) { console.error('Export error:', e); }
    finally { setExporting(false); }
  };

  // 5. IMPORT HANDLER
  const handleFileLoad = async (file: File) => {
    try {
      let rows: string[][] = [];
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text();
        rows = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        ws.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            cells.push(String(cell.value ?? ''));
          });
          rows.push(cells);
        });
      } else {
        alert('Formato no soportado. Usa CSV o Excel (.xlsx/.xls)');
        return;
      }
      if (rows.length < 2) { alert('El archivo está vacío o no tiene datos.'); return; }
      const headers = rows[0];
      const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));
      setImportHeaders(headers);
      setImportRows(dataRows);
      const detected = autoDetectMapping(headers);
      setDetectedMap(detected);
      const initial: Record<string, string> = {};
      headers.forEach(h => { if (detected[h]) initial[h] = detected[h]!.field; });
      setUserMap(initial);
      setImportStep(1);
    } catch (e) {
      console.error('Parse error:', e);
      alert('Error al leer el archivo. Verifica que no esté dañado.');
    }
  };

  const handleImport = async () => {
    if (!tenantId) return;
    setImporting(true);
    const result = { ok: 0, skip: 0, errors: [] as string[] };
    const reverseMap: Record<string, number> = {};
    importHeaders.forEach((h, i) => { if (userMap[h]) reverseMap[userMap[h]] = i; });

    const requiredFields = importMode === 'strict' ? ['codigo', 'nombre', 'costoUSD', 'stock'] : ['nombre'];

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      const missing = requiredFields.filter(f => {
        const idx = reverseMap[f];
        return idx === undefined || !row[idx]?.trim();
      });
      if (missing.length > 0) {
        result.skip++;
        if (result.errors.length < 10) result.errors.push(`Fila ${i + 2}: Faltan campos requeridos (${missing.join(', ')})`);
        continue;
      }
      const get = (field: string, fallback: any = '') => {
        const idx = reverseMap[field];
        return idx !== undefined ? row[idx]?.trim() ?? fallback : fallback;
      };
      const num = (field: string, fb = 0) => {
        const v = get(field, '');
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? fb : n;
      };

      const codigo = get('codigo', `PROD-${Date.now()}-${i}`).toUpperCase();
      const existing = dupMode === 'skip' ? products.find(p => p.codigo === codigo) : null;
      if (existing) { result.skip++; continue; }

      const ivaTipoRaw = get('ivaTipo', '').toLowerCase();
      const ivaTipo: Product['ivaTipo'] = ivaTipoRaw.includes('exento') || ivaTipoRaw === '0' ? 'EXENTO'
        : ivaTipoRaw.includes('reducido') || ivaTipoRaw === '8' ? 'REDUCIDO' : 'GENERAL';

      const payload: Omit<Product, 'id'> = {
        codigo,
        nombre: get('nombre', 'Producto Importado'),
        categoria: get('categoria', 'General'),
        marca: get('marca', ''),
        proveedor: get('proveedor', ''),
        ubicacion: get('ubicacion', ''),
        costoUSD: num('costoUSD'),
        precioDetal: num('precioDetal'),
        precioMayor: num('precioMayor'),
        stock: num('stock'),
        stockMinimo: num('stockMinimo', 5),
        iva: num('iva', 16),
        ivaTipo,
        unidad: get('unidad', 'UND') || 'UND',
        peso: num('peso'),
        descripcion: get('descripcion', ''),
      };

      try {
        if (dupMode === 'overwrite') {
          const match = products.find(p => p.codigo === codigo);
          if (match) {
            await setDoc(doc(db, `businesses/${tenantId}/products`, match.id), { ...payload, updatedAt: new Date().toISOString() }, { merge: true });
          } else {
            await addDoc(collection(db, `businesses/${tenantId}/products`), { ...payload, createdAt: new Date().toISOString() });
          }
        } else {
          await addDoc(collection(db, `businesses/${tenantId}/products`), { ...payload, createdAt: new Date().toISOString() });
        }
        result.ok++;
      } catch (e: any) {
        result.errors.push(`Fila ${i + 2}: ${e.message}`);
      }
    }
    setImportResult(result);
    setImporting(false);
    setImportStep(3);
  };

  const resetImport = () => {
    setImportStep(0); setImportHeaders([]); setImportRows([]);
    setDetectedMap({}); setUserMap({}); setImportResult({ ok: 0, skip: 0, errors: [] });
  };

  // 6. BARCODE / PDF HANDLER
  const handleGenerateBarcodes = async () => {
    const list = products.filter(p => barSelected.has(p.id));
    if (list.length === 0) return;
    setGeneratingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const JsBarcode = (await import('jsbarcode')).default;

      const { labelW, labelH, cols, showName, showPrice, showBrand, showSku, priceType, copies } = barOpts;
      const pageW = 210, pageH = 297;
      const margin = 8, gap = 2;
      const totalPerRow = cols;
      const rowsPerPage = Math.floor((pageH - 2 * margin + gap) / (labelH + gap));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const allItems = list.flatMap(p => Array(copies).fill(p));
      let col = 0, row = 0, pageItems = 0;
      const totalPerPage = totalPerRow * rowsPerPage;

      for (let idx = 0; idx < allItems.length; idx++) {
        const p: Product = allItems[idx];
        if (idx > 0 && pageItems >= totalPerPage) {
          pdf.addPage(); col = 0; row = 0; pageItems = 0;
        }

        const x = margin + col * (labelW + gap);
        const y = margin + row * (labelH + gap);

        // Draw border
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.2);
        pdf.roundedRect(x, y, labelW, labelH, 1.5, 1.5, 'S');

        let curY = y + 2.5;
        const codeStr = p.codigo?.trim() || 'NO-CODE';

        // Barcode
        try {
          const canvas = document.createElement('canvas');
          JsBarcode(canvas, codeStr, {
            format: 'CODE128', width: 1.5, height: 28,
            displayValue: false, margin: 2, background: '#ffffff',
          });
          const barH = labelH * 0.40;
          const barW = labelW - 6;
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x + 3, curY, barW, barH);
          curY += barH + 1;
        } catch { /* skip barcode if code is invalid */ }

        // SKU text
        if (showSku) {
          pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(80, 80, 80);
          pdf.text(codeStr, x + labelW / 2, curY + 2.5, { align: 'center' });
          curY += 4.5;
        }

        // Product name
        if (showName) {
          pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(20, 20, 20);
          const lines = pdf.splitTextToSize(p.nombre, labelW - 4).slice(0, 2);
          pdf.text(lines, x + 2, curY + 2);
          curY += lines.length * 2.8 + 1;
        }

        // Brand
        if (showBrand && p.marca) {
          pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120);
          pdf.text(p.marca, x + 2, curY + 1.5);
          curY += 3;
        }

        // Price
        if (showPrice) {
          const priceY = y + labelH - 3.5;
          pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
          if (priceType === 'detal' || priceType === 'both') {
            pdf.text(`$${p.precioDetal.toFixed(2)}`, x + 2.5, priceY);
          }
          if (priceType === 'mayor' || priceType === 'both') {
            pdf.setFontSize(7); pdf.setTextColor(80, 80, 80);
            pdf.text(`M: $${p.precioMayor.toFixed(2)}`, x + labelW - 2.5, priceY, { align: 'right' });
          }
        }

        col++; pageItems++;
        if (col >= totalPerRow) { col = 0; row++; }
      }

      pdf.save(`etiquetas_${new Date().toISOString().split('T')[0]}.pdf`);
      setBarcodeModal(false);
    } catch (e) { console.error('PDF error:', e); }
    finally { setGeneratingPdf(false); }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  const FIELD_LABELS_DISPLAY: Record<string, string> = {
    codigo: 'Código SKU', nombre: 'Nombre', categoria: 'Categoría', marca: 'Marca',
    proveedor: 'Proveedor', ubicacion: 'Ubicación', costoUSD: 'Costo USD',
    precioDetal: 'Precio Detal', precioMayor: 'Precio Mayor', stock: 'Stock',
    stockMinimo: 'Stock Mínimo', iva: 'IVA %', unidad: 'Unidad',
    peso: 'Peso (KG)', descripcion: 'Descripción',
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 pt-24 pb-32 font-inter">
      <div className="max-w-7xl mx-auto space-y-10">

        {/* DASHBOARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <KPICard title="Capital en Stock" value={`$${metrics.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} subtext={`${metrics.totalItems} unidades en bodega`} icon={BadgeDollarSign} colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100" />
          <KPICard title="Alertas Críticas" value={metrics.lowStockCount} subtext="Revisiones de stock urgentes" icon={AlertTriangle} colorClass="bg-rose-50 text-rose-600 shadow-rose-100" />
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col group h-full min-h-[160px]">
            <div className="flex justify-between items-center mb-4 px-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Inversión por Rama</p>
              <TrendingUp size={16} className="text-slate-300" />
            </div>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData}>
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {metrics.chartData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#0f172a' : '#cbd5e1'} />)}
                  </Bar>
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* NAV */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex gap-2 p-2 bg-white border border-slate-200 rounded-[2rem] shadow-sm">
            {[
              { id: 'catalog', label: 'Catálogo Maestro', icon: Package },
              { id: 'kardex', label: 'Kardex / Auditoría', icon: History },
              { id: 'tools', label: 'Herramientas', icon: Settings2 },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-3 px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>
          <button onClick={() => { setEditingId(null); setForm(initialProduct); setModalOpen(true); }}
            className="flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95">
            <Plus size={18} /> Registrar Mercancía
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl shadow-slate-200/50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* TAB 1: CATALOG */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col h-full">
              <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="relative w-full md:w-[450px]">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 h-5 w-5" />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por código, nombre o categoría..."
                    className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" />
                </div>
                <div className="flex gap-4">
                  <div className="px-6 py-3 bg-slate-900 rounded-2xl text-white flex items-center gap-3 shadow-lg">
                    <Tags size={16} className="text-slate-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{rates.tasaBCV.toFixed(2)} BS / USD</span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-10 py-8">Producto / SKU</th>
                      <th className="px-10 py-8">Categoría</th>
                      <th className="px-10 py-8 text-right">Costo Base</th>
                      <th className="px-10 py-8 text-right">Precio Detal</th>
                      <th className="px-10 py-8 text-right">Precio Mayor</th>
                      <th className="px-10 py-8 text-center">Stock Real</th>
                      <th className="px-10 py-8 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.filter(p =>
                      (p.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (p.codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (p.categoria || '').toLowerCase().includes(searchTerm.toLowerCase())
                    ).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all">
                              <Package size={24} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 tracking-tight">{p.nombre}</p>
                              <p className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg w-fit mt-1.5 border border-slate-100">{p.codigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <span className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200">{p.categoria}</span>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <p className="text-sm font-black">${p.costoUSD.toFixed(2)}</p>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <p className="text-sm font-black text-emerald-600">${p.precioDetal.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-300 uppercase tracking-widest">Bs {(p.precioDetal * rates.tasaBCV).toFixed(2)}</p>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <p className="text-sm font-black text-violet-600">${p.precioMayor.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-300 uppercase tracking-widest">Bs {(p.precioMayor * rates.tasaBCV).toFixed(2)}</p>
                        </td>
                        <td className="px-10 py-8 text-center">
                          <div className={`inline-flex flex-col items-center px-6 py-3 rounded-2xl border ${p.stock < p.stockMinimo ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-lg font-black ${p.stock < p.stockMinimo ? 'text-rose-600' : 'text-slate-900'}`}>{p.stock}</span>
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">UNIDADES</span>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            <button onClick={() => { setSelectedProduct(p); setAdjModalOpen(true); }} className="p-3 rounded-2xl bg-slate-900 text-white hover:bg-emerald-500 transition-all shadow-xl shadow-slate-200" title="Ajuste de Stock"><TrendingUp size={16} /></button>
                            <button onClick={() => { setEditingId(p.id); setForm(p); setModalOpen(true); }} className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-all"><Pencil size={16} /></button>
                            <button onClick={async () => { if (confirm('¿Eliminar producto?')) await deleteDoc(doc(db, `businesses/${tenantId}/products`, p.id)); }} className="p-3 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.length === 0 && !loading && (
                  <div className="py-24 text-center text-slate-400 font-semibold">Sin productos registrados</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: KARDEX */}
          {activeTab === 'kardex' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-8">Fecha / Hora</th>
                    <th className="px-10 py-8">Producto</th>
                    <th className="px-10 py-8">Operación</th>
                    <th className="px-10 py-8 text-center">Cant.</th>
                    <th className="px-10 py-8">Notas</th>
                    <th className="px-10 py-8">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="text-xs font-bold text-slate-600 hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-8 text-slate-400 font-mono">
                        {m.createdAt instanceof Timestamp ? m.createdAt.toDate().toLocaleString() : 'Reciente'}
                      </td>
                      <td className="px-10 py-8 text-slate-900 font-black">{m.productName}</td>
                      <td className="px-10 py-8">
                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${m.type === 'VENTA' ? 'bg-amber-50 text-amber-600 border-amber-100' : m.type === 'COMPRA' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{m.type}</span>
                      </td>
                      <td className={`px-10 py-8 text-center font-black text-base ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-10 py-8 italic text-slate-400 font-medium">{m.reason || 'Sincronización automática'}</td>
                      <td className="px-10 py-8 text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 shadow-inner"><User size={14} /></div>
                          <span className="uppercase tracking-tighter font-black text-[10px]">{m.userName}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: TOOLS */}
          {activeTab === 'tools' && (
            <div className="p-10 space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4 pb-2">
                <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center"><Settings2 size={18} /></div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Herramientas de Inventario</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Importación masiva · Exportación · Etiquetas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* EXPORT */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-[2.5rem] p-8 flex flex-col gap-6 hover:shadow-xl hover:shadow-emerald-100 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-14 w-14 rounded-[1.5rem] bg-white shadow-lg flex items-center justify-center group-hover:rotate-6 transition-transform">
                      <Download className="text-emerald-600" size={26} />
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest">{products.length} productos</span>
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Exportar Excel</h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">Stock consolidado con precios, márgenes y equivalencias en Bs al tipo BCV actual.</p>
                  </div>
                  <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-500">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={exportOpts.margins} onChange={e => setExportOpts(p => ({ ...p, margins: e.target.checked }))} className="rounded" />
                      Incluir columnas de márgenes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={exportOpts.priceBS} onChange={e => setExportOpts(p => ({ ...p, priceBS: e.target.checked }))} className="rounded" />
                      Incluir precios en Bolívares
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span>Filtrar:</span>
                      <select value={exportOpts.filter} onChange={e => setExportOpts(p => ({ ...p, filter: e.target.value as any }))}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold">
                        <option value="all">Todo el inventario</option>
                        <option value="low_stock">Solo alertas de stock</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={handleExportExcel} disabled={exporting}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-200">
                    {exporting ? <><Loader2 className="animate-spin" size={16} /> Generando...</> : <><FileSpreadsheet size={16} /> Descargar Excel</>}
                  </button>
                </div>

                {/* IMPORT */}
                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-[2.5rem] p-8 flex flex-col gap-6 hover:shadow-xl hover:shadow-indigo-100 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-14 w-14 rounded-[1.5rem] bg-white shadow-lg flex items-center justify-center group-hover:-rotate-6 transition-transform">
                      <Upload className="text-indigo-600" size={26} />
                    </div>
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase tracking-widest">CSV · XLSX</span>
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Importar Carga</h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">Detección automática de columnas. Mapeo inteligente con cualquier formato de archivo.</p>
                  </div>
                  <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-500">
                    <div className="flex items-center gap-2 p-3 bg-white/60 rounded-xl">
                      <Shuffle size={12} className="text-indigo-400" />
                      <span>Auto-detección de campos por nombre</span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/60 rounded-xl">
                      <Eye size={12} className="text-indigo-400" />
                      <span>Vista previa antes de importar</span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/60 rounded-xl">
                      <SlidersHorizontal size={12} className="text-indigo-400" />
                      <span>Modo estricto o flexible</span>
                    </div>
                  </div>
                  <button onClick={() => { resetImport(); setImportModal(true); }}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200">
                    <Upload size={16} /> Abrir Importador
                  </button>
                </div>

                {/* BARCODE */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-[2.5rem] p-8 flex flex-col gap-6 hover:shadow-xl hover:shadow-slate-200 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-14 w-14 rounded-[1.5rem] bg-white shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Printer className="text-slate-700" size={26} />
                    </div>
                    <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-[9px] font-black uppercase tracking-widest">PDF · A4</span>
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Imprimir Barras</h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">Genera etiquetas adhesivas con código de barras, nombre, precio y más. Exporta en PDF.</p>
                  </div>
                  <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-500">
                    <div className="flex items-center gap-2 p-3 bg-white/80 rounded-xl">
                      <Layers size={12} className="text-slate-500" />
                      <span>Múltiples etiquetas por página (A4)</span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/80 rounded-xl">
                      <Tag size={12} className="text-slate-500" />
                      <span>Tamaño y contenido configurable</span>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-white/80 rounded-xl">
                      <Barcode size={12} className="text-slate-500" />
                      <span>Code128 — compatible con lectores</span>
                    </div>
                  </div>
                  <button onClick={() => { setBarSelected(new Set(products.map(p => p.id))); setBarcodeModal(true); }}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-300">
                    <Barcode size={16} /> Crear Etiquetas
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ MODAL: PRODUCT ═══════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <div className="px-12 py-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{editingId ? 'Ficha de Activo' : 'Nuevo Ingreso'}</h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mt-2 italic">Logística de Abastecimiento</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-4 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-12 space-y-8 max-h-[70vh] overflow-y-auto custom-scroll">
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black">1</div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Información General</h3>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Código SKU / Barras</label>
                    <div className="relative">
                      <Barcode className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                      <input required value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner uppercase" placeholder="SCAN_BARCODE" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Descripción del Activo</label>
                    <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Nombre completo del producto..." />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Categoría</label>
                    <input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Ej. Calzado" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Marca</label>
                    <input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Ej. Nike" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Unidad</label>
                    <select value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner">
                      <option value="UND">Unidades (UND)</option>
                      <option value="KG">Kilogramos (KG)</option>
                      <option value="L">Litros (L)</option>
                      <option value="M">Metros (M)</option>
                      <option value="PAR">Pares (PAR)</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black">2</div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Estructura de Costos y Precios</h3>
                </div>
                <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl text-white space-y-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-125 transition-transform"><TrendingUp size={120} /></div>
                  <div className="relative z-10 grid grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Costo Base ($)</label>
                      <input type="number" step="0.01" value={form.costoUSD} onChange={e => setForm({ ...form, costoUSD: Number(e.target.value) })} className="w-full px-5 py-4 bg-white/10 border border-white/10 rounded-2xl text-lg font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Precio Detal ($)</label>
                      <input type="number" step="0.01" value={form.precioDetal} onChange={e => setForm({ ...form, precioDetal: Number(e.target.value) })} className="w-full px-5 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-lg font-black focus:ring-2 focus:ring-emerald-400 focus:outline-none transition-all" />
                      <p className="text-[8px] font-black text-emerald-400 uppercase mt-1">Margen: {form.costoUSD > 0 ? (((form.precioDetal - form.costoUSD) / form.costoUSD) * 100).toFixed(1) : 0}%</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Precio Mayor ($)</label>
                      <input type="number" step="0.01" value={form.precioMayor} onChange={e => setForm({ ...form, precioMayor: Number(e.target.value) })} className="w-full px-5 py-4 bg-violet-500/10 border border-violet-500/20 rounded-2xl text-lg font-black focus:ring-2 focus:ring-violet-400 focus:outline-none transition-all" />
                      <p className="text-[8px] font-black text-violet-400 uppercase mt-1">Margen: {form.costoUSD > 0 ? (((form.precioMayor - form.costoUSD) / form.costoUSD) * 100).toFixed(1) : 0}%</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Tipo de Impuesto (IVA)</label>
                    <select value={form.ivaTipo} onChange={e => {
                      const tipo = e.target.value as any;
                      const tasa = tipo === 'GENERAL' ? 16 : tipo === 'REDUCIDO' ? 8 : 0;
                      setForm({ ...form, ivaTipo: tipo, iva: tasa });
                    }} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner">
                      <option value="GENERAL">IVA General (16%)</option>
                      <option value="REDUCIDO">IVA Reducido (8%)</option>
                      <option value="EXENTO">Exento de IVA (0%)</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Peso Neto (KG)</label>
                    <input type="number" step="0.001" value={form.peso} onChange={e => setForm({ ...form, peso: Number(e.target.value) })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="0.000" />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="h-8 w-8 rounded-lg bg-violet-500 text-white flex items-center justify-center font-black">3</div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Almacén y Logística</h3>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Proveedor Principal</label>
                    <input value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Nombre del proveedor..." />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Ubicación Física</label>
                    <input value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" placeholder="Ej. Pasillo A - Estante 4" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Stock de Apertura</label><input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" /></div>
                  <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Alerta de Mínimo</label><input type="number" value={form.stockMinimo} onChange={e => setForm({ ...form, stockMinimo: Number(e.target.value) })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-black text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all shadow-inner" /></div>
                </div>
              </div>
            </form>
            <div className="px-12 py-10 border-t border-slate-50 bg-slate-50/30 flex justify-end gap-6">
              <button onClick={() => setModalOpen(false)} className="px-10 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-100 transition-all">Cancelar</button>
              <button onClick={handleSaveProduct} className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-2xl shadow-slate-300 active:scale-95">Guardar Ficha</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: STOCK ADJUSTMENT ═══════════════ */}
      {adjModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-12 space-y-10">
              <div className="text-center">
                <div className="h-20 w-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse"><TrendingUp className="text-white" size={32} /></div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Ajuste de Stock</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-[0.2em]">{selectedProduct.nombre}</p>
              </div>
              <div className="space-y-8">
                <div className="flex p-2 bg-slate-100 rounded-[1.5rem] shadow-inner">
                  <button onClick={() => setAdjData({ ...adjData, type: 'AJUSTE' })} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'AJUSTE' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400'}`}>Entrada / Ajuste</button>
                  <button onClick={() => setAdjData({ ...adjData, type: 'MERMA' })} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'MERMA' ? 'bg-white text-rose-600 shadow-xl' : 'text-slate-400'}`}>Salida / Merma</button>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Cantidad de Unidades</label>
                  <input type="number" value={adjData.quantity} onChange={e => setAdjData({ ...adjData, quantity: Number(e.target.value) })} className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-3xl font-black text-center focus:ring-4 focus:ring-slate-900 shadow-inner" placeholder="0" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Razón de la Auditoría</label>
                  <textarea rows={3} value={adjData.reason} onChange={e => setAdjData({ ...adjData, reason: e.target.value })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-bold focus:ring-2 focus:ring-slate-900 shadow-inner resize-none" placeholder="Explique el motivo del cambio..." />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setAdjModalOpen(false)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cerrar</button>
                <button onClick={handleAdjustStock} className="flex-[2] py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 active:scale-95">Ejecutar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: IMPORT WIZARD ═══════════════ */}
      {importModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-10 py-8 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Upload size={18} className="text-indigo-600" />
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Importador Inteligente</h2>
                </div>
                {/* Steps */}
                <div className="flex items-center gap-2 mt-2">
                  {['Archivo', 'Mapear', 'Vista Previa', 'Resultado'].map((s, i) => (
                    <React.Fragment key={i}>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${importStep === i ? 'bg-indigo-600 text-white' : importStep > i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{s}</span>
                      {i < 3 && <ArrowRight size={10} className="text-slate-300" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button onClick={() => setImportModal(false)} className="p-3 hover:bg-white/60 rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scroll">

              {/* STEP 0: Upload */}
              {importStep === 0 && (
                <div className="p-10 space-y-6">
                  <div
                    onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                    onDragLeave={() => setImportDragOver(false)}
                    onDrop={e => { e.preventDefault(); setImportDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileLoad(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-[2.5rem] p-16 flex flex-col items-center justify-center cursor-pointer transition-all ${importDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}>
                    <div className="h-20 w-20 rounded-[2rem] bg-white shadow-xl flex items-center justify-center mb-6">
                      <Upload size={32} className="text-indigo-400" />
                    </div>
                    <p className="text-sm font-black text-slate-900">Arrastra tu archivo aquí</p>
                    <p className="text-xs text-slate-400 font-medium mt-2">o haz clic para seleccionar</p>
                    <div className="flex gap-3 mt-5">
                      {['CSV', 'XLSX', 'XLS'].map(t => (
                        <span key={t} className="px-3 py-1.5 bg-slate-100 rounded-lg text-[9px] font-black uppercase tracking-wider text-slate-500">{t}</span>
                      ))}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileLoad(f); }} />
                  </div>

                  <div className="bg-slate-50 rounded-[2rem] p-6 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campos reconocidos automáticamente</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(FIELD_LABELS_DISPLAY).map(([k, v]) => (
                        <span key={k} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600">{v}</span>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2">El sistema detecta automáticamente tus columnas, aunque tengan nombres distintos.</p>
                  </div>
                </div>
              )}

              {/* STEP 1: Column mapping */}
              {importStep === 1 && (
                <div className="p-10 space-y-6">
                  {/* Options */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-50 rounded-2xl space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modo de Importación</p>
                      <div className="flex gap-2">
                        {([{ v: 'flexible', l: 'Flexible', d: 'Solo requiere nombre' }, { v: 'strict', l: 'Estricto', d: 'Requiere código, costo y stock' }] as const).map(m => (
                          <button key={m.v} onClick={() => setImportMode(m.v)}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${importMode === m.v ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                            {m.l}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400">{importMode === 'flexible' ? 'Solo requiere nombre.' : 'Requiere código, costo y stock.'}</p>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-2xl space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Productos Duplicados</p>
                      <div className="flex gap-2">
                        {([{ v: 'skip', l: 'Omitir' }, { v: 'overwrite', l: 'Sobreescribir' }] as const).map(m => (
                          <button key={m.v} onClick={() => setDupMode(m.v)}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${dupMode === m.v ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                            {m.l}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400">{dupMode === 'skip' ? 'Si el código ya existe, se salta.' : 'Actualiza productos con mismo código.'}</p>
                    </div>
                  </div>

                  {/* Mapping table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mapeo de Columnas ({importHeaders.length} detectadas)</p>
                      <span className="text-[9px] text-slate-400">{Object.values(userMap).filter(Boolean).length} mapeadas</span>
                    </div>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden">
                      <div className="grid grid-cols-3 gap-0 bg-slate-50 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <span>Columna del Archivo</span>
                        <span>Campo Detectado</span>
                        <span>Campo Final</span>
                      </div>
                      {importHeaders.map((h) => {
                        const det = detectedMap[h];
                        const conf = det?.confidence ?? 0;
                        const confColor = conf >= 85 ? 'text-emerald-600' : conf >= 60 ? 'text-amber-600' : 'text-slate-400';
                        return (
                          <div key={h} className="grid grid-cols-3 gap-4 items-center px-5 py-3.5 border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <div>
                              <p className="text-sm font-black text-slate-900">{h}</p>
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">{(importRows[0]?.[importHeaders.indexOf(h)] || '—').slice(0, 24)}</p>
                            </div>
                            <div>
                              {det ? (
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-black uppercase ${confColor}`}>{conf}% confianza</span>
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-300">No detectado</span>
                              )}
                            </div>
                            <select
                              value={userMap[h] ?? ''}
                              onChange={e => setUserMap(prev => ({ ...prev, [h]: e.target.value }))}
                              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                            >
                              <option value="">— Ignorar —</option>
                              {Object.entries(FIELD_LABELS_DISPLAY).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Preview */}
              {importStep === 2 && (
                <div className="p-10 space-y-6">
                  <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl">
                    <Eye size={16} className="text-indigo-500" />
                    <p className="text-xs font-bold text-indigo-700">Vista previa de las primeras 8 filas — {importRows.length} filas totales</p>
                  </div>
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {importHeaders.filter(h => userMap[h]).map(h => (
                            <th key={h} className="px-4 py-3 font-black text-slate-500 text-[9px] uppercase tracking-wider whitespace-nowrap">
                              {FIELD_LABELS_DISPLAY[userMap[h]] || userMap[h]}
                              <span className="block font-normal text-slate-300 normal-case tracking-normal">{h}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {importRows.slice(0, 8).map((row, ri) => (
                          <tr key={ri} className="hover:bg-slate-50/50">
                            {importHeaders.filter(h => userMap[h]).map((h) => (
                              <td key={h} className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap max-w-[150px] truncate">
                                {row[importHeaders.indexOf(h)] || <span className="text-slate-300 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> {importRows.length} filas a procesar</span>
                    <span className="flex items-center gap-1.5"><Shuffle size={14} className="text-indigo-500" /> {Object.values(userMap).filter(Boolean).length} campos mapeados</span>
                    <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-500" /> Modo: {importMode === 'flexible' ? 'Flexible' : 'Estricto'}</span>
                  </div>
                </div>
              )}

              {/* STEP 3: Result */}
              {importStep === 3 && (
                <div className="p-10 space-y-6 text-center">
                  <div className="h-24 w-24 rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl" style={{ background: importResult.ok > 0 ? '#059669' : '#dc2626' }}>
                    {importResult.ok > 0 ? <CheckCircle2 size={40} className="text-white" /> : <AlertCircle size={40} className="text-white" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Importación completada</h3>
                    <div className="flex justify-center gap-8 mt-6">
                      <div className="text-center">
                        <p className="text-4xl font-black text-emerald-600">{importResult.ok}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Importados</p>
                      </div>
                      <div className="text-center">
                        <p className="text-4xl font-black text-amber-500">{importResult.skip}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Omitidos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-4xl font-black text-rose-600">{importResult.errors.length}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Errores</p>
                      </div>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 text-left space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-2">Errores encontrados</p>
                      {importResult.errors.map((e, i) => <p key={i} className="text-xs text-rose-700 font-mono">{e}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-10 py-7 border-t border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/30">
              <button
                onClick={() => { if (importStep === 0) { setImportModal(false); } else if (importStep === 3) { resetImport(); } else { setImportStep(s => s - 1); } }}
                className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all flex items-center gap-2">
                {importStep === 3 ? <><RotateCcw size={14} /> Nueva Importación</> : importStep === 0 ? 'Cerrar' : '← Atrás'}
              </button>
              {importStep < 3 && (
                <button
                  disabled={importStep === 1 && Object.values(userMap).filter(Boolean).length === 0}
                  onClick={() => {
                    if (importStep === 2) { handleImport(); }
                    else { setImportStep(s => s + 1); }
                  }}
                  className="flex items-center gap-2 px-10 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-40 shadow-lg shadow-indigo-200">
                  {importing
                    ? <><Loader2 className="animate-spin" size={16} /> Importando...</>
                    : importStep === 2
                    ? <><CheckCircle2 size={16} /> Confirmar Importación</>
                    : <>Siguiente <ArrowRight size={14} /></>}
                </button>
              )}
              {importStep === 3 && (
                <button onClick={() => setImportModal(false)} className="px-10 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95">
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: BARCODE PRINT ═══════════════ */}
      {barcodeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[92vh]">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-3">
                  <Printer size={20} className="text-slate-600" />
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Imprimir Etiquetas con Código de Barras</h2>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PDF A4 · Code128 · Compatible con lectores</p>
              </div>
              <button onClick={() => setBarcodeModal(false)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* Left: product selector */}
              <div className="w-[55%] border-r border-slate-100 flex flex-col">
                <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{barSelected.size} de {products.length} seleccionados</p>
                  <div className="flex gap-2">
                    <button onClick={() => setBarSelected(new Set(products.map(p => p.id)))} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-all">Todos</button>
                    <button onClick={() => setBarSelected(new Set())} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all">Ninguno</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll divide-y divide-slate-50">
                  {products.map(p => (
                    <div key={p.id} onClick={() => setBarSelected(prev => {
                      const s = new Set(prev);
                      s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                      return s;
                    })} className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-all ${barSelected.has(p.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}>
                      <div className={`shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${barSelected.has(p.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                        {barSelected.has(p.id) && <CheckSquare size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">{p.nombre}</p>
                        <p className="text-[9px] font-mono text-slate-400 mt-0.5">{p.codigo}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-black text-emerald-600">${p.precioDetal.toFixed(2)}</p>
                        <p className="text-[9px] text-slate-400">Stock: {p.stock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: label config + preview */}
              <div className="w-[45%] overflow-y-auto custom-scroll">
                <div className="p-6 space-y-5">

                  {/* Label size preset */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Tamaño de Etiqueta</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { l: '30×20 mm', w: 30, h: 20 },
                        { l: '40×25 mm', w: 40, h: 25 },
                        { l: '63×38 mm', w: 63, h: 38 },
                        { l: '100×50 mm', w: 100, h: 50 },
                      ].map(s => (
                        <button key={s.l} onClick={() => setBarOpts(o => ({ ...o, labelW: s.w, labelH: s.h }))}
                          className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${barOpts.labelW === s.w && barOpts.labelH === s.h ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cols per row */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Columnas por Página</p>
                    <div className="flex gap-2">
                      {[2, 3, 4].map(n => (
                        <button key={n} onClick={() => setBarOpts(o => ({ ...o, cols: n }))}
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${barOpts.cols === n ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show options */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Contenido de la Etiqueta</p>
                    <div className="space-y-2">
                      {[
                        { key: 'showName', label: 'Nombre del producto' },
                        { key: 'showPrice', label: 'Precio' },
                        { key: 'showBrand', label: 'Marca' },
                        { key: 'showSku', label: 'Código SKU bajo el código de barras' },
                      ].map(opt => (
                        <label key={opt.key} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all">
                          <input type="checkbox" checked={(barOpts as any)[opt.key]} onChange={e => setBarOpts(o => ({ ...o, [opt.key]: e.target.checked }))} className="rounded" />
                          <span className="text-xs font-bold text-slate-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Price type */}
                  {barOpts.showPrice && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Tipo de Precio</p>
                      <div className="flex gap-2">
                        {[{ v: 'detal', l: 'Detal' }, { v: 'mayor', l: 'Mayor' }, { v: 'both', l: 'Ambos' }].map(t => (
                          <button key={t.v} onClick={() => setBarOpts(o => ({ ...o, priceType: t.v as any }))}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${barOpts.priceType === t.v ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                            {t.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copies */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Copias por Producto</p>
                    <div className="flex gap-2 items-center">
                      {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => setBarOpts(o => ({ ...o, copies: n }))}
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${barOpts.copies === n ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                          {n}
                        </button>
                      ))}
                      <input type="number" min={1} max={20} value={barOpts.copies} onChange={e => setBarOpts(o => ({ ...o, copies: Math.max(1, Number(e.target.value)) }))}
                        className="flex-1 py-2.5 px-3 text-center bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black text-slate-900 focus:ring-2 focus:ring-slate-400 focus:outline-none" />
                    </div>
                  </div>

                  {/* Label preview */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Vista Previa de Etiqueta</p>
                    <div className="bg-slate-100 rounded-2xl p-6 flex items-center justify-center">
                      <div className="bg-white border border-slate-300 rounded shadow-lg flex flex-col items-center justify-center gap-1 p-2"
                        style={{ width: `${barOpts.labelW * 1.8}px`, height: `${barOpts.labelH * 1.8}px`, minWidth: 120, minHeight: 70 }}>
                        {/* fake barcode visual */}
                        <div className="flex gap-px">
                          {Array.from({ length: 28 }).map((_, i) => (
                            <div key={i} className="bg-slate-900 rounded-sm" style={{ width: `${[1, 2, 1, 3, 1, 2, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 1, 2, 3, 1, 1, 2, 1, 2, 3, 1, 2, 1][i] * 1.5}px`, height: '28px' }} />
                          ))}
                        </div>
                        {barOpts.showSku && <p className="text-[7px] font-mono text-slate-600">SKU-EJEMPLO</p>}
                        {barOpts.showName && <p className="text-[6px] font-black text-slate-900 truncate w-full text-center">Nombre del Producto</p>}
                        {barOpts.showPrice && <p className="text-[8px] font-black text-slate-900">$12.50</p>}
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 text-center mt-2">
                      {barSelected.size} producto{barSelected.size !== 1 ? 's' : ''} × {barOpts.copies} cop{barOpts.copies !== 1 ? 'ias' : 'ia'} = {barSelected.size * barOpts.copies} etiqueta{barSelected.size * barOpts.copies !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-10 py-7 border-t border-slate-100 flex justify-between items-center shrink-0">
              <button onClick={() => setBarcodeModal(false)} className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
              <button
                onClick={handleGenerateBarcodes}
                disabled={generatingPdf || barSelected.size === 0}
                className="flex items-center gap-3 px-12 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 shadow-xl shadow-slate-300">
                {generatingPdf
                  ? <><Loader2 className="animate-spin" size={16} /> Generando PDF...</>
                  : <><Printer size={16} /> Generar {barSelected.size * barOpts.copies} Etiqueta{barSelected.size * barOpts.copies !== 1 ? 's' : ''}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
