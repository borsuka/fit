import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import bg from './locales/bg';
import en from './locales/en';

/**
 * Internationalisation, wired from day one.
 *
 * Retrofitting i18n is expensive — it means touching every screen — while the
 * layer itself costs almost nothing up front. No user-facing string literal
 * belongs in a component.
 *
 * Reference data (food and exercise names) is NOT translated here. Those live
 * in `food_translations` and `exercise_translations`, because a bundled
 * dictionary cannot cover a database that grows.
 */

export const SUPPORTED_LOCALES = ['en', 'bg'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

const isSupported = (code: string): code is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(code);

/**
 * Picks the first device language we actually support.
 *
 * `languageCode` is the base tag, so a device set to bg-BG resolves to 'bg'.
 * Falling back to English rather than to the raw device tag matters: an
 * untranslated key renders as the key itself, and a screen reading
 * "onboarding.goal.title" is worse than one reading English.
 */
export const resolveDeviceLocale = (): SupportedLocale => {
  for (const locale of getLocales()) {
    const code = locale.languageCode;
    if (code !== null && isSupported(code)) return code;
  }
  return DEFAULT_LOCALE;
};

export const initI18n = (locale: SupportedLocale = resolveDeviceLocale()): typeof i18n => {
  if (i18n.isInitialized) return i18n;

  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, bg: { translation: bg } },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    // React Native has no XSS surface and react-i18next escapes nothing into
    // HTML here; leaving interpolation escaping on mangles apostrophes in
    // Bulgarian and English copy alike.
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  return i18n;
};

export { i18n };
