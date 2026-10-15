import { ScrollView } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../localization/i18n";
import { WelcomeScreen } from "./WelcomeScreen";

const themeControl = vi.hoisted(() => ({ preference: "light" as "light" | "dark" | "system", setPreference: vi.fn() }));
const surface = vi.hoisted(() => ({ width: 390, height: 844, platform: "web" }));
const colors = vi.hoisted(() => ({
  canvas: "#EFECEA", surface: "#FFFFFF", surfaceRaised: "#F7F5F2", text: "#102A43", muted: "#59666C",
  border: "#DCD9D6", divider: "#EEECE8", primary: "#102A43", onPrimary: "#FFFFFF", positive: "#0F7A3A",
  negative: "#C03232", accent: "#0F7A3A", placeholder: "#5B666D", track: "#EEECE8", positiveSubtle: "#EDF6EF",
  negativeSubtle: "#FFF2F0", infoSubtle: "#F1F3F3", warning: "#886000", warningSubtle: "#FFF7E6", pro: "#102A43", proSubtle: "#F1F3F3"
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: "icon" }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return surface.platform; } },
  Pressable: "button",
  ScrollView: "scroll",
  View: "div",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: surface.width, height: surface.height })
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "main" }));
vi.mock("../../ui/AppBrand", () => ({ AppBrand: "brand" }));
vi.mock("../../ui/AppText", () => ({ AppText: "span" }));
vi.mock("../../ui/theme", () => ({
  useAppTheme: () => ({ colors, resolvedTheme: "light", preference: themeControl.preference, setPreference: themeControl.setPreference }),
  useThemedStyles: (factory: (value: typeof colors) => unknown) => factory(colors)
}));

function button(id: string) {
  return tree!.root.findByProps({ testID: id });
}

function renderedText() {
  return tree!.root.findAllByType("span").map(node => node.children.join(""));
}

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  themeControl.preference = "light";
  themeControl.setPreference.mockReset().mockImplementation(async (theme: "light" | "dark" | "system") => { themeControl.preference = theme; return true; });
  surface.width = 390;
  surface.height = 844;
  surface.platform = "web";
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  await i18n.changeLanguage("en");
});

describe("guided welcome", () => {
  it("keeps all four chapters and their actions in a non-scrolling short-phone viewport", async () => {
    surface.width = 320;
    surface.height = 568;
    surface.platform = "android";
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });
    for (const chapter of ["Your overview", "Simple budgets", "Your choices", "Before you begin"]) {
      expect(renderedText()).toContain(chapter);
      expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
      expect(tree!.root.findAllByProps({ testID: "welcome-phone-viewport" })).toHaveLength(1);
      expect(tree!.root.findAllByProps({ testID: "welcome-example-card" })).toHaveLength(0);
      if (chapter !== "Before you begin") await act(async () => button("welcome-continue").props.onPress());
    }
    expect(renderedText()).toContain("This is a portfolio application, not a serious application. Do not use it to store real financial data.");
    await act(async () => button("welcome-start").props.onPress());
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("changes appearance without completing or resetting the active chapter", async () => {
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });
    await act(async () => button("welcome-continue").props.onPress());
    for (const theme of ["dark", "system", "light"]) {
      await act(async () => button("welcome-theme").props.onPress());
      await act(async () => tree!.update(<WelcomeScreen onComplete={onComplete} />));
      expect(themeControl.setPreference).toHaveBeenLastCalledWith(theme);
      expect(tree!.root.findAllByType("button").filter(node => node.props.testID === "welcome-theme")).toHaveLength(1);
      expect(button("welcome-theme").props.accessibilityLabel).toContain(theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System");
      expect(renderedText()).toContain("Simple budgets");
    }
    expect(onComplete).not.toHaveBeenCalled();
    themeControl.setPreference.mockResolvedValueOnce(false);
    await act(async () => button("welcome-theme").props.onPress());
    expect(renderedText()).toContain("Could not change appearance. Please try again.");
  });

  it("keeps the required warning between skip and guest start, with Back returning one chapter", async () => {
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });

    expect(renderedText()).toContain("840.00 USD");
    expect(renderedText()).toContain("2,000.00 USD");
    expect(renderedText()).toContain("1,160.00 USD");
    await act(async () => button("welcome-skip").props.onPress());
    expect(renderedText()).toContain("This is a portfolio application, not a serious application. Do not use it to store real financial data.");
    expect(button("welcome-start").props.disabled).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => button("welcome-back").props.onPress());
    expect(renderedText()).toContain("Your choices");
    expect(renderedText()).toContain("Cloud sync");
    expect(renderedText()).toContain("Separate opt-in");
    expect(tree!.root.findAllByProps({ testID: "welcome-start" })).toHaveLength(0);
  });

  it("disables navigation while guest start is pending and calls completion once", async () => {
    let resolveStart: (() => void) | undefined;
    const onComplete = vi.fn(() => new Promise<void>(resolve => { resolveStart = resolve; }));
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });
    await act(async () => button("welcome-skip").props.onPress());
    await act(async () => button("welcome-start").props.onPress());

    expect(onComplete).toHaveBeenCalledOnce();
    expect(button("welcome-start").props.disabled).toBe(true);
    expect(button("welcome-back").props.disabled).toBe(true);
    expect(button("welcome-skip").props.disabled).toBe(true);

    await act(async () => { resolveStart?.(); await Promise.resolve(); });
    expect(button("welcome-start").props.disabled).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("shows a translated inline retry message when guest start rejects", async () => {
    const onComplete = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("synthetic storage error"))
      .mockResolvedValueOnce(undefined);
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });
    await act(async () => button("welcome-skip").props.onPress());
    await act(async () => {
      button("welcome-start").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderedText()).toContain("Could not start exploring. Please try again.");
    expect(tree!.root.findAllByProps({ testID: "welcome-start-error" })).toHaveLength(1);
    await act(async () => button("welcome-start").props.onPress());
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(tree!.root.findAllByProps({ testID: "welcome-start-error" })).toHaveLength(0);
  });

  it("uses the horizontal chapter strip at tablet widths and the chapter rail on wide web", async () => {
    surface.width = 1024;
    await act(async () => { tree = create(<WelcomeScreen onComplete={async () => undefined} />); });
    expect(tree!.root.findAllByProps({ testID: "welcome-progress-tablet" })).toHaveLength(1);
    expect(tree!.root.findAllByProps({ testID: "welcome-progress-desktop" })).toHaveLength(0);

    surface.width = 1280;
    await act(async () => tree!.update(<WelcomeScreen onComplete={async () => undefined} />));
    expect(tree!.root.findAllByProps({ testID: "welcome-progress-desktop" })).toHaveLength(1);
    expect(tree!.root.findAllByProps({ testID: "welcome-progress-tablet" })).toHaveLength(0);
  });

  it("localizes the warning and call to action in Spanish", async () => {
    await i18n.changeLanguage("es");
    const onComplete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await act(async () => { tree = create(<WelcomeScreen onComplete={onComplete} />); });
    await act(async () => button("welcome-skip").props.onPress());

    expect(renderedText()).toContain("Esta es una aplicación de portafolio, no una aplicación seria. No guardes aquí datos financieros reales.");
    expect(renderedText()).toContain("Empezar a explorar");
  });
});
