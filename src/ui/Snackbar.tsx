import { i18n } from "../localization/i18n";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useThemedStyles, type ThemeColors } from "./theme";

type SnackbarProps = {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};
export function Snackbar({
  message,
  onDismiss,
  durationMs = 4000,
  actionLabel,
  onAction,
}: SnackbarProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(durationMs);
  useEffect(() => {
    remaining.current = durationMs;
  }, [durationMs, message]);
  useEffect(() => {
    if (hovered || focused) return;
    const started = Date.now();
    const timeout = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timeout);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [durationMs, message, hovered, focused]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.container}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Ionicons
        accessibilityElementsHidden
        color={styles.icon.color}
        name="checkmark-circle"
        size={22}
      />
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPress={onAction}
          style={styles.dismiss}
        >
          <Text style={styles.message}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={i18n.t($ => $.ui.commonDismissNotification)}
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      width: "100%",
    },
    icon: { color: colors.positive },
    message: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
    },
    dismiss: {
      alignItems: "center",
      borderRadius: 999,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 44,
    },
    dismissIcon: { color: colors.muted },
  });
