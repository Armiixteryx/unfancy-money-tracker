import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../../ui/controls";
import { isWebWorkspace, typography } from "../../../ui/designTokens";
import { AppText as Text } from "../../../ui/AppText";
import { formatMonth as formatMonthLabel } from "../../../localization/region";
import type { Message } from "../../../localization/notices";
import { translateMessage } from "../../../localization/i18n";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { calculateBudgetProgress, shiftCalendarMonth, type BudgetProgress } from "../../../domain";
import type { BudgetInput } from "../../../domain/validation";
import { formatMoneyForDisplay } from "../../../domain/money";
import { currentCalendarMonth } from "../../../domain/aggregates";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore, type CopyBudgetsResult, type MutationResult } from "../../local-data/store/useLocalDatasetStore";
import { BudgetForm, type BudgetFormResult } from "../components/BudgetForm";
import { CopyBudgetsForm } from "../components/CopyBudgetsForm";
import { useAnalytics } from "../../../providers/AnalyticsProvider";
import { useAuth } from "../../auth/AuthProvider";
import { canManageTrackerSettings } from "../../../domain/trackerPermissions";

type FormState = { mode: "new" } | { mode: "edit"; id: string } | { mode: "copy" } | null;

export function BudgetsScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { new: newParam } = useLocalSearchParams<{ new?: string }>();
  const { width } = useWindowDimensions();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const auth = useAuth();
  const canManage = dataset ? canManageTrackerSettings(dataset, auth.subject) : false;
  const addBudget = useLocalDatasetStore((state) => state.addBudget);
  const editBudget = useLocalDatasetStore((state) => state.editBudget);
  const copyBudgets = useLocalDatasetStore((state) => state.copyBudgets);
  const deleteBudget = useLocalDatasetStore((state) => state.deleteBudget);
  const saveError = useLocalDatasetStore((state) => state.saveError);
  const analytics = useAnalytics();
  const [month, setMonth] = useState(currentCalendarMonth());
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const isBrowserWorkspace = isWebWorkspace(Platform.OS, width);

  const progress = useMemo<BudgetProgress[]>(() => {
    if (!dataset) return [];
    return dataset.budgets
      .filter((budget) => budget.month === month)
      .map((budget) => calculateBudgetProgress(budget, dataset.transactions, categoryLabel(dataset.categories.find((category) => category.id === budget.categoryId))))
      .sort((left, right) => right.percentUsed - left.percentUsed);
  }, [dataset, month]);

  useEffect(() => {
    if (!dataset || !newParam || !canManage) return;
    setFormState({ mode: "new" });
    router.setParams({ new: undefined });
  }, [canManage, dataset, newParam, router]);

  if (!dataset) return null;

  const selectedBudget = formState?.mode === "edit" ? dataset.budgets.find((budget) => budget.id === formState.id) : undefined;
  const onSave = async (input: BudgetInput): Promise<BudgetFormResult> => {
    const result = selectedBudget ? await editBudget(selectedBudget.id, input) : await addBudget(input);
    if (!result.ok) return result;
    if (!selectedBudget) void analytics.capture("budget_created", { surface: "budgets", actionResult: "success" });
    setMessage(selectedBudget ? i18n.t($ => $.ui.budgetsBudgetUpdatedLocally) : i18n.t($ => $.ui.budgetsBudgetCreatedLocally));
    return { ok: true };
  };
  const onCopy = async (sourceMonth: `${number}-${number}`, targetMonth: `${number}-${number}`): Promise<MutationResult<CopyBudgetsResult>> => {
    const result = await copyBudgets(sourceMonth, targetMonth);
    if (!result.ok) return result;
    setFormState(null);
    setMessage({ code: "budgetsCopied", count: result.value.created.length, month: sourceMonth, skipped: result.value.skipped });
    void analytics.capture("budget_created", { surface: "budgets", actionResult: "success" });
    return result;
  };
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const result = await deleteBudget(pendingDeleteId);
    setPendingDeleteId(null);
    setMessage(result.ok ? i18n.t($ => $.ui.budgetsBudgetDeletedLocally) : result.message);
  };
  const form = formState && formState.mode !== "copy" ? <BudgetForm budget={selectedBudget} budgets={dataset.budgets} categories={dataset.categories} defaultCurrency={dataset.preferences.baseCurrency} defaultMonth={month} onCancel={() => setFormState(null)} onSave={onSave} selectedCurrencies={dataset.preferences.selectedCurrencies} /> : null;
  const copyForm = formState?.mode === "copy" ? <CopyBudgetsForm budgets={dataset.budgets} categories={dataset.categories} targetMonth={month} initialSourceMonth={shiftCalendarMonth(month, -1)} onCancel={() => setFormState(null)} onCopy={onCopy} /> : null;

  return (
    <AppScreen eyebrow={i18n.t($ => $.ui.budgetsMonthlyPlanning)} title={i18n.t($ => $.ui.navigationBudgets)} actions={canManage ? <Button label={i18n.t($ => $.ui.budgetsCreateBudgetAlternative)} onPress={() => { setMessage(null); setFormState({ mode: "new" }); }} /> : undefined}>
      {!canManage ? <Text style={styles.errorBanner}>{auth.identity ? (i18n.resolvedLanguage === "es" ? "Solo los administradores gestionan presupuestos." : "Only tracker admins can manage budgets.") : (i18n.resolvedLanguage === "es" ? "Inicia sesión para sincronizar este conjunto compartido." : "Sign in to sync this shared tracker.")}</Text> : null}
      <View style={styles.toolbar}>
        <View style={styles.monthControl}>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsPreviousBudgetMonth)} onPress={() => setMonth((value) => shiftCalendarMonth(value, -1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable>
          <Text accessibilityRole="header" style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsNextBudgetMonth)} onPress={() => setMonth((value) => shiftCalendarMonth(value, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable>
        </View>
        <View style={styles.toolbarActions}>
          {canManage ? <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsCopyBudgetsFromAnotherMonth)} onPress={() => { setMessage(null); setFormState({ mode: "copy" }); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.budgetsCopyFromAnotherMonth)}</Text></Pressable> : null}

        </View>
      </View>

      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{translateMessage(saveError, true)}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{translateMessage(message, false)}</Text> : null}
      {pendingDeleteId ? <View style={styles.confirmation}><Text style={styles.confirmationText}>{i18n.t($ => $.ui.budgetsDeleteThisBudgetYouCanTUndo)}</Text><View style={styles.confirmationActions}><Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.cancelSmall}><Text style={styles.cancelSmallText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void confirmDelete()} style={styles.deleteSmall}><Text style={styles.deleteSmallText}>{i18n.t($ => $.ui.budgetsDeleteBudget)}</Text></Pressable></View></View> : null}

      <View style={[styles.workspace, isBrowserWorkspace && styles.browserWorkspace]}>
        <View style={styles.listCard}>
          {progress.length === 0 ? <View style={styles.emptyWrap}><EmptyState title={i18n.t($ => $.ui.budgetsNoBudgetsForThisMonth)} description={i18n.t($ => $.ui.budgetsCreateACategoryLimitToCompareLocal)} />{canManage ? <View style={styles.emptyActions}><Pressable accessibilityRole="button" onPress={() => setFormState({ mode: "new" })} style={styles.emptyAction}><Text style={styles.addButtonText}>{i18n.t($ => $.ui.budgetsCreateBudgetAlternative)}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { setMessage(null); setFormState({ mode: "copy" }); }} style={styles.emptyCopyAction}><Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.budgetsCopyFromAnotherMonth)}</Text></Pressable></View> : null}</View> : <View style={styles.cards}>{progress.map((item) => <BudgetCard key={item.budget.id} progress={item} canManage={canManage} onEdit={() => setFormState({ mode: "edit", id: item.budget.id })} onDelete={() => setPendingDeleteId(item.budget.id)} />)}</View>}
        </View>
        {isBrowserWorkspace && (form || copyForm) ? <View style={styles.formPane}>{form ?? copyForm}</View> : null}
      </View>
      {!isBrowserWorkspace ? <Modal animationType="slide" onRequestClose={() => setFormState(null)} visible={Boolean(formState)}><SafeAreaView style={styles.mobileModal}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>{form ?? copyForm}</KeyboardAvoidingView></SafeAreaView></Modal> : null}
    </AppScreen>
  );
}

function BudgetCard({ progress, onEdit, onDelete, canManage = true }: { progress: BudgetProgress; onEdit: () => void; onDelete: () => void; canManage?: boolean }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const usedWidth = `${Math.min(progress.percentUsed, 100)}%` as `${number}%`;
  const statusLabel = progress.status === "over_budget" ? i18n.t($ => $.ui.budgetsOverBudget) : progress.status === "attention" ? i18n.t($ => $.ui.budgetsNearLimit) : i18n.t($ => $.ui.budgetsOnTrack);
  return <View style={styles.budgetCard}>
    <View style={styles.cardTop}><View><Text style={styles.categoryName}>{categoryLabel(useLocalDatasetStore.getState().dataset?.categories.find(category => category.id === progress.budget.categoryId))}</Text><Text style={styles.meta}>{progress.budget.currency} · {progress.budget.month}</Text></View><Text style={[styles.status, progress.status === "over_budget" ? styles.overStatus : progress.status === "attention" ? styles.attentionStatus : styles.onTrackStatus]}>{statusLabel}</Text></View>
    <View style={styles.amountRow}><View><Text style={styles.amountLabel}>{i18n.t($ => $.ui.budgetsSpent)}</Text><Text style={styles.spent}>{formatMoneyForDisplay(progress.spent)}</Text></View><View style={styles.amountRight}><Text style={styles.amountLabel}>{i18n.t($ => $.ui.budgetsLimit)}</Text><Text style={styles.limit}>{formatMoneyForDisplay({ amount: progress.budget.amount, currency: progress.budget.currency })}</Text></View></View>
    <View accessibilityRole="progressbar" accessibilityLabel={categoryLabel(useLocalDatasetStore.getState().dataset?.categories.find(category => category.id === progress.budget.categoryId))} accessibilityValue={{ min: 0, max: 100, now: Math.min(Math.round(progress.percentUsed), 100), text: i18n.t($ => $.ui.budgetsPercentUsed, { percent: Math.round(progress.percentUsed) }) }} style={styles.progressTrack}><View style={[styles.progressFill, progress.status === "over_budget" ? styles.overFill : progress.status === "attention" ? styles.attentionFill : styles.onTrackFill, { width: usedWidth }]} /></View>
    <Text style={styles.remaining}>{progress.remaining.amount.startsWith("-") ? i18n.t($ => $.ui.budgetsAmountOver, { amount: formatMoneyForDisplay({ ...progress.remaining, amount: progress.remaining.amount.slice(1) }) }) : i18n.t($ => $.ui.budgetsAmountRemaining, { amount: formatMoneyForDisplay(progress.remaining) })}</Text>
    {progress.otherCurrencySpending.length > 0 ? <Text style={styles.note}>{i18n.t($ => $.ui.budgetsOtherCurrencySpendingIsShownSeparatelyUntil)}</Text> : null}
    {canManage ? <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={onEdit} style={styles.editButton}><Text style={styles.editText}>{i18n.t($ => $.ui.budgetsEdit)}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.deleteBudget, { name: categoryLabel(useLocalDatasetStore.getState().dataset?.categories.find(category => category.id === progress.budget.categoryId)) })} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>{i18n.t($ => $.ui.settingsDelete)}</Text></Pressable></View> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  toolbarActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  monthControl: { alignItems: "center", flexDirection: "row", gap: 10 },
  monthButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  monthButtonText: { color: colors.text, fontSize: 28, fontWeight: "300", lineHeight: 30 },
  monthLabel: { color: colors.text, fontSize: 18, fontWeight: "500", minWidth: 118, textAlign: "center" },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: colors.positiveSubtle, borderRadius: 12, color: colors.positive, fontSize: 14, padding: 12 },
  confirmation: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 12, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: 16 },
  confirmationText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 20, minWidth: 220 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmall: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  cancelSmallText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  deleteSmall: { backgroundColor: colors.negative, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  deleteSmallText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  workspace: { gap: 18 },
  formPane: { flex: 1, minWidth: 0, maxWidth: 420, height: 720 },
  browserWorkspace: { alignItems: "flex-start", flexDirection: "row" },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 0, padding: 18 },
  listHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 },
  cardTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  cardHint: { color: colors.muted, fontSize: 14, marginTop: 4 },
  count: { color: colors.muted, fontSize: 14 },
  emptyWrap: { alignItems: "center", paddingVertical: 8 },
  emptyActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  emptyAction: { backgroundColor: colors.positive, borderRadius: 9999, marginTop: 24, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  emptyCopyAction: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, marginTop: 24, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  cards: { gap: 12, paddingTop: 14 },
  budgetCard: { borderColor: colors.divider, borderRadius: 12, borderWidth: 1, gap: 12, padding: 16 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  categoryName: { color: colors.text, fontSize: 16, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 14, marginTop: 4 },
  status: { borderRadius: 9999, fontSize: 14, fontWeight: "500", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  onTrackStatus: { backgroundColor: colors.positiveSubtle, color: colors.positive },
  attentionStatus: { backgroundColor: colors.warningSubtle, color: colors.warning },
  overStatus: { backgroundColor: colors.negativeSubtle, color: colors.negative },
  amountRow: { flexWrap: "wrap", gap: 16, flexDirection: "row", justifyContent: "space-between" },
  amountRight: { alignItems: "flex-end" },
  amountLabel: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  spent: { ...typography.amount, color: colors.text, fontSize: 17, fontWeight: "500", marginTop: 3 },
  limit: { ...typography.amount, color: colors.text, fontSize: 17, fontWeight: "500", marginTop: 3 },
  progressTrack: { backgroundColor: colors.track, borderRadius: 9999, height: 10, overflow: "hidden" },
  progressFill: { borderRadius: 9999, height: 10 },
  onTrackFill: { backgroundColor: colors.positive },
  attentionFill: { backgroundColor: colors.warning },
  overFill: { backgroundColor: colors.negative },
  remaining: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  cardActions: { flexDirection: "row", gap: 8 },
  editButton: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  editText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  deleteButton: { justifyContent: "center", minHeight: 48, paddingHorizontal: 8 },
  deleteText: { color: colors.negative, fontSize: 14, fontWeight: "500" },
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
