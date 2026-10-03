import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { createCategory } from "../../../domain/categories";
import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { categoryLabel, i18n } from "../../../localization/i18n";
import { useLocalDatasetStore } from "../../local-data/store/useLocalDatasetStore";
import { SettingsScreen } from "./SettingsScreen";

const surface = vi.hoisted(() => ({ width: 400, os: "web" }));
vi.mock("react-native", () => ({
  Pressable: "button", Text: "text", TextInput: "input", View: "view",
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
  return tree!.root.findAllByType("text").find(node => node.children.join("") === label)!.parent!.parent!;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
    surface.width = width;
    await act(async () => { tree = create(<I18nextProvider i18n={i18n}><SettingsScreen /></I18nextProvider>); });
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
    const protectedRows = tree!.root.findAllByType("text").filter(node => node.children.join("") === i18n.t($ => $.ui.settingsProtectedSystemCategory));
    expect(protectedRows).toHaveLength(2);
    for (const helper of protectedRows) expect(helper.parent!.parent!.findAllByType("button")).toHaveLength(0);
  });
});
