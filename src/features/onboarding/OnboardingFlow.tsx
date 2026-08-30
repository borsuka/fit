import * as Localization from 'expo-localization';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { TargetsSummary } from '@/components/TargetsSummary';
import {
  ageFromDateOfBirth,
  calculateNutritionTargets,
  type BodyProfile,
  type GoalInput,
} from '@/domain/nutrition';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useCompleteOnboarding } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

import {
  EMPTY_DRAFT,
  isAboutYouComplete,
  isGoalComplete,
  parseBirthDate,
  parseDecimal,
  toIsoDate,
  type OnboardingDraft,
} from './model';
import { AboutYouStep } from './steps/AboutYouStep';
import { GoalStep } from './steps/GoalStep';

type Step = 'about' | 'goal' | 'targets';

const STEPS: readonly Step[] = ['about', 'goal', 'targets'];

export function OnboardingFlow() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const userId = useRequireUserId();
  const complete = useCompleteOnboarding();
  const toMessage = useErrorMessage();

  const [step, setStep] = useState<Step>('about');
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);

  const patch = (next: Partial<OnboardingDraft>): void =>
    setDraft((current) => ({ ...current, ...next }));

  /**
   * Targets are recomputed from the draft on every render of the final step.
   *
   * The engine is pure and fast, so there is no reason to persist a preview -
   * and a stored preview is a number that can disagree with what actually gets
   * saved.
   */
  const preview = useMemo(() => {
    const birthDate = parseBirthDate(draft);
    const heightCm = parseDecimal(draft.heightCm);
    const weightKg = parseDecimal(draft.weightKg);

    if (
      birthDate === null ||
      heightCm === null ||
      weightKg === null ||
      draft.sex === null ||
      draft.activity === null ||
      draft.goal === null
    ) {
      return null;
    }

    const body: BodyProfile = {
      sex: draft.sex,
      ageYears: ageFromDateOfBirth(birthDate, new Date()),
      heightCm,
      weightKg,
    };

    const targetWeight = parseDecimal(draft.targetWeightKg);
    const goal: GoalInput = {
      goal: draft.goal,
      activity: draft.activity,
      ...(targetWeight === null ? {} : { targetWeightKg: targetWeight }),
    };

    return { body, goal, result: calculateNutritionTargets(body, goal), birthDate };
  }, [draft]);

  const canAdvance =
    step === 'about'
      ? isAboutYouComplete(draft)
      : step === 'goal'
        ? isGoalComplete(draft)
        : preview?.result.ok === true;

  const handleNext = (): void => {
    const index = STEPS.indexOf(step);
    const next = STEPS[index + 1];
    if (next !== undefined) setStep(next);
  };

  const handleBack = (): void => {
    const index = STEPS.indexOf(step);
    const previous = STEPS[index - 1];
    if (previous !== undefined) setStep(previous);
  };

  const handleFinish = (): void => {
    if (preview === null || !preview.result.ok) return;

    complete.mutate({
      userId,
      draft: {
        displayName: null,
        dateOfBirth: toIsoDate(preview.birthDate),
        sex: preview.body.sex,
        heightCm: preview.body.heightCm,
        // The device timezone decides which calendar day a meal belongs to.
        // Getting it from the device beats asking, and it is correctable in
        // settings later.
        timezone: Localization.getCalendars()[0]?.timeZone ?? 'UTC',
        locale: i18n.language === 'bg' ? 'bg' : 'en',
        unitSystem: 'metric',
      },
      body: preview.body,
      goal: preview.goal,
    });
  };

  // Validation errors from the engine are shown on the targets step rather
  // than swallowed: "target below a healthy weight for your height" is
  // actionable, and it is the whole reason the guard exists.
  const engineError =
    step === 'targets' && preview !== null && !preview.result.ok
      ? preview.result.errors[0]
      : undefined;

  return (
    <Screen
      scroll
      footer={
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {step !== 'about' ? (
            <Button
              label={t('common.back')}
              variant="secondary"
              onPress={handleBack}
              disabled={complete.isPending}
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              label={step === 'targets' ? t('onboarding.finish') : t('common.next')}
              onPress={step === 'targets' ? handleFinish : handleNext}
              disabled={!canAdvance}
              loading={complete.isPending}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      }
    >
      <Text variant="caption" tone="muted">
        {STEPS.indexOf(step) + 1} / {STEPS.length}
      </Text>

      {step === 'about' ? <AboutYouStep draft={draft} onChange={patch} /> : null}
      {step === 'goal' ? <GoalStep draft={draft} onChange={patch} /> : null}

      {step === 'targets' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="title">{t('onboarding.yourTargets')}</Text>
            <Text variant="body" tone="muted">
              {t('onboarding.weWillAdjust')}
            </Text>
          </View>

          {engineError !== undefined ? (
            <Card>
              <Text
                variant="body"
                tone="danger"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {t(`validation.${engineError.code}`)}
              </Text>
            </Card>
          ) : null}

          {preview?.result.ok === true ? <TargetsSummary targets={preview.result.value} /> : null}

          {complete.error !== null ? (
            <Card>
              <Text variant="body" tone="danger" accessibilityRole="alert">
                {toMessage(complete.error)}
              </Text>
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
