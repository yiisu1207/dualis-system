import React from 'react';
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
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
  const navigate = React.useNavigate();
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

export default function AppRouter() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/" element={<AuthEntry><LandingPage /></AuthEntry>} />
      <Route path="/login" element={<AuthEntry><Login /></AuthEntry>} />
      <Route path="/register" element={<AuthEntry><Register /></AuthEntry>} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      {/* Internal ops panel — PIN-protected, path from env */}
      <Route path={`/${import.meta.env.VITE_SUPER_ADMIN_PATH ?? 'ctrl-9x7b'}`} element={<SuperAdminPanel />} />
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

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
