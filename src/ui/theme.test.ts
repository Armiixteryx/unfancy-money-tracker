import { describe, expect, it } from "vitest";

import { darkColors, lightColors, resolveTheme } from "./themeTokens";

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("app theme", () => {
  it("resolves explicit and system preferences", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", null)).toBe("light");
  });

  it("keeps light and dark palettes on the same semantic contract", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it.each([lightColors, darkColors])("keeps essential text and status colors at AA contrast", (colors) => {
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.text, colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.muted, colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.positive, colors.positiveSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.negative, colors.negativeSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.warning, colors.warningSubtle)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onPrimary, colors.negative)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.muted, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.positive, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.negative, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
