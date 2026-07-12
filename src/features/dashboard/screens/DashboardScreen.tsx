import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { aggregateCategorySpending, aggregateMonthByCurrency, convertMonthAggregate, currentCalendarMonth, totalBudgetForMonth } from "../../../domain/aggregates";
import { formatMoneyForDisplay, subtractMoney } from "../../../domain/money";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { colors } from "../../../ui/theme";
import { useDatasetStore } from "../../sync/store/useDatasetStore";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

export function DashboardScreen() {
  const router = useRouter();
  const dataset = useDatasetStore((state) => state.dataset);
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
    <AppScreen eyebrow={month} title="Dashboard">
      {dataset.transactions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title="No transactions yet" description="Add your first income or expense to see your remaining budget and monthly picture." />
          <Pressable accessibilityRole="button" onPress={() => router.push("/transactions")} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>＋ Add transaction</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.baseSummaryCard}>
            <View style={styles.baseSummaryHeader}><View><Text style={styles.baseSummaryEyebrow}>Base currency snapshot</Text><Text style={styles.baseSummaryTitle}>{baseCurrency} · {month}</Text></View><Text style={styles.rateState}>{rateQueries.isLoading ? "Loading rates…" : convertedMonth.unavailableCurrencies.length > 0 ? "Partial view" : convertedMonth.rates.some((rate) => rate.status === "stale") ? "Stale rates" : "Rates available"}</Text></View>
            {convertedMonth.unavailableCurrencies.length > 0 ? <Text style={styles.rateNotice}>Combined totals are unavailable for {convertedMonth.unavailableCurrencies.join(", ")}. Original-currency figures remain below.</Text> : <View style={styles.baseTotals}><View><Text style={styles.summaryLabel}>Income</Text><Text style={[styles.baseAmount, styles.income]}>{formatMoneyForDisplay(convertedMonth.income)}</Text></View><View><Text style={styles.summaryLabel}>Expenses</Text><Text style={[styles.baseAmount, styles.expense]}>{formatMoneyForDisplay(convertedMonth.expenses)}</Text></View><View><Text style={styles.summaryLabel}>Net</Text><Text style={styles.baseAmount}>{formatMoneyForDisplay(subtractMoney(convertedMonth.income, convertedMonth.expenses))}</Text></View></View>}
            <Text style={styles.rateFootnote}>{rateQueries.hasError ? "Exchange rates could not be refreshed. Retry from Settings." : convertedMonth.rates.some((rate) => rate.status === "stale") ? "A cached rate is being used and is visibly stale. Refresh from Settings when online." : convertedMonth.rates.length > 0 ? `Rates use the latest available data; effective dates are shown in Settings.` : "Same-currency totals do not require a provider rate."}</Text>
          </View>
          <View style={styles.summaryGrid}>
            {currencyAggregates.map((aggregate) => (
              <View key={aggregate.currency} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{aggregate.currency} · income</Text>
                <Text style={[styles.summaryAmount, styles.income]}>{formatMoneyForDisplay(aggregate.income)}</Text>
                <Text style={styles.summaryLabel}>Expenses</Text>
                <Text style={[styles.summaryAmount, styles.expense]}>{formatMoneyForDisplay(aggregate.expenses)}</Text>
                <View style={styles.divider} />
                <Text style={styles.summaryLabel}>Remaining budget</Text>
                <Text style={styles.remainingText}>{(() => { const budget = totalBudgetForMonth(dataset.budgets, month, aggregate.currency); return budget ? formatMoneyForDisplay(subtractMoney(budget, aggregate.expenses)) : "No budget set"; })()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.contentGrid}>
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>Category spending</Text><Text style={styles.cardHint}>This month</Text></View>
              {categoryAggregates.length === 0 ? <Text style={styles.muted}>No expense activity this month.</Text> : categoryAggregates.map((aggregate) => (
                <View key={`${aggregate.categoryId}:${aggregate.currency}`} style={styles.categoryRow}>
                  <View style={styles.categoryDot} />
                  <Text style={styles.categoryName}>{aggregate.categoryName}</Text>
                  <Text style={styles.categoryAmount}>{formatMoneyForDisplay(aggregate.spent)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>Recent activity</Text><Pressable accessibilityRole="button" onPress={() => router.push("/transactions")}><Text style={styles.link}>See all</Text></Pressable></View>
              {dataset.transactions.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5).map((transaction) => (
                <View key={transaction.id} style={styles.activityRow}>
                  <View style={styles.activityCopy}><Text style={styles.activityDescription}>{transaction.description}</Text><Text style={styles.muted}>{transaction.date}</Text></View>
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

const styles = StyleSheet.create({
  emptyWrap: { alignItems: "center", gap: 0 },
  baseSummaryCard: { backgroundColor: colors.navy, borderRadius: 20, gap: 14, padding: 22 },
  baseSummaryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  baseSummaryEyebrow: { color: "#B8CBE0", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  baseSummaryTitle: { color: colors.surface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  rateState: { color: "#D6E8DB", fontSize: 12, fontWeight: "800" },
  rateNotice: { color: "#F7D8D5", fontSize: 13, lineHeight: 19 },
  baseTotals: { flexDirection: "row", flexWrap: "wrap", gap: 38 },
  baseAmount: { color: colors.surface, fontSize: 22, fontWeight: "800", marginTop: 4 },
  rateFootnote: { color: "#B8CBE0", fontSize: 12, lineHeight: 18 },
  primaryButton: { backgroundColor: colors.emerald, borderRadius: 12, marginTop: -42, minHeight: 48, justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  summaryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minWidth: 240, padding: 20 },
  summaryLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  summaryAmount: { fontSize: 23, fontWeight: "800", marginBottom: 15 },
  income: { color: colors.emerald },
  expense: { color: colors.coral },
  divider: { backgroundColor: colors.border, height: 1, marginBottom: 15 },
  remainingText: { color: colors.navy, fontSize: 15, fontWeight: "800" },
  contentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minWidth: 280, padding: 20 },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  cardTitle: { color: colors.navy, fontSize: 17, fontWeight: "800" },
  cardHint: { color: colors.muted, fontSize: 12 },
  link: { color: colors.sky, fontSize: 13, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13 },
  categoryRow: { alignItems: "center", borderBottomColor: "#EEF2F5", borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 44 },
  categoryDot: { backgroundColor: colors.sky, borderRadius: 999, height: 10, width: 10 },
  categoryName: { color: colors.navy, flex: 1, fontSize: 14, fontWeight: "700" },
  categoryAmount: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  activityRow: { alignItems: "center", borderBottomColor: "#EEF2F5", borderBottomWidth: 1, flexDirection: "row", gap: 12, minHeight: 52 },
  activityCopy: { flex: 1, gap: 3 },
  activityDescription: { color: colors.navy, fontSize: 14, fontWeight: "700" },
  activityAmount: { fontSize: 13, fontWeight: "800" }
});
