import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../../ui/controls";
import { isWebWorkspace, typography } from "../../../ui/designTokens";
import { AppText as Text, AppTextInput as TextInput } from "../../../ui/AppText";
import { translateMessage } from "../../../localization/i18n";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

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
  useTranslation();
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
  const isBrowserWorkspace = isWebWorkspace(Platform.OS, width);
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
      else setActionMessage(i18n.t($ => $.ui.voiceThisTransactionIsNoLongerAvailable));
    } else setFormState({ mode: "new" });
    router.setParams({ edit: undefined, new: undefined });
  }, [dataset, edit, newParam, router]);

  useEffect(() => {
    if (dataset && formState?.mode === "edit" && !selectedTransaction) {
      setFormState(null);
      setActionMessage(i18n.t($ => $.ui.voiceThisTransactionIsNoLongerAvailable));
    }
  }, [dataset, formState, selectedTransaction]);

  const onSave = async (input: Parameters<typeof addTransaction>[0]): Promise<TransactionFormResult> => {
    const result = formState?.mode === "edit" && selectedTransaction
      ? await editTransaction(selectedTransaction.id, input)
      : pendingSaveId ? await editTransaction(pendingSaveId, input) : await addTransaction(input);
    if (!result.ok) { setPendingSaveId(result.recordId); return result; }
    setPendingSaveId(undefined);
    if (formState?.mode !== "edit") void analytics.capture("transaction_created", { surface: "transactions", actionResult: "success" });
    setActionMessage(formState?.mode === "edit" ? i18n.t($ => $.ui.transactionsTransactionUpdatedLocally) : i18n.t($ => $.ui.transactionsTransactionSavedLocally));
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
      setDeleteSnackbarMessage(i18n.t($ => $.ui.transactionsTransactionDeleted));
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
      eyebrow={i18n.t($ => $.ui.transactionsYourLocalRecords)}
      overlay={deleteSnackbarMessage ? <Snackbar message={deleteSnackbarMessage} onDismiss={() => setDeleteSnackbarMessage(null)} /> : null}
      title={i18n.t($ => $.ui.navigationTransactions)}
      actions={<Button label={i18n.t($ => $.ui.dashboardAddTransaction)} onPress={openNew} />}
    >
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel={i18n.t($ => $.ui.transactionsSearchTransactions)}
            onChangeText={(query) => setTransactionFilters({ query })}
            placeholder={i18n.t($ => $.ui.transactionsSearchTransactions)}
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            value={transactionFilters.query ?? ""}
          />
        </View>

      </View>

      <View style={styles.filterRow}>
        <FilterChip label={i18n.t($ => $.ui.transactionsAll)} active={!transactionFilters.type || transactionFilters.type === "all"} onPress={() => setTransactionFilters({ type: "all" })} />
        <FilterChip label={i18n.t($ => $.ui.dashboardIncome)} active={transactionFilters.type === "income"} onPress={() => { setTransactionFilters({ type: "income" }); void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} />
        <FilterChip label={i18n.t($ => $.ui.dashboardExpenses)} active={transactionFilters.type === "expense"} onPress={() => { setTransactionFilters({ type: "expense" }); void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} />
        <FilterChip label={showMoreFilters ? i18n.t($ => $.ui.transactionsHideFilters) : i18n.t($ => $.ui.transactionsMoreFilters)} active={showMoreFilters} onPress={() => setShowMoreFilters((value) => !value)} />
        {hasActiveFilters ? <FilterChip label={i18n.t($ => $.ui.transactionsClearFilters)} active={false} onPress={clearTransactionFilters} /> : null}
      </View>

      {showMoreFilters ? <View style={styles.advancedFilters}>
        <View style={styles.filterGroup}><Text style={styles.filterLabel}>{i18n.t($ => $.ui.transactionsCategory)}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{<FilterChip label={i18n.t($ => $.ui.transactionsAllCategories)} active={!transactionFilters.categoryId} onPress={() => setTransactionFilters({ categoryId: "all" })} />}{categories.map((category) => <FilterChip key={category.id} label={categoryLabel(category)} active={transactionFilters.categoryId === category.id} onPress={() => setTransactionFilters({ categoryId: category.id })} />)}</ScrollView></View>
        <View style={styles.filterGroup}><Text style={styles.filterLabel}>{i18n.t($ => $.ui.transactionsCurrency)}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}><FilterChip label={i18n.t($ => $.ui.transactionsAllCurrencies)} active={!transactionFilters.currency} onPress={() => setTransactionFilters({ currency: "all" })} />{currencies.map((currency) => <FilterChip key={currency} label={currency} active={transactionFilters.currency === currency} onPress={() => setTransactionFilters({ currency })} />)}</ScrollView></View>
        <View style={styles.dateFilters}><View style={styles.dateField}><Text style={styles.filterLabel}>{i18n.t($ => $.ui.transactionsFromDate)}</Text><DateFilterPicker accessibilityLabel={i18n.t($ => $.ui.transactionsFilterFromDate)} maximumDate={transactionFilters.toDate} onChange={(fromDate) => { setTransactionFilters({ fromDate }); if (fromDate) void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} value={transactionFilters.fromDate} /></View><View style={styles.dateField}><Text style={styles.filterLabel}>{i18n.t($ => $.ui.transactionsToDate)}</Text><DateFilterPicker accessibilityLabel={i18n.t($ => $.ui.transactionsFilterToDate)} minimumDate={transactionFilters.fromDate} onChange={(toDate) => { setTransactionFilters({ toDate }); if (toDate) void analytics.capture("transaction_filter_applied", { surface: "transactions", actionResult: "success" }); }} value={transactionFilters.toDate} /></View></View>
      </View> : null}

      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{translateMessage(saveError, true)}</Text> : null}
      {actionMessage ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{actionMessage}</Text> : null}


      <View style={[styles.workspace, isBrowserWorkspace && styles.browserWorkspace]}>
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>{i18n.t($ => $.ui.transactionsActivity)}</Text>
            <Text style={styles.resultCount}>{i18n.t($ => $.notices.recordCount, { count: filteredTransactions.length })}</Text>
          </View>
          {transactions.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState title={i18n.t($ => $.ui.dashboardNoTransactionsYet)} description={i18n.t($ => $.ui.transactionsAddYourFirstIncomeOrExpenseTo)} />
              <Pressable accessibilityRole="button" onPress={openNew} style={styles.emptyAction}><Text style={styles.addButtonText}>{i18n.t($ => $.ui.dashboardAddTransaction)}</Text></Pressable>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.noMatch}><Text style={styles.noMatchTitle}>{i18n.t($ => $.ui.transactionsNoMatchingTransactions)}</Text><Text style={styles.noMatchText}>{i18n.t($ => $.ui.transactionsTryADifferentSearchOrClearThe)}</Text></View>
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
        {isBrowserWorkspace && form ? <View style={styles.formPane}>{form}</View> : null}
      </View>

      <VoiceEntryButton />

      {!isBrowserWorkspace ? (
        <Modal animationType="slide" onRequestClose={() => setFormState(null)} visible={Boolean(form)}>
          <SafeAreaView style={styles.mobileModal}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>{form}</KeyboardAvoidingView></SafeAreaView>
        </Modal>
      ) : null}
    </AppScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterChip, active && styles.activeFilterChip]}><Text style={[styles.filterText, active && styles.activeFilterText]}>{label}</Text></Pressable>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  toolbar: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  searchWrap: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", flex: 1, maxWidth: 640, minHeight: 48, paddingHorizontal: 12 },
  searchIcon: { color: colors.muted, fontSize: 22, marginRight: 8 },
  searchInput: { color: colors.text, flex: 1, fontSize: 15, minHeight: 44 },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 9999, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  filterRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  advancedFilters: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 14, padding: 14 },
  filterGroup: { gap: 8 },
  filterLabel: { color: colors.text, fontSize: 14, fontWeight: "500" },
  filterScroll: { gap: 8, paddingRight: 8 },
  dateFilters: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dateField: { flex: 1, gap: 8, minWidth: 180 },
  filterChip: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 13, paddingVertical: 9 },
  activeFilterChip: { backgroundColor: colors.infoSubtle, borderColor: colors.border },
  filterText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  activeFilterText: { color: colors.text },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: colors.positiveSubtle, borderRadius: 12, color: colors.positive, fontSize: 14, padding: 12 },
  workspace: { gap: 18 },
  formPane: { flex: 1, minWidth: 0, maxWidth: 420, height: 720 },
  browserWorkspace: { flexDirection: "row", alignItems: "flex-start" },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 0, padding: 18 },
  listHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14 },
  cardTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  resultCount: { color: colors.muted, fontSize: 14 },
  emptyWrap: { alignItems: "center", paddingVertical: 8 },
  emptyAction: { backgroundColor: colors.positive, borderRadius: 9999, marginTop: 24, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
  noMatch: { alignItems: "center", padding: 42 },
  noMatchTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  noMatchText: { color: colors.muted, fontSize: 14, marginTop: 7 },
  mobileModal: { backgroundColor: colors.canvas, flex: 1, padding: 16 }
});
