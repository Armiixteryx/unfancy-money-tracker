import { categoryLabel } from "../../../localization/i18n";
import { formatCalendarDate } from "../../../localization/region";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { VoiceEntryButton } from "../../voice/VoiceEntryButton";
import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { aggregateCategorySpending, aggregateMonthByCurrency, convertMonthAggregate, currentCalendarMonth, totalBudgetForMonth } from "../../../domain/aggregates";
import { formatMoneyForDisplay, subtractMoney } from "../../../domain/money";
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

  return (
    <AppScreen eyebrow={month} title={i18n.t($ => $.ui.navigationDashboard)}>
      {dataset.transactions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title={i18n.t($ => $.ui.dashboardNoTransactionsYet)} description={i18n.t($ => $.ui.dashboardAddYourFirstIncomeOrExpenseTo)}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/transactions")} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{i18n.t($ => $.ui.dashboardAddTransaction)}</Text>
            </Pressable>
            <VoiceEntryButton />
          </EmptyState>
        </View>
      ) : (
        <>
          <View style={styles.baseSummaryCard}>
            <View style={styles.baseSummaryHeader}><View><Text style={styles.baseSummaryEyebrow}>{i18n.t($ => $.ui.dashboardBaseCurrencySnapshot)}</Text><Text style={styles.baseSummaryTitle}>{baseCurrency} · {month}</Text></View><Text style={styles.rateState}>{rateQueries.isLoading ? i18n.t($ => $.ui.dashboardLoadingRates) : convertedMonth.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.dashboardPartialView) : convertedMonth.rates.some((rate) => rate.status === "stale") ? i18n.t($ => $.ui.dashboardStaleRates) : i18n.t($ => $.ui.dashboardRatesAvailable)}</Text></View>
            {convertedMonth.unavailableCurrencies.length > 0 ? <Text style={styles.rateNotice}>{i18n.t($ => $.ui.dashboardCombinedTotalsAreUnavailableFor)} {convertedMonth.unavailableCurrencies.join(", ")}{i18n.t($ => $.ui.dashboardOriginalCurrencyFiguresRemainBelow)}</Text> : <View style={styles.baseTotals}><View><Text style={styles.summaryLabel}>{i18n.t($ => $.ui.dashboardIncome)}</Text><Text style={[styles.baseAmount, styles.income]}>{formatMoneyForDisplay(convertedMonth.income)}</Text></View><View><Text style={styles.summaryLabel}>{i18n.t($ => $.ui.dashboardExpenses)}</Text><Text style={[styles.baseAmount, styles.expense]}>{formatMoneyForDisplay(convertedMonth.expenses)}</Text></View><View><Text style={styles.summaryLabel}>{i18n.t($ => $.ui.dashboardNet)}</Text><Text style={styles.baseAmount}>{formatMoneyForDisplay(subtractMoney(convertedMonth.income, convertedMonth.expenses))}</Text></View></View>}
            <Text style={styles.rateFootnote}>{convertedMonth.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.dashboardNoEcbReferenceRateIsAvailableFor) : rateQueries.hasError ? i18n.t($ => $.ui.dashboardExchangeRatesCouldNotBeRefreshedRetry) : convertedMonth.rates.some((rate) => rate.status === "stale") ? i18n.t($ => $.notices.cachedRate) : convertedMonth.rates.length > 0 ? i18n.t($ => $.ui.dashboardRatesUseTheLatestAvailableDataEffective) : i18n.t($ => $.ui.dashboardSameCurrencyTotalsDoNotRequireA)}</Text>
          </View>
          <View style={styles.summaryGrid}>
            {currencyAggregates.map((aggregate) => (
              <View key={aggregate.currency} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{aggregate.currency} {i18n.t($ => $.ui.dashboardIncomeAlternative)}</Text>
                <Text style={[styles.summaryAmount, styles.income]}>{formatMoneyForDisplay(aggregate.income)}</Text>
                <Text style={styles.summaryLabel}>{i18n.t($ => $.ui.dashboardExpenses)}</Text>
                <Text style={[styles.summaryAmount, styles.expense]}>{formatMoneyForDisplay(aggregate.expenses)}</Text>
                <View style={styles.divider} />
                <Text style={styles.summaryLabel}>{i18n.t($ => $.ui.dashboardRemainingBudget)}</Text>
                <Text style={styles.remainingText}>{(() => { const budget = totalBudgetForMonth(dataset.budgets, month, aggregate.currency); return budget ? formatMoneyForDisplay(subtractMoney(budget, aggregate.expenses)) : i18n.t($ => $.ui.dashboardNoBudgetSet); })()}</Text>
              </View>
            ))}
          </View>

          <VoiceEntryButton />

          <View style={styles.contentGrid}>
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>{i18n.t($ => $.ui.dashboardCategorySpending)}</Text><Text style={styles.cardHint}>{i18n.t($ => $.ui.dashboardThisMonth)}</Text></View>
              {categoryAggregates.length === 0 ? <Text style={styles.muted}>{i18n.t($ => $.ui.dashboardNoExpenseActivityThisMonth)}</Text> : categoryAggregates.map((aggregate) => (
                <View key={`${aggregate.categoryId}:${aggregate.currency}`} style={styles.categoryRow}>
                  <View style={styles.categoryDot} />
                  <Text style={styles.categoryName}>{categoryLabel(dataset.categories.find(category => category.id === aggregate.categoryId))}</Text>
                  <Text style={styles.categoryAmount}>{formatMoneyForDisplay(aggregate.spent)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>{i18n.t($ => $.ui.dashboardRecentActivity)}</Text><Pressable accessibilityRole="button" onPress={() => router.push("/transactions")}><Text style={styles.link}>{i18n.t($ => $.ui.dashboardSeeAll)}</Text></Pressable></View>
              {dataset.transactions.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5).map((transaction) => (
                <View key={transaction.id} style={styles.activityRow}>
                  <View style={styles.activityCopy}><Text style={styles.activityDescription}>{transaction.description}</Text><Text style={styles.muted}>{formatCalendarDate(transaction.date)}</Text></View>
                  <Text style={[styles.activityAmount, transaction.type === "income" ? styles.income : styles.expense]}>{transaction.type === "income" ? "+" : "−"}{formatMoneyForDisplay({ amount: transaction.amount, currency: transaction.currency })}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </AppScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  emptyWrap: { alignItems: "center", gap: 0 },
  baseSummaryCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 14, padding: 22 },
  baseSummaryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  baseSummaryEyebrow: { color: colors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  baseSummaryTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  rateState: { color: colors.positive, fontSize: 12, fontWeight: "800" },
  rateNotice: { color: colors.negative, fontSize: 13, lineHeight: 19 },
  baseTotals: { flexDirection: "row", flexWrap: "wrap", gap: 38 },
  baseAmount: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4 },
  rateFootnote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  primaryButton: { backgroundColor: colors.positive, borderRadius: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  summaryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minWidth: 240, padding: 20 },
  summaryLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  summaryAmount: { fontSize: 23, fontWeight: "800", marginBottom: 15 },
  income: { color: colors.positive },
  expense: { color: colors.negative },
  divider: { backgroundColor: colors.border, height: 1, marginBottom: 15 },
  remainingText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  contentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minWidth: 280, padding: 20 },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  cardHint: { color: colors.muted, fontSize: 12 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13 },
  categoryRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 44 },
  categoryDot: { backgroundColor: colors.accent, borderRadius: 999, height: 10, width: 10 },
  categoryName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700" },
  categoryAmount: { color: colors.text, fontSize: 13, fontWeight: "800" },
  activityRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", gap: 12, minHeight: 52 },
  activityCopy: { flex: 1, gap: 3 },
  activityDescription: { color: colors.text, fontSize: 14, fontWeight: "700" },
  activityAmount: { fontSize: 13, fontWeight: "800" }
});
