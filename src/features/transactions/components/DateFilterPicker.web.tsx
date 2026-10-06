import { AppText as Text } from "../../../ui/AppText";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { createElement, type ChangeEvent, type CSSProperties } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useThemedStyles, type ThemeColors } from "../../../ui/theme";

type DateFilterPickerProps = {
  accessibilityLabel: string;
  maximumDate?: string;
  minimumDate?: string;
  onChange: (value: string | undefined) => void;
  value?: string;
};

export function DateFilterPicker({ accessibilityLabel, maximumDate, minimumDate, onChange, value }: DateFilterPickerProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const inputStyle = createInputStyle(styles.colors);

  return (
    <View style={styles.controlRow}>
      {createElement("input", {
        "aria-label": accessibilityLabel,
        max: maximumDate,
        min: minimumDate,
        onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value || undefined),
        style: inputStyle,
        type: "date",
        value: value ?? ""
      })}
      {value ? (
        <Pressable
          accessibilityLabel={i18n.t($ => $.notices.clearDate, { label: accessibilityLabel })}
          accessibilityRole="button"
          onPress={() => onChange(undefined)}
          style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
        >
          <Text style={styles.clearButtonText}>{i18n.t($ => $.ui.transactionsClear)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => ({
  ...StyleSheet.create({
    controlRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    clearButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
    clearButtonPressed: { backgroundColor: colors.infoSubtle },
    clearButtonText: { color: colors.text, fontSize: 14, fontWeight: "500" }
  }),
  colors
});

function createInputStyle(colors: ThemeColors): CSSProperties {
  return {
    appearance: "none",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    boxSizing: "border-box",
    color: colors.text,
    flex: 1,
    fontFamily: "Inter_400Regular, system-ui, sans-serif",
    fontSize: 14,
    minHeight: 48,
    minWidth: 0,
    padding: "0 12px",
    width: "100%"
  };
}
