import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Trash2, AlertTriangle } from 'lucide-react';
import type { BatchItem } from '../../utils/receiptOcr';
import type { BankRow, DraftAbono, RankedMatch } from '../../utils/bankReconciliation';
import { findMatches } from '../../utils/bankReconciliation';

interface TicketState {
  imageHash: string;
  file: File;
  thumbnail: string;       // data URL
  error?: string;
  abono: DraftAbono;
  matches: RankedMatch[];
  pickedRowId: string | null;
  keep: boolean;           // si pasa al confirmar
  duplicateOfId: string | null;
}

interface BatchReviewModalProps {
  items: BatchItem[];
  pool: BankRow[];
  existingAbonos: DraftAbono[];
  onClose: () => void;
  onConfirm: (confirmed: Array<{ abono: DraftAbono; matchRowId: string | null }>) => void;
}

function fileToThumb(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function receiptToDraft(item: BatchItem): DraftAbono {
  const r = item.result;
  return {
    id: `batch_${item.imageHash.slice(0, 10)}`,
    amount: r?.amount || 0,
    date: r?.date || new Date().toISOString().slice(0, 10),
    reference: r?.reference || undefined,
    cedula: r?.cedula || undefined,
    phone: r?.phone || undefined,
    operationType: (r?.operationType && r.operationType !== 'otro') ? r.operationType as any : undefined,
    clientName: r?.senderName || undefined,
    note: r?.notes || undefined,
  };
}

export default function BatchReviewModal({ items, pool, existingAbonos, onClose, onConfirm }: BatchReviewModalProps) {
  const [tickets, setTickets] = useState<TicketState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const built: TicketState[] = [];
      for (const it of items) {
        const thumb = await fileToThumb(it.file);
        const abono = receiptToDraft(it);
        const matches = (!it.error && abono.amount > 0) ? findMatches(abono, pool) : [];
        const topMatch = matches[0];
        const pickedRowId = (topMatch && (topMatch.confidence === 'exact' || topMatch.confidence === 'high'))
          ? topMatch.row.rowId : null;

        // Dedup post-OCR
        let duplicateOfId: string | null = null;
        for (const ex of existingAbonos) {
          if (!ex.id) continue;
          if (Math.abs(ex.amount - abono.amount) <= 0.01 && ex.date === abono.date) {
            if ((abono.reference && ex.reference && abono.reference.slice(-6) === ex.reference.slice(-6)) ||
                (!abono.reference && !ex.reference)) {
              duplicateOfId = ex.id;
              break;
            }
          }
        }

        built.push({
          imageHash: it.imageHash,
          file: it.file,
          thumbnail: thumb,
          error: it.error,
          abono,
          matches,
          pickedRowId,
          keep: !it.error && abono.amount > 0,
          duplicateOfId,
        });
      }
      if (!cancelled) {
        setTickets(built);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [items, pool, existingAbonos]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const withErrors = tickets.filter(t => t.error).length;
    const highConf = tickets.filter(t => {
      const top = t.matches[0];
      return top && (top.confidence === 'exact' || top.confidence === 'high') && !t.error;
    }).length;
    const keeping = tickets.filter(t => t.keep && !t.error).length;
    return { total, withErrors, highConf, keeping };
  }, [tickets]);

  const updateTicket = (hash: string, patch: Partial<TicketState>) => {
    setTickets(prev => prev.map(t => t.imageHash === hash ? { ...t, ...patch } : t));
  };

  const updateAbono = (hash: string, patch: Partial<DraftAbono>) => {
    setTickets(prev => prev.map(t => {
      if (t.imageHash !== hash) return t;
      const newAbono = { ...t.abono, ...patch };
      const newMatches = (newAbono.amount > 0 && newAbono.date) ? findMatches(newAbono, pool) : [];
      return { ...t, abono: newAbono, matches: newMatches };
    }));
  };

  const acceptAllHighConfidence = () => {
    setTickets(prev => prev.map(t => {
      const top = t.matches[0];
      if (top && (top.confidence === 'exact' || top.confidence === 'high') && !t.error) {
        return { ...t, pickedRowId: top.row.rowId, keep: true };
      }
      return t;
    }));
  };

  const handleConfirm = () => {
    const confirmed = tickets
      .filter(t => t.keep && !t.error && t.abono.amount > 0)
      .map(t => ({ abono: t.abono, matchRowId: t.pickedRowId }));
    onConfirm(confirmed);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Revisar comprobantes extraídos</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {stats.total} imágenes · {stats.highConf} con match alta confianza · {stats.withErrors > 0 && `${stats.withErrors} con error · `}
              {stats.keeping} se confirmarán
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 bg-slate-50 dark:bg-slate-900">
          <button
            onClick={acceptAllHighConfidence}
            disabled={loading || stats.highConf === 0}
            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40"
          >
            <Check size={12} className="inline mr-1" /> Aceptar {stats.highConf} de alta confianza
          </button>
          <button
            onClick={() => setTickets(prev => prev.map(t => ({ ...t, keep: false })))}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            <Trash2 size={12} className="inline mr-1" /> Descartar todos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-12">Preparando tarjetas...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map((t) => {
                const topMatch = t.matches[0];
                return (
                  <div
                    key={t.imageHash}
                    className={`border-2 rounded-xl p-3 ${
                      t.error ? 'border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-900/30' :
                      !t.keep ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-60' :
                      'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex gap-3">
                      <img
                        src={t.thumbnail}
                        alt=""
                        className="w-24 h-24 object-cover rounded-lg flex-shrink-0 bg-slate-100 dark:bg-slate-700"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate" title={t.file.name}>
                            {t.file.name}
                          </span>
                          <button
                            onClick={() => updateTicket(t.imageHash, { keep: !t.keep })}
                            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 ml-2 flex-shrink-0"
                            title={t.keep ? 'Descartar' : 'Incluir'}
                          >
                            {t.keep ? <Trash2 size={14} /> : <Check size={14} />}
                          </button>
                        </div>
                        {t.error && (
                          <div className="mt-1 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-1">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {t.error}
                          </div>
                        )}
                        {t.duplicateOfId && (
                          <div className="mt-1 text-xs text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded px-2 py-1">
                            ⚠ Posible duplicado de abono existente
                          </div>
                        )}
                      </div>
                    </div>

                    {!t.error && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={t.abono.amount || ''}
                            onChange={(e) => updateAbono(t.imageHash, { amount: parseFloat(e.target.value) || 0 })}
                            placeholder="Monto"
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          <input
                            type="date"
                            value={t.abono.date}
                            onChange={(e) => updateAbono(t.imageHash, { date: e.target.value })}
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          <input
                            type="text"
                            value={t.abono.reference || ''}
                            onChange={(e) => updateAbono(t.imageHash, { reference: e.target.value || undefined })}
                            placeholder="Ref"
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          <input
                            type="text"
                            value={t.abono.cedula || ''}
                            onChange={(e) => updateAbono(t.imageHash, { cedula: e.target.value || undefined })}
                            placeholder="Cédula"
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          <input
                            type="text"
                            value={t.abono.phone || ''}
                            onChange={(e) => updateAbono(t.imageHash, { phone: e.target.value || undefined })}
                            placeholder="Teléfono"
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          <input
                            type="text"
                            value={t.abono.clientName || ''}
                            onChange={(e) => updateAbono(t.imageHash, { clientName: e.target.value || undefined })}
                            placeholder="Emisor"
                            className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>

                        {topMatch ? (
                          <label className="flex items-start gap-2 text-xs bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-lg p-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={t.pickedRowId === topMatch.row.rowId}
                              onChange={(e) => updateTicket(t.imageHash, {
                                pickedRowId: e.target.checked ? topMatch.row.rowId : null,
                              })}
                              className="mt-0.5"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-emerald-800 dark:text-emerald-300">
                                Match {topMatch.confidence}: {topMatch.row.accountLabel} · ${topMatch.row.amount.toFixed(2)} · {topMatch.row.date}
                              </span>
                              <div className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                                {topMatch.reasons.slice(0, 3).join(' · ')}
                              </div>
                            </div>
                          </label>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400 italic">Sin match en el pool</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || stats.keeping === 0}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            Confirmar {stats.keeping} abono{stats.keeping !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
