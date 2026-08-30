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

  auth: {
    signInTitle: 'Welcome back',
    signUpTitle: 'Create your account',
    email: 'Email',
    password: 'Password',
    emailPlaceholder: 'you@example.com',
    passwordHelper: 'At least 10 characters.',
    signIn: 'Sign in',
    signUp: 'Create account',
    noAccount: 'New here? Create an account',
    haveAccount: 'Already have an account? Sign in',
    forgotPassword: 'Forgot your password?',
    resetSent: 'If that email is registered, we sent a reset link.',
    checkInbox: 'Check your inbox to confirm your email address.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'That does not look like an email address.',
    passwordTooShort: 'Use at least 10 characters.',
  },

  onboarding: {
    intro: "Let's set up your targets",
    introBody: 'A few details let us estimate what you need. You can change any of it later.',
    aboutYou: 'About you',
    dateOfBirth: 'Date of birth',
    dateOfBirthHelper: 'Used for your energy estimate. You must be 18 or over.',
    sex: 'Sex at birth',
    sexHelper: 'Used only by the metabolic formula.',
    male: 'Male',
    female: 'Female',
    height: 'Height',
    weight: 'Current weight',
    activity: 'How active are you?',
    activity_sedentary: 'Sedentary',
    activity_sedentaryHint: 'Desk job, little deliberate movement',
    activity_light: 'Lightly active',
    activity_lightHint: 'Light exercise 1-3 days a week',
    activity_moderate: 'Moderately active',
    activity_moderateHint: 'Moderate exercise 3-5 days a week',
    activity_very: 'Very active',
    activity_veryHint: 'Hard exercise 6-7 days a week',
    activity_extra: 'Extremely active',
    activity_extraHint: 'Physical job or training twice a day',
    goal: "What's your goal?",
    goal_lose: 'Lose weight',
    goal_maintain: 'Maintain',
    goal_gain: 'Gain weight',
    goal_muscle_gain: 'Build muscle',
    targetWeight: 'Target weight',
    targetWeightOptional: 'Optional',
    yourTargets: 'Your daily targets',
    weWillAdjust: "We'll refine these as you log your weight.",
    finish: 'Start tracking',
  },

  portion: {
    quantity: 'Quantity',
    amount: 'Amount',
    grams: 'grams',
    enterAmount: 'Enter an amount greater than zero.',
    searchPlaceholder: 'Search foods',
    recent: 'Recent',
    noResults: 'No foods matched. Try a different word.',
    typeToSearch: 'Type at least two letters to search.',
    addTo: 'Add to {{meal}}',
    added: 'Added',
  },

  scan: {
    title: 'What did you eat?',
    takePhoto: 'Take a photo',
    retake: 'Retake',
    analyzing: 'Analyzing your meal…',
    uploading: 'Uploading…',
    matching: 'Matching foods…',
    reviewTitle: 'Check before adding',
    reviewBody: 'Estimates from a photo are rough. Correct anything that looks wrong.',
    confidence_high: 'Confident',
    confidence_medium: 'Fairly sure',
    confidence_low: "We're not completely sure what this is",
    lowConfidenceHint: 'Tap to correct, or leave it out.',
    noMatch: "We couldn't find this in the food database",
    unmatchedHint: 'Search for this food instead',
    estimateHint: 'Estimated from the photo. Adjust if you know better.',
    addSelected: 'Add to diary',
    permissionTitle: 'Camera access needed',
    permissionBody:
      'We need the camera to photograph your meal. Nothing is uploaded until you take a photo.',
    grantPermission: 'Allow camera',
    nothingSelected: 'Nothing selected yet.',
  },

  mealplan: {
    title: 'Meal plan',
    body: 'Built from your targets and the recipes that fit your restrictions.',
    generate: 'Build a plan',
    regenerate: 'Build another',
    empty: 'No plan yet.',
    saved: 'Plan saved.',
    planName: 'Daily plan',
    dayTotal: 'Day total',
    versusTarget: '{{diff}} kcal against a {{target}} kcal target',
  },

  workouts: {
    title: 'Workouts',
    start: 'Start a workout',
    go: 'Start logging',
    defaultName: 'Workout',
    pickExercises: 'Pick exercises ({{count}} added)',
    history: 'Recent',
    noHistory: 'No workouts logged yet.',
    noExercises: 'No exercises in this session yet.',
    noSets: 'No sets logged yet.',
    logSet: 'Log',
    weight: 'Weight',
    reps: 'Reps',
    warmup: 'warm-up',
    volume: 'Volume',
    estimated1rm: 'est. 1RM',
    finish: 'Finish workout',
    finished: 'Workout finished.',
    advice_add_weight: 'Last time you hit every set — try {{weight}} kg x {{reps}}.',
    advice_add_reps: 'Aim for {{reps}} reps at {{weight}} kg before adding weight.',
    advice_hold: 'Finish all your sets at {{weight}} kg this time.',
    advice_deload: 'Stalled for a while — drop to {{weight}} kg and build back up.',
  },

  progress: {
    title: 'Progress',
    todayWeight: "Today's weight",
    current: 'Current weight',
    trend: 'Trend',
    smoothed: '7-day average',
    noData: 'Log your weight to start tracking progress.',
    rate: '{{rate}} kg per week over {{days}} days',
    needMoreData: 'Keep logging — a weekly rate needs about {{days}} days to mean anything.',
    chartLabel: 'Weight from {{from}} to {{to}} kilograms over {{days}} days',
  },

  profile: {
    title: 'Profile',
    account: 'Account',
    noName: 'No name set',
    currentGoal: 'Current goal',
    language: 'Language',
    yourData: 'Your data',
    dataBody:
      'You can take your data with you or remove it entirely. Deletion removes your meals, weights, workouts and photos, and cannot be undone.',
    exportData: 'Export my data',
    exportQueued: "Requested. We'll email you when it's ready.",
    deleteAccount: 'Delete my account',
    deleteTitle: 'Delete your account?',
    deleteBody:
      'This removes your meals, weights, workouts and photos permanently. This cannot be undone.',
    deleteConfirm: 'Delete everything',
    signOut: 'Sign out',
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
