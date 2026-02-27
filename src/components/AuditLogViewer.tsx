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
} from 'lucide-react';

interface AuditEntry {
  id: string;
  businessId: string;
  userId: string;
  action: AuditAction;
  entity: string;
  details: string;
  timestamp: string;
}

interface Props {
  businessId: string;
}

const ACTION_META: Record<AuditAction, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  CREAR:    { label: 'Creado',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', Icon: Plus },
  EDITAR:   { label: 'Editado',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-100',       Icon: Pencil },
  ELIMINAR: { label: 'Eliminado', color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-100',       Icon: Trash2 },
  LOGIN:    { label: 'Acceso',    color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-100',   Icon: LogIn },
  AJUSTE:   { label: 'Ajuste',    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-100',     Icon: SlidersHorizontal },
  EXPORTAR: { label: 'Exportado', color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',     Icon: FileOutput },
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

const ACTIONS: AuditAction[] = ['CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'AJUSTE', 'EXPORTAR'];
const PAGE_SIZE = 50;

const AuditLogViewer: React.FC<Props> = ({ businessId }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<AuditAction | 'TODOS'>('TODOS');
  const [filterEntity, setFilterEntity] = useState('');
  const [search, setSearch] = useState('');

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
      if (search) {
        const q = search.toLowerCase();
        if (!(e.details || '').toLowerCase().includes(q) && !(e.entity || '').toLowerCase().includes(q) && !(e.userId || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entries, filterAction, filterEntity, search]);

  const handleExport = () => {
    const header = 'Fecha,Hora,Acción,Entidad,Detalles,UsuarioID';
    const rows = filtered.map(e => {
      const { date, time } = fmt(e.timestamp);
      return `"${date}","${time}","${e.action}","${e.entity}","${e.details.replace(/"/g, '""')}","${e.userId}"`;
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${businessId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
      {/* Header */}
      <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Activity size={22} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900 tracking-tight">Historial de Auditoría</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Últimas {PAGE_SIZE} entradas · {filtered.length} visible{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all disabled:opacity-30"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="px-10 py-5 border-b border-slate-50 flex flex-wrap gap-3 items-center bg-white">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-1 min-w-[180px]">
          <Search size={13} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar detalles, usuario…"
            className="bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-300 outline-none w-full"
          />
        </div>

        {/* Action filter */}
        <div className="relative">
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value as any)}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-8 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none cursor-pointer hover:border-slate-300 transition-all"
          >
            <option value="TODOS">Todas las acciones</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Entity filter */}
        {entities.length > 0 && (
          <div className="relative">
            <select
              value={filterEntity}
              onChange={e => setFilterEntity(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-8 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none cursor-pointer hover:border-slate-300 transition-all"
            >
              <option value="">Todas las entidades</option>
              {entities.map(en => <option key={en} value={en}>{en}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {(filterAction !== 'TODOS' || filterEntity || search) && (
          <button
            onClick={() => { setFilterAction('TODOS'); setFilterEntity(''); setSearch(''); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 border border-rose-100 bg-rose-50 hover:bg-rose-100 transition-all"
          >
            <RefreshCw size={11} /> Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm font-semibold">Cargando registros…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Activity size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-400">Sin registros para los filtros aplicados</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-300 border-b border-slate-50">
                <th className="px-10 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Acción</th>
                <th className="px-6 py-4">Entidad</th>
                <th className="px-6 py-4 max-w-xs">Detalles</th>
                <th className="px-6 py-4">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(entry => {
                const meta = ACTION_META[entry.action] ?? ACTION_META['AJUSTE'];
                const { date, time } = fmt(entry.timestamp);
                return (
                  <tr key={entry.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-10 py-4 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-700">{date}</span>
                      <span className="ml-2 text-[10px] font-medium text-slate-400">{time}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${meta.bg} ${meta.color}`}>
                        <meta.Icon size={11} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                        {entry.entity}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <span className="text-xs font-medium text-slate-600 truncate block max-w-[260px]" title={entry.details}>
                        {entry.details || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-mono text-slate-400">{shortUid(entry.userId)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogViewer;
