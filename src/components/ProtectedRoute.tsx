import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="h-40 flex items-center justify-center">Cargando...</div>;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
