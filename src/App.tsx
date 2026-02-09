import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

// Importamos tus páginas
import LandingPage from './components/LandingPage';
import Register from './components/Register';
import Login from './components/Login';
import ModulePage from './pages/ModulePage';
import Cuentas from './pages/Cuentas';
import Finanzas from './pages/Finanzas';
import RecursosHumanos from './pages/RecursosHumanos';
import Inventario from './pages/Inventario';
import Ventas from './pages/Ventas';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import ProtectedRoute from './components/ProtectedRoute';

// Importamos TU SISTEMA RECUPERADO
import MainSystem from './MainSystem'; // 👈 AQUÍ ESTÁ LA MAGIA

// --- CEREBRO PRINCIPAL ---
function AppContent() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const handleNavigate = (key: string) => {
    const k = key?.toLowerCase?.();
    if (!k) return;
    // rutas conocidas
    const mapping: Record<string, string> = {
      login: '/login',
      register: '/register',
      finanzas: '/finanzas',
      cuentas: '/cuentas',
      'recursos humanos': '/recursos-humanos',
      inventario: '/inventario',
      ventas: '/ventas',
      reportes: '/reportes',
      configuración: '/configuracion',
      configuracion: '/configuracion',
    };
    const target = mapping[k] || `/${k}`;
    navigate(target);
  };

  // Cargando...
  if (loading)
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="text-indigo-600 font-medium animate-pulse">Cargando Boutique ERP...</p>
      </div>
    );

  // SI YA ENTRASTE -> MUESTRA TU SISTEMA COMPLETO
  if (user) {
    return <MainSystem />; // 👈 ¡VOLVIMOS!
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppContent />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/finanzas"
            element={
              <ProtectedRoute>
                <ModulePage
                  title="Finanzas"
                  desc="Panel de finanzas: cuentas, conciliaciones, reportes de flujo."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cuentas"
            element={
              <ProtectedRoute>
                <Cuentas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recursos-humanos"
            element={
              <ProtectedRoute>
                <RecursosHumanos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario"
            element={
              <ProtectedRoute>
                <Inventario />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ventas"
            element={
              <ProtectedRoute>
                <Ventas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reportes"
            element={
              <ProtectedRoute>
                <Reportes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute>
                <Configuracion />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
