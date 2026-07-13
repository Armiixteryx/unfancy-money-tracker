import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SUPPORTED_CURRENCIES, type CurrencyCode } from "../../../domain/currency";
import type { Budget, Category } from "../../../domain/types";
import { budgetInputSchema, type BudgetInput } from "../../../domain/validation";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";

export type BudgetFormResult = { ok: true } | { ok: false; message: string };

type BudgetFormProps = {
  categories: readonly Category[];
  budget?: Budget;
  defaultMonth: string;
  defaultCurrency: CurrencyCode;
  onSave: (input: BudgetInput) => Promise<BudgetFormResult>;
  onCancel: () => void;
};

export function BudgetForm({ categories, budget, defaultMonth, defaultCurrency, onSave, onCancel }: BudgetFormProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const expenseCategories = useMemo(() => categories.filter((category) => category.kind === "expense" && !category.isArchived), [categories]);
  const { control, handleSubmit, setValue, watch, formState } = useForm<BudgetInput>({
    resolver: zodResolver(budgetInputSchema),
    defaultValues: budget
      ? { categoryId: budget.categoryId, month: budget.month, amount: budget.amount, currency: budget.currency }
      : { categoryId: expenseCategories[0]?.id ?? "", month: defaultMonth, amount: "", currency: defaultCurrency }
  });
  const selectedCategoryId = watch("categoryId");
  const selectedCurrency = watch("currency");

  useEffect(() => {
    if (!expenseCategories.some((category) => category.id === selectedCategoryId)) {
      setValue("categoryId", expenseCategories[0]?.id ?? "", { shouldValidate: true });
    }
  }, [expenseCategories, selectedCategoryId, setValue]);

  const submit = handleSubmit(async (input) => {
    setFormError(null);
    const result = await onSave(input);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    onCancel();
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{budget ? "Update a monthly limit" : "New monthly limit"}</Text>
          <Text accessibilityRole="header" style={styles.title}>{budget ? "Edit budget" : "Create budget"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close budget form" onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        <FieldLabel label="Category" error={formState.errors.categoryId?.message}>
          <View style={styles.chips}>
            {expenseCategories.map((category) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCategoryId === category.id }} key={category.id} onPress={() => setValue("categoryId", category.id, { shouldValidate: true })} style={[styles.chip, selectedCategoryId === category.id && styles.selectedChip]}>
                <Text style={[styles.chipText, selectedCategoryId === category.id && styles.selectedChipText]}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
        </FieldLabel>

        <FieldLabel label="Monthly limit" error={formState.errors.amount?.message}>
          <Controller control={control} name="amount" render={({ field: { onBlur, onChange, value } }) => <TextInput accessibilityLabel="Monthly budget amount" autoCorrect={false} keyboardType="decimal-pad" onBlur={onBlur} onChangeText={onChange} placeholder="0.00" placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label="Month" error={formState.errors.month?.message}>
          <Controller control={control} name="month" render={({ field: { onBlur, onChange, value } }) => <TextInput accessibilityLabel="Budget month in YYYY-MM format" autoCorrect={false} onBlur={onBlur} onChangeText={onChange} placeholder="YYYY-MM" placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label="Currency" error={formState.errors.currency?.message}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.currencyRow}>
              {SUPPORTED_CURRENCIES.map((currency) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCurrency === currency }} key={currency} onPress={() => setValue("currency", currency as CurrencyCode, { shouldValidate: true })} style={[styles.chip, selectedCurrency === currency && styles.selectedChip]}>
                  <Text style={[styles.chipText, selectedCurrency === currency && styles.selectedChipText]}>{currency}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </FieldLabel>

        {formError ? <Text accessibilityRole="alert" style={styles.error}>{formError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={formState.isSubmitting} onPress={() => void submit()} style={styles.saveButton}>
          <Text style={styles.saveText}>{formState.isSubmitting ? "Saving…" : "Save budget"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}{error ? <Text style={styles.fieldError}>{error}</Text> : null}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minHeight: 500, padding: 20 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  closeText: { color: colors.text, fontSize: 26, fontWeight: "300", lineHeight: 28 },
  fields: { gap: 18, paddingBottom: 8 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: "800" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  selectedChipText: { color: colors.onPrimary },
  currencyRow: { flexDirection: "row", gap: 8 },
  fieldError: { color: colors.negative, fontSize: 13 },
  error: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", minHeight: 50 },
  saveText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  cancelButton: { alignItems: "center", justifyContent: "center", minHeight: 42 },
  cancelText: { color: colors.muted, fontSize: 14, fontWeight: "700" }
});
