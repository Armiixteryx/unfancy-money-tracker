import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppBrand } from "./AppBrand";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" as "light" | "dark" }));
const assets = vi.hoisted(() => ({
  horizontalColor: { name: "horizontal-color" },
  horizontalReverse: { name: "horizontal-reverse" },
  symbol: { name: "symbol" }
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
});
