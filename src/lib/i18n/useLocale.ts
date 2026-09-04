import { useTranslation } from 'react-i18next';

import { toLocale, type Locale } from './locale';

/**
 * The current locale, narrowed.
 *
 * Every query that renders a food name takes this as an argument AND puts it in
 * its cache key. Reading it inside the service instead would be less typing and
 * a real bug: react-query would serve the English names it cached before the
 * user switched language, and nothing would look wrong until they scrolled.
 */
export const useLocale = (): Locale => {
  const { i18n } = useTranslation();
  return toLocale(i18n.language);
};
