import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GitCompare, Users, BookOpen, Package, Landmark, Briefcase,
  ArrowRight, Check, X, Clock, AlertTriangle, MessageSquare,
  ChevronDown, Filter, Download, RefreshCw, Eye, EyeOff,
  CheckCircle2, XCircle, AlertCircle, Minus, Send, FileText,
  Info,
} from 'lucide-react';
import { CashAdvance, Customer, Employee, ExchangeRates, Movement, Supplier } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import {
  addDoc, collection, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAudit } from '../utils/auditLogger';
import HelpTooltip from './HelpTooltip';

/* ────────────────────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────────────────────── */
type CompareModule = 'cxc' | 'cxp' | 'rrhh' | 'inventario' | 'contabilidad';

type RequestStatus = 'idle' | 'pending' | 'accepted' | 'rejected' | 'active' | 'closed';

interface BookCompareRequest {
  id: string;
  businessId: string;
  requesterId: string;
  requesterName: string;
  receiverId: string;
  receiverName: string;
  module: CompareModule;
  entityId?: string;
  entityName?: string;
  note?: string;
  status: string;
  rejectReason?: string;
  createdAt: any;
  respondedAt?: any;
}

interface CompareRow {
  left?: Movement | CashAdvance;
  right?: Movement | CashAdvance;
  status: 'match' | 'mismatch-amount' | 'only-left' | 'only-right';
  diffUsd?: number;
}

interface BooksComparePanelProps {
  businessId: string;
  currentUserId: string;
  currentUserName?: string;
  isAdmin?: boolean;
  movements: Movement[];
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  advances: CashAdvance[];
  rates: ExchangeRates;
}

/* ────────────────────────────────────────────────────────────
   CONSTANTS
   ──────────────────────────────────────────────────────────── */
const MODULES: { id: CompareModule; label: string; icon: React.ElementType; color: string; bg: string; border: string; desc: string }[] = [
  { id: 'cxc',         label: 'CxC — Clientes',       icon: Users,     color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', desc: 'Cuentas por cobrar de un cliente específico' },
  { id: 'cxp',         label: 'CxP — Proveedores',     icon: Briefcase, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', desc: 'Cuentas por pagar a un proveedor' },
  { id: 'rrhh',        label: 'RRHH — Nómina',         icon: FileText,  color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20',    desc: 'Vales y adelantos por empleado' },
  { id: 'inventario',  label: 'Inventario',             icon: Package,   color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  desc: 'Movimientos de stock por producto' },
  { id: 'contabilidad', label: 'Contabilidad General', icon: BookOpen,  color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', desc: 'Todos los movimientos contables' },
];

/* ────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────── */
const fmtDate = (v?: string | any) => {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getAmount = (m: Movement | CashAdvance): number => {
  const mov = m as any;
  return typeof mov.originalAmount === 'number'
    ? mov.originalAmount
    : typeof mov.amount === 'number'
    ? mov.amount
    : 0;
};

const getCurrency = (m: Movement | CashAdvance): string =>
  String((m as any).currency || 'USD').toUpperCase();

const fmtAmount = (m: Movement | CashAdvance) => {
  const sym = getCurrency(m) === 'BS' ? 'Bs' : '$';
  return formatCurrency(getAmount(m), sym);
};

const getTimestamp = (m: Movement | CashAdvance): number => {
  const raw = (m as any).createdAt || (m as any).date;
  if (!raw) return 0;
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

/* ────────────────────────────────────────────────────────────
   DIFF ENGINE
   ──────────────────────────────────────────────────────────── */
function buildDiff(left: (Movement | CashAdvance)[], right: (Movement | CashAdvance)[], rates: ExchangeRates): CompareRow[] {
  const DAY = 86_400_000;
  const used = new Set<string>();
  const rows: CompareRow[] = [];

  const findMatch = (item: Movement | CashAdvance) => {
    const amt = getAmount(item);
    const cur = getCurrency(item);
    const ts  = getTimestamp(item);
    let best: { id: string; idx: number; delta: number } | null = null;
    right.forEach((r, idx) => {
      const rid = (r as any).id;
      if (used.has(rid)) return;
      if (getCurrency(r) !== cur) return;
      if (Math.abs(getAmount(r) - amt) > 0.01) return;
      const delta = Math.abs(getTimestamp(r) - ts);
      if (delta > DAY) return;
      if (!best || delta < best.delta) best = { id: rid, idx, delta };
    });
    return best;
  };

  const findMismatch = (item: Movement | CashAdvance) => {
    const refL = ((item as any).concept || (item as any).reference || (item as any).reason || '').toLowerCase();
    const ts   = getTimestamp(item);
    let best: { id: string; idx: number; delta: number } | null = null;
    right.forEach((r, idx) => {
      const rid = (r as any).id;
      if (used.has(rid)) return;
      const refR = ((r as any).concept || (r as any).reference || (r as any).reason || '').toLowerCase();
      if (!refL || refL !== refR) return;
      const delta = Math.abs(getTimestamp(r) - ts);
      if (delta > DAY) return;
      if (!best || delta < best.delta) best = { id: rid, idx, delta };
    });
    return best;
  };

  left.forEach(item => {
    const match = findMatch(item);
    if (match) {
      used.add(match.id);
      rows.push({ left: item, right: right[match.idx], status: 'match' });
      return;
    }
    const mis = findMismatch(item);
    if (mis) {
      used.add(mis.id);
      const r = right[mis.idx];
      const diff = getMovementUsdAmount(item as Movement, rates) - getMovementUsdAmount(r as Movement, rates);
      rows.push({ left: item, right: r, status: 'mismatch-amount', diffUsd: diff });
      return;
    }
    rows.push({ left: item, status: 'only-left' });
  });

  right.forEach(r => {
    if (used.has((r as any).id)) return;
    rows.push({ right: r, status: 'only-right' });
  });

  return rows.sort((a, b) => {
    const ta = a.left ? getTimestamp(a.left) : a.right ? getTimestamp(a.right) : 0;
    const tb = b.left ? getTimestamp(b.left) : b.right ? getTimestamp(b.right) : 0;
    return tb - ta;
  });
}

/* ────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────── */
const BooksComparePanel: React.FC<BooksComparePanelProps> = ({
  businessId,
  currentUserId,
  currentUserName = 'Yo',
  isAdmin = false,
  movements,
  customers,
  suppliers,
  employees,
  advances,
  rates,
}) => {
  /* ── Vouchers (fetched internally for RRHH comparison) ── */
  const [vouchers, setVouchers] = useState<any[]>([]);
  useEffect(() => {
    if (!businessId) return;
    const q = query(
      collection(db, `businesses/${businessId}/vouchers`),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [businessId]);

  /* ── Business users (fetched internally) ── */
  const [bizUsers, setBizUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'users'), where('businessId', '==', businessId));
    return onSnapshot(q, snap => {
      setBizUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [businessId]);

  const otherUsers = useMemo(() =>
    bizUsers.filter(u => (u.uid || u.id) !== currentUserId),
    [bizUsers, currentUserId]
  );

  const getUserName = (uid: string) => {
    const u = bizUsers.find(x => (x.uid || x.id) === uid);
    return u?.fullName || u?.displayName || u?.email || uid;
  };

  /* ── Wizard state ── */
  const [step, setStep]               = useState<1 | 2 | 3>(1); // 1=module, 2=entity+user, 3=confirm
  const [selModule, setSelModule]     = useState<CompareModule | null>(null);
  const [selEntityId, setSelEntityId] = useState('');
  const [selEntityName, setSelEntityName] = useState('');
  const [selUserId, setSelUserId]     = useState('');
  const [reqNote, setReqNote]         = useState('');

  /* ── Active session state ── */
  const [requestStatus, setRequestStatus]   = useState<RequestStatus>('idle');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest]   = useState<BookCompareRequest | null>(null);

  /* ── Incoming requests ── */
  const [incoming, setIncoming] = useState<BookCompareRequest[]>([]);
  const lastIncomingIds         = useRef<Set<string>>(new Set());

  /* ── Comparison data ── */
  const [onlyDiffs, setOnlyDiffs]       = useState(false);
  const [chatOpen, setChatOpen]         = useState(false);
  const [chatMsg, setChatMsg]           = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [noteRowKey, setNoteRowKey]     = useState<string | null>(null);
  const [noteDraft, setNoteDraft]       = useState('');
  const [notesByRow, setNotesByRow]     = useState<Record<string, any>>({});
  const [noteSaving, setNoteSaving]     = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [entityDropOpen, setEntityDropOpen] = useState(false);
  const [entitySearch,   setEntitySearch]   = useState('');
  const entityDropRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Close entity dropdown on outside click
  useEffect(() => {
    if (!entityDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (entityDropRef.current && !entityDropRef.current.contains(e.target as Node)) {
        setEntityDropOpen(false);
        setEntitySearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [entityDropOpen]);

  /* ── Toast ── */
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  /* ── Listen: incoming requests ── */
  useEffect(() => {
    if (!businessId || !currentUserId) return;
    const q = query(
      collection(db, 'bookCompareRequests'),
      where('businessId', '==', businessId),
      where('receiverId', '==', currentUserId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookCompareRequest));
      const nextIds = new Set(items.map(i => i.id));
      if (items.some(i => !lastIncomingIds.current.has(i.id))) {
        const top = items[0];
        if (top) showToast(`📬 ${top.requesterName} quiere comparar libros contigo`);
      }
      lastIncomingIds.current = nextIds;
      setIncoming(items);
    });
  }, [businessId, currentUserId]);

  /* ── Listen: active request ── */
  useEffect(() => {
    if (!activeRequestId) return;
    return onSnapshot(doc(db, 'bookCompareRequests', activeRequestId), snap => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() } as BookCompareRequest;
      setActiveRequest(data);
      if (data.status === 'active') setRequestStatus('active');
      else if (data.status === 'rejected') { setRequestStatus('rejected'); showToast('La solicitud fue rechazada.'); }
      else if (data.status === 'closed')   { resetSession(); showToast('La sesión fue cerrada.'); }
    });
  }, [activeRequestId]);

  /* ── Listen: chat messages ── */
  useEffect(() => {
    if (!activeRequestId) { setChatMessages([]); return; }
    const q = query(
      collection(db, 'bookCompareChats'),
      where('requestId', '==', activeRequestId),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [activeRequestId]);

  /* ── Listen: row notes ── */
  useEffect(() => {
    if (!activeRequestId) { setNotesByRow({}); return; }
    const q = query(
      collection(db, 'bookCompareNotes'),
      where('requestId', '==', activeRequestId),
      where('businessId', '==', businessId)
    );
    return onSnapshot(q, snap => {
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.rowKey) map[data.rowKey] = { id: d.id, ...data };
      });
      setNotesByRow(map);
    });
  }, [activeRequestId, businessId]);

  const resetSession = () => {
    setRequestStatus('idle');
    setActiveRequestId(null);
    setActiveRequest(null);
    setStep(1);
    setSelModule(null);
    setSelEntityId('');
    setSelEntityName('');
    setSelUserId('');
    setReqNote('');
  };

  /* ── SEND REQUEST ── */
  const handleSendRequest = async () => {
    if (!selModule || !selUserId || !businessId) return;
    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'bookCompareRequests'), {
        businessId,
        requesterId:    currentUserId,
        requesterName:  currentUserName,
        receiverId:     selUserId,
        receiverName:   getUserName(selUserId),
        module:         selModule,
        entityId:       selEntityId || null,
        entityName:     selEntityName || null,
        note:           reqNote.trim() || null,
        status:         'pending',
        createdAt:      serverTimestamp(),
      });
      setActiveRequestId(ref.id);
      setRequestStatus('pending');
      logAudit(businessId, currentUserId, 'CREAR', 'COMPARAR_LIBROS',
        `${selModule} → ${selEntityName || 'general'} con ${getUserName(selUserId)}`);
    } finally {
      setLoading(false);
    }
  };

  /* ── ACCEPT ── */
  const handleAccept = async (req: BookCompareRequest) => {
    await updateDoc(doc(db, 'bookCompareRequests', req.id), {
      status: 'active',
      respondedAt: serverTimestamp(),
    });
    setActiveRequestId(req.id);
    setActiveRequest({ ...req, status: 'active' });
    setRequestStatus('active');
    logAudit(businessId, currentUserId, 'EDITAR', 'COMPARAR_LIBROS', `Aceptar ${req.id}`);
  };

  /* ── REJECT ── */
  const handleReject = async (req: BookCompareRequest) => {
    await updateDoc(doc(db, 'bookCompareRequests', req.id), {
      status: 'rejected',
      rejectReason: rejectReason.trim() || null,
      respondedAt: serverTimestamp(),
    });
    setRejectingId(null);
    setRejectReason('');
    logAudit(businessId, currentUserId, 'ELIMINAR', 'COMPARAR_LIBROS', `Rechazar ${req.id}`);
  };

  /* ── CLOSE ── */
  const handleClose = async () => {
    if (!activeRequestId) return;
    await updateDoc(doc(db, 'bookCompareRequests', activeRequestId), {
      status: 'closed',
      closedAt: serverTimestamp(),
      closedBy: currentUserId,
    });
    logAudit(businessId, currentUserId, 'EDITAR', 'COMPARAR_LIBROS', `Cerrar ${activeRequestId}`);
    resetSession();
  };

  /* ── SEND CHAT MSG ── */
  const handleSendChat = async () => {
    if (!chatMsg.trim() || !activeRequestId) return;
    const msg = chatMsg.trim();
    setChatMsg('');
    await addDoc(collection(db, 'bookCompareChats'), {
      requestId:  activeRequestId,
      businessId,
      authorId:   currentUserId,
      authorName: currentUserName,
      text:       msg,
      createdAt:  serverTimestamp(),
    });
  };

  /* ── SAVE ROW NOTE ── */
  const handleSaveNote = async () => {
    if (!noteRowKey || !activeRequestId) return;
    setNoteSaving(true);
    try {
      const existing = notesByRow[noteRowKey];
      const payload = {
        requestId:  activeRequestId,
        businessId,
        authorId:   currentUserId,
        authorName: currentUserName,
        rowKey:     noteRowKey,
        text:       noteDraft.trim(),
        updatedAt:  serverTimestamp(),
      };
      if (existing?.id) {
        await updateDoc(doc(db, 'bookCompareNotes', existing.id), payload);
      } else {
        await addDoc(collection(db, 'bookCompareNotes'), { ...payload, createdAt: serverTimestamp() });
      }
      setNoteRowKey(null);
      setNoteDraft('');
    } finally {
      setNoteSaving(false);
    }
  };

  /* ── BUILD BOOK DATA ── */
  const getBookData = (userId: string, req: BookCompareRequest): (Movement | CashAdvance)[] => {
    const mod = req.module;
    const eid = req.entityId;

    if (mod === 'cxc') {
      return movements.filter(m =>
        !m.isSupplierMovement &&
        !(m as any).anulada &&
        (m.ownerId === userId || (m as any).vendedorId === userId) &&
        (!eid || m.entityId === eid)
      );
    }
    if (mod === 'cxp') {
      return movements.filter(m =>
        m.isSupplierMovement &&
        !(m as any).anulada &&
        (m.ownerId === userId || (m as any).vendedorId === userId) &&
        (!eid || m.entityId === eid)
      );
    }
    if (mod === 'rrhh') {
      // Advances (préstamos / adelantos)
      const advFiltered = advances.filter(a => !eid || a.employeeId === eid);
      // Vouchers (vales descontados de nómina)
      const voucherFiltered = vouchers
        .filter(v => (!eid || v.employeeId === eid) && v.status !== 'CORREGIDO')
        .map(v => ({
          id:             v.id,
          employeeId:     v.employeeId,
          concept:        `Vale — ${v.reason || 'Sin concepto'}`,
          reason:         v.reason,
          amount:         v.amountUSD ?? v.amount,
          originalAmount: v.amount,
          currency:       v.currency || 'USD',
          createdAt:      v.createdAt,
          date:           v.voucherDate || v.createdAt,
          movementType:   'VALE',
          status:         v.status,
        } as any));
      return [...advFiltered, ...voucherFiltered] as CashAdvance[];
    }
    if (mod === 'inventario') {
      return movements.filter(m =>
        (m as any).movementType === 'AJUSTE' &&
        (m.ownerId === userId || (m as any).vendedorId === userId) &&
        (!eid || m.entityId === eid || (m as any).productId === eid)
      );
    }
    if (mod === 'contabilidad') {
      return movements.filter(m =>
        !(m as any).anulada &&
        (m.ownerId === userId || (m as any).vendedorId === userId)
      );
    }
    return [];
  };

  /* ── DIFF RESULTS ── */
  const diffRows = useMemo(() => {
    if (!activeRequest || requestStatus !== 'active') return [];
    const leftData  = getBookData(currentUserId, activeRequest);
    const rightData = getBookData(activeRequest.requesterId === currentUserId
      ? activeRequest.receiverId
      : activeRequest.requesterId, activeRequest);
    return buildDiff(leftData, rightData, rates);
  }, [activeRequest, requestStatus, movements, advances, rates, currentUserId]);

  const diffStats = useMemo(() => ({
    total:    diffRows.length,
    matches:  diffRows.filter(r => r.status === 'match').length,
    onlyLeft: diffRows.filter(r => r.status === 'only-left').length,
    onlyRight:diffRows.filter(r => r.status === 'only-right').length,
    mismatch: diffRows.filter(r => r.status === 'mismatch-amount').length,
  }), [diffRows]);

  const visibleRows = onlyDiffs
    ? diffRows.filter(r => r.status !== 'match')
    : diffRows;

  /* ── Entity options by module ── */
  const entityOptions = useMemo(() => {
    if (!selModule) return [];
    if (selModule === 'cxc') return customers.map(c => {
      const name = (c as any).name || (c as any).nombre || (c as any).fullName;
      return { id: c.id, label: name || c.cedula || c.id, sub: c.cedula || c.telefono || '' };
    });
    if (selModule === 'cxp') return suppliers.map(s => ({
      id: s.id,
      label: s.contacto || (s as any).nombre || s.id,
      sub: s.rif || s.categoria || '',
    }));
    if (selModule === 'rrhh') return employees.map(e => {
      const em = e as any;
      const full = em.fullName || [em.name, em.lastName].filter(Boolean).join(' ') || em.nombre || e.id;
      return { id: e.id, label: full, sub: em.cedula || em.idNumber || em.position || em.role || '' };
    });
    if (selModule === 'inventario') {
      const seen = new Map<string, string>();
      movements.filter(m => (m as any).productId).forEach(m => {
        const pid = (m as any).productId;
        if (!seen.has(pid)) seen.set(pid, (m as any).productName || (m as any).nombre || pid);
      });
      return Array.from(seen.entries()).map(([id, label]) => ({ id, label, sub: '' }));
    }
    return [{ id: '__all__', label: 'Todos los movimientos', sub: '' }];
  }, [selModule, customers, suppliers, employees, movements]);

  /* ── EXPORT PDF ── */
  const handleExport = async () => {
    const diffs = diffRows.filter(r => r.status !== 'match');
    if (!diffs.length) { showToast('No hay diferencias para exportar.'); return; }
    try {
      const { default: jsPDF }     = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdfdoc = new jsPDF({ orientation: 'landscape' });
      const modLabel = MODULES.find(m => m.id === activeRequest?.module)?.label || '';
      pdfdoc.setFontSize(13);
      pdfdoc.text('Reporte de Comparación de Libros', 14, 14);
      pdfdoc.setFontSize(9);
      pdfdoc.text(`Módulo: ${modLabel}  |  Entidad: ${activeRequest?.entityName || 'General'}`, 14, 22);
      pdfdoc.text(`Mi libro: ${currentUserName}  |  Contraparte: ${getUserName(
        activeRequest?.requesterId === currentUserId ? activeRequest?.receiverId! : activeRequest?.requesterId!
      )}`, 14, 28);
      pdfdoc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, 14, 34);
      autoTable(pdfdoc, {
        startY: 40,
        head: [['Estado', 'Fecha (mío)', 'Concepto (mío)', 'Monto (mío)', 'Fecha (otro)', 'Concepto (otro)', 'Monto (otro)', 'Dif. USD', 'Nota']],
        body: diffs.map(r => {
          const rowKey = `${(r.left as any)?.id || ''}_${(r.right as any)?.id || ''}`;
          const note   = notesByRow[rowKey]?.text || '';
          const statusLabel = r.status === 'mismatch-amount' ? 'Monto distinto'
            : r.status === 'only-left' ? 'Solo en mi libro' : 'Solo en su libro';
          return [
            statusLabel,
            r.left  ? fmtDate((r.left  as any).createdAt || (r.left  as any).date) : '—',
            r.left  ? ((r.left  as any).concept || (r.left  as any).reason || '—') : '—',
            r.left  ? fmtAmount(r.left)  : '—',
            r.right ? fmtDate((r.right as any).createdAt || (r.right as any).date) : '—',
            r.right ? ((r.right as any).concept || (r.right as any).reason || '—') : '—',
            r.right ? fmtAmount(r.right) : '—',
            r.diffUsd != null ? formatCurrency(Math.abs(r.diffUsd)) : '—',
            note,
          ];
        }),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      pdfdoc.save(`comparacion-libros-${activeRequestId}.pdf`);
    } catch {
      showToast('Error al exportar. Intenta de nuevo.');
    }
  };

  /* ── ROW COMPONENT ── */
  const RowCard = ({
    item, side, status, diffUsd, rowKey
  }: {
    item?: Movement | CashAdvance; side: 'left' | 'right';
    status: CompareRow['status']; diffUsd?: number; rowKey: string;
  }) => {
    const note = notesByRow[rowKey];
    const isLeft = side === 'left';
    const isEmpty = !item;
    const highlight =
      status === 'match'           ? 'border-emerald-500/20 dark:bg-emerald-950/20'
      : status === 'mismatch-amount' ? 'border-amber-500/20 dark:bg-amber-950/20'
      : status === 'only-left'    ? (isLeft  ? 'border-indigo-500/20 dark:bg-indigo-950/20' : 'border-white/[0.04] opacity-40')
      : /* only-right */             (!isLeft ? 'border-sky-500/20 dark:bg-sky-950/20'       : 'border-white/[0.04] opacity-40');

    return (
      <div className={`rounded-xl border p-3 text-xs flex flex-col gap-1.5 bg-white dark:bg-white/[0.02] ${highlight} transition-all`}>
        {isEmpty ? (
          <span className="text-slate-400 dark:text-white/20 italic text-center py-2">— No registrado —</span>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-slate-400 dark:text-white/30">
                {fmtDate((item as any).createdAt || (item as any).date)}
              </span>
              <div className="flex items-center gap-1.5">
                {status === 'mismatch-amount' && diffUsd != null && (
                  <span className="text-[9px] font-black text-amber-500">Δ {formatCurrency(Math.abs(diffUsd))}</span>
                )}
                <button
                  onClick={() => { setNoteRowKey(rowKey); setNoteDraft(note?.text || ''); }}
                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${note ? 'text-amber-500' : 'text-slate-300 dark:text-white/20 hover:text-indigo-400'}`}
                  title="Añadir nota"
                >
                  <MessageSquare size={11} />
                </button>
              </div>
            </div>
            <span className="font-semibold text-slate-700 dark:text-white/80 truncate">
              {(item as any).concept || (item as any).reason || (item as any).reference || 'Movimiento'}
            </span>
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-slate-800 dark:text-white/90">{fmtAmount(item)}</span>
              {(item as any).movementType && (
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                  (item as any).movementType === 'FACTURA' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'
                }`}>{(item as any).movementType}</span>
              )}
            </div>
            {note?.text && (
              <div className="mt-1 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15">
                <span className="text-[9px] text-amber-600 dark:text-amber-400 leading-snug">{note.text}</span>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const modInfo = selModule ? MODULES.find(m => m.id === selModule) : null;

  /* ──────────────────────────────────────────────────────────
     RENDER
     ────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 relative">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[200] flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#0d1424] border border-indigo-500/30 text-white text-sm font-bold shadow-2xl shadow-black/40 animate-pulse">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <GitCompare size={18} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">Comparar Libros</h2>
            <p className="text-[11px] text-slate-500 dark:text-white/30">Cotejo cruzado entre usuarios — auditado y trazado</p>
          </div>
        </div>
        {requestStatus === 'active' && (
          <button onClick={handleClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all">
            <X size={13} /> Cerrar sesión
          </button>
        )}
      </div>

      {/* Guide banner — always visible when idle */}
      {requestStatus === 'idle' && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] dark:bg-indigo-950/20 p-4 flex gap-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Info size={15} className="text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-700 dark:text-white/80 mb-1">¿Cómo funciona Comparar Libros?</p>
            <ol className="text-[11px] text-slate-500 dark:text-white/40 leading-relaxed space-y-0.5 list-decimal pl-4">
              <li><strong className="text-slate-600 dark:text-white/60">Elige el módulo</strong> que quieres cotejar (CxC, CxP, RRHH, Inventario o Contabilidad).</li>
              <li><strong className="text-slate-600 dark:text-white/60">Selecciona un compañero</strong> — se le enviará una notificación para que acepte la sesión.</li>
              <li>Al aceptar, <strong className="text-slate-600 dark:text-white/60">ambos ven los registros en pantalla dividida</strong> con diferencias resaltadas en colores.</li>
              <li>Pueden <strong className="text-slate-600 dark:text-white/60">chatear, anotar filas</strong> y exportar el reporte en PDF.</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── INCOMING REQUESTS ── */}
      {incoming.length > 0 && requestStatus !== 'active' && (
        <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.06] dark:bg-indigo-950/30 p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
            📬 {incoming.length} solicitud{incoming.length > 1 ? 'es' : ''} pendiente{incoming.length > 1 ? 's' : ''}
          </p>
          {incoming.map(req => {
            const mod = MODULES.find(m => m.id === req.module);
            return (
              <div key={req.id} className="rounded-xl border border-white/[0.08] bg-white dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 dark:text-white text-sm">{req.requesterName}</span>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {mod?.label || req.module}
                    </span>
                    {req.entityName && (
                      <span className="text-[9px] text-slate-500 dark:text-white/30">· {req.entityName}</span>
                    )}
                  </div>
                  {req.note && (
                    <p className="text-[11px] text-slate-500 dark:text-white/40 italic">"{req.note}"</p>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-white/25 mt-1">{fmtDate(req.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rejectingId === req.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Motivo (opcional)..."
                        className="text-xs px-2 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] text-white w-40"
                      />
                      <button onClick={() => handleReject(req)}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs font-black">
                        Confirmar
                      </button>
                      <button onClick={() => setRejectingId(null)}
                        className="px-2 py-1.5 rounded-lg text-slate-400 text-xs">Cancelar</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setRejectingId(req.id)}
                        className="px-3 py-2 rounded-xl border border-white/[0.1] text-slate-500 dark:text-white/30 text-[10px] font-black uppercase hover:border-rose-500/30 hover:text-rose-400 transition-all">
                        Rechazar
                      </button>
                      <button onClick={() => handleAccept(req)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 6px 20px -6px rgba(99,102,241,.5)' }}>
                        <Check size={12} /> Aceptar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── IDLE: WIZARD ── */}
      {requestStatus === 'idle' && (
        <div className="rounded-2xl border border-white/[0.07] bg-white dark:bg-[#0d1424] overflow-hidden">
          {/* Step indicators */}
          <div className="flex border-b border-white/[0.06]">
            {[{ n: 1, label: 'Módulo' }, { n: 2, label: 'Entidad y usuario' }, { n: 3, label: 'Confirmar' }].map(s => (
              <div key={s.n} className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                step === s.n ? 'border-b-2 border-indigo-500 text-indigo-400' : step > s.n ? 'text-emerald-400' : 'text-slate-400 dark:text-white/20'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                  step > s.n ? 'bg-emerald-500/20 text-emerald-400' : step === s.n ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/[0.05]'
                }`}>
                  {step > s.n ? <Check size={10} /> : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="p-6">
            {/* STEP 1: Module */}
            {step === 1 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-sm font-black text-slate-700 dark:text-white/80">¿Qué libro quieres comparar?</p>
                  <HelpTooltip
                    title="Módulos disponibles"
                    text="Cada módulo filtra un tipo de registro: CxC compara saldos de clientes, CxP de proveedores, RRHH adelantos de empleados, Inventario movimientos de stock, y Contabilidad todos los asientos."
                    side="right"
                  />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {MODULES.map(m => {
                    const Icon = m.icon;
                    return (
                      <button key={m.id} onClick={() => { setSelModule(m.id); setSelEntityId(''); setSelEntityName(''); setStep(2); }}
                        className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${m.border} ${m.bg} hover:brightness-125`}>
                        <div className={`h-9 w-9 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center mb-3`}>
                          <Icon size={16} className={m.color} />
                        </div>
                        <p className={`text-sm font-black ${m.color}`}>{m.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-white/30 mt-1 leading-snug">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2: Entity + User */}
            {step === 2 && modInfo && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setStep(1)} className="text-[10px] text-slate-400 dark:text-white/30 hover:text-indigo-400 transition-colors font-black">← Módulo</button>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${modInfo.bg} ${modInfo.border} border ${modInfo.color}`}>
                    {modInfo.label}
                  </span>
                </div>

                {/* Entity picker */}
                {selModule !== 'contabilidad' && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/30">
                        {selModule === 'cxc' ? 'Cliente' : selModule === 'cxp' ? 'Proveedor' : selModule === 'rrhh' ? 'Empleado' : 'Producto'}
                        <span className="text-slate-400 dark:text-white/20 font-normal ml-1">(opcional — vacío = todos)</span>
                      </label>
                      <HelpTooltip
                        text="Si seleccionas una entidad específica, la comparación solo incluirá los movimientos de ese cliente, proveedor o empleado. Déjalo en '— Todos —' para comparar el módulo completo."
                        side="right"
                      />
                    </div>
                    {/* Custom styled dropdown */}
                    <div ref={entityDropRef} className="relative">
                      {/* Trigger button */}
                      <button
                        type="button"
                        onClick={() => { setEntityDropOpen(v => !v); setEntitySearch(''); }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/[0.09] bg-slate-50 dark:bg-white/[0.04] hover:dark:bg-white/[0.07] transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {selEntityId ? (
                            <>
                              <span className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-[9px] font-black text-indigo-400 shrink-0">
                                {(entityOptions.find(o => o.id === selEntityId)?.label || '?').charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0 text-left">
                                <p className="text-sm font-semibold text-slate-700 dark:text-white truncate">{entityOptions.find(o => o.id === selEntityId)?.label}</p>
                                {entityOptions.find(o => o.id === selEntityId)?.sub && (
                                  <p className="text-[10px] text-slate-400 dark:text-white/30 truncate">{entityOptions.find(o => o.id === selEntityId)?.sub}</p>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-slate-400 dark:text-white/25 italic">— Todos —</span>
                          )}
                        </div>
                        <svg className={`w-4 h-4 text-slate-400 dark:text-white/25 shrink-0 transition-transform ${entityDropOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </button>

                      {/* Dropdown panel */}
                      {entityDropOpen && (
                        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 rounded-2xl border border-white/[0.1] bg-[#0d1424] shadow-2xl shadow-black/50 overflow-hidden">
                          {/* Search */}
                          <div className="px-3 pt-3 pb-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07]">
                              <svg className="w-3.5 h-3.5 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
                              <input
                                autoFocus
                                value={entitySearch}
                                onChange={e => setEntitySearch(e.target.value)}
                                placeholder="Buscar..."
                                className="flex-1 bg-transparent text-sm text-white placeholder-white/25 focus:outline-none"
                              />
                              {entitySearch && (
                                <button onClick={() => setEntitySearch('')} className="text-white/25 hover:text-white/50">
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Options list */}
                          <div className="overflow-y-auto max-h-52 px-2 pb-2 space-y-0.5"
                            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.3) transparent' }}>
                            {/* "Todos" option */}
                            <button
                              onClick={() => { setSelEntityId(''); setSelEntityName(''); setEntityDropOpen(false); setEntitySearch(''); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                                !selEntityId ? 'bg-indigo-500/15 text-indigo-300' : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                              }`}
                            >
                              <span className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center text-[9px] text-white/30">∗</span>
                              <span className="text-sm font-medium italic">— Todos —</span>
                            </button>

                            {entityOptions
                              .filter(o => !entitySearch || o.label.toLowerCase().includes(entitySearch.toLowerCase()) || (o.sub && o.sub.toLowerCase().includes(entitySearch.toLowerCase())))
                              .map(o => (
                                <button
                                  key={o.id}
                                  onClick={() => { setSelEntityId(o.id); setSelEntityName(o.label); setEntityDropOpen(false); setEntitySearch(''); }}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                                    selEntityId === o.id
                                      ? 'bg-indigo-500/20 border border-indigo-500/30'
                                      : 'hover:bg-white/[0.05] border border-transparent'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                    selEntityId === o.id ? 'bg-indigo-500/25 text-indigo-300' : 'bg-white/[0.07] text-white/40'
                                  }`}>
                                    {o.label.charAt(0).toUpperCase()}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-semibold truncate ${selEntityId === o.id ? 'text-indigo-200' : 'text-white/80'}`}>{o.label}</p>
                                    {o.sub && <p className="text-[10px] text-white/30 truncate">{o.sub}</p>}
                                  </div>
                                  {selEntityId === o.id && <Check size={13} className="text-indigo-400 shrink-0" />}
                                </button>
                              ))
                            }
                            {entityOptions.filter(o => !entitySearch || o.label.toLowerCase().includes(entitySearch.toLowerCase()) || (o.sub && o.sub.toLowerCase().includes(entitySearch.toLowerCase()))).length === 0 && (
                              <p className="text-center text-[11px] text-white/25 py-4 italic">Sin resultados para "{entitySearch}"</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* User picker */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/30">
                      Usuario a comparar <span className="text-rose-400">*</span>
                    </label>
                    <HelpTooltip
                      title="¿Qué pasa cuando seleccionas un usuario?"
                      text="Se enviará una notificación al usuario elegido. Cuando acepte, ambos verán sus registros en pantalla dividida en tiempo real. Ninguno puede ver los datos del otro hasta que la sesión sea aceptada."
                      side="right"
                    />
                  </div>
                  {otherUsers.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-white/30 italic">No hay otros usuarios en este negocio.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {otherUsers.map(u => {
                        const uid  = u.uid || u.id;
                        const name = u.fullName || u.displayName || u.email || uid;
                        return (
                          <button key={uid} onClick={() => setSelUserId(uid)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                              selUserId === uid
                                ? 'border-indigo-500/40 bg-indigo-500/10'
                                : 'border-white/[0.07] hover:border-indigo-500/20 hover:bg-white/[0.04]'
                            }`}>
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center text-xs font-black text-indigo-400">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700 dark:text-white/80">{name}</p>
                              <p className="text-[10px] text-slate-400 dark:text-white/25 capitalize">{u.role || 'usuario'}</p>
                            </div>
                            {selUserId === uid && <Check size={14} className="text-indigo-400 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selUserId && (
                  <button onClick={() => setStep(3)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                    Continuar <ArrowRight size={13} />
                  </button>
                )}
              </div>
            )}

            {/* STEP 3: Confirm + send */}
            {step === 3 && modInfo && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setStep(2)} className="text-[10px] text-slate-400 dark:text-white/30 hover:text-indigo-400 transition-colors font-black">← Atrás</button>
                </div>

                {/* Summary card */}
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-5 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Resumen de la solicitud</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Módulo', val: modInfo.label },
                      { label: 'Entidad', val: selEntityName || 'Todos' },
                      { label: 'Usuario', val: getUserName(selUserId) },
                    ].map(f => (
                      <div key={f.label} className="rounded-xl bg-white/[0.05] p-3">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{f.label}</p>
                        <p className="text-sm font-bold text-white mt-0.5 truncate">{f.val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional note */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-white/30">
                      Nota para el receptor (opcional)
                    </label>
                    <HelpTooltip
                      text="El receptor verá esta nota al recibir la solicitud. Úsala para explicar el motivo de la comparación, por ejemplo: 'Hay una diferencia en el saldo de Enero que quiero revisar contigo'."
                      side="top"
                    />
                  </div>
                  <textarea
                    value={reqNote}
                    onChange={e => setReqNote(e.target.value)}
                    placeholder="Ej: Hay una diferencia en el saldo de Enero que necesito revisar contigo..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                  />
                </div>

                <button onClick={handleSendRequest} disabled={loading}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 10px 30px -10px rgba(99,102,241,.5)' }}>
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Enviar solicitud
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PENDING STATE ── */}
      {requestStatus === 'pending' && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-amber-400 animate-pulse" />
            <div>
              <p className="font-black text-amber-400">Esperando respuesta...</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                Se notificó a <strong className="text-white/60">{getUserName(selUserId)}</strong>.
                {reqNote && ` Nota: "${reqNote}"`}
              </p>
            </div>
          </div>
          <button onClick={resetSession}
            className="text-[10px] font-black uppercase text-slate-400 dark:text-white/30 hover:text-rose-400 transition-colors">
            Cancelar
          </button>
        </div>
      )}

      {/* ── REJECTED STATE ── */}
      {requestStatus === 'rejected' && (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <XCircle size={18} className="text-rose-400" />
            <div>
              <p className="font-black text-rose-400">Solicitud rechazada</p>
              {activeRequest?.rejectReason && (
                <p className="text-[11px] text-white/40">Motivo: {activeRequest.rejectReason}</p>
              )}
            </div>
          </div>
          <button onClick={resetSession}
            className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/50 text-[10px] font-black uppercase hover:text-white transition-all">
            Nueva solicitud
          </button>
        </div>
      )}

      {/* ── ACTIVE: SPLIT SCREEN ── */}
      {requestStatus === 'active' && activeRequest && (
        <div className="space-y-4">
          {/* Sticky header */}
          <div className="sticky top-2 z-30 rounded-2xl border border-white/[0.08] bg-white/95 dark:bg-[#0d1424]/95 backdrop-blur-md px-5 py-3 shadow-xl shadow-black/10 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Sesión activa</span>
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {MODULES.find(m => m.id === activeRequest.module)?.label}
              </span>
              {activeRequest.entityName && (
                <span className="text-[10px] text-slate-500 dark:text-white/30">· {activeRequest.entityName}</span>
              )}
              <span className="text-[10px] text-slate-400 dark:text-white/25">
                {diffStats.total} filas · {diffStats.matches} coinciden · <span className="text-rose-400 font-black">{diffStats.total - diffStats.matches} diferencias</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <HelpTooltip text="Oculta las filas que coinciden y muestra solo las diferencias entre ambos libros." side="bottom" asChild>
                <button onClick={() => setOnlyDiffs(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase transition-all ${
                    onlyDiffs ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' : 'border-white/[0.08] text-slate-400 dark:text-white/30 hover:text-white hover:border-white/20'
                  }`}>
                  {onlyDiffs ? <Eye size={11} /> : <EyeOff size={11} />}
                  Solo diferencias
                </button>
              </HelpTooltip>
              <HelpTooltip text="Abre el chat de la sesión para discutir diferencias con el otro usuario en tiempo real." side="bottom" asChild>
                <button onClick={() => setChatOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase transition-all relative ${
                    chatOpen ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400' : 'border-white/[0.08] text-slate-400 dark:text-white/30 hover:text-white'
                  }`}>
                  <MessageSquare size={11} />
                  Chat
                  {chatMessages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[8px] flex items-center justify-center font-black">
                      {chatMessages.length > 9 ? '9+' : chatMessages.length}
                    </span>
                  )}
                </button>
              </HelpTooltip>
              <HelpTooltip text="Exporta la comparación completa en PDF, incluyendo notas de auditoría por fila." side="bottom" asChild>
                <button onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] text-[10px] font-black uppercase text-slate-400 dark:text-white/30 hover:text-white hover:border-white/20 transition-all">
                  <Download size={11} /> PDF
                </button>
              </HelpTooltip>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Coinciden',      val: diffStats.matches,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
              { label: 'Monto distinto', val: diffStats.mismatch,  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: AlertCircle },
              { label: 'Solo en mi libro', val: diffStats.onlyLeft, color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  icon: Minus },
              { label: 'Solo en su libro', val: diffStats.onlyRight, color: 'text-sky-400',   bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     icon: Minus },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-4 flex items-center gap-3`}>
                  <Icon size={16} className={s.color} />
                  <div>
                    <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                    <p className="text-[9px] font-black text-slate-500 dark:text-white/25 uppercase tracking-widest">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Color legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
            {[
              { color: 'bg-emerald-400', label: 'Coincide exactamente' },
              { color: 'bg-amber-400',   label: 'Monto diferente' },
              { color: 'bg-indigo-400',  label: 'Solo en mi libro' },
              { color: 'bg-sky-400',     label: 'Solo en su libro' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${l.color}`} />
                <span className="text-[9px] text-slate-400 dark:text-white/25 font-medium">{l.label}</span>
              </div>
            ))}
            <span className="text-[9px] text-slate-300 dark:text-white/20 ml-1">· Haz clic en <MessageSquare size={9} className="inline" /> en cada fila para añadir una nota de auditoría</span>
          </div>

          {/* Chat panel */}
          {chatOpen && (
            <div className="rounded-2xl border border-indigo-500/20 bg-white dark:bg-[#0a0e1a] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <MessageSquare size={14} className="text-indigo-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Chat de contexto</p>
              </div>
              <div className="p-4 h-48 overflow-y-auto space-y-2">
                {chatMessages.length === 0 && (
                  <p className="text-[11px] text-center text-slate-400 dark:text-white/20 py-4 italic">Sin mensajes aún. Usa el chat para discutir diferencias.</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.authorId === currentUserId ? 'flex-row-reverse' : ''}`}>
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center text-[9px] font-black text-indigo-400 shrink-0">
                      {(msg.authorName || 'U').charAt(0)}
                    </div>
                    <div className={`max-w-[70%] px-3 py-2 rounded-xl text-xs ${
                      msg.authorId === currentUserId
                        ? 'bg-indigo-500/15 text-indigo-100 rounded-tr-sm'
                        : 'bg-white/[0.06] text-white/70 rounded-tl-sm'
                    }`}>
                      {msg.authorId !== currentUserId && (
                        <p className="text-[9px] font-black text-white/30 mb-1">{msg.authorName}</p>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <input
                  value={chatMsg}
                  onChange={e => setChatMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button onClick={handleSendChat}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-2.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Mi libro — {currentUserName}</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-2.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sky-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">
                Libro de — {getUserName(activeRequest.requesterId === currentUserId ? activeRequest.receiverId : activeRequest.requesterId)}
              </p>
            </div>
          </div>

          {/* Diff rows */}
          {visibleRows.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
              <p className="font-black text-white/60">{onlyDiffs ? 'No hay diferencias.' : 'Sin movimientos para comparar.'}</p>
              {onlyDiffs && diffStats.matches > 0 && (
                <p className="text-[11px] text-white/30 mt-1">
                  {diffStats.matches} registros coinciden perfectamente.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRows.map((row, idx) => {
                const rowKey = `${(row.left as any)?.id || 'L'}_${(row.right as any)?.id || 'R'}`;
                const StatusIcon =
                  row.status === 'match'           ? CheckCircle2
                  : row.status === 'mismatch-amount' ? AlertCircle
                  : AlertTriangle;
                const statusColor =
                  row.status === 'match'           ? 'text-emerald-400'
                  : row.status === 'mismatch-amount' ? 'text-amber-400'
                  : 'text-rose-400';

                return (
                  <div key={idx}>
                    {/* Row status label (only for non-matches) */}
                    {row.status !== 'match' && (
                      <div className={`flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest ${statusColor}`}>
                        <StatusIcon size={10} />
                        {row.status === 'mismatch-amount' ? 'Monto diferente'
                         : row.status === 'only-left' ? 'Solo en mi libro'
                         : 'Solo en su libro'}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <RowCard item={row.left}  side="left"  status={row.status} diffUsd={row.diffUsd} rowKey={rowKey} />
                      <RowCard item={row.right} side="right" status={row.status} diffUsd={row.diffUsd} rowKey={rowKey} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── NOTE MODAL ── */}
      {noteRowKey && (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setNoteRowKey(null); }}>
          <div className="w-full max-w-sm bg-[#0d1424] border border-white/[0.1] rounded-2xl p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-amber-400" />
                <p className="font-black text-white">Nota de auditoría</p>
              </div>
              <button onClick={() => setNoteRowKey(null)} className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/40 hover:text-white flex items-center justify-center">
                <X size={12} />
              </button>
            </div>
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Escribe una observación sobre esta diferencia..."
              rows={4}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
            />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setNoteRowKey(null)} className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase text-white/30 hover:text-white transition-colors">Cancelar</button>
              <button onClick={handleSaveNote} disabled={noteSaving}
                className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                {noteSaving ? 'Guardando...' : 'Guardar nota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BooksComparePanel;
