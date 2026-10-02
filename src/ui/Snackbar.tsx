import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles, type ThemeColors } from "./theme";

type SnackbarProps = {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
};
export function Snackbar({ message, onDismiss, durationMs = 4000 }: SnackbarProps) {
  const styles = useThemedStyles(createStyles);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timeout = setTimeout(() => dismissRef.current(), durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs, message]);

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.container}>
      <Ionicons accessibilityElementsHidden color={styles.icon.color} name="checkmark-circle" size={22} />
      <Text style={styles.message}>{message}</Text>
      <Pressable
        accessibilityLabel="Dismiss notification"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        style={styles.dismiss}
      >
        <Ionicons color={styles.dismissIcon.color} name="close" size={20} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 5,
    flexDirection: "row",
    gap: 10,
    maxWidth: 560,
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    width: "100%"
  },
  icon: { color: colors.positive },
  message: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  dismiss: { alignItems: "center", borderRadius: 999, justifyContent: "center", minHeight: 44, minWidth: 44 },
  dismissIcon: { color: colors.muted }
});
