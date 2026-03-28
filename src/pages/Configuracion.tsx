import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  ALL_MODULES, MODULE_LABELS, PRESETS, DEFAULT_ROLE_PERMISSIONS,
  type RolePermissions, type ModuleId, type RoleKey,
} from '../hooks/useRolePermissions';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AppConfig } from '../../types';
import {
  getBusinessConfig,
  listUsers,
  updateBusiness,
  createInvitationWithMirror,
  listInvitations,
  revokeInvitation,
} from '../firebase/api';
import { sendInviteEmail } from '../utils/emailService';
import {
  Building2,
  Receipt,
  Users2,
  ShieldCheck,
  CreditCard,
  Save,
  ArrowLeft,
  LogOut,
  Camera,
  Copy,
  Plus,
  ChevronRight,
  Loader2,
  Globe,
  Phone,
  Mail,
  MapPin,
  Percent,
  Coins,
  FileText,
  MessageSquare,
  Monitor,
  Fingerprint,
  Activity,
  X,
  Sliders,
  Type,
  Zap,
  Palette,
  UserCheck,
  UserX,
  Clock,
  Sparkles,
  Send,
  Link,
  Trash2,
  UserPlus,
  CheckCircle2,
  Database,
  AlertTriangle,
  Truck,
  Package,
  User,
  KeyRound,
  BadgeCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import AuditLogViewer from '../components/AuditLogViewer';
import { acceptRequest, rejectRequest } from '../firebase/api';
import { seedTestData } from '../utils/seedTestData';

type SectionType = 'perfil' | 'identidad' | 'facturacion' | 'equipo' | 'seguridad' | 'suscripcion' | 'apariencia' | 'funciones' | 'despacho' | 'comisiones' | 'devtest';

interface ConfigData {
  companyName: string;
  companyRif: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  defaultIva: number;
  mainCurrency: 'USD' | 'BS';
  invoicePrefix: string;
  ticketFooter: string;
  security: {
    twoFactor: boolean;
    auditLogs: boolean;
    terminalMonitor: boolean;
  };
}

interface UiPrefs {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  accentColor: 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'blue';
  borderRadius: 'sharp' | 'normal' | 'rounded' | 'pill';
  density: 'compact' | 'normal' | 'spacious';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  numberFormat: 'dot' | 'comma';
  animationSpeed: 'fast' | 'normal' | 'slow' | 'none';
}

const DEFAULT_UI_PREFS: UiPrefs = {
  fontSize: 'base',
  accentColor: 'violet',
  borderRadius: 'normal',
  density: 'normal',
  dateFormat: 'DD/MM/YYYY',
  numberFormat: 'dot',
  animationSpeed: 'normal',
};

function applyUiPrefs(prefs: UiPrefs) {
  const root = document.documentElement;
  const fontSizes: Record<UiPrefs['fontSize'], string> = {
    xs: '11px', sm: '13px', base: '14px', lg: '16px', xl: '18px',
  };
  root.style.fontSize = fontSizes[prefs.fontSize] ?? '14px';
  const accents: Record<UiPrefs['accentColor'], { p: string; h: string; s: string }> = {
    indigo:  { p: '#4f46e5', h: '#4338ca', s: 'rgba(79,70,229,0.08)'   },
    violet:  { p: '#7c3aed', h: '#6d28d9', s: 'rgba(124,58,237,0.08)'  },
    emerald: { p: '#059669', h: '#047857', s: 'rgba(5,150,105,0.08)'    },
    rose:    { p: '#e11d48', h: '#be123c', s: 'rgba(225,29,72,0.08)'    },
    amber:   { p: '#d97706', h: '#b45309', s: 'rgba(217,119,6,0.08)'    },
    blue:    { p: '#2563eb', h: '#1d4ed8', s: 'rgba(37,99,235,0.08)'    },
  };
  const a = accents[prefs.accentColor] ?? accents.violet;
  root.style.setProperty('--ui-accent', a.p);
  root.style.setProperty('--ui-accent-hover', a.h);
  root.style.setProperty('--ui-soft', a.s);
  const radii: Record<UiPrefs['borderRadius'], string> = {
    sharp: '4px', normal: '12px', rounded: '20px', pill: '9999px',
  };
  root.style.setProperty('--ui-radius', radii[prefs.borderRadius] ?? '12px');
  root.setAttribute('data-density', prefs.density);
  const speeds: Record<UiPrefs['animationSpeed'], string> = {
    fast: '0.1s', normal: '0.25s', slow: '0.5s', none: '0s',
  };
  root.style.setProperty('--ui-transition', speeds[prefs.animationSpeed] ?? '0.25s');
}

const Configuracion: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, updateUserProfile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [activeSection, setActiveSection] = useState<SectionType>('perfil');
  const [users, setUsers] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [processingReq, setProcessingReq] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Seed test data
  const [seedProgress, setSeedProgress] = useState<{ msg: string; pct: number } | null>(null);
  const [seedResult, setSeedResult] = useState<{ products: number; customers: number; suppliers: number; movements: number; terminals: number } | null>(null);

  // Terminals (for assigning cajeros)
  const [terminals, setTerminals] = useState<any[]>([]);

  // Invite modal
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('ventas');
  const [inviteSending, setInviteSending] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteCopied, setInviteCopied] = useState<string | null>(null);

  // NDE / Despacho config
  const [ndeConfig, setNdeConfig] = useState({
    enabled: false,
    defaultMode: false,
    showLogo: true,
    showPoweredBy: true,
    footerMessage: '',
    rejectionReasons: ['Sin stock', 'Avería en transporte', 'Dirección incorrecta', 'Cliente ausente'] as string[],
    requireRejectionReason: false,
    autoNotifyVendedor: false,
  });
  const [savingNde, setSavingNde] = useState(false);

  // Commissions config
  const [commissions, setCommissions] = useState({
    enabled: false,
    perBulto: 0,
    target: 'vendedor' as 'vendedor' | 'almacenista' | 'both',
    splitVendedor: 50,
    splitAlmacenista: 50,
  });
  const [savingCommissions, setSavingCommissions] = useState(false);

  // Profile state
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Feature toggles (guardados en businessConfigs/{bid})
  // multiCurrency siempre true — no configurable
  const [features, setFeatures] = useState({
    bookComparison:   true,
    personalBooks:    false,
    peerComparison:   true,
    aiVision:         true,
  });
  const [savingFeatures, setSavingFeatures] = useState(false);

  // Role permissions (editable matrix)
  const [rolePerms, setRolePerms] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [activeRoleTab, setActiveRoleTab] = useState<RoleKey>('ventas');
  const [savingPerms, setSavingPerms] = useState(false);

  // PIN Modal state
  const [pinModal, setPinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState('');

  const [configData, setConfigData] = useState<ConfigData>({
    companyName: '',
    companyRif: '',
    companyPhone: '',
    companyEmail: '',
    companyAddress: '',
    defaultIva: 16,
    mainCurrency: 'USD',
    invoicePrefix: 'FACT-',
    ticketFooter: '¡Gracias por su compra!',
    security: {
      twoFactor: false,
      auditLogs: true,
      terminalMonitor: true,
    },
  });

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';
  const isOwner = userProfile?.role === 'owner';
  const businessId = userProfile?.businessId;

  useEffect(() => {
    const loadData = async () => {
      if (!businessId) return;
      setLoading(true);
      try {
        const [configSnap, usersSnap, featuresSnap] = await Promise.all([
          getBusinessConfig(businessId),
          listUsers(businessId),
          getDoc(doc(db, 'businessConfigs', businessId)).then(d => d.exists() ? d.data() : null),
        ]);
        if (configSnap) {
          setConfigData(prev => ({
            ...prev,
            ...configSnap,
            defaultIva: Number(configSnap.defaultIva || 16),
          }));
        }
        setUsers(usersSnap);
        if (featuresSnap?.features) {
          setFeatures(prev => ({ ...prev, ...featuresSnap.features }));
          // Sync isolation mode from Firestore to localStorage
          if (featuresSnap.features.personalBooks !== undefined) {
            localStorage.setItem('operation_isolation_mode', featuresSnap.features.personalBooks ? 'individual' : 'shared');
          }
        }
        if (featuresSnap?.ndeConfig) {
          setNdeConfig(prev => ({ ...prev, ...featuresSnap.ndeConfig }));
        }
        if (featuresSnap?.commissions) {
          setCommissions(prev => ({ ...prev, ...featuresSnap.commissions }));
        }
        if (featuresSnap?.rolePermissions) {
          setRolePerms(prev => ({ ...prev, ...featuresSnap.rolePermissions }));
        }
      } catch (e) {
        console.error('Error cargando configuración:', e);
        toast.error('No se pudo cargar la configuración');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [businessId]);

  // Init profile display name from userProfile
  useEffect(() => {
    if (userProfile?.displayName) setProfileDisplayName(userProfile.displayName);
  }, [userProfile?.displayName]);

  // Load terminals for cajero assignment
  useEffect(() => {
    if (!businessId || !isAdmin) return;
    const q = collection(db, 'businesses', businessId, 'terminals');
    const unsub = onSnapshot(q, snap => {
      setTerminals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [businessId, isAdmin]);

  // Listener en tiempo real de solicitudes pendientes — consulta directamente users collection
  useEffect(() => {
    if (!businessId || !isAdmin) return;
    const q = query(
      collection(db, 'users'),
      where('businessId', '==', businessId),
      where('status', '==', 'PENDING_APPROVAL')
    );
    const unsub = onSnapshot(q, snap => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingRequests(reqs);
      setRequestRoles(prev => {
        const next = { ...prev };
        reqs.forEach((r: any) => { if (!next[r.id]) next[r.id] = 'ventas'; });
        return next;
      });
    });
    return unsub;
  }, [businessId, isAdmin]);

  const handleApprove = async (req: any) => {
    setProcessingReq(req.id);
    try {
      await acceptRequest(req.id, requestRoles[req.id] || 'ventas');
      setUsers(prev => [...prev, { uid: req.id, email: req.email, fullName: req.fullName, role: requestRoles[req.id] || 'ventas', status: 'ACTIVE' }]);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingReq(null);
    }
  };

  const handleReject = async (req: any) => {
    setProcessingReq(req.id);
    try {
      await rejectRequest(req.id);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingReq(null);
    }
  };

  useEffect(() => {
    if (!userProfile?.uid) return;
    getDoc(doc(db, 'users', userProfile.uid)).then(snap => {
      if (snap.exists() && snap.data().uiPrefs) {
        const saved = { ...DEFAULT_UI_PREFS, ...snap.data().uiPrefs } as UiPrefs;
        setUiPrefs(saved);
        applyUiPrefs(saved);
      }
    }).catch(() => {});
  }, [userProfile?.uid]);

  // Load invitations
  useEffect(() => {
    if (!businessId || !isAdmin) return;
    listInvitations(businessId).then(setInvitations).catch(() => {});
  }, [businessId, isAdmin]);

  const handleSendInvite = async () => {
    if (!businessId || !userProfile?.uid || !inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      const companyName = configData.companyName || 'Mi Negocio';
      const result = await createInvitationWithMirror({
        businessId,
        email: inviteEmail.trim(),
        role: inviteRole,
        invitedBy: userProfile.uid,
        inviterName: userProfile.displayName || userProfile.fullName || 'Admin',
        businessName: companyName,
        expiresInHours: 48,
      });

      const baseUrl = window.location.origin;
      const inviteUrl = `${baseUrl}/join?token=${result.token}`;

      try {
        await sendInviteEmail({
          toEmail: inviteEmail.trim(),
          inviterName: userProfile.displayName || userProfile.fullName || 'Admin',
          businessName: companyName,
          role: inviteRole,
          inviteUrl,
          expiresAt: result.expiresAt,
        });
      } catch (e) {
        console.warn('Email send failed, but invitation was created:', e);
      }

      toast.success(`Invitación enviada a ${inviteEmail}`);
      setInviteModal(false);
      setInviteEmail('');
      setInviteRole('ventas');
      // Reload invitations
      listInvitations(businessId).then(setInvitations).catch(() => {});
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error al crear la invitación');
    } finally {
      setInviteSending(false);
    }
  };

  const handleRevokeInvite = async (token: string) => {
    if (!businessId || !userProfile?.uid) return;
    if (!confirm('¿Revocar esta invitación? Ya no podrá ser utilizada.')) return;
    try {
      await revokeInvitation(businessId, token, userProfile.uid);
      setInvitations(prev => prev.map(inv => inv.token === token ? { ...inv, status: 'revoked' } : inv));
      toast.success('Invitación revocada');
    } catch {
      toast.error('Error al revocar la invitación');
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/join?token=${token}`;
    navigator.clipboard?.writeText(url);
    setInviteCopied(token);
    setTimeout(() => setInviteCopied(null), 2000);
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser || !userProfile?.uid) return;
    setSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, { displayName: profileDisplayName.trim() });
      await setDoc(doc(db, 'users', userProfile.uid), { displayName: profileDisplayName.trim() }, { merge: true });
      updateUserProfile({ displayName: profileDisplayName.trim() });
      toast.success('Perfil actualizado');
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar el perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    if (!currentPassword) { toast.error('Ingresa tu contraseña actual'); return; }
    if (newPassword.length < 6) { toast.error('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { toast.error('Las contraseñas no coinciden'); return; }
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Contraseña actualizada correctamente');
    } catch (e: any) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        toast.error('Contraseña actual incorrecta');
      } else {
        toast.error('Error al cambiar la contraseña');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!isAdmin || !businessId || !userProfile?.uid) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'businessConfigs', businessId);
      await setDoc(docRef, {
        ...configData,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile.uid,
      }, { merge: true });

      await updateBusiness(businessId, {
        name: configData.companyName,
        rif: configData.companyRif,
      });

      toast.success('Configuración guardada correctamente');
    } catch (e) {
      console.error('Error al guardar:', e);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async () => {
    if (!userProfile?.uid) return;
    if (newPinValue.length !== 4) {
      toast.warning('El PIN debe ser exactamente de 4 dígitos');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', userProfile.uid), { pin: newPinValue }, { merge: true });
      updateUserProfile({ pin: newPinValue });
      toast.success('PIN Maestro actualizado correctamente');
      setPinModal(false);
      setNewPinValue('');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar el PIN');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleSaveRolePermissions = async () => {
    if (!businessId) return;
    setSavingPerms(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), { rolePermissions: rolePerms }, { merge: true });
      toast.success('Permisos de roles actualizados');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar permisos');
    } finally {
      setSavingPerms(false);
    }
  };

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (!preset) return;
    const full = Object.fromEntries(ALL_MODULES.map(m => [m, preset[m] ?? false])) as Record<ModuleId, boolean>;
    setRolePerms(prev => ({ ...prev, [activeRoleTab]: full }));
  };

  const togglePerm = (moduleId: ModuleId) => {
    setRolePerms(prev => ({
      ...prev,
      [activeRoleTab]: { ...prev[activeRoleTab], [moduleId]: !prev[activeRoleTab][moduleId] },
    }));
  };

  const handleSaveFeatures = async () => {
    if (!businessId) return;
    setSavingFeatures(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), { features }, { merge: true });
      // Sync isolation mode with localStorage for RRHH and BooksComparePanel
      localStorage.setItem('operation_isolation_mode', features.personalBooks ? 'individual' : 'shared');
      toast.success('Funciones del sistema actualizadas');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar funciones');
    } finally {
      setSavingFeatures(false);
    }
  };

  const handleSaveNde = async () => {
    if (!businessId) return;
    setSavingNde(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), { ndeConfig }, { merge: true });
      toast.success('Configuración de NDE guardada');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar configuración NDE');
    } finally {
      setSavingNde(false);
    }
  };

  const handleSaveCommissions = async () => {
    if (!businessId) return;
    setSavingCommissions(true);
    try {
      await setDoc(doc(db, 'businessConfigs', businessId), { commissions }, { merge: true });
      toast.success('Configuración de comisiones guardada');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar comisiones');
    } finally {
      setSavingCommissions(false);
    }
  };

  const handleSaveUiPrefs = async () => {
    if (!userProfile?.uid) return;
    setSavingPrefs(true);
    try {
      await setDoc(doc(db, 'users', userProfile.uid), { uiPrefs }, { merge: true });
      applyUiPrefs(uiPrefs);
      toast.success('Preferencias de apariencia guardadas');
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar preferencias');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] flex items-center justify-center">
        <Loader2 className="animate-spin h-10 w-10 text-indigo-500" />
      </div>
    );
  }

  const menuGroups = [
    {
      label: 'Mi Cuenta',
      items: [
        { id: 'perfil',     label: 'Mi Perfil',           icon: User },
        { id: 'apariencia', label: 'Apariencia',           icon: Palette },
      ],
    },
    {
      label: 'Mi Empresa',
      items: [
        { id: 'identidad',  label: 'Identidad',            icon: Building2 },
        { id: 'facturacion',label: 'Facturación y POS',    icon: Receipt },
        { id: 'despacho',   label: 'Despacho / NDE',       icon: Truck },
        { id: 'comisiones', label: 'Comisiones',            icon: Package },
        { id: 'equipo',     label: 'Equipo y Permisos',    icon: Users2 },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { id: 'funciones',  label: 'Funciones',             icon: Sliders },
        { id: 'seguridad',  label: 'Seguridad',             icon: ShieldCheck },
        { id: 'suscripcion',label: 'Suscripción',           icon: CreditCard },
        ...(isAdmin ? [{ id: 'devtest', label: 'Dev / Test', icon: Database }] : []),
      ],
    },
  ];
  const menuItems = menuGroups.flatMap(g => g.items);

  const inputClasses =
    'w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-white/20';

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#070b14] flex flex-col font-inter">
      {/* HEADER */}
      <header className="h-16 bg-white dark:bg-[#0d1424] border-b border-slate-200 dark:border-white/[0.07] px-4 md:px-6 flex items-center justify-between shrink-0 z-20 shadow-sm shadow-black/5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-400 dark:text-white/40 transition-all border border-transparent hover:border-slate-100 dark:hover:border-white/[0.08]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Centro de Configuración</h1>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Workspace Enterprise
            </div>
          </div>
        </div>
        <button
          disabled={saving}
          onClick={handleSaveConfig}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={15} /> : <><Save size={15} /> Guardar Cambios</>}
        </button>
      </header>

      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        {/* MOBILE HORIZONTAL TAB BAR */}
        <div className="sm:hidden border-b border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] overflow-x-auto custom-scroll shrink-0">
          <nav className="flex gap-1 p-2 min-w-max">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as SectionType)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeSection === item.id
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-white'
                }`}
              >
                <item.icon size={14} className={activeSection === item.id ? 'text-indigo-200' : 'text-slate-300 dark:text-white/30'} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* DESKTOP ASIDE */}
        <aside className="hidden sm:flex flex-col w-64 border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1424] overflow-y-auto custom-scroll shrink-0">
          {/* User card at top */}
          <button
            onClick={() => setActiveSection('perfil')}
            className={`flex items-center gap-3 p-4 border-b border-slate-100 dark:border-white/[0.07] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all text-left ${activeSection === 'perfil' ? 'bg-indigo-50/60 dark:bg-indigo-500/[0.08]' : ''}`}
          >
            <div className="relative shrink-0">
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt="" className="w-10 h-10 rounded-xl object-cover border-2 border-indigo-500/30" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm">
                  {(userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0d1424]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-white truncate leading-none">
                {userProfile?.displayName || 'Mi Perfil'}
              </p>
              <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 truncate mt-0.5">
                {userProfile?.email}
              </p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                isOwner ? 'bg-amber-500/15 text-amber-500' : isAdmin ? 'bg-indigo-500/15 text-indigo-500' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/30'
              }`}>
                {userProfile?.role || 'usuario'}
              </span>
            </div>
          </button>

          {/* Grouped nav */}
          <nav className="flex-1 p-3 space-y-4">
            {menuGroups.map(group => (
              <div key={group.label}>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-white/20 px-3 mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id as SectionType)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-[11px] transition-all ${
                        activeSection === item.id
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                          : 'text-slate-500 dark:text-white/40 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:text-slate-700 dark:hover:text-white'
                      }`}
                    >
                      <item.icon size={15} className={activeSection === item.id ? 'text-indigo-200' : 'text-slate-300 dark:text-white/25'} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-slate-100 dark:border-white/[0.07]">
            <button
              onClick={() => auth.signOut()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-[11px] text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
            >
              <LogOut size={15} /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto custom-scroll bg-slate-50 dark:bg-[#070b14]">
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-right-6 duration-700">

            {/* PERFIL */}
            {activeSection === 'perfil' && (
              <div className="space-y-5 pb-10">
                {/* Hero banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 shadow-xl shadow-indigo-500/25">
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
                  <div className="relative flex items-center gap-5">
                    <div className="relative shrink-0">
                      {userProfile?.photoURL ? (
                        <img src={userProfile.photoURL} alt="" className="w-20 h-20 rounded-2xl object-cover border-4 border-white/30 shadow-lg" />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur border-4 border-white/30 flex items-center justify-center text-white font-black text-2xl shadow-lg">
                          {(userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xl font-black text-white leading-none">{userProfile?.displayName || 'Sin nombre'}</p>
                      <p className="text-indigo-200 text-sm mt-1">{userProfile?.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2.5 py-1 rounded-lg bg-white/20 text-white text-[10px] font-black uppercase tracking-widest">
                          {userProfile?.role || 'usuario'}
                        </span>
                        <span className="flex items-center gap-1 text-emerald-300 text-[10px] font-black">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          En línea
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Información personal */}
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                      <User size={16} className="text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Información Personal</h3>
                      <p className="text-[10px] text-slate-400 dark:text-white/30">Tu nombre público y datos de cuenta</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Nombre completo</label>
                      <input
                        type="text"
                        value={profileDisplayName}
                        onChange={e => setProfileDisplayName(e.target.value)}
                        placeholder="Tu nombre visible"
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Correo electrónico</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
                        <input
                          type="email"
                          value={userProfile?.email || ''}
                          readOnly
                          className="w-full px-4 py-3 pl-10 bg-slate-50/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl text-sm font-bold dark:text-white/50 text-slate-400 cursor-not-allowed"
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 dark:text-white/20 mt-1 ml-1">El correo no se puede cambiar desde aquí.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Rol</label>
                        <div className="px-4 py-3 bg-slate-50/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl flex items-center gap-2">
                          <BadgeCheck size={14} className={isOwner ? 'text-amber-500' : isAdmin ? 'text-indigo-500' : 'text-slate-400'} />
                          <span className="text-sm font-black text-slate-700 dark:text-white capitalize">{userProfile?.role || '—'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Estado</label>
                        <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">Activo</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile || !profileDisplayName.trim()}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20"
                    >
                      {savingProfile ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                      Guardar Perfil
                    </button>
                  </div>
                </div>

                {/* Cambiar contraseña */}
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <KeyRound size={16} className="text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Cambiar Contraseña</h3>
                      <p className="text-[10px] text-slate-400 dark:text-white/30">Elige una contraseña segura de al menos 6 caracteres</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Contraseña actual</label>
                      <div className="relative">
                        <input
                          type={showCurrentPwd ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className={inputClasses + ' pr-11'}
                        />
                        <button type="button" onClick={() => setShowCurrentPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20 hover:text-slate-500 dark:hover:text-white/50 transition-colors">
                          {showCurrentPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Nueva contraseña</label>
                      <div className="relative">
                        <input
                          type={showNewPwd ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className={inputClasses + ' pr-11'}
                        />
                        <button type="button" onClick={() => setShowNewPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20 hover:text-slate-500 dark:hover:text-white/50 transition-colors">
                          {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-1.5 block">Confirmar nueva contraseña</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`${inputClasses} ${confirmPassword && confirmPassword !== newPassword ? 'border-rose-400 dark:border-rose-500/40 focus:ring-rose-500' : ''}`}
                      />
                      {confirmPassword && confirmPassword !== newPassword && (
                        <p className="text-[10px] text-rose-500 mt-1 ml-1 font-bold">Las contraseñas no coinciden</p>
                      )}
                    </div>
                    <button
                      onClick={handleChangePassword}
                      disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                    >
                      {savingPassword ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />}
                      Actualizar Contraseña
                    </button>
                  </div>
                </div>

                {/* Sesión */}
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/5 p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">Cerrar sesión</p>
                    <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">Salir de tu cuenta en este dispositivo</p>
                  </div>
                  <button
                    onClick={() => auth.signOut()}
                    className="px-5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-500 text-xs font-black uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all flex items-center gap-2"
                  >
                    <LogOut size={14} /> Cerrar sesión
                  </button>
                </div>
              </div>
            )}

            {/* IDENTIDAD */}
            {activeSection === 'identidad' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Building2 className="text-indigo-500" size={22} /> Identidad del Negocio
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-white/30 font-medium mt-1">Configura los datos fiscales y públicos de tu empresa.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mb-5 pb-5 border-b border-slate-50 dark:border-white/[0.06]">
                    <div className="relative group">
                      <div className="h-24 w-24 rounded-2xl bg-slate-50 dark:bg-white/[0.05] flex items-center justify-center border-2 border-white dark:border-white/[0.1] shadow-lg overflow-hidden group-hover:scale-105 transition-transform duration-300">
                        <Building2 size={36} className="text-slate-300 dark:text-white/20" />
                      </div>
                      <button className="absolute -bottom-1.5 -right-1.5 h-8 w-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white dark:border-[#0d1424] hover:bg-indigo-500 active:scale-95 transition-all">
                        <Camera size={14} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Logo Corporativo</h4>
                      <p className="text-xs text-slate-400 dark:text-white/30 font-medium leading-relaxed max-w-xs">Aparecerá en facturas, tickets y correos. SVG o PNG transparente.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Globe size={12} /> Nombre Comercial</label>
                      <input value={configData.companyName} onChange={e => setConfigData({ ...configData, companyName: e.target.value })} placeholder="Ej. Mi Empresa" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><FileText size={12} /> RIF / Documento Fiscal</label>
                      <input value={configData.companyRif} onChange={e => setConfigData({ ...configData, companyRif: e.target.value })} placeholder="J-00000000-0" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Phone size={12} /> Teléfono</label>
                      <input value={configData.companyPhone} onChange={e => setConfigData({ ...configData, companyPhone: e.target.value })} placeholder="+58 412 0000000" className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Mail size={12} /> Correo Electrónico</label>
                      <input value={configData.companyEmail} onChange={e => setConfigData({ ...configData, companyEmail: e.target.value })} placeholder="contacto@empresa.com" className={inputClasses} />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><MapPin size={12} /> Dirección Fiscal</label>
                      <textarea rows={3} value={configData.companyAddress} onChange={e => setConfigData({ ...configData, companyAddress: e.target.value })} placeholder="Calle, Edificio, Ciudad..." className={`${inputClasses} py-5 resize-none`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FACTURACIÓN */}
            {activeSection === 'facturacion' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-5">
                    <Receipt className="text-emerald-500" size={22} /> Parámetros de Venta
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Percent size={12} /> IVA por Defecto (%)</label>
                      <input type="number" value={configData.defaultIva} onChange={e => setConfigData({ ...configData, defaultIva: Number(e.target.value) })} className={inputClasses} />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><Coins size={12} /> Moneda Principal</label>
                      <select value={configData.mainCurrency} onChange={e => setConfigData({ ...configData, mainCurrency: e.target.value as any })} className={inputClasses}>
                        <option value="USD">Dólares (USD)</option>
                        <option value="BS">Bolívares (VES)</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><FileText size={12} /> Prefijo de Facturación</label>
                      <input value={configData.invoicePrefix} onChange={e => setConfigData({ ...configData, invoicePrefix: e.target.value.toUpperCase() })} className={inputClasses} placeholder="FACT-" />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 flex items-center gap-2"><MessageSquare size={12} /> Mensaje al Pie del Ticket</label>
                      <textarea rows={3} value={configData.ticketFooter} onChange={e => setConfigData({ ...configData, ticketFooter: e.target.value })} className={`${inputClasses} py-5 resize-none`} placeholder="Gracias por preferirnos..." />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EQUIPO */}
            {activeSection === 'equipo' && (
              <div className="space-y-5">

                {/* ── SOLICITUDES PENDIENTES ── */}
                {pendingRequests.length > 0 && (
                  <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-amber-500/30 shadow-lg shadow-black/10 overflow-hidden">
                    <div className="px-5 py-4 border-b border-amber-500/20 bg-amber-500/[0.04] flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                        <Clock size={15} className="text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                          Solicitudes de Acceso
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 mt-0.5">
                          {pendingRequests.length} persona{pendingRequests.length > 1 ? 's' : ''} esperando aprobación
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {pendingRequests.map(req => (
                        <div key={req.id} className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          {/* Avatar + info */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-black text-amber-400 text-base shrink-0">
                              {(req.fullName || req.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900 dark:text-white truncate">{req.fullName || 'Sin nombre'}</p>
                              <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 truncate">{req.email}</p>
                              <p className="text-[9px] text-white/20 mt-0.5">
                                {(req.joinRequestedAt || req.createdAt) ? new Date(req.joinRequestedAt || req.createdAt).toLocaleDateString('es-VE', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                              </p>
                            </div>
                          </div>
                          {/* Role selector */}
                          <select
                            value={requestRoles[req.id] || 'ventas'}
                            onChange={e => setRequestRoles(prev => ({ ...prev, [req.id]: e.target.value }))}
                            disabled={processingReq === req.id}
                            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-sm font-bold text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="ventas">Ventas</option>
                            <option value="almacenista">Almacenista</option>
                            <option value="inventario">Jefe de Inventario</option>
                            <option value="auditor">Auditor</option>
                            <option value="staff">Staff</option>
                          </select>
                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleApprove(req)}
                              disabled={processingReq === req.id}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                            >
                              {processingReq === req.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <UserCheck size={13} />
                              }
                              Aprobar
                            </button>
                            <button
                              onClick={() => handleReject(req)}
                              disabled={processingReq === req.id}
                              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                            >
                              <UserX size={13} /> Rechazar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* ── MIEMBROS ACTIVOS ── */}
              <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden pb-4">
                <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Gestión de Equipo</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mt-0.5">Control de Roles y Autorizaciones</p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => setInviteModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/30 transition-all active:scale-95"
                    >
                      <UserPlus size={14} /> Invitar Miembro
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-50 dark:border-white/[0.05]">
                        <th className="px-5 py-3.5">Identidad</th>
                        <th className="px-5 py-3.5 text-center">Nivel</th>
                        <th className="px-5 py-3.5 text-center">Estado</th>
                        <th className="px-5 py-3.5 text-right">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {users.filter(u => u.status === 'ACTIVE').map(u => {
                        const isOwner = u.role === 'owner';
                        const isSelf  = u.uid === userProfile?.uid;
                        return (
                          <tr key={u.uid} className="group transition-all hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center font-black text-slate-400 text-base group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white transition-all">
                                  {u.fullName?.charAt(0) || u.email?.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900 dark:text-white">
                                    {u.fullName || 'Sin nombre'}
                                    {isSelf && <span className="ml-2 text-[9px] text-indigo-400 font-black uppercase tracking-widest">(tú)</span>}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 tracking-tight mt-0.5">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              {isAdmin && !isOwner && !isSelf ? (
                                <div className="flex flex-col items-center gap-1.5">
                                <select
                                  defaultValue={u.role}
                                  onChange={async e => {
                                    const newRole = e.target.value;
                                    try {
                                      await updateDoc(doc(db, 'users', u.uid), { role: newRole });
                                      setUsers(prev => prev.map(m => m.uid === u.uid ? { ...m, role: newRole } : m));
                                    } catch { toast.error('No se pudo actualizar el rol'); }
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-[10px] font-black text-slate-700 dark:text-white uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="admin">Admin</option>
                                  <option value="ventas">Ventas</option>
                                  <option value="almacenista">Almacenista</option>
                                  <option value="inventario">Jefe de Inventario</option>
                                  <option value="auditor">Auditor</option>
                                  <option value="staff">Staff</option>
                                </select>
                                {u.role === 'ventas' && (
                                  <select
                                    value={u.assignedCajaId || ''}
                                    onChange={async e => {
                                      const cajaId = e.target.value || null;
                                      try {
                                        await updateDoc(doc(db, 'users', u.uid), { assignedCajaId: cajaId });
                                        setUsers(prev => prev.map(m => m.uid === u.uid ? { ...m, assignedCajaId: cajaId } : m));
                                      } catch { toast.error('No se pudo asignar la caja'); }
                                    }}
                                    className="px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] font-black text-amber-400 uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500 w-full"
                                  >
                                    <option value="">Sin caja asignada</option>
                                    {terminals.map(t => (
                                      <option key={t.id} value={t.id}>{t.nombre || t.name || t.id}</option>
                                    ))}
                                  </select>
                                )}
                                </div>
                              ) : (
                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                  isOwner
                                    ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/30'
                                    : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/30'
                                }`}>{u.role}</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/30">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Activo
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isAdmin && !isOwner && !isSelf && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`¿Eliminar a ${u.fullName || u.email} del equipo?`)) return;
                                    try {
                                      await updateDoc(doc(db, 'users', u.uid), { status: 'REMOVED', businessId: null });
                                      setUsers(prev => prev.filter(m => m.uid !== u.uid));
                                    } catch { toast.error('No se pudo eliminar al miembro'); }
                                  }}
                                  className="p-2 rounded-xl text-slate-300 dark:text-white/20 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <UserX size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {users.filter(u => u.status === 'ACTIVE').length === 0 && (
                    <div className="px-5 py-12 text-center text-slate-400 dark:text-white/30 text-sm font-semibold">Sin miembros activos aún</div>
                  )}
                </div>

                {/* ── INVITACIONES PENDIENTES ── */}
                {isAdmin && invitations.filter(i => i.status === 'active').length > 0 && (
                  <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-emerald-500/20 shadow-lg shadow-black/10 overflow-hidden mx-5 mb-2 mt-2">
                    <div className="px-5 py-4 border-b border-emerald-500/10 bg-emerald-500/[0.03] flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                        <Send size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Invitaciones Activas</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 mt-0.5">
                          {invitations.filter(i => i.status === 'active').length} invitación{invitations.filter(i => i.status === 'active').length > 1 ? 'es' : ''} pendiente{invitations.filter(i => i.status === 'active').length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                      {invitations.filter(i => i.status === 'active').map(inv => {
                        const isExpired = new Date(inv.expiresAt) < new Date();
                        const roleLabels: Record<string, string> = { admin: 'Admin', ventas: 'Ventas', almacenista: 'Almacenista', inventario: 'Jefe de Inventario', auditor: 'Auditor', staff: 'Staff', member: 'Miembro' };
                        return (
                          <div key={inv.token} className="px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-black text-emerald-400 text-sm shrink-0">
                                <Mail size={15} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 dark:text-white truncate">{inv.email}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                    {roleLabels[inv.role] || inv.role}
                                  </span>
                                  {isExpired ? (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Expirada</span>
                                  ) : (
                                    <span className="text-[9px] text-white/20">
                                      Expira {new Date(inv.expiresAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => copyInviteLink(inv.token)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-white/[0.05] hover:bg-indigo-50 dark:hover:bg-indigo-500/10 border border-slate-200 dark:border-white/[0.08] rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                              >
                                {inviteCopied === inv.token ? <><CheckCircle2 size={12} className="text-emerald-400" /> Copiado</> : <><Link size={12} /> Copiar Link</>}
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(inv.token)}
                                className="p-2 rounded-xl text-slate-300 dark:text-white/20 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-all"
                                title="Revocar invitación"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── PERMISOS POR ROL (editable) ── */}
                {isAdmin && (
                  <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden mx-5 mb-5 mt-2">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Permisos por Rol</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mt-0.5">Define qué secciones puede ver cada rol. Owner y Admin siempre tienen acceso total.</p>
                    </div>

                    {/* Role tabs */}
                    <div className="px-5 pt-4 flex gap-2 flex-wrap">
                      {(['ventas','auditor','staff','member'] as RoleKey[]).map(role => (
                        <button
                          key={role}
                          onClick={() => setActiveRoleTab(role)}
                          className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                            activeRoleTab === role
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent shadow-md shadow-indigo-500/25'
                              : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/40 border-slate-200 dark:border-white/[0.06] hover:border-indigo-400/40'
                          }`}
                        >
                          {role === 'ventas' ? 'Ventas' : role === 'auditor' ? 'Auditor' : role === 'staff' ? 'Staff' : 'Miembro'}
                        </button>
                      ))}
                    </div>

                    {/* Presets */}
                    <div className="px-5 pt-3 pb-4 border-b border-slate-50 dark:border-white/[0.05]">
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/25 mb-2">Presets rápidos</p>
                      <div className="flex gap-2 flex-wrap">
                        {Object.keys(PRESETS).map(preset => (
                          <button
                            key={preset}
                            onClick={() => applyPreset(preset)}
                            className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Toggle grid */}
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_MODULES.map(moduleId => {
                        const enabled = rolePerms[activeRoleTab]?.[moduleId] ?? false;
                        return (
                          <button
                            key={moduleId}
                            onClick={() => togglePerm(moduleId)}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                              enabled
                                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/25'
                                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.1]'
                            }`}
                          >
                            <span className={`text-[11px] font-semibold ${enabled ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-white/40'}`}>
                              {MODULE_LABELS[moduleId]}
                            </span>
                            <div className={`relative w-9 h-5 rounded-full transition-all shrink-0 ${enabled ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/[0.1]'}`}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-4' : 'left-0.5'}`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Save */}
                    <div className="px-5 pb-5">
                      <button
                        onClick={handleSaveRolePermissions}
                        disabled={savingPerms}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-md shadow-indigo-500/25 hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {savingPerms ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Guardar Permisos
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </div>
            )}

            {/* FUNCIONES */}
            {activeSection === 'funciones' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Funciones del Sistema</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mt-0.5">Activa o desactiva módulos para tu equipo</p>
                  </div>
                  <div className="p-5 space-y-3">
                    {[
                      {
                        key: 'bookComparison',
                        icon: FileText,
                        title: 'Comparación de Libros',
                        desc: 'El dueño puede comparar los registros de CxC/CxP entre vendedores y detectar diferencias.',
                        phase: null,
                        color: 'text-emerald-400',
                      },
                      {
                        key: 'aiVision',
                        icon: Sparkles,
                        title: 'VisionLab IA (Gemini)',
                        desc: 'Análisis inteligente de P&L, flujo de caja, alertas y predicciones con Google Gemini.',
                        phase: null,
                        color: 'text-violet-400',
                      },
                      {
                        key: 'personalBooks',
                        icon: Globe,
                        title: 'Libros Individuales por Usuario',
                        desc: 'Cada usuario opera en su propio libro de RRHH/Nómina. Nadie puede ver ni alterar lo que otro registra. El dueño ve todo desde el AuditLog.',
                        phase: null,
                        color: 'text-sky-400',
                      },
                      {
                        key: 'peerComparison',
                        icon: Users2,
                        title: 'Comparación entre Compañeros',
                        desc: 'Los usuarios pueden comparar sus libros entre ellos, detectar diferencias y resolver discrepancias con comentarios.',
                        phase: null,
                        color: 'text-rose-400',
                      },
                    ].map(feat => {
                      const isPhase2 = feat.phase !== null;
                      const val = features[feat.key as keyof typeof features];
                      return (
                        <div key={feat.key} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isPhase2 ? 'border-slate-100 dark:border-white/[0.04] opacity-60' : 'border-slate-100 dark:border-white/[0.07] hover:border-slate-200 dark:hover:border-white/[0.12]'}`}>
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${val && !isPhase2 ? `bg-${feat.color.replace('text-','')}/10` : 'bg-slate-100 dark:bg-white/[0.05]'}`}>
                              <feat.icon size={16} className={val && !isPhase2 ? feat.color : 'text-slate-400 dark:text-white/25'} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black text-slate-900 dark:text-white">{feat.title}</h4>
                                {feat.phase && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-white/25">{feat.phase}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 leading-relaxed">{feat.desc}</p>
                            </div>
                          </div>
                          <div
                            onClick={() => {
                              if (isPhase2 || !isAdmin) return;
                              setFeatures(prev => ({ ...prev, [feat.key]: !prev[feat.key as keyof typeof prev] }));
                            }}
                            className={`h-7 w-12 rounded-full relative transition-colors shrink-0 ml-4 ${isPhase2 || !isAdmin ? 'cursor-not-allowed' : 'cursor-pointer'} ${val && !isPhase2 ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/10'}`}
                          >
                            <div className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-all shadow-sm ${val && !isPhase2 ? 'right-1' : 'left-1'}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveFeatures}
                      disabled={savingFeatures}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
                    >
                      {savingFeatures ? <Loader2 className="animate-spin" size={15} /> : <><Save size={15} /> Guardar Funciones</>}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SEGURIDAD */}
            {activeSection === 'seguridad' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-5">
                    <ShieldCheck className="text-indigo-500" size={22} /> Protocolos de Seguridad
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'twoFactor', title: 'Autenticación de Dos Factores (2FA)', desc: 'Protege tu acceso con un código dinámico adicional.', enabled: configData.security.twoFactor, icon: Fingerprint },
                      { id: 'auditLogs', title: 'Registros de Auditoría', desc: 'Seguimiento de inicios de sesión y acciones críticas.', enabled: configData.security.auditLogs, icon: Activity },
                      { id: 'terminalMonitor', title: 'Monitoreo de Terminales', desc: 'Controla qué dispositivos están autorizados para facturar.', enabled: configData.security.terminalMonitor, icon: Monitor },
                    ].map(opt => (
                      <div key={opt.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100 dark:border-white/[0.07] group hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-md transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${opt.enabled ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-white/[0.07] text-slate-400 dark:text-white/30'}`}>
                            <opt.icon size={20} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{opt.title}</h4>
                            <p className="text-xs text-slate-400 dark:text-white/30 font-medium mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                        <div
                          onClick={() => setConfigData({ ...configData, security: { ...configData.security, [opt.id]: !opt.enabled } })}
                          className={`h-7 w-12 rounded-full relative cursor-pointer transition-colors shrink-0 ${opt.enabled ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/10'}`}
                        >
                          <div className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-all shadow-sm ${opt.enabled ? 'right-1' : 'left-1'}`} />
                        </div>
                      </div>
                    ))}

                    {/* AUDIT LOG VIEWER */}
                    {configData.security.auditLogs && businessId && (
                      <div className="mt-4">
                        <AuditLogViewer businessId={businessId} />
                      </div>
                    )}

                    {/* PIN MAESTRO */}
                    <div className="mt-4 p-6 bg-gradient-to-br from-slate-900 to-[#0d1220] rounded-2xl text-white shadow-2xl shadow-black/30 relative overflow-hidden group border border-white/[0.06]">
                      <div className="absolute -right-10 -top-10 h-40 w-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10">
                        <h4 className="text-lg font-black mb-1.5 flex items-center gap-2">
                          <Fingerprint className="text-indigo-400" size={20} /> PIN de Autoridad Maestro
                        </h4>
                        <p className="text-white/40 text-xs font-medium mb-5 max-w-md">
                          Código de 4 dígitos requerido para eliminar facturas, clientes o realizar ajustes críticos.
                        </p>
                        <div className="flex flex-col md:flex-row items-center gap-5">
                          <div className="flex gap-2.5">
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} className={`h-12 w-10 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${userProfile?.pin ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-white/20'}`}>
                                {userProfile?.pin ? '●' : ''}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => { setNewPinValue(''); setPinModal(true); }}
                            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                          >
                            {userProfile?.pin ? 'Cambiar PIN Maestro' : 'Establecer PIN Ahora'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUSCRIPCION */}
            {activeSection === 'suscripcion' && (
              <div className="space-y-5 pb-10">
                <div className="bg-gradient-to-br from-slate-900 via-indigo-950/50 to-[#0d1220] p-6 rounded-2xl shadow-2xl shadow-black/30 text-white relative overflow-hidden group border border-white/[0.06]">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-700 pointer-events-none">
                    <ShieldCheck size={140} />
                  </div>
                  <div className="absolute -left-10 -bottom-10 h-40 w-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-4">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Plan Enterprise Activo
                    </div>
                    <h3 className="text-3xl font-black tracking-tighter mb-2">Enterprise Pro</h3>
                    <p className="text-white/40 font-medium text-sm mb-5 max-w-md">Infraestructura dedicada, terminales ilimitadas y soporte técnico prioritario 24/7.</p>
                    <div className="flex gap-3">
                      <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Historial de Facturas</button>
                      <button className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Gestionar Plan</button>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-base font-black text-slate-900 dark:text-white mb-1 tracking-tight">Acceso a la Organización</h4>
                  <p className="text-xs text-slate-400 dark:text-white/30 font-medium mb-5">Usa este identificador para conectar sucursales o invitar personal.</p>
                  <div className="bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-white/30 mb-3">IDENTIFICADOR DE EMPRESA</p>
                    <p className="text-xl font-mono font-black text-slate-900 dark:text-white break-all select-all tracking-wider">{businessId}</p>
                    <p className="text-[10px] text-slate-400 dark:text-white/20 mt-2">Identificador interno — tus usuarios ya no lo necesitan para iniciar sesión.</p>
                    <button
                      onClick={() => handleCopyToClipboard(businessId || '')}
                      className="mt-4 flex items-center gap-2 mx-auto px-5 py-2.5 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-white/[0.10] hover:text-indigo-600 dark:hover:text-white transition-all active:scale-95"
                    >
                      <Copy size={14} /> {copyToast ? '¡Copiado!' : 'Copiar Identificador'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* DESPACHO / NDE */}
            {activeSection === 'despacho' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Truck size={15} className="text-amber-500" />
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Nota de Entrega (NDE)</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1">Configura el flujo de Nota de Entrega para POS Mayor</p>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Toggles */}
                    {[
                      { key: 'enabled',         label: 'Habilitar modo Nota de Entrega en POS Mayor',  sub: 'Muestra el toggle NDE en el POS Mayor' },
                      { key: 'defaultMode',      label: 'Activar modo NDE por defecto al abrir POS',    sub: 'Arranca en modo NDE sin necesidad de activarlo cada vez' },
                      { key: 'showLogo',         label: 'Mostrar logo en la Nota de Entrega',           sub: 'Logo de la empresa en el documento impreso' },
                      { key: 'showPoweredBy',    label: "Mostrar 'Powered by Dualis'",                  sub: 'Branding al pie del documento' },
                      { key: 'requireRejectionReason', label: 'Requerir motivo al rechazar despacho',    sub: 'El almacenista debe indicar el motivo de rechazo' },
                      { key: 'autoNotifyVendedor',     label: 'Notificar al vendedor si su NDE es rechazada', sub: 'Notificación interna al vendedor' },
                    ].map(({ key, label, sub }) => (
                      <div key={key} className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-white/80">{label}</p>
                          <p className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5">{sub}</p>
                        </div>
                        <button
                          onClick={() => setNdeConfig(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                          className={`relative h-6 w-11 rounded-full transition-all shrink-0 ${ndeConfig[key as keyof typeof ndeConfig] ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/[0.12]'}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${ndeConfig[key as keyof typeof ndeConfig] ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                    ))}

                    {/* Footer message */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Mensaje al pie de la NDE</label>
                      <textarea
                        value={ndeConfig.footerMessage}
                        onChange={e => setNdeConfig(prev => ({ ...prev, footerMessage: e.target.value }))}
                        placeholder="Ej: Gracias por su compra. Horario de despacho: L-V 8am-5pm"
                        rows={2}
                        className={inputClasses + ' resize-none'}
                      />
                    </div>

                    {/* Rejection reasons */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Motivos de rechazo de despacho</label>
                      <div className="space-y-2">
                        {ndeConfig.rejectionReasons.map((r, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              value={r}
                              onChange={e => setNdeConfig(prev => ({
                                ...prev,
                                rejectionReasons: prev.rejectionReasons.map((x, j) => j === i ? e.target.value : x)
                              }))}
                              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => setNdeConfig(prev => ({ ...prev, rejectionReasons: prev.rejectionReasons.filter((_, j) => j !== i) }))}
                              className="h-9 w-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-400 flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setNdeConfig(prev => ({ ...prev, rejectionReasons: [...prev.rejectionReasons, ''] }))}
                          className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 py-1"
                        >
                          <Plus size={12} /> Agregar motivo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNde}
                    disabled={savingNde}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-sm shadow-md shadow-indigo-500/25 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {savingNde ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Guardar Configuración NDE
                  </button>
                </div>
              </div>
            )}

            {/* COMISIONES */}
            {activeSection === 'comisiones' && (
              <div className="space-y-5 pb-10">
                <div className="bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <Package size={15} className="text-emerald-500" />
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">Comisiones por Bulto</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1">Configura comisiones automáticas basadas en bultos despachados</p>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Enabled toggle */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-white/80">Activar comisiones por bulto</p>
                        <p className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5">Calcula comisiones automáticamente según los bultos en cada NDE</p>
                      </div>
                      <button
                        onClick={() => setCommissions(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative h-6 w-11 rounded-full transition-all shrink-0 ${commissions.enabled ? 'bg-gradient-to-r from-indigo-600 to-violet-600' : 'bg-slate-200 dark:bg-white/[0.12]'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${commissions.enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {commissions.enabled && (
                      <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-white/[0.07]">
                        {/* Per bulto amount */}
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">USD por bulto</label>
                          <input
                            type="number" min="0" step="0.01"
                            value={commissions.perBulto}
                            onChange={e => setCommissions(prev => ({ ...prev, perBulto: parseFloat(e.target.value) || 0 }))}
                            className={inputClasses}
                            placeholder="Ej: 0.50"
                          />
                          <p className="text-[10px] text-slate-400 dark:text-white/30 mt-1">Monto en USD que se asigna como comisión por cada bulto</p>
                        </div>

                        {/* Target */}
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">¿Quién recibe la comisión?</label>
                          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                            {(['vendedor', 'almacenista', 'both'] as const).map(t => {
                              const labels = { vendedor: 'Vendedor (al vender)', almacenista: 'Almacenista (al despachar)', both: 'Ambos (dividir %)' };
                              return (
                                <button key={t} onClick={() => setCommissions(prev => ({ ...prev, target: t }))}
                                  className={`flex-1 px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-center ${commissions.target === t ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {labels[t]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Split percentages */}
                        {commissions.target === 'both' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">% Vendedor</label>
                              <input type="number" min="0" max="100" step="1"
                                value={commissions.splitVendedor}
                                onChange={e => setCommissions(prev => ({ ...prev, splitVendedor: parseInt(e.target.value) || 0, splitAlmacenista: 100 - (parseInt(e.target.value) || 0) }))}
                                className={inputClasses}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">% Almacenista</label>
                              <input type="number" min="0" max="100" step="1"
                                value={commissions.splitAlmacenista}
                                onChange={e => setCommissions(prev => ({ ...prev, splitAlmacenista: parseInt(e.target.value) || 0, splitVendedor: 100 - (parseInt(e.target.value) || 0) }))}
                                className={inputClasses}
                              />
                            </div>
                          </div>
                        )}

                        {/* Preview */}
                        {commissions.perBulto > 0 && (
                          <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-3 border border-slate-100 dark:border-white/[0.07]">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Ejemplo: 10 bultos</p>
                            <div className="space-y-1">
                              {commissions.target !== 'almacenista' && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500 dark:text-slate-400">Comisión vendedor:</span>
                                  <span className="font-black text-slate-900 dark:text-white">
                                    ${(10 * commissions.perBulto * (commissions.target === 'both' ? (commissions.splitVendedor / 100) : 1)).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {commissions.target !== 'vendedor' && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500 dark:text-slate-400">Comisión almacenista:</span>
                                  <span className="font-black text-slate-900 dark:text-white">
                                    ${(10 * commissions.perBulto * (commissions.target === 'both' ? (commissions.splitAlmacenista / 100) : 1)).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveCommissions}
                    disabled={savingCommissions}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-sm shadow-md shadow-indigo-500/25 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {savingCommissions ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Guardar Comisiones
                  </button>
                </div>
              </div>
            )}

            {/* APARIENCIA */}
            {activeSection === 'apariencia' && (
              <div className="space-y-4 pb-10">

                {/* Header card */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-5 rounded-2xl text-white relative overflow-hidden shadow-xl shadow-violet-500/20">
                  <div className="absolute -right-6 -top-6 h-32 w-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -left-4 -bottom-4 h-20 w-20 bg-white/5 rounded-full blur-xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette size={18} className="text-violet-200" />
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-200">Personalización por Usuario</span>
                    </div>
                    <h3 className="text-2xl font-black tracking-tight mb-1">Tu Espacio, Tu Estilo</h3>
                    <p className="text-violet-200/80 text-xs font-medium leading-relaxed max-w-md">
                      Ajusta la apariencia a tu gusto. Cada cambio se guarda por usuario y aplica al instante.
                    </p>
                  </div>
                </div>

                {/* Font size */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Type size={13} /> Tamaño de Fuente
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { val: 'xs',   label: 'XS',   size: 'text-xs'   },
                      { val: 'sm',   label: 'SM',   size: 'text-sm'   },
                      { val: 'base', label: 'Base', size: 'text-base' },
                      { val: 'lg',   label: 'LG',   size: 'text-lg'   },
                      { val: 'xl',   label: 'XL',   size: 'text-xl'   },
                    ] as const).map(f => (
                      <button
                        key={f.val}
                        onClick={() => setUiPrefs(p => ({ ...p, fontSize: f.val }))}
                        className={`flex-1 min-w-[60px] flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border-2 transition-all ${
                          uiPrefs.fontSize === f.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <span className={`font-black text-slate-900 dark:text-white ${f.size}`}>Aa</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent color */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Palette size={13} /> Color de Acento
                  </h4>
                  <div className="flex gap-4 flex-wrap">
                    {([
                      { val: 'indigo',  bg: 'bg-indigo-500',  ring: 'ring-indigo-400',  label: 'Índigo'    },
                      { val: 'violet',  bg: 'bg-violet-500',  ring: 'ring-violet-400',  label: 'Violeta'   },
                      { val: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-400', label: 'Esmeralda' },
                      { val: 'rose',    bg: 'bg-rose-500',    ring: 'ring-rose-400',    label: 'Rosa'      },
                      { val: 'amber',   bg: 'bg-amber-500',   ring: 'ring-amber-400',   label: 'Ámbar'     },
                      { val: 'blue',    bg: 'bg-blue-500',    ring: 'ring-blue-400',    label: 'Azul'      },
                    ] as const).map(c => (
                      <button
                        key={c.val}
                        onClick={() => setUiPrefs(p => ({ ...p, accentColor: c.val }))}
                        title={c.label}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div className={`h-10 w-10 rounded-xl ${c.bg} transition-all ${
                          uiPrefs.accentColor === c.val
                            ? `ring-4 ring-offset-2 dark:ring-offset-[#0d1424] ${c.ring} scale-110`
                            : 'hover:scale-105 opacity-60 hover:opacity-100'
                        }`} />
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60 transition-colors">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Border radius */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Sliders size={13} /> Forma de los Bordes
                  </h4>
                  <div className="flex gap-3 flex-wrap">
                    {([
                      { val: 'sharp',   label: 'Recto',   cls: 'rounded-none' },
                      { val: 'normal',  label: 'Normal',  cls: 'rounded-xl'   },
                      { val: 'rounded', label: 'Suave',   cls: 'rounded-3xl'  },
                      { val: 'pill',    label: 'Cápsula', cls: 'rounded-full' },
                    ] as const).map(r => (
                      <button
                        key={r.val}
                        onClick={() => setUiPrefs(p => ({ ...p, borderRadius: r.val }))}
                        className={`flex-1 min-w-[70px] flex flex-col items-center gap-3 py-5 rounded-xl border-2 transition-all ${
                          uiPrefs.borderRadius === r.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`h-6 w-12 bg-slate-800 dark:bg-white/60 ${r.cls}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4">Densidad de Interfaz</h4>
                  <div className="flex gap-3">
                    {([
                      { val: 'compact',  label: 'Compacto',  desc: 'Más contenido', bars: [4, 4, 4, 4] },
                      { val: 'normal',   label: 'Normal',    desc: 'Balanceado',    bars: [6, 6, 6]    },
                      { val: 'spacious', label: 'Espacioso', desc: 'Fácil de leer', bars: [10, 10]     },
                    ] as const).map(d => (
                      <button
                        key={d.val}
                        onClick={() => setUiPrefs(p => ({ ...p, density: d.val }))}
                        className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                          uiPrefs.density === d.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <div className="flex flex-col gap-1 mb-3">
                          {d.bars.map((h, i) => (
                            <div key={i} className="rounded bg-slate-200 dark:bg-white/10 w-full" style={{ height: `${h}px` }} />
                          ))}
                        </div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">{d.label}</p>
                        <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{d.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animation speed */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-4 flex items-center gap-2">
                    <Zap size={13} /> Velocidad de Animaciones
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { val: 'fast',   label: 'Rápido'     },
                      { val: 'normal', label: 'Normal'     },
                      { val: 'slow',   label: 'Suave'      },
                      { val: 'none',   label: 'Sin animar' },
                    ] as const).map(s => (
                      <button
                        key={s.val}
                        onClick={() => setUiPrefs(p => ({ ...p, animationSpeed: s.val }))}
                        className={`flex-1 py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${
                          uiPrefs.animationSpeed === s.val
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
                            : 'border-slate-100 dark:border-white/[0.06] text-slate-400 dark:text-white/30 hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date + number format */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Date format */}
                  <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-3">Formato de Fecha</h4>
                    <div className="space-y-2">
                      {(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setUiPrefs(p => ({ ...p, dateFormat: fmt }))}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                            uiPrefs.dateFormat === fmt
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                          }`}
                        >
                          <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300">{fmt}</span>
                          {uiPrefs.dateFormat === fmt && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Number format */}
                  <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                    <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-3">Separador de Miles</h4>
                    <div className="space-y-2">
                      {([
                        { val: 'dot',   example: '1.000.000,00', desc: 'Estilo europeo / latam' },
                        { val: 'comma', example: '1,000,000.00', desc: 'Estilo americano'        },
                      ] as const).map(n => (
                        <button
                          key={n.val}
                          onClick={() => setUiPrefs(p => ({ ...p, numberFormat: n.val }))}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                            uiPrefs.numberFormat === n.val
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                          }`}
                        >
                          <div className="text-left">
                            <span className="text-sm font-mono font-black text-slate-700 dark:text-slate-300 block">{n.example}</span>
                            <span className="text-[10px] text-slate-400 dark:text-white/30">{n.desc}</span>
                          </div>
                          {uiPrefs.numberFormat === n.val && <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Idioma del sistema */}
                <div className="bg-white dark:bg-[#0d1424] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10">
                  <h4 className="text-xs font-black uppercase tracking-[0.25em] text-slate-400 dark:text-white/30 mb-1">
                    {t('language.label', 'Idioma del Sistema')}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-white/20 mb-4">
                    Español · English · عربي (RTL automático)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { code: 'es', flag: '🇻🇪', label: 'Español',  sub: 'Latin America' },
                      { code: 'en', flag: '🇺🇸', label: 'English',  sub: 'United States' },
                      { code: 'ar', flag: '🇸🇦', label: 'عربي',     sub: 'RTL — Arabic'  },
                    ] as const).map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); }}
                        className={`flex flex-col items-center gap-2 py-4 px-3 rounded-2xl border-2 transition-all ${
                          i18n.language === lang.code
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                            : 'border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/[0.12]'
                        }`}
                      >
                        <span className="text-2xl">{lang.flag}</span>
                        <div className="text-center">
                          <p className={`text-xs font-black ${i18n.language === lang.code ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-white/60'}`}>{lang.label}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/25">{lang.sub}</p>
                        </div>
                        {i18n.language === lang.code && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveUiPrefs}
                    disabled={savingPrefs}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25 active:scale-95 disabled:opacity-50"
                  >
                    {savingPrefs ? <Loader2 className="animate-spin" size={15} /> : <><Save size={15} /> Guardar Preferencias</>}
                  </button>
                </div>

              </div>
            )}

            {/* ── SECTION: DEV / TEST ── */}
            {activeSection === 'devtest' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white dark:bg-[#0d1424] p-6 rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-lg shadow-black/10 space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">Datos de Prueba</h3>
                    <p className="text-xs text-slate-400 dark:text-white/30 mt-1">
                      Carga datos ficticios para probar todas las funciones: productos, clientes, proveedores, ventas, gastos, terminales, arqueos.
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-500/20 bg-amber-50 dark:bg-amber-500/[0.08] p-4 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Advertencia</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400/70 mt-1">
                        Esto creará datos ficticios en tu negocio. Ideal para testing y demos.
                      </p>
                    </div>
                  </div>

                  {seedResult && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/[0.08] p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500" />
                        <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">Datos cargados exitosamente</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                        {[
                          { label: 'Productos', count: seedResult.products },
                          { label: 'Clientes', count: seedResult.customers },
                          { label: 'Proveedores', count: seedResult.suppliers },
                          { label: 'Movimientos', count: seedResult.movements },
                          { label: 'Terminales', count: seedResult.terminals },
                        ].map(s => (
                          <div key={s.label} className="text-center p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10">
                            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{s.count}</p>
                            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {seedProgress && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="text-indigo-500 animate-spin" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{seedProgress.msg}</p>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                          style={{ width: `${seedProgress.pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      const bid = userProfile?.businessId;
                      if (!bid) { toast.error('No se encontró el businessId'); return; }
                      const uid = userProfile?.uid || 'test-owner';
                      setSeedResult(null);
                      setSeedProgress({ msg: 'Iniciando...', pct: 0 });
                      try {
                        const result = await seedTestData(bid, uid, (msg, pct) => {
                          setSeedProgress({ msg, pct });
                        });
                        setSeedResult(result);
                        setSeedProgress(null);
                        toast.success(`Datos cargados: ${result.products} productos, ${result.movements} movimientos`);
                      } catch (e: any) {
                        console.error('[Seed]', e);
                        toast.error('Error al cargar datos: ' + (e.message || 'Error desconocido'));
                        setSeedProgress(null);
                      }
                    }}
                    disabled={!!seedProgress}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-black text-white transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25"
                  >
                    {seedProgress ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                    Cargar datos de prueba
                  </button>

                  <div className="border-t border-slate-200 dark:border-white/[0.07] pt-4">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-white/25 uppercase tracking-widest mb-2">Lo que se creará:</p>
                    <ul className="text-xs text-slate-500 dark:text-white/40 space-y-1 list-disc list-inside">
                      <li>30 productos con precios, márgenes, stock y categorías variadas</li>
                      <li>8 clientes con datos completos y límites de crédito</li>
                      <li>5 proveedores con RIF y categoría</li>
                      <li>120 ventas distribuidas en los últimos 30 días</li>
                      <li>15 abonos de clientes (pagos parciales)</li>
                      <li>20 gastos/compras (CxP) con categorías variadas</li>
                      <li>3 terminales POS (2 detal + 1 mayor)</li>
                      <li>5 arqueos históricos con conteo USD/Bs</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* PIN MODAL */}
      {pinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#0d1424] w-full max-w-sm rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 dark:border-white/[0.08] overflow-hidden animate-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-50 dark:border-white/[0.06] flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
              <h2 className="text-base font-black text-slate-900 dark:text-white">Nuevo PIN Maestro</h2>
              <button onClick={() => { setPinModal(false); setNewPinValue(''); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl transition-all text-slate-400 dark:text-white/40">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 dark:text-white/40 font-medium">Ingresa exactamente 4 dígitos numéricos.</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPinValue}
                onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full text-center text-3xl font-mono tracking-[1rem] px-5 py-4 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                placeholder="••••"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setPinModal(false); setNewPinValue(''); }}
                  className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavePin}
                  disabled={newPinValue.length !== 4 || saving}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : 'Guardar PIN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── INVITE MODAL ── */}
      {inviteModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setInviteModal(false)}>
          <div className="w-full max-w-md bg-white dark:bg-[#0d1424] rounded-2xl border border-slate-100 dark:border-white/[0.07] shadow-2xl shadow-black/40" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
                  <UserPlus size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Invitar Miembro</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 mt-0.5">Enviar invitación por correo</p>
                </div>
              </div>
              <button onClick={() => setInviteModal(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 dark:text-white/30 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 mb-2 block">Correo del invitado</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" />
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full px-4 py-3 pl-10 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/40 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1 mb-2 block">Rol asignado</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/40 transition-all"
                >
                  <option value="admin">Administrador</option>
                  <option value="ventas">Ventas</option>
                  <option value="almacenista">Almacenista</option>
                  <option value="inventario">Jefe de Inventario</option>
                  <option value="auditor">Auditor</option>
                  <option value="staff">Staff</option>
                  <option value="member">Miembro</option>
                </select>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">¿Cómo funciona?</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400/70 leading-relaxed">
                  Se enviará un correo con un link seguro de invitación. El invitado podrá registrarse directamente en tu espacio de trabajo con el rol asignado. El link expira en 48 horas.
                </p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setInviteModal(false); setInviteEmail(''); }}
                className="flex-1 py-3 bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!inviteEmail.trim() || inviteSending}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-md shadow-emerald-500/25"
              >
                {inviteSending ? <Loader2 className="animate-spin" size={14} /> : <><Send size={14} /> Enviar Invitación</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Configuracion;
