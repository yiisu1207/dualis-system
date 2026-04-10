import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Landmark,
  Plus,
  PieChart as PieIcon,
  TrendingUp,
  ListOrdered,
  Eye,
  Filter,
  Download,
  Search,
  AlertCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import type { BusinessBankAccount, BankWithdrawal, Movement } from '../../types';
import { getBancoByCode } from '../data/bancosVE';
import BankAccountCard from '../components/tesoreria/BankAccountCard';
import BankAccountModal from '../components/tesoreria/BankAccountModal';
import VoucherViewer from '../components/tesoreria/VoucherViewer';
import WithdrawalModal from '../components/tesoreria/WithdrawalModal';
import ReconciliationModal from '../components/tesoreria/ReconciliationModal';
import VerificationBadge from '../components/VerificationBadge';

interface Customer { id: string; name: string; email?: string }

interface Props {
  businessId: string;
  businessName?: string;
  currentUserId: string;
  currentUserName: string;
  userRole: string;
  customers?: Customer[];
}

type View = 'cuentas' | 'estadisticas' | 'movimientos';

const VIEWS: { id: View; label: string; Icon: any }[] = [
  { id: 'cuentas',      label: 'Cuentas',      Icon: Landmark    },
  { id: 'estadisticas', label: 'Estadísticas', Icon: TrendingUp  },
  { id: 'movimientos',  label: 'Movimientos',  Icon: ListOrdered },
];

const PIE_COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export default function Tesoreria({ businessId, businessName = 'Mi Negocio', currentUserId, currentUserName, userRole, customers = [] }: Props) {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  const [view, setView] = useState<View>('cuentas');
  const [accounts, setAccounts] = useState<BusinessBankAccount[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [withdrawalsByAccount, setWithdrawalsByAccount] = useState<Record<string, BankWithdrawal[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<BusinessBankAccount | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [voucherView, setVoucherView] = useState<{ url: string; caption?: string } | null>(null);
  const [withdrawingFrom, setWithdrawingFrom] = useState<BusinessBankAccount | null>(null);
  const [reconcilingFrom, setReconcilingFrom] = useState<BusinessBankAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [movSearch, setMovSearch] = useState('');
  const [movBankFilter, setMovBankFilter] = useState<string>('ALL');
  const [statsRange, setStatsRange] = useState<'7d' | '30d' | '90d'>('30d');

  // ── Listener: cuentas bancarias ─────────────────────────────────────────
  useEffect(() => {
    if (!businessId) return;
    const unsub = onSnapshot(
      collection(db, `businesses/${businessId}/bankAccounts`),
      snap => {
        const rows: BusinessBankAccount[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        rows.sort((a, b) => (a.bankName || '').localeCompare(b.bankName || ''));
        setAccounts(rows);
        setLoading(false);
      },
      err => { console.error('[tesoreria] accounts', err); setLoading(false); }
    );
    return unsub;
  }, [businessId]);

  // ── Migración silenciosa: crear Caja Chica USD si no existe ─────────────
  useEffect(() => {
    if (!businessId || loading) return;
    const hasEfectivo = accounts.some(a => a.accountType === 'efectivo');
    if (!hasEfectivo && accounts.length >= 0) {
      // Crear con id determinístico para que el POS pueda inyectarlo
      const id = 'efectivo_usd_default';
      setDoc(doc(db, `businesses/${businessId}/bankAccounts`, id), {
        businessId,
        bankCode: 'EFECTIVO',
        bankName: 'Efectivo USD',
        accountType: 'efectivo',
        accountNumber: '',
        holderName: businessName,
        holderDocument: '',
        currency: 'USD',
        enabled: true,
        createdAt: new Date().toISOString(),
      }, { merge: true }).catch(() => { /* swallow */ });
    }
  }, [accounts, businessId, businessName, loading]);

  // ── Listener: movements del negocio (filtrar ABONO en memoria) ──────────
  useEffect(() => {
    if (!businessId) return;
    const q = query(collection(db, 'movements'), where('businessId', '==', businessId));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Movement));
      setMovements(rows);
    }, err => console.error('[tesoreria] movements', err));
    return unsub;
  }, [businessId]);

  // ── Listeners: retiros por cuenta ───────────────────────────────────────
  useEffect(() => {
    if (!businessId || accounts.length === 0) return;
    const unsubs = accounts.map(acc =>
      onSnapshot(
        collection(db, `businesses/${businessId}/bankAccounts/${acc.id}/withdrawals`),
        snap => {
          setWithdrawalsByAccount(prev => ({
            ...prev,
            [acc.id]: snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as BankWithdrawal)),
          }));
        }
      )
    );
    return () => unsubs.forEach(u => u());
  }, [accounts, businessId]);

  // ── Filtrado por rol vendedor ───────────────────────────────────────────
  const visibleMovements = useMemo(() => {
    if (isAdmin) return movements;
    return movements.filter(m => m.createdBy === currentUserId || m.vendedorId === currentUserId);
  }, [movements, isAdmin, currentUserId]);

  const visibleAccounts = useMemo(() => {
    return showArchived ? accounts : accounts.filter(a => a.enabled);
  }, [accounts, showArchived]);

  // ── Agrupación por banco para vista cuentas ─────────────────────────────
  const accountsByBank = useMemo(() => {
    const groups: Record<string, BusinessBankAccount[]> = {};
    visibleAccounts.forEach(a => {
      const key = a.bankCode;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [visibleAccounts]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const statsData = useMemo(() => {
    const days = statsRange === '7d' ? 7 : statsRange === '30d' ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // K9: incluir FACTURA con bankAccountId (ventas POS Efectivo USD/Caja Chica)
    // además de los ABONO normales (manuales y del portal)
    const abonos = visibleMovements.filter(m =>
      (m.movementType === 'ABONO' ||
        (m.movementType === 'FACTURA' && !!m.bankAccountId)) &&
      !m.anulada &&
      new Date(m.date) >= since
    );

    // Por día (bar chart)
    const byDay: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      byDay[key] = 0;
    }
    abonos.forEach(m => {
      const key = (m.date || '').slice(0, 10);
      if (key in byDay) byDay[key] += Number(m.amountInUSD || 0);
    });
    const byDayArr = Object.entries(byDay).map(([date, total]) => ({
      date: date.slice(5),  // MM-DD
      total: +total.toFixed(2),
    }));

    // Por método (pie chart)
    const byMethod: Record<string, number> = {};
    abonos.forEach(m => {
      const acc = accounts.find(a => a.id === m.bankAccountId);
      const key = acc ? (
        acc.accountType === 'pago_movil' ? 'Pago Móvil' :
        acc.accountType === 'zelle' ? 'Zelle' :
        acc.accountType === 'binance' ? 'Binance' :
        acc.accountType === 'paypal' ? 'PayPal' :
        acc.accountType === 'efectivo' ? 'Efectivo USD' :
        'Transferencia'
      ) : (m.metodoPago || 'Otro');
      byMethod[key] = (byMethod[key] || 0) + Number(m.amountInUSD || 0);
    });
    const byMethodArr = Object.entries(byMethod).map(([name, total]) => ({ name, total: +total.toFixed(2) }));

    // Por banco (top 5)
    const byBank: Record<string, number> = {};
    abonos.forEach(m => {
      const acc = accounts.find(a => a.id === m.bankAccountId);
      if (acc) byBank[acc.bankName] = (byBank[acc.bankName] || 0) + Number(m.amountInUSD || 0);
    });
    const byBankArr = Object.entries(byBank)
      .map(([name, total]) => ({ name, total: +total.toFixed(2) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // KPIs
    const total = abonos.reduce((s, m) => s + Number(m.amountInUSD || 0), 0);
    const txCount = abonos.length;
    const avgTicket = txCount > 0 ? total / txCount : 0;

    return { byDayArr, byMethodArr, byBankArr, total, txCount, avgTicket };
  }, [visibleMovements, accounts, statsRange]);

  // ── Movimientos filtrados (vista 3) ─────────────────────────────────────
  const filteredMovements = useMemo(() => {
    return visibleMovements
      .filter(m => (m.movementType === 'ABONO' ||
        (m.movementType === 'FACTURA' && !!m.bankAccountId)) && !m.anulada)
      .filter(m => {
        if (movBankFilter !== 'ALL' && m.bankAccountId !== movBankFilter) return false;
        if (movSearch) {
          const q = movSearch.toLowerCase();
          const cust = customers.find(c => c.id === m.entityId);
          const hay = [
            cust?.name,
            m.concept,
            m.reference,
            m.referencia,
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [visibleMovements, movBankFilter, movSearch, customers]);

  // ── Export CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ['Fecha', 'Cliente', 'Monto USD', 'Banco', 'Cuenta', 'Referencia', 'Cédula', 'Estado'],
      ...filteredMovements.map(m => {
        const cust = customers.find(c => c.id === m.entityId);
        const acc = accounts.find(a => a.id === m.bankAccountId);
        return [
          m.date,
          cust?.name || m.concept,
          Number(m.amountInUSD || 0).toFixed(2),
          acc?.bankName || '',
          acc?.accountNumber || '',
          m.reference || m.referencia || '',
          m.payerCedula || '',
          m.reconciledAt ? 'Conciliado' : 'Pendiente',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tesoreria_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Landmark size={32} className="text-slate-300 animate-pulse" />
        <p className="text-xs font-bold text-slate-400">Cargando tesorería...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Landmark size={26} className="text-indigo-500" />
            Tesorería
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-1">Cuentas de cobro, ingresos por método y conciliación bancaria</p>
        </div>
        {isAdmin && view === 'cuentas' && (
          <button
            onClick={() => setCreatingAccount(true)}
            className="px-4 py-2.5 rounded-2xl bg-indigo-500 text-white text-xs font-black flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-md shadow-indigo-500/20"
          >
            <Plus size={14} /> Agregar cuenta
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/[0.07] overflow-x-auto custom-scroll">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-2.5 text-xs font-black flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              view === v.id
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <v.Icon size={13} /> {v.label}
          </button>
        ))}
      </div>

      {/* ── VIEW: CUENTAS ─────────────────────────────────────────────── */}
      {view === 'cuentas' && (
        <>
          {accounts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-white/[0.1] p-12 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Landmark size={28} />
              </div>
              <div>
                <p className="font-black text-slate-900 dark:text-white text-base">Aún no tienes cuentas registradas</p>
                <p className="text-xs text-slate-400 mt-1">Agrega tu primera cuenta para que tus clientes puedan pagarte desde el portal.</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setCreatingAccount(true)}
                  className="px-5 py-2.5 rounded-2xl bg-indigo-500 text-white text-xs font-black flex items-center gap-2 hover:bg-indigo-600 transition-all"
                >
                  <Plus size={14} /> Agregar primera cuenta
                </button>
              )}
            </div>
          ) : (
            <>
              {accounts.some(a => !a.enabled) && (
                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={e => setShowArchived(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  Mostrar archivadas
                </label>
              )}
              <div className="space-y-5">
                {(Object.entries(accountsByBank) as [string, BusinessBankAccount[]][]).map(([bankCode, accs]) => {
                  const banco = getBancoByCode(bankCode);
                  return (
                    <div key={bankCode}>
                      {accs.length > 1 && (
                        <p
                          className="text-[10px] font-black uppercase tracking-widest mb-2"
                          style={{ color: banco?.color || '#64748b' }}
                        >
                          {banco?.name || bankCode}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {accs.map(acc => (
                          <BankAccountCard
                            key={acc.id}
                            account={acc}
                            movements={visibleMovements}
                            withdrawals={withdrawalsByAccount[acc.id] || []}
                            readOnly={!isAdmin}
                            onEdit={() => setEditingAccount(acc)}
                            onWithdraw={() => setWithdrawingFrom(acc)}
                            onReconcile={() => setReconcilingFrom(acc)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── VIEW: ESTADÍSTICAS ──────────────────────────────────────── */}
      {view === 'estadisticas' && (
        <>
          {/* Range filter */}
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setStatsRange(r)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all ${
                  statsRange === r
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-100 dark:bg-white/[0.05] text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                {r === '7d' ? '7 días' : r === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total cobrado</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">${statsData.total.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transacciones</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{statsData.txCount}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ticket promedio</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">${statsData.avgTicket.toFixed(2)}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar: ingresos por día */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Ingresos por día</p>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={statsData.byDayArr}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Ingresos']}
                    />
                    <Bar dataKey="total" fill="#4f6ef7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie: por método */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <PieIcon size={11} /> Distribución por método
              </p>
              {statsData.byMethodArr.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">Sin datos en el rango seleccionado</p>
              ) : (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={statsData.byMethodArr}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={(d: any) => `${d.name} ${(d.percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {statsData.byMethodArr.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, fontSize: 12 }}
                        formatter={(v: any) => `$${Number(v).toFixed(2)}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Bar: top bancos */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] p-4 lg:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Top 5 cuentas</p>
              {statsData.byBankArr.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">Sin datos en el rango seleccionado</p>
              ) : (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={statsData.byBankArr} layout="vertical">
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, fontSize: 12 }}
                        formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Ingresos']}
                      />
                      <Bar dataKey="total" fill="#10b981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── VIEW: MOVIMIENTOS ───────────────────────────────────────── */}
      {view === 'movimientos' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={movSearch}
                onChange={e => setMovSearch(e.target.value)}
                placeholder="Buscar cliente, concepto, referencia..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.07] text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={movBankFilter}
              onChange={e => setMovBankFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.07] text-xs font-bold text-slate-900 dark:text-white outline-none"
            >
              <option value="ALL">Todas las cuentas</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.bankName}</option>
              ))}
            </select>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 text-xs font-black flex items-center gap-2 transition-all"
            >
              <Download size={13} /> CSV
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-50 dark:bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Ref.</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3 text-center">Voucher</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-400">
                        Sin movimientos
                      </td>
                    </tr>
                  ) : filteredMovements.map(m => {
                    const cust = customers.find(c => c.id === m.entityId);
                    const acc = accounts.find(a => a.id === m.bankAccountId);
                    return (
                      <tr key={m.id} className="border-t border-slate-100 dark:border-white/[0.04] hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-bold">{new Date(m.date).toLocaleDateString('es-VE')}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-white font-black">{cust?.name || m.concept}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{acc?.bankName || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono">{m.reference || m.referencia || '—'}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-white font-black text-right">${Number(m.amountInUSD || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          {m.voucherUrl ? (
                            <button
                              onClick={() => setVoucherView({ url: m.voucherUrl!, caption: `${cust?.name || ''} · $${Number(m.amountInUSD || 0).toFixed(2)}` })}
                              className="w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 inline-flex items-center justify-center transition-all"
                              title="Ver voucher"
                            >
                              <Eye size={12} />
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <VerificationBadge movement={m as any} size="xs" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modales ─────────────────────────────────────────────────── */}
      {(creatingAccount || editingAccount) && isAdmin && (
        <BankAccountModal
          businessId={businessId}
          account={editingAccount}
          onClose={() => { setCreatingAccount(false); setEditingAccount(null); }}
        />
      )}

      {voucherView && (
        <VoucherViewer
          url={voucherView.url}
          caption={voucherView.caption}
          onClose={() => setVoucherView(null)}
        />
      )}

      {withdrawingFrom && isAdmin && (
        <WithdrawalModal
          businessId={businessId}
          account={withdrawingFrom}
          currentBalance={(() => {
            const movs = visibleMovements.filter(m => m.bankAccountId === withdrawingFrom.id && m.movementType === 'ABONO' && !m.anulada);
            const ing = movs.reduce((s, m) => s + Number(m.amountInUSD || 0), 0);
            const ret = (withdrawalsByAccount[withdrawingFrom.id] || []).reduce((s, w) => s + Number(w.amount || 0), 0);
            return ing - ret;
          })()}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setWithdrawingFrom(null)}
        />
      )}

      {reconcilingFrom && isAdmin && (
        <ReconciliationModal
          businessId={businessId}
          account={reconcilingFrom}
          movements={visibleMovements}
          customers={customers}
          businessName={businessName}
          currentUserId={currentUserId}
          onClose={() => setReconcilingFrom(null)}
          onViewVoucher={(url, caption) => setVoucherView({ url, caption })}
        />
      )}
    </div>
  );
}
