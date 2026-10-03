import { i18n } from "../localization/i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../ui/theme";
import { AppBrand } from "../ui/AppBrand";
import { FirstRunWarning } from "../ui/FirstRunWarning";

function HydrationScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  return (
    <View style={styles.centered}>
      <AppBrand accessibilityElementsHidden />
      <ActivityIndicator accessibilityLabel={i18n.t($ => $.ui.commonLoadingUnfancyMoneyTracker)} accessibilityRole="progressbar" color={colors.positive} size="large" style={styles.activityIndicator} />
    </View>
  );
}

function RecoveryScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const hydration = useLocalDatasetStore((state) => state.hydration);
  const retryHydration = useLocalDatasetStore((state) => state.retryHydration);
  const recoverLocalData = useLocalDatasetStore((state) => state.recoverLocalData);
  const resetLocalData = useLocalDatasetStore((state) => state.resetLocalData);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <View style={styles.centered}>
      <View style={styles.recoveryIcon} />
      <Text accessibilityRole="header" style={styles.title}>{i18n.t($ => $.ui.commonLocalDataNeedsAttention)}</Text>
      <Text style={styles.description}>
        {i18n.t($ => $.ui.commonWePreservedTheUnreadableSnapshotAndBlocked)}
      </Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.commonRetryLocalData)} onPress={() => void retryHydration()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.commonRetry)}</Text>
        </Pressable>
        {hydration.status === "recovery" && hydration.backupAvailable ? <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.commonRecoverPreservedLocalData)} onPress={() => void recoverLocalData()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.commonRecoverPreservedCopy)}</Text>
        </Pressable> : null}
        {confirmReset ? (
          <View style={styles.confirmation}>
            <Text style={styles.confirmationText}>{i18n.t($ => $.ui.commonResettingRemovesThisLocalCopyContinue)}</Text>
            <View style={styles.confirmationActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.commonCancel)}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void resetLocalData()} style={styles.dangerButton}>
                <Text style={styles.dangerButtonText}>{i18n.t($ => $.ui.commonResetLocalData)}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.commonResetLocalData)} onPress={() => setConfirmReset(true)} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>{i18n.t($ => $.ui.commonResetLocalData)}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function DatasetHydrationGate({ children }: PropsWithChildren) {
  useTranslation();
  const hydration = useLocalDatasetStore((state) => state.hydration);
  const initialize = useLocalDatasetStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (hydration.status === "loading") return <HydrationScreen />;
  if (hydration.status === "recovery") return <RecoveryScreen />;
  return <View style={{ flex: 1 }}><FirstRunWarning />{children}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  centered: { alignItems: "center", backgroundColor: colors.canvas, flex: 1, justifyContent: "center", padding: 32 },
  activityIndicator: { marginTop: 24 },
  recoveryIcon: { backgroundColor: colors.negative, borderRadius: 999, height: 48, opacity: 0.85, width: 48 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 520, textAlign: "center" },
  actions: { alignItems: "center", gap: 12, marginTop: 24, width: "100%" },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 18 },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  dangerButton: { alignItems: "center", backgroundColor: colors.negative, borderRadius: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 18 },
  dangerButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "700" },
  confirmation: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 14, borderWidth: 1, gap: 12, maxWidth: 520, padding: 16, width: "100%" },
  confirmationText: { color: colors.text, fontSize: 14, textAlign: "center" },
  confirmationActions: { flexDirection: "row", gap: 10 }
});
