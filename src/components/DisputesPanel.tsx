import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Dispute } from '../../types';
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, Eye, Loader2, MessageSquare,
  Search, X, Image as ImageIcon, Phone, Mail,
} from 'lucide-react';
import { shareViaWhatsApp, shareViaEmail, messageTemplates } from '../utils/shareLink';
import { sendDisputeResolvedEmail, sendDisputeRejectedEmail } from '../utils/emailService';

interface DisputesPanelProps {
  businessId: string;
  businessName?: string;
  userId: string;
  userName: string;
}

type StatusFilter = 'all' | 'open' | 'investigating' | 'resolved' | 'rejected';

const STATUS_CONFIG: Record<Dispute['status'], { label: string; color: string; icon: React.ReactNode }> = {
  open:          { label: 'Abierto',       color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',  icon: <Clock size={11} /> },
  investigating: { label: 'En revisión',   color: 'bg-sky-500/10 text-sky-400 border-sky-500/30',         icon: <Eye size={11} /> },
  resolved:      { label: 'Resuelto',      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 size={11} /> },
  rejected:      { label: 'Rechazado',     color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',       icon: <XCircle size={11} /> },
};

const TYPE_LABELS: Record<Dispute['type'], string> = {
  wrong_items: 'Productos incorrectos',
  missing_items: 'Productos faltantes',
  damaged: 'Productos dañados',
  billing_error: 'Error de facturación',
  other: 'Otro',
};

export default function DisputesPanel({ businessId, businessName = 'tu negocio', userId, userName }: DisputesPanelProps) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photoView, setPhotoView] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [customerContacts, setCustomerContacts] = useState<Record<string, { phone?: string; email?: string }>>({});

  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      query(collection(db, 'businesses', businessId, 'disputes'), orderBy('createdAt', 'desc')),
      (snap) => {
        setDisputes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => {
        console.error('Disputes load error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [businessId]);

  // IDs de clientes únicos — memoizado para evitar refetch en cada snapshot
  const customerIdsKey = useMemo(
    () => Array.from(new Set(disputes.map((d) => d.customerId).filter(Boolean))).sort().join(','),
    [disputes],
  );

  // Cargar contactos de clientes para botones de share
  useEffect(() => {
    if (!businessId || !customerIdsKey) return;
    const ids = customerIdsKey.split(',').filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', businessId)));
        if (cancelled) return;
        const idSet = new Set(ids);
        const map: Record<string, { phone?: string; email?: string }> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          if (idSet.has(d.id)) {
            map[d.id] = { phone: data.telefono || data.phone, email: data.email };
          }
        });
        setCustomerContacts(map);
      } catch (err) {
        console.warn('Customer contacts load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, customerIdsKey]);

  const filtered = useMemo(() => {
    let result = disputes;
    if (statusFilter !== 'all') result = result.filter((d) => d.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          (d.customerName || '').toLowerCase().includes(q) ||
          (d.movementRef || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [disputes, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      open: disputes.filter((d) => d.status === 'open').length,
      investigating: disputes.filter((d) => d.status === 'investigating').length,
      resolved: disputes.filter((d) => d.status === 'resolved').length,
      rejected: disputes.filter((d) => d.status === 'rejected').length,
    };
  }, [disputes]);

  const updateStatus = async (
    d: Dispute,
    newStatus: Dispute['status'],
    resolutionText?: string,
  ) => {
    if (!d.id) return;
    setProcessing(d.id);
    try {
      const payload: any = {
        status: newStatus,
      };
      if (newStatus === 'resolved' || newStatus === 'rejected') {
        payload.resolution = resolutionText || '';
        payload.resolvedAt = new Date().toISOString();
        payload.resolvedBy = userName || userId;
      }
      await updateDoc(doc(db, 'businesses', businessId, 'disputes', d.id), payload);

      // Liberar el Movement si se resolvió o rechazó
      if (newStatus === 'resolved' || newStatus === 'rejected') {
        try {
          await updateDoc(doc(db, 'movements', d.movementId), {
            disputeStatus: newStatus,
          });
        } catch (err) {
          console.warn('Movement update failed:', err);
        }

        // Notificar al cliente (best-effort)
        const customerEmail = customerContacts[d.customerId]?.email;
        if (customerEmail) {
          const opts = {
            customerName: d.customerName || 'cliente',
            businessName,
            movementRef: d.movementRef || '',
            ...(newStatus === 'resolved'
              ? { resolution: resolutionText || '' }
              : { reason: resolutionText || '' }),
          } as any;
          const fn = newStatus === 'resolved' ? sendDisputeResolvedEmail : sendDisputeRejectedEmail;
          fn(customerEmail, opts).catch(() => { /* swallow */ });
        }
      }

      setResolution('');
      if (expandedId === d.id) setExpandedId(null);
    } catch (err) {
      console.error('Update dispute error:', err);
    } finally {
      setProcessing(null);
    }
  };

  const notifyCustomer = (d: Dispute, channel: 'whatsapp' | 'email') => {
    const contact = customerContacts[d.customerId] || {};
    const body = d.status === 'resolved'
      ? messageTemplates.disputeResolved(businessName, d.customerName || 'cliente', d.resolution || 'Resuelto.')
      : messageTemplates.disputeAck(businessName, d.customerName || 'cliente', d.id || '');

    if (channel === 'whatsapp') {
      shareViaWhatsApp(contact.phone || '', body);
    } else {
      shareViaEmail(contact.email || '', `Reclamo ${businessName}`, body);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={18} className="text-amber-500" />
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Reclamos</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-white/40 font-bold">
            Reportes enviados por clientes desde el portal
          </p>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            {counts.open} abiertos
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            {counts.investigating} en revisión
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {counts.resolved} resueltos
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-slate-100 dark:bg-white/[0.04] rounded-xl p-0.5 border border-slate-200 dark:border-white/[0.06]">
          {(['all', 'open', 'investigating', 'resolved', 'rejected'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                statusFilter === f
                  ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/50'
              }`}
            >
              {f === 'all' ? 'Todos' : STATUS_CONFIG[f as Dispute['status']]?.label || f}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/20" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, ref o texto..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <AlertTriangle size={26} className="text-slate-300 dark:text-white/10 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-400 dark:text-white/30">Sin reclamos</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {filtered.map((d) => {
              const cfg = STATUS_CONFIG[d.status];
              const expanded = expandedId === d.id;
              const contact = customerContacts[d.customerId] || {};
              return (
                <div key={d.id}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : d.id || null)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <AlertTriangle size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {d.customerName || 'Cliente'}
                        </p>
                        <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase rounded border flex items-center gap-1 ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-white/50 text-[8px] font-black uppercase rounded">
                          {TYPE_LABELS[d.type]}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-white/40 font-bold mt-0.5 truncate">
                        {d.movementRef || '—'} · {new Date(d.createdAt).toLocaleDateString('es-VE')}
                      </p>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 bg-slate-50 dark:bg-white/[0.02] space-y-3 border-t border-slate-100 dark:border-white/[0.04]">
                      <div className="pt-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1">Descripción</p>
                        <p className="text-xs text-slate-700 dark:text-white/80 whitespace-pre-wrap">{d.description}</p>
                      </div>

                      {d.photos && d.photos.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5">Fotos ({d.photos.length})</p>
                          <div className="flex gap-2 flex-wrap">
                            {d.photos.map((url, idx) => (
                              <button
                                key={idx}
                                onClick={() => setPhotoView(url)}
                                className="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 dark:bg-white/[0.04] hover:ring-2 hover:ring-indigo-500 transition-all"
                              >
                                <img src={url} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.resolution && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">Resolución</p>
                          <p className="text-xs text-slate-700 dark:text-white/80">{d.resolution}</p>
                          {d.resolvedBy && (
                            <p className="text-[10px] text-slate-500 dark:text-white/40 font-bold mt-1">
                              por {d.resolvedBy} · {d.resolvedAt ? new Date(d.resolvedAt).toLocaleString('es-VE') : ''}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Botones de notificación al cliente */}
                      {(contact.phone || contact.email) && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">Notificar:</span>
                          {contact.phone && (
                            <button
                              onClick={() => notifyCustomer(d, 'whatsapp')}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black transition-all"
                            >
                              <Phone size={11} /> WhatsApp
                            </button>
                          )}
                          {contact.email && (
                            <button
                              onClick={() => notifyCustomer(d, 'email')}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-[10px] font-black transition-all"
                            >
                              <Mail size={11} /> Email
                            </button>
                          )}
                        </div>
                      )}

                      {/* Acciones según estado */}
                      {(d.status === 'open' || d.status === 'investigating') && (
                        <div className="space-y-2">
                          <textarea
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            rows={2}
                            placeholder="Resolución (al resolver/rechazar)..."
                            className="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                          />
                          <div className="flex flex-wrap gap-2">
                            {d.status === 'open' && (
                              <button
                                onClick={() => updateStatus(d, 'investigating')}
                                disabled={processing === d.id}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                              >
                                <Eye size={11} /> Investigar
                              </button>
                            )}
                            <button
                              onClick={() => updateStatus(d, 'resolved', resolution)}
                              disabled={processing === d.id || resolution.trim().length < 5}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                            >
                              <CheckCircle2 size={11} /> Resolver
                            </button>
                            <button
                              onClick={() => updateStatus(d, 'rejected', resolution)}
                              disabled={processing === d.id || resolution.trim().length < 5}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                            >
                              <XCircle size={11} /> Rechazar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Photo viewer modal */}
      {photoView && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80" onClick={() => setPhotoView(null)}>
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center">
            <X size={18} />
          </button>
          <img src={photoView} alt="" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
