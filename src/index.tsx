import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initSentry } from './utils/sentry';
import './i18n';
import './index.css'; // 👈 ¡ESTA ES LA LÍNEA QUE TE FALTABA!

// Fase A.6: Sentry — no-op si VITE_SENTRY_DSN no está definido.
// Se dispara sin await para no bloquear el first paint.
void initSentry();

// Apply saved UI preferences on boot
try {
  const savedFont = localStorage.getItem('dualis_font_size');
  if (savedFont) document.documentElement.setAttribute('data-font', savedFont);
  const savedDensity = localStorage.getItem('dualis_density');
  if (savedDensity) document.documentElement.setAttribute('data-density', savedDensity);
} catch {}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}

// L.12: Capture beforeinstallprompt for custom install button
declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('pwa-install-available'));
});
export function getPWAInstallPrompt() { return deferredInstallPrompt; }
export function clearPWAInstallPrompt() { deferredInstallPrompt = null; }
