import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RatesProvider } from './context/RatesContext';
import AppRouter from './routes/AppRouter';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RatesProvider>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </RatesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
