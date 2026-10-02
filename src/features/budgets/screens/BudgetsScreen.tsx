import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { calculateBudgetProgress, formatMonthLabel, shiftCalendarMonth, type BudgetProgress } from "../../../domain";
import type { BudgetInput } from "../../../domain/validation";
import { currentCalendarMonth } from "../../../domain/aggregates";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { BudgetForm, type BudgetFormResult } from "../components/BudgetForm";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

type FormState = { mode: "new" } | { mode: "edit"; id: string } | null;

export function BudgetsScreen() {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const addBudget = useLocalDatasetStore((state) => state.addBudget);
  const editBudget = useLocalDatasetStore((state) => state.editBudget);
  const deleteBudget = useLocalDatasetStore((state) => state.deleteBudget);
  const saveError = useLocalDatasetStore((state) => state.saveError);
  const analytics = useAnalytics();
  const [month, setMonth] = useState(currentCalendarMonth());
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isBrowserWorkspace = width >= 900;

  const progress = useMemo<BudgetProgress[]>(() => {
    if (!dataset) return [];
    return dataset.budgets
      .filter((budget) => budget.month === month)
      .map((budget) => calculateBudgetProgress(budget, dataset.transactions, dataset.categories.find((category) => category.id === budget.categoryId)?.name))
      .sort((left, right) => right.percentUsed - left.percentUsed);
  }, [dataset, month]);

  if (!dataset) return null;

  const selectedBudget = formState?.mode === "edit" ? dataset.budgets.find((budget) => budget.id === formState.id) : undefined;
  const onSave = async (input: BudgetInput): Promise<BudgetFormResult> => {
    const result = selectedBudget ? await editBudget(selectedBudget.id, input) : await addBudget(input);
    if (!result.ok) return result;
    if (!selectedBudget) void analytics.capture("budget_created", { surface: "budgets", actionResult: "success" });
    setMessage(selectedBudget ? "Budget updated locally." : "Budget created locally.");
    return { ok: true };
  };
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const result = await deleteBudget(pendingDeleteId);
    setPendingDeleteId(null);
    setMessage(result.ok ? "Budget deleted locally." : result.message);
  };
  const form = formState ? <BudgetForm budget={selectedBudget} budgets={dataset.budgets} categories={dataset.categories} defaultCurrency={dataset.preferences.baseCurrency} defaultMonth={month} onCancel={() => setFormState(null)} onSave={onSave} selectedCurrencies={dataset.preferences.selectedCurrencies} /> : null;

  return (
    <AppScreen eyebrow="Monthly planning" title="Budgets">
      <View style={styles.toolbar}>
        <View style={styles.monthControl}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous budget month" onPress={() => setMonth((value) => shiftCalendarMonth(value, -1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable>
          <Text accessibilityRole="header" style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next budget month" onPress={() => setMonth((value) => shiftCalendarMonth(value, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setMessage(null); setFormState({ mode: "new" }); }} style={styles.addButton}><Text style={styles.addButtonText}>＋ Create budget</Text></Pressable>
      </View>

      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{saveError}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{message}</Text> : null}
      {pendingDeleteId ? <View style={styles.confirmation}><Text style={styles.confirmationText}>Delete this budget? You can’t undo this action here.</Text><View style={styles.confirmationActions}><Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.cancelSmall}><Text style={styles.cancelSmallText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void confirmDelete()} style={styles.deleteSmall}><Text style={styles.deleteSmallText}>Delete budget</Text></Pressable></View></View> : null}

      <View style={[styles.workspace, isBrowserWorkspace && styles.browserWorkspace]}>
        <View style={styles.listCard}>
          <View style={styles.listHeader}><View><Text style={styles.cardTitle}>Budget attention</Text><Text style={styles.cardHint}>Expense categories · {formatMonthLabel(month)}</Text></View><Text style={styles.count}>{progress.length} {progress.length === 1 ? "budget" : "budgets"}</Text></View>
          {progress.length === 0 ? <View style={styles.emptyWrap}><EmptyState title="No budgets for this month" description="Create a category limit to compare local expense activity with a monthly plan." /><Pressable accessibilityRole="button" onPress={() => setFormState({ mode: "new" })} style={styles.emptyAction}><Text style={styles.addButtonText}>＋ Create budget</Text></Pressable></View> : <View style={styles.cards}>{progress.map((item) => <BudgetCard key={item.budget.id} progress={item} onEdit={() => setFormState({ mode: "edit", id: item.budget.id })} onDelete={() => setPendingDeleteId(item.budget.id)} />)}</View>}
        </View>
        {isBrowserWorkspace ? form : null}
      </View>
      {!isBrowserWorkspace ? <Modal animationType="slide" onRequestClose={() => setFormState(null)} visible={Boolean(formState)}><View style={styles.mobileModal}>{form}</View></Modal> : null}
    </AppScreen>
  );
}

function BudgetCard({ progress, onEdit, onDelete }: { progress: BudgetProgress; onEdit: () => void; onDelete: () => void }) {
  const styles = useThemedStyles(createStyles);
  const usedWidth = `${Math.min(progress.percentUsed, 100)}%` as `${number}%`;
  const statusLabel = progress.status === "over_budget" ? "Over budget" : progress.status === "attention" ? "Near limit" : "On track";
  return <View style={styles.budgetCard}>
    <View style={styles.cardTop}><View><Text style={styles.categoryName}>{progress.categoryName}</Text><Text style={styles.meta}>{progress.budget.currency} · {progress.budget.month}</Text></View><Text style={[styles.status, progress.status === "over_budget" ? styles.overStatus : progress.status === "attention" ? styles.attentionStatus : styles.onTrackStatus]}>{statusLabel}</Text></View>
    <View style={styles.amountRow}><View><Text style={styles.amountLabel}>Spent</Text><Text style={styles.spent}>{progress.spent.currency} {progress.spent.amount}</Text></View><View style={styles.amountRight}><Text style={styles.amountLabel}>Limit</Text><Text style={styles.limit}>{progress.budget.currency} {progress.budget.amount}</Text></View></View>
    <View accessibilityLabel={`${Math.round(progress.percentUsed)} percent of budget used`} style={styles.progressTrack}><View style={[styles.progressFill, progress.status === "over_budget" ? styles.overFill : progress.status === "attention" ? styles.attentionFill : styles.onTrackFill, { width: usedWidth }]} /></View>
    <Text style={styles.remaining}>{progress.remaining.amount.startsWith("-") ? `${progress.budget.currency} ${progress.remaining.amount.slice(1)} over the limit` : `${progress.budget.currency} ${progress.remaining.amount} remaining`}</Text>
    {progress.otherCurrencySpending.length > 0 ? <Text style={styles.note}>Other-currency spending is shown separately until an exchange rate is available.</Text> : null}
    <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={onEdit} style={styles.editButton}><Text style={styles.editText}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${progress.categoryName} budget`} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Delete</Text></Pressable></View>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  monthControl: { alignItems: "center", flexDirection: "row", gap: 10 },
  monthButton: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  monthButtonText: { color: colors.text, fontSize: 28, fontWeight: "300", lineHeight: 30 },
  monthLabel: { color: colors.text, fontSize: 18, fontWeight: "800", minWidth: 118, textAlign: "center" },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: colors.positiveSubtle, borderRadius: 10, color: colors.positive, fontSize: 14, padding: 12 },
  confirmation: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 14, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: 16 },
  confirmationText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 19, minWidth: 220 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmall: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 12 },
  cancelSmallText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  deleteSmall: { backgroundColor: colors.negative, borderRadius: 10, justifyContent: "center", minHeight: 42, paddingHorizontal: 12 },
  deleteSmallText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  workspace: { gap: 18 },
  browserWorkspace: { alignItems: "flex-start", flexDirection: "row" },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minWidth: 0, padding: 18 },
  listHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  cardHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  count: { color: colors.muted, fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingVertical: 8 },
  emptyAction: { backgroundColor: colors.positive, borderRadius: 12, marginTop: 24, minHeight: 46, justifyContent: "center", paddingHorizontal: 16 },
  cards: { gap: 12, paddingTop: 14 },
  budgetCard: { borderColor: colors.divider, borderRadius: 16, borderWidth: 1, gap: 12, padding: 16 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  categoryName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  status: { borderRadius: 999, fontSize: 12, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  onTrackStatus: { backgroundColor: colors.positiveSubtle, color: colors.positive },
  attentionStatus: { backgroundColor: colors.warningSubtle, color: colors.warning },
  overStatus: { backgroundColor: colors.negativeSubtle, color: colors.negative },
  amountRow: { flexDirection: "row", justifyContent: "space-between" },
  amountRight: { alignItems: "flex-end" },
  amountLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  spent: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 3 },
  limit: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 3 },
  progressTrack: { backgroundColor: colors.track, borderRadius: 999, height: 10, overflow: "hidden" },
  progressFill: { borderRadius: 999, height: 10 },
  onTrackFill: { backgroundColor: colors.positive },
  attentionFill: { backgroundColor: colors.warning },
  overFill: { backgroundColor: colors.negative },
  remaining: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  cardActions: { flexDirection: "row", gap: 8 },
  editButton: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 13 },
  editText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  deleteButton: { justifyContent: "center", minHeight: 40, paddingHorizontal: 8 },
  deleteText: { color: colors.negative, fontSize: 13, fontWeight: "800" },
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
