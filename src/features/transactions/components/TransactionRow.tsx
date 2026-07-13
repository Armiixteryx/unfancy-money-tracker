import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoneyForDisplay } from "../../../domain/money";
import type { Category, Transaction } from "../../../domain/types";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";

type TransactionRowProps = {
  transaction: Transaction;
  category?: Category;
  onPress: () => void;
  onDelete: () => void;
};

export function TransactionRow({ transaction, category, onPress, onDelete }: TransactionRowProps) {
  const styles = useThemedStyles(createStyles);
  const isIncome = transaction.type === "income";
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${transaction.description}`} onPress={onPress} style={styles.main}>
        <View style={[styles.icon, isIncome ? styles.incomeIcon : styles.expenseIcon]}>
          <Text style={styles.iconText}>{isIncome ? "+" : "−"}</Text>
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.description}>{transaction.description}</Text>
          <Text style={styles.meta}>{category?.name ?? "Archived category"} · {transaction.date}</Text>
        </View>
        <Text style={[styles.amount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
          {isIncome ? "+" : "−"}{formatMoneyForDisplay({ amount: transaction.amount, currency: transaction.currency })}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${transaction.description}`} onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>×</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", minHeight: 74, paddingVertical: 10 },
  main: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12, minHeight: 54 },
  icon: { alignItems: "center", borderRadius: 999, height: 38, justifyContent: "center", width: 38 },
  incomeIcon: { backgroundColor: colors.positiveSubtle },
  expenseIcon: { backgroundColor: colors.negativeSubtle },
  iconText: { color: colors.text, fontSize: 20, fontWeight: "800" },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  description: { color: colors.text, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12 },
  amount: { fontSize: 14, fontWeight: "800", textAlign: "right" },
  incomeAmount: { color: colors.positive },
  expenseAmount: { color: colors.negative },
  deleteButton: { alignItems: "center", borderRadius: 999, height: 36, justifyContent: "center", marginLeft: 8, width: 36 },
  deleteText: { color: colors.muted, fontSize: 22 }
});
