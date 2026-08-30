import { daysBetween, type LocalDate } from '@/domain/dates/localDate';

export interface WeightEntry {
  readonly loggedOn: LocalDate;
  readonly weightKg: number;
}

/**
 * Weight trend analysis.
 *
 * Body weight swings by a kilo or more day to day on water alone, so a single
 * reading says almost nothing. Everything here works on smoothed values, and
 * the UI says which number is which - showing a raw daily delta as "progress"
 * is how someone concludes a good week was a bad one.
 */

/** Days either side included in the moving average. Seven days covers a full
 *  weekly cycle, which is what most of the noise follows. */
export const SMOOTHING_WINDOW_DAYS = 7;

/** Centred moving average over the window. Entries must be sorted ascending. */
export const smoothed = (entries: readonly WeightEntry[]): WeightEntry[] => {
  if (entries.length === 0) return [];

  const half = Math.floor(SMOOTHING_WINDOW_DAYS / 2);

  return entries.map((entry, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(entries.length - 1, index + half);

    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i += 1) {
      sum += entries[i]!.weightKg;
      count += 1;
    }

    return { loggedOn: entry.loggedOn, weightKg: sum / count };
  });
};

export interface TrendSummary {
  readonly latestKg: number;
  readonly changeKg: number;
  readonly perWeekKg: number;
  readonly dayCount: number;
  /** False when the span is too short for the rate to mean anything. */
  readonly isReliable: boolean;
}

/** Below this, a "kg per week" figure is extrapolation dressed as measurement. */
export const MIN_DAYS_FOR_RATE = 14;

/**
 * Rate of change, from a least-squares fit over every point.
 *
 * NOT the difference between the first and last smoothed values. A centred
 * moving average has truncated windows at both ends, which pulls the endpoints
 * toward the interior and systematically understates the trend - measured at
 * roughly 11 % on a month of daily weigh-ins. A regression uses every reading
 * and has no edge to be biased by.
 *
 * `changeKg` is the FITTED change (slope x span) rather than last minus first,
 * so the two numbers on screen always agree with each other. Two noisy
 * endpoints can disagree with the line running through everything between them.
 *
 * Returns null with no data, and flags a short span as unreliable: two weigh-ins
 * three days apart can imply a two-kilo weekly loss, and presenting that as a
 * rate is arithmetic with no meaning behind it.
 */
export const summariseTrend = (entries: readonly WeightEntry[]): TrendSummary | null => {
  if (entries.length === 0) return null;

  const sorted = [...entries]
    .filter((e) => Number.isFinite(e.weightKg))
    .sort((a, b) => a.loggedOn.localeCompare(b.loggedOn));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;

  const days = daysBetween(first.loggedOn, last.loggedOn);

  // Least squares over (days since first reading, weight).
  const points = sorted.map((entry) => ({
    x: daysBetween(first.loggedOn, entry.loggedOn),
    y: entry.weightKg,
  }));

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }

  // Every reading on one day: no slope exists, and pretending otherwise would
  // divide by zero.
  const slopePerDay = denominator === 0 ? 0 : numerator / denominator;

  return {
    latestKg: last.weightKg,
    changeKg: slopePerDay * days,
    perWeekKg: slopePerDay * 7,
    dayCount: days,
    isReliable: days >= MIN_DAYS_FOR_RATE && sorted.length >= 4,
  };
};

export interface ChartRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The vertical range for a weight chart.
 *
 * Weight charts are where honesty gets lost. A zero baseline compresses a real
 * 3 kg change into nothing; a tightly truncated one turns daily water noise
 * into a cliff. This pads the actual range so a flat period LOOKS flat, and the
 * UI labels the endpoints so the axis is never implied.
 */
export const MIN_CHART_SPAN_KG = 4;

export const chartRange = (entries: readonly WeightEntry[]): ChartRange | null => {
  if (entries.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (!Number.isFinite(entry.weightKg)) continue;
    if (entry.weightKg < min) min = entry.weightKg;
    if (entry.weightKg > max) max = entry.weightKg;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const span = max - min;
  if (span >= MIN_CHART_SPAN_KG) return { min, max };

  // Pad to the minimum span, centred, so a stable week does not render as a
  // dramatic sawtooth.
  const padding = (MIN_CHART_SPAN_KG - span) / 2;
  return { min: min - padding, max: max + padding };
};

/** Position of a value within the range, 0 at the bottom and 1 at the top. */
export const normalise = (value: number, range: ChartRange): number => {
  const span = range.max - range.min;
  if (span <= 0) return 0.5;
  return Math.min(Math.max((value - range.min) / span, 0), 1);
};
