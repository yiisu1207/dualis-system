import React, { useMemo, useState } from 'react';
import { X, Search, FileText, FileSpreadsheet, FileType2, MessageSquare, Download, Check, Sparkles } from 'lucide-react';
import type { Customer, Supplier, Movement, CustomRate, ExchangeRates } from '../../../types';
import {
  filterMovementsByRange,
  buildChronoData,
  resolveAccountLabel,
  getDistinctAccounts,
  type RangeFilter,
  type TabFilter,
} from './cxcHelpers';
import {
  exportStatementCSV,
  exportStatementFullPDF,
  exportStatementSummaryPDF,
  copyStatementText,
  type CompanyInfo,
  type ExportMeta,
} from '../../utils/clientStatementExports';

interface ExportPanelProps {
  open: boolean;
  onClose: () => void;
  entity: Customer | Supplier;
  movements: Movement[];
  rates: ExchangeRates;
  customRates: CustomRate[];
  company: CompanyInfo;
  mode?: 'cxc' | 'cxp';
}

type TypeFilter = 'ALL' | 'FACTURA' | 'ABONO';
type StatusFilter = 'ALL' | 'PENDIENTE' | 'PAGADO';

const rangeLabel = (r: RangeFilter): string => {
  switch (r) {
    case 'ALL': return 'Todo el historial';
    case 'SINCE_ZERO': return 'Desde saldo cero';
    case 'SINCE_LAST_DEBT': return 'Desde última factura';
    case 'CUSTOM': return 'Rango personalizado';
    default: return 'Todo';
  }
};

export default function ExportPanel({
  open,
  onClose,
  entity,
  movements,
  rates,
  customRates,
  company,
  mode = 'cxc',
}: ExportPanelProps) {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [accountFilter, setAccountFilter] = useState<TabFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const entityMovements = useMemo(
    () => movements.filter(m => m.entityId === entity.id),
    [movements, entity.id]
  );

  const accounts = useMemo(() => getDistinctAccounts(entityMovements), [entityMovements]);

  const filtered = useMemo(() => {
    let result = filterMovementsByRange(entityMovements, accountFilter, range, fromDate, toDate, rates);
    if (typeFilter !== 'ALL') result = result.filter(m => m.movementType === typeFilter);
    if (statusFilter === 'PENDIENTE') result = result.filter(m => !m.pagado && !m.anulada);
    if (statusFilter === 'PAGADO') result = result.filter(m => m.pagado);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(m =>
        (m.concept || '').toLowerCase().includes(q) ||
        (m.nroControl || '').toLowerCase().includes(q) ||
        (m.reference || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [entityMovements, accountFilter, typeFilter, statusFilter, range, fromDate, toDate, rates, search]);

  const chronoData = useMemo(() => buildChronoData(filtered, rates), [filtered, rates]);

  const totals = useMemo(() => {
    const totalDebe = chronoData.reduce((s, m) => s + m.debe, 0);
    const totalHaber = chronoData.reduce((s, m) => s + m.haber, 0);
    const saldo = chronoData.length ? chronoData[chronoData.length - 1].runningBalance : 0;
    return { totalDebe, totalHaber, saldo, count: chronoData.length };
  }, [chronoData]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const buildMeta = (): ExportMeta => ({
    company,
    rangeLabel: rangeLabel(range),
    mode,
  });

  const handleFullPDF = async () => {
    if (chronoData.length === 0) { showToast('No hay movimientos para exportar'); return; }
    setBusy('full-pdf');
    try {
      await exportStatementFullPDF(entity, chronoData, customRates, buildMeta());
      showToast('📄 Expediente PDF descargado');
    } catch (e) {
      console.error(e);
      showToast('Error al generar PDF');
    } finally { setBusy(null); }
  };

  const handleSummaryPDF = async () => {
    setBusy('summary-pdf');
    try {
      await exportStatementSummaryPDF(entity, entityMovements, rates, customRates, buildMeta());
      showToast('📄 Resumen PDF descargado');
    } catch (e) {
      console.error(e);
      showToast('Error al generar resumen');
    } finally { setBusy(null); }
  };

  const handleCSV = () => {
    if (chronoData.length === 0) { showToast('No hay movimientos para exportar'); return; }
    exportStatementCSV(entity, chronoData, customRates, buildMeta());
    showToast('📊 CSV descargado');
  };

  const handleText = async () => {
    if (chronoData.length === 0) { showToast('No hay movimientos para exportar'); return; }
    setBusy('text');
    try {
      await copyStatementText(entity, chronoData, customRates, buildMeta());
      showToast('📋 Texto copiado al portapapeles');
    } catch (e) {
      console.error(e);
      showToast('Error al copiar texto');
    } finally { setBusy(null); }
  };

  const entityName = (entity as any).fullName || (entity as any).nombre || (entity as any).contacto || (entity as any).razonSocial || '';

  const pill = (active: boolean, tone = 'indigo') =>
    `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
      active
        ? `bg-${tone}-500/20 border-${tone}-500/30 text-${tone}-400`
        : 'bg-transparent border-slate-200 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:border-slate-300 dark:hover:border-white/[0.12]'
    }`;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[520px] bg-white dark:bg-[#060a14] border-l border-slate-200 dark:border-white/[0.06] z-[101] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-400" />
              Exportar movimientos
            </h2>
            <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 mt-0.5 truncate max-w-[400px]">
              {entityName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Body — scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Search */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">Búsqueda</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Concepto, Nro. Ctrl, referencia…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-700 dark:text-white/70 placeholder:text-slate-300 dark:placeholder:text-white/20 outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Rango */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">Rango</label>
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'SINCE_ZERO', 'SINCE_LAST_DEBT', 'CUSTOM'] as RangeFilter[]).map(r => (
                <button key={r} onClick={() => setRange(r)} className={pill(range === r)}>
                  {r === 'ALL' ? 'Todo' : r === 'SINCE_ZERO' ? 'Desde cero' : r === 'SINCE_LAST_DEBT' ? 'Últ. factura' : 'Personalizado'}
                </button>
              ))}
            </div>
            {range === 'CUSTOM' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-700 dark:text-white/70 outline-none flex-1" />
                <span className="text-[10px] text-slate-400">a</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs font-bold text-slate-700 dark:text-white/70 outline-none flex-1" />
              </div>
            )}
          </div>

          {/* Cuenta */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">Cuenta</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setAccountFilter('ALL')} className={pill(accountFilter === 'ALL')}>Todas</button>
              {accounts.map(acc => (
                <button key={acc} onClick={() => setAccountFilter(acc)} className={pill(accountFilter === acc)}>
                  {resolveAccountLabel(acc, customRates)}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">Tipo</label>
            <div className="flex gap-1.5">
              <button onClick={() => setTypeFilter('ALL')} className={pill(typeFilter === 'ALL')}>Todos</button>
              <button onClick={() => setTypeFilter('FACTURA')} className={pill(typeFilter === 'FACTURA', 'rose')}>Cargos</button>
              <button onClick={() => setTypeFilter('ABONO')} className={pill(typeFilter === 'ABONO', 'emerald')}>Abonos</button>
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-1.5">Estado</label>
            <div className="flex gap-1.5">
              <button onClick={() => setStatusFilter('ALL')} className={pill(statusFilter === 'ALL')}>Todos</button>
              <button onClick={() => setStatusFilter('PENDIENTE')} className={pill(statusFilter === 'PENDIENTE', 'amber')}>Pendiente</button>
              <button onClick={() => setStatusFilter('PAGADO')} className={pill(statusFilter === 'PAGADO', 'emerald')}>Pagado</button>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-2">Vista previa</p>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-white/30">Movs.</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{totals.count}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-white/30">Cargos</p>
                <p className="text-sm font-black text-rose-500">${totals.totalDebe.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-white/30">Abonos</p>
                <p className="text-sm font-black text-emerald-500">${totals.totalHaber.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-white/30">Saldo</p>
                <p className={`text-sm font-black ${totals.saldo > 0.01 ? 'text-amber-500' : totals.saldo < -0.01 ? 'text-emerald-500' : 'text-slate-400'}`}>
                  ${totals.saldo.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Formatos */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 mb-2">Formato de exportación</label>
            <div className="grid grid-cols-1 gap-2">
              <ExportCard
                icon={<FileText size={18} className="text-indigo-400" />}
                title="Expediente completo (PDF)"
                desc="Datos del cliente + todos los movimientos filtrados + saldos por cuenta"
                onClick={handleFullPDF}
                busy={busy === 'full-pdf'}
                disabled={totals.count === 0}
                tone="indigo"
              />
              <ExportCard
                icon={<FileType2 size={18} className="text-violet-400" />}
                title="Resumen ejecutivo (PDF)"
                desc="Últimos 5 movimientos por cuenta deudora + saldo total (ignora filtros)"
                onClick={handleSummaryPDF}
                busy={busy === 'summary-pdf'}
                disabled={false}
                tone="violet"
              />
              <ExportCard
                icon={<FileSpreadsheet size={18} className="text-emerald-400" />}
                title="CSV (Excel)"
                desc="Datos tabulares de los movimientos filtrados"
                onClick={handleCSV}
                busy={false}
                disabled={totals.count === 0}
                tone="emerald"
              />
              <ExportCard
                icon={<MessageSquare size={18} className="text-sky-400" />}
                title="Texto (WhatsApp)"
                desc="Copia al portapapeles — pégalo en WhatsApp o email"
                onClick={handleText}
                busy={busy === 'text'}
                disabled={totals.count === 0}
                tone="sky"
              />
            </div>
          </div>

          {/* Dualis brand signature — logo oficial de anillos entrelazados */}
          <div className="pt-3 pb-1">
            <div className="h-[2px] rounded-full mb-3 bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-500" />
            <div className="flex items-center justify-center gap-2.5">
              <div className="relative w-7 h-5 flex items-center">
                {/* Anillo violeta (derecha, atrás) */}
                <div className="absolute right-0 w-[18px] h-[18px] rounded-full border-[2.5px] border-violet-500" />
                {/* Anillo cyan (izquierda, adelante) */}
                <div className="absolute left-0 w-[18px] h-[18px] rounded-full border-[2.5px] border-cyan-400" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] font-black text-slate-700 dark:text-white/80 tracking-wide">
                  HECHO POR <span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">DUALIS</span>
                </p>
                <p className="text-[8px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">Impulsando tu negocio · dualis.online</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-5 left-5 right-5 px-4 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex items-center gap-2 shadow-xl">
            <Check size={14} /> {toast}
          </div>
        )}
      </div>
    </>
  );
}

function ExportCard({
  icon, title, desc, onClick, busy, disabled, tone,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`group text-left p-3 rounded-xl border transition-all ${
        disabled
          ? 'border-slate-200 dark:border-white/[0.04] opacity-40 cursor-not-allowed'
          : `border-slate-200 dark:border-white/[0.08] hover:border-${tone}-400 hover:bg-${tone}-500/[0.04] cursor-pointer`
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg bg-${tone}-500/10 flex items-center justify-center shrink-0`}>
          {busy ? (
            <div className={`w-4 h-4 border-2 border-${tone}-400 border-t-transparent rounded-full animate-spin`} />
          ) : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-900 dark:text-white">{title}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <Download size={14} className={`text-slate-300 dark:text-white/20 group-hover:text-${tone}-400 transition-colors shrink-0 mt-1`} />
      </div>
    </button>
  );
}
