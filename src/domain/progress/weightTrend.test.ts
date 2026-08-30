import { describe, expect, it } from '@jest/globals';

import {
  chartRange,
  MIN_CHART_SPAN_KG,
  MIN_DAYS_FOR_RATE,
  normalise,
  smoothed,
  summariseTrend,
  type WeightEntry,
} from './weightTrend';

const entry = (loggedOn: string, weightKg: number): WeightEntry => ({ loggedOn, weightKg });

/** A month of daily weigh-ins losing ~0.1 kg/day with a 0.6 kg sawtooth on top,
 *  which is roughly what real water fluctuation looks like. */
const month: WeightEntry[] = Array.from({ length: 28 }, (_, i) => {
  const day = String(i + 1).padStart(2, '0');
  return entry(`2026-09-${day}`, 80 - i * 0.1 + (i % 2 === 0 ? 0.3 : -0.3));
});

describe('smoothed', () => {
  it('returns nothing for no entries', () => {
    expect(smoothed([])).toEqual([]);
  });

  it('flattens day-to-day noise', () => {
    // Body weight swings by a kilo on water alone. A raw daily delta presented
    // as progress is how someone concludes a good week was a bad one.
    const raw = month.map((e) => e.weightKg);
    const smooth = smoothed(month).map((e) => e.weightKg);

    const swing = (values: number[]): number => {
      let total = 0;
      for (let i = 1; i < values.length; i += 1) total += Math.abs(values[i]! - values[i - 1]!);
      return total;
    };

    expect(swing(smooth)).toBeLessThan(swing(raw) / 2);
  });

  it('keeps the same number of points and the same dates', () => {
    const smooth = smoothed(month);
    expect(smooth).toHaveLength(month.length);
    expect(smooth[0]?.loggedOn).toBe(month[0]?.loggedOn);
  });

  it('handles a single entry without dividing by zero', () => {
    expect(smoothed([entry('2026-09-01', 80)])[0]?.weightKg).toBe(80);
  });
});

describe('summariseTrend', () => {
  it('returns null with no data', () => {
    expect(summariseTrend([])).toBeNull();
  });

  it('reports the direction and rate over a month', () => {
    // The fixture loses 0.1 kg/day, so 0.7 kg/week. A regression recovers that;
    // differencing the smoothed endpoints returns -0.62, understating by 11%
    // because a centred average is truncated at both ends.
    const summary = summariseTrend(month);
    expect(summary).not.toBeNull();
    expect(summary!.changeKg).toBeLessThan(0);
    expect(summary!.perWeekKg).toBeCloseTo(-0.7, 1);
    expect(summary!.isReliable).toBe(true);
  });

  it('is not thrown off by a single outlier reading', () => {
    // One heavy day after a salty meal must not flip a month of progress.
    const withOutlier = [...month, entry('2026-09-29', 84)];
    expect(summariseTrend(withOutlier)!.perWeekKg).toBeLessThan(0);
  });

  it('reports the latest RAW weight, not the smoothed one', () => {
    // "What do I weigh" has one honest answer: what the scale said.
    const summary = summariseTrend(month);
    expect(summary!.latestKg).toBe(month[month.length - 1]!.weightKg);
  });

  it('flags a short span as unreliable', () => {
    // Two weigh-ins three days apart can imply a two-kilo weekly loss.
    // Presenting that as a rate is arithmetic with no meaning behind it.
    const short = [entry('2026-09-01', 80), entry('2026-09-04', 79)];
    const summary = summariseTrend(short);
    expect(summary!.isReliable).toBe(false);
    expect(summary!.dayCount).toBeLessThan(MIN_DAYS_FOR_RATE);
  });

  it('flags too few entries as unreliable even over a long span', () => {
    const sparse = [entry('2026-09-01', 80), entry('2026-10-01', 78)];
    expect(summariseTrend(sparse)!.isReliable).toBe(false);
  });

  it('sorts unordered input rather than reporting a backwards trend', () => {
    const shuffled = [...month].reverse();
    expect(summariseTrend(shuffled)!.changeKg).toBeLessThan(0);
  });

  it('does not divide by zero for entries all on one day', () => {
    const sameDay = [entry('2026-09-01', 80), entry('2026-09-01', 80.5)];
    expect(summariseTrend(sameDay)!.perWeekKg).toBe(0);
  });
});

describe('chartRange', () => {
  it('returns null with no entries', () => {
    expect(chartRange([])).toBeNull();
  });

  it('uses the real range when the change is large enough to see', () => {
    const range = chartRange([entry('a', 75), entry('b', 82)])!;
    expect(range.min).toBe(75);
    expect(range.max).toBe(82);
  });

  it('pads a small range so a flat period looks flat', () => {
    // Tightly truncated, 300 g of water noise renders as a cliff.
    const range = chartRange([entry('a', 80), entry('b', 80.3)])!;
    expect(range.max - range.min).toBeCloseTo(MIN_CHART_SPAN_KG, 6);
    // Centred on the data.
    expect((range.min + range.max) / 2).toBeCloseTo(80.15, 6);
  });

  it('pads a single point rather than collapsing to a line', () => {
    const range = chartRange([entry('a', 80)])!;
    expect(range.max - range.min).toBeCloseTo(MIN_CHART_SPAN_KG, 6);
  });

  it('ignores non-finite values', () => {
    const range = chartRange([entry('a', 80), entry('b', Number.NaN), entry('c', 84)])!;
    expect(range.min).toBe(80);
    expect(range.max).toBe(84);
  });
});

describe('normalise', () => {
  it('maps the range endpoints to 0 and 1', () => {
    const range = { min: 75, max: 85 };
    expect(normalise(75, range)).toBe(0);
    expect(normalise(85, range)).toBe(1);
    expect(normalise(80, range)).toBe(0.5);
  });

  it('clamps outside the range instead of overflowing the chart', () => {
    const range = { min: 75, max: 85 };
    expect(normalise(70, range)).toBe(0);
    expect(normalise(90, range)).toBe(1);
  });

  it('centres a zero-width range rather than dividing by zero', () => {
    expect(normalise(80, { min: 80, max: 80 })).toBe(0.5);
  });
});
