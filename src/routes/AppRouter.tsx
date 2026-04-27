import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PosKioskContext } from '../context/PosKioskContext';
import { useAuth } from '../context/AuthContext';
import { AutoTenantProvider, TenantProvider, useTenant } from '../context/TenantContext';
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
const Changelog        = lazy(() => import('../pages/Changelog'));
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
const PortalCatalog    = lazy(() => import('../portal/PortalCatalog'));
const PortalLoyalty    = lazy(() => import('../portal/PortalLoyalty'));
const PortalPaymentVerify = lazy(() => import('../portal/PortalPaymentVerify'));
const PortalDispute    = lazy(() => import('../portal/PortalDispute'));
const PortalChat       = lazy(() => import('../portal/PortalChat'));
// Páginas públicas SEO
const PreciosPage      = lazy(() => import('../pages/public/PreciosPage'));
const FuncionesPage    = lazy(() => import('../pages/public/FuncionesPage'));

// ─── Loader universal para Suspense ──────────────────────────────────────
// Branded loader con marca Dualis, glow sutil y mensaje rotativo. Si tarda
// más de 8s, sugiere recargar (cubre casos de chunk inválido tras deploy).
function PageSpinner() {
  const messages = React.useMemo(() => [
    'Sincronizando con Firebase…',
    'Cargando tu negocio…',
    'Calculando tasas BCV…',
    'Preparando tu inventario…',
    'Listo en un momento…',
  ], []);
  const [msgIdx, setMsgIdx] = React.useState(0);
  const [showStuck, setShowStuck] = React.useState(false);

  React.useEffect(() => {
    const rot = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 1800);
    const stuck = setTimeout(() => setShowStuck(true), 8000);
    return () => { clearInterval(rot); clearTimeout(stuck); };
  }, [messages.length]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-[#070b14] via-[#0a1024] to-[#070b14] relative overflow-hidden">
      {/* Glow ambiente */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/10 blur-2xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5">
        {/* Logo / marca */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
            <span className="text-white text-2xl font-black tracking-tight">D</span>
          </div>
          {/* Anillo girando alrededor del logo */}
          <div className="absolute inset-0 -m-2 rounded-2xl border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" style={{ animationDuration: '1.2s' }} />
        </div>

        {/* Wordmark */}
        <div className="text-center">
          <p className="text-white text-lg font-black tracking-[0.25em]">DUALIS</p>
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.3em] mt-0.5">Sistema ERP</p>
        </div>

        {/* Mensaje rotativo */}
        <div className="h-5 flex items-center">
          <p className="text-[11px] font-medium text-white/50 tabular-nums transition-opacity">
            {messages[msgIdx]}
          </p>
        </div>

        {/* Barra de progreso indeterminada */}
        <div className="w-48 h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-[loading-slide_1.6s_ease-in-out_infinite]" />
        </div>

        {/* Sugerencia si tarda mucho */}
        {showStuck && (
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
          >
            ¿Tarda demasiado? Recargar
          </button>
        )}
      </div>

      {/* Animación local sin tocar tailwind config */}
      <style>{`
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
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
    return <Navigate to="/" replace />;
  }

  if (userProfile?.status === 'PENDING_APPROVAL') {
    return <Navigate to="/pending" replace />;
  }

  const path = window.location.pathname;
  if (path.includes('/admin') || path.includes('/pos')) {
    return <>{children}</>;
  }

  return <Navigate to="/admin/dashboard" replace />;
}

function SubdomainGuard({ children, fallback }: { children: React.ReactNode; fallback?: string }) {
  const subdomain = useSubdomain();
  const isSubdomain = !!(subdomain.slug && subdomain.businessId);
  if (isSubdomain) return <Navigate to={fallback || '/login'} replace />;
  return <>{children}</>;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (!user || !userProfile) {
    return <Navigate to="/login" replace />;
  }

  const tenantId = resolveTenantId(userProfile);
  if (!tenantId) {
    return <Navigate to="/" replace />;
  }

  if (userProfile?.status === 'PENDING_APPROVAL') {
    return <Navigate to="/pending" replace />;
  }

  return <AutoTenantProvider>{children}</AutoTenantProvider>;
}

function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { userProfile, loading: authLoading } = useAuth();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const businessId = tenantId || userProfile?.businessId || '';
  const { subscription, loading: subLoading } = useSubscription(businessId);

  React.useEffect(() => {
    if (authLoading || subLoading) return;
    if (!subscription) {
      navigate('/subscribe', { replace: true });
    }
  }, [authLoading, subLoading, subscription]);

  if (authLoading || subLoading) {
    return <PageSpinner />;
  }
  if (!subscription) return null;
  return <>{children}</>;
}

function AdminCoreWrapper() {
  const { tenantId } = useTenant();
  return (
    <VendorProvider businessId={tenantId || ''}>
      <WidgetProvider>
        <MainSystem key={tenantId} initialTab={undefined} />
      </WidgetProvider>
    </VendorProvider>
  );
}

function LegacyRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/admin/dashboard" replace />;
}

/**
 * Redirige rutas legacy con `:empresa_id` (ej: `/key_xxx/admin/cajas`) a la
 * versión flat (`/admin/cajas`) — preservando el resto del path y query string.
 * Sirve de fallback para bookmarks viejos sin exponer el businessId nunca más.
 */
function LegacyTenantRedirect() {
  const location = useLocation();
  const { empresa_id } = useParams();
  if (!empresa_id) return <Navigate to="/" replace />;
  // Strip el primer segmento `/${empresa_id}` y conserva lo demás
  const stripped = location.pathname.replace(`/${empresa_id}`, '') || '/';
  return <Navigate to={`${stripped}${location.search}`} replace />;
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
        <Route path="/changelog" element={<SubdomainGuard><Changelog /></SubdomainGuard>} />
        {/* Páginas públicas SEO */}
        <Route path="/precios" element={<SubdomainGuard><PreciosPage /></SubdomainGuard>} />
        <Route path="/funciones" element={<SubdomainGuard><FuncionesPage /></SubdomainGuard>} />
        {/* Internal ops panel */}
        <Route path={`/${import.meta.env.VITE_SUPER_ADMIN_PATH ?? 'ctrl-9x7b'}`} element={<SuperAdminPanel />} />
        <Route path="/ops" element={<OpsMonitor />} />
        {/* Walls — flat URLs, tenantId resuelto via AutoTenantProvider */}
        <Route path="/pending" element={<ProtectedRoute><AutoTenantProvider><PendingApprovalWall /></AutoTenantProvider></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><AutoTenantProvider><BillingPage /></AutoTenantProvider></ProtectedRoute>} />
        <Route path="/subscribe" element={<ProtectedRoute><AutoTenantProvider><SubscriptionWall /></AutoTenantProvider></ProtectedRoute>} />
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

        {/* Sistema principal — URLs flat, sin businessId visible */}
        <Route
          path="/admin/cajas"
          element={
            <TenantGuard>
              <SubscriptionGuard>
                <AdminPosManager />
              </SubscriptionGuard>
            </TenantGuard>
          }
        />
        <Route
          path="/admin/*"
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
          path="/pos"
          element={
            <TenantGuard>
              <PosLayout />
            </TenantGuard>
          }
        >
          <Route path="detal" element={<PosDetal />} />
          <Route path="mayor" element={<PosMayor />} />
        </Route>

        {/* Legacy tenant-prefixed redirects — preservan bookmarks viejos */}
        <Route path="/:empresa_id" element={<LegacyTenantRedirect />} />
        <Route path="/:empresa_id/admin/*" element={<LegacyTenantRedirect />} />
        <Route path="/:empresa_id/pos/*" element={<LegacyTenantRedirect />} />
        <Route path="/:empresa_id/billing" element={<LegacyTenantRedirect />} />
        <Route path="/:empresa_id/pending" element={<LegacyTenantRedirect />} />
        <Route path="/:empresa_id/subscribe" element={<LegacyTenantRedirect />} />

        {/* Verificación pública de pago (sin login, escaneable por QR) */}
        <Route path="/portal/:slug/payment/:paymentId/verify" element={<PortalPaymentVerify />} />

        {/* Portal de Clientes */}
        <Route path="/portal/:slug" element={<PortalGuard />}>
          <Route index element={<PortalDashboard />} />
          <Route path="facturas" element={<PortalInvoices />} />
          <Route path="pronto-pago" element={<PortalProntoPago />} />
          <Route path="pagar" element={<PortalAbonoForm />} />
          <Route path="estado-cuenta" element={<PortalStatement />} />
          <Route path="catalogo" element={<PortalCatalog />} />
          <Route path="fidelidad" element={<PortalLoyalty />} />
          <Route path="reclamo" element={<PortalDispute />} />
          <Route path="chat" element={<PortalChat />} />
          <Route path="ayuda" element={<PortalHelp />} />
        </Route>

        {/* Kiosk */}
        <Route path="/caja/:posToken" element={<KioskGate />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
