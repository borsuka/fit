import { describe, expect, it } from '@jest/globals';

import {
  confidenceBand,
  extractJsonObject,
  isPreselected,
  MAX_ITEMS,
  parseFoodAnalysis,
  sanitise,
  type FoodAnalysisItem,
} from './foodAnalysis';

// Typed rather than inferred: a bare object literal widens the enum fields to
// `string`, which jest happily runs and tsc rightly refuses.
const validItem: FoodAnalysisItem = {
  label: 'Grilled chicken breast',
  normalized_query: 'chicken breast',
  estimated_grams: 150,
  portion_basis: 'reference_object',
  confidence: 0.91,
  preparation: 'grilled',
};

const validResponse = {
  prompt_version: 'food-analysis-v1',
  is_food: true,
  items: [validItem],
};

const json = (value: unknown): string => JSON.stringify(value);

/**
 * This is where untrusted input enters the system, so the cases that matter
 * are the adversarial ones, not the happy path.
 */
describe('extractJsonObject', () => {
  it('returns a bare object unchanged', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('pulls the object out of surrounding prose', () => {
    // Models do this even when told not to, and discarding a correct answer
    // over a "Here you go:" preamble wastes a call the user waited for.
    expect(extractJsonObject('Here you go:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  it('pulls the object out of a fenced code block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('keeps nested objects whole', () => {
    // A regex for the first { to the first } would truncate here.
    expect(extractJsonObject('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });

  it('ignores braces inside string values', () => {
    // A food genuinely named "Rice {special}" must not throw off the depth
    // count and truncate the object.
    const input = '{"label":"Rice {special}","n":1}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it('ignores an escaped quote inside a string', () => {
    const input = '{"label":"say \\"hi\\"","n":1}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull();
  });

  it('returns null for an unterminated object', () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
});

describe('parseFoodAnalysis', () => {
  it('accepts a well-formed response', () => {
    const result = parseFoodAnalysis(json(validResponse));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.label).toBe('Grilled chicken breast');
  });

  it('reports no_json when nothing parseable is present', () => {
    const result = parseFoodAnalysis('Sorry, I cannot see the image.');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('no_json');
  });

  it('reports invalid_json for malformed syntax', () => {
    const result = parseFoodAnalysis('{"prompt_version": "v1", items: [}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalid_json');
  });

  it('rejects a response missing a required field', () => {
    const { is_food: _omitted, ...withoutIsFood } = validResponse;
    const result = parseFoodAnalysis(json(withoutIsFood));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('schema');
    expect(result.failure.detail).toContain('is_food');
  });

  it('rejects an unknown enum value rather than passing it through', () => {
    const result = parseFoodAnalysis(
      json({ ...validResponse, items: [{ ...validItem, preparation: 'sous_vide' }] }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects grams outside the schema bounds', () => {
    expect(
      parseFoodAnalysis(json({ ...validResponse, items: [{ ...validItem, estimated_grams: 0 }] }))
        .ok,
    ).toBe(false);
    expect(
      parseFoodAnalysis(
        json({ ...validResponse, items: [{ ...validItem, estimated_grams: 5000 }] }),
      ).ok,
    ).toBe(false);
  });

  it('rejects a non-finite number', () => {
    // JSON has no NaN literal, but a model can emit 1e999, which parses to
    // Infinity and would propagate silently into a portion.
    const result = parseFoodAnalysis(
      '{"prompt_version":"v1","is_food":true,"items":[{"label":"a","normalized_query":"a","estimated_grams":1e999,"portion_basis":"unknown","confidence":0.5,"preparation":"unknown"}]}',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects more items than the cap allows', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => validItem);
    expect(parseFoodAnalysis(json({ ...validResponse, items: many })).ok).toBe(false);
  });

  it('accepts an empty item list for a photo with no food', () => {
    const result = parseFoodAnalysis(json({ ...validResponse, is_food: false, items: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.is_food).toBe(false);
  });

  it('carries no nutrition field even when the model invents one', () => {
    // The schema is the control. An extra key is stripped by zod rather than
    // reaching anything that computes a total.
    const result = parseFoodAnalysis(
      json({
        ...validResponse,
        items: [{ ...validItem, calories: 734, protein_g: 42 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).not.toHaveProperty('calories');
    expect(result.value.items[0]).not.toHaveProperty('protein_g');
  });
});

describe('sanitise', () => {
  it('trims and lowercases the matching query', () => {
    const cleaned = sanitise({
      prompt_version: 'v1',
      is_food: true,
      items: [{ ...validItem, normalized_query: '  Chicken Breast  ' }],
    });
    expect(cleaned.items[0]?.normalized_query).toBe('chicken breast');
  });

  it('leaves the display label capitalised', () => {
    const cleaned = sanitise({ prompt_version: 'v1', is_food: true, items: [validItem] });
    expect(cleaned.items[0]?.label).toBe('Grilled chicken breast');
  });
});

describe('confidence bands', () => {
  it.each([
    [0.95, 'high'],
    [0.8, 'high'],
    [0.79, 'medium'],
    [0.55, 'medium'],
    [0.54, 'low'],
    [0, 'low'],
  ] as [number, string][])('bands %s as %s', (confidence, expected) => {
    expect(confidenceBand(confidence)).toBe(expected);
  });

  it('does not pre-select a low-confidence item', () => {
    // Low confidence is a question, not an answer. Pre-selecting it is how a
    // wrong guess gets committed by someone tapping through.
    expect(isPreselected(0.9)).toBe(true);
    expect(isPreselected(0.6)).toBe(true);
    expect(isPreselected(0.4)).toBe(false);
  });
});
