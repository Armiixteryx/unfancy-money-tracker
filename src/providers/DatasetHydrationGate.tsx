import { useEffect, useState, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { useThemedStyles, type ThemeColors } from "../ui/theme";

function HydrationScreen() {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessible accessibilityLabel="Loading your local data" style={styles.centered}>
      <View style={styles.spinner} />
      <Text style={styles.title}>Loading your local data</Text>
      <Text style={styles.description}>Your financial records stay on this device until you choose otherwise.</Text>
    </View>
  );
}

function RecoveryScreen() {
  const styles = useThemedStyles(createStyles);
  const hydration = useLocalDatasetStore((state) => state.hydration);
  const retryHydration = useLocalDatasetStore((state) => state.retryHydration);
  const recoverLocalData = useLocalDatasetStore((state) => state.recoverLocalData);
  const resetLocalData = useLocalDatasetStore((state) => state.resetLocalData);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <View style={styles.centered}>
      <View style={[styles.spinner, styles.recoveryIcon]} />
      <Text accessibilityRole="header" style={styles.title}>Local data needs attention</Text>
      <Text style={styles.description}>
        We preserved the unreadable snapshot and blocked the app from opening partial data. Retry, recover the preserved copy, or reset this local copy.
      </Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry local data" onPress={() => void retryHydration()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Retry</Text>
        </Pressable>
        {hydration.status === "recovery" && hydration.backupAvailable ? <Pressable accessibilityRole="button" accessibilityLabel="Recover preserved local data" onPress={() => void recoverLocalData()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Recover preserved copy</Text>
        </Pressable> : null}
        {confirmReset ? (
          <View style={styles.confirmation}>
            <Text style={styles.confirmationText}>Resetting removes this local copy. Continue?</Text>
            <View style={styles.confirmationActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void resetLocalData()} style={styles.dangerButton}>
                <Text style={styles.dangerButtonText}>Reset local data</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Reset local data" onPress={() => setConfirmReset(true)} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Reset local data</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function DatasetHydrationGate({ children }: PropsWithChildren) {
  const hydration = useLocalDatasetStore((state) => state.hydration);
  const initialize = useLocalDatasetStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (hydration.status === "loading") return <HydrationScreen />;
  if (hydration.status === "recovery") return <RecoveryScreen />;
  return <>{children}</>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  centered: { alignItems: "center", backgroundColor: colors.canvas, flex: 1, justifyContent: "center", padding: 32 },
  spinner: { backgroundColor: colors.positive, borderRadius: 999, height: 48, marginBottom: 24, opacity: 0.85, width: 48 },
  recoveryIcon: { backgroundColor: colors.negative },
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
