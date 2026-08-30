import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { toLocalDate } from '@/domain/dates/localDate';
import { useRequireUserId } from '@/features/auth/SessionProvider';
import { useProfile } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { queryKeys } from '@/lib/queryClient';
import {
  analyzeScan,
  confirmScan,
  createScan,
  getScanItems,
  type ConfirmedItem,
  type ScanItemView,
} from '@/services/ai/scanService';
import type { MealType } from '@/services/diary/diaryService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';
import { useQueryClient } from '@tanstack/react-query';

import { ScanReview } from './ScanReview';

type Stage = 'camera' | 'uploading' | 'analyzing' | 'review' | 'saving';

/**
 * Camera -> upload -> analyze -> review -> diary.
 *
 * Progress is reported as named STAGES, never as a percentage. We do not know
 * how far along a vendor call is, and a fake progress bar is a small lie that
 * teaches users to distrust the larger numbers this app exists to produce.
 */
export function ScanFlow({ mealType }: { mealType: MealType }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const userId = useRequireUserId();
  const toMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const profileQuery = useProfile(userId);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = useState<Stage>('camera');
  const [scanId, setScanId] = useState<string | null>(null);
  const [items, setItems] = useState<readonly ScanItemView[]>([]);
  const [selected, setSelected] = useState<readonly ConfirmedItem[]>([]);
  const [error, setError] = useState<unknown>(null);

  const handleSelection = useCallback((next: readonly ConfirmedItem[]) => setSelected(next), []);

  const reset = (): void => {
    setStage('camera');
    setScanId(null);
    setItems([]);
    setSelected([]);
    setError(null);
  };

  const capture = async (): Promise<void> => {
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1, skipProcessing: true });
      if (photo === undefined || photo === null) return;

      setStage('uploading');
      const scan = await createScan(userId, photo.uri);
      setScanId(scan.id);

      setStage('analyzing');
      await analyzeScan(scan.id, i18n.language);

      const analysed = await getScanItems(scan.id);
      setItems(analysed);
      setStage('review');
    } catch (e) {
      setError(e);
      // Back to the camera, not to a dead end. Whatever failed, the next thing
      // the user wants is another go.
      setStage('camera');
    }
  };

  const save = async (): Promise<void> => {
    if (scanId === null) return;
    setError(null);
    setStage('saving');
    try {
      const localDate = toLocalDate(profileQuery.data?.timezone ?? 'UTC');
      await confirmScan({ userId, scanId, localDate, mealType, items: selected });
      void queryClient.invalidateQueries({ queryKey: queryKeys.diaryDay(userId, localDate) });
      router.back();
    } catch (e) {
      setError(e);
      setStage('review');
    }
  };

  if (permission === null) {
    return (
      <Screen>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Text variant="title">{t('scan.permissionTitle')}</Text>
        <Text variant="body" tone="muted">
          {t('scan.permissionBody')}
        </Text>
        <Button label={t('scan.grantPermission')} onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  if (stage === 'review' || stage === 'saving') {
    return (
      <Screen
        scroll
        footer={
          <>
            {error === null ? null : (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {toMessage(error)}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Button
                label={t('scan.retake')}
                variant="secondary"
                onPress={reset}
                disabled={stage === 'saving'}
              />
              <View style={{ flex: 1 }}>
                <Button
                  label={t('scan.addSelected')}
                  onPress={() => void save()}
                  disabled={selected.length === 0}
                  loading={stage === 'saving'}
                  fullWidth
                  size="lg"
                />
              </View>
            </View>
          </>
        }
      >
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="title">{t('scan.reviewTitle')}</Text>
          <Text variant="body" tone="muted">
            {t('scan.reviewBody')}
          </Text>
        </View>

        <ScanReview items={items} onSelectionChange={handleSelection} />

        {selected.length === 0 ? (
          <Text variant="caption" tone="muted">
            {t('scan.nothingSelected')}
          </Text>
        ) : null}
      </Screen>
    );
  }

  const busy = stage === 'uploading' || stage === 'analyzing';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
          alignItems: 'center',
        }}
      >
        {error === null ? null : (
          <Card>
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {toMessage(error)}
            </Text>
          </Card>
        )}

        {busy ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <ActivityIndicator color={theme.colors.primary} />
              {/* Named stages, not a percentage - see the note above. */}
              <Text variant="body" accessibilityLiveRegion="polite">
                {stage === 'uploading' ? t('scan.uploading') : t('scan.analyzing')}
              </Text>
            </View>
          </Card>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scan.takePhoto')}
            onPress={() => void capture()}
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: '#fff',
              borderWidth: 4,
              borderColor: 'rgba(0,0,0,0.2)',
            }}
          />
        )}
      </View>
    </View>
  );
}
