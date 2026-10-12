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
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { calculateBudgetProgress, shiftCalendarMonth, type BudgetProgress } from "../../../domain";
import type { BudgetInput, PlannedExpenseInput, TransactionInput } from "../../../domain/validation";
import type { Budget, BudgetPlannedExpense } from "../../../domain/types";
import { currentCalendarMonth } from "../../../domain/aggregates";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore, type CopyBudgetsResult, type MutationResult } from "../../local-data/store/useLocalDatasetStore";
import { BudgetForm, type BudgetFormResult } from "../components/BudgetForm";
import { BudgetCard } from "../components/BudgetCard";
import { PlannedExpenseForm, type PlannedExpenseFormResult } from "../components/PlannedExpenseForm";
import { CopyBudgetsForm } from "../components/CopyBudgetsForm";
import { TransactionForm, type TransactionFormResult } from "../../transactions/components/TransactionForm";
import { useAnalytics } from "../../../providers/AnalyticsProvider";
import { useAuth } from "../../auth/AuthProvider";
import { canCreateTrackerTransaction, canManageTrackerSettings } from "../../../domain/trackerPermissions";
import { createUuid } from "../../../platform/identifiers/createUuid";
import { getActiveTrackerStore, getActiveTrackerSummary, getTrackerGeneration, initializeTrackerRegistry, useActiveTrackerSummary, useTrackerRegistry } from "../../trackers/store";

type CapturedTarget = {
  store: ReturnType<typeof getActiveTrackerStore>;
  summary: NonNullable<ReturnType<typeof getActiveTrackerSummary>>;
  datasetId: string;
  datasetEpoch: number;
  generation: number;
  subject: string | null;
};
type FormState =
  | { mode: "new"; target: CapturedTarget }
  | { mode: "edit"; id: string; target: CapturedTarget }
  | { mode: "copy"; target: CapturedTarget }
  | { mode: "plannedNew"; budgetId: string; target: CapturedTarget }
  | { mode: "plannedEdit"; budgetId: string; itemId: string; target: CapturedTarget }
  | { mode: "record"; budgetId: string; itemId: string; target: CapturedTarget }
  | null;
type PendingBudgetDelete = { id: string; target: CapturedTarget };
type PendingPlannedDelete = { budgetId: string; itemId: string; target: CapturedTarget };
type PendingPlannedSave = { budgetId: string; itemId: string; targetKey: string };
type PendingRecordSave = { targetKey: string; actionKey: string; recordId: string };

function captureActiveTarget(subject: string | null): CapturedTarget | null {
  const summary = getActiveTrackerSummary();
  const store = getActiveTrackerStore();
  const state = store.getState();
  if (!summary || !state.dataset || state.dataset.datasetId !== summary.datasetId) return null;
  return { store, summary, datasetId: summary.datasetId, datasetEpoch: state.datasetEpoch, generation: getTrackerGeneration(summary), subject };
}

function isCapturedTargetCurrent(target: CapturedTarget, subject: string | null): boolean {
  const active = getActiveTrackerSummary();
  const state = target.store.getState();
  return !!active && active.datasetId === target.datasetId && active.membershipId === target.summary.membershipId && active.kind === target.summary.kind &&
    getActiveTrackerStore() === target.store && state.dataset?.datasetId === target.datasetId && state.datasetEpoch === target.datasetEpoch &&
    getTrackerGeneration(target.summary) === target.generation && target.subject === subject && state.dataset?.tracker?.access !== "revoked";
}

function capturedTargetKey(target: CapturedTarget): string {
  return `${target.datasetId}:${target.summary.membershipId ?? "personal"}:${target.generation}:${target.datasetEpoch}:${target.subject ?? "guest"}`;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function budgetLocalSaveMessage(message: string): string {
  return message === "local_watch_recording_save_failed_recording_retained"
    ? "local_save_failed_your_change_is_still_visible_retry_to_save_it"
    : message;
}

function plannedTransactionValues(budget: Budget, item: BudgetPlannedExpense): Partial<TransactionInput> {
  const today = new Date();
  const month = currentCalendarMonth(today);
  return {
    type: "expense",
    categoryId: budget.categoryId,
    description: item.description,
    amount: item.amount,
    currency: item.currency,
    date: budget.month === month ? localDate(today) : `${budget.month}-01`,
  };
}

export function BudgetsScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { new: newParam } = useLocalSearchParams<{ new?: string }>();
  const { width } = useWindowDimensions();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const datasetEpoch = useLocalDatasetStore((state) => state.datasetEpoch);
  const saveStatus = useLocalDatasetStore((state) => state.saveStatus);
  const auth = useAuth();
  const canManage = dataset ? canManageTrackerSettings(dataset, auth.subject) : false;
  const canCreate = dataset ? canCreateTrackerTransaction(dataset, auth.subject) : false;
  const saveError = useLocalDatasetStore((state) => state.saveError);
  const activeTracker = useActiveTrackerSummary();
  const trackerHydration = useTrackerRegistry(state => state.hydration);
  const trackerRegistryError = useTrackerRegistry(state => state.error);
  const trackerTargetReady = trackerHydration === "ready" && Boolean(getActiveTrackerSummary()) && activeTracker.datasetId === dataset?.datasetId;
  const analytics = useAnalytics();
  const [month, setMonth] = useState(currentCalendarMonth());
  const [formState, setFormState] = useState<FormState>(null);
  const formStateRef = useRef<FormState>(formState);
  formStateRef.current = formState;
  const [pendingBudgetDelete, setPendingBudgetDelete] = useState<PendingBudgetDelete | null>(null);
  const pendingBudgetDeleteRef = useRef<PendingBudgetDelete | null>(pendingBudgetDelete);
  pendingBudgetDeleteRef.current = pendingBudgetDelete;
  const [pendingPlannedDelete, setPendingPlannedDelete] = useState<PendingPlannedDelete | null>(null);
  const pendingPlannedDeleteRef = useRef<PendingPlannedDelete | null>(pendingPlannedDelete);
  pendingPlannedDeleteRef.current = pendingPlannedDelete;
  const [pendingPlannedSave, setPendingPlannedSave] = useState<PendingPlannedSave | null>(null);
  const [pendingRecordSave, setPendingRecordSave] = useState<PendingRecordSave | null>(null);
  const pendingPlannedSaveIds = useRef(new Map<string, string>());
  const pendingRecordSaveIds = useRef(new Map<string, string>());
  const [message, setMessage] = useState<Message | null>(null);
  const isBrowserWorkspace = isWebWorkspace(Platform.OS, width);
  const retryTrackerInitialization = async () => {
    await initializeTrackerRegistry();
  };

  const openBudgetForm = (mode: "new" | "edit", id?: string) => {
    const target = captureActiveTarget(auth.subject);
    if (!target) { setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable)); return; }
    setMessage(null);
    setFormState(mode === "edit" && id ? { mode, id, target } : { mode: "new", target });
  };
  const openCopyBudgetForm = () => {
    const target = captureActiveTarget(auth.subject);
    if (!target) { setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable)); return; }
    setMessage(null);
    setFormState({ mode: "copy", target });
  };

  const progress = useMemo<BudgetProgress[]>(() => {
    if (!dataset) return [];
    return dataset.budgets
      .filter((budget) => budget.month === month)
      .map((budget) => calculateBudgetProgress(budget, dataset.transactions, categoryLabel(dataset.categories.find((category) => category.id === budget.categoryId))))
      .sort((left, right) => right.percentUsed - left.percentUsed);
  }, [dataset, month]);

  useEffect(() => {
    if (!dataset || !newParam || !canManage || !trackerTargetReady) return;
    const target = captureActiveTarget(auth.subject);
    if (target) setFormState({ mode: "new", target });
    router.setParams({ new: undefined });
  }, [auth.subject, canManage, dataset, newParam, router, trackerTargetReady]);

  const formTarget = formState?.target ?? null;
  const formTargetCurrent = formTarget ? isCapturedTargetCurrent(formTarget, auth.subject) : false;
  const formTargetDatasetForValidity = formTargetCurrent ? formTarget?.store.getState().dataset : null;
  useEffect(() => {
    const formInvalid = formTarget && !formTargetCurrent && formStateRef.current === formState;
    const referencedBudget = formState && formTargetDatasetForValidity?.budgets.find((budget) =>
      (formState.mode === "edit" && budget.id === formState.id) ||
      ((formState.mode === "plannedNew" || formState.mode === "plannedEdit" || formState.mode === "record") && budget.id === formState.budgetId),
    );
    const referencedItem = formState?.mode === "plannedEdit" || formState?.mode === "record"
      ? referencedBudget?.plannedExpenses?.some((item) => item.id === formState.itemId)
      : undefined;
    const missingBudget = (formState?.mode === "edit" || formState?.mode === "plannedNew" || formState?.mode === "plannedEdit" || formState?.mode === "record") && !referencedBudget;
    const missingItem = (formState?.mode === "plannedEdit" || formState?.mode === "record") && !referencedItem;
    const referencedFormMissing = !!formState && formTargetCurrent && (missingBudget || missingItem) && formStateRef.current === formState;
    const deleteInvalid = pendingPlannedDelete && !isCapturedTargetCurrent(pendingPlannedDelete.target, auth.subject) && pendingPlannedDeleteRef.current === pendingPlannedDelete;
    const budgetDeleteInvalid = pendingBudgetDelete && !isCapturedTargetCurrent(pendingBudgetDelete.target, auth.subject) && pendingBudgetDeleteRef.current === pendingBudgetDelete;
    if (!formInvalid && !referencedFormMissing && !deleteInvalid && !budgetDeleteInvalid) return;
    if (formInvalid || referencedFormMissing) {
      setFormState((current) => current === formState ? null : current);
      setPendingPlannedSave(null);
      setPendingRecordSave(null);
    }
    if (deleteInvalid) setPendingPlannedDelete((current) => current === pendingPlannedDelete ? null : current);
    if (budgetDeleteInvalid) setPendingBudgetDelete((current) => current === pendingBudgetDelete ? null : current);
    if (formInvalid) setMessage(i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen));
    else if (referencedFormMissing) setMessage(translateMessage(formState?.mode === "edit" ? "this_budget_is_no_longer_available" : "this_planned_expense_is_no_longer_available", true));
    else setMessage(i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen));
  }, [activeTracker.datasetId, activeTracker.kind, activeTracker.membershipId, auth.subject, dataset, datasetEpoch, formState, formTarget, formTargetCurrent, formTargetDatasetForValidity, pendingBudgetDelete, pendingPlannedDelete]);

  if (!dataset) {
    const canRetryTracker = trackerHydration === "recovery" || trackerHydration === "ready";
    return (
      <AppScreen eyebrow={i18n.t($ => $.ui.budgetsMonthlyPlanning)} title={i18n.t($ => $.ui.navigationBudgets)}>
        <View style={styles.saveErrorRow}>
          <Text accessibilityRole={trackerHydration === "recovery" ? "alert" : undefined} style={styles.errorBanner}>
            {trackerHydration === "loading" ? i18n.t($ => $.ui.budgetsPreparingTracker) : trackerRegistryError ? translateMessage(trackerRegistryError, true) : i18n.t($ => $.ui.budgetsTrackerUnavailable)}
          </Text>
          {canRetryTracker ? <Pressable accessibilityRole="button" onPress={() => void retryTrackerInitialization()} style={styles.retryButton}><Text style={styles.retryButtonText}>{i18n.t($ => $.ui.budgetsRetryTrackerSetup)}</Text></Pressable> : null}
        </View>
      </AppScreen>
    );
  }

  const formTargetDataset = formTargetCurrent ? formTarget?.store.getState().dataset : null;
  const selectedBudget = formState?.mode === "edit" ? formTargetDataset?.budgets.find((budget) => budget.id === formState.id) : undefined;
  const isCurrentForm = (expected: FormState): boolean => !!expected && formStateRef.current === expected;
  const closeCapturedForm = (expected: FormState) => {
    setFormState((current) => current === expected ? null : current);
  };
  const onSave = async (input: BudgetInput): Promise<BudgetFormResult> => {
    if (formState?.mode !== "new" && formState?.mode !== "edit") return { ok: false, message: "this_budget_is_no_longer_available" };
    const target = formState.target;
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    const result = selectedBudget
      ? await target.store.getState().editBudget(selectedBudget.id, input)
      : await target.store.getState().addBudget(input);
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    if (!isCurrentForm(formState)) return result.ok ? { ok: false, message: "this_budget_is_no_longer_available" } : result;
    if (!result.ok) return result;
    if (!selectedBudget) void analytics.capture("budget_created", { surface: "budgets", actionResult: "success" });
    setMessage(selectedBudget ? i18n.t($ => $.ui.budgetsBudgetUpdatedLocally) : i18n.t($ => $.ui.budgetsBudgetCreatedLocally));
    return { ok: true };
  };
  const onCopy = async (sourceMonth: `${number}-${number}`, targetMonth: `${number}-${number}`): Promise<MutationResult<CopyBudgetsResult>> => {
    if (formState?.mode !== "copy") return { ok: false, message: "source_and_target_months_must_be_different" };
    const target = formState.target;
    const submittedForm = formState;
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    const result = await target.store.getState().copyBudgets(sourceMonth, targetMonth);
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    if (!isCurrentForm(submittedForm)) return { ok: false, message: "source_and_target_months_must_be_different" };
    if (!result.ok) return result;
    closeCapturedForm(submittedForm);
    setMessage({ code: "budgetsCopied", count: result.value.created.length, month: sourceMonth, skipped: result.value.skipped });
    void analytics.capture("budget_created", { surface: "budgets", actionResult: "success" });
    return result;
  };
  const beginDeleteBudget = (id: string) => {
    const target = captureActiveTarget(auth.subject);
    if (target) setPendingBudgetDelete({ id, target });
    else setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable));
  };
  const confirmDelete = async () => {
    if (!pendingBudgetDelete) return;
    const { id, target } = pendingBudgetDelete;
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    const submittedDelete = pendingBudgetDelete;
    const result = await target.store.getState().deleteBudget(id);
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    if (pendingBudgetDeleteRef.current !== submittedDelete) return;
    setPendingBudgetDelete((current) => current === submittedDelete ? null : current);
    setMessage(result.ok ? i18n.t($ => $.ui.budgetsBudgetDeletedLocally) : result.message);
  };
  const openPlannedExpenseForm = (budgetId: string, itemId?: string) => {
    const target = captureActiveTarget(auth.subject);
    if (!target) { setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable)); return; }
    setMessage(null);
    const plannedSaveKey = `${capturedTargetKey(target)}:${budgetId}`;
    const unresolved = !itemId ? pendingPlannedSaveIds.current.get(plannedSaveKey) : undefined;
    setFormState(itemId || unresolved
      ? { mode: "plannedEdit", budgetId, itemId: itemId ?? unresolved!, target }
      : { mode: "plannedNew", budgetId, target });
  };
  const openRecordExpense = (budgetId: string, itemId: string) => {
    const target = captureActiveTarget(auth.subject);
    if (!target) { setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable)); return; }
    setMessage(null);
    const targetKey = capturedTargetKey(target);
    const actionKey = `${targetKey}:${budgetId}:${itemId}`;
    const pendingId = pendingRecordSaveIds.current.get(actionKey);
    setPendingRecordSave(pendingId ? { targetKey, actionKey, recordId: pendingId } : null);
    setFormState({ mode: "record", budgetId, itemId, target });
  };
  const closeRecordForm = (expected: FormState = formState) => {
    if (!expected) return;
    setFormState((current) => current === expected ? null : current);
  };
  const retryCapturedTargetSave = async (target: CapturedTarget, expectedForm?: FormState) => {
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    const result = await target.store.getState().retryLocalSave();
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    if (expectedForm && !isCurrentForm(expectedForm)) return;
    if (!result.ok) setMessage(budgetLocalSaveMessage(result.message));
  };
  const onSavePlannedExpense = async (input: PlannedExpenseInput): Promise<PlannedExpenseFormResult> => {
    if (!formState || (formState.mode !== "plannedNew" && formState.mode !== "plannedEdit")) return { ok: false, message: "this_planned_expense_is_no_longer_available" };
    const { target, budgetId } = formState;
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    const targetKey = capturedTargetKey(target);
    const submittedForm = formState;
    const plannedSaveKey = `${targetKey}:${budgetId}`;
    const retryItemId = formState.mode === "plannedEdit"
      ? formState.itemId
      : pendingPlannedSaveIds.current.get(plannedSaveKey) ?? (pendingPlannedSave?.budgetId === budgetId && pendingPlannedSave.targetKey === targetKey ? pendingPlannedSave.itemId : undefined);
    const result = retryItemId
      ? await target.store.getState().editPlannedExpense(budgetId, retryItemId, input)
      : await target.store.getState().addPlannedExpense(budgetId, input);
    if (!isCapturedTargetCurrent(target, auth.subject)) {
      if (!result.ok && result.recordId) pendingPlannedSaveIds.current.set(plannedSaveKey, result.recordId);
      return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    }
    if (!result.ok && result.recordId) pendingPlannedSaveIds.current.set(plannedSaveKey, result.recordId);
    if (result.ok) {
      pendingPlannedSaveIds.current.delete(plannedSaveKey);
      setPendingPlannedSave((current) => current?.budgetId === budgetId && current.targetKey === targetKey ? null : current);
    }
    if (!isCurrentForm(submittedForm)) return { ok: false, message: "this_planned_expense_is_no_longer_available" };
    if (!result.ok) {
      if (result.recordId) {
        setPendingPlannedSave({ budgetId, itemId: result.recordId, targetKey });
      }
      return { ...result, message: budgetLocalSaveMessage(result.message) };
    }
    setMessage(retryItemId ? i18n.t($ => $.ui.budgetsPlannedExpenseUpdatedLocally) : i18n.t($ => $.ui.budgetsPlannedExpenseAddedLocally));
    return { ok: true };
  };
  const confirmDeletePlannedExpense = async () => {
    if (!pendingPlannedDelete) return;
    const submittedDelete = pendingPlannedDelete;
    const { target, budgetId, itemId } = submittedDelete;
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    const result = await target.store.getState().deletePlannedExpense(budgetId, itemId);
    if (!isCapturedTargetCurrent(target, auth.subject)) return;
    if (pendingPlannedDeleteRef.current !== submittedDelete) return;
    setPendingPlannedDelete((current) => current === submittedDelete ? null : current);
    setMessage(result.ok ? i18n.t($ => $.ui.budgetsPlannedExpenseDeletedLocally) : result.message);
  };
  const beginDeletePlannedExpense = (budgetId: string, itemId: string) => {
    const target = captureActiveTarget(auth.subject);
    if (target) setPendingPlannedDelete({ budgetId, itemId, target });
    else setMessage(i18n.t($ => $.ui.budgetsTrackerUnavailable));
  };
  const onRecordExpense = async (input: TransactionInput): Promise<TransactionFormResult> => {
    if (formState?.mode !== "record") return { ok: false, message: "tracker_membership_changed" };
    const { target } = formState;
    if (!isCapturedTargetCurrent(target, auth.subject)) return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    const targetKey = capturedTargetKey(target);
    const submittedForm = formState;
    const actionKey = `${targetKey}:${formState.budgetId}:${formState.itemId}`;
    const recordId = pendingRecordSave?.actionKey === actionKey ? pendingRecordSave.recordId : pendingRecordSaveIds.current.get(actionKey) ?? createUuid();
    const result = await target.store.getState().addTransactionDurably(input, recordId, target.generation);
    if (!isCapturedTargetCurrent(target, auth.subject)) {
      if (!result.ok && result.recordId) pendingRecordSaveIds.current.set(actionKey, result.recordId);
      return { ok: false, message: i18n.t($ => $.ui.budgetsTrackerChangedWhileFormOpen) };
    }
    if (!result.ok && result.recordId) pendingRecordSaveIds.current.set(actionKey, result.recordId);
    if (result.ok) {
      pendingRecordSaveIds.current.delete(actionKey);
      setPendingRecordSave((current) => current?.actionKey === actionKey && current.recordId === recordId ? null : current);
    }
    if (!isCurrentForm(submittedForm)) return { ok: false, message: "tracker_membership_changed" };
    if (!result.ok) {
      if (result.recordId) {
        setPendingRecordSave({ targetKey, actionKey, recordId: result.recordId });
      }
      return { ...result, message: budgetLocalSaveMessage(result.message) };
    }
    void analytics.capture("transaction_created", { surface: "budgets", actionResult: "success" });
    setMessage(i18n.t($ => $.ui.transactionsTransactionSavedLocally));
    return { ok: true };
  };

  const plannedEditorBudget = formState && (formState.mode === "plannedNew" || formState.mode === "plannedEdit")
    ? formTargetDataset?.budgets.find((budget) => budget.id === formState.budgetId)
    : undefined;
  const plannedEditorItem = formState?.mode === "plannedEdit"
    ? plannedEditorBudget?.plannedExpenses?.find((item) => item.id === formState.itemId)
    : undefined;
  const recordTargetDataset = formState?.mode === "record" && formTargetCurrent ? formState.target.store.getState().dataset : null;
  const recordBudget = formState?.mode === "record" ? recordTargetDataset?.budgets.find((budget) => budget.id === formState.budgetId) : undefined;
  const recordItem = formState?.mode === "record" ? recordBudget?.plannedExpenses?.find((item) => item.id === formState.itemId) : undefined;
  const currentTargetKey = formTarget ? capturedTargetKey(formTarget) : "";
  const recordActionKey = formState?.mode === "record" ? `${currentTargetKey}:${formState.budgetId}:${formState.itemId}` : "";
  const hasPendingRecordRetry = pendingRecordSave?.actionKey === recordActionKey || pendingRecordSaveIds.current.has(recordActionKey);
  const formData = formTargetDataset ?? dataset;

  const plannedForm = formState && (formState.mode === "plannedNew" || formState.mode === "plannedEdit") && formTargetCurrent && plannedEditorBudget
      ? <PlannedExpenseForm key={`${formState.mode}:${formState.budgetId}:${formState.mode === "plannedEdit" ? formState.itemId : currentTargetKey}`} item={plannedEditorItem} categoryName={categoryLabel(formTargetDataset?.categories.find((category) => category.id === plannedEditorBudget.categoryId))} month={plannedEditorBudget.month} defaultCurrency={plannedEditorBudget.currency} selectedCurrencies={formData.preferences.selectedCurrencies} onCancel={() => closeCapturedForm(formState)} onSave={onSavePlannedExpense} saveDisabled={saveStatus === "error" && formState.mode === "plannedNew" && !(pendingPlannedSave?.budgetId === formState.budgetId && pendingPlannedSave.targetKey === currentTargetKey) && !pendingPlannedSaveIds.current.has(`${currentTargetKey}:${formState.budgetId}`)} onRetryLocalSave={() => { const target = formTarget; if (target) void retryCapturedTargetSave(target, formState); }} />
    : null;
  const form = formState && (formState.mode === "new" || (formState.mode === "edit" && selectedBudget)) && formTargetCurrent
    ? <BudgetForm key={`${formState.mode}:${formState.mode === "edit" ? formState.id : "new"}:${currentTargetKey}`} budget={selectedBudget} budgets={formData.budgets} categories={formData.categories} defaultCurrency={formData.preferences.baseCurrency} defaultMonth={month} onCancel={() => closeCapturedForm(formState)} onSave={onSave} selectedCurrencies={formData.preferences.selectedCurrencies} />
    : plannedForm;
  const copyForm = formState?.mode === "copy" && formTargetCurrent ? <CopyBudgetsForm key={`copy:${currentTargetKey}`} budgets={formData.budgets} categories={formData.categories} targetMonth={month} initialSourceMonth={shiftCalendarMonth(month, -1)} onCancel={() => closeCapturedForm(formState)} onCopy={onCopy} /> : null;
  const transactionForm = formState?.mode === "record" && formTargetCurrent && recordTargetDataset && recordBudget && recordItem
    ? <TransactionForm key={`planned-record:${currentTargetKey}:${formState.budgetId}:${formState.itemId}`} baseCurrency={recordTargetDataset.preferences.baseCurrency} categories={recordTargetDataset.categories} initialValues={plannedTransactionValues(recordBudget, recordItem)} onCancel={() => closeRecordForm(formState)} onSave={onRecordExpense} selectedCurrencies={recordTargetDataset.preferences.selectedCurrencies} saveDisabled={saveStatus === "error" && !hasPendingRecordRetry} onRetryLocalSave={() => { const target = formTarget; if (target) void retryCapturedTargetSave(target, formState); }} />
    : null;
  const activeForm = form ?? copyForm ?? transactionForm;

  return (
    <AppScreen eyebrow={i18n.t($ => $.ui.budgetsMonthlyPlanning)} title={i18n.t($ => $.ui.navigationBudgets)} actions={canManage ? <Button disabled={!trackerTargetReady} label={i18n.t($ => $.ui.budgetsCreateBudgetAlternative)} onPress={() => openBudgetForm("new")} /> : undefined}>
      {!canManage ? <Text style={styles.errorBanner}>{auth.identity ? i18n.t($ => $.ui.budgetsOnlyAdminsManageBudgetPlans) : i18n.t($ => $.ui.budgetsSignInToSyncSharedTracker)}</Text> : null}
      {!trackerTargetReady ? <View style={styles.saveErrorRow}><Text accessibilityRole={trackerHydration === "recovery" ? "alert" : undefined} style={styles.errorBanner}>{trackerHydration === "loading" ? i18n.t($ => $.ui.budgetsPreparingTracker) : trackerRegistryError ? translateMessage(trackerRegistryError, true) : i18n.t($ => $.ui.budgetsTrackerUnavailable)}</Text>{trackerHydration === "recovery" || trackerHydration === "ready" ? <Pressable accessibilityRole="button" onPress={() => void retryTrackerInitialization()} style={styles.retryButton}><Text style={styles.retryButtonText}>{i18n.t($ => $.ui.budgetsRetryTrackerSetup)}</Text></Pressable> : null}</View> : null}
      <View style={styles.toolbar}>
        <View style={styles.monthControl}>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsPreviousBudgetMonth)} onPress={() => setMonth((value) => shiftCalendarMonth(value, -1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable>
          <Text accessibilityRole="header" style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsNextBudgetMonth)} onPress={() => setMonth((value) => shiftCalendarMonth(value, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable>
        </View>
        <View style={styles.toolbarActions}>
          {canManage ? <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.ui.budgetsCopyBudgetsFromAnotherMonth)} disabled={!trackerTargetReady} onPress={openCopyBudgetForm} style={[styles.secondaryButton, !trackerTargetReady && styles.disabledButton]}><Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.budgetsCopyFromAnotherMonth)}</Text></Pressable> : null}

        </View>
      </View>

      {saveError ? <View style={styles.saveErrorRow}><Text accessibilityRole="alert" style={styles.errorBanner}>{translateMessage(budgetLocalSaveMessage(saveError), true)}</Text><Pressable accessibilityRole="button" disabled={saveStatus === "saving"} onPress={() => { const target = captureActiveTarget(auth.subject); if (target) void retryCapturedTargetSave(target); }} style={styles.retryButton}><Text style={styles.retryButtonText}>{i18n.t($ => $.notices.retrySave)}</Text></Pressable></View> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{translateMessage(message, false)}</Text> : null}
      {pendingBudgetDelete && isCapturedTargetCurrent(pendingBudgetDelete.target, auth.subject) ? <View style={styles.confirmation}><Text style={styles.confirmationText}>{i18n.t($ => $.ui.budgetsDeleteThisBudgetYouCanTUndo)}</Text><View style={styles.confirmationActions}><Pressable accessibilityRole="button" onPress={() => setPendingBudgetDelete(null)} style={styles.cancelSmall}><Text style={styles.cancelSmallText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void confirmDelete()} style={styles.deleteSmall}><Text style={styles.deleteSmallText}>{i18n.t($ => $.ui.budgetsDeleteBudget)}</Text></Pressable></View></View> : null}

      <View style={[styles.workspace, isBrowserWorkspace && styles.browserWorkspace]}>
        <View style={styles.listCard}>
          {progress.length === 0 ? <View style={styles.emptyWrap}><EmptyState title={i18n.t($ => $.ui.budgetsNoBudgetsForThisMonth)} description={i18n.t($ => $.ui.budgetsCreateACategoryLimitToCompareLocal)} />{canManage ? <View style={styles.emptyActions}><Pressable accessibilityRole="button" disabled={!trackerTargetReady} onPress={() => openBudgetForm("new")} style={styles.emptyAction}><Text style={styles.addButtonText}>{i18n.t($ => $.ui.budgetsCreateBudgetAlternative)}</Text></Pressable><Pressable accessibilityRole="button" disabled={!trackerTargetReady} onPress={openCopyBudgetForm} style={styles.emptyCopyAction}><Text style={styles.secondaryButtonText}>{i18n.t($ => $.ui.budgetsCopyFromAnotherMonth)}</Text></Pressable></View> : null}</View> : <View style={styles.cards}>{progress.map((item) => <BudgetCard key={item.budget.id} progress={item} categoryName={item.categoryName} canManage={canManage && trackerTargetReady} canCreate={canCreate && trackerTargetReady} pendingPlannedDelete={pendingPlannedDelete?.budgetId === item.budget.id && isCapturedTargetCurrent(pendingPlannedDelete.target, auth.subject) ? pendingPlannedDelete.itemId : null} onEdit={() => openBudgetForm("edit", item.budget.id)} onDelete={() => beginDeleteBudget(item.budget.id)} onAddPlanned={() => openPlannedExpenseForm(item.budget.id)} onEditPlanned={(itemId) => openPlannedExpenseForm(item.budget.id, itemId)} onDeletePlanned={(itemId) => beginDeletePlannedExpense(item.budget.id, itemId)} onConfirmDeletePlanned={() => void confirmDeletePlannedExpense()} onCancelDeletePlanned={() => setPendingPlannedDelete(null)} onRecordExpense={(itemId) => openRecordExpense(item.budget.id, itemId)} deleteDisabled={saveStatus === "error" || !trackerTargetReady} />)}</View>}
        </View>
        {isBrowserWorkspace && activeForm ? <View style={styles.formPane}>{activeForm}</View> : null}
      </View>
      {!isBrowserWorkspace ? <Modal animationType="slide" onRequestClose={() => formState?.mode === "record" ? closeRecordForm(formState) : closeCapturedForm(formState)} visible={Boolean(formState)}><SafeAreaView style={styles.mobileModal}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>{activeForm}</KeyboardAvoidingView></SafeAreaView></Modal> : null}
    </AppScreen>
  );
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
  saveErrorRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  retryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  retryButtonText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  disabledButton: { opacity: 0.5 },
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
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
