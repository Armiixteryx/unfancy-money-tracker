import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Snackbar } from "../../ui/Snackbar";
import { useAppTheme } from "../../ui/theme";
import type { VoicePhase } from "./VoiceProvider";

type VoiceFeedbackProps = {
  phase: VoicePhase;
  message: string | null;
  saved: { id: string; message: string } | null;
  onDismissSaved: () => void;
  onDismissMessage: () => void;
  onEdit: (id: string) => void;
  onCancel: () => void;
  onStop: () => void;
  onStart: () => void;
  onRetrySave: () => void;
  onManual: () => void;
};
export function VoiceFeedback({
  phase,
  message,
  saved,
  onDismissSaved,
  onDismissMessage,
  onEdit,
  onCancel,
  onStop,
  onStart,
  onRetrySave,
  onManual,
}: VoiceFeedbackProps) {
  const { colors } = useAppTheme();
  const button = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Text style={{ color: colors.primary, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
  const status =
    phase === "recording"
      ? "Recording · release to submit · 15 second limit"
      : phase === "permission"
        ? "Waiting for microphone permission"
        : phase === "starting"
          ? "Starting microphone…"
          : phase === "saving"
            ? "Saving locally…"
            : "Processing expense…";
  return (
    <View
      className="ph-no-capture"
      {...{ "ph-no-capture": true, dataSet: { "financial-content": "true" } }}
      {...(Platform.OS === "web"
        ? {}
        : {
            accessibilityLabel: "ph-no-capture",
            importantForAccessibility: "no" as const,
            collapsable: false,
          })}
      pointerEvents="box-none"
      style={styles.overlay}
    >
      {saved ? (
        <Snackbar
          durationMs={8000}
          message={saved.message}
          onDismiss={onDismissSaved}
          actionLabel="Edit"
          onAction={() => onEdit(saved.id)}
        />
      ) : null}
      {phase !== "idle" || message ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.panel,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
            },
          ]}
        >
          {["processing", "saving"].includes(phase) ? (
            <ActivityIndicator
              accessibilityLabel={
                phase === "saving"
                  ? "Saving expense locally"
                  : "Processing voice expense"
              }
              color={colors.primary}
            />
          ) : null}
          <Text style={{ color: colors.text, flexShrink: 1 }}>
            {message ?? status}
          </Text>
          <View style={styles.actions}>
            {phase === "save_failed" ? button("Retry save", onRetrySave) : null}
            {phase === "recording" ? button("Stop and submit", onStop) : null}
            {phase === "saving"
              ? null
              : phase !== "idle"
                ? button(phase === "save_failed" ? "Close" : "Cancel", onCancel)
                : button("Dismiss", onDismissMessage)}
            {message && phase !== "saving"
              ? button("Enter manually", onManual)
              : null}
            {message && phase === "idle"
              ? button("Record again", onStart)
              : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 88,
    left: 16,
    right: 16,
    alignItems: "center",
    gap: 8,
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    maxWidth: 650,
    width: "100%",
    gap: 8,
  },
  actions: { flexDirection: "row", flexWrap: "wrap" },
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
});
