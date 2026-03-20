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
  serverTimestamp,
  writeBatch,
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
  Percent,
  ToggleLeft,
  ToggleRight,
  ListChecks,
  FolderEdit,
  CheckCheck,
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
const FIELD_ALIASES: Record<keyof Omit<Product, 'id' | 'ivaTipo'> | 'margen', string[]> = {
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
  margen:       ['margen','margin','%margen','markup','ganancia','margen %','margen detal','utilidad'],
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

/** Auto-detect delimiter (tab → semicolon → comma) and parse any text table */
function parseRawText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Count delimiters in first line to decide
  const sample = lines[0];
  const tabs      = (sample.match(/\t/g)  || []).length;
  const semis     = (sample.match(/;/g)   || []).length;
  const commas    = (sample.match(/,/g)   || []).length;
  const delimiter = tabs >= semis && tabs >= commas ? '\t'
                  : semis >= commas               ? ';'
                  : ',';

  return lines.map(line => {
    if (delimiter === '\t') return line.split('\t').map(c => c.trim());
    // CSV with quotes support for comma/semicolon
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delimiter && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
const KPICard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white dark:bg-[#0d1424] p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 flex items-center gap-3 sm:gap-4 hover:shadow-xl hover:shadow-black/15 transition-all group">
    <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 shrink-0 ${colorClass}`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-white/40 tracking-[0.2em] mb-0.5">{title}</p>
      <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 mt-0.5 uppercase tracking-widest">{subtext}</p>}
    </div>
  </div>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Inventario() {
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const tenantId = userProfile?.businessId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialProduct);
  const [quickMode, setQuickMode] = useState(true);
  const [mayorManual, setMayorManual] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stickyMargin, setStickyMargin] = useState<number>(() => {
    const saved = localStorage.getItem('dualis_last_margin');
    return saved ? parseFloat(saved) : 30;
  });
  const [bulkCalc, setBulkCalc] = useState({ costoBulto: 0, unidades: 0 });

  // Stock adjustment states
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjData, setAdjData] = useState({ type: 'AJUSTE', quantity: 0, reason: '' });

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
  const [pasteText, setPasteText] = useState('');

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

  // ── MULTI-SELECT & BULK ACTIONS ────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const clearSelect = () => setSelectedIds(new Set());

  // ── MASTER CONTROLS ────────────────────────────────────────────────────────
  const [masterPanel, setMasterPanel] = useState<'margin' | 'iva' | 'category' | null>(null);
  const [masterMargin, setMasterMargin] = useState('30');
  const [masterMarginTarget, setMasterMarginTarget] = useState<'detal' | 'mayor' | 'both'>('both');
  const [masterIvaType, setMasterIvaType] = useState<'GENERAL' | 'REDUCIDO' | 'EXENTO'>('GENERAL');
  const [masterIvaValue, setMasterIvaValue] = useState('16');
  const [masterCategory, setMasterCategory] = useState('');
  const [masterApplying, setMasterApplying] = useState(false);

  const getMasterScope = () => selectedIds.size > 0 ? [...selectedIds].map(id => products.find(p => p.id === id)!).filter(Boolean)
    : filteredProducts;

  const handleMasterMargin = async () => {
    if (!tenantId || masterApplying) return;
    const margin = parseFloat(masterMargin);
    if (isNaN(margin) || margin <= 0) return;
    const scope = getMasterScope();
    setMasterApplying(true);
    try {
      const batch = writeBatch(db);
      scope.forEach(p => {
        const ref = doc(db, `businesses/${tenantId}/products`, p.id);
        const updates: Partial<Product> = {};
        if (masterMarginTarget === 'detal' || masterMarginTarget === 'both')
          updates.precioDetal = parseFloat((p.costoUSD * (1 + margin / 100)).toFixed(2));
        if (masterMarginTarget === 'mayor' || masterMarginTarget === 'both')
          updates.precioMayor = parseFloat((p.costoUSD * (1 + margin / 100) * 0.95).toFixed(2));
        batch.update(ref, updates);
      });
      await batch.commit();
      setMasterPanel(null);
    } finally { setMasterApplying(false); }
  };

  const handleMasterIva = async () => {
    if (!tenantId || masterApplying) return;
    const ivaVal = parseFloat(masterIvaValue);
    const scope = getMasterScope();
    setMasterApplying(true);
    try {
      const batch = writeBatch(db);
      scope.forEach(p => {
        batch.update(doc(db, `businesses/${tenantId}/products`, p.id), {
          iva: masterIvaType === 'EXENTO' ? 0 : ivaVal,
          ivaTipo: masterIvaType,
        });
      });
      await batch.commit();
      setMasterPanel(null);
    } finally { setMasterApplying(false); }
  };

  const handleMasterCategory = async () => {
    if (!tenantId || !masterCategory.trim() || masterApplying) return;
    const scope = getMasterScope();
    setMasterApplying(true);
    try {
      const batch = writeBatch(db);
      scope.forEach(p => {
        batch.update(doc(db, `businesses/${tenantId}/products`, p.id), { categoria: masterCategory.trim() });
      });
      await batch.commit();
      setMasterPanel(null);
    } finally { setMasterApplying(false); }
  };

  const handleBulkDelete = async () => {
    if (!tenantId || selectedIds.size === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.size} producto(s)? Esta acción no se puede deshacer.`)) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => batch.delete(doc(db, `businesses/${tenantId}/products`, id)));
    await batch.commit();
    clearSelect();
  };

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
  const handleSaveProduct = async () => {
    if (!tenantId || !form.codigo || !form.nombre) return;
    const payload = { ...form, updatedAt: new Date().toISOString() };
    if (editingId) {
      await setDoc(doc(db, `businesses/${tenantId}/products`, editingId), payload, { merge: true });
      setModalOpen(false);
      setForm(initialProduct);
      setEditingId(null);
    } else {
      await addDoc(collection(db, `businesses/${tenantId}/products`), payload);
      // Quick mode: stay open, reset to categoria only
      setForm({ ...initialProduct, categoria: form.categoria });
      setMayorManual(false);
      setTimeout(() => codigoRef.current?.focus(), 50);
    }
  };

  const handleSaveAndClose = async () => {
    if (!tenantId || !form.codigo || !form.nombre) return;
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

  const applyMargin = (pct: number) => {
    if (form.costoUSD <= 0) return;
    const detal = parseFloat((form.costoUSD * (1 + pct / 100)).toFixed(2));
    const mayor = parseFloat((detal * 0.95).toFixed(2));
    setForm(f => ({ ...f, precioDetal: detal, precioMayor: mayor }));
    setMayorManual(false);
    setStickyMargin(pct);
    localStorage.setItem('dualis_last_margin', String(pct));
  };

  const handleDetalChange = (v: number) => {
    const mayor = mayorManual ? form.precioMayor : parseFloat((v * 0.95).toFixed(2));
    setForm(f => ({ ...f, precioDetal: v, precioMayor: mayor }));
    // Persist effective margin
    if (form.costoUSD > 0 && v > 0) {
      const eff = Math.round(((v - form.costoUSD) / form.costoUSD) * 100);
      setStickyMargin(eff);
      localStorage.setItem('dualis_last_margin', String(eff));
    }
  };

  const handleCostoChange = (v: number) => {
    if (v > 0 && form.precioDetal === 0) {
      // Auto-apply sticky margin when entering cost for the first time
      const detal = parseFloat((v * (1 + stickyMargin / 100)).toFixed(2));
      const mayor = parseFloat((detal * 0.95).toFixed(2));
      setForm(f => ({ ...f, costoUSD: v, precioDetal: detal, precioMayor: mayor }));
    } else {
      setForm(f => ({ ...f, costoUSD: v }));
    }
  };

  const autoSku = () =>
    setForm(f => ({ ...f, codigo: `SKU-${Date.now().toString(36).toUpperCase()}` }));

  const existingCategories = useMemo(
    () => [...new Set(products.map(p => p.categoria).filter(Boolean))].slice(0, 8),
    [products],
  );

  const PAGE_SIZE = 25;
  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q)
    );
  }, [products, searchTerm]);
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pagedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  const selectPage = () => setSelectedIds(new Set(pagedProducts.map(p => p.id)));
  const selectAllProducts = () => setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  const selectAll = selectPage; // alias used in header checkbox
  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every(p => selectedIds.has(p.id));
  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const uniqueCategories = useMemo(() => [...new Set(products.map(p => p.categoria).filter(Boolean))].sort(), [products]);

  // ── SMART ADVISOR ───────────────────────────────────────────────────────────
  const smartAdvisor = useMemo(() => {
    if (!form.categoria || form.costoUSD <= 0) return null;

    const catProducts = products.filter(
      p => p.categoria?.toLowerCase() === form.categoria?.toLowerCase() && p.id !== editingId,
    );
    const catIds = new Set(catProducts.map(p => p.id));

    // Rotation = VENTA movements for this category
    const ventaCount = movements.filter(m => m.type === 'VENTA' && catIds.has(m.productId)).length;
    const rotationScore = catProducts.length > 0
      ? Math.min(ventaCount / Math.max(catProducts.length * 4, 1), 1)
      : 0;

    // Avg excess stock ratio
    const avgExcessRatio = catProducts.length > 0
      ? catProducts.reduce((s, p) => s + (p.stockMinimo > 0 ? p.stock / p.stockMinimo : 1), 0) / catProducts.length
      : 1;

    let suggestedMargin: number;
    let reason: string;
    let tip: string;
    let level: 'low' | 'mid' | 'high';

    if (rotationScore > 0.6) {
      suggestedMargin = 18; level = 'low';
      reason = `Alta rotación · ${form.categoria}`;
      tip = 'Esta categoría vende rápido. Margen bajo + volumen = más dinero.';
    } else if (rotationScore > 0.3) {
      suggestedMargin = 25; level = 'mid';
      reason = 'Rotación media';
      tip = 'Balance ideal entre margen y velocidad de salida.';
    } else if (avgExcessRatio > 3) {
      suggestedMargin = 22; level = 'low';
      reason = 'Stock elevado en categoría';
      tip = 'Mucho inventario acumulado. Precio competitivo ayuda a rotar.';
    } else if (metrics.totalCapital > 10000) {
      suggestedMargin = 28; level = 'mid';
      reason = 'Capital alto en bodega';
      tip = 'Flujo de caja es prioridad. Margen moderado para mover stock.';
    } else if (catProducts.length === 0) {
      suggestedMargin = stickyMargin; level = 'mid';
      reason = 'Nueva categoría';
      tip = 'Sin historial. Usando tu último margen como referencia.';
    } else {
      suggestedMargin = 35; level = 'high';
      reason = 'Rotación lenta · margen alto';
      tip = 'Productos de bajo movimiento se compensan con mejor margen.';
    }

    suggestedMargin = Math.max(suggestedMargin, 12); // floor 12%
    const suggestedPrice = parseFloat((form.costoUSD * (1 + suggestedMargin / 100)).toFixed(2));
    const isApplied = Math.abs(
      ((form.precioDetal - form.costoUSD) / form.costoUSD) * 100 - suggestedMargin
    ) < 1;

    return { suggestedMargin, suggestedPrice, reason, tip, level, isApplied };
  }, [form.categoria, form.costoUSD, form.precioDetal, products, movements, editingId, metrics.totalCapital, stickyMargin]);

  // Auto-focus código on modal open
  useEffect(() => {
    if (modalOpen) setTimeout(() => codigoRef.current?.focus(), 80);
  }, [modalOpen]);

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
  const processRows = (rows: string[][]) => {
    if (rows.length < 2) { alert('Se necesita al menos una fila de encabezados y una de datos.'); return; }
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
  };

  const handlePasteLoad = () => {
    if (!pasteText.trim()) return;
    const rows = parseRawText(pasteText);
    processRows(rows);
  };

  const handleFileLoad = async (file: File) => {
    try {
      let rows: string[][] = [];
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text();
        rows = parseRawText(text);
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
      processRows(rows);
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
      // Parse Venezuelan number format: 1,5 → 1.5 / 1.500,00 → 1500
      const num = (field: string, fb = 0) => {
        const v = String(get(field, '')).trim().replace('%', '').trim();
        if (!v) return fb;
        let s: string;
        if (/,\d{1,2}$/.test(v)) {
          // Comma is decimal separator (es-VE: "1,5" or "1.500,50")
          s = v.replace(/\./g, '').replace(',', '.');
        } else {
          // Comma is thousands separator or absent
          s = v.replace(/,/g, '');
        }
        const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? fb : n;
      };

      const codigo = get('codigo', `PROD-${Date.now()}-${i}`).toUpperCase();
      const existing = dupMode === 'skip' ? products.find(p => p.codigo === codigo) : null;
      if (existing) { result.skip++; continue; }

      const ivaTipoRaw = get('ivaTipo', '').toLowerCase();
      const ivaTipo: Product['ivaTipo'] = ivaTipoRaw.includes('exento') || ivaTipoRaw === '0' ? 'EXENTO'
        : ivaTipoRaw.includes('reducido') || ivaTipoRaw === '8' ? 'REDUCIDO' : 'GENERAL';

      const costoUSD    = num('costoUSD');
      const margenPct   = num('margen', 0);  // e.g. 25 for 25%
      const rawDetal    = num('precioDetal');
      const rawMayor    = num('precioMayor');

      // Auto-calculate prices from costo + margen if not provided
      const precioDetal = rawDetal  > 0 ? rawDetal
                        : (costoUSD > 0 && margenPct > 0) ? parseFloat((costoUSD * (1 + margenPct / 100)).toFixed(4))
                        : 0;
      const precioMayor = rawMayor  > 0 ? rawMayor
                        : precioDetal > 0 ? parseFloat((precioDetal * 0.95).toFixed(4))
                        : 0;

      const payload: Omit<Product, 'id'> = {
        codigo,
        nombre: get('nombre', 'Producto Importado'),
        categoria: get('categoria', 'General'),
        marca: get('marca', ''),
        proveedor: get('proveedor', ''),
        ubicacion: get('ubicacion', ''),
        costoUSD,
        precioDetal,
        precioMayor,
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
    setPasteText('');
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
    <div className="min-h-full bg-slate-50 dark:bg-[#070b14] p-4 sm:p-6 pb-10 font-inter">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10">

        {/* DASHBOARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard title="Capital en Stock" value={`$${metrics.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} subtext={`${metrics.totalItems} unidades en bodega`} icon={BadgeDollarSign} colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100" />
          <KPICard title="Alertas Críticas" value={metrics.lowStockCount} subtext="Revisiones de stock urgentes" icon={AlertTriangle} colorClass="bg-rose-50 text-rose-600 shadow-rose-100" />
          <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 flex flex-col group h-full min-h-[140px]">
            <div className="flex justify-between items-center mb-4 px-2">
              <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.2em]">Inversión por Rama</p>
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
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.07] rounded-xl shadow-sm overflow-x-auto">
            {[
              { id: 'catalog', label: 'Catálogo', icon: Package },
              { id: 'kardex', label: 'Kardex', icon: History },
              { id: 'tools', label: 'Herramientas', icon: Settings2 },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.06]'}`}>
                <tab.icon size={13} /> {tab.label}
              </button>
            ))}
          </div>
          <button onClick={() => { setEditingId(null); setForm(initialProduct); setQuickMode(true); setMayorManual(false); setShowAdvanced(false); setBulkCalc({ costoBulto: 0, unidades: 0 }); setModalOpen(true); }}
            className="flex items-center justify-center gap-2.5 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 active:scale-95">
            <Plus size={16} /> Registrar Mercancía
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-lg shadow-black/10 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* TAB 1: CATALOG */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col h-full">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-[380px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 h-4 w-4" />
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por código, nombre o categoría..."
                    className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-700 dark:text-white dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                </div>
                <div className="flex gap-3">
                  <div className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl text-white flex items-center gap-2 shadow-md shadow-indigo-500/25">
                    <Tags size={13} className="text-white/70" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{rates.tasaBCV.toFixed(2)} BS / USD</span>
                  </div>
                </div>
              </div>
              {/* ── INFO CARD ────────────────────────────────────────────────── */}
              <div className="mx-5 mt-4 mb-0 p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/[0.06] border border-indigo-100 dark:border-indigo-500/20 flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <ListChecks size={14} className="text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 mb-1">Selección y Ajuste Masivo</p>
                  <ul className="space-y-0.5 text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-semibold leading-relaxed">
                    <li>· Haz <strong>hover</strong> sobre cualquier fila y marca el checkbox para seleccionar productos.</li>
                    <li>· Usa el checkbox del <strong>encabezado</strong> para seleccionar toda la página. Aparecerá la opción de seleccionar <strong>todos los productos</strong> de una vez.</li>
                    <li>· Con productos seleccionados, los botones <strong>Margen / IVA / Categoría</strong> aplican solo a la selección.</li>
                    <li>· Sin selección, los ajustes aplican a <strong>todos los productos visibles</strong> (puedes usar el buscador para filtrar primero).</li>
                    <li>· El badge <strong>IVA</strong> en cada fila alterna entre GENERAL↔EXENTO con un solo clic.</li>
                  </ul>
                </div>
              </div>

              {/* ── MASTER CONTROLS BAR ──────────────────────────────────────── */}
              <div className="px-5 py-2.5 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/30 dark:bg-white/[0.01] flex flex-wrap items-center gap-2 mt-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mr-1">Ajuste Masivo:</span>

                {/* MARGEN BUTTON */}
                <div className="relative">
                  <button onClick={() => setMasterPanel(masterPanel === 'margin' ? null : 'margin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${masterPanel === 'margin' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-white/[0.05] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 hover:text-indigo-600'}`}>
                    <Percent size={11} /> Margen
                  </button>
                  {masterPanel === 'margin' && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">
                        Aplicar Margen de Ganancia
                      </p>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30">Margen %</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {['10','20','30','50','100'].map(v => (
                            <button key={v} onClick={() => setMasterMargin(v)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${masterMargin === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-white/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'}`}>
                              +{v}%
                            </button>
                          ))}
                          <input type="number" min="1" value={masterMargin} onChange={e => setMasterMargin(e.target.value)}
                            className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.06] text-slate-900 dark:text-white text-[11px] font-black text-center focus:ring-1 focus:ring-indigo-500 outline-none" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30">Aplicar a</label>
                        <div className="flex gap-1.5">
                          {(['detal','mayor','both'] as const).map(t => (
                            <button key={t} onClick={() => setMasterMarginTarget(t)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${masterMarginTarget === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-white/50'}`}>
                              {t === 'both' ? 'Ambos' : t === 'detal' ? 'Detal' : 'Mayor'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pt-1 text-[9px] text-slate-400 dark:text-white/30 italic">
                        {selectedIds.size > 0 ? `Aplicará a ${selectedIds.size} seleccionados` : `Aplicará a ${filteredProducts.length} producto(s) ${searchTerm ? 'filtrados' : 'en total'}`}
                      </div>
                      <button onClick={handleMasterMargin} disabled={masterApplying}
                        className="w-full py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {masterApplying ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                        Aplicar
                      </button>
                    </div>
                  )}
                </div>

                {/* IVA BUTTON */}
                <div className="relative">
                  <button onClick={() => setMasterPanel(masterPanel === 'iva' ? null : 'iva')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${masterPanel === 'iva' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-white/[0.05] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/[0.08] hover:border-emerald-400 hover:text-emerald-600'}`}>
                    <Tag size={11} /> IVA
                  </button>
                  {masterPanel === 'iva' && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-64 bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Tipo de IVA</p>
                      {([['GENERAL','16% General','16'],['REDUCIDO','8% Reducido','8'],['EXENTO','0% Exento','0']] as [string,string,string][]).map(([type,label,val]) => (
                        <button key={type} onClick={() => { setMasterIvaType(type as any); setMasterIvaValue(val); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${masterIvaType === type ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/70 border-slate-100 dark:border-white/[0.07] hover:border-emerald-400'}`}>
                          <span>{label}</span>
                          {masterIvaType === type && <CheckCircle2 size={13} />}
                        </button>
                      ))}
                      <div className="pt-1 text-[9px] text-slate-400 dark:text-white/30 italic">
                        {selectedIds.size > 0 ? `Aplicará a ${selectedIds.size} seleccionados` : `Aplicará a ${filteredProducts.length} producto(s)`}
                      </div>
                      <button onClick={handleMasterIva} disabled={masterApplying}
                        className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {masterApplying ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                        Aplicar IVA
                      </button>
                    </div>
                  )}
                </div>

                {/* CATEGORÍA BUTTON */}
                <div className="relative">
                  <button onClick={() => setMasterPanel(masterPanel === 'category' ? null : 'category')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${masterPanel === 'category' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-white/[0.05] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/[0.08] hover:border-violet-400 hover:text-violet-600'}`}>
                    <FolderEdit size={11} /> Categoría
                  </button>
                  {masterPanel === 'category' && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-60 bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Cambiar Categoría</p>
                      <input value={masterCategory} onChange={e => setMasterCategory(e.target.value)} placeholder="Nueva categoría..."
                        list="cat-list"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.06] text-slate-900 dark:text-white text-sm font-bold focus:ring-1 focus:ring-violet-500 outline-none" />
                      <datalist id="cat-list">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {uniqueCategories.map(c => (
                          <button key={c} onClick={() => setMasterCategory(c)}
                            className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border transition-all ${masterCategory === c ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 border-slate-200 dark:border-white/[0.08]'}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                      <div className="pt-1 text-[9px] text-slate-400 dark:text-white/30 italic">
                        {selectedIds.size > 0 ? `Aplicará a ${selectedIds.size} seleccionados` : `Aplicará a ${filteredProducts.length} producto(s)`}
                      </div>
                      <button onClick={handleMasterCategory} disabled={masterApplying || !masterCategory.trim()}
                        className="w-full py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {masterApplying ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>

                {/* close panel on outside click */}
                {masterPanel && (
                  <div className="fixed inset-0 z-40" onClick={() => setMasterPanel(null)} />
                )}

                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                        {selectedIds.size} de {filteredProducts.length} seleccionados
                      </span>
                      {!allFilteredSelected && (
                        <button onClick={selectAllProducts}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase hover:bg-indigo-500 transition-all">
                          Seleccionar todos ({filteredProducts.length})
                        </button>
                      )}
                      <button onClick={handleBulkDelete} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white text-[10px] font-black uppercase transition-all border border-rose-500/20">
                        <Trash2 size={11} /> Eliminar
                      </button>
                      <button onClick={clearSelect} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 text-[10px] font-black uppercase hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-all border border-slate-200 dark:border-white/[0.08]">
                        Limpiar
                      </button>
                    </>
                  )}
                  {selectedIds.size === 0 && (
                    <span className="text-[9px] text-slate-400 dark:text-white/30 italic">{filteredProducts.length} productos en catálogo</span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 border-b border-slate-100 dark:border-white/[0.07]">
                    <tr>
                      <th className="px-3 py-3.5">
                        <button onClick={allPageSelected ? clearSelect : selectAll}
                          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 border-slate-300 dark:border-white/20 hover:border-indigo-500">
                          {allPageSelected ? <CheckSquare size={12} className="text-indigo-600 dark:text-indigo-400" /> : <Square size={12} className="text-slate-300 dark:text-white/20" />}
                        </button>
                      </th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5">Producto / SKU</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 hidden sm:table-cell">Categoría</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right hidden md:table-cell">Costo Base</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right">Precio Detal</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right hidden md:table-cell">Precio Mayor</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">Stock Real</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {pagedProducts.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      const marginDetal = p.costoUSD > 0 ? Math.round(((p.precioDetal - p.costoUSD) / p.costoUSD) * 100) : 0;
                      return (
                      <tr key={p.id} className={`transition-colors group border-b border-slate-50 dark:border-white/[0.04] ${isSelected ? 'bg-indigo-50/40 dark:bg-indigo-500/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}>
                        {/* Checkbox */}
                        <td className="px-3 py-4 w-8">
                          <button onClick={() => toggleSelect(p.id)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-white/20 hover:border-indigo-400 opacity-0 group-hover:opacity-100'}`}>
                            {isSelected && <CheckSquare size={12} className="text-white" />}
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/40 group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white'}`}>
                              <Package size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{p.nombre}</p>
                              <p className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 dark:bg-white/[0.04] px-2 py-0.5 rounded-lg w-fit mt-1 border border-slate-100 dark:border-white/[0.07]">{p.codigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-3 py-1 bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-white/[0.08]">{p.categoria}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-sm font-black text-slate-700 dark:text-slate-200">${p.costoUSD.toFixed(2)}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-sm font-black text-emerald-600">${p.precioDetal.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Bs {(p.precioDetal * rates.tasaBCV).toFixed(2)}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-sm font-black text-violet-600">${p.precioMayor.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Bs {(p.precioMayor * rates.tasaBCV).toFixed(2)}</p>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className={`inline-flex flex-col items-center px-4 py-1.5 rounded-xl border ${p.stock < p.stockMinimo ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20' : 'bg-slate-50 dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07]'}`}>
                            <span className={`text-base font-black ${p.stock < p.stockMinimo ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{p.stock}</span>
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">UND</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            {/* IVA badge — quick toggle */}
                            <button
                              title={`IVA: ${p.ivaTipo || 'GENERAL'} ${p.iva ?? 16}%`}
                              onClick={async () => {
                                const next = (p.ivaTipo === 'EXENTO') ? { iva: 16, ivaTipo: 'GENERAL' } : { iva: 0, ivaTipo: 'EXENTO' };
                                await setDoc(doc(db, `businesses/${tenantId}/products`, p.id), next, { merge: true });
                              }}
                              className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border transition-all ${(p.ivaTipo === 'EXENTO' || p.iva === 0) ? 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/[0.08]' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'}`}>
                              {(p.ivaTipo === 'EXENTO' || p.iva === 0) ? 'Exento' : `IVA ${p.iva ?? 16}%`}
                            </button>
                            {/* Margin badge */}
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black border ${marginDetal >= 30 ? 'bg-indigo-50 dark:bg-indigo-500/[0.08] text-indigo-500 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20' : 'bg-slate-50 dark:bg-white/[0.04] text-slate-400 dark:text-white/30 border-slate-100 dark:border-white/[0.07]'}`}
                              title="Margen detal">
                              +{marginDetal}%
                            </span>
                            {/* Stock adjust */}
                            <button onClick={() => { setSelectedProduct(p); setAdjModalOpen(true); }} className="p-1.5 rounded-xl bg-indigo-600 text-white hover:bg-emerald-500 transition-all shadow-md shadow-indigo-500/25" title="Ajuste de Stock"><TrendingUp size={13} /></button>
                            {/* Edit */}
                            <button onClick={() => { setEditingId(p.id); setForm(p); setQuickMode(false); setMayorManual(true); setShowAdvanced(true); setModalOpen(true); }} className="p-1.5 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-white/[0.12] transition-all"><Pencil size={13} /></button>
                            {/* Delete */}
                            {deleteConfirmId === p.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={async () => { await deleteDoc(doc(db, `businesses/${tenantId}/products`, p.id)); setDeleteConfirmId(null); }} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[9px] font-black">Sí</button>
                                <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 text-[9px] font-black">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {products.length === 0 && !loading && (
                  <div className="py-24 text-center text-slate-400 font-semibold">Sin productos registrados</div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">
                    {filteredProducts.length} productos · Página {currentPage} de {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-[10px] font-black text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.1] disabled:opacity-30 transition-all"
                    >← Ant</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                      if (page < 1 || page > totalPages) return null;
                      return (
                        <button key={page} onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25' : 'bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-indigo-300'}`}>
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-[10px] font-black text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.1] disabled:opacity-30 transition-all"
                    >Sig →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: KARDEX */}
          {activeTab === 'kardex' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 border-b border-slate-100 dark:border-white/[0.07]">
                  <tr>
                    <th className="px-5 py-3.5">Fecha / Hora</th>
                    <th className="px-5 py-3.5">Producto</th>
                    <th className="px-5 py-3.5">Operación</th>
                    <th className="px-5 py-3.5 text-center">Cant.</th>
                    <th className="px-5 py-3.5">Notas</th>
                    <th className="px-5 py-3.5">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                  {movements.map((m) => (
                    <tr key={m.id} className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-4 text-slate-400 dark:text-white/30 font-mono">
                        {m.createdAt instanceof Timestamp ? m.createdAt.toDate().toLocaleString() : 'Reciente'}
                      </td>
                      <td className="px-5 py-4 text-slate-900 dark:text-white font-black">{m.productName}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${m.type === 'VENTA' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-100 dark:border-amber-500/20' : m.type === 'COMPRA' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40 border-slate-200 dark:border-white/[0.08]'}`}>{m.type}</span>
                      </td>
                      <td className={`px-5 py-4 text-center font-black text-sm ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-5 py-4 italic text-slate-400 dark:text-white/30 font-medium">{m.reason || 'Sincronización automática'}</td>
                      <td className="px-5 py-4 text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-[10px] text-slate-500 dark:text-white/40"><User size={12} /></div>
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
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center gap-3 pb-1">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25"><Settings2 size={16} /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Herramientas de Inventario</h3>
                  <p className="text-[10px] text-slate-400 dark:text-white/40 font-bold uppercase tracking-widest">Importación masiva · Exportación · Etiquetas</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* EXPORT */}
                <div className="bg-white dark:bg-[#0d1424] border border-emerald-100 dark:border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-emerald-500/10 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center group-hover:rotate-6 transition-transform">
                      <Download className="text-emerald-600" size={20} />
                    </div>
                    <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest">{products.length} productos</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">Exportar Excel</h4>
                    <p className="text-xs text-slate-500 dark:text-white/40 font-medium mt-1 leading-relaxed">Stock consolidado con precios, márgenes y equivalencias en Bs al tipo BCV actual.</p>
                  </div>
                  <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-500 dark:text-white/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={exportOpts.margins} onChange={e => setExportOpts(p => ({ ...p, margins: e.target.checked }))} className="rounded accent-indigo-600" />
                      Incluir columnas de márgenes
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={exportOpts.priceBS} onChange={e => setExportOpts(p => ({ ...p, priceBS: e.target.checked }))} className="rounded accent-indigo-600" />
                      Incluir precios en Bolívares
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span>Filtrar:</span>
                      <select value={exportOpts.filter} onChange={e => setExportOpts(p => ({ ...p, filter: e.target.value as any }))}
                        className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-[10px] font-bold dark:text-white outline-none">
                        <option value="all">Todo el inventario</option>
                        <option value="low_stock">Solo alertas de stock</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={handleExportExcel} disabled={exporting}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-500/25">
                    {exporting ? <><Loader2 className="animate-spin" size={14} /> Generando...</> : <><FileSpreadsheet size={14} /> Descargar Excel</>}
                  </button>
                </div>

                {/* IMPORT */}
                <div className="bg-white dark:bg-[#0d1424] border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-indigo-500/10 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center group-hover:-rotate-6 transition-transform">
                      <Upload className="text-indigo-600" size={20} />
                    </div>
                    <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest">CSV · XLSX</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">Importar Carga</h4>
                    <p className="text-xs text-slate-500 dark:text-white/40 font-medium mt-1 leading-relaxed">Detección automática de columnas. Mapeo inteligente con cualquier formato de archivo.</p>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[10px] font-bold text-slate-500 dark:text-white/40">
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Shuffle size={11} className="text-indigo-400" />
                      <span>Auto-detección de campos por nombre</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Eye size={11} className="text-indigo-400" />
                      <span>Vista previa antes de importar</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <SlidersHorizontal size={11} className="text-indigo-400" />
                      <span>Modo estricto o flexible</span>
                    </div>
                  </div>
                  <button onClick={() => { resetImport(); setImportModal(true); }}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-md shadow-indigo-500/25">
                    <Upload size={14} /> Abrir Importador
                  </button>
                </div>

                {/* BARCODE */}
                <div className="bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-white/[0.07] rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-black/10 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Printer className="text-slate-700 dark:text-white/70" size={20} />
                    </div>
                    <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/50 rounded-lg text-[9px] font-black uppercase tracking-widest">PDF · A4</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">Imprimir Barras</h4>
                    <p className="text-xs text-slate-500 dark:text-white/40 font-medium mt-1 leading-relaxed">Genera etiquetas adhesivas con código de barras, nombre, precio y más. Exporta en PDF.</p>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[10px] font-bold text-slate-500 dark:text-white/40">
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Layers size={11} className="text-slate-500 dark:text-white/40" />
                      <span>Múltiples etiquetas por página (A4)</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Tag size={11} className="text-slate-500 dark:text-white/40" />
                      <span>Tamaño y contenido configurable</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Barcode size={11} className="text-slate-500 dark:text-white/40" />
                      <span>Code128 — compatible con lectores</span>
                    </div>
                  </div>
                  <button onClick={() => { setBarSelected(new Set(products.map(p => p.id))); setBarcodeModal(true); }}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-slate-700 to-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-md shadow-black/20">
                    <Barcode size={14} /> Crear Etiquetas
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ MODAL: PRODUCT ═══════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-lg rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.07] overflow-hidden overflow-y-auto max-h-[95vh] animate-in fade-in zoom-in-95 duration-300">

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                  <Package size={15} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                    {editingId ? 'Editar Producto' : '⚡ Ingreso Rápido'}
                  </h2>
                  {!editingId && <p className="text-[10px] text-slate-400 dark:text-white/30 font-bold">Guarda y queda listo para el siguiente</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editingId && (
                  <button
                    type="button"
                    onClick={() => setQuickMode(q => !q)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${quickMode ? 'border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`}
                  >
                    {quickMode ? '⚡ Rápido' : '📋 Completo'}
                  </button>
                )}
                <button type="button" onClick={() => setModalOpen(false)} className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-all"><X size={15} /></button>
              </div>
            </div>

            <form onSubmit={e => e.preventDefault()} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scroll">

              {/* ── ROW 1: CÓDIGO + NOMBRE ── */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr] gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Código / SKU</label>
                  <div className="relative">
                    <input
                      ref={codigoRef}
                      required
                      value={form.codigo}
                      onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                      placeholder="SKU o barras"
                      className="w-full pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <button type="button" onClick={autoSku} title="Auto-generar SKU"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Nombre del Producto</label>
                  <input
                    required
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Descripción completa..."
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* ── ROW 2: PRECIOS ── */}
              <div className="bg-gradient-to-br from-slate-900 to-[#0d1220] rounded-2xl p-4 border border-white/[0.06] space-y-3">
                {/* Margin presets */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest shrink-0">Margen:</span>
                  {[20, 30, 50, 100].map(pct => (
                    <button key={pct} type="button" onClick={() => applyMargin(pct)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                        form.costoUSD > 0 && Math.abs(((form.precioDetal - form.costoUSD) / form.costoUSD) * 100 - pct) < 0.5
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/30'
                          : 'border-white/10 text-white/40 hover:border-indigo-500/50 hover:text-indigo-400'
                      }`}>
                      +{pct}%
                    </button>
                  ))}
                  <div className="flex-1" />
                  <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Mayor = Detal × 0.95</span>
                </div>

                {/* Bulk pricing calculator */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-amber-400/60 mb-1 block">Costo Bulto ($)</label>
                    <input type="number" step="0.01" min="0" value={bulkCalc.costoBulto || ''}
                      onChange={e => {
                        const c = Number(e.target.value);
                        setBulkCalc(b => ({ ...b, costoBulto: c }));
                        if (c > 0 && bulkCalc.unidades > 0) handleCostoChange(parseFloat((c / bulkCalc.unidades).toFixed(4)));
                      }}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-amber-400 outline-none transition-all placeholder:text-white/20" />
                  </div>
                  <div className="w-12 text-center text-white/20 text-lg font-black pb-2">/</div>
                  <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-amber-400/60 mb-1 block">Unidades</label>
                    <input type="number" step="1" min="1" value={bulkCalc.unidades || ''}
                      onChange={e => {
                        const u = Number(e.target.value);
                        setBulkCalc(b => ({ ...b, unidades: u }));
                        if (bulkCalc.costoBulto > 0 && u > 0) handleCostoChange(parseFloat((bulkCalc.costoBulto / u).toFixed(4)));
                      }}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-amber-400 outline-none transition-all placeholder:text-white/20" />
                  </div>
                  {bulkCalc.costoBulto > 0 && bulkCalc.unidades > 0 && (
                    <div className="pb-1">
                      <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded-lg whitespace-nowrap">
                        = ${(bulkCalc.costoBulto / bulkCalc.unidades).toFixed(2)}/u
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Costo ($)</label>
                    <input type="number" step="0.01" min="0" value={form.costoUSD || ''}
                      onChange={e => handleCostoChange(Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-indigo-400 outline-none transition-all placeholder:text-white/20" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70 mb-1.5 block">
                      Detal ($) {form.costoUSD > 0 && form.precioDetal > 0 && (
                        <span className="text-emerald-400 ml-1">{(((form.precioDetal - form.costoUSD) / form.costoUSD) * 100).toFixed(0)}%↑</span>
                      )}
                    </label>
                    <input type="number" step="0.01" min="0" value={form.precioDetal || ''}
                      onChange={e => handleDetalChange(Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-emerald-400 outline-none transition-all placeholder:text-white/20" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-violet-400/70 mb-1.5 block">Mayor ($)</label>
                    <input type="number" step="0.01" min="0" value={form.precioMayor || ''}
                      onChange={e => { setMayorManual(true); setForm(f => ({ ...f, precioMayor: Number(e.target.value) })); }}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-violet-400 outline-none transition-all placeholder:text-white/20" />
                  </div>
                </div>

                {/* ── SUGERENCIA DUALIS ── */}
                {smartAdvisor && form.costoUSD > 0 && (
                  <div className={`rounded-xl border px-3.5 py-3 flex items-start gap-3 transition-all ${
                    smartAdvisor.isApplied
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-indigo-500/30 bg-indigo-500/10'
                  }`}>
                    <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${
                      smartAdvisor.level === 'high' ? 'bg-amber-500/20' : smartAdvisor.level === 'low' ? 'bg-emerald-500/20' : 'bg-indigo-500/20'
                    }`}>
                      <TrendingUp size={13} className={
                        smartAdvisor.level === 'high' ? 'text-amber-400' : smartAdvisor.level === 'low' ? 'text-emerald-400' : 'text-indigo-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Sugerencia Dualis</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          smartAdvisor.level === 'high' ? 'bg-amber-500/20 text-amber-400' : smartAdvisor.level === 'low' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'
                        }`}>{smartAdvisor.reason}</span>
                      </div>
                      <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{smartAdvisor.tip}</p>
                      <p className="text-[10px] font-black text-white/60 mt-1">
                        ${form.costoUSD.toFixed(2)} × (1 + {smartAdvisor.suggestedMargin}%) = <span className="text-white">${smartAdvisor.suggestedPrice.toFixed(2)}</span>
                      </p>
                    </div>
                    {!smartAdvisor.isApplied && (
                      <button type="button" onClick={() => applyMargin(smartAdvisor.suggestedMargin)}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-500/30">
                        Aplicar
                      </button>
                    )}
                    {smartAdvisor.isApplied && (
                      <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="text-emerald-400 text-[10px]">✓</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── ROW 3: CATEGORÍA + STOCK ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Categoría</label>
                  <input
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    placeholder="General"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  {existingCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {existingCategories.map(cat => (
                        <button key={cat} type="button"
                          onClick={() => setForm(f => ({ ...f, categoria: cat }))}
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                            form.categoria === cat
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                          }`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Stock inicial</label>
                  <div className="flex items-center gap-2">
                    {[1, 5, 10, 25, 50].map(n => (
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({ ...f, stock: n }))}
                        className={`h-9 px-2.5 rounded-lg text-[10px] font-black transition-all border ${
                          form.stock === n
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/25'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:border-indigo-400 hover:text-indigo-600 bg-slate-50 dark:bg-white/[0.04]'
                        }`}>
                        {n}
                      </button>
                    ))}
                    <input type="number" min="0" value={form.stock}
                      onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))}
                      className="w-16 px-2 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* ── ADVANCED FIELDS (collapsible) ── */}
              {(quickMode && !editingId) ? (
                <button type="button"
                  onClick={() => setShowAdvanced(a => !a)}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors w-full">
                  <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  {showAdvanced ? 'Ocultar campos adicionales' : 'Más campos — Marca, Unidad, IVA, Proveedor'}
                </button>
              ) : null}

              {(!quickMode || editingId || showAdvanced) && (
                <div className="space-y-3 border-t border-slate-100 dark:border-white/[0.07] pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Marca</label>
                      <input value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Nike, Sony..."
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Unidad</label>
                      <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                        <option value="UND">UND</option>
                        <option value="KG">KG</option>
                        <option value="L">Litros</option>
                        <option value="M">Metros</option>
                        <option value="PAR">Par</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">IVA</label>
                      <select value={form.ivaTipo} onChange={e => {
                        const tipo = e.target.value as Product['ivaTipo'];
                        const tasa = tipo === 'GENERAL' ? 16 : tipo === 'REDUCIDO' ? 8 : 0;
                        setForm(f => ({ ...f, ivaTipo: tipo, iva: tasa }));
                      }} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                        <option value="GENERAL">16% General</option>
                        <option value="REDUCIDO">8% Reducido</option>
                        <option value="EXENTO">0% Exento</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Proveedor</label>
                      <input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Nombre proveedor"
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Ubicación</label>
                      <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Pasillo A-4"
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Stock mínimo</label>
                      <input type="number" min="0" value={form.stockMinimo} onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))}
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Peso (KG)</label>
                      <input type="number" step="0.001" min="0" value={form.peso || ''} onChange={e => setForm(f => ({ ...f, peso: Number(e.target.value) }))} placeholder="0.000"
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-3">
              <button type="button" onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all">
                Cerrar
              </button>
              <div className="flex-1" />
              {!editingId && (
                <button type="button" onClick={handleSaveAndClose}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-300 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all">
                  Guardar y Cerrar
                </button>
              )}
              <button type="button" onClick={handleSaveProduct}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 active:scale-95">
                {editingId ? <><CheckCircle2 size={13} /> Guardar</> : <><ArrowRight size={13} /> Guardar + Siguiente</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: STOCK ADJUSTMENT ═══════════════ */}
      {adjModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden overflow-y-auto max-h-[95vh] animate-in zoom-in-95 duration-500">
            <div className="p-6 sm:p-12 space-y-6 sm:space-y-10">
              <div className="text-center">
                <div className="h-16 w-16 sm:h-20 sm:w-20 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-2xl animate-pulse"><TrendingUp className="text-white" size={28} /></div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Ajuste de Stock</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-[0.2em]">{selectedProduct.nombre}</p>
              </div>
              <div className="space-y-5">
                <div className="flex p-2 bg-slate-100 dark:bg-white/[0.07] rounded-xl shadow-inner">
                  <button onClick={() => setAdjData({ ...adjData, type: 'AJUSTE' })} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'AJUSTE' ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-lg' : 'text-slate-400'}`}>Entrada / Ajuste</button>
                  <button onClick={() => setAdjData({ ...adjData, type: 'MERMA' })} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'MERMA' ? 'bg-white dark:bg-white/[0.1] text-rose-600 shadow-xl' : 'text-slate-400'}`}>Salida / Merma</button>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Cantidad de Unidades</label>
                  <input type="number" value={adjData.quantity} onChange={e => setAdjData({ ...adjData, quantity: Number(e.target.value) })} className="w-full px-6 py-6 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-3xl font-black text-center focus:ring-4 focus:ring-slate-900 shadow-inner" placeholder="0" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Razón de la Auditoría</label>
                  <textarea rows={3} value={adjData.reason} onChange={e => setAdjData({ ...adjData, reason: e.target.value })} className="w-full px-6 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 shadow-inner resize-none" placeholder="Explique el motivo del cambio..." />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setAdjModalOpen(false)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors">Cerrar</button>
                <button onClick={handleAdjustStock} className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-md shadow-indigo-500/25 active:scale-95">Ejecutar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: IMPORT WIZARD ═══════════════ */}
      {importModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 sm:px-10 py-5 sm:py-8 border-b border-slate-100 dark:border-white/[0.07] bg-gradient-to-r from-indigo-50 to-violet-50 flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Upload size={18} className="text-indigo-600" />
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Importador Inteligente</h2>
                </div>
                {/* Steps */}
                <div className="flex items-center gap-2 mt-2">
                  {['Archivo', 'Mapear', 'Vista Previa', 'Resultado'].map((s, i) => (
                    <React.Fragment key={i}>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${importStep === i ? 'bg-indigo-600 text-white' : importStep > i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400'}`}>{s}</span>
                      {i < 3 && <ArrowRight size={10} className="text-slate-300" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button onClick={() => setImportModal(false)} className="p-3 hover:bg-white dark:hover:bg-white/[0.04] dark:bg-white/[0.04] rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scroll">

              {/* STEP 0: Upload */}
              {importStep === 0 && (
                <div className="p-10 space-y-4">
                  <div
                    onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                    onDragLeave={() => setImportDragOver(false)}
                    onDrop={e => { e.preventDefault(); setImportDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileLoad(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all ${importDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 dark:border-white/10 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-white/[0.06]'}`}>
                    <div className="h-20 w-20 rounded-xl bg-white dark:bg-white/[0.06] shadow-lg flex items-center justify-center mb-6">
                      <Upload size={32} className="text-indigo-400" />
                    </div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">Arrastra tu archivo aquí</p>
                    <p className="text-xs text-slate-400 font-medium mt-2">o haz clic para seleccionar</p>
                    <div className="flex gap-3 mt-5">
                      {['CSV', 'XLSX', 'XLS'].map(t => (
                        <span key={t} className="px-3 py-1.5 bg-slate-100 dark:bg-white/[0.07] rounded-lg text-[9px] font-black uppercase tracking-wider text-slate-500">{t}</span>
                      ))}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileLoad(f); }} />
                  </div>

                  {/* ── PASTE FROM EXCEL ─────────────────────────── */}
                  <div className="relative flex items-center gap-4">
                    <div className="flex-1 border-t border-slate-200 dark:border-white/10" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">o pega texto directamente</span>
                    <div className="flex-1 border-t border-slate-200 dark:border-white/10" />
                  </div>
                  <div className="space-y-3">
                    <textarea
                      rows={5}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-white/[0.06] border-2 border-slate-200 dark:border-white/10 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none resize-none placeholder:text-slate-300"
                      placeholder={"Pega aquí el contenido copiado de Excel (Ctrl+C en Excel → Ctrl+V aquí)\n\nEjemplo:\nNOMBRE\tUNIDAD\tPRECIO COSTO\tMARGEN\tPRECIO DETAL\nMARY ARROZ 900G\t1\t1,5\t25%\t1,88"}
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                    />
                    {pasteText.trim() && (
                      <button
                        onClick={handlePasteLoad}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Upload size={14} /> Procesar texto pegado
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-50 dark:bg-white/[0.06] rounded-xl p-6 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campos reconocidos automáticamente</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(FIELD_LABELS_DISPLAY).map(([k, v]) => (
                        <span key={k} className="px-3 py-1 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-[9px] font-bold text-slate-600 dark:text-slate-400">{v}</span>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2">El sistema detecta automáticamente tus columnas, aunque tengan nombres distintos.</p>
                  </div>
                </div>
              )}

              {/* STEP 1: Column mapping */}
              {importStep === 1 && (
                <div className="p-10 space-y-4">
                  {/* Options */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-50 dark:bg-white/[0.06] rounded-2xl space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modo de Importación</p>
                      <div className="flex gap-2">
                        {([{ v: 'flexible', l: 'Flexible', d: 'Solo requiere nombre' }, { v: 'strict', l: 'Estricto', d: 'Requiere código, costo y stock' }] as const).map(m => (
                          <button key={m.v} onClick={() => setImportMode(m.v)}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${importMode === m.v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40'}`}>
                            {m.l}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400">{importMode === 'flexible' ? 'Solo requiere nombre.' : 'Requiere código, costo y stock.'}</p>
                    </div>
                    <div className="p-5 bg-slate-50 dark:bg-white/[0.06] rounded-2xl space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Productos Duplicados</p>
                      <div className="flex gap-2">
                        {([{ v: 'skip', l: 'Omitir' }, { v: 'overwrite', l: 'Sobreescribir' }] as const).map(m => (
                          <button key={m.v} onClick={() => setDupMode(m.v)}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${dupMode === m.v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40'}`}>
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
                    <div className="border border-slate-100 dark:border-white/[0.07] rounded-2xl overflow-hidden">
                      <div className="grid grid-cols-3 gap-0 bg-slate-50 dark:bg-white/[0.06] px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <span>Columna del Archivo</span>
                        <span>Campo Detectado</span>
                        <span>Campo Final</span>
                      </div>
                      {importHeaders.map((h) => {
                        const det = detectedMap[h];
                        const conf = det?.confidence ?? 0;
                        const confColor = conf >= 85 ? 'text-emerald-600' : conf >= 60 ? 'text-amber-600' : 'text-slate-400';
                        return (
                          <div key={h} className="grid grid-cols-3 gap-4 items-center px-5 py-3.5 border-t border-slate-50 hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-white/[0.03] transition-colors">
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{h}</p>
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
                              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
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
                <div className="p-10 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl">
                    <Eye size={16} className="text-indigo-500" />
                    <p className="text-xs font-bold text-indigo-700">Vista previa de las primeras 8 filas — {importRows.length} filas totales</p>
                  </div>
                  <div className="overflow-x-auto border border-slate-100 dark:border-white/[0.07] rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-white/[0.06] border-b border-slate-100 dark:border-white/[0.07]">
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
                          <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-white/[0.03]">
                            {importHeaders.filter(h => userMap[h]).map((h) => (
                              <td key={h} className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap max-w-[150px] truncate">
                                {row[importHeaders.indexOf(h)] || <span className="text-slate-300 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/[0.06] rounded-2xl text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> {importRows.length} filas a procesar</span>
                    <span className="flex items-center gap-1.5"><Shuffle size={14} className="text-indigo-500" /> {Object.values(userMap).filter(Boolean).length} campos mapeados</span>
                    <span className="flex items-center gap-1.5"><AlertCircle size={14} className="text-amber-500" /> Modo: {importMode === 'flexible' ? 'Flexible' : 'Estricto'}</span>
                  </div>
                </div>
              )}

              {/* STEP 3: Result */}
              {importStep === 3 && (
                <div className="p-10 space-y-4 text-center">
                  <div className="h-24 w-24 rounded-xl mx-auto flex items-center justify-center shadow-2xl" style={{ background: importResult.ok > 0 ? '#059669' : '#dc2626' }}>
                    {importResult.ok > 0 ? <CheckCircle2 size={40} className="text-white" /> : <AlertCircle size={40} className="text-white" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Importación completada</h3>
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
            <div className="px-10 py-7 border-t border-slate-100 dark:border-white/[0.07] flex justify-between items-center shrink-0 bg-slate-50 dark:bg-white/[0.02]">
              <button
                onClick={() => { if (importStep === 0) { setImportModal(false); } else if (importStep === 3) { resetImport(); } else { setImportStep(s => s - 1); } }}
                className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:bg-white/[0.07] transition-all flex items-center gap-2">
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
                <button onClick={() => setImportModal(false)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95">
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: BARCODE PRINT ═══════════════ */}
      {barcodeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[92vh]">
            <div className="px-10 py-8 border-b border-slate-100 dark:border-white/[0.07] flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-3">
                  <Printer size={20} className="text-slate-600 dark:text-slate-400" />
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Imprimir Etiquetas con Código de Barras</h2>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PDF A4 · Code128 · Compatible con lectores</p>
              </div>
              <button onClick={() => setBarcodeModal(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:bg-white/[0.07] rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* Left: product selector */}
              <div className="w-[55%] border-r border-slate-100 dark:border-white/[0.07] flex flex-col">
                <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{barSelected.size} de {products.length} seleccionados</p>
                  <div className="flex gap-2">
                    <button onClick={() => setBarSelected(new Set(products.map(p => p.id)))} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-all">Todos</button>
                    <button onClick={() => setBarSelected(new Set())} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-white/[0.07] text-slate-500 rounded-lg hover:bg-slate-200 transition-all">Ninguno</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll divide-y divide-slate-50">
                  {products.map(p => (
                    <div key={p.id} onClick={() => setBarSelected(prev => {
                      const s = new Set(prev);
                      s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                      return s;
                    })} className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-all ${barSelected.has(p.id) ? 'bg-slate-50 dark:bg-white/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-white/[0.03]'}`}>
                      <div className={`shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${barSelected.has(p.id) ? 'bg-slate-900 border-slate-900' : 'border-slate-300 dark:border-white/15'}`}>
                        {barSelected.has(p.id) && <CheckSquare size={12} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">{p.nombre}</p>
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
                          className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${barOpts.labelW === s.w && barOpts.labelH === s.h ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-400'}`}>
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
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${barOpts.cols === n ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-400'}`}>
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
                        <label key={opt.key} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 dark:bg-white/[0.06] rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:bg-white/[0.07] transition-all">
                          <input type="checkbox" checked={(barOpts as any)[opt.key]} onChange={e => setBarOpts(o => ({ ...o, [opt.key]: e.target.checked }))} className="rounded" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{opt.label}</span>
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
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${barOpts.priceType === t.v ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-400'}`}>
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
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${barOpts.copies === n ? 'bg-slate-900 text-white' : 'bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-400'}`}>
                          {n}
                        </button>
                      ))}
                      <input type="number" min={1} max={20} value={barOpts.copies} onChange={e => setBarOpts(o => ({ ...o, copies: Math.max(1, Number(e.target.value)) }))}
                        className="flex-1 py-2.5 px-3 text-center bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-400 focus:outline-none" />
                    </div>
                  </div>

                  {/* Label preview */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Vista Previa de Etiqueta</p>
                    <div className="bg-slate-100 dark:bg-white/[0.07] rounded-2xl p-6 flex items-center justify-center">
                      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/15 rounded shadow-lg flex flex-col items-center justify-center gap-1 p-2"
                        style={{ width: `${barOpts.labelW * 1.8}px`, height: `${barOpts.labelH * 1.8}px`, minWidth: 120, minHeight: 70 }}>
                        {/* fake barcode visual */}
                        <div className="flex gap-px">
                          {Array.from({ length: 28 }).map((_, i) => (
                            <div key={i} className="bg-slate-900 rounded-sm" style={{ width: `${[1, 2, 1, 3, 1, 2, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 1, 2, 3, 1, 1, 2, 1, 2, 3, 1, 2, 1][i] * 1.5}px`, height: '28px' }} />
                          ))}
                        </div>
                        {barOpts.showSku && <p className="text-[7px] font-mono text-slate-600 dark:text-slate-400">SKU-EJEMPLO</p>}
                        {barOpts.showName && <p className="text-[6px] font-black text-slate-900 dark:text-white truncate w-full text-center">Nombre del Producto</p>}
                        {barOpts.showPrice && <p className="text-[8px] font-black text-slate-900 dark:text-white">$12.50</p>}
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
            <div className="px-10 py-7 border-t border-slate-100 dark:border-white/[0.07] flex justify-between items-center shrink-0">
              <button onClick={() => setBarcodeModal(false)} className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:bg-white/[0.07] transition-all">Cancelar</button>
              <button
                onClick={handleGenerateBarcodes}
                disabled={generatingPdf || barSelected.size === 0}
                className="flex items-center gap-3 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-40 shadow-lg shadow-black/10">
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
