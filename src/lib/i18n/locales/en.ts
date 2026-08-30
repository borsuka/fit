/**
 * English strings. The reference locale: every key exists here first, and the
 * `bg` file is typed against this shape so a missing translation is a
 * typecheck failure rather than a key rendered raw on screen.
 */
const en = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    retry: 'Try again',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    loading: 'Loading…',
  },

  errors: {
    network_unavailable: "You're offline. Check your connection and try again.",
    timeout: 'That took too long. Please try again.',
    unauthorized: 'Please sign in to continue.',
    session_expired: 'Your session expired. Please sign in again.',
    forbidden: "You don't have access to that.",
    not_found: "We couldn't find that.",
    conflict: 'That was already saved.',
    validation_failed: 'Please check the highlighted fields.',
    quota_exceeded: "You've used all your scans for today.",
    premium_required: 'This is a Premium feature.',
    ai_unavailable: "We couldn't analyze your meal. Please try again.",
    ai_invalid_response: "We couldn't read the result. Please try again.",
    not_food: "That doesn't look like a meal. Try another photo?",
    storage_failed: "We couldn't upload your photo. Please try again.",
    server_error: 'Something went wrong on our side. Please try again.',
    unknown: 'Something went wrong. Please try again.',
  },

  nutrition: {
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    fiber: 'Fibre',
    water: 'Water',
    eaten: 'eaten',
    remaining: 'remaining',
    over: 'over',
    // Shown wherever a target is displayed. The number is an estimate from a
    // population formula, and saying so is the honest framing.
    estimateNotice: 'These targets are estimates, not medical advice.',
  },

  adjustments: {
    deficit_capped: 'We limited your deficit to keep this safe.',
    surplus_capped: 'We limited your surplus to keep this safe.',
    calorie_floor_applied: 'We raised your target to a safe minimum.',
    rate_capped: 'We slowed your target rate to keep this safe.',
    protein_clamped: 'We adjusted protein to fit your calorie target.',
    fat_floor_applied: 'We raised fat to a healthy minimum.',
    carbs_floor_applied: 'Your calorie target is too low to meet every minimum.',
  },

  validation: {
    age_below_minimum: 'You must be at least 18 to use this app.',
    age_above_maximum: 'Please enter a valid age.',
    height_out_of_range: 'Please enter a height between 120 and 250 cm.',
    weight_out_of_range: 'Please enter a weight between 30 and 300 kg.',
    target_weight_out_of_range: 'Please enter a target between 30 and 300 kg.',
    target_weight_below_healthy_bmi: 'That target is below a healthy weight for your height.',
    target_weight_wrong_direction: "That target doesn't match your goal.",
    deficit_goal_not_permitted_for_age: 'Weight-loss goals are available from 18.',
    non_finite_input: 'Please enter a number.',
  },
} as const;

export default en;

/**
 * The shape every locale must satisfy: the same keys, but any string value.
 *
 * `typeof en` alone will not do - `as const` makes the English values literal
 * types, so a translation would have to equal the English text to compile.
 * This widens the leaves while keeping the key structure exact, so a missing
 * or misspelled key fails `tsc` instead of rendering raw on someone's screen.
 */
export type Translations = {
  [K in keyof typeof en]: { [P in keyof (typeof en)[K]]: string };
};
