/**
 * Session storage for the WEB build.
 *
 * Metro resolves `.web.ts` ahead of `.ts`, so this replaces the keychain
 * implementation without a runtime platform check - and without importing
 * react-native into the service layer, which the layering rules forbid and
 * which a lint error caught when it was tried.
 *
 * There is no keychain on web. The honest options are localStorage or
 * memory-only, and memory-only means signing in again on every page load. We
 * take localStorage and accept that a successful XSS reads the session - the
 * same exposure every web app with a login has, and part of why the web build
 * is a development and preview surface rather than the shipping product.
 *
 * expo-secure-store is not merely unhelpful here, it is UNSUPPORTED: the calls
 * fail, the adapter's catch swallows it, supabase-js sees an empty store and
 * drops the token, and every request goes out anonymous. Found by running the
 * app and watching a profile insert get refused by RLS.
 */
export const secureSessionStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // Private browsing and blocked site data both throw on access.
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Quota or blocked storage. The in-memory session still works for this
      // page; the user signs in again on reload.
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Sign-out must not fail.
    }
  },
};
