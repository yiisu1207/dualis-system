import React, { useEffect, useState, useMemo } from 'react';
import {
  Shield, Search, ChevronRight, Check, X, Loader2, Users,
  AlertTriangle, Clock, Zap, CreditCard, Gift,
  Building2,
  Eye, EyeOff, History, Tag, Plus, Minus,
  DollarSign, BadgeCheck, ChevronDown,
  UserPlus, UserX, KeyRound, UserCog, ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import {
  collection, onSnapshot, doc, updateDoc, serverTimestamp,
  query, where, setDoc, deleteDoc, getDocs,
} from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { db, firebaseConfig } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Config — leído desde .env.local (nunca hardcodeado) ─────────────────────
const SUPER_ADMIN_EMAILS: string[] = [
  import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? '',
].filter(Boolean);
const ADMIN_PIN: string = import.meta.env.VITE_SUPER_ADMIN_PIN ?? '';

// ─── Preset promos ─────────────────────────────────────────────────────────────
const PRESET_PROMOS = [
  { id: 'pioneer', code: 'PIONEER2025', label: 'Pionero Dualis', discountPct: 30, months: 3, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', description: 'Cliente pionero — 30% descuento por 3 meses' },
  { id: 'launch',  code: 'LAUNCH50',    label: 'Lanzamiento',    discountPct: 50, months: 1, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25', description: 'Promo de lanzamiento — 50% primer mes' },
  { id: 'referral',code: 'REF25',       label: 'Referido',       discountPct: 25, months: 2, color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/25',    description: 'Cliente referido — 25% por 2 meses' },
  { id: 'annual',  code: 'ANNUAL20',    label: 'Pago Anual',     discountPct: 20, months: 12, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', description: 'Pago anual anticipado — 20% descuento' },
];

const PLAN_BASE = { starter: 24, negocio: 49, enterprise: 89 } as const;
type PlanId = 'starter' | 'negocio' | 'enterprise';

type UserRole = 'owner' | 'admin' | 'ventas' | 'auditor' | 'staff' | 'member' | 'pending';
const ROLES: { id: UserRole; label: string; color: string }[] = [
  { id: 'owner',   label: 'Owner',   color: 'text-indigo-400' },
  { id: 'admin',   label: 'Admin',   color: 'text-violet-400' },
  { id: 'ventas',  label: 'Ventas',  color: 'text-sky-400' },
  { id: 'auditor', label: 'Auditor', color: 'text-emerald-400' },
  { id: 'staff',   label: 'Staff',   color: 'text-amber-400' },
  { id: 'member',  label: 'Miembro', color: 'text-slate-400' },
];

interface BizUser {
  uid: string;
  displayName?: string;
  email?: string;
  role: UserRole;
  status?: string;
  createdAt?: any;
  businessId?: string;
}

// Secondary Firebase app — used to create users without disturbing admin session
function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'secondary');
  const app = existing ?? initializeApp(firebaseConfig, 'secondary');
  return getAuth(app);
}

const planColor: Record<string, string> = {
  trial:      'bg-sky-500/15 text-sky-400 border-sky-500/30',
  starter:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  negocio:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  enterprise: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  expired:    'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubAddOns { extraUsers:number; extraProducts:number; extraSucursales:number; visionLab:boolean; conciliacion:boolean; rrhhPro:boolean; }
interface SubPromo   { code:string; discountPct:number; months:number; description:string; appliedAt?:string; appliedBy?:string; }
interface SubHistory { action:string; plan?:string; paymentMethod?:string; paymentRef?:string; amountUsd?:number; promo?:SubPromo; date:string; adminEmail:string; note?:string; }
interface PendingPayment { plan:string; months:number; amountUsd:number; payMethod:string; reference:string; note?:string; submittedAt?:any; submittedBy?:string; }
interface Subscription { plan:string; status:string; trialEndsAt?:any; currentPeriodEnd?:any; addOns?:SubAddOns; promo?:SubPromo; history?:SubHistory[]; paymentMethod?:string; paymentRef?:string; lastPaymentAt?:string; amountUsd?:number; pendingPayment?:PendingPayment; }
interface BizRecord { id:string; companyName?:string; ownerEmail?:string; ownerId?:string; createdAt?:any; subscription?:Subscription; }

function daysLeft(ts: any): number | null {
  if (!ts) return null;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
function fmt(ts: any): string {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-VE', { day:'2-digit', month:'short', year:'numeric' });
}

// ─── PIN Gate ─────────────────────────────────────────────────────────────────
function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(false);
  const navigate = useNavigate();

  const submit = () => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('dualis_op_auth', '1');
      onAuth();
    } else {
      setErr(true);
      setPin('');
      setTimeout(() => setErr(false), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4">
            <Shield size={26} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Panel Operaciones</h1>
          <p className="text-white/25 text-sm mt-1">Dualis Internal — Acceso restringido</p>
        </div>
        <div className={`rounded-2xl border p-6 transition-all ${err ? 'border-rose-500/40 bg-rose-500/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
          <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">PIN de acceso</label>
          <div className="relative mb-4">
            <input
              type={show ? 'text' : 'password'}
              value={pin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && submit()}
              placeholder="••••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 pr-12"
            />
            <button onClick={() => setShow((s: boolean) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {err && <p className="text-xs text-rose-400 font-bold mb-3 text-center">PIN incorrecto</p>}
          <button onClick={submit} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5" style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            Entrar
          </button>
        </div>
        <button onClick={() => navigate(-1)} className="w-full mt-4 text-center text-xs text-white/15 hover:text-white/40 transition-colors">← Volver</button>
      </div>
    </div>
  );
}

// ─── Admin Login Gate ─────────────────────────────────────────────────────────
function AdminLoginGate() {
  const [email, setEmail]   = useState(import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? '');
  const [pass, setPass]     = useState('');
  const [show, setShow]     = useState(false);
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setErr('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getAuth(), email, pass);
      // Auth state updates → emailAuth recalculates → panel opens
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) setErr('Contraseña incorrecta');
      else if (code.includes('user-not-found')) setErr('Email no encontrado');
      else if (code.includes('too-many-requests')) setErr('Demasiados intentos. Espera unos minutos.');
      else setErr('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4">
            <Shield size={26} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Panel Operaciones</h1>
          <p className="text-white/25 text-sm mt-1">Autenticación requerida</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Email admin</label>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Contraseña</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pass}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPass(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && submit()}
                placeholder="••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 pr-12"
              />
              <button onClick={() => setShow((s: boolean) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {err && <p className="text-xs text-rose-400 font-bold text-center">{err}</p>}
          <button
            onClick={submit}
            disabled={loading || !email || !pass}
            className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Iniciar sesión
          </button>
        </div>
        <button onClick={() => navigate(-1)} className="w-full mt-4 text-center text-xs text-white/15 hover:text-white/40 transition-colors">← Volver</button>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function SuperAdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Auth layers
  const [pinAuth, setPinAuth] = useState(() => sessionStorage.getItem('dualis_op_auth') === '1');
  const emailAuth = !!user?.email && SUPER_ADMIN_EMAILS.includes(user.email);

  // Data
  const [businesses, setBusinesses] = useState<BizRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all'|'trial'|'active'|'expired'>('all');
  const [selected, setSelected] = useState<BizRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<'plan'|'promo'|'history'|'users'>('plan');

  // User management
  const [bizUsers, setBizUsers]         = useState<BizUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newName, setNewName]           = useState('');
  const [newEmail, setNewEmail]         = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [newRole, setNewRole]           = useState<UserRole>('ventas');
  const [newPwShow, setNewPwShow]       = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError]   = useState('');
  const [userAction, setUserAction]     = useState<{uid:string; type:'role'|'delete'|'disable'} | null>(null);
  const [roleMenuUid, setRoleMenuUid]   = useState<string|null>(null);

  // Activation form
  const [actPlan, setActPlan]               = useState<PlanId>('negocio');
  const [actMonths, setActMonths]           = useState(1);
  const [actMethod, setActMethod]           = useState('binance');
  const [actRef, setActRef]                 = useState('');
  const [actAmount, setActAmount]           = useState(49);
  const [actNote, setActNote]               = useState('');
  const [actExtraUsers, setActExtraUsers]   = useState(0);
  const [actExtraProds, setActExtraProds]   = useState(0);
  const [actExtraSuc, setActExtraSuc]       = useState(0);
  const [actVision, setActVision]           = useState(false);
  const [actConcil, setActConcil]           = useState(false);
  const [actRrhh, setActRrhh]               = useState(false);
  const [saving, setSaving]                 = useState(false);

  // Pending approval users
  const [pendingUsers, setPendingUsers]     = useState<Array<{uid:string; email:string; fullName:string; businessId:string; createdAt:string; activating:boolean}>>([]);

  // Promo form
  const [promoPreset, setPromoPreset]       = useState<string | null>(null);
  const [promoCode, setPromoCode]           = useState('');
  const [promoPct, setPromoPct]             = useState(30);
  const [promoMonths, setPromoMonths]       = useState(3);
  const [promoDesc, setPromoDesc]           = useState('');
  const [promoSaving, setPromoSaving]       = useState(false);

  // Load pending approval users
  useEffect(() => {
    if (!pinAuth || !emailAuth) return;
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'PENDING_APPROVAL')),
      snap => {
        const users = snap.docs.map(d => {
          const data = d.data();
          return {
            uid: d.id,
            email: data.email ?? '',
            fullName: data.fullName ?? data.displayName ?? '',
            businessId: data.businessId ?? data.empresa_id ?? '',
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt?.toDate?.()?.toISOString() ?? ''),
            activating: false,
          };
        });
        users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPendingUsers(users);
      }
    );
    return unsub;
  }, [pinAuth, emailAuth]);

  const handleActivateUser = async (uid: string) => {
    setPendingUsers(prev => prev.map(u => u.uid === uid ? { ...u, activating: true } : u));
    try {
      await updateDoc(doc(db, 'users', uid), { status: 'ACTIVE' });
    } catch (e) {
      console.error('Error activando usuario:', e);
      setPendingUsers(prev => prev.map(u => u.uid === uid ? { ...u, activating: false } : u));
    }
  };

  // Load all businesses
  useEffect(() => {
    if (!pinAuth || !emailAuth) return;
    const unsub = onSnapshot(
      collection(db, 'businesses'),
      async snap => {
        // Map field 'name' → companyName (onboarding saves 'name', not 'companyName')
        const docs: BizRecord[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            companyName: data.companyName || data.name || '',
          } as BizRecord;
        });

        // Enrich with owner email from users collection
        const ownerIds = docs.map(d => d.ownerId).filter(Boolean) as string[];
        if (ownerIds.length > 0) {
          try {
            const usersSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', ownerIds.slice(0, 30))));
            const emailMap: Record<string, string> = {};
            usersSnap.forEach(u => { emailMap[u.id] = u.data().email ?? ''; });
            docs.forEach(d => { if (d.ownerId && emailMap[d.ownerId]) d.ownerEmail = emailMap[d.ownerId]; });
          } catch (_) { /* ignore enrichment errors */ }
        }

        docs.sort((a, b) => {
          const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt?.toDate?.()?.getTime() ?? 0);
          const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt?.toDate?.()?.getTime() ?? 0);
          return tb - ta;
        });
        setBusinesses(docs);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [pinAuth, emailAuth]);

  // Sync form when selected business changes
  useEffect(() => {
    if (!selected) return;
    const sub = selected.subscription;
    if (sub?.plan && sub.plan !== 'trial') setActPlan(sub.plan as PlanId);
    setActAmount(PLAN_BASE[sub?.plan as PlanId] ?? 49);
    setActExtraUsers(sub?.addOns?.extraUsers ?? 0);
    setActExtraProds(sub?.addOns?.extraProducts ?? 0);
    setActExtraSuc(sub?.addOns?.extraSucursales ?? 0);
    setActVision(sub?.addOns?.visionLab ?? false);
    setActConcil(sub?.addOns?.conciliacion ?? false);
    setActRrhh(sub?.addOns?.rrhhPro ?? false);
  }, [selected?.id]);

  // Load users when switching to users tab or selecting a business
  useEffect(() => {
    if (!selected || drawerTab !== 'users') { setBizUsers([]); return; }
    setLoadingUsers(true);
    const q = query(collection(db, 'users'), where('businessId', '==', selected.id));
    const unsub = onSnapshot(q, snap => {
      setBizUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as BizUser)));
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return unsub;
  }, [selected?.id, drawerTab]);

  // ── User handlers ──────────────────────────────────────────────────────────

  const handleCreateUser = async () => {
    if (!selected || !newEmail.trim() || !newPassword.trim()) return;
    setCreatingUser(true);
    setCreateError('');
    try {
      const secAuth = getSecondaryAuth();
      const cred    = await createUserWithEmailAndPassword(secAuth, newEmail.trim(), newPassword);
      const uid     = cred.user.uid;
      // Write Firestore profile
      await setDoc(doc(db, 'users', uid), {
        uid, email: newEmail.trim(),
        displayName: newName.trim() || newEmail.split('@')[0],
        role: newRole, status: 'ACTIVE',
        businessId: selected.id, empresa_id: selected.id,
        createdAt: serverTimestamp(),
        createdByAdmin: user?.email ?? 'admin',
      });
      // Also write to members subcollection
      await setDoc(doc(db, 'businesses', selected.id, 'members', uid), {
        uid, role: newRole, joinedAt: serverTimestamp(),
      });
      // Sign out from secondary app
      await secAuth.signOut();
      setShowCreateUser(false);
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('ventas');
    } catch (e: any) {
      setCreateError(e?.message ?? 'Error al crear usuario');
    }
    setCreatingUser(false);
  };

  const handleResetPassword = async (email: string) => {
    const { sendPasswordResetEmail: resetEmail } = await import('firebase/auth');
    const { auth: mainAuth } = await import('../firebase/config');
    await resetEmail(mainAuth, email);
  };

  const handleChangeRole = async (uid: string, role: UserRole) => {
    if (!selected) return;
    await updateDoc(doc(db, 'users', uid), { role });
    await updateDoc(doc(db, 'businesses', selected.id, 'members', uid), { role });
    setRoleMenuUid(null);
  };

  const handleToggleDisable = async (bUser: BizUser) => {
    const nextStatus = bUser.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    await updateDoc(doc(db, 'users', bUser.uid), { status: nextStatus });
  };

  const handleRemoveFromBusiness = async (uid: string) => {
    await updateDoc(doc(db, 'users', uid), { businessId: null, empresa_id: null, status: 'PENDING_SETUP' });
    await deleteDoc(doc(db, 'businesses', selected!.id, 'members', uid));
    setUserAction(null);
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total    = businesses.length;
    const active   = businesses.filter((b: BizRecord) => b.subscription?.status === 'active').length;
    const trial    = businesses.filter((b: BizRecord) => {
      if (b.subscription?.status !== 'trial') return false;
      const dl = daysLeft(b.subscription.trialEndsAt);
      return dl !== null && dl > 0;
    }).length;
    const expired  = businesses.filter((b: BizRecord) => {
      if (b.subscription?.status === 'expired') return true;
      if (b.subscription?.status === 'trial') {
        const dl = daysLeft(b.subscription.trialEndsAt);
        return dl !== null && dl <= 0;
      }
      return false;
    }).length;
    const mrr = businesses.reduce((acc: number, b: BizRecord) => {
      if (b.subscription?.status !== 'active') return acc;
      const base = PLAN_BASE[b.subscription.plan as PlanId] ?? 0;
      const add  = (b.subscription.addOns?.extraUsers ?? 0) * 3
                 + (b.subscription.addOns?.extraSucursales ?? 0) * 9
                 + (b.subscription.addOns?.visionLab ? 24 : 0)
                 + (b.subscription.addOns?.conciliacion ? 12 : 0)
                 + (b.subscription.addOns?.rrhhPro ? 15 : 0);
      const disc = b.subscription.promo?.discountPct ?? 0;
      return acc + (base + add) * (1 - disc / 100);
    }, 0);
    return { total, active, trial, expired, mrr };
  }, [businesses]);

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return businesses.filter((b: BizRecord) => {
      const name = (b.companyName ?? b.id).toLowerCase();
      const email = (b.ownerEmail ?? '').toLowerCase();
      const q = search.toLowerCase();
      if (q && !name.includes(q) && !email.includes(q) && !b.id.includes(q)) return false;

      const status = b.subscription?.status ?? 'none';
      const dl = daysLeft(b.subscription?.trialEndsAt);
      const reallyExpired = status === 'expired' || (status === 'trial' && dl !== null && dl <= 0);
      const reallyTrial   = status === 'trial' && (dl === null || dl > 0);

      if (filterTab === 'active')  return status === 'active';
      if (filterTab === 'trial')   return reallyTrial;
      if (filterTab === 'expired') return reallyExpired;
      return true;
    });
  }, [businesses, search, filterTab]);

  // ── Activate plan ────────────────────────────────────────────────────────
  const handleActivate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + actMonths);
      const histEntry: SubHistory = {
        action: 'activate', plan: actPlan, paymentMethod: actMethod,
        paymentRef: actRef, amountUsd: actAmount,
        date: new Date().toISOString(), adminEmail: user?.email ?? 'admin',
        note: actNote || undefined,
      };
      const prevHistory: SubHistory[] = selected.subscription?.history ?? [];
      await updateDoc(doc(db, 'businesses', selected.id), {
        'subscription.plan':             actPlan,
        'subscription.status':           'active',
        'subscription.trialEndsAt':      null,
        'subscription.currentPeriodEnd': periodEnd,
        'subscription.paymentMethod':    actMethod,
        'subscription.paymentRef':       actRef,
        'subscription.lastPaymentAt':    new Date().toISOString(),
        'subscription.amountUsd':        actAmount,
        'subscription.addOns': {
          extraUsers: actExtraUsers, extraProducts: actExtraProds,
          extraSucursales: actExtraSuc, visionLab: actVision,
          conciliacion: actConcil, rrhhPro: actRrhh,
        },
        'subscription.history': [...prevHistory, histEntry],
        'subscription.updatedAt': serverTimestamp(),
      });
      setSelected((prev: BizRecord | null) => prev ? {
        ...prev,
        subscription: {
          ...(prev.subscription ?? {}),
          plan: actPlan, status: 'active',
          currentPeriodEnd: periodEnd, paymentMethod: actMethod, paymentRef: actRef,
          lastPaymentAt: new Date().toISOString(), amountUsd: actAmount,
          history: [...prevHistory, histEntry],
        }
      } : null);
      setActRef(''); setActNote('');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ── Apply promo ──────────────────────────────────────────────────────────
  const handlePromo = async () => {
    if (!selected) return;
    setPromoSaving(true);
    const promo: SubPromo = {
      code: promoCode || 'CUSTOM',
      discountPct: promoPct,
      months: promoMonths,
      description: promoDesc || `Promo ${promoPct}% por ${promoMonths} meses`,
      appliedAt: new Date().toISOString(),
      appliedBy: user?.email ?? 'admin',
    };
    const histEntry: SubHistory = {
      action: 'promo', promo,
      date: new Date().toISOString(), adminEmail: user?.email ?? 'admin',
    };
    const prevHistory: SubHistory[] = selected.subscription?.history ?? [];
    try {
      await updateDoc(doc(db, 'businesses', selected.id), {
        'subscription.promo':   promo,
        'subscription.history': [...prevHistory, histEntry],
        'subscription.updatedAt': serverTimestamp(),
      });
      setSelected((prev: BizRecord | null) => prev ? {
        ...prev,
        subscription: { ...(prev.subscription ?? {}), promo, history: [...prevHistory, histEntry] }
      } : null);
    } catch (e) { console.error(e); }
    setPromoSaving(false);
  };

  // ── Cancel / expire ──────────────────────────────────────────────────────
  const handleCancel = async (biz: BizRecord) => {
    const histEntry: SubHistory = {
      action: 'cancel', date: new Date().toISOString(), adminEmail: user?.email ?? 'admin',
    };
    const prevHistory: SubHistory[] = biz.subscription?.history ?? [];
    await updateDoc(doc(db, 'businesses', biz.id), {
      'subscription.status':    'cancelled',
      'subscription.history':   [...prevHistory, histEntry],
      'subscription.updatedAt': serverTimestamp(),
    });
  };

  // ── Approve pending payment ──────────────────────────────────────────────
  const handleApprovePending = async () => {
    if (!selected) return;
    const pp = selected.subscription?.pendingPayment;
    if (!pp) return;
    setSaving(true);
    try {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + pp.months);
      const histEntry: SubHistory = {
        action: 'activate',
        plan: pp.plan,
        paymentMethod: pp.payMethod,
        paymentRef: pp.reference,
        amountUsd: pp.amountUsd,
        date: new Date().toISOString(),
        adminEmail: user?.email ?? 'admin',
        note: `Aprobado desde solicitud cliente. ${pp.note ?? ''}`.trim(),
      };
      const prevHistory: SubHistory[] = selected.subscription?.history ?? [];
      await updateDoc(doc(db, 'businesses', selected.id), {
        'subscription.plan':             pp.plan,
        'subscription.status':           'active',
        'subscription.trialEndsAt':      null,
        'subscription.currentPeriodEnd': periodEnd,
        'subscription.paymentMethod':    pp.payMethod,
        'subscription.paymentRef':       pp.reference,
        'subscription.lastPaymentAt':    new Date().toISOString(),
        'subscription.amountUsd':        pp.amountUsd,
        'subscription.pendingPayment':   null,
        'subscription.history':          [...prevHistory, histEntry],
        'subscription.updatedAt':        serverTimestamp(),
      });
      setSelected((prev: BizRecord | null) => prev ? {
        ...prev,
        subscription: {
          ...(prev.subscription ?? {}),
          plan: pp.plan as any, status: 'active',
          currentPeriodEnd: periodEnd, paymentMethod: pp.payMethod,
          paymentRef: pp.reference, lastPaymentAt: new Date().toISOString(),
          amountUsd: pp.amountUsd, pendingPayment: undefined,
          history: [...prevHistory, histEntry],
        }
      } : null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDiscardPending = async () => {
    if (!selected) return;
    await updateDoc(doc(db, 'businesses', selected.id), {
      'subscription.pendingPayment': null,
    });
    setSelected((prev: BizRecord | null) => prev ? {
      ...prev,
      subscription: { ...(prev.subscription ?? {}), pendingPayment: undefined }
    } : null);
  };

  // ── Preset promo apply helper ────────────────────────────────────────────
  const applyPreset = (p: typeof PRESET_PROMOS[0]) => {
    setPromoPreset(p.id);
    setPromoCode(p.code);
    setPromoPct(p.discountPct);
    setPromoMonths(p.months);
    setPromoDesc(p.description);
  };

  if (!pinAuth || !emailAuth) {
    if (!pinAuth) return <PinGate onAuth={() => setPinAuth(true)} />;
    return <AdminLoginGate />;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#070b14]/90 backdrop-blur-xl border-b border-white/[0.07] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <Shield size={17} className="text-indigo-400" />
          </div>
          <div>
            <p className="font-black text-white text-sm tracking-tight">Dualis Operaciones</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Panel Administrativo Interno</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/25 font-medium">{user?.email}</span>
          <button
            onClick={() => { sessionStorage.removeItem('dualis_op_auth'); navigate('/'); }}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white/40 border border-white/[0.07] hover:bg-white/[0.06] transition-all"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main content ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">

          {/* Pending approval section */}
          {pendingUsers.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-amber-400 shrink-0" />
                <p className="text-xs font-black uppercase tracking-widest text-amber-400">
                  Cuentas pendientes de activación
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px]">
                    {pendingUsers.length}
                  </span>
                </p>
              </div>
              <div className="space-y-2">
                {pendingUsers.map(u => (
                  <div key={u.uid} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                    <div className="h-9 w-9 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <span className="text-amber-400 font-black text-sm">
                        {(u.fullName || u.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{u.fullName || '—'}</p>
                      <p className="text-xs text-white/35 truncate">{u.email}</p>
                      {u.businessId && (
                        <p className="text-[9px] font-mono text-white/20 truncate mt-0.5">{u.businessId}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {u.createdAt && (
                        <p className="text-[9px] text-white/20 mb-1.5">
                          {new Date(u.createdAt).toLocaleDateString('es-VE')}
                        </p>
                      )}
                      <button
                        onClick={() => handleActivateUser(u.uid)}
                        disabled={u.activating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {u.activating
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Check size={11} />
                        }
                        Activar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label:'Total negocios', val: kpis.total,   icon: Building2,   color:'text-white',        bg:'bg-white/[0.04]',      border:'border-white/[0.07]' },
              { label:'Activos',        val: kpis.active,  icon: BadgeCheck,  color:'text-emerald-400',  bg:'bg-emerald-500/[0.07]', border:'border-emerald-500/20' },
              { label:'En prueba',      val: kpis.trial,   icon: Clock,       color:'text-sky-400',      bg:'bg-sky-500/[0.07]',     border:'border-sky-500/20' },
              { label:'Expirados',      val: kpis.expired, icon: AlertTriangle,color:'text-rose-400',    bg:'bg-rose-500/[0.07]',    border:'border-rose-500/20' },
              { label:'MRR estimado',   val: `$${kpis.mrr.toFixed(0)}`, icon: DollarSign, color:'text-amber-400', bg:'bg-amber-500/[0.07]', border:'border-amber-500/20' },
            ].map(k => (
              <div key={k.label} className={`rounded-2xl border ${k.border} ${k.bg} p-4 flex flex-col gap-1`}>
                <k.icon size={14} className={k.color} />
                <p className={`text-2xl font-black ${k.color} tracking-tight`}>{k.val}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Filter + Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, email o ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {(['all','active','trial','expired'] as const).map(t => (
                <button
                  key={t} onClick={() => setFilterTab(t)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    filterTab === t ? 'bg-white/[0.1] text-white' : 'text-white/25 hover:text-white/50'
                  }`}
                >
                  {t === 'all' ? 'Todos' : t === 'active' ? 'Activos' : t === 'trial' ? 'Prueba' : 'Expirados'}
                  <span className={`ml-1.5 text-[8px] font-black ${filterTab === t ? 'text-indigo-400' : 'text-white/15'}`}>
                    {t === 'all' ? kpis.total : t === 'active' ? kpis.active : t === 'trial' ? kpis.trial : kpis.expired}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Business list */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-white/20 text-sm font-medium">Sin resultados</div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                {['Negocio','Plan','Estado','Vence / Período','Promo','Acción'].map((h, i) => (
                  <div key={h} className={`text-[9px] font-black uppercase tracking-widest text-white/20 ${
                    i === 0 ? 'col-span-3' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-2' : i === 3 ? 'col-span-2' : i === 4 ? 'col-span-2' : 'col-span-1'
                  }`}>{h}</div>
                ))}
              </div>

              {filtered.map((biz: BizRecord) => {
                const sub  = biz.subscription;
                const dl   = daysLeft(sub?.trialEndsAt ?? sub?.currentPeriodEnd);
                const isExpired = sub?.status === 'expired' || sub?.status === 'cancelled' ||
                                  (sub?.status === 'trial' && dl !== null && dl <= 0);
                const statusLabel = isExpired ? 'Expirado' : sub?.status === 'active' ? 'Activo' : `Trial`;
                const isActive = selected?.id === biz.id;

                return (
                  <div
                    key={biz.id}
                    onClick={() => { setSelected(biz); setDrawerTab('plan'); }}
                    className={`grid grid-cols-12 gap-4 px-5 py-4 border-b border-white/[0.04] cursor-pointer transition-all ${
                      isActive ? 'bg-indigo-500/[0.08]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {/* Name */}
                    <div className="col-span-3 flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-black text-white text-sm truncate">{biz.companyName ?? biz.id}</p>
                        {biz.subscription?.pendingPayment && (
                          <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/35 text-[8px] font-black text-amber-400 uppercase tracking-widest">
                            <DollarSign size={8} /> Pago
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/20 truncate">{biz.ownerEmail ?? biz.id}</p>
                    </div>

                    {/* Plan */}
                    <div className="col-span-2 flex items-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${planColor[sub?.plan ?? 'trial'] ?? planColor.trial}`}>
                        {sub?.plan ?? 'Trial'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isExpired ? 'bg-rose-500' : sub?.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-sky-500 animate-pulse'
                      }`} />
                      <span className={`text-xs font-bold ${isExpired ? 'text-rose-400' : sub?.status === 'active' ? 'text-emerald-400' : 'text-sky-400'}`}>
                        {statusLabel}
                        {dl !== null && dl > 0 && sub?.status !== 'active' && ` (${dl}d)`}
                      </span>
                    </div>

                    {/* Period */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-white/30 font-medium">
                        {sub?.status === 'active' ? fmt(sub.currentPeriodEnd) : sub?.status === 'trial' ? fmt(sub.trialEndsAt) : '—'}
                      </span>
                    </div>

                    {/* Promo */}
                    <div className="col-span-2 flex items-center">
                      {sub?.promo ? (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-400 uppercase tracking-widest">
                          <Tag size={9} />{sub.promo.code}
                        </span>
                      ) : <span className="text-white/15 text-xs">—</span>}
                    </div>

                    {/* Action */}
                    <div className="col-span-1 flex items-center justify-end">
                      <ChevronRight size={14} className={`transition-colors ${isActive ? 'text-indigo-400' : 'text-white/15'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right Drawer ──────────────────────────────────────────────── */}
        {selected && (
          <div className="w-[420px] shrink-0 border-l border-white/[0.07] bg-[#080d1b] overflow-y-auto flex flex-col">
            {/* Drawer header */}
            <div className="sticky top-0 bg-[#080d1b] border-b border-white/[0.06] px-5 py-4 z-10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-white text-base tracking-tight">{selected.companyName ?? selected.id}</p>
                  <p className="text-xs text-white/25 mt-0.5">{selected.ownerEmail ?? selected.id}</p>
                  <p className="text-[9px] text-white/15 mt-0.5 font-mono">ID: {selected.id}</p>
                </div>
                <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:bg-white/[0.08] transition-all shrink-0">
                  <X size={14} />
                </button>
              </div>

              {/* Drawer tabs */}
              <div className="flex gap-1 mt-4 p-1 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                {([
                  { id:'plan',    icon: CreditCard, label:'Suscripción' },
                  { id:'promo',   icon: Gift,       label:'Promo' },
                  { id:'users',   icon: Users,      label:'Usuarios' },
                  { id:'history', icon: History,    label:'Historial' },
                ] as const).map(t => (
                  <button
                    key={t.id} onClick={() => setDrawerTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      drawerTab === t.id ? 'bg-white/[0.1] text-white' : 'text-white/25 hover:text-white/50'
                    }`}
                  >
                    <t.icon size={11} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tab: Plan ─────────────────────────────────────────────── */}
            {drawerTab === 'plan' && (
              <div className="p-5 space-y-5">

                {/* ── Pending payment alert ─────────────────────────────── */}
                {selected.subscription?.pendingPayment && (() => {
                  const pp = selected.subscription!.pendingPayment!;
                  const submittedDate = pp.submittedAt?.toDate
                    ? pp.submittedAt.toDate().toLocaleDateString('es-VE', { day:'2-digit', month:'short' })
                    : pp.submittedAt ? new Date(pp.submittedAt).toLocaleDateString('es-VE') : '—';
                  return (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <DollarSign size={14} className="text-amber-400" />
                          </div>
                          <p className="text-sm font-black text-amber-400">Pago pendiente</p>
                        </div>
                        <span className="text-[9px] font-medium text-white/25">{submittedDate}</span>
                      </div>

                      <div className="space-y-1.5">
                        {[
                          { l: 'Plan',       v: pp.plan },
                          { l: 'Meses',      v: `${pp.months} mes${pp.months > 1 ? 'es' : ''}` },
                          { l: 'Monto',      v: `$${pp.amountUsd} USD` },
                          { l: 'Método',     v: pp.payMethod },
                          { l: 'Referencia', v: pp.reference },
                          ...(pp.note ? [{ l: 'Nota', v: pp.note }] : []),
                          ...(pp.submittedBy ? [{ l: 'Enviado por', v: pp.submittedBy }] : []),
                        ].map(r => (
                          <div key={r.l} className="flex justify-between items-start gap-2">
                            <span className="text-[10px] text-white/25 font-medium shrink-0">{r.l}</span>
                            <span className="text-[11px] font-black text-white/70 text-right break-all">{r.v}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleApprovePending}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Aprobar y activar
                        </button>
                        <button
                          onClick={handleDiscardPending}
                          className="px-4 py-2.5 rounded-xl border border-rose-500/25 text-rose-400/60 hover:text-rose-400 hover:border-rose-500/40 text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Current status summary */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">Estado actual</p>
                  {[
                    { l:'Plan',    v: selected.subscription?.plan ?? '—' },
                    { l:'Estado',  v: selected.subscription?.status ?? '—' },
                    { l:'Vence',   v: fmt(selected.subscription?.currentPeriodEnd ?? selected.subscription?.trialEndsAt) },
                    { l:'Último pago', v: selected.subscription?.lastPaymentAt ? new Date(selected.subscription.lastPaymentAt).toLocaleDateString('es-VE') : '—' },
                    { l:'Monto',   v: selected.subscription?.amountUsd ? `$${selected.subscription.amountUsd}` : '—' },
                    { l:'Método',  v: selected.subscription?.paymentMethod ?? '—' },
                  ].map(r => (
                    <div key={r.l} className="flex justify-between items-center">
                      <span className="text-[10px] text-white/25 font-medium">{r.l}</span>
                      <span className="text-[11px] font-black text-white/60 capitalize">{r.v}</span>
                    </div>
                  ))}
                </div>

                {/* Plan selector */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-2">Plan a activar</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['starter','negocio','enterprise'] as PlanId[]).map(p => (
                      <button
                        key={p} onClick={() => { setActPlan(p); setActAmount(PLAN_BASE[p]); }}
                        className={`py-3 rounded-xl border text-center transition-all ${
                          actPlan === p ? 'border-indigo-500/50 bg-indigo-500/15' : 'border-white/[0.07] hover:border-white/[0.15]'
                        }`}
                      >
                        <p className={`text-[9px] font-black uppercase tracking-widest ${actPlan === p ? 'text-indigo-400' : 'text-white/25'}`}>{p}</p>
                        <p className={`text-sm font-black mt-0.5 ${actPlan === p ? 'text-white' : 'text-white/20'}`}>${PLAN_BASE[p]}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add-ons */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-2">Add-ons</p>
                  <div className="space-y-2">
                    {[
                      { label:`Usuarios extra (+$3 c/u)`,  val:actExtraUsers,   set:setActExtraUsers,   max:20 },
                      { label:`Productos extra (+$5/1000)`,val:actExtraProds,   set:setActExtraProds,   max:10 },
                      { label:`Sucursales extra (+$9 c/u)`,val:actExtraSuc,     set:setActExtraSuc,     max:10 },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className="flex-1 text-[10px] text-white/30 font-medium">{s.label}</span>
                        <button onClick={() => s.set(Math.max(0, s.val-1))} className="w-6 h-6 rounded-lg bg-white/[0.06] text-white/40 hover:bg-white/[0.12] flex items-center justify-center text-xs font-black">−</button>
                        <span className="w-6 text-center text-sm font-black text-white">{s.val}</span>
                        <button onClick={() => s.set(Math.min(s.max, s.val+1))} className="w-6 h-6 rounded-lg bg-white/[0.06] text-white/40 hover:bg-white/[0.12] flex items-center justify-center text-xs font-black">+</button>
                      </div>
                    ))}
                    {[
                      { label:'VisionLab IA (+$24)',       val:actVision,  set:setActVision  },
                      { label:'Conciliación (+$12)',       val:actConcil,  set:setActConcil  },
                      { label:'RRHH Pro (+$15)',           val:actRrhh,    set:setActRrhh    },
                    ].map(t => (
                      <button key={t.label} onClick={() => t.set(!t.val)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${t.val ? 'border-indigo-500/35 bg-indigo-500/10' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                        <span className={`text-[11px] font-bold ${t.val ? 'text-white/70' : 'text-white/25'}`}>{t.label}</span>
                        <span className={`text-[9px] font-black uppercase ${t.val ? 'text-indigo-400' : 'text-white/15'}`}>{t.val ? 'Activado' : 'Off'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment details */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Detalles del pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Meses</label>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                        <button onClick={() => setActMonths(Math.max(1, actMonths-1))} className="text-white/40 hover:text-white transition-colors"><Minus size={12}/></button>
                        <span className="flex-1 text-center text-sm font-black text-white">{actMonths}</span>
                        <button onClick={() => setActMonths(Math.min(24, actMonths+1))} className="text-white/40 hover:text-white transition-colors"><Plus size={12}/></button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Monto USD</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 text-sm font-bold">$</span>
                        <input type="number" value={actAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActAmount(Number(e.target.value))} className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm font-black text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Método de pago</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id:'binance',       label:'Binance Pay' },
                        { id:'pago_movil',    label:'Pago Móvil' },
                        { id:'transferencia', label:'Transferencia' },
                        { id:'paypal',        label:'PayPal' },
                        { id:'manual',        label:'Manual / Otro' },
                      ].map(m => (
                        <button key={m.id} onClick={() => setActMethod(m.id)} className={`py-2 px-3 rounded-xl border text-[10px] font-black transition-all ${actMethod === m.id ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400' : 'border-white/[0.06] text-white/20 hover:border-white/[0.14]'}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Referencia / Confirmación</label>
                    <input value={actRef} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActRef(e.target.value)} placeholder="TX12345 / Captura enviada" className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Nota interna (opcional)</label>
                    <input value={actNote} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActNote(e.target.value)} placeholder="Notas del pago..." className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  </div>
                </div>

                {/* Total preview */}
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-white/40 font-medium">Plan {actPlan} × {actMonths} mes{actMonths > 1 ? 'es' : ''}</span>
                    <span className="text-sm font-black text-white">${actAmount * actMonths}</span>
                  </div>
                  {selected.subscription?.promo && (
                    <div className="flex justify-between items-center text-amber-400 text-xs">
                      <span className="font-medium">Descuento promo {selected.subscription.promo.discountPct}%</span>
                      <span className="font-black">−${(actAmount * actMonths * selected.subscription.promo.discountPct / 100).toFixed(0)}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleActivate} disabled={saving}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Activar suscripción
                </button>

                <button
                  onClick={() => handleCancel(selected)}
                  className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-400/60 hover:text-rose-400 border border-rose-500/10 hover:border-rose-500/25 transition-all"
                >
                  Cancelar suscripción
                </button>
              </div>
            )}

            {/* ── Tab: Promo ────────────────────────────────────────────── */}
            {drawerTab === 'promo' && (
              <div className="p-5 space-y-5">
                {selected.subscription?.promo && (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag size={13} className="text-amber-400" />
                      <p className="text-xs font-black text-amber-400 uppercase tracking-widest">Promo activa</p>
                    </div>
                    <p className="text-sm font-black text-white">{selected.subscription.promo.code}</p>
                    <p className="text-xs text-white/40 mt-0.5">{selected.subscription.promo.description}</p>
                    <p className="text-xs text-amber-400 font-bold mt-2">−{selected.subscription.promo.discountPct}% por {selected.subscription.promo.months} meses</p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-3">Promos predefinidas</p>
                  <div className="space-y-2">
                    {PRESET_PROMOS.map(p => (
                      <button
                        key={p.id} onClick={() => applyPreset(p)}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                          promoPreset === p.id ? `${p.border} ${p.bg}` : 'border-white/[0.06] hover:border-white/[0.14]'
                        }`}
                      >
                        <Gift size={16} className={p.color} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-black ${promoPreset === p.id ? p.color : 'text-white/50'}`}>{p.label}</p>
                          <p className="text-[10px] text-white/25 font-medium truncate">{p.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-black ${promoPreset === p.id ? p.color : 'text-white/20'}`}>−{p.discountPct}%</p>
                          <p className="text-[9px] text-white/20">{p.months}m</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Personalizar</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Código</label>
                      <input value={promoCode} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromoCode(e.target.value.toUpperCase())} placeholder="MIPROME" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-mono uppercase" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Descuento %</label>
                      <input type="number" min={1} max={100} value={promoPct} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromoPct(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm font-black text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Duración (meses)</label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <button onClick={() => setPromoMonths(Math.max(1, promoMonths-1))} className="text-white/40 hover:text-white"><Minus size={12}/></button>
                      <span className="flex-1 text-center text-sm font-black text-white">{promoMonths}</span>
                      <button onClick={() => setPromoMonths(Math.min(24, promoMonths+1))} className="text-white/40 hover:text-white"><Plus size={12}/></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-white/20 mb-1 uppercase tracking-widest">Descripción</label>
                    <input value={promoDesc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromoDesc(e.target.value)} placeholder="Ej: Promo especial de lanzamiento..." className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                  </div>
                </div>

                <button
                  onClick={handlePromo} disabled={promoSaving || !promoCode}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#b45309,#d97706)' }}
                >
                  {promoSaving ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
                  Aplicar promo
                </button>
              </div>
            )}

            {/* ── Tab: Usuarios ─────────────────────────────────────────── */}
            {drawerTab === 'users' && (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Usuarios del negocio</p>
                  <button
                    onClick={() => { setShowCreateUser(true); setCreateError(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5"
                    style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                  >
                    <UserPlus size={11} /> Crear usuario
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>
                ) : bizUsers.length === 0 ? (
                  <div className="text-center py-12 text-white/20 text-sm">Sin usuarios registrados en este negocio</div>
                ) : (
                  <div className="space-y-2">
                    {bizUsers.map((u: BizUser) => {
                      const disabled = u.status === 'DISABLED';
                      const roleInfo = ROLES.find(r => r.id === u.role);
                      return (
                        <div key={u.uid} className={`rounded-2xl border p-4 transition-all ${disabled ? 'border-white/[0.04] opacity-50' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                          <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                              <span className="text-sm font-black text-indigo-400">
                                {(u.displayName ?? u.email ?? '?')[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-black text-white truncate">{u.displayName ?? '—'}</p>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${roleInfo?.color ?? 'text-white/30'}`}>
                                  {roleInfo?.label ?? u.role}
                                </span>
                                {disabled && <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Desactivado</span>}
                              </div>
                              <p className="text-[11px] text-white/25 mt-0.5 truncate">{u.email ?? '—'}</p>
                              <p className="text-[9px] text-white/15 font-mono mt-0.5 truncate">{u.uid}</p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/[0.05] flex-wrap">
                            {/* Role selector */}
                            <div className="relative">
                              <button
                                onClick={() => setRoleMenuUid(roleMenuUid === u.uid ? null : u.uid)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15] text-[10px] font-black text-white/40 transition-all"
                              >
                                <UserCog size={11} /> Rol <ChevronDown size={10} />
                              </button>
                              {roleMenuUid === u.uid && (
                                <div className="absolute left-0 top-full mt-1 z-50 rounded-xl border border-white/[0.1] bg-[#0d1424] shadow-2xl overflow-hidden min-w-[130px]">
                                  {ROLES.map(r => (
                                    <button
                                      key={r.id}
                                      onClick={() => handleChangeRole(u.uid, r.id)}
                                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-[11px] font-bold hover:bg-white/[0.06] transition-all ${r.color} ${u.role === r.id ? 'bg-white/[0.05]' : ''}`}
                                    >
                                      {u.role === r.id && <Check size={10} />}
                                      {r.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Reset password */}
                            {u.email && (
                              <button
                                onClick={async () => {
                                  await handleResetPassword(u.email!);
                                  alert(`Email de reseteo enviado a ${u.email}`);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-sky-500/30 hover:text-sky-400 text-[10px] font-black text-white/40 transition-all"
                              >
                                <KeyRound size={11} /> Resetear
                              </button>
                            )}

                            {/* Disable / enable */}
                            <button
                              onClick={() => handleToggleDisable(u)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all ${
                                disabled
                                  ? 'border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10'
                                  : 'border-white/[0.08] text-amber-400/60 hover:border-amber-500/25 hover:text-amber-400'
                              }`}
                            >
                              {disabled ? <><ShieldCheck size={11} /> Activar</> : <><ShieldOff size={11} /> Suspender</>}
                            </button>

                            {/* Remove from business */}
                            <button
                              onClick={() => setUserAction({ uid: u.uid, type: 'delete' })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/15 text-rose-400/50 hover:border-rose-500/30 hover:text-rose-400 text-[10px] font-black transition-all ml-auto"
                            >
                              <UserX size={11} /> Quitar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Create User Modal ────────────────────────────────────── */}
                {showCreateUser && (
                  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setShowCreateUser(false)}>
                    <div className="w-full max-w-sm bg-[#0d1424] rounded-2xl border border-white/[0.07] shadow-2xl p-6" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                            <UserPlus size={16} className="text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">Crear usuario</p>
                            <p className="text-[10px] text-white/25">{selected?.companyName ?? selected?.id}</p>
                          </div>
                        </div>
                        <button onClick={() => setShowCreateUser(false)} className="text-white/25 hover:text-white transition-colors"><X size={15} /></button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Nombre completo</label>
                          <input value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} placeholder="Juan Pérez" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Correo electrónico *</label>
                          <input type="email" value={newEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)} placeholder="usuario@empresa.com" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Contraseña temporal *</label>
                          <div className="relative">
                            <input type={newPwShow ? 'text' : 'password'} value={newPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} placeholder="Mín. 8 caracteres" className="w-full px-3 py-2.5 pr-10 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                            <button onClick={() => setNewPwShow((s: boolean) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">{newPwShow ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Rol</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {ROLES.filter(r => r.id !== 'member').map(r => (
                              <button key={r.id} onClick={() => setNewRole(r.id)} className={`py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${newRole === r.id ? `${r.color} border-current bg-current/10` : 'border-white/[0.07] text-white/20 hover:border-white/[0.14]'}`}>{r.label}</button>
                            ))}
                          </div>
                        </div>

                        {createError && (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                            <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                            <p className="text-xs text-rose-400 font-medium">{createError}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setShowCreateUser(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm font-bold text-white/30 hover:bg-white/[0.05] transition-all">Cancelar</button>
                          <button
                            onClick={handleCreateUser}
                            disabled={creatingUser || !newEmail.trim() || !newPassword.trim()}
                            className="flex-1 py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-40"
                            style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                          >
                            {creatingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            Crear
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Remove confirm ────────────────────────────────────────── */}
                {userAction?.type === 'delete' && (
                  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setUserAction(null)}>
                    <div className="w-full max-w-xs bg-[#0d1424] rounded-2xl border border-white/[0.07] shadow-2xl p-6" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center"><UserX size={18} className="text-rose-400" /></div>
                        <div>
                          <p className="font-black text-white text-sm">Quitar del negocio</p>
                          <p className="text-xs text-white/25 mt-0.5">El usuario perderá acceso inmediatamente</p>
                        </div>
                      </div>
                      <p className="text-xs text-white/30 mb-5 leading-relaxed">Su cuenta Firebase Auth no se elimina. Solo se desvincula de este negocio. Puede ser reasignado más adelante.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setUserAction(null)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm font-bold text-white/30 hover:bg-white/[0.05] transition-all">Cancelar</button>
                        <button onClick={() => handleRemoveFromBusiness(userAction.uid)} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-black text-white transition-all">Quitar</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Historial ────────────────────────────────────────── */}
            {drawerTab === 'history' && (
              <div className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-4">Historial de operaciones</p>
                {(!selected.subscription?.history || selected.subscription.history.length === 0) ? (
                  <div className="text-center py-12 text-white/20 text-sm">Sin historial registrado</div>
                ) : (
                  <div className="space-y-3">
                    {[...selected.subscription.history].reverse().map((h, i) => (
                      <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                            h.action === 'activate' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                            h.action === 'promo'    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                            h.action === 'cancel'   ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                            'bg-white/[0.06] text-white/30 border-white/[0.08]'
                          }`}>{h.action === 'activate' ? 'Activación' : h.action === 'promo' ? 'Promo' : h.action === 'cancel' ? 'Cancelación' : h.action}</span>
                          <span className="text-[9px] text-white/20 font-medium">{new Date(h.date).toLocaleDateString('es-VE')}</span>
                        </div>
                        {h.plan      && <p className="text-xs text-white/50 font-medium">Plan: <span className="text-white font-black capitalize">{h.plan}</span></p>}
                        {h.amountUsd && <p className="text-xs text-white/50 font-medium">Monto: <span className="text-emerald-400 font-black">${h.amountUsd}</span></p>}
                        {h.paymentMethod && <p className="text-xs text-white/50 font-medium">Método: <span className="text-white/70 font-bold">{h.paymentMethod}</span></p>}
                        {h.paymentRef && <p className="text-xs text-white/50 font-medium">Ref: <span className="text-white/70 font-mono text-[10px]">{h.paymentRef}</span></p>}
                        {h.promo     && <p className="text-xs text-amber-400 font-bold">Promo: {h.promo.code} — −{h.promo.discountPct}% × {h.promo.months}m</p>}
                        {h.note      && <p className="text-xs text-white/30 italic mt-1">"{h.note}"</p>}
                        <p className="text-[9px] text-white/15 mt-1.5">por {h.adminEmail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
