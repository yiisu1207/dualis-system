import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';
import ar from './locales/ar.json';

const LANGUAGE_STORAGE_KEY = 'erp_lang';

const resolveInitialLanguage = () => {
  if (typeof window === 'undefined') return 'es';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved) return saved;
  const browser = navigator.language?.split('-')[0];
  return browser === 'en' || browser === 'ar' ? browser : 'es';
};

const applyDirection = (lng: string) => {
  if (typeof document === 'undefined') return;
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: resolveInitialLanguage(),
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  }
  applyDirection(lng);
});

applyDirection(i18n.language);

export default i18n;
