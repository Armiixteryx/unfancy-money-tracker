import { isWebWorkspace, typography } from "../../../ui/designTokens";
import { Button, Card, Status } from "../../../ui/controls";
import { dashboardSummary } from "../summary";
import { AppText as Text } from "../../../ui/AppText";
import { categoryLabel } from "../../../localization/i18n";
import { formatMonth, formatCalendarDate } from "../../../localization/region";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { VoiceEntryButton } from "../../voice/VoiceEntryButton";
import { useEffect, useMemo } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";

import { aggregateCategorySpending, aggregateMonthByCurrency, convertMonthAggregate, currentCalendarMonth } from "../../../domain/aggregates";
import { formatMoneyForDisplay } from "../../../domain/money";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

export function DashboardScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const analytics = useAnalytics();
  const month = currentCalendarMonth();
  const { width } = useWindowDimensions();
  const wide = isWebWorkspace(Platform.OS, width);
  const summary = useMemo(() => dashboardSummary(dataset?.transactions ?? [], dataset?.budgets ?? [], month), [dataset?.transactions, dataset?.budgets, month]);
  const addTransaction = () => router.push("/transactions?new=1");
  const currencyAggregates = useMemo(() => aggregateMonthByCurrency(dataset?.transactions ?? [], month), [dataset?.transactions, month]);
  const categoryAggregates = useMemo(() => aggregateCategorySpending(dataset?.transactions ?? [], dataset?.categories ?? [], month), [dataset?.transactions, dataset?.categories, month]);
  const baseCurrency = dataset?.preferences.baseCurrency ?? "USD";
  const rateRequests = useMemo(() => currencyAggregates.map((aggregate) => ({ currency: aggregate.currency })), [currencyAggregates]);
  const rateQueries = useExchangeRates(baseCurrency, rateRequests);
  const convertedMonth = useMemo(
    () => convertMonthAggregate(dataset?.transactions ?? [], month, baseCurrency, (currency) => rateQueries.latestRates.get(currency)),
    [baseCurrency, dataset?.transactions, month, rateQueries.latestRates]
  );

  useEffect(() => { void analytics.capture("dashboard_viewed", { surface: "dashboard", actionResult: "success" }); }, [analytics]);

  if (!dataset) return null;

  const rateLabel = rateQueries.isLoading ? i18n.t($ => $.ui.dashboardLoadingRates)
    : convertedMonth.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.dashboardPartialView)
    : convertedMonth.rates.some((rate) => rate.status === "stale") ? i18n.t($ => $.ui.dashboardStaleRates)
    : rateQueries.hasError ? i18n.t($ => $.ui.reportsRateError) : i18n.t($ => $.ui.dashboardRatesAvailable);
  const rateTone = convertedMonth.unavailableCurrencies.length > 0 || rateQueries.hasError || convertedMonth.rates.some((rate) => rate.status === "stale") ? "warning" : "info";

  return (
    <AppScreen eyebrow={formatMonth(month)} title={i18n.t($ => $.ui.navigationDashboard)}
      actions={<Button label={i18n.t($ => $.ui.dashboardAddTransaction)} onPress={addTransaction} />}>
      <Card>
        <Text accessibilityRole="header" variant="heading">{i18n.t($ => $.ui.dashboardRemainingBudget)}</Text>
        <Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardOriginalCurrencyBudgets)}</Text>
        <View style={[styles.summaryGrid, wide && styles.wideGrid]}>
          {summary.map((item) => (
            <View key={item.currency} style={styles.summaryCard}>
              <Text variant="label" style={styles.muted}>{item.currency}</Text>
              <Text variant="amount" style={[styles.remainingAmount, wide && styles.remainingAmountWide, item.remaining?.amount.startsWith("-") && styles.overBudget]}>
                {item.remaining ? formatMoneyForDisplay(item.remaining) : i18n.t($ => $.ui.dashboardNoBudgetSet)}
              </Text>
              {item.remaining?.amount.startsWith("-") ? <Status tone="negative" label={i18n.t($ => $.ui.budgetsOverBudget)} /> : null}
              {!item.budget ? <Button variant="ghost" label={i18n.t($ => $.ui.budgetsCreateBudget)} onPress={() => router.push("/budgets?new=1")} style={styles.budgetAction} /> : null}
              <View style={styles.supportingTotals}>
                <View style={styles.supportingMetric}><Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardIncome)}</Text><Text variant="amount" style={styles.income}>{formatMoneyForDisplay(item.income)}</Text></View>
                <View style={styles.supportingMetric}><Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardExpenses)}</Text><Text variant="amount">{formatMoneyForDisplay(item.expenses)}</Text></View>
              </View>
            </View>
          ))}
          {summary.length === 0 ? <View style={styles.noBudget}><Text style={styles.remainingAmount}>{i18n.t($ => $.ui.dashboardNoBudgetSet)}</Text><Button variant="secondary" label={i18n.t($ => $.ui.budgetsCreateBudget)} onPress={() => router.push("/budgets?new=1")} /></View> : null}
        </View>
      </Card>

      {dataset.transactions.length === 0 ? (
        <EmptyState title={i18n.t($ => $.ui.dashboardNoTransactionsYet)} description={i18n.t($ => $.ui.dashboardAddYourFirstIncomeOrExpenseTo)}>
          <Button label={i18n.t($ => $.ui.dashboardAddTransaction)} onPress={addTransaction} />
        </EmptyState>
      ) : <>
        <Card style={styles.baseSummaryCard}>
          <View style={styles.cardHeader}><Text accessibilityRole="header" variant="heading">{i18n.t($ => $.ui.dashboardBaseCurrencySnapshot)}</Text><Status tone={rateTone} label={rateLabel} /></View>
          {convertedMonth.unavailableCurrencies.length > 0 ? <Text style={styles.rateNotice}>{i18n.t($ => $.ui.dashboardCombinedTotalsAreUnavailableFor)} {convertedMonth.unavailableCurrencies.join(", ")}{i18n.t($ => $.ui.dashboardOriginalCurrencyFiguresRemainBelow)}</Text> :
            <View style={styles.supportingTotals}><View style={styles.supportingMetric}><Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardIncome)}</Text><Text variant="amount" style={styles.income}>{formatMoneyForDisplay(convertedMonth.income)}</Text></View><View style={styles.supportingMetric}><Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardExpenses)}</Text><Text variant="amount">{formatMoneyForDisplay(convertedMonth.expenses)}</Text></View></View>}
          <Text variant="caption" style={styles.muted}>{convertedMonth.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.dashboardNoExchangeRateIsAvailableFor) : rateQueries.hasError ? i18n.t($ => $.ui.dashboardExchangeRatesCouldNotBeRefreshedRetry) : convertedMonth.rates.some((rate) => rate.status === "stale") ? i18n.t($ => $.notices.cachedRate) : convertedMonth.rates.length > 0 ? i18n.t($ => $.ui.dashboardRatesUseTheLatestAvailableDataEffective) : i18n.t($ => $.ui.dashboardSameCurrencyTotalsDoNotRequireA)}</Text>
        </Card>
        <View style={[styles.contentGrid, wide && styles.wideGrid]}>
          <Card style={styles.detailCard}>
            <View style={styles.cardHeader}><Text accessibilityRole="header" variant="heading">{i18n.t($ => $.ui.dashboardCategorySpending)}</Text><Text variant="caption" style={styles.muted}>{i18n.t($ => $.ui.dashboardThisMonth)}</Text></View>
            {categoryAggregates.length === 0 ? <Text style={styles.muted}>{i18n.t($ => $.ui.dashboardNoExpenseActivityThisMonth)}</Text> : categoryAggregates.map((aggregate) => (
              <View key={`${aggregate.categoryId}:${aggregate.currency}`} style={styles.categoryRow}>
                <View style={styles.categoryDot} /><Text style={styles.categoryName}>{categoryLabel(dataset.categories.find(category => category.id === aggregate.categoryId))}</Text><Text variant="amount" style={styles.categoryAmount}>{formatMoneyForDisplay(aggregate.spent)}</Text>
              </View>
            ))}
          </Card>
          <Card style={styles.detailCard}>
            <View style={styles.cardHeader}><Text accessibilityRole="header" variant="heading">{i18n.t($ => $.ui.dashboardRecentActivity)}</Text><Button variant="ghost" label={i18n.t($ => $.ui.dashboardSeeAll)} onPress={() => router.push("/transactions")} /></View>
            {dataset.transactions.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5).map((transaction) => (
              <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.editRecord, { description: transaction.description })} onPress={() => router.push(`/transactions?edit=${transaction.id}`)} key={transaction.id} style={styles.activityRow}>
                <View style={styles.activityCopy}><Text numberOfLines={1}>{transaction.description}</Text><Text variant="caption" style={styles.muted}>{formatCalendarDate(transaction.date)}</Text></View>
                <Text variant="amount" style={[styles.activityAmount, transaction.type === "income" && styles.income]}>{transaction.type === "income" ? "+" : "−"}{formatMoneyForDisplay({ amount: transaction.amount, currency: transaction.currency })}</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      </>}
      <VoiceEntryButton />
    </AppScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  summaryGrid: { gap: 24 }, wideGrid: { flexDirection: "row", flexWrap: "wrap" },
  summaryCard: { flex: 1, minWidth: 0, gap: 8 },
  remainingAmount: { ...typography.amount, color: colors.text, fontSize: 32, lineHeight: 42 },
  remainingAmountWide: { fontSize: 40, lineHeight: 52 },
  overBudget: { color: colors.negative }, income: { color: colors.positive },
  noBudget: { alignItems: "flex-start", gap: 16 }, budgetAction: { alignSelf: "flex-start", paddingHorizontal: 0 },
  supportingTotals: { flexDirection: "row", flexWrap: "wrap", gap: 24, marginTop: 8 },
  supportingMetric: { gap: 4, flexShrink: 1 },
  baseSummaryCard: { backgroundColor: colors.surfaceRaised },
  cardHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rateNotice: { color: colors.warning, fontSize: 14, lineHeight: 20 }, muted: { color: colors.muted },
  contentGrid: { gap: 16 }, detailCard: { flex: 1, minWidth: 0, padding: 20 },
  categoryRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 12 },
  categoryDot: { backgroundColor: colors.positive, borderRadius: 9999, height: 6, width: 6 },
  categoryName: { color: colors.text, flex: 1, fontSize: 14, minWidth: 60 },
  categoryAmount: { color: colors.text, fontSize: 14, maxWidth: "100%" },
  activityRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 12, minHeight: 56 },
  activityCopy: { flex: 1, gap: 3, minWidth: 80 },
  activityAmount: { fontSize: 14, maxWidth: "100%" },
});
