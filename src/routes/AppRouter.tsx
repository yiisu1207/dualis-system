import React from 'react';
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TenantProvider } from '../context/TenantContext';
import AdminLayout from '../layouts/AdminLayout';
import PosLayout from '../layouts/PosLayout';
import AdminDashboard from '../features/admin/AdminDashboard';
import AdminInventario from '../features/admin/AdminInventario';
import AdminFinanzas from '../features/admin/AdminFinanzas';
import PosDetal from '../pages/pos/PosDetal';
import PosMayor from '../pages/pos/PosMayor';
import NotAuthorized from '../features/common/NotAuthorized';
import NotFound from '../features/common/NotFound';
import OnboardingWizard from '../features/onboarding/OnboardingWizard';
import LandingPage from '../components/LandingPage';
import Login from '../components/Login';
import Register from '../components/Register';
import PlanesFacturacion from '../pages/admin/PlanesFacturacion';
import ProtectedRoute from '../components/ProtectedRoute';
import { WidgetProvider } from '../context/WidgetContext';
import MainSystem from '../MainSystem';
import { useTenant } from '../context/TenantContext';
// ...existing code...
import ModulePage from '../pages/ModulePage';
import Cuentas from '../pages/Cuentas';
import Finanzas from '../pages/Finanzas';
import RecursosHumanos from '../pages/RecursosHumanos';
import Inventario from '../pages/Inventario';
import Ventas from '../pages/Ventas';
import Reportes from '../pages/Reportes';
import Configuracion from '../pages/Configuracion';
import Terms from '../pages/Terms';
import Privacy from '../pages/Privacy';
import AdminPosManager from '../pages/AdminPosManager';

function resolveTenantId(profile: { empresa_id?: string; businessId?: string } | null) {
  if (!profile) return '';
  return profile.empresa_id || profile.businessId || '';
}

function AuthEntry({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <div className="h-screen flex items-center justify-center">Cargando...</div>;
  }

  const tenantId = resolveTenantId(userProfile);
  const role = userProfile?.role;

  if (user && !tenantId) {
    return <Navigate to="/onboarding" replace />;
  }

  if (user && tenantId) {
    // Redirección según rol
    if (role === 'owner' || role === 'admin') {
      return <Navigate to={`/${tenantId}/admin/dashboard`} replace />;
    }
    // Aquí puedes agregar lógica para otros roles (ej: cajero)
    return <Navigate to={`/${tenantId}/admin/dashboard`} replace />;
  }

  return <>{children}</>;
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
  if (tenantId && !force) {
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

  return <TenantProvider tenantId={empresa_id}>{children}</TenantProvider>;
}

// Wrapper para pasar ownerId/businessId correctamente - MUDADO AFUERA DE LAS RUTAS
function AdminCoreWrapper() {
  const { tenantId } = useTenant();
  const params = useParams();
  const empresaId = params.empresa_id || tenantId;
  return (
    <WidgetProvider>
      <MainSystem key={empresaId} initialTab={undefined} />
    </WidgetProvider>
  );
}

export default function AppRouter() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AuthEntry>
            <LandingPage />
          </AuthEntry>
        }
      />
      <Route
        path="/login"
        element={
          <AuthEntry>
            <Login />
          </AuthEntry>
        }
      />
      <Route
        path="/register"
        element={
          <AuthEntry>
            <Register />
          </AuthEntry>
        }
      />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/onboarding" element={<OnboardingGate />} />
      <Route path="/unauthorized" element={<NotAuthorized />} />

      {/* Legacy routes (keep existing system alive) */}
      <Route path="/dashboard" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/cobranzas" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/contabilidad" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/tasas" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/cxp" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/rrhh" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/inventario" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/vision" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/comparar" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/conciliacion" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/configuracion" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/help" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/ayuda" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      <Route path="/finanzas" element={<ProtectedRoute><WidgetProvider><MainSystem /></WidgetProvider></ProtectedRoute>} />
      
      <Route path="/cuentas" element={<ProtectedRoute><Cuentas /></ProtectedRoute>} />
      <Route path="/recursos-humanos" element={<ProtectedRoute><RecursosHumanos /></ProtectedRoute>} />
      <Route path="/inventario-legacy" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
      <Route path="/ventas" element={<ProtectedRoute><Ventas /></ProtectedRoute>} />
      <Route path="/reportes" element={<ProtectedRoute><Reportes /></ProtectedRoute>} />
      <Route path="/configuracion-legacy" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
      <Route path="/module" element={<ProtectedRoute><ModulePage title="Módulo" /></ProtectedRoute>} />

      <Route path="/:empresa_id" element={<Navigate to="admin/dashboard" replace />} />

     {/* RUTA CENTRAL DEL SISTEMA */}
      <Route
        path="/:empresa_id/admin/cajas"
        element={
          <TenantGuard>
            <AdminPosManager />
          </TenantGuard>
        }
      />
      <Route
        path="/:empresa_id/admin/*"
        element={
          <TenantGuard>
            <AdminCoreWrapper />
          </TenantGuard>
        }
      />

      {/* RUTAS POS CORREGIDAS PARA EL USO DE <Outlet /> */}
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