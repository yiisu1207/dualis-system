import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { auth, db } from '../firebase/config';
import { signInAnonymously, signOut } from 'firebase/auth';
import {
  collection, getDocs, doc, setDoc, deleteDoc, updateDoc,
  query, orderBy, limit, where, Timestamp, writeBatch,
} from 'firebase/firestore';
import {
  Shield, Loader2, KeyRound, Building2, Users, Activity,
  LogOut, RefreshCw, Eye, Globe, Clock, TrendingUp,
  AlertTriangle, CheckCircle2, XCircle, Search, ChevronDown,
  ChevronRight, DollarSign, CreditCard, FileText, BarChart3,
  UserCheck, UserX, UserPlus, Store, Package, Truck, Download,
  Filter, X, Bell, Zap, Timer, Hash, Mail, Phone, MapPin,
  Briefcase, CalendarDays, ArrowUpRight, ArrowDownRight,
  Wallet, Banknote, BadgeDollarSign, Receipt, ShieldAlert,
  Crown, Star, Sparkles, CircleDot, Pencil, Save, Trash2,
  ToggleLeft, ToggleRight, UserCog, Link2, Unlink,
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────── */
const PASSKEY_HASH = '7efb8beb719f9157670978288671d963fc4e8eb795ff7bef64ec270aca2e9664';
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min
const MOVEMENTS_LIMIT = 1000;
const AUDIT_LIMIT = 200;
const ROWS_PER_PAGE = 20;

type Tab = 'overview' | 'businesses' | 'users' | 'revenue' | 'activity';

async function hashPasskey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ── Interfaces ─────────────────────────────────────────────── */
interface BizInfo {
  id: string;
  name: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerId?: string;
  plan?: string;
  subStatus?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  createdAt?: string;
  slug?: string;
  addOns?: Record<string, any>;
  paymentMethod?: string;
  lastPaymentAt?: string;
  amountUsd?: number;
}

interface UserInfo {
  uid: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  businessId?: string;
  createdAt?: string;
  phone?: string;
  cedula?: string;
  lastLogin?: string;
}

interface MovementInfo {
  id: string;
  businessId: string;
  movementType: string;
  amount: number;
  amountInUSD: number;
  currency: string;
  metodoPago: string;
  pagado: boolean;
  estadoPago: string;
  anulada: boolean;
  esVentaContado: boolean;
  date: string;
  createdAt: string;
  entityId: string;
  concept: string;
  vendedorNombre?: string;
  cajaId?: string;
  items?: any[];
  ivaAmount?: number;
  igtfAmount?: number;
  rateUsed?: number;
  nroControl?: string;
  pagos?: Record<string, number>;
}

interface AuditInfo {
  id: string;
  userId?: string;
  user?: string;
  action: string;
  module?: string;
  detail?: string;
  meta?: Record<string, any>;
  businessId: string;
  createdAt: string;
}

interface CustomerInfo {
  id: string;
  businessId: string;
  fullName?: string;
  nombre?: string;
  email?: string;
  telefono?: string;
}

interface SupplierInfo {
  id: string;
  businessId: string;
  nombre?: string;
  rif?: string;
  contacto?: string;
}

/* ── Helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('es-VE');
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('es-VE'); } catch { return '—'; }
};
const fmtDateTime = (d: string) => {
  try { return new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
};
const daysBetween = (a: string, b: Date) => {
  try { return Math.ceil((new Date(a).getTime() - b.getTime()) / (1000 * 60 * 60 * 24)); } catch { return 0; }
};
const pct = (v: number, t: number) => t > 0 ? Math.round((v / t) * 100) : 0;

/* ══════════════════════════════════════════════════════════════ */
/*                       MAIN COMPONENT                         */
/* ══════════════════════════════════════════════════════════════ */
export default function OpsMonitor() {
  const [phase, setPhase] = useState<'passkey' | 'loading' | 'dashboard'>('passkey');
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // Data stores
  const [businesses, setBusinesses] = useState<BizInfo[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [tenants, setTenants] = useState<Record<string, string>>({});
  const [movements, setMovements] = useState<MovementInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditInfo[]>([]);
  const [customers, setCustomers] = useState<CustomerInfo[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);

  // UI state
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionStart] = useState(new Date());
  const [sessionTimer, setSessionTimer] = useState('00:00');
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session timer
  useEffect(() => {
    if (phase !== 'dashboard') return;
    const tick = setInterval(() => {
      const diff = Date.now() - sessionStart.getTime();
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setSessionTimer(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(tick);
  }, [phase, sessionStart]);

  // Auto-refresh
  useEffect(() => {
    if (phase !== 'dashboard') return;
    autoRefreshRef.current = setInterval(() => { fetchAllData(); }, AUTO_REFRESH_MS);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [phase]);

  /* ── Passkey unlock ───────────────────────────────────────── */
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim()) return;
    setChecking(true);
    setError('');
    try {
      const hash = await hashPasskey(passkey.trim());
      if (hash !== PASSKEY_HASH) { setError('Passkey incorrecto'); setChecking(false); return; }
      const cred = await signInAnonymously(auth);
      await setDoc(doc(db, 'opsTokens', cred.user.uid), {
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        type: 'ops_monitor',
      });
      setPhase('loading');
      await fetchAllData();
      setPhase('dashboard');
    } catch (err: any) {
      console.error('[OpsMonitor] unlock failed:', err);
      setError(err.message || 'Error de conexión');
    } finally { setChecking(false); }
  };

  /* ── Fetch ALL data ───────────────────────────────────────── */
  const fetchAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [bizSnap, usersSnap, tenantSnap, movSnap, auditSnap, custSnap, suppSnap] = await Promise.all([
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'tenants')),
        getDocs(query(collection(db, 'movements'), orderBy('createdAt', 'desc'), limit(MOVEMENTS_LIMIT))),
        getDocs(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(AUDIT_LIMIT))),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'suppliers')),
      ]);

      setBusinesses(bizSnap.docs.map(d => {
        const x = d.data();
        const sub = x.subscription || {};
        return {
          id: d.id, name: x.name || d.id, ownerEmail: x.ownerEmail, ownerName: x.ownerName, ownerId: x.ownerId,
          plan: sub.plan || x.plan || 'free_tier', subStatus: sub.status || 'unknown',
          trialEndsAt: sub.trialEndsAt?.toDate?.()?.toISOString?.() || sub.trialEndsAt || '',
          currentPeriodEnd: sub.currentPeriodEnd?.toDate?.()?.toISOString?.() || sub.currentPeriodEnd || '',
          createdAt: x.createdAt, addOns: sub.addOns, paymentMethod: sub.paymentMethod,
          lastPaymentAt: sub.lastPaymentAt, amountUsd: sub.amountUsd,
        };
      }));

      setUsers(usersSnap.docs.map(d => {
        const x = d.data();
        return {
          uid: d.id, email: x.email || '', fullName: x.fullName || x.displayName || '',
          role: x.role || 'pending', status: x.status || 'ACTIVE',
          businessId: x.businessId || x.empresa_id || '', createdAt: x.createdAt,
          phone: x.phone || x.telefono || '', cedula: x.cedula || '', lastLogin: x.lastLogin || '',
        };
      }));

      const slugMap: Record<string, string> = {};
      tenantSnap.docs.forEach(d => { const x = d.data(); if (x.businessId) slugMap[x.businessId] = d.id; });
      setTenants(slugMap);

      setMovements(movSnap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, businessId: x.businessId || x.empresa_id || '', movementType: x.movementType || '',
          amount: x.amount || 0, amountInUSD: x.amountInUSD || x.amount || 0, currency: x.currency || 'USD',
          metodoPago: x.metodoPago || '', pagado: !!x.pagado, estadoPago: x.estadoPago || '',
          anulada: !!x.anulada, esVentaContado: !!x.esVentaContado, date: x.date || '',
          createdAt: x.createdAt || '', entityId: x.entityId || '', concept: x.concept || '',
          vendedorNombre: x.vendedorNombre, cajaId: x.cajaId, items: x.items,
          ivaAmount: x.ivaAmount, igtfAmount: x.igtfAmount, rateUsed: x.rateUsed,
          nroControl: x.nroControl, pagos: x.pagos,
        };
      }));

      setAuditLogs(auditSnap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, userId: x.userId, user: x.user, action: x.action || '', module: x.module,
          detail: typeof x.detail === 'string' ? x.detail : JSON.stringify(x.detail || x.meta || {}),
          meta: x.meta, businessId: x.businessId || x.empresa_id || '', createdAt: x.createdAt || '',
        };
      }));

      setCustomers(custSnap.docs.map(d => {
        const x = d.data();
        return { id: d.id, businessId: x.businessId || x.empresa_id || '', fullName: x.fullName, nombre: x.nombre, email: x.email, telefono: x.telefono };
      }));

      setSuppliers(suppSnap.docs.map(d => {
        const x = d.data();
        return { id: d.id, businessId: x.businessId || x.empresa_id || '', nombre: x.nombre, rif: x.rif, contacto: x.contacto };
      }));

      setLastRefresh(new Date());
    } catch (err) {
      console.error('[OpsMonitor] fetch failed:', err);
    } finally { setRefreshing(false); }
  }, []);

  /* ── Logout ───────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await deleteDoc(doc(db, 'opsTokens', uid));
      await signOut(auth);
    } catch {}
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    setPhase('passkey');
    setPasskey('');
  };

  /* ── CSV Export ─────────────────────────────────────────── */
  const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  /* ══════════════════════════════════════════════════════════ */
  /*                   COMPUTED STATS                          */
  /* ══════════════════════════════════════════════════════════ */
  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Users
    const activeUsers = users.filter(u => u.status === 'ACTIVE').length;
    const pendingUsers = users.filter(u => u.status === 'PENDING_APPROVAL' || u.status === 'PENDING_SETUP').length;
    const disabledUsers = users.filter(u => u.status === 'DISABLED').length;
    const recentUsers7d = users.filter(u => u.createdAt && u.createdAt > weekAgo).length;
    const recentUsers30d = users.filter(u => u.createdAt && u.createdAt > monthAgo).length;

    // Businesses
    const recentBiz7d = businesses.filter(b => b.createdAt && b.createdAt > weekAgo).length;
    const withSlug = Object.keys(tenants).length;

    // Users per business
    const bizUserCount: Record<string, number> = {};
    users.forEach(u => { if (u.businessId) bizUserCount[u.businessId] = (bizUserCount[u.businessId] || 0) + 1; });

    // Customers & suppliers per business
    const bizCustCount: Record<string, number> = {};
    customers.forEach(c => { if (c.businessId) bizCustCount[c.businessId] = (bizCustCount[c.businessId] || 0) + 1; });
    const bizSuppCount: Record<string, number> = {};
    suppliers.forEach(s => { if (s.businessId) bizSuppCount[s.businessId] = (bizSuppCount[s.businessId] || 0) + 1; });

    // Plans
    const planCounts: Record<string, number> = {};
    businesses.forEach(b => { const p = (b.plan || 'free_tier').toLowerCase(); planCounts[p] = (planCounts[p] || 0) + 1; });

    // Subscription status
    const subStatusCounts: Record<string, number> = {};
    businesses.forEach(b => { const s = b.subStatus || 'unknown'; subStatusCounts[s] = (subStatusCounts[s] || 0) + 1; });

    // Trials expiring soon (next 7 days)
    const trialsExpiring = businesses.filter(b =>
      b.subStatus === 'trial' && b.trialEndsAt && daysBetween(b.trialEndsAt, now) <= 7 && daysBetween(b.trialEndsAt, now) >= 0
    );

    // Movements — filter valid (not anulada)
    const validMov = movements.filter(m => !m.anulada);
    const facturas = validMov.filter(m => m.movementType === 'FACTURA');
    const abonos = validMov.filter(m => m.movementType === 'ABONO');

    // Today
    const facturasToday = facturas.filter(m => m.date === today);
    const revenueToday = facturasToday.reduce((s, m) => s + m.amountInUSD, 0);
    const abonosToday = abonos.filter(m => m.date === today);
    const cobradoToday = abonosToday.reduce((s, m) => s + m.amountInUSD, 0);

    // Last 7 days
    const facturas7d = facturas.filter(m => m.createdAt > weekAgo);
    const revenue7d = facturas7d.reduce((s, m) => s + m.amountInUSD, 0);

    // Last 30 days
    const facturas30d = facturas.filter(m => m.createdAt > monthAgo);
    const revenue30d = facturas30d.reduce((s, m) => s + m.amountInUSD, 0);

    // Revenue per business
    const bizRevenue: Record<string, number> = {};
    facturas.forEach(m => { bizRevenue[m.businessId] = (bizRevenue[m.businessId] || 0) + m.amountInUSD; });

    // Payment methods
    const payMethods: Record<string, number> = {};
    facturas.forEach(m => {
      if (m.pagos && typeof m.pagos === 'object') {
        Object.entries(m.pagos).forEach(([k, v]) => { payMethods[k] = (payMethods[k] || 0) + (v as number); });
      } else {
        const k = m.metodoPago || 'Otro';
        payMethods[k] = (payMethods[k] || 0) + m.amountInUSD;
      }
    });

    // IVA / IGTF totals
    const totalIVA = facturas.reduce((s, m) => s + (m.ivaAmount || 0), 0);
    const totalIGTF = facturas.reduce((s, m) => s + (m.igtfAmount || 0), 0);

    // Avg ticket
    const avgTicket = facturas.length > 0 ? facturas.reduce((s, m) => s + m.amountInUSD, 0) / facturas.length : 0;

    // CxC (pending receivables)
    const cxc = validMov.filter(m => m.movementType === 'FACTURA' && !m.pagado && m.entityId !== 'CONSUMIDOR_FINAL');
    const totalCxC = cxc.reduce((s, m) => s + m.amountInUSD, 0);

    // Roles
    const roleCounts: Record<string, number> = {};
    users.forEach(u => { const r = u.role || 'pending'; roleCounts[r] = (roleCounts[r] || 0) + 1; });

    // Revenue by day (last 7 days) for sparkline
    const dailyRevenue: { day: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dayTotal = facturas.filter(m => m.date === d).reduce((s, m) => s + m.amountInUSD, 0);
      dailyRevenue.push({ day: d, total: dayTotal });
    }

    // Movements per business
    const bizMovCount: Record<string, number> = {};
    facturas.forEach(m => { bizMovCount[m.businessId] = (bizMovCount[m.businessId] || 0) + 1; });

    // Alerts
    const alerts: { type: 'warn' | 'danger' | 'info'; msg: string }[] = [];
    if (pendingUsers > 0) alerts.push({ type: 'warn', msg: `${pendingUsers} usuario(s) pendientes de aprobación` });
    if (trialsExpiring.length > 0) alerts.push({ type: 'warn', msg: `${trialsExpiring.length} trial(s) expiran en los próximos 7 días` });
    if (disabledUsers > 0) alerts.push({ type: 'info', msg: `${disabledUsers} usuario(s) deshabilitados` });
    const orphanBiz = businesses.filter(b => !bizUserCount[b.id] || bizUserCount[b.id] === 0);
    if (orphanBiz.length > 0) alerts.push({ type: 'danger', msg: `${orphanBiz.length} negocio(s) sin usuarios activos` });

    // MRR estimate
    const paidBiz = businesses.filter(b => b.amountUsd && b.amountUsd > 0);
    const mrr = paidBiz.reduce((s, b) => s + (b.amountUsd || 0), 0);

    return {
      activeUsers, pendingUsers, disabledUsers, recentUsers7d, recentUsers30d,
      recentBiz7d, withSlug, bizUserCount, bizCustCount, bizSuppCount,
      planCounts, subStatusCounts, trialsExpiring,
      revenueToday, cobradoToday, revenue7d, revenue30d,
      facturasToday: facturasToday.length, facturas7d: facturas7d.length, facturas30d: facturas30d.length,
      bizRevenue, payMethods, totalIVA, totalIGTF, avgTicket, totalCxC, cxcCount: cxc.length,
      roleCounts, dailyRevenue, bizMovCount, alerts, mrr, orphanBiz,
      totalMovements: movements.length, totalFacturas: facturas.length, totalAbonos: abonos.length,
    };
  }, [businesses, users, tenants, movements, customers, suppliers]);

  /* ══════════════════════════════════════════════════════════ */
  /*                    PASSKEY SCREEN                         */
  /* ══════════════════════════════════════════════════════════ */
  if (phase === 'passkey') {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-indigo-400" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">Dualis Ops</h1>
            <p className="text-xs text-white/30 mt-1">Panel de monitoreo — acceso restringido</p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <KeyRound size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
              <input type="password" autoFocus placeholder="Passkey" value={passkey}
                onChange={e => setPasskey(e.target.value)}
                className="w-full pl-10 pr-4 py-3.5 bg-white/[0.06] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm" />
            </div>
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <AlertTriangle size={12} className="text-rose-400 shrink-0" />
                <p className="text-[10px] text-rose-400 font-bold">{error}</p>
              </div>
            )}
            <button type="submit" disabled={checking || !passkey.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 hover:from-indigo-500 hover:to-violet-500 transition-all">
              {checking ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {checking ? 'Verificando...' : 'Acceder'}
            </button>
          </form>
          <p className="text-center text-[8px] text-white/10 mt-8 font-mono uppercase tracking-widest">Dualis Ops Monitor · Read-Only</p>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#060b14] flex flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-400 mb-4" />
        <p className="text-white/30 text-sm">Cargando datos del sistema...</p>
        <p className="text-white/15 text-[10px] mt-2">Negocios · Usuarios · Movimientos · Auditoría</p>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════ */
  /*                     DASHBOARD                             */
  /* ══════════════════════════════════════════════════════════ */
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Resumen', icon: BarChart3 },
    { id: 'businesses', label: 'Negocios', icon: Building2 },
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'revenue', label: 'Ingresos', icon: DollarSign },
    { id: 'activity', label: 'Actividad', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-[#060b14]/90 backdrop-blur-lg border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          {/* Header row */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                <Activity size={16} className="text-indigo-400" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight">Dualis Ops</h1>
                <div className="flex items-center gap-2 text-[9px] text-white/20 font-mono">
                  <span className="flex items-center gap-1"><Timer size={8} />{sessionTimer}</span>
                  <span>·</span>
                  <span>{lastRefresh ? `${lastRefresh.toLocaleTimeString('es-VE')}` : '—'}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <CircleDot size={7} className="text-emerald-400" /> Live
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchAllData()} disabled={refreshing}
                className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-all disabled:opacity-40" title="Refrescar">
                <RefreshCw size={14} className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={handleLogout}
                className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all" title="Cerrar sesión">
                <LogOut size={14} className="text-rose-400" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-white/25 hover:text-white/40'
                }`}>
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {tab === 'overview' && <OverviewTab stats={stats} businesses={businesses} users={users} tenants={tenants} />}
        {tab === 'businesses' && <BusinessesTab businesses={businesses} stats={stats} tenants={tenants} users={users} exportCSV={exportCSV} onRefresh={fetchAllData} />}
        {tab === 'users' && <UsersTab users={users} businesses={businesses} stats={stats} exportCSV={exportCSV} onRefresh={fetchAllData} />}
        {tab === 'revenue' && <RevenueTab stats={stats} movements={movements} businesses={businesses} exportCSV={exportCSV} />}
        {tab === 'activity' && <ActivityTab auditLogs={auditLogs} users={users} businesses={businesses} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                     OVERVIEW TAB                              */
/* ══════════════════════════════════════════════════════════════ */
function OverviewTab({ stats, businesses, users, tenants }: any) {
  return (
    <div className="space-y-6">
      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((a: any, i: number) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              a.type === 'danger' ? 'bg-rose-500/[0.06] border-rose-500/20' :
              a.type === 'warn' ? 'bg-amber-500/[0.06] border-amber-500/20' :
              'bg-sky-500/[0.06] border-sky-500/20'
            }`}>
              {a.type === 'danger' ? <XCircle size={14} className="text-rose-400 shrink-0" /> :
               a.type === 'warn' ? <AlertTriangle size={14} className="text-amber-400 shrink-0" /> :
               <Bell size={14} className="text-sky-400 shrink-0" />}
              <p className="text-xs text-white/70">{a.msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Building2} label="Negocios" value={businesses.length} color="indigo" sub={`+${stats.recentBiz7d} esta semana`} />
        <KpiCard icon={Users} label="Usuarios" value={users.length} color="emerald" sub={`${stats.activeUsers} activos`} />
        <KpiCard icon={Globe} label="Subdominios" value={stats.withSlug} color="sky" sub={`${businesses.length - stats.withSlug} sin slug`} />
        <KpiCard icon={TrendingUp} label="Nuevos (7d)" value={stats.recentUsers7d} color="violet" sub={`${stats.recentUsers30d} en 30d`} />
      </div>

      {/* Revenue quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="Hoy" value={`$${fmt(stats.revenueToday)}`} color="emerald" sub={`${stats.facturasToday} facturas`} isString />
        <KpiCard icon={Wallet} label="Semana" value={`$${fmt(stats.revenue7d)}`} color="sky" sub={`${stats.facturas7d} facturas`} isString />
        <KpiCard icon={Banknote} label="Mes (30d)" value={`$${fmt(stats.revenue30d)}`} color="indigo" sub={`${stats.facturas30d} facturas`} isString />
        <KpiCard icon={BadgeDollarSign} label="CxC Pendiente" value={`$${fmt(stats.totalCxC)}`} color="amber" sub={`${stats.cxcCount} facturas`} isString />
      </div>

      {/* User status + Roles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Status breakdown */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Estado de Usuarios</h3>
          <StatusBar label="Activos" value={stats.activeUsers} total={users.length} color="emerald" />
          <StatusBar label="Pendientes" value={stats.pendingUsers} total={users.length} color="amber" />
          <StatusBar label="Deshabilitados" value={stats.disabledUsers} total={users.length} color="rose" />
        </div>

        {/* Role distribution */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Roles</h3>
          {Object.entries(stats.roleCounts).sort((a: any, b: any) => b[1] - a[1]).map(([role, count]: any) => (
            <StatusBar key={role} label={role} value={count} total={users.length} color={
              role === 'owner' ? 'violet' : role === 'admin' ? 'indigo' : role === 'ventas' ? 'sky' : 'slate'
            } />
          ))}
        </div>
      </div>

      {/* Plans + Sub Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Planes</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.planCounts).sort((a: any, b: any) => b[1] - a[1]).map(([plan, count]: any) => (
              <PlanBadge key={plan} plan={plan} count={count} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Estado Suscripción</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.subStatusCounts).sort((a: any, b: any) => b[1] - a[1]).map(([status, count]: any) => (
              <div key={status} className={`px-3 py-2 rounded-xl border ${
                status === 'active' ? 'bg-emerald-500/[0.06] border-emerald-500/20' :
                status === 'trial' ? 'bg-violet-500/[0.06] border-violet-500/20' :
                status === 'expired' ? 'bg-rose-500/[0.06] border-rose-500/20' :
                'bg-white/[0.04] border-white/[0.07]'
              }`}>
                <p className="text-[10px] font-bold text-white/30 uppercase">{status}</p>
                <p className="text-lg font-black text-white">{count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mini sparkline (daily revenue) */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Ventas últimos 7 días (USD)</h3>
        <div className="flex items-end gap-1 h-24">
          {stats.dailyRevenue.map((d: any, i: number) => {
            const max = Math.max(...stats.dailyRevenue.map((x: any) => x.total), 1);
            const h = Math.max((d.total / max) * 100, 2);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[8px] text-white/20 font-mono">${fmt(d.total)}</span>
                <div className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-violet-500 transition-all"
                  style={{ height: `${h}%` }} />
                <span className="text-[8px] text-white/15 font-mono">{d.day.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trials expiring */}
      {stats.trialsExpiring.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400/60 mb-3 flex items-center gap-2">
            <AlertTriangle size={12} /> Trials por expirar
          </h3>
          <div className="space-y-2">
            {stats.trialsExpiring.map((b: BizInfo) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-amber-500/10 last:border-0">
                <div>
                  <p className="text-sm font-bold text-white">{b.name}</p>
                  <p className="text-[9px] text-white/30">{b.ownerEmail}</p>
                </div>
                <span className="text-[10px] font-bold text-amber-400">
                  {daysBetween(b.trialEndsAt || '', new Date())}d restantes
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                    BUSINESSES TAB                             */
/* ══════════════════════════════════════════════════════════════ */
function BusinessesTab({ businesses, stats, tenants, users, exportCSV, onRefresh }: any) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'users' | 'revenue' | 'created'>('created');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [planFilter, setPlanFilter] = useState('all');
  const [editingBiz, setEditingBiz] = useState<BizInfo | null>(null);
  const [deletingBiz, setDeletingBiz] = useState<BizInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const deleteBusinessFull = async (biz: BizInfo): Promise<string> => {
    const bid = biz.id;
    const slug = tenants[bid] || '';

    // Helper: batch delete all docs in a subcollection
    const batchDeleteSub = async (subPath: string) => {
      const snap = await getDocs(collection(db, 'businesses', bid, subPath));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    };

    // Helper: batch delete root collection docs matching businessId
    const batchDeleteRoot = async (colName: string) => {
      let done = false;
      while (!done) {
        const snap = await getDocs(query(collection(db, colName), where('businessId', '==', bid), limit(400)));
        if (snap.empty) { done = true; break; }
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        if (snap.docs.length < 400) done = true;
      }
    };

    // 1. Delete subcollections
    const subs = ['products', 'terminals', 'employees', 'members', 'payroll_runs', 'loans',
      'payroll_advances', 'vouchers', 'time_entries', 'portalAccess', 'portalPayments',
      'paymentRequests', 'voucher_rates', 'voucher_compare_comments', 'conversations'];
    for (const sub of subs) { try { await batchDeleteSub(sub); } catch {} }

    // 2. businessConfigs
    try { await deleteDoc(doc(db, 'businessConfigs', bid)); } catch {}

    // 3. tenants slug
    if (slug) { try { await deleteDoc(doc(db, 'tenants', slug)); } catch {} }

    // 4. Root collections
    for (const col of ['customers', 'suppliers', 'movements', 'auditLogs']) {
      try { await batchDeleteRoot(col); } catch {}
    }

    // 5. Disable all users of this business (don't delete — they may have email history)
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), where('businessId', '==', bid)));
      if (!usersSnap.empty) {
        const batch = writeBatch(db);
        usersSnap.docs.forEach(d => batch.update(d.ref, { status: 'DISABLED' }));
        await batch.commit();
      }
    } catch {}

    // 6. Delete business doc itself
    await deleteDoc(doc(db, 'businesses', bid));

    return `Empresa "${biz.name}" eliminada completamente`;
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const filtered = useMemo(() => {
    let list = [...businesses];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((b: BizInfo) =>
        b.name.toLowerCase().includes(s) || b.ownerEmail?.toLowerCase().includes(s) || b.id.toLowerCase().includes(s)
      );
    }
    if (planFilter !== 'all') list = list.filter((b: BizInfo) => (b.plan || 'free_tier').toLowerCase() === planFilter);

    list.sort((a: BizInfo, b: BizInfo) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'users') return (stats.bizUserCount[b.id] || 0) - (stats.bizUserCount[a.id] || 0);
      if (sortBy === 'revenue') return (stats.bizRevenue[b.id] || 0) - (stats.bizRevenue[a.id] || 0);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return list;
  }, [businesses, search, sortBy, planFilter, stats]);

  const handleExport = () => {
    exportCSV('negocios_ops.csv',
      ['Nombre', 'Email Owner', 'Plan', 'Sub Status', 'Slug', 'Usuarios', 'Clientes', 'Movimientos', 'Revenue USD', 'Creado'],
      filtered.map((b: BizInfo) => [
        b.name, b.ownerEmail || '', b.plan || '', b.subStatus || '',
        tenants[b.id] || '', String(stats.bizUserCount[b.id] || 0),
        String(stats.bizCustCount[b.id] || 0), String(stats.bizMovCount[b.id] || 0),
        fmt(stats.bizRevenue[b.id] || 0), b.createdAt ? fmtDate(b.createdAt) : '',
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar negocio, email, ID..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-sm text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
        </div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-xs text-white rounded-xl focus:outline-none">
          <option value="all">Todos los planes</option>
          {Object.keys(stats.planCounts).map((p: string) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-xs text-white rounded-xl focus:outline-none">
          <option value="created">Más recientes</option>
          <option value="name">Nombre</option>
          <option value="users">Más usuarios</option>
          <option value="revenue">Mayor revenue</option>
        </select>
        <button onClick={handleExport} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-all" title="Exportar CSV">
          <Download size={14} className="text-white/40" />
        </button>
      </div>

      <p className="text-[10px] text-white/20 font-mono">{filtered.length} negocios</p>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/[0.06] bg-white/[0.01]">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3 text-right">Usuarios</th>
                <th className="px-4 py-3 text-right">Clientes</th>
                <th className="px-4 py-3 text-right">Facturas</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {filtered.map((biz: BizInfo) => {
                const expanded = expandedId === biz.id;
                const bizUsers = users.filter((u: UserInfo) => u.businessId === biz.id);
                return (
                  <React.Fragment key={biz.id}>
                    <tr className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setExpandedId(expanded ? null : biz.id)}>
                      <td className="px-4 py-3">
                        {expanded ? <ChevronDown size={12} className="text-white/30" /> : <ChevronRight size={12} className="text-white/15" />}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-white truncate max-w-[250px]">{biz.name}</p>
                        <p className="text-[9px] text-white/20 font-mono truncate">{biz.ownerEmail || biz.id.slice(0, 24)}</p>
                      </td>
                      <td className="px-4 py-3"><PlanBadgeSmall plan={biz.plan || 'free_tier'} /></td>
                      <td className="px-4 py-3"><SubStatusBadge status={biz.subStatus || 'unknown'} /></td>
                      <td className="px-4 py-3">
                        {tenants[biz.id] ? <span className="text-[10px] font-mono text-sky-400">{tenants[biz.id]}</span> : <span className="text-[10px] text-white/15">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white/60">{stats.bizUserCount[biz.id] || 0}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white/60">{stats.bizCustCount[biz.id] || 0}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white/60">{stats.bizMovCount[biz.id] || 0}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-emerald-400/80">${fmt(stats.bizRevenue[biz.id] || 0)}</td>
                      <td className="px-4 py-3 text-right text-[10px] text-white/25 font-mono">{biz.createdAt ? fmtDate(biz.createdAt) : '—'}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} className="px-6 py-4 bg-white/[0.01]">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Subscription details */}
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Suscripción</h4>
                              <InfoRow label="Plan" value={biz.plan || 'free_tier'} />
                              <InfoRow label="Estado" value={biz.subStatus || 'unknown'} />
                              <InfoRow label="Trial expira" value={biz.trialEndsAt ? fmtDate(biz.trialEndsAt) : '—'} />
                              <InfoRow label="Período fin" value={biz.currentPeriodEnd ? fmtDate(biz.currentPeriodEnd) : '—'} />
                              <InfoRow label="Método pago" value={biz.paymentMethod || '—'} />
                              <InfoRow label="Último pago" value={biz.lastPaymentAt ? fmtDate(biz.lastPaymentAt) : '—'} />
                              <InfoRow label="Monto USD" value={biz.amountUsd ? `$${fmt(biz.amountUsd)}` : '—'} />
                            </div>
                            {/* Add-ons */}
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Add-ons</h4>
                              {biz.addOns ? Object.entries(biz.addOns).map(([k, v]: any) => (
                                <InfoRow key={k} label={k} value={typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)} />
                              )) : <p className="text-[10px] text-white/15">Ninguno</p>}
                            </div>
                            {/* Users in this business */}
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30">Usuarios ({bizUsers.length})</h4>
                              <div className="max-h-[200px] overflow-y-auto space-y-1">
                                {bizUsers.map((u: UserInfo) => (
                                  <div key={u.uid} className="flex items-center justify-between py-1">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-bold text-white truncate">{u.fullName || u.email}</p>
                                      <p className="text-[9px] text-white/20">{u.email}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <RoleBadge role={u.role} />
                                      <StatusDot status={u.status} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
                            <p className="text-[8px] text-white/10 font-mono">ID: {biz.id}</p>
                            <div className="flex items-center gap-2">
                              <button onClick={(e) => { e.stopPropagation(); setEditingBiz(biz); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-[10px] font-bold text-indigo-400">
                                <Pencil size={11} /> Editar negocio
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeletingBiz(biz); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all text-[10px] font-bold text-rose-400">
                                <Trash2 size={11} /> Eliminar empresa
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-2.5 bg-[#0d1424] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 text-xs text-white font-bold">
          {toast}
        </div>
      )}

      {/* Business Edit Modal */}
      {editingBiz && (
        <BizEditModal biz={editingBiz} slug={tenants[editingBiz.id] || ''}
          onClose={() => setEditingBiz(null)}
          onSave={async () => { showToast('✓ Negocio actualizado'); setEditingBiz(null); onRefresh?.(); }}
          saving={saving} setSaving={setSaving} showToast={showToast} />
      )}

      {/* Delete Business Modal */}
      {deletingBiz && (
        <DeleteBizModal
          biz={deletingBiz}
          slug={tenants[deletingBiz.id] || ''}
          onClose={() => setDeletingBiz(null)}
          onConfirm={async () => {
            setSaving(true);
            try {
              const msg = await deleteBusinessFull(deletingBiz);
              showToast('✓ ' + msg);
              setDeletingBiz(null);
              onRefresh?.();
            } catch (err: any) {
              showToast('✗ ' + err.message);
            } finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

/* ── Business Edit Modal ──────────────────────────────────────── */
function BizEditModal({ biz, slug, onClose, onSave, saving, setSaving, showToast }: {
  biz: BizInfo; slug: string; onClose: () => void; onSave: () => Promise<void>;
  saving: boolean; setSaving: (v: boolean) => void; showToast: (msg: string) => void;
}) {
  const [editName, setEditName] = useState(biz.name);
  const [editPlan, setEditPlan] = useState(biz.plan || 'free_tier');
  const [editSubStatus, setEditSubStatus] = useState(biz.subStatus || 'unknown');
  const [editSlug, setEditSlug] = useState(slug);
  const [editPaymentMethod, setEditPaymentMethod] = useState(biz.paymentMethod || '');
  const [bonusDays, setBonusDays] = useState(0);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update business doc
      const bizUpdate: Record<string, any> = {};
      if (editName !== biz.name) bizUpdate.name = editName;
      if (editPlan !== (biz.plan || 'free_tier')) bizUpdate['subscription.plan'] = editPlan;
      if (editSubStatus !== (biz.subStatus || 'unknown')) bizUpdate['subscription.status'] = editSubStatus;
      if (editPaymentMethod !== (biz.paymentMethod || '')) bizUpdate['subscription.paymentMethod'] = editPaymentMethod;

      // Bonus days — extend trial/period end
      if (bonusDays > 0) {
        const baseDate = biz.trialEndsAt ? new Date(biz.trialEndsAt) :
          biz.currentPeriodEnd ? new Date(biz.currentPeriodEnd) : new Date();
        const newDate = new Date(baseDate.getTime() + bonusDays * 24 * 60 * 60 * 1000);
        if (editSubStatus === 'trial') {
          bizUpdate['subscription.trialEndsAt'] = newDate;
        } else {
          bizUpdate['subscription.currentPeriodEnd'] = newDate;
        }
        bizUpdate['subscription.bonusNotification'] = {
          days: bonusDays,
          grantedAt: new Date().toISOString(),
          reason: 'Ops admin grant',
          seen: false,
        };
      }

      if (Object.keys(bizUpdate).length > 0) {
        await updateDoc(doc(db, 'businesses', biz.id), bizUpdate);
      }

      // Handle slug changes
      const oldSlug = slug;
      const newSlug = editSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

      if (newSlug !== oldSlug) {
        // Delete old slug doc if it existed
        if (oldSlug) {
          try { await deleteDoc(doc(db, 'tenants', oldSlug)); } catch {}
        }
        // Create new slug doc if not empty
        if (newSlug) {
          await setDoc(doc(db, 'tenants', newSlug), {
            businessId: biz.id,
            businessName: editName || biz.name,
            createdAt: new Date().toISOString(),
          });
        }
      }

      await onSave();
    } catch (err: any) {
      showToast(`✗ Error: ${err.message}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-[#0d1424] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0d1424] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              <Building2 size={18} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Editar Negocio</h3>
              <p className="text-[10px] text-white/30">{biz.ownerEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-all">
            <X size={16} className="text-white/30" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Nombre del negocio</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
          </div>

          {/* Plan + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Plan</label>
              <select value={editPlan} onChange={e => setEditPlan(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none">
                <option value="free_tier">Free Tier</option>
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="negocio">Negocio</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Estado Suscripción</label>
              <select value={editSubStatus} onChange={e => setEditSubStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none">
                <option value="trial">Trial</option>
                <option value="active">Activa</option>
                <option value="expired">Expirada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Slug + Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Subdominio (slug)</label>
              <div className="flex items-center gap-1">
                <input value={editSlug} onChange={e => setEditSlug(e.target.value)} placeholder="mitienda"
                  className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500/50" />
                <span className="text-[9px] text-white/15 font-mono">.dualis.online</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Método de pago</label>
              <select value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none">
                <option value="">Sin método</option>
                <option value="stripe">Stripe</option>
                <option value="binance">Binance</option>
                <option value="zelle">Zelle</option>
                <option value="pago_movil">Pago Móvil</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          {/* Bonus days */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-amber-400/60 mb-2 flex items-center gap-1.5 block">
              <Sparkles size={11} /> Otorgar días bonus
            </label>
            <div className="flex items-center gap-3">
              <input type="number" min={0} max={365} value={bonusDays} onChange={e => setBonusDays(Number(e.target.value))}
                className="w-24 px-3 py-2 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none text-center" />
              <span className="text-xs text-white/30">días</span>
              {bonusDays > 0 && (
                <span className="text-[10px] text-amber-400/70">
                  Se extenderá {editSubStatus === 'trial' ? 'el trial' : 'el período'} por {bonusDays} días
                </span>
              )}
            </div>
            {/* Current dates */}
            <div className="flex gap-4 mt-2 text-[9px] text-white/20 font-mono">
              {biz.trialEndsAt && <span>Trial ends: {fmtDate(biz.trialEndsAt)}</span>}
              {biz.currentPeriodEnd && <span>Period ends: {fmtDate(biz.currentPeriodEnd)}</span>}
            </div>
          </div>

          {/* Current info */}
          <div className="grid grid-cols-3 gap-2 text-[9px] text-white/15 font-mono">
            <span>Owner: {biz.ownerName || biz.ownerEmail || '—'}</span>
            <span>Creado: {biz.createdAt ? fmtDate(biz.createdAt) : '—'}</span>
            <span>Último pago: {biz.lastPaymentAt ? fmtDate(biz.lastPaymentAt) : '—'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 sticky bottom-0 bg-[#0d1424]">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-white/40 text-xs font-bold hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                      USERS TAB                                */
/* ══════════════════════════════════════════════════════════════ */
function UsersTab({ users, businesses, stats, exportCSV, onRefresh }: any) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const bizMap = useMemo(() => {
    const m: Record<string, string> = {};
    businesses.forEach((b: BizInfo) => { m[b.id] = b.name; });
    return m;
  }, [businesses]);

  const filtered = useMemo(() => {
    let list = [...users];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((u: UserInfo) =>
        u.fullName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) ||
        u.cedula?.toLowerCase().includes(s) || u.uid.toLowerCase().includes(s)
      );
    }
    if (statusFilter !== 'all') list = list.filter((u: UserInfo) => u.status === statusFilter);
    if (roleFilter !== 'all') list = list.filter((u: UserInfo) => u.role === roleFilter);
    list.sort((a: UserInfo, b: UserInfo) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  }, [users, search, statusFilter, roleFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusFilter, roleFilter]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /* ── User Actions ──────────────────────────────────────── */
  const updateUser = async (uid: string, data: Record<string, any>, label: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), data);
      showToast(`✓ ${label}`);
      onRefresh?.();
    } catch (err: any) {
      showToast(`✗ Error: ${err.message}`);
    } finally { setSaving(false); }
  };

  const quickApprove = (u: UserInfo) => updateUser(u.uid, { status: 'ACTIVE' }, `${u.fullName || u.email} activado`);
  const quickDisable = (u: UserInfo) => updateUser(u.uid, { status: 'DISABLED' }, `${u.fullName || u.email} deshabilitado`);
  const quickEnable = (u: UserInfo) => updateUser(u.uid, { status: 'ACTIVE' }, `${u.fullName || u.email} reactivado`);

  const deleteUserFull = async (u: UserInfo): Promise<string> => {
    const steps: string[] = [];
    try {
      // 1. Delete main user doc
      await deleteDoc(doc(db, 'users', u.uid));
      steps.push('users/' + u.uid);
      // 2. Delete business membership if businessId known
      if (u.businessId) {
        try {
          await deleteDoc(doc(db, 'businesses', u.businessId, 'members', u.uid));
          steps.push('businesses/' + u.businessId + '/members/' + u.uid);
        } catch {}
      }
      // 3. Delete opsToken if it exists
      try {
        await deleteDoc(doc(db, 'opsTokens', u.uid));
        steps.push('opsTokens/' + u.uid);
      } catch {}
      return 'Eliminado: ' + steps.join(', ');
    } catch (err: any) {
      throw new Error(err.message || 'Error al eliminar usuario');
    }
  };

  const handleExport = () => {
    exportCSV('usuarios_ops.csv',
      ['Nombre', 'Email', 'Rol', 'Status', 'Cédula', 'Teléfono', 'Negocio', 'Creado'],
      filtered.map((u: UserInfo) => [
        u.fullName, u.email, u.role, u.status, u.cedula || '', u.phone || '',
        bizMap[u.businessId || ''] || u.businessId || '', u.createdAt ? fmtDate(u.createdAt) : '',
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-2.5 bg-[#0d1424] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 text-xs text-white font-bold animate-in slide-in-from-right">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, email, cédula..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-sm text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-xs text-white rounded-xl focus:outline-none">
          <option value="all">Todos los status</option>
          <option value="ACTIVE">Activo</option>
          <option value="PENDING_APPROVAL">Pendiente</option>
          <option value="PENDING_SETUP">Setup</option>
          <option value="DISABLED">Deshabilitado</option>
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-xs text-white rounded-xl focus:outline-none">
          <option value="all">Todos los roles</option>
          {Object.keys(stats.roleCounts).sort().map((r: string) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={handleExport} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08]" title="Exportar CSV">
          <Download size={14} className="text-white/40" />
        </button>
      </div>

      {/* Pending approval quick bar */}
      {stats.pendingUsers > 0 && statusFilter === 'all' && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-200/70 flex-1">{stats.pendingUsers} usuario(s) pendientes de aprobación</span>
          <button onClick={() => setStatusFilter('PENDING_APPROVAL')}
            className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase hover:bg-amber-500/30 transition-all">
            Ver pendientes
          </button>
        </div>
      )}

      <p className="text-[10px] text-white/20 font-mono">{filtered.length} usuarios · Página {page}/{totalPages || 1}</p>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/[0.06] bg-white/[0.01]">
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Cédula</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-right">Registrado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {paginated.map((u: UserInfo) => (
                <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-white truncate max-w-[200px]">{u.fullName || '(sin nombre)'}</p>
                    <p className="text-[9px] text-white/20 truncate">{u.email}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                      u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      u.status === 'PENDING_APPROVAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      u.status === 'DISABLED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      'bg-white/[0.06] text-white/30 border-white/[0.08]'
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-white/40 truncate max-w-[150px]">{bizMap[u.businessId || ''] || '—'}</td>
                  <td className="px-4 py-3 text-[10px] text-white/30 font-mono">{u.cedula || '—'}</td>
                  <td className="px-4 py-3 text-[10px] text-white/30">{u.phone || '—'}</td>
                  <td className="px-4 py-3 text-right text-[10px] text-white/25 font-mono">{u.createdAt ? fmtDate(u.createdAt) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      {(u.status === 'PENDING_APPROVAL' || u.status === 'PENDING_SETUP') && (
                        <button onClick={() => quickApprove(u)} disabled={saving} title="Aprobar"
                          className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                          <UserCheck size={12} className="text-emerald-400" />
                        </button>
                      )}
                      {u.status === 'ACTIVE' && (
                        <button onClick={() => quickDisable(u)} disabled={saving} title="Deshabilitar"
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all">
                          <UserX size={12} className="text-rose-400" />
                        </button>
                      )}
                      {u.status === 'DISABLED' && (
                        <button onClick={() => quickEnable(u)} disabled={saving} title="Reactivar"
                          className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                          <ToggleRight size={12} className="text-emerald-400" />
                        </button>
                      )}
                      <button onClick={() => setSelectedUser(u)} title="Editar usuario"
                        className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all">
                        <Pencil size={12} className="text-indigo-400" />
                      </button>
                      <button onClick={() => setDeletingUser(u)} title="Eliminar cuenta"
                        className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all">
                        <Trash2 size={12} className="text-rose-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: Math.min(totalPages, 20) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
                p === page ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
              }`}>{p}</button>
          ))}
        </div>
      )}

      {/* ── User Edit Modal ─────────────────────────────── */}
      {selectedUser && (
        <UserEditModal user={selectedUser} bizMap={bizMap} onClose={() => setSelectedUser(null)}
          onSave={async (uid, data, label) => { await updateUser(uid, data, label); setSelectedUser(null); }} saving={saving} />
      )}

      {/* ── Delete User Modal ────────────────────────────── */}
      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={async () => {
            setSaving(true);
            try {
              const msg = await deleteUserFull(deletingUser);
              showToast('✓ ' + msg);
              setDeletingUser(null);
              onRefresh?.();
            } catch (err: any) {
              showToast('✗ ' + err.message);
            } finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

/* ── User Edit Modal ─────────────────────────────────────────── */
function UserEditModal({ user, bizMap, onClose, onSave, saving }: {
  user: UserInfo; bizMap: Record<string, string>; onClose: () => void;
  onSave: (uid: string, data: Record<string, any>, label: string) => Promise<void>; saving: boolean;
}) {
  const [editRole, setEditRole] = useState(user.role);
  const [editStatus, setEditStatus] = useState(user.status);
  const [editName, setEditName] = useState(user.fullName);
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editCedula, setEditCedula] = useState(user.cedula || '');

  const hasChanges = editRole !== user.role || editStatus !== user.status ||
    editName !== user.fullName || editPhone !== (user.phone || '') || editCedula !== (user.cedula || '');

  const handleSave = () => {
    const data: Record<string, any> = {};
    if (editRole !== user.role) data.role = editRole;
    if (editStatus !== user.status) data.status = editStatus;
    if (editName !== user.fullName) data.fullName = editName;
    if (editPhone !== (user.phone || '')) data.phone = editPhone;
    if (editCedula !== (user.cedula || '')) data.cedula = editCedula;
    onSave(user.uid, data, `${user.fullName || user.email} actualizado`);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0d1424] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <UserCog size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Editar Usuario</h3>
              <p className="text-[10px] text-white/30 font-mono">{user.uid.slice(0, 20)}...</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-all">
            <X size={16} className="text-white/30" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Info row */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <Mail size={13} className="text-white/20 shrink-0" />
            <span className="text-xs text-white/50">{user.email}</span>
            {user.businessId && (
              <>
                <span className="text-white/10">·</span>
                <Building2 size={11} className="text-white/15 shrink-0" />
                <span className="text-[10px] text-white/30 truncate">{bizMap[user.businessId] || user.businessId}</span>
              </>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Nombre completo</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
          </div>

          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Rol</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="ventas">Ventas</option>
                <option value="auditor">Auditor</option>
                <option value="staff">Staff</option>
                <option value="member">Member</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                <option value="ACTIVE">Activo</option>
                <option value="PENDING_APPROVAL">Pendiente Aprobación</option>
                <option value="PENDING_SETUP">Pendiente Setup</option>
                <option value="DISABLED">Deshabilitado</option>
                <option value="REJECTED">Rechazado</option>
              </select>
            </div>
          </div>

          {/* Cedula + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Cédula</label>
              <input value={editCedula} onChange={e => setEditCedula(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Teléfono</label>
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-[9px] text-white/15 font-mono pt-1">
            <span>Registrado: {user.createdAt ? fmtDate(user.createdAt) : '—'}</span>
            {user.lastLogin && <span>Último login: {fmtDate(user.lastLogin)}</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-white/40 text-xs font-bold hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!hasChanges || saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                     REVENUE TAB                               */
/* ══════════════════════════════════════════════════════════════ */
function RevenueTab({ stats, movements, businesses, exportCSV }: any) {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('30d');

  const now = new Date();
  const cutoff = period === 'today' ? now.toISOString().slice(0, 10) :
    period === '7d' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() :
    period === '30d' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() : '';

  const filteredMov = useMemo(() => {
    const valid = movements.filter((m: MovementInfo) => !m.anulada && m.movementType === 'FACTURA');
    if (period === 'all') return valid;
    if (period === 'today') return valid.filter((m: MovementInfo) => m.date === cutoff);
    return valid.filter((m: MovementInfo) => m.createdAt > cutoff);
  }, [movements, period, cutoff]);

  const totalRevenue = filteredMov.reduce((s: number, m: MovementInfo) => s + m.amountInUSD, 0);
  const totalIVA = filteredMov.reduce((s: number, m: MovementInfo) => s + (m.ivaAmount || 0), 0);
  const totalIGTF = filteredMov.reduce((s: number, m: MovementInfo) => s + (m.igtfAmount || 0), 0);
  const avgTicket = filteredMov.length > 0 ? totalRevenue / filteredMov.length : 0;

  // Payment method breakdown
  const payMethodBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filteredMov.forEach((m: MovementInfo) => {
      if (m.pagos && typeof m.pagos === 'object') {
        Object.entries(m.pagos).forEach(([k, v]) => {
          if (!map[k]) map[k] = { count: 0, total: 0 };
          map[k].count++; map[k].total += v as number;
        });
      } else {
        const k = m.metodoPago || 'Otro';
        if (!map[k]) map[k] = { count: 0, total: 0 };
        map[k].count++; map[k].total += m.amountInUSD;
      }
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filteredMov]);

  // Revenue per business
  const bizBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {};
    filteredMov.forEach((m: MovementInfo) => {
      if (!map[m.businessId]) {
        const biz = businesses.find((b: BizInfo) => b.id === m.businessId);
        map[m.businessId] = { name: biz?.name || m.businessId.slice(0, 16), count: 0, total: 0 };
      }
      map[m.businessId].count++; map[m.businessId].total += m.amountInUSD;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filteredMov, businesses]);

  // Top sellers
  const topSellers = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filteredMov.forEach((m: MovementInfo) => {
      const k = m.vendedorNombre || 'Sin vendedor';
      if (!map[k]) map[k] = { count: 0, total: 0 };
      map[k].count++; map[k].total += m.amountInUSD;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  }, [filteredMov]);

  const handleExport = () => {
    exportCSV(`ingresos_${period}_ops.csv`,
      ['Fecha', 'NroControl', 'Concepto', 'Vendedor', 'Método Pago', 'Monto USD', 'IVA', 'IGTF', 'Tasa', 'Negocio'],
      filteredMov.map((m: MovementInfo) => [
        m.date, m.nroControl || '', m.concept, m.vendedorNombre || '', m.metodoPago,
        fmt(m.amountInUSD), fmt(m.ivaAmount || 0), fmt(m.igtfAmount || 0),
        String(m.rateUsed || ''), businesses.find((b: BizInfo) => b.id === m.businessId)?.name || '',
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['today', '7d', '30d', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                period === p ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
              }`}>
              {p === 'today' ? 'Hoy' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : 'Todo'}
            </button>
          ))}
        </div>
        <button onClick={handleExport} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08]" title="Exportar CSV">
          <Download size={14} className="text-white/40" />
        </button>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Receipt} label="Facturas" value={fmtInt(filteredMov.length)} color="indigo" sub={`Período: ${period}`} isString />
        <KpiCard icon={DollarSign} label="Revenue" value={`$${fmt(totalRevenue)}`} color="emerald" sub="Total facturado" isString />
        <KpiCard icon={BadgeDollarSign} label="Ticket Promedio" value={`$${fmt(avgTicket)}`} color="sky" sub="Por factura" isString />
        <KpiCard icon={Banknote} label="IVA + IGTF" value={`$${fmt(totalIVA + totalIGTF)}`} color="violet" sub={`IVA: $${fmt(totalIVA)} | IGTF: $${fmt(totalIGTF)}`} isString />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Payment methods */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Métodos de Pago</h3>
          <div className="space-y-3">
            {payMethodBreakdown.map(([method, data]) => (
              <div key={method} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard size={12} className="text-white/20 shrink-0" />
                  <span className="text-xs text-white/60 truncate">{method}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-white/20">{data.count} ops</span>
                  <span className="text-xs font-bold text-emerald-400">${fmt(data.total)}</span>
                </div>
              </div>
            ))}
            {payMethodBreakdown.length === 0 && <p className="text-[10px] text-white/15">Sin datos</p>}
          </div>
        </div>

        {/* Revenue by business */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Revenue por Negocio</h3>
          <div className="space-y-3">
            {bizBreakdown.slice(0, 10).map(([id, data]) => (
              <div key={id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-white/60 truncate">{data.name}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-white/20">{data.count} ventas</span>
                  <span className="text-xs font-bold text-emerald-400">${fmt(data.total)}</span>
                </div>
              </div>
            ))}
            {bizBreakdown.length === 0 && <p className="text-[10px] text-white/15">Sin datos</p>}
          </div>
        </div>
      </div>

      {/* Top sellers */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">Top Vendedores</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {topSellers.map(([name, data], i) => (
            <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-white/[0.08] text-white/40' : i === 2 ? 'bg-orange-500/15 text-orange-400' : 'bg-white/[0.04] text-white/20'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{name}</p>
                <p className="text-[9px] text-white/20">{data.count} ventas</p>
              </div>
              <span className="text-xs font-bold text-emerald-400 shrink-0">${fmt(data.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                     ACTIVITY TAB                              */
/* ══════════════════════════════════════════════════════════════ */
function ActivityTab({ auditLogs, users, businesses }: any) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);

  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    users.forEach((u: UserInfo) => { m[u.uid] = u.fullName || u.email; });
    return m;
  }, [users]);

  const bizMap = useMemo(() => {
    const m: Record<string, string> = {};
    businesses.forEach((b: BizInfo) => { m[b.id] = b.name; });
    return m;
  }, [businesses]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((a: AuditInfo) => { if (a.action) set.add(a.action); });
    return Array.from(set).sort();
  }, [auditLogs]);

  const filtered = useMemo(() => {
    let list = [...auditLogs];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: AuditInfo) =>
        (a.action || '').toLowerCase().includes(s) ||
        (a.detail || '').toLowerCase().includes(s) ||
        (a.user || '').toLowerCase().includes(s) ||
        (userMap[a.userId || ''] || '').toLowerCase().includes(s)
      );
    }
    if (actionFilter !== 'all') list = list.filter((a: AuditInfo) => a.action === actionFilter);
    return list;
  }, [auditLogs, search, actionFilter, userMap]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, actionFilter]);

  const actionColor = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('crear') || a.includes('create')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (a.includes('eliminar') || a.includes('delete')) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (a.includes('editar') || a.includes('update')) return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
    if (a.includes('login')) return 'text-violet-400 bg-violet-500/10 border-violet-500/20';
    if (a.includes('export')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-white/30 bg-white/[0.04] border-white/[0.07]';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar acción, usuario, detalle..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-sm text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
        </div>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] text-xs text-white rounded-xl focus:outline-none max-w-[200px]">
          <option value="all">Todas las acciones</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <p className="text-[10px] text-white/20 font-mono">{filtered.length} registros · Página {page}/{totalPages || 1}</p>

      <div className="space-y-2">
        {paginated.map((log: AuditInfo) => (
          <div key={log.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.03] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 mt-0.5 ${actionColor(log.action)}`}>
                  {log.action}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-white/60 truncate">{log.user || userMap[log.userId || ''] || log.userId || 'Sistema'}</p>
                  {log.detail && <p className="text-[10px] text-white/25 mt-0.5 truncate max-w-[500px]">{log.detail}</p>}
                  {log.module && <span className="text-[9px] text-white/15 font-mono">{log.module}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] text-white/20 font-mono">{log.createdAt ? fmtDateTime(log.createdAt) : '—'}</p>
                <p className="text-[8px] text-white/10 truncate max-w-[120px]">{bizMap[log.businessId] || ''}</p>
              </div>
            </div>
          </div>
        ))}
        {paginated.length === 0 && (
          <div className="text-center py-12">
            <Activity size={24} className="text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/20">Sin registros de auditoría</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: Math.min(totalPages, 20) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
                p === page ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
              }`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*                  SHARED SUB-COMPONENTS                        */
/* ══════════════════════════════════════════════════════════════ */
function KpiCard({ icon: Icon, label, value, color, sub, isString }: any) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/[0.08] border-indigo-500/20', emerald: 'bg-emerald-500/[0.08] border-emerald-500/20',
    sky: 'bg-sky-500/[0.08] border-sky-500/20', violet: 'bg-violet-500/[0.08] border-violet-500/20',
    amber: 'bg-amber-500/[0.08] border-amber-500/20', rose: 'bg-rose-500/[0.08] border-rose-500/20',
  };
  const iconColors: Record<string, string> = {
    indigo: 'text-indigo-400', emerald: 'text-emerald-400', sky: 'text-sky-400',
    violet: 'text-violet-400', amber: 'text-amber-400', rose: 'text-rose-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color] || colors.indigo}`}>
      <Icon size={16} className={`${iconColors[color] || 'text-white/30'} mb-2`} />
      <p className="text-2xl font-black text-white leading-tight">{isString ? value : fmtInt(value)}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mt-0.5">{label}</p>
      <p className="text-[9px] text-white/15 mt-1">{sub}</p>
    </div>
  );
}

function StatusBar({ label, value, total, color, ..._rest }: { label: string; value: number; total: number; color: string; [k: string]: any }) {
  const p = pct(value, total);
  const barColors: Record<string, string> = {
    emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
    indigo: 'bg-indigo-500', violet: 'bg-violet-500', sky: 'bg-sky-500', slate: 'bg-slate-500',
  };
  const textColors: Record<string, string> = {
    emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400',
    indigo: 'text-indigo-400', violet: 'text-violet-400', sky: 'text-sky-400', slate: 'text-slate-400',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40 capitalize">{label}</span>
        <span className={`text-xs font-black ${textColors[color] || 'text-white/40'}`}>{value} <span className="text-[9px] text-white/15">({p}%)</span></span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColors[color] || 'bg-slate-500'}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function PlanBadge({ plan, count, ..._rest }: { plan: string; count: number; [k: string]: any }) {
  const p = plan.toLowerCase();
  const cls = p.includes('enterprise') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    p.includes('negocio') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    p.includes('starter') ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
    p.includes('trial') ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
    'bg-white/[0.06] text-white/30 border-white/[0.08]';
  return (
    <div className={`px-3 py-2 rounded-xl border ${cls}`}>
      <p className="text-[10px] font-bold uppercase">{plan}</p>
      <p className="text-lg font-black text-white">{count}</p>
    </div>
  );
}

function PlanBadgeSmall({ plan }: { plan: string }) {
  const p = plan.toLowerCase();
  const cls = p.includes('enterprise') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    p.includes('negocio') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    p.includes('starter') ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
    p.includes('trial') ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
    'bg-white/[0.06] text-white/30 border-white/[0.08]';
  return <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${cls}`}>{plan}</span>;
}

function SubStatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    status === 'trial' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
    status === 'expired' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
    status === 'cancelled' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
    'bg-white/[0.06] text-white/30 border-white/[0.08]';
  return <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${cls}`}>{status}</span>;
}

function RoleBadge({ role }: { role: string }) {
  const cls = role === 'owner' ? 'text-amber-400' : role === 'admin' ? 'text-indigo-400' :
    role === 'ventas' ? 'text-sky-400' : role === 'auditor' ? 'text-violet-400' : 'text-white/30';
  const Icon = role === 'owner' ? Crown : role === 'admin' ? ShieldAlert : role === 'ventas' ? Store : Star;
  return (
    <span className={`flex items-center gap-1 text-[9px] font-black uppercase ${cls}`}>
      <Icon size={10} /> {role}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'ACTIVE' ? 'bg-emerald-500' : status === 'PENDING_APPROVAL' ? 'bg-amber-500' :
    status === 'DISABLED' ? 'bg-rose-500' : 'bg-white/20';
  return <span className={`w-2 h-2 rounded-full ${cls}`} title={status} />;
}

function InfoRow({ label, value, ..._rest }: { label: string; value: string; [k: string]: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/25">{label}</span>
      <span className="text-[10px] text-white/50 font-bold">{value}</span>
    </div>
  );
}

/* ── Delete User Modal ───────────────────────────────────────── */
function DeleteUserModal({ user, onClose, onConfirm, saving }: {
  user: UserInfo; onClose: () => void; onConfirm: () => Promise<void>; saving: boolean;
}) {
  const [input, setInput] = useState('');
  const confirmed = input.trim() === 'DELETE';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-white/[0.07] overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 size={16} className="text-rose-400" />
            <h3 className="text-sm font-black text-white">Eliminar cuenta</h3>
          </div>
          <p className="text-xs text-white/40">Esta acción es <span className="text-rose-400 font-bold">irreversible</span>.</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="p-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 space-y-1">
            <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Se eliminará permanentemente:</p>
            <ul className="text-[11px] text-white/50 space-y-0.5 ml-2">
              <li>· Perfil de usuario <span className="text-white/70 font-bold">{user.fullName || user.email}</span></li>
              {user.businessId && <li>· Membresía en empresa</li>}
              <li>· Token de sesión OpsMonitor (si existe)</li>
            </ul>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Escribe DELETE para confirmar</label>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="DELETE"
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-rose-500/50 placeholder:text-white/15" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-white/40 text-xs font-bold hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!confirmed || saving}
            className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-30 hover:bg-rose-500 transition-all">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete Business Modal ───────────────────────────────────── */
function DeleteBizModal({ biz, slug, onClose, onConfirm, saving }: {
  biz: BizInfo; slug: string; onClose: () => void; onConfirm: () => Promise<void>; saving: boolean;
}) {
  const [nameInput, setNameInput] = useState('');
  const [checked, setChecked] = useState(false);
  const confirmed = checked && nameInput.trim() === biz.name;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md bg-[#0d1424] rounded-2xl shadow-2xl shadow-black/40 border border-white/[0.07] overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 size={16} className="text-rose-400" />
            <h3 className="text-sm font-black text-white">Eliminar empresa</h3>
          </div>
          <p className="text-xs text-white/40">Esta acción es <span className="text-rose-400 font-bold">permanente e irreversible</span>.</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="p-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 space-y-1">
            <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Se eliminará permanentemente:</p>
            <ul className="text-[11px] text-white/50 space-y-0.5 ml-2">
              <li>· Empresa: <span className="text-white/70 font-bold">{biz.name}</span></li>
              <li>· Productos, cajas, empleados, membresías</li>
              <li>· Nóminas, préstamos, adelantos, vales</li>
              <li>· Configuraciones y tasas</li>
              <li>· Clientes, proveedores y movimientos</li>
              {slug && <li>· Subdominio: <span className="font-mono text-sky-400">{slug}.dualis.online</span></li>}
              <li>· Usuarios de la empresa → quedan deshabilitados</li>
            </ul>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 accent-rose-500" />
            <span className="text-[11px] text-white/50">Entiendo que esto es irreversible y que todos los datos serán eliminados.</span>
          </label>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
              Escribe el nombre exacto: <span className="text-white/60 font-mono">{biz.name}</span>
            </label>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder={biz.name}
              className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] text-sm text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500/50 placeholder:text-white/15" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-white/40 text-xs font-bold hover:bg-white/[0.08] transition-all">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={!confirmed || saving}
            className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-30 hover:bg-rose-500 transition-all">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Eliminar empresa
          </button>
        </div>
      </div>
    </div>
  );
}
