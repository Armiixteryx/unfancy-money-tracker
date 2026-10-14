import type { ImageSourcePropType } from "react-native";

import type { BrandAssetVariant } from "./brandIdentity";

export const brandImages = {
  "horizontal-color": require("../../artifacts/brand-kit/exports/logo-horizontal-color.png") as ImageSourcePropType,
  "horizontal-reverse": require("../../artifacts/brand-kit/exports/logo-horizontal-reverse.png") as ImageSourcePropType,
  symbol: require("../../artifacts/brand-kit/platform/ios/icon-1024-opaque.png") as ImageSourcePropType
} satisfies Record<BrandAssetVariant, ImageSourcePropType>;
