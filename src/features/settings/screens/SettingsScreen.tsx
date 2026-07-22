import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SUPPORTED_CURRENCIES } from "../../../domain/currency";
import type { CategoryKind } from "../../../domain/types";
import { AppScreen } from "../../../ui/AppScreen";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useDatasetStore } from "../../sync/store/useDatasetStore";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { AccountSyncCard } from "../../sync/components/AccountSyncCard";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

export function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const dataset = useDatasetStore((state) => state.dataset);
  const setPreferences = useDatasetStore((state) => state.setPreferences);
  const resetLocalData = useDatasetStore((state) => state.resetLocalData);
  const saveError = useDatasetStore((state) => state.saveError);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [mobileSection, setMobileSection] = useState<MobileSection | null>(null);
  const [desktopSection, setDesktopSection] = useState<SettingsSection>("preferences");
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
  const activeSection = isMobile ? mobileSection : desktopSection;

  return (
    <AppScreen eyebrow="Preferences and privacy" title="Settings">
      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{saveError}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.successBanner}>{message}</Text> : null}

      {isMobile && mobileSection === null ? <MobileSettingsIndex onSelect={setMobileSection} /> : null}
      {isMobile && mobileSection !== null ? <Pressable accessibilityRole="button" onPress={() => setMobileSection(null)} style={styles.mobileBack}><Ionicons color={colors.text} name="chevron-back" size={20} /><Text style={styles.mobileBackText}>All settings</Text></Pressable> : null}
      <View style={!isMobile ? styles.desktopWorkspace : undefined}>
        {!isMobile ? <DesktopSettingsSidebar onSelect={setDesktopSection} selected={desktopSection} /> : null}
        <View style={!isMobile ? styles.desktopDetail : undefined}>

      {activeSection !== null ? <View style={styles.grid}>
        {activeSection === "preferences" ?
        <View style={styles.card}>
          <SectionHeader title="Preferences" description="These choices are saved with your local dataset." />
          <Text style={styles.label}>Base currency</Text>
          <Text style={styles.helper}>Used for future aggregate conversion and new budgets. Original transaction currencies stay unchanged.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>{SUPPORTED_CURRENCIES.map((currency) => <ChoiceChip active={dataset.preferences.baseCurrency === currency} key={currency} label={currency} onPress={() => void updatePreference({ baseCurrency: currency }, `Base currency set to ${currency}.`)} />)}</View>
          </ScrollView>
          <Text style={styles.label}>Theme</Text>
          <View style={styles.chips}>{(["system", "light", "dark"] as const).map((theme) => <ChoiceChip active={dataset.preferences.theme === theme} key={theme} label={theme.replace(/^./, (letter) => letter.toUpperCase())} onPress={() => void updatePreference({ theme }, "Theme preference saved locally.")} />)}</View>
        </View> : null}

        {activeSection === "rates" ?
        <View style={styles.card}>
          <SectionHeader title="Exchange rates" description="Rate freshness is shown before any combined multi-currency total is presented." />
          <View style={styles.statusRow}><View style={[styles.statusDot, rateQueries.hasError ? styles.statusDotBad : rateQueries.isLoading || rateQueries.unavailableCurrencies.length > 0 ? styles.statusDotMuted : styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>{rateQueries.isLoading ? "Loading rates" : rateQueries.hasError ? "Rate refresh needs attention" : rateQueries.unavailableCurrencies.length > 0 ? "Reference rate unavailable" : rateQueries.latestRates.size > 1 ? "Rates available" : "Same-currency totals"}</Text><Text style={styles.helper}>{rateQueries.isLoading ? "Fetching the latest available reference rates." : rateQueries.hasError ? "The provider could not be reached. Cached stale rates remain labeled when available." : rateQueries.unavailableCurrencies.length > 0 ? `ECB does not publish a reference rate for ${rateQueries.unavailableCurrencies.join(", ")}. Combined totals stay unavailable; original amounts remain visible.` : rateQueries.latestRates.size > 1 ? [...rateQueries.latestRates.values()].filter((rate) => rate.provider !== "same-currency").map((rate) => `${rate.base}/${rate.quote} · effective ${rate.effectiveDate} · ${rate.status} · fetched ${formatRateAge(rate.fetchedAt)}`).join(" · ") : "No provider rate is needed until a transaction uses a different currency."}</Text></View></View>
          <View style={styles.infoBox}><Text style={styles.infoTitle}>Frankfurter · ECB reference rates</Text><Text style={styles.helper}>Original amounts stay unchanged. Combined totals are omitted when no usable conversion exists.</Text>{rateQueries.hasError ? <Pressable accessibilityRole="button" onPress={() => void rateQueries.retry()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Retry rate refresh</Text></Pressable> : null}</View>
        </View> : null}

        {activeSection === "privacy" ?
        <View style={styles.card}>
          <SectionHeader title="Local data and privacy" description="Your tracker starts anonymous and stays on this device until you choose otherwise." />
          <View style={styles.statusRow}><View style={[styles.statusDot, styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>Local-only dataset</Text><Text style={styles.helper}>{dataset.transactions.length} transactions · {dataset.budgets.length} budgets · {dataset.categories.length} categories</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityState={{ checked: dataset.preferences.analyticsConsent }} onPress={() => void updatePreference({ analyticsConsent: !dataset.preferences.analyticsConsent }, dataset.preferences.analyticsConsent ? "Analytics disabled." : "Analytics enabled with privacy controls.")} style={styles.toggleRow}><View style={[styles.toggle, dataset.preferences.analyticsConsent && styles.toggleOn]}><View style={[styles.toggleKnob, dataset.preferences.analyticsConsent && styles.toggleKnobOn]} /></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>Optional analytics</Text><Text style={styles.helper}>{dataset.preferences.analyticsConsent ? "Enabled. Financial values and user-entered text remain excluded." : "Disabled by default. No product analytics is collected."}</Text></View></Pressable>
          {confirmReset ? <View style={styles.dangerBox}><Text style={styles.dangerTitle}>Reset this local copy?</Text><Text style={styles.helper}>This removes local transactions, budgets, categories, and preferences. There is no demo-data restore.</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void handleReset()} style={styles.dangerButton}><Text style={styles.dangerText}>Reset local data</Text></Pressable></View></View> : <Pressable accessibilityRole="button" onPress={() => setConfirmReset(true)} style={styles.outlineDanger}><Text style={styles.outlineDangerText}>Reset local data</Text></Pressable>}
        </View> : null}

        {activeSection === "sync" ? <AccountSyncCard /> : null}

        {activeSection === "export" ?
        <View style={styles.card}>
          <SectionHeader title="CSV export preview" description="A non-functional Pro feature preview. No export or payment is implemented in V1." />
          <View style={styles.proBox}><Text style={styles.proBadge}>PRO PREVIEW</Text><Text style={styles.proTitle}>Take your records with you</Text><Text style={styles.helper}>Express interest in CSV export without downloading financial data or starting a subscription.</Text><Pressable accessibilityRole="button" onPress={() => { setMessage("CSV export interest recorded locally for this preview."); void analytics.capture("csv_upgrade_interest_clicked", { surface: "settings", actionResult: "success" }); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>I’m interested</Text></Pressable></View>
        </View> : null}
      </View> : null}

      {activeSection === "categories" ? <CategoryManager onMessage={setMessage} /> : null}
        </View>
      </View>
    </AppScreen>
  );
}

type SettingsSection = "preferences" | "categories" | "rates" | "sync" | "privacy" | "export";
type MobileSection = SettingsSection;

function getMobileGroups(colors: ThemeColors): readonly { title: string; rows: readonly { section: MobileSection; icon: keyof typeof Ionicons.glyphMap; iconBackground: string; title: string; description: string }[] }[] {
  return [
  { title: "Personalization", rows: [
    { section: "preferences", icon: "options-outline", iconBackground: colors.infoSubtle, title: "Currency & appearance", description: "Base currency and theme" },
    { section: "categories", icon: "pricetags-outline", iconBackground: colors.positiveSubtle, title: "Categories", description: "Create and manage categories" }
  ] },
  { title: "Data", rows: [
    { section: "rates", icon: "swap-horizontal-outline", iconBackground: colors.infoSubtle, title: "Exchange rates", description: "Conversion status and freshness" },
    { section: "sync", icon: "cloud-outline", iconBackground: colors.proSubtle, title: "Backup & sync", description: "Optional account and cloud backup" },
    { section: "privacy", icon: "shield-checkmark-outline", iconBackground: colors.negativeSubtle, title: "Local data & privacy", description: "Analytics and local data controls" }
  ] },
  { title: "More", rows: [
    { section: "export", icon: "download-outline", iconBackground: colors.warningSubtle, title: "CSV export", description: "Pro feature preview" }
  ] }
  ];
}

function MobileSettingsIndex({ onSelect }: { onSelect: (section: MobileSection) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const mobileGroups = getMobileGroups(colors);
  return <View style={styles.mobileIndex}>{mobileGroups.map((group) => <View key={group.title} style={styles.mobileGroupWrap}><Text style={styles.mobileGroupTitle}>{group.title}</Text><View style={styles.mobileGroup}>{group.rows.map((row, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.description}`} key={row.section} onPress={() => onSelect(row.section)} style={[styles.mobileRow, index > 0 && styles.mobileRowBorder]}><View style={[styles.mobileIcon, { backgroundColor: row.iconBackground }]}><Ionicons color={colors.text} name={row.icon} size={21} /></View><View style={styles.mobileRowCopy}><Text style={styles.mobileRowTitle}>{row.title}</Text><Text style={styles.mobileRowDescription}>{row.description}</Text></View><Ionicons color={colors.placeholder} name="chevron-forward" size={20} /></Pressable>)}</View></View>)}</View>;
}

function DesktopSettingsSidebar({ selected, onSelect }: { selected: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const mobileGroups = getMobileGroups(colors);
  return <View accessibilityLabel="Settings sections" style={styles.desktopSidebar}>{mobileGroups.map((group) => <View key={group.title} style={styles.desktopNavGroup}><Text style={styles.desktopNavLabel}>{group.title}</Text>{group.rows.map((row) => { const active = row.section === selected; return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={row.section} onPress={() => onSelect(row.section)} style={[styles.desktopNavRow, active && styles.desktopNavRowActive]}><Ionicons color={active ? colors.positive : colors.muted} name={row.icon} size={19} /><View style={styles.desktopNavCopy}><Text style={[styles.desktopNavTitle, active && styles.desktopNavTitleActive]}>{row.title}</Text><Text numberOfLines={1} style={styles.desktopNavDescription}>{row.description}</Text></View></Pressable>; })}</View>)}</View>;
}

function formatRateAge(fetchedAt: string): string {
  const ageHours = Math.max(0, Math.floor((Date.now() - new Date(fetchedAt).getTime()) / (60 * 60 * 1000)));
  if (ageHours < 1) return "less than 1h ago";
  if (ageHours === 1) return "1h ago";
  return `${ageHours}h ago`;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDescription}>{description}</Text></View>;
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function CategoryManager({ onMessage }: { onMessage: (message: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
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

  return <View style={styles.categoryCard}><SectionHeader title="Categories" description="Create, rename, archive, or delete categories. Protected Uncategorized categories stay available for reassignment." /><View style={styles.chips}>{(["expense", "income"] as const).map((option) => <ChoiceChip active={kind === option} key={option} label={option === "expense" ? "Expenses" : "Income"} onPress={() => setKind(option)} />)}</View><View style={styles.addCategoryRow}><TextInput accessibilityLabel="New category name" onChangeText={setNewName} onSubmitEditing={() => void add()} placeholder="New category name" placeholderTextColor={colors.placeholder} style={styles.categoryInput} value={newName} /><Pressable accessibilityRole="button" onPress={() => void add()} style={styles.primaryButton}><Text style={styles.primaryText}>Add category</Text></Pressable></View><View style={styles.categoryList}>{categories.map((category) => <View key={category.id} style={styles.categoryRow}><View style={styles.categoryCopy}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.helper}>{category.isSystem ? "Protected system category" : category.isArchived ? "Archived · historical records remain visible" : "Active"}</Text></View>{editingId === category.id ? <View style={styles.editRow}><TextInput accessibilityLabel={`Rename ${category.name}`} onChangeText={setEditingName} style={styles.editInput} value={editingName} /><Pressable accessibilityRole="button" onPress={() => void saveRename(category.id)} style={styles.tinyButton}><Text style={styles.tinyButtonText}>Save</Text></Pressable></View> : category.isSystem ? null : <View style={styles.categoryActions}><Pressable accessibilityRole="button" onPress={() => { setEditingId(category.id); setEditingName(category.name); }} style={styles.tinyButton}><Text style={styles.tinyButtonText}>Rename</Text></Pressable>{category.isArchived ? null : <Pressable accessibilityRole="button" onPress={() => void archiveCategory(category.id).then((result) => onMessage(result.ok ? "Category archived locally." : result.message))} style={styles.textButton}><Text style={styles.textButtonText}>Archive</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(category.id)} style={styles.textButton}><Text style={styles.dangerTextSmall}>Delete</Text></Pressable></View>}{pendingDeleteId === category.id ? <View style={styles.categoryConfirm}><Text style={styles.helper}>Delete and move records to Uncategorized?</Text><Pressable accessibilityRole="button" onPress={() => void confirmDelete(category.id)} style={styles.dangerButton}><Text style={styles.dangerText}>Confirm</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.textButton}><Text style={styles.textButtonText}>Cancel</Text></Pressable></View> : null}</View>)}</View></View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: { gap: 16, minWidth: 0, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 18, padding: 24 },
  categoryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 18, padding: 20 },
  sectionHeader: { gap: 5 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sectionDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 14, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 13 },
  choiceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  choiceTextActive: { color: colors.onPrimary },
  statusRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  statusDot: { borderRadius: 999, height: 10, marginTop: 5, width: 10 },
  statusDotGood: { backgroundColor: colors.positive },
  statusDotMuted: { backgroundColor: colors.muted },
  statusDotBad: { backgroundColor: colors.negative },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  infoBox: { backgroundColor: colors.infoSubtle, borderRadius: 12, gap: 4, padding: 13 },
  infoTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 10, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { backgroundColor: colors.positiveSubtle, borderRadius: 10, color: colors.positive, fontSize: 14, padding: 12 },
  toggleRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  toggle: { backgroundColor: colors.border, borderRadius: 999, height: 26, justifyContent: "center", padding: 3, width: 46 },
  toggleOn: { backgroundColor: colors.positive },
  toggleKnob: { backgroundColor: colors.surface, borderRadius: 999, height: 20, width: 20 },
  toggleKnobOn: { alignSelf: "flex-end" },
  dangerBox: { backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 14, borderWidth: 1, gap: 10, padding: 14 },
  dangerTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", minHeight: 46, paddingHorizontal: 15 },
  primaryText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  dangerButton: { alignItems: "center", backgroundColor: colors.negative, borderRadius: 10, justifyContent: "center", minHeight: 42, paddingHorizontal: 13 },
  dangerText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  outlineDanger: { alignItems: "center", alignSelf: "flex-start", borderColor: colors.negative, borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 13 },
  outlineDangerText: { color: colors.negative, fontSize: 13, fontWeight: "800" },
  proBox: { backgroundColor: colors.proSubtle, borderColor: colors.pro, borderRadius: 14, gap: 8, padding: 16 },
  proBadge: { color: colors.pro, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  proTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  addCategoryRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryInput: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, flex: 1, minHeight: 46, minWidth: 180, paddingHorizontal: 13 },
  categoryList: { gap: 10 },
  categoryRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 12 },
  categoryCopy: { flex: 1, gap: 3, minWidth: 150 },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  categoryActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tinyButton: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: 10 },
  tinyButtonText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  textButton: { justifyContent: "center", minHeight: 36, paddingHorizontal: 7 },
  textButtonText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  dangerTextSmall: { color: colors.negative, fontSize: 12, fontWeight: "800" },
  editRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  editInput: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, minHeight: 36, paddingHorizontal: 9, width: 140 },
  categoryConfirm: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderRadius: 10, flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8, width: "100%" },
  mobileIndex: { gap: 24 },
  mobileGroupWrap: { gap: 8 },
  mobileGroupTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 4, textTransform: "uppercase" },
  mobileGroup: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  mobileRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  mobileRowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  mobileIcon: { alignItems: "center", borderRadius: 10, height: 38, justifyContent: "center", width: 38 },
  mobileRowCopy: { flex: 1, gap: 2 },
  mobileRowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  mobileRowDescription: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  mobileBack: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 2, minHeight: 44, paddingRight: 12 },
  mobileBackText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  desktopWorkspace: { alignItems: "flex-start", flexDirection: "row", gap: 24 },
  desktopSidebar: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 22, padding: 14, width: 280 },
  desktopNavGroup: { gap: 5 },
  desktopNavLabel: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.7, paddingBottom: 4, paddingHorizontal: 10, textTransform: "uppercase" },
  desktopNavRow: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 11, paddingVertical: 9 },
  desktopNavRowActive: { backgroundColor: colors.positiveSubtle },
  desktopNavCopy: { flex: 1, gap: 2 },
  desktopNavTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  desktopNavTitleActive: { color: colors.positive, fontWeight: "800" },
  desktopNavDescription: { color: colors.muted, fontSize: 11 },
  desktopDetail: { flex: 1, minWidth: 0 }
});
