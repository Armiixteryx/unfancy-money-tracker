import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";
import { VoiceEntryButton } from "../../voice/VoiceEntryButton";
import { filterTransactions } from "../../../domain/transactions";
import { AppScreen, EmptyState } from "../../../ui/AppScreen";
import { Snackbar } from "../../../ui/Snackbar";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { DateFilterPicker } from "../components/DateFilterPicker";
import { TransactionForm, type TransactionFormResult } from "../components/TransactionForm";
import { TransactionRow } from "../components/TransactionRow";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

type FormState = { mode: "new" } | { mode: "edit"; id: string } | null;

export function TransactionsScreen() {
  const router = useRouter();
  const { edit, new: newParam } = useLocalSearchParams<{ edit?: string; new?: string }>();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const transactionFilters = useLocalDatasetStore((state) => state.transactionFilters);
  const setTransactionFilters = useLocalDatasetStore((state) => state.setTransactionFilters);
  const clearTransactionFilters = useLocalDatasetStore((state) => state.clearTransactionFilters);
  const addTransaction = useLocalDatasetStore((state) => state.addTransaction);
  const editTransaction = useLocalDatasetStore((state) => state.editTransaction);
  const deleteTransaction = useLocalDatasetStore((state) => state.deleteTransaction);
  const saveError = useLocalDatasetStore((state) => state.saveError);
  const analytics = useAnalytics();
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | undefined>();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteSnackbarMessage, setDeleteSnackbarMessage] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const isBrowserWorkspace = width >= 900;
  const transactions = useMemo(() => dataset?.transactions ?? [], [dataset]);
  const categories = useMemo(() => dataset?.categories.slice().sort((left, right) => left.name.localeCompare(right.name)) ?? [], [dataset?.categories]);
  const currencies = useMemo(() => [...new Set(transactions.map((transaction) => transaction.currency))].sort(), [transactions]);
  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, transactionFilters),
    [transactions, transactionFilters]
  );
  const selectedTransaction = formState?.mode === "edit" ? transactions.find((transaction) => transaction.id === formState.id) : undefined;

  useEffect(() => {
    if (!dataset || (!edit && !newParam)) return;
    setPendingSaveId(undefined);
    if (edit) {
      if (dataset.transactions.some((record) => record.id === edit)) setFormState({ mode: "edit", id: edit });
      else setActionMessage("This transaction is no longer available.");
    } else setFormState({ mode: "new" });
    router.setParams({ edit: undefined, new: undefined });
  }, [dataset, edit, newParam, router]);

  useEffect(() => {
    if (dataset && formState?.mode === "edit" && !selectedTransaction) {
      setFormState(null);
      setActionMessage("This transaction is no longer available.");
    }
  }, [dataset, formState, selectedTransaction]);

  const onSave = async (input: Parameters<typeof addTransaction>[0]): Promise<TransactionFormResult> => {
    const result = formState?.mode === "edit" && selectedTransaction
      ? await editTransaction(selectedTransaction.id, input)
      : pendingSaveId ? await editTransaction(pendingSaveId, input) : await addTransaction(input);
    if (!result.ok) { setPendingSaveId(result.recordId); return result; }
    setPendingSaveId(undefined);
    if (formState?.mode !== "edit") void analytics.capture("transaction_created", { surface: "transactions", actionResult: "success" });
    setActionMessage(formState?.mode === "edit" ? "Transaction updated locally." : "Transaction saved locally.");
    return { ok: true };
  };

  const openNew = () => {
    setPendingSaveId(undefined);
    setActionMessage(null);
    setDeleteSnackbarMessage(null);
    setFormState({ mode: "new" });
  };

  const openEdit = (id: string) => {
    setPendingSaveId(undefined);
    setActionMessage(null);
    setDeleteSnackbarMessage(null);
    setFormState({ mode: "edit", id });
  };

  const beginDelete = (transactionId: string) => {
    setDeleteSnackbarMessage(null);
    setPendingDeleteId(transactionId);
  };

  const confirmDelete = async (transactionId: string) => {
    if (pendingDeleteId !== transactionId) return;
    const result = await deleteTransaction(transactionId);
    setPendingDeleteId((currentId) => currentId === transactionId ? null : currentId);
    if (result.ok) {
      setActionMessage(null);
      setDeleteSnackbarMessage("Transaction deleted.");
    } else {
      setActionMessage(result.message);
    }
  };

  if (!dataset) return null;

  const hasActiveFilters = Boolean(transactionFilters.query?.trim() || transactionFilters.type || transactionFilters.categoryId || transactionFilters.currency || transactionFilters.fromDate || transactionFilters.toDate);

  const form = formState && (formState.mode === "new" || selectedTransaction) ? (
    <TransactionForm
      key={selectedTransaction?.id ?? "new"}
      baseCurrency={dataset.preferences.baseCurrency}
      categories={dataset.categories}
      onCancel={() => { setPendingSaveId(undefined); setFormState(null); }}
      onSave={onSave}
      selectedCurrencies={dataset.preferences.selectedCurrencies}
      transaction={selectedTransaction}
    />
  ) : null;

  return (
    <AppScreen
      eyebrow="Your local records"
      overlay={deleteSnackbarMessage ? <Snackbar message={deleteSnackbarMessage} onDismiss={() => setDeleteSnackbarMessage(null)} /> : null}
      title="Transactions"
    >
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search transactions"
            onChangeText={(query) => setTransactionFilters({ query })}
            placeholder="Search transactions"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            value={transactionFilters.query ?? ""}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={openNew} style={styles.addButton}>
          <Text style={styles.addButtonText}>＋ Add transaction</Text>
        </Pressable>
      </View>

      <VoiceEntryButton />

      <View style={styles.filterRow}>
        <FilterChip label="All" active={!transactionFilters.type || transactionFilters.type === "all"} onPress={() => setTransactionFilters({ type: "all" })} />
        <FilterChip label="Income" active={transactionFilters.type === "income"} onPress={() => { setTransactionFilters({ type: "income" }); void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} />
        <FilterChip label="Expenses" active={transactionFilters.type === "expense"} onPress={() => { setTransactionFilters({ type: "expense" }); void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} />
        <FilterChip label={showMoreFilters ? "Hide filters" : "More filters"} active={showMoreFilters} onPress={() => setShowMoreFilters((value) => !value)} />
        {hasActiveFilters ? <FilterChip label="Clear filters" active={false} onPress={clearTransactionFilters} /> : null}
      </View>

      {showMoreFilters ? <View style={styles.advancedFilters}>
        <View style={styles.filterGroup}><Text style={styles.filterLabel}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{<FilterChip label="All categories" active={!transactionFilters.categoryId} onPress={() => setTransactionFilters({ categoryId: "all" })} />}{categories.map((category) => <FilterChip key={category.id} label={category.name} active={transactionFilters.categoryId === category.id} onPress={() => setTransactionFilters({ categoryId: category.id })} />)}</ScrollView></View>
        <View style={styles.filterGroup}><Text style={styles.filterLabel}>Currency</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}><FilterChip label="All currencies" active={!transactionFilters.currency} onPress={() => setTransactionFilters({ currency: "all" })} />{currencies.map((currency) => <FilterChip key={currency} label={currency} active={transactionFilters.currency === currency} onPress={() => setTransactionFilters({ currency })} />)}</ScrollView></View>
        <View style={styles.dateFilters}><View style={styles.dateField}><Text style={styles.filterLabel}>From date</Text><DateFilterPicker accessibilityLabel="Filter from date" maximumDate={transactionFilters.toDate} onChange={(fromDate) => { setTransactionFilters({ fromDate }); if (fromDate) void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} value={transactionFilters.fromDate} /></View><View style={styles.dateField}><Text style={styles.filterLabel}>To date</Text><DateFilterPicker accessibilityLabel="Filter to date" minimumDate={transactionFilters.fromDate} onChange={(toDate) => { setTransactionFilters({ toDate }); if (toDate) void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} value={transactionFilters.toDate} /></View></View>
      </View> : null}

      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{saveError}</Text> : null}
      {actionMessage ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{actionMessage}</Text> : null}


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
                isDeletePending={pendingDeleteId === transaction.id}
                key={transaction.id}
                onCancelDelete={() => setPendingDeleteId(null)}
                onConfirmDelete={() => void confirmDelete(transaction.id)}
                onDelete={() => beginDelete(transaction.id)}
                onPress={() => openEdit(transaction.id)}
                transaction={transaction}
              />
            ))
          )}
        </View>
        {isBrowserWorkspace ? form : null}
      </View>

      {!isBrowserWorkspace ? (
        <Modal animationType="slide" onRequestClose={() => setFormState(null)} visible={Boolean(form)}>
          <View style={styles.mobileModal}>{form}</View>
        </Modal>
      ) : null}
    </AppScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterChip, active && styles.activeFilterChip]}><Text style={[styles.filterText, active && styles.activeFilterText]}>{label}</Text></Pressable>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  searchWrap: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", flex: 1, maxWidth: 560, minHeight: 48, paddingHorizontal: 12 },
  searchIcon: { color: colors.muted, fontSize: 22, marginRight: 8 },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, minHeight: 44 },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },
  filterRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  advancedFilters: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 14, padding: 14 },
  filterGroup: { gap: 8 },
  filterLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  filterScroll: { gap: 8, paddingRight: 8 },
  dateFilters: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dateField: { flex: 1, gap: 8, minWidth: 180 },
  filterChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  activeFilterChip: { backgroundColor: colors.infoSubtle, borderColor: colors.border },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  activeFilterText: { color: colors.text },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: colors.positiveSubtle, borderRadius: 10, color: colors.positive, fontSize: 14, padding: 12 },
  workspace: { gap: 18 },
  browserWorkspace: { flexDirection: "row", alignItems: "flex-start" },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minWidth: 0, padding: 18 },
  listHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  resultCount: { color: colors.muted, fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingVertical: 8 },
  emptyAction: { backgroundColor: colors.positive, borderRadius: 12, marginTop: 24, minHeight: 46, justifyContent: "center", paddingHorizontal: 16 },
  noMatch: { alignItems: "center", padding: 42 },
  noMatchTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  noMatchText: { color: colors.muted, fontSize: 14, marginTop: 7 },
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
