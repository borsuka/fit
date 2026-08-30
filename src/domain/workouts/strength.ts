/**
 * Strength arithmetic.
 *
 * Every value here is DERIVED from logged sets and never stored. Volume and
 * estimated 1RM are functions of the sets; a stored copy is one more thing that
 * can disagree with what the user actually did.
 */

export interface WorkSet {
  readonly reps: number;
  readonly weightKg: number;
  readonly isWarmup: boolean;
}

/** Warm-ups do not count toward training volume. Including them makes a light
 *  day look heavy and hides a real drop in effort. */
export const workingSets = (sets: readonly WorkSet[]): WorkSet[] =>
  sets.filter((set) => !set.isWarmup && set.reps > 0 && set.weightKg >= 0);

/** Tonnage: reps x weight, summed over working sets. The crudest measure of
 *  work done, and the one most people actually track. */
export const totalVolumeKg = (sets: readonly WorkSet[]): number =>
  workingSets(sets).reduce((sum, set) => sum + set.reps * set.weightKg, 0);

export const totalReps = (sets: readonly WorkSet[]): number =>
  workingSets(sets).reduce((sum, set) => sum + set.reps, 0);

/**
 * Estimated one-rep max, Epley: 1RM = w x (1 + reps / 30).
 *
 * An ESTIMATE, and a poor one past about ten reps - the relationship between
 * reps and maximal strength stops being linear well before that. The app labels
 * it as an estimate and refuses to extrapolate beyond where the formula means
 * anything.
 *
 * Returns null rather than a number it cannot stand behind.
 */
export const MAX_REPS_FOR_1RM_ESTIMATE = 12;

export const estimatedOneRepMax = (set: WorkSet): number | null => {
  if (set.isWarmup) return null;
  if (!Number.isFinite(set.reps) || !Number.isFinite(set.weightKg)) return null;
  if (set.reps < 1 || set.weightKg <= 0) return null;
  // A single rep IS the max; no formula needed, and applying one would inflate
  // it by 3%.
  if (set.reps === 1) return set.weightKg;
  if (set.reps > MAX_REPS_FOR_1RM_ESTIMATE) return null;

  return set.weightKg * (1 + set.reps / 30);
};

/** The best estimate across a session's sets, or null if none qualify. */
export const bestOneRepMax = (sets: readonly WorkSet[]): number | null => {
  let best: number | null = null;
  for (const set of sets) {
    const estimate = estimatedOneRepMax(set);
    if (estimate !== null && (best === null || estimate > best)) best = estimate;
  }
  return best;
};

/** Heaviest working set, by weight then reps. What people mean by "my top set". */
export const topSet = (sets: readonly WorkSet[]): WorkSet | null => {
  let best: WorkSet | null = null;
  for (const set of workingSets(sets)) {
    if (best === null || set.weightKg > best.weightKg) best = set;
    else if (set.weightKg === best.weightKg && set.reps > best.reps) best = set;
  }
  return best;
};

// ============================================================================
// Progression
// ============================================================================

export interface ProgressionTarget {
  readonly targetReps: number;
  readonly targetSets: number;
  /** Smallest weight step available. Plates differ; a suggestion the user
   *  cannot load is not a suggestion. */
  readonly incrementKg: number;
}

export type ProgressionAdvice =
  | { readonly kind: 'add_weight'; readonly weightKg: number; readonly reps: number }
  | { readonly kind: 'add_reps'; readonly weightKg: number; readonly reps: number }
  | { readonly kind: 'hold'; readonly weightKg: number; readonly reps: number }
  | { readonly kind: 'deload'; readonly weightKg: number; readonly reps: number };

const DELOAD_FRACTION = 0.9;

/**
 * Double progression: add reps until the top of the range, then add weight and
 * drop back to the bottom.
 *
 * Chosen over linear progression because linear only works for a beginner and
 * then fails weekly, which teaches people the suggestion is noise. Double
 * progression keeps working, and its advice stays achievable.
 *
 * `consecutiveFailures` drives a deload. Grinding the same failed weight for
 * weeks is how people get hurt and quit, and no amount of encouragement makes
 * a stalled lift move.
 */
export const nextSessionAdvice = (
  lastSets: readonly WorkSet[],
  target: ProgressionTarget,
  consecutiveFailures = 0,
): ProgressionAdvice | null => {
  const working = workingSets(lastSets);
  if (working.length === 0) return null;

  const heaviest = topSet(working);
  if (heaviest === null) return null;

  const weight = heaviest.weightKg;

  if (consecutiveFailures >= 3) {
    // Rounded to a loadable weight, then floored at the increment so a light
    // lift does not deload to zero.
    const reduced = Math.max(
      target.incrementKg,
      Math.round((weight * DELOAD_FRACTION) / target.incrementKg) * target.incrementKg,
    );
    return { kind: 'deload', weightKg: reduced, reps: target.targetReps };
  }

  const completedAllSets = working.length >= target.targetSets;
  const hitTargetReps = working
    .filter((set) => set.weightKg >= weight)
    .every((set) => set.reps >= target.targetReps);

  if (completedAllSets && hitTargetReps) {
    return {
      kind: 'add_weight',
      weightKg: weight + target.incrementKg,
      reps: target.targetReps,
    };
  }

  if (completedAllSets) {
    return { kind: 'add_reps', weightKg: weight, reps: target.targetReps };
  }

  return { kind: 'hold', weightKg: weight, reps: target.targetReps };
};
