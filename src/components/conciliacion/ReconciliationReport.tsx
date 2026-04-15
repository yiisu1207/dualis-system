import React, { useMemo, useState } from 'react';
import { Download, Landmark, CheckCircle2, AlertTriangle, XCircle, Eye } from 'lucide-react';
import type { BankRow, DraftAbono } from '../../utils/bankReconciliation';

export type AbonoStatus = 'confirmado' | 'revisar' | 'no_encontrado';

export interface SessionAbono extends DraftAbono {
  id: string;
  status: AbonoStatus;
  matchRowId: string | null;   // rowId del BankRow conciliado, si hay
  matchAccountAlias?: string;  // denormalized para display
}

interface ReconciliationReportProps {
  abonos: SessionAbono[];
  pool: BankRow[];               // para tab "Solo en banco"
  onEditAbono?: (id: string) => void;
  onDeleteAbono?: (id: string) => void;
}

type TabKey = 'confirmados' | 'revisar' | 'no_encontrados' | 'solo_banco';

const TAB_DEFS: Array<{ key: TabKey; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'confirmados',    label: 'Confirmados',     icon: <CheckCircle2 size={14} />, color: 'text-emerald-600 dark:text-emerald-300' },
  { key: 'revisar',        label: 'Revisar',         icon: <AlertTriangle size={14} />, color: 'text-amber-600 dark:text-amber-300' },
  { key: 'no_encontrados', label: 'No encontrados',  icon: <XCircle size={14} />, color: 'text-rose-600 dark:text-rose-300' },
  { key: 'solo_banco',     label: 'Solo en banco',   icon: <Landmark size={14} />, color: 'text-slate-600 dark:text-slate-300' },
];

function downloadCsv(filename: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReconciliationReport({ abonos, pool, onEditAbono, onDeleteAbono }: ReconciliationReportProps) {
  const [tab, setTab] = useState<TabKey>('confirmados');
  const [filter, setFilter] = useState('');

  const confirmados = abonos.filter(a => a.status === 'confirmado');
  const revisar = abonos.filter(a => a.status === 'revisar');
  const noEncontrados = abonos.filter(a => a.status === 'no_encontrado');
  const soloBanco = useMemo(() => pool.filter(r => !r.matched), [pool]);

  const counts: Record<TabKey, number> = {
    confirmados: confirmados.length,
    revisar: revisar.length,
    no_encontrados: noEncontrados.length,
    solo_banco: soloBanco.length,
  };

  const q = filter.trim().toLowerCase();
  const matchesFilter = (s: string | undefined | null) => !q || (s || '').toLowerCase().includes(q);

  const filteredAbonos = (list: SessionAbono[]) => {
    if (!q) return list;
    return list.filter(a =>
      matchesFilter(a.clientName) ||
      matchesFilter(a.reference) ||
      matchesFilter(a.cedula) ||
      matchesFilter(String(a.amount))
    );
  };

  const filteredRows = (rows: BankRow[]) => {
    if (!q) return rows;
    return rows.filter(r =>
      matchesFilter(r.description) ||
      matchesFilter(r.reference) ||
      matchesFilter(String(r.amount)) ||
      matchesFilter(r.accountLabel)
    );
  };

  const exportAbonos = (list: SessionAbono[], fname: string) => {
    downloadCsv(fname, list.map(a => ({
      monto: a.amount.toFixed(2),
      fecha: a.date,
      cliente: a.clientName || '',
      referencia: a.reference || '',
      cedula: a.cedula || '',
      telefono: a.phone || '',
      tipo: a.operationType || '',
      estado: a.status,
      cuenta_conciliada: a.matchAccountAlias || '',
      match_row_id: a.matchRowId || '',
      nota: a.note || '',
    })));
  };

  const exportBankRows = (rows: BankRow[], fname: string) => {
    downloadCsv(fname, rows.map(r => ({
      cuenta: r.accountLabel || r.accountAlias,
      fecha: r.date,
      monto: r.amount.toFixed(2),
      referencia: r.reference || '',
      descripcion: r.description || '',
      tipo: r.operationType || '',
      banco_origen: r.originBankCode || '',
    })));
  };

  const exportCompleteReport = () => {
    downloadCsv(`conciliacion_reporte_completo.csv`, abonos.map(a => {
      const row = a.matchRowId ? pool.find(r => r.rowId === a.matchRowId) : null;
      return {
        monto: a.amount.toFixed(2),
        fecha: a.date,
        cliente: a.clientName || '',
        referencia_abono: a.reference || '',
        cedula: a.cedula || '',
        telefono: a.phone || '',
        tipo: a.operationType || '',
        estado: a.status,
        cuenta_banco: row?.accountLabel || a.matchAccountAlias || '',
        fecha_banco: row?.date || '',
        monto_banco: row?.amount?.toFixed(2) || '',
        referencia_banco: row?.reference || '',
        descripcion_banco: row?.description || '',
      };
    }));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {TAB_DEFS.map(t => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className={active ? 'text-indigo-700 dark:text-indigo-300' : t.color}>{t.icon}</span>
                {t.label}
                <span className={`text-xs ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'}`}>({counts[t.key]})</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar..."
            className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm w-44 focus:outline-none focus:border-indigo-400 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            onClick={exportCompleteReport}
            disabled={!abonos.length}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-40"
          >
            <Download size={12} /> Reporte completo
          </button>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        {tab === 'confirmados' && (
          <TableAbonos
            list={filteredAbonos(confirmados)}
            pool={pool}
            onExport={() => exportAbonos(confirmados, 'conciliacion_confirmados.csv')}
            onEdit={onEditAbono}
            onDelete={onDeleteAbono}
          />
        )}
        {tab === 'revisar' && (
          <TableAbonos
            list={filteredAbonos(revisar)}
            pool={pool}
            onExport={() => exportAbonos(revisar, 'conciliacion_revisar.csv')}
            onEdit={onEditAbono}
            onDelete={onDeleteAbono}
          />
        )}
        {tab === 'no_encontrados' && (
          <TableAbonos
            list={filteredAbonos(noEncontrados)}
            pool={pool}
            onExport={() => exportAbonos(noEncontrados, 'conciliacion_no_encontrados.csv')}
            onEdit={onEditAbono}
            onDelete={onDeleteAbono}
          />
        )}
        {tab === 'solo_banco' && (
          <TableBankRows
            rows={filteredRows(soloBanco)}
            onExport={() => exportBankRows(soloBanco, 'conciliacion_solo_banco.csv')}
          />
        )}
      </div>
    </div>
  );
}

function TableAbonos({ list, pool, onExport, onEdit, onDelete }: {
  list: SessionAbono[];
  pool: BankRow[];
  onExport: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (!list.length) {
    return <div className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">Sin abonos.</div>;
  }
  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <Download size={12} /> Exportar CSV
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2">Fecha</th>
            <th className="py-2">Monto</th>
            <th className="py-2">Cliente</th>
            <th className="py-2">Ref</th>
            <th className="py-2">Tipo</th>
            <th className="py-2">Cuenta</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {list.map(a => {
            const row = a.matchRowId ? pool.find(r => r.rowId === a.matchRowId) : null;
            return (
              <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="py-2">{a.date}</td>
                <td className="py-2 font-mono">${a.amount.toFixed(2)}</td>
                <td className="py-2">{a.clientName || <span className="text-slate-400 dark:text-slate-500">—</span>}</td>
                <td className="py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{a.reference || '—'}</td>
                <td className="py-2 text-xs text-slate-500 dark:text-slate-400">{a.operationType || '—'}</td>
                <td className="py-2 text-xs">
                  {row ? (
                    <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded">
                      <Landmark size={10} /> {row.accountLabel || a.matchAccountAlias}
                    </span>
                  ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                </td>
                <td className="py-2 text-right">
                  {onEdit && (
                    <button onClick={() => onEdit(a.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-300 mr-2" title="Editar">
                      <Eye size={14} />
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={() => onDelete(a.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-300" title="Borrar">
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableBankRows({ rows, onExport }: { rows: BankRow[]; onExport: () => void }) {
  if (!rows.length) {
    return <div className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">Sin filas sin conciliar.</div>;
  }
  return (
    <div>
      <div className="flex justify-end mb-2">
        <button onClick={onExport} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
          <Download size={12} /> Exportar CSV
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2">Cuenta</th>
            <th className="py-2">Fecha</th>
            <th className="py-2">Monto</th>
            <th className="py-2">Ref</th>
            <th className="py-2">Descripción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.rowId} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <td className="py-2 text-xs">
                <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded">
                  <Landmark size={10} /> {r.accountLabel || r.accountAlias}
                </span>
              </td>
              <td className="py-2">{r.date}</td>
              <td className="py-2 font-mono">${r.amount.toFixed(2)}</td>
              <td className="py-2 font-mono text-xs text-slate-600 dark:text-slate-300">{r.reference || '—'}</td>
              <td className="py-2 text-xs text-slate-600 dark:text-slate-300 truncate max-w-md" title={r.description || ''}>{r.description || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
