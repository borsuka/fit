import { describe, expect, it } from '@jest/globals';

import type { NutritionPer100g } from '../types';
import {
  gramsFromServing,
  gramsFromVolume,
  roundForDisplay,
  scaleNutrition,
} from './portionScaling';

// Cooked white rice, roughly USDA values.
const rice: NutritionPer100g = {
  kcal: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatG: 0.3,
  fiberG: 0.4,
};

describe('scaleNutrition', () => {
  it('scales linearly from per-100 g values', () => {
    const result = scaleNutrition(rice, 150);
    expect(result.kcal).toBeCloseTo(195, 6);
    expect(result.proteinG).toBeCloseTo(4.05, 6);
    expect(result.carbsG).toBeCloseTo(42, 6);
    expect(result.fatG).toBeCloseTo(0.45, 6);
    expect(result.fiberG).toBeCloseTo(0.6, 6);
  });

  it('returns the source values at exactly 100 g', () => {
    expect(scaleNutrition(rice, 100)).toEqual({
      kcal: 130,
      proteinG: 2.7,
      carbsG: 28,
      fatG: 0.3,
      fiberG: 0.4,
    });
  });

  it('returns zeros at zero grams', () => {
    const result = scaleNutrition(rice, 0);
    expect(result.kcal).toBe(0);
    expect(result.proteinG).toBe(0);
  });

  it('treats a missing fibre value as zero rather than NaN', () => {
    const noFiber: NutritionPer100g = { kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 };
    expect(scaleNutrition(noFiber, 200).fiberG).toBe(0);
  });

  it('does not round - a meal is the sum of its items', () => {
    // Rounding each item before summing accumulates error across a day.
    const result = scaleNutrition(rice, 33);
    expect(result.kcal).toBeCloseTo(42.9, 6);
    expect(Number.isInteger(result.kcal)).toBe(false);
  });
});

describe('gramsFromServing', () => {
  it('multiplies serving mass by quantity', () => {
    expect(gramsFromServing(28, 2)).toBe(56); // two 28 g slices
  });

  it('handles fractional quantities', () => {
    expect(gramsFromServing(240, 0.5)).toBe(120); // half a 240 g cup
  });
});

describe('gramsFromVolume', () => {
  it('converts using density', () => {
    expect(gramsFromVolume(250, 1.03)).toBeCloseTo(257.5, 6); // milk
  });

  it('returns null when density is unknown', () => {
    // Refusing to guess is the point: 250 ml of oil and 250 ml of milk differ
    // by about 15%, and honey by nearly 50%. Defaulting to water would be
    // quietly wrong, which is the worst kind of wrong in this app.
    expect(gramsFromVolume(250, null)).toBeNull();
  });

  const badDensities: [label: string, density: number][] = [
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
  ];

  it.each(badDensities)('returns null for %s density', (_label, density) => {
    expect(gramsFromVolume(250, density)).toBeNull();
  });
});

describe('roundForDisplay', () => {
  it('rounds kcal to whole numbers and macros to one decimal', () => {
    expect(roundForDisplay(scaleNutrition(rice, 33))).toEqual({
      kcal: 43,
      proteinG: 0.9,
      carbsG: 9.2,
      fatG: 0.1,
      fiberG: 0.1,
    });
  });
});
