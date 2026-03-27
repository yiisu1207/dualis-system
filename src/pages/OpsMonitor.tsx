import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../firebase/config';
import { signInAnonymously, signOut } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';
import {
  Shield, Loader2, KeyRound, Building2, Users, Activity,
  LogOut, RefreshCw, Wifi, WifiOff, Globe, Clock, Eye,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';

/* ── Passkey hash (SHA-256 of the real passkey) ─────────────── */
// To change: run in browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSKEY'))
//     .then(b => Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''))
const PASSKEY_HASH = '7efb8beb719f9157670978288671d963fc4e8eb795ff7bef64ec270aca2e9664';

async function hashPasskey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ── Interfaces ─────────────────────────────────────────────── */
interface BizInfo {
  id: string;
  name: string;
  ownerEmail?: string;
  plan?: string;
  createdAt?: string;
  slug?: string;
}

interface UserInfo {
  uid: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  businessId?: string;
  createdAt?: string;
}

export default function OpsMonitor() {
  const [phase, setPhase]       = useState<'passkey' | 'loading' | 'dashboard' | 'error'>('passkey');
  const [passkey, setPasskey]   = useState('');
  const [error, setError]       = useState('');
  const [checking, setChecking] = useState(false);

  // Data
  const [businesses, setBusinesses] = useState<BizInfo[]>([]);
  const [users, setUsers]           = useState<UserInfo[]>([]);
  const [tenants, setTenants]       = useState<Record<string, string>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  /* ── Passkey validation + anonymous auth ─────────────────── */
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim()) return;
    setChecking(true);
    setError('');

    try {
      const hash = await hashPasskey(passkey.trim());
      if (hash !== PASSKEY_HASH) {
        setError('Passkey incorrecto');
        setChecking(false);
        return;
      }

      // Sign in anonymously
      const cred = await signInAnonymously(auth);
      const uid = cred.user.uid;

      // Write ops session token (for Firestore rules)
      await setDoc(doc(db, 'opsTokens', uid), {
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
    } finally {
      setChecking(false);
    }
  };

  /* ── Fetch monitoring data ───────────────────────────────── */
  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      // Businesses
      const bizSnap = await getDocs(collection(db, 'businesses'));
      const bizList: BizInfo[] = bizSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || d.id,
          ownerEmail: data.ownerEmail,
          plan: data.subscription?.plan || data.plan || 'free',
          createdAt: data.createdAt,
        };
      });
      setBusinesses(bizList);

      // Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserInfo[] = usersSnap.docs.map(d => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || '',
          fullName: data.fullName || data.displayName || '',
          role: data.role || 'pending',
          status: data.status || 'ACTIVE',
          businessId: data.businessId || data.empresa_id || '',
          createdAt: data.createdAt,
        };
      });
      setUsers(usersList);

      // Tenants (slugs)
      const tenantSnap = await getDocs(collection(db, 'tenants'));
      const slugMap: Record<string, string> = {};
      tenantSnap.docs.forEach(d => {
        const data = d.data();
        if (data.businessId) slugMap[data.businessId] = d.id;
      });
      setTenants(slugMap);

      setLastRefresh(new Date());
    } catch (err) {
      console.error('[OpsMonitor] fetch failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  /* ── Logout ──────────────────────────────────────────────── */
  const handleLogout = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await deleteDoc(doc(db, 'opsTokens', uid));
      await signOut(auth);
    } catch {}
    setPhase('passkey');
    setPasskey('');
    setBusinesses([]);
    setUsers([]);
  };

  /* ── Computed stats ──────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalBiz = businesses.length;
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'ACTIVE').length;
    const pendingUsers = users.filter(u => u.status === 'PENDING_APPROVAL' || u.status === 'PENDING_SETUP').length;
    const disabledUsers = users.filter(u => u.status === 'DISABLED').length;
    const owners = users.filter(u => u.role === 'owner').length;
    const withSlug = Object.keys(tenants).length;

    // Users per business
    const bizUserCount: Record<string, number> = {};
    users.forEach(u => {
      if (u.businessId) bizUserCount[u.businessId] = (bizUserCount[u.businessId] || 0) + 1;
    });

    // Recent signups (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentUsers = users.filter(u => u.createdAt && u.createdAt > weekAgo).length;
    const recentBiz = businesses.filter(b => b.createdAt && b.createdAt > weekAgo).length;

    // Plans
    const planCounts: Record<string, number> = {};
    businesses.forEach(b => {
      const p = b.plan || 'free';
      planCounts[p] = (planCounts[p] || 0) + 1;
    });

    return { totalBiz, totalUsers, activeUsers, pendingUsers, disabledUsers, owners, withSlug, bizUserCount, recentUsers, recentBiz, planCounts };
  }, [businesses, users, tenants]);

  /* ── PASSKEY SCREEN ──────────────────────────────────────── */
  if (phase === 'passkey' || phase === 'error') {
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
              <input
                type="password"
                autoFocus
                placeholder="Passkey"
                value={passkey}
                onChange={e => setPasskey(e.target.value)}
                className="w-full pl-10 pr-4 py-3.5 bg-white/[0.06] border border-white/[0.1] text-white rounded-xl placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <AlertTriangle size={12} className="text-rose-400 shrink-0" />
                <p className="text-[10px] text-rose-400 font-bold">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={checking || !passkey.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 hover:from-indigo-500 hover:to-violet-500 transition-all"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {checking ? 'Verificando...' : 'Acceder'}
            </button>
          </form>

          <p className="text-center text-[8px] text-white/10 mt-8 font-mono uppercase tracking-widest">
            Dualis Ops Monitor · Read-Only
          </p>
        </div>
      </div>
    );
  }

  /* ── LOADING ─────────────────────────────────────────────── */
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#060b14] flex flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-400 mb-4" />
        <p className="text-white/30 text-sm">Cargando datos del sistema...</p>
      </div>
    );
  }

  /* ── DASHBOARD ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-[#060b14]/90 backdrop-blur-lg border-b border-white/[0.06] px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <Activity size={16} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight">Dualis Ops</h1>
              <p className="text-[9px] text-white/20 font-mono">
                {lastRefresh ? `Actualizado: ${lastRefresh.toLocaleTimeString('es-VE')}` : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllData}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-all disabled:opacity-40"
              title="Refrescar"
            >
              <RefreshCw size={14} className={`text-white/40 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all"
              title="Cerrar sesión ops"
            >
              <LogOut size={14} className="text-rose-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── KPI Grid ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={Building2} label="Negocios" value={stats.totalBiz} color="indigo" sub={`+${stats.recentBiz} esta semana`} />
          <KpiCard icon={Users} label="Usuarios" value={stats.totalUsers} color="emerald" sub={`${stats.activeUsers} activos`} />
          <KpiCard icon={Globe} label="Con Subdomain" value={stats.withSlug} color="sky" sub={`${stats.totalBiz - stats.withSlug} sin slug`} />
          <KpiCard icon={TrendingUp} label="Nuevos (7d)" value={stats.recentUsers} color="violet" sub="usuarios registrados" />
        </div>

        {/* ── User Status ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatusCard icon={CheckCircle2} label="Activos" value={stats.activeUsers} total={stats.totalUsers} color="emerald" />
          <StatusCard icon={Clock} label="Pendientes" value={stats.pendingUsers} total={stats.totalUsers} color="amber" />
          <StatusCard icon={XCircle} label="Deshabilitados" value={stats.disabledUsers} total={stats.totalUsers} color="rose" />
        </div>

        {/* ── Plans ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Distribución de Planes</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.planCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([plan, count]) => (
              <div key={plan} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                <p className="text-[10px] font-bold text-white/30 uppercase">{plan}</p>
                <p className="text-lg font-black text-white">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Businesses Table ─────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Negocios ({businesses.length})</h2>
            <Wifi size={12} className="text-emerald-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-white/20 border-b border-white/[0.04] bg-white/[0.01]">
                  <th className="px-5 py-3">Negocio</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Slug</th>
                  <th className="px-5 py-3 text-right">Usuarios</th>
                  <th className="px-5 py-3 text-right">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {businesses.map(biz => (
                  <tr key={biz.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-bold text-white truncate max-w-[200px]">{biz.name}</p>
                      <p className="text-[9px] text-white/20 font-mono truncate">{biz.id.slice(0, 20)}...</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                        biz.plan === 'trial' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                        biz.plan === 'starter' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                        biz.plan === 'negocio' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-white/[0.06] text-white/30 border-white/[0.08]'
                      }`}>{biz.plan}</span>
                    </td>
                    <td className="px-5 py-3">
                      {tenants[biz.id] ? (
                        <span className="text-[10px] font-mono text-sky-400">{tenants[biz.id]}.dualis.online</span>
                      ) : (
                        <span className="text-[10px] text-white/15">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-white/60 text-sm">
                      {stats.bizUserCount[biz.id] || 0}
                    </td>
                    <td className="px-5 py-3 text-right text-[10px] text-white/25 font-mono">
                      {biz.createdAt ? new Date(biz.createdAt).toLocaleDateString('es-VE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent Users ────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Últimos usuarios registrados</h2>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {users
              .filter(u => u.createdAt)
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
              .slice(0, 15)
              .map(u => (
                <div key={u.uid} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{u.fullName || u.email}</p>
                    <p className="text-[9px] text-white/20">{u.email} · {u.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                      u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      u.status === 'PENDING_APPROVAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      u.status === 'DISABLED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      'bg-white/[0.06] text-white/30 border-white/[0.08]'
                    }`}>{u.status}</span>
                    <span className="text-[9px] text-white/15 font-mono">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-VE') : ''}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <p className="text-center text-[8px] text-white/10 font-mono uppercase tracking-widest pb-6">
          Dualis Ops Monitor · Solo lectura · Sesión anónima
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: number; color: string; sub: string }) {
  const colors: Record<string, string> = {
    indigo:  'bg-indigo-500/[0.08] border-indigo-500/20 text-indigo-400',
    emerald: 'bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400',
    sky:     'bg-sky-500/[0.08] border-sky-500/20 text-sky-400',
    violet:  'bg-violet-500/[0.08] border-violet-500/20 text-violet-400',
  };
  const iconColors: Record<string, string> = {
    indigo: 'text-indigo-400', emerald: 'text-emerald-400', sky: 'text-sky-400', violet: 'text-violet-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <Icon size={16} className={`${iconColors[color]} mb-2`} />
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mt-0.5">{label}</p>
      <p className="text-[9px] text-white/15 mt-1">{sub}</p>
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, total, color }: { icon: any; label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barColors: Record<string, string> = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  const textColors: Record<string, string> = { emerald: 'text-emerald-400', amber: 'text-amber-400', rose: 'text-rose-400' };
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className={textColors[color]} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
        </div>
        <span className={`text-lg font-black ${textColors[color]}`}>{value}</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColors[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[9px] text-white/15 mt-1.5">{pct}% del total ({total})</p>
    </div>
  );
}
