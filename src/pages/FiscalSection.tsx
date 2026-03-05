import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, query, where, onSnapshot, doc, getDoc, setDoc, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import {
  FileText, BookOpen, Calculator, Settings2, Download, Loader2,
  ChevronDown, CheckCircle2, AlertTriangle, RefreshCw, Hash,
  Building2, MapPin, Phone, User, BadgeCheck, Receipt,
  ClipboardList, Scissors, Utensils, Shirt, Tv, Flower2, ShoppingBag,
  ChevronRight,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Movement {
  id: string;
  date: string;
  createdAt: string;
  nroControl?: string;
  entityId: string;
  entityName?: string;
  entityRif?: string;
  subtotalUSD?: number;
  ivaAmount?: number;
  igtfAmount?: number;
  igtfRate?: number;
  amount?: number;
  amountInUSD?: number;
  movementType: string;
  metodoPago?: string;
  anulada?: boolean;
  concept?: string;
  rateUsed?: number;
}

type TipoNegocio = 'retail' | 'alimentos' | 'servicios' | 'tecnologia' | 'flores' | 'otro';

interface FiscalConfig {
  rif: string;
  razonSocial: string;
  domicilioFiscal: string;
  telefono: string;
  representanteLegal: string;
  tipoContribuyente: 'ordinario' | 'especial' | 'formal';
  tipoNegocio: TipoNegocio;
  ivaAlicuota: number;
  invoicePrefix: string;
  nextNroControl: number;
}

const DEFAULT_FISCAL: FiscalConfig = {
  rif: '',
  razonSocial: '',
  domicilioFiscal: '',
  telefono: '',
  representanteLegal: '',
  tipoContribuyente: 'ordinario',
  tipoNegocio: 'retail',
  ivaAlicuota: 16,
  invoicePrefix: 'FACT-',
  nextNroControl: 1,
};

// Presets por tipo de negocio
const NEGOCIO_PRESETS: Record<TipoNegocio, {
  label: string; icon: React.ReactNode; ivaAlicuota: number;
  desc: string; nota?: string;
}> = {
  retail:      { label: 'Retail / Ropa',         icon: <Shirt size={16} />,      ivaAlicuota: 16, desc: 'Tiendas de ropa, calzado, accesorios, electrodomésticos' },
  alimentos:   { label: 'Alimentos',              icon: <Utensils size={16} />,   ivaAlicuota: 0,  desc: 'Restaurantes, comida, panadería, abastos', nota: 'IVA exento en alimentos básicos (Decreto SENIAT)' },
  servicios:   { label: 'Servicios / Barbería',   icon: <Scissors size={16} />,   ivaAlicuota: 16, desc: 'Barbería, estética, consultoría, talleres', nota: 'Servicios profesionales pueden estar sujetos a retención ISLR' },
  tecnologia:  { label: 'Tecnología / Electrónica', icon: <Tv size={16} />,      ivaAlicuota: 16, desc: 'Venta de equipos, celulares, cómputo, accesorios' },
  flores:      { label: 'Flores / Artesanía',     icon: <Flower2 size={16} />,    ivaAlicuota: 16, desc: 'Venta de flores, ramos, decoración, artesanías' },
  otro:        { label: 'Otro / General',          icon: <ShoppingBag size={16}/>, ivaAlicuota: 16, desc: 'Cualquier otro tipo de negocio' },
};

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getUsd(m: Movement) {
  return Number(m.amountInUSD ?? m.amount ?? 0);
}
function getBase(m: Movement) {
  // Base = total - IVA - IGTF
  const total = getUsd(m);
  const iva  = Number(m.ivaAmount ?? 0);
  const igtf = Number(m.igtfAmount ?? 0);
  if (m.subtotalUSD) return Number(m.subtotalUSD);
  return total - iva - igtf;
}

async function exportExcel(
  rows: any[],
  columns: { header: string; key: string; width?: number }[],
  sheetName: string,
  fileName: string,
) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map(c => ({ ...c, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  rows.forEach(r => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf]));
  a.download = fileName;
  a.click();
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
      active
        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25'
        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-slate-300'
    }`}
  >
    {icon}
    {label}
  </button>
);

// ─── LIBRO DE VENTAS ──────────────────────────────────────────────────────────
const LibroVentas: React.FC<{ movements: Movement[]; loading: boolean }> = ({ movements, loading }) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const filtered = useMemo(() => {
    return movements
      .filter(m => {
        if (m.anulada) return false;
        if (m.movementType !== 'FACTURA') return false;
        const d = new Date(m.date || m.createdAt);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt));
  }, [movements, month, year]);

  const totals = useMemo(() => ({
    base:  filtered.reduce((s, m) => s + getBase(m), 0),
    iva:   filtered.reduce((s, m) => s + Number(m.ivaAmount ?? 0), 0),
    igtf:  filtered.reduce((s, m) => s + Number(m.igtfAmount ?? 0), 0),
    total: filtered.reduce((s, m) => s + getUsd(m), 0),
  }), [filtered]);

  const handleExport = () => exportExcel(
    filtered.map((m, i) => ({
      num: i + 1,
      fecha: m.date,
      nroControl: m.nroControl || '—',
      rif: m.entityRif || '—',
      cliente: m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityName || m.entityId || '—'),
      base: getBase(m).toFixed(2),
      alicuota: m.ivaAmount ? '16%' : '0%',
      iva: Number(m.ivaAmount ?? 0).toFixed(2),
      igtf: Number(m.igtfAmount ?? 0).toFixed(2),
      total: getUsd(m).toFixed(2),
    })),
    [
      { header: 'N°', key: 'num', width: 6 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Nro Control', key: 'nroControl', width: 16 },
      { header: 'RIF', key: 'rif', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Base Imp. (USD)', key: 'base', width: 16 },
      { header: 'Alícuota', key: 'alicuota', width: 10 },
      { header: 'IVA (USD)', key: 'iva', width: 14 },
      { header: 'IGTF (USD)', key: 'igtf', width: 14 },
      { header: 'Total (USD)', key: 'total', width: 14 },
    ],
    'Libro de Ventas',
    `LibroVentas_${MONTHS_ES[month]}_${year}.xlsx`,
  );

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {MONTHS_ES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {filtered.length} factura{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
        >
          <Download size={13} />Exportar Excel
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Base Imponible', value: `$${totals.base.toFixed(2)}`, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'IVA Cobrado', value: `$${totals.iva.toFixed(2)}`, color: 'text-sky-600 dark:text-sky-400' },
          { label: 'IGTF Cobrado', value: `$${totals.igtf.toFixed(2)}`, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Total Facturado', value: `$${totals.total.toFixed(2)}`, color: 'text-emerald-600 dark:text-emerald-400' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={22} />
            <span className="text-xs font-bold uppercase tracking-widest">Cargando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <BookOpen size={48} className="text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-black text-slate-500">Sin ventas en {MONTHS_ES[month]} {year}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                  {['N°', 'Fecha', 'Nro Control', 'RIF', 'Cliente', 'Base Imp.', 'Alíc.', 'IVA', 'IGTF', 'Total'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-600">{i + 1}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{m.date}</td>
                    <td className="px-4 py-3.5 font-mono font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{m.nroControl || '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.entityRif || '—'}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200 max-w-[180px] truncate">
                      {m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityName || m.entityId || '—')}
                    </td>
                    <td className="px-4 py-3.5 font-black text-slate-700 dark:text-slate-300 text-right">${getBase(m).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 font-black text-[9px]">
                        {m.ivaAmount ? '16%' : '0%'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-black text-sky-600 dark:text-sky-400 text-right">${Number(m.ivaAmount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black text-amber-600 dark:text-amber-400 text-right">${Number(m.igtfAmount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black text-emerald-600 dark:text-emerald-400 text-right">${getUsd(m).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-200 dark:border-white/10">
                  <td colSpan={5} className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Totales del período</td>
                  <td className="px-4 py-3.5 font-black text-slate-800 dark:text-white text-right">${totals.base.toFixed(2)}</td>
                  <td />
                  <td className="px-4 py-3.5 font-black text-sky-600 dark:text-sky-400 text-right">${totals.iva.toFixed(2)}</td>
                  <td className="px-4 py-3.5 font-black text-amber-600 dark:text-amber-400 text-right">${totals.igtf.toFixed(2)}</td>
                  <td className="px-4 py-3.5 font-black text-emerald-600 dark:text-emerald-400 text-right">${totals.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── LIBRO DE COMPRAS ─────────────────────────────────────────────────────────
const LibroCompras: React.FC<{ movements: Movement[]; loading: boolean }> = ({ movements, loading }) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const filtered = useMemo(() => {
    return movements
      .filter(m => {
        if (m.anulada) return false;
        // CxP / gastos / compras
        if (m.movementType !== 'GASTO' && m.movementType !== 'COMPRA' && m.movementType !== 'PAGO') return false;
        const d = new Date(m.date || m.createdAt);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt));
  }, [movements, month, year]);

  const totals = useMemo(() => ({
    base:  filtered.reduce((s, m) => s + getBase(m), 0),
    iva:   filtered.reduce((s, m) => s + Number(m.ivaAmount ?? 0), 0),
    total: filtered.reduce((s, m) => s + getUsd(m), 0),
  }), [filtered]);

  const handleExport = () => exportExcel(
    filtered.map((m, i) => ({
      num: i + 1,
      fecha: m.date,
      rifProveedor: m.entityRif || '—',
      proveedor: m.entityName || m.entityId || '—',
      concepto: m.concept || '—',
      base: getBase(m).toFixed(2),
      alicuota: m.ivaAmount ? '16%' : '0%',
      iva: Number(m.ivaAmount ?? 0).toFixed(2),
      total: getUsd(m).toFixed(2),
    })),
    [
      { header: 'N°', key: 'num', width: 6 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'RIF Proveedor', key: 'rifProveedor', width: 16 },
      { header: 'Proveedor', key: 'proveedor', width: 30 },
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Base Imp. (USD)', key: 'base', width: 16 },
      { header: 'Alícuota', key: 'alicuota', width: 10 },
      { header: 'IVA (USD)', key: 'iva', width: 14 },
      { header: 'Total (USD)', key: 'total', width: 14 },
    ],
    'Libro de Compras',
    `LibroCompras_${MONTHS_ES[month]}_${year}.xlsx`,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
              {MONTHS_ES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
              {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
          <Download size={13} />Exportar Excel
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Base Imponible', value: `$${totals.base.toFixed(2)}`, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'IVA Pagado', value: `$${totals.iva.toFixed(2)}`, color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Total Compras', value: `$${totals.total.toFixed(2)}`, color: 'text-rose-600 dark:text-rose-400' },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <Receipt size={48} className="text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-black text-slate-500">Sin compras en {MONTHS_ES[month]} {year}</p>
            <p className="text-xs text-slate-400 mt-1">Los gastos registrados en CxP aparecen aquí</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                  {['N°', 'Fecha', 'RIF', 'Proveedor', 'Concepto', 'Base Imp.', 'Alíc.', 'IVA', 'Total'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3.5 font-black text-slate-400 dark:text-slate-600">{i + 1}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-300">{m.date}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-slate-400">{m.entityRif || '—'}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200 max-w-[160px] truncate">{m.entityName || m.entityId || '—'}</td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{m.concept || '—'}</td>
                    <td className="px-4 py-3.5 font-black text-slate-700 dark:text-slate-300 text-right">${getBase(m).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 font-black text-[9px]">
                        {m.ivaAmount ? '16%' : '0%'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-black text-violet-600 dark:text-violet-400 text-right">${Number(m.ivaAmount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black text-rose-600 dark:text-rose-400 text-right">${getUsd(m).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-200 dark:border-white/10">
                  <td colSpan={5} className="px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Totales</td>
                  <td className="px-4 py-3.5 font-black text-slate-800 dark:text-white text-right">${totals.base.toFixed(2)}</td>
                  <td />
                  <td className="px-4 py-3.5 font-black text-violet-600 dark:text-violet-400 text-right">${totals.iva.toFixed(2)}</td>
                  <td className="px-4 py-3.5 font-black text-rose-600 dark:text-rose-400 text-right">${totals.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DECLARACIÓN IVA ──────────────────────────────────────────────────────────
const DeclaracionIva: React.FC<{ movements: Movement[]; loading: boolean }> = ({ movements, loading }) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const { ventas, compras } = useMemo(() => {
    const inMonth = (m: Movement) => {
      const d = new Date(m.date || m.createdAt);
      return d.getMonth() === month && d.getFullYear() === year && !m.anulada;
    };
    const ventas = movements.filter(m => m.movementType === 'FACTURA' && inMonth(m));
    const compras = movements.filter(m =>
      (m.movementType === 'GASTO' || m.movementType === 'COMPRA' || m.movementType === 'PAGO') && inMonth(m)
    );
    return { ventas, compras };
  }, [movements, month, year]);

  const ivaCobrado = ventas.reduce((s, m) => s + Number(m.ivaAmount ?? 0), 0);
  const ivaPagado  = compras.reduce((s, m) => s + Number(m.ivaAmount ?? 0), 0);
  const igtfTotal  = ventas.reduce((s, m) => s + Number(m.igtfAmount ?? 0), 0);
  const totalVentas = ventas.reduce((s, m) => s + getUsd(m), 0);
  const totalCompras = compras.reduce((s, m) => s + getUsd(m), 0);
  const saldoIva   = ivaCobrado - ivaPagado;

  const Row = ({ label, value, sub, color = 'text-slate-800 dark:text-white', border = false }: any) => (
    <div className={`flex justify-between items-center py-4 ${border ? 'border-t-2 border-slate-200 dark:border-white/10 mt-2 pt-4' : 'border-b border-slate-100 dark:border-white/[0.06]'}`}>
      <div>
        <p className={`text-sm font-bold ${color === 'text-slate-800 dark:text-white' ? 'text-slate-600 dark:text-slate-300' : color}`}>{label}</p>
        {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <p className={`text-xl font-black ${color}`}>${typeof value === 'number' ? value.toFixed(2) : value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
            {MONTHS_ES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="appearance-none pl-4 pr-8 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Declaración card */}
          <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="h-8 w-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Declaración IVA</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{MONTHS_ES[month]} {year}</p>
              </div>
            </div>

            <Row label="Ventas Totales (USD)" value={totalVentas} sub={`${ventas.length} facturas emitidas`} />
            <Row label="IVA Débito Fiscal (cobrado)" value={ivaCobrado} color="text-sky-600 dark:text-sky-400" sub="IVA en ventas" />
            <Row label="IVA Crédito Fiscal (pagado)" value={ivaPagado} color="text-violet-600 dark:text-violet-400" sub="IVA en compras" />
            <Row label="IGTF Total" value={igtfTotal} color="text-amber-600 dark:text-amber-400" sub="Impuesto a transacciones en divisas" />
            <Row
              label="IVA Neto a Pagar"
              value={saldoIva}
              color={saldoIva >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
              sub={saldoIva >= 0 ? 'Monto a declarar al SENIAT' : 'Crédito fiscal a favor'}
              border
            />
          </div>

          {/* Visual summary */}
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/30 border border-sky-100 dark:border-sky-500/20 rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-1">Débito Fiscal (ventas)</p>
              <p className="text-3xl font-black text-sky-700 dark:text-sky-300">${ivaCobrado.toFixed(2)}</p>
              <p className="text-xs text-sky-500 dark:text-sky-400 mt-1">{ventas.length} facturas — base ${ventas.reduce((s, m) => s + getBase(m), 0).toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/30 border border-violet-100 dark:border-violet-500/20 rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-1">Crédito Fiscal (compras)</p>
              <p className="text-3xl font-black text-violet-700 dark:text-violet-300">${ivaPagado.toFixed(2)}</p>
              <p className="text-xs text-violet-500 dark:text-violet-400 mt-1">{compras.length} compras — base ${compras.reduce((s, m) => s + getBase(m), 0).toFixed(2)}</p>
            </div>
            <div className={`rounded-2xl p-5 border ${saldoIva >= 0
              ? 'bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/40 dark:to-red-950/30 border-rose-100 dark:border-rose-500/20'
              : 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-emerald-100 dark:border-emerald-500/20'
            }`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${saldoIva >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {saldoIva >= 0 ? 'IVA a Pagar al SENIAT' : 'Crédito Fiscal a Favor'}
              </p>
              <p className={`text-3xl font-black ${saldoIva >= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                ${Math.abs(saldoIva).toFixed(2)}
              </p>
              <p className={`text-xs mt-1 ${saldoIva >= 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                Débito ${ivaCobrado.toFixed(2)} − Crédito ${ivaPagado.toFixed(2)}
              </p>
            </div>

            {totalVentas > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-4 flex gap-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-black">Recuerda:</span> El IGTF de <span className="font-black">${igtfTotal.toFixed(2)}</span> debe declararse por separado en la Forma 33 del SENIAT.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── ARQUEOS HISTORY ──────────────────────────────────────────────────────────
const ArqueosHistory: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [arqueos, setArqueos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, `businesses/${businessId}/arqueos`),
      orderBy('fechaCierre', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, snap => {
      setArqueos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [businessId]);

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
      <Loader2 className="animate-spin" size={22} />
    </div>
  );

  if (arqueos.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 opacity-40 text-center">
      <ClipboardList size={56} className="text-slate-300 dark:text-slate-700 mb-3" />
      <p className="text-sm font-black text-slate-500">Sin arqueos registrados</p>
      <p className="text-xs text-slate-400 mt-1">Los cierres de turno aparecen aquí automáticamente</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{arqueos.length} arqueo{arqueos.length !== 1 ? 's' : ''} registrados</p>
      </div>

      {arqueos.map(a => {
        const isExp = expanded === a.id;
        const variance = Number(a.varianceUsd ?? 0);
        return (
          <div key={a.id} className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
              onClick={() => setExpanded(isExp ? null : a.id)}
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <ClipboardList size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{a.terminalNombre || a.terminalId || 'Terminal'}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                    {fmtDate(a.fechaCierre || a.fecha)} · {a.cajero || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${Number(a.totalVentas ?? 0).toFixed(2)}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{a.totalTransacciones ?? 0} ventas</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                    Math.abs(variance) < 0.01
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                      : variance > 0
                        ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400'
                        : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
                  </span>
                </div>
                <ChevronRight size={16} className={`text-slate-300 dark:text-slate-600 transition-transform ${isExp ? 'rotate-90' : ''}`} />
              </div>
            </button>

            {isExp && (
              <div className="px-5 pb-5 border-t border-slate-50 dark:border-white/[0.04] pt-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Efectivo USD esperado', value: `$${Number(a.expectedCashUsd ?? 0).toFixed(2)}`, c: 'text-slate-700 dark:text-slate-300' },
                    { label: 'Contado USD', value: `$${Number(a.totalCountedUsd ?? 0).toFixed(2)}`, c: 'text-indigo-600 dark:text-indigo-400' },
                    { label: 'Variación', value: `${variance >= 0 ? '+' : ''}$${variance.toFixed(2)}`, c: Math.abs(variance) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
                    { label: 'Bs Contados', value: `${Number(a.totalCountedBs ?? 0).toFixed(0)} Bs`, c: 'text-amber-600 dark:text-amber-400' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{item.label}</p>
                      <p className={`text-lg font-black ${item.c}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* USD denomination breakdown */}
                {a.usdBills && Object.keys(a.usdBills).length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Denominaciones USD</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(a.usdBills as Record<string, number>)
                        .filter(([, qty]) => qty > 0)
                        .map(([denom, qty]) => (
                          <span key={denom} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-xl text-xs font-black text-emerald-700 dark:text-emerald-400">
                            ${denom} × {qty} = ${(Number(denom) * qty).toFixed(0)}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {a.notes && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-500/20">
                    <p className="text-xs text-amber-700 dark:text-amber-300"><span className="font-black">Notas:</span> {a.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── CONFIG FISCAL ────────────────────────────────────────────────────────────
const ConfigFiscal: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [config, setConfig] = useState<FiscalConfig>(DEFAULT_FISCAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'businessConfigs', businessId));
        if (snap.exists()) {
          setConfig({ ...DEFAULT_FISCAL, ...snap.data() } as FiscalConfig);
        }
      } finally { setLoading(false); }
    };
    load();
  }, [businessId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), config, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, placeholder, icon: Icon }: any) => (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5 block">
        <Icon size={11} />{label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
      />
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
      <Loader2 className="animate-spin" size={22} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Tipo de Negocio */}
      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <ShoppingBag size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Tipo de Negocio</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Selecciona tu rubro para configurar automáticamente los impuestos</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.entries(NEGOCIO_PRESETS) as [TipoNegocio, typeof NEGOCIO_PRESETS[TipoNegocio]][]).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setConfig(p => ({ ...p, tipoNegocio: key, ivaAlicuota: preset.ivaAlicuota }))}
              className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                config.tipoNegocio === key
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-100 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${config.tipoNegocio === key ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {preset.icon}
              </span>
              <div>
                <p className={`text-xs font-black ${config.tipoNegocio === key ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                  {preset.label}
                </p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{preset.desc}</p>
                <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                  preset.ivaAlicuota === 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                }`}>
                  IVA {preset.ivaAlicuota}%
                </span>
              </div>
            </button>
          ))}
        </div>
        {config.tipoNegocio && NEGOCIO_PRESETS[config.tipoNegocio]?.nota && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-500/20 flex gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">{NEGOCIO_PRESETS[config.tipoNegocio].nota}</p>
          </div>
        )}
      </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Datos empresa */}
      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Building2 size={16} />
          </div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Datos del Contribuyente</h3>
        </div>

        <Field label="RIF" value={config.rif} onChange={(v: string) => setConfig(p => ({ ...p, rif: v }))}
          placeholder="J-12345678-9" icon={Hash} />
        <Field label="Razón Social" value={config.razonSocial} onChange={(v: string) => setConfig(p => ({ ...p, razonSocial: v }))}
          placeholder="Mi Empresa, C.A." icon={Building2} />
        <Field label="Domicilio Fiscal" value={config.domicilioFiscal} onChange={(v: string) => setConfig(p => ({ ...p, domicilioFiscal: v }))}
          placeholder="Av. Principal, Caracas, Venezuela" icon={MapPin} />
        <Field label="Teléfono" value={config.telefono} onChange={(v: string) => setConfig(p => ({ ...p, telefono: v }))}
          placeholder="+58 212-000-0000" icon={Phone} />
        <Field label="Representante Legal" value={config.representanteLegal} onChange={(v: string) => setConfig(p => ({ ...p, representanteLegal: v }))}
          placeholder="Juan Pérez" icon={User} />

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5 block">
            <BadgeCheck size={11} />Tipo de Contribuyente
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['ordinario', 'especial', 'formal'] as const).map(tipo => (
              <button
                key={tipo}
                onClick={() => setConfig(p => ({ ...p, tipoContribuyente: tipo }))}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                  config.tipoContribuyente === tipo
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                {tipo}
              </button>
            ))}
          </div>
          {config.tipoContribuyente === 'especial' && (
            <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-bold">
              Como Contribuyente Especial, debes retener el 75% del IVA a tus proveedores ordinarios.
            </p>
          )}
        </div>
      </div>

      {/* Configuración de facturas */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <FileText size={16} />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Configuración de Facturas</h3>
          </div>

          <Field label="Prefijo de Factura" value={config.invoicePrefix}
            onChange={(v: string) => setConfig(p => ({ ...p, invoicePrefix: v }))}
            placeholder="FACT-" icon={Hash} />

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">Alícuota IVA (%)</label>
            <div className="flex gap-2">
              {[0, 8, 16].map(v => (
                <button key={v} onClick={() => setConfig(p => ({ ...p, ivaAlicuota: v }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-black border-2 transition-all ${
                    config.ivaAlicuota === v
                      ? 'border-sky-500 bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                      : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                  }`}>{v}%</button>
              ))}
            </div>
          </div>

          {/* Correlativo counter */}
          <div className="p-4 bg-slate-50 dark:bg-white/[0.04] rounded-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Próximo Nro. de Control</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                {config.invoicePrefix}{String(config.nextNroControl || 1).padStart(8, '0')}
              </p>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">(auto-increment)</span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              Se incrementa automáticamente con cada factura emitida.
            </p>
          </div>
        </div>

        {/* Retenciones info */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-100 dark:border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-black text-amber-800 dark:text-amber-200">Retenciones SENIAT (Venezuela)</p>
              <p>• <strong>IVA:</strong> Contribuyentes Especiales retienen 75% del IVA (o 100% en servicios)</p>
              <p>• <strong>ISLR:</strong> Retenciones sobre honorarios, servicios profesionales, arrendamientos</p>
              <p>• <strong>IGTF:</strong> 3% sobre pagos en divisas o criptomonedas (Forma 33)</p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
        >
          {saving
            ? <><Loader2 size={16} className="animate-spin" />Guardando...</>
            : saved
              ? <><CheckCircle2 size={16} />Guardado</>
              : <><RefreshCw size={16} />Guardar Configuración Fiscal</>
          }
        </button>
      </div>
    </div>
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
type FiscalTab = 'ventas' | 'compras' | 'declaracion' | 'arqueos' | 'config';

export default function FiscalSection() {
  const { userProfile } = useAuth();
  const businessId = userProfile?.businessId ?? '';
  const [tab, setTab] = useState<FiscalTab>('ventas');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'movements'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, snap => {
      setMovements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Movement)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [businessId]);

  const TABS: { id: FiscalTab; label: string; icon: React.ReactNode }[] = [
    { id: 'ventas',      label: 'Libro de Ventas',   icon: <BookOpen size={12} />       },
    { id: 'compras',     label: 'Libro de Compras',  icon: <Receipt size={12} />        },
    { id: 'declaracion', label: 'Declaración IVA',   icon: <Calculator size={12} />     },
    { id: 'arqueos',     label: 'Arqueos / Z',       icon: <ClipboardList size={12} />  },
    { id: 'config',      label: 'Config. Fiscal',    icon: <Settings2 size={12} />      },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] transition-colors">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-indigo-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">SENIAT · Venezuela</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Gestión Fiscal</h1>
          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Libros de ventas y compras, declaración IVA, arqueos de caja y configuración tributaria
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 bg-white dark:bg-[#0d1424] p-1.5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/[0.07] w-fit">
          {TABS.map(t => (
            <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} icon={t.icon} label={t.label} />
          ))}
        </div>

        {/* Content */}
        <div>
          {tab === 'ventas'      && <LibroVentas movements={movements} loading={loading} />}
          {tab === 'compras'     && <LibroCompras movements={movements} loading={loading} />}
          {tab === 'declaracion' && <DeclaracionIva movements={movements} loading={loading} />}
          {tab === 'arqueos'     && businessId && <ArqueosHistory businessId={businessId} />}
          {tab === 'config'      && businessId && <ConfigFiscal businessId={businessId} />}
        </div>
      </div>
    </div>
  );
}
