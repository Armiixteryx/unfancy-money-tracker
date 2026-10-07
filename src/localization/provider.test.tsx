import { useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useTranslation } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../platform/persistence/datasetPersistence";
import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { trackerRegistryStore } from "../features/trackers/store";
import { LocalizationProvider } from "./LocalizationProvider";
import { i18n } from "./i18n";
import { getRegion } from "./region";

const device = vi.hoisted(() => ({ tags: ["en-US"], locale: "en-US", foreground: undefined as undefined | ((state: string) => void), remove: vi.fn() }));
vi.mock("./device", async () => {
  const { regionForLocale } = await import("./region");
  return { devicePreferences: () => ({ tags: [...device.tags], region: regionForLocale(device.locale) }) };
});
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: (_event: string, callback: (state: string) => void) => { device.foreground = callback; return { remove: device.remove }; } } }));
let tree: ReactTestRenderer;
let mounts = 0;
function Draft() {
  useTranslation();
  const [value, setValue] = useState("Synthetic draft");
  useEffect(() => { mounts++; }, []);
  return <input value={value} onChange={event => setValue(event.target.value)} aria-label={i18n.t($ => $.navigation.transactions)} />;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mounts = 0;
  // React Native defines window without browser event APIs.
  vi.stubGlobal("window", {});
  device.tags = ["en-US"];
  device.locale = "en-US";
  useLocalDatasetStore.setState({ dataset: createEmptyDataset() });
  trackerRegistryStore.setState({ devicePreferences: { language: "system", theme: "system", analyticsConsent: false, firstRunNoticeDismissed: false } });
  await act(async () => { tree = create(<LocalizationProvider><Draft /></LocalizationProvider>); });
});
afterEach(async () => { await act(async () => { tree.unmount(); await i18n.changeLanguage("en"); }); vi.unstubAllGlobals(); });

describe("localization provider lifecycle", () => {
  it("changes preference without remounting its children or losing drafts", async () => {
    await act(async () => { tree.root.findByType("input").props.onChange({ target: { value: "Unfinished synthetic draft" } }); });
    await act(async () => {
      trackerRegistryStore.setState(state => ({ devicePreferences: { ...state.devicePreferences, language: "es" } }));
    });
    expect(tree.root.findByType("input").props["aria-label"]).toBe("Movimientos");
    expect(tree.root.findByType("input").props.value).toBe("Unfinished synthetic draft");
    expect(mounts).toBe(1);
    expect(getRegion().locale).toBe("en-US");
  });
  it("refreshes system language and region on foreground without overriding explicit language", async () => {
    device.tags = ["fr-FR", "es-VE"];
    device.locale = "es-VE";
    await act(async () => { device.foreground?.("active"); });
    expect(i18n.language).toBe("es");
    expect(getRegion().decimalSeparator).toBe(",");
    await act(async () => {
      trackerRegistryStore.setState(state => ({ devicePreferences: { ...state.devicePreferences, language: "en" } }));
    });
    device.tags = ["es-VE"];
    await act(async () => { device.foreground?.("active"); });
    expect(i18n.language).toBe("en");
    expect(getRegion().decimalSeparator).toBe(",");
    expect(mounts).toBe(1);
  });
});
