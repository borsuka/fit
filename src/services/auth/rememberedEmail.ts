import { secureSessionStorage } from '@/services/supabase/sessionStorage';

/**
 * The address of the last account that signed in on this device.
 *
 * Only the address. The password is never stored, read back, or written
 * anywhere by this app - offering a saved one is the operating system's
 * keychain's job, which the sign-in field already asks for through
 * `autoComplete="current-password"`.
 *
 * Stored through the same adapter as the session, so it inherits the platform
 * split that already exists: the keychain on device, localStorage on web. An
 * email address is personal data and does not belong in plain text on disk
 * alongside a token that is kept out of it.
 *
 * Kept across sign-out, which is the entire point - a returning user should
 * find their address already filled in. Cleared when the account is deleted,
 * because "delete everything" has to mean everything.
 */
const KEY = 'fit.auth.lastEmail';

/** Normalised the same way `signIn` normalises before sending it, so what the
 *  field shows next time is exactly what was used. */
const normalise = (email: string): string => email.trim().toLowerCase();

export const rememberEmail = async (email: string): Promise<void> => {
  const value = normalise(email);
  if (value.length === 0) return;
  // Never throws: the adapter swallows storage failures, and a convenience
  // that cannot be persisted must not fail the sign-in that just succeeded.
  await secureSessionStorage.setItem(KEY, value);
};

export const getRememberedEmail = async (): Promise<string | null> => {
  const value = await secureSessionStorage.getItem(KEY);
  return value === null || value.length === 0 ? null : value;
};

export const forgetEmail = async (): Promise<void> => {
  await secureSessionStorage.removeItem(KEY);
};
