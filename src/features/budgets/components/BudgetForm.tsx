import { typography } from "../../../ui/designTokens";
import { AppText as Text, AppTextInput as TextInput } from "../../../ui/AppText";
import { normalizeAmountDraft } from "../../../localization/amountInput";
import { errorToken, DomainError } from "../../../domain/errors";
import { currencyPrecision } from "../../../domain/currency";
import { translateMessage } from "../../../localization/i18n";
import { amountDraft, getRegion } from "../../../localization/region";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { normalizeSelectedCurrencies, type CurrencyCode } from "../../../domain/currency";
import type { Budget, Category } from "../../../domain/types";
import { budgetInputSchema, type BudgetInput } from "../../../domain/validation";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";

export type BudgetFormResult = { ok: true } | { ok: false; message: string };

type BudgetFormProps = {
  categories: readonly Category[];
  budgets: readonly Budget[];
  selectedCurrencies: readonly CurrencyCode[];
  budget?: Budget;
  defaultMonth: string;
  defaultCurrency: CurrencyCode;
  onSave: (input: BudgetInput) => Promise<BudgetFormResult>;
  onCancel: () => void;
};

function eligibleExpenseCategories(categories: readonly Category[], budgets: readonly Budget[], month: string, editingBudgetId?: string): Category[] {
  const occupiedCategoryIds = new Set(
    budgets
      .filter((candidate) => candidate.id !== editingBudgetId && candidate.month === month)
      .map((candidate) => candidate.categoryId)
  );
  return categories.filter(
    (category) => category.kind === "expense" && !category.isArchived && !occupiedCategoryIds.has(category.id)
  );
}

export function BudgetForm({ categories, budgets, selectedCurrencies, budget, defaultMonth, defaultCurrency, onSave, onCancel }: BudgetFormProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [amountRegion] = useState(getRegion);
  const [formError, setFormError] = useState<string | null>(null);
  const currencies = useMemo(
    () => normalizeSelectedCurrencies(budget ? [...selectedCurrencies, budget.currency] : selectedCurrencies),
    [budget, selectedCurrencies]
  );
  const initialExpenseCategories = useMemo(
    () => eligibleExpenseCategories(categories, budgets, defaultMonth, budget?.id),
    [budget?.id, budgets, categories, defaultMonth]
  );
  const { control, handleSubmit, setValue, watch, formState } = useForm<BudgetInput>({
    resolver: async (values, context, options) => {
      let amount: string;
      try { amount = normalizeAmountDraft(values.amount, values.currency, amountRegion); }
      catch (error) { return { values: {}, errors: { amount: { type: "validate", message: error instanceof DomainError ? errorToken(error) : "invalid_amount_draft" } } }; }
      return zodResolver(budgetInputSchema)({ ...values, amount }, context, options);
    },
    defaultValues: budget
      ? { categoryId: budget.categoryId, month: budget.month, amount: amountDraft(budget.amount, amountRegion), currency: budget.currency }
      : { categoryId: initialExpenseCategories[0]?.id ?? "", month: defaultMonth, amount: "", currency: defaultCurrency }
  });
  const selectedMonth = watch("month");
  const selectedCategoryId = watch("categoryId");
  const selectedCurrency = watch("currency");
  const expenseCategories = useMemo(
    () => eligibleExpenseCategories(categories, budgets, selectedMonth, budget?.id),
    [budget?.id, budgets, categories, selectedMonth]
  );

  useEffect(() => {
    if (expenseCategories.some((category) => category.id === selectedCategoryId)) return;
    const nextCategoryId = expenseCategories[0]?.id ?? "";
    if (selectedCategoryId !== nextCategoryId) {
      setValue("categoryId", nextCategoryId, { shouldValidate: true });
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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>{budget ? i18n.t($ => $.ui.budgetsUpdateAMonthlyLimit) : i18n.t($ => $.ui.budgetsNewMonthlyLimit)}</Text>
          <Text accessibilityRole="header" style={styles.title}>{budget ? i18n.t($ => $.ui.budgetsEditBudget) : i18n.t($ => $.ui.budgetsCreateBudget)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsCloseBudgetForm)} onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        <FieldLabel label={i18n.t($ => $.ui.transactionsCategory)} error={formState.errors.categoryId?.message}>
          <View style={styles.chips}>
            {expenseCategories.map((category) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCategoryId === category.id }} key={category.id} onPress={() => setValue("categoryId", category.id, { shouldValidate: true })} style={[styles.chip, selectedCategoryId === category.id && styles.selectedChip]}>
                <Text style={[styles.chipText, selectedCategoryId === category.id && styles.selectedChipText]}>{categoryLabel(category)}</Text>
              </Pressable>
            ))}
          </View>
          {expenseCategories.length === 0 ? <Text style={styles.helper}>{i18n.t($ => $.ui.budgetsEveryActiveExpenseCategoryAlreadyHasA)}</Text> : null}
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.budgetsMonthlyLimit)} error={formState.errors.amount?.message === "invalid_amount_draft" ? `invalid_amount_draft:${amountDraft(currencyPrecision(watch("currency")) === 0 ? "12" : "12.5", amountRegion)}` : formState.errors.amount?.message}>
          <Controller control={control} name="amount" render={({ field: { onBlur, onChange, value, ref } }) => <TextInput ref={ref} accessibilityLabel={i18n.t($ => $.ui.budgetsMonthlyBudgetAmount)} autoCorrect={false} keyboardType="decimal-pad" onBlur={onBlur} onChangeText={onChange} placeholder={amountDraft(currencyPrecision(watch("currency")) === 0 ? "0" : "0.00", amountRegion)} placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.budgetsMonth)} error={formState.errors.month?.message}>
          <Controller control={control} name="month" render={({ field: { onBlur, onChange, value, ref } }) => <TextInput ref={ref} accessibilityLabel={i18n.t($ => $.ui.budgetsBudgetMonthInYyyyMmFormat)} autoCorrect={false} onBlur={onBlur} onChangeText={onChange} placeholder="YYYY-MM" placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsCurrency)} error={formState.errors.currency?.message}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.currencyRow}>
              {currencies.map((currency) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCurrency === currency }} key={currency} onPress={() => setValue("currency", currency, { shouldValidate: true })} style={[styles.chip, selectedCurrency === currency && styles.selectedChip]}>
                  <Text style={[styles.chipText, selectedCurrency === currency && styles.selectedChipText]}>{currency}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </FieldLabel>

        {formError ? <Text accessibilityRole="alert" style={styles.error}>{translateMessage(formError, true)}</Text> : null}
        <Pressable accessibilityRole="button" disabled={formState.isSubmitting || expenseCategories.length === 0} onPress={() => void submit()} style={[styles.saveButton, (formState.isSubmitting || expenseCategories.length === 0) && styles.disabledSaveButton]}>
          <Text style={styles.saveText}>{formState.isSubmitting ? i18n.t($ => $.ui.transactionsSaving) : i18n.t($ => $.ui.budgetsSaveBudget)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}{error ? <Text style={styles.fieldError}>{translateMessage(error, true)}</Text> : null}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 0, padding: 20 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 14, fontWeight: "500", marginBottom: 4 },
  title: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  closeText: { color: colors.text, fontSize: 26, fontWeight: "300", lineHeight: 28 },
  fields: { gap: 18, paddingBottom: 8 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: "500" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 48, justifyContent: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  selectedChipText: { color: colors.onPrimary },
  currencyRow: { flexDirection: "row", gap: 8 },
  helper: { color: colors.muted, fontSize: 14 },
  fieldError: { color: colors.negative, fontSize: 14 },
  error: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, padding: 12 },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 9999, justifyContent: "center", minHeight: 50 },
  disabledSaveButton: { opacity: 0.5 },
  saveText: { color: colors.onPrimary, fontSize: 15, fontWeight: "500" },
  cancelButton: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  cancelText: { color: colors.muted, fontSize: 14, fontWeight: "500" }
});
