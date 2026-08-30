export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * How a day's energy is split across meals.
 *
 * Conventional distributions, not derived from anything: people eat on a
 * schedule shaped by their day, not by a formula. They exist so each slot has a
 * budget to aim at, and the totals matter far more than any single slot hitting
 * its share.
 *
 * Keyed by how many meals the user asked for, because a three-meal day and a
 * five-meal day are not the same split with a gap.
 */
const DISTRIBUTIONS: Readonly<Record<number, Readonly<Partial<Record<MealSlot, number>>>>> = {
  2: { lunch: 0.5, dinner: 0.5 },
  3: { breakfast: 0.3, lunch: 0.375, dinner: 0.325 },
  4: { breakfast: 0.25, lunch: 0.325, dinner: 0.325, snack: 0.1 },
  5: { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 },
};

export const DEFAULT_SLOT_ORDER: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Energy share for each requested slot, normalised to sum to exactly 1.
 *
 * Normalising matters: without it a two-slot day built from the four-meal table
 * would budget 57 % of the target and the planner would confidently produce a
 * 1200 kcal plan for a 2100 kcal goal.
 */
export const slotShares = (slots: readonly MealSlot[]): Readonly<Record<string, number>> => {
  if (slots.length === 0) return {};

  const table = DISTRIBUTIONS[slots.length];
  const raw: Record<string, number> = {};

  for (const slot of slots) {
    raw[slot] = table?.[slot] ?? 1 / slots.length;
  }

  const total = Object.values(raw).reduce((sum, share) => sum + share, 0);
  if (total <= 0) {
    return Object.fromEntries(slots.map((slot) => [slot, 1 / slots.length]));
  }

  return Object.fromEntries(Object.entries(raw).map(([slot, share]) => [slot, share / total]));
};
