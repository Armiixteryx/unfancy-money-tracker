import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isMockDatasetPreset, type MockDatasetPreset } from "../src/features/development/mockData";
import { resetLocalMockSeedSession } from "../src/features/development/resetLocalMockSeed";
import { useDatasetStore } from "../src/features/sync/store/useDatasetStore";
import { createRuntimeAuthClient } from "../src/platform/runtime";
import { isLocalDevelopmentRuntime } from "../src/platform/runtime/localDevelopment";
import { AppScreen } from "../src/ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../src/ui/theme";

function presetLabel(preset: MockDatasetPreset): string {
  return preset === "dashboard" ? "Dashboard sample" : "Edge-case sample";
}

export default function DeveloperSeedScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { preset: requestedPreset, resetLocalPreview: requestedReset } = useLocalSearchParams<{ preset?: string | string[]; resetLocalPreview?: string | string[] }>();
  const preset = typeof requestedPreset === "string" && isMockDatasetPreset(requestedPreset) ? requestedPreset : null;
  const shouldResetLocalPreview = requestedReset === "1";
  const isAnonymousDataset = useDatasetStore((state) => state.isAnonymousDataset);
  const replaceWithMockData = useDatasetStore((state) => state.replaceWithMockData);
  const switchToAnonymousNamespace = useDatasetStore((state) => state.switchToAnonymousNamespace);
  const authClient = useMemo(() => createRuntimeAuthClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unavailable = !isLocalDevelopmentRuntime()
    ? "Mock data is available only in the local development environment."
    : !preset
      ? "The requested mock-data preset is not available."
      : !isAnonymousDataset && !shouldResetLocalPreview
        ? "Sign out before replacing anonymous local data with a mock dataset."
        : null;

  const confirm = async () => {
    if (!preset || unavailable) return;
    setBusy(true);
    setMessage(null);
    if (shouldResetLocalPreview) {
      try {
        const reset = await resetLocalMockSeedSession(authClient, switchToAnonymousNamespace);
        if (!reset.ok) {
          setMessage(reset.message);
          setBusy(false);
          return;
        }
      } catch {
        setMessage("The local preview session could not be cleared. Mock data was not loaded.");
        setBusy(false);
        return;
      }
    }
    const result = await replaceWithMockData(preset);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    router.replace("/");
  };

  return (
    <AppScreen eyebrow="Local development" title="Load mock data">
      <View style={styles.card}>
        <Text style={styles.title}>{preset ? presetLabel(preset) : "Mock data unavailable"}</Text>
        <Text style={styles.copy}>
          {unavailable ?? (shouldResetLocalPreview
            ? "This signs out of the local preview and clears this device or browser's account cache before replacing the anonymous dataset with synthetic records, categories, budgets, preferences, and sync state. Backend data is not changed."
            : "This replaces the entire anonymous local dataset with synthetic records, categories, budgets, preferences, and sync state.")}
        </Text>
        {preset && !unavailable ? <Text style={styles.warning}>This is destructive. It cannot be undone from this screen.</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.replace("/")} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          {!unavailable ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirm()} style={styles.dangerButton}>
            <Text style={styles.dangerText}>{busy ? "Loading…" : `Replace with ${presetLabel(preset!)}`}</Text>
          </Pressable> : null}
        </View>
      </View>
    </AppScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 14, maxWidth: 640, padding: 24 },
  title: { color: colors.text, fontSize: 19, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  warning: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 13 },
  error: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, padding: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  dangerButton: { alignItems: "center", backgroundColor: colors.negative, borderRadius: 12, justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
  dangerText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" }
});
