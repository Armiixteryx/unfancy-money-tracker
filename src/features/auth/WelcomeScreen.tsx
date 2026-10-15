import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import type { Theme } from "../../domain/types";
import { formatMoneyForDisplay } from "../../domain/money";
import { AppBrand } from "../../ui/AppBrand";
import { AppText as Text } from "../../ui/AppText";
import { Button } from "../../ui/controls";
import { layout, typography } from "../../ui/designTokens";
import { useAppTheme } from "../../ui/theme";

type Step = 0 | 1 | 2 | 3;
type ChapterLayout = "mobile" | "tablet" | "desktop";

export function WelcomeScreen({ onComplete }: { onComplete: () => Promise<void> }) {
  const { i18n } = useTranslation();
  const { colors, preference, setPreference } = useAppTheme();
  const { width, height, fontScale = 1 } = useWindowDimensions();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const starting = useRef(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeFailed, setThemeFailed] = useState(false);
  const changingTheme = useRef(false);

  const chooseTheme = async (theme: Theme) => {
    if (changingTheme.current || starting.current) return;
    changingTheme.current = true;
    setThemeBusy(true);
    setThemeFailed(false);
    try {
      if (!await setPreference(theme)) setThemeFailed(true);
    } catch {
      setThemeFailed(true);
    } finally {
      changingTheme.current = false;
      setThemeBusy(false);
    }
  };

  const screenLayout: ChapterLayout = width < 600 ? "mobile" : Platform.OS === "web" && width >= 1200 ? "desktop" : "tablet";
  const phone = screenLayout === "mobile";
  const shortPhone = phone && height / fontScale < 700;
  const showExample = !shortPhone && !(phone && (startFailed || themeFailed));
  const wideCard = screenLayout === "desktop" || (screenLayout === "tablet" && width > height);
  const chapterNames = [
    i18n.t($ => $.ui.onboardingChapterOverview),
    i18n.t($ => $.ui.onboardingChapterBudgets),
    i18n.t($ => $.ui.onboardingChapterChoices),
    i18n.t($ => $.ui.onboardingChapterBeforeYouBegin)
  ];
  const copy = [
    {
      eyebrow: i18n.t($ => $.ui.onboardingOverviewEyebrow),
      title: i18n.t($ => $.ui.onboardingOverviewTitle),
      body: i18n.t($ => $.ui.onboardingOverviewBody)
    },
    {
      eyebrow: i18n.t($ => $.ui.onboardingBudgetsEyebrow),
      title: i18n.t($ => $.ui.onboardingBudgetsTitle),
      body: i18n.t($ => $.ui.onboardingBudgetsBody)
    },
    {
      eyebrow: i18n.t($ => $.ui.onboardingChoicesEyebrow),
      title: i18n.t($ => $.ui.onboardingChoicesTitle),
      body: i18n.t($ => $.ui.onboardingChoicesBody)
    },
    {
      eyebrow: i18n.t($ => $.ui.onboardingNoticeEyebrow),
      title: i18n.t($ => $.ui.onboardingNoticeTitle),
      body: i18n.t($ => $.ui.onboardingNoticeBody)
    }
  ] as const;

  const activeCopy = copy[step];
  const goBack = () => {
    setStartFailed(false);
    setStep(current => (Math.max(0, current - 1) as Step));
  };
  const continueIntro = () => {
    setStartFailed(false);
    setStep(current => (Math.min(3, current + 1) as Step));
  };
  const skipToNotice = () => {
    setStartFailed(false);
    setStep(current => current === 3 ? 0 : 3);
  };
  const startExploring = async () => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setStartFailed(false);
    try {
      await onComplete();
    } catch {
      setStartFailed(true);
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  const amount = (value: string) => formatMoneyForDisplay({ amount: value, currency: "USD" });
  const exampleRow = (label: string, value: string) => <View style={[styles.exampleRow, phone && styles.phoneExampleRow, width < 360 && styles.compactExampleRow, { borderColor: colors.divider }]}>
    <Text style={[styles.exampleRowLabel, { color: colors.muted }]}>{label}</Text>
    <Text style={[styles.exampleValue, width < 360 && styles.compactExampleValue, { color: colors.text }]}>{value}</Text>
  </View>;
  const sampleCard = step === 0 || step === 1 ? (
    <View key={`budget-example-${step}`} style={[styles.exampleCard, phone && styles.phoneExampleCard, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="welcome-example-card">
      <Text style={[styles.exampleLabel, { color: colors.muted }]}>
        {i18n.t(step === 0 ? $ => $.ui.onboardingOverviewSampleLabel : $ => $.ui.onboardingFoodBudgetSampleLabel)}
      </Text>
      <Text style={[styles.exampleAmount, { color: colors.text }]}>
        {amount(step === 0 ? "840" : "180")}
      </Text>
      <View style={[styles.progressTrack, { backgroundColor: colors.track }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.positive, width: step === 0 ? "42%" : "36%" }]} />
      </View>
      {exampleRow(i18n.t(step === 0 ? $ => $.ui.onboardingMonthlyLimits : $ => $.ui.onboardingSpent), amount(step === 0 ? "2000" : "320"))}
      {exampleRow(i18n.t(step === 0 ? $ => $.ui.onboardingExpenses : $ => $.ui.onboardingMonthlyLimit), amount(step === 0 ? "1160" : "500"))}
    </View>
  ) : step === 2 ? (
    <View key={`info-example-${step}`} style={[styles.infoCard, phone && styles.phoneInfoCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID="welcome-example-card">
      <Text style={[styles.infoTitle, { color: colors.text }]}>{i18n.t($ => $.ui.onboardingPersonalTracker)}</Text>
      <Text style={[styles.infoBody, { color: colors.muted }]}>{i18n.t($ => $.ui.onboardingStoredOnDevice)}</Text>
      {exampleRow(i18n.t($ => $.ui.onboardingVoiceEntry), i18n.t($ => $.ui.onboardingOptionalSignIn))}
      {exampleRow(i18n.t($ => $.ui.onboardingCloudSync), i18n.t($ => $.ui.onboardingSeparateOptIn))}
    </View>
  ) : (
    <View key={`info-example-${step}`} style={[styles.infoCard, phone && styles.phoneInfoCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} testID="welcome-example-card">
      <Text style={[styles.infoTitle, { color: colors.text }]}>{i18n.t($ => $.ui.onboardingFictionalEntries)}</Text>
      <Text style={[styles.infoBody, { color: colors.muted }]}>{i18n.t($ => $.ui.onboardingRealDataReminder)}</Text>
    </View>
  );

  const example = (
    <View style={[styles.illustration, phone && styles.phoneIllustration, wideCard && styles.wideIllustration, { backgroundColor: colors.positiveSubtle }]}>
      {sampleCard}
      {step < 2 ? <Text style={[styles.sampleNote, { color: colors.muted }]}>{i18n.t($ => $.ui.onboardingExample)}</Text> : null}
    </View>
  );
  const actions = (
    <View style={[styles.actions, step > 0 && styles.actionsWithBack, wideCard && styles.wideActions]}>
      {step > 0 ? <Button
        label={i18n.t($ => $.ui.onboardingBack)}
        variant="ghost"
        testID="welcome-back"
        disabled={busy || themeBusy}
        onPress={goBack}
      /> : null}
      <Button
        label={step === 3 ? busy ? i18n.t($ => $.ui.onboardingStarting) : i18n.t($ => $.ui.onboardingStartExploring) : i18n.t($ => $.ui.onboardingContinue)}
        variant="primary"
        testID={step === 3 ? "welcome-start" : "welcome-continue"}
        disabled={busy || themeBusy}
        accessibilityState={{ busy, disabled: busy || themeBusy }}
        onPress={step === 3 ? () => { void startExploring(); } : continueIntro}
        style={styles.primaryAction}
      />
    </View>
  );

  const mobileProgress = (
    <View style={styles.mobileProgress} testID="welcome-progress-mobile">
      <View style={styles.mobileProgressHeading}>
        <Text style={[styles.currentChapter, { color: colors.positive }]}>{chapterNames[step]}</Text>
        <Text style={[styles.stepCount, { color: colors.muted }]}>{String(step + 1).padStart(2, "0")} / 04</Text>
      </View>
      <View style={styles.mobileSegments} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: step + 1 }} accessibilityLabel={chapterNames[step]}>
        {chapterNames.map((name, index) => <View key={name} style={[styles.mobileSegment, { backgroundColor: index <= step ? colors.positive : colors.border }]} />)}
      </View>
    </View>
  );

  const tabletProgress = (
    <View style={styles.tabletProgress} testID="welcome-progress-tablet">
      {chapterNames.map((name, index) => <View key={name} style={styles.tabletChapter} testID={`welcome-chapter-${index + 1}`}>
        <View style={[styles.chapterRule, { backgroundColor: index <= step ? colors.positive : colors.border }]} />
        <Text style={[styles.chapterNumber, { color: index === step ? colors.positive : colors.muted }]}>{String(index + 1).padStart(2, "0")}</Text>
        <Text style={[styles.chapterName, { color: index === step ? colors.positive : colors.muted }]}>{name}</Text>
      </View>)}
    </View>
  );

  const desktopRail = (
    <View style={[styles.desktopRail, { borderColor: colors.border }]} testID="welcome-progress-desktop">
      {chapterNames.map((name, index) => <View key={name} style={[styles.desktopChapter, { borderColor: colors.border }]} testID={`welcome-chapter-${index + 1}`}>
        <Text style={[styles.desktopChapterNumber, { color: index <= step ? colors.positive : colors.muted }]}>{String(index + 1).padStart(2, "0")}</Text>
        <Text style={[styles.desktopChapterName, { color: index === step ? colors.positive : colors.muted }]}>{name}</Text>
      </View>)}
    </View>
  );

  const copyPanel = (
    <View style={[styles.copyPanel, wideCard && styles.wideCopyPanel]}>
      <Text style={[styles.eyebrow, { color: colors.positive }]}>{activeCopy.eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.heading, phone && styles.phoneHeading, shortPhone && styles.shortPhoneHeading, { color: colors.text }]} testID="welcome-heading">{activeCopy.title}</Text>
      <Text style={[styles.description, phone && styles.phoneDescription, { color: colors.muted }]}>{activeCopy.body}</Text>
      {wideCard && startFailed ? <Text accessibilityRole="alert" style={[styles.startError, { color: colors.negative }]} testID="welcome-start-error">{i18n.t($ => $.ui.onboardingStartError)}</Text> : null}
      {wideCard ? actions : null}
    </View>
  );

  const card = (
    <View style={[styles.card, phone && styles.phoneCard, wideCard && styles.wideCard, screenLayout === "desktop" && styles.desktopCard]} testID="welcome-card">
      {wideCard ? <>{example}{copyPanel}</> : <>
        {copyPanel}
        {showExample ? example : null}
        {startFailed ? <Text accessibilityRole="alert" style={[styles.startError, { color: colors.negative }]} testID="welcome-start-error">{i18n.t($ => $.ui.onboardingStartError)}</Text> : null}
        {actions}
      </>}
    </View>
  );

  const content = (
        <View style={styles.page}>
          <View testID="welcome-shell" style={[styles.shell, { backgroundColor: colors.surface, borderColor: colors.border, padding: screenLayout === "mobile" ? 16 : 32 }, screenLayout === "mobile" && styles.mobileShell]}>
          <View style={[styles.header, screenLayout === "mobile" && styles.mobileHeader]}>
            <AppBrand transparent presentation={screenLayout === "mobile" ? "symbol" : "horizontal"} style={screenLayout === "mobile" ? styles.brandSymbol : styles.brand} />
            <View style={[styles.headerTools, phone && styles.phoneHeaderTools]}>
              <Pressable
                testID="welcome-theme"
                accessibilityRole="button"
                accessibilityLabel={`${i18n.t($ => $.ui.onboardingAppearance)}: ${i18n.t($ => $.notices[preference])}`}
                accessibilityState={{ disabled: busy || themeBusy }}
                disabled={busy || themeBusy}
                onPress={() => { void chooseTheme(preference === "light" ? "dark" : preference === "dark" ? "system" : "light"); }}
                style={[styles.themeButton, { borderColor: colors.border, opacity: busy || themeBusy ? 0.5 : 1 }]}
              >
                <Ionicons name={preference === "light" ? "sunny-outline" : preference === "dark" ? "moon-outline" : "desktop-outline"} size={20} color={colors.text} accessibilityElementsHidden importantForAccessibility="no" />
              </Pressable>
            <Button
              label={step === 3 ? i18n.t($ => $.ui.onboardingBackToIntro) : i18n.t($ => $.ui.onboardingSkipIntro)}
              variant="ghost"
              testID="welcome-skip"
              disabled={busy || themeBusy}
              onPress={skipToNotice}
              style={styles.skipButton}
            />
            </View>
          </View>
          {themeFailed ? <Text accessibilityRole="alert" style={[styles.themeError, { color: colors.negative }]}>{i18n.t($ => $.ui.onboardingThemeError)}</Text> : null}

          {screenLayout === "mobile" ? mobileProgress : null}
          {screenLayout === "tablet" ? tabletProgress : null}
          {screenLayout === "desktop" ? <View style={styles.desktopLayout}>{desktopRail}{card}</View> : <View style={styles.centeredContent}>{card}</View>}
          <Text style={[styles.footer, { color: colors.muted }]}>{step === 3 ? i18n.t($ => $.ui.onboardingPortfolioFooter) : i18n.t($ => $.ui.onboardingNoAccountFooter)}</Text>
          </View>
        </View>
  );

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.canvas }]}>
    {phone ? <View testID="welcome-phone-viewport" style={styles.phoneViewport}>{content}</View> :
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 32 }]}>{content}</ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: 32 },
  page: { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center", justifyContent: "center" },
  shell: { width: "100%", borderWidth: 1, borderRadius: layout.cardRadius },
  mobileShell: { padding: 16, flexShrink: 1 },
  phoneViewport: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  phoneCard: { gap: 16 },
  phoneHeaderTools: { flexDirection: "row", alignItems: "center", gap: 4 },
  phoneHeading: { fontSize: 28, lineHeight: 33, marginTop: 6, marginBottom: 10 },
  shortPhoneHeading: { fontSize: 25, lineHeight: 29 },
  phoneDescription: { fontSize: 14, lineHeight: 21 },
  phoneIllustration: { padding: 10 },
  phoneExampleCard: { padding: 12 },
  phoneInfoCard: { padding: 14, gap: 8 },
  phoneExampleRow: { paddingVertical: 6 },
  header: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 28 },
  mobileHeader: { marginBottom: 14 },
  brand: { width: 240, alignItems: "flex-start" },
  brandSymbol: { width: 48, alignItems: "flex-start" },
  headerTools: { alignItems: "flex-end", gap: 4, flexShrink: 1 },
  skipButton: { minHeight: 44, paddingHorizontal: 10, flexShrink: 1 },
  mobileProgress: { marginBottom: 18 },
  mobileProgressHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  currentChapter: { fontSize: 12, lineHeight: 18 },
  stepCount: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
  mobileSegments: { flexDirection: "row", gap: 6, marginTop: 9 },
  mobileSegment: { height: 4, borderRadius: 3, flex: 1 },
  tabletProgress: { width: "100%", flexDirection: "row", gap: 16, marginBottom: 32 },
  tabletChapter: { flex: 1, minWidth: 0 },
  chapterRule: { height: 3, borderRadius: 2, marginBottom: 10 },
  chapterNumber: { fontSize: 11, lineHeight: 16 },
  chapterName: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  centeredContent: { width: "100%", alignItems: "center" },
  desktopLayout: { width: "100%", flexDirection: "row", alignItems: "stretch", gap: 18 },
  desktopRail: { width: 156, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth, paddingRight: 24 },
  desktopChapter: { paddingVertical: 15 },
  desktopChapterNumber: { fontSize: 11, lineHeight: 16, marginBottom: 3 },
  desktopChapterName: { fontSize: 13, lineHeight: 19 },
  card: { width: "100%", gap: 24 },
  wideCard: { width: "100%", flexDirection: "row", alignItems: "center", gap: 32, minHeight: 340 },
  desktopCard: { flex: 1, width: undefined },
  copyPanel: { width: "100%", minWidth: 0 },
  wideCopyPanel: { flex: 1, width: undefined },
  eyebrow: { fontSize: 11, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase" },
  heading: { ...typography.heading, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, marginTop: 10, marginBottom: 14 },
  description: { fontSize: 15, lineHeight: 23, maxWidth: 440 },
  illustration: { width: "100%", minWidth: 0, borderRadius: 12, padding: 16 },
  wideIllustration: { flex: 1, width: undefined },
  exampleCard: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 16 },
  exampleLabel: { fontSize: 12, lineHeight: 18 },
  exampleAmount: { ...typography.amount, fontSize: 28, lineHeight: 38, marginTop: 6, marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 6, overflow: "hidden", marginBottom: 14 },
  progressFill: { height: 6, borderRadius: 6 },
  exampleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  compactExampleRow: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  exampleRowLabel: { flexShrink: 1, fontSize: 12, lineHeight: 18 },
  exampleValue: { flexShrink: 0, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
  compactExampleValue: { alignSelf: "flex-start" },
  sampleNote: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 10 },
  infoCard: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 22, gap: 14 },
  infoTitle: { ...typography.label, fontSize: 16, lineHeight: 23 },
  infoBody: { fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  actionsWithBack: { justifyContent: "space-between" },
  wideActions: { marginTop: 24, flexWrap: "wrap" },
  primaryAction: { minWidth: 148, flexGrow: 1, flexShrink: 1 },
  startError: { marginTop: 14, fontSize: 13, lineHeight: 20 },
  themeButton: { height: 40, width: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  themeError: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
  footer: { alignSelf: "center", textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 14 }
});
