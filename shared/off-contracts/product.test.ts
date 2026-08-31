import { describe, expect, it } from '@jest/globals';

import {
  isValidBarcode,
  MAX_MACRO_MASS_100G,
  MAX_PLAUSIBLE_KCAL_100G,
  toFoodPayload,
  type OffProduct,
} from './product';

/**
 * The fixture is the real Open Food Facts response for Nutella (3017624010701),
 * trimmed to the fields we read. Captured from the live API rather than
 * invented, so the shape assertions mean something.
 */
const nutella: OffProduct = {
  product_name: 'Nutella',
  brands: 'Ferrero',
  allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    sugars_100g: 56.3,
    'saturated-fat_100g': 10.6,
    sodium_100g: 0.0428,
  },
};

const ok = (product: OffProduct) => {
  const result = toFoodPayload(product);
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
  return result.value;
};

describe('toFoodPayload', () => {
  it('maps a real product', () => {
    const food = ok(nutella);
    expect(food.name).toBe('Nutella');
    expect(food.brand).toBe('Ferrero');
    expect(food.kcal_100g).toBe(539);
    expect(food.protein_100g).toBe(6.3);
    expect(food.carbs_100g).toBe(57.5);
    expect(food.fat_100g).toBe(30.9);
  });

  it('converts sodium from grams to milligrams', () => {
    // OFF reports grams; we store milligrams. Missing this understates sodium a
    // thousandfold, which for anyone watching blood pressure is the difference
    // between a useful number and a dangerous one.
    expect(ok(nutella).sodium_mg_100g).toBe(43);
  });

  it('maps allergen tags to our ids', () => {
    expect(ok(nutella).allergenIds).toEqual([7, 8, 6]);
  });

  it('ignores an allergen tag we do not model', () => {
    const food = ok({
      ...nutella,
      allergens_tags: ['en:milk', 'en:something-we-do-not-track'],
    });
    expect(food.allergenIds).toEqual([7]);
  });

  it('prefers the English name when both are present', () => {
    const food = ok({ ...nutella, product_name: 'Нутела', product_name_en: 'Nutella spread' });
    expect(food.name).toBe('Nutella spread');
  });

  it('takes only the first brand', () => {
    // OFF stores brands as a comma-separated list; the whole string reads as a
    // corporate history rather than a product label.
    expect(ok({ ...nutella, brands: 'Ferrero,Nutella,Ferrero Rocher' }).brand).toBe('Ferrero');
  });

  it('treats a blank brand as absent rather than empty string', () => {
    expect(ok({ ...nutella, brands: '   ' }).brand).toBeNull();
  });

  it('defaults missing macros to zero but never the energy value', () => {
    const food = ok({
      product_name: 'Sparse entry',
      nutriments: { 'energy-kcal_100g': 100 },
    });
    expect(food.protein_100g).toBe(0);
    expect(food.carbs_100g).toBe(0);
    expect(food.fat_100g).toBe(0);
    // Absent optional fields stay null, so "unknown" is not stored as "zero".
    expect(food.fiber_100g).toBeNull();
    expect(food.sodium_mg_100g).toBeNull();
  });
});

describe('toFoodPayload - rejections', () => {
  const reject = (product: OffProduct): string => {
    const result = toFoodPayload(product);
    if (result.ok) throw new Error('expected rejection');
    return result.reason;
  };

  it('rejects a product with no name', () => {
    expect(reject({ nutriments: { 'energy-kcal_100g': 100 } })).toContain('no name');
  });

  it('rejects a whitespace-only name', () => {
    expect(reject({ product_name: '   ', nutriments: { 'energy-kcal_100g': 100 } })).toContain(
      'no name',
    );
  });

  it('rejects a product with no energy value', () => {
    // Very common in OFF: a barcode and a photo, no nutrition panel yet.
    expect(reject({ product_name: 'Mystery', nutriments: {} })).toContain('no energy');
  });

  it('rejects an implausible energy value', () => {
    expect(
      reject({
        product_name: 'Impossible',
        nutriments: { 'energy-kcal_100g': MAX_PLAUSIBLE_KCAL_100G + 1 },
      }),
    ).toContain('not plausible');
  });

  it('accepts pure fat at exactly the ceiling', () => {
    // 900 is olive oil, which is a real thing to scan.
    expect(
      ok({
        product_name: 'Oil',
        nutriments: { 'energy-kcal_100g': MAX_PLAUSIBLE_KCAL_100G, fat_100g: 100 },
      }).kcal_100g,
    ).toBe(900);
  });

  it('rejects macros that exceed the mass of the food', () => {
    // The signature of a unit mix-up, which is common in crowd-sourced entries.
    expect(
      reject({
        product_name: 'Bad units',
        nutriments: {
          'energy-kcal_100g': 400,
          proteins_100g: 60,
          carbohydrates_100g: 60,
          fat_100g: 60,
        },
      }),
    ).toContain('do not add up');
  });

  it('allows macros up to the tolerance', () => {
    expect(
      ok({
        product_name: 'Dense',
        nutriments: {
          'energy-kcal_100g': 400,
          proteins_100g: MAX_MACRO_MASS_100G,
          carbohydrates_100g: 0,
          fat_100g: 0,
        },
      }).protein_100g,
    ).toBe(MAX_MACRO_MASS_100G);
  });

  it.each([
    ['a string', '539'],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -100],
  ])('rejects an energy value that is %s', (_label, value) => {
    expect(reject({ product_name: 'Odd', nutriments: { 'energy-kcal_100g': value } })).toContain(
      'no energy',
    );
  });

  it('survives allergens_tags being the wrong type', () => {
    // OFF has returned a string here rather than an array. Crashing on it would
    // fail a scan over a field we barely need.
    const food = ok({ ...nutella, allergens_tags: 'en:milk' });
    expect(food.allergenIds).toEqual([]);
  });
});

describe('isValidBarcode', () => {
  it.each([
    ['EAN-13', '3017624010701', true],
    ['EAN-8', '96385074', true],
    ['UPC-A', '012345678905', true],
    ['too short', '12345', false],
    ['too long', '123456789012345', false],
    ['letters', '30176240107a1', false],
    ['empty', '', false],
    ['spaces trimmed', '  3017624010701  ', true],
  ])('%s', (_label, input, expected) => {
    expect(isValidBarcode(input)).toBe(expected);
  });
});
