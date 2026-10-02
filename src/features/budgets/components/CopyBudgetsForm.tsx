import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatMonthLabel, shiftCalendarMonth } from "../../../domain";
import type { Budget, CalendarMonth, Category } from "../../../domain/types";
import type { CopyBudgetsResult, MutationResult } from "../../local-data/store/useLocalDatasetStore";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";

export type CopyBudgetsFormProps = {
  budgets: readonly Budget[];
  categories: readonly Category[];
  targetMonth: CalendarMonth;
  initialSourceMonth: CalendarMonth;
  onCopy: (sourceMonth: CalendarMonth, targetMonth: CalendarMonth) => Promise<MutationResult<CopyBudgetsResult>>;
  onCancel: () => void;
};

export function CopyBudgetsForm({ budgets, categories, targetMonth, initialSourceMonth, onCopy, onCancel }: CopyBudgetsFormProps) {
  const styles = useThemedStyles(createStyles);
  const [sourceMonth, setSourceMonth] = useState<CalendarMonth>(initialSourceMonth);
  const [formError, setFormError] = useState<string | null>(null);
  const sourceBudgets = useMemo(() => budgets.filter((budget) => budget.month === sourceMonth), [budgets, sourceMonth]);
  const targetCategoryIds = useMemo(() => new Set(budgets.filter((budget) => budget.month === targetMonth).map((budget) => budget.categoryId)), [budgets, targetMonth]);
  const eligibleCount = useMemo(() => sourceBudgets.filter((budget) => {
    const category = categories.find((candidate) => candidate.id === budget.categoryId);
    return !targetCategoryIds.has(budget.categoryId) && category?.kind === "expense" && !category.isArchived;
  }).length, [categories, sourceBudgets, targetCategoryIds]);
  const skippedCount = sourceBudgets.length - eligibleCount;
  const disabled = sourceMonth === targetMonth || sourceBudgets.length === 0 || eligibleCount === 0;

  useEffect(() => {
    setSourceMonth(initialSourceMonth);
    setFormError(null);
  }, [initialSourceMonth]);

  const submit = async () => {
    setFormError(null);
    const result = await onCopy(sourceMonth, targetMonth);
    if (!result.ok) setFormError(result.message);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Reuse a monthly plan</Text>
          <Text accessibilityRole="header" style={styles.title}>Copy budgets</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close copy budgets form" onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Copy from</Text>
          <View style={styles.monthControl}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous source month" accessibilityState={{ disabled: sourceMonth === "0000-01" }} disabled={sourceMonth === "0000-01"} onPress={() => setSourceMonth((value) => shiftCalendarMonth(value, -1))} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </Pressable>
            <Text accessibilityRole="text" style={styles.monthLabel}>{formatMonthLabel(sourceMonth)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next source month" onPress={() => setSourceMonth((value) => shiftCalendarMonth(value, 1))} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>Budgets will be added to {formatMonthLabel(targetMonth)}.</Text>
        </View>

        <View accessibilityLiveRegion="polite" style={styles.preview}>
          <Text style={styles.previewTitle}>Preview</Text>
          <Text style={styles.previewText}>{sourceBudgets.length} {sourceBudgets.length === 1 ? "budget" : "budgets"} in {formatMonthLabel(sourceMonth)}</Text>
          <Text style={styles.previewText}>{eligibleCount} eligible to copy</Text>
          <Text style={styles.previewText}>{skippedCount} skipped because the category already exists or is unavailable</Text>
          {sourceMonth === targetMonth ? <Text accessibilityRole="alert" style={styles.warning}>Choose a different source month.</Text> : null}
          {sourceBudgets.length === 0 ? <Text style={styles.helper}>There are no budgets in this source month.</Text> : null}
          {sourceBudgets.length > 0 && eligibleCount === 0 && sourceMonth !== targetMonth ? <Text style={styles.helper}>Nothing can be copied into this month.</Text> : null}
        </View>

        {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Copy eligible budgets" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void submit()} style={[styles.copyButton, disabled && styles.disabledButton]}>
          <Text style={styles.copyText}>Copy eligible budgets</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel copying budgets" onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minHeight: 500, padding: 20 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  closeText: { color: colors.text, fontSize: 26, fontWeight: "300", lineHeight: 28 },
  fields: { gap: 18, paddingBottom: 8 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "800" },
  monthControl: { alignItems: "center", flexDirection: "row", gap: 10 },
  monthButton: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  monthButtonText: { color: colors.text, fontSize: 28, fontWeight: "300", lineHeight: 30 },
  monthLabel: { color: colors.text, flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center" },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.canvas, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 6, padding: 14 },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  previewText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  warning: { color: colors.warning, fontSize: 13, fontWeight: "700" },
  error: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  copyButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", minHeight: 50 },
  disabledButton: { opacity: 0.5 },
  copyText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  cancelButton: { alignItems: "center", justifyContent: "center", minHeight: 42 },
  cancelText: { color: colors.muted, fontSize: 14, fontWeight: "700" }
});
