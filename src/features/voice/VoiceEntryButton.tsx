import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "../../ui/theme";
import { useVoice } from "./VoiceProvider";
export function VoiceEntryButton() {
  const { phase, start, stop } = useVoice();
  const { colors } = useAppTheme();
  const disabled = ["processing", "saving", "save_failed"].includes(phase);
  const toggleDisabled =
    disabled || phase === "starting" || phase === "permission";
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to record an expense"
          accessibilityHint="Release to submit. Alternatively use Start recording and Stop and submit."
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPressIn={() => {
            if (phase === "idle") void start();
          }}
          onPressOut={() => void stop()}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            minHeight: 48,
            minWidth: 48,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 16,
          }}
        >
          <Ionicons name="mic" color={colors.onPrimary} size={20} />
          <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>
            {phase === "recording" ? "Recording…" : "Hold to record expense"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={toggleDisabled}
          accessibilityState={{ disabled: toggleDisabled }}
          onPress={() => void (phase === "recording" ? stop() : start())}
          style={{
            minHeight: 48,
            justifyContent: "center",
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "700" }}>
            {phase === "recording" ? "Stop and submit" : "Start recording"}
          </Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Voice audio is sent to Vercel/SpaceXAI; the transcript and active
        category names go to Cloudflare. Say one expense: “Lunch forty thousand
        pesos”. The saved record stays on this device.
      </Text>
    </View>
  );
}
