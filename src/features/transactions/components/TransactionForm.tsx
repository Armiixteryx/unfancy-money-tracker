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

import { SUPPORTED_CURRENCIES, type CurrencyCode } from "../../../domain/currency";
import type { Category, Transaction } from "../../../domain/types";
import { transactionInputSchema, type TransactionInput } from "../../../domain/validation";
import { colors } from "../../../ui/theme";

export type TransactionFormResult = { ok: true } | { ok: false; message: string };

type TransactionFormProps = {
  categories: readonly Category[];
  transaction?: Transaction;
  onSave: (input: TransactionInput) => Promise<TransactionFormResult>;
  onCancel: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionForm({ categories, transaction, onSave, onCancel }: TransactionFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setValue, watch, formState } = useForm<TransactionInput>({
    resolver: zodResolver(transactionInputSchema),
    defaultValues: transaction
      ? {
          amount: transaction.amount,
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
          currency: "USD"
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
          <Text style={styles.eyebrow}>{transaction ? "Update a local record" : "New local record"}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {transaction ? "Edit transaction" : "Add transaction"}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close transaction form" onPress={onCancel} style={styles.closeButton}>
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
                {option === "expense" ? "Expense" : "Income"}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel label="Amount" error={formState.errors.amount?.message}>
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel="Amount"
                autoCorrect={false}
                keyboardType="decimal-pad"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="0.00"
                placeholderTextColor="#9FB3C8"
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label="Category" error={formState.errors.categoryId?.message}>
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
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {activeCategories.length === 0 ? <Text style={styles.helper}>Create an active category in Settings first.</Text> : null}
        </FieldLabel>

        <FieldLabel label="Description" error={formState.errors.description?.message}>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel="Description"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="What was this for?"
                placeholderTextColor="#9FB3C8"
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label="Date" error={formState.errors.date?.message}>
          <Controller
            control={control}
            name="date"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel="Date in YYYY-MM-DD format"
                autoCorrect={false}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9FB3C8"
                style={styles.input}
                value={value}
              />
            )}
          />
        </FieldLabel>

        <FieldLabel label="Currency" error={formState.errors.currency?.message}>
          <Controller
            control={control}
            name="currency"
            render={({ field: { value } }) => (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.currencyRow}>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: value === currency }}
                      key={currency}
                      onPress={() => setValue("currency", currency as CurrencyCode, { shouldValidate: true })}
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

        {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={formState.isSubmitting} onPress={() => void submit()} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>{formState.isSubmitting ? "Saving…" : "Save transaction"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minHeight: 520, padding: 20 },
  formHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  title: { color: colors.navy, fontSize: 22, fontWeight: "800" },
  closeButton: { alignItems: "center", borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  closeText: { color: colors.navy, fontSize: 26, fontWeight: "300", lineHeight: 28 },
  fields: { gap: 18, paddingBottom: 8 },
  segmentedControl: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  segment: { alignItems: "center", flex: 1, minHeight: 46, justifyContent: "center" },
  expenseSelected: { backgroundColor: "#FFF2F0" },
  incomeSelected: { backgroundColor: "#E9F7EF" },
  segmentText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  selectedSegmentText: { color: colors.navy },
  field: { gap: 7 },
  label: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.navy, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  currencyRow: { flexDirection: "row", gap: 8 },
  currencyChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  selectedChip: { backgroundColor: colors.navy, borderColor: colors.navy },
  categoryChipText: { color: colors.navy, fontSize: 13, fontWeight: "700" },
  selectedChipText: { color: colors.surface },
  helper: { color: colors.muted, fontSize: 13 },
  fieldError: { color: colors.coral, fontSize: 13 },
  formError: { backgroundColor: "#FFF2F0", borderRadius: 10, color: colors.coral, fontSize: 14, padding: 12 },
  saveButton: { alignItems: "center", backgroundColor: colors.navy, borderRadius: 12, minHeight: 50, justifyContent: "center", marginTop: 4 },
  saveButtonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  cancelButton: { alignItems: "center", minHeight: 42, justifyContent: "center" },
  cancelButtonText: { color: colors.muted, fontSize: 14, fontWeight: "700" }
});

