import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { SUPPORTED_CURRENCIES } from "../../../domain/currency";
import type { CategoryKind } from "../../../domain/types";
import { AppScreen } from "../../../ui/AppScreen";
import { colors } from "../../../ui/theme";
import { useDatasetStore } from "../../sync/store/useDatasetStore";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { AccountSyncCard } from "../../sync/components/AccountSyncCard";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

export function SettingsScreen() {
  const dataset = useDatasetStore((state) => state.dataset);
  const setPreferences = useDatasetStore((state) => state.setPreferences);
  const resetLocalData = useDatasetStore((state) => state.resetLocalData);
  const saveError = useDatasetStore((state) => state.saveError);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const analytics = useAnalytics();
  const rateRequests = useMemo(() => dataset ? dataset.transactions.map((transaction) => ({ currency: transaction.currency })) : [], [dataset]);
  const rateQueries = useExchangeRates(dataset?.preferences.baseCurrency ?? "USD", rateRequests);

  useEffect(() => {
    void analytics.setConsent(dataset?.preferences.analyticsConsent ?? false);
  }, [analytics, dataset?.preferences.analyticsConsent]);

  if (!dataset) return null;

  const updatePreference = async (value: Parameters<typeof setPreferences>[0], success: string) => {
    const result = await setPreferences(value);
    if ("analyticsConsent" in value && typeof value.analyticsConsent === "boolean") await analytics.setConsent(value.analyticsConsent);
    setMessage(result.ok ? success : result.message);
  };

  const handleReset = async () => {
    await resetLocalData();
    setConfirmReset(false);
    setMessage("Local data reset. No demo records were added.");
  };

  return (
    <AppScreen eyebrow="Preferences and privacy" title="Settings">
      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{saveError}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{message}</Text> : null}

      <View style={styles.grid}>
        <View style={styles.card}>
          <SectionHeader title="Preferences" description="These choices are saved with your local dataset." />
          <Text style={styles.label}>Base currency</Text>
          <Text style={styles.helper}>Used for future aggregate conversion and new budgets. Original transaction currencies stay unchanged.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>{SUPPORTED_CURRENCIES.map((currency) => <ChoiceChip active={dataset.preferences.baseCurrency === currency} key={currency} label={currency} onPress={() => void updatePreference({ baseCurrency: currency }, `Base currency set to ${currency}.`)} />)}</View>
          </ScrollView>
          <Text style={styles.label}>Theme</Text>
          <View style={styles.chips}>{(["system", "light", "dark"] as const).map((theme) => <ChoiceChip active={dataset.preferences.theme === theme} key={theme} label={theme.replace(/^./, (letter) => letter.toUpperCase())} onPress={() => void updatePreference({ theme }, "Theme preference saved locally.")} />)}</View>
        </View>

        <View style={styles.card}>
          <SectionHeader title="Exchange rates" description="Rate freshness is shown before any combined multi-currency total is presented." />
          <View style={styles.statusRow}><View style={[styles.statusDot, rateQueries.hasError ? styles.statusDotBad : rateQueries.isLoading ? styles.statusDotMuted : styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>{rateQueries.isLoading ? "Loading rates" : rateQueries.hasError ? "Rate refresh needs attention" : rateQueries.latestRates.size > 1 ? "Rates available" : "Same-currency totals"}</Text><Text style={styles.helper}>{rateQueries.isLoading ? "Fetching the latest available reference rates." : rateQueries.hasError ? "The provider could not be reached. Cached stale rates remain labeled when available." : rateQueries.latestRates.size > 1 ? [...rateQueries.latestRates.values()].filter((rate) => rate.provider !== "same-currency").map((rate) => `${rate.base}/${rate.quote} · ${rate.effectiveDate} · ${rate.status}`).join(" · ") : "No provider rate is needed until a transaction uses a different currency."}</Text></View></View>
          <View style={styles.infoBox}><Text style={styles.infoTitle}>Frankfurter · ECB reference rates</Text><Text style={styles.helper}>Original amounts stay unchanged. Combined totals are omitted when no usable conversion exists.</Text>{rateQueries.hasError ? <Pressable accessibilityRole="button" onPress={() => void rateQueries.retry()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Retry rate refresh</Text></Pressable> : null}</View>
        </View>

        <View style={styles.card}>
          <SectionHeader title="Local data and privacy" description="Your tracker starts anonymous and stays on this device until you choose otherwise." />
          <View style={styles.statusRow}><View style={[styles.statusDot, styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>Local-only dataset</Text><Text style={styles.helper}>{dataset.transactions.length} transactions · {dataset.budgets.length} budgets · {dataset.categories.length} categories</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityState={{ checked: dataset.preferences.analyticsConsent }} onPress={() => void updatePreference({ analyticsConsent: !dataset.preferences.analyticsConsent }, dataset.preferences.analyticsConsent ? "Analytics disabled." : "Analytics enabled with privacy controls.")} style={styles.toggleRow}><View style={[styles.toggle, dataset.preferences.analyticsConsent && styles.toggleOn]}><View style={[styles.toggleKnob, dataset.preferences.analyticsConsent && styles.toggleKnobOn]} /></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>Optional analytics</Text><Text style={styles.helper}>{dataset.preferences.analyticsConsent ? "Enabled. Financial values and user-entered text remain excluded." : "Disabled by default. No product analytics is collected."}</Text></View></Pressable>
          {confirmReset ? <View style={styles.dangerBox}><Text style={styles.dangerTitle}>Reset this local copy?</Text><Text style={styles.helper}>This removes local transactions, budgets, categories, and preferences. There is no demo-data restore.</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void handleReset()} style={styles.dangerButton}><Text style={styles.dangerText}>Reset local data</Text></Pressable></View></View> : <Pressable accessibilityRole="button" onPress={() => setConfirmReset(true)} style={styles.outlineDanger}><Text style={styles.outlineDangerText}>Reset local data</Text></Pressable>}
        </View>

        <AccountSyncCard />

        <View style={styles.card}>
          <SectionHeader title="CSV export preview" description="A non-functional Pro feature preview. No export or payment is implemented in V1." />
          <View style={styles.proBox}><Text style={styles.proBadge}>PRO PREVIEW</Text><Text style={styles.proTitle}>Take your records with you</Text><Text style={styles.helper}>Express interest in CSV export without downloading financial data or starting a subscription.</Text><Pressable accessibilityRole="button" onPress={() => { setMessage("CSV export interest recorded locally for this preview."); void analytics.capture("csv_upgrade_interest_clicked", { surface: "settings", actionResult: "success" }); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>I’m interested</Text></Pressable></View>
        </View>
      </View>

      <CategoryManager onMessage={setMessage} />
    </AppScreen>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDescription}>{description}</Text></View>;
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function CategoryManager({ onMessage }: { onMessage: (message: string) => void }) {
  const dataset = useDatasetStore((state) => state.dataset);
  const addCategory = useDatasetStore((state) => state.addCategory);
  const renameCategory = useDatasetStore((state) => state.renameCategory);
  const archiveCategory = useDatasetStore((state) => state.archiveCategory);
  const deleteCategory = useDatasetStore((state) => state.deleteCategory);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (!dataset) return null;
  const categories = dataset.categories.filter((category) => category.kind === kind).sort((left, right) => Number(left.isArchived) - Number(right.isArchived) || left.name.localeCompare(right.name));
  const add = async () => {
    const result = await addCategory({ kind, name: newName });
    onMessage(result.ok ? `${newName.trim()} added locally.` : result.message);
    if (result.ok) setNewName("");
  };
  const saveRename = async (id: string) => {
    const result = await renameCategory(id, editingName);
    onMessage(result.ok ? "Category renamed locally." : result.message);
    if (result.ok) setEditingId(null);
  };
  const confirmDelete = async (id: string) => {
    const result = await deleteCategory(id);
    onMessage(result.ok ? "Category deleted; related records moved to Uncategorized." : result.message);
    setPendingDeleteId(null);
  };

  return <View style={styles.categoryCard}><SectionHeader title="Categories" description="Create, rename, archive, or delete categories. Protected Uncategorized categories stay available for reassignment." /><View style={styles.chips}>{(["expense", "income"] as const).map((option) => <ChoiceChip active={kind === option} key={option} label={option === "expense" ? "Expenses" : "Income"} onPress={() => setKind(option)} />)}</View><View style={styles.addCategoryRow}><TextInput accessibilityLabel="New category name" onChangeText={setNewName} onSubmitEditing={() => void add()} placeholder="New category name" placeholderTextColor="#9FB3C8" style={styles.categoryInput} value={newName} /><Pressable accessibilityRole="button" onPress={() => void add()} style={styles.primaryButton}><Text style={styles.primaryText}>Add category</Text></Pressable></View><View style={styles.categoryList}>{categories.map((category) => <View key={category.id} style={styles.categoryRow}><View style={styles.categoryCopy}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.helper}>{category.isSystem ? "Protected system category" : category.isArchived ? "Archived · historical records remain visible" : "Active"}</Text></View>{editingId === category.id ? <View style={styles.editRow}><TextInput accessibilityLabel={`Rename ${category.name}`} onChangeText={setEditingName} style={styles.editInput} value={editingName} /><Pressable accessibilityRole="button" onPress={() => void saveRename(category.id)} style={styles.tinyButton}><Text style={styles.tinyButtonText}>Save</Text></Pressable></View> : category.isSystem ? null : <View style={styles.categoryActions}><Pressable accessibilityRole="button" onPress={() => { setEditingId(category.id); setEditingName(category.name); }} style={styles.tinyButton}><Text style={styles.tinyButtonText}>Rename</Text></Pressable>{category.isArchived ? null : <Pressable accessibilityRole="button" onPress={() => void archiveCategory(category.id).then((result) => onMessage(result.ok ? "Category archived locally." : result.message))} style={styles.textButton}><Text style={styles.textButtonText}>Archive</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(category.id)} style={styles.textButton}><Text style={styles.dangerTextSmall}>Delete</Text></Pressable></View>}{pendingDeleteId === category.id ? <View style={styles.categoryConfirm}><Text style={styles.helper}>Delete and move records to Uncategorized?</Text><Pressable accessibilityRole="button" onPress={() => void confirmDelete(category.id)} style={styles.dangerButton}><Text style={styles.dangerText}>Confirm</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.textButton}><Text style={styles.textButtonText}>Cancel</Text></Pressable></View> : null}</View>)}</View></View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, gap: 18, minWidth: 320, padding: 20 },
  categoryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 18, padding: 20 },
  sectionHeader: { gap: 5 },
  sectionTitle: { color: colors.navy, fontSize: 18, fontWeight: "800" },
  sectionDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 13 },
  choiceChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  choiceText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  choiceTextActive: { color: colors.surface },
  statusRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  statusDot: { borderRadius: 999, height: 10, marginTop: 5, width: 10 },
  statusDotGood: { backgroundColor: colors.emerald },
  statusDotMuted: { backgroundColor: colors.muted },
  statusDotBad: { backgroundColor: colors.coral },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  infoBox: { backgroundColor: "#EAF0F8", borderRadius: 12, gap: 4, padding: 13 },
  infoTitle: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  errorBanner: { backgroundColor: "#FFF2F0", borderRadius: 10, color: colors.coral, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: "#E9F7EF", borderRadius: 10, color: colors.emerald, fontSize: 14, padding: 12 },
  toggleRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  toggle: { backgroundColor: colors.border, borderRadius: 999, height: 26, justifyContent: "center", padding: 3, width: 46 },
  toggleOn: { backgroundColor: colors.emerald },
  toggleKnob: { backgroundColor: colors.surface, borderRadius: 999, height: 20, width: 20 },
  toggleKnobOn: { alignSelf: "flex-end" },
  dangerBox: { backgroundColor: "#FFF9F8", borderColor: "#F4C7C7", borderRadius: 14, borderWidth: 1, gap: 10, padding: 14 },
  dangerTitle: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { alignItems: "center", backgroundColor: colors.navy, borderRadius: 12, justifyContent: "center", minHeight: 46, paddingHorizontal: 15 },
  primaryText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  secondaryText: { color: colors.navy, fontSize: 13, fontWeight: "800" },
  dangerButton: { alignItems: "center", backgroundColor: colors.coral, borderRadius: 10, justifyContent: "center", minHeight: 42, paddingHorizontal: 13 },
  dangerText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  outlineDanger: { alignItems: "center", alignSelf: "flex-start", borderColor: "#F4C7C7", borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 13 },
  outlineDangerText: { color: colors.coral, fontSize: 13, fontWeight: "800" },
  proBox: { backgroundColor: "#F1EDFF", borderColor: "#D9CCFF", borderRadius: 14, gap: 8, padding: 16 },
  proBadge: { color: "#6D4AFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  proTitle: { color: colors.navy, fontSize: 17, fontWeight: "800" },
  addCategoryRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryInput: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.navy, flex: 1, minHeight: 46, minWidth: 180, paddingHorizontal: 13 },
  categoryList: { gap: 10 },
  categoryRow: { alignItems: "center", borderBottomColor: "#EEF2F5", borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 12 },
  categoryCopy: { flex: 1, gap: 3, minWidth: 150 },
  categoryName: { color: colors.navy, fontSize: 14, fontWeight: "800" },
  categoryActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tinyButton: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: 10 },
  tinyButtonText: { color: colors.navy, fontSize: 12, fontWeight: "800" },
  textButton: { justifyContent: "center", minHeight: 36, paddingHorizontal: 7 },
  textButtonText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  dangerTextSmall: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  editRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  editInput: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.navy, minHeight: 36, paddingHorizontal: 9, width: 140 },
  categoryConfirm: { alignItems: "center", backgroundColor: "#FFF9F8", borderRadius: 10, flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8, width: "100%" }
});
