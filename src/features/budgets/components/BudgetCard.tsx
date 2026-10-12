import { AppText as Text } from "../../../ui/AppText";
import { typography } from "../../../ui/designTokens";
import { formatCalendarDate, formatTimestamp } from "../../../localization/region";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { calculatePlannedExpenseTotals, type BudgetProgress } from "../../../domain";
import { formatMoneyForDisplay, subtractMoney } from "../../../domain/money";
import type { BudgetPlannedExpense } from "../../../domain/types";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { rateRequestKey, type RateRequest } from "../../exchange-rates/hooks/useExchangeRates";

const EMPTY_PLANNED_EXPENSES: readonly BudgetPlannedExpense[] = [];

export function BudgetCard({ progress, categoryName, onEdit, onDelete, onAddPlanned, onEditPlanned, onDeletePlanned, onConfirmDeletePlanned, onCancelDeletePlanned, onRecordExpense, canManage = true, canCreate = true, pendingPlannedDelete, deleteDisabled = false }: {
  progress: BudgetProgress;
  categoryName: string;
  onEdit: () => void;
  onDelete: () => void;
  onAddPlanned: () => void;
  onEditPlanned: (itemId: string) => void;
  onDeletePlanned: (itemId: string) => void;
  onConfirmDeletePlanned: () => void;
  onCancelDeletePlanned: () => void;
  onRecordExpense: (itemId: string) => void;
  canManage?: boolean;
  canCreate?: boolean;
  pendingPlannedDelete: string | null;
  deleteDisabled?: boolean;
}) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const usedWidth = `${Math.min(progress.percentUsed, 100)}%` as `${number}%`;
  const statusLabel = progress.status === "over_budget" ? i18n.t($ => $.ui.budgetsOverBudget) : progress.status === "attention" ? i18n.t($ => $.ui.budgetsNearLimit) : i18n.t($ => $.ui.budgetsOnTrack);
  const plannedExpenses = progress.budget.plannedExpenses ?? EMPTY_PLANNED_EXPENSES;
  const rateRequests = useMemo<RateRequest[]>(() => plannedExpenses.map((item) => ({ currency: item.currency })), [plannedExpenses]);
  const rateQueries = useExchangeRates(progress.budget.currency, rateRequests);
  const plannedTotals = useMemo(
    () => calculatePlannedExpenseTotals(plannedExpenses, progress.budget.currency, (sourceCurrency, targetCurrency) => sourceCurrency === targetCurrency ? undefined : rateQueries.latestRates.get(sourceCurrency)),
    [plannedExpenses, progress.budget.currency, rateQueries.latestRates],
  );
  const plannedConversionPending = plannedExpenses.some((item) => item.currency !== progress.budget.currency && rateQueries.states.get(rateRequestKey({ currency: item.currency }))?.state === "loading");
  const hasStaleRates = plannedTotals.rates.some((rate) => rate.status === "stale");
  const showRateRetry = rateQueries.hasError || plannedTotals.unavailableCurrencies.length > 0 || hasStaleRates;
  const unallocated = plannedTotals.total ? subtractMoney({ amount: progress.budget.amount, currency: progress.budget.currency }, plannedTotals.total) : null;

  return <View style={styles.budgetCard}>
    <View style={styles.cardTop}><View><Text style={styles.categoryName}>{categoryName}</Text><Text style={styles.meta}>{progress.budget.currency} · {progress.budget.month}</Text></View><Text style={[styles.status, progress.status === "over_budget" ? styles.overStatus : progress.status === "attention" ? styles.attentionStatus : styles.onTrackStatus]}>{statusLabel}</Text></View>
    <View style={styles.amountRow}><View><Text style={styles.amountLabel}>{i18n.t($ => $.ui.budgetsSpent)}</Text><Text style={styles.spent}>{formatMoneyForDisplay(progress.spent)}</Text></View><View style={styles.amountRight}><Text style={styles.amountLabel}>{i18n.t($ => $.ui.budgetsLimit)}</Text><Text style={styles.limit}>{formatMoneyForDisplay({ amount: progress.budget.amount, currency: progress.budget.currency })}</Text></View></View>
    <View accessibilityRole="progressbar" accessibilityLabel={categoryName} accessibilityValue={{ min: 0, max: 100, now: Math.min(Math.round(progress.percentUsed), 100), text: i18n.t($ => $.ui.budgetsPercentUsed, { percent: Math.round(progress.percentUsed) }) }} style={styles.progressTrack}><View style={[styles.progressFill, progress.status === "over_budget" ? styles.overFill : progress.status === "attention" ? styles.attentionFill : styles.onTrackFill, { width: usedWidth }]} /></View>
    <Text style={styles.remaining}>{progress.remaining.amount.startsWith("-") ? i18n.t($ => $.ui.budgetsAmountOver, { amount: formatMoneyForDisplay({ ...progress.remaining, amount: progress.remaining.amount.slice(1) }) }) : i18n.t($ => $.ui.budgetsAmountRemaining, { amount: formatMoneyForDisplay(progress.remaining) })}</Text>
    {progress.otherCurrencySpending.length > 0 ? <Text style={styles.note}>{i18n.t($ => $.ui.budgetsOtherCurrencySpendingIsShownSeparatelyUntil)}</Text> : null}
    <View style={styles.plannedSection}>
      <View style={styles.plannedHeader}><View><Text style={styles.plannedTitle}>{i18n.t($ => $.ui.budgetsPlannedExpenseList)}</Text><Text style={styles.plannedNote}>{i18n.t($ => $.ui.budgetsRecordExpenseHelp)}</Text></View>{canManage ? <Pressable accessibilityRole="button" disabled={deleteDisabled} onPress={onAddPlanned} style={[styles.plannedAddButton, deleteDisabled && styles.disabledButton]}><Text style={styles.plannedAddText}>{i18n.t($ => $.ui.budgetsAddPlannedExpense)}</Text></Pressable> : null}</View>
      {plannedExpenses.length === 0 ? <Text style={styles.note}>{i18n.t($ => $.ui.budgetsNoPlannedExpenses)}</Text> : <View style={styles.plannedItems}>{plannedExpenses.map((item) => <View key={item.id} style={styles.plannedItem}>
        <View style={styles.plannedItemCopy}><Text style={styles.plannedDescription}>{item.description}</Text><Text style={styles.plannedAmount}>{formatMoneyForDisplay({ amount: item.amount, currency: item.currency })}</Text></View>
        <View style={styles.plannedActions}>{canCreate ? <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.recordPlannedExpense, { description: item.description })} onPress={() => onRecordExpense(item.id)} style={styles.recordButton}><Text style={styles.recordText}>{i18n.t($ => $.ui.budgetsRecordExpense)}</Text></Pressable> : null}{canManage ? <><Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.editPlannedExpense, { description: item.description })} disabled={deleteDisabled} onPress={() => onEditPlanned(item.id)} style={[styles.editButton, deleteDisabled && styles.disabledButton]}><Text style={styles.editText}>{i18n.t($ => $.ui.budgetsEdit)}</Text></Pressable><Pressable accessibilityRole="button" disabled={deleteDisabled} accessibilityLabel={i18n.t($ => $.notices.deletePlannedExpense, { description: item.description })} onPress={() => onDeletePlanned(item.id)} style={[styles.deleteButton, deleteDisabled && styles.disabledButton]}><Text style={styles.deleteText}>{i18n.t($ => $.ui.settingsDelete)}</Text></Pressable></> : null}</View>
        {pendingPlannedDelete === item.id ? <View style={styles.plannedConfirmation}><Text style={styles.confirmationText}>{i18n.t($ => $.ui.budgetsDeleteThisPlannedExpense)}</Text><View style={styles.confirmationActions}><Pressable accessibilityRole="button" onPress={onCancelDeletePlanned} style={styles.cancelSmall}><Text style={styles.cancelSmallText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable><Pressable accessibilityRole="button" disabled={deleteDisabled} onPress={onConfirmDeletePlanned} style={[styles.deleteSmall, deleteDisabled && styles.disabledButton]}><Text style={styles.deleteSmallText}>{i18n.t($ => $.ui.budgetsDeletePlannedExpense)}</Text></Pressable></View></View> : null}
      </View>)}</View>}
      <View style={styles.plannedTotals}>
        <View style={styles.totalRow}><Text style={styles.amountLabel}>{i18n.t($ => $.ui.budgetsPlannedTotal)}</Text><Text style={styles.totalAmount}>{plannedConversionPending ? i18n.t($ => $.ui.budgetsRateRefreshLoading) : plannedTotals.total ? formatMoneyForDisplay(plannedTotals.total) : "—"}</Text></View>
        {plannedTotals.total ? <View style={styles.totalRow}><Text style={styles.amountLabel}>{unallocated?.amount.startsWith("-") ? i18n.t($ => $.ui.budgetsPlannedOverLimit) : i18n.t($ => $.ui.budgetsUnallocated)}</Text><Text style={[styles.totalAmount, unallocated?.amount.startsWith("-") && styles.overTotal]}>{unallocated ? formatMoneyForDisplay({ ...unallocated, amount: unallocated.amount.replace(/^-/, "") }) : ""}</Text></View> : plannedConversionPending ? null : <Text accessibilityRole="alert" style={styles.rateWarning}>{i18n.t($ => $.ui.budgetsExchangeRateUnavailableForTotal, { currencies: plannedTotals.unavailableCurrencies.join(", ") })}</Text>}
        {plannedTotals.originalTotals.length > 0 ? <Text style={styles.note}>{i18n.t($ => $.ui.budgetsOriginalPlannedAmounts)} · {plannedTotals.originalTotals.map((money) => formatMoneyForDisplay(money)).join(" · ")}</Text> : null}
        {hasStaleRates ? <Text style={styles.rateWarning}>{i18n.t($ => $.notices.cachedRate)}</Text> : rateQueries.hasError ? <Text accessibilityRole="alert" style={styles.rateWarning}>{i18n.t($ => $.ui.budgetsRatesCouldNotRefresh)}</Text> : null}
        {plannedTotals.rates.map((rate) => <Text key={`${rate.base}:${rate.quote}`} style={styles.rateDetails}>{i18n.t($ => $.notices.rateDetails, { pair: `${rate.base}/${rate.quote}`, date: formatCalendarDate(rate.effectiveDate), status: rate.status === "stale" ? i18n.t($ => $.notices.stale) : i18n.t($ => $.notices.fresh), timestamp: formatTimestamp(rate.fetchedAt) })}</Text>)}
        {showRateRetry ? <Pressable accessibilityRole="button" disabled={rateQueries.isLoading} onPress={() => void rateQueries.retry()} style={[styles.retryButton, rateQueries.isLoading && styles.disabledButton]}><Text style={styles.retryButtonText}>{i18n.t($ => $.ui.budgetsRefreshRates)}</Text></Pressable> : null}
      </View>
    </View>
    {canManage ? <View style={styles.cardActions}><Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.editBudget, { name: categoryName })} onPress={onEdit} style={styles.editButton}><Text style={styles.editText}>{i18n.t($ => $.ui.budgetsEdit)}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.deleteBudget, { name: categoryName })} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>{i18n.t($ => $.ui.settingsDelete)}</Text></Pressable></View> : null}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  plannedSection: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 12, padding: 14 },
  plannedHeader: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  plannedTitle: { ...typography.heading, color: colors.text, fontSize: 20, fontWeight: "400" },
  plannedNote: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3, maxWidth: 420 },
  plannedAddButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  plannedAddText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  plannedItems: { gap: 9 },
  plannedItem: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 8, padding: 10 },
  plannedItemCopy: { flex: 1, minWidth: 150 },
  plannedDescription: { color: colors.text, fontSize: 15, fontWeight: "500" },
  plannedAmount: { ...typography.amount, color: colors.text, fontSize: 15, marginTop: 3 },
  plannedActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recordButton: { alignItems: "center", backgroundColor: colors.positiveSubtle, borderColor: colors.positive, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  recordText: { color: colors.positive, fontSize: 14, fontWeight: "500" },
  plannedConfirmation: { backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 10, borderWidth: 1, gap: 10, padding: 12 },
  plannedTotals: { borderTopColor: colors.border, borderTopWidth: 1, gap: 8, paddingTop: 10 },
  totalRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  totalAmount: { ...typography.amount, color: colors.text, fontSize: 16, fontWeight: "500" },
  overTotal: { color: colors.negative },
  rateWarning: { color: colors.negative, fontSize: 13, lineHeight: 18 },
  rateDetails: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  cardActions: { flexDirection: "row", gap: 8 },
  editButton: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  editText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  deleteButton: { justifyContent: "center", minHeight: 48, paddingHorizontal: 8 },
  deleteText: { color: colors.negative, fontSize: 14, fontWeight: "500" },
  confirmationText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 20, minWidth: 220 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmall: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  cancelSmallText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  deleteSmall: { backgroundColor: colors.negative, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  deleteSmallText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  retryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  retryButtonText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  disabledButton: { opacity: 0.5 },
});
