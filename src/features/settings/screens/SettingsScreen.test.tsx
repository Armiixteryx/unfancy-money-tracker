import { AppText } from "../../../ui/AppText";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { createCategory } from "../../../domain/categories";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { categoryLabel, i18n } from "../../../localization/i18n";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { SettingsScreen } from "./SettingsScreen";
import { SyncSettings } from "../../sync/SyncSettings";

vi.mock("../../sync/SyncSettings", () => ({ SyncSettings: () => null }));
const surface = vi.hoisted(() => ({ width: 400, os: "web", identity: "synthetic@example.invalid" as string | null }));
const trackerProvider = vi.hoisted(() => ({ client: {}, createShared: vi.fn(), acceptShared: vi.fn(), refresh: vi.fn(async () => undefined), isRefreshing: false, error: null }));
const watchMocks = vi.hoisted(() => ({
  available: false,
  list: vi.fn(async () => [] as { requestId: string; accountId: string; recordedAt: string; durationMs: number; mimeType: string; status: "failed" }[]),
  subscribe: vi.fn(() => () => undefined),
  playbackListener: null as ((event: { requestId: string; status: "paused" | "completed" }) => void) | null,
  subscribePlayback: vi.fn((listener: (event: { requestId: string; status: "paused" | "completed" }) => void) => { watchMocks.playbackListener = listener; return () => undefined; }),
  play: vi.fn(async () => undefined), pause: vi.fn(async () => undefined), delete: vi.fn(async () => undefined),
  getPending: vi.fn(async () => []), markProcessing: vi.fn(async () => false), readAudio: vi.fn(), markSucceeded: vi.fn(), markFailed: vi.fn(), setAccount: vi.fn(), failPendingForCurrentBinding: vi.fn(),
}));
vi.mock("../../watch/bridge", () => ({ watchAudioBridge: watchMocks }));
vi.mock("../../../platform/auth/client", () => ({ getAuthenticatedAccountId: vi.fn(async () => "cognito-sub-current") }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ identity: surface.identity, epoch: 0, open: vi.fn(), signOut: vi.fn() }) }));
vi.mock("../../trackers/TrackerProvider", () => ({ useTrackers: () => trackerProvider }));
vi.mock("react-native", () => ({
  Modal: "modal", Pressable: "button", Text: "text", TextInput: "input", View: "view",
  Platform: { get OS() { return surface.os; } },
  useWindowDimensions: () => ({ width: surface.width }),
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("../../../ui/theme", () => ({
  useAppTheme: () => ({ colors: {} }),
  useThemedStyles: (factory: (colors: object) => unknown) => factory({})
}));
vi.mock("../../../ui/AppScreen", () => ({ AppScreen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../../providers/AnalyticsProvider", () => ({ useAnalytics: () => ({ setConsent: vi.fn(), capture: vi.fn() }) }));
vi.mock("../../exchange-rates/hooks/useExchangeRates", () => ({ useExchangeRates: () => ({ latestRates: new Map(), unavailableCurrencies: [], hasError: false, isLoading: false }) }));

const original = createEmptyDataset();
const custom = createCategory({ kind: "expense", name: "Synthetic custom" });
const dataset = { ...original, categories: [...original.categories, custom] };
let tree: ReactTestRenderer | undefined;
function button(label: string) {
  return tree!.root.findAllByType("button").find(node => node.findAllByType("text").some(text => text.children.join("") === label))!;
}
function row(label: string) {
  return tree!.root.findAllByType(AppText).find(node => node.props.children === label)!.parent!.parent!;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  surface.identity = "synthetic@example.invalid";
  watchMocks.available = false;
  watchMocks.list.mockReset().mockResolvedValue([]);
  watchMocks.play.mockReset(); watchMocks.pause.mockReset(); watchMocks.delete.mockReset();
  watchMocks.playbackListener = null;
  await i18n.changeLanguage("en");
  useLocalDatasetStore.setState({ dataset, saveError: null });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  await i18n.changeLanguage("en");
});

describe("protected categories in Settings", () => {
  it.each([
    ["web", 400], ["web", 1200], ["ios", 400], ["android", 400]
  ] as const)("keeps built-in actions hidden and updates labels in both languages on %s at width %s", async (os, width) => {
    surface.os = os;
    surface.identity = "synthetic@example.invalid";
    surface.width = width;
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><SettingsScreen /></I18nextProvider>); });
    expect(tree!.root.findAllByType(SyncSettings)).toHaveLength(1);
    await act(async () => { button("Categories").props.onPress(); });
    for (const language of ["en", "es"] as const) {
      await act(async () => { await i18n.changeLanguage(language); });
      for (const category of dataset.categories.filter(category => category.kind === "expense" && category.isSystem)) {
        expect(row(categoryLabel(category)).findAllByType("button")).toHaveLength(0);
      }
      const actions = row(custom.name).findAllByType("button");
      expect(actions.map(action => action.findByType("text").children.join(""))).toEqual([
        i18n.t($ => $.ui.settingsRename), i18n.t($ => $.ui.settingsArchive), i18n.t($ => $.ui.settingsDelete)
      ]);
      expect(tree!.root.findAllByType("text").some(node => node.children.join("") === i18n.t($ => $.ui.settingsCreateRenameArchiveOrDeleteCategoriesProtected))).toBe(true);
    }
    await act(async () => { button(i18n.t($ => $.ui.dashboardIncome)).props.onPress(); });
    // Income appears both as the type chip and the category name.
    const protectedRows = tree!.root.findAllByType(AppText).filter(node => node.props.children === i18n.t($ => $.ui.settingsProtectedSystemCategory));
    expect(protectedRows).toHaveLength(2);
    for (const helper of protectedRows) expect(helper.parent!.parent!.findAllByType("button")).toHaveLength(0);
  });

  it("keeps playback bound to the originating account while allowing confirmed deletion after account changes", async () => {
    surface.os = "web";
    surface.width = 400;
    surface.identity = null;
    watchMocks.available = true;
    watchMocks.list.mockResolvedValue([{ requestId: "018f0fcb-76a9-7000-8000-000000000001", accountId: "cognito-sub-origin", recordedAt: "2026-10-06T12:00:00.000Z", durationMs: 900, mimeType: "audio/mp4", status: "failed" }]);
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><SettingsScreen /></I18nextProvider>); });
    await act(async () => { button(i18n.t($ => $.ui.settingsFailedWatchRecordings)).props.onPress(); await Promise.resolve(); });
    expect(tree!.root.findAllByType("button").some(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPlayRecording))).toBe(false);
    expect(tree!.root.findAllByType(AppText).some(node => node.props.children === i18n.t($ => $.ui.settingsWatchOriginAccountRequired))).toBe(true);

    const deleteButton = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsDeleteRecording));
    await act(async () => { deleteButton!.props.onPress(); });
    const confirmedDelete = tree!.root.findAllByType("button").filter(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsDeleteRecording)).at(-1);
    await act(async () => { await confirmedDelete!.props.onPress(); });
    expect(watchMocks.delete).toHaveBeenCalledWith("018f0fcb-76a9-7000-8000-000000000001");
  });

  it("offers Play/Pause only for the active originating Cognito account", async () => {
    surface.os = "web";
    surface.width = 400;
    surface.identity = "synthetic@example.invalid";
    watchMocks.available = true;
    watchMocks.list.mockResolvedValue([{ requestId: "018f0fcb-76a9-7000-8000-000000000002", accountId: "cognito-sub-current", recordedAt: "2026-10-06T12:00:00.000Z", durationMs: 900, mimeType: "audio/mp4", status: "failed" }]);
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><SettingsScreen /></I18nextProvider>); });
    await act(async () => { button(i18n.t($ => $.ui.settingsFailedWatchRecordings)).props.onPress(); await Promise.resolve(); });
    const play = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPlayRecording));
    expect(play).toBeDefined();
    await act(async () => { await play!.props.onPress(); });
    expect(watchMocks.play).toHaveBeenCalledWith("018f0fcb-76a9-7000-8000-000000000002");
    const pause = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPauseRecording));
    expect(pause).toBeDefined();
    await act(async () => { watchMocks.playbackListener?.({ requestId: "018f0fcb-76a9-7000-8000-000000000002", status: "completed" }); });
    expect(tree!.root.findAllByType("button").some(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPlayRecording))).toBe(true);
    const pauseAfterRestart = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPauseRecording));
    expect(pauseAfterRestart).toBeUndefined();
    const playAgain = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPlayRecording));
    await act(async () => { await playAgain!.props.onPress(); });
    const finalPause = tree!.root.findAllByType("button").find(node => node.props.accessibilityLabel === i18n.t($ => $.ui.settingsPauseRecording));
    await act(async () => { await finalPause!.props.onPress(); });
    expect(watchMocks.pause).toHaveBeenCalledWith("018f0fcb-76a9-7000-8000-000000000002");
  });
});
