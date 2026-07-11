import Decimal from "decimal.js";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { categoryReport, currentCalendarMonth, formatMoneyForDisplay, monthlyReport, reportObservation, type ReportPeriod } from "../../../domain";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { colors } from "../../../ui/theme";
import { useDatasetStore } from "../../sync/store/useDatasetStore";

export function ReportsScreen() {
  const dataset = useDatasetStore((state) => state.dataset);
  const [period, setPeriod] = useState<ReportPeriod>("6m");
  const month = currentCalendarMonth();
  const count = period === "3m" ? 3 : period === "12m" ? 12 : 6;
  const points = useMemo(() => dataset ? monthlyReport(dataset.transactions, month, count) : [], [count, dataset, month]);
  const categories = useMemo(() => dataset ? categoryReport(dataset.transactions, dataset.categories, month) : [], [dataset, month]);

  if (!dataset) return null;
  const hasActivity = points.some((point) => point.aggregates.length > 0);
  const maxExpenses = points.reduce((max, point) => point.aggregates.reduce((innerMax, aggregate) => Decimal.max(innerMax, aggregate.expenses.amount), max), new Decimal(0));

  return (
    <AppScreen eyebrow="Factual summaries" title="Reports">
      <View style={styles.toolbar}>
        <View><Text style={styles.toolbarTitle}>Spending history</Text><Text style={styles.toolbarHint}>Descriptive only · no financial advice</Text></View>
        <View style={styles.periods}>{(["3m", "6m", "12m"] as const).map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: period === option }} key={option} onPress={() => setPeriod(option)} style={[styles.periodChip, period === option && styles.activePeriod]}><Text style={[styles.periodText, period === option && styles.activePeriodText]}>{option.toUpperCase()}</Text></Pressable>)}</View>
      </View>

      {!hasActivity ? <View style={styles.emptyCard}><EmptyState title="No report data yet" description="Add transactions to see monthly trends and category breakdowns. Your original currencies will remain visible until conversion rates are available." /></View> : <>
        <View style={styles.notice}><Text style={styles.noticeTitle}>Original currencies preserved</Text><Text style={styles.noticeText}>Reports group figures by currency so a missing exchange rate never creates a misleading combined total.</Text></View>
        <View style={styles.card}>
          <View style={styles.cardHeader}><View><Text style={styles.cardTitle}>Monthly expenses</Text><Text style={styles.cardHint}>Last {count} months · original currencies</Text></View><Text style={styles.cardHint}>{formatMonthLabelSafe(month)}</Text></View>
          <View style={styles.chart}>{points.map((point) => <View key={point.month} style={styles.chartRow}><Text style={styles.chartLabel}>{point.label}</Text><View style={styles.bars}>{point.aggregates.length === 0 ? <Text style={styles.noActivity}>No activity</Text> : point.aggregates.map((aggregate) => <View key={aggregate.currency} style={styles.currencyBarRow}><Text style={styles.currencyLabel}>{aggregate.currency}</Text><View style={styles.track}><View style={[styles.expenseBar, { width: `${maxExpenses.isZero() ? 0 : Decimal(aggregate.expenses.amount).dividedBy(maxExpenses).times(100).toNumber()}%` }]} /></View><Text style={styles.barValue}>{formatMoneyForDisplay(aggregate.expenses)}</Text></View>)}</View></View>)}</View>
        </View>
        <View style={styles.grid}>
          <View style={styles.card}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>Category breakdown</Text><Text style={styles.cardHint}>{formatMonthLabelSafe(month)}</Text></View></View>{categories.length === 0 ? <Text style={styles.muted}>No expense activity this month.</Text> : <CategoryList categories={categories} />}</View>
          <View style={styles.card}><View style={styles.cardHeader}><View><Text style={styles.cardTitle}>What happened</Text><Text style={styles.cardHint}>A factual activity note</Text></View></View><Text style={styles.observation}>{reportObservation(points[points.length - 1] ?? { month, label: formatMonthLabelSafe(month), aggregates: [] })}</Text><Text style={styles.muted}>This summary describes recorded activity; it does not recommend actions.</Text></View>
        </View>
      </>}
    </AppScreen>
  );
}

function formatMonthLabelSafe(month: `${number}-${number}`): string {
  const [year, monthNumber] = month.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)));
}

function CategoryList({ categories }: { categories: ReturnType<typeof categoryReport> }) {
  const max = categories.reduce((largest, item) => Decimal.max(largest, item.spent.amount), new Decimal(0));
  return <View style={styles.categoryList}>{categories.slice(0, 8).map((item) => <View key={`${item.categoryId}:${item.currency}`} style={styles.categoryRow}><View style={styles.categoryCopy}><Text style={styles.categoryName}>{item.categoryName}</Text><Text style={styles.categoryMeta}>{item.currency}</Text></View><View style={styles.categoryBarTrack}><View style={[styles.categoryBar, { width: `${max.isZero() ? 0 : Decimal(item.spent.amount).dividedBy(max).times(100).toNumber()}%` }]} /></View><Text style={styles.categoryAmount}>{formatMoneyForDisplay(item.spent)}</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between" },
  toolbarTitle: { color: colors.navy, fontSize: 17, fontWeight: "800" },
  toolbarHint: { color: colors.muted, fontSize: 13, marginTop: 4 },
  periods: { flexDirection: "row", gap: 8 },
  periodChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  activePeriod: { backgroundColor: colors.navy, borderColor: colors.navy },
  periodText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  activePeriodText: { color: colors.surface },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1 },
  notice: { backgroundColor: "#EAF0F8", borderColor: "#C5D5E6", borderRadius: 14, borderWidth: 1, gap: 4, padding: 14 },
  noticeTitle: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  noticeText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, gap: 16, minWidth: 300, padding: 20 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { color: colors.navy, fontSize: 18, fontWeight: "800" },
  cardHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  chart: { gap: 15 },
  chartRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, minHeight: 28 },
  chartLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", width: 76 },
  bars: { flex: 1, gap: 7 },
  currencyBarRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  currencyLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", width: 30 },
  track: { backgroundColor: "#EDF1F5", borderRadius: 999, flex: 1, height: 10, overflow: "hidden" },
  expenseBar: { backgroundColor: colors.sky, borderRadius: 999, height: 10, minWidth: 3 },
  barValue: { color: colors.navy, fontSize: 12, fontWeight: "800", minWidth: 76, textAlign: "right" },
  noActivity: { color: colors.muted, fontSize: 12 },
  categoryList: { gap: 15 },
  categoryRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  categoryCopy: { minWidth: 102, width: 102 },
  categoryName: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  categoryMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  categoryBarTrack: { backgroundColor: "#EDF1F5", borderRadius: 999, flex: 1, height: 8, overflow: "hidden" },
  categoryBar: { backgroundColor: colors.sky, borderRadius: 999, height: 8, minWidth: 3 },
  categoryAmount: { color: colors.navy, fontSize: 12, fontWeight: "800", minWidth: 70, textAlign: "right" },
  observation: { color: colors.navy, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 }
});
