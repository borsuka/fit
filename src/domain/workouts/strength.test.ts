import { describe, expect, it } from '@jest/globals';

import {
  bestOneRepMax,
  estimatedOneRepMax,
  MAX_REPS_FOR_1RM_ESTIMATE,
  nextSessionAdvice,
  topSet,
  totalReps,
  totalVolumeKg,
  workingSets,
  type ProgressionTarget,
  type WorkSet,
} from './strength';

const set = (reps: number, weightKg: number, isWarmup = false): WorkSet => ({
  reps,
  weightKg,
  isWarmup,
});

const target: ProgressionTarget = { targetReps: 8, targetSets: 3, incrementKg: 2.5 };

describe('workingSets', () => {
  it('excludes warm-ups', () => {
    // Counting warm-ups makes a light day look heavy and hides a real drop in
    // effort.
    const sets = [set(10, 20, true), set(8, 60), set(8, 60)];
    expect(workingSets(sets)).toHaveLength(2);
  });

  it('excludes a set with zero reps', () => {
    expect(workingSets([set(0, 60), set(8, 60)])).toHaveLength(1);
  });
});

describe('totalVolumeKg', () => {
  it('sums reps times weight', () => {
    expect(totalVolumeKg([set(8, 60), set(8, 60), set(6, 65)])).toBe(8 * 60 + 8 * 60 + 6 * 65);
  });

  it('ignores warm-ups', () => {
    expect(totalVolumeKg([set(10, 20, true), set(8, 60)])).toBe(480);
  });

  it('is zero for an empty session', () => {
    expect(totalVolumeKg([])).toBe(0);
  });

  it('handles bodyweight sets without breaking', () => {
    // Weight 0 is legitimate - press-ups are still reps.
    expect(totalVolumeKg([set(20, 0)])).toBe(0);
    expect(totalReps([set(20, 0)])).toBe(20);
  });
});

describe('estimatedOneRepMax', () => {
  it('matches Epley: w x (1 + reps / 30)', () => {
    // 100 x (1 + 5/30) = 116.67
    expect(estimatedOneRepMax(set(5, 100))).toBeCloseTo(116.667, 3);
  });

  it('returns the weight itself for a single rep', () => {
    // A single is the max. Applying the formula would inflate it by 3%.
    expect(estimatedOneRepMax(set(1, 140))).toBe(140);
  });

  it('refuses to estimate past the range where the formula means anything', () => {
    // The rep-to-max relationship stops being linear well before this. Better
    // to return nothing than a number the app cannot stand behind.
    expect(estimatedOneRepMax(set(MAX_REPS_FOR_1RM_ESTIMATE, 60))).not.toBeNull();
    expect(estimatedOneRepMax(set(MAX_REPS_FOR_1RM_ESTIMATE + 1, 60))).toBeNull();
  });

  it.each([
    ['a warm-up', set(5, 100, true)],
    ['zero reps', set(0, 100)],
    ['zero weight', set(5, 0)],
    ['NaN reps', set(Number.NaN, 100)],
    ['Infinite weight', set(5, Number.POSITIVE_INFINITY)],
  ] as [string, WorkSet][])('returns null for %s', (_label, input) => {
    expect(estimatedOneRepMax(input)).toBeNull();
  });
});

describe('bestOneRepMax', () => {
  it('takes the highest estimate across the session', () => {
    // 5x100 -> 116.7, 3x110 -> 121, 8x80 -> 101.3
    expect(bestOneRepMax([set(5, 100), set(3, 110), set(8, 80)])).toBeCloseTo(121, 3);
  });

  it('returns null when nothing qualifies', () => {
    expect(bestOneRepMax([set(20, 60), set(10, 0)])).toBeNull();
  });
});

describe('topSet', () => {
  it('picks the heaviest weight', () => {
    expect(topSet([set(8, 60), set(5, 80), set(10, 50)])?.weightKg).toBe(80);
  });

  it('breaks a tie on reps', () => {
    expect(topSet([set(5, 80), set(8, 80)])?.reps).toBe(8);
  });

  it('ignores a heavy warm-up', () => {
    expect(topSet([set(1, 200, true), set(5, 80)])?.weightKg).toBe(80);
  });
});

describe('nextSessionAdvice', () => {
  it('adds weight when every set hit the target', () => {
    const advice = nextSessionAdvice([set(8, 60), set(8, 60), set(8, 60)], target);
    expect(advice).toEqual({ kind: 'add_weight', weightKg: 62.5, reps: 8 });
  });

  it('adds reps when the sets were completed but short of the rep target', () => {
    const advice = nextSessionAdvice([set(6, 60), set(6, 60), set(5, 60)], target);
    expect(advice).toEqual({ kind: 'add_reps', weightKg: 60, reps: 8 });
  });

  it('holds when the session was cut short', () => {
    const advice = nextSessionAdvice([set(8, 60), set(8, 60)], target);
    expect(advice).toEqual({ kind: 'hold', weightKg: 60, reps: 8 });
  });

  it('deloads after three consecutive failures', () => {
    // Grinding a failed weight for weeks is how people get hurt and quit, and
    // no amount of encouragement moves a stalled lift.
    const advice = nextSessionAdvice([set(5, 100), set(4, 100), set(3, 100)], target, 3);
    expect(advice?.kind).toBe('deload');
    expect(advice?.weightKg).toBe(90);
  });

  it('rounds a deload to a loadable weight', () => {
    // 62.5 x 0.9 = 56.25, which is not loadable in 2.5 kg steps.
    const advice = nextSessionAdvice([set(5, 62.5)], target, 3);
    expect(advice?.weightKg).toBe(57.5);
    expect((advice!.weightKg / target.incrementKg) % 1).toBe(0);
  });

  it('never deloads below one increment', () => {
    const advice = nextSessionAdvice([set(5, 2.5)], target, 3);
    expect(advice?.weightKg).toBe(2.5);
  });

  it('respects a gym with different plates', () => {
    const fine: ProgressionTarget = { ...target, incrementKg: 1 };
    const advice = nextSessionAdvice([set(8, 60), set(8, 60), set(8, 60)], fine);
    expect(advice?.weightKg).toBe(61);
  });

  it('returns null for a session with no working sets', () => {
    expect(nextSessionAdvice([], target)).toBeNull();
    expect(nextSessionAdvice([set(10, 20, true)], target)).toBeNull();
  });
});
