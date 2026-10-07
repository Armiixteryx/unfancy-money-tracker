import { typography } from "../../../ui/designTokens";
import { AppText as Text } from "../../../ui/AppText";
import { formatCalendarDate } from "../../../localization/region";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

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
  canManage?: boolean;
  showCreator?: boolean;
};

export function TransactionRow({
  transaction,
  category,
  onPress,
  onDelete,
  isDeletePending,
  onCancelDelete,
  onConfirmDelete,
  canManage = true,
  showCreator = false
}: TransactionRowProps) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const isIncome = transaction.type === "income";
  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <Pressable accessibilityRole={canManage ? "button" : undefined} accessibilityLabel={i18n.t($ => canManage ? $.notices.editRecord : $.notices.viewRecord, { description: transaction.description })} disabled={!canManage} onPress={onPress} style={styles.main}>
          <View style={[styles.icon, isIncome ? styles.incomeIcon : styles.expenseIcon]}>
            <Text style={styles.iconText}>{isIncome ? "+" : "−"}</Text>
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.description}>{transaction.description}</Text>
            <Text style={styles.meta}>{categoryLabel(category)} · {formatCalendarDate(transaction.date)}</Text>
            {showCreator && transaction.creator ? <Text style={styles.creator}>{transaction.creator.email}</Text> : null}
          </View>
          <Text style={[styles.amount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
            {isIncome ? "+" : "−"}{formatMoneyForDisplay({ amount: transaction.amount, currency: transaction.currency })}
          </Text>
        </Pressable>
        {canManage ? <Pressable accessibilityRole="button" accessibilityLabel={i18n.t($ => $.notices.deleteRecord, { description: transaction.description })} onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>×</Text>
        </Pressable> : null}
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
  icon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  incomeIcon: { backgroundColor: colors.positiveSubtle },
  expenseIcon: { backgroundColor: colors.infoSubtle },
  iconText: { color: colors.text, fontSize: 20, fontWeight: "500" },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  description: { color: colors.text, fontSize: 15, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 14 },
  creator: { color: colors.muted, fontSize: 12 },
  amount: { ...typography.amount, fontSize: 14, fontWeight: "500", textAlign: "right" },
  incomeAmount: { color: colors.positive },
  expenseAmount: { color: colors.text },
  deleteButton: { alignItems: "center", borderRadius: 9999, height: 48, justifyContent: "center", marginLeft: 8, width: 48 },
  deleteText: { color: colors.muted, fontSize: 22 },
  confirmation: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 12, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between", marginTop: 10, padding: 16 },
  confirmationCopy: { flex: 1, gap: 4, minWidth: 180 },
  confirmationTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
  confirmationText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmallButton: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 13 },
  cancelSmallText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  deleteConfirmButton: { backgroundColor: colors.negative, borderRadius: 9999, minHeight: 48, justifyContent: "center", paddingHorizontal: 13 },
  deleteConfirmText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" }
});
