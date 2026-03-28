import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PosKioskContext } from '../context/PosKioskContext';
import { useAuth } from '../context/AuthContext';
import { TenantProvider, useTenant } from '../context/TenantContext';
import { useSubscription } from '../hooks/useSubscription';
import ProtectedRoute from '../components/ProtectedRoute';
import { useSubdomain } from '../context/SubdomainContext';
import { findInvitationByToken } from '../firebase/api';
import { VendorProvider } from '../context/VendorContext';
import { WidgetProvider } from '../context/WidgetContext';
import { CartProvider } from '../context/CartContext';

// ─── Lazy imports — solo se cargan cuando se necesitan ──────────────────────────
const LandingPage      = lazy(() => import('../components/LandingPage'));
const Login            = lazy(() => import('../components/Login'));
const Register         = lazy(() => import('../components/Register'));
const MainSystem       = lazy(() => import('../MainSystem'));
const PosDetal         = lazy(() => import('../pages/pos/PosDetal'));
const PosMayor         = lazy(() => import('../pages/pos/PosMayor'));
const AdminPosManager  = lazy(() => import('../pages/AdminPosManager'));
const Terms            = lazy(() => import('../pages/Terms'));
const Privacy          = lazy(() => import('../pages/Privacy'));
const SuperAdminPanel  = lazy(() => import('../pages/SuperAdminPanel'));
const BillingPage      = lazy(() => import('../pages/BillingPage'));
const SubscriptionWall = lazy(() => import('../pages/SubscriptionWall'));
const PendingApprovalWall = lazy(() => import('../pages/PendingApprovalWall'));
const OpsMonitor       = lazy(() => import('../pages/OpsMonitor'));
const NotAuthorized    = lazy(() => import('../features/common/NotAuthorized'));
const NotFound         = lazy(() => import('../features/common/NotFound'));
const PosLayout        = lazy(() => import('../layouts/PosLayout'));
// Portal
const PortalGuard      = lazy(() => import('../portal/PortalGuard'));
const PortalDashboard  = lazy(() => import('../portal/PortalDashboard'));
const PortalInvoices   = lazy(() => import('../portal/PortalInvoices'));
const PortalProntoPago = lazy(() => import('../portal/PortalProntoPago'));
const PortalAbonoForm  = lazy(() => import('../portal/PortalAbonoForm'));
const PortalStatement  = lazy(() => import('../portal/PortalStatement'));
const PortalHelp       = lazy(() => import('../portal/PortalHelp'));
// Páginas públicas SEO
const PreciosPage      = lazy(() => import('../pages/public/PreciosPage'));
const FuncionesPage    = lazy(() => import('../pages/public/FuncionesPage'));

// ─── Spinner universal para Suspense ─────────────────────────────────────────────
function PageSpinner() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#070b14]">
      <div className="w-6 h-6 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

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
  const subdomain = useSubdomain();

  if (loading || subdomain.loading) {
    return <PageSpinner />;
  }

  const isSubdomain = !!(subdomain.slug && subdomain.businessId);

  if (!user) {
    if (isSubdomain) {
      const path = window.location.pathname;
      if (path === '/login') return <>{children}</>;
      return <Navigate to="/login" replace />;
    }
    const path = window.location.pathname;
    if (path === '/login') return <Navigate to="/" replace />;
    return <>{children}</>;
  }

  const tenantId = resolveTenantId(userProfile);

  if (!tenantId) {
    console.warn('[AuthEntry] tenantId vacío para usuario', user.uid, '— perfil:', userProfile);
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

function SubdomainGuard({ children, fallback }: { children: React.ReactNode; fallback?: string }) {
  const subdomain = useSubdomain();
  const isSubdomain = !!(subdomain.slug && subdomain.businessId);
  if (isSubdomain) return <Navigate to={fallback || '/login'} replace />;
  return <>{children}</>;
}

function OnboardingGate() {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  const tenantId = resolveTenantId(userProfile);
  if (tenantId) return <Navigate to={`/${tenantId}/admin/dashboard`} replace />;

  return <Navigate to="/" replace />;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const { empresa_id } = useParams();

  if (loading) {
    return <PageSpinner />;
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
    return <PageSpinner />;
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

function LegacyRedirect() {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
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

  return <Register inviteToken={token} inviteData={invite} />;
}

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

  if (state === 'loading') return <PageSpinner />;

  if (state === 'invalid' || !kioskData) return (
    <div className="h-screen flex items-center justify-center bg-[#070b14] px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h2 className="text-white font-black text-xl mb-2">Acceso no válido</h2>
        <p className="text-white/40 text-sm">Este terminal no existe o el turno fue cerrado.</p>
      </div>
    </div>
  );

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
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/" element={<AuthEntry><LandingPage /></AuthEntry>} />
        <Route path="/login" element={<AuthEntry><Login /></AuthEntry>} />
        <Route path="/register" element={<SubdomainGuard><AuthEntry><Register /></AuthEntry></SubdomainGuard>} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/terms" element={<SubdomainGuard><Terms /></SubdomainGuard>} />
        <Route path="/privacy" element={<SubdomainGuard><Privacy /></SubdomainGuard>} />
        {/* Páginas públicas SEO */}
        <Route path="/precios" element={<SubdomainGuard><PreciosPage /></SubdomainGuard>} />
        <Route path="/funciones" element={<SubdomainGuard><FuncionesPage /></SubdomainGuard>} />
        {/* Internal ops panel */}
        <Route path={`/${import.meta.env.VITE_SUPER_ADMIN_PATH ?? 'ctrl-9x7b'}`} element={<SuperAdminPanel />} />
        <Route path="/ops" element={<OpsMonitor />} />
        {/* Walls */}
        <Route path="/:empresa_id/pending" element={<ProtectedRoute><PendingApprovalWall /></ProtectedRoute>} />
        <Route path="/:empresa_id/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
        <Route path="/:empresa_id/subscribe" element={<ProtectedRoute><SubscriptionWall /></ProtectedRoute>} />
        <Route path="/onboarding" element={<OnboardingGate />} />
        <Route path="/unauthorized" element={<NotAuthorized />} />

        {/* Rutas legacy */}
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

        {/* Tenant root */}
        <Route path="/:empresa_id" element={<Navigate to="admin/dashboard" replace />} />

        {/* Sistema principal */}
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

        {/* Portal de Clientes */}
        <Route path="/portal/:slug" element={<PortalGuard />}>
          <Route index element={<PortalDashboard />} />
          <Route path="facturas" element={<PortalInvoices />} />
          <Route path="pronto-pago" element={<PortalProntoPago />} />
          <Route path="pagar" element={<PortalAbonoForm />} />
          <Route path="estado-cuenta" element={<PortalStatement />} />
          <Route path="ayuda" element={<PortalHelp />} />
        </Route>

        {/* Kiosk */}
        <Route path="/caja/:posToken" element={<KioskGate />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
