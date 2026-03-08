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
  ChevronRight, Construction,
} from 'lucide-react';

// ─── Próximamente / En Homologación ───────────────────────────────────────────
const ProximamenteFiscal: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center max-w-lg mx-auto">
    {/* Icon */}
    <div className="w-20 h-20 mb-6 rounded-3xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 flex items-center justify-center shadow-lg shadow-amber-500/10">
      <Construction size={32} className="text-amber-500 dark:text-amber-400" />
    </div>

    {/* Badge */}
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-[0.2em] mb-4">
      En homologación SENIAT
    </span>

    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-3">{title}</h3>
    <p className="text-sm text-slate-500 dark:text-white/40 leading-relaxed mb-6">{description}</p>

    {/* Notice */}
    <div className="w-full p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-200 dark:border-amber-500/20 text-left">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">Aviso legal</p>
      <p className="text-[11px] text-amber-700 dark:text-amber-400/70 leading-relaxed">
        Este módulo está en desarrollo y pendiente de homologación oficial por el SENIAT. No tiene validez fiscal hasta su certificación. No lo uses como documento oficial.
      </p>
    </div>
  </div>
);

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
      {/* SENIAT PA-121 Banner */}
      <div className="p-5 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/40 dark:to-red-950/20 border border-rose-200 dark:border-rose-500/30 rounded-2xl flex gap-4">
        <div className="h-10 w-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
          <AlertTriangle size={20} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-black text-rose-800 dark:text-rose-200">Providencia SENIAT PA-121 — Vigente desde Marzo 2025</p>
          <p className="text-xs text-rose-700 dark:text-rose-300 leading-snug">
            Desde el <strong>20 de marzo de 2025</strong>, todo negocio en Venezuela debe emitir facturas usando
            un <strong>sistema homologado por el SENIAT</strong> (SNAT/2024/000121). Requisitos: API de integración
            con el SENIAT, cifrado de datos, N° de Control correlativo, notas de débito/crédito digitales,
            y cumplimiento con IVA + ISLR + IGTF.
          </p>
          <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">
            ⚡ Dualis está en proceso de certificación SENIAT. Consulta con tu contador.
          </p>
        </div>
      </div>

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

// ─── NOTAS DE DÉBITO / CRÉDITO ────────────────────────────────────────────────
const TIPO_NOTA = { NC: 'NOTA_CREDITO', ND: 'NOTA_DEBITO' } as const;

const NotasDC: React.FC<{ movements: Movement[]; loading: boolean; businessId: string }> = ({
  movements, loading, businessId,
}) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: 'NC' as 'NC' | 'ND',
    nroFacturaOrigen: '',
    entityId: '',
    concepto: '',
    monto: '',
    metodoPago: 'efectivo_usd',
  });

  const filtered = useMemo(() => movements
    .filter(m => !m.anulada && (m.movementType === TIPO_NOTA.NC || m.movementType === TIPO_NOTA.ND))
    .filter(m => {
      const d = new Date(m.date || m.createdAt);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)),
  [movements, month, year]);

  const totalNC = filtered.filter(m => m.movementType === TIPO_NOTA.NC).reduce((s, m) => s + getUsd(m), 0);
  const totalND = filtered.filter(m => m.movementType === TIPO_NOTA.ND).reduce((s, m) => s + getUsd(m), 0);

  const handleCreate = async () => {
    if (!form.monto || !form.concepto || !businessId) return;
    setSaving(true);
    try {
      const { getNextNroControl } = await import('../utils/facturaUtils');
      const { formatted: nroControl } = await getNextNroControl(businessId);
      const { addDoc, collection: col } = await import('firebase/firestore');
      const today = new Date().toISOString().split('T')[0];
      await addDoc(col(db, 'movements'), {
        businessId,
        movementType: TIPO_NOTA[form.tipo],
        nroControl,
        nroFacturaOrigen: form.nroFacturaOrigen || null,
        entityId: form.entityId || 'CONSUMIDOR_FINAL',
        concept: `${form.tipo === 'NC' ? 'Nota de Crédito' : 'Nota de Débito'} — ${form.concepto}`,
        amount: Number(form.monto),
        amountInUSD: Number(form.monto),
        metodoPago: form.metodoPago,
        date: today,
        createdAt: new Date().toISOString(),
        anulada: false,
      });
      setShowModal(false);
      setForm({ tipo: 'NC', nroFacturaOrigen: '', entityId: '', concepto: '', monto: '', metodoPago: 'efectivo_usd' });
    } finally { setSaving(false); }
  };

  const handleExport = () => exportExcel(
    filtered.map((m, i) => ({
      num: i + 1,
      tipo: m.movementType === TIPO_NOTA.NC ? 'Nota de Crédito' : 'Nota de Débito',
      fecha: m.date,
      nroControl: m.nroControl || '—',
      nroOrigen: (m as any).nroFacturaOrigen || '—',
      cliente: m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityName || m.entityId || '—'),
      concepto: m.concept || '—',
      monto: getUsd(m).toFixed(2),
    })),
    [
      { header: 'N°', key: 'num', width: 6 },
      { header: 'Tipo', key: 'tipo', width: 16 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Nro Control', key: 'nroControl', width: 16 },
      { header: 'Factura Origen', key: 'nroOrigen', width: 16 },
      { header: 'Cliente', key: 'cliente', width: 28 },
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Monto (USD)', key: 'monto', width: 14 },
    ],
    'Notas DC',
    `NotasDebCred_${MONTHS_ES[month]}_${year}.xlsx`,
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
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
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
            <Download size={13} />Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all">
            <FileText size={13} />Nueva Nota
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Notas de Crédito', value: `$${totalNC.toFixed(2)}`, color: 'text-violet-600 dark:text-violet-400', sub: `${filtered.filter(m => m.movementType === TIPO_NOTA.NC).length} emitidas` },
          { label: 'Notas de Débito', value: `$${totalND.toFixed(2)}`, color: 'text-amber-600 dark:text-amber-400', sub: `${filtered.filter(m => m.movementType === TIPO_NOTA.ND).length} emitidas` },
          { label: 'Total Período', value: `$${(totalNC + totalND).toFixed(2)}`, color: 'text-slate-700 dark:text-slate-200', sub: `${filtered.length} documentos` },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{c.label}</p>
            <p className={`text-xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl flex gap-3">
        <AlertTriangle size={15} className="text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          <span className="font-black">Nota de Crédito (NC):</span> reduce la deuda del cliente (devoluciones, descuentos post-factura).
          {' '}<span className="font-black">Nota de Débito (ND):</span> aumenta la deuda del cliente (cargos adicionales, diferencias de precio).
          Ambas requieren N° de Control correlativo propio.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Loader2 className="animate-spin" size={22} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <FileText size={48} className="text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-black text-slate-500">Sin Notas de Débito/Crédito en {MONTHS_ES[month]} {year}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                  {['Tipo', 'Fecha', 'Nro Control', 'Factura Origen', 'Cliente', 'Concepto', 'Monto'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md font-black text-[9px] ${
                        m.movementType === TIPO_NOTA.NC
                          ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                          : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {m.movementType === TIPO_NOTA.NC ? 'NC' : 'ND'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{m.date}</td>
                    <td className="px-4 py-3.5 font-mono font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{m.nroControl || '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{(m as any).nroFacturaOrigen || '—'}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200 max-w-[160px] truncate">
                      {m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityName || m.entityId || '—')}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{m.concept}</td>
                    <td className="px-4 py-3.5 font-black text-right">
                      <span className={m.movementType === TIPO_NOTA.NC ? 'text-violet-600 dark:text-violet-400' : 'text-amber-600 dark:text-amber-400'}>
                        ${getUsd(m).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-md rounded-2xl shadow-2xl shadow-black/40 border border-transparent dark:border-white/[0.07] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.07] flex justify-between items-center">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Nueva Nota de Débito / Crédito</h3>
              <button onClick={() => setShowModal(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-400 transition-all">
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['NC', 'ND'] as const).map(t => (
                  <button key={t} onClick={() => setForm(p => ({ ...p, tipo: t }))}
                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                      form.tipo === t
                        ? t === 'NC' ? 'border-violet-600 bg-violet-600 text-white' : 'border-amber-500 bg-amber-500 text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                    }`}>
                    {t === 'NC' ? '🟣 Nota de Crédito' : '🟡 Nota de Débito'}
                  </button>
                ))}
              </div>

              {[
                { label: 'Factura de Origen (N° Control)', key: 'nroFacturaOrigen', placeholder: 'FACT-00000001 (opcional)' },
                { label: 'Cliente / RIF', key: 'entityId', placeholder: 'J-12345678-9 o nombre' },
                { label: 'Concepto', key: 'concepto', placeholder: 'Ej. Devolución parcial por defecto' },
                { label: 'Monto (USD)', key: 'monto', placeholder: '0.00' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">{f.label}</label>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    type={f.key === 'monto' ? 'number' : 'text'}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !form.monto || !form.concepto}
                  className="flex-[2] py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40 transition-all">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} />Registrar Nota</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── RETENCIONES IVA ──────────────────────────────────────────────────────────
interface Retencion {
  id: string;
  fecha: string;
  nroComprobante: string;
  proveedorNombre: string;
  proveedorRif: string;
  nroFactura: string;
  montoFactura: number;
  montoBaseIva: number;
  pctRetencion: number;
  montoRetenido: number;
  tipo: 'emitida' | 'recibida';
}

const RetencionesIva: React.FC<{ businessId: string }> = ({ businessId }) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: 'recibida' as 'emitida' | 'recibida',
    proveedorNombre: '',
    proveedorRif: '',
    nroFactura: '',
    montoFactura: '',
    pctRetencion: 75,
  });

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, `businesses/${businessId}/retenciones`),
      orderBy('fecha', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRetenciones(snap.docs.map(d => ({ id: d.id, ...d.data() } as Retencion)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [businessId]);

  const filtered = useMemo(() => retenciones.filter(r => {
    const d = new Date(r.fecha);
    return d.getMonth() === month && d.getFullYear() === year;
  }), [retenciones, month, year]);

  const totalRetenido = filtered.reduce((s, r) => s + r.montoRetenido, 0);
  const nextNroComp = String(retenciones.length + 1).padStart(8, '0');

  const montoBaseIva = Number(form.montoFactura) * 0.16;
  const montoRetenido = montoBaseIva * (form.pctRetencion / 100);

  const handleCreate = async () => {
    if (!form.montoFactura || !form.proveedorNombre) return;
    setSaving(true);
    try {
      const { addDoc, collection: col } = await import('firebase/firestore');
      const today = new Date().toISOString().split('T')[0];
      await addDoc(col(db, `businesses/${businessId}/retenciones`), {
        fecha: today,
        nroComprobante: `RET-${nextNroComp}`,
        proveedorNombre: form.proveedorNombre,
        proveedorRif: form.proveedorRif,
        nroFactura: form.nroFactura,
        montoFactura: Number(form.montoFactura),
        montoBaseIva,
        pctRetencion: form.pctRetencion,
        montoRetenido,
        tipo: form.tipo,
        createdAt: new Date().toISOString(),
      });
      setShowModal(false);
      setForm({ tipo: 'recibida', proveedorNombre: '', proveedorRif: '', nroFactura: '', montoFactura: '', pctRetencion: 75 });
    } finally { setSaving(false); }
  };

  const handleExport = () => exportExcel(
    filtered.map((r, i) => ({
      num: i + 1,
      tipo: r.tipo === 'emitida' ? 'Emitida (a proveedor)' : 'Recibida (de cliente)',
      fecha: r.fecha,
      nroComprobante: r.nroComprobante,
      proveedor: r.proveedorNombre,
      rif: r.proveedorRif || '—',
      nroFactura: r.nroFactura || '—',
      montoFactura: r.montoFactura.toFixed(2),
      baseIva: r.montoBaseIva.toFixed(2),
      pct: `${r.pctRetencion}%`,
      montoRetenido: r.montoRetenido.toFixed(2),
    })),
    [
      { header: 'N°', key: 'num', width: 5 },
      { header: 'Tipo', key: 'tipo', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'N° Comprobante', key: 'nroComprobante', width: 16 },
      { header: 'Proveedor / Cliente', key: 'proveedor', width: 28 },
      { header: 'RIF', key: 'rif', width: 14 },
      { header: 'N° Factura', key: 'nroFactura', width: 14 },
      { header: 'Monto Factura', key: 'montoFactura', width: 14 },
      { header: 'Base IVA', key: 'baseIva', width: 12 },
      { header: '% Reten.', key: 'pct', width: 10 },
      { header: 'Monto Retenido', key: 'montoRetenido', width: 16 },
    ],
    'Retenciones IVA',
    `RetencionesIVA_${MONTHS_ES[month]}_${year}.xlsx`,
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
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
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{filtered.length} comprobante{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
            <Download size={13} />Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/25 transition-all">
            <FileText size={13} />Nuevo Comprobante
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 rounded-2xl flex gap-3">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p className="font-black">¿Cuándo aplicar retención IVA?</p>
            <p>• <strong>Contrib. Especial compra:</strong> retiene 75% del IVA al proveedor ordinario</p>
            <p>• <strong>Servicio o inmueble:</strong> retiene 100% del IVA</p>
            <p>• Emite comprobante con N° correlativo antes de pagar</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Calculator size={22} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Total Retenido {MONTHS_ES[month]}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">${totalRetenido.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#0d1424] border border-slate-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Loader2 className="animate-spin" size={22} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <Receipt size={48} className="text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-black text-slate-500">Sin comprobantes en {MONTHS_ES[month]} {year}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                  {['Tipo', 'Fecha', 'N° Comp.', 'Proveedor/Cliente', 'RIF', 'N° Factura', 'Base IVA', '%', 'Retenido'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md font-black text-[9px] ${r.tipo === 'emitida' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}>
                        {r.tipo === 'emitida' ? 'Emitida' : 'Recibida'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{r.fecha}</td>
                    <td className="px-4 py-3.5 font-mono font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{r.nroComprobante}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200 max-w-[160px] truncate">{r.proveedorNombre}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-slate-400">{r.proveedorRif || '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500 dark:text-slate-400">{r.nroFactura || '—'}</td>
                    <td className="px-4 py-3.5 font-black text-slate-700 dark:text-slate-300 text-right">${r.montoBaseIva.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md font-black text-[9px]">{r.pctRetencion}%</span>
                    </td>
                    <td className="px-4 py-3.5 font-black text-rose-600 dark:text-rose-400 text-right">${r.montoRetenido.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-white/[0.03] border-t-2 border-slate-200 dark:border-white/10">
                  <td colSpan={8} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Total retenido</td>
                  <td className="px-4 py-3 font-black text-rose-600 dark:text-rose-400 text-right">${totalRetenido.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-md rounded-2xl shadow-2xl shadow-black/40 border border-transparent dark:border-white/[0.07] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.07] flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Comprobante de Retención IVA</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">N° {`RET-${nextNroComp}`}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-400">
                <ChevronDown size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {(['recibida', 'emitida'] as const).map(t => (
                  <button key={t} onClick={() => setForm(p => ({ ...p, tipo: t }))}
                    className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                      form.tipo === t
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                    }`}>
                    {t === 'recibida' ? '↓ Recibida' : '↑ Emitida'}
                  </button>
                ))}
              </div>

              {[
                { label: 'Proveedor / Cliente', key: 'proveedorNombre', placeholder: 'Nombre o razón social', type: 'text' },
                { label: 'RIF', key: 'proveedorRif', placeholder: 'J-12345678-9', type: 'text' },
                { label: 'N° Factura origen', key: 'nroFactura', placeholder: 'FACT-00000001', type: 'text' },
                { label: 'Monto total de la Factura (USD)', key: 'montoFactura', placeholder: '0.00', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">{f.label}</label>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    type={f.type}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ))}

              {/* % retención */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">% Retención IVA</label>
                <div className="flex gap-2">
                  {[75, 100].map(p => (
                    <button key={p} onClick={() => setForm(f => ({ ...f, pctRetencion: p }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                        form.pctRetencion === p
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                      }`}>{p}%</button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">75% bienes · 100% servicios o inmuebles</p>
              </div>

              {/* Preview */}
              {form.montoFactura && (
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-500/20">
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-2">Cálculo de retención</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Base IVA (16%)</span><span className="font-black">${montoBaseIva.toFixed(2)}</span></div>
                    <div className="flex justify-between text-rose-600 dark:text-rose-400"><span>Retención ({form.pctRetencion}%)</span><span className="font-black">${montoRetenido.toFixed(2)}</span></div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={saving || !form.montoFactura || !form.proveedorNombre}
                  className="flex-[2] py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <><CheckCircle2 size={14} />Emitir Comprobante</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
type FiscalTab = 'ventas' | 'compras' | 'declaracion' | 'notasDC' | 'retenciones' | 'arqueos' | 'config';

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
    { id: 'notasDC',     label: 'Notas D/C',         icon: <FileText size={12} />       },
    { id: 'retenciones', label: 'Retenciones IVA',   icon: <BadgeCheck size={12} />     },
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
          {tab === 'ventas'      && <ProximamenteFiscal title="Libro de Ventas IVA" description="Registro mensual de facturas emitidas en formato SENIAT. Pendiente de homologación oficial antes de su activación." />}
          {tab === 'compras'     && <ProximamenteFiscal title="Libro de Compras IVA" description="Registro mensual de facturas recibidas y crédito fiscal. Pendiente de homologación oficial antes de su activación." />}
          {tab === 'declaracion' && <ProximamenteFiscal title="Declaración IVA" description="Formulario de declaración y pago del IVA período a período. Pendiente de integración con el portal SENIAT." />}
          {tab === 'notasDC'     && <ProximamenteFiscal title="Notas de Débito y Crédito" description="Gestión de ajustes fiscales mediante notas de débito y crédito. Pendiente de homologación SENIAT." />}
          {tab === 'retenciones' && <ProximamenteFiscal title="Retenciones IVA" description="Comprobantes de retención IVA y ISLR. Pendiente de certificación SENIAT." />}
          {tab === 'arqueos'     && businessId && <ArqueosHistory businessId={businessId} />}
          {tab === 'config'      && businessId && <ConfigFiscal businessId={businessId} />}
        </div>
      </div>
    </div>
  );
}
