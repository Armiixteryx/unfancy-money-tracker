import { translateMessage } from "../../localization/i18n";
import { i18n } from "../../localization/i18n";
import { useTranslation } from "react-i18next";
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
  useTranslation();
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
      ? i18n.t($ => $.ui.voiceRecordingReleaseToSubmit15SecondLimit)
      : phase === "permission"
        ? i18n.t($ => $.ui.voiceWaitingForMicrophonePermission)
        : phase === "starting"
          ? i18n.t($ => $.ui.voiceStartingMicrophone)
          : phase === "saving"
            ? i18n.t($ => $.ui.voiceSavingLocally)
            : i18n.t($ => $.ui.voiceProcessingExpense);
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
          actionLabel={i18n.t($ => $.ui.budgetsEdit)}
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
                  ? i18n.t($ => $.ui.voiceSavingExpenseLocally)
                  : i18n.t($ => $.ui.voiceProcessingVoiceExpense)
              }
              color={colors.primary}
            />
          ) : null}
          <Text style={{ color: colors.text, flexShrink: 1 }}>
            {message ? translateMessage(message, true) : status}
          </Text>
          <View style={styles.actions}>
            {phase === "save_failed" ? button(i18n.t($ => $.ui.voiceRetrySave), onRetrySave) : null}
            {phase === "recording" ? button(i18n.t($ => $.ui.voiceStopAndSubmit), onStop) : null}
            {phase === "saving"
              ? null
              : phase !== "idle"
                ? button(phase === "save_failed" ? i18n.t($ => $.ui.voiceClose) : i18n.t($ => $.ui.commonCancel), onCancel)
                : button(i18n.t($ => $.ui.voiceDismiss), onDismissMessage)}
            {message && phase !== "saving"
              ? button(i18n.t($ => $.ui.voiceEnterManually), onManual)
              : null}
            {message && phase === "idle"
              ? button(i18n.t($ => $.ui.voiceRecordAgain), onStart)
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
