import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRates } from '../context/RatesContext';
import {
  collection, onSnapshot, query, where, addDoc, doc, updateDoc,
  serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Monitor, Lock, Unlock, Plus, Store, Factory, Calculator, Receipt,
  Activity, X, ExternalLink, Loader2, Save, Download,
  Calendar, User, Eye, Copy, CheckCircle2, BarChart3,
  AlertTriangle,
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
  const [activeTab, setActiveTab] = useState<'detal' | 'mayor'>('detal');

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

  // Arqueo modal
  const [arqueoTerminal, setArqueoTerminal] = useState<Terminal | null>(null);
  const [arqueoMovements, setArqueoMovements] = useState<any[]>([]);

  // Audit panel
  const [selectedAudit, setSelectedAudit] = useState<Terminal | null>(null);
  const [auditMovements, setAuditMovements] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

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
    () => terminals.filter(t => t.tipo === activeTab),
    [terminals, activeTab]
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
      const ref = doc(db, `businesses/${businessId}/terminals`, selectedForOpen.id);
      await updateDoc(ref, {
        estado: 'abierta',
        cajeroNombre: cashierName.trim(),
        apertura: new Date().toISOString(),
        totalFacturado: 0,
        movimientos: 0,
        cierreAt: null,
      });
      setOpenShiftModal(false);
      const newTab = window.open(`/${businessId}/pos/${selectedForOpen.tipo}?cajaId=${selectedForOpen.id}`, '_blank');
      if (!newTab) {
        warning('El navegador bloqueó la pestaña. Permite popups para este sitio e intenta de nuevo.');
      }
    } catch (err: any) {
      console.error('[AdminPosManager] Error abriendo turno:', err);
      error(`Error al abrir turno: ${err?.message || String(err)}`);
    } finally { setIsOpeningShift(false); }
  };

  const handleEnterTerminal = (terminal: Terminal) => {
    const newTab = window.open(`/${businessId}/pos/${terminal.tipo}?cajaId=${terminal.id}`, '_blank');
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

  const handleCopyUrl = (terminal: Terminal) => {
    const url = `${window.location.origin}/${businessId}/pos/${terminal.tipo}?cajaId=${terminal.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(terminal.id);
      setTimeout(() => setCopied(null), 2500);
    });
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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0f1e] font-inter transition-colors">
      <div className="max-w-7xl mx-auto p-6 space-y-7">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Centro de Control</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Administrador de Cajas</h1>
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
        <div className="flex gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/[0.06] w-fit">
          {(['detal', 'mayor'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.05]'
              }`}>
              {tab === 'detal' ? <Store size={13} /> : <Factory size={13} />}
              {tab === 'detal' ? 'Sucursal Detal' : 'Sucursal Mayor'}
            </button>
          ))}
        </div>

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

                  {/* URL copy */}
                  {isOpen && (
                    <button onClick={() => handleCopyUrl(t)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-xl text-[9px] font-bold text-slate-400 dark:text-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all">
                      <span className="font-mono text-[8px] truncate flex-1 mr-2 text-left">
                        .../{t.tipo}?cajaId={t.id.slice(0, 10)}...
                      </span>
                      {copied === t.id
                        ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        : <Copy size={12} className="shrink-0" />}
                    </button>
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
                  placeholder="Ej. María González"
                  className="w-full px-4 py-3.5 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white/20 outline-none transition-all"
                />
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
            <form onSubmit={handleCreateTerminal} className="p-8 space-y-6">
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
