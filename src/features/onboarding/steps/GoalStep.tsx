import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { GoalType } from '@/domain/nutrition';
import { OptionRow, Text, TextField, useTheme } from '@/ui';

import { GOAL_TYPES, GOALS_WITH_TARGET, type OnboardingDraft } from '../model';
import type { StepProps } from './AboutYouStep';

export function GoalStep({ draft, onChange }: StepProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const wantsTarget = draft.goal !== null && GOALS_WITH_TARGET.has(draft.goal);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Text variant="title">{t('onboarding.goal')}</Text>

      <View style={{ gap: theme.spacing.sm }}>
        {GOAL_TYPES.map((goal: GoalType) => (
          <OptionRow
            key={goal}
            label={t(`onboarding.goal_${goal}`)}
            selected={draft.goal === goal}
            onPress={() =>
              onChange(
                // Clearing the target when switching to maintain avoids
                // carrying a stale number the user can no longer see or edit.
                GOALS_WITH_TARGET.has(goal) ? { goal } : { goal, targetWeightKg: '' },
              )
            }
          />
        ))}
      </View>

      {wantsTarget ? (
        <TextField
          label={t('onboarding.targetWeight')}
          helper={t('onboarding.targetWeightOptional')}
          value={draft.targetWeightKg}
          onChangeText={(targetWeightKg) => onChange({ targetWeightKg })}
          keyboardType="decimal-pad"
          suffix="kg"
        />
      ) : null}
    </View>
  );
}

export type { OnboardingDraft };
