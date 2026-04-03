import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css'; // 👈 ¡ESTA ES LA LÍNEA QUE TE FALTABA!

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
  root.render(<App />);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}
