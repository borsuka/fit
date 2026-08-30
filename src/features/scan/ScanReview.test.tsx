import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ConfirmedItem, ScanItemView } from '@/services/ai/scanService';
import { ThemeProvider } from '@/ui';

import { ScanReview } from './ScanReview';

/**
 * The confirmation step encodes the product's safety rules, so those rules are
 * asserted here rather than trusted to survive a refactor. A change that
 * pre-selects a low-confidence guess, or lets an unmatched item into the diary,
 * should fail a test rather than ship.
 */

const item = (patch: Partial<ScanItemView> & { id: string }): ScanItemView => ({
  label: 'Grilled chicken breast',
  normalizedQuery: 'chicken breast',
  estimatedGrams: 150,
  confidence: 0.91,
  portionBasis: 'reference_object',
  matchedFoodId: 'food-1',
  matchedFoodName: 'Chicken breast, skinless, cooked',
  matchScore: 0.95,
  per100g: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  ...patch,
});

/**
 * `render` is ASYNC in React Native Testing Library 14 - it returns a promise
 * and effects do not flush until it resolves. Calling it synchronously returns
 * a pending promise with no query methods, and every assertion against an empty
 * result silently passes. Three tests here did exactly that before this was
 * caught; a test that passes because nothing ran is worse than one that fails.
 */
const renderReview = async (items: ScanItemView[]) => {
  const onSelectionChange = jest.fn<(next: readonly ConfirmedItem[]) => void>();
  await render(
    <ThemeProvider forced="light">
      <ScanReview items={items} onSelectionChange={onSelectionChange} />
    </ThemeProvider>,
  );
  return { onSelectionChange };
};

const lastSelection = (
  mock: jest.Mock<(next: readonly ConfirmedItem[]) => void>,
): readonly ConfirmedItem[] => {
  const calls = mock.mock.calls;
  return calls[calls.length - 1]?.[0] ?? [];
};

describe('ScanReview', () => {
  it('pre-selects a high-confidence matched item', async () => {
    const { onSelectionChange } = await renderReview([item({ id: '1', confidence: 0.91 })]);
    expect(lastSelection(onSelectionChange)).toHaveLength(1);
  });

  it('pre-selects a medium-confidence item', async () => {
    const { onSelectionChange } = await renderReview([item({ id: '1', confidence: 0.6 })]);
    expect(lastSelection(onSelectionChange)).toHaveLength(1);
  });

  it('does NOT pre-select a low-confidence item', async () => {
    // Low confidence is a question, not an answer. Pre-selecting one is how a
    // wrong guess gets committed by someone tapping through a flow.
    const { onSelectionChange } = await renderReview([item({ id: '1', confidence: 0.4 })]);
    expect(lastSelection(onSelectionChange)).toHaveLength(0);
  });

  it('lets the user accept a low-confidence item deliberately', async () => {
    const { onSelectionChange } = await renderReview([
      item({ id: '1', confidence: 0.4, label: 'Mystery sauce' }),
    ]);
    expect(lastSelection(onSelectionChange)).toHaveLength(0);

    await fireEvent.press(screen.getByLabelText('Mystery sauce'));
    expect(lastSelection(onSelectionChange)).toHaveLength(1);
  });

  it('never offers an unmatched item, whatever its confidence', async () => {
    // We have a name but no food, so there is no honest number to log.
    // Attaching the nearest row and calling it dinner is worse than the gap.
    const { onSelectionChange } = await renderReview([
      item({
        id: '1',
        confidence: 0.99,
        matchedFoodId: null,
        matchedFoodName: null,
        per100g: null,
      }),
    ]);
    expect(lastSelection(onSelectionChange)).toHaveLength(0);
  });

  it('does not let a press select an unmatched item', async () => {
    const { onSelectionChange } = await renderReview([
      item({
        id: '1',
        label: 'Unknown sauce',
        matchedFoodId: null,
        matchedFoodName: null,
        per100g: null,
      }),
    ]);

    await fireEvent.press(screen.getByLabelText('Unknown sauce'));
    expect(lastSelection(onSelectionChange)).toHaveLength(0);
  });

  it('marks an unmatched item as disabled for a screen reader', async () => {
    await renderReview([
      item({ id: '1', label: 'Unknown sauce', matchedFoodId: null, per100g: null }),
    ]);
    expect(screen.getByLabelText('Unknown sauce')).toBeDisabled();
  });

  it('reports the grams the user typed, not the model estimate', async () => {
    const { onSelectionChange } = await renderReview([item({ id: '1', estimatedGrams: 150 })]);
    expect(lastSelection(onSelectionChange)[0]?.grams).toBe(150);

    const [amountField] = screen.getAllByDisplayValue('150');
    await fireEvent.changeText(amountField!, '220');

    expect(lastSelection(onSelectionChange)[0]?.grams).toBe(220);
  });

  it('accepts a comma as the decimal separator', async () => {
    // What a Bulgarian keyboard offers. A silent NaN here drops the item.
    const { onSelectionChange } = await renderReview([item({ id: '1' })]);
    const [amountField] = screen.getAllByDisplayValue('150');
    await fireEvent.changeText(amountField!, '182,5');

    expect(lastSelection(onSelectionChange)[0]?.grams).toBe(182.5);
  });

  it('drops an item whose amount is cleared rather than logging zero', async () => {
    const { onSelectionChange } = await renderReview([item({ id: '1' })]);
    const [amountField] = screen.getAllByDisplayValue('150');
    await fireEvent.changeText(amountField!, '');

    expect(lastSelection(onSelectionChange)).toHaveLength(0);
  });

  it('carries the matched food id through, so the diary logs a real food', async () => {
    const { onSelectionChange } = await renderReview([item({ id: '1', matchedFoodId: 'food-42' })]);
    expect(lastSelection(onSelectionChange)[0]?.foodId).toBe('food-42');
  });

  it('handles a mixed plate: two selected, the noise item left out', async () => {
    const { onSelectionChange } = await renderReview([
      item({ id: '1', confidence: 0.91 }),
      item({ id: '2', confidence: 0.84, label: 'White rice' }),
      item({
        id: '3',
        confidence: 0.41,
        label: 'Mystery sauce',
        matchedFoodId: null,
        per100g: null,
      }),
    ]);

    const selection = lastSelection(onSelectionChange);
    expect(selection).toHaveLength(2);
    expect(selection.map((s) => s.scanItemId)).toEqual(['1', '2']);
  });

  it('renders nothing but stays stable with an empty plate', async () => {
    const { onSelectionChange } = await renderReview([]);
    expect(lastSelection(onSelectionChange)).toHaveLength(0);
  });
});
