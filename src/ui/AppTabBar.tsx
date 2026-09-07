import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useAppTheme, useThemedStyles, type ThemeColors } from "./theme";

type TabBarRoute = BottomTabBarProps["state"]["routes"][number];

const routeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "grid-outline",
  transactions: "receipt-outline",
  budgets: "wallet-outline",
  reports: "bar-chart-outline",
  settings: "settings-outline"
};

function iconForRoute(route: TabBarRoute) {
  return routeIcons[route.name] ?? "ellipse-outline";
}

function labelForRoute({ route, descriptors }: Pick<BottomTabBarProps, "descriptors"> & { route: TabBarRoute }) {
  const options = descriptors[route.key]?.options;
  return typeof options?.tabBarLabel === "string" ? options.tabBarLabel : options?.title ?? route.name;
}

function selectRoute({ navigation, route, isFocused }: Pick<BottomTabBarProps, "navigation"> & { route: TabBarRoute; isFocused: boolean }) {
  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });

  if (!isFocused && !event.defaultPrevented) {
    navigation.navigate(route.name, route.params);
  }
}

function WebSideNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="tablist" style={styles.webContainer}>
      <View style={styles.brandBlock}>
        <Text style={styles.brandMark}>U</Text>
        <View>
          <Text style={styles.brandName}>Unfancy</Text>
          <Text style={styles.brandSubtitle}>Money tracker</Text>
        </View>
      </View>
      <View style={styles.webItems}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const label = labelForRoute({ route, descriptors });

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              key={route.key}
              onPress={() => selectRoute({ navigation, route, isFocused })}
              style={[styles.webItem, isFocused && styles.webItemActive]}
            >
              <Ionicons color={isFocused ? colors.positive : colors.muted} name={iconForRoute(route)} size={22} />
              <Text style={[styles.webLabel, isFocused && styles.webLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MobileTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  return (
    <View style={styles.mobileContainer}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const label = labelForRoute({ route, descriptors });

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            key={route.key}
            onPress={() => selectRoute({ navigation, route, isFocused })}
            style={[styles.mobileItem, isFocused && styles.mobileItemActive]}
          >
            <Ionicons color={isFocused ? colors.positive : colors.muted} name={iconForRoute(route)} size={22} />
            <Text style={[styles.mobileLabel, isFocused && styles.mobileLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AppTabBar(props: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;

  return isDesktopWeb ? <WebSideNav {...props} /> : <MobileTabBar {...props} />;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  webContainer: {
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 28,
    position: "absolute",
    top: 0,
    width: 232
  },
  brandBlock: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 36, paddingHorizontal: 10 },
  brandMark: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, color: colors.onPrimary, fontSize: 18, fontWeight: "900", height: 34, lineHeight: 34, textAlign: "center", width: 34 },
  brandName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  brandSubtitle: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  webItems: { gap: 6 },
  webItem: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 12, minHeight: 48, paddingHorizontal: 14 },
  webItemActive: { backgroundColor: colors.positiveSubtle },
  webLabel: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  webLabelActive: { color: colors.text },
  mobileContainer: { alignItems: "stretch", backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", height: 76, justifyContent: "space-around", paddingTop: 8 },
  mobileItem: { alignItems: "center", flex: 1, gap: 6, justifyContent: "center", minHeight: 56 },
  mobileItemActive: { backgroundColor: colors.positiveSubtle, borderRadius: 12, marginBottom: 6, marginHorizontal: 4 },
  mobileLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  mobileLabelActive: { color: colors.text }
});
