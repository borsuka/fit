import { useTranslation } from 'react-i18next';

import { isAppError } from '@/lib/errors';

/**
 * Turns whatever react-query surfaced into a sentence a person can act on.
 *
 * The AppError `code` is the contract; its English `userMessage` is only a
 * fallback for logs and for a locale that has not been loaded. Screens never
 * render a status code.
 */
export const useErrorMessage = (): ((error: unknown) => string | undefined) => {
  const { t } = useTranslation();

  return (error: unknown): string | undefined => {
    if (error === null || error === undefined) return undefined;
    if (isAppError(error)) return t(`errors.${error.code}`);
    return t('errors.unknown');
  };
};
