/**
 * Password policy.
 *
 * Lives in the domain, not in the auth service, because it is a rule rather
 * than an operation - and because importing it should not drag in the Supabase
 * client. A form that wants to know "is this long enough" was pulling in the
 * whole I/O layer, which is exactly what the layering rules exist to prevent.
 *
 * NIST guidance is that length beats composition rules: forcing a symbol and a
 * digit mostly produces "Password1!", which is weaker than a longer passphrase
 * and harder to type on a phone. Supabase enforces its own server-side minimum
 * too; this is the client-side check so the user finds out before the round
 * trip.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** Deliberately not a strength meter: those mostly teach people to append
 *  "1!" to a weak password. */
export const isPasswordAcceptable = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH;
