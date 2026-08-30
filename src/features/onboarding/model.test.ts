import { describe, expect, it } from '@jest/globals';

import {
  EMPTY_DRAFT,
  isAboutYouComplete,
  isGoalComplete,
  parseBirthDate,
  parseDecimal,
  toIsoDate,
  type OnboardingDraft,
} from './model';

const draft = (patch: Partial<OnboardingDraft>): OnboardingDraft => ({ ...EMPTY_DRAFT, ...patch });

const complete: OnboardingDraft = {
  birthDay: '15',
  birthMonth: '6',
  birthYear: '1994',
  sex: 'male',
  heightCm: '180',
  weightKg: '80',
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: '',
};

describe('parseDecimal', () => {
  it('parses a plain number', () => {
    expect(parseDecimal('72.5')).toBe(72.5);
  });

  it('accepts a comma as the decimal separator', () => {
    // It is what a Bulgarian keyboard offers, and a silent NaN here would be a
    // wrong calorie target.
    expect(parseDecimal('72,5')).toBe(72.5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDecimal('  80 ')).toBe(80);
  });

  it('returns null for an empty field rather than 0', () => {
    // Number('') is 0, which would silently accept a blank weight box.
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
  });

  it('returns null for text', () => {
    expect(parseDecimal('eighty')).toBeNull();
  });
});

describe('parseBirthDate', () => {
  it('builds a date from three fields', () => {
    const result = parseBirthDate(draft({ birthDay: '15', birthMonth: '6', birthYear: '1994' }));
    expect(result).not.toBeNull();
    expect(result?.getFullYear()).toBe(1994);
    expect(result?.getMonth()).toBe(5); // zero-based
    expect(result?.getDate()).toBe(15);
  });

  it('rejects a day that does not exist in that month', () => {
    // new Date(2026, 1, 31) silently rolls over to 3 March, so without the
    // round-trip check a typo becomes a valid date two days later.
    expect(
      parseBirthDate(draft({ birthDay: '31', birthMonth: '2', birthYear: '1994' })),
    ).toBeNull();
  });

  it('rejects 29 February in a non-leap year and accepts it in a leap year', () => {
    expect(
      parseBirthDate(draft({ birthDay: '29', birthMonth: '2', birthYear: '1995' })),
    ).toBeNull();
    expect(
      parseBirthDate(draft({ birthDay: '29', birthMonth: '2', birthYear: '1996' })),
    ).not.toBeNull();
  });

  it('rejects a partial year', () => {
    // "94" would otherwise become the year 94 AD and pass the age gate.
    expect(parseBirthDate(draft({ birthDay: '15', birthMonth: '6', birthYear: '94' }))).toBeNull();
  });

  it('rejects empty fields', () => {
    expect(parseBirthDate(EMPTY_DRAFT)).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('formats as yyyy-mm-dd with padding', () => {
    expect(toIsoDate(new Date(1994, 5, 5))).toBe('1994-06-05');
  });

  it('uses the local date, not UTC', () => {
    // A date built at local midnight converts to the previous day in UTC for
    // anyone east of Greenwich, so toISOString() would shift a birthday.
    const localMidnight = new Date(1994, 5, 15, 0, 0, 0);
    expect(toIsoDate(localMidnight)).toBe('1994-06-15');
  });
});

describe('completeness guards', () => {
  it('accepts a fully filled first step', () => {
    expect(isAboutYouComplete(complete)).toBe(true);
  });

  it.each([
    ['no birth date', { birthYear: '' }],
    ['no sex', { sex: null }],
    ['no height', { heightCm: '' }],
    ['no weight', { weightKg: '' }],
    ['no activity', { activity: null }],
  ] as [string, Partial<OnboardingDraft>][])('blocks with %s', (_label, patch) => {
    expect(isAboutYouComplete({ ...complete, ...patch })).toBe(false);
  });

  it('requires a goal on the second step', () => {
    expect(isGoalComplete(complete)).toBe(true);
    expect(isGoalComplete({ ...complete, goal: null })).toBe(false);
  });
});
