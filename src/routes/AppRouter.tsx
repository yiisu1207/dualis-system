import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PosKioskContext } from '../pages/pos/PosDetal';
import { useAuth } from '../context/AuthContext';
import { TenantProvider } from '../context/TenantContext';
import PosLayout from '../layouts/PosLayout';
import PosDetal from '../pages/pos/PosDetal';
import PosMayor from '../pages/pos/PosMayor';
import NotAuthorized from '../features/common/NotAuthorized';
import NotFound from '../features/common/NotFound';
import OnboardingWizard from '../features/onboarding/OnboardingWizard';
import LandingPage from '../components/LandingPage';
import Login from '../components/Login';
import Register from '../components/Register';
import AdminPosManager from '../pages/AdminPosManager';
import ProtectedRoute from '../components/ProtectedRoute';
import { WidgetProvider } from '../context/WidgetContext';
import MainSystem from '../MainSystem';
import { useTenant } from '../context/TenantContext';
import Terms from '../pages/Terms';
import Privacy from '../pages/Privacy';
import SuperAdminPanel from '../pages/SuperAdminPanel';
import BillingPage from '../pages/BillingPage';
import SubscriptionWall from '../pages/SubscriptionWall';
import PendingApprovalWall from '../pages/PendingApprovalWall';
import { useSubscription } from '../hooks/useSubscription';
import { VendorProvider } from '../context/VendorContext';
import { findInvitationByToken } from '../firebase/api';
import OpsMonitor from '../pages/OpsMonitor';
import { CartProvider } from '../context/CartContext';
import PortalGuard from '../portal/PortalGuard';
import PortalDashboard from '../portal/PortalDashboard';
import PortalInvoices from '../portal/PortalInvoices';
import PortalProntoPago from '../portal/PortalProntoPago';
import PortalAbonoForm from '../portal/PortalAbonoForm';
import PortalStatement from '../portal/PortalStatement';
import PortalHelp from '../portal/PortalHelp';

function KioskPosPage({ tipo }: { tipo: string }) {
  if (tipo === 'mayor') return <PosMayor />;
  return <PosDetal />;
}

function resolveTenantId(profile: { empresa_id?: string; businessId?: string } | null) {
  if (!profile) return '';
  return profile.empresa_id || profile.businessId || '';
}

function AuthEntry({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!user) {
    return <>{children}</>;
  }

  const tenantId = resolveTenantId(userProfile);

  if (!tenantId) {
    console.warn('[AuthEntry] tenantId vacío para usuario', user.uid, '— perfil:', userProfile);
    return <Navigate to="/onboarding" replace />;
  }

  if (userProfile?.status === 'PENDING_SETUP') {
    const isInsideSystem = window.location.pathname.includes('/admin') || window.location.pathname.includes('/pos');
    if (isInsideSystem) return <>{children}</>;
    return <Navigate to="/onboarding" replace />;
  }

  if (userProfile?.status === 'PENDING_APPROVAL') {
    return <Navigate to={`/${tenantId}/pending`} replace />;
  }

  const path = window.location.pathname;
  if (path.includes('/admin') || path.includes('/pos')) {
    return <>{children}</>;
  }

  return <Navigate to={`/${tenantId}/admin/dashboard`} replace />;
}

function OnboardingGate() {
  const { user, userProfile, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const force = searchParams.get('force') === '1';
  const stepParam = Number(searchParams.get('step'));
  const forceStep = Number.isFinite(stepParam)
    ? Math.max(1, Math.min(2, stepParam))
    : force
    ? 2
    : undefined;

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!user && !force) {
    return <Navigate to="/login" replace />;
  }

  const tenantId = resolveTenantId(userProfile);
  const isSetupComplete = tenantId && userProfile?.status === 'ACTIVE';

  if (tenantId && userProfile?.status === 'PENDING_APPROVAL') {
    return <Navigate to={`/${tenantId}/pending`} replace />;
  }

  // Solo redirigimos al admin si el setup está COMPLETO (status ACTIVE).
  // Si status es PENDING_SETUP, mostramos el wizard aunque haya tenantId.
  if (isSetupComplete && !force) {
    return <Navigate to={`/${tenantId}/admin`} replace />;
  }

  return <OnboardingWizard forceStep={forceStep} />;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const { empresa_id } = useParams();

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!user || !userProfile) {
    return <Navigate to="/login" replace />;
  }

  const tenantId = resolveTenantId(userProfile);
  if (!tenantId) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!empresa_id || tenantId !== empresa_id) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (userProfile?.status === 'PENDING_APPROVAL') {
    return <Navigate to={`/${empresa_id}/pending`} replace />;
  }

  return <TenantProvider tenantId={empresa_id}>{children}</TenantProvider>;
}

function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { userProfile, loading: authLoading } = useAuth();
  const { empresa_id } = useParams();
  const navigate = useNavigate();
  const businessId = userProfile?.businessId || empresa_id || '';
  const { subscription, loading: subLoading } = useSubscription(businessId);

  React.useEffect(() => {
    if (authLoading || subLoading) return;
    if (!subscription) {
      navigate(`/${empresa_id}/subscribe`, { replace: true });
    }
  }, [authLoading, subLoading, subscription, empresa_id]);

  if (authLoading || subLoading) {
    return <div className="h-screen flex items-center justify-center bg-[#070b14]"><div className="w-6 h-6 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" /></div>;
  }
  if (!subscription) return null;
  return <>{children}</>;
}

function AdminCoreWrapper() {
  const { tenantId } = useTenant();
  const params = useParams();
  const empresaId = params.empresa_id || tenantId;
  return (
    <VendorProvider businessId={empresaId || ''}>
      <WidgetProvider>
        <MainSystem key={empresaId} initialTab={undefined} />
      </WidgetProvider>
    </VendorProvider>
  );
}

// Redirige rutas legacy al tenant dashboard del usuario autenticado
function LegacyRedirect() {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const tenantId = resolveTenantId(userProfile);
  if (!tenantId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Navigate to={`/${tenantId}/admin/dashboard`} replace />;
}

function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [invite, setInvite] = useState<any>(null);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    findInvitationByToken(token).then(inv => {
      if (!inv || inv.status !== 'active') { setStatus('invalid'); return; }
      if (new Date(inv.expiresAt) < new Date()) { setStatus('invalid'); return; }
      if (inv.usedCount >= inv.maxUses) { setStatus('invalid'); return; }
      setInvite(inv);
      setStatus('valid');
    }).catch(() => setStatus('invalid'));
  }, [token]);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user]);

  if (status === 'loading') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#060b1a]">
        <div className="w-8 h-8 border-2 border-emerald-500/40 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-white/30 text-sm font-medium">Verificando invitación...</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#060b1a] px-4">
        <div className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-2xl p-8 text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-500/15 border border-red-500/25 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <h2 className="text-xl font-black text-white mb-2">Invitación no válida</h2>
          <p className="text-white/40 text-sm mb-6">Esta invitación ha expirado, ya fue utilizada, o el enlace es incorrecto.</p>
          <button
            onClick={() => navigate('/register')}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all"
          >
            Ir a Registro
          </button>
        </div>
      </div>
    );
  }

  // Valid invite — render Register with invite data
  return <Register inviteToken={token} inviteData={invite} />;
}

// ─── KIOSK GATE — resolves /caja/:posToken → renders POS without auth ──────────
function KioskGate() {
  const { posToken } = useParams<{ posToken: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [kioskData, setKioskData] = useState<{ businessId: string; cajaId: string; tipo: string } | null>(null);

  useEffect(() => {
    if (!posToken) { setState('invalid'); return; }
    getDoc(doc(db, 'terminalTokens', posToken)).then(snap => {
      if (!snap.exists()) { setState('invalid'); return; }
      const d = snap.data() as { businessId: string; cajaId: string; tipo: string };
      setKioskData(d);
      setState('ready');
    }).catch(() => setState('invalid'));
  }, [posToken]);

  if (state === 'loading') return (
    <div className="h-screen flex items-center justify-center bg-[#070b14]">
      <div className="w-8 h-8 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  if (state === 'invalid' || !kioskData) return (
    <div className="h-screen flex items-center justify-center bg-[#070b14] px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="text-white font-black text-xl mb-2">Acceso no válido</h2>
        <p className="text-white/40 text-sm">Este terminal no existe o el turno fue cerrado.</p>
      </div>
    </div>
  );

  // Inline CartProvider + PosContent (mirrors PosLayout without needing Outlet)
  return (
    <PosKioskContext.Provider value={{ businessId: kioskData.businessId, cajaId: kioskData.cajaId, token: posToken! }}>
      <TenantProvider tenantId={kioskData.businessId}>
        <CartProvider>
          <div className="min-h-screen w-full bg-gray-50 dark:bg-[#0a0f1e] text-gray-900 dark:text-white">
            <KioskPosPage tipo={kioskData.tipo} />
          </div>
        </CartProvider>
      </TenantProvider>
    </PosKioskContext.Provider>
  );
}

export default function AppRouter() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/" element={<AuthEntry><LandingPage /></AuthEntry>} />
      <Route path="/login" element={<AuthEntry><Login /></AuthEntry>} />
      <Route path="/register" element={<AuthEntry><Register /></AuthEntry>} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      {/* Internal ops panel — PIN-protected, path from env */}
      <Route path={`/${import.meta.env.VITE_SUPER_ADMIN_PATH ?? 'ctrl-9x7b'}`} element={<SuperAdminPanel />} />
      {/* Ops monitor — passkey-only anonymous access */}
      <Route path="/ops" element={<OpsMonitor />} />
      {/* Pending approval wall */}
      <Route path="/:empresa_id/pending" element={<ProtectedRoute><PendingApprovalWall /></ProtectedRoute>} />
      {/* Billing — protected, accessible even on expired plan */}
      <Route path="/:empresa_id/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      {/* Subscription wall — shown before first access */}
      <Route path="/:empresa_id/subscribe" element={<ProtectedRoute><SubscriptionWall /></ProtectedRoute>} />
      <Route path="/onboarding" element={<OnboardingGate />} />
      <Route path="/unauthorized" element={<NotAuthorized />} />

      {/* Rutas legacy — redirigen al dashboard del tenant */}
      <Route path="/dashboard" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/cobranzas" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/contabilidad" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/tasas" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/cxp" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/rrhh" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/inventario" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/vision" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/comparar" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/conciliacion" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/configuracion" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/help" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />
      <Route path="/ayuda" element={<ProtectedRoute><LegacyRedirect /></ProtectedRoute>} />

      {/* Redirección raíz del tenant */}
      <Route path="/:empresa_id" element={<Navigate to="admin/dashboard" replace />} />

      {/* Sistema principal multi-tenant */}
      <Route
        path="/:empresa_id/admin/cajas"
        element={
          <TenantGuard>
            <SubscriptionGuard>
              <AdminPosManager />
            </SubscriptionGuard>
          </TenantGuard>
        }
      />
      <Route
        path="/:empresa_id/admin/*"
        element={
          <TenantGuard>
            <SubscriptionGuard>
              <AdminCoreWrapper />
            </SubscriptionGuard>
          </TenantGuard>
        }
      />

      {/* POS */}
      <Route
        path="/:empresa_id/pos"
        element={
          <TenantGuard>
            <PosLayout />
          </TenantGuard>
        }
      >
        <Route path="detal" element={<PosDetal />} />
        <Route path="mayor" element={<PosMayor />} />
      </Route>

      {/* Portal de Clientes — acceso público con slug + PIN */}
      <Route path="/portal/:slug" element={<PortalGuard />}>
        <Route index element={<PortalDashboard />} />
        <Route path="facturas" element={<PortalInvoices />} />
        <Route path="pronto-pago" element={<PortalProntoPago />} />
        <Route path="pagar" element={<PortalAbonoForm />} />
        <Route path="estado-cuenta" element={<PortalStatement />} />
        <Route path="ayuda" element={<PortalHelp />} />
      </Route>

      {/* Kiosk POS — clean URL without business ID */}
      <Route path="/caja/:posToken" element={<KioskGate />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
