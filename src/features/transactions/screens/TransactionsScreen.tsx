import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { filterTransactions } from "../../../domain/transactions";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { colors } from "../../../ui/theme";
import { TransactionForm, type TransactionFormResult } from "../components/TransactionForm";
import { TransactionRow } from "../components/TransactionRow";
import { useDatasetStore } from "../../sync/store/useDatasetStore";

type FormState = { mode: "new" } | { mode: "edit"; id: string } | null;

export function TransactionsScreen() {
  const { width } = useWindowDimensions();
  const dataset = useDatasetStore((state) => state.dataset);
  const transactionFilters = useDatasetStore((state) => state.transactionFilters);
  const setTransactionFilters = useDatasetStore((state) => state.setTransactionFilters);
  const clearTransactionFilters = useDatasetStore((state) => state.clearTransactionFilters);
  const addTransaction = useDatasetStore((state) => state.addTransaction);
  const editTransaction = useDatasetStore((state) => state.editTransaction);
  const deleteTransaction = useDatasetStore((state) => state.deleteTransaction);
  const saveError = useDatasetStore((state) => state.saveError);
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const isBrowserWorkspace = width >= 900;
  const transactions = useMemo(() => dataset?.transactions ?? [], [dataset]);
  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, transactionFilters),
    [transactions, transactionFilters]
  );
  const selectedTransaction = formState?.mode === "edit" ? transactions.find((transaction) => transaction.id === formState.id) : undefined;

  const onSave = async (input: Parameters<typeof addTransaction>[0]): Promise<TransactionFormResult> => {
    const result = formState?.mode === "edit" && selectedTransaction
      ? await editTransaction(selectedTransaction.id, input)
      : await addTransaction(input);
    if (!result.ok) return result;
    setActionMessage(formState?.mode === "edit" ? "Transaction updated locally." : "Transaction saved locally.");
    return { ok: true };
  };

  const openNew = () => {
    setActionMessage(null);
    setFormState({ mode: "new" });
  };

  const openEdit = (id: string) => {
    setActionMessage(null);
    setFormState({ mode: "edit", id });
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const result = await deleteTransaction(pendingDeleteId);
    setPendingDeleteId(null);
    setActionMessage(result.ok ? "Transaction deleted locally." : result.message);
  };

  if (!dataset) return null;

  const form = formState ? (
    <TransactionForm
      categories={dataset.categories}
      onCancel={() => setFormState(null)}
      onSave={onSave}
      transaction={selectedTransaction}
    />
  ) : null;

  return (
    <AppScreen eyebrow="Your local records" title="Transactions">
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search transactions"
            onChangeText={(query) => setTransactionFilters({ query })}
            placeholder="Search transactions"
            placeholderTextColor="#829AB1"
            style={styles.searchInput}
            value={transactionFilters.query ?? ""}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={openNew} style={styles.addButton}>
          <Text style={styles.addButtonText}>＋ Add transaction</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <FilterChip label="All" active={!transactionFilters.type || transactionFilters.type === "all"} onPress={() => setTransactionFilters({ type: "all" })} />
        <FilterChip label="Income" active={transactionFilters.type === "income"} onPress={() => setTransactionFilters({ type: "income" })} />
        <FilterChip label="Expenses" active={transactionFilters.type === "expense"} onPress={() => setTransactionFilters({ type: "expense" })} />
        {Object.keys(transactionFilters).length > 0 ? <FilterChip label="Clear filters" active={false} onPress={clearTransactionFilters} /> : null}
      </View>

      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{saveError}</Text> : null}
      {actionMessage ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{actionMessage}</Text> : null}

      {pendingDeleteId ? (
        <View style={styles.confirmation}>
          <View style={styles.confirmationCopy}>
            <Text style={styles.confirmationTitle}>Delete this transaction?</Text>
            <Text style={styles.confirmationText}>This removes it from the local list and records a deletion for future sync.</Text>
          </View>
          <View style={styles.confirmationActions}>
            <Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.cancelSmallButton}><Text style={styles.cancelSmallText}>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void confirmDelete()} style={styles.deleteConfirmButton}><Text style={styles.deleteConfirmText}>Delete</Text></Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.workspace, isBrowserWorkspace && styles.browserWorkspace]}>
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>Activity</Text>
            <Text style={styles.resultCount}>{filteredTransactions.length} {filteredTransactions.length === 1 ? "record" : "records"}</Text>
          </View>
          {transactions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState title="No transactions yet" description="Add your first income or expense to start building your local activity history." />
              <Pressable accessibilityRole="button" onPress={openNew} style={styles.emptyAction}><Text style={styles.addButtonText}>＋ Add transaction</Text></Pressable>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.noMatch}><Text style={styles.noMatchTitle}>No matching transactions</Text><Text style={styles.noMatchText}>Try a different search or clear the filters.</Text></View>
          ) : (
            filteredTransactions.map((transaction) => (
              <TransactionRow
                category={dataset.categories.find((category) => category.id === transaction.categoryId)}
                key={transaction.id}
                onDelete={() => setPendingDeleteId(transaction.id)}
                onPress={() => openEdit(transaction.id)}
                transaction={transaction}
              />
            ))
          )}
        </View>
        {isBrowserWorkspace ? form : null}
      </View>

      {!isBrowserWorkspace ? (
        <Modal animationType="slide" onRequestClose={() => setFormState(null)} visible={Boolean(formState)}>
          <View style={styles.mobileModal}>{form}</View>
        </Modal>
      ) : null}
    </AppScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterChip, active && styles.activeFilterChip]}><Text style={[styles.filterText, active && styles.activeFilterText]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  searchWrap: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", flex: 1, maxWidth: 560, minHeight: 48, paddingHorizontal: 12 },
  searchIcon: { color: colors.muted, fontSize: 22, marginRight: 8 },
  searchInput: { color: colors.navy, flex: 1, fontSize: 15, minHeight: 44 },
  addButton: { alignItems: "center", backgroundColor: colors.navy, borderRadius: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  addButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  filterRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  activeFilterChip: { backgroundColor: "#EAF0F8", borderColor: "#B8CBE0" },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  activeFilterText: { color: colors.navy },
  errorBanner: { backgroundColor: "#FFF2F0", borderRadius: 10, color: colors.coral, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: "#E9F7EF", borderRadius: 10, color: colors.emerald, fontSize: 14, padding: 12 },
  confirmation: { alignItems: "center", backgroundColor: "#FFF9F8", borderColor: "#F4C7C7", borderRadius: 14, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "space-between", padding: 16 },
  confirmationCopy: { flex: 1, gap: 4, minWidth: 220 },
  confirmationTitle: { color: colors.navy, fontSize: 15, fontWeight: "800" },
  confirmationText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  confirmationActions: { flexDirection: "row", gap: 8 },
  cancelSmallButton: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 13 },
  cancelSmallText: { color: colors.navy, fontSize: 13, fontWeight: "700" },
  deleteConfirmButton: { backgroundColor: colors.coral, borderRadius: 10, minHeight: 42, justifyContent: "center", paddingHorizontal: 13 },
  deleteConfirmText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  workspace: { gap: 18 },
  browserWorkspace: { flexDirection: "row", alignItems: "flex-start" },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minWidth: 0, padding: 18 },
  listHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 },
  cardTitle: { color: colors.navy, fontSize: 18, fontWeight: "800" },
  resultCount: { color: colors.muted, fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingVertical: 8 },
  emptyAction: { backgroundColor: colors.emerald, borderRadius: 12, marginTop: -42, minHeight: 46, justifyContent: "center", paddingHorizontal: 16 },
  noMatch: { alignItems: "center", padding: 42 },
  noMatchTitle: { color: colors.navy, fontSize: 17, fontWeight: "800" },
  noMatchText: { color: colors.muted, fontSize: 14, marginTop: 7 },
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
