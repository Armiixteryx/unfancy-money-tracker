import { typography } from "./designTokens";
import { AppText as Text } from "./AppText";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

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
  mark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, color: colors.onPrimary, fontSize: 18, fontWeight: "500", height: 40, lineHeight: 40, textAlign: "center", width: 40 },
  name: { ...typography.heading, color: colors.text, fontSize: 24, lineHeight: 28 },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: "500", marginTop: 2 }
});
