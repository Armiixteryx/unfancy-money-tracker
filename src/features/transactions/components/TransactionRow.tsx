import { formatCalendarDate } from "../../../localization/region";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoneyForDisplay } from "../../../domain/money";
import type { Category, Transaction } from "../../../domain/types";
import { useThemedStyles, type ThemeColors } from "../../../ui/theme";

type TransactionRowProps = {
  transaction: Transaction;
  category?: Category;
  onPress: () => void;
  onDelete: () => void;
  isDeletePending: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

export function TransactionRow({
  transaction,
  category,
  onPress,
  onDelete,
  isDeletePending,
  onCancelDelete,
  onConfirmDelete
}: TransactionRowProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const isIncome = transaction.type === "income";
  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.editRecord, { description: transaction.description })} onPress={onPress} style={styles.main}>
          <View style={[styles.icon, isIncome ? styles.incomeIcon : styles.expenseIcon]}>
            <Text style={styles.iconText}>{isIncome ? "+" : "−"}</Text>
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.description}>{transaction.description}</Text>
            <Text style={styles.meta}>{categoryLabel(category)} · {formatCalendarDate(transaction.date)}</Text>
          </View>
          <Text style={[styles.amount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
            {isIncome ? "+" : "−"}{formatMoneyForDisplay({ amount: transaction.amount, currency: transaction.currency })}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.deleteRecord, { description: transaction.description })} onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>×</Text>
        </Pressable>
      </View>
      {isDeletePending ? (
        <View style={styles.confirmation}>
          <View style={styles.confirmationCopy}>
            <Text style={styles.confirmationTitle}>{i18n.t($ => $.ui.transactionsDeleteThisTransaction)}</Text>
            <Text style={styles.confirmationText}>{i18n.t($ => $.ui.transactionsThisRemovesItFromTheLocalList)}</Text>
          </View>
          <View style={styles.confirmationActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.cancelDeleteRecord, { description: transaction.description })} onPress={onCancelDelete} style={styles.cancelSmallButton}>
              <Text style={styles.cancelSmallText}>{i18n.t($ => $.ui.commonCancel)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.confirmDeleteRecord, { description: transaction.description })} onPress={onConfirmDelete} style={styles.deleteConfirmButton}>
              <Text style={styles.deleteConfirmText}>{i18n.t($ => $.ui.settingsDelete)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { borderBottomColor: colors.divider, borderBottomWidth: 1, paddingVertical: 10 },
  rowContent: { alignItems: "center", flexDirection: "row", minHeight: 54 },
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
  deleteText: { color: colors.muted, fontSize: 22 },
  confirmation: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 14, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between", marginTop: 10, padding: 16 },
  confirmationCopy: { flex: 1, gap: 4, minWidth: 180 },
  confirmationTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  confirmationText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmallButton: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 13 },
  cancelSmallText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  deleteConfirmButton: { backgroundColor: colors.negative, borderRadius: 10, minHeight: 42, justifyContent: "center", paddingHorizontal: 13 },
  deleteConfirmText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" }
});
