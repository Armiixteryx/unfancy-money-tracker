import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppBrand } from "./AppBrand";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" as "light" | "dark" }));
const assets = vi.hoisted(() => ({
  horizontalColor: { name: "horizontal-color" },
  horizontalColorTransparent: { name: "horizontal-color-transparent" },
  horizontalReverse: { name: "horizontal-reverse" },
  horizontalReverseTransparent: { name: "horizontal-reverse-transparent" },
  symbol: { name: "symbol" },
  symbolNavyTransparent: { name: "symbol-navy-transparent" },
  symbolColorTransparent: { name: "symbol-color-transparent" }
}));

vi.mock("react-native", () => ({
  Image: "img",
  StyleSheet: { create: (styles: object) => styles },
  View: "div"
}));

vi.mock("./theme", () => ({ useAppTheme: () => theme }));
vi.mock("./brandAssets", () => ({
  brandImages: {
    "horizontal-color": assets.horizontalColor,
    "horizontal-reverse": assets.horizontalReverse,
    symbol: assets.symbol
  },
  resolveBrandImage: (variant: string, resolvedTheme: "light" | "dark", transparent: boolean) => {
    if (!transparent) return ({ "horizontal-color": assets.horizontalColor, "horizontal-reverse": assets.horizontalReverse, symbol: assets.symbol } as const)[variant as "horizontal-color" | "horizontal-reverse" | "symbol"];
    if (variant === "symbol") return resolvedTheme === "dark" ? assets.symbolColorTransparent : assets.symbolNavyTransparent;
    return variant === "horizontal-color" ? assets.horizontalColorTransparent : assets.horizontalReverseTransparent;
  }
}));

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  theme.resolvedTheme = "light";
});

afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
});

describe("AppBrand", () => {
  it("keeps explicit image dimensions and reselects artwork after container resizes", async () => {
    await act(async () => { tree = create(<AppBrand accessibilityElementsHidden />); });

    const image = () => tree!.root.findByType("img");
    const container = () => tree!.root.findByType("div");
    expect(image().props.source).toBe(assets.symbol);

    expect(image().props.style).toMatchObject({ width: 48, height: 48 });
    expect(container().props.accessibilityElementsHidden).toBe(true);
    expect(container().props.importantForAccessibility).toBe("no-hide-descendants");
    expect(image().props.accessible).toBe(false);

    await act(async () => { container().props.onLayout({ nativeEvent: { layout: { width: 256 } } }); });
    const lightHorizontalSource = image().props.source;
    expect(image().props.style).toMatchObject({ width: 240, height: 94 });
    expect(lightHorizontalSource).toBe(assets.horizontalColor);
    expect(image().props.accessibilityLabel).toBe("Unfancy Money Tracker");

    theme.resolvedTheme = "dark";
    await act(async () => { tree!.update(<AppBrand accessibilityElementsHidden />); });
    const darkHorizontalSource = image().props.source;
    expect(darkHorizontalSource).toBe(assets.horizontalReverse);
    expect(image().props.style).toMatchObject({ width: 240, height: 94 });

    await act(async () => { container().props.onLayout({ nativeEvent: { layout: { width: 224 } } }); });
    expect(image().props.style).toMatchObject({ width: 48, height: 48 });
    expect(image().props.source).toBe(assets.symbol);
  });

  it("selects transparent lockups and theme-appropriate transparent symbols only on request", async () => {
    await act(async () => { tree = create(<AppBrand presentation="horizontal" transparent />); });
    const image = () => tree!.root.findByType("img");
    expect(image().props.source).toBe(assets.horizontalColorTransparent);

    theme.resolvedTheme = "dark";
    await act(async () => { tree!.update(<AppBrand presentation="horizontal" transparent />); });
    expect(image().props.source).toBe(assets.horizontalReverseTransparent);

    theme.resolvedTheme = "light";
    await act(async () => { tree!.update(<AppBrand presentation="symbol" transparent />); });
    expect(image().props.source).toBe(assets.symbolNavyTransparent);

    theme.resolvedTheme = "dark";
    await act(async () => { tree!.update(<AppBrand presentation="symbol" transparent />); });
    expect(image().props.source).toBe(assets.symbolColorTransparent);
  });
});
