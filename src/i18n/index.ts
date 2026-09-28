import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import ar from './ar';

export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: typeof window !== 'undefined' ? (localStorage.getItem('ak-lang') || 'en') : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

export type Dict = typeof en;