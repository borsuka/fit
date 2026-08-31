import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import type { AppError } from '@/lib/errors';
import { useErrorMessage } from '@/lib/i18n/useErrorMessage';
import { lookupBarcode, type BarcodeResult } from '@/services/foods/barcodeService';
import type { MealType } from '@/services/diary/diaryService';
import { Button, Card, Screen, Text, useTheme } from '@/ui';

/**
 * Point the camera at a barcode.
 *
 * The scanner fires continuously while a code is in frame - dozens of times a
 * second - so a guard ref stops the same code launching a lookup over and over.
 * A ref rather than state, because state updates asynchronously and several
 * callbacks would run before the flag flipped.
 */
export function BarcodeScanScreen({ mealType }: { mealType: MealType }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const toMessage = useErrorMessage();

  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const lookup = useMutation<BarcodeResult, AppError, string>({
    mutationFn: lookupBarcode,
    onSuccess: (result) => {
      // Straight to the portion picker: the food is identified, the amount is
      // the only thing left to decide.
      router.replace({
        pathname: '/food/[id]',
        params: { id: result.foodId, mealType },
      });
    },
    onError: () => {
      // Re-arm so the user can try another product without leaving the screen.
      handled.current = false;
    },
  });

  const onScanned = (code: string): void => {
    if (handled.current) return;
    handled.current = true;
    setLastCode(code);
    lookup.mutate(code);
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
        <Text variant="title">{t('barcode.permissionTitle')}</Text>
        <Text variant="body" tone="muted">
          {t('barcode.permissionBody')}
        </Text>
        <Button label={t('scan.grantPermission')} onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        // Only the formats found on food packaging. A wider list makes the
        // scanner slower and invites it to lock onto a QR code on the shelf.
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={lookup.isPending ? undefined : (event) => onScanned(event.data)}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        {lookup.isPending ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text variant="body" accessibilityLiveRegion="polite">
                {t('barcode.looking', { code: lastCode ?? '' })}
              </Text>
            </View>
          </Card>
        ) : lookup.isError ? (
          <Card>
            <Text variant="body" tone="danger" accessibilityRole="alert">
              {toMessage(lookup.error)}
            </Text>
            <View style={{ marginTop: theme.spacing.md }}>
              <Button
                label={t('barcode.enterManually')}
                variant="secondary"
                fullWidth
                onPress={() => router.replace({ pathname: '/search', params: { mealType } })}
              />
            </View>
          </Card>
        ) : (
          <Card>
            <Text variant="body">{t('barcode.aim')}</Text>
          </Card>
        )}
      </View>
    </View>
  );
}
