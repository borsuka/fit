/**
 * The two locales the app ships, as a type the service layer can take.
 *
 * `i18n.language` is a string and can be anything - a device tag like `bg-BG`,
 * or a value restored from storage that no longer exists. Narrowing happens
 * here, once, so no query key or SQL parameter has to guess.
 */
export type Locale = 'en' | 'bg';

export const DEFAULT_LOCALE: Locale = 'en';

export const toLocale = (value: string | undefined | null): Locale =>
  value !== null && value !== undefined && value.toLowerCase().startsWith('bg') ? 'bg' : 'en';
