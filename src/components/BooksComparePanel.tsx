import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Customer, ExchangeRates, Movement } from '../../types';
import { formatCurrency, getMovementUsdAmount } from '../utils/formatters';
import Autocomplete from './Autocomplete';
import EmptyState from './EmptyState';
import {
  createBookCompareRequest,
  getLatestBookCompareRequest,
  respondBookCompareRequest,
} from '../firebase/api';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';

type CompanyUser = {
  uid?: string;
  id?: string;
  fullName?: string;
  email?: string;
  role?: string;
};

type BookCompareRequest = {
  id: string;
  businessId: string;
  requesterId: string;
  requesterName?: string;
  requesterEmail?: string;
  targetUserId: string;
  targetUserName?: string;
  requesterCustomerId?: string;
  responderCustomerId?: string;
  status: string;
  createdAt: string;
};

interface BooksComparePanelProps {
  businessId: string;
  currentUserId: string;
  users: CompanyUser[];
  customers: Customer[];
  allowedUserIds: string[];
  isAdmin: boolean;
  rates: ExchangeRates;
  fetchMovements: (ownerId: string) => Promise<Movement[]>;
}

const BooksComparePanel: React.FC<BooksComparePanelProps> = ({
  businessId,
  currentUserId,
  users,
  customers,
  allowedUserIds,
  isAdmin,
  rates,
  fetchMovements,
}) => {
  const [leftUserId, setLeftUserId] = useState(currentUserId);
  const [rightUserId, setRightUserId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerTerm, setCustomerTerm] = useState('');
  const [counterpartCustomerId, setCounterpartCustomerId] = useState('');
  const [counterpartCustomerTerm, setCounterpartCustomerTerm] = useState('');
  const [counterpartHasData, setCounterpartHasData] = useState<boolean | null>(null);
  const [requestStatus, setRequestStatus] = useState<
    'idle' | 'pending_match' | 'accepted' | 'connected' | 'closed' | 'rejected'
  >('idle');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<BookCompareRequest[]>([]);
  const [incomingMatchMap, setIncomingMatchMap] = useState<Record<string, string>>({});
  const [incomingMatchTermMap, setIncomingMatchTermMap] = useState<Record<string, string>>({});
  const [requestLoading, setRequestLoading] = useState(false);
  const [notesByMovement, setNotesByMovement] = useState<Record<string, any>>({});
  const [noteMovementId, setNoteMovementId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const lastIncomingIdsRef = useRef<Set<string>>(new Set());
  const [leftMovements, setLeftMovements] = useState<Movement[]>([]);
  const [rightMovements, setRightMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);

  const availableUsers = useMemo(() => {
    const allowed = new Set(allowedUserIds);
    return users.filter((u) => {
      const id = u.uid || u.id || '';
      if (!id) return false;
      if (id === currentUserId) return false;
      if (!allowedUserIds.length) return true;
      return isAdmin || allowed.has(id);
    });
  }, [users, allowedUserIds, isAdmin, currentUserId]);

  const getLabel = (u: CompanyUser) => {
    return u.fullName || u.email || u.uid || u.id || 'Usuario';
  };

  const currentUserLabel = useMemo(() => {
    const current = users.find((u) => (u.uid || u.id) === currentUserId);
    return getLabel(current || { fullName: 'Usuario' });
  }, [users, currentUserId]);

  const playNotificationSound = () => {
    try {
      const AudioContextRef = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextRef) return;
      const ctx = new AudioContextRef();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
      oscillator.onended = () => ctx.close();
    } catch (e) {
      // Ignore audio errors (autoplay restrictions)
    }
  };

  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setShowToast(false);
    }, 3200);
  };

  useEffect(() => {
    setLeftUserId(currentUserId);
  }, [currentUserId]);

  const resetConnectionState = () => {
    setRightUserId('');
    setCounterpartCustomerId('');
    setCounterpartCustomerTerm('');
    setCounterpartHasData(null);
    setActiveRequestId(null);
    setRequestStatus('idle');
    setLeftMovements([]);
    setRightMovements([]);
  };

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerTerm('');
      setCounterpartCustomerId('');
      setCounterpartCustomerTerm('');
      setCounterpartHasData(null);
      setLeftMovements([]);
      setRightMovements([]);
    }
  }, [selectedCustomerId]);

  const loadCompare = async () => {
    if (!leftUserId || !rightUserId || leftUserId === rightUserId) return;
    if (!selectedCustomerId) return;
    if (!businessId || (requestStatus !== 'accepted' && requestStatus !== 'connected')) return;
    try {
      setLoading(true);
      const [leftData, rightData] = await Promise.all([
        fetchMovements(leftUserId),
        fetchMovements(rightUserId),
      ]);
      const normalizedCustomer = selectedCustomerId.trim().toUpperCase();
      const normalizedCounterpart = (counterpartCustomerId || selectedCustomerId)
        .trim()
        .toUpperCase();
      const leftFiltered = leftData.filter(
        (m) => String(m.entityId || '').toUpperCase() === normalizedCustomer
      );
      const rightFiltered = rightData.filter(
        (m) => String(m.entityId || '').toUpperCase() === normalizedCounterpart
      );
      setLeftMovements(leftFiltered);
      setRightMovements(rightFiltered);
      setCounterpartHasData(rightFiltered.length > 0);
    } finally {
      setLoading(false);
    }
  };

  const refreshOutgoingStatus = async () => {
    if (!businessId || !currentUserId || !targetUserId) {
      resetConnectionState();
      return;
    }
    const latest = await getLatestBookCompareRequest(businessId, currentUserId, targetUserId);
    if (!latest) {
      resetConnectionState();
      return;
    }
    if (latest.status === 'closed') {
      resetConnectionState();
      return;
    }
    const nextStatus = latest.status === 'accepted' ? 'connected' : latest.status || 'idle';
    setRequestStatus(nextStatus);
    setActiveRequestId(latest.id || null);
    if (nextStatus === 'connected') {
      setRightUserId(targetUserId);
    }
    if (latest.requesterCustomerId) {
      setSelectedCustomerId(String(latest.requesterCustomerId));
      setCustomerTerm(String(latest.requesterCustomerId));
    }
    if (latest.responderCustomerId) {
      setCounterpartCustomerId(String(latest.responderCustomerId));
      setCounterpartCustomerTerm(String(latest.responderCustomerId));
    }
  };

  useEffect(() => {
    if (!businessId || !currentUserId) {
      setIncomingRequests([]);
      return;
    }

    const pendingQuery = query(
      collection(db, 'bookCompareRequests'),
      where('businessId', '==', businessId),
      where('targetUserId', '==', currentUserId),
      where('status', '==', 'pending_match'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BookCompareRequest));
      const nextIds = new Set(items.map((item) => item.id));
      const lastIds = lastIncomingIdsRef.current;
      const hasNew = items.some((item) => !lastIds.has(item.id));
      lastIncomingIdsRef.current = nextIds;
      setIncomingRequests(items);

      if (hasNew && items.length > 0) {
        const top = items[0];
        const who = top.requesterName || top.requesterEmail || top.requesterId || 'Un usuario';
        showNotification(`${who} quiere comparar libros contigo.`);
        playNotificationSound();
      }
    });

    return () => unsubscribe();
  }, [businessId, currentUserId]);

  useEffect(() => {
    refreshOutgoingStatus();
  }, [businessId, currentUserId, targetUserId]);

  useEffect(() => {
    if (!activeRequestId) return undefined;
    const reqRef = doc(db, 'bookCompareRequests', activeRequestId);
    const unsubscribe = onSnapshot(reqRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data: any = snapshot.data();
      if (data.status === 'closed') {
        resetConnectionState();
        return;
      }
      const nextStatus = data.status === 'accepted' ? 'connected' : data.status || 'idle';
      setRequestStatus(nextStatus);
      const isRequester = data.requesterId === currentUserId;
      const otherId = isRequester ? data.targetUserId : data.requesterId;
      if (nextStatus === 'connected') {
        setRightUserId(otherId || '');
      } else if (data.status !== 'pending_match') {
        setRightUserId('');
      }
      if (isRequester) {
        if (data.requesterCustomerId) {
          setSelectedCustomerId(String(data.requesterCustomerId));
          setCustomerTerm(String(data.requesterCustomerId));
        }
        if (data.responderCustomerId) {
          setCounterpartCustomerId(String(data.responderCustomerId));
          setCounterpartCustomerTerm(String(data.responderCustomerId));
        }
      } else {
        if (data.responderCustomerId) {
          setSelectedCustomerId(String(data.responderCustomerId));
          setCustomerTerm(String(data.responderCustomerId));
        }
        if (data.requesterCustomerId) {
          setCounterpartCustomerId(String(data.requesterCustomerId));
          setCounterpartCustomerTerm(String(data.requesterCustomerId));
        }
      }
    });
    return () => unsubscribe();
  }, [activeRequestId, currentUserId]);

  useEffect(() => {
    if (!businessId || !activeRequestId) {
      setNotesByMovement({});
      return;
    }

    const notesQuery = query(
      collection(db, 'bookCompareNotes'),
      where('businessId', '==', businessId),
      where('requestId', '==', activeRequestId),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
      const next: Record<string, any> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.movementId) return;
        if (!next[data.movementId]) {
          next[data.movementId] = { id: docSnap.id, ...data };
        }
      });
      setNotesByMovement(next);
    });

    return () => unsubscribe();
  }, [businessId, activeRequestId]);

  useEffect(() => {
    loadCompare();
  }, [leftUserId, rightUserId, requestStatus, selectedCustomerId, counterpartCustomerId]);

  const handleSendRequest = async () => {
    if (!businessId || !currentUserId || !targetUserId) return;
    if (!selectedCustomerId) {
      showNotification('Selecciona el cliente a comparar.');
      return;
    }
    try {
      setRequestLoading(true);
      const requester = users.find((u) => (u.uid || u.id) === currentUserId);
      const target = users.find((u) => (u.uid || u.id) === targetUserId);
      const requestId = await createBookCompareRequest({
        businessId,
        requesterId: currentUserId,
        requesterName: requester?.fullName,
        requesterEmail: requester?.email,
        targetUserId,
        targetUserName: target?.fullName,
        requesterCustomerId: selectedCustomerId,
      });
      setActiveRequestId(requestId);
      setRequestStatus('pending_match');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleAcceptRequest = async (req: any) => {
    if (!currentUserId) return;
    const mappedCustomer = incomingMatchMap[req.id];
    if (!mappedCustomer) {
      showNotification('Selecciona el cliente equivalente antes de aceptar.');
      return;
    }
    await respondBookCompareRequest(req.id, 'connected', currentUserId, {
      responderCustomerId: mappedCustomer,
    });
    setTargetUserId(req.requesterId);
    setRightUserId(req.requesterId);
    setRequestStatus('connected');
    setActiveRequestId(req.id);
    if (mappedCustomer) {
      setSelectedCustomerId(String(mappedCustomer));
      setCustomerTerm(String(mappedCustomer));
    }
    if (req.requesterCustomerId) {
      setCounterpartCustomerId(String(req.requesterCustomerId));
      setCounterpartCustomerTerm(String(req.requesterCustomerId));
    }
  };

  const handleRejectRequest = async (req: any) => {
    if (!currentUserId) return;
    await respondBookCompareRequest(req.id, 'rejected', currentUserId);
  };

  const handleCloseSession = async () => {
    if (!activeRequestId || !currentUserId) return;
    if (noteDraft.trim() && noteMovementId) {
      await handleSaveNote();
    }
    await respondBookCompareRequest(activeRequestId, 'closed', currentUserId);
    resetConnectionState();
    setTargetUserId('');
  };

  const openNoteEditor = (movement: Movement) => {
    const existing = notesByMovement[movement.id];
    setNoteMovementId(movement.id);
    setNoteDraft(existing?.text || '');
    setNoteTitle(movement.concept || movement.reference || 'Movimiento');
  };

  const closeNoteEditor = () => {
    setNoteMovementId(null);
    setNoteDraft('');
    setNoteTitle('');
  };

  const handleSaveNote = async () => {
    if (!noteMovementId || !businessId || !activeRequestId || !currentUserId) return;
    try {
      setNoteSaving(true);
      const payload = {
        businessId,
        requestId: activeRequestId,
        movementId: noteMovementId,
        authorId: currentUserId,
        authorName: currentUserLabel,
        text: noteDraft.trim(),
        updatedAt: new Date().toISOString(),
      };
      const existing = notesByMovement[noteMovementId];
      if (existing?.id) {
        await updateDoc(doc(db, 'bookCompareNotes', existing.id), payload);
      } else {
        await addDoc(collection(db, 'bookCompareNotes'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }
      closeNoteEditor();
    } finally {
      setNoteSaving(false);
    }
  };

  const summarize = (items: Movement[]) => {
    const totals = items.reduce(
      (acc, m) => {
        const amount = getMovementUsdAmount(m, rates);
        if (m.movementType === 'FACTURA') acc.facturas += amount;
        if (m.movementType === 'ABONO') acc.abonos += amount;
        acc.total += amount;
        acc.count += 1;
        return acc;
      },
      { facturas: 0, abonos: 0, total: 0, count: 0 }
    );
    return {
      ...totals,
      balance: totals.facturas - totals.abonos,
    };
  };

  const leftSummary = useMemo(() => summarize(leftMovements), [leftMovements]);
  const rightSummary = useMemo(() => summarize(rightMovements), [rightMovements]);

  const getMovementTimestamp = (m: Movement) => {
    const raw = m.createdAt || m.date;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  };

  const getMovementAmount = (m: Movement) => {
    if (typeof m.originalAmount === 'number') return m.originalAmount;
    return typeof m.amount === 'number' ? m.amount : 0;
  };

  const reconcileResults = useMemo(() => {
    const dayWindowMs = 24 * 60 * 60 * 1000;
    const usedRight = new Set<string>();
    const rows: Array<{
      left?: Movement;
      right?: Movement;
      status: 'match' | 'missing-left' | 'missing-right' | 'amount-mismatch';
      diffUsd?: number;
      timeDeltaMs?: number;
    }> = [];

    const rightList = [...rightMovements];

    const findBestMatch = (left: Movement) => {
      const leftAmount = getMovementAmount(left);
      const leftCurrency = String(left.currency || '').toUpperCase();
      const leftTime = getMovementTimestamp(left);
      let best: { idx: number; delta: number } | null = null;

      rightList.forEach((right, idx) => {
        if (usedRight.has(right.id)) return;
        const rightAmount = getMovementAmount(right);
        const rightCurrency = String(right.currency || '').toUpperCase();
        if (leftCurrency !== rightCurrency) return;
        if (Math.abs(leftAmount - rightAmount) > 0.01) return;
        const rightTime = getMovementTimestamp(right);
        const delta = Math.abs(leftTime - rightTime);
        if (delta > dayWindowMs) return;
        if (!best || delta < best.delta) {
          best = { idx, delta };
        }
      });

      return best;
    };

    const findAmountMismatch = (left: Movement) => {
      const leftRef = (left.reference || left.concept || '').toLowerCase();
      const leftTime = getMovementTimestamp(left);
      let best: { idx: number; delta: number } | null = null;

      rightList.forEach((right, idx) => {
        if (usedRight.has(right.id)) return;
        const rightRef = (right.reference || right.concept || '').toLowerCase();
        if (!leftRef || leftRef !== rightRef) return;
        const rightTime = getMovementTimestamp(right);
        const delta = Math.abs(leftTime - rightTime);
        if (delta > dayWindowMs) return;
        if (!best || delta < best.delta) {
          best = { idx, delta };
        }
      });

      return best;
    };

    leftMovements.forEach((left) => {
      const match = findBestMatch(left);
      if (match) {
        const right = rightList[match.idx];
        usedRight.add(right.id);
        rows.push({ left, right, status: 'match', timeDeltaMs: match.delta });
        return;
      }

      const mismatch = findAmountMismatch(left);
      if (mismatch) {
        const right = rightList[mismatch.idx];
        usedRight.add(right.id);
        const diffUsd =
          getMovementUsdAmount(left, rates) - getMovementUsdAmount(right, rates);
        rows.push({ left, right, status: 'amount-mismatch', diffUsd, timeDeltaMs: mismatch.delta });
        return;
      }

      rows.push({ left, status: 'missing-right' });
    });

    rightList.forEach((right) => {
      if (usedRight.has(right.id)) return;
      rows.push({ right, status: 'missing-left' });
    });

    const sortedRows = [...rows].sort((a, b) => {
      const aTime = a.left ? getMovementTimestamp(a.left) : getMovementTimestamp(a.right as Movement);
      const bTime = b.left ? getMovementTimestamp(b.left) : getMovementTimestamp(b.right as Movement);
      return bTime - aTime;
    });

    const summary = sortedRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'match') acc.matches += 1;
        if (row.status === 'missing-right') acc.missingRight += 1;
        if (row.status === 'missing-left') acc.missingLeft += 1;
        if (row.status === 'amount-mismatch') acc.amountMismatch += 1;
        return acc;
      },
      { total: 0, matches: 0, missingRight: 0, missingLeft: 0, amountMismatch: 0 }
    );

    return { rows: sortedRows, summary };
  }, [leftMovements, rightMovements, rates]);

  const differenceCounts = useMemo(() => {
    const toKey = (m: Movement) =>
      `${m.date}|${m.entityId}|${m.movementType}|${m.concept}|${m.amountInUSD}`;
    const leftSet = new Set(leftMovements.map(toKey));
    const rightSet = new Set(rightMovements.map(toKey));
    let onlyLeft = 0;
    let onlyRight = 0;
    leftSet.forEach((k) => {
      if (!rightSet.has(k)) onlyLeft += 1;
    });
    rightSet.forEach((k) => {
      if (!leftSet.has(k)) onlyRight += 1;
    });
    return { onlyLeft, onlyRight };
  }, [leftMovements, rightMovements]);

  const balanceDelta = leftSummary.balance - rightSummary.balance;
  const mismatch = Math.abs(balanceDelta) > 0.01;

  const selectedCustomerLabel = useMemo(() => {
    const match = customers.find((c) => c.id === selectedCustomerId);
    return match?.id || selectedCustomerId || '';
  }, [customers, selectedCustomerId]);

  const counterpartCustomerLabel = useMemo(() => {
    const match = customers.find((c) => c.id === counterpartCustomerId);
    return match?.id || counterpartCustomerId || selectedCustomerLabel || '';
  }, [customers, counterpartCustomerId, selectedCustomerLabel]);

  const formatDate = (value?: string) => {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('es-VE');
  };

  const formatMovementDisplay = (movement: Movement) => {
    const amount = getMovementAmount(movement);
    const currency = String(movement.currency || '').toUpperCase();
    const symbol = currency === 'BS' ? 'Bs' : '$';
    return formatCurrency(amount, symbol);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'match') {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (status === 'amount-mismatch') {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-rose-100 text-rose-700';
  };

  const diagnosisMessage = useMemo(() => {
    if (reconcileResults.summary.total === 0) {
      return 'No hay movimientos para comparar en este enlace.';
    }
    const parts: string[] = [];
    if (reconcileResults.summary.missingRight > 0) {
      parts.push(
        `Faltan ${reconcileResults.summary.missingRight} registros en el libro del otro usuario.`
      );
    }
    if (reconcileResults.summary.missingLeft > 0) {
      parts.push(
        `Faltan ${reconcileResults.summary.missingLeft} registros en tu libro.`
      );
    }
    if (reconcileResults.summary.amountMismatch > 0) {
      parts.push(
        `Hay ${reconcileResults.summary.amountMismatch} movimientos con monto diferente.`
      );
    }
    if (parts.length === 0) {
      return 'Todos los movimientos coinciden dentro del margen de 24 horas.';
    }
    return parts.join(' ');
  }, [reconcileResults.summary]);

  const discrepancyRows = useMemo(() => {
    return reconcileResults.rows.filter((row) => {
      if (row.status !== 'match') return true;
      const leftNote = row.left ? notesByMovement[row.left.id]?.text : '';
      const rightNote = row.right ? notesByMovement[row.right.id]?.text : '';
      return Boolean(leftNote || rightNote);
    });
  }, [reconcileResults.rows, notesByMovement]);

  const canExportReport = useMemo(() => discrepancyRows.length > 0, [discrepancyRows.length]);

  const getRowNoteText = (row: any) => {
    const notes: string[] = [];
    if (row.left && notesByMovement[row.left.id]?.text) {
      notes.push(notesByMovement[row.left.id].text);
    }
    if (row.right && notesByMovement[row.right.id]?.text) {
      notes.push(notesByMovement[row.right.id].text);
    }
    return notes.join(' | ');
  };

  const handleExportReport = async () => {
    if (!canExportReport) {
      showNotification('No hay discrepancias ni notas para exportar.');
      return;
    }
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });

      const rightUser = users.find((u) => (u.uid || u.id) === rightUserId);
      doc.setFontSize(12);
      doc.text('Reporte de conciliacion', 14, 14);
      doc.setFontSize(9);
      doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, 14, 20);
      doc.text(`Mi libro: ${currentUserLabel}`, 14, 26);
      doc.text(`Su libro: ${getLabel(rightUser || { fullName: 'Usuario' })}`, 14, 32);

      const tableRows = discrepancyRows.map((row) => {
        const left = row.left as Movement | undefined;
        const right = row.right as Movement | undefined;
        const statusLabel =
          row.status === 'match'
            ? 'Nota'
            : row.status === 'amount-mismatch'
            ? 'Monto distinto'
            : row.status === 'missing-right'
            ? 'Falta en su libro'
            : 'Falta en tu libro';
        const diffLabel =
          row.status === 'amount-mismatch' && typeof row.diffUsd === 'number'
            ? formatCurrency(Math.abs(row.diffUsd))
            : '';
        return [
          statusLabel,
          left ? formatDate(left.createdAt || left.date) : 'Falta',
          left ? left.concept || left.reference || 'Movimiento' : 'Falta registrar',
          left ? formatMovementDisplay(left) : 'Falta',
          right ? formatDate(right.createdAt || right.date) : 'Falta',
          right ? right.concept || right.reference || 'Movimiento' : 'Falta registrar',
          right ? formatMovementDisplay(right) : 'Falta',
          diffLabel,
          getRowNoteText(row),
        ];
      });

      autoTable(doc, {
        startY: 38,
        head: [
          [
            'Estado',
            'Fecha A',
            'Concepto A',
            'Monto A',
            'Fecha B',
            'Concepto B',
            'Monto B',
            'Dif. USD',
            'Notas',
          ],
        ],
        body: tableRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 8: { cellWidth: 70 } },
      });

      doc.save(`reporte-conciliacion-${activeRequestId || 'libros'}.pdf`);
    } catch (error) {
      console.error('Error exportando reporte', error);
      showNotification('No se pudo exportar el reporte.');
    }
  };

  return (
    <div className="space-y-6 relative">
      {showToast && (
        <div className="fixed right-6 top-6 z-50 bg-emerald-600 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-lg">
          {toastMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Comparar libros</h2>
          <p className="text-xs text-slate-500">
            Solicita un cotejo y confirma el enlace antes de comparar.
          </p>
        </div>
        {(requestStatus === 'accepted' || requestStatus === 'connected') && rightUserId && (
          <button
            type="button"
            onClick={handleCloseSession}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-black uppercase"
          >
            🔒 Finalizar y cerrar
          </button>
        )}
      </div>

      {incomingRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-black uppercase text-slate-500">
            Solicitudes pendientes
          </h3>
          {incomingRequests.map((req) => (
            <div
              key={req.id}
              className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 rounded-xl p-3"
            >
              <div className="text-sm text-slate-700">
                <span className="font-black">
                  {req.requesterName || req.requesterEmail || req.requesterId}
                </span>{' '}
                quiere comparar libros contigo{req.customerId ? ` para ${req.customerId}` : ''}.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRejectRequest(req)}
                  className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-black uppercase"
                >
                  Rechazar
                </button>
                <button
                  onClick={() => handleAcceptRequest(req)}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase"
                >
                  Aceptar y comparar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="text-[10px] font-black uppercase text-slate-500">Mi libro</label>
          <div className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-700">
            {getLabel(
              users.find((u) => (u.uid || u.id) === currentUserId) || {
                fullName: 'Mi usuario',
              }
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="text-[10px] font-black uppercase text-slate-500">
            Usuario a comparar
          </label>
          <select
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value);
              setRightUserId('');
              setRequestStatus('idle');
            }}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="">Seleccionar</option>
            {availableUsers.map((u) => (
              <option key={u.uid || u.id} value={u.uid || u.id}>
                {getLabel(u)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <label className="text-[10px] font-black uppercase text-slate-500">
          Cliente a comparar
        </label>
        <div className="mt-2">
          <Autocomplete<Customer>
            items={customers}
            stringify={(item) => item.id}
            secondary={(item) => item.cedula || ''}
            value={customerTerm}
            onChange={(v) => {
              setCustomerTerm(v);
              setSelectedCustomerId(v.trim().toUpperCase());
              setCounterpartHasData(null);
            }}
            onSelect={(item) => {
              setSelectedCustomerId(item.id);
              setCustomerTerm(item.id);
              setCounterpartHasData(null);
            }}
            placeholder="Buscar cliente..."
          />
        </div>
      </div>

      {rightUserId && counterpartCustomerLabel && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="text-[10px] font-black uppercase text-slate-500">
            Cliente del socio
          </label>
          <div className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-700">
            {counterpartCustomerLabel}
          </div>
        </div>
      )}

      {!targetUserId && !selectedCustomerId && requestStatus === 'idle' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <EmptyState
            icon="🔍"
            title="Selecciona un socio para auditar"
            description="Elige un usuario en el menu superior para cruzar los libros contables."
          />
        </div>
      )}

      {targetUserId && requestStatus === 'idle' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-slate-800">Solicitar cotejo de libros</p>
            <p className="text-xs text-slate-500">
              El otro usuario debe aceptar antes de ver la comparacion.
            </p>
          </div>
          <button
            onClick={handleSendRequest}
            disabled={requestLoading}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            Solicitar cotejo
          </button>
        </div>
      )}

      {selectedCustomerId && (requestStatus === 'accepted' || requestStatus === 'connected') && counterpartHasData === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
          {getLabel(users.find((u) => (u.uid || u.id) === rightUserId) || { fullName: 'El otro usuario' })}{' '}
          no tiene movimientos para {counterpartCustomerLabel}.
        </div>
      )}

      {targetUserId && requestStatus === 'pending_match' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
          Esperando que el otro usuario empareje y acepte la solicitud...
        </div>
      )}

      {targetUserId && requestStatus === 'rejected' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 flex items-center justify-between gap-3 flex-wrap">
          <span>La solicitud fue rechazada.</span>
          <button
            onClick={handleSendRequest}
            disabled={requestLoading}
            className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-black uppercase disabled:opacity-50"
          >
            Reintentar
          </button>
        </div>
      )}

      {(requestStatus === 'accepted' || requestStatus === 'connected') && rightUserId && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-700 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-black">Enlace exitoso. Listos para comparar.</span>
          <button
            onClick={loadCompare}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase"
          >
            Actualizar datos
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center text-sm text-slate-500">Cargando comparacion...</div>
      )}

      {!loading && (requestStatus === 'accepted' || requestStatus === 'connected') && leftUserId && rightUserId && (
        <div className="space-y-4">
          <div className="sticky top-4 z-30">
            <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs font-black uppercase text-slate-600">
                <span>Mi saldo: {formatCurrency(leftSummary.balance)}</span>
                <span>Su saldo: {formatCurrency(rightSummary.balance)}</span>
                <span className={mismatch ? 'text-rose-600' : 'text-emerald-600'}>
                  Diferencia: {formatCurrency(Math.abs(balanceDelta))}
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportReport}
                disabled={!canExportReport}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-black uppercase disabled:opacity-50"
              >
                Exportar reporte de conciliacion
              </button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase text-slate-500">Diagnostico del sistema</h3>
            <p className="text-sm text-slate-700 mt-2">{diagnosisMessage}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              className={`bg-white border rounded-2xl p-4 ${
                mismatch ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'
              }`}
            >
              <h3 className="text-xs font-black uppercase text-slate-500">Mi libro</h3>
              <p className="text-sm font-bold text-slate-800 mt-1">Balance</p>
              <p className="text-2xl font-black text-slate-900">
                {formatCurrency(leftSummary.balance)}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Movimientos: {leftSummary.count} | Facturas: {formatCurrency(leftSummary.facturas)}
              </p>
              <p className="text-xs text-slate-500">
                Abonos: {formatCurrency(leftSummary.abonos)}
              </p>
            </div>
            <div
              className={`bg-white border rounded-2xl p-4 ${
                mismatch ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'
              }`}
            >
              <h3 className="text-xs font-black uppercase text-slate-500">Su libro</h3>
              <p className="text-sm font-bold text-slate-800 mt-1">Balance</p>
              <p className="text-2xl font-black text-slate-900">
                {formatCurrency(rightSummary.balance)}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Movimientos: {rightSummary.count} | Facturas: {formatCurrency(rightSummary.facturas)}
              </p>
              <p className="text-xs text-slate-500">
                Abonos: {formatCurrency(rightSummary.abonos)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-black uppercase text-slate-500">Auditoria de movimientos</h3>
              <div className="text-[10px] font-black uppercase text-slate-500">
                Coinciden: {reconcileResults.summary.matches} | Falta en su libro:{' '}
                {reconcileResults.summary.missingRight} | Falta en tu libro:{' '}
                {reconcileResults.summary.missingLeft} | Diferencias:{' '}
                {reconcileResults.summary.amountMismatch}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                {reconcileResults.rows.length === 0 && (
                  <p className="text-xs text-slate-400">Sin movimientos.</p>
                )}
                {reconcileResults.rows.map((row, idx) => {
                  const leftNote = row.left ? notesByMovement[row.left.id] : null;
                  return (
                    <div
                      key={`left-${idx}`}
                      className={`rounded-xl border px-3 py-2 text-xs flex flex-col gap-1 ${
                        row.status === 'match'
                          ? 'border-emerald-200 bg-emerald-50'
                          : row.status === 'amount-mismatch'
                          ? 'border-amber-200 bg-amber-50'
                          : row.status === 'missing-right'
                          ? 'border-rose-200 bg-rose-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getStatusBadge(row.status)}`}>
                          {row.status === 'match'
                            ? 'Coincide'
                            : row.status === 'amount-mismatch'
                            ? 'Monto distinto'
                            : row.status === 'missing-right'
                            ? 'Falta en su libro'
                            : 'Falta en tu libro'}
                        </span>
                        {row.left && (
                          <span className="text-[10px] text-slate-500">
                            {formatDate(row.left.createdAt || row.left.date)}
                          </span>
                        )}
                      </div>
                      {row.left ? (
                        <>
                          <span className="font-semibold text-slate-700">{row.left.concept || 'Movimiento'}</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-600">
                              {formatMovementDisplay(row.left)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openNoteEditor(row.left)}
                              className="text-sm"
                              title="Comentar transaccion"
                            >
                              <i
                                className={`fa-solid fa-note-sticky ${
                                  leftNote ? 'text-amber-500' : 'text-slate-400'
                                }`}
                              ></i>
                            </button>
                          </div>
                          {leftNote?.text && (
                            <span className="text-[10px] text-amber-700 truncate">
                              Nota: {leftNote.text}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">Falta registrar</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                {reconcileResults.rows.length === 0 && (
                  <p className="text-xs text-slate-400">Sin movimientos.</p>
                )}
                {reconcileResults.rows.map((row, idx) => {
                  const rightNote = row.right ? notesByMovement[row.right.id] : null;
                  return (
                    <div
                      key={`right-${idx}`}
                      className={`rounded-xl border px-3 py-2 text-xs flex flex-col gap-1 ${
                        row.status === 'match'
                          ? 'border-emerald-200 bg-emerald-50'
                          : row.status === 'amount-mismatch'
                          ? 'border-amber-200 bg-amber-50'
                          : row.status === 'missing-left'
                          ? 'border-rose-200 bg-rose-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getStatusBadge(row.status)}`}>
                          {row.status === 'match'
                            ? 'Coincide'
                            : row.status === 'amount-mismatch'
                            ? 'Monto distinto'
                            : row.status === 'missing-left'
                            ? 'Falta en tu libro'
                            : 'Falta en su libro'}
                        </span>
                        {row.right && (
                          <span className="text-[10px] text-slate-500">
                            {formatDate(row.right.createdAt || row.right.date)}
                          </span>
                        )}
                      </div>
                      {row.right ? (
                        <>
                          <span className="font-semibold text-slate-700">{row.right.concept || 'Movimiento'}</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-600">
                              {formatMovementDisplay(row.right)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openNoteEditor(row.right)}
                              className="text-sm"
                              title="Comentar transaccion"
                            >
                              <i
                                className={`fa-solid fa-note-sticky ${
                                  rightNote ? 'text-amber-500' : 'text-slate-400'
                                }`}
                              ></i>
                            </button>
                          </div>
                          {row.status === 'amount-mismatch' && typeof row.diffUsd === 'number' && (
                            <span className="text-[10px] text-amber-700 font-semibold">
                              Diferencia USD: {formatCurrency(Math.abs(row.diffUsd))}
                            </span>
                          )}
                          {rightNote?.text && (
                            <span className="text-[10px] text-amber-700 truncate">
                              Nota: {rightNote.text}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">Falta registrar</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (requestStatus === 'accepted' || requestStatus === 'connected') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-xs font-black uppercase text-slate-500">Diferencias</h3>
          <p className="text-sm font-bold text-slate-800 mt-1">Delta de balance</p>
          <p className={`text-2xl font-black ${mismatch ? 'text-rose-600' : 'text-slate-900'}`}>
            {formatCurrency(balanceDelta)}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Solo en A: {differenceCounts.onlyLeft} | Solo en B: {differenceCounts.onlyRight}
          </p>
        </div>
      )}

      {noteMovementId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-600">Nota de auditoria</h3>
                <p className="text-xs text-slate-500 mt-1 truncate">{noteTitle}</p>
              </div>
              <button
                type="button"
                onClick={closeNoteEditor}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <textarea
              className="mt-4 w-full min-h-[120px] rounded-xl border border-slate-200 p-3 text-sm"
              placeholder="Escribe una observacion..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeNoteEditor}
                className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-black uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={noteSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase disabled:opacity-50"
              >
                Guardar nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BooksComparePanel;
