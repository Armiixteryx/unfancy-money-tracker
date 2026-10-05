import { isWebWorkspace, typography } from "../../../ui/designTokens";
import { AppText as Text, AppTextInput as TextInput } from "../../../ui/AppText";
import { SensitiveContent } from "../../../platform/analytics/SensitiveContent";
import { useAuth } from "../../auth/AuthProvider";
import type { Message } from "../../../localization/notices";
import { formatCalendarDate, formatNumber, formatTimestamp } from "../../../localization/region";
import { translateMessage } from "../../../localization/i18n";
import { categoryLabel } from "../../../localization/i18n";
import { i18n } from "../../../localization/i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SUPPORTED_CURRENCIES } from "../../../domain/currency";
import type { CategoryKind } from "../../../domain/types";
import { AppScreen } from "../../../ui/AppScreen";
import { useAppTheme, useThemedStyles, type ThemeColors } from "../../../ui/theme";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { useExchangeRates } from "../../exchange-rates/hooks/useExchangeRates";
import { useAnalytics } from "../../../providers/AnalyticsProvider";

export function SettingsScreen() {
  const { t, i18n: language } = useTranslation();
  const auth = useAuth();
  const [accountError, setAccountError] = useState(false);
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const isMobile = !isWebWorkspace(Platform.OS, width);
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const setPreferences = useLocalDatasetStore((state) => state.setPreferences);
  const resetLocalData = useLocalDatasetStore((state) => state.resetLocalData);
  const retryLocalSave = useLocalDatasetStore(state => state.retryLocalSave);
  const saveError = useLocalDatasetStore((state) => state.saveError);
  const [message, setMessage] = useState<Message | null>(null);
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

  const updatePreference = async (value: Parameters<typeof setPreferences>[0], success: Message) => {
    const result = await setPreferences(value);
    if ("analyticsConsent" in value && typeof value.analyticsConsent === "boolean") await analytics.setConsent(value.analyticsConsent);
    setMessage(result.ok ? success : result.message);
  };

  const handleReset = async () => {
    await resetLocalData();
    setConfirmReset(false);
    setMessage(i18n.t($ => $.ui.settingsLocalDataResetNoDemoRecordsWere));
  };
  const activeSection = isMobile ? mobileSection : desktopSection;

  return (
    <AppScreen eyebrow={i18n.t($ => $.ui.settingsPreferencesAndPrivacy)} title={i18n.t($ => $.ui.navigationSettings)}>
      <SensitiveContent><View style={styles.card}><Text style={{ color: colors.text, fontWeight: "500" }}>{language.resolvedLanguage === "es" ? "Cuenta" : "Account"}</Text><Text style={{ color: colors.muted }}>{auth.identity ?? (language.resolvedLanguage === "es" ? "Invitado" : "Guest")}</Text><Pressable accessibilityRole="button" style={styles.secondaryButton} disabled={auth.busy} accessibilityState={{ disabled: auth.busy }} onPress={() => { setAccountError(false); return auth.identity ? void auth.signOut().catch(() => setAccountError(true)) : auth.open(); }}><Text style={styles.secondaryText}>{auth.busy ? (language.resolvedLanguage === "es" ? "Espera…" : "Please wait…") : auth.identity ? (language.resolvedLanguage === "es" ? "Cerrar sesión" : "Sign out") : (language.resolvedLanguage === "es" ? "Iniciar sesión" : "Sign in")}</Text></Pressable>{accountError ? <Text accessibilityRole="alert">{language.resolvedLanguage === "es" ? "La sesión se cerró localmente. No se pudo confirmar el cierre remoto." : "Signed out locally. Remote sign-out could not be confirmed."}</Text> : null}</View></SensitiveContent>
      {saveError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{translateMessage(saveError, true)}</Text> : null}
      {saveError ? <Pressable accessibilityRole="button" onPress={() => void retryLocalSave()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{i18n.t($ => $.notices.retrySave)}</Text></Pressable> : null}
      {message ? <View accessibilityLiveRegion="polite" style={styles.successBanner}><Text style={styles.successBannerText}>{translateMessage(message, false)}</Text><Pressable accessibilityLabel={i18n.t($ => $.ui.settingsDismissConfirmation)} accessibilityRole="button" hitSlop={8} onPress={() => setMessage(null)} style={styles.dismissBannerButton}><Ionicons color={colors.positive} name="close" size={20} /></Pressable></View> : null}

      {isMobile && mobileSection === null ? <MobileSettingsIndex onSelect={setMobileSection} /> : null}
      {isMobile && mobileSection !== null ? <Pressable accessibilityRole="button" onPress={() => setMobileSection(null)} style={styles.mobileBack}><Ionicons color={colors.text} name="chevron-back" size={20} /><Text style={styles.mobileBackText}>{i18n.t($ => $.ui.settingsAllSettings)}</Text></Pressable> : null}
      <View style={!isMobile ? styles.desktopWorkspace : undefined}>
        {!isMobile ? <DesktopSettingsSidebar onSelect={setDesktopSection} selected={desktopSection} /> : null}
        <View style={!isMobile ? styles.desktopDetail : undefined}>

      {activeSection !== null ? <View style={styles.grid}>
        {activeSection === "preferences" ?
        <View style={styles.card}>
          <SectionHeader title={i18n.t($ => $.ui.settingsPreferences)} description={i18n.t($ => $.ui.settingsTheseChoicesAreSavedWithYourLocal)} />
          <Text style={styles.label}>{t($ => $.settings.language)}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t($ => $.settings.language)} style={styles.chips}>{(["system", "en", "es"] as const).map(language => <ChoiceChip role="radio" active={dataset.preferences.language === language} key={language} label={language === "system" ? t($ => $.settings.system) : language === "en" ? i18n.t($ => $.ui.settingsEnglish) : i18n.t($ => $.ui.settingsEspaOl)} onPress={() => void updatePreference({ language }, t($ => $.settings.saved))} />)}</View>
          <Text style={styles.label}>{i18n.t($ => $.ui.settingsCurrencies)}</Text>
          <Text style={styles.helper}>{i18n.t($ => $.ui.settingsChooseTheCurrenciesYouWantAvailableIn)}</Text>
          <View style={styles.chips}>{SUPPORTED_CURRENCIES.map((currency) => {
            const selected = dataset.preferences.selectedCurrencies.includes(currency);
            const isBase = dataset.preferences.baseCurrency === currency;
            return <ChoiceChip active={selected} disabled={isBase} key={currency} label={currency} onPress={() => {
              const next = selected
                ? dataset.preferences.selectedCurrencies.filter((candidate) => candidate !== currency)
                : [...dataset.preferences.selectedCurrencies, currency];
              void updatePreference({ selectedCurrencies: next }, i18n.t($ => $.ui.settingsCurrencyChoicesSavedLocally));
            }} />;
          })}</View>
          <Text style={styles.label}>{i18n.t($ => $.ui.settingsBaseCurrency)}</Text>
          <Text style={styles.helper}>{i18n.t($ => $.ui.settingsUsedForFutureAggregateConversionAndNew)}</Text>
          <View style={styles.chips}>{dataset.preferences.selectedCurrencies.map((currency) => <ChoiceChip active={dataset.preferences.baseCurrency === currency} key={currency} label={currency} onPress={() => void updatePreference({ baseCurrency: currency }, { code: "baseCurrencySaved", currency })} />)}</View>
          <Text style={styles.label}>{i18n.t($ => $.ui.settingsTheme)}</Text>
          <View style={styles.chips}>{(["system", "light", "dark"] as const).map((theme) => <ChoiceChip active={dataset.preferences.theme === theme} key={theme} label={i18n.t($ => $.notices[theme])} onPress={() => void updatePreference({ theme }, i18n.t($ => $.ui.settingsThemePreferenceSavedLocally))} />)}</View>
        </View> : null}

        {activeSection === "rates" ?
        <View style={styles.card}>
          <SectionHeader title={i18n.t($ => $.ui.settingsExchangeRates)} description={i18n.t($ => $.ui.settingsRateFreshnessIsShownBeforeAnyCombined)} />
          <View style={styles.statusRow}><View style={[styles.statusDot, rateQueries.hasError ? styles.statusDotBad : rateQueries.isLoading || rateQueries.unavailableCurrencies.length > 0 ? styles.statusDotMuted : styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>{rateQueries.isLoading ? i18n.t($ => $.ui.settingsLoadingRates) : rateQueries.hasError ? i18n.t($ => $.ui.settingsRateRefreshNeedsAttention) : rateQueries.unavailableCurrencies.length > 0 ? i18n.t($ => $.ui.settingsReferenceRateUnavailable) : rateQueries.latestRates.size > 1 ? i18n.t($ => $.ui.dashboardRatesAvailable) : i18n.t($ => $.ui.settingsSameCurrencyTotals)}</Text><Text style={styles.helper}>{rateQueries.isLoading ? i18n.t($ => $.ui.settingsFetchingTheLatestAvailableReferenceRates) : rateQueries.hasError ? i18n.t($ => $.ui.settingsTheProviderCouldNotBeReachedCached) : rateQueries.unavailableCurrencies.length > 0 ? i18n.t($ => $.notices.rateUnavailable, { currencies: rateQueries.unavailableCurrencies.join(", ") }) : rateQueries.latestRates.size > 1 ? [...rateQueries.latestRates.values()].filter((rate) => rate.provider !== "same-currency").map((rate) => i18n.t($ => $.notices.rateDetails, { pair: `${rate.base}/${rate.quote}`, date: formatCalendarDate(rate.effectiveDate), status: rate.status === "stale" ? i18n.t($ => $.notices.stale) : i18n.t($ => $.notices.fresh), timestamp: formatTimestamp(rate.fetchedAt) })).join(" · ") : i18n.t($ => $.ui.settingsNoProviderRateIsNeededUntilA)}</Text></View></View>
          <View style={styles.infoBox}><Text style={styles.infoTitle}>{i18n.t($ => $.ui.settingsFrankfurterBlendedRates)}</Text><Text style={styles.helper}>{i18n.t($ => $.ui.settingsOriginalAmountsStayUnchangedCombinedTotalsAre)}</Text>{rateQueries.hasError ? <Pressable accessibilityRole="button" onPress={() => void rateQueries.retry()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{i18n.t($ => $.ui.settingsRetryRateRefresh)}</Text></Pressable> : null}</View>
        </View> : null}

        {activeSection === "privacy" ?
        <View style={styles.card}>
          <SectionHeader title={i18n.t($ => $.ui.settingsLocalDataAndPrivacy)} description={i18n.t($ => $.ui.settingsYourTrackerIsAnonymousAndKeepsFinancial)} />
          <View style={styles.statusRow}><View style={[styles.statusDot, styles.statusDotGood]} /><View style={styles.statusCopy}><Text style={styles.statusTitle}>{i18n.t($ => $.ui.settingsLocalOnlyDataset)}</Text><Text style={styles.helper}>{formatNumber(dataset.transactions.length)} {i18n.t($ => $.ui.settingsTransactions)} {formatNumber(dataset.budgets.length)} {i18n.t($ => $.ui.settingsBudgets)} {formatNumber(dataset.categories.length)} {i18n.t($ => $.ui.settingsCategories)}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityState={{ checked: dataset.preferences.analyticsConsent }} onPress={() => void updatePreference({ analyticsConsent: !dataset.preferences.analyticsConsent }, dataset.preferences.analyticsConsent ? i18n.t($ => $.ui.settingsAnalyticsDisabled) : i18n.t($ => $.ui.settingsAnalyticsEnabledWithPrivacyControls))} style={styles.toggleRow}><View style={[styles.toggle, dataset.preferences.analyticsConsent && styles.toggleOn]}><View style={[styles.toggleKnob, dataset.preferences.analyticsConsent && styles.toggleKnobOn]} /></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>{i18n.t($ => $.ui.settingsOptionalAnalytics)}</Text><Text style={styles.helper}>{dataset.preferences.analyticsConsent ? i18n.t($ => $.ui.settingsEnabledFinancialValuesAndUserEnteredText) : i18n.t($ => $.ui.settingsDisabledByDefaultNoProductAnalyticsIs)}</Text></View></Pressable>
          {confirmReset ? <View style={styles.dangerBox}><Text style={styles.dangerTitle}>{i18n.t($ => $.ui.settingsResetThisLocalCopy)}</Text><Text style={styles.helper}>{i18n.t($ => $.ui.settingsThisRemovesLocalTransactionsBudgetsCategoriesAnd)}</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void handleReset()} style={styles.dangerButton}><Text style={styles.dangerText}>{i18n.t($ => $.ui.commonResetLocalData)}</Text></Pressable></View></View> : <Pressable accessibilityRole="button" onPress={() => setConfirmReset(true)} style={styles.outlineDanger}><Text style={styles.outlineDangerText}>{i18n.t($ => $.ui.commonResetLocalData)}</Text></Pressable>}
        </View> : null}

        {activeSection === "export" ?
        <View style={styles.card}>
          <SectionHeader title={i18n.t($ => $.notices.previewTitle)} description={i18n.t($ => $.notices.previewDescription)} />
          <View style={styles.proBox}><Text style={styles.proBadge}>{i18n.t($ => $.ui.settingsProPreview)}</Text><Text style={styles.proTitle}>{i18n.t($ => $.ui.settingsTakeYourRecordsWithYou)}</Text><Text style={styles.helper}>{i18n.t($ => $.ui.settingsExpressInterestInCsvExportWithoutDownloading)}</Text><Pressable accessibilityRole="button" onPress={() => { setMessage(i18n.t($ => $.notices.previewInterest)); void analytics.capture("csv_upgrade_interest_clicked", { surface: "settings", actionResult: "success" }); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>{i18n.t($ => $.ui.settingsIMInterested)}</Text></Pressable></View>
        </View> : null}
      </View> : null}

      {activeSection === "categories" ? <CategoryManager onMessage={setMessage} /> : null}
        </View>
      </View>
    </AppScreen>
  );
}

type SettingsSection = "preferences" | "categories" | "rates" | "privacy" | "export";
type MobileSection = SettingsSection;

function getMobileGroups(colors: ThemeColors): readonly { title: string; rows: readonly { section: MobileSection; icon: keyof typeof Ionicons.glyphMap; iconBackground: string; title: string; description: string }[] }[] {
  return [
  { title: i18n.t($ => $.ui.settingsPersonalization), rows: [
    { section: "preferences", icon: "options-outline", iconBackground: colors.infoSubtle, title: i18n.t($ => $.ui.settingsCurrencyAppearance), description: i18n.t($ => $.ui.settingsBaseCurrencyAndTheme) },
    { section: "categories", icon: "pricetags-outline", iconBackground: colors.positiveSubtle, title: i18n.t($ => $.ui.settingsCategoriesAlternative), description: i18n.t($ => $.ui.settingsCreateAndManageCategories) }
  ] },
  { title: i18n.t($ => $.ui.settingsData), rows: [
    { section: "rates", icon: "swap-horizontal-outline", iconBackground: colors.infoSubtle, title: i18n.t($ => $.ui.settingsExchangeRates), description: i18n.t($ => $.ui.settingsConversionStatusAndFreshness) },
    { section: "privacy", icon: "shield-checkmark-outline", iconBackground: colors.negativeSubtle, title: i18n.t($ => $.ui.settingsLocalDataPrivacy), description: i18n.t($ => $.ui.settingsAnalyticsAndLocalDataControls) }
  ] },
  { title: i18n.t($ => $.ui.settingsMore), rows: [
    { section: "export", icon: "download-outline", iconBackground: colors.warningSubtle, title: i18n.t($ => $.notices.csvExport), description: i18n.t($ => $.ui.settingsProFeaturePreview) }
  ] }
  ];
}

function MobileSettingsIndex({ onSelect }: { onSelect: (section: MobileSection) => void }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const mobileGroups = getMobileGroups(colors);
  return <View style={styles.mobileIndex}>{mobileGroups.map((group) => <View key={group.title} style={styles.mobileGroupWrap}><Text style={styles.mobileGroupTitle}>{group.title}</Text><View style={styles.mobileGroup}>{group.rows.map((row, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.description}`} key={row.section} onPress={() => onSelect(row.section)} style={[styles.mobileRow, index > 0 && styles.mobileRowBorder]}><View style={[styles.mobileIcon, { backgroundColor: row.iconBackground }]}><Ionicons color={colors.text} name={row.icon} size={21} /></View><View style={styles.mobileRowCopy}><Text style={styles.mobileRowTitle}>{row.title}</Text><Text style={styles.mobileRowDescription}>{row.description}</Text></View><Ionicons color={colors.placeholder} name="chevron-forward" size={20} /></Pressable>)}</View></View>)}</View>;
}

function DesktopSettingsSidebar({ selected, onSelect }: { selected: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const mobileGroups = getMobileGroups(colors);
  return <View accessibilityLabel={i18n.t($ => $.ui.settingsSettingsSections)} style={styles.desktopSidebar}>{mobileGroups.map((group) => <View key={group.title} style={styles.desktopNavGroup}><Text style={styles.desktopNavLabel}>{group.title}</Text>{group.rows.map((row) => { const active = row.section === selected; return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={row.section} onPress={() => onSelect(row.section)} style={[styles.desktopNavRow, active && styles.desktopNavRowActive]}><Ionicons color={active ? colors.positive : colors.muted} name={row.icon} size={19} /><View style={styles.desktopNavCopy}><Text style={[styles.desktopNavTitle, active && styles.desktopNavTitleActive]}>{row.title}</Text><Text numberOfLines={1} style={styles.desktopNavDescription}>{row.description}</Text></View></Pressable>; })}</View>)}</View>;
}



function SectionHeader({ title, description }: { title: string; description: string }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDescription}>{description}</Text></View>;
}

function ChoiceChip({ active, disabled = false, label, onPress, role = "button" }: { role?: "button" | "radio"; active: boolean; disabled?: boolean; label: string; onPress: () => void }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole={role} aria-checked={role === "radio" ? active : undefined} accessibilityState={{ checked: active, selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipActive, disabled && styles.choiceChipDisabled]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function CategoryManager({ onMessage }: { onMessage: (message: Message) => void }) {
  useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const dataset = useLocalDatasetStore((state) => state.dataset);
  const addCategory = useLocalDatasetStore((state) => state.addCategory);
  const renameCategory = useLocalDatasetStore((state) => state.renameCategory);
  const archiveCategory = useLocalDatasetStore((state) => state.archiveCategory);
  const deleteCategory = useLocalDatasetStore((state) => state.deleteCategory);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (!dataset) return null;
  const categories = dataset.categories.filter((category) => category.kind === kind).sort((left, right) => Number(left.isArchived) - Number(right.isArchived) || left.name.localeCompare(right.name));
  const add = async () => {
    const result = await addCategory({ kind, name: newName });
    onMessage(result.ok ? { code: "categoryAdded", name: newName.trim() } : result.message);
    if (result.ok) setNewName("");
  };
  const saveRename = async (id: string) => {
    const result = await renameCategory(id, editingName);
    onMessage(result.ok ? i18n.t($ => $.ui.settingsCategoryRenamedLocally) : result.message);
    if (result.ok) setEditingId(null);
  };
  const confirmDelete = async (id: string) => {
    const result = await deleteCategory(id);
    onMessage(result.ok ? i18n.t($ => $.ui.settingsCategoryDeletedRelatedRecordsMovedToUncategorized) : result.message);
    setPendingDeleteId(null);
  };

  return <View style={styles.categoryCard}><SectionHeader title={i18n.t($ => $.ui.settingsCategoriesAlternative)} description={i18n.t($ => $.ui.settingsCreateRenameArchiveOrDeleteCategoriesProtected)} /><View style={styles.chips}>{(["expense", "income"] as const).map((option) => <ChoiceChip active={kind === option} key={option} label={option === "expense" ? i18n.t($ => $.ui.dashboardExpenses) : i18n.t($ => $.ui.dashboardIncome)} onPress={() => setKind(option)} />)}</View><View style={styles.addCategoryRow}><TextInput accessibilityLabel={i18n.t($ => $.ui.settingsNewCategoryName)} onChangeText={setNewName} onSubmitEditing={() => void add()} placeholder={i18n.t($ => $.ui.settingsNewCategoryName)} placeholderTextColor={colors.placeholder} style={styles.categoryInput} value={newName} /><Pressable accessibilityRole="button" onPress={() => void add()} style={styles.primaryButton}><Text style={styles.primaryText}>{i18n.t($ => $.ui.settingsAddCategory)}</Text></Pressable></View><View style={styles.categoryList}>{categories.map((category) => <View key={category.id} style={styles.categoryRow}><View style={styles.categoryCopy}><Text style={styles.categoryName}>{categoryLabel(category)}</Text><Text style={styles.helper}>{category.isSystem ? i18n.t($ => $.ui.settingsProtectedSystemCategory) : category.isArchived ? i18n.t($ => $.ui.settingsArchivedHistoricalRecordsRemainVisible) : i18n.t($ => $.ui.settingsActive)}</Text></View>{editingId === category.id ? <View style={styles.editRow}><TextInput accessibilityLabel={i18n.t($ => $.notices.renameCategory, { name: categoryLabel(category) })} onChangeText={setEditingName} style={styles.editInput} value={editingName} /><Pressable accessibilityRole="button" onPress={() => void saveRename(category.id)} style={styles.tinyButton}><Text style={styles.tinyButtonText}>{i18n.t($ => $.ui.settingsSave)}</Text></Pressable></View> : category.isSystem ? null : <View style={styles.categoryActions}><Pressable accessibilityRole="button" onPress={() => { setEditingId(category.id); setEditingName(categoryLabel(category)); }} style={styles.tinyButton}><Text style={styles.tinyButtonText}>{i18n.t($ => $.ui.settingsRename)}</Text></Pressable>{category.isArchived ? null : <Pressable accessibilityRole="button" onPress={() => void archiveCategory(category.id).then((result) => onMessage(result.ok ? i18n.t($ => $.ui.settingsCategoryArchivedLocally) : result.message))} style={styles.textButton}><Text style={styles.textButtonText}>{i18n.t($ => $.ui.settingsArchive)}</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(category.id)} style={styles.textButton}><Text style={styles.dangerTextSmall}>{i18n.t($ => $.ui.settingsDelete)}</Text></Pressable></View>}{pendingDeleteId === category.id ? <View style={styles.categoryConfirm}><Text style={styles.helper}>{i18n.t($ => $.ui.settingsDeleteAndMoveRecordsToUncategorized)}</Text><Pressable accessibilityRole="button" onPress={() => void confirmDelete(category.id)} style={styles.dangerButton}><Text style={styles.dangerText}>{i18n.t($ => $.ui.settingsConfirm)}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setPendingDeleteId(null)} style={styles.textButton}><Text style={styles.textButtonText}>{i18n.t($ => $.ui.commonCancel)}</Text></Pressable></View> : null}</View>)}</View></View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  grid: { gap: 16, minWidth: 0, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 18, padding: 24 },
  categoryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 18, padding: 20 },
  sectionHeader: { gap: 5 },
  sectionTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 14, fontWeight: "500" },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  choiceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceChipDisabled: { opacity: 0.55 },
  choiceText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  choiceTextActive: { color: colors.onPrimary },
  statusRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  statusDot: { borderRadius: 12, height: 10, marginTop: 5, width: 10 },
  statusDotGood: { backgroundColor: colors.positive },
  statusDotMuted: { backgroundColor: colors.muted },
  statusDotBad: { backgroundColor: colors.negative },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  infoBox: { backgroundColor: colors.infoSubtle, borderRadius: 12, gap: 4, padding: 13 },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  errorBanner: { backgroundColor: colors.negativeSubtle, borderRadius: 12, color: colors.negative, fontSize: 14, padding: 12 },
  successBanner: { alignItems: "center", backgroundColor: colors.positiveSubtle, borderRadius: 12, flexDirection: "row", gap: 8, paddingLeft: 12, paddingVertical: 8 },
  successBannerText: { color: colors.positive, flex: 1, fontSize: 14, paddingVertical: 4 },
  dismissBannerButton: { alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 36 },
  toggleRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  toggle: { backgroundColor: colors.border, borderRadius: 9999, height: 26, justifyContent: "center", padding: 3, width: 46 },
  toggleOn: { backgroundColor: colors.positive },
  toggleKnob: { backgroundColor: colors.surface, borderRadius: 9999, height: 20, width: 20 },
  toggleKnobOn: { alignSelf: "flex-end" },
  dangerBox: { backgroundColor: colors.negativeSubtle, borderColor: colors.negative, borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  dangerTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 15 },
  primaryText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  dangerButton: { alignItems: "center", backgroundColor: colors.negative, borderRadius: 9999, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  dangerText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
  outlineDanger: { alignItems: "center", alignSelf: "flex-start", borderColor: colors.negative, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 13 },
  outlineDangerText: { color: colors.negative, fontSize: 14, fontWeight: "500" },
  proBox: { backgroundColor: colors.proSubtle, borderColor: colors.pro, borderRadius: 12, gap: 8, padding: 16 },
  proBadge: { color: colors.pro, fontSize: 11, fontWeight: "500", letterSpacing: 0.8 },
  proTitle: { ...typography.heading, color: colors.text, fontSize: 24, fontWeight: "400" },
  addCategoryRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryInput: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, flex: 1, minHeight: 48, minWidth: 180, paddingHorizontal: 13 },
  categoryList: { gap: 10 },
  categoryRow: { alignItems: "center", borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 12, paddingVertical: 12 },
  categoryCopy: { flex: 1, gap: 3, minWidth: 150 },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: "500" },
  categoryActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tinyButton: { borderColor: colors.border, borderRadius: 9999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
  tinyButtonText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  textButton: { justifyContent: "center", minHeight: 48, paddingHorizontal: 7 },
  textButtonText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  dangerTextSmall: { color: colors.negative, fontSize: 14, fontWeight: "500" },
  editRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  editInput: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.text, minHeight: 48, paddingHorizontal: 9, width: 140 },
  categoryConfirm: { alignItems: "center", backgroundColor: colors.negativeSubtle, borderRadius: 12, flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8, width: "100%" },
  mobileIndex: { gap: 24 },
  mobileGroupWrap: { gap: 8 },
  mobileGroupTitle: { color: colors.muted, fontSize: 14, fontWeight: "500", letterSpacing: 0.6, paddingHorizontal: 4, textTransform: "uppercase" },
  mobileGroup: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  mobileRow: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 },
  mobileRowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  mobileIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  mobileRowCopy: { flex: 1, gap: 2 },
  mobileRowTitle: { color: colors.text, fontSize: 16, fontWeight: "500" },
  mobileRowDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  mobileBack: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 2, minHeight: 48, paddingRight: 12 },
  mobileBackText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  desktopWorkspace: { alignItems: "flex-start", flexDirection: "row", gap: 24 },
  desktopSidebar: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 22, padding: 14, width: 240 },
  desktopNavGroup: { gap: 5 },
  desktopNavLabel: { color: colors.muted, fontSize: 11, fontWeight: "500", letterSpacing: 0.7, paddingBottom: 4, paddingHorizontal: 10, textTransform: "uppercase" },
  desktopNavRow: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 11, paddingVertical: 9 },
  desktopNavRowActive: { backgroundColor: colors.positiveSubtle },
  desktopNavCopy: { flex: 1, gap: 2 },
  desktopNavTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  desktopNavTitleActive: { color: colors.positive, fontWeight: "500" },
  desktopNavDescription: { color: colors.muted, fontSize: 11 },
  desktopDetail: { flex: 1, minWidth: 0 }
});
