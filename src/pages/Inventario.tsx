import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  updateDoc,
  query,
  where,
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
  Info,
  Truck,
  Camera,
  ImageIcon,
  ClipboardCheck,
  ArrowRightLeft,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { useRates } from '../context/RatesContext';
import { computeDynamicPrices, isDynamicProduct, findCustomRate } from '../utils/dynamicPricing';
import { uploadToCloudinary } from '../utils/cloudinary';
import { getAlmacenStock, getTotalStock } from '../utils/stockHelpers';
import type { Supplier, Movement } from '../../types';
import RecepcionModal from '../components/inventory/RecepcionModal';
import PhysicalCountModal from '../components/inventory/PhysicalCountModal';
import TransferStockModal from '../components/inventory/TransferStockModal';
import ExpirationAlerts from '../components/inventory/ExpirationAlerts';
import SmartRestockAlerts from '../components/inventory/SmartRestockAlerts';

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
  precioBCV: number;
  precioGrupo: number;
  precioDivisa: number;
  preciosCuenta: Record<string, number>;
  stock: number;
  stockByAlmacen?: Record<string, number>;
  stockMinimo: number;
  iva: number;
  ivaTipo: 'GENERAL' | 'REDUCIDO' | 'EXENTO';
  unidad: string;
  peso: number;
  descripcion: string;
  tipoTasa?: string;       // 'BCV' | customRate.id — clasificación de tasa
  margenMayor?: number;    // margen % para precio mayor (productos dinámicos)
  margenDetal?: number;    // margen % para precio detal (productos dinámicos)
  status?: 'active' | 'pending_review';
  pendingBy?: string;
  unitType?: 'unidad' | 'kg' | 'g' | 'ton' | 'lt' | 'ml' | 'lb';
  imageUrl?: string;
  images?: string[];       // Fase G.9: galería multi-foto (URLs Cloudinary)
  // Fase F.4 — Precios por tier de fidelidad. Override de precioDetal/precioMayor
  // según el tier del cliente. Si no existe, se usa el precio base.
  pricesByTier?: Record<string, { precioDetal?: number; precioMayor?: number }>;
  fechaVencimiento?: string;  // ISO date YYYY-MM-DD
  lote?: string;
  unidadesPorBulto?: number;  // Fase B: ej. 12 (1 bulto = 12 unidades). Default 1/undefined = legacy unidad
  barcode?: string;           // Fase B: código de barras (lector USB / cámara)
  // Fase G — Combos / Kits. Si isKit=true, al vender el kit se descuentan los componentes
  // (no el kit). El kit puede tener su propio precio (promo), distinto a la suma de partes.
  // Stock del kit es informativo: el límite real es min(componente.stock / qty) por componente.
  isKit?: boolean;
  kitComponents?: Array<{ productId: string; productName?: string; qty: number }>;
  // Fase 9.4 — Variantes (talla, color, etc.). Cada variante hereda precio/IVA
  // del padre salvo override. Stock se gestiona POR variante, no en el padre.
  hasVariants?: boolean;
  variantAttributes?: string[];  // ej: ['Talla','Color']
  variants?: ProductVariant[];
};

type ProductVariant = {
  id: string;           // nanoid o auto
  sku: string;          // código único de la variante
  values: Record<string, string>; // { Talla: 'M', Color: 'Rojo' }
  stock: number;
  precioDetal?: number; // override — si undefined, hereda del padre
  precioMayor?: number;
  costoUSD?: number;
  barcode?: string;
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

type TabType = 'catalog' | 'kardex' | 'tools' | 'almacenes';

const UNIT_LABELS: Record<NonNullable<Product['unitType']>, string> = {
  unidad: 'UND', kg: 'kg', g: 'g', ton: 'ton', lt: 'L', ml: 'mL', lb: 'lb',
};

type Almacen = {
  id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  orden: number;
  createdAt?: string;
};

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
  precioBCV: 0,
  precioGrupo: 0,
  precioDivisa: 0,
  preciosCuenta: {},
  stock: 0,
  stockMinimo: 5,
  iva: 16,
  ivaTipo: 'GENERAL',
  unidad: 'UND',
  peso: 0,
  descripcion: '',
  tipoTasa: 'BCV',
  margenMayor: 0,
  margenDetal: 0,
  unitType: 'unidad',
  unidadesPorBulto: 1,
  barcode: '',
  isKit: false,
  kitComponents: [],
  hasVariants: false,
  variantAttributes: [],
  variants: [],
  images: [],
};

// ─── IMPORT AUTO-DETECTION ────────────────────────────────────────────────────
const FIELD_ALIASES: Record<keyof Omit<Product, 'id' | 'ivaTipo' | 'preciosCuenta' | 'stockByAlmacen' | 'status' | 'pendingBy' | 'unitType' | 'imageUrl' | 'images' | 'fechaVencimiento' | 'lote' | 'unidadesPorBulto' | 'barcode' | 'isKit' | 'kitComponents' | 'hasVariants' | 'variantAttributes' | 'variants' | 'pricesByTier'> | 'margen', string[]> = {
  codigo:       ['código','codigo','code','sku','barcode','cod','upc','ean','referencia','ref'],
  nombre:       ['nombre','name','producto','descripción','descripcion','description','item','artículo','articulo','denominacion'],
  categoria:    ['categoría','categoria','category','grupo','tipo','type','familia','rubro'],
  marca:        ['marca','brand','fabricante','manufacturer','maker'],
  proveedor:    ['proveedor','supplier','vendor','distribuidor','suplidor','proveedor principal'],
  ubicacion:    ['ubicación','ubicacion','location','pasillo','almacen','deposito','bodega','shelf'],
  costoUSD:     ['costo','cost','precio_costo','costousd','precio base','base price','costo usd','costo $','precio compra'],
  precioDetal:  ['detal','retail','precio_detal','precio detal','venta','sale price','pvp','precio venta','precio minorista','minorista'],
  precioMayor:  ['mayor','wholesale','precio_mayor','precio mayor','wholesale price','precio mayorista','mayorista'],
  precioBCV:    ['precio bcv','preciobcv','bcv','precio_bcv','bcv usd'],
  precioGrupo:  ['precio grupo','preciogrupo','grupo','precio_grupo','group price'],
  precioDivisa: ['precio divisa','preciodivisa','divisa','precio_divisa','foreign price','divisa usd'],
  stock:        ['stock','cantidad','quantity','existencia','inventario','qty','disponible','unidades'],
  stockMinimo:  ['mínimo','minimo','minimum','stock_minimo','stock minimo','min stock','alerta','stock alerta'],
  iva:          ['iva','tax','impuesto','vat','tasa iva','%iva'],
  unidad:       ['unidad','unit','um','measure','unidad medida','u/m'],
  peso:         ['peso','weight','kg','gramos'],
  descripcion:  ['descripcion','descripción','detalle','notes','notas','obs','observaciones'],
  tipoTasa:     ['tipo tasa','tipotasa','rate type','tipo_tasa','tasa'],
  margenMayor:  ['margen mayor','margenmayor','margin wholesale','margen_mayor'],
  margenDetal:  ['margen detal','margendetal','margin retail','margen_detal'],
  margen:       ['margen','margin','%margen','markup','ganancia','margen %','utilidad'],
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
  <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 flex items-center gap-3 sm:gap-4 hover:shadow-xl hover:shadow-black/15 transition-all group">
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
  const { rates, customRates, zoherEnabled } = useRates();
  const tenantId = userProfile?.businessId;
  const userRole = userProfile?.role;
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const isAlmacenista = userRole === 'almacenista';
  const isInventario = userRole === 'inventario';   // Jefe de Inventario: edita precios, aprueba pendientes
  const isReadOnlyRole = userRole === 'ventas' || userRole === 'staff' || userRole === 'member';
  const canEditProduct   = isAdmin || isInventario;
  const canDeleteProduct = isAdmin;
  const canAddStock      = isAdmin || isAlmacenista || isInventario;
  const canRegisterNew   = isAdmin || isAlmacenista || isInventario;
  const canBulkEdit      = isAdmin || isInventario;
  const { canAccess } = useSubscription(tenantId || '');
  const hasDynamicPricing = canAccess('precios_dinamicos');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // ── ALMACENES ──────────────────────────────────────────────────────────────
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string>('principal');
  const [almacenModalOpen, setAlmacenModalOpen] = useState(false);
  const [editingAlmacenId, setEditingAlmacenId] = useState<string | null>(null);
  const [almacenForm, setAlmacenForm] = useState({ nombre: '', descripcion: '', activo: true });
  const [almacenSaving, setAlmacenSaving] = useState(false);

  // Catalog states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'low' | 'out'>('all');
  const [filterAlmacen, setFilterAlmacen] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nombre' | 'stock' | 'precio' | 'costo'>('nombre');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialProduct);
  const [quickMode, setQuickMode] = useState(true);
  const [showExtras, setShowExtras] = useState(false);
  const [mayorManual, setMayorManual] = useState(false);
  const [customMarginDetal, setCustomMarginDetal] = useState('');
  const [customMarginMayor, setCustomMarginMayor] = useState('');
  const [stickyMargin, setStickyMargin] = useState<number>(() => {
    const saved = localStorage.getItem('dualis_last_margin');
    return saved ? parseFloat(saved) : 30;
  });
  const [bulkCalc, setBulkCalc] = useState({ costoBulto: 0, unidades: 0 });
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Stock adjustment states
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjData, setAdjData] = useState({ type: 'AJUSTE', quantity: 0, reason: '' });
  const [adjUpdatePrices, setAdjUpdatePrices] = useState(false);
  const [adjPrices, setAdjPrices] = useState<Record<string, number>>({ costoUSD: 0, precioDetal: 0, precioMayor: 0 });
  const [adjCostoUSD, setAdjCostoUSD] = useState(0);
  const [adjSupplierId, setAdjSupplierId] = useState('');

  // Suppliers (for stock adjustment + recepción)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showRecepcion, setShowRecepcion] = useState(false);
  const [showPhysicalCount, setShowPhysicalCount] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

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
      setProducts(snap.docs.map(d => {
        const data = d.data();
        // Merge legacy price fields into preciosCuenta
        const pc: Record<string, number> = data.preciosCuenta || {};
        if (data.precioBCV && !pc.BCV) pc.BCV = data.precioBCV;
        if (data.precioGrupo && !pc.GRUPO) pc.GRUPO = data.precioGrupo;
        if (data.precioDivisa && !pc.DIVISA) pc.DIVISA = data.precioDivisa;
        const merged = {
          id: d.id,
          precioBCV: 0,
          precioGrupo: 0,
          precioDivisa: 0,
          preciosCuenta: {},
          ...data,
        };
        merged.preciosCuenta = { ...pc, ...(data.preciosCuenta || {}) };
        return merged as Product;
      }));
      setLoading(false);
    });
    const qMov = query(collection(db, `businesses/${tenantId}/stock_movements`), orderBy('createdAt', 'desc'), limit(50));
    const unsubMov = onSnapshot(qMov, (snap) => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockMovement)));
    });
    return () => { unsubProd(); unsubMov(); };
  }, [tenantId]);

  // Load almacenes
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, `businesses/${tenantId}/almacenes`), orderBy('orden', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Almacen));
      setAlmacenes(list);
      // If current selectedAlmacenId not in list, reset to first or 'principal'
      if (list.length > 0 && !list.find(a => a.id === selectedAlmacenId)) {
        setSelectedAlmacenId(list[0].id);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Load suppliers for stock adjustment proveedor dropdown
  useEffect(() => {
    if (!tenantId) return;
    // Canonical source: root `suppliers` collection filtered by businessId
    // (same as CxP / MainSystem). The per-tenant subcollection was unused.
    const qSupp = query(collection(db, 'suppliers'), where('businessId', '==', tenantId));
    const unsub = onSnapshot(qSupp, (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    });
    return () => unsub();
  }, [tenantId]);

  // Load preset categories/units (seeded by Onboarding) — used as fallback
  // suggestions when the catalog is empty.
  const [presetCategories, setPresetCategories] = useState<string[]>([]);
  const [presetUnits, setPresetUnits] = useState<string[]>([]);
  // Recepción de mercancía — default true (costo promedio + lotes FEFO implementados).
  // El admin puede desactivar desde Configuración → Inventario si lo prefiere.
  const [recepcionEnabled, setRecepcionEnabled] = useState<boolean>(true);
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(doc(db, 'businessConfigs', tenantId), (snap) => {
      const data = snap.data() || {};
      if (Array.isArray(data.presetCategories)) setPresetCategories(data.presetCategories);
      if (Array.isArray(data.presetUnits)) setPresetUnits(data.presetUnits);
      setRecepcionEnabled(data?.inventoryConfig?.recepcionEnabled !== false);
    });
    return () => unsub();
  }, [tenantId]);

  const handleSaveAlmacen = async () => {
    if (!tenantId || !almacenForm.nombre.trim()) return;
    setAlmacenSaving(true);
    try {
      if (editingAlmacenId) {
        await updateDoc(doc(db, `businesses/${tenantId}/almacenes`, editingAlmacenId), {
          nombre: almacenForm.nombre.trim(),
          descripcion: almacenForm.descripcion.trim(),
          activo: almacenForm.activo,
        });
      } else {
        const maxOrden = almacenes.length > 0 ? Math.max(...almacenes.map(a => a.orden)) + 1 : 0;
        await addDoc(collection(db, `businesses/${tenantId}/almacenes`), {
          nombre: almacenForm.nombre.trim(),
          descripcion: almacenForm.descripcion.trim(),
          activo: almacenForm.activo,
          orden: maxOrden,
          createdAt: new Date().toISOString(),
        });
      }
      setAlmacenModalOpen(false);
      setEditingAlmacenId(null);
      setAlmacenForm({ nombre: '', descripcion: '', activo: true });
    } finally {
      setAlmacenSaving(false);
    }
  };

  const handleDeleteAlmacen = async (almacen: Almacen) => {
    if (!tenantId) return;
    // Check if any product has stock in this almacén
    const hasStock = products.some(p => getAlmacenStock(p, almacen.id) > 0);
    if (hasStock) {
      alert(`No se puede eliminar "${almacen.nombre}" porque tiene productos con stock asignado.`);
      return;
    }
    if (!window.confirm(`¿Eliminar almacén "${almacen.nombre}"?`)) return;
    await deleteDoc(doc(db, `businesses/${tenantId}/almacenes`, almacen.id));
    if (selectedAlmacenId === almacen.id) {
      setSelectedAlmacenId(almacenes.find(a => a.id !== almacen.id)?.id || 'principal');
    }
  };

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
    // Sync preciosCuenta to legacy fields for backward compat
    const pc = form.preciosCuenta || {};
    // Build stockByAlmacen for new products
    const almacenId = almacenes.length > 0 ? selectedAlmacenId : 'principal';
    const stockByAlmacen = editingId
      ? undefined  // don't overwrite on edit; use dedicated stock adjust
      : { [almacenId]: form.stock };
    const payload: Record<string, any> = {
      ...form,
      precioBCV: pc.BCV || form.precioBCV || 0,
      precioGrupo: pc.GRUPO || form.precioGrupo || 0,
      precioDivisa: pc.DIVISA || form.precioDivisa || 0,
      preciosCuenta: pc,
      updatedAt: new Date().toISOString(),
    };
    if (stockByAlmacen) payload.stockByAlmacen = stockByAlmacen;
    if (editingId) {
      delete payload.stockByAlmacen; // keep existing stockByAlmacen on edit
      // When admin/inventario edits a pending_review product, approve it automatically
      const currentProduct = products.find(p => p.id === editingId);
      if (currentProduct?.status === 'pending_review' && (isAdmin || isInventario)) {
        payload.status = 'active';
        payload.pendingBy = null;
      }
      await setDoc(doc(db, `businesses/${tenantId}/products`, editingId), payload, { merge: true });
      setModalOpen(false);
      setForm(initialProduct);
      setEditingId(null);
    } else {
      if (isAlmacenista) {
        payload.status = 'pending_review';
        payload.pendingBy = userProfile?.uid || '';
        payload.precioDetal = 0;
        payload.precioMayor = 0;
        payload.costoUSD = 0;
      }
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

  const handleImageUpload = async (file: File) => {
    if (!file || uploadingImage) return;
    setUploadingImage(true);
    try {
      // Client-side compression: resize to max 800px and convert to JPEG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      const maxSize = 800;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = (height / width) * maxSize; width = maxSize; }
        else { width = (width / height) * maxSize; height = maxSize; }
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) throw new Error('Failed to compress image');
      const compressedFile = new File([blob], 'product.jpg', { type: 'image/jpeg' });
      const result = await uploadToCloudinary(compressedFile, 'dualis_products');
      setForm(f => ({ ...f, imageUrl: result.secure_url }));
    } catch (err) {
      console.error('Image upload error:', err);
    } finally {
      setUploadingImage(false);
    }
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
    () => {
      const fromProducts = [...new Set(products.map(p => p.categoria).filter(Boolean))];
      if (fromProducts.length > 0) return fromProducts.slice(0, 8);
      // Fallback to preset categories seeded by Onboarding
      return presetCategories.slice(0, 8);
    },
    [products, presetCategories],
  );
  const pendingProducts = useMemo(
    () => products.filter(p => p.status === 'pending_review'),
    [products]
  );

  const PAGE_SIZE = 25;
  const uniqueCategories = useMemo(
    () => [...new Set(products.map(p => p.categoria).filter(Boolean))].sort(),
    [products]
  );
  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    let list = products;
    if (q) list = list.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q)
    );
    if (filterCategoria !== 'all') list = list.filter(p => p.categoria === filterCategoria);
    if (filterStock === 'low') list = list.filter(p => p.stock > 0 && p.stock < (p.stockMinimo || 5));
    if (filterStock === 'out') list = list.filter(p => p.stock === 0);
    if (filterAlmacen !== 'all') {
      // Show products that have an entry in this almacen, or legacy products under 'principal'
      list = list.filter(p =>
        (p.stockByAlmacen && Object.prototype.hasOwnProperty.call(p.stockByAlmacen, filterAlmacen)) ||
        (filterAlmacen === 'principal')
      );
    }
    list = [...list].sort((a, b) => {
      let va: any, vb: any;
      if (sortBy === 'nombre') { va = (a.nombre || '').toLowerCase(); vb = (b.nombre || '').toLowerCase(); }
      else if (sortBy === 'stock') { va = a.stock; vb = b.stock; }
      else if (sortBy === 'precio') { va = a.precioDetal; vb = b.precioDetal; }
      else { va = a.costoUSD; vb = b.costoUSD; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, searchTerm, filterCategoria, filterStock, filterAlmacen, sortBy, sortDir]);
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pagedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterCategoria, filterStock, filterAlmacen]);
  const selectPage = () => setSelectedIds(new Set(pagedProducts.map(p => p.id)));
  const selectAllProducts = () => setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  const selectAll = selectPage; // alias used in header checkbox
  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every(p => selectedIds.has(p.id));
  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));

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
    const addedQty = Number(adjData.quantity);
    const newStock = selectedProduct.stock + addedQty;
    const updatePayload: Record<string, any> = { stock: newStock };

    // Mantener stockByAlmacen en sync con la operación.
    // Si el producto ya tiene el mapa, actualizamos el almacén seleccionado.
    // Si no lo tiene (legacy), lo inicializamos con el stock total en 'principal'
    // antes de aplicar el ajuste, para que productos viejos migren al modelo nuevo
    // sin perder data.
    const targetAlmacen = (filterAlmacen !== 'all' ? filterAlmacen : selectedAlmacenId) || 'principal';
    const existingMap = selectedProduct.stockByAlmacen || {};
    const baseAlmacenStock = Object.prototype.hasOwnProperty.call(existingMap, targetAlmacen)
      ? Number(existingMap[targetAlmacen] || 0)
      : (targetAlmacen === 'principal' ? Number(selectedProduct.stock || 0) : 0);
    const newAlmacenStock = Math.max(0, baseAlmacenStock + addedQty);
    updatePayload.stockByAlmacen = {
      ...existingMap,
      [targetAlmacen]: newAlmacenStock,
    };

    // Costo promedio ponderado — siempre activo en entradas
    const oldStock = selectedProduct.stock;
    const oldCost = selectedProduct.costoUSD || 0;
    const newCostInput = adjCostoUSD;
    if (adjData.type === 'AJUSTE' && addedQty > 0 && newCostInput > 0) {
      const weightedCost = (oldStock > 0 && newStock > 0)
        ? parseFloat(((oldStock * oldCost + addedQty * newCostInput) / newStock).toFixed(4))
        : newCostInput;
      updatePayload.costoUSD = weightedCost;
      updatePayload.previousCostoUSD = oldCost;
    }

    // Optional: actualizar precios de venta si el usuario expande esa sección
    if (adjUpdatePrices && adjData.type === 'AJUSTE') {
      updatePayload.precioDetal = Number(adjPrices.precioDetal) || 0;
      updatePayload.precioMayor = Number(adjPrices.precioMayor) || 0;
      const pc: Record<string, number> = {};
      for (const rate of customRates) {
        pc[rate.id] = Number(adjPrices[`cuenta_${rate.id}`]) || 0;
      }
      updatePayload.preciosCuenta = pc;
      updatePayload.precioBCV = pc.BCV || 0;
      updatePayload.precioGrupo = pc.GRUPO || 0;
      updatePayload.precioDivisa = pc.DIVISA || 0;
    }

    await setDoc(doc(db, `businesses/${tenantId}/products`, selectedProduct.id), updatePayload, { merge: true });

    const supplierInfo = adjSupplierId
      ? suppliers.find(s => s.id === adjSupplierId)
      : null;

    await addDoc(collection(db, `businesses/${tenantId}/stock_movements`), {
      productId: selectedProduct.id,
      productName: selectedProduct.nombre,
      type: adjData.type,
      quantity: addedQty,
      reason: adjData.reason,
      ...(adjData.type === 'AJUSTE' && newCostInput > 0 ? { weightedAvgCost: updatePayload.costoUSD, previousCost: oldCost, newCostInput } : {}),
      ...(adjUpdatePrices ? { pricesUpdated: true, newPrices: { ...adjPrices } } : {}),
      ...(supplierInfo ? { proveedorId: supplierInfo.id, proveedorNombre: supplierInfo.contacto || supplierInfo.rif } : {}),
      userName: userProfile?.fullName || 'Admin',
      createdAt: serverTimestamp()
    });
    setAdjModalOpen(false);
    setSelectedProduct(null);
    setAdjData({ type: 'AJUSTE', quantity: 0, reason: '' });
    setAdjUpdatePrices(false);
    setAdjCostoUSD(0);
    setAdjSupplierId('');
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
        precioBCV: num('precioBCV'),
        precioGrupo: num('precioGrupo'),
        precioDivisa: num('precioDivisa'),
        preciosCuenta: {
          ...(num('precioBCV') > 0 ? { BCV: num('precioBCV') } : {}),
          ...(num('precioGrupo') > 0 ? { GRUPO: num('precioGrupo') } : {}),
          ...(num('precioDivisa') > 0 ? { DIVISA: num('precioDivisa') } : {}),
        },
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
    <div className="min-h-full bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-6 pb-10 font-inter">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10">

        {/* DASHBOARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <KPICard title="Capital en Stock" value={`$${metrics.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} subtext={`${metrics.totalItems} unidades en bodega`} icon={BadgeDollarSign} colorClass="bg-emerald-50 text-emerald-600 shadow-emerald-100" />
            <span className="absolute top-3 right-3 relative group cursor-help">
              <Info size={12} className="text-slate-400 dark:text-slate-600" />
              <span className="absolute right-0 bottom-full mb-2 w-52 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-900 text-[10px] text-white/80 font-medium shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-center leading-relaxed">
                Valor total de tu inventario calculado con costo unitario x stock. Los productos dinamicos usan el costo + margen.
              </span>
            </span>
          </div>
          <KPICard title="Alertas Críticas" value={metrics.lowStockCount} subtext="Revisiones de stock urgentes" icon={AlertTriangle} colorClass="bg-rose-50 text-rose-600 shadow-rose-100" />
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 flex flex-col group h-full min-h-[140px]">
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
          <div className="flex gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.07] rounded-xl shadow-sm overflow-x-auto">
            {[
              { id: 'catalog', label: 'Catálogo', icon: Package },
              { id: 'kardex', label: 'Kardex', icon: History },
              { id: 'almacenes', label: 'Almacenes', icon: Layers },
              { id: 'tools', label: 'Herramientas', icon: Settings2 },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <tab.icon size={13} /> {tab.label}
              </button>
            ))}
          </div>
          {canRegisterNew && (
          <div className="flex items-center gap-2">
            {almacenes.filter(a => a.activo !== false).length >= 2 && (
              <button onClick={() => setShowTransfer(true)}
                className="flex items-center justify-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-sky-600 to-cyan-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-md shadow-sky-500/25 active:scale-95">
                <ArrowRightLeft size={16} /> Transferir
              </button>
            )}
            <button onClick={() => setShowPhysicalCount(true)}
              className="flex items-center justify-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-md shadow-amber-500/25 active:scale-95">
              <ClipboardCheck size={16} /> Conteo Físico
            </button>
            {recepcionEnabled ? (
              <button onClick={() => setShowRecepcion(true)}
                className="flex items-center justify-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-md shadow-emerald-500/25 active:scale-95">
                <Truck size={16} /> Recibir Mercancía
              </button>
            ) : (
              <button
                disabled
                title="Módulo en construcción. Actívalo desde Configuración → Inventario si quieres probar la beta."
                className="flex items-center justify-center gap-2.5 px-5 py-2.5 bg-slate-200 dark:bg-white/[0.04] text-slate-400 dark:text-white/30 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] cursor-not-allowed border border-dashed border-slate-300 dark:border-white/10">
                <Truck size={16} /> Recibir Mercancía · Próximamente
              </button>
            )}
            <button onClick={() => { setEditingId(null); setForm(initialProduct); setQuickMode(true); setMayorManual(false); setCustomMarginDetal(''); setCustomMarginMayor(''); setBulkCalc({ costoBulto: 0, unidades: 0 }); setModalOpen(true); }}
              className="flex items-center justify-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 active:scale-95">
              <Plus size={16} /> Nuevo Producto
            </button>
          </div>
          )}
        </div>

        {/* SMART RESTOCK ALERTS (velocity-based) */}
        {tenantId && <SmartRestockAlerts businessId={tenantId} products={products} />}

        {/* EXPIRATION ALERTS (farmacia, etc.) */}
        <ExpirationAlerts products={products} />

        {/* CONTENT AREA */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-lg shadow-black/10 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">

          {/* TAB 1: CATALOG */}
          {activeTab === 'catalog' && (
            <div className="flex flex-col h-full">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-3 items-center">
                  <div className="relative w-full md:w-[320px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 h-4 w-4" />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por código, nombre o categoría..."
                      className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-700 dark:text-white dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                  </div>
                  <div className="flex flex-wrap gap-2 flex-1">
                    {/* Category filter */}
                    <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black text-slate-600 dark:text-white/70 focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="all">Categoría: Todas</option>
                      {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {/* Almacén filter */}
                    {almacenes.length > 0 && (
                      <select value={filterAlmacen} onChange={e => setFilterAlmacen(e.target.value)}
                        className="px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black text-slate-600 dark:text-white/70 focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="all">Almacén: Todos</option>
                        {almacenes.filter(a => a.activo).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    )}
                    {/* Stock filter */}
                    <select value={filterStock} onChange={e => setFilterStock(e.target.value as any)}
                      className="px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black text-slate-600 dark:text-white/70 focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="all">Stock: Todos</option>
                      <option value="low">Stock bajo</option>
                      <option value="out">Sin stock</option>
                    </select>
                    {/* Sort */}
                    <div className="flex items-center gap-1">
                      <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="px-3 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black text-slate-600 dark:text-white/70 focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="nombre">Ordenar: Nombre</option>
                        <option value="stock">Stock</option>
                        <option value="precio">Precio detal</option>
                        {!isReadOnlyRole && <option value="costo">Costo</option>}
                      </select>
                      <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        className="p-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-500 dark:text-white/50 hover:border-indigo-400 transition-all text-[11px] font-black">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                    {/* Active filters badge */}
                    {(filterCategoria !== 'all' || filterStock !== 'all' || filterAlmacen !== 'all') && (
                      <button onClick={() => { setFilterCategoria('all'); setFilterStock('all'); setFilterAlmacen('all'); }}
                        className="px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-[10px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <X size={10} /> Limpiar filtros
                      </button>
                    )}
                    <div className="ml-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl text-white flex items-center gap-2 shadow-md shadow-indigo-500/25 shrink-0">
                      <Tags size={13} className="text-white/70" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{rates.tasaBCV.toFixed(2)} BS / USD</span>
                    </div>
                  </div>
                </div>
                {/* Pending products banner — admin only */}
                {(isAdmin || isInventario) && pendingProducts.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-black text-amber-400 flex-1">
                      {pendingProducts.length} producto{pendingProducts.length > 1 ? 's' : ''} pendiente{pendingProducts.length > 1 ? 's' : ''} de revisión — registrados por un almacenista sin precio asignado
                    </span>
                    <button onClick={() => { setFilterCategoria('all'); setFilterStock('all'); setFilterAlmacen('all'); setSearchTerm(''); }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all">
                      Ver pendientes
                    </button>
                  </div>
                )}
              </div>
              {/* ── INFO CARD ────────────────────────────────────────────────── */}
              {canBulkEdit && (
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
              )}

              {/* ── MASTER CONTROLS BAR ──────────────────────────────────────── */}
              {canBulkEdit && (
              <div className="px-5 py-2.5 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/30 dark:bg-white/[0.01] flex flex-wrap items-center gap-2 mt-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mr-1">Ajuste Masivo:</span>

                {/* MARGEN BUTTON */}
                <div className="relative">
                  <button onClick={() => setMasterPanel(masterPanel === 'margin' ? null : 'margin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${masterPanel === 'margin' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-white/[0.05] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 hover:text-indigo-600'}`}>
                    <Percent size={11} /> Margen
                  </button>
                  {masterPanel === 'margin' && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
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
                    <div className="absolute left-0 top-full mt-2 z-50 w-64 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40">Tipo de IVA</p>
                      {([['GENERAL','16% General','16'],['REDUCIDO','8% Reducido','8'],['EXENTO','0% Exento','0']] as [string,string,string][]).map(([type,label,val]) => (
                        <button key={type} onClick={() => { setMasterIvaType(type as any); setMasterIvaValue(val); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${masterIvaType === type ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-white/70 border-slate-100 dark:border-white/[0.07] hover:border-emerald-400'}`}>
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
                    <div className="absolute left-0 top-full mt-2 z-50 w-60 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/[0.1] rounded-2xl shadow-2xl shadow-black/20 p-4 space-y-3">
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
              )}
              {!canBulkEdit && (
                <div className="px-5 py-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <span className="text-[9px] text-slate-400 dark:text-white/30 italic">{filteredProducts.length} productos en catálogo</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/40 border-b border-slate-100 dark:border-white/[0.07]">
                    <tr>
                      {canBulkEdit && (
                      <th className="px-3 py-3.5">
                        <button onClick={allPageSelected ? clearSelect : selectAll}
                          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 border-slate-300 dark:border-white/20 hover:border-indigo-500">
                          {allPageSelected ? <CheckSquare size={12} className="text-indigo-600 dark:text-indigo-400" /> : <Square size={12} className="text-slate-300 dark:text-white/20" />}
                        </button>
                      </th>
                      )}
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5">Producto / SKU</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 hidden sm:table-cell">Categoría</th>
                      {!isReadOnlyRole && <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right hidden md:table-cell">Costo Base</th>}
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right">Precio Detal</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right hidden md:table-cell">Precio Mayor</th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-center">
                        {filterAlmacen !== 'all' ? `Stock ${almacenes.find(a => a.id === filterAlmacen)?.nombre || ''}` : 'Stock Real'}
                      </th>
                      <th className="px-2.5 py-2 sm:px-5 sm:py-3.5 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {pagedProducts.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      const marginDetal = p.costoUSD > 0 ? Math.round(((p.precioDetal - p.costoUSD) / p.costoUSD) * 100) : 0;
                      const isPending = p.status === 'pending_review';
                      const rawStock = p.hasVariants && (p.variants || []).length > 0
                        ? (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0)
                        : p.stock;
                      const stockValue = filterAlmacen !== 'all' ? (p.stockByAlmacen?.[filterAlmacen] ?? 0) : rawStock;
                      return (
                      <tr key={p.id} className={`transition-colors group border-b border-slate-50 dark:border-white/[0.04] ${isPending ? 'bg-amber-50/30 dark:bg-amber-500/[0.04]' : isSelected ? 'bg-indigo-50/40 dark:bg-indigo-500/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}>
                        {/* Checkbox */}
                        {canBulkEdit && (
                        <td className="px-3 py-4 w-8">
                          <button onClick={() => toggleSelect(p.id)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-white/20 hover:border-indigo-400 opacity-0 group-hover:opacity-100'}`}>
                            {isSelected && <CheckSquare size={12} className="text-white" />}
                          </button>
                        </td>
                        )}
                        <td className="px-2.5 sm:px-5 py-3 sm:py-4">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/40 group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white'}`}>
                              <Package size={14} className="sm:hidden" /><Package size={16} className="hidden sm:block" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">{p.nombre}</p>
                                {isDynamicProduct(p.tipoTasa) && (
                                  <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-500 text-[7px] font-black uppercase rounded shrink-0 border border-amber-500/20">
                                    {customRates.find(r => r.id === p.tipoTasa)?.name?.charAt(0) || 'D'}
                                  </span>
                                )}
                                {p.isKit && (
                                  <span className="px-1.5 py-0.5 bg-violet-500/15 text-violet-500 text-[7px] font-black uppercase rounded shrink-0 border border-violet-500/20">Kit</span>
                                )}
                                {p.hasVariants && (
                                  <span className="px-1.5 py-0.5 bg-sky-500/15 text-sky-500 text-[7px] font-black uppercase rounded shrink-0 border border-sky-500/20">{(p.variants || []).length} var</span>
                                )}
                                {isPending && (
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-black border border-amber-500/20 shrink-0">
                                    Pendiente precio
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] sm:text-[10px] font-mono text-slate-400 font-bold bg-slate-50 dark:bg-slate-800/50 px-1.5 sm:px-2 py-0.5 rounded-lg w-fit mt-0.5 sm:mt-1 border border-slate-100 dark:border-white/[0.07]">{p.codigo}</p>
                              {/* Mobile-only: show price + stock inline */}
                              <div className="flex items-center gap-2 mt-1 sm:hidden">
                                <span className="text-[10px] font-black text-emerald-600">${p.precioDetal.toFixed(2)}</span>
                                <span className={`text-[10px] font-black ${p.stock < p.stockMinimo ? 'text-rose-500' : 'text-slate-400'}`}>Stock: {p.stock} {UNIT_LABELS[p.unitType ?? 'unidad']}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden sm:table-cell">
                          <span className="px-3 py-1 bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-white/[0.08]">{p.categoria}</span>
                        </td>
                        {!isReadOnlyRole && (
                        <td className="px-5 py-4 text-right hidden md:table-cell">
                          <p className="text-sm font-black text-slate-700 dark:text-slate-200">${p.costoUSD.toFixed(2)}</p>
                        </td>
                        )}
                        <td className="px-2.5 sm:px-5 py-3 sm:py-4 text-right">
                          {isPending ? (
                            <span className="text-[10px] text-amber-400 font-black">Sin precio</span>
                          ) : (
                            <>
                              <p className="text-xs sm:text-sm font-black text-emerald-600">${p.precioDetal.toFixed(2)}</p>
                              <p className="text-[8px] sm:text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Bs {(p.precioDetal * rates.tasaBCV).toFixed(2)}</p>
                            </>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right hidden md:table-cell">
                          {isPending ? (
                            <span className="text-[10px] text-amber-400 font-black">—</span>
                          ) : (
                            <>
                              <p className="text-sm font-black text-violet-600">${p.precioMayor.toFixed(2)}</p>
                              <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-widest">Bs {(p.precioMayor * rates.tasaBCV).toFixed(2)}</p>
                            </>
                          )}
                        </td>
                        <td className="px-2.5 sm:px-5 py-3 sm:py-4 text-center hidden sm:table-cell">
                          <div className={`inline-flex flex-col items-center px-3 sm:px-4 py-1.5 rounded-xl border ${stockValue < p.stockMinimo ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-white/[0.07]'}`}>
                            <span className={`text-base font-black ${stockValue < p.stockMinimo ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{stockValue}</span>
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">{UNIT_LABELS[p.unitType ?? 'unidad']}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-3 sm:py-4">
                          <div className="flex justify-end items-center gap-1 sm:gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-all sm:translate-x-2 sm:group-hover:translate-x-0">
                            {/* IVA badge — quick toggle (admin only) */}
                            {canEditProduct && (
                            <button
                              title={`IVA: ${p.ivaTipo || 'GENERAL'} ${p.iva ?? 16}%`}
                              onClick={async () => {
                                const next = (p.ivaTipo === 'EXENTO') ? { iva: 16, ivaTipo: 'GENERAL' } : { iva: 0, ivaTipo: 'EXENTO' };
                                await setDoc(doc(db, `businesses/${tenantId}/products`, p.id), next, { merge: true });
                              }}
                              className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border transition-all ${(p.ivaTipo === 'EXENTO' || p.iva === 0) ? 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/[0.08]' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'}`}>
                              {(p.ivaTipo === 'EXENTO' || p.iva === 0) ? 'Exento' : `IVA ${p.iva ?? 16}%`}
                            </button>
                            )}
                            {/* Margin badge (info only) */}
                            {!isReadOnlyRole && (
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black border ${marginDetal >= 30 ? 'bg-indigo-50 dark:bg-indigo-500/[0.08] text-indigo-500 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-white/30 border-slate-100 dark:border-white/[0.07]'}`}
                              title="Margen detal">
                              +{marginDetal}%
                            </span>
                            )}
                            {/* Stock adjust */}
                            {canAddStock && (
                            <button onClick={() => { setSelectedProduct(p); setAdjModalOpen(true); }} className="p-1.5 rounded-xl bg-indigo-600 text-white hover:bg-emerald-500 transition-all shadow-md shadow-indigo-500/25" title="Ajuste de Stock"><TrendingUp size={13} /></button>
                            )}
                            {/* Edit */}
                            {canEditProduct && (
                            <button onClick={() => { setEditingId(p.id); setForm(p); setQuickMode(false); setMayorManual(true); setCustomMarginDetal(''); setCustomMarginMayor(''); setModalOpen(true); }} className="p-1.5 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-white/[0.12] transition-all"><Pencil size={13} /></button>
                            )}
                            {/* Delete */}
                            {canDeleteProduct && (
                              deleteConfirmId === p.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={async () => { await deleteDoc(doc(db, `businesses/${tenantId}/products`, p.id)); setDeleteConfirmId(null); }} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[9px] font-black">Sí</button>
                                <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 text-[9px] font-black">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={13} /></button>
                            )
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
                <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-emerald-500/10 transition-all group">
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
                <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-indigo-500/10 transition-all group">
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
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Shuffle size={11} className="text-indigo-400" />
                      <span>Auto-detección de campos por nombre</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Eye size={11} className="text-indigo-400" />
                      <span>Vista previa antes de importar</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
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
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.07] rounded-2xl p-5 flex flex-col gap-4 hover:shadow-lg hover:shadow-black/10 transition-all group">
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
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Layers size={11} className="text-slate-500 dark:text-white/40" />
                      <span>Múltiples etiquetas por página (A4)</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                      <Tag size={11} className="text-slate-500 dark:text-white/40" />
                      <span>Tamaño y contenido configurable</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/[0.06]">
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

          {/* TAB 4: ALMACENES */}
          {activeTab === 'almacenes' && (
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25"><Layers size={16} /></div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Gestión de Almacenes</h3>
                    <p className="text-[10px] text-slate-400 dark:text-white/40 font-bold uppercase tracking-widest">Stock independiente por almacén</p>
                  </div>
                </div>
                <button onClick={() => { setEditingAlmacenId(null); setAlmacenForm({ nombre: '', descripcion: '', activo: true }); setAlmacenModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 active:scale-95">
                  <Plus size={13} /> Nuevo Almacén
                </button>
              </div>

              {almacenes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                    <Layers size={28} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">Sin almacenes configurados</p>
                    <p className="text-xs text-slate-400 dark:text-white/40 font-medium mt-1">El stock se maneja en un almacén principal por defecto.<br />Crea almacenes para gestionar inventario independiente.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {almacenes.map(almacen => {
                    const totalStock = products.reduce((sum, p) => sum + getAlmacenStock(p, almacen.id), 0);
                    const productCount = products.filter(p => getAlmacenStock(p, almacen.id) > 0).length;
                    return (
                      <div key={almacen.id} className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-lg ${almacen.activo ? 'border-indigo-100 dark:border-indigo-500/20 hover:shadow-indigo-500/10' : 'border-slate-100 dark:border-white/[0.06] opacity-60'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${almacen.activo ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-slate-100 dark:bg-white/[0.04]'}`}>
                              <Layers size={16} className={almacen.activo ? 'text-indigo-500' : 'text-slate-400'} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{almacen.nombre}</p>
                              {almacen.descripcion && <p className="text-[10px] text-slate-400 dark:text-white/40 font-medium">{almacen.descripcion}</p>}
                            </div>
                          </div>
                          <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${almacen.activo ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/30'}`}>
                            {almacen.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2.5 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100 dark:border-white/[0.05]">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Stock Total</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{totalStock}</p>
                          </div>
                          <div className="p-2.5 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100 dark:border-white/[0.05]">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Productos</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{productCount}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                          <button onClick={() => { setEditingAlmacenId(almacen.id); setAlmacenForm({ nombre: almacen.nombre, descripcion: almacen.descripcion || '', activo: almacen.activo }); setAlmacenModalOpen(true); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 dark:border-white/[0.08] text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">
                            <Pencil size={11} /> Editar
                          </button>
                          <button onClick={() => handleDeleteAlmacen(almacen)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/20 text-[9px] font-black uppercase tracking-wider text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Info banner */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/[0.06] border border-indigo-100 dark:border-indigo-500/20 flex items-start gap-3">
                <Info size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                <div className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-semibold leading-relaxed space-y-0.5">
                  <p>· Al registrar mercancía, puedes asignar el stock inicial a un almacén específico.</p>
                  <p>· El POS Detal y Mayor permitirán seleccionar desde cuál almacén vender cuando haya 2+ almacenes activos.</p>
                  <p>· Eliminar un almacén solo es posible si no tiene productos con stock asignado.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ MODAL: ALMACEN ═══════════════ */}
      {almacenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.07] animate-in fade-in zoom-in-95 duration-300">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.07] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                  <Layers size={15} className="text-white" />
                </div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{editingAlmacenId ? 'Editar Almacén' : 'Nuevo Almacén'}</h2>
              </div>
              <button onClick={() => setAlmacenModalOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/40 transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Nombre *</label>
                <input value={almacenForm.nombre} onChange={e => setAlmacenForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Almacén Principal, Depósito B..."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Descripción (opcional)</label>
                <input value={almacenForm.descripcion} onChange={e => setAlmacenForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Notas sobre este almacén..."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-medium text-slate-900 dark:text-white dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button type="button" onClick={() => setAlmacenForm(f => ({ ...f, activo: !f.activo }))}
                  className={`relative w-10 h-5 rounded-full transition-all ${almacenForm.activo ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/[0.12]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${almacenForm.activo ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-xs font-black text-slate-700 dark:text-white/70">Almacén activo</span>
              </label>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setAlmacenModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-xs font-black text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">
                Cancelar
              </button>
              <button onClick={handleSaveAlmacen} disabled={almacenSaving || !almacenForm.nombre.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black shadow-md shadow-indigo-500/25 hover:opacity-90 transition-all disabled:opacity-50">
                {almacenSaving ? 'Guardando...' : editingAlmacenId ? 'Guardar cambios' : 'Crear almacén'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: PRODUCT ═══════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.07] overflow-hidden overflow-y-auto max-h-[95vh] animate-in fade-in zoom-in-95 duration-300">

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
                    onClick={() => { setQuickMode(q => !q); setShowExtras(quickMode); }}
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

              {/* ── IMAGE UPLOAD + GALLERY ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
                  {form.imageUrl ? (
                    <div className="relative group">
                      <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover border-2 border-slate-200 dark:border-white/10" />
                      <button type="button" onClick={() => imageInputRef.current?.click()}
                        className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera size={16} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => imageInputRef.current?.click()}
                      className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-1 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all shrink-0">
                      {uploadingImage
                        ? <Loader2 size={16} className="text-indigo-500 animate-spin" />
                        : <><ImageIcon size={16} className="text-slate-300 dark:text-white/20" /><span className="text-[7px] font-bold text-slate-400 dark:text-white/20 uppercase">Foto</span></>}
                    </button>
                  )}
                  {form.imageUrl && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, imageUrl: '' }))}
                      className="text-[9px] font-bold text-rose-400 hover:text-rose-500 uppercase tracking-widest">Quitar</button>
                  )}
                </div>
                {/* Gallery — additional images */}
                {(form.images && form.images.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {form.images.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <img src={url} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200 dark:border-white/10" />
                        <button type="button" onClick={() => setForm(f => ({ ...f, images: (f.images || []).filter((_, i) => i !== idx) }))}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px]">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={async e => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    e.target.value = '';
                    for (const file of Array.from(files) as File[]) {
                      try {
                        const result = await uploadToCloudinary(file, 'dualis_products');
                        setForm(f => ({ ...f, images: [...(f.images || []), result.secure_url] }));
                      } catch (err) { console.error('[gallery upload]', err); }
                    }
                  }} />
                <button type="button" onClick={() => galleryInputRef.current?.click()}
                  className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1">
                  <Plus size={10} /> Agregar más fotos
                </button>
              </div>

              {/* ── ROW 2: PRECIOS ── */}
              {isAlmacenista && !editingId ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-amber-400 mb-0.5">Mercancía en revisión</p>
                    <p className="text-[10px] text-amber-400/70 leading-relaxed">
                      Esta mercancía quedará pendiente de revisión hasta que el administrador confirme y asigne los precios. Solo necesitas ingresar el nombre, código y stock inicial.
                    </p>
                  </div>
                </div>
              ) : (
              <div className="bg-gradient-to-br from-slate-900 to-[#0d1220] rounded-2xl p-4 border border-white/[0.06] space-y-3">
                {/* Margin presets */}
                <div className="flex flex-wrap items-center gap-2">
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
                  {/* Custom margin inputs */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-[8px] font-black text-emerald-400/60 uppercase tracking-widest">% Detal</span>
                      <span className="text-[7px] text-emerald-400/40">→ precio detal</span>
                    </div>
                    <input type="number" min="0" step="1" value={customMarginDetal}
                      onChange={e => setCustomMarginDetal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && form.costoUSD > 0) {
                          const pct = parseFloat(customMarginDetal);
                          if (!isNaN(pct) && pct > 0) setForm(f => ({ ...f, precioDetal: parseFloat((f.costoUSD * (1 + pct / 100)).toFixed(2)) }));
                        }
                      }}
                      placeholder="%" className="w-14 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-300 text-center focus:outline-none focus:ring-1 focus:ring-emerald-400 placeholder:text-white/20" />
                    <button type="button"
                      onClick={() => {
                        const pct = parseFloat(customMarginDetal);
                        if (!isNaN(pct) && pct > 0 && form.costoUSD > 0)
                          setForm(f => ({ ...f, precioDetal: parseFloat((f.costoUSD * (1 + pct / 100)).toFixed(2)) }));
                      }}
                      className="px-2 py-1 rounded-lg text-[9px] font-black bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all border border-emerald-500/20">↗</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-[8px] font-black text-violet-400/60 uppercase tracking-widest">% Mayor</span>
                      <span className="text-[7px] text-violet-400/40">→ precio mayor</span>
                    </div>
                    <input type="number" min="0" step="1" value={customMarginMayor}
                      onChange={e => setCustomMarginMayor(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && form.costoUSD > 0) {
                          const pct = parseFloat(customMarginMayor);
                          if (!isNaN(pct) && pct > 0) { setMayorManual(true); setForm(f => ({ ...f, precioMayor: parseFloat((f.costoUSD * (1 + pct / 100)).toFixed(2)) })); }
                        }
                      }}
                      placeholder="%" className="w-14 px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-[10px] font-black text-violet-300 text-center focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-white/20" />
                    <button type="button"
                      onClick={() => {
                        const pct = parseFloat(customMarginMayor);
                        if (!isNaN(pct) && pct > 0 && form.costoUSD > 0) {
                          setMayorManual(true);
                          setForm(f => ({ ...f, precioMayor: parseFloat((f.costoUSD * (1 + pct / 100)).toFixed(2)) }));
                        }
                      }}
                      className="px-2 py-1 rounded-lg text-[9px] font-black bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-all border border-violet-500/20">↗</button>
                  </div>
                </div>

                {/* Bulk pricing calculator */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-amber-400/60 mb-1 block">Costo Bulto ($) <span className="font-medium text-amber-400/40 normal-case tracking-normal">precio total del paquete</span></label>
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
                    <label className="text-[9px] font-black uppercase tracking-widest text-amber-400/60 mb-1 block">Unidades <span className="font-medium text-amber-400/40 normal-case tracking-normal">piezas por paquete</span></label>
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

                {/* ── SELECTOR TIPO DE TASA (solo si zoherEnabled) ── */}
                {hasDynamicPricing && zoherEnabled && customRates.filter(r => r.enabled).length > 0 && (
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 flex items-center gap-1.5">
                      Tipo de Tasa
                      <span className="relative group cursor-help">
                        <Info size={10} className="text-white/20" />
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 px-3 py-2 rounded-xl bg-slate-900 text-[10px] text-white/80 font-medium shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 text-center leading-relaxed normal-case tracking-normal">
                          BCV = precio fijo. Tasa custom = precio se recalcula automaticamente al cambiar la tasa.
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.07]">
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, tipoTasa: 'BCV' }))}
                        className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          (!form.tipoTasa || form.tipoTasa === 'BCV')
                            ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            : 'text-white/30 hover:text-white/50'
                        }`}>
                        BCV (Normal)
                      </button>
                      {customRates.filter(r => r.enabled).map(rate => (
                        <button type="button" key={rate.id}
                          onClick={() => setForm(f => ({ ...f, tipoTasa: rate.id }))}
                          className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                            form.tipoTasa === rate.id
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'text-white/30 hover:text-white/50'
                          }`}>
                          {rate.name || rate.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── PRICING: DINÁMICO (margen) o ESTÁTICO (precios manuales) ── */}
                {isDynamicProduct(form.tipoTasa) ? (
                  <>
                    {/* Costo + Márgenes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
                          Costo ($) <span className="text-amber-400">ref. {customRates.find(r => r.id === form.tipoTasa)?.name || form.tipoTasa}</span>
                        </label>
                        <input type="number" step="0.01" min="0" value={form.costoUSD || ''}
                          onChange={e => setForm(f => ({ ...f, costoUSD: Number(e.target.value) }))}
                          placeholder="0.00"
                          className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-amber-400 outline-none transition-all placeholder:text-white/20" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70 mb-1.5 block">Margen Detal (%)</label>
                        <input type="number" step="0.1" min="0" value={form.margenDetal || ''}
                          onChange={e => setForm(f => ({ ...f, margenDetal: Number(e.target.value) }))}
                          placeholder="0"
                          className="w-full px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-emerald-400 outline-none transition-all placeholder:text-white/20" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-violet-400/70 mb-1.5 block">Margen Mayor (%)</label>
                        <input type="number" step="0.1" min="0" value={form.margenMayor || ''}
                          onChange={e => setForm(f => ({ ...f, margenMayor: Number(e.target.value) }))}
                          placeholder="0"
                          className="w-full px-3 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-violet-400 outline-none transition-all placeholder:text-white/20" />
                      </div>
                    </div>

                    {/* Preview precios calculados */}
                    {form.costoUSD > 0 && (form.margenMayor || 0) > 0 && (() => {
                      const cr = findCustomRate(customRates, form.tipoTasa || '');
                      if (!cr) return null;
                      const dp = computeDynamicPrices(form.costoUSD, form.margenMayor || 0, form.margenDetal || 0, cr.value, rates.tasaBCV);
                      return (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[8px] font-black uppercase text-amber-400/60">Detal {cr.name}</p>
                            <p className="text-sm font-black text-amber-400 font-mono">${dp.precioDetalCustom.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase text-amber-400/60">Mayor {cr.name}</p>
                            <p className="text-sm font-black text-amber-400 font-mono">${dp.precioMayorCustom.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase text-sky-400/60">Equiv. BCV Detal</p>
                            <p className="text-sm font-black text-sky-400 font-mono">${dp.precioBCV_Detal.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase text-sky-400/60">Equiv. BCV Mayor</p>
                            <p className="text-sm font-black text-sky-400 font-mono">${dp.precioBCV_Mayor.toFixed(2)}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {/* Precios estáticos (flujo original) */}
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

                    {/* ── CALCULADORA DE RENTABILIDAD ── */}
                    {form.costoUSD > 0 && form.precioDetal > 0 && (() => {
                      const costo = form.costoUSD;
                      const pvp = form.precioDetal;
                      const pvpMayor = form.precioMayor || pvp;
                      const gananciaDetal = pvp - costo;
                      const gananciaMayor = pvpMayor - costo;
                      const margenDetal = (gananciaDetal / costo) * 100;
                      const margenMayor = (gananciaMayor / costo) * 100;
                      const stockActual = form.stock || 0;
                      const gananciaPotencialDetal = gananciaDetal * stockActual;
                      const gananciaPotencialMayor = gananciaMayor * stockActual;
                      // Markup sobre precio de venta (margen bruto clásico)
                      const markupDetal = pvp > 0 ? (gananciaDetal / pvp) * 100 : 0;
                      const healthColor =
                        margenDetal < 10 ? 'text-rose-400' :
                        margenDetal < 25 ? 'text-amber-400' :
                        'text-emerald-400';
                      const healthLabel =
                        margenDetal < 10 ? 'Margen crítico' :
                        margenDetal < 25 ? 'Margen aceptable' :
                        'Margen saludable';
                      return (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3.5 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70">Rentabilidad</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider ${healthColor}`}>
                              {healthLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <p className="text-[9px] text-slate-400 dark:text-white/30 font-bold">Ganancia Detal</p>
                              <p className="text-sm font-black text-emerald-400 font-mono">${gananciaDetal.toFixed(2)}</p>
                              <p className="text-[9px] text-white/40">{margenDetal.toFixed(0)}% sobre costo</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 dark:text-white/30 font-bold">Ganancia Mayor</p>
                              <p className="text-sm font-black text-violet-400 font-mono">${gananciaMayor.toFixed(2)}</p>
                              <p className="text-[9px] text-white/40">{margenMayor.toFixed(0)}% sobre costo</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 dark:text-white/30 font-bold">Markup</p>
                              <p className="text-sm font-black text-sky-400 font-mono">{markupDetal.toFixed(0)}%</p>
                              <p className="text-[9px] text-white/40">sobre venta</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 dark:text-white/30 font-bold">Potencial ({stockActual} ud)</p>
                              <p className="text-sm font-black text-amber-400 font-mono">${gananciaPotencialDetal.toFixed(2)}</p>
                              <p className="text-[9px] text-white/40">mayor: ${gananciaPotencialMayor.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PRECIOS POR CUENTA (MAYOR) — siempre visible si hay cuentas ── */}
                    {hasDynamicPricing && customRates.length > 0 && (
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] px-3.5 pb-3.5 pt-3 space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/70">Precios por Cuenta (Mayor)</p>
                        <div className={`grid gap-3 ${customRates.length <= 3 ? `grid-cols-${customRates.length}` : 'grid-cols-2 sm:grid-cols-3'}`}>
                          {customRates.map(rate => (
                            <div key={rate.id}>
                              <label className="text-[9px] font-black uppercase tracking-widest text-violet-400/70 mb-1.5 block">
                                Precio {rate.name} ($)
                              </label>
                              <input type="number" step="0.01" min="0"
                                value={form.preciosCuenta[rate.id] || ''}
                                onChange={e => setForm(f => ({
                                  ...f,
                                  preciosCuenta: { ...f.preciosCuenta, [rate.id]: Number(e.target.value) },
                                }))}
                                placeholder="0.00"
                                className="w-full px-3 py-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm font-black text-white focus:ring-2 focus:ring-violet-400 outline-none transition-all placeholder:text-white/20" />
                            </div>
                          ))}
                        </div>
                        <p className="text-[9px] text-white/30 leading-relaxed">
                          Nota: si se dejan en 0, el POS Mayor usará el Precio Mayor como fallback
                        </p>
                      </div>
                    )}
                  </>
                )}

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
              )}

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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Stock Inicial <span className="font-medium normal-case tracking-normal">unidades disponibles al registrar</span></label>
                    {/* Almacén selector — solo si hay almacenes configurados */}
                    {almacenes.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Layers size={10} className="text-indigo-400" />
                        <select value={selectedAlmacenId} onChange={e => setSelectedAlmacenId(e.target.value)}
                          className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2 py-1 text-indigo-400 dark:text-indigo-300 outline-none focus:ring-1 focus:ring-indigo-500">
                          {almacenes.filter(a => a.activo).map(a => (
                            <option key={a.id} value={a.id}>{a.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 5, 10, 25, 50].map(n => (
                      <button key={n} type="button"
                        onClick={() => setForm(f => ({ ...f, stock: n }))}
                        className={`h-9 px-2.5 rounded-lg text-[10px] font-black transition-all border ${
                          form.stock === n
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/25'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:border-indigo-400 hover:text-indigo-600 bg-slate-50 dark:bg-slate-800/50'
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

              {/* ── CAMPOS ADICIONALES (colapsable en modo rápido) ── */}
              <div className="border-t border-slate-100 dark:border-white/[0.07] pt-2">
                <button
                  type="button"
                  onClick={() => setShowExtras(v => !v)}
                  className="w-full flex items-center justify-between py-2 group"
                >
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/50 transition-colors">
                    Campos adicionales — marca, unidad, IVA, proveedor, ubicación
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 dark:text-white/30 transition-transform duration-200 ${showExtras ? 'rotate-180' : ''}`} />
                </button>
                {showExtras && <div className="space-y-3 pt-1 animate-in fade-in zoom-in-95 duration-200">
                <div className="grid grid-cols-3 gap-3">
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
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Unidad de Venta</label>
                    <select value={form.unitType ?? 'unidad'} onChange={e => setForm(f => ({ ...f, unitType: e.target.value as Product['unitType'] }))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                      <option value="unidad">Unidad (piezas)</option>
                      <option value="kg">Kilogramos (kg)</option>
                      <option value="g">Gramos (g)</option>
                      <option value="ton">Toneladas (ton)</option>
                      <option value="lt">Litros (L)</option>
                      <option value="ml">Mililitros (mL)</option>
                      <option value="lb">Libras (lb)</option>
                    </select>
                    {form.unitType && form.unitType !== 'unidad' && (
                      <p className="text-[9px] text-amber-400 mt-1">💡 Stock y precio en {form.unitType}</p>
                    )}
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
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Ubicación <span className="font-medium normal-case tracking-normal text-slate-400/60">Ej: Pasillo A-4, Estante 2</span></label>
                    <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Pasillo A-4, Estante 2"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Stock Mínimo <span className="font-medium normal-case tracking-normal text-slate-400/60">alerta cuando baje de este número</span></label>
                    <input type="number" min="0" value={form.stockMinimo} onChange={e => setForm(f => ({ ...f, stockMinimo: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Peso (KG)</label>
                    <input type="number" step="0.001" min="0" value={form.peso || ''} onChange={e => setForm(f => ({ ...f, peso: Number(e.target.value) }))} placeholder="0.000"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                {/* Vencimiento y Lote */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Fecha Vencimiento</label>
                    <input type="date" value={(form as any).fechaVencimiento || ''} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value || undefined }))}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Lote</label>
                    <input type="text" value={(form as any).lote || ''} onChange={e => setForm(f => ({ ...f, lote: e.target.value || undefined }))} placeholder="LOT-001"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                {/* Fase B: Unidades por Bulto + Código de Barras */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">
                      Unidades por Bulto <span className="font-medium normal-case tracking-normal text-slate-400/60">ej: 12 = 1 bulto trae 12 unid.</span>
                    </label>
                    <input type="number" min="1" step="1" value={form.unidadesPorBulto ?? 1}
                      onChange={e => setForm(f => ({ ...f, unidadesPorBulto: Math.max(1, Number(e.target.value) || 1) }))}
                      placeholder="1"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">
                      Código de Barras <span className="font-medium normal-case tracking-normal text-slate-400/60">escanea o pega</span>
                    </label>
                    <input type="text" value={form.barcode || ''}
                      onChange={e => setForm(f => ({ ...f, barcode: e.target.value.trim() || undefined }))}
                      placeholder="7591234567890"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                {/* Fase G — Combos / Kits. Producto compuesto: al vender, descuenta los componentes.
                    El precio del kit es independiente (promo). Un kit no puede contener otro kit. */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!form.isKit}
                      onChange={e => setForm(f => ({ ...f, isKit: e.target.checked, kitComponents: e.target.checked ? (f.kitComponents || []) : [], hasVariants: false, variantAttributes: [], variants: [] }))}
                      disabled={!!form.hasVariants}
                      className="w-4 h-4 rounded accent-violet-600 disabled:opacity-40"
                    />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-white/60 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                      Producto compuesto / Combo
                    </span>
                    <span className="text-[9px] font-medium normal-case tracking-normal text-slate-400/60">al vender se descuentan los componentes</span>
                  </label>

                  {form.isKit && (
                    <div className="mt-3 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-500/[0.04] border border-violet-200/60 dark:border-violet-500/20 space-y-2">
                      {(form.kitComponents || []).length === 0 && (
                        <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                          ⚠ Agrega al menos un componente
                        </div>
                      )}
                      {(form.kitComponents || []).map((comp, idx) => {
                        const compProduct = products.find(p => p.id === comp.productId);
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={comp.productId}
                              onChange={e => {
                                const newProductId = e.target.value;
                                const newProduct = products.find(p => p.id === newProductId);
                                setForm(f => ({
                                  ...f,
                                  kitComponents: (f.kitComponents || []).map((c, i) =>
                                    i === idx ? { ...c, productId: newProductId, productName: newProduct?.nombre } : c
                                  ),
                                }));
                              }}
                              className="flex-1 min-w-0 px-2 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-[11px] font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                            >
                              <option value="">— Seleccionar producto —</option>
                              {products
                                .filter(p => !p.isKit && p.id !== editingId)
                                .map(p => (
                                  <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={comp.qty}
                              onChange={e => {
                                const q = Math.max(1, Number(e.target.value) || 1);
                                setForm(f => ({
                                  ...f,
                                  kitComponents: (f.kitComponents || []).map((c, i) => (i === idx ? { ...c, qty: q } : c)),
                                }));
                              }}
                              className="w-16 px-2 py-2 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg text-[11px] font-black text-center text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setForm(f => ({ ...f, kitComponents: (f.kitComponents || []).filter((_, i) => i !== idx) }))}
                              className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              title="Quitar componente"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, kitComponents: [...(f.kitComponents || []), { productId: '', qty: 1 }] }))}
                        className="w-full py-2 rounded-lg border border-dashed border-violet-300 dark:border-violet-500/40 text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 hover:bg-violet-100/50 dark:hover:bg-violet-500/10 transition-colors"
                      >
                        + Agregar componente
                      </button>
                    </div>
                  )}
                </div>

                {/* Fase 9.4 — Variantes de producto (Talla, Color, etc.) */}
                {!form.isKit && (
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!form.hasVariants}
                      onChange={e => setForm(f => ({
                        ...f,
                        hasVariants: e.target.checked,
                        variantAttributes: e.target.checked ? (f.variantAttributes?.length ? f.variantAttributes : ['Talla']) : [],
                        variants: e.target.checked ? (f.variants || []) : [],
                      }))}
                      className="w-4 h-4 rounded accent-sky-600"
                    />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-white/60 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      Producto con variantes
                    </span>
                    <span className="text-[9px] font-medium normal-case tracking-normal text-slate-400/60">talla, color, medida, etc.</span>
                  </label>

                  {form.hasVariants && (
                    <div className="mt-3 p-3 rounded-xl bg-sky-50/50 dark:bg-sky-500/[0.04] border border-sky-200/60 dark:border-sky-500/20 space-y-3">
                      {/* Attribute names */}
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-1.5 block">Atributos</label>
                        <div className="flex flex-wrap gap-2">
                          {(form.variantAttributes || []).map((attr, i) => (
                            <div key={i} className="flex items-center gap-1 bg-white dark:bg-white/[0.06] border border-sky-200 dark:border-sky-500/20 rounded-lg px-2 py-1.5">
                              <input
                                value={attr}
                                onChange={e => {
                                  const newAttrs = [...(form.variantAttributes || [])];
                                  newAttrs[i] = e.target.value;
                                  setForm(f => ({ ...f, variantAttributes: newAttrs }));
                                }}
                                className="w-20 bg-transparent text-[11px] font-bold text-slate-900 dark:text-white outline-none"
                                placeholder="Ej: Talla"
                              />
                              <button type="button" onClick={() => {
                                const newAttrs = (form.variantAttributes || []).filter((_, idx) => idx !== i);
                                const newVars = (form.variants || []).map(v => {
                                  const newVals = { ...v.values };
                                  delete newVals[attr];
                                  return { ...v, values: newVals };
                                });
                                setForm(f => ({ ...f, variantAttributes: newAttrs, variants: newVars }));
                              }} className="text-rose-400 hover:text-rose-600"><X size={12} /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setForm(f => ({
                            ...f, variantAttributes: [...(f.variantAttributes || []), ''],
                          }))} className="px-2 py-1.5 rounded-lg border border-dashed border-sky-300 dark:border-sky-500/30 text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10">
                            + Atributo
                          </button>
                        </div>
                      </div>

                      {/* Variants list */}
                      {(form.variantAttributes || []).filter(a => a.trim()).length > 0 && (
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-1.5 block">
                            Variantes ({(form.variants || []).length})
                          </label>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {(form.variants || []).map((v, vi) => (
                              <div key={v.id} className="flex items-center gap-1.5 text-[10px]">
                                {(form.variantAttributes || []).filter(a => a.trim()).map(attr => (
                                  <input
                                    key={attr}
                                    value={v.values[attr] || ''}
                                    onChange={e => {
                                      const newVars = [...(form.variants || [])];
                                      newVars[vi] = { ...newVars[vi], values: { ...newVars[vi].values, [attr]: e.target.value } };
                                      setForm(f => ({ ...f, variants: newVars }));
                                    }}
                                    placeholder={attr}
                                    className="w-16 px-1.5 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg font-bold text-slate-900 dark:text-white outline-none text-[10px]"
                                  />
                                ))}
                                <input
                                  value={v.sku}
                                  onChange={e => {
                                    const newVars = [...(form.variants || [])];
                                    newVars[vi] = { ...newVars[vi], sku: e.target.value };
                                    setForm(f => ({ ...f, variants: newVars }));
                                  }}
                                  placeholder="SKU"
                                  className="w-20 px-1.5 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg font-mono font-bold text-slate-900 dark:text-white outline-none text-[10px]"
                                />
                                <input
                                  type="number" min="0"
                                  value={v.stock}
                                  onChange={e => {
                                    const newVars = [...(form.variants || [])];
                                    newVars[vi] = { ...newVars[vi], stock: Number(e.target.value) || 0 };
                                    setForm(f => ({ ...f, variants: newVars }));
                                  }}
                                  placeholder="Stock"
                                  className="w-14 px-1.5 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg font-black text-center text-slate-900 dark:text-white outline-none text-[10px]"
                                />
                                <input
                                  type="number" step="0.01" min="0"
                                  value={v.precioDetal ?? ''}
                                  onChange={e => {
                                    const newVars = [...(form.variants || [])];
                                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                                    newVars[vi] = { ...newVars[vi], precioDetal: val };
                                    setForm(f => ({ ...f, variants: newVars }));
                                  }}
                                  placeholder={`$${form.precioDetal || 0}`}
                                  title="Precio detal (vacío = hereda del padre)"
                                  className="w-16 px-1.5 py-1.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg font-black text-center text-slate-900 dark:text-white outline-none text-[10px]"
                                />
                                <button type="button" onClick={() => {
                                  setForm(f => ({ ...f, variants: (f.variants || []).filter((_, i) => i !== vi) }));
                                }} className="p-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg">
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => {
                            const id = Math.random().toString(36).slice(2, 10);
                            const values: Record<string, string> = {};
                            (form.variantAttributes || []).filter(a => a.trim()).forEach(a => { values[a] = ''; });
                            setForm(f => ({
                              ...f,
                              variants: [...(f.variants || []), { id, sku: '', values, stock: 0 }],
                            }));
                          }} className="mt-2 w-full py-2 rounded-lg border border-dashed border-sky-300 dark:border-sky-500/40 text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 hover:bg-sky-100/50 dark:hover:bg-sky-500/10 transition-colors">
                            + Agregar variante
                          </button>
                        </div>
                      )}

                      <p className="text-[9px] text-sky-500/60 italic">
                        El stock del producto padre se ignora — se usa el stock de cada variante. Si el precio está vacío, hereda del padre.
                      </p>
                    </div>
                  )}
                </div>
                )}
              </div>}
              </div>
            </form>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-3">
              <button type="button" onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden overflow-y-auto max-h-[95vh] animate-in zoom-in-95 duration-500">
            <div className="p-6 sm:p-12 space-y-6 sm:space-y-10">
              <div className="text-center">
                <div className="h-16 w-16 sm:h-20 sm:w-20 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-2xl animate-pulse"><TrendingUp className="text-white" size={28} /></div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Ajuste de Stock</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-[0.2em]">{selectedProduct.nombre}</p>
              </div>
              <div className="space-y-5">
                <div className="flex p-2 bg-slate-100 dark:bg-white/[0.07] rounded-xl shadow-inner">
                  <button onClick={() => { setAdjData({ ...adjData, type: 'AJUSTE' }); }} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'AJUSTE' ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-lg' : 'text-slate-400'}`}>Entrada / Ajuste</button>
                  <button onClick={() => { setAdjData({ ...adjData, type: 'MERMA' }); setAdjUpdatePrices(false); }} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${adjData.type === 'MERMA' ? 'bg-white dark:bg-white/[0.1] text-rose-600 shadow-xl' : 'text-slate-400'}`}>Salida / Merma</button>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Cantidad de Unidades</label>
                  <input type="number" value={adjData.quantity} onChange={e => setAdjData({ ...adjData, quantity: Number(e.target.value) })} className="w-full px-6 py-6 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-3xl font-black text-center focus:ring-4 focus:ring-slate-900 shadow-inner" placeholder="0" />
                </div>
                {adjData.type === 'AJUSTE' && !isAlmacenista && (
                  <div className="space-y-3">
                    {/* Proveedor — siempre visible */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Proveedor</label>
                      <select
                        value={adjSupplierId}
                        onChange={e => setAdjSupplierId(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="">— Sin proveedor —</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.contacto || s.rif}</option>
                        ))}
                      </select>
                    </div>
                    {/* Nuevo Costo USD — siempre visible (costo ponderado automático) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Nuevo Costo USD</label>
                      <input
                        type="number"
                        step="0.01"
                        value={adjCostoUSD || ''}
                        onChange={e => setAdjCostoUSD(Number(e.target.value))}
                        onFocus={() => { if (adjCostoUSD === 0 && selectedProduct) setAdjCostoUSD(selectedProduct.costoUSD || 0); }}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder={`Actual: $${(selectedProduct?.costoUSD || 0).toFixed(2)}`}
                      />
                    </div>
                    {/* Costo promedio ponderado preview — siempre visible */}
                    {selectedProduct && adjCostoUSD > 0 && Number(adjData.quantity) > 0 && (
                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.08] border border-indigo-200 dark:border-indigo-500/20">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-1.5">Costo Promedio Ponderado</p>
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="text-slate-500 dark:text-white/40">({selectedProduct.stock} × ${(selectedProduct.costoUSD || 0).toFixed(2)}) + ({Number(adjData.quantity)} × ${adjCostoUSD.toFixed(2)}) ÷ {selectedProduct.stock + Number(adjData.quantity)}</span>
                          <span className="font-black text-indigo-600 dark:text-indigo-400">
                            = ${selectedProduct.stock + Number(adjData.quantity) > 0 ? ((selectedProduct.stock * (selectedProduct.costoUSD || 0) + Number(adjData.quantity) * adjCostoUSD) / (selectedProduct.stock + Number(adjData.quantity))).toFixed(4) : '0'}
                          </span>
                        </div>
                        <p className="text-[9px] text-indigo-400/70 mt-1">Se recalcula automáticamente en cada entrada</p>
                      </div>
                    )}
                    {/* Precios de venta — opcional, expandible */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !adjUpdatePrices;
                        setAdjUpdatePrices(next);
                        if (next && selectedProduct) {
                          const basePrices: Record<string, number> = {
                            precioDetal: selectedProduct.precioDetal || 0,
                            precioMayor: selectedProduct.precioMayor || 0,
                          };
                          if (hasDynamicPricing) {
                            for (const rate of customRates) {
                              basePrices[`cuenta_${rate.id}`] = selectedProduct.preciosCuenta?.[rate.id] || 0;
                            }
                          }
                          setAdjPrices(basePrices);
                        }
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all"
                    >
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Actualizar precios de venta</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Opcional: modifica detal, mayor y precios por cuenta</p>
                      </div>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${adjUpdatePrices ? 'rotate-180' : ''}`} />
                    </button>
                    {adjUpdatePrices && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {([
                            { key: 'precioDetal', label: 'Precio Detal' },
                            { key: 'precioMayor', label: 'Precio Mayor' },
                            ...(hasDynamicPricing ? customRates.map(r => ({ key: `cuenta_${r.id}`, label: `Precio ${r.name}` })) : []),
                          ]).map(f => (
                            <div key={f.key} className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{f.label}</label>
                              <input
                                type="number"
                                step="0.01"
                                value={adjPrices[f.key] || 0}
                                onChange={e => setAdjPrices(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="0.00"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Razón de la Auditoría</label>
                  <textarea rows={3} value={adjData.reason} onChange={e => setAdjData({ ...adjData, reason: e.target.value })} className="w-full px-6 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-900 shadow-inner resize-none" placeholder="Explique el motivo del cambio..." />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => { setAdjModalOpen(false); setAdjUpdatePrices(false); setAdjCostoUSD(0); setAdjSupplierId(''); }} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors">Cerrar</button>
                <button onClick={handleAdjustStock} className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-md shadow-indigo-500/25 active:scale-95">Ejecutar Ajuste</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: IMPORT WIZARD ═══════════════ */}
      {importModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[90vh]">
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
              <button onClick={() => setImportModal(false)} className="p-3 hover:bg-white dark:hover:bg-white/[0.04] dark:bg-slate-800/50 rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
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
                          <div key={h} className="grid grid-cols-3 gap-4 items-center px-5 py-3.5 border-t border-slate-50 hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-slate-800/50 transition-colors">
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
                              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
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
                          <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-slate-800/50">
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 dark:border-white/[0.07] overflow-hidden animate-in fade-in zoom-in-95 duration-400 flex flex-col max-h-[92vh]">
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
                    })} className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-all ${barSelected.has(p.id) ? 'bg-slate-50 dark:bg-white/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] dark:bg-slate-800/50'}`}>
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

      {/* ═══════════════ MODAL: RECEPCIÓN DE MERCANCÍA ═══════════════ */}
      <RecepcionModal
        open={showRecepcion}
        onClose={() => setShowRecepcion(false)}
        suppliers={suppliers}
        products={products}
        bcvRate={rates.tasaBCV}
        customRates={customRates}
        businessId={tenantId || ''}
        currentUserId={userProfile?.id || ''}
        currentUserName={userProfile?.fullName || 'Admin'}
        onSaveMovement={async (data) => {
          // Canonical path: root `movements` collection filtered by businessId
          // (same as CxP / useBusinessData). The per-tenant subcollection was
          // invisible to CxP, so auto-facturas never appeared in the supplier ledger.
          await addDoc(collection(db, 'movements'), {
            ...data,
            businessId: tenantId,
            ownerId: userProfile?.id,
            vendedorId: userProfile?.id,
            vendedorNombre: userProfile?.fullName || 'Admin',
            createdAt: new Date().toISOString(),
          });
        }}
        onAdjustStock={async (productId, qty, newCosto, proveedorId, proveedorNombre, nroFactura, lote, fechaVencimiento) => {
          const product = products.find(p => p.id === productId);
          if (!product || !tenantId) return;
          const newStock = product.stock + qty;
          // Populate stockByAlmacen so legacy products become visible in warehouse views
          const targetAlmacen = (filterAlmacen !== 'all' ? filterAlmacen : selectedAlmacenId) || 'principal';
          const existingMap = product.stockByAlmacen || {};
          const baseAlmacenStock = Object.prototype.hasOwnProperty.call(existingMap, targetAlmacen)
            ? Number(existingMap[targetAlmacen] || 0)
            : (targetAlmacen === 'principal' ? Number(product.stock || 0) : 0);
          const newAlmacenStock = Math.max(0, baseAlmacenStock + qty);
          const updatePayload: Record<string, any> = {
            stock: newStock,
            costoUSD: newCosto,
            previousCostoUSD: product.costoUSD || 0,
            stockByAlmacen: {
              ...existingMap,
              [targetAlmacen]: newAlmacenStock,
            },
          };
          // Write lot/expiry to product doc if provided
          if (lote) updatePayload.lote = lote;
          if (fechaVencimiento) updatePayload.fechaVencimiento = fechaVencimiento;
          await setDoc(doc(db, `businesses/${tenantId}/products`, productId), updatePayload, { merge: true });
          await addDoc(collection(db, `businesses/${tenantId}/stock_movements`), {
            productId,
            productName: product.nombre,
            type: 'AJUSTE',
            quantity: qty,
            reason: `Recepción${nroFactura ? ` #${nroFactura}` : ''}`,
            weightedAvgCost: newCosto,
            previousCost: product.costoUSD || 0,
            proveedorId,
            proveedorNombre,
            ...(lote ? { lote } : {}),
            ...(fechaVencimiento ? { fechaVencimiento } : {}),
            userName: userProfile?.fullName || 'Admin',
            createdAt: serverTimestamp(),
          });
        }}
      />

      {/* ═══════════════ MODAL: CONTEO FÍSICO ═══════════════ */}
      <PhysicalCountModal
        open={showPhysicalCount}
        onClose={() => setShowPhysicalCount(false)}
        businessId={tenantId || ''}
        operatorName={userProfile?.fullName || 'Admin'}
        products={products}
        almacenes={almacenes}
        categorias={uniqueCategories}
      />

      {/* ═══════════════ MODAL: TRANSFERENCIA ENTRE ALMACENES ═══════════════ */}
      <TransferStockModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        businessId={tenantId || ''}
        operatorName={userProfile?.fullName || 'Admin'}
        products={products}
        almacenes={almacenes}
      />
    </div>
  );
}
