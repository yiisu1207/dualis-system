import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Shield, Search, ChevronRight, Check, X, Loader2, Users,
  AlertTriangle, Clock, Zap, CreditCard, Gift,
  Building2,
  Eye, EyeOff, History, Tag, Plus, Minus,
  DollarSign, BadgeCheck, ChevronDown,
  UserPlus, UserX, KeyRound, UserCog, ShieldCheck,
  ShieldOff, Sliders, Save, Trash2, FileText,
  Rocket, Bug, Lightbulb, MessageSquare, Image, Send,
  ExternalLink, ChevronUp, Calendar, MapPin, CheckCircle2,
  Smartphone, Monitor as MonitorIcon, Apple,
  BarChart3, TrendingUp, Activity, PieChart, Banknote,
  ShoppingCart, Package, Brain, ArrowUpRight, ArrowDownRight,
  Globe, Sparkles,
} from 'lucide-react';
import {
  VENDOR_TEMPLATES, VENDOR_DEFAULTS, HIDEABLE_ELEMENTS,
  type VendorOverride,
} from '../context/VendorContext';
import {
  collection, onSnapshot, doc, updateDoc, serverTimestamp,
  query, where, setDoc, deleteDoc, getDocs, addDoc, orderBy,
  limit as firestoreLimit, getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinary';
import { GoogleGenAI } from '@google/genai';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { db, firebaseConfig } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Config — leído desde .env.local (nunca hardcodeado) ─────────────────────
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

// ─── Top-level panel sections ──────────────────────────────────────────────
type TopTab = 'dashboard' | 'negocios' | 'roadmap' | 'feedback' | 'ia';

// ─── Feedback types ─────────────────────────────────────────────────────────
interface FeedbackItem {
  id: string;
  type: 'bug' | 'idea' | 'otro';
  message: string;
  email?: string;
  name?: string;
  imageUrls?: string[];
  status: 'nuevo' | 'leido' | 'resuelto' | 'descartado';
  createdAt: any;
  businessId?: string;
  userId?: string;
  adminNote?: string;
}

// ─── Roadmap data ───────────────────────────────────────────────────────────
interface RoadmapPhase {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  border: string;
  bg: string;
  iconColor: string;
  dateRange: string;
  items: { label: string; done: boolean; tag?: string }[];
}

const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'fase1', title: 'Fase 1 — Beta Cerrada', subtitle: 'Estabilizar core + primeros testers',
    color: 'text-sky-400', border: 'border-sky-500/20', bg: 'bg-sky-500/[0.04]', iconColor: 'bg-sky-500/15 border-sky-500/25 text-sky-400',
    dateRange: 'Mar — Abr 2026',
    items: [
      { label: 'Landing page con contador beta en vivo', done: true },
      { label: 'Registro + OTP por email', done: true },
      { label: 'App Check (reCAPTCHA v3)', done: true },
      { label: 'Feedback con incentivos', done: true },
      { label: 'Roadmap publico en landing', done: true },
      { label: 'Dominio definitivo', done: false },
      { label: 'Redes sociales oficiales', done: false },
      { label: 'Arqueo de Caja — apertura/cierre/conteo', done: false, tag: 'CRITICO' },
      { label: 'Reporte Z por turno y cajero', done: false, tag: 'CRITICO' },
      { label: 'Factura con numero de control + RIF', done: false, tag: 'CRITICO' },
      { label: 'Formato Providencia 0071', done: false, tag: 'CRITICO' },
      { label: 'Libro de Ventas formato SENIAT', done: false, tag: 'CRITICO' },
      { label: 'Libro de Compras con retenciones', done: false, tag: 'CRITICO' },
      { label: 'Notas de credito y debito fiscales', done: false },
      { label: 'Limite de credito por cliente', done: false },
      { label: 'Historial completo por cliente', done: false },
    ],
  },
  {
    id: 'fase2', title: 'Fase 2 — Beta Abierta', subtitle: 'Registro publico + 200 usuarios',
    color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/[0.04]', iconColor: 'bg-violet-500/15 border-violet-500/25 text-violet-400',
    dateRange: 'May — Jun 2026',
    items: [
      { label: 'Retenciones IVA (75%/100%)', done: false, tag: 'FISCAL' },
      { label: 'Retenciones ISLR', done: false, tag: 'FISCAL' },
      { label: 'Validacion de RIF contra SENIAT', done: false, tag: 'FISCAL' },
      { label: 'Abrir registro publico', done: false },
      { label: 'Campana de lanzamiento beta en redes', done: false },
      { label: 'Conciliacion bancaria con CSV', done: false },
      { label: 'Optimizacion rendimiento (lazy loading)', done: false },
      { label: 'App Windows (Electron/Tauri)', done: false, tag: 'PLATAFORMA' },
      { label: 'App Android en Play Store', done: false, tag: 'PLATAFORMA' },
      { label: 'PWA mejorada para moviles', done: false },
      { label: 'Dashboard por sucursal', done: false },
      { label: 'Integracion impresoras termicas Bluetooth', done: false },
    ],
  },
  {
    id: 'fase3', title: 'Fase 3 — Pre-Lanzamiento', subtitle: 'Homologacion + apps nativas + pagos',
    color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/[0.04]', iconColor: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
    dateRange: 'Jul — Ago 2026',
    items: [
      { label: 'Inicio proceso homologacion SENIAT', done: false, tag: 'LEGAL' },
      { label: 'Respaldo fiscal inmutable (hash)', done: false, tag: 'LEGAL' },
      { label: 'Pasarela de pagos para suscripciones', done: false, tag: 'CRITICO' },
      { label: 'Sistema de planes y billing automatizado', done: false, tag: 'CRITICO' },
      { label: 'App iOS en TestFlight', done: false, tag: 'PLATAFORMA' },
      { label: 'App macOS nativa', done: false, tag: 'PLATAFORMA' },
      { label: 'App Linux (.deb/.AppImage)', done: false, tag: 'PLATAFORMA' },
      { label: 'Webhooks y automatizaciones', done: false },
      { label: 'API publica v1', done: false },
      { label: 'Pitch deck 10 slides', done: false },
      { label: 'Contactar aceleradoras LATAM', done: false },
      { label: 'Alianzas con contadores', done: false },
    ],
  },
  {
    id: 'fase4', title: 'Fase 4 — Lanzamiento Oficial', subtitle: 'Marketing + 500 clientes pagando',
    color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/[0.04]', iconColor: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
    dateRange: 'Sep — Oct 2026',
    items: [
      { label: 'Product Hunt launch', done: false },
      { label: 'Video demo profesional (2-3 min)', done: false },
      { label: 'Press kit: logo, screenshots, one-pager', done: false },
      { label: 'Lanzamiento oficial en redes', done: false },
      { label: 'Webinar: Digitaliza tu negocio en Venezuela', done: false },
      { label: 'Programa de referidos (1 mes gratis)', done: false },
      { label: 'iOS en App Store (publico)', done: false, tag: 'PLATAFORMA' },
      { label: 'Soporte multipais (Colombia, Ecuador, Peru)', done: false },
      { label: 'WhatsApp Business API', done: false },
      { label: 'Certificacion SENIAT completada', done: false, tag: 'LEGAL' },
      { label: 'Primer reporte MRR, churn, NPS', done: false },
      { label: 'Evaluar ronda seed ($50K-150K)', done: false },
    ],
  },
];

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (pin !== ADMIN_PIN) {
      setErr('PIN incorrecto');
      setPin('');
      setTimeout(() => setErr(''), 2000);
      return;
    }
    if (!email.trim() || !password.trim()) {
      setErr('Ingresa email y contraseña');
      setTimeout(() => setErr(''), 2000);
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getAuth(), email.trim(), password);
      sessionStorage.setItem('dualis_op_auth', '1');
      onAuth();
    } catch (e: any) {
      const msg = e?.code === 'auth/invalid-credential' ? 'Credenciales inválidas'
        : e?.code === 'auth/user-not-found' ? 'Usuario no encontrado'
        : e?.code === 'auth/wrong-password' ? 'Contraseña incorrecta'
        : e?.message || 'Error de autenticación';
      setErr(msg);
      setTimeout(() => setErr(''), 3000);
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
          <p className="text-white/25 text-sm mt-1">Dualis Internal — Acceso restringido</p>
        </div>
        <div className={`rounded-2xl border p-6 transition-all space-y-4 ${err ? 'border-rose-500/40 bg-rose-500/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="admin@email.com"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Contraseña</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 pr-12"
              />
              <button onClick={() => setShow((s: boolean) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">PIN de acceso</label>
            <input
              type="password"
              value={pin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && submit()}
              placeholder="••••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
          {err && <p className="text-xs text-rose-400 font-bold text-center">{err}</p>}
          <button onClick={submit} disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Entrar'}
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

  // Auth — PIN + Firebase Auth (superadmin must be authenticated for Firestore rules)
  const [pinAuth, setPinAuth] = useState(() => {
    const stored = sessionStorage.getItem('dualis_op_auth') === '1';
    // If session stored but no Firebase user, force re-auth
    if (stored && !user) return false;
    return stored;
  });

  // Top-level tab
  const [topTab, setTopTab] = useState<TopTab>('dashboard');

  // Data
  const [businesses, setBusinesses] = useState<BizRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all'|'trial'|'active'|'expired'>('all');
  const [selected, setSelected] = useState<BizRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<'plan'|'promo'|'history'|'users'|'custom'>('plan');

  // Roadmap state — persisted in Firestore doc 'system/roadmap'
  const [roadmapData, setRoadmapData] = useState<Record<string, boolean>>({});
  const [roadmapSaving, setRoadmapSaving] = useState(false);
  const [roadmapExpanded, setRoadmapExpanded] = useState<string | null>('fase1');

  // Feedback state
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackFilter, setFeedbackFilter] = useState<'todos' | 'bug' | 'idea' | 'otro'>('todos');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'todos' | 'nuevo' | 'leido' | 'resuelto' | 'descartado'>('todos');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Dashboard analytics
  const [dashStats, setDashStats] = useState<{
    totalUsers: number; activeUsers: number; totalMovements: number;
    totalRevenue: number; totalProducts: number;
    recentMovements: Array<{ id: string; concept: string; amount: number; currency: string; date: any; entityId: string; movementType: string; businessId: string }>;
    movementsByType: Record<string, number>;
    revenueByDay: Array<{ date: string; total: number }>;
  }>({
    totalUsers: 0, activeUsers: 0, totalMovements: 0,
    totalRevenue: 0, totalProducts: 0,
    recentMovements: [], movementsByType: {}, revenueByDay: [],
  });
  const [dashLoading, setDashLoading] = useState(true);

  // AI Chat
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiChatRef = useRef<HTMLDivElement>(null);

  // Vendor overrides per business
  const [vendorOverride, setVendorOverride] = useState<VendorOverride>(VENDOR_DEFAULTS);
  const [loadingVendor, setLoadingVendor]   = useState(false);
  const [savingVendor, setSavingVendor]     = useState(false);
  const [newHideId, setNewHideId]           = useState('');
  const [newHideModule, setNewHideModule]   = useState('');

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

  // Load roadmap progress from Firestore
  useEffect(() => {
    if (!pinAuth) return;
    const unsub = onSnapshot(doc(db, 'system', 'roadmap'), snap => {
      if (snap.exists()) setRoadmapData(snap.data()?.items ?? {});
    });
    return unsub;
  }, [pinAuth]);

  // Load feedback from Firestore
  useEffect(() => {
    if (!pinAuth) return;
    setFeedbackLoading(true);
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), firestoreLimit(200));
    const unsub = onSnapshot(q, snap => {
      setFeedbackItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedbackItem)));
      setFeedbackLoading(false);
    }, () => setFeedbackLoading(false));
    return unsub;
  }, [pinAuth]);

  // Load dashboard analytics
  useEffect(() => {
    if (!pinAuth || topTab !== 'dashboard') return;
    setDashLoading(true);
    const loadDash = async () => {
      try {
        // Users count
        const usersSnap = await getCountFromServer(collection(db, 'users'));
        const totalUsers = usersSnap.data().count;

        // Active users (status === 'ACTIVE')
        const activeSnap = await getCountFromServer(query(collection(db, 'users'), where('status', '==', 'ACTIVE')));
        const activeUsers = activeSnap.data().count;

        // Recent movements (last 50)
        const movQ = query(collection(db, 'movements'), orderBy('createdAt', 'desc'), firestoreLimit(50));
        const movSnap = await getDocs(movQ);
        const recentMovements = movSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id, concept: data.concept ?? '', amount: data.amount ?? data.amountInUSD ?? 0,
            currency: data.currency ?? 'USD', date: data.createdAt ?? data.date,
            entityId: data.entityId ?? '', movementType: data.movementType ?? '',
            businessId: data.businessId ?? '',
          };
        });

        // All movements for stats
        const allMovQ = query(collection(db, 'movements'));
        const allMovSnap = await getDocs(allMovQ);
        let totalRevenue = 0;
        const movementsByType: Record<string, number> = {};
        const dailyRevenue: Record<string, number> = {};

        allMovSnap.docs.forEach(d => {
          const data = d.data();
          const amt = data.amountInUSD ?? data.amount ?? 0;
          const type = data.movementType ?? 'OTRO';
          const anulada = data.anulada === true;

          if (!anulada && (type === 'FACTURA' || type === 'VENTA')) {
            totalRevenue += amt;
          }

          movementsByType[type] = (movementsByType[type] ?? 0) + 1;

          // Daily revenue (last 30 days)
          const ts = data.createdAt?.toDate ? data.createdAt.toDate() : (data.date ? new Date(data.date) : null);
          if (ts && !anulada && (type === 'FACTURA' || type === 'VENTA')) {
            const dayKey = ts.toISOString().slice(0, 10);
            dailyRevenue[dayKey] = (dailyRevenue[dayKey] ?? 0) + amt;
          }
        });

        const revenueByDay = Object.entries(dailyRevenue)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30)
          .map(([date, total]) => ({ date, total }));

        setDashStats({
          totalUsers, activeUsers,
          totalMovements: allMovSnap.size,
          totalRevenue, totalProducts: 0,
          recentMovements, movementsByType, revenueByDay,
        });
      } catch (e) { console.error('Dashboard load error:', e); }
      setDashLoading(false);
    };
    loadDash();
  }, [pinAuth, topTab]);

  // AI chat handler
  const sendAiMessage = async () => {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: msg }]);
    setAiLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: '⚠️ No se encontró VITE_GEMINI_API_KEY en las variables de entorno. Agrégala en .env.local y en Vercel.' }]);
        setAiLoading(false);
        return;
      }

      // Build system context with live data
      const systemContext = `Eres un asistente IA interno del sistema Dualis ERP. Respondes en español.
Tu rol es ayudar al superadmin (Jesus Salazar) a entender el estado del sistema y tomar decisiones.

DATOS EN VIVO DEL SISTEMA:
- Total negocios registrados: ${businesses.length}
- Negocios activos (pagando): ${kpis.active}
- En periodo de prueba: ${kpis.trial}
- Expirados: ${kpis.expired}
- MRR estimado: $${kpis.mrr.toFixed(2)}
- Total usuarios registrados: ${dashStats.totalUsers}
- Usuarios activos: ${dashStats.activeUsers}
- Total movimientos (ventas, abonos, etc): ${dashStats.totalMovements}
- Revenue total generado: $${dashStats.totalRevenue.toFixed(2)}
- Movimientos por tipo: ${JSON.stringify(dashStats.movementsByType)}
- Feedback pendiente (nuevos): ${feedbackItems.filter(f => f.status === 'nuevo').length}
- Feedback total: ${feedbackItems.length}
- Progreso roadmap: ${Object.values(roadmapData).filter(Boolean).length}/${ROADMAP_PHASES.reduce((a, p) => a + p.items.length, 0)} tareas completadas

NEGOCIOS:
${businesses.slice(0, 20).map(b => `- ${b.companyName ?? b.id} | Plan: ${b.subscription?.plan ?? 'N/A'} | Status: ${b.subscription?.status ?? 'N/A'} | Owner: ${b.ownerEmail ?? 'N/A'}`).join('\n')}

ÚLTIMOS 10 MOVIMIENTOS:
${dashStats.recentMovements.slice(0, 10).map(m => `- ${m.movementType} | $${m.amount} ${m.currency} | ${m.concept} | ${m.entityId}`).join('\n')}

Responde de forma concisa, útil y directa. Si te preguntan algo que no sabes, dilo. Puedes dar recomendaciones de negocio basadas en los datos.`;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          { role: 'user', parts: [{ text: systemContext }] },
          ...aiMessages.map(m => ({
            role: m.role === 'user' ? 'user' as const : 'model' as const,
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: msg }] },
        ],
      });

      const reply = response.text ?? 'Sin respuesta';
      setAiMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${e?.message ?? 'No se pudo conectar con Gemini'}` }]);
    }
    setAiLoading(false);
    setTimeout(() => aiChatRef.current?.scrollTo({ top: aiChatRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  // Save roadmap toggle
  const toggleRoadmapItem = async (key: string) => {
    const next = !roadmapData[key];
    setRoadmapData(prev => ({ ...prev, [key]: next }));
    setRoadmapSaving(true);
    try {
      await setDoc(doc(db, 'system', 'roadmap'), { items: { ...roadmapData, [key]: next }, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.error(e); }
    setRoadmapSaving(false);
  };

  // Update feedback status
  const updateFeedbackStatus = async (id: string, status: FeedbackItem['status'], note?: string) => {
    const updates: any = { status, updatedAt: serverTimestamp(), updatedBy: user?.email ?? 'admin' };
    if (note !== undefined) updates.adminNote = note;
    await updateDoc(doc(db, 'feedback', id), updates);
    setSelectedFeedback(prev => prev?.id === id ? { ...prev, status, adminNote: note ?? prev.adminNote } : prev);
  };

  // Send feedback to WhatsApp
  const sendFeedbackToWhatsApp = (fb: FeedbackItem) => {
    const typeLabel = fb.type === 'bug' ? '🐛 Bug' : fb.type === 'idea' ? '💡 Sugerencia' : '💬 Comentario';
    const date = fb.createdAt?.toDate ? fb.createdAt.toDate().toLocaleDateString('es-VE') : 'N/A';
    const text = encodeURIComponent(
      `${typeLabel} — Dualis Feedback\n\n` +
      `De: ${fb.name || fb.email || 'Anónimo'}\n` +
      `Fecha: ${date}\n` +
      `Estado: ${fb.status}\n\n` +
      `Mensaje:\n${fb.message}\n\n` +
      (fb.imageUrls?.length ? `Imágenes: ${fb.imageUrls.join('\n')}` : '') +
      (fb.adminNote ? `\nNota admin: ${fb.adminNote}` : '')
    );
    window.open(`https://wa.me/584125343141?text=${text}`, '_blank');
  };

  // Grant bonus days to a user's business trial
  const grantBonusDays = async (fb: FeedbackItem, days: number) => {
    if (!fb.userId && !fb.email) {
      alert('Este feedback no tiene userId ni email asociado. No se puede otorgar dias.');
      return;
    }
    try {
      // Find the user by email or userId
      let userId = fb.userId;
      let businessId = fb.businessId;

      if (!userId && fb.email) {
        const userQ = query(collection(db, 'users'), where('email', '==', fb.email), firestoreLimit(1));
        const userSnap = await getDocs(userQ);
        if (!userSnap.empty) {
          userId = userSnap.docs[0].id;
          businessId = userSnap.docs[0].data().businessId ?? userSnap.docs[0].data().empresa_id;
        }
      }

      if (!businessId && userId) {
        const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
        if (!userDoc.empty) {
          businessId = userDoc.docs[0].data().businessId ?? userDoc.docs[0].data().empresa_id;
        }
      }

      if (!businessId) {
        alert('No se encontro el negocio asociado a este usuario.');
        return;
      }

      // Get current trial end date and extend it
      const bizDoc = await getDocs(query(collection(db, 'businesses'), where('__name__', '==', businessId)));
      if (bizDoc.empty) {
        alert('Negocio no encontrado: ' + businessId);
        return;
      }

      const bizData = bizDoc.docs[0].data();
      const currentEnd = bizData.subscription?.trialEndsAt?.toDate?.() ?? bizData.subscription?.currentPeriodEnd?.toDate?.() ?? new Date();
      const baseDate = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(baseDate);
      newEnd.setDate(newEnd.getDate() + days);

      const field = bizData.subscription?.status === 'trial' ? 'subscription.trialEndsAt' : 'subscription.currentPeriodEnd';
      await updateDoc(doc(db, 'businesses', businessId), {
        [field]: newEnd,
        'subscription.bonusNotification': {
          days,
          grantedAt: new Date().toISOString(),
          reason: fb.message?.slice(0, 100) || 'Feedback útil',
          seen: false,
        },
      });

      // Mark on feedback
      await updateDoc(doc(db, 'feedback', fb.id), {
        bonusDaysGranted: days,
        bonusGrantedAt: serverTimestamp(),
        bonusGrantedBy: user?.email ?? 'admin',
        status: 'resuelto',
      });

      setSelectedFeedback(prev => prev?.id === fb.id ? { ...prev, status: 'resuelto' } as FeedbackItem : prev);
      alert(`+${days} dias otorgados al negocio ${businessId}. Nueva fecha: ${newEnd.toLocaleDateString('es-VE')}`);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? 'No se pudo otorgar los dias'));
      console.error(e);
    }
  };

  // Load pending approval users
  useEffect(() => {
    if (!pinAuth) return;
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
  }, [pinAuth]);

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
    if (!pinAuth) return;
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
  }, [pinAuth]);

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

  // Load vendor override when a business is selected
  useEffect(() => {
    if (!selected) { setVendorOverride(VENDOR_DEFAULTS); return; }
    setLoadingVendor(true);
    import('firebase/firestore').then(({ getDoc }) =>
      getDoc(doc(db, 'vendorOverrides', selected.id))
    ).then(snap => {
      setVendorOverride(snap.exists() ? { ...VENDOR_DEFAULTS, ...snap.data() } as VendorOverride : { ...VENDOR_DEFAULTS });
      setLoadingVendor(false);
    }).catch(() => { setVendorOverride({ ...VENDOR_DEFAULTS }); setLoadingVendor(false); });
  }, [selected?.id]);

  const handleSaveVendor = async () => {
    if (!selected) return;
    setSavingVendor(true);
    try {
      await setDoc(doc(db, 'vendorOverrides', selected.id), {
        ...vendorOverride,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email ?? 'admin',
      }, { merge: false });
    } catch (e) { console.error(e); }
    finally { setSavingVendor(false); }
  };

  const applyVendorTemplate = (templateId: string) => {
    const tpl = VENDOR_TEMPLATES[templateId];
    if (!tpl) return;
    setVendorOverride(prev => ({
      ...prev,
      template:         templateId,
      forcedModules:    tpl.forcedModules    ?? prev.forcedModules,
      hiddenModules:    tpl.hiddenModules    ?? prev.hiddenModules,
      hiddenElements:   tpl.hiddenElements   ?? prev.hiddenElements,
      featureOverrides: tpl.featureOverrides ?? prev.featureOverrides,
    }));
  };

  const addHideElement = () => {
    const id = newHideId.trim();
    if (!id || vendorOverride.hiddenElements.includes(id)) { setNewHideId(''); return; }
    setVendorOverride(prev => ({ ...prev, hiddenElements: [...prev.hiddenElements, id] }));
    setNewHideId('');
  };

  const removeHideElement = (id: string) =>
    setVendorOverride(prev => ({ ...prev, hiddenElements: prev.hiddenElements.filter(e => e !== id) }));

  const addHideModule = () => {
    const id = newHideModule.trim();
    if (!id || vendorOverride.hiddenModules.includes(id)) { setNewHideModule(''); return; }
    setVendorOverride(prev => ({ ...prev, hiddenModules: [...prev.hiddenModules, id] }));
    setNewHideModule('');
  };

  const removeHideModule = (id: string) =>
    setVendorOverride(prev => ({ ...prev, hiddenModules: prev.hiddenModules.filter(m => m !== id) }));

  const toggleForcedModule = (id: string) =>
    setVendorOverride(prev => ({
      ...prev,
      forcedModules: prev.forcedModules.includes(id)
        ? prev.forcedModules.filter(m => m !== id)
        : [...prev.forcedModules, id],
    }));

  const toggleFeatureOverride = (key: string, value: boolean) =>
    setVendorOverride(prev => ({ ...prev, featureOverrides: { ...prev.featureOverrides, [key]: value } }));

  const clearFeatureOverride = (key: string) =>
    setVendorOverride(prev => {
      const next = { ...prev.featureOverrides };
      delete next[key];
      return { ...prev, featureOverrides: next };
    });

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

  if (!pinAuth) {
    return <PinGate onAuth={() => setPinAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#070b14]/90 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="px-6 py-4 flex items-center justify-between">
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
              onClick={async () => { sessionStorage.removeItem('dualis_op_auth'); try { await getAuth().signOut(); } catch {} navigate('/'); }}
              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white/40 border border-white/[0.07] hover:bg-white/[0.06] transition-all"
            >
              Salir
            </button>
          </div>
        </div>
        {/* Top-level tabs */}
        <div className="px-6 pb-0 flex gap-1 overflow-x-auto">
          {([
            { id: 'dashboard' as TopTab, icon: BarChart3,      label: 'Dashboard' },
            { id: 'negocios' as TopTab,  icon: Building2,      label: 'Negocios', count: businesses.length },
            { id: 'roadmap' as TopTab,   icon: Rocket,         label: 'Roadmap' },
            { id: 'feedback' as TopTab,  icon: MessageSquare,  label: 'Feedback', count: feedbackItems.filter(f => f.status === 'nuevo').length || undefined },
            { id: 'ia' as TopTab,        icon: Brain,          label: 'IA Asistente' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTopTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                topTab === t.id
                  ? 'bg-white/[0.06] text-white border-indigo-500'
                  : 'text-white/25 hover:text-white/50 border-transparent hover:bg-white/[0.02]'
              }`}
            >
              <t.icon size={13} />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-black ${
                  t.id === 'feedback' && topTab !== 'feedback'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-white/[0.08] text-white/40'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: DASHBOARD
            ═══════════════════════════════════════════════════════════════════ */}
        {topTab === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Dashboard del Sistema</h2>
                <p className="text-xs text-white/30 mt-1">Vista general en tiempo real de todo Dualis ERP</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60">Live</span>
              </div>
            </div>

            {dashLoading ? (
              <div className="flex justify-center py-32"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
            ) : (<>
              {/* KPI row 1 */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Negocios', val: businesses.length, icon: Building2, color: 'text-indigo-400', bg: 'bg-indigo-500/[0.08]', border: 'border-indigo-500/20' },
                  { label: 'Usuarios', val: dashStats.totalUsers, icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/20' },
                  { label: 'Activos', val: dashStats.activeUsers, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20' },
                  { label: 'Movimientos', val: dashStats.totalMovements, icon: TrendingUp, color: 'text-sky-400', bg: 'bg-sky-500/[0.08]', border: 'border-sky-500/20' },
                  { label: 'Revenue Total', val: `$${dashStats.totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20' },
                  { label: 'MRR', val: `$${kpis.mrr.toFixed(0)}`, icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20' },
                ].map(k => (
                  <div key={k.label} className={`rounded-2xl border ${k.border} ${k.bg} p-4`}>
                    <k.icon size={14} className={`${k.color} mb-2`} />
                    <p className={`text-xl font-black ${k.color} tracking-tight`}>{k.val}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mt-1">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* KPI row 2 — subscription breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Plan Activo', val: kpis.active, icon: BadgeCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/15' },
                  { label: 'En Prueba', val: kpis.trial, icon: Clock, color: 'text-sky-400', bg: 'bg-sky-500/[0.06]', border: 'border-sky-500/15' },
                  { label: 'Expirados', val: kpis.expired, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/[0.06]', border: 'border-rose-500/15' },
                  { label: 'Feedback Nuevo', val: feedbackItems.filter(f => f.status === 'nuevo').length, icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/15' },
                ].map(k => (
                  <div key={k.label} className={`rounded-2xl border ${k.border} ${k.bg} p-4 flex items-center gap-3`}>
                    <div className={`h-10 w-10 rounded-xl ${k.bg} border ${k.border} flex items-center justify-center shrink-0`}>
                      <k.icon size={16} className={k.color} />
                    </div>
                    <div>
                      <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/20">{k.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Revenue chart (text-based bar) */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Revenue diario (ultimos 30 dias)</p>
                    <TrendingUp size={14} className="text-emerald-400/40" />
                  </div>
                  {dashStats.revenueByDay.length === 0 ? (
                    <p className="text-center py-8 text-white/15 text-sm">Sin datos de revenue aun</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {(() => {
                        const maxVal = Math.max(...dashStats.revenueByDay.map(d => d.total), 1);
                        return dashStats.revenueByDay.map(d => (
                          <div key={d.date} className="flex items-center gap-3">
                            <span className="text-[9px] text-white/20 w-16 shrink-0 font-mono">{d.date.slice(5)}</span>
                            <div className="flex-1 h-5 bg-white/[0.03] rounded-lg overflow-hidden">
                              <div
                                className="h-full rounded-lg bg-gradient-to-r from-indigo-500/60 to-violet-500/60 transition-all"
                                style={{ width: `${(d.total / maxVal) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-emerald-400 font-black w-16 text-right">${d.total.toFixed(0)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                {/* Movements by type */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Movimientos por tipo</p>
                    <PieChart size={14} className="text-violet-400/40" />
                  </div>
                  {Object.keys(dashStats.movementsByType).length === 0 ? (
                    <p className="text-center py-8 text-white/15 text-sm">Sin movimientos aun</p>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const vals = Object.values(dashStats.movementsByType) as number[];
                        const total = vals.reduce((a: number, b: number) => a + b, 0);
                        const colors: Record<string, string> = {
                          FACTURA: 'from-emerald-500 to-emerald-600', VENTA: 'from-emerald-500 to-emerald-600',
                          ABONO: 'from-sky-500 to-sky-600', DEVOLUCION: 'from-rose-500 to-rose-600',
                          GASTO: 'from-amber-500 to-amber-600', COMPRA: 'from-violet-500 to-violet-600',
                        };
                        const entries = Object.entries(dashStats.movementsByType) as [string, number][];
                        return entries
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => (
                            <div key={type} className="flex items-center gap-3">
                              <span className="text-[9px] font-black uppercase tracking-wider text-white/30 w-24 shrink-0">{type}</span>
                              <div className="flex-1 h-5 bg-white/[0.03] rounded-lg overflow-hidden">
                                <div
                                  className={`h-full rounded-lg bg-gradient-to-r ${colors[type] ?? 'from-slate-500 to-slate-600'} transition-all`}
                                  style={{ width: `${(count / total) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-white/40 font-black w-10 text-right">{count}</span>
                              <span className="text-[9px] text-white/15 w-10 text-right">{((count / total) * 100).toFixed(0)}%</span>
                            </div>
                          ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent movements table */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.05] flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Ultimos movimientos del sistema</p>
                  <span className="text-[9px] text-white/15">{dashStats.recentMovements.length} mas recientes</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {dashStats.recentMovements.length === 0 ? (
                    <p className="text-center py-12 text-white/15 text-sm">Sin movimientos registrados</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.04]">
                          {['Tipo', 'Concepto', 'Monto', 'Cliente', 'Negocio', 'Fecha'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-[8px] font-black uppercase tracking-widest text-white/20">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dashStats.recentMovements.map(m => (
                          <tr key={m.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-2.5">
                              <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                m.movementType === 'FACTURA' || m.movementType === 'VENTA' ? 'bg-emerald-500/15 text-emerald-400' :
                                m.movementType === 'ABONO' ? 'bg-sky-500/15 text-sky-400' :
                                m.movementType === 'DEVOLUCION' ? 'bg-rose-500/15 text-rose-400' :
                                'bg-white/[0.06] text-white/30'
                              }`}>{m.movementType}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-white/50 max-w-[150px] truncate">{m.concept || '—'}</td>
                            <td className="px-4 py-2.5 text-xs font-black text-emerald-400">${m.amount.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-[10px] text-white/30 truncate max-w-[120px]">{m.entityId || '—'}</td>
                            <td className="px-4 py-2.5 text-[9px] text-white/20 font-mono truncate max-w-[100px]">{m.businessId.slice(0, 8)}</td>
                            <td className="px-4 py-2.5 text-[9px] text-white/20">
                              {m.date?.toDate ? m.date.toDate().toLocaleDateString('es-VE') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Roadmap progress quick view */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Progreso del Roadmap</p>
                  <button onClick={() => setTopTab('roadmap')} className="text-[9px] text-indigo-400 font-bold hover:underline">Ver completo →</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ROADMAP_PHASES.map(phase => {
                    const done = phase.items.filter((_, i) => roadmapData[`${phase.id}_${i}`]).length;
                    const pct = Math.round((done / phase.items.length) * 100);
                    return (
                      <div key={phase.id} className={`rounded-xl border ${phase.border} ${phase.bg} p-3`}>
                        <p className={`text-[9px] font-black ${phase.color} mb-1`}>{phase.title.split('—')[0]}</p>
                        <div className="flex items-end gap-2">
                          <p className={`text-2xl font-black ${phase.color}`}>{pct}%</p>
                          <p className="text-[9px] text-white/20 mb-1">{done}/{phase.items.length}</p>
                        </div>
                        <div className="mt-2 rounded-full h-1 bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>)}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: NEGOCIOS
            ═══════════════════════════════════════════════════════════════════ */}
        {topTab === 'negocios' && (<>
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
                  { id:'custom',  icon: Sliders,    label:'Config' },
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

            {/* ── Tab: Personalización ──────────────────────────────────── */}
            {drawerTab === 'custom' && (
              <div className="p-5 space-y-5 overflow-y-auto">
                {loadingVendor ? (
                  <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-indigo-400" /></div>
                ) : (
                  <>
                    {/* Template presets */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Plantilla base</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(VENDOR_TEMPLATES).map(([id, tpl]) => (
                          <button
                            key={id}
                            onClick={() => applyVendorTemplate(id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              vendorOverride.template === id
                                ? 'border-indigo-500/40 bg-indigo-500/10'
                                : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'
                            }`}
                          >
                            <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${vendorOverride.template === id ? 'text-indigo-400' : 'text-white/50'}`}>{tpl.label}</p>
                            <p className="text-[9px] text-white/20 leading-tight">{tpl.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Feature overrides */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Funciones — Override</p>
                      <p className="text-[9px] text-white/20 mb-3">Fuerza ON/OFF independiente de lo que configure el cliente. Deja en "Auto" para respetar su config.</p>
                      <div className="space-y-2">
                        {['teamChat','bookComparison','aiVision','multiCurrency','whatsappNotifs','personalBooks','peerComparison','perUserBilling'].map(key => {
                          const val = vendorOverride.featureOverrides[key];
                          return (
                            <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                              <span className="text-[11px] text-white/50 font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <div className="flex gap-1">
                                {(['on','off','auto'] as const).map(opt => {
                                  const isActive = opt === 'auto' ? val === undefined : opt === 'on' ? val === true : val === false;
                                  return (
                                    <button
                                      key={opt}
                                      onClick={() => opt === 'auto' ? clearFeatureOverride(key) : toggleFeatureOverride(key, opt === 'on')}
                                      className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                                        isActive
                                          ? opt === 'on'   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : opt === 'off'  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                          : 'bg-white/10 text-white border border-white/20'
                                          : 'text-white/20 hover:text-white/40 border border-transparent'
                                      }`}
                                    >{opt}</button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Modules forced ON */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Módulos forzados activos</p>
                      <p className="text-[9px] text-white/20 mb-3">Accesibles independiente del plan de suscripción.</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {['resumen','inventario','cajas','rrhh','sucursales','clientes','proveedores','contabilidad','fiscal','tasas','conciliacion','reportes','vision','comparar','widgets','config'].map(mod => {
                          const active = vendorOverride.forcedModules.includes(mod);
                          return (
                            <button key={mod} onClick={() => toggleForcedModule(mod)}
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                active ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'text-white/20 border-white/[0.06] hover:border-white/20'
                              }`}
                            >{mod}</button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hidden modules */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Módulos ocultos</p>
                      <p className="text-[9px] text-white/20 mb-2">Completamente invisibles para esta empresa.</p>
                      <div className="flex gap-2 mb-2">
                        <input
                          value={newHideModule}
                          onChange={e => setNewHideModule(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addHideModule()}
                          placeholder="ej: rrhh, conciliacion, comparar…"
                          className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                        />
                        <button onClick={addHideModule} className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/25 transition-all">
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {vendorOverride.hiddenModules.map(id => (
                          <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[9px] font-black uppercase">
                            {id}
                            <button onClick={() => removeHideModule(id)}><X size={10} /></button>
                          </span>
                        ))}
                        {vendorOverride.hiddenModules.length === 0 && <p className="text-[9px] text-white/15">Ninguno oculto</p>}
                      </div>
                    </div>

                    {/* Hidden UI elements */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Elementos UI ocultos</p>
                      {/* Quick-pick from registry */}
                      <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto pr-1">
                        {HIDEABLE_ELEMENTS.map(el => {
                          const active = vendorOverride.hiddenElements.includes(el.id);
                          return (
                            <button
                              key={el.id}
                              onClick={() => active ? removeHideElement(el.id) : setVendorOverride(p => ({ ...p, hiddenElements: [...p.hiddenElements, el.id] }))}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                                active ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15'
                              }`}
                            >
                              <div>
                                <p className={`text-[10px] font-bold ${active ? 'text-rose-400' : 'text-white/40'}`}>{el.label}</p>
                                <p className="text-[8px] text-white/15">{el.location} · {el.id}</p>
                              </div>
                              {active ? <EyeOff size={12} className="text-rose-400 shrink-0" /> : <Eye size={12} className="text-white/15 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      {/* Custom element ID */}
                      <div className="flex gap-2">
                        <input
                          value={newHideId}
                          onChange={e => setNewHideId(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addHideElement()}
                          placeholder="ID personalizado…"
                          className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                        />
                        <button onClick={addHideElement} className="px-3 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/25 transition-all">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Webhook */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">Webhook URL</p>
                      <p className="text-[9px] text-white/20 mb-2">Recibe eventos en tiempo real: ventas, clientes, turnos. Compatible con n8n, Zapier, Make o tu backend.</p>
                      <input
                        value={vendorOverride.webhookUrl}
                        onChange={e => setVendorOverride(p => ({ ...p, webhookUrl: e.target.value }))}
                        placeholder="https://tu-servidor.com/webhook/empresa"
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-mono"
                      />
                      <p className="text-[8px] text-white/15 mt-1">Eventos: sale.created · sale.cancelled · customer.created · payment.received · shift.opened · shift.closed</p>
                    </div>

                    {/* Custom CSS */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">CSS personalizado</p>
                      <p className="text-[9px] text-white/20 mb-2">Se inyecta en el navegador del cliente. Útil para ajustes de branding, ocultar elementos por selector, etc.</p>
                      <textarea
                        rows={4}
                        value={vendorOverride.customCss}
                        onChange={e => setVendorOverride(p => ({ ...p, customCss: e.target.value }))}
                        placeholder={`.sidebar { background: #1a0a2e; }\n.logo-text { display: none; }`}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono"
                      />
                    </div>

                    {/* UI Config (JSON) */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">Configuración UI (JSON)</p>
                      <p className="text-[9px] text-white/20 mb-2">Ajustes declarativos sin código. Ej: defaultTab, alertText, loginRedirect.</p>
                      <textarea
                        rows={3}
                        value={JSON.stringify(vendorOverride.uiConfig ?? {}, null, 2)}
                        onChange={e => {
                          try { setVendorOverride(p => ({ ...p, uiConfig: JSON.parse(e.target.value) })); } catch { /* ignore invalid JSON while typing */ }
                        }}
                        placeholder={'{\n  "defaultTab": "cajas",\n  "alertText": "Recuerda registrar tu turno"\n}'}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none font-mono"
                      />
                    </div>

                    {/* Developer notes */}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25 mb-2">Notas internas</p>
                      <textarea
                        rows={3}
                        value={vendorOverride.notes}
                        onChange={e => setVendorOverride(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Notas sobre este cliente, acuerdos especiales, customizaciones pendientes…"
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 text-xs placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none"
                      />
                    </div>

                    {/* Save */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveVendor}
                        disabled={savingVendor}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest text-white transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                      >
                        {savingVendor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Guardar Config
                      </button>
                      <button
                        onClick={() => setVendorOverride({ ...VENDOR_DEFAULTS })}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-rose-400 border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 transition-all"
                      >
                        <Trash2 size={13} /> Reset
                      </button>
                    </div>
                    {vendorOverride.updatedAt && (
                      <p className="text-[9px] text-white/15">Última actualización: {new Date(vendorOverride.updatedAt).toLocaleString('es-VE')} · por {vendorOverride.updatedBy}</p>
                    )}
                  </>
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
        </>)} {/* end topTab === 'negocios' */}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: ROADMAP / CRONOGRAMA
            ═══════════════════════════════════════════════════════════════════ */}
        {topTab === 'roadmap' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Roadmap del Proyecto</h2>
                <p className="text-xs text-white/30 mt-1">Beta → Lanzamiento · Marzo — Octubre 2026 · Marca las tareas completadas</p>
              </div>
              <div className="flex items-center gap-3">
                {roadmapSaving && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                <div className="text-right">
                  <p className="text-2xl font-black text-white tracking-tight">
                    {Object.values(roadmapData).filter(Boolean).length}
                    <span className="text-white/15">/{ROADMAP_PHASES.reduce((a, p) => a + p.items.length, 0)}</span>
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Completadas</p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="rounded-full h-2 bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(Object.values(roadmapData).filter(Boolean).length / Math.max(1, ROADMAP_PHASES.reduce((a, p) => a + p.items.length, 0))) * 100}%`,
                  background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #06b6d4)',
                }}
              />
            </div>

            {/* Phases */}
            <div className="space-y-4">
              {ROADMAP_PHASES.map(phase => {
                const done = phase.items.filter((_, i) => roadmapData[`${phase.id}_${i}`]).length;
                const total = phase.items.length;
                const pct = Math.round((done / total) * 100);
                const isExpanded = roadmapExpanded === phase.id;

                return (
                  <div key={phase.id} className={`rounded-2xl border ${phase.border} ${phase.bg} overflow-hidden transition-all`}>
                    {/* Phase header */}
                    <button
                      onClick={() => setRoadmapExpanded(isExpanded ? null : phase.id)}
                      className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-all"
                    >
                      <div className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 ${phase.iconColor}`}>
                        {pct === 100 ? <CheckCircle2 size={18} /> : <Rocket size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className={`text-sm font-black ${phase.color}`}>{phase.title}</h3>
                          <span className="text-[9px] text-white/20 font-medium">{phase.dateRange}</span>
                        </div>
                        <p className="text-[11px] text-white/25 mt-0.5">{phase.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={`text-lg font-black ${phase.color}`}>{pct}%</p>
                          <p className="text-[9px] text-white/20">{done}/{total}</p>
                        </div>
                        <ChevronDown size={16} className={`text-white/20 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Phase items */}
                    {isExpanded && (
                      <div className="px-5 pb-5 space-y-1.5">
                        <div className="rounded-full h-1 bg-white/[0.04] mb-3 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #4f46e5, #7c3aed)' }} />
                        </div>
                        {phase.items.map((item, i) => {
                          const key = `${phase.id}_${i}`;
                          const checked = !!roadmapData[key];
                          return (
                            <button
                              key={key}
                              onClick={() => toggleRoadmapItem(key)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all group ${
                                checked ? 'bg-white/[0.03]' : 'hover:bg-white/[0.03]'
                              }`}
                            >
                              <div className={`h-5 w-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                                checked
                                  ? 'bg-emerald-500/20 border-emerald-500/50'
                                  : 'border-white/[0.12] group-hover:border-white/[0.2]'
                              }`}>
                                {checked && <Check size={11} className="text-emerald-400" />}
                              </div>
                              <span className={`text-xs flex-1 transition-all ${
                                checked ? 'text-white/30 line-through' : 'text-white/60'
                              }`}>{item.label}</span>
                              {item.tag && (
                                <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  item.tag === 'CRITICO' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' :
                                  item.tag === 'FISCAL' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                                  item.tag === 'LEGAL' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/15' :
                                  item.tag === 'PLATAFORMA' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20' :
                                  'bg-white/[0.06] text-white/30 border border-white/[0.08]'
                                }`}>{item.tag}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Budget & metrics summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                { label: 'Duración total', val: '7 meses', icon: Calendar, color: 'text-indigo-400' },
                { label: 'Costo mensual pre-revenue', val: '~$35-55', icon: DollarSign, color: 'text-emerald-400' },
                { label: 'Meta usuarios lanzamiento', val: '500+', icon: Users, color: 'text-violet-400' },
                { label: 'Meta MRR lanzamiento', val: '$5,000+', icon: Zap, color: 'text-amber-400' },
              ].map(k => (
                <div key={k.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <k.icon size={14} className={k.color} />
                  <p className={`text-xl font-black ${k.color} mt-2`}>{k.val}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mt-1">{k.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: FEEDBACK & BUGS
            ═══════════════════════════════════════════════════════════════════ */}
        {topTab === 'feedback' && (
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="flex h-full">
              {/* ── Left: Feedback list ──────────────────────────────── */}
              <div className="w-full md:w-[420px] border-r border-white/[0.07] flex flex-col">
                <div className="p-4 border-b border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-white">Feedback</h2>
                    <span className="text-[10px] text-white/20 font-bold">{feedbackItems.length} total</span>
                  </div>
                  {/* Type filter */}
                  <div className="flex gap-1">
                    {(['todos', 'bug', 'idea', 'otro'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setFeedbackFilter(t)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          feedbackFilter === t ? 'bg-white/[0.1] text-white' : 'text-white/25 hover:text-white/50'
                        }`}
                      >
                        {t === 'bug' && <Bug size={10} />}
                        {t === 'idea' && <Lightbulb size={10} />}
                        {t === 'otro' && <MessageSquare size={10} />}
                        {t === 'todos' ? 'Todos' : t === 'bug' ? 'Bugs' : t === 'idea' ? 'Ideas' : 'Otros'}
                        <span className="text-[8px] text-white/15 ml-0.5">
                          {t === 'todos'
                            ? feedbackItems.length
                            : feedbackItems.filter(f => f.type === t).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* Status filter */}
                  <div className="flex gap-1">
                    {(['todos', 'nuevo', 'leido', 'resuelto', 'descartado'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setFeedbackStatusFilter(s)}
                        className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                          feedbackStatusFilter === s ? 'bg-white/[0.1] text-white' : 'text-white/20 hover:text-white/40'
                        }`}
                      >
                        {s === 'todos' ? 'Todos' : s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                  {feedbackLoading ? (
                    <div className="flex justify-center py-20"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>
                  ) : feedbackItems
                      .filter(f => feedbackFilter === 'todos' || f.type === feedbackFilter)
                      .filter(f => feedbackStatusFilter === 'todos' || f.status === feedbackStatusFilter)
                      .length === 0 ? (
                    <div className="text-center py-20 text-white/15 text-sm">Sin feedback aún</div>
                  ) : (
                    feedbackItems
                      .filter(f => feedbackFilter === 'todos' || f.type === feedbackFilter)
                      .filter(f => feedbackStatusFilter === 'todos' || f.status === feedbackStatusFilter)
                      .map(fb => (
                        <button
                          key={fb.id}
                          onClick={() => { setSelectedFeedback(fb); setFeedbackNote(fb.adminNote ?? ''); }}
                          className={`w-full text-left px-4 py-3.5 border-b border-white/[0.04] transition-all hover:bg-white/[0.03] ${
                            selectedFeedback?.id === fb.id ? 'bg-white/[0.05]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                              fb.type === 'bug' ? 'bg-rose-500/15 border border-rose-500/25' :
                              fb.type === 'idea' ? 'bg-amber-500/15 border border-amber-500/25' :
                              'bg-sky-500/15 border border-sky-500/25'
                            }`}>
                              {fb.type === 'bug' ? <Bug size={13} className="text-rose-400" /> :
                               fb.type === 'idea' ? <Lightbulb size={13} className="text-amber-400" /> :
                               <MessageSquare size={13} className="text-sky-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-white truncate">{fb.name || fb.email || 'Anónimo'}</span>
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                  fb.status === 'nuevo' ? 'bg-indigo-500/20 text-indigo-400' :
                                  fb.status === 'leido' ? 'bg-white/[0.06] text-white/30' :
                                  fb.status === 'resuelto' ? 'bg-emerald-500/20 text-emerald-400' :
                                  'bg-rose-500/15 text-rose-400/50'
                                }`}>{fb.status}</span>
                              </div>
                              <p className="text-[11px] text-white/30 line-clamp-2 leading-relaxed">{fb.message}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[9px] text-white/15">
                                  {fb.createdAt?.toDate ? fb.createdAt.toDate().toLocaleDateString('es-VE') : '—'}
                                </span>
                                {fb.imageUrls && fb.imageUrls.length > 0 && (
                                  <span className="flex items-center gap-1 text-[9px] text-white/20">
                                    <Image size={9} /> {fb.imageUrls.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </div>

              {/* ── Right: Feedback detail ───────────────────────────── */}
              <div className="hidden md:flex flex-1 flex-col">
                {!selectedFeedback ? (
                  <div className="flex-1 flex items-center justify-center text-white/10">
                    <div className="text-center">
                      <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Selecciona un feedback para ver los detalles</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                          selectedFeedback.type === 'bug' ? 'bg-rose-500/15 border border-rose-500/25' :
                          selectedFeedback.type === 'idea' ? 'bg-amber-500/15 border border-amber-500/25' :
                          'bg-sky-500/15 border border-sky-500/25'
                        }`}>
                          {selectedFeedback.type === 'bug' ? <Bug size={20} className="text-rose-400" /> :
                           selectedFeedback.type === 'idea' ? <Lightbulb size={20} className="text-amber-400" /> :
                           <MessageSquare size={20} className="text-sky-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">{selectedFeedback.name || 'Anónimo'}</p>
                          <p className="text-[11px] text-white/30">{selectedFeedback.email || 'Sin email'}</p>
                          <p className="text-[9px] text-white/15 mt-0.5">
                            {selectedFeedback.createdAt?.toDate ? selectedFeedback.createdAt.toDate().toLocaleString('es-VE') : '—'}
                            {selectedFeedback.businessId && ` · ${selectedFeedback.businessId}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => sendFeedbackToWhatsApp(selectedFeedback)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                      >
                        <Send size={12} /> WhatsApp
                      </button>
                    </div>

                    {/* Type & Status badges */}
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                        selectedFeedback.type === 'bug' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                        selectedFeedback.type === 'idea' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                        'bg-sky-500/15 text-sky-400 border-sky-500/25'
                      }`}>
                        {selectedFeedback.type === 'bug' ? '🐛 Bug Report' : selectedFeedback.type === 'idea' ? '💡 Sugerencia' : '💬 Comentario'}
                      </span>
                      <span className="text-white/10">→</span>
                      {/* Status selector */}
                      <div className="flex gap-1">
                        {(['nuevo', 'leido', 'resuelto', 'descartado'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => updateFeedbackStatus(selectedFeedback.id, s)}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                              selectedFeedback.status === s
                                ? s === 'nuevo' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                                  : s === 'leido' ? 'bg-white/[0.1] text-white border-white/[0.15]'
                                  : s === 'resuelto' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                                : 'text-white/15 border-white/[0.06] hover:border-white/[0.12] hover:text-white/30'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message */}
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Mensaje</p>
                      <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{selectedFeedback.message}</p>
                    </div>

                    {/* Images */}
                    {selectedFeedback.imageUrls && selectedFeedback.imageUrls.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">
                          Capturas adjuntas ({selectedFeedback.imageUrls.length})
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {selectedFeedback.imageUrls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setLightboxImg(url)}
                              className="rounded-xl border border-white/[0.07] overflow-hidden hover:border-indigo-500/30 transition-all group"
                            >
                              <img src={url} alt={`Captura ${i + 1}`} className="w-full h-40 object-cover group-hover:scale-105 transition-transform" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grant bonus days */}
                    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60 mb-3">Otorgar dias gratis de prueba</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { days: 1, label: '+1 dia', desc: 'Feedback general' },
                          { days: 3, label: '+3 dias', desc: 'Sugerencia util' },
                          { days: 7, label: '+7 dias', desc: 'Bug importante' },
                          { days: 14, label: '+14 dias', desc: 'Bug critico' },
                        ].map(opt => (
                          <button
                            key={opt.days}
                            onClick={() => {
                              if (confirm(`Otorgar ${opt.label} a ${selectedFeedback.name || selectedFeedback.email || 'este usuario'}?\n\nMotivo: ${opt.desc}`)) {
                                grantBonusDays(selectedFeedback, opt.days);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 hover:bg-emerald-500/20 transition-all"
                          >
                            <Gift size={11} /> {opt.label}
                          </button>
                        ))}
                      </div>
                      {(selectedFeedback as any).bonusDaysGranted && (
                        <p className="text-[9px] text-emerald-400/40 mt-2">
                          Ya se otorgaron +{(selectedFeedback as any).bonusDaysGranted} dias · por {(selectedFeedback as any).bonusGrantedBy}
                        </p>
                      )}
                    </div>

                    {/* Admin note */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">Nota interna del admin</p>
                      <div className="flex gap-2">
                        <input
                          value={feedbackNote}
                          onChange={e => setFeedbackNote(e.target.value)}
                          placeholder="Escribe una nota sobre este feedback..."
                          className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                        />
                        <button
                          onClick={() => updateFeedbackStatus(selectedFeedback.id, selectedFeedback.status, feedbackNote)}
                          className="px-4 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/30 transition-all"
                        >
                          <Save size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lightbox */}
            {lightboxImg && (
              <div
                className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                onClick={() => setLightboxImg(null)}
              >
                <button className="absolute top-6 right-6 text-white/50 hover:text-white" onClick={() => setLightboxImg(null)}>
                  <X size={24} />
                </button>
                <img src={lightboxImg} alt="Preview" className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: IA ASISTENTE
            ═══════════════════════════════════════════════════════════════════ */}
        {topTab === 'ia' && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/25 flex items-center justify-center">
                <Brain size={18} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Asistente IA — Dualis</h2>
                <p className="text-[10px] text-white/25">Gemini 2.0 Flash · Datos en vivo del sistema · Preguntame lo que quieras</p>
              </div>
              {aiMessages.length > 0 && (
                <button onClick={() => setAiMessages([])} className="ml-auto text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                  Limpiar chat
                </button>
              )}
            </div>

            {/* Chat messages */}
            <div ref={aiChatRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {aiMessages.length === 0 && (
                <div className="flex-1 flex items-center justify-center min-h-[400px]">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                      <Sparkles size={28} className="text-indigo-400/60" />
                    </div>
                    <h3 className="text-lg font-black text-white mb-2">Hola Jesus</h3>
                    <p className="text-sm text-white/30 mb-6">Soy tu asistente IA. Tengo acceso a todos los datos del sistema en tiempo real. Preguntame cualquier cosa.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Como va el sistema hoy?',
                        'Cuantos negocios estan activos?',
                        'Dame un resumen del revenue',
                        'Que deberia priorizar ahora?',
                        'Analiza el feedback pendiente',
                        'Como puedo conseguir mas clientes?',
                      ].map(q => (
                        <button key={q} onClick={() => { setAiInput(q); }}
                          className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all text-left">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
                      : 'bg-white/[0.04] border border-white/[0.07] text-white/70'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-5 py-3.5 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                    <span className="text-sm text-white/30">Pensando...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className="px-6 py-4 border-t border-white/[0.07] bg-[#080d1b]">
              <div className="flex gap-3">
                <input
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                  placeholder="Pregunta sobre tu sistema, datos, estrategia..."
                  className="flex-1 px-5 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/15 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button
                  onClick={sendAiMessage}
                  disabled={!aiInput.trim() || aiLoading}
                  className="px-5 py-3 rounded-xl text-sm font-black text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[9px] text-white/15 mt-2 text-center">Gemini 2.0 Flash · Los datos se cargan en vivo desde Firestore · Requiere VITE_GEMINI_API_KEY</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
