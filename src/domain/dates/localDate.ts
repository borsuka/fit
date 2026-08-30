/**
 * Which calendar day a diary entry belongs to.
 *
 * This is the user's day in their own timezone, not a UTC day. A meal eaten at
 * 00:30 in Sofia belongs to that date; deriving it from a UTC timestamp puts it
 * on the previous one, and the user sees yesterday's total jump after
 * midnight for no reason they can explain.
 */

/** An ISO calendar date, `yyyy-mm-dd`. Deliberately a plain string: it is what
 *  Postgres `date` columns take and what query keys need. */
export type LocalDate = string;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Formats an instant as a calendar date in the given IANA timezone.
 *
 * Uses `en-CA` because that locale formats as yyyy-mm-dd natively, which
 * avoids reassembling parts by hand. Falls back to the device's own local date
 * if the runtime rejects the timezone - an unknown zone should cost a user an
 * hour of edge-case inaccuracy, not a crash on the Home screen.
 */
export const toLocalDate = (timezone: string, instant: Date = new Date()): LocalDate => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
  }
};

/** Shifts a calendar date by whole days, without timezone arithmetic.
 *  Parsed as UTC noon so a DST transition cannot push the result onto the
 *  wrong day. */
export const addDays = (date: LocalDate, days: number): LocalDate => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
};

export const isValidLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects 2026-02-31, which Date would otherwise roll over to 3 March.
  return toUtcDateString(parsed) === value;
};

const toUtcDateString = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Days between two calendar dates, positive when `to` is later. */
export const daysBetween = (from: LocalDate, to: LocalDate): number => {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
};
