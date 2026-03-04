import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { AuditAction } from '../utils/auditLogger';
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  SlidersHorizontal,
  Download,
  FileOutput,
  Search,
  RefreshCw,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Calendar,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  businessId: string;
  userId: string;
  action: AuditAction;
  entity: string;
  details: string;
  timestamp: string;
  // Campos opcionales de Kardex
  stockAnterior?: number;
  stockNuevo?: number;
  referencia?: string;
}

interface Props {
  businessId: string;
}

const ACTION_META: Record<AuditAction, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  CREAR:    { label: 'Creado',    color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20', Icon: Plus },
  EDITAR:   { label: 'Editado',   color: 'text-blue-700 dark:text-blue-400',       bg: 'bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20',             Icon: Pencil },
  ELIMINAR: { label: 'Eliminado', color: 'text-rose-700 dark:text-rose-400',       bg: 'bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20',             Icon: Trash2 },
  LOGIN:    { label: 'Acceso',    color: 'text-violet-700 dark:text-violet-400',   bg: 'bg-violet-50 border-violet-100 dark:bg-violet-500/10 dark:border-violet-500/20',     Icon: LogIn },
  AJUSTE:   { label: 'Ajuste',    color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20',         Icon: SlidersHorizontal },
  EXPORTAR: { label: 'Exportado', color: 'text-slate-600 dark:text-slate-400',     bg: 'bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/10',            Icon: FileOutput },
};

// Tipos de movimiento para el filtro Kardex
const MOV_TYPE_LABELS: Record<string, string> = {
  TODOS:    'Todos los movimientos',
  CREAR:    'Entrada / Alta',
  AJUSTE:   'Ajuste de stock',
  ELIMINAR: 'Baja / Eliminación',
  EDITAR:   'Edición',
  LOGIN:    'Accesos del sistema',
  EXPORTAR: 'Exportaciones',
};

function fmt(ts: string): { date: string; time: string } {
  try {
    const d = new Date(ts);
    return {
      date: d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: '—', time: '—' };
  }
}

function shortUid(uid: string) {
  return uid ? `…${uid.slice(-6)}` : '—';
}

function getDefaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

const ACTIONS: AuditAction[] = ['CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'AJUSTE', 'EXPORTAR'];
const PAGE_SIZE = 200;

const AuditLogViewer: React.FC<Props> = ({ businessId }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<AuditAction | 'TODOS'>('TODOS');
  const [filterEntity, setFilterEntity] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    const q = query(
      collection(db, 'auditLogs'),
      where('businessId', '==', businessId),
      orderBy('timestamp', 'desc'),
      limit(PAGE_SIZE),
    );
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [businessId]);

  const entities = useMemo(() => {
    const set = new Set(entries.map(e => e.entity));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterAction !== 'TODOS' && e.action !== filterAction) return false;
      if (filterEntity && e.entity !== filterEntity) return false;
      // Date range filter
      const entryDate = e.timestamp.split('T')[0];
      if (fromDate && entryDate < fromDate) return false;
      if (toDate && entryDate > toDate) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(e.details || '').toLowerCase().includes(q) &&
          !(e.entity || '').toLowerCase().includes(q) &&
          !(e.userId || '').toLowerCase().includes(q) &&
          !(e.referencia || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [entries, filterAction, filterEntity, search, fromDate, toDate]);

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = 'Fecha,Hora,Tipo de Movimiento,Entidad,Motivo / Referencia,Stock Ant.,Stock Nuevo,UsuarioID';
    const rows = filtered.map(e => {
      const { date, time } = fmt(e.timestamp);
      const stockAnt = e.stockAnterior != null ? e.stockAnterior : '—';
      const stockNvo = e.stockNuevo != null ? e.stockNuevo : '—';
      const referencia = e.referencia || e.details || '—';
      return `"${date}","${time}","${e.action}","${e.entity}","${referencia.replace(/"/g, '""')}","${stockAnt}","${stockNvo}","${e.userId}"`;
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${businessId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF ──────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableRows = filtered.map(e => {
      const { date, time } = fmt(e.timestamp);
      const meta = ACTION_META[e.action] ?? ACTION_META['AJUSTE'];
      const stockAnt = e.stockAnterior != null ? e.stockAnterior : '—';
      const stockNvo = e.stockNuevo != null ? e.stockNuevo : '—';
      const referencia = (e.referencia || e.details || '—').slice(0, 80);
      return `
        <tr>
          <td>${date}<br/><small>${time}</small></td>
          <td><span class="badge badge-${e.action.toLowerCase()}">${meta.label}</span></td>
          <td>${e.entity}</td>
          <td>${referencia}</td>
          <td>${stockAnt}</td>
          <td>${stockNvo}</td>
          <td><code>${shortUid(e.userId)}</code></td>
        </tr>`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kardex / Auditoría — ${new Date().toLocaleDateString('es-VE')}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
          h1 { font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
          .meta { color: #64748b; font-size: 10px; margin-bottom: 20px; }
          table { border-collapse: collapse; width: 100%; margin-top: 8px; }
          th { background: #f1f5f9; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
          td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
          tr:nth-child(even) td { background: #fafafa; }
          code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
          small { color: #94a3b8; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
          .badge-crear { background:#dcfce7; color:#166534; }
          .badge-editar { background:#dbeafe; color:#1d4ed8; }
          .badge-eliminar { background:#fee2e2; color:#991b1b; }
          .badge-login { background:#ede9fe; color:#5b21b6; }
          .badge-ajuste { background:#fef3c7; color:#92400e; }
          .badge-exportar { background:#f1f5f9; color:#475569; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>📋 Kardex / Historial de Auditoría</h1>
        <div class="meta">
          Empresa: ${businessId} &nbsp;·&nbsp;
          Período: ${fromDate || 'Inicio'} → ${toDate || 'Hoy'} &nbsp;·&nbsp;
          Registros: ${filtered.length} &nbsp;·&nbsp;
          Generado: ${new Date().toLocaleString('es-VE')}
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Tipo</th>
              <th>Entidad</th>
              <th>Motivo / Referencia</th>
              <th>Stock Ant.</th>
              <th>Stock Nuevo</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">Sin registros</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const hasFilters = filterAction !== 'TODOS' || filterEntity || search || fromDate !== getDefaultFromDate() || toDate !== new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/[0.07] shadow-xl shadow-slate-200/50 dark:shadow-black/30 overflow-hidden">

      {/* Header */}
      <div className="p-8 border-b border-slate-50 dark:border-white/[0.07] bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Activity size={22} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Kardex / Historial de Auditoría</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              {filtered.length} registro{filtered.length !== 1 ? 's' : ''} visibles
              {fromDate && toDate ? ` · ${fromDate} → ${toDate}` : ''}
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-30 shadow-sm"
          >
            <FileSpreadsheet size={13} /> Excel / CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-30 shadow-sm"
          >
            <FileText size={13} /> PDF
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-30"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 py-5 border-b border-slate-50 dark:border-white/[0.07] flex flex-wrap gap-3 items-center bg-white dark:bg-slate-900">

        {/* Date range */}
        <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl px-4 py-2.5">
          <Calendar size={13} className="text-indigo-400 shrink-0" />
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none w-[120px] dark:[color-scheme:dark]"
            title="Desde"
          />
          <span className="text-slate-300 dark:text-slate-600 dark:text-slate-400 text-xs">→</span>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none w-[120px] dark:[color-scheme:dark]"
            title="Hasta"
          />
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 flex-1 min-w-[180px]">
          <Search size={13} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar detalles, referencia, usuario…"
            className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-500 outline-none w-full"
          />
        </div>

        {/* Movement type / Action filter */}
        <div className="relative">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value as any)}
            className="appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl pl-4 pr-8 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none cursor-pointer hover:border-slate-300 dark:border-white/15 dark:hover:border-white/20 transition-all dark:[color-scheme:dark]"
          >
            <option value="TODOS">Todos los tipos</option>
            {ACTIONS.map(a => (
              <option key={a} value={a}>{MOV_TYPE_LABELS[a] || a}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Entity filter */}
        {entities.length > 0 && (
          <div className="relative">
            <select
              value={filterEntity}
              onChange={e => setFilterEntity(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl pl-4 pr-8 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none cursor-pointer hover:border-slate-300 dark:border-white/15 dark:hover:border-white/20 transition-all dark:[color-scheme:dark]"
            >
              <option value="">Todas las entidades</option>
              {entities.map(en => <option key={en} value={en}>{en}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setFilterAction('TODOS');
              setFilterEntity('');
              setSearch('');
              setFromDate(getDefaultFromDate());
              setToDate(new Date().toISOString().split('T')[0]);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all"
          >
            <RefreshCw size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm font-semibold">Cargando registros…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Activity size={32} className="mx-auto text-slate-200 dark:text-slate-700 dark:text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Sin registros para los filtros aplicados</p>
            <p className="text-xs text-slate-300 dark:text-slate-600 dark:text-slate-400 mt-1">Intenta ampliar el rango de fechas o cambiar los filtros</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02]">
                <th className="px-8 py-4">Fecha / Hora</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Entidad</th>
                <th className="px-5 py-4 max-w-xs">Motivo / Referencia</th>
                <th className="px-5 py-4 text-center">Stock Ant.</th>
                <th className="px-5 py-4 text-center">Stock Nuevo</th>
                <th className="px-5 py-4">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
              {filtered.map(entry => {
                const meta = ACTION_META[entry.action] ?? ACTION_META['AJUSTE'];
                const { date, time } = fmt(entry.timestamp);
                const motivo = entry.referencia || entry.details || '—';
                const hasStock = entry.stockAnterior != null || entry.stockNuevo != null;
                return (
                  <tr key={entry.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800/50/60 dark:hover:bg-white dark:hover:bg-slate-800 dark:bg-slate-900/[0.03] transition-colors">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{date}</span>
                      <span className="ml-2 text-[10px] font-medium text-slate-400">{time}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${meta.bg} ${meta.color}`}>
                        <meta.Icon size={11} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.07] px-3 py-1.5 rounded-lg">
                        {entry.entity}
                      </span>
                    </td>
                    <td className="px-5 py-4 max-w-xs">
                      <span
                        className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate block max-w-[240px]"
                        title={motivo}
                      >
                        {motivo}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {hasStock && entry.stockAnterior != null ? (
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.07] px-2 py-0.5 rounded-md">
                          {entry.stockAnterior}
                        </span>
                      ) : (
                        <span className="text-slate-200 dark:text-slate-700 dark:text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {hasStock && entry.stockNuevo != null ? (
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                          entry.stockNuevo > (entry.stockAnterior ?? 0)
                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                            : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10'
                        }`}>
                          {entry.stockNuevo}
                        </span>
                      ) : (
                        <span className="text-slate-200 dark:text-slate-700 dark:text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{shortUid(entry.userId)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer summary */}
      {filtered.length > 0 && (
        <div className="px-8 py-4 border-t border-slate-50 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Mostrando {filtered.length} de {entries.length} registros
          </p>
          <p className="text-[10px] font-bold text-slate-300 dark:text-slate-600 dark:text-slate-400">
            {entries.length >= PAGE_SIZE ? `Límite: ${PAGE_SIZE} entradas más recientes` : 'Todos los registros cargados'}
          </p>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
