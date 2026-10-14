import { describe, expect, it } from "vitest";

import { resolveBrandAssetVariant, resolveBrandPresentation } from "./brandIdentity";

describe("brand presentation", () => {
  it("uses the horizontal lockup at its 240px minimum width", () => {
    expect(resolveBrandPresentation("auto", 240)).toBe("horizontal");
    expect(resolveBrandPresentation("auto", 256)).toBe("horizontal");
  });

  it("switches between the horizontal lockup and symbol as space changes", () => {
    const resized = [224, 256, 239, 240].map((width) => resolveBrandPresentation("auto", width));

    expect(resized).toEqual(["symbol", "horizontal", "symbol", "horizontal"]);
  });

  it("honors an explicitly selected presentation", () => {
    expect(resolveBrandPresentation("horizontal", 100)).toBe("horizontal");
    expect(resolveBrandPresentation("symbol", 400)).toBe("symbol");
  });
});

describe("brand artwork selection", () => {
  it("uses the approved light lockup and the navy-field reverse lockup by theme", () => {
    expect(resolveBrandAssetVariant("horizontal", "light")).toBe("horizontal-color");
    expect(resolveBrandAssetVariant("horizontal", "dark")).toBe("horizontal-reverse");
  });

  it("uses the approved square app icon as the symbol in either theme", () => {
    expect(resolveBrandAssetVariant("symbol", "light")).toBe("symbol");
    expect(resolveBrandAssetVariant("symbol", "dark")).toBe("symbol");
  });
});
