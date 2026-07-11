import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { aggregateCategorySpending, aggregateMonthByCurrency, currentCalendarMonth } from "../../../domain/aggregates";
import { formatMoneyForDisplay } from "../../../domain/money";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { colors } from "../../../ui/theme";
import { useDatasetStore } from "../../sync/store/useDatasetStore";

export function DashboardScreen() {
  const router = useRouter();
  const dataset = useDatasetStore((state) => state.dataset);
  const month = currentCalendarMonth();
  const currencyAggregates = useMemo(() => aggregateMonthByCurrency(dataset?.transactions ?? [], month), [dataset?.transactions, month]);
  const categoryAggregates = useMemo(() => aggregateCategorySpending(dataset?.transactions ?? [], dataset?.categories ?? [], month), [dataset?.transactions, dataset?.categories, month]);

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
          <View style={styles.summaryGrid}>
            {currencyAggregates.map((aggregate) => (
              <View key={aggregate.currency} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{aggregate.currency} · income</Text>
                <Text style={[styles.summaryAmount, styles.income]}>{formatMoneyForDisplay(aggregate.income)}</Text>
                <Text style={styles.summaryLabel}>Expenses</Text>
                <Text style={[styles.summaryAmount, styles.expense]}>{formatMoneyForDisplay(aggregate.expenses)}</Text>
                <View style={styles.divider} />
                <Text style={styles.summaryLabel}>Remaining budget</Text>
                <Text style={styles.remainingText}>{dataset.budgets.length ? "Budget details below" : "No budgets yet"}</Text>
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

