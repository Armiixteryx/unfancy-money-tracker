import { layout, typography } from "../../../ui/designTokens";
import { AppText as Text, AppTextInput as TextInput } from "../../../ui/AppText";
import { normalizeAmountDraft } from "../../../localization/amountInput";
import { errorToken, DomainError } from "../../../domain/errors";
import { currencyPrecision, normalizeSelectedCurrencies, type CurrencyCode } from "../../../domain/currency";
import { translateMessage } from "../../../localization/i18n";
import { amountDraft, getRegion } from "../../../localization/region";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { BudgetPlannedExpense } from "../../../domain/types";
import { plannedExpenseInputSchema, type PlannedExpenseInput } from "../../../domain/validation";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { selectionStyles } from "../../../ui/selectionStyles";

export type PlannedExpenseFormResult = { ok: true } | { ok: false; message: string };

type PlannedExpenseFormProps = {
  item?: BudgetPlannedExpense;
  categoryName: string;
  month: string;
  defaultCurrency: CurrencyCode;
  selectedCurrencies: readonly CurrencyCode[];
  saveDisabled?: boolean;
  onRetryLocalSave?: () => void;
  onSave: (input: PlannedExpenseInput) => Promise<PlannedExpenseFormResult>;
  onCancel: () => void;
};

export function PlannedExpenseForm({ item, categoryName, month, defaultCurrency, selectedCurrencies, saveDisabled = false, onRetryLocalSave, onSave, onCancel }: PlannedExpenseFormProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [amountRegion] = useState(getRegion);
  const [formError, setFormError] = useState<string | null>(null);
  const currencies = useMemo(
    () => normalizeSelectedCurrencies(item ? [...selectedCurrencies, item.currency] : [...selectedCurrencies, defaultCurrency]),
    [defaultCurrency, item, selectedCurrencies],
  );
  const { control, handleSubmit, setValue, watch, formState } = useForm<PlannedExpenseInput>({
    resolver: async (values, context, options) => {
      let amount: string;
      try { amount = normalizeAmountDraft(values.amount, values.currency, amountRegion); }
      catch (error) { return { values: {}, errors: { amount: { type: "validate", message: error instanceof DomainError ? errorToken(error) : "invalid_amount_draft" } } }; }
      return zodResolver(plannedExpenseInputSchema)({ ...values, amount }, context, options);
    },
    defaultValues: item
      ? { description: item.description, amount: amountDraft(item.amount, amountRegion), currency: item.currency }
      : { description: "", amount: "", currency: defaultCurrency },
  });
  const currency = watch("currency");

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
          <Text style={styles.eyebrow}>{i18n.t($ => $.ui.budgetsPlannedExpenseList)}</Text>
          <Text accessibilityRole="header" style={styles.title}>{item ? i18n.t($ => $.ui.budgetsEditPlannedExpense) : i18n.t($ => $.ui.budgetsAddPlannedExpense)}</Text>
          <Text style={styles.context}>{i18n.t($ => $.ui.budgetsPlannedExpenseContext, { category: categoryName, month })}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsClosePlannedExpenseForm)} onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        <FieldLabel label={i18n.t($ => $.ui.transactionsDescription)} error={formState.errors.description?.message}>
          <Controller control={control} name="description" render={({ field: { onBlur, onChange, value, ref } }) => <TextInput ref={ref} accessibilityLabel={i18n.t($ => $.ui.transactionsDescription)} onBlur={onBlur} onChangeText={onChange} placeholder={i18n.t($ => $.ui.transactionsWhatWasThisFor)} placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsAmount)} error={formState.errors.amount?.message === "invalid_amount_draft" ? `invalid_amount_draft:${amountDraft(currencyPrecision(currency) === 0 ? "12" : "12.5", amountRegion)}` : formState.errors.amount?.message}>
          <Controller control={control} name="amount" render={({ field: { onBlur, onChange, value, ref } }) => <TextInput ref={ref} accessibilityLabel={i18n.t($ => $.ui.transactionsAmount)} autoCorrect={false} keyboardType="decimal-pad" onBlur={onBlur} onChangeText={onChange} placeholder={amountDraft(currencyPrecision(currency) === 0 ? "0" : "0.00", amountRegion)} placeholderTextColor={colors.placeholder} style={styles.input} value={value} />} />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsCurrency)} error={formState.errors.currency?.message}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.currencyRow}>
              {currencies.map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: currency === option }} key={option} onPress={() => setValue("currency", option, { shouldValidate: true })} style={[styles.chip, currency === option && styles.selectedControl]}><Text style={[styles.chipText, currency === option && styles.selectedText]}>{option}</Text></Pressable>)}
            </View>
          </ScrollView>
        </FieldLabel>

        {formError ? <Text accessibilityRole="alert" style={styles.error}>{translateMessage(formError, true)}</Text> : null}
        {saveDisabled && onRetryLocalSave ? <Pressable accessibilityRole="button" onPress={onRetryLocalSave} style={styles.retryButton}><Text style={styles.retryText}>{i18n.t($ => $.ui.budgetsRetryLocalSave)}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={formState.isSubmitting || saveDisabled} onPress={() => void submit()} style={[styles.saveButton, (formState.isSubmitting || saveDisabled) && styles.disabledSaveButton]}>
          <Text style={styles.saveText}>{formState.isSubmitting ? i18n.t($ => $.ui.transactionsSaving) : i18n.t($ => $.ui.budgetsSavePlannedExpense)}</Text>
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

const createStyles = (colors: ThemeColors) => {
  const selection = selectionStyles(colors);
  return StyleSheet.create({
    container: { alignSelf: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.cardRadius, borderWidth: 1, flex: 1, maxWidth: layout.formMaxWidth, minHeight: 0, padding: 20, width: "100%" },
    header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
    eyebrow: { color: colors.muted, fontSize: 14, fontWeight: "500", marginBottom: 4 },
    title: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
    context: { color: colors.muted, fontSize: 14, marginTop: 4 },
    closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: layout.pillRadius, borderWidth: 1, height: layout.touchTarget, justifyContent: "center", width: layout.touchTarget },
    closeText: { color: colors.text, fontSize: 26, fontWeight: "300", lineHeight: 28 },
    fields: { gap: 18, paddingBottom: 8 },
    field: { gap: 7 },
    label: { color: colors.text, fontSize: 14, fontWeight: "500" },
    input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.inputRadius, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: layout.touchTarget, paddingHorizontal: 14 },
    currencyRow: { flexDirection: "row", gap: 8 },
    chip: { minHeight: layout.touchTarget, justifyContent: "center", borderColor: colors.border, borderRadius: layout.pillRadius, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
    selectedControl: { ...selection.selectedControl },
    chipText: { color: colors.text, fontSize: 14, fontWeight: "500" },
    selectedText: { ...selection.selectedText },
    fieldError: { color: colors.negative, fontSize: 14 },
    error: { backgroundColor: colors.negativeSubtle, borderRadius: layout.cardRadius, color: colors.negative, fontSize: 14, padding: 12 },
    saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: layout.pillRadius, justifyContent: "center", minHeight: 50 },
    disabledSaveButton: { opacity: 0.5 },
    retryButton: { alignItems: "center", borderColor: colors.border, borderRadius: layout.pillRadius, borderWidth: 1, justifyContent: "center", minHeight: layout.touchTarget, paddingHorizontal: 14 },
    retryText: { color: colors.text, fontSize: 14, fontWeight: "500" },
    saveText: { color: colors.onPrimary, fontSize: 15, fontWeight: "500" },
    cancelButton: { alignItems: "center", justifyContent: "center", minHeight: 48 },
    cancelText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  });
};
