import { describe, expect, it } from '@jest/globals';

import type { NutritionAmount } from '../types';
import {
  EMPTY_TOTAL,
  macroDistribution,
  progressFraction,
  remainingAgainstTargets,
  sumNutrition,
} from './totals';

const item = (kcal: number, proteinG: number, carbsG: number, fatG: number): NutritionAmount => ({
  kcal,
  proteinG,
  carbsG,
  fatG,
  fiberG: 0,
});

const targets = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60, fiberG: 28 };

describe('sumNutrition', () => {
  it('returns zeros for an empty diary', () => {
    expect(sumNutrition([])).toEqual(EMPTY_TOTAL);
  });

  it('adds every field', () => {
    const total = sumNutrition([item(300, 20, 40, 8), item(500, 35, 55, 15)]);
    expect(total).toEqual({ kcal: 800, proteinG: 55, carbsG: 95, fatG: 23, fiberG: 0 });
  });

  it('does not mutate the shared empty constant', () => {
    sumNutrition([item(300, 20, 40, 8)]);
    expect(EMPTY_TOTAL).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 });
  });
});

describe('remainingAgainstTargets', () => {
  it('reports what is left', () => {
    const result = remainingAgainstTargets(targets, item(1420, 112, 145, 45));
    expect(result.kcal).toBe(580);
    expect(result.proteinG).toBe(38);
    expect(result.isOverCalories).toBe(false);
  });

  it('goes negative past the target instead of clamping at zero', () => {
    // Hiding an overshoot behind "0 remaining" withholds the one number the
    // user most needs to see. It is their data, not ours to soften.
    const result = remainingAgainstTargets(targets, item(2300, 180, 260, 80));
    expect(result.kcal).toBe(-300);
    expect(result.proteinG).toBe(-30);
    expect(result.isOverCalories).toBe(true);
  });

  it('treats exactly hitting the target as not over', () => {
    const result = remainingAgainstTargets(targets, item(2000, 150, 200, 60));
    expect(result.kcal).toBe(0);
    expect(result.isOverCalories).toBe(false);
  });
});

describe('progressFraction', () => {
  it('reports a fraction of the target', () => {
    expect(progressFraction(1000, 2000)).toBe(0.5);
  });

  it('exceeds 1 rather than clamping', () => {
    // A ring that stops at "full" cannot distinguish 100% from 160%. The
    // caller decides how to render an overshoot.
    expect(progressFraction(3200, 2000)).toBe(1.6);
  });

  const degenerate: [label: string, consumed: number, target: number][] = [
    ['zero target', 1000, 0],
    ['negative target', 1000, -100],
    ['NaN consumed', Number.NaN, 2000],
    ['NaN target', 1000, Number.NaN],
  ];

  it.each(degenerate)(
    'returns 0 for %s rather than Infinity or NaN',
    (_label, consumed, target) => {
      expect(progressFraction(consumed, target)).toBe(0);
    },
  );
});

describe('macroDistribution', () => {
  it('splits energy by Atwater factors', () => {
    // 100 g protein = 400, 100 g carbs = 400, 100 g fat = 900; total 1700
    const result = macroDistribution(item(1700, 100, 100, 100));
    expect(result.proteinPct).toBeCloseTo(23.529, 3);
    expect(result.carbsPct).toBeCloseTo(23.529, 3);
    expect(result.fatPct).toBeCloseTo(52.941, 3);
  });

  it('sums to 100 percent', () => {
    const result = macroDistribution(item(2000, 150, 200, 60));
    expect(result.proteinPct + result.carbsPct + result.fatPct).toBeCloseTo(100, 6);
  });

  it('returns zeros for an empty day instead of dividing by zero', () => {
    expect(macroDistribution(EMPTY_TOTAL)).toEqual({ proteinPct: 0, carbsPct: 0, fatPct: 0 });
  });
});
