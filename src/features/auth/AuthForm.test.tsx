import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui';

import { AuthForm, type AuthFormValues } from './AuthForm';

const renderForm = async (
  mode: 'signIn' | 'signUp' = 'signIn',
  props: { submitting?: boolean; errorMessage?: string } = {},
) => {
  const onSubmit = jest.fn<(values: AuthFormValues) => void>();
  await render(
    <ThemeProvider forced="light">
      <AuthForm
        mode={mode}
        submitting={props.submitting ?? false}
        errorMessage={props.errorMessage}
        onSubmit={onSubmit}
      />
    </ThemeProvider>,
  );
  return { onSubmit };
};

const fill = async (email: string, password: string): Promise<void> => {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
};

describe('AuthForm', () => {
  it('submits valid credentials', async () => {
    const { onSubmit } = await renderForm();
    await fill('someone@example.com', 'a-long-enough-passphrase');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'someone@example.com',
      password: 'a-long-enough-passphrase',
    });
  });

  it('shows no errors before the first submit', async () => {
    // Validating on every keystroke turns the field red halfway through an
    // address someone is still typing, which reads as failure rather than
    // progress.
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'x');

    expect(screen.queryByText('That does not look like an email address.')).toBeNull();
  });

  it('reports a malformed email once submitted', async () => {
    const { onSubmit } = await renderForm();
    await fill('not-an-email', 'a-long-enough-passphrase');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    expect(screen.getByText('That does not look like an email address.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports an empty email distinctly from a malformed one', async () => {
    // "Enter your email" and "that is not an email" are different problems and
    // need different fixes.
    await renderForm();
    await fill('', 'a-long-enough-passphrase');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    expect(screen.getByText('Enter your email address.')).toBeTruthy();
  });

  it('rejects a password below the minimum length', async () => {
    const { onSubmit } = await renderForm('signUp');
    await fill('someone@example.com', 'short');
    await fireEvent.press(screen.getByLabelText('Create account'));

    expect(screen.getByText('Use at least 10 characters.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts an address with a plus tag', async () => {
    // A pattern that rejects these turns away real addresses. The only
    // authority on whether an email works is whether the mail arrives.
    const { onSubmit } = await renderForm();
    await fill('someone+fit@example.co.uk', 'a-long-enough-passphrase');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('renders a server error where it can be read', async () => {
    await renderForm('signIn', { errorMessage: 'Please sign in to continue.' });
    expect(screen.getByText('Please sign in to continue.')).toBeTruthy();
  });

  it('disables the fields and the button while submitting', async () => {
    // Without this a double tap submits twice.
    await renderForm('signIn', { submitting: true });
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Sign in')).toBeDisabled();
  });

  it('announces the button as busy while submitting, not merely disabled', async () => {
    // A screen reader must be able to tell "working" from "broken".
    await renderForm('signIn', { submitting: true });
    // toBeBusy, not the removed toHaveAccessibilityState: RNTL 14 replaced the
    // state-bag matcher with per-state ones.
    expect(screen.getByLabelText('Sign in')).toBeBusy();
  });

  it('labels the sign-up button differently from sign-in', async () => {
    await renderForm('signUp');
    expect(screen.getByLabelText('Create account')).toBeTruthy();
    expect(screen.queryByLabelText('Sign in')).toBeNull();
  });

  it('shows the password requirement on sign-up only', async () => {
    await renderForm('signUp');
    expect(screen.getByText('At least 10 characters.')).toBeTruthy();
  });

  it('does not nag about password length on sign-in', async () => {
    // An existing password is whatever it is; telling someone it is too short
    // when they are trying to get back in is unhelpful and alarming.
    await renderForm('signIn');
    expect(screen.queryByText('At least 10 characters.')).toBeNull();
  });
});
