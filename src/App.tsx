import React from 'react';
// Deploy Version: 2.5.0 - Full Remodel
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RatesProvider } from './context/RatesContext';
import { ToastProvider } from './context/ToastContext';
import { SubdomainProvider } from './context/SubdomainContext';
import AppRouter from './routes/AppRouter';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <SubdomainProvider>
          <ThemeProvider>
            <AuthProvider>
              <RatesProvider>
                <ToastProvider>
                  <BrowserRouter>
                    <AppRouter />
                  </BrowserRouter>
                </ToastProvider>
              </RatesProvider>
            </AuthProvider>
          </ThemeProvider>
        </SubdomainProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
