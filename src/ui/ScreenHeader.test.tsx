import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScreenHeader, ThemeProvider } from '@/ui';

/**
 * The way out of every pushed screen.
 *
 * The stack runs with `headerShown: false`, so this component is the ONLY exit
 * on web and the only discoverable one on native. The case worth testing is not
 * the happy path - it is a screen reached by `replace`, a reload, or a deep
 * link, where there is nothing to go back to and `router.back()` does nothing
 * at all, silently, leaving the user stuck.
 */

// `mock`-prefixed, because jest.mock's factory is hoisted above these
// declarations and refuses to close over anything else.
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRouterState = { canGoBack: true };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockRouterState.canGoBack,
  }),
}));

const renderHeader = async (props: Parameters<typeof ScreenHeader>[0] = {}) => {
  // Async in RNTL 14: a synchronous call returns a pending promise whose
  // queries all pass vacuously.
  await render(
    <ThemeProvider forced="light">
      <ScreenHeader {...props} />
    </ThemeProvider>,
  );
};

describe('ScreenHeader', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockRouterState.canGoBack = true;
  });

  it('pops the stack when there is somewhere to pop to', async () => {
    mockRouterState.canGoBack = true;
    await renderHeader({ fallbackHref: '/nutrition' });

    fireEvent.press(screen.getByRole('button'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to the fallback when the stack is empty', async () => {
    // A deep link, a reload, or a screen reached by replace. back() would be a
    // no-op here and the user would be trapped on the screen.
    mockRouterState.canGoBack = false;
    await renderHeader({ fallbackHref: '/nutrition' });

    fireEvent.press(screen.getByRole('button'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/nutrition');
  });

  it('falls back to the root when no fallback was given', async () => {
    mockRouterState.canGoBack = false;
    await renderHeader();

    fireEvent.press(screen.getByRole('button'));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('prefers an explicit handler over any navigation', async () => {
    const onBack = jest.fn();
    mockRouterState.canGoBack = true;
    await renderHeader({ onBack, fallbackHref: '/nutrition' });

    fireEvent.press(screen.getByRole('button'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('is reachable by a screen reader without a visible title', async () => {
    await renderHeader();
    // The control carries its own label; a header with no title must still
    // announce as something other than an unnamed button.
    expect(screen.getByRole('button')).toBeTruthy();
    expect(screen.getByLabelText(/back/i)).toBeTruthy();
  });
});
