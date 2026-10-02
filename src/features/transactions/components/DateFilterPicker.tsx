import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../../ui/theme";
import type { ThemeColors } from "../../../ui/theme";

type DateFilterPickerProps = {
  accessibilityLabel: string;
  maximumDate?: string;
  minimumDate?: string;
  onChange: (value: string | undefined) => void;
  value?: string;
};

function parseLocalDate(value: string | undefined): Date {
  if (value) {
    const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date;
  }
  return new Date();
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateFilterPicker({ accessibilityLabel, maximumDate, minimumDate, onChange, value }: DateFilterPickerProps) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type !== "set" || !selectedDate) {
      setOpen(false);
      return;
    }
    setOpen(false);
    onChange(formatLocalDate(selectedDate));
  };

  return (
    <View style={styles.controlRow}>
      <Pressable
        accessibilityHint="Opens a calendar to choose a date"
        accessibilityLabel={`${accessibilityLabel}: ${value ?? "Select date"}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}
      >
        <Text style={[styles.dateButtonText, !value && styles.placeholder]}>{value ?? "Select date"}</Text>
      </Pressable>
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
      {open ? (
        <DateTimePicker
          maximumDate={maximumDate ? parseLocalDate(maximumDate) : undefined}
          minimumDate={minimumDate ? parseLocalDate(minimumDate) : undefined}
          mode="date"
          onChange={handlePickerChange}
          value={parseLocalDate(value)}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  controlRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  dateButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 12 },
  dateButtonPressed: { borderColor: colors.primary },
  dateButtonText: { color: colors.text, fontSize: 14 },
  placeholder: { color: colors.placeholder },
  clearButton: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 10 },
  clearButtonPressed: { backgroundColor: colors.infoSubtle },
  clearButtonText: { color: colors.text, fontSize: 13, fontWeight: "700" }
});
