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
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { normalizeSelectedCurrencies, type CurrencyCode } from "../../../domain/currency";
import type { Category, Transaction } from "../../../domain/types";
import { transactionInputSchema, type TransactionInput } from "../../../domain/validation";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";

export type TransactionFormResult = { ok: true } | { ok: false; message: string };

type TransactionFormProps = {
  categories: readonly Category[];
  selectedCurrencies: readonly CurrencyCode[];
  baseCurrency: CurrencyCode;
  transaction?: Transaction;
  onSave: (input: TransactionInput) => Promise<TransactionFormResult>;
  onCancel: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionForm({ categories, selectedCurrencies, baseCurrency, transaction, onSave, onCancel }: TransactionFormProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [amountRegion] = useState(getRegion);
  const [formError, setFormError] = useState<string | null>(null);
  const currencies = useMemo(
    () => normalizeSelectedCurrencies(transaction ? [...selectedCurrencies, transaction.currency] : selectedCurrencies),
    [selectedCurrencies, transaction]
  );
  const { control, handleSubmit, setValue, watch, formState } = useForm<TransactionInput>({
    resolver: async (values, context, options) => {
      let amount: string;
      try { amount = normalizeAmountDraft(values.amount, values.currency, amountRegion); }
      catch (error) { return { values: {}, errors: { amount: { type: "validate", message: error instanceof DomainError ? errorToken(error) : "invalid_amount_draft" } } }; }
      return zodResolver(transactionInputSchema)({ ...values, amount }, context, options);
    },
    defaultValues: transaction
      ? {
          amount: amountDraft(transaction.amount, amountRegion),
          type: transaction.type,
          categoryId: transaction.categoryId,
          description: transaction.description,
          date: transaction.date,
          currency: transaction.currency
        }
      : {
          amount: "",
          type: "expense",
          categoryId: "",
          description: "",
          date: today(),
          currency: baseCurrency
        }
  });

  const type = watch("type");
  const selectedCategoryId = watch("categoryId");
  const activeCategories = useMemo(
    () => categories.filter((category) => category.kind === type && !category.isArchived),
    [categories, type]
  );

  useEffect(() => {
    if (!activeCategories.some((category) => category.id === selectedCategoryId)) {
      setValue("categoryId", activeCategories[0]?.id ?? "", { shouldValidate: true });
    }
  }, [activeCategories, selectedCategoryId, setValue]);

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
      <View style={styles.formHeader}>
        <View>
          <Text style={styles.eyebrow}>{transaction ? i18n.t($ => $.ui.transactionsUpdateALocalRecord) : i18n.t($ => $.ui.transactionsNewLocalRecord)}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {transaction ? i18n.t($ => $.ui.transactionsEditTransaction) : i18n.t($ => $.ui.transactionsAddTransaction)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.transactionsCloseTransactionForm)} onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
        <View style={styles.segmentedControl}>
          {(["expense", "income"] as const).map((option) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: type === option }}
              key={option}
              onPress={() => setValue("type", option, { shouldValidate: true })}
              style={[styles.segment, type === option && (option === "expense" ? styles.expenseSelected : styles.incomeSelected)]}
            >
              <Text style={[styles.segmentText, type === option && styles.selectedSegmentText]}>
                {option === "expense" ? i18n.t($ => $.ui.transactionsExpense) : i18n.t($ => $.ui.dashboardIncome)}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel label={i18n.t($ => $.ui.transactionsAmount)} error={formState.errors.amount?.message === "invalid_amount_draft" ? `invalid_amount_draft:${amountDraft(currencyPrecision(watch("currency")) === 0 ? "12" : "12.5", amountRegion)}` : formState.errors.amount?.message}>
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={i18n.t($ => $.ui.transactionsAmount)}
                autoCorrect={false}
                keyboardType="decimal-pad"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={amountDraft(currencyPrecision(watch("currency")) === 0 ? "0" : "0.00", amountRegion)}
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsCategory)} error={formState.errors.categoryId?.message}>
          <View style={styles.chipGrid}>
            {activeCategories.map((category) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategoryId === category.id }}
                key={category.id}
                onPress={() => setValue("categoryId", category.id, { shouldValidate: true })}
                style={[styles.categoryChip, selectedCategoryId === category.id && styles.selectedChip]}
              >
                <Text style={[styles.categoryChipText, selectedCategoryId === category.id && styles.selectedChipText]}>
                  {categoryLabel(category)}
                </Text>
              </Pressable>
            ))}
          </View>
          {activeCategories.length === 0 ? <Text style={styles.helper}>{i18n.t($ => $.ui.transactionsCreateAnActiveCategoryInSettingsFirst)}</Text> : null}
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsDescription)} error={formState.errors.description?.message}>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={i18n.t($ => $.ui.transactionsDescription)}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder={i18n.t($ => $.ui.transactionsWhatWasThisFor)}
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsDate)} error={formState.errors.date?.message}>
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={i18n.t($ => $.ui.transactionsDateInYyyyMmDdFormat)}
                autoCorrect={false}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label={i18n.t($ => $.ui.transactionsCurrency)} error={formState.errors.currency?.message}>
          <Controller
            control={control}
            name="currency"
            render={({ field: { value } }) => (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.currencyRow}>
                  {currencies.map((currency) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: value === currency }}
                      key={currency}
                      onPress={() => setValue("currency", currency, { shouldValidate: true })}
                      style={[styles.currencyChip, value === currency && styles.selectedChip]}
                    >
                      <Text style={[styles.categoryChipText, value === currency && styles.selectedChipText]}>{currency}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          />
        </FieldLabel>

        {formError ? <Text accessibilityRole="alert" style={styles.formError}>{translateMessage(formError, true)}</Text> : null}
        <Pressable accessibilityRole="button" disabled={formState.isSubmitting} onPress={() => void submit()} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>{formState.isSubmitting ? i18n.t($ => $.ui.transactionsSaving) : i18n.t($ => $.ui.transactionsSaveTransaction)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>{i18n.t($ => $.ui.commonCancel)}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{translateMessage(error, true)}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minHeight: 520, padding: 20 },
  formHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  closeText: { color: colors.text, fontSize: 26, fontWeight: "300", lineHeight: 28 },
  fields: { gap: 18, paddingBottom: 8 },
  segmentedControl: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  segment: { alignItems: "center", flex: 1, minHeight: 46, justifyContent: "center" },
  expenseSelected: { backgroundColor: colors.negativeSubtle },
  incomeSelected: { backgroundColor: colors.positiveSubtle },
  segmentText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  selectedSegmentText: { color: colors.text },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: "800" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  currencyRow: { flexDirection: "row", gap: 8 },
  currencyChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  selectedChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  selectedChipText: { color: colors.onPrimary },
  helper: { color: colors.muted, fontSize: 13 },
  fieldError: { color: colors.negative, fontSize: 13 },
  formError: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, minHeight: 50, justifyContent: "center", marginTop: 4 },
  saveButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  cancelButton: { alignItems: "center", minHeight: 42, justifyContent: "center" },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontWeight: "700" }
});
