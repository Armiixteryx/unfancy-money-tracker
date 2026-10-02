import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useThemedStyles, type ThemeColors } from "./theme";

type AppBrandProps = {
  accessibilityElementsHidden?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppBrand({ accessibilityElementsHidden = false, style }: AppBrandProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? "no-hide-descendants" : undefined}
      style={[styles.container, style]}
    >
      <Text style={styles.mark}>U</Text>
      <View>
        <Text style={styles.name}>Unfancy</Text>
        <Text style={styles.subtitle}>Money tracker</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { alignItems: "center", flexDirection: "row", gap: 10 },
  mark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, color: colors.onPrimary, fontSize: 18, fontWeight: "900", height: 34, lineHeight: 34, textAlign: "center", width: 34 },
  name: { color: colors.text, fontSize: 16, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 }
});
