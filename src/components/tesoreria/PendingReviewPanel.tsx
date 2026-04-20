import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, XCircle, Copy, ChevronDown, ChevronRight,
  ExternalLink, Loader2, Search, X, Image as ImageIcon,
} from 'lucide-react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { ReconciliationBatch } from '../../../types';
import type { SessionAbono } from '../conciliacion/ReconciliationReport';

interface Props {
  businessId: string;
  batches: ReconciliationBatch[];
  onOpenInBatch: (batchId: string, abonoId: string) => void;
}

type PendingStatus = 'revisar' | 'no_encontrado' | 'duplicado';

interface PendingRow extends SessionAbono {
  monthKey: string;
}

export default function PendingReviewPanel({ businessId, batches, onOpenInBatch }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<PendingStatus, boolean>>({
    revisar: true,
    no_encontrado: true,
    duplicado: false,
  });
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    const qRef = query(
      collectionGroup(db, 'abonos'),
      where('businessId', '==', businessId),
      where('status', 'in', ['revisar', 'no_encontrado', 'duplicado']),
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list: PendingRow[] = [];
        snap.forEach(d => {
          const data = d.data() as SessionAbono;
          const monthKey = d.ref.parent.parent?.id || '';
          list.push({ ...data, id: d.id, monthKey });
        });
        list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        const raw = err?.message || String(err);
        console.error('[PendingReview] query error', err);
        if (/index is not ready yet|requires a COLLECTION_GROUP|failed-precondition/i.test(raw)) {
          setError('Firestore está construyendo el índice (puede tardar 1–5 min tras el primer deploy). Recarga en un minuto.');
        } else {
          setError('Error cargando pendientes: ' + raw);
        }
        setLoading(false);
      },
    );
    return () => unsub();
  }, [businessId]);

  const batchById = useMemo(() => {
    const m = new Map<string, ReconciliationBatch>();
    for (const b of batches) m.set(b.id, b);
    return m;
  }, [batches]);

  const filtered = useMemo(() => {
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter(r => {
      const batch = r.batchId ? batchById.get(r.batchId) : null;
      const hay = norm([
        r.reference || '',
        r.cedula || '',
        r.clientName || '',
        r.date || '',
        String(r.amount ?? ''),
        batch?.name || '',
      ].join(' '));
      return tokens.every(t => hay.includes(t));
    });
  }, [rows, q, batchById]);

  const bucket = (s: PendingStatus) => filtered.filter(r => r.status === s);
  const revisar = bucket('revisar');
  const noMatch = bucket('no_encontrado');
  const dup = bucket('duplicado');

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Pendientes por verificar</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vista global cross-lote — abonos en <span className="text-amber-600 dark:text-amber-300">revisar</span>, <span className="text-rose-600 dark:text-rose-300">sin match</span> o <span className="text-violet-600 dark:text-violet-300">duplicados</span>. Click en un item para abrir su lote.
            </div>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por ref, cédula, cliente, lote…"
              className="pl-7 pr-7 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400 w-64"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
          <Stat color="amber" label="Por revisar" value={revisar.length} />
          <Stat color="rose" label="Sin match" value={noMatch.length} />
          <Stat color="violet" label="Duplicados" value={dup.length} />
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700/50 text-rose-800 dark:text-rose-300 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-slate-500 dark:text-slate-400 py-4 text-sm">
          <Loader2 className="animate-spin inline mr-1" size={14} /> Cargando pendientes…
        </div>
      )}

      <Section
        title="Por revisar"
        count={revisar.length}
        color="amber"
        icon={<AlertTriangle size={16} />}
        isOpen={open.revisar}
        onToggle={() => setOpen(s => ({ ...s, revisar: !s.revisar }))}
      >
        <PendingTable items={revisar} batchById={batchById} onOpenInBatch={onOpenInBatch} />
      </Section>

      <Section
        title="Sin match"
        count={noMatch.length}
        color="rose"
        icon={<XCircle size={16} />}
        isOpen={open.no_encontrado}
        onToggle={() => setOpen(s => ({ ...s, no_encontrado: !s.no_encontrado }))}
      >
        <PendingTable items={noMatch} batchById={batchById} onOpenInBatch={onOpenInBatch} />
      </Section>

      <Section
        title="Duplicados"
        count={dup.length}
        color="violet"
        icon={<Copy size={16} />}
        isOpen={open.duplicado}
        onToggle={() => setOpen(s => ({ ...s, duplicado: !s.duplicado }))}
      >
        <PendingTable items={dup} batchById={batchById} onOpenInBatch={onOpenInBatch} />
      </Section>
    </div>
  );
}

function Section({
  title, count, color, icon, isOpen, onToggle, children,
}: {
  title: string; count: number; color: 'amber' | 'rose' | 'violet'; icon: React.ReactNode;
  isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const cls: Record<string, string> = {
    amber: 'text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-900/10',
    rose: 'text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-700/40 bg-rose-50/30 dark:bg-rose-900/10',
    violet: 'text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-700/40 bg-violet-50/30 dark:bg-violet-900/10',
  };
  return (
    <div className={`border rounded-xl ${cls[color]}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-semibold"
      >
        <span className="inline-flex items-center gap-2">
          {icon} {title}
          <span className="px-2 py-0.5 rounded text-xs bg-white/70 dark:bg-slate-800/70">{count}</span>
        </span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 bg-white/50 dark:bg-slate-900/30 rounded-b-xl">
          {count === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">Nada que verificar 🎉</div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

function PendingTable({
  items, batchById, onOpenInBatch,
}: {
  items: PendingRow[];
  batchById: Map<string, ReconciliationBatch>;
  onOpenInBatch: (batchId: string, abonoId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase text-slate-500 dark:text-slate-400">
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-1.5 w-6"></th>
            <th className="text-left py-1.5">Fecha</th>
            <th className="text-left py-1.5">Monto</th>
            <th className="text-left py-1.5">Ref</th>
            <th className="text-left py-1.5">Cliente / Céd</th>
            <th className="text-left py-1.5">Lote</th>
            <th className="text-right py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => {
            const batch = r.batchId ? batchById.get(r.batchId) : null;
            return (
              <tr
                key={r.id}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 cursor-pointer"
                onClick={() => r.batchId && onOpenInBatch(r.batchId, r.id)}
              >
                <td className="py-2">
                  {r.receiptUrl ? (
                    <ImageIcon size={12} className="text-slate-400" />
                  ) : (
                    <span className="text-[9px] text-slate-400 font-semibold">MAN</span>
                  )}
                </td>
                <td className="py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{r.date || '—'}</td>
                <td className="py-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">Bs {(r.amount ?? 0).toFixed(2)}</td>
                <td className="py-2 font-mono text-slate-600 dark:text-slate-300">{r.reference || '—'}</td>
                <td className="py-2 truncate max-w-[200px] text-slate-600 dark:text-slate-300">
                  {r.clientName || r.cedula || '—'}
                </td>
                <td className="py-2 truncate max-w-[180px] text-slate-500 dark:text-slate-400">
                  {batch?.name || <span className="italic text-slate-400">lote borrado</span>}
                </td>
                <td className="py-2 text-right">
                  {r.batchId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenInBatch(r.batchId!, r.id); }}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      Abrir <ExternalLink size={10} />
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

function Stat({ color, label, value }: { color: 'amber' | 'rose' | 'violet'; label: string; value: number }) {
  const cls: Record<string, string> = {
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/40',
    rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/40',
    violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700/40',
  };
  return (
    <div className={`border rounded-lg py-2 ${cls[color]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}
