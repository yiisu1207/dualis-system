import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';
import {
  collection, onSnapshot, query, where, addDoc, doc, updateDoc,
  serverTimestamp, orderBy, limit, setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Monitor, Lock, Unlock, Plus, Store, Factory, Calculator, Receipt,
  Activity, X, ExternalLink, Loader2, Save, Download,
  Calendar, User, Eye, Copy, CheckCircle2, BarChart3,
  AlertTriangle, Share2, MessageCircle, Shield, History,
  TrendingUp, FileText, ChevronRight, Printer,
} from 'lucide-react';

import { useToast } from '../context/ToastContext';
import ArqueoModal from '../components/ArqueoModal';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Terminal {
  id: string;
  nombre: string;
  tipo: 'detal' | 'mayor';
  estado: 'abierta' | 'cerrada';
  totalFacturado: number;
  movimientos: number;
  cajeroNombre: string;
  apertura?: string;
  cierreAt?: string;
  sessionToken?: string;
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatOpenedAt(iso: string): string {
  const d = new Date(iso);
  const day = DAYS_ES[d.getDay()];
  const date = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${date} ${month} • ${h}:${m}`;
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  const day = DAYS_ES[d.getDay()];
  const date = d.getDate();
  const month = MONTHS_ES[d.getMonth()];
  const year = d.getFullYear();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day}, ${date} de ${month} ${year} — ${h}:${m}`;
}

function getSessionDuration(apertura: string): string {
  const diff = Date.now() - new Date(apertura).getTime();
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 1) return 'Recién abierta';
  if (totalMin < 60) return `${totalMin}m activo`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m activo`;
}

function formatAuditTimestamp(createdAt: any): { date: string; time: string; day: string; fullLabel: string } {
  let d: Date;
  if (createdAt?.toDate) {
    d = createdAt.toDate();
  } else if (typeof createdAt === 'string') {
    d = new Date(createdAt);
  } else {
    return { date: '—', time: '—', day: '—', fullLabel: '—' };
  }
  const day = DAYS_ES[d.getDay()];
  const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  const sec = d.getSeconds().toString().padStart(2, '0');
  const time = `${h}:${min}:${sec}`;
  return { date, time, day, fullLabel: `${day} ${date} — ${time}` };
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
const KPICard = ({ title, value, subtext, icon: Icon, bg, text }: any) => (
  <div className={`${bg} p-5 rounded-3xl flex flex-col justify-between gap-4 border border-white/50`}>
    <div className={`h-11 w-11 rounded-2xl ${text} bg-white/80 flex items-center justify-center shadow-sm`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">{title}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
      <p className="text-[10px] font-bold opacity-50 mt-1 uppercase tracking-widest">{subtext}</p>
    </div>
  </div>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AdminPosManager() {
  const { success, error, warning, info } = useToast();
  const { userProfile } = useAuth();
  const { rates } = useRates();
  const businessId = userProfile?.businessId;
  const isAdmin = userProfile?.role === 'owner' || userProfile?.role === 'admin';

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'detal' | 'mayor' | 'historial'>('detal');

  // New terminal modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTerminal, setNewTerminal] = useState({ nombre: '', tipo: 'detal' as 'detal' | 'mayor' });

  // Open shift modal
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [selectedForOpen, setSelectedForOpen] = useState<Terminal | null>(null);
  const [cashierName, setCashierName] = useState('');
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Saved cashier names
  const [savedCashiers, setSavedCashiers] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dualis_cashiers') || '[]'); } catch { return []; }
  });

  // Arqueo modal
  const [arqueoTerminal, setArqueoTerminal] = useState<Terminal | null>(null);
  const [arqueoMovements, setArqueoMovements] = useState<any[]>([]);

  // Audit panel
  const [selectedAudit, setSelectedAudit] = useState<Terminal | null>(null);
  const [auditMovements, setAuditMovements] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Shift history (arqueos)
  const [arqueoHistory, setArqueoHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedArqueo, setSelectedArqueo] = useState<any | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'detal' | 'mayor'>('all');

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ── Terminals real-time ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) {
      setTimeout(() => setLoading(false), 1500);
      return;
    }
    setLoading(true);
    const q = query(collection(db, `businesses/${businessId}/terminals`));
    const unsub = onSnapshot(q, snap => {
      setTerminals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Terminal)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [businessId]);

  // ── Arqueo history listener ───────────────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    setLoadingHistory(true);
    const q = query(
      collection(db, 'businesses', businessId, 'arqueos'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const unsub = onSnapshot(q, snap => {
      setArqueoHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingHistory(false);
    }, () => setLoadingHistory(false));
    return () => unsub();
  }, [businessId]);

  // ── Audit movements ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAudit || !businessId) return;
    setLoadingAudit(true);
    const q = query(
      collection(db, 'movements'),
      where('businessId', '==', businessId),
      where('cajaId', '==', selectedAudit.id),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setAuditMovements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingAudit(false);
    });
    return () => unsub();
  }, [selectedAudit, businessId]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalUSD = terminals.reduce((a, t) => a + (t.totalFacturado || 0), 0);
    const totalBS = totalUSD * (rates?.tasaBCV || 0);
    const activeCount = terminals.filter(t => t.estado === 'abierta').length;
    const totalMovs = terminals.reduce((a, t) => a + (t.movimientos || 0), 0);
    return { totalUSD, totalBS, activeCount, totalMovs };
  }, [terminals, rates]);

  const filteredTerminals = useMemo(
    () => terminals.filter(t => t.tipo === activeTab && activeTab !== 'historial'),
    [terminals, activeTab]
  );
  const filteredArqueos = useMemo(() =>
    historyFilter === 'all' ? arqueoHistory : arqueoHistory.filter(a => a.terminalType === historyFilter),
    [arqueoHistory, historyFilter]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !newTerminal.nombre) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, `businesses/${businessId}/terminals`), {
        ...newTerminal,
        estado: 'cerrada',
        totalFacturado: 0,
        movimientos: 0,
        cajeroNombre: 'Sin asignar',
        createdAt: serverTimestamp(),
      });
      setIsModalOpen(false);
      setNewTerminal({ nombre: '', tipo: 'detal' });
    } catch (err: any) {
      console.error('[AdminPosManager] Error creando terminal:', err);
      error(`Error al crear terminal: ${err?.message || String(err)}`);
    } finally { setIsSaving(false); }
  };

  const handleInitiateOpenShift = (terminal: Terminal) => {
    setSelectedForOpen(terminal);
    setCashierName('');
    setOpenShiftModal(true);
  };

  const handleConfirmOpenShift = async () => {
    if (!selectedForOpen || !cashierName.trim() || !businessId) return;
    setIsOpeningShift(true);
    try {
      // Generar token de sesión único para modo kiosco
      const token = crypto.randomUUID();
      const ref = doc(db, `businesses/${businessId}/terminals`, selectedForOpen.id);
      await updateDoc(ref, {
        estado: 'abierta',
        cajeroNombre: cashierName.trim(),
        apertura: new Date().toISOString(),
        totalFacturado: 0,
        movimientos: 0,
        cierreAt: null,
        sessionToken: token,
      });
      // Save cashier name for autocomplete
      const name = cashierName.trim();
      if (!savedCashiers.includes(name)) {
        const updated = [name, ...savedCashiers].slice(0, 20);
        setSavedCashiers(updated);
        localStorage.setItem('dualis_cashiers', JSON.stringify(updated));
      }
      // Register clean kiosk URL token (no businessId exposed)
      await setDoc(doc(db, 'terminalTokens', token), {
        businessId,
        cajaId: selectedForOpen.id,
        tipo: selectedForOpen.tipo,
        createdAt: serverTimestamp(),
      });
      setOpenShiftModal(false);
      const kioskUrl = `/caja/${token}`;
      const newTab = window.open(kioskUrl, '_blank');
      if (!newTab) {
        warning('El navegador bloqueó la pestaña. Permite popups para este sitio e intenta de nuevo.');
      }
    } catch (err: any) {
      console.error('[AdminPosManager] Error abriendo turno:', err);
      error(`Error al abrir turno: ${err?.message || String(err)}`);
    } finally { setIsOpeningShift(false); }
  };

  const handleEnterTerminal = (terminal: Terminal) => {
    const url = terminal.sessionToken ? `/caja/${terminal.sessionToken}` : `/${businessId}/pos/${terminal.tipo}?cajaId=${terminal.id}`;
    const newTab = window.open(url, '_blank');
    if (!newTab) warning('El navegador bloqueó la pestaña. Permite popups para este sitio.');
  };

  const handleInitiateCloseShift = async (terminal: Terminal) => {
    if (!businessId) return;
    // Load movements for this terminal's current shift
    try {
      const { getDocs: _getDocs, query: _query, collection: _col, where: _where } = await import('firebase/firestore');
      const q = _query(
        _col(db, 'movements'),
        _where('businessId', '==', businessId),
        _where('cajaId', '==', terminal.id)
      );
      const snap = await _getDocs(q);
      const movs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter to current shift if apertura is set
      const shiftMovs = terminal.apertura
        ? movs.filter((m: any) => {
            const ts = m.createdAt || m.date;
            return ts && ts >= terminal.apertura!;
          })
        : movs;
      setArqueoMovements(shiftMovs);
      setArqueoTerminal(terminal);
    } catch (err: any) {
      console.error('[AdminPosManager] Error cargando movimientos para arqueo:', err);
      error('No se pudo cargar los movimientos del turno');
    }
  };

  const handleArqueoDone = async () => {
    setArqueoTerminal(null);
    setArqueoMovements([]);
    success('Turno cerrado correctamente');
  };

  const getKioskUrl = (terminal: Terminal) => {
    if (terminal.sessionToken) return `${window.location.origin}/caja/${terminal.sessionToken}`;
    return `${window.location.origin}/${businessId}/pos/${terminal.tipo}?cajaId=${terminal.id}`;
  };

  const handleCopyUrl = (terminal: Terminal) => {
    navigator.clipboard.writeText(getKioskUrl(terminal)).then(() => {
      setCopied(terminal.id);
      setTimeout(() => setCopied(null), 2500);
    });
  };

  const handleShareWhatsApp = (terminal: Terminal) => {
    const url = getKioskUrl(terminal);
    const text = encodeURIComponent(`Enlace POS Kiosco - ${terminal.nombre}\n\nAbre este enlace en el dispositivo de la caja:\n${url}\n\nEste enlace es seguro y solo permite acceso al punto de venta.`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleExportExcel = async () => {
    if (!auditMovements.length || !selectedAudit) return;
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Auditoria');
    ws.columns = [
      { header: 'N°', key: 'num', width: 6 },
      { header: 'Día', key: 'day', width: 14 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Hora', key: 'time', width: 12 },
      { header: 'Cliente', key: 'entityId', width: 28 },
      { header: 'Cajero', key: 'cajero', width: 22 },
      { header: 'Método de Pago', key: 'metodoPago', width: 18 },
      { header: 'Monto (USD)', key: 'amountUsd', width: 14 },
      { header: 'Tasa BCV', key: 'rate', width: 12 },
      { header: 'Monto (BS)', key: 'amountBs', width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    auditMovements.forEach((m, i) => {
      const ts = formatAuditTimestamp(m.createdAt);
      const usd = Number(m.amountInUSD || m.amount || 0);
      ws.addRow({
        num: i + 1,
        day: ts.day,
        date: ts.date,
        time: ts.time,
        entityId: m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityId || '—'),
        cajero: m.vendedorNombre || '—',
        metodoPago: m.metodoPago || '—',
        amountUsd: usd.toFixed(2),
        rate: m.rateUsed || 0,
        amountBs: (usd * (m.rateUsed || 0)).toFixed(2),
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf]));
    a.download = `Auditoria_${selectedAudit.nombre}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
  };

  const auditTotalUsd = useMemo(
    () => auditMovements.reduce((a, m) => a + Number(m.amountInUSD || m.amount || 0), 0),
    [auditMovements]
  );

  const headerDate = `${DAYS_ES[now.getDay()]}, ${now.getDate()} de ${MONTHS_ES[now.getMonth()]} ${now.getFullYear()}`;
  const headerTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0a0f1e]">
        <Loader2 className="animate-spin text-slate-900 dark:text-white mb-4" size={36} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Cargando Cajas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0a0f1e] font-inter transition-colors">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-7">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Centro de Control</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Administrador de Cajas</h1>
            <p className="text-slate-400 dark:text-slate-500 text-sm font-semibold mt-2">
              <span className="text-slate-600 dark:text-slate-300 font-black">{headerTime}</span>
              {' — '}{headerDate}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="h-12 px-7 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg hover:bg-slate-700 dark:hover:bg-slate-100 transition-all active:scale-95 flex items-center gap-2.5 shrink-0"
            >
              <Plus size={17} />Nueva Terminal
            </button>
          )}
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Cajas Activas" value={stats.activeCount} subtext="Facturando ahora"
            icon={Monitor} bg="bg-indigo-600 text-white" text="text-indigo-600" />
          <KPICard title="Total USD" value={`$${stats.totalUSD.toFixed(2)}`} subtext="Turno actual"
            icon={Calculator} bg="bg-emerald-600 text-white" text="text-emerald-600" />
          <KPICard title="Total BS" value={`${stats.totalBS.toFixed(0)} Bs`} subtext={`Tasa ${(rates?.tasaBCV || 0).toFixed(2)}`}
            icon={Receipt} bg="bg-sky-600 text-white" text="text-sky-600" />
          <KPICard title="Transacciones" value={stats.totalMovs} subtext="Ventas del turno"
            icon={BarChart3} bg="bg-violet-600 text-white" text="text-violet-600" />
        </div>

        {/* ── TABS ───────────────────────────────────────────────────────── */}
        <div className="flex gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/[0.06] w-fit flex-wrap">
          {([
            { id: 'detal', label: 'Sucursal Detal', icon: Store },
            { id: 'mayor', label: 'Sucursal Mayor', icon: Factory },
            { id: 'historial', label: 'Historial', icon: History },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative ${
                activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
              }`}>
              <tab.icon size={13} />{tab.label}
              {tab.id === 'historial' && arqueoHistory.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-indigo-600 text-white">
                  {arqueoHistory.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── HISTORIAL DE TURNOS ──────────────────────────────────────── */}
        {activeTab === 'historial' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/[0.06] shadow-md overflow-hidden pb-6">
            {/* Sub-filters */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white">Historial de Turnos</h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Todos los cierres de caja registrados · últimos 60</p>
              </div>
              <div className="flex gap-1.5 p-1 bg-slate-50 dark:bg-white/[0.04] rounded-xl border border-slate-100 dark:border-white/[0.06]">
                {(['all','detal','mayor'] as const).map(f => (
                  <button key={f} onClick={() => setHistoryFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${historyFilter === f ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white'}`}>
                    {f === 'all' ? 'Todos' : f === 'detal' ? 'Detal' : 'Mayor'}
                  </button>
                ))}
              </div>
            </div>

            {loadingHistory ? (
              <div className="py-20 flex items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Cargando historial...</span>
              </div>
            ) : filteredArqueos.length === 0 ? (
              <div className="py-20 text-center">
                <History size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                <p className="text-sm font-black text-slate-400 dark:text-slate-600">Sin turnos cerrados todavía</p>
                <p className="text-xs text-slate-300 dark:text-slate-700 mt-1">Los cierres de caja aparecerán aquí</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-100 dark:border-white/[0.06]">
                    <tr>
                      <th className="px-6 py-3.5">Fecha Cierre</th>
                      <th className="px-6 py-3.5">Terminal</th>
                      <th className="px-6 py-3.5">Cajero</th>
                      <th className="px-6 py-3.5 text-right">Ventas</th>
                      <th className="px-6 py-3.5 text-center">Transac.</th>
                      <th className="px-6 py-3.5 text-right">Contado USD</th>
                      <th className="px-6 py-3.5 text-center">Diferencia</th>
                      <th className="px-6 py-3.5 text-right">Ver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {filteredArqueos.map(a => {
                      const fechaCierre = a.cierreAt ? new Date(a.cierreAt) : (a.createdAt?.toDate?.() ?? null);
                      const varOk = Math.abs(a.varianceUsd || 0) < 0.5;
                      return (
                        <tr key={a.id} onClick={() => setSelectedArqueo(a)}
                          className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group">
                          <td className="px-6 py-4">
                            <p className="text-xs font-black text-slate-900 dark:text-white">
                              {fechaCierre ? fechaCierre.toLocaleDateString('es-VE', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {fechaCierre ? fechaCierre.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' }) : ''}
                              {a.apertura ? ` · Apertura ${new Date(a.apertura).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}` : ''}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.terminalType === 'detal' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'}`}>
                                {a.terminalType === 'detal' ? <Store size={13} /> : <Factory size={13} />}
                              </div>
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300">{a.terminalName || '—'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 font-bold">{a.cajero || '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-sm font-black text-emerald-600">${(a.salesTotal || 0).toFixed(2)}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2.5 py-1 bg-slate-100 dark:bg-white/[0.06] rounded-lg text-xs font-black text-slate-700 dark:text-slate-300">{a.salesCount || 0}</span>
                          </td>
                          <td className="px-6 py-4 text-right text-xs font-black text-slate-700 dark:text-slate-300">
                            ${(a.totalCountedUsd || 0).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${varOk ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                              {(a.varianceUsd || 0) >= 0 ? '+' : ''}{(a.varianceUsd || 0).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ChevronRight size={16} className="ml-auto text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TERMINAL GRID ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-16">
          {filteredTerminals.map(t => {
            const isOpen = t.estado === 'abierta';
            return (
              <div key={t.id}
                className={`bg-white dark:bg-slate-900 rounded-[2rem] flex flex-col overflow-hidden shadow-md dark:shadow-black/20 transition-all duration-300 hover:shadow-xl dark:hover:shadow-black/30 border ${isOpen ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-slate-100 dark:border-white/[0.06]'}`}>

                {/* Color stripe */}
                <div className={`h-1.5 w-full ${isOpen ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-slate-200 dark:bg-white/10'}`} />

                {/* Card header */}
                <div className="p-6 pb-0">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${t.tipo === 'detal' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'}`}>
                        {t.tipo === 'detal' ? <Store size={22} /> : <Factory size={22} />}
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-none">{t.nombre}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                          Terminal {t.tipo === 'detal' ? 'Detal' : 'Mayor'}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${isOpen ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400 dark:text-slate-500'}`}>
                      {isOpen ? <Unlock size={9} /> : <Lock size={9} />}
                      {isOpen ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>
                </div>

                {/* Card body */}
                <div className="p-6 space-y-3 flex-1">
                  {/* Cajero */}
                  <div className="flex items-center justify-between py-2.5 px-4 bg-slate-50 dark:bg-white/[0.04] rounded-xl">
                    <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                      <User size={13} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Cajero</span>
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{t.cajeroNombre || 'Sin asignar'}</span>
                  </div>

                  {/* Apertura info */}
                  {isOpen && t.apertura && (
                    <div className="py-3 px-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-500/20 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Apertura de turno</span>
                      </div>
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200">{formatOpenedAt(t.apertura)}</p>
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{getSessionDuration(t.apertura)}</p>
                    </div>
                  )}

                  {/* Revenue stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-white/[0.04] rounded-xl">
                      <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Facturado (USD)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">${(t.totalFacturado || 0).toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-white/[0.04] rounded-xl">
                      <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Ventas</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{t.movimientos || 0}</p>
                    </div>
                  </div>

                  {/* Kiosk link + share */}
                  {isOpen && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                        <Shield size={10} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Enlace kiosco seguro</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleCopyUrl(t)}
                          className="flex-1 flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl text-[9px] font-bold text-slate-400 dark:text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all">
                          <span className="font-mono text-[8px] truncate flex-1 mr-2 text-left">
                            Copiar enlace kiosco
                          </span>
                          {copied === t.id
                            ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                            : <Copy size={12} className="shrink-0" />}
                        </button>
                        <button onClick={() => handleShareWhatsApp(t)}
                          className="h-[34px] w-[34px] rounded-xl flex items-center justify-center text-white shrink-0 hover:opacity-80 transition-all"
                          style={{ background: '#25d366' }}
                          title="Enviar enlace por WhatsApp">
                          <MessageCircle size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-2">
                  <button onClick={() => setSelectedAudit(t)}
                    className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-white/[0.07] text-slate-400 dark:text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shrink-0"
                    title="Ver Auditoría">
                    <Eye size={17} />
                  </button>

                  {isOpen && isAdmin && (
                    <button onClick={() => handleInitiateCloseShift(t)}
                      className="flex-1 h-11 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all border border-rose-100 dark:border-rose-500/20">
                      Cerrar Turno
                    </button>
                  )}

                  {!isOpen ? (
                    <button onClick={() => handleInitiateOpenShift(t)}
                      className="flex-[2] h-11 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white transition-all">
                      <Unlock size={13} />Abrir Turno
                    </button>
                  ) : (
                    <button onClick={() => handleEnterTerminal(t)}
                      className="flex-[2] h-11 rounded-xl bg-emerald-600 text-white font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all">
                      <ExternalLink size={13} />Entrar Terminal
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredTerminals.length === 0 && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center opacity-40 text-center">
              {activeTab === 'detal' ? <Store size={72} className="text-slate-200 dark:text-slate-700 mb-5" /> : <Factory size={72} className="text-slate-200 dark:text-slate-700 mb-5" />}
              <h3 className="text-xl font-black text-slate-700 dark:text-slate-400">Sin Cajas de {activeTab === 'detal' ? 'Detal' : 'Mayor'}</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">Crea una nueva terminal para empezar a facturar</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ OPEN SHIFT MODAL ═══════════════════════════════════════════════════ */}
      {openShiftModal && selectedForOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl dark:shadow-black/40 overflow-hidden animate-in zoom-in-95 duration-300 border border-transparent dark:border-white/[0.06]">
            <div className="p-7 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-3 mb-1">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${selectedForOpen.tipo === 'detal' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'}`}>
                  {selectedForOpen.tipo === 'detal' ? <Store size={19} /> : <Factory size={19} />}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white leading-none">Abrir Turno</h2>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">{selectedForOpen.nombre}</p>
                </div>
              </div>
            </div>

            <div className="p-7 space-y-5">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-500/20 flex gap-3">
                <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium leading-snug">
                  La terminal se abrirá en una nueva pestaña. El cajero puede acceder a la URL desde cualquier PC de tu red con una cuenta de ventas.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">
                  Nombre del Cajero *
                </label>
                <input
                  autoFocus
                  value={cashierName}
                  onChange={e => setCashierName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmOpenShift()}
                  placeholder="Ej. Maria Gonzalez"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/20 outline-none transition-all"
                />
                {savedCashiers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {savedCashiers.filter(n => !cashierName || n.toLowerCase().includes(cashierName.toLowerCase())).slice(0, 6).map(name => (
                      <button key={name} type="button" onClick={() => setCashierName(name)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                          cashierName === name
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setOpenShiftModal(false)}
                  className="flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-all">
                  Cancelar
                </button>
                <button
                  disabled={!cashierName.trim() || isOpeningShift}
                  onClick={handleConfirmOpenShift}
                  className="flex-[2] py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white transition-all disabled:opacity-40">
                  {isOpeningShift
                    ? <Loader2 size={16} className="animate-spin" />
                    : <><ExternalLink size={14} />Abrir en Nueva Pestaña</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CREATE TERMINAL MODAL ══════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl dark:shadow-black/40 overflow-hidden animate-in zoom-in-95 duration-300 border border-transparent dark:border-white/[0.06]">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/[0.06] flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Nueva Terminal</h2>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Punto de Venta</p>
              </div>
              <button onClick={() => setIsModalOpen(false)}
                className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-400 dark:text-slate-500 transition-all">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTerminal} className="p-4 sm:p-8 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">
                  Nombre Identificador
                </label>
                <input
                  required autoFocus
                  value={newTerminal.nombre}
                  onChange={e => setNewTerminal({ ...newTerminal, nombre: e.target.value })}
                  placeholder="Ej. Caja 1 — Planta Baja"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/20 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 block">Tipo</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['detal', 'mayor'] as const).map(tipo => (
                    <button key={tipo} type="button" onClick={() => setNewTerminal({ ...newTerminal, tipo })}
                      className={`py-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${newTerminal.tipo === tipo ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl' : 'border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-white/20'}`}>
                      {tipo === 'detal' ? <Store size={22} /> : <Factory size={22} />}
                      <span className="text-[9px] font-black uppercase tracking-widest">{tipo === 'detal' ? 'Detal' : 'Al Mayor'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 rounded-xl text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                  Cancelar
                </button>
                <button
                  disabled={isSaving || !newTerminal.nombre}
                  className="flex-[2] py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-600 dark:hover:bg-emerald-500 dark:hover:text-white transition-all disabled:opacity-50">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={15} />Crear Caja</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ ARQUEO MODAL ═══════════════════════════════════════════════════════ */}
      {arqueoTerminal && businessId && (
        <ArqueoModal
          terminal={arqueoTerminal}
          movements={arqueoMovements}
          businessId={businessId}
          currentUser={userProfile?.fullName || userProfile?.uid || 'Admin'}
          onClose={() => { setArqueoTerminal(null); setArqueoMovements([]); }}
          onDone={handleArqueoDone}
        />
      )}

      {/* ══ ARQUEO DETAIL MODAL ════════════════════════════════════════════════ */}
      {selectedArqueo && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSelectedArqueo(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.08] shadow-2xl shadow-black/40" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
                  <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="font-black text-slate-900 dark:text-white">Detalle del Turno</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{selectedArqueo.terminalName} · {selectedArqueo.cajero}</p>
                </div>
              </div>
              <button onClick={() => setSelectedArqueo(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                  <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Apertura</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white">{selectedArqueo.apertura ? new Date(selectedArqueo.apertura).toLocaleString('es-VE') : '—'}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                  <p className="text-[9px] font-black uppercase text-slate-400 dark:text-white/30 mb-1">Cierre</p>
                  <p className="text-xs font-black text-slate-900 dark:text-white">{selectedArqueo.cierreAt ? new Date(selectedArqueo.cierreAt).toLocaleString('es-VE') : '—'}</p>
                </div>
              </div>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.07] border border-emerald-100 dark:border-emerald-500/20 text-center">
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">${(selectedArqueo.salesTotal||0).toFixed(2)}</p>
                  <p className="text-[9px] font-black uppercase text-emerald-600/60 dark:text-emerald-400/50">Total ventas</p>
                </div>
                <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-500/[0.07] border border-sky-100 dark:border-sky-500/20 text-center">
                  <p className="text-lg font-black text-sky-600 dark:text-sky-400">{selectedArqueo.salesCount||0}</p>
                  <p className="text-[9px] font-black uppercase text-sky-600/60 dark:text-sky-400/50">Operaciones</p>
                </div>
                <div className={`p-3 rounded-xl border text-center ${Math.abs(selectedArqueo.varianceUsd||0) < 0.5 ? 'bg-emerald-50 dark:bg-emerald-500/[0.07] border-emerald-100 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/[0.07] border-rose-100 dark:border-rose-500/20'}`}>
                  <p className={`text-lg font-black ${Math.abs(selectedArqueo.varianceUsd||0) < 0.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {(selectedArqueo.varianceUsd||0) >= 0 ? '+' : ''}{(selectedArqueo.varianceUsd||0).toFixed(2)}
                  </p>
                  <p className="text-[9px] font-black uppercase text-slate-500 dark:text-white/30">Diferencia</p>
                </div>
              </div>
              {/* Payment breakdown */}
              {selectedArqueo.paymentBreakdown && Object.keys(selectedArqueo.paymentBreakdown).length > 0 && (
                <div className="rounded-xl border border-slate-100 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] overflow-hidden">
                  <p className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 border-b border-slate-100 dark:border-white/[0.06]">Por método de pago</p>
                  {Object.entries(selectedArqueo.paymentBreakdown).map(([m, v]) => (
                    <div key={m} className="flex justify-between items-center px-4 py-2 border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                      <span className="text-xs text-slate-600 dark:text-slate-400">{m}</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">${(v as number).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Cash counted */}
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                <span className="text-xs text-slate-500 dark:text-slate-400">Efectivo esperado</span>
                <span className="text-sm font-black text-slate-900 dark:text-white">${(selectedArqueo.expectedCashUsd||0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                <span className="text-xs text-slate-500 dark:text-slate-400">Efectivo contado USD</span>
                <span className="text-sm font-black text-slate-900 dark:text-white">${(selectedArqueo.totalCountedUsd||0).toFixed(2)}</span>
              </div>
              {selectedArqueo.totalCountedBs > 0 && (
                <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Efectivo contado Bs</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">Bs.{(selectedArqueo.totalCountedBs||0).toFixed(2)}</span>
                </div>
              )}
              {selectedArqueo.note && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-100 dark:border-amber-500/20">
                  <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 mb-1">Nota del cierre</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">{selectedArqueo.note}</p>
                </div>
              )}
              {/* Reprint Z */}
              <button
                onClick={() => {
                  // Reprint using stored data
                  const w = window.open('', '_blank', 'width=380,height=620,toolbar=0,menubar=0');
                  if (!w) return;
                  const methods = Object.entries(selectedArqueo.paymentBreakdown||{}).map(([m,v])=>`<tr><td>${m}</td><td align="right">$${(v as number).toFixed(2)}</td></tr>`).join('');
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Z Report</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:10px;width:80mm;padding:10px}h1{font-size:13px;font-weight:bold;text-align:center}h2{font-size:10px;text-align:center;margin:2px 0 6px}.sep{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:1px 0}table{width:100%;font-size:9px;margin:3px 0}td{padding:1px 2px}.big{font-size:12px;font-weight:bold}@media print{button{display:none}}</style></head><body><h1>REPORTE Z — ARQUEO DE CAJA</h1><h2>${selectedArqueo.terminalName}</h2><div class="sep"></div><div class="row"><span>Apertura:</span><span>${selectedArqueo.apertura?new Date(selectedArqueo.apertura).toLocaleString('es-VE'):'—'}</span></div><div class="row"><span>Cierre:</span><span>${selectedArqueo.cierreAt?new Date(selectedArqueo.cierreAt).toLocaleString('es-VE'):'—'}</span></div><div class="row"><span>Cajero:</span><span>${selectedArqueo.cajero||'—'}</span></div><div class="sep"></div><div class="row big"><span>TOTAL VENTAS</span><span>$${(selectedArqueo.salesTotal||0).toFixed(2)}</span></div><div class="row"><span>N° operaciones:</span><span>${selectedArqueo.salesCount||0}</span></div><div class="sep"></div><b>POR MÉTODO DE PAGO</b><table>${methods}</table><div class="sep"></div><div class="row"><span>Efectivo esperado:</span><span>$${(selectedArqueo.expectedCashUsd||0).toFixed(2)}</span></div><div class="row"><span>Efectivo contado:</span><span>$${(selectedArqueo.totalCountedUsd||0).toFixed(2)}</span></div><div class="row"><span>Diferencia:</span><span>${(selectedArqueo.varianceUsd||0)>=0?'+':''}${(selectedArqueo.varianceUsd||0).toFixed(2)}</span></div>${selectedArqueo.note?`<div class="sep"></div><div>Nota: ${selectedArqueo.note}</div>`:''}<div class="sep"></div><div style="text-align:center">Firma del cajero: ___________________</div><div style="margin-top:8px;text-align:center">Firma supervisor: ___________________</div><div style="margin-top:8px;text-align:center"><button onclick="window.print()">🖨 Imprimir</button></div></body></html>`);
                  w.document.close();
                  setTimeout(() => w.print(), 600);
                }}
                className="w-full py-3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-500/25">
                <Printer size={14} /> Reimprimir Reporte Z
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ AUDIT PANEL ════════════════════════════════════════════════════════ */}
      {selectedAudit && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-screen shadow-2xl dark:shadow-black/40 flex flex-col animate-in slide-in-from-right duration-400 border-l border-transparent dark:border-white/[0.06]">

            {/* Audit header */}
            <div className="p-6 border-b border-slate-100 dark:border-white/[0.06] shrink-0">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${selectedAudit.tipo === 'detal' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'}`}>
                    {selectedAudit.tipo === 'detal' ? <Store size={18} /> : <Factory size={18} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white leading-none">{selectedAudit.nombre}</h2>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                      {selectedAudit.apertura ? formatFullDateTime(selectedAudit.apertura) : 'Terminal cerrada'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedAudit(null)}
                  className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center justify-center text-slate-400 dark:text-slate-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Estado</p>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${selectedAudit.estado === 'abierta' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400'}`}>
                    {selectedAudit.estado}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Cajero</p>
                  <p className="text-xs font-black text-slate-700 dark:text-slate-300 truncate">{selectedAudit.cajeroNombre}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Total (USD)</p>
                  <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">${auditTotalUsd.toFixed(2)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase text-slate-300 dark:text-slate-600 mb-1">Transacciones</p>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-300">{auditMovements.length}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                  Historial de Ventas
                </p>
                <button onClick={handleExportExcel}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg hover:bg-emerald-600 hover:text-white transition-all">
                  <Download size={11} />Exportar Excel
                </button>
              </div>
            </div>

            {/* Movement list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scroll">
              {loadingAudit ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <Loader2 className="animate-spin mb-3" size={28} />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Consultando registros...</p>
                </div>
              ) : auditMovements.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                  <Activity size={56} className="mb-4 text-slate-300 dark:text-slate-700" />
                  <h3 className="text-lg font-black text-slate-600 dark:text-slate-400">Sin Movimientos</h3>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Esta terminal aún no ha procesado ventas.</p>
                </div>
              ) : auditMovements.map((m, idx) => {
                const ts = formatAuditTimestamp(m.createdAt);
                const amtUsd = Number(m.amountInUSD || m.amount || 0);
                return (
                  <div key={m.id} className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] shadow-sm hover:shadow-md dark:hover:shadow-black/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black text-xs shrink-0">
                          {(auditMovements.length - idx).toString().padStart(2, '0')}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">
                            {m.entityId === 'CONSUMIDOR_FINAL' ? 'Consumidor Final' : (m.entityId || 'Sin cliente')}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase">{ts.day}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{ts.date}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400">{ts.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-black text-slate-900 dark:text-white">${amtUsd.toFixed(2)}</p>
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
                          {(amtUsd * (m.rateUsed || 0)).toFixed(2)} Bs
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {m.vendedorNombre && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                          <User size={10} />{m.vendedorNombre}
                        </div>
                      )}
                      {m.metodoPago && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/[0.08] rounded-md text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase">
                          {m.metodoPago}
                        </span>
                      )}
                      {m.rateUsed && (
                        <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600">
                          Tasa: {Number(m.rateUsed).toFixed(2)} Bs/USD
                        </span>
                      )}
                    </div>

                    {m.items && m.items.length > 0 && (
                      <div className="pt-3 border-t border-slate-50 dark:border-white/[0.04] space-y-1">
                        {m.items.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-600 dark:text-slate-300">{item.qty}× {item.nombre}</span>
                            <span className="font-black text-slate-700 dark:text-slate-200">${Number(item.price || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
