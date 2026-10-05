import { isWebWorkspace, typography } from "../../../ui/designTokens";
import { AppText as Text } from "../../../ui/AppText";
import { formatMonth } from "../../../localization/region";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import Decimal from "decimal.js";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { reportObservation, categoryReport, convertMonthAggregate, currentCalendarMonth, formatMoneyForDisplay, monthlyReport, type ReportPeriod } from "../../../domain";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { useAnalytics } from "../../../providers/AnalyticsProvider";
import { useExchangeRates, rateRequestKey } from "../../exchange-rates/hooks/useExchangeRates";

export function ReportsScreen() {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const wide = isWebWorkspace(Platform.OS, width);
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const analytics = useAnalytics();
  const [period, setPeriod] = useState<ReportPeriod>("6m");
  const month = currentCalendarMonth();
  const count = period === "3m" ? 3 : period === "12m" ? 12 : 6;
  const points = useMemo(() => dataset ? monthlyReport(dataset.transactions, month, count) : [], [count, dataset, month]);
  const categories = useMemo(() => dataset ? categoryReport(dataset.transactions, dataset.categories, month) : [], [dataset, month]);
  const baseCurrency = dataset?.preferences.baseCurrency ?? "USD";
  const rateRequests = useMemo(() => dataset ? dataset.transactions.filter((transaction) => transaction.date >= (points[0]?.month ?? month) && transaction.date <= `${month}-31`).map((transaction) => ({ currency: transaction.currency, date: transaction.date })) : [], [dataset, month, points]);
  const historicalRates = useExchangeRates(baseCurrency, rateRequests);
  const convertedPoints = useMemo(() => dataset ? points.map((point) => convertMonthAggregate(dataset.transactions, point.month, baseCurrency, (currency, date) => historicalRates.states.get(rateRequestKey({ currency, date }))?.record)) : [], [baseCurrency, dataset, historicalRates.states, points]);
  useEffect(() => { void analytics.capture("report_viewed", { surface: "reports", actionResult: "success" }); }, [analytics]);

  if (!dataset) return null;
  const hasActivity = points.some((point) => point.aggregates.length > 0);
  const maxExpenses = points.reduce((max, point) => point.aggregates.reduce((innerMax, aggregate) => Decimal.max(innerMax, aggregate.expenses.amount), max), new Decimal(0));

  return (
    <AppScreen eyebrow={i18n.t($ => $.ui.reportsFactualSummaries)} title={i18n.t($ => $.ui.navigationReports)}>
      <View style={styles.toolbar}>
        <View><Text style={styles.toolbarTitle}>{i18n.t($ => $.ui.reportsSpendingHistory)}</Text><Text style={styles.toolbarHint}>{i18n.t($ => $.ui.reportsDescriptiveOnlyNoFinancialAdvice)}</Text></View>
        <View style={styles.periods}>{(["3m", "6m", "12m"] as const).map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: period === option }} key={option} onPress={() => setPeriod(option)} style={[styles.periodChip, period === option && styles.activePeriod]}><Text style={[styles.periodText, period === option && styles.activePeriodText]}>{option.toUpperCase()}</Text></Pressable>)}</View>
      </View>

      {!hasActivity ? <View style={styles.emptyCard}><EmptyState title={i18n.t($ => $.ui.reportsNoReportDataYet)} description={i18n.t($ => $.ui.reportsAddTransactionsToSeeMonthlyTrendsAnd)} /></View> : <>
        <View style={styles.notice}><Text style={styles.noticeTitle}>{i18n.t($ => $.ui.reportsOriginalCurrenciesPreserved)}</Text><Text style={styles.noticeText}>{i18n.t($ => $.ui.reportsReportsGroupFiguresByCurrencySoA)}</Text></View>
        <View style={styles.baseCard}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>{i18n.t($ => $.ui.reportsBaseCurrencyTrend)}</Text><Text style={styles.cardHint}>{i18n.t($ => $.ui.reportsHistoricalRates)} {baseCurrency}</Text></View><Text style={styles.cardHint}>{historicalRates.isLoading ? i18n.t($ => $.ui.dashboardLoadingRates) : historicalRates.hasError ? i18n.t($ => $.ui.reportsRateError) : historicalRates.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.reportsPartialData) : i18n.t($ => $.ui.reportsReady)}</Text></View>{convertedPoints.some((point) => point.unavailableCurrencies.length > 0) ? <Text style={styles.noticeText}>{i18n.t($ => $.ui.reportsSomeDatesHaveNoUsableRateYet)}</Text> : <View style={styles.baseRows}>{convertedPoints.map((point, index) => <View key={points[index]?.month ?? `${point.currency}-${index}`} style={styles.baseRow}><Text style={styles.baseRowLabel}>{formatMonthLabelSafe(points[index]?.month ?? month)}</Text><Text style={styles.baseRowValue}>{formatMoneyForDisplay(point.expenses)} {i18n.t($ => $.ui.reportsExpenses)}</Text><Text style={styles.baseRowValue}>{formatMoneyForDisplay(point.income)} {i18n.t($ => $.ui.reportsIncome)}</Text></View>)}</View>}<Text style={styles.cardHint}>{i18n.t($ => $.ui.reportsEachConversionUsesTheNearestPriorPublished)}</Text></View>
        <View style={styles.card}>
          <View style={styles.cardHeader}><View><Text style={styles.cardTitle}>{i18n.t($ => $.ui.reportsMonthlyExpenses)}</Text><Text style={styles.cardHint}>{i18n.t($ => $.ui.reportsLast)} {count} {i18n.t($ => $.ui.reportsMonthsOriginalCurrencies)}</Text></View><Text style={styles.cardHint}>{formatMonthLabelSafe(month)}</Text></View>
          <View style={styles.chart}>{points.map((point) => <View key={point.month} style={styles.chartRow}><Text style={styles.chartLabel}>{formatMonth(point.month)}</Text><View style={styles.bars}>{point.aggregates.length === 0 ? <Text style={styles.noActivity}>{i18n.t($ => $.ui.reportsNoActivity)}</Text> : point.aggregates.map((aggregate) => <View key={aggregate.currency} style={styles.currencyBarRow}><Text style={styles.currencyLabel}>{aggregate.currency}</Text><View style={styles.track}><View style={[styles.expenseBar, { width: `${maxExpenses.isZero() ? 0 : Decimal(aggregate.expenses.amount).dividedBy(maxExpenses).times(100).toNumber()}%` }]} /></View><Text style={styles.barValue}>{formatMoneyForDisplay(aggregate.expenses)}</Text></View>)}</View></View>)}</View>
        </View>
        <View style={[styles.grid, wide && styles.wideGrid]}>
          <View style={styles.card}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>{i18n.t($ => $.ui.reportsCategoryBreakdown)}</Text><Text style={styles.cardHint}>{formatMonthLabelSafe(month)}</Text></View></View>{categories.length === 0 ? <Text style={styles.muted}>{i18n.t($ => $.ui.dashboardNoExpenseActivityThisMonth)}</Text> : <CategoryList categories={categories} />}</View>
          <View style={styles.card}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>{i18n.t($ => $.ui.reportsWhatHappened)}</Text><Text style={styles.cardHint}>{i18n.t($ => $.ui.reportsAFactualActivityNote)}</Text></View></View><Text style={styles.observation}>{localizedObservation(points[points.length - 1] ?? { month, aggregates: [] })}</Text><Text style={styles.muted}>{i18n.t($ => $.ui.reportsThisSummaryDescribesRecordedActivityItDoes)}</Text></View>
        </View>
      </>}
    </AppScreen>
  );
}

function localizedObservation(point: Parameters<typeof reportObservation>[0]): string {
  const observation = reportObservation(point);
  return observation.transactionCount === 0
    ? i18n.t($ => $.reports.empty, { month: formatMonth(point.month) })
    : i18n.t($ => $.reports.activity, { count: observation.transactionCount, month: formatMonth(point.month), currencies: observation.currencies.join(", ") });
}

function formatMonthLabelSafe(month: `${number}-${number}`): string { return formatMonth(month); }

function CategoryList({ categories }: { categories: ReturnType<typeof categoryReport> }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const max = categories.reduce((largest, item) => Decimal.max(largest, item.spent.amount), new Decimal(0));
  return <View style={styles.categoryList}>{categories.slice(0, 8).map((item) => <View key={`${item.categoryId}:${item.currency}`} style={styles.categoryRow}><View style={styles.categoryCopy}><Text style={styles.categoryName}>{categoryLabel(useLocalDatasetStore.getState().dataset?.categories.find(category => category.id === item.categoryId))}</Text><Text style={styles.categoryMeta}>{item.currency}</Text></View><View style={styles.categoryBarTrack}><View style={[styles.categoryBar, { width: `${max.isZero() ? 0 : Decimal(item.spent.amount).dividedBy(max).times(100).toNumber()}%` }]} /></View><Text style={styles.categoryAmount}>{formatMoneyForDisplay(item.spent)}</Text></View>)}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between" },
  toolbarTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  toolbarHint: { color: colors.muted, fontSize: 14, marginTop: 4 },
  periods: { flexDirection: "row", gap: 8 },
  periodChip: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  activePeriod: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  activePeriodText: { color: colors.onPrimary },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1 },
  notice: { backgroundColor: colors.infoSubtle, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 4, padding: 14 },
  noticeTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  noticeText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  baseCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 14, padding: 20 },
  baseRows: { gap: 10 },
  baseRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, minHeight: 40 },
  baseRowLabel: { color: colors.text, fontSize: 14, fontWeight: "500", minWidth: 78 },
  baseRowValue: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  grid: { gap: 16 },
  wideGrid: { flexDirection: "row" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, gap: 16, minWidth: 0, padding: 20 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  cardHint: { color: colors.muted, fontSize: 14, marginTop: 4 },
  chart: { gap: 15 },
  chartRow: { alignItems: "stretch", flexDirection: "column", gap: 12, minHeight: 28 },
  chartLabel: { color: colors.muted, fontSize: 14, fontWeight: "500", minWidth: 76 },
  bars: { width: "100%", gap: 7 },
  currencyBarRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  currencyLabel: { color: colors.muted, fontSize: 11, fontWeight: "500", width: 30 },
  track: { backgroundColor: colors.track, borderRadius: 9999, flex: 1, height: 10, overflow: "hidden" },
  expenseBar: { backgroundColor: colors.accent, borderRadius: 9999, height: 10, minWidth: 3 },
  barValue: { ...typography.amount, maxWidth: "60%", color: colors.text, fontSize: 14, fontWeight: "500", minWidth: 76, textAlign: "right" },
  noActivity: { color: colors.muted, fontSize: 14 },
  categoryList: { gap: 15 },
  categoryRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryCopy: { minWidth: 60, flex: 1 },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: "500" },
  categoryMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  categoryBarTrack: { backgroundColor: colors.track, borderRadius: 9999, flex: 1, height: 8, overflow: "hidden" },
  categoryBar: { backgroundColor: colors.accent, borderRadius: 9999, height: 8, minWidth: 3 },
  categoryAmount: { ...typography.amount, maxWidth: "60%", color: colors.text, fontSize: 14, fontWeight: "500", minWidth: 70, textAlign: "right" },
  observation: { color: colors.text, fontSize: 17, fontWeight: "500", lineHeight: 25 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 }
});
