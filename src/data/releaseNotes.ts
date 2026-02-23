export type ReleaseNote = {
  version: string;
  date: string;
  summary: string;
  highlights: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    version: 'v2.1.8',
    date: '18 Feb 2026',
    summary: 'Memo en layout y branding en auth.',
    highlights: [
      'Sidebar y Topbar memoizados para reducir renders.',
      'Login/Registro con Logo DUALIS oficial en encabezado.',
    ],
  },
  {
    version: 'v2.1.7',
    date: '18 Feb 2026',
    summary: 'Glow up de Landing y registro ordenado.',
    highlights: [
      'Landing fluida con secciones full-width, hero vivo y scroll reveal.',
      'Nueva seccion "Como funciona" con 3 pasos conectados.',
      'Registro con terminos obligatorios y flujo visual limpio.',
    ],
  },
  {
    version: 'v2.1.6',
    date: '18 Feb 2026',
    summary: 'Logo oficial y optimizacion de blur.',
    highlights: [
      'Logo real desde /public/logo.png en toda la app.',
      'Blur reducido en panels y topbar para mejor rendimiento.',
      'will-change agregado en cards con hover.',
    ],
  },
  {
    version: 'v2.1.5',
    date: '18 Feb 2026',
    summary: 'Branding DUALIS en textos de idioma.',
    highlights: [
      'Nombre de la app actualizado a DUALIS en es/en/ar.',
      'Consistencia de marca en etiquetas localizadas.',
    ],
  },
  {
    version: 'v2.1.4',
    date: '18 Feb 2026',
    summary: 'Branding DUALIS unificado y splash con fallback.',
    highlights: [
      'Logo DUALIS aplicado en Landing, Sidebar, Login y Registro.',
      'Textos de marca alineados a DUALIS en UI y copys clave.',
      'Fallback con Logo si el video del SplashScreen falla.',
    ],
  },
  {
    version: 'v2.1.3',
    date: '18 Feb 2026',
    summary: 'Glow-up neon glass en Landing y Dashboard.',
    highlights: [
      'Glassmorphism oscuro con blur y bordes luminosos en panels y cards.',
      'Fondos atmosfericos con gradientes sutiles y micro-interacciones neon.',
      'Botones con glow y acento cian/emerald en dark mode.',
    ],
  },
  {
    version: 'v2.1.2',
    date: '18 Feb 2026',
    summary: 'Modo oscuro en Landing y mejor contraste visual.',
    highlights: [
      'Boton de modo oscuro agregado en la barra superior.',
      'Changelog y banner Early Adopters optimizados para dark mode.',
    ],
  },
  {
    version: 'v2.1.1',
    date: '18 Feb 2026',
    summary: 'Correcciones de formularios y despliegue en produccion.',
    highlights: [
      'Arreglos de JSX en formularios de contacto y registro.',
      'Build de produccion exitoso con Vite.',
      'Deploy actualizado en Vercel.',
    ],
  },
  {
    version: 'v2.1.0',
    date: '18 Feb 2026',
    summary: 'SplashScreen, tour guiado y mejoras de seguridad.',
    highlights: [
      'SplashScreen con video, cierre automatico y boton Omitir.',
      'Tour guiado en dashboard con 10 pasos (driver.js).',
      'reCAPTCHA en Login, Registro y Contacto (modo dev sin key).',
      'Landing con pricing, legal, contacto y promo Early Adopters.',
      'Inventario con costo USD, precio Bs calculado y stock minimo.',
      'Mejoras de contraste en checklist y atencion requerida.',
    ],
  },
];
