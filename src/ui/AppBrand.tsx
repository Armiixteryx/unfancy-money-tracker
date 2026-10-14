import { useState } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { brandImages } from "./brandAssets";
import { BRAND_HORIZONTAL_ASPECT_RATIO, BRAND_HORIZONTAL_HEIGHT, BRAND_HORIZONTAL_WIDTH, BRAND_SYMBOL_SIZE, resolveBrandAssetVariant, resolveBrandPresentation, type BrandPresentation } from "./brandIdentity";
import { useAppTheme } from "./theme";

type AppBrandProps = {
  accessibilityElementsHidden?: boolean;
  presentation?: BrandPresentation;
  style?: StyleProp<ViewStyle>;
};

export function AppBrand({ accessibilityElementsHidden = false, presentation = "auto", style }: AppBrandProps) {
  const { resolvedTheme } = useAppTheme();
  const [availableWidth, setAvailableWidth] = useState(0);
  const resolvedPresentation = resolveBrandPresentation(presentation, availableWidth);
  const assetVariant = resolveBrandAssetVariant(resolvedPresentation, resolvedTheme);
  const imageStyle = resolvedPresentation === "horizontal" ? styles.horizontal : styles.symbol;

  const measureAvailableWidth = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setAvailableWidth((currentWidth) => currentWidth === width ? currentWidth : width);
  };

  return (
    <View
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? "no-hide-descendants" : undefined}
      onLayout={measureAvailableWidth}
      style={[styles.container, style]}
    >
      <Image
        accessible={!accessibilityElementsHidden}
        accessibilityLabel="Unfancy Money Tracker"
        accessibilityRole="image"
        resizeMode="contain"
        source={brandImages[assetVariant]}
        style={imageStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", width: "100%" },
  horizontal: { aspectRatio: BRAND_HORIZONTAL_ASPECT_RATIO, height: BRAND_HORIZONTAL_HEIGHT, width: BRAND_HORIZONTAL_WIDTH },
  symbol: { aspectRatio: 1, height: BRAND_SYMBOL_SIZE, width: BRAND_SYMBOL_SIZE }
});
