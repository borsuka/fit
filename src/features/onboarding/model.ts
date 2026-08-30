import type { ActivityLevel, GoalType, Sex } from '@/domain/nutrition';

/**
 * The onboarding form's own state.
 *
 * Everything is a string, because that is what a text input produces. Parsing
 * happens once, at the boundary into the domain, rather than being scattered
 * through every field handler - which is how "" becomes NaN becomes an empty
 * macro ring.
 */
export interface OnboardingDraft {
  readonly birthDay: string;
  readonly birthMonth: string;
  readonly birthYear: string;
  readonly sex: Sex | null;
  readonly heightCm: string;
  readonly weightKg: string;
  readonly activity: ActivityLevel | null;
  readonly goal: GoalType | null;
  readonly targetWeightKg: string;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  sex: null,
  heightCm: '',
  weightKg: '',
  activity: null,
  goal: null,
  targetWeightKg: '',
};

/** Accepts a comma as the decimal separator: it is what a Bulgarian keyboard
 *  offers, and a silent NaN there would be a wrong calorie target. */
export const parseDecimal = (value: string): number | null => {
  const normalised = value.trim().replace(',', '.');
  if (normalised.length === 0) return null;
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Builds a date from three fields, rejecting impossible ones.
 *
 * `new Date(2026, 1, 31)` silently rolls over to 3 March, so a typo of 31
 * February would otherwise become a valid date two days later. The round-trip
 * comparison catches that.
 */
export const parseBirthDate = (draft: OnboardingDraft): Date | null => {
  const day = Number(draft.birthDay);
  const month = Number(draft.birthMonth);
  const year = Number(draft.birthYear);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (draft.birthYear.length !== 4) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

/** ISO yyyy-mm-dd in LOCAL time. `toISOString()` would convert to UTC and can
 *  shift the date by a day for anyone east or west of Greenwich. */
export const toIsoDate = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const isAboutYouComplete = (draft: OnboardingDraft): boolean =>
  parseBirthDate(draft) !== null &&
  draft.sex !== null &&
  parseDecimal(draft.heightCm) !== null &&
  parseDecimal(draft.weightKg) !== null &&
  draft.activity !== null;

export const isGoalComplete = (draft: OnboardingDraft): boolean => draft.goal !== null;

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'very',
  'extra',
];

export const GOAL_TYPES: readonly GoalType[] = ['lose', 'maintain', 'gain', 'muscle_gain'];

/** Goals where a target weight is meaningful. Asking a maintainer for one is
 *  a question with no useful answer. */
export const GOALS_WITH_TARGET: ReadonlySet<GoalType> = new Set<GoalType>([
  'lose',
  'gain',
  'muscle_gain',
]);
