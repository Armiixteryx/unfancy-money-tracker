import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { colors } from "./theme";

type TabBarRoute = BottomTabBarProps["state"]["routes"][number];

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
              <View style={[styles.navDot, isFocused && styles.navDotActive]} />
              <Text style={[styles.webLabel, isFocused && styles.webLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.localNote}>
        <View style={styles.localDot} />
        <Text style={styles.localNoteText}>Saved locally</Text>
      </View>
    </View>
  );
}

function MobileTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
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
            <View style={[styles.mobileDot, isFocused && styles.mobileDotActive]} />
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

const styles = StyleSheet.create({
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
  brandMark: { alignItems: "center", backgroundColor: colors.navy, borderRadius: 10, color: colors.surface, fontSize: 18, fontWeight: "900", height: 34, lineHeight: 34, textAlign: "center", width: 34 },
  brandName: { color: colors.navy, fontSize: 16, fontWeight: "900" },
  brandSubtitle: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  webItems: { gap: 6 },
  webItem: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 12, minHeight: 48, paddingHorizontal: 14 },
  webItemActive: { backgroundColor: "#E9F7EF" },
  navDot: { backgroundColor: colors.border, borderRadius: 999, height: 8, width: 8 },
  navDotActive: { backgroundColor: colors.emerald },
  webLabel: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  webLabelActive: { color: colors.navy },
  localNote: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: "auto", padding: 12 },
  localDot: { backgroundColor: colors.emerald, borderRadius: 999, height: 7, width: 7 },
  localNoteText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  mobileContainer: { alignItems: "stretch", backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", height: 76, justifyContent: "space-around", paddingTop: 8 },
  mobileItem: { alignItems: "center", flex: 1, gap: 6, justifyContent: "center", minHeight: 56 },
  mobileItemActive: { backgroundColor: "#E9F7EF", borderRadius: 12, marginBottom: 6, marginHorizontal: 4 },
  mobileDot: { backgroundColor: colors.border, borderRadius: 999, height: 8, width: 8 },
  mobileDotActive: { backgroundColor: colors.emerald },
  mobileLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  mobileLabelActive: { color: colors.navy }
});
