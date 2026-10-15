import type { ImageSourcePropType } from "react-native";

import type { BrandAssetVariant, BrandTheme } from "./brandIdentity";

export const brandImages = {
  "horizontal-color": require("../../artifacts/brand-kit/exports/logo-horizontal-color.png") as ImageSourcePropType,
  "horizontal-reverse": require("../../artifacts/brand-kit/exports/logo-horizontal-reverse.png") as ImageSourcePropType,
  symbol: require("../../artifacts/brand-kit/platform/ios/icon-1024-opaque.png") as ImageSourcePropType
} satisfies Record<BrandAssetVariant, ImageSourcePropType>;

const transparentLockupImages = {
  "horizontal-color": require("../../artifacts/brand-kit/exports/logo-horizontal-color-transparent.png") as ImageSourcePropType,
  "horizontal-reverse": require("../../artifacts/brand-kit/exports/logo-horizontal-reverse-transparent.png") as ImageSourcePropType
} satisfies Record<Exclude<BrandAssetVariant, "symbol">, ImageSourcePropType>;

const transparentSymbolImages = {
  light: require("../../artifacts/brand-kit/exports/symbol-monochrome-navy.png") as ImageSourcePropType,
  dark: require("../../artifacts/brand-kit/exports/symbol-reverse-cream-transparent.png") as ImageSourcePropType
} satisfies Record<BrandTheme, ImageSourcePropType>;

export function resolveBrandImage(variant: BrandAssetVariant, theme: BrandTheme, transparent = false): ImageSourcePropType {
  if (!transparent) return brandImages[variant];
  if (variant === "symbol") return transparentSymbolImages[theme];
  return transparentLockupImages[variant];
}
