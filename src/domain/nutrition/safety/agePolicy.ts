import { MAX_AGE_YEARS, MIN_AGE_YEARS } from '../constants';

/**
 * Age policy (decision D-3 in docs/ARCHITECTURE.md).
 *
 * The database enforces only the LEGAL floor (13). The product policy lives
 * here so it can change with a constant and a test run, rather than a
 * constraint migration against a live user table.
 *
 * v1 ships 18+. Adolescent energy requirements are growth-driven and are not
 * "TDEE minus a percentage"; applying adult deficit logic to a fifteen-year-old
 * is a real harm, not an edge case. If the policy later opens to 16+, the
 * intended shape is `minAge: 16` with `minAgeForDeficitGoals` left at 18, so
 * younger users can track and maintain but not diet.
 */
export interface AgePolicy {
  readonly minAge: number;
  readonly maxAge: number;
  /** Below this age, 'lose' goals are refused outright. */
  readonly minAgeForDeficitGoals: number;
}

export const DEFAULT_AGE_POLICY: AgePolicy = {
  minAge: MIN_AGE_YEARS,
  maxAge: MAX_AGE_YEARS,
  minAgeForDeficitGoals: MIN_AGE_YEARS,
};

export const isAgeAllowed = (ageYears: number, policy: AgePolicy = DEFAULT_AGE_POLICY): boolean =>
  Number.isFinite(ageYears) && ageYears >= policy.minAge && ageYears <= policy.maxAge;

export const isDeficitGoalAllowed = (
  ageYears: number,
  policy: AgePolicy = DEFAULT_AGE_POLICY,
): boolean => Number.isFinite(ageYears) && ageYears >= policy.minAgeForDeficitGoals;

/**
 * Whole years elapsed. Deliberately not `(now - dob) / 365.25`: that is wrong
 * by a day around birthdays, and "wrong by a day" on the boundary of an age
 * gate is the entire question.
 */
export const ageFromDateOfBirth = (dateOfBirth: Date, now: Date): number => {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
};
