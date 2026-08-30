import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ActivityLevel, Sex } from '@/domain/nutrition';
import { OptionRow, Text, TextField, useTheme } from '@/ui';

import { ACTIVITY_LEVELS, type OnboardingDraft } from '../model';

export interface StepProps {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
}

export function AboutYouStep({ draft, onChange }: StepProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{t('onboarding.aboutYou')}</Text>
        <Text variant="body" tone="muted">
          {t('onboarding.introBody')}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label" tone="muted">
          {t('onboarding.dateOfBirth')}
        </Text>
        {/* Three numeric fields rather than a native picker: no extra
            dependency, and scrolling a wheel back forty years is worse than
            typing four digits. */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="DD"
              value={draft.birthDay}
              onChangeText={(birthDay) => onChange({ birthDay })}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="15"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="MM"
              value={draft.birthMonth}
              onChangeText={(birthMonth) => onChange({ birthMonth })}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="06"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <TextField
              label="YYYY"
              value={draft.birthYear}
              onChangeText={(birthYear) => onChange({ birthYear })}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1994"
            />
          </View>
        </View>
        <Text variant="caption" tone="muted">
          {t('onboarding.dateOfBirthHelper')}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="muted">
          {t('onboarding.sex')}
        </Text>
        {/* Labelled as a formula input, not an identity question, because that
            is exactly what it is: Mifflin-St Jeor has two parameterisations
            and no honest third value. */}
        <Text variant="caption" tone="muted">
          {t('onboarding.sexHelper')}
        </Text>
        {(['male', 'female'] as Sex[]).map((sex) => (
          <OptionRow
            key={sex}
            label={t(`onboarding.${sex}`)}
            selected={draft.sex === sex}
            onPress={() => onChange({ sex })}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('onboarding.height')}
            value={draft.heightCm}
            onChangeText={(heightCm) => onChange({ heightCm })}
            keyboardType="decimal-pad"
            suffix="cm"
            placeholder="175"
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('onboarding.weight')}
            value={draft.weightKg}
            onChangeText={(weightKg) => onChange({ weightKg })}
            keyboardType="decimal-pad"
            suffix="kg"
            placeholder="72"
          />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="muted">
          {t('onboarding.activity')}
        </Text>
        {ACTIVITY_LEVELS.map((level: ActivityLevel) => (
          <OptionRow
            key={level}
            label={t(`onboarding.activity_${level}`)}
            hint={t(`onboarding.activity_${level}Hint`)}
            selected={draft.activity === level}
            onPress={() => onChange({ activity: level })}
          />
        ))}
      </View>
    </View>
  );
}
