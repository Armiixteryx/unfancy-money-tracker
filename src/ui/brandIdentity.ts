export type BrandPresentation = "auto" | "horizontal" | "symbol";
export type ResolvedBrandPresentation = Exclude<BrandPresentation, "auto">;
export type BrandAssetVariant = "horizontal-color" | "horizontal-reverse" | "symbol";
export type BrandTheme = "light" | "dark";

export const BRAND_HORIZONTAL_WIDTH = 240;
export const BRAND_HORIZONTAL_HEIGHT = BRAND_HORIZONTAL_WIDTH * 470 / 1200;
export const BRAND_SYMBOL_SIZE = 48;
export const BRAND_HORIZONTAL_ASPECT_RATIO = 1200 / 470;

export function resolveBrandPresentation(
  presentation: BrandPresentation,
  availableWidth: number
): ResolvedBrandPresentation {
  if (presentation !== "auto") return presentation;
  return availableWidth >= BRAND_HORIZONTAL_WIDTH ? "horizontal" : "symbol";
}

export function resolveBrandAssetVariant(
  presentation: ResolvedBrandPresentation,
  theme: BrandTheme
): BrandAssetVariant {
  if (presentation === "symbol") return "symbol";
  return theme === "dark" ? "horizontal-reverse" : "horizontal-color";
}
