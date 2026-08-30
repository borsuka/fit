/**
 * The contract between the vision model and everything downstream.
 *
 * Imported by BOTH the React Native app and the Deno edge functions. One
 * definition, two runtimes - duplicating a contract across runtimes is how
 * contracts drift.
 *
 * NOTE WHAT IS ABSENT: there is no field here in which a calorie, a macro, or
 * any nutrition value could arrive. Nutrition comes from `foods` x grams,
 * computed in Postgres and snapshotted onto meal_items. That makes hallucinated
 * nutrition structurally impossible rather than merely discouraged - a prompt
 * asking a model not to invent numbers is not a control.
 *
 * ---------------------------------------------------------------------------
 * Why this file has NO dependencies, not even zod
 * ---------------------------------------------------------------------------
 * It sits outside `supabase/functions/`, so the Supabase edge runtime does not
 * apply the function import map to it, and a bare `zod` specifier fails to
 * resolve at worker boot. Metro, meanwhile, rejects the explicit `.ts`
 * extension Deno needs. Verified both, not assumed.
 *
 * The options were: move the contract inside the functions tree and fight
 * tsconfig to let the app import it, duplicate it per runtime, or drop the
 * dependency. Dropping it is the only one that leaves a single definition with
 * no build configuration holding it together. The validation below is longer
 * than a zod schema and does the same work, and the tests assert behaviour
 * rather than the library, so they carried over unchanged.
 *
 * zod is still used everywhere inside the app, where resolution is not in
 * question.
 */

export const PORTION_BASIS = [
  'reference_object', // scaled against a fork, hand, or standard plate in frame
  'plate_ratio', // judged as a fraction of a plate of assumed size
  'typical_serving', // nothing gave scale; fell back to a common portion
  'unknown',
] as const;

export const PREPARATION = ['raw', 'grilled', 'fried', 'boiled', 'baked', 'unknown'] as const;

export type PortionBasis = (typeof PORTION_BASIS)[number];
export type Preparation = (typeof PREPARATION)[number];

/** Bounds are enforced twice: rejected here, clamped after parsing. Trusting
 *  either alone is a choice between losing a usable answer and accepting an
 *  absurd one. */
export const MIN_GRAMS = 1;
export const MAX_GRAMS = 2000;
export const MAX_ITEMS = 12;
export const MAX_LABEL = 80;
export const MAX_SCENE_NOTES = 300;

export interface FoodAnalysisItem {
  /** What to show the user, in their own language. */
  readonly label: string;
  /** Normalised for database matching: lowercase, no brand. */
  readonly normalized_query: string;
  readonly estimated_grams: number;
  /**
   * Why the estimate is what it is. Kept because a guess anchored to a fork in
   * frame and a guess from a typical serving have different error profiles,
   * and we cannot improve what we cannot separate.
   */
  readonly portion_basis: PortionBasis;
  readonly confidence: number;
  readonly preparation: Preparation;
}

export interface FoodAnalysisResponse {
  readonly prompt_version: string;
  readonly is_food: boolean;
  readonly items: readonly FoodAnalysisItem[];
  readonly scene_notes?: string;
}

// ============================================================================
// Confidence
// ============================================================================

/**
 * Identification and quantification are different problems with very different
 * accuracy. Recognising rice in a photo is largely solved; inferring that it is
 * 180 g of rice from one uncalibrated monocular image is not. These bands exist
 * so the interface never implies a precision the method does not have.
 */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.55;

export type ConfidenceBand = 'high' | 'medium' | 'low';

export const confidenceBand = (confidence: number): ConfidenceBand =>
  confidence >= CONFIDENCE_HIGH ? 'high' : confidence >= CONFIDENCE_MEDIUM ? 'medium' : 'low';

/** Low-confidence items are never pre-selected. They are presented as
 *  questions, because that is what they are. */
export const isPreselected = (confidence: number): boolean => confidenceBand(confidence) !== 'low';

// ============================================================================
// Validation
// ============================================================================

interface Issue {
  readonly path: string;
  readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (
  source: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  issues: Issue[],
): string | null => {
  const value = source[key];
  if (typeof value !== 'string') {
    issues.push({ path, message: 'expected a string' });
    return null;
  }
  if (value.length === 0) {
    issues.push({ path, message: 'must not be empty' });
    return null;
  }
  if (value.length > maxLength) {
    issues.push({ path, message: `must be at most ${maxLength} characters` });
    return null;
  }
  return value;
};

const readNumber = (
  source: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  issues: Issue[],
): number | null => {
  const value = source[key];
  if (typeof value !== 'number') {
    issues.push({ path, message: 'expected a number' });
    return null;
  }
  // Number.isFinite rejects NaN and both infinities. JSON has no NaN literal,
  // but 1e999 parses to Infinity and would otherwise propagate into a portion.
  if (!Number.isFinite(value)) {
    issues.push({ path, message: 'must be a finite number' });
    return null;
  }
  if (value < min || value > max) {
    issues.push({ path, message: `must be between ${min} and ${max}` });
    return null;
  }
  return value;
};

const readEnum = <T extends string>(
  source: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
  issues: Issue[],
): T | null => {
  const value = source[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    issues.push({ path, message: `must be one of: ${allowed.join(', ')}` });
    return null;
  }
  return value as T;
};

const validateItem = (raw: unknown, index: number, issues: Issue[]): FoodAnalysisItem | null => {
  const path = `items.${index}`;
  if (!isRecord(raw)) {
    issues.push({ path, message: 'expected an object' });
    return null;
  }

  const label = readString(raw, 'label', `${path}.label`, MAX_LABEL, issues);
  const normalizedQuery = readString(
    raw,
    'normalized_query',
    `${path}.normalized_query`,
    MAX_LABEL,
    issues,
  );
  const grams = readNumber(
    raw,
    'estimated_grams',
    `${path}.estimated_grams`,
    MIN_GRAMS,
    MAX_GRAMS,
    issues,
  );
  const portionBasis = readEnum(
    raw,
    'portion_basis',
    `${path}.portion_basis`,
    PORTION_BASIS,
    issues,
  );
  const confidence = readNumber(raw, 'confidence', `${path}.confidence`, 0, 1, issues);
  const preparation = readEnum(raw, 'preparation', `${path}.preparation`, PREPARATION, issues);

  if (
    label === null ||
    normalizedQuery === null ||
    grams === null ||
    portionBasis === null ||
    confidence === null ||
    preparation === null
  ) {
    return null;
  }

  // Built field by field rather than spread from `raw`. An extra key the model
  // invented - "calories": 734 - is dropped here rather than riding along into
  // anything that computes a total.
  return {
    label,
    normalized_query: normalizedQuery,
    estimated_grams: grams,
    portion_basis: portionBasis,
    confidence,
    preparation,
  };
};

export type ValidationResult =
  | { readonly ok: true; readonly value: FoodAnalysisResponse }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export const validateFoodAnalysis = (raw: unknown): ValidationResult => {
  const issues: Issue[] = [];

  if (!isRecord(raw)) {
    return { ok: false, issues: [{ path: '', message: 'expected an object' }] };
  }

  const promptVersion = readString(raw, 'prompt_version', 'prompt_version', 40, issues);

  const isFoodRaw = raw['is_food'];
  if (typeof isFoodRaw !== 'boolean') {
    issues.push({ path: 'is_food', message: 'expected a boolean' });
  }

  const itemsRaw = raw['items'];
  const items: FoodAnalysisItem[] = [];

  if (!Array.isArray(itemsRaw)) {
    issues.push({ path: 'items', message: 'expected an array' });
  } else if (itemsRaw.length > MAX_ITEMS) {
    issues.push({ path: 'items', message: `must contain at most ${MAX_ITEMS} items` });
  } else {
    itemsRaw.forEach((item, index) => {
      const validated = validateItem(item, index, issues);
      if (validated !== null) items.push(validated);
    });
  }

  let sceneNotes: string | undefined;
  const sceneRaw = raw['scene_notes'];
  if (sceneRaw !== undefined && sceneRaw !== null) {
    if (typeof sceneRaw !== 'string') {
      issues.push({ path: 'scene_notes', message: 'expected a string' });
    } else if (sceneRaw.length > MAX_SCENE_NOTES) {
      issues.push({
        path: 'scene_notes',
        message: `must be at most ${MAX_SCENE_NOTES} characters`,
      });
    } else {
      sceneNotes = sceneRaw;
    }
  }

  if (issues.length > 0 || promptVersion === null || typeof isFoodRaw !== 'boolean') {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      prompt_version: promptVersion,
      is_food: isFoodRaw,
      items,
      ...(sceneNotes === undefined ? {} : { scene_notes: sceneNotes }),
    },
  };
};

// ============================================================================
// Parsing
// ============================================================================

export type ParseFailure =
  | { readonly kind: 'no_json'; readonly detail: string }
  | { readonly kind: 'invalid_json'; readonly detail: string }
  | { readonly kind: 'schema'; readonly detail: string };

export type ParseResult =
  | { readonly ok: true; readonly value: FoodAnalysisResponse }
  | { readonly ok: false; readonly failure: ParseFailure };

/**
 * Pulls the JSON object out of a response that may be wrapped in prose or a
 * fenced code block. Models do this even when told not to, and discarding an
 * otherwise-correct answer over a "Here you go:" preamble wastes a call the
 * user waited for.
 *
 * Scans for balanced braces rather than regex-matching, so a nested object
 * cannot truncate the match. String literals are tracked so a brace inside a
 * food name does not throw off the depth count.
 */
export const extractJsonObject = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
};

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

/**
 * Clamps values validation already bounded.
 *
 * Redundant by design. Validation rejects; this repairs. A model returning
 * 2001 g of rice made a small error, and failing the whole scan over it costs
 * the user their photo - but 50000 g must not reach a diary either.
 */
export const sanitise = (response: FoodAnalysisResponse): FoodAnalysisResponse => ({
  ...response,
  items: response.items.slice(0, MAX_ITEMS).map((item) => ({
    ...item,
    label: item.label.trim(),
    normalized_query: item.normalized_query.trim().toLowerCase(),
    estimated_grams: clamp(item.estimated_grams, MIN_GRAMS, MAX_GRAMS),
    confidence: clamp(item.confidence, 0, 1),
  })),
});

export const parseFoodAnalysis = (raw: string): ParseResult => {
  const json = extractJsonObject(raw);
  if (json === null) {
    return { ok: false, failure: { kind: 'no_json', detail: 'no JSON object in the response' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      failure: { kind: 'invalid_json', detail: e instanceof Error ? e.message : 'parse error' },
    };
  }

  const result = validateFoodAnalysis(parsed);
  if (!result.ok) {
    return {
      ok: false,
      failure: {
        kind: 'schema',
        detail: result.issues
          .slice(0, 5)
          .map((i) => `${i.path}: ${i.message}`)
          .join('; '),
      },
    };
  }

  return { ok: true, value: sanitise(result.value) };
};
