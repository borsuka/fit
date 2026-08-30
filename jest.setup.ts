import { afterAll, beforeAll } from '@jest/globals';

import { initI18n } from '@/lib/i18n';

/**
 * Real translations in tests, not key strings.
 *
 * Without this, react-i18next warns and `t('scan.noMatch')` renders as
 * "scan.noMatch" - so any assertion on user-facing copy would be asserting on
 * a key, and a missing translation would pass unnoticed.
 */
initI18n('en');

/**
 * Fail a test that logs an unexpected console.error. A React key warning or a
 * state update after unmount is a real defect; tests that stay green while the
 * console fills with warnings are not telling the truth.
 *
 * Globals are imported explicitly rather than relied on ambiently: TypeScript 6
 * no longer pulls @types/jest into scope automatically here, and an explicit
 * import works regardless of how the compiler resolves global types.
 */
const originalError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    originalError(...args);
    throw new Error(`Unexpected console.error in test: ${String(args[0])}`);
  };
});

afterAll(() => {
  console.error = originalError;
});
