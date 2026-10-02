import { createElement, type ChangeEvent, type CSSProperties } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles, type ThemeColors } from "../../../ui/theme";

type DateFilterPickerProps = {
  accessibilityLabel: string;
  maximumDate?: string;
  minimumDate?: string;
  onChange: (value: string | undefined) => void;
  value?: string;
};

export function DateFilterPicker({ accessibilityLabel, maximumDate, minimumDate, onChange, value }: DateFilterPickerProps) {
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
          accessibilityLabel={`Clear ${accessibilityLabel}`}
          accessibilityRole="button"
          onPress={() => onChange(undefined)}
          style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
        >
          <Text style={styles.clearButtonText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => ({
  ...StyleSheet.create({
    controlRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    clearButton: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 10 },
    clearButtonPressed: { backgroundColor: colors.infoSubtle },
    clearButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" }
  }),
  colors
});

function createInputStyle(colors: ThemeColors): CSSProperties {
  return {
    appearance: "none",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    boxSizing: "border-box",
    color: colors.text,
    flex: 1,
    fontFamily: "inherit",
    fontSize: 14,
    minHeight: 42,
    minWidth: 0,
    padding: "0 12px",
    width: "100%"
  };
}
