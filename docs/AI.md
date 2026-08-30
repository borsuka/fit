# AI Subsystem

**Status:** Contract and pipeline specified. Implementation lands in Phase 4.
**Last updated:** 2026-08-30

---

## 1. The rule everything else follows from

> An LLM may **identify** food and **estimate** portions.
> It may never **produce a nutrition value**.

Nutrition comes from `foods` × grams, computed in Postgres and snapshotted onto
`meal_items`. This is not a guideline enforced by prompt wording — prompt wording is not
a control. It is enforced by the shape of the response schema: there is no field in which
a calorie figure could arrive.

The reason is worth being explicit about. A tracker that invents plausible calories is
worse than no tracker, because the user acts on the number and has no way to tell it was
invented. A wrong number is silent in a way a crash never is.

---

## 2. Pipeline

```
Camera
  │  client-side resize: max 1024 px long edge, JPEG q≈0.7, target <300 KB
  ▼
Storage  food-photos/{user_id}/{scan_id}.jpg   (private bucket)
  │
  ▼
POST /functions/v1/analyze-meal { scan_id }
  ├─ verify JWT                          → 401
  ├─ check ai_usage quota + entitlement   → 402, NO vendor call made
  ├─ signed read URL (short-lived)
  ├─ VisionProvider.analyze()
  ├─ tolerant JSON extraction
  ├─ zod validation ──fail──► one repair retry ──fail──► structured error
  ├─ clamp + sanitise
  └─ persist ai_scans + ai_scan_items, increment ai_usage (same transaction)
  │
  ▼
POST /functions/v1/match-foods
  └─ full-text + trigram + food_aliases → ranked candidates per item
  │
  ▼
CLIENT REVIEW  — every item editable: name, portion, remove, add
  │
  ▼
Deterministic nutrition from food_nutrients × grams
  │
  ▼
User confirms  →  meal_items written with an immutable snapshot
```

Nothing reaches the diary without a human tap. That is a product requirement, not a
transitional safety measure while accuracy improves.

---

## 3. The response contract

`shared/ai-contracts/foodAnalysis.ts`, imported by both the app and the Deno edge
functions. One definition, two runtimes — Metro resolves it through the `@shared/*`
tsconfig alias, Deno through an import map mapping `zod` to `npm:zod@4`. Duplicating a
contract across runtimes is how contracts drift.

```ts
export const FoodAnalysisItem = z.object({
  label:            z.string().min(1).max(80),
  normalized_query: z.string().min(1).max(80),
  estimated_grams:  z.number().min(1).max(2000),
  portion_basis:    z.enum(['reference_object', 'plate_ratio', 'typical_serving', 'unknown']),
  confidence:       z.number().min(0).max(1),
  preparation:      z.enum(['raw', 'grilled', 'fried', 'boiled', 'baked', 'unknown']),
});

export const FoodAnalysisResponse = z.object({
  prompt_version: z.literal('food-analysis-v1'),
  is_food:        z.boolean(),
  items:          z.array(FoodAnalysisItem).max(12),
  scene_notes:    z.string().max(300).optional(),
});
```

`portion_basis` exists so we can measure *why* an estimate was wrong. A guess anchored to
a fork in frame and a guess from a typical serving size have different error profiles, and
we cannot improve what we cannot separate.

### Validation, in order

1. Extract JSON (models sometimes wrap it in prose or a code fence).
2. `safeParse` against the schema.
3. On failure: **one** repair attempt, feeding back the parse error. Then fail cleanly.
4. Clamp `estimated_grams` to 1–2000 and `confidence` to 0–1 even after a successful
   parse. Schema bounds and runtime clamping are cheap; trusting either alone is not.
5. Cap items at 12.

Never `JSON.parse` straight into application state. The model output is untrusted input
that happens to arrive from a vendor we pay.

---

## 4. Vendor selection (decision D-1)

The vendor is deferred to a measured bake-off, so the edge function is written against a
narrow interface and everything downstream is vendor-independent:

```ts
interface VisionProvider {
  readonly id: 'anthropic' | 'openai' | 'google';
  analyze(input: { imageUrl: string; prompt: Prompt }): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}
```

Selected by `AI_VISION_PROVIDER`; `ai_scans.provider` and `ai_scans.model` record which
one answered each request. The bake-off runs ~50 real meal photos with known weights and
compares:

| Metric | Why it matters |
|---|---|
| identification accuracy | the baseline capability |
| portion error (mean, p90) | the dominant source of wrong calories |
| schema compliance rate | how often the repair path fires |
| latency p50 / p95 | the user is standing over their food |
| cost per scan | decides whether a free tier is viable at all |

Because `ai_scan_items` stores the model estimate **and** the user's correction, this
evaluation keeps running in production rather than ending at launch.

---

## 5. Prompts are versioned artefacts

`supabase/functions/_shared/prompts/food-analysis/v1.ts`:

```ts
export const foodAnalysisV1 = {
  id: 'food-analysis',
  version: 'v1',
  system: '...',
  buildUser: (ctx: PromptContext) => '...',
  outputSchema: FoodAnalysisResponse,
} as const;
```

The active version id is written onto every `ai_scans` row, so when v2 changes behaviour
we can compare accuracy across versions on real historical data rather than on
recollection. Prompts never live inside React components.

---

## 6. Confidence and portions in the UI

Identification and quantification are different problems with very different accuracy.
Recognising rice in a photo is largely solved. Inferring that it is 180 g of rice from a
single uncalibrated monocular image is not — there is no scale reference, no depth, and
density varies with preparation. The interface must not imply a precision the method does
not have.

| Band | Confidence | Presentation |
|---|---|---|
| High | ≥ 0.80 | pre-selected, portion editable |
| Medium | 0.55–0.79 | pre-selected, portion highlighted for review |
| Low | < 0.55 | **not** pre-selected; shown as a question |

- Low-confidence copy: *"We're not completely sure what this is — tap to correct."*
- Portions are offered as household measures (small / medium / large, ½ / 1 / 1½ cups,
  100 / 150 / 200 / 250 g, custom), not as a single false-precision number.
- Progress shows real stages — uploading, analyzing, matching — never a fabricated
  percentage. We do not know how far along a vendor call is, and pretending we do is a
  small lie that trains users to distrust the larger numbers.

---

## 7. Food matching

The model returns `normalized_query`; the matcher turns that into candidates:

1. `food_aliases` exact match on `(alias, locale)` — curated, highest precision
2. full-text search over `foods.search_vector`
3. trigram similarity on `foods.name`, threshold ~0.3
4. rank by `data_quality`, source priority (`curated` > `usda` > `off` > `user`), and
   whether the user has logged it before

Chosen over embeddings deliberately: this is deterministic, debuggable, and fixable by
inserting an alias row when it gets something wrong. `pgvector` remains available if
recall proves insufficient, but it is a harder thing to reason about when a user reports
that their lunch matched the wrong food.

No match is not an error. The item stays, and the user gets search plus "create a custom
food".

---

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| Invalid JSON | one repair retry, then a structured error |
| Schema violation | same |
| `is_food: false` | "That doesn't look like a meal — try again?" — a distinct path, not an error |
| Vendor timeout / 5xx | one retry with backoff, then offer manual entry |
| No DB match for an item | keep the item, offer search and custom-food creation |
| Quota exceeded | upgrade screen; **no vendor call is made** |
| Upload failed | retry the upload, not the analysis |

Users see plain language. `500 INTERNAL_SERVER_ERROR` is a log entry, not a message.

---

## 9. Cost and abuse control

- Quota checked and incremented inside the edge function, in the same transaction as the
  scan record, **before** any vendor call. Client-side counting is not a quota.
- `ai_usage` is `SELECT`-only for the owner and `service_role`-write. A self-writable
  quota is not a quota.
- `ai_scan_items` has no client `INSERT` policy — a client that could forge scan items
  could forge the accuracy record we intend to measure prompt versions with.
- `image_hash` enables a response cache, so a retried upload does not bill twice.
- Images downscaled client-side before upload; the bucket enforces a 5 MB ceiling and a
  MIME allow-list.
- Per-scan cost recorded on every row, so unit economics are observable from day one
  rather than discovered on an invoice.

---

## 10. Prompt injection

A photographed menu, packet or handwritten note can carry text aimed at the model. The
mitigation is structural rather than instructional:

- The schema admits no nutrition values, so the worst outcome is a wrong food name or
  gram figure — not fabricated calories.
- Output is validated, clamped and capped after parsing.
- Model output never reaches a SQL string; matching uses parameterised queries.
- The model sees one image and a fixed prompt. It has no access to other users' data, no
  tools, and no write path.
- Every item is confirmed by a human before anything is stored.

**Allergen exclusion in meal planning is a hard SQL filter, never a prompt instruction.**
An allergen miss is a safety incident, and a prompt is not a safety control.

---

## 11. Where the LLM is genuinely useful

Not as a calculator. As language:

| Use | Constraint |
|---|---|
| meal descriptions and explanations | cosmetic; no numbers |
| substitution *suggestions* | re-filtered against allergens and re-costed from the DB before display |
| coaching replies | reads the user's own logged data; gives no medical advice |
| natural-language food entry ("two eggs and toast") | parsed to items, then matched and confirmed like a scan |

In every case the LLM proposes and the database disposes.

---

## 12. Testing

Covered in [TESTING.md](./TESTING.md) section 4. The cases that matter most are the
adversarial ones: prose-wrapped JSON, schema violations, out-of-range grams, thirteen
items, `is_food: false`, vendor timeout, and quota exceeded — the last verifying that **no
vendor call is made at all**, which is a cost test as much as a correctness test.

Bake-off evaluation runs against a fixture set of photos with known weights, checked into
`supabase/tests/fixtures/` with their ground truth. E2E runs against a stubbed response:
asserting on live model output would make the suite non-deterministic and bill us for
every CI run.
