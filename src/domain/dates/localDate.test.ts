import { describe, expect, it } from '@jest/globals';

import { addDays, daysBetween, isValidLocalDate, toLocalDate } from './localDate';

describe('toLocalDate', () => {
  it('uses the user timezone, not UTC', () => {
    // 22:30 UTC on 30 August is already 01:30 on the 31st in Sofia (UTC+3 in
    // summer). Deriving the diary day from UTC would file that meal under the
    // wrong date, and the user would watch yesterday's total move after
    // midnight.
    const instant = new Date('2026-08-30T22:30:00Z');
    expect(toLocalDate('Europe/Sofia', instant)).toBe('2026-08-31');
    expect(toLocalDate('UTC', instant)).toBe('2026-08-30');
  });

  it('handles a timezone behind UTC', () => {
    // 01:30 UTC on 31 August is still 21:30 on the 30th in New York.
    const instant = new Date('2026-08-31T01:30:00Z');
    expect(toLocalDate('America/New_York', instant)).toBe('2026-08-30');
  });

  it('pads month and day to two digits', () => {
    expect(toLocalDate('UTC', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('falls back to the device date rather than throwing on an unknown zone', () => {
    // An unknown zone should cost an hour of edge-case inaccuracy, not a crash
    // on the Home screen.
    const result = toLocalDate('Not/AZone', new Date('2026-08-30T12:00:00Z'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-30', -1)).toBe('2026-08-29');
  });

  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('does not slip a day across a DST transition', () => {
    // Europe switches on the last Sunday of October. Parsing at UTC noon keeps
    // the arithmetic clear of the 01:00-03:00 window entirely.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('isValidLocalDate', () => {
  it('accepts a real date', () => {
    expect(isValidLocalDate('2026-08-30')).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    // Date would otherwise roll 31 February over to 3 March and report success.
    expect(isValidLocalDate('2026-02-31')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    expect(isValidLocalDate('30/08/2026')).toBe(false);
    expect(isValidLocalDate('2026-8-30')).toBe(false);
    expect(isValidLocalDate('')).toBe(false);
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2027-02-29')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts forward', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('is negative going backward', () => {
    expect(daysBetween('2026-09-02', '2026-08-30')).toBe(-3);
  });

  it('is zero for the same day', () => {
    expect(daysBetween('2026-08-30', '2026-08-30')).toBe(0);
  });

  it('is unaffected by a DST transition in between', () => {
    // A naive millisecond division would return 30.958 here and round wrong
    // if the boundary sat differently.
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });
});
