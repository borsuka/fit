/**
 * Design tokens.
 *
 * The single source of every colour, space and type value in the app. A
 * component that hard-codes `padding: 13` or `#4A90D9` is a component nobody
 * can restyle later, and a screen assembled from twenty such values is one
 * nobody can make look coherent.
 *
 * Spacing is a 4 pt scale. Arbitrary values between steps are how layouts
 * drift out of rhythm one commit at a time.
 */

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type scale. `lineHeight` is set explicitly on every entry: React Native's
 * default leading differs between iOS and Android, and text that reflows
 * differently per platform is the fastest way to a broken layout.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Numerals in rings and stat tiles. Tabular figures stop the digits
   *  jittering as a counter ticks up. */
  metric: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
} as const;

/**
 * Semantic colours, defined per scheme.
 *
 * Named by ROLE, not by hue. `danger` can become amber tomorrow without a
 * find-and-replace across forty files, and `textMuted` survives a rebrand that
 * `grey600` does not.
 *
 * Contrast: every text role against its matching surface meets WCAG AA
 * (4.5:1 for body text, 3:1 for large text). Worth re-checking whenever a
 * value here changes - this app is used in kitchens and gyms, often one-handed
 * and in bad light.
 */
interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly border: string;

  readonly text: string;
  readonly textMuted: string;
  readonly textInverted: string;

  readonly primary: string;
  readonly primaryPressed: string;
  readonly onPrimary: string;

  readonly success: string;
  readonly warning: string;
  readonly danger: string;

  /** Macro accents. Kept distinguishable in the common forms of colour vision
   *  deficiency, and never the ONLY way a macro is identified - every ring and
   *  bar carries a text label too. */
  readonly protein: string;
  readonly carbs: string;
  readonly fat: string;
}

export const lightPalette: Palette = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EFF1F5',
  border: '#DDE1E8',

  text: '#12151C',
  textMuted: '#5C6472',
  textInverted: '#FFFFFF',

  primary: '#1F6FEB',
  primaryPressed: '#1A5DC7',
  onPrimary: '#FFFFFF',

  success: '#1B873F',
  warning: '#B26B00',
  danger: '#C0341D',

  protein: '#4C6EF5',
  carbs: '#F08C00',
  fat: '#9C36B5',
};

export const darkPalette: Palette = {
  background: '#0E1116',
  surface: '#171B22',
  surfaceMuted: '#1F242D',
  border: '#2C333F',

  text: '#F2F4F8',
  textMuted: '#9AA4B4',
  textInverted: '#12151C',

  primary: '#5B9CFF',
  primaryPressed: '#7FB2FF',
  onPrimary: '#0E1116',

  success: '#4CC26B',
  warning: '#E3A008',
  danger: '#F87263',

  protein: '#8FA6FF',
  carbs: '#FFB84D',
  fat: '#D48FE8',
};

export type Theme = {
  readonly colors: Palette;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
  readonly isDark: boolean;
};

export const lightTheme: Theme = {
  colors: lightPalette,
  spacing,
  radius,
  typography,
  isDark: false,
};

export const darkTheme: Theme = {
  colors: darkPalette,
  spacing,
  radius,
  typography,
  isDark: true,
};

/**
 * Minimum touch target, in points. 44 is Apple's guideline and close to
 * Android's 48 dp. Anything smaller is a control that people miss while
 * walking, which is most of when this app is used.
 */
export const MIN_TOUCH_TARGET = 44;
